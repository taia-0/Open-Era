import { openStandingOrder } from "./agency.ts";
import { openSupplyContract } from "./contracts.ts";
import { applyEvent, clamp, marketPrice, round, settlementClaimAvailableTo } from "./state.ts";
import { resolveQuotedSpend, spendableAmount } from "./allowance.ts";
import { MARKET_DEPTH_FRACTION, marketDepth, PASSAGE_COST_PER_TICK, provisionResupplyTarget, quotedPassage, tradeAmounts, tradeQuote } from "./engine.ts";
import type {
  OrderDirective,
  PlayerAction,
  PlayerCommand,
  ResourceKey,
  SimEvent,
  WorldState,
} from "./types.ts";
import { RESOURCE_KEYS } from "./types.ts";

export type CommandRequest =
  | {
      playerId: string;
      type: "character-action";
      action: PlayerAction;
      targetId?: string;
      /** Required by buy-resource and sell-resource: what to trade. */
      resource?: ResourceKey;
      /** Required by buy-resource and sell-resource: how much, in units. */
      quantity?: number;
    }
  | {
      playerId: string;
      type: "issue-order";
      characterId: string;
      directive: OrderDirective;
      targetId?: string;
      priority?: number;
      expiresInTicks?: number | null;
    }
  | {
      playerId: string;
      type: "confirm-order";
      characterId: string;
      orderId: string;
    }
  | {
      playerId: string;
      type: "amend-order";
      characterId: string;
      orderId: string;
      directive?: OrderDirective;
      targetId?: string | null;
      priority?: number;
      expiresInTicks?: number | null;
    }
  | {
      playerId: string;
      type: "cancel-order";
      characterId: string;
      orderId: string;
    }
  | {
      playerId: string;
      type: "retreat-battle";
      battleId: string;
    }
  | {
      playerId: string;
      type: "escape-captivity";
    }
  | {
      playerId: string;
      type: "offer-contract";
      characterId: string;
      quantity: number;
      destinationId: string;
      price: number;
      expiresInTicks: number;
    }
  | {
      playerId: string;
      type: "cancel-contract";
      characterId: string;
      contractId: string;
    };

export type CommandSubmission =
  | { ok: true; command: PlayerCommand; event: SimEvent; notice?: string }
  | { ok: false; code: string; error: string };

/**
 * Numeric and structural limits enforced by the command boundary. Published to
 * players so a rejection is never the first time a constraint is visible.
 */
export const COMMAND_LIMITS = {
  /** At most this many direct character actions may be queued at once. */
  directActionsQueued: 1,
  orderPriority: { min: 0.1, max: 1, default: 0.78 },
  orderDurationTicks: { min: 1, max: 720, default: null },
  advancedTicksPerRequest: { min: 1, max: 144 },
  /**
   * Units one trading verb may move. Bounded so a single command cannot be used
   * to hand over an arbitrary fraction of the world's stock in one tick, and
   * published so a client can refuse an over-sized request before sending it.
   */
  tradeQuantity: { min: 1, max: 200 },
} as const;

export type CapabilityTarget = "settlement" | "faction" | "current-settlement" | "none";

export interface ActionCapability {
  action: PlayerAction;
  target: CapabilityTarget;
  requires: string[];
}

export interface DirectiveCapability {
  directive: OrderDirective;
  target: CapabilityTarget;
  requires: string[];
}

/** Applies to every character action, before the action-specific requirements. */
export const ACTION_PRECONDITIONS: readonly string[] = [
  "the player controls this character",
  "the character is at a settlement and not travelling",
  "no other direct character action is already queued",
  "the character is not captive and not committed to a battle",
];

export const ACTION_CAPABILITIES: readonly ActionCapability[] = [
  { action: "travel", target: "settlement", requires: ["the destination is a known settlement", "the destination is not the current settlement", "the character's money covers the quoted passage"] },
  {
    action: "buy-provisions",
    target: "none",
    requires: [
      "at least 2 money",
      "at least 1 provision in local stock",
      `a top-up past ${Math.round(MARKET_DEPTH_FRACTION * 100)}% of the market's target stock is filled only up to that share`,
      "the character holds enough money at the quoted price",
    ],
  },
  {
    action: "buy-resource",
    target: "none",
    requires: [
      `resource is one of ${RESOURCE_KEYS.join(", ")}`,
      `quantity is between ${COMMAND_LIMITS.tradeQuantity.min} and ${COMMAND_LIMITS.tradeQuantity.max}`,
      "the market holds that much stock",
      `the quantity does not exceed ${Math.round(MARKET_DEPTH_FRACTION * 100)}% of the market's target stock`,
      "the character holds enough money at the quoted price",
      "the hold has that much free capacity",
    ],
  },
  {
    action: "sell-resource",
    target: "none",
    requires: [
      `resource is one of ${RESOURCE_KEYS.join(", ")}`,
      `quantity is between ${COMMAND_LIMITS.tradeQuantity.min} and ${COMMAND_LIMITS.tradeQuantity.max}`,
      "the hold carries that much of the resource",
      "provisions below the party reserve are not sellable",
      `the quantity does not exceed ${Math.round(MARKET_DEPTH_FRACTION * 100)}% of the market's target stock`,
    ],
  },
  { action: "work", target: "none", requires: [] },
  { action: "recruit", target: "none", requires: ["at least 30 money", "at least 2 arms in local stock"] },
  { action: "raid", target: "current-settlement", requires: ["the current settlement belongs to a hostile faction", "at least 25 troops", "no other major battle underway at this settlement"] },
  { action: "claim-settlement", target: "current-settlement", requires: ["the current settlement is offering surrender to this character"] },
  { action: "decline-surrender", target: "current-settlement", requires: ["the current settlement is offering surrender to this character"] },
  { action: "survey", target: "current-settlement", requires: ["the current settlement is not held by the commander's faction"] },
  { action: "rest", target: "none", requires: [] },
];

