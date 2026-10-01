import { assessStandingOrder, garrisonConfidenceLabel } from "../sim/agency.ts";
import { commandHolderId, factionPower, partyPower, partyPowerFromTroops, round } from "../sim/state.ts";
import type { Character, PartySighting, ReleaseSighting, SimEvent, StandingOrder, SupplyContract, TravelState, WorldState } from "../sim/types.ts";
import { projectAllowance } from "./allowance.ts";
import { causeLabelFor, captivityReleasedParts, characterName, learnedInPortNote, loyaltyNoteFor, ownedPortTaxSentence, publicFeedSentence, qualifyCollidingNames, releaseDebtNote, ransomIncomeNote, seatSummaryFor, skillsWithheldNote, summaryStaysWhenWithheld } from "./wording.ts";

/**
 * Decides what a player may legitimately know about the rest of the world.
 *
 * The design record requires that owned assets expose exact statistics while
 * foreign plans and motives are learned through observation, reports, behaviour,
 * dialogue, and investigation, and that unknown data display as unknown rather
 * than as zero. This module is the single boundary that enforces that.
 *
 * Nothing here fabricates a value. Where knowledge has not been earned the field
 * is null, so a client renders an explicit unknown instead of a plausible-looking
 * number. Ranged combat estimates are unaffected and keep coming from
 * combatForecast, which already derives its ranges from observation and strategy.
 */

export type CharacterVisibilityTier = "self" | "co-located" | "faction" | "distant";

export type CharacterIntelligenceSource =
  | "own-character"
  | "direct-observation"
  | "faction-record"
  | "reputation";

