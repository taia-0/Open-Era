import { createHash } from "node:crypto";
import type {
  Character,
  PartySighting,
  ReleaseParty,
  ReleaseSighting,
  TroopGroup,
  ResourceKey,
  Resources,
  Settlement,
  SettlementKnowledge,
  SimEvent,
  StandingOrder,
  SupplyContract,
  WorldState,
} from "./types.ts";

export const SURRENDER_GARRISON_THRESHOLD = 15;
export const SURRENDER_STABILITY_THRESHOLD = 30;
/** Each soldier under the garrison line raises the stability limit by this much. */
export const SURRENDER_STABILITY_SLOPE = 10;
/** The sliding stability limit never rises above this. */
export const SURRENDER_STABILITY_CAP = 80;
export const CLAIM_STABILITY_FLOOR = 55;

/**
 * Stability at or below which an attacker victory offers surrender.
 *
 * The garrison test stays at 15. Each soldier under that line raises the
 * stability limit by 10, and the limit stops at 80. At garrison 14 the limit
 * is 40, which contains the blow that used to stall a port at 39.55. At
 * garrison 10 and below the limit is the cap. The battle just fought is the
 * only input. A survey, a rumor, and a motive are not.
 */
export function surrenderStabilityLimit(garrison: number): number {
  const shortfall = Math.max(0, SURRENDER_GARRISON_THRESHOLD - garrison);
  return Math.min(
    SURRENDER_STABILITY_CAP,
    SURRENDER_STABILITY_THRESHOLD + SURRENDER_STABILITY_SLOPE * shortfall,
  );
}

export function normalizeStandingOrder(order: StandingOrder): StandingOrder {
  return {
    ...order,
    revision: order.revision ?? 1,
    status: order.status ?? "pending",
    adherence: order.adherence ?? "unassessed",
    statusChangedTick: order.statusChangedTick ?? order.issuedTick,
    deviationCount: order.deviationCount ?? 0,
    lastReport: order.lastReport ?? null,
  };
}

export function normalizeWorldState(world: WorldState): WorldState {
  world.version = 5;
  world.activeBattles ??= {};
  for (const battle of Object.values(world.activeBattles)) {
    battle.retreatDestinationId ??= null;
  }
  for (const character of Object.values(world.characters)) {
    character.standingOrders = character.standingOrders.map(normalizeStandingOrder);
    character.captivity ??= null;
    character.troopRecovery ??= null;
    character.scars ??= [];
    character.debts ??= [];
  }
  for (const player of Object.values(world.players)) {
    player.briefingAcknowledgements ??= {};
    player.routineBriefingThroughSequence ??= 0;
    player.reportingOfficerId ??= null;
  }
  return world;
}

export function settlementClaimAvailableTo(settlement: Settlement, characterId: string): boolean {
  return settlement.surrender?.offeredToId === characterId;
}

/**
 * Keep a ground record when a settlement report is replaced.
 *
 * The reducer stores the whole entry, so a refresh that forgets `ground` would
 * erase a survey. A new record wins only when it brings its own ground dated
 * at least as recently as the one already held. An older ground, or none, leaves
 * the stored survey in place.
 */
export function retainGround(
  previous: SettlementKnowledge | undefined,
  next: SettlementKnowledge,
): SettlementKnowledge {
  const prior = previous?.ground;
  if (!prior) return next;
  if (next.ground && next.ground.observedTick >= prior.observedTick) return next;
  return { ...next, ground: { ...prior } };
}

/**
 * Keep a party sighting unless a newer observation replaces it.
 *
 * A later arrival or a daily refresh must not touch this map. The key stays
 * absent until the first sighting, and nothing deletes an entry. An older
 * report, including one relayed after a survey, leaves the stored tick in place.
 * An observation at the same tick replaces, because that is the later write.
 */