export const ORDER_PRECONDITIONS: readonly string[] = [
  "the recipient's identity is known to the player",
  "the recipient is an autonomous character in the commander's faction",
  "the commander may only confirm, amend, or cancel orders they issued themselves",
];

export const DIRECTIVE_CAPABILITIES: readonly DirectiveCapability[] = [
  { directive: "protect", target: "settlement", requires: ["a settlement target"] },
  { directive: "pressure", target: "faction", requires: ["a faction target"] },
  { directive: "trade-supplies", target: "settlement", requires: [] },
  { directive: "explore", target: "settlement", requires: [] },
];

export const COMMAND_TYPES: readonly string[] = [
  "character-action",
  "issue-order",
  "confirm-order",
  "amend-order",
  "cancel-order",
  "retreat-battle",
  "escape-captivity",
  "offer-contract",
  "cancel-contract",
];

/**
 * The machine-readable description of what a player may ask for. Builds the
 * validator's own accepted sets below, so a declared capability and an accepted
 * command cannot drift apart.
 */
/**
 * The shape of each HTTP request that reaches this boundary, so a client can be
 * written against the contract instead of discovered by trial and error. Two
 * fresh-context playtests both had to guess the body field names.
 */
export interface CommandTransport {
  eventFeed: {
    /** Largest `limit` accepted by `/api/state`. */
    limitMax: number;
    /** `limit` applied by `/api/state` when the client omits one. */
    limitDefault: number;
  };
}

function requestContract(transport: CommandTransport): Record<string, unknown> {
  return {
    headers: { "content-type": "application/json" },
    commands: {
      path: "POST /api/commands",
      body: {
        playerId: "required; the id from state.player.id",
        type: `required; one of ${COMMAND_TYPES.join(", ")}`,
        action: "required for character-action; one of the documented actions",
        targetId: "optional settlement id or faction id, per the action's targetKinds",
        characterId: "required for issue-order, offer-contract, and cancel-contract; the receiving character (officerId is accepted as an alias on issue-order)",
        directive: "required for issue-order; one of the documented directives",
        priority: `optional for issue-order; ${COMMAND_LIMITS.orderPriority.min}..${COMMAND_LIMITS.orderPriority.max}, defaults to ${COMMAND_LIMITS.orderPriority.default}`,
        expiresInTicks: `optional for issue-order; required for offer-contract; ${COMMAND_LIMITS.orderDurationTicks.min}..${COMMAND_LIMITS.orderDurationTicks.max}. Omitted on an order means it runs until it is finished`,
        orderId: "required for confirm-order, amend-order and cancel-order",
        battleId: "required for retreat-battle",
        resource: `required for buy-resource and sell-resource; one of ${RESOURCE_KEYS.join(", ")}`,
        quantity: `required for buy-resource, sell-resource, and offer-contract; a whole number ${COMMAND_LIMITS.tradeQuantity.min}..${COMMAND_LIMITS.tradeQuantity.max}`,
        price: "required for offer-contract; the escrow taken from the offerer when the offer is applied",
        destinationId: "required for offer-contract; the settlement shelf that receives the provisions",
        contractId: "required for cancel-contract",
      },
      failure: "any 4xx body is { ok: false, code, error }; `code` is stable, `error` is human prose",
    },
    state: {
      path: "GET /api/state",
      query: {
        beforeSequence: "optional event cursor; pass eventPage.cursor to read the next older page",
        limit: `optional 1..${transport.eventFeed.limitMax}, defaults to ${transport.eventFeed.limitDefault}`,
      },
      response: {
        events: "the page of visible events, newest first",
        eventPage: "describes that page: count, limit, total, hasMore, oldestSequence, newestSequence, and the cursor to pass as beforeSequence",
      },
    },
    advance: {
      path: "POST /api/advance",
      body: { ticks: `optional ${COMMAND_LIMITS.advancedTicksPerRequest.min}..${COMMAND_LIMITS.advancedTicksPerRequest.max}, defaults to 1` },
    },
    // These four routes existed and worked but were missing from this contract,
    // which claims to publish the whole surface. A playtest read the omission as
    // the conversation system not existing at all and never used it.
    briefingAcknowledge: {
      path: "POST /api/briefing/acknowledge",
      body: {
        playerId: "required; the id from state.player.id",
        itemId: "required; a briefing item id whose acknowledgeable flag is true",
        routineThroughSequence: "required only for a routed digest item; pass the item's throughSequence",
      },
      failure: "a refusal returns HTTP 400 with a stable code: { ok: false, code: \"action-required\" } for an unresolved decision, { ok: false, code: \"invalid-sequence\" } for a bad digest cursor. An id that names no current item is accepted as a no-op so a stale click after the tick advances is not an error",
    },
    briefingOfficer: {
      path: "POST /api/briefing/officer",
      body: {
        playerId: "required; the id from state.player.id",
        characterId: "the officer to appoint (officerId is accepted as an alias), or null to clear the appointment",
      },
      failure: "the officer must be an autonomous subordinate in the commander's faction whom the player has already learned of",
    },
    threads: {
      path: "POST /api/threads",
      body: {
        playerId: "required; the id from state.player.id",
        kind: "required; \"direct\" or \"group\"",
        participantIds: "required; the character ids to include, named as they appear in state.characters",
        title: "optional; the thread title",
      },
    },
    messages: {
      path: "POST /api/messages",
      body: {
        playerId: "required; the id from state.player.id",
        threadId: "required; a thread id from state.conversations",
        body: "required; the message text",
      },
      failure: "a rate-limited send returns 429 with code \"rate-limited\"; other rejections return 400 with a stable code",
    },
  };
}