export interface CharacterIntelligence {
  tier: CharacterVisibilityTier;
  source: CharacterIntelligenceSource;
  /** True when observed condition is reported exactly rather than withheld. */
  conditionExact: boolean;
  /** True when skills and attributes sit on the faction record. */
  capabilityExact: boolean;
  observedTick: number | null;
  ageTicks: number | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * A character is directly observed when the commander shares its location with
 * neither party travelling, or when it stands inside a settlement the commander's
 * faction controls. The second clause mirrors the standard the settlement
 * projection already applies to owned territory.
 */
function isDirectlyObserved(world: WorldState, commander: Character, character: Character): boolean {
  if (
    commander.travel === null &&
    character.travel === null &&
    commander.locationId !== null &&
    commander.locationId === character.locationId
  ) {
    return true;
  }
  if (character.locationId === null || commander.factionId === null) return false;
  // A party under way is at sea, so the port it departed is not where it is.
  if (character.travel !== null) return false;
  const settlement = world.settlements[character.locationId];
  return Boolean(settlement && settlement.factionId === commander.factionId);
}

export function characterVisibilityTier(
  world: WorldState,
  commander: Character,
  character: Character,
): CharacterVisibilityTier {
  if (character.id === commander.id) return "self";
  if (isDirectlyObserved(world, commander, character)) return "co-located";
  if (commander.factionId !== null && character.factionId === commander.factionId) return "faction";
  return "distant";
}

export function characterIntelligence(
  world: WorldState,
  commander: Character,
  character: Character,
): CharacterIntelligence {
  const tier = characterVisibilityTier(world, commander, character);
  switch (tier) {
    case "self":
      return {
        tier,
        source: "own-character",
        conditionExact: true,
        capabilityExact: true,
        observedTick: world.tick,
        ageTicks: 0,
      };
    case "co-located":
      return {
        tier,
        source: "direct-observation",
        conditionExact: true,
        capabilityExact: true,
        observedTick: world.tick,
        ageTicks: 0,
      };
    case "faction":
      return {
        tier,
        source: "faction-record",
        conditionExact: false,
        capabilityExact: true,
        observedTick: null,
        ageTicks: null,
      };
    case "distant":
      return {
        tier,
        source: "reputation",
        conditionExact: false,
        capabilityExact: false,
        observedTick: null,
        ageTicks: null,
      };
  }
}

/**
 * An order is knowable to its issuer and to the character holding it. Only the
 * commander's own orders are projected, so order detail never becomes a window
 * into someone else's chain of command.
 */
export function visibleStandingOrders(commander: Character, character: Character): StandingOrder[] {
  if (character.id === commander.id) return character.standingOrders;
  return character.standingOrders.filter((order) => order.issuerId === commander.id);
}

/**
 * The order the reader is shown. A stored summary keeps the bare name.
 * The copy qualifies Toma Reef and Toma Hale. The world order is not written.
 */
function projectStandingOrder(world: WorldState, order: StandingOrder): StandingOrder {
  const summary = order.lastReport?.summary;
  if (!summary) return order;
  const qualified = qualifyCollidingNames(world, summary);
  if (qualified === summary) return order;
  return { ...order, lastReport: { ...order.lastReport!, summary: qualified } };
}

/**
 * Drop a treasury absolute the reader is not allowed to see.
 *
 * Returns the same object when nothing is hidden, so a visible own-faction
 * payload stays identical. Withheld events never reach this; their `data` is null.
 */
function withoutHiddenTreasury(world: WorldState, commander: Character, event: SimEvent): unknown {
  const data = event.data;
  if (!data || typeof data !== "object") return data;
  const record = data as Record<string, unknown>;
  const ransom = record.ransom;
  const ransomRecord = ransom && typeof ransom === "object" ? ransom as Record<string, unknown> : null;
  const ransomFaction = typeof ransomRecord?.treasuryFactionId === "string" ? ransomRecord.treasuryFactionId : null;
  const hideRansom = ransomRecord !== null
    && typeof ransomRecord.factionTreasury === "number"
    && ransomFaction !== null
    && ransomFaction !== commander.factionId;
  const settlementFaction = event.settlementId ? world.settlements[event.settlementId]?.factionId ?? null : null;
  const hideTop = typeof record.factionTreasury === "number"
    && typeof settlementFaction === "string"
    && settlementFaction !== commander.factionId;
  if (!hideRansom && !hideTop) return data;
  const copy: Record<string, unknown> = { ...record };
  if (hideTop) delete copy.factionTreasury;
  if (hideRansom && ransomRecord) {
    const ransomCopy = { ...ransomRecord };
    delete ransomCopy.factionTreasury;
    copy.ransom = ransomCopy;
  }
  return copy;
}

/**
 * The commander's own knowledge of the world, with report ages made sane.
 *
 * Hearsay seeded before the world began carries a deliberately negative
 * `observedTick` so it reads as stale from tick one. The simulation is right to
 * store it that way, but a tick-of-observation before tick 0 is not something a
 * player should be shown, so the projection floors it at 0. The internal copy is
 * untouched, and every consumer that cares already floors it itself.
 */
function projectPartySighting(
  world: WorldState,
  sighting: PartySighting,
): PartySighting & { ageTicks: number; label: "Sighted troops" } {
  return {
    ...sighting,
    ageTicks: Math.max(0, world.tick - sighting.observedTick),
    label: "Sighted troops",
  };
}

/**
 * The commander's sightings, with the age the panel prints.
 *
 * The stored count is not pulled toward a prior. No record is null, not a
 * zero, and it is not copied into `troops`.
 */
function projectPartySightings(
  world: WorldState,
  sightings: Character["partySightings"],
): Record<string, PartySighting & { ageTicks: number; label: "Sighted troops" }> | null {
  if (!sightings) return null;
  return Object.fromEntries(
    Object.entries(sightings).map(([characterId, sighting]) => [
      characterId,
      projectPartySighting(world, sighting),
    ]),
  );
}

export type SeaSightingKind = "passing" | "sharing" | "overtaking" | "arriving";

/**
 * One ship met at sea, derived at read time.
 *
 * Nothing here is stored. `ageTicks` is computed for the panel and is 0 on
 * every row this rule emits, because `observedTick` is the snapshot tick.
 */
export interface SeaSighting {
  characterId: string;
  factionId: string | null;
  fromId: string;
  toId: string;
  kind: SeaSightingKind;
  arriving: boolean;
  sailors: number;
  troops: number;
  partyPower: number;
  observedTick: number;
  source: "direct";
  confidence: 1;
  ageTicks: number;
  /** The sentence the briefing lists. The troop count stays on this row. */
  summary: string;
}

interface WaterSpan {
  loNum: number;
  loDen: number;
  loClosed: boolean;
  hiNum: number;
  hiDen: number;
  hiClosed: boolean;
}

/** A ship still at sea: a voyage with at least one tick left. */
function atSea(character: Character): character is Character & { travel: TravelState } {
  const travel = character.travel;
  return travel !== null
    && travel.totalTicks >= 1
    && travel.remainingTicks >= 1
    && travel.remainingTicks <= travel.totalTicks;
}

function compareRational(aNum: number, aDen: number, bNum: number, bDen: number): number {
  const left = aNum * bDen;
  const right = bNum * aDen;
  return left < right ? -1 : left > right ? 1 : 0;
}

function pointSpan(value: number): WaterSpan {
  return {
    loNum: value,
    loDen: 1,
    loClosed: true,
    hiNum: value,
    hiDen: 1,
    hiClosed: true,
  };
}

/**
 * The stretch of the leg crossed this tick, in the ship's own direction.
 *
 * Zero sailed ticks is the departure point. Otherwise the span is open at the
 * previous end and closed at the current end.
 */
function directedSpan(travel: TravelState): WaterSpan {
  const sailed = travel.totalTicks - travel.remainingTicks;
  if (sailed <= 0) return pointSpan(0);
  return {
    loNum: sailed - 1,
    loDen: travel.totalTicks,
    loClosed: false,
    hiNum: sailed,
    hiDen: travel.totalTicks,
    hiClosed: true,
  };
}

/**
 * The same stretch on an axis that runs from the lexicographically smaller
 * settlement id to the larger. A ship sailing toward the smaller id is flipped.
 */
function axisSpan(travel: TravelState): WaterSpan {
  if (travel.fromId < travel.toId) return directedSpan(travel);
  if (travel.remainingTicks >= travel.totalTicks) return pointSpan(1);
  return {
    loNum: travel.remainingTicks,
    loDen: travel.totalTicks,
    loClosed: true,
    hiNum: travel.remainingTicks + 1,
    hiDen: travel.totalTicks,
    hiClosed: false,
  };
}

function spanEntirelyBefore(left: WaterSpan, right: WaterSpan): boolean {
  const compared = compareRational(left.hiNum, left.hiDen, right.loNum, right.loDen);
  if (compared < 0) return true;
  if (compared > 0) return false;
  return !left.hiClosed || !right.loClosed;
}

function spansOverlap(left: WaterSpan, right: WaterSpan): boolean {
  return !spanEntirelyBefore(left, right) && !spanEntirelyBefore(right, left);
}

function sameLeg(left: TravelState, right: TravelState): boolean {
  return left.fromId === right.fromId && left.toId === right.toId;
}

function oppositeLane(left: TravelState, right: TravelState): boolean {
  return left.fromId === right.toId && left.toId === right.fromId;
}

function meetingKind(observer: TravelState, subject: TravelState): { kind: SeaSightingKind; arriving: boolean } | null {
  const bothLast = observer.remainingTicks === 1 && subject.remainingTicks === 1;
  if (oppositeLane(observer, subject) && spansOverlap(axisSpan(observer), axisSpan(subject))) {
    return { kind: "passing", arriving: false };
  }
  if (sameLeg(observer, subject) && spansOverlap(directedSpan(observer), directedSpan(subject))) {
    return {
      kind: observer.totalTicks === subject.totalTicks ? "sharing" : "overtaking",
      arriving: bothLast,
    };
  }
  if (bothLast && observer.toId === subject.toId) {
    return { kind: "arriving", arriving: true };
  }
  return null;
}

function seaRow(world: WorldState, subject: Character, kind: SeaSightingKind, arriving: boolean): SeaSighting {
  const travel = subject.travel!;
  const observedTick = world.tick;
  return {
    characterId: subject.id,
    factionId: subject.factionId,
    fromId: travel.fromId,
    toId: travel.toId,
    kind,
    arriving,
    sailors: subject.sailors,
    troops: subject.troops.count,
    partyPower: partyPower(subject),
    observedTick,
    source: "direct",
    confidence: 1,
    ageTicks: Math.max(0, world.tick - observedTick),
    summary: seaSummary(world, subject, kind, arriving, subject.troops.count, Math.max(0, world.tick - observedTick)),
  };
}

function seaSummary(
  world: WorldState,
  subject: Character,
  kind: SeaSightingKind,
  arriving: boolean,
  troops: number,
  ageTicks: number,
): string {
  const travel = subject.travel!;
  const from = world.settlements[travel.fromId]?.name ?? travel.fromId;
  const to = world.settlements[travel.toId]?.name ?? travel.toId;
  const dock = arriving ? ` Docks at ${to} on this tick.` : "";
  return `${characterName(world, subject.id, subject.name)} is ${seaRelation(kind)}, ${from} to ${to}.${dock} ${troops} troops, ${ageTicks} ticks old.`;
}

/** Plain sentence for a sea kind. The stored kind value is unchanged. */
function seaRelation(kind: SeaSightingKind): string {
  switch (kind) {
    case "sharing":
      return "in the same stretch of water";
    case "overtaking":
      return "overtaking on this route";
    case "passing":
      return "passing on the opposite course";
    case "arriving":
      return "arriving at the same port";
  }
}

export interface OutOfStretch {
  characterId: string;
  fromId: string;
  toId: string;
  remainingTicks: number;
  totalTicks: number;
  summary: string;
}

/**
 * Ships on the commander's leg whose stretch of water does not meet hers.
 * Null in port. No troop count: at sea that figure is withheld.
 */
export function outOfStretchFor(world: WorldState, observer: Character): OutOfStretch[] | null {
  if (!atSea(observer)) return null;
  const rows: OutOfStretch[] = [];
  for (const subject of Object.values(world.characters).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)) {
    if (subject.id === observer.id || !atSea(subject)) continue;
    if (!sameLeg(observer.travel, subject.travel)) continue;
    if (meetingKind(observer.travel, subject.travel)) continue;
    const from = world.settlements[subject.travel.fromId]?.name ?? subject.travel.fromId;
    const to = world.settlements[subject.travel.toId]?.name ?? subject.travel.toId;
    rows.push({
      characterId: subject.id,
      fromId: subject.travel.fromId,
      toId: subject.travel.toId,
      remainingTicks: subject.travel.remainingTicks,
      totalTicks: subject.travel.totalTicks,
      summary: `${characterName(world, subject.id, subject.name)} is on ${from} to ${to}, ${subject.travel.remainingTicks} of ${subject.travel.totalTicks} ticks left, and is not in the same stretch of water.`,
    });
  }
  return rows;
}

