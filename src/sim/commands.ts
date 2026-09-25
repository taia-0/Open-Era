import { applyEvent, clamp, settlementClaimAvailableTo } from "./state.ts";
import type {
  OrderDirective,
  PlayerAction,
  PlayerCommand,
  SimEvent,
  WorldState,
} from "./types.ts";

export type CommandRequest =
  | {
      playerId: string;
      type: "character-action";
      action: PlayerAction;
      targetId?: string;
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
    };

export type CommandSubmission =
  | { ok: true; command: PlayerCommand; event: SimEvent }
  | { ok: false; code: string; error: string };

const actions = new Set<PlayerAction>([
  "travel",
  "buy-provisions",
  "trade-local",
  "work",
  "recruit",
  "raid",
  "claim-settlement",
  "rest",
]);

const directives = new Set<OrderDirective>([
  "protect",
  "pressure",
  "trade-supplies",
  "explore",
]);

function reject(code: string, error: string): CommandSubmission {
  return { ok: false, code, error };
}

function acceptedEvent(world: WorldState, command: PlayerCommand): SimEvent {
  const player = world.players[command.playerId];
  const targetId = command.type === "character-action"
    ? command.targetId
    : command.type === "retreat-battle"
      ? world.activeBattles[command.battleId]?.settlementId
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
  if (!actions.has(request.action)) return reject("unknown-action", "That character action is not supported");
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
      return reject("not-hostile", "The current settlement is not a hostile surrender target");
    }
    if (!settlementClaimAvailableTo(settlement, character.id)) {
      return reject("not-surrendering", "The settlement is not offering surrender to this character");
    }
  }
  if (request.action === "recruit" && (character.money < 30 || settlement.stocks.arms < 2)) {
    return reject("cannot-recruit", "Recruitment requires money and locally available arms");
  }
  if (request.action === "buy-provisions" && (character.money < 2 || settlement.stocks.provisions < 1)) {
    return reject("cannot-buy", "Provisions are unavailable or unaffordable");
  }

  const command: PlayerCommand = {
    id: `command-${String(world.nextCommandSequence).padStart(5, "0")}`,
    playerId: player.id,
    issuedTick: world.tick,
    type: "character-action",
    action: request.action,
    targetId: request.action === "raid" || request.action === "claim-settlement"
      ? character.locationId
      : request.targetId,
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
  if (!directives.has(request.directive)) return reject("unknown-directive", "That standing-order directive is not supported");
  if (request.directive === "protect" && (!request.targetId || !world.settlements[request.targetId])) {
    return reject("invalid-target", "A protection order requires a settlement target");
  }
  if (request.directive === "pressure" && (!request.targetId || !world.factions[request.targetId])) {
    return reject("invalid-target", "A pressure order requires a faction target");
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
    return "A protection order requires a settlement target";
  }
  if (directive === "pressure" && (!targetId || !world.factions[targetId])) {
    return "A pressure order requires a faction target";
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
  if (!directives.has(directive)) return reject("unknown-directive", "That standing-order directive is not supported");
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
  const activeBattle = Object.values(world.activeBattles).find((battle) => battle.attackerId === player.characterId);
  if (activeBattle && request.type !== "retreat-battle") {
    return reject("battle-in-progress", "Only a retreat decision is available while the character is in battle");
  }
  if (request.type === "retreat-battle") return validateBattleRetreat(world, request);
  if (request.type === "character-action") return validateCharacterAction(world, request);
  if (request.type === "issue-order") return validateStandingOrder(world, request);
  if (request.type === "confirm-order") return validateOrderConfirmation(world, request);
  if (request.type === "amend-order") return validateOrderAmendment(world, request);
  return validateOrderCancellation(world, request);
}