export function commandCapabilities(transport?: CommandTransport): Record<string, unknown> {
  return {
    limits: COMMAND_LIMITS,
    actionPreconditions: ACTION_PRECONDITIONS,
    actions: ACTION_CAPABILITIES,
    orderPreconditions: ORDER_PRECONDITIONS,
    directives: DIRECTIVE_CAPABILITIES,
    commandTypes: COMMAND_TYPES,
    ...(transport ? { requests: requestContract(transport) } : {}),
  };
}

const actions = new Set<PlayerAction>(ACTION_CAPABILITIES.map((capability) => capability.action));

const directives = new Set<OrderDirective>(DIRECTIVE_CAPABILITIES.map((capability) => capability.directive));

const supportedActions = ACTION_CAPABILITIES.map((capability) => capability.action).join(", ");
const supportedDirectives = DIRECTIVE_CAPABILITIES.map((capability) => capability.directive).join(", ");

function reject(code: string, error: string): CommandSubmission {
  return { ok: false, code, error };
}

function acceptedEvent(world: WorldState, command: PlayerCommand): SimEvent {
  const player = world.players[command.playerId];
  const character = world.characters[player.characterId];
  const targetId = command.type === "character-action"
    ? command.targetId
    : command.type === "retreat-battle"
      ? world.activeBattles[command.battleId]?.settlementId
      : command.type === "escape-captivity"
        ? world.characters[player.characterId]?.captivity?.settlementId
      : command.characterId;
  const event: SimEvent = {
    sequence: world.nextEventSequence,
    tick: world.tick,
    type: "player-command-accepted",
    actorId: player.characterId,
    targetId,
    ...(command.type === "character-action" && command.action === "buy-provisions" && character?.locationId
      ? { settlementId: character.locationId }
      : {}),
    data: {
      command,
      nextCommandSequence: world.nextCommandSequence + 1,
    },
  };
  applyEvent(world, event);
  return event;
}