/**
 * The commander's sea list, or null when the commander is not at sea.
 *
 * Computed from the current voyages. It does not write the world, draw RNG,
 * or keep a row after the ships separate.
 */
export function seaSightingsFor(world: WorldState, observer: Character): Record<string, SeaSighting> | null {
  if (!atSea(observer)) return null;
  const rows: Record<string, SeaSighting> = {};
  for (const subject of Object.values(world.characters).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)) {
    if (subject.id === observer.id || !atSea(subject)) continue;
    const meeting = meetingKind(observer.travel, subject.travel);
    if (!meeting) continue;
    rows[subject.id] = seaRow(world, subject, meeting.kind, meeting.arriving);
  }
  return rows;
}

export interface CaptivePortBelief {
  settlementId: string;
  garrisonEstimate: number;
  observedTick: number;
  ageTicks: number;
  confidence: number;
  displayConfidence: number;
  source: "direct" | "faction-report";
  stale: boolean;
}

/**
 * What the captor's faction reads off one prisoner.
 *
 * Derived when the state is projected. It is not stored, and it is not copied
 * into `troops` or `partyPower`. The person fields keep confidence 1. A port
 * belief keeps the prisoner's confidence and date, and shows the garrison label.
 */
export interface CaptiveIntel {
  characterId: string;
  factionId: string | null;
  archetype: string;
  settlementId: string;
  leadership: number;
  troops: number;
  partyPower: number;
  observedTick: number;
  ageTicks: number;
  source: "direct";
  confidence: 1;
  ports: CaptivePortBelief[];
  /**
   * Set when `ports` is empty. An empty list is not a report that they hold no ports.
   * Null when the row names at least one port.
   */
  portsNote: string | null;
}

