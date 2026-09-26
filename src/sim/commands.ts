import { applyEvent, clamp, round, settlementClaimAvailableTo } from "./state.ts";
import { tradeQuote } from "./engine.ts";
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
    };

export type CommandSubmission =
  | { ok: true; command: PlayerCommand; event: SimEvent }
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
  { action: "travel", target: "settlement", requires: ["the destination is a known settlement", "the destination is not the current settlement"] },
  { action: "buy-provisions", target: "none", requires: ["at least 2 money", "at least 1 provision in local stock"] },
  {
    action: "buy-resource",
    target: "none",
    requires: [
      `resource is one of ${RESOURCE_KEYS.join(", ")}`,
      `quantity is between ${COMMAND_LIMITS.tradeQuantity.min} and ${COMMAND_LIMITS.tradeQuantity.max}`,
      "the market holds that much stock",
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
    ],
  },
  { action: "work", target: "none", requires: [] },
  { action: "recruit", target: "none", requires: ["at least 30 money", "at least 2 arms in local stock"] },
  { action: "raid", target: "current-settlement", requires: ["the current settlement belongs to a hostile faction", "at least 25 troops", "no other major battle underway at this settlement"] },
  { action: "claim-settlement", target: "current-settlement", requires: ["the current settlement is offering surrender to this character"] },
  { action: "decline-surrender", target: "current-settlement", requires: ["the current settlement is offering surrender to this character"] },
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
        characterId: "required for issue-order; the receiving character (officerId is accepted as an alias)",
        directive: "required for issue-order; one of the documented directives",
        priority: `optional for issue-order; ${COMMAND_LIMITS.orderPriority.min}..${COMMAND_LIMITS.orderPriority.max}, defaults to ${COMMAND_LIMITS.orderPriority.default}`,
        expiresInTicks: `optional for issue-order; ${COMMAND_LIMITS.orderDurationTicks.min}..${COMMAND_LIMITS.orderDurationTicks.max}, omitted means the order runs until it is finished`,
        orderId: "required for confirm-order, amend-order and cancel-order",
        battleId: "required for retreat-battle",
      },
      failure: "any 4xx body is { ok: false, code, error }; `code` is stable, `error` is human prose",
    },
    state: {
      path: "GET /api/state",
      query: {
        beforeSequence: "optional event cursor; pass eventFeed.cursor to read the next older page",
        limit: `optional 1..${transport.eventFeed.limitMax}, defaults to ${transport.eventFeed.limitDefault}`,
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
  if (request.action === "recruit") {
    // Named separately, because "money and arms" left a player unable to tell
    // which of the two it was missing.
    if (character.money < 30) return reject("insufficient-money", `Recruitment costs 30 money; the character holds ${character.money}`);
    if (settlement.stocks.arms < 2) return reject("no-arms", `Recruitment needs 2 arms here; the settlement holds ${settlement.stocks.arms}`);
  }
  if (request.action === "buy-provisions") {
    if (character.money < 2) return reject("insufficient-money", `Buying provisions costs 2 money; the character holds ${character.money}`);
    if (settlement.stocks.provisions < 1) return reject("no-provisions", "This settlement has no provisions left to sell");
  }

  // The price the accepted order will be filled at, if this is a trade. Captured
  // here so the player is charged the total they were quoted: a tick of
  // autonomous trading can move a board between acceptance and the fill.
  let acceptedUnitPrice: number | undefined;

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
    targetId: request.action === "raid" || request.action === "claim-settlement" || request.action === "decline-surrender"
      ? character.locationId
      : request.targetId,
    ...(request.action === "buy-resource" || request.action === "sell-resource"
      ? { resource: request.resource, quantity: request.quantity, unitPrice: acceptedUnitPrice }
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
  return { ok: true, command, event: acceptedEvent(world, command) };
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
  if (order.status !== "pending" && order.status !== "active") {
    return reject("order-not-amendable", "Only pending or active orders may be amended");
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
  // Without this, an unrecognised `type` fell through to order cancellation and
  // was reported as "The order recipient is unknown", because the request also
  // carried no `characterId`. A playtest lost time to exactly that.
  return reject(
    "unknown-type",
    `That command type is not supported. Supported types are ${COMMAND_TYPES.join(", ")}.`,
  );
}