function validateCharacterAction(
  world: WorldState,
  request: Extract<CommandRequest, { type: "character-action" }>,
): CommandSubmission {
  const player = world.players[request.playerId];
  const character = world.characters[player.characterId];
  if (!actions.has(request.action)) return reject("unknown-action", `That character action is not supported. Supported actions are ${supportedActions}.`);
  if (character.controller.kind !== "human" || character.controller.playerId !== player.id) {
    return reject("not-controller", "The player does not control this character");
  }
  if (world.pendingCommands.some((command) => command.type === "character-action" && command.playerId === player.id)) {
    return reject("action-already-queued", "Only one direct character action may be queued at a time");
  }
  if (character.travel) return reject("character-traveling", "The character is already traveling");
  if (!character.locationId) return reject("no-location", "The character must be at a settlement to perform this action");

  const settlement = world.settlements[character.locationId];
  if (request.action === "travel") {
    if (!request.targetId || !world.settlements[request.targetId]) {
      return reject("invalid-destination", "Travel requires a known settlement destination");
    }
    if (request.targetId === character.locationId) {
      return reject("already-there", "The character is already at that settlement");
    }
    const quote = quotedPassage(world, character, request.targetId);
    if (!quote.affordable) {
      const destination = world.settlements[request.targetId];
      return reject(
        "insufficient-passage",
        `The passage to ${destination.name} costs ${quote.cost}; the character holds ${character.money}`,
      );
    }
  }
  if (request.action === "raid") {
    if (!character.factionId || !settlement.factionId || character.factionId === settlement.factionId) {
      return reject("not-hostile", "The current settlement is not a valid hostile raid target");
    }
    if (character.troops.count < 25) return reject("insufficient-troops", "At least 25 troops are required to raid");
    if (Object.values(world.activeBattles).some((battle) => battle.settlementId === settlement.id)) {
      return reject("battle-already-active", "Another major battle is already underway at this settlement");
    }
  }
  if (request.action === "claim-settlement") {
    if (!settlement.factionId || settlement.factionId === character.factionId) {
      return reject("not-hostile", "Only a settlement held by another faction can offer surrender; this one is not");
    }
    if (!settlementClaimAvailableTo(settlement, character.id)) {
      return reject("not-surrendering", "The settlement is not offering surrender to this character");
    }
  }
  if (request.action === "decline-surrender") {
    if (!settlement.factionId || settlement.factionId === character.factionId) {
      return reject("not-hostile", "Only a settlement held by another faction can offer surrender; this one is not");
    }
    if (!settlementClaimAvailableTo(settlement, character.id)) {
      return reject("not-surrendering", "The settlement is not offering surrender to this character");
    }
  }
  if (request.action === "survey") {
    if (request.targetId && request.targetId !== character.locationId) {
      return reject("not-here", "A survey examines the settlement the character is standing in");
    }
    if (character.factionId !== null && settlement.factionId === character.factionId) {
      return reject("faction-held", `${settlement.name} is already held by the commander's faction; its ground is on the faction's own record`);
    }
  }
  if (request.action === "recruit") {
    // Named separately, because "money and arms" left a player unable to tell
    // which of the two it was missing. The gate is still 30. A member covers it
    // from the allowance and then the purse. The holder covers it from the treasury.
    // The sentence still names the purse, which is the short-purse refusal.
    if (spendableAmount(world, character, PASSAGE_COST_PER_TICK) < 30) return reject("insufficient-money", `Recruitment costs 30 money; the character holds ${character.money}`);
    if (settlement.stocks.arms < 2) return reject("no-arms", `Recruitment needs 2 arms here; the settlement holds ${settlement.stocks.arms}`);
  }
  // The price the accepted order will be filled at, if this is a trade. Captured
  // here so the player is charged the total they were quoted: a tick of
  // autonomous trading can move a board between acceptance and the fill.
  let acceptedUnitPrice: number | undefined;
  let acceptedQuantity: number | undefined;
  let acceptedGross: number | undefined;
  let acceptedCapped = false;

  if (request.action === "buy-provisions") {
    const price = marketPrice(world, settlement.id, "provisions");
    const depth = marketDepth(settlement, "provisions");
    const desired = round(Math.max(0, provisionResupplyTarget(character) - character.cargo.provisions), 3);
    const stock = settlement.stocks.provisions;
    // The same shelf gate the autonomous score uses: under 1 is not a board
    // this command may clear. The text names the stock, because "none left"
    // was how a fractional shelf used to read.
    if (stock < 1) {
      return reject(
        "no-provisions",
        `${settlement.name} holds ${round(stock, 3)} provisions; a purchase needs at least 1`,
      );
    }
    // The player does not name a quantity. The top-up is the gap up to the
    // resupply target, and it cannot exceed the shelf. Past `marketDepth` the
    // order is shortened to that share and the accept says so. Refusing it
    // left an empty hold with no way to buy food.
    const uncapped = round(Math.min(desired, stock), 3);
    const quantity = round(Math.min(uncapped, depth), 3);
    acceptedCapped = uncapped > depth;
    const gross = tradeAmounts(quantity, price, 0, "buy").gross;
    const held = round(character.money, 2);
    if (!resolveQuotedSpend(world, character, gross, PASSAGE_COST_PER_TICK).ok) {
      return reject(
        "insufficient-money",
        `${quantity} provisions costs ${gross} at ${price} each; the character holds ${held}`,
      );
    }
    // Two money is the minimum balance, not the price. A purse that can pay a
    // smaller bill and still sits under 2 is refused with both numbers. The
    // figure is now what this character can spend, and the sentence still names the purse.
    if (spendableAmount(world, character, PASSAGE_COST_PER_TICK) < 2) {
      return reject(
        "insufficient-money",
        `Buying provisions needs at least 2 money; ${quantity} provisions costs ${gross} at ${price} each and the character holds ${held}`,
      );
    }
    acceptedUnitPrice = price;
    acceptedQuantity = quantity;
    acceptedGross = gross;
  }

  if (request.action === "buy-resource" || request.action === "sell-resource") {
    const direction = request.action === "buy-resource" ? "buy" : "sell";
    const resource = request.resource;
    if (!resource || !RESOURCE_KEYS.includes(resource)) {
      return reject("invalid-resource", `Trading requires a resource; choose one of ${RESOURCE_KEYS.join(", ")}`);
    }
    const quantity = request.quantity;
    const { min, max } = COMMAND_LIMITS.tradeQuantity;
    // Whole units only. Resources are carried fractionally by upkeep and
    // production, but a player trades discrete goods, and a fractional quantity
    // would make "how much did I just buy" a question about rounding.
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < min || quantity > max) {
      return reject("invalid-quantity", `Trading moves a whole number of units between ${min} and ${max}; ${JSON.stringify(quantity)} was requested`);
    }
    // The quote is the same function the charge uses, so the refusal below and
    // the price paid cannot disagree about what the trade would have cost.
    const quote = tradeQuote(world, character, resource, direction, quantity);
    if (quote.quantity < quantity) {
      if (quote.limitedBy === "depth") {
        const whole = Math.floor(quote.maxQuantity);
        return reject(
          "market-depth",
          `${settlement.name} will clear ${quote.maxQuantity} of ${resource} in one order, so the largest whole order is ${whole}; ${quantity} was requested`,
        );
      }
      if (direction === "sell" && quote.limitedBy === "reserve") {
        return reject("party-reserve", `Only ${quote.maxQuantity} of ${resource} may be sold; the rest is the party's own reserve`);
      }
      if (direction === "sell") {
        return reject("insufficient-cargo", `The hold carries ${quote.maxQuantity} of ${resource}; ${quantity} was requested`);
      }
      if (quote.limitedBy === "stock") {
        return reject("insufficient-stock", `${settlement.name} holds ${quote.maxQuantity} of ${resource}; ${quantity} was requested`);
      }
      if (quote.limitedBy === "hold") {
        return reject("hold-full", `The hold has room for ${quote.maxQuantity} more units; ${quantity} was requested`);
      }
      // The cost of what was asked for, not of the smaller amount that would fit:
      // a purse refusal has to quote the bill the player was trying to pay.
      return reject("insufficient-money", `${quantity} of ${resource} costs ${round(quantity * quote.unitPrice, 2)} at ${quote.unitPrice} each; the character holds ${character.money}`);
    }
    acceptedUnitPrice = quote.unitPrice;
  }

  const command: PlayerCommand = {
    id: `command-${String(world.nextCommandSequence).padStart(5, "0")}`,
    playerId: player.id,
    issuedTick: world.tick,
    type: "character-action",
    action: request.action,
    targetId: request.action === "raid" || request.action === "claim-settlement" || request.action === "decline-surrender" || request.action === "survey"
      ? character.locationId
      : request.targetId,
    ...(request.action === "buy-resource" || request.action === "sell-resource"
      ? { resource: request.resource, quantity: request.quantity, unitPrice: acceptedUnitPrice }
      : {}),
    ...(request.action === "buy-provisions"
      ? {
          resource: "provisions" as const,
          quantity: acceptedQuantity,
          unitPrice: acceptedUnitPrice,
          gross: acceptedGross,
          ...(acceptedCapped ? { capped: true } : {}),
        }
      : {}),
  };
  return { ok: true, command, event: acceptedEvent(world, command) };
}