export interface ProjectedReleaseSighting extends ReleaseSighting {
  ageTicks: number;
  displayConfidence: number;
  stale: boolean;
}

function reportAge(world: WorldState, observedTick: number): number {
  return Math.max(0, world.tick - observedTick);
}

function reportIsStale(world: WorldState, ageTicks: number): boolean {
  return ageTicks >= world.ticksPerDay * 3;
}

/**
 * Port beliefs the prisoner already carries about their own faction.
 *
 * A rumor is left out, including one that names their faction. An unaffiliated
 * prisoner has none. The live garrison is not read. A negative tick is floored
 * for display and still aged from the raw tick.
 */
function captivePorts(world: WorldState, prisoner: Character): CaptivePortBelief[] {
  if (!prisoner.factionId) return [];
  return Object.values(prisoner.knowledge)
    .filter((entry) =>
      (entry.source === "direct" || entry.source === "faction-report") &&
      entry.factionId === prisoner.factionId,
    )
    .sort((left, right) => left.settlementId.localeCompare(right.settlementId))
    .map((entry) => {
      const ageTicks = reportAge(world, entry.observedTick);
      const source = entry.source === "faction-report" ? "faction-report" as const : "direct" as const;
      return {
        settlementId: entry.settlementId,
        garrisonEstimate: entry.garrisonEstimate,
        observedTick: Math.max(0, entry.observedTick),
        ageTicks,
        confidence: entry.confidence,
        displayConfidence: garrisonConfidenceLabel(entry.confidence, ageTicks),
        source,
        stale: reportIsStale(world, ageTicks),
      };
    });
}