export function mergePartySightings(character: Character, incoming: PartySighting[]): void {
  if (incoming.length === 0) return;
  const map = character.partySightings ?? {};
  let wrote = false;
  for (const sighting of [...incoming].sort((left, right) => left.characterId.localeCompare(right.characterId))) {
    const prior = map[sighting.characterId];
    if (prior && sighting.observedTick < prior.observedTick) continue;
    map[sighting.characterId] = {
      characterId: sighting.characterId,
      locationId: sighting.locationId,
      travel: null,
      troops: sighting.troops,
      partyPower: sighting.partyPower,
      observedTick: sighting.observedTick,
      source: sighting.source,
      confidence: 1,
    };
    wrote = true;
  }
  if (wrote) character.partySightings = map;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function distanceBetween(
  world: WorldState,
  fromId: string,
  toId: string,
): number {
  const from = world.settlements[fromId].position;
  const to = world.settlements[toId].position;
  return Math.hypot(to.x - from.x, to.y - from.y);
}

const basePrices: Resources = {
  provisions: 1.8,
  arms: 5.6,
  medicine: 7.4,
  shipMaterials: 4.5,
};

/** Board price for one good, from its target holding and the stock on the shelf. */
export function resourcePrice(resource: ResourceKey, targetStock: number, stock: number): number {
  const scarcity = targetStock / Math.max(1, stock);
  return round(basePrices[resource] * clamp(scarcity, 0.55, 2.5), 2);
}

export function marketPrice(
  world: WorldState,
  settlementId: string,
  resource: ResourceKey,
): number {
  const settlement = world.settlements[settlementId];
  return resourcePrice(resource, settlement.targetStocks[resource], settlement.stocks[resource]);
}

export function personalPower(character: Character): number {
  const attributes = character.attributes;
  const physical =
    attributes.power * 0.36 +
    attributes.speed * 0.18 +
    attributes.endurance * 0.24 +
    attributes.resilience * 0.22;
  const healthFactor = 0.35 + (character.health / 100) * 0.65;
  return round(physical * healthFactor);
}

/** Party power for a troop block, including a captive's scattered count. */
export function partyPowerFromTroops(character: Character, troops: TroopGroup): number {
  const troopPower = troops.count * (0.65 + troops.experience * 0.8) * (0.6 + troops.discipline * 0.6);
  const leaderEffect = 1 + character.skills.leadership / 220;
  return round(personalPower(character) * 1.5 + troopPower * leaderEffect);
}

export function partyPower(character: Character): number {
  if (character.captivity) return 0;
  return partyPowerFromTroops(character, character.troops);
}

/**
 * Split a ransom that was actually paid.
 *
 * Money is stored at two decimal places. The shares are whole cents so they
 * sum exactly to `paid`. There is no RNG and no floating remainder.
 *
 * When the captor has a faction, the treasury receives every cent and the
 * party leader receives 0. There is no half-and-half split and no odd cent.
 *
 * When the captor has no faction, the leader receives every cent and the
 * treasury share is 0.
 */
export function splitRansom(paid: number, hasFaction: boolean): { treasuryShare: number; leaderShare: number } {
  const cents = Math.round(paid * 100);
  const amount = round(cents / 100, 2);
  if (!hasFaction) return { treasuryShare: 0, leaderShare: amount };
  return { treasuryShare: amount, leaderShare: 0 };
}

function partyLeaderScore(character: Character): number {
  return character.skills.leadership + character.personality.loyalty * 50;
}

function highestPartyLeader(
  world: WorldState,
  include: (character: Character) => boolean,
): Character | null {
  const ranked = Object.values(world.characters)
    .filter(include)
    .sort((left, right) =>
      partyLeaderScore(right) - partyLeaderScore(left) ||
      left.id.localeCompare(right.id),
    );
  return ranked[0] ?? null;
}

/**
 * The captor's party leader, the person who receives that side of a ransom.
 *
 * A faction's leader is the command holder, the one person who issues that
 * faction's standing orders. The prisoner is skipped, so the purse that just
 * paid does not pay itself. If that seat is unnamed, or the holder is the
 * prisoner, the faction member with the highest leadership plus
 * `personality.loyalty * 50` is the leader. A lower id wins a tie. The scar
 * is not read. No draw.
 *
 * With no captor faction, the prison's owner is the leader when that owner
 * has no faction and is not the prisoner. Otherwise the same ranking is
 * applied to unaffiliated characters.
 */
export function captorPartyLeader(world: WorldState, prisoner: Character): Character | null {
  const captivity = prisoner.captivity;
  if (!captivity) return null;
  const faction = captivity.captorFactionId ? world.factions[captivity.captorFactionId] : undefined;
  if (faction) {
    const holderId = commandHolderId(world, faction.id);
    if (holderId && holderId !== prisoner.id) {
      const holder = world.characters[holderId];
      if (holder) return holder;
    }
    return highestPartyLeader(
      world,
      (candidate) => candidate.factionId === faction.id && candidate.id !== prisoner.id,
    );
  }
  const ownerId = world.settlements[captivity.settlementId]?.ownerId ?? null;
  if (ownerId && ownerId !== prisoner.id) {
    const owner = world.characters[ownerId];
    if (owner && owner.factionId === null) return owner;
  }
  return highestPartyLeader(
    world,
    (candidate) => candidate.factionId === null && candidate.id !== prisoner.id,
  );
}

/**
 * The one person who issues this faction's standing orders.
 *
 * The seat is that issuer. It is not stored on the faction. Two issuers, or
 * none, leave the seat unnamed. Trust, grievance, troops, and location are not read.
 */
export function commandHolderId(world: WorldState, factionId: string): string | null {
  let holderId: string | null = null;
  for (const character of Object.values(world.characters)) {
    for (const order of character.standingOrders) {
      const issuer = world.characters[order.issuerId];
      if (issuer?.factionId !== factionId) continue;
      if (holderId === null) holderId = issuer.id;
      else if (holderId !== issuer.id) return null;
    }
  }
  return holderId;
}

/** Loyalty the cover sort reads: the seed, plus the unpaid-release scar. */
function coverLoyalty(character: Character): number {
  return character.personality.loyalty + (character.loyaltyAdjustment ?? 0);
}

function commandScore(character: Character): number {
  return character.skills.leadership + coverLoyalty(character) * 50;
}

/** One unpaid release. The result is clamped, then the adjustment is the gap from the seed. */
const LOYALTY_SCAR_STEP = 0.04;

/**
 * Store the scar on an unpaid release, after the cover that is ending has cleared.
 *
 * `v` is the loyalty the cover sort already reads. The stored reading is
 * `round(clamp(v - 0.04, 0.05, 0.98), 3)`. `loyaltyAdjustment` is that reading
 * minus `personality.loyalty`, rounded to 3 decimals, and the field is omitted
 * at 0. A second unpaid release subtracts the step from the scarred reading.
 * No draw, and `personality.loyalty` is not written.
 */
/**
 * The prison, as it is when the release is applied, stored on the captive.
 *
 * Upkeep has already set the garrison, and the character walk has not run.
 * The parties are everyone else still anchored here, in id order. A fellow
 * prisoner is included at the live count, which is 0, and `partyPower()` is 0.
 * A later release replaces the record when its tick is greater or equal. An
 * earlier one does not. Called from the reducer, so a replay writes the same
 * record the live tick wrote. No new event and no draw.
 */
function writeReleaseSighting(world: WorldState, character: Character): void {
  const captivity = character.captivity;
  if (!captivity) return;
  const observedTick = world.tick;
  const previous = character.releaseSighting;
  if (previous && previous.observedTick > observedTick) return;
  const settlement = world.settlements[captivity.settlementId];
  const parties: ReleaseParty[] = Object.values(world.characters)
    .filter((other) =>
      other.id !== character.id &&
      other.locationId === captivity.settlementId &&
      other.travel === null,
    )
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((other) => ({
      characterId: other.id,
      troops: other.troops.count,
      partyPower: partyPower(other),
      observedTick,
      source: "direct" as const,
      confidence: 1 as const,
    }));
  const record: ReleaseSighting = {
    settlementId: captivity.settlementId,
    factionId: settlement.factionId,
    captorFactionId: captivity.captorFactionId,
    garrison: settlement.garrison,
    parties,
    observedTick,
    source: "direct",
    confidence: 1,
  };
  character.releaseSighting = record;
}

/**
 * Credit the ransom carried on a release.
 *
 * The event stores the absolute treasury and the absolute leader purse, the
 * same way a market trade stores `characterMoney`. A share of 0 does not write.
 * A release with no `ransom` field, including older rows, leaves both purses
 * where `characterMoney` already put the prisoner.
 */
function applyRansomCredit(world: WorldState, event: SimEvent): void {
  const ransom = event.data.ransom;
  if (!ransom || typeof ransom !== "object") return;
  const credit = ransom as {
    treasuryShare?: number;
    leaderShare?: number;
    treasuryFactionId?: string | null;
    factionTreasury?: number | null;
    leaderId?: string | null;
    leaderMoney?: number | null;
  };
  if (
    typeof credit.treasuryShare === "number" && credit.treasuryShare > 0 &&
    typeof credit.treasuryFactionId === "string" &&
    typeof credit.factionTreasury === "number"
  ) {
    const faction = world.factions[credit.treasuryFactionId];
    if (!faction) throw new Error("Captivity release paid a missing captor treasury");
    faction.treasury = credit.factionTreasury;
  }
  if (
    typeof credit.leaderShare === "number" && credit.leaderShare > 0 &&
    typeof credit.leaderId === "string" &&
    typeof credit.leaderMoney === "number"
  ) {
    const leader = world.characters[credit.leaderId];
    if (!leader) throw new Error("Captivity release paid a missing party leader");
    leader.money = credit.leaderMoney;
  }
}

function applyUnpaidReleaseScar(character: Character, event: SimEvent): void {
  if (!character.factionId) return;
  const terms = event.data.terms;
  if (!terms || typeof terms !== "object") return;
  const debtValue = (terms as { debtValue?: unknown }).debtValue;
  if (typeof debtValue !== "number" || !(debtValue > 0)) return;
  const scarred = round(clamp(coverLoyalty(character) - LOYALTY_SCAR_STEP, 0.05, 0.98), 3);
  const adjustment = round(scarred - character.personality.loyalty, 3);
  if (adjustment === 0) delete character.loyaltyAdjustment;
  else character.loyaltyAdjustment = adjustment;
}

/**
 * The free faction mate who covers a captive holder.
 *
 * Highest leadership plus the scarred loyalty times 50. The holder is skipped,
 * and so is anyone already captive. A tie breaks toward the lower id, the same
 * comparison `createPrototypeWorld` uses for the reporting officer. No draw.
 */
function selectActingCommanderId(
  world: WorldState,
  factionId: string,
  holderId: string,
): string | undefined {
  const ranked = Object.values(world.characters)
    .filter((character) =>
      character.factionId === factionId &&
      character.id !== holderId &&
      character.captivity === null
    )
    .sort((left, right) =>
      commandScore(right) - commandScore(left) ||
      left.id.localeCompare(right.id)
    );
  return ranked[0]?.id;
}

function assignActingCommander(world: WorldState, captured: Character): void {
  if (!captured.factionId) return;
  const faction = world.factions[captured.factionId];
  if (!faction) return;
  const holderId = commandHolderId(world, captured.factionId);
  if (!holderId) return;
  const holderCaptured = captured.id === holderId;
  const actingCaptured = faction.actingCommanderId === captured.id;
  if (!holderCaptured && !actingCaptured) return;
  const next = selectActingCommanderId(world, captured.factionId, holderId);
  if (next) faction.actingCommanderId = next;
  else delete faction.actingCommanderId;
}

function clearActingCommander(world: WorldState, freed: Character): void {
  if (!freed.factionId) return;
  const faction = world.factions[freed.factionId];
  if (!faction) return;
  if (commandHolderId(world, freed.factionId) !== freed.id) return;
  delete faction.actingCommanderId;
}

export function factionPower(world: WorldState, factionId: string): number {
  let total = world.factions[factionId].treasury * 0.012;
  for (const settlement of Object.values(world.settlements)) {
    if (settlement.factionId === factionId) {
      total += settlement.garrison * settlement.fortification + settlement.population * 0.012;
    }
  }
  for (const character of Object.values(world.characters)) {
    if (character.factionId === factionId) total += partyPower(character);
  }
  return round(total, 2);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function stateHash(world: WorldState): string {
  return createHash("sha256").update(canonicalJson(world)).digest("hex");
}

function resourcesFrom(data: Record<string, unknown>, key: string): Resources {
  return data[key] as Resources;
}

function standingOrderFromEvent(world: WorldState, event: SimEvent): StandingOrder {
  const recipient = event.targetId ? world.characters[event.targetId] : undefined;
  const order = recipient?.standingOrders.find((candidate) => candidate.id === event.data.orderId);
  if (!order) throw new Error(`Unknown standing order: ${String(event.data.orderId)}`);
  return order;
}

export function applyEvent(world: WorldState, event: SimEvent): void {
  const actor = event.actorId ? world.characters[event.actorId] : undefined;
  const settlement = event.settlementId ? world.settlements[event.settlementId] : undefined;

  switch (event.type) {
    case "conversation-thread-created": {
      const thread = event.data.thread as WorldState["conversationThreads"][string];
      world.conversationThreads[thread.id] = thread;
      world.nextThreadSequence = event.data.nextThreadSequence as number;
      break;
    }
    case "conversation-message-sent": {
      const message = event.data.message as WorldState["conversationMessages"][number];
      world.conversationMessages.push(message);
      world.conversationThreads[message.threadId].lastMessageTick = message.createdTick;
      world.nextMessageSequence = event.data.nextMessageSequence as number;
      break;
    }
    case "conversation-reply-scheduled":
      world.scheduledReplies.push(event.data.reply as WorldState["scheduledReplies"][number]);
      world.nextReplySequence = event.data.nextReplySequence as number;
      break;
    case "conversation-reply-created": {
      const message = event.data.message as WorldState["conversationMessages"][number];
      const scheduled = world.scheduledReplies.find((reply) => reply.id === event.data.replyId);
      if (!scheduled) throw new Error(`Unknown scheduled reply: ${event.data.replyId}`);
      const alreadyProfiled = world.conversationMessages.some((existing) =>
        existing.source === "autonomous" && existing.replyToId === message.replyToId
      );
      scheduled.status = "responded";
      scheduled.respondedTick = world.tick;
      world.conversationMessages.push(message);
      world.conversationThreads[message.threadId].lastMessageTick = message.createdTick;
      world.nextMessageSequence = event.data.nextMessageSequence as number;
      const profiledPlayer = Object.values(world.players).find((player) => player.characterId === event.targetId);
      if (profiledPlayer && !alreadyProfiled) {
        for (const tag of message.inferredPlayerTags ?? []) {
          profiledPlayer.conversationTagScores[tag] = (profiledPlayer.conversationTagScores[tag] ?? 0) + 1;
        }
      }
      break;
    }
    case "briefing-item-acknowledged": {
      const player = world.players[event.data.playerId as string];
      if (!player) throw new Error("Briefing acknowledgement has no player");
      player.briefingAcknowledgements[event.data.itemId as string] = world.tick;
      const throughSequence = event.data.routineThroughSequence;
      if (typeof throughSequence === "number") {
        player.routineBriefingThroughSequence = Math.max(player.routineBriefingThroughSequence, throughSequence);
      }
      break;
    }
    case "reporting-officer-assigned": {
      const player = world.players[event.data.playerId as string];
      if (!player) throw new Error("Reporting-officer assignment has no player");
      player.reportingOfficerId = event.data.characterId as string | null;
      player.routineBriefingThroughSequence = event.sequence;
      break;
    }
    case "player-command-accepted":
      world.pendingCommands.push(event.data.command as WorldState["pendingCommands"][number]);
      world.nextCommandSequence = event.data.nextCommandSequence as number;
      break;
    case "player-command-resolved":
    case "player-command-failed":
      world.pendingCommands = world.pendingCommands.filter(
        (command) => command.id !== event.data.commandId,
      );
      break;
    case "standing-order-issued": {
      const recipient = event.targetId ? world.characters[event.targetId] : undefined;
      if (!recipient) throw new Error("Standing order has no recipient");
      recipient.standingOrders.push(normalizeStandingOrder(event.data.order as Character["standingOrders"][number]));
      break;
    }
    case "standing-order-amended": {
      const recipient = event.targetId ? world.characters[event.targetId] : undefined;
      if (!recipient) throw new Error("Standing-order amendment has no recipient");
      const incoming = normalizeStandingOrder(event.data.order as StandingOrder);
      const index = recipient.standingOrders.findIndex((candidate) => candidate.id === incoming.id);
      if (index < 0) throw new Error(`Unknown standing order: ${incoming.id}`);
      recipient.standingOrders[index] = incoming;
      if (event.data.majorChange || incoming.status === "pending") {
        if (recipient.plan?.orderId === incoming.id) recipient.plan = null;
      }
      break;
    }
    case "standing-order-cancelled": {
      const order = standingOrderFromEvent(world, event);
      const recipient = event.targetId ? world.characters[event.targetId] : undefined;
      order.status = "cancelled";
      order.statusChangedTick = world.tick;
      order.lastReport = { tick: world.tick, kind: "cancelled", summary: event.data.summary as string };
      if (recipient?.plan?.orderId === order.id) recipient.plan = null;
      break;
    }
    case "standing-order-accepted": {
      const order = standingOrderFromEvent(world, event);
      order.status = "active";
      order.adherence = "following";
      order.statusChangedTick = world.tick;
      order.lastReport = { tick: world.tick, kind: "accepted", summary: event.data.summary as string };
      break;
    }
    case "standing-order-refused": {
      const order = standingOrderFromEvent(world, event);
      order.status = "refused";
      order.adherence = "unassessed";
      order.statusChangedTick = world.tick;
      order.lastReport = { tick: world.tick, kind: "refused", summary: event.data.summary as string };
      break;
    }
    case "standing-order-deviated": {
      const order = standingOrderFromEvent(world, event);
      order.adherence = "deviating";
      order.deviationCount += 1;
      order.lastReport = { tick: world.tick, kind: "deviation", summary: event.data.summary as string };
      break;
    }
    case "standing-order-resumed": {
      const order = standingOrderFromEvent(world, event);
      order.adherence = "following";
      order.lastReport = { tick: world.tick, kind: "resumed", summary: event.data.summary as string };
      break;
    }
    case "standing-order-completion-reported": {
      const order = standingOrderFromEvent(world, event);
      const recipient = event.targetId ? world.characters[event.targetId] : undefined;
      order.status = "awaiting-confirmation";
      order.adherence = "following";
      order.statusChangedTick = world.tick;
      order.lastReport = { tick: world.tick, kind: "completion", summary: event.data.summary as string };
      if (recipient?.plan?.orderId === order.id) recipient.plan = null;
      break;
    }
    case "standing-order-completed": {
      const order = standingOrderFromEvent(world, event);
      order.status = "completed";
      order.adherence = "following";
      order.statusChangedTick = world.tick;
      // A player signature and an autonomous issuer's judgment both confirm.
      // A day of silence closes the order without that signature.
      const kind = event.data.reason === "issuer-silent" ? "closed-unanswered" : "confirmed";
      order.lastReport = { tick: world.tick, kind, summary: event.data.summary as string };
      break;
    }
    case "standing-order-expired": {
      const order = standingOrderFromEvent(world, event);
      const recipient = event.targetId ? world.characters[event.targetId] : undefined;
      order.status = "expired";
      order.statusChangedTick = world.tick;
      order.lastReport = { tick: world.tick, kind: "expired", summary: event.data.summary as string };
      if (recipient?.plan?.orderId === order.id) recipient.plan = null;
      break;
    }
    case "player-action-executed":
      break;
    case "settlement-produced":
      if (!settlement) throw new Error("Production event has no settlement");
      settlement.stocks = resourcesFrom(event.data, "stocks");
      break;
    case "settlement-upkeep":
    case "settlement-shortage":
      if (!settlement) throw new Error("Settlement upkeep event has no settlement");
      settlement.stocks = resourcesFrom(event.data, "stocks");
      settlement.stability = event.data.stability as number;
      settlement.garrison = event.data.garrison as number;
      break;
    case "character-upkeep":
    case "travel-progressed":
      if (!actor) throw new Error("Character upkeep event has no actor");
      actor.cargo = resourcesFrom(event.data, "cargo");
      actor.health = event.data.health as number;
      actor.morale = event.data.morale as number;
      actor.troops.count = event.data.troopCount as number;
      // Present only while the party is underway. Anchored upkeep does not
      // touch the purse, and older events that predate the charge must not
      // either.
      if (event.type === "character-upkeep" && typeof event.data.characterMoney === "number") {
        actor.money = event.data.characterMoney;
      }
      if (event.type === "travel-progressed" && actor.travel) {
        actor.travel.remainingTicks = event.data.remainingTicks as number;
      }
      break;
    case "decision-made":
      if (!actor) throw new Error("Decision event has no actor");
      actor.currentGoal = event.data.goal as string;
      actor.lastDecisionTick = world.tick;
      break;
    case "knowledge-updated": {
      if (!actor) throw new Error("Knowledge event has no actor");
      const settlementId = event.data.settlementId as string;
      const incoming = event.data.knowledge as SettlementKnowledge;
      actor.knowledge[settlementId] = retainGround(actor.knowledge[settlementId], incoming);
      // Present only on a survey or a delivered explore. A daily refresh omits
      // the list, so standing in a port cannot keep or drop a sighting.
      const sightings = event.data.partySightings as PartySighting[] | undefined;
      if (sightings) mergePartySightings(actor, sightings);
      break;
    }
    case "plan-reconsidered":
      if (!actor) throw new Error("Plan event has no actor");
      actor.activeGoalId = event.data.selectedGoalId as string;
      actor.plan = event.data.plan as Character["plan"];
      actor.lastPlanReviewTick = world.tick;
      break;
    case "goal-progressed": {
      if (!actor) throw new Error("Goal progress event has no actor");
      const goal = actor.goals.find((candidate) => candidate.id === event.data.goalId);
      if (!goal) throw new Error(`Unknown goal: ${event.data.goalId}`);
      goal.progress = event.data.progress as number;
      goal.status = event.data.status as typeof goal.status;
      break;
    }
    case "goal-evolved": {
      if (!actor) throw new Error("Goal evolution event has no actor");
      const incoming = event.data.goal as Character["goals"][number];
      const existingIndex = actor.goals.findIndex((goal) => goal.id === incoming.id);
      if (existingIndex >= 0) actor.goals[existingIndex] = incoming;
      else actor.goals.push(incoming);
      break;
    }
    case "relationship-changed":
      if (!actor) throw new Error("Relationship event has no actor");
      actor.relationships[event.data.characterId as string] = event.data.relationship as Character["relationships"][string];
      break;
    case "travel-started":
      if (!actor) throw new Error("Travel event has no actor");
      actor.travel = { ...(event.data.travel as NonNullable<Character["travel"]>) };
      actor.locationId = null;
      break;
    case "arrived":
      if (!actor) throw new Error("Arrival event has no actor");
      actor.locationId = event.data.locationId as string;
      actor.travel = null;
      break;
    case "market-trade":
      if (!actor || !settlement) throw new Error("Trade event is missing an entity");
      actor.money = event.data.characterMoney as number;
      actor.cargo = resourcesFrom(event.data, "characterCargo");
      settlement.stocks = resourcesFrom(event.data, "settlementStocks");
      if (settlement.factionId) {
        world.factions[settlement.factionId].treasury = event.data.factionTreasury as number;
      }
      break;
    case "worked":
      if (!actor || !settlement) throw new Error("Work event is missing an entity");
      actor.money = event.data.characterMoney as number;
      actor.morale = event.data.morale as number;
      if (settlement.factionId) {
        world.factions[settlement.factionId].treasury = event.data.factionTreasury as number;
      }
      break;
    case "recruited":
      if (!actor || !settlement) throw new Error("Recruitment event is missing an entity");
      actor.money = event.data.characterMoney as number;
      actor.troops.count = event.data.troopCount as number;
      settlement.stocks = resourcesFrom(event.data, "settlementStocks");
      break;
    case "battle-started": {
      const battle = event.data.battle as WorldState["activeBattles"][string];
      world.activeBattles[battle.id] = battle;
      break;
    }
    case "battle-phase-resolved": {
      if (!actor || !settlement) throw new Error("Battle phase event is missing an entity");
      const battle = event.data.battle as WorldState["activeBattles"][string];
      actor.health = event.data.attackerHealth as number;
      actor.morale = event.data.attackerMorale as number;
      actor.troops.count = event.data.attackerTroops as number;
      settlement.garrison = event.data.defenderGarrison as number;
      settlement.stability = event.data.settlementStability as number;
      world.activeBattles[battle.id] = battle;
      break;
    }
    case "battle-retreated":
      if (!actor || !settlement) throw new Error("Battle retreat event is missing an entity");
      actor.health = event.data.attackerHealth as number;
      actor.morale = event.data.attackerMorale as number;
      actor.troops.count = event.data.attackerTroops as number;
      actor.lastBattleTick = world.tick;
      actor.locationId = null;
      actor.travel = event.data.retreatTravel
        ? { ...(event.data.retreatTravel as NonNullable<Character["travel"]>) }
        : null;
      delete world.activeBattles[event.data.battleId as string];
      break;
    case "post-defeat-withdrawal-started":
      if (!actor) throw new Error("Post-defeat withdrawal event has no actor");
      actor.locationId = event.data.travel ? null : event.settlementId ?? actor.locationId;
      actor.travel = event.data.travel
        ? { ...(event.data.travel as NonNullable<Character["travel"]>) }
        : null;
      break;
    case "character-captured":
      if (!actor || !settlement) throw new Error("Capture event is missing an entity");
      actor.health = event.data.health as number;
      actor.morale = event.data.morale as number;
      actor.troops.count = 0;
      actor.captivity = event.data.captivity as Character["captivity"];
      actor.troopRecovery = null;
      actor.locationId = settlement.id;
      actor.travel = null;
      actor.lastBattleTick = world.tick;
      delete world.activeBattles[event.data.battleId as string];
      assignActingCommander(world, actor);
      break;
    case "captivity-escaped":
      if (!actor) throw new Error("Captivity escape event has no actor");
      actor.health = event.data.health as number;
      actor.morale = event.data.morale as number;
      actor.attributes = event.data.attributes as Character["attributes"];
      if (event.data.scar) actor.scars.push(event.data.scar as Character["scars"][number]);
      actor.captivity = null;
      actor.troopRecovery = event.data.troopRecovery as Character["troopRecovery"];
      actor.travel = event.data.travel
        ? { ...(event.data.travel as NonNullable<Character["travel"]>) }
        : null;
      actor.locationId = event.data.releaseLocationId as string | null;
      clearActingCommander(world, actor);
      break;
    case "captivity-released":
      if (!actor) throw new Error("Captivity release event has no actor");
      writeReleaseSighting(world, actor);
      actor.money = event.data.characterMoney as number;
      applyRansomCredit(world, event);
      if (event.data.debt) actor.debts.push(event.data.debt as Character["debts"][number]);
      actor.captivity = null;
      actor.troopRecovery = event.data.troopRecovery as Character["troopRecovery"];
      actor.travel = event.data.travel
        ? { ...(event.data.travel as NonNullable<Character["travel"]>) }
        : null;
      actor.locationId = event.data.releaseLocationId as string | null;
      clearActingCommander(world, actor);
      applyUnpaidReleaseScar(actor, event);
      break;
    case "scattered-troops-returned":
      if (!actor) throw new Error("Troop return event has no actor");
      actor.troops.count = event.data.troopCount as number;
      actor.troopRecovery = event.data.troopRecovery as Character["troopRecovery"];
      break;
    case "rested":
      if (!actor) throw new Error("Rest event has no actor");
      actor.health = event.data.health as number;
      actor.morale = event.data.morale as number;
      actor.cargo = resourcesFrom(event.data, "cargo");
      break;
    case "battle-resolved":
      if (!actor || !settlement) throw new Error("Battle event is missing an entity");
      actor.health = event.data.attackerHealth as number;
      actor.morale = event.data.attackerMorale as number;
      actor.troops.count = event.data.attackerTroops as number;
      actor.money = event.data.attackerMoney as number;
      actor.victories = event.data.victories as number;
      actor.defeats = event.data.defeats as number;
      actor.lastBattleTick = world.tick;
      settlement.garrison = event.data.defenderGarrison as number;
      settlement.stability = event.data.settlementStability as number;
      settlement.stocks = resourcesFrom(event.data, "settlementStocks");
      settlement.surrender = event.data.surrender as Settlement["surrender"];
      if (typeof event.data.battleId === "string") delete world.activeBattles[event.data.battleId];
      break;
    case "settlement-surrender-declined":
      if (!actor || !settlement) throw new Error("Settlement surrender decline event is missing an entity");
      settlement.surrender = null;
      break;
    case "settlement-claimed":
      if (!actor || !settlement) throw new Error("Settlement claim event is missing an entity");
      settlement.ownerId = event.data.ownerId as string;
      settlement.factionId = event.data.factionId as string | null;
      settlement.stability = event.data.stability as number;
      settlement.surrender = null;
      break;
    case "tick-advanced":
      world.tick = event.data.nextTick as number;
      world.rngState = event.data.rngState as number;
      break;
    case "metrics-recorded":
      break;
    case "contract-offered":
    case "contract-amended":
    case "contract-accepted":
    case "contract-refused":
    case "contract-fulfilled":
    case "contract-breached":
    case "contract-cancelled": {
      const contract = event.data.contract as SupplyContract;
      world.contracts ??= {};
      world.contracts[contract.id] = contract;
      const buyer = world.characters[contract.buyerId];
      const carrier = world.characters[contract.carrierId];
      if (buyer && typeof event.data.buyerMoney === "number") buyer.money = event.data.buyerMoney;
      if (carrier && typeof event.data.carrierMoney === "number") carrier.money = event.data.carrierMoney;
      if (event.type === "contract-fulfilled") {
        const shelf = world.settlements[contract.destinationId];
        if (!shelf || !carrier) throw new Error("Contract fulfilment is missing a shelf or a carrier");
        shelf.stocks = resourcesFrom(event.data, "settlementStocks");
        carrier.cargo = resourcesFrom(event.data, "carrierCargo");
      }
      break;
    }
    default:
      throw new Error(`Unknown event type: ${event.type}`);
  }

  world.nextEventSequence = Math.max(world.nextEventSequence, event.sequence + 1);
}