function validateBattleRetreat(
  world: WorldState,
  request: Extract<CommandRequest, { type: "retreat-battle" }>,
): CommandSubmission {
  const player = world.players[request.playerId];
  const battle = world.activeBattles[request.battleId];
  if (!battle) return reject("unknown-battle", "That battle is no longer active");
  if (battle.attackerId !== player.characterId) {
    return reject("not-commander", "The player does not command the attacking party");
  }
  if (battle.phase < 1 || battle.phase >= battle.totalPhases) {
    return reject("retreat-unavailable", "Retreat is available only between unresolved battle phases");
  }
  if (world.pendingCommands.some((command) => command.playerId === player.id)) {
    return reject("command-already-queued", "Another player command is already queued");
  }
  const command: PlayerCommand = {
    id: `command-${String(world.nextCommandSequence).padStart(5, "0")}`,
    playerId: player.id,
    issuedTick: world.tick,
    type: "retreat-battle",
    battleId: battle.id,
  };
  return { ok: true, command, event: acceptedEvent(world, command) };
}

function validateCaptivityEscape(
  world: WorldState,
  request: Extract<CommandRequest, { type: "escape-captivity" }>,
): CommandSubmission {
  const player = world.players[request.playerId];
  const character = world.characters[player.characterId];
  if (!character.captivity) return reject("not-captive", "The character is not being held captive");
  if (world.pendingCommands.some((command) => command.playerId === player.id)) {
    return reject("command-already-queued", "Another player command is already queued");
  }
  const command: PlayerCommand = {
    id: `command-${String(world.nextCommandSequence).padStart(5, "0")}`,
    playerId: player.id,
    issuedTick: world.tick,
    type: "escape-captivity",
  };
  return { ok: true, command, event: acceptedEvent(world, command) };
}

function validateStandingOrder(
  world: WorldState,
  request: Extract<CommandRequest, { type: "issue-order" }>,
): CommandSubmission {
  const player = world.players[request.playerId];
  const issuer = world.characters[player.characterId];
  const recipient = world.characters[request.characterId];
  if (!recipient) return reject("unknown-character", "The order recipient is unknown");
  if (!player.knownCharacterIds.includes(recipient.id)) {
    return reject("identity-unknown", "The player has not learned this character's identity");
  }
  if (recipient.controller.kind !== "autonomous") {
    return reject("human-recipient", "Standing orders cannot override another human-controlled character");
  }
  if (!issuer.factionId || recipient.factionId !== issuer.factionId) {
    return reject("outside-authority", "The recipient is outside the commander's faction authority");
  }
  if (!directives.has(request.directive)) return reject("unknown-directive", `That standing-order directive is not supported. Supported directives are ${supportedDirectives}.`);
  if (request.directive === "protect" && (!request.targetId || !world.settlements[request.targetId])) {
    return reject("invalid-target", "A protection order requires a settlement target: pass the settlement id as targetId.");
  }
  if (request.directive === "pressure" && (!request.targetId || !world.factions[request.targetId])) {
    return reject("invalid-target", "A pressure order requires a faction target: pass the faction id as targetId, not a settlement or character id.");
  }
  if (
    (request.directive === "trade-supplies" || request.directive === "explore") &&
    request.targetId &&
    !world.settlements[request.targetId]
  ) {
    return reject("invalid-target", "That order target is not a known settlement");
  }
  const priority = request.priority ?? 0.78;
  if (!Number.isFinite(priority) || priority < 0.1 || priority > 1) {
    return reject("invalid-priority", "Order priority must be between 0.1 and 1");
  }
  const duration = request.expiresInTicks ?? null;
  if (duration !== null && (!Number.isInteger(duration) || duration < 1 || duration > 720)) {
    return reject("invalid-duration", "Order duration must be between 1 and 720 ticks");
  }

  // One open order per issuer and recipient. A further issue restates that
  // order through the amendment rules: a new directive or target returns it
  // to pending, priority or deadline alone keeps acceptance, and identical
  // terms are `no-change`. Awaiting confirmation is still open. A refused,
  // completed, expired, or cancelled order does not hold the slot.
  const open = openStandingOrder(recipient, issuer.id);
  if (open) {
    const amended = validateOrderAmendment(world, {
      playerId: request.playerId,
      type: "amend-order",
      characterId: recipient.id,
      orderId: open.id,
      directive: request.directive,
      // An issue states the whole order. An omitted target clears the previous
      // one; a partial amend would have kept it.
      targetId: request.targetId ?? null,
      priority,
      expiresInTicks: duration,
    });
    if (!amended.ok) return amended;
    const notice = exploreAlreadyPresentNotice(world, recipient, request.directive, request.targetId);
    return { ...amended, ...(notice ? { notice } : {}) };
  }
  // No open order yet, so a queued issue would mint an id. Match the issuer as
  // well as the recipient: another player's issue to this officer is a
  // different pair and must not block this one.
  if (world.pendingCommands.some((command) =>
    command.type === "issue-order" &&
    command.characterId === recipient.id &&
    world.players[command.playerId]?.characterId === issuer.id
  )) {
    return reject("order-already-queued", "Another command already queued will act on that order");
  }

  const command: PlayerCommand = {
    id: `command-${String(world.nextCommandSequence).padStart(5, "0")}`,
    playerId: player.id,
    issuedTick: world.tick,
    type: "issue-order",
    characterId: recipient.id,
    directive: request.directive,
    targetId: request.targetId,
    priority: clamp(priority, 0.1, 1),
    expiresTick: duration === null ? null : world.tick + duration,
  };
  const notice = exploreAlreadyPresentNotice(world, recipient, request.directive, request.targetId);
  return { ok: true, command, event: acceptedEvent(world, command), ...(notice ? { notice } : {}) };
}