/**
 * The captor's row for one prisoner, or null when this reader does not hold them.
 *
 * The reader does not have to be in the port. Losing the port does not end the
 * reading. A faction that merely holds the port, and is not the captor, gets
 * nothing. The prisoner is not a row on their own screen. Unaffiliated captives
 * are not a faction's row. This does not write the world.
 */
export function captiveIntelFor(
  world: WorldState,
  commander: Character,
  character: Character,
): CaptiveIntel | null {
  const captivity = character.captivity;
  if (!captivity || character.id === commander.id) return null;
  if (!captivity.captorFactionId || commander.factionId !== captivity.captorFactionId) return null;
  const observedTick = captivity.capturedTick;
  const ports = captivePorts(world, character);
  return {
    characterId: character.id,
    factionId: character.factionId,
    archetype: character.archetype,
    settlementId: captivity.settlementId,
    leadership: character.skills.leadership,
    troops: captivity.scatteredTroops.count,
    partyPower: partyPowerFromTroops(character, captivity.scatteredTroops),
    observedTick,
    ageTicks: reportAge(world, observedTick),
    source: "direct",
    confidence: 1,
    ports,
    portsNote: ports.length === 0
      ? `${character.name} named no ports. The list may be incomplete.`
      : null,
  };
}

/**
 * Why the live troop count is not the captured count.
 * The live count is the world's figure and stays 0 while the prisoner is held.
 */
function heldTroopsNote(
  world: WorldState,
  character: Character,
  intel: CaptiveIntel,
  live: number,
): string {
  const captorId = character.captivity?.captorFactionId;
  const captor = captorId ? world.factions[captorId]?.name ?? captorId : "the captor";
  return `${live} with ${character.name}; ${intel.troops} held by ${captor}. The experience and discipline are the troops now held by ${captor}.`;
}

function projectReleaseSighting(
  world: WorldState,
  character: Character,
): ProjectedReleaseSighting | null {
  const record = character.releaseSighting;
  if (!record) return null;
  const ageTicks = reportAge(world, record.observedTick);
  return {
    ...record,
    ageTicks,
    displayConfidence: garrisonConfidenceLabel(record.confidence, ageTicks),
    stale: reportIsStale(world, ageTicks),
  };
}

function projectKnowledge(knowledge: Character["knowledge"]): Character["knowledge"] {
  return Object.fromEntries(
    Object.entries(knowledge).map(([settlementId, entry]) => [
      settlementId,
      { ...entry, observedTick: Math.max(0, entry.observedTick) },
    ]),
  ) as Character["knowledge"];
}

export interface ProjectedContract {
  id: string;
  buyerId: string;
  carrierId: string;
  destinationId: string;
  deadlineTick: number;
  status: SupplyContract["status"];
  revision: number;
  observedTick: number;
  ageTicks: number;
  source: "own-character" | "faction-report";
  quantity: number | null;
  price: number | null;
  escrow: number | null;
  good: "provisions";
}

/**
 * Contracts the commander may know about.
 *
 * The two parties see the price, the quantity, and the escrow. A faction mate
 * of either party sees that the job exists, where it goes, and whether it was
 * kept. A bystander, including someone standing next to the purse, gets no row.
 */
export function projectSupplyContracts(world: WorldState, commander: Character): ProjectedContract[] {
  return Object.values(world.contracts ?? {})
    .sort((left, right) => left.id.localeCompare(right.id))
    .flatMap((contract) => {
      const row = projectOneContract(world, commander, contract);
      return row ? [row] : [];
    });
}

function projectOneContract(
  world: WorldState,
  commander: Character,
  contract: SupplyContract,
): ProjectedContract | null {
  const party = commander.id === contract.buyerId || commander.id === contract.carrierId;
  const buyer = world.characters[contract.buyerId];
  const carrier = world.characters[contract.carrierId];
  const factionMate = commander.factionId !== null && (
    commander.factionId === buyer?.factionId || commander.factionId === carrier?.factionId
  );
  if (!party && !factionMate) return null;
  return {
    id: contract.id,
    buyerId: contract.buyerId,
    carrierId: contract.carrierId,
    destinationId: contract.destinationId,
    deadlineTick: contract.deadlineTick,
    status: contract.status,
    revision: contract.revision,
    observedTick: contract.observedTick,
    ageTicks: Math.max(0, world.tick - contract.observedTick),
    source: party ? "own-character" : "faction-report",
    good: "provisions",
    quantity: party ? contract.quantity : null,
    price: party ? contract.price : null,
    escrow: party ? contract.escrow : null,
  };
}

function projectTroopFigures(troops: { count: number; experience: number; discipline: number }) {
  return {
    count: troops.count,
    experience: round(troops.experience, 3),
    discipline: round(troops.discipline, 3),
  };
}

export function projectCharacter(
  world: WorldState,
  commander: Character,
  character: Character,
  events?: SimEvent[],
): Record<string, unknown> {
  const intelligence = characterIntelligence(world, commander, character);
  const isSelf = intelligence.tier === "self";
  const condition = intelligence.conditionExact;
  const capability = intelligence.capabilityExact;

  const standingOrders = visibleStandingOrders(commander, character).map((order) => projectStandingOrder(world, order));
  const storedSighting = isSelf ? undefined : commander.partySightings?.[character.id];
  const seaSightings = isSelf ? seaSightingsFor(world, character) : null;
  const seaSighting = isSelf ? null : seaSightingsFor(world, commander)?.[character.id] ?? null;
  const dockedTogether = !isSelf &&
    commander.travel === null &&
    character.travel === null &&
    commander.locationId !== null &&
    commander.locationId === character.locationId;
  const loyalty = character.factionId !== null && character.factionId === commander.factionId
    ? round(character.personality.loyalty + (character.loyaltyAdjustment ?? 0), 3)
    : null;
  const captiveIntel = captiveIntelFor(world, commander, character);
  const releaseSighting = isSelf ? projectReleaseSighting(world, character) : null;
  const activeOrder =
    standingOrders
      .filter(
        (order) =>
          (order.status === "pending" || order.status === "active") &&
          (order.expiresTick === null || order.expiresTick > world.tick),
      )
      .sort((left, right) => right.priority - left.priority)[0] ?? null;

  return {
    id: character.id,
    name: character.name,
    /** Qualified where Toma Reef and Toma Hale would otherwise read as the same captain. The stored name is `name`. */
    displayName: characterName(world, character.id, character.name),
    archetype: character.archetype,
    controller: character.controller,
    factionId: character.factionId,
    locationId: character.locationId,
    travel: character.travel,
    money: condition ? round(character.money, 2) : null,
    cargo: condition ? character.cargo : null,
    /**
     * Why the hold and the purse are on this card. Only when both ships are
     * in the same port. A sea card does not get it, and neither does a remote
     * reading through an owned port, where that sentence would be false.
     */
    conditionNote: dockedTogether && commander.locationId
      ? learnedInPortNote(world.settlements[commander.locationId]?.name ?? commander.locationId)
      : null,
    health: condition ? round(character.health, 1) : null,
    morale: condition ? round(character.morale, 1) : null,
    sailors: condition ? character.sailors : null,
    troops: condition ? projectTroopFigures(character.troops) : null,
    /**
     * Why live troops are 0 beside the captured count. Only on a captor's card,
     * and only when that card already shows the live count. The count stays 0.
     * Experience and discipline on that line are the troops the captor holds.
     */
    troopsNote: condition && captiveIntel && character.captivity
      ? heldTroopsNote(world, character, captiveIntel, character.troops.count)
      : null,
    /**
     * The dated record, beside troops. Co-located troops stay live. Away, troops
     * stay null and this is the record, or null when the commander has not seen
     * this party. It is never copied into `troops`.
     */
    partySighting: storedSighting ? projectPartySighting(world, storedSighting) : null,
    /**
     * A ship met on this snapshot. Beside troops, and never copied into them.
     * Null when the commander is not alongside, including in port.
     */
    seaSighting,
    captivity: condition && character.captivity
      ? {
          ...character.captivity,
          scatteredTroops: projectTroopFigures(character.captivity.scatteredTroops),
          causeLabel: causeLabelFor(character.captivity.cause),
        }
      : null,
    /**
     * The strength the captor took, beside the live count. Live troops stay 0
     * while the prisoner is held. This row is not copied into them. Null when
     * the reader is not the captor, and null on the prisoner's own screen.
     */
    captiveIntel,
    troopRecovery: condition ? character.troopRecovery : null,
    scars: condition ? character.scars : null,
    debts: isSelf ? character.debts : null,
    /**
     * The debt the release line already states. On every card that line can
     * be read from, including a rival. It is not the stored debt row.
     */
    releaseDebtNote: releaseDebtNote(world, character.id, events),
    /**
     * The latest ransom credit the release line already names for this person.
     * It does not add the purse. Null when no line names them.
     */
    ransomIncomeNote: ransomIncomeNote(world, character.id, events),
    attributes: capability ? character.attributes : null,
    skills: capability ? character.skills : null,
    /**
     * Present when skills are withheld, so a null leadership is not a missing person.
     * A captor row already publishes leadership, so that sentence would be false there.
     */
    skillsNote: capability || captiveIntel
      ? null
      : skillsWithheldNote(character.name, intelligence.tier, intelligence.source),
    personality: isSelf ? character.personality : null,
    /**
     * Loyalty the cover sort reads: the seed plus any unpaid-release scar.
     * Own faction only, including a mate whose personality stays hidden.
     * A rival is null. `personality.loyalty` on the commander's own row stays the seed.
     */
    loyalty,
    /** Which figure the seat reads. The commander's own card only. */
    loyaltyNote: isSelf ? loyaltyNoteFor(character, round(character.personality.loyalty + (character.loyaltyAdjustment ?? 0), 3)) : null,
    /**
     * Own faction only. The cap is 18 per day. Remaining is omitted while full,
     * because nothing has been drawn. The free holder is uncapped. A rival is null.
     */
    ...projectAllowance(world, commander, character),
    partyPower: condition ? partyPower(character) : null,
    activeGoal: isSelf
      ? character.goals.find((goal) => goal.id === character.activeGoalId) ?? null
      : null,
    plan: isSelf ? character.plan : null,
    relationship: commander.relationships[character.id] ?? null,
    standingOrders,
    activeOrderAssessment: activeOrder ? assessStandingOrder(character, activeOrder) : null,
    knowledge: isSelf ? projectKnowledge(character.knowledge) : null,
    /**
     * The prison this captain remembers. On anyone else it is null, the same
     * as knowledge. It is not copied into the knowledge map.
     */
    releaseSighting,
    /** The commander's own map. On anyone else it is null, the same as knowledge. */
    partySightings: isSelf ? projectPartySightings(world, character.partySightings) : null,
    /** The commander's own sea list. On anyone else it is null. Null in port. */
    seaSightings,
    /** Same leg, outside her stretch. Null in port and on anyone else. */
    outOfStretch: isSelf ? outOfStretchFor(world, character) : null,
    victories: character.victories,
    defeats: character.defeats,
    intelligence,
  };
}