/**
 * An explore order whose officer is already standing on the target.
 *
 * The survey still completes on the issue tick. The notice is how the order
 * response says the report did not come from a voyage. Autonomous travel is
 * untouched: this runs only when a player issues the order.
 */
function exploreAlreadyPresentNotice(
  world: WorldState,
  recipient: WorldState["characters"][string],
  directive: OrderDirective,
  targetId: string | undefined,
): string | undefined {
  if (directive !== "explore" || !targetId || recipient.travel || recipient.locationId !== targetId) return undefined;
  const place = world.settlements[targetId]?.name ?? targetId;
  return `${recipient.name} is already at ${place}. The report will come from an officer already there.`;
}

function validOrderTarget(world: WorldState, directive: OrderDirective, targetId: string | undefined): string | null {
  if (directive === "protect" && (!targetId || !world.settlements[targetId])) {
    return "A protection order requires a settlement target: pass the settlement id as targetId.";
  }
  if (directive === "pressure" && (!targetId || !world.factions[targetId])) {
    return "A pressure order requires a faction target: pass the faction id as targetId, not a settlement or character id.";
  }
  if ((directive === "trade-supplies" || directive === "explore") && targetId && !world.settlements[targetId]) {
    return "That order target is not a known settlement";
  }
  return null;
}

function validateOrderConfirmation(
  world: WorldState,
  request: Extract<CommandRequest, { type: "confirm-order" }>,
): CommandSubmission {
  const player = world.players[request.playerId];
  const issuer = world.characters[player.characterId];
  const recipient = world.characters[request.characterId];
  if (!recipient) return reject("unknown-character", "The order recipient is unknown");
  const order = recipient.standingOrders.find((candidate) => candidate.id === request.orderId);
  if (!order) return reject("unknown-order", "That standing order does not exist");
  if (order.issuerId !== issuer.id) return reject("not-issuer", "Only the character who issued an order may confirm it");
  if (order.status !== "awaiting-confirmation") {
    return reject("not-awaiting-confirmation", "The character has not reported this order complete");
  }
  if (orderMutationPending(world, order.id)) {
    return reject("order-already-queued", "Another command already queued will act on that order");
  }

  const command: PlayerCommand = {
    id: `command-${String(world.nextCommandSequence).padStart(5, "0")}`,
    playerId: player.id,
    issuedTick: world.tick,
    type: "confirm-order",
    characterId: recipient.id,
    orderId: order.id,
  };
  return { ok: true, command, event: acceptedEvent(world, command) };
}

/**
 * Whether a command already queued will consume this standing order.
 *
 * Order mutations had no such guard, so two commands naming the same `orderId`
 * were both accepted and the second failed only after the first had resolved --
 * an accepted command that could never succeed. Deduplicating by order rather
 * than by player still allows two different orders to be changed in one tick.
 */
function orderMutationPending(world: WorldState, orderId: string): boolean {
  return world.pendingCommands.some(
    (command) =>
      (command.type === "confirm-order" || command.type === "amend-order" || command.type === "cancel-order") &&
      command.orderId === orderId,
  );
}

function issuerOrder(
  world: WorldState,
  playerId: string,
  characterId: string,
  orderId: string,
): { issuerId: string; recipient: WorldState["characters"][string]; order: WorldState["characters"][string]["standingOrders"][number] } | CommandSubmission {
  const player = world.players[playerId];
  const issuerId = player.characterId;
  const recipient = world.characters[characterId];
  if (!recipient) return reject("unknown-character", "The order recipient is unknown");
  const order = recipient.standingOrders.find((candidate) => candidate.id === orderId);
  if (!order) return reject("unknown-order", "That standing order does not exist");
  if (order.issuerId !== issuerId) return reject("not-issuer", "Only the character who issued an order may change it");
  if (orderMutationPending(world, order.id)) {
    return reject("order-already-queued", "Another command already queued will act on that order");
  }
  return { issuerId, recipient, order };
}

function validateOrderAmendment(
  world: WorldState,
  request: Extract<CommandRequest, { type: "amend-order" }>,
): CommandSubmission {
  const found = issuerOrder(world, request.playerId, request.characterId, request.orderId);
  if ("ok" in found) return found;
  const { order, recipient } = found;
  // Awaiting confirmation is still the pair's one open order, so an explicit
  // amend and a further issue share this path. A major change returns the
  // order to pending; priority or deadline alone keeps the current state.
  if (order.status !== "pending" && order.status !== "active" && order.status !== "awaiting-confirmation") {
    return reject("order-not-amendable", "Only pending, active, or awaiting-confirmation orders may be amended");
  }
  const directive = request.directive ?? order.directive;
  if (!directives.has(directive)) return reject("unknown-directive", `That standing-order directive is not supported. Supported directives are ${supportedDirectives}.`);
  const targetId = request.targetId === null ? undefined : request.targetId ?? order.targetId;
  const targetError = validOrderTarget(world, directive, targetId);
  if (targetError) return reject("invalid-target", targetError);
  const priority = request.priority ?? order.priority;
  if (!Number.isFinite(priority) || priority < 0.1 || priority > 1) {
    return reject("invalid-priority", "Order priority must be between 0.1 and 1");
  }
  let expiresTick = order.expiresTick;
  if (Object.hasOwn(request, "expiresInTicks")) {
    const duration = request.expiresInTicks;
    if (duration !== null && (!Number.isInteger(duration) || duration! < 1 || duration! > 720)) {
      return reject("invalid-duration", "Order duration must be between 1 and 720 ticks");
    }
    expiresTick = duration === null ? null : world.tick + duration!;
  }
  const majorChange = directive !== order.directive || targetId !== order.targetId;
  if (!majorChange && priority === order.priority && expiresTick === order.expiresTick) {
    return reject("no-change", "The amendment does not change the order");
  }
  const command: PlayerCommand = {
    id: `command-${String(world.nextCommandSequence).padStart(5, "0")}`,
    playerId: request.playerId,
    issuedTick: world.tick,
    type: "amend-order",
    characterId: recipient.id,
    orderId: order.id,
    directive,
    targetId,
    priority: clamp(priority, 0.1, 1),
    expiresTick,
    majorChange,
  };
  return { ok: true, command, event: acceptedEvent(world, command) };
}

function validateOrderCancellation(
  world: WorldState,
  request: Extract<CommandRequest, { type: "cancel-order" }>,
): CommandSubmission {
  const found = issuerOrder(world, request.playerId, request.characterId, request.orderId);
  if ("ok" in found) return found;
  const { order, recipient } = found;
  if (!new Set(["pending", "active", "awaiting-confirmation"]).has(order.status)) {
    return reject("order-not-cancellable", "That order is already closed");
  }
  const command: PlayerCommand = {
    id: `command-${String(world.nextCommandSequence).padStart(5, "0")}`,
    playerId: request.playerId,
    issuedTick: world.tick,
    type: "cancel-order",
    characterId: recipient.id,
    orderId: order.id,
  };
  return { ok: true, command, event: acceptedEvent(world, command) };
}

function carrierUnavailable(world: WorldState, carrierId: string): CommandSubmission | null {
  const carrier = world.characters[carrierId];
  if (!carrier) return reject("unknown-character", "The carrier is unknown");
  if (carrier.controller.kind !== "autonomous") {
    return reject("human-carrier", "A contract cannot bind another human-controlled character");
  }
  if (carrier.captivity) return reject("carrier-captive", "The carrier is being held captive");
  if (carrier.travel) return reject("carrier-traveling", "The carrier is already traveling");
  if (Object.values(world.activeBattles).some((battle) => battle.attackerId === carrier.id)) {
    return reject("carrier-in-battle", "The carrier is in battle");
  }
  return null;
}