export function projectFactions(world: WorldState, commander: Character): Record<string, unknown>[] {
  const ownFactionId = commander.factionId;
  return Object.values(world.factions)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((faction) => {
      const owned = faction.id === ownFactionId;
      return {
        id: faction.id,
        name: faction.name,
        color: faction.color,
        commanderId: commandHolderId(world, faction.id),
        actingCommanderId: faction.actingCommanderId ?? null,
        seatSummary: seatSummaryFor(world, faction),
        treasury: owned ? faction.treasury : null,
        /** The balance, in words, when the number is withheld. Own faction leaves this null. */
        treasuryNote: owned ? null : "not visible to you",
        // A faction's tax is public in a way its treasury is not: every sale in
        // its ports pays it, and a merchant has to know the rate before sailing.
        taxRate: faction.taxRate,
        power: owned ? factionPower(world, faction.id) : null,
        intelligence: {
          exact: owned,
          source: owned ? "faction-record" : "reputation",
        },
      };
    });
}

function conversationThreadId(event: SimEvent): string | null {
  const data = asRecord(event.data);
  if (!data) return null;
  const thread = asRecord(data.thread);
  const fromThread = asString(thread?.id);
  if (fromThread) return fromThread;
  const message = asRecord(data.message);
  const fromMessage = asString(message?.threadId);
  if (fromMessage) return fromMessage;
  const reply = asRecord(data.reply);
  return asString(reply?.threadId);
}

/**
 * Whether the commander may see an event's raw payload.
 *
 * Prose summaries remain available for public events, but structured payloads
 * carry hidden state. A decision-made event ships the deciding character's active
 * goal id, plan intent, private beliefs about its target, and its scored
 * alternatives; plan-reconsidered ships the whole review.
 */
export function eventPayloadVisible(
  world: WorldState,
  commander: Character,
  event: SimEvent,
): boolean {
  if (event.type.startsWith("conversation-")) {
    const threadId = conversationThreadId(event);
    if (!threadId) return false;
    return world.conversationThreads[threadId]?.participantIds.includes(commander.id) ?? false;
  }

  // The commander's own actions are entirely theirs.
  if (event.actorId === commander.id) return true;

  // A contract's payload is the two parties' business. The standing-order rule
  // is the same shape, with both parties in the issuer's place. Holding the
  // destination does not open it, and neither does sharing a faction.
  if (event.type.startsWith("contract-")) {
    const data = asRecord(event.data);
    const nested = asRecord(data?.contract);
    const buyerId = asString(data?.buyerId) ?? asString(nested?.buyerId);
    const carrierId = asString(data?.carrierId) ?? asString(nested?.carrierId);
    return commander.id === buyerId || commander.id === carrierId;
  }

  // Orders are knowable within the chain of command that issued them.
  if (event.type.startsWith("standing-order-")) {
    const orderId = asString(asRecord(event.data)?.orderId);
    const recipient = event.targetId ? world.characters[event.targetId] : undefined;
    const order = orderId
      ? recipient?.standingOrders.find((entry) => entry.id === orderId)
      : undefined;
    if (order?.issuerId === commander.id) return true;
  }

  // Anything else attributed to a character belongs to that character. Motives,
  // beliefs, and logistics stay private even for faction peers, because the
  // character projection withholds the same fields and a feed that revealed them
  // would be a back door around it.
  //
  // Note what this deliberately does not depend on: where the event happened.
  // Owning the ground a decision was taken on grants no insight into the decision
  // itself. Keying on location instead let a player gain omniscience over every
  // visitor to a port simply by capturing it.
  if (event.actorId !== undefined) return false;

  // Unattributed events are settlement or world events, where control of the
  // ground legitimately decides what the commander's administration is told.
  if (commander.factionId === null || event.settlementId === undefined) return false;
  return world.settlements[event.settlementId]?.factionId === commander.factionId;
}

/**
 * Projects one event. When the payload is withheld the summary falls back to a
 * neutral line, because the rich summaries interpolate private data such as a
 * character's stated reason for reconsidering its plan.
 */
export function projectEvent(
  world: WorldState,
  commander: Character,
  event: SimEvent,
  richSummary: string,
): Record<string, unknown> {
  const visible = eventPayloadVisible(world, commander, event);
  const actor = event.actorId ? world.characters[event.actorId]?.name ?? event.actorId : "World";
  const raw = `${actor}: ${event.type.replaceAll("-", " ")}`;
  let summary = richSummary === raw ? publicFeedSentence(world, event) : richSummary;
  if (!visible && !summaryStaysWhenWithheld(event.type)) {
    summary = ownedPortTaxSentence(world, commander.factionId, event) ?? publicFeedSentence(world, event);
  }
  if (event.type.startsWith("standing-order-") || event.type === "market-trade") {
    summary = qualifyCollidingNames(world, summary);
  }
  const details = event.type === "captivity-released" ? captivityReleasedParts(world, event, false, commander) : null;
  return {
    sequence: event.sequence,
    tick: event.tick,
    day: round(event.tick / world.ticksPerDay, 2),
    type: event.type,
    actorId: event.actorId,
    targetId: event.targetId,
    settlementId: event.settlementId,
    summary,
    details,
    data: visible ? withoutHiddenTreasury(world, commander, event) : null,
    payloadWithheld: !visible,
  };
}