function validateOfferContract(
  world: WorldState,
  request: Extract<CommandRequest, { type: "offer-contract" }>,
): CommandSubmission {
  const player = world.players[request.playerId];
  const buyer = world.characters[player.characterId];
  const carrier = world.characters[request.characterId];
  if (!carrier) return reject("unknown-character", "The carrier is unknown");
  if (carrier.id === buyer.id) return reject("invalid-carrier", "A character cannot contract with themselves");
  if (!player.knownCharacterIds.includes(carrier.id)) {
    return reject("identity-unknown", "The player has not learned this character's identity");
  }
  const unavailable = carrierUnavailable(world, carrier.id);
  if (unavailable) return unavailable;
  const quantity = request.quantity;
  if (!Number.isInteger(quantity) || quantity < COMMAND_LIMITS.tradeQuantity.min || quantity > COMMAND_LIMITS.tradeQuantity.max) {
    return reject("invalid-quantity", `Delivery quantity must be a whole number from ${COMMAND_LIMITS.tradeQuantity.min} to ${COMMAND_LIMITS.tradeQuantity.max}`);
  }
  if (!request.destinationId || !world.settlements[request.destinationId]) {
    return reject("invalid-destination", "The delivery destination is not a known settlement");
  }
  const duration = request.expiresInTicks;
  if (!Number.isInteger(duration) || duration < COMMAND_LIMITS.orderDurationTicks.min || duration > COMMAND_LIMITS.orderDurationTicks.max) {
    return reject("invalid-deadline", `The deadline must be a whole number from ${COMMAND_LIMITS.orderDurationTicks.min} to ${COMMAND_LIMITS.orderDurationTicks.max} ticks`);
  }
  if (!Number.isFinite(request.price) || request.price <= 0) {
    return reject("invalid-price", "The contract price must be greater than zero");
  }
  const price = round(request.price, 2);
  if (price <= 0) return reject("invalid-price", "The contract price must be greater than zero");

  // One open contract per buyer and carrier. An offer still `offered` is
  // restated. An accepted contract is frozen. A refused, fulfilled, breached,
  // or cancelled contract does not hold the slot.
  const open = openSupplyContract(world, buyer.id, carrier.id);
  if (open?.status === "accepted") {
    return reject("terms-frozen", "The accepted terms are frozen");
  }
  if (open?.status === "offered") {
    if (contractMutationPending(world, open.id)) {
      return reject("contract-already-queued", "Another command already queued will act on that contract");
    }
    const deadlineTick = world.tick + duration;
    if (
      open.quantity === quantity &&
      open.destinationId === request.destinationId &&
      open.price === price &&
      open.deadlineTick === deadlineTick
    ) {
      return reject("no-change", "The offer does not change the contract");
    }
    const due = round(price - open.escrow, 2);
    if (due > 0 && !resolveQuotedSpend(world, buyer, due, PASSAGE_COST_PER_TICK).ok) {
      return reject("insufficient-money", `Raising the price to ${price} needs ${due} more; the character holds ${round(buyer.money, 2)}`);
    }
    const command: PlayerCommand = {
      id: `command-${String(world.nextCommandSequence).padStart(5, "0")}`,
      playerId: player.id,
      issuedTick: world.tick,
      type: "offer-contract",
      characterId: carrier.id,
      contractId: open.id,
      quantity,
      destinationId: request.destinationId,
      price,
      expiresTick: deadlineTick,
    };
    return { ok: true, command, event: acceptedEvent(world, command) };
  }
  if (world.pendingCommands.some((command) =>
    command.type === "offer-contract" &&
    command.characterId === carrier.id &&
    world.players[command.playerId]?.characterId === buyer.id
  )) {
    return reject("contract-already-queued", "An offer to this carrier is already queued");
  }
  if (!resolveQuotedSpend(world, buyer, price, PASSAGE_COST_PER_TICK).ok) {
    return reject("insufficient-money", `The contract price is ${price}; the character holds ${round(buyer.money, 2)}`);
  }
  const command: PlayerCommand = {
    id: `command-${String(world.nextCommandSequence).padStart(5, "0")}`,
    playerId: player.id,
    issuedTick: world.tick,
    type: "offer-contract",
    characterId: carrier.id,
    quantity,
    destinationId: request.destinationId,
    price,
    expiresTick: world.tick + duration,
  };
  return { ok: true, command, event: acceptedEvent(world, command) };
}

function contractMutationPending(world: WorldState, contractId: string): boolean {
  return world.pendingCommands.some((command) =>
    (command.type === "offer-contract" && command.contractId === contractId) ||
    (command.type === "cancel-contract" && command.contractId === contractId)
  );
}

function validateCancelContract(
  world: WorldState,
  request: Extract<CommandRequest, { type: "cancel-contract" }>,
): CommandSubmission {
  const player = world.players[request.playerId];
  const buyer = world.characters[player.characterId];
  const contract = world.contracts?.[request.contractId];
  if (!contract) return reject("unknown-contract", "That contract does not exist");
  if (contract.buyerId !== buyer.id) return reject("not-buyer", "Only the character who offered a contract may cancel it");
  if (contract.carrierId !== request.characterId) return reject("unknown-contract", "That contract does not exist");
  if (contract.status !== "offered" && contract.status !== "accepted") {
    return reject("contract-not-open", "That contract is already closed");
  }
  if (contractMutationPending(world, contract.id)) {
    return reject("contract-already-queued", "Another command already queued will act on that contract");
  }
  const command: PlayerCommand = {
    id: `command-${String(world.nextCommandSequence).padStart(5, "0")}`,
    playerId: player.id,
    issuedTick: world.tick,
    type: "cancel-contract",
    characterId: contract.carrierId,
    contractId: contract.id,
  };
  return { ok: true, command, event: acceptedEvent(world, command) };
}

export function submitCommand(world: WorldState, request: CommandRequest): CommandSubmission {
  const player = world.players[request.playerId];
  if (!player) return reject("unknown-player", "The player session is unknown");
  const character = world.characters[player.characterId];
  if (character.captivity && request.type !== "escape-captivity") {
    return reject("character-captive", "Only an escape attempt is available while the character is captive");
  }
  if (request.type === "escape-captivity") return validateCaptivityEscape(world, request);
  const activeBattle = Object.values(world.activeBattles).find((battle) => battle.attackerId === player.characterId);
  if (activeBattle && request.type !== "retreat-battle") {
    return reject("battle-in-progress", "Only a retreat decision is available while the character is in battle");
  }
  if (request.type === "retreat-battle") return validateBattleRetreat(world, request);
  if (request.type === "character-action") return validateCharacterAction(world, request);
  if (request.type === "issue-order") return validateStandingOrder(world, request);
  if (request.type === "confirm-order") return validateOrderConfirmation(world, request);
  if (request.type === "amend-order") return validateOrderAmendment(world, request);
  if (request.type === "cancel-order") return validateOrderCancellation(world, request);
  if (request.type === "offer-contract") return validateOfferContract(world, request);
  if (request.type === "cancel-contract") return validateCancelContract(world, request);
  // Without this, an unrecognised `type` fell through to order cancellation and
  // was reported as "The order recipient is unknown", because the request also
  // carried no `characterId`. A playtest lost time to exactly that.
  return reject(
    "unknown-type",
    `That command type is not supported. Supported types are ${COMMAND_TYPES.join(", ")}.`,
  );
}
