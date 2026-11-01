import { provisionDemand } from "./engine.ts";
import { actingCoverId, commandHolderId, CLAIM_STABILITY_FLOOR, round } from "./state.ts";
import { TAX_DRIFT_THRESHOLD } from "./tax-rate.ts";
import { createPrototypeWorld } from "./scenario.ts";
import type { Character, Settlement, WorldState } from "./types.ts";

/**
 * The command holder is leaving, and the cover sort names who takes the seat.
 *
 * The sort is the captivity cover: highest leadership plus scarred loyalty
 * times 50, captives skipped, the holder skipped, a lower id on a tie. No draw.
 * Null when no free member remains. The declaration is refused in that case,
 * so the old faction is not left headless.
 */
export function secessionSuccessorId(world: WorldState, settlement: Settlement): string | null {
  if (!settlement.ownerId || !settlement.factionId) return null;
  if (commandHolderId(world, settlement.factionId) !== settlement.ownerId) return null;
  return actingCoverId(world, settlement.factionId, settlement.ownerId);
}

export function declareSecessionRefusal(
  world: WorldState,
  character: Character,
  playerId: string,
  settlementId: unknown,
  name: unknown,
  nameProvided: boolean,
  exceptCommandId?: string,
): { code: string; error: string } | null {
  if (typeof settlementId !== "string" || !world.settlements[settlementId]) {
    return { code: "unknown-settlement", error: "That port is not on the chart." };
  }
  if (nameProvided && (typeof name !== "string" || name.trim().length === 0)) {
    return { code: "invalid-name", error: "The faction name has to be a non-empty string." };
  }
  const settlement = world.settlements[settlementId];
  if (settlement.factionId === null) {
    return { code: "no-faction", error: "A neutral port has no faction to leave." };
  }
  if (settlement.ownerId !== character.id) {
    return { code: "not-owner", error: "Only the owner of this port may declare it separate." };
  }
  if (character.factionId !== settlement.factionId) {
    return { code: "not-member", error: "The owner is not a member of the faction that holds this port." };
  }
  if (character.captivity) {
    return { code: "character-captive", error: "Only an escape attempt is available while the character is captive" };
  }
  if (character.travel) {
    return { code: "at-sea", error: "The owner is at sea." };
  }
  if (character.locationId !== settlement.id) {
    return { code: "away", error: "The owner is not at this port." };
  }
  const holderId = commandHolderId(world, settlement.factionId);
  if (holderId === character.id && character.controller.kind !== "human") {
    return { code: "autonomous-holder", error: "An autonomous command holder may not declare." };
  }
  // A player who holds the seat may still declare. The cover takes that seat
  // in the same reducer step. With nobody left to take it, the declaration
  // is refused and the holder stays, so the faction is not left headless.
  if (holderId === character.id && secessionSuccessorId(world, settlement) === null) {
    return {
      code: "no-successor",
      error: "The faction would be left with nobody to take the seat.",
    };
  }
  if (world.pendingCommands.some((command) =>
    command.type === "declare-secession" &&
    command.id !== exceptCommandId &&
    (command.playerId === playerId || command.settlementId === settlement.id)
  )) {
    return { code: "secession-already-queued", error: "A secession is already queued for this port." };
  }
  return null;
}

/**
 * Loyalty below this follows a declaration. It is the floor of the officer
 * band in `personalityFor`. The sum is the one the cover sort reads.
 */
export const SECESSION_LOYALTY_LINE = 0.75;

/**
 * What a declaration would do to one port, read from the world as it is.
 *
 * The readout writes nothing. The command builds a `secession-declared`
 * payload from this same reading. Nothing here draws. The autonomous walker
 * calls the same builder and does not draw either.
 */
export interface SecessionReadout {
  /** `settlement.ownerId`. Null when the port is unowned. */
  ownerId: string | null;
  /**
   * Section 2's owner gate. A player who holds the seat may pass it. An
   * autonomous holder does not. Tax and stability are not part of this gate.
   */
  ownerGate: boolean;
  /** Anchored members who would leave with the owner. The owner is not in this count. */
  followerCount: number;
  /**
   * The whole garrison follows, or none of it does.
   * `"none"` is a garrison of 0: there is nothing to follow, so the panel
   * says "no garrison" rather than "would follow".
   */
  garrisonFollows: boolean | "none";
  /**
   * The same two figures with the tax line treated as open. That press is the
   * stand-in for a holding rate above 0.15. It is not stored. A garrison of 0
   * is still `"none"` on this line.
   */
  taxOpen: {
    followerCount: number;
    garrisonFollows: boolean | "none";
  };
}

function holdingTaxRate(world: WorldState, settlement: Settlement): number {
  if (!settlement.factionId) return 0;
  return world.factions[settlement.factionId]?.taxRate ?? 0;
}

/** The port ration: `round(population / 3600, 3)`, the figure upkeep eats. */
export function settlementProvisionRation(settlement: Settlement): number {
  return round(settlement.population / 3_600, 3);
}

/**
 * The port is pressed when the holding rate is above 0.15, or stability is
 * at or below 55, or provisions are below the ration. `taxOpen` pretends the
 * rate is above the line. A missing faction has no rate, so only the other
 * two terms can press it, unless the tax line is being held open.
 */
export function settlementPressed(world: WorldState, settlement: Settlement, taxOpen = false): boolean {
  const taxed = taxOpen || holdingTaxRate(world, settlement) > TAX_DRIFT_THRESHOLD;
  const unstable = settlement.stability <= CLAIM_STABILITY_FLOOR;
  const short = settlement.stocks.provisions < settlementProvisionRation(settlement);
  return taxed || unstable || short;
}

function anchored(character: Character, settlementId: string): boolean {
  return character.locationId === settlementId && character.travel === null && character.captivity === null;
}

/** The cover-sort sum. `loyaltyAdjustment` is omitted at 0. */
export function secessionLoyalty(character: Character): number {
  return character.personality.loyalty + (character.loyaltyAdjustment ?? 0);
}

/**
 * The owner gate from section 2.
 *
 * The declarer is `ownerId`. The port's faction is non-null. The owner's
 * faction matches it. The owner is anchored there and is not captive. A
 * player who is also the command holder may declare. An autonomous command
 * holder may not. Someone who is only standing on the dock may not.
 */
export function ownerGatePasses(world: WorldState, settlement: Settlement): boolean {
  if (!settlement.ownerId || settlement.factionId === null) return false;
  const owner = world.characters[settlement.ownerId];
  if (!owner) return false;
  if (owner.factionId !== settlement.factionId) return false;
  if (!anchored(owner, settlement.id)) return false;
  const holderId = commandHolderId(world, settlement.factionId);
  if (holderId === owner.id && owner.controller.kind !== "human") return false;
  return true;
}

function actingCommanderId(world: WorldState, settlement: Settlement): string | null {
  if (!settlement.factionId) return null;
  return world.factions[settlement.factionId]?.actingCommanderId ?? null;
}

function wouldFollow(
  world: WorldState,
  settlement: Settlement,
  character: Character,
  holderId: string | null,
  actingId: string | null,
  pressed: boolean,
): boolean {
  if (settlement.factionId === null) return false;
  if (character.id === settlement.ownerId) return false;
  if (!anchored(character, settlement.id)) return false;
  if (character.factionId !== settlement.factionId) return false;
  if (holderId !== null && character.id === holderId) return false;
  if (actingId !== null && character.id === actingId) return false;
  if (!(secessionLoyalty(character) < SECESSION_LOYALTY_LINE)) return false;
  if (pressed) return true;
  return character.cargo.provisions < provisionDemand(character);
}

/** `"none"` when the stack is empty. A press does not invent a garrison. */
export function garrisonReading(garrison: number, pressed: boolean): boolean | "none" {
  if (garrison <= 0) return "none";
  return pressed;
}

/**
 * Character ids who would leave, in id order. The owner is not in the list.
 * The command holder and the acting commander are not in it either.
 */
export function secessionFollowerIds(world: WorldState, settlement: Settlement, pressed: boolean): string[] {
  const holderId = settlement.factionId === null ? null : commandHolderId(world, settlement.factionId);
  const actingId = actingCommanderId(world, settlement);
  return Object.values(world.characters)
    .sort((left, right) => left.id.localeCompare(right.id))
    .filter((character) => wouldFollow(world, settlement, character, holderId, actingId, pressed))
    .map((character) => character.id);
}

function countFollowers(world: WorldState, settlement: Settlement, pressed: boolean): number {
  return secessionFollowerIds(world, settlement, pressed).length;
}

/** Every founded faction in this prototype uses this color. */
export const SECESSION_FACTION_COLOR = "#2f6f4e";

/** Free Tide's scenario rate. It is not above the 0.15 drift line. */
export const SECESSION_FOUNDING_TAX_RATE = 0.08;

export interface SecessionFactionPayload {
  id: string;
  name: string;
  color: string;
  treasury: number;
  taxRate: number;
}

/**
 * The absolutes `secession-declared` carries. The reducer writes these and
 * does not re-test loyalty.
 */
export interface SecessionDeclaredData {
  previousFactionId: string;
  ownerId: string;
  followerIds: string[];
  garrisonFollowed: boolean;
  garrison: number;
  stability: number;
  faction: SecessionFactionPayload;
  previousActingCommanderId: string | null;
  actingCommanderId: string | null;
  /**
   * Cover-sort successor who becomes `commandHolderId` of the faction being
   * left. Null when the declarer does not hold that seat. The reducer
   * retargets the holder's standing orders onto this id. Absent only on an
   * event recorded before this field existed.
   */
  successorId: string | null;
}

export function secessionFactionId(ownerId: string, settlementId: string, tick: number): string {
  return `secession-${ownerId}-${settlementId}-${tick}`;
}

const ROMAN_NUMERALS: ReadonlyArray<readonly [number, string]> = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

/** Decimal to a roman numeral. 2 is II. No draw. */
function romanNumeral(value: number): string {
  let rest = value;
  let numeral = "";
  for (const [amount, glyph] of ROMAN_NUMERALS) {
    while (rest >= amount) {
      numeral += glyph;
      rest -= amount;
    }
  }
  return numeral;
}

/**
 * The faction name for a declaration that passed no name.
 *
 * The port's name, prefixed with "Free". Crown Harbor is "Free Crown Harbor".
 * When that string is already a faction's name, the next free roman suffix
 * is used: "Free Crown Harbor II", then "III". The names already in the
 * world are the ones that count. The walker applies each declaration before
 * the next port, so a second break in the same tick sees the first. No draw.
 */
export function autonomousFactionName(world: WorldState, settlement: Settlement): string {
  const base = `Free ${settlement.name}`;
  const taken = new Set(Object.values(world.factions).map((faction) => faction.name));
  if (!taken.has(base)) return base;
  let ordinal = 2;
  let candidate = `${base} ${romanNumeral(ordinal)}`;
  while (taken.has(candidate)) {
    ordinal += 1;
    candidate = `${base} ${romanNumeral(ordinal)}`;
  }
  return candidate;
}

/**
 * The payload for one declaration. Does not write the world.
 *
 * `name` is the faction name when the command passed one. Omitted, the
 * faction is "Free" plus the port name, with a roman suffix when that name
 * is already taken. A player command that omits the name passes nothing, so
 * it uses this same fallback. The garrison
 * follows only when the port is pressed and the stack is not empty.
 * Otherwise the event stores garrison 0. If the acting commander is leaving,
 * the replacement is the cover sort over the members who remain. When the
 * declarer is the command holder, the cover-sort successor stays, is left
 * out of `followerIds`, and the regency ends: `actingCommanderId` is null
 * because that cover has taken the seat. A holder with no successor is
 * refused before this runs.
 */
/**
 * A governor's declaration. `ownerId` on the payload is the governor, even
 * when the port's `ownerId` is still null. Stability on the payload is the
 * live port figure. Followers are the news list, already filtered.
 */
export function buildGovernorSecession(
  world: WorldState,
  settlement: Settlement,
  governor: Character,
  followerIds: readonly string[],
  pressed: boolean,
): SecessionDeclaredData {
  if (!settlement.factionId) throw new Error("A governor declaration requires a faction port");
  const previousFactionId = settlement.factionId;
  const previousActing = world.factions[previousFactionId]?.actingCommanderId ?? null;
  const holderId = commandHolderId(world, previousFactionId);
  const leaving = [governor.id, ...followerIds];
  const actingCommanderId = previousActing !== null && leaving.includes(previousActing)
    ? actingCoverId(world, previousFactionId, holderId, leaving)
    : previousActing;
  const garrisonFollowed = pressed && settlement.garrison > 0;
  return {
    previousFactionId,
    ownerId: governor.id,
    followerIds: [...followerIds],
    garrisonFollowed,
    garrison: garrisonFollowed ? settlement.garrison : 0,
    stability: settlement.stability,
    faction: {
      id: secessionFactionId(governor.id, settlement.id, world.tick),
      name: autonomousFactionName(world, settlement),
      color: SECESSION_FACTION_COLOR,
      treasury: 0,
      taxRate: SECESSION_FOUNDING_TAX_RATE,
    },
    previousActingCommanderId: previousActing,
    actingCommanderId,
    successorId: null,
  };
}

export function buildSecessionDeclaration(
  world: WorldState,
  settlement: Settlement,
  name?: string,
): SecessionDeclaredData {
  if (!settlement.factionId || !settlement.ownerId) {
    throw new Error("A secession declaration requires an owned faction port");
  }
  const owner = world.characters[settlement.ownerId];
  if (!owner) throw new Error("A secession declaration requires the owner");
  const previousFactionId = settlement.factionId;
  const pressed = settlementPressed(world, settlement, false);
  const successorId = secessionSuccessorId(world, settlement);
  if (commandHolderId(world, previousFactionId) === settlement.ownerId && successorId === null) {
    throw new Error("A command holder cannot leave a faction with no cover");
  }
  const followerIds = secessionFollowerIds(world, settlement, pressed)
    .filter((id) => id !== successorId);
  const garrisonFollowed = pressed && settlement.garrison > 0;
  const previousActing = world.factions[previousFactionId]?.actingCommanderId ?? null;
  const leaving = [settlement.ownerId, ...followerIds];
  const actingCommanderId = successorId !== null
    ? null
    : previousActing !== null && leaving.includes(previousActing)
      ? actingCoverId(world, previousFactionId, commandHolderId(world, previousFactionId), leaving)
      : previousActing;
  return {
    previousFactionId,
    ownerId: settlement.ownerId,
    followerIds,
    garrisonFollowed,
    garrison: garrisonFollowed ? settlement.garrison : 0,
    stability: settlement.stability,
    faction: {
      id: secessionFactionId(settlement.ownerId, settlement.id, world.tick),
      name: name ?? autonomousFactionName(world, settlement),
      color: SECESSION_FACTION_COLOR,
      treasury: 0,
      taxRate: SECESSION_FOUNDING_TAX_RATE,
    },
    previousActingCommanderId: previousActing,
    actingCommanderId,
    successorId,
  };
}

/**
 * Section 6's autonomous gate for one port. Does not write the world.
 *
 * The owner gate in section 2 must pass, and the owner must not be the
 * command holder. The controller is autonomous: a human owner is not declared
 * here, in a live session or a headless run. A secession route is open (tax above 0.15,
 * broken promises or earned grievance; `secessionRoutes`) and stability is at or below 55. A declaration already recorded for this
 * owner on this spell does not fire again. No draw.
 */
export function autonomousSecessionReady(world: WorldState, settlement: Settlement, liveSession = false): boolean {
  if (!ownerGatePasses(world, settlement) || !settlement.ownerId || !settlement.factionId) return false;
  const owner = world.characters[settlement.ownerId];
  if (!owner) return false;
  // "An autonomous owner declares." A human controller is the player's character,
  // so a live session and a headless run both skip one. The live-session check
  // is the leader-tax shape, kept because that is the rule when a note is silent.
  if (liveSession && owner.controller.kind === "human") return false;
  if (owner.controller.kind !== "autonomous") return false;
  if (commandHolderId(world, settlement.factionId) === owner.id) return false;
  if (secessionRoutes(world, settlement, owner).length === 0) return false;
  if (!(settlement.stability <= CLAIM_STABILITY_FLOOR)) return false;
  if (settlement.secessionDeclaredBy === owner.id) return false;
  return true;
}

/**
 * Secession routes (docs/design/secession-routes.md §4, §5.4, §5.5). Each
 * route replaces only the tax term of the autonomous gate; every other gate
 * (seated autonomous governor, anchored, same faction, not the holder,
 * stability ≤ 55, once per spell) stays. Reads existing state only; no draw.
 *  - tax: holding rate above 0.15 (the original line);
 *  - promise (B): ≥ 10 breached contracts to the port observed in the last 240 ticks, any cause;
 *  - hated (C): the governor's grievance at the holder or acting commander, earned since
 *    setup, ≥ 0.12. The starting grievance is read from the rebuilt setup world for
 *    the seed (cached per seed, the `desertion.ts` forkSeed pattern), so no state is added;
 *    a relationship absent at setup starts at 0;
 *  - last-port exemption: a declaration with no tax term never takes its faction's only held port.
 */
export const PROMISE_BREACH_COUNT = 10;
export const PROMISE_WINDOW_TICKS = 240;
export const HATED_GRIEVANCE = 0.12;
export type SecessionRoute = "tax" | "promise" | "hated";

const setupGrievances = new Map<number, Map<string, number>>();
export function startingGrievance(seed: number, fromId: string, toId: string): number {
  let table = setupGrievances.get(seed);
  if (!table) {
    table = new Map();
    for (const character of Object.values(createPrototypeWorld(seed).characters)) {
      for (const [otherId, relationship] of Object.entries(character.relationships)) table.set(`${character.id}>${otherId}`, relationship.grievance);
    }
    setupGrievances.set(seed, table);
  }
  return table.get(`${fromId}>${toId}`) ?? 0;
}

export function secessionRoutes(world: WorldState, settlement: Settlement, governor: Character): SecessionRoute[] {
  if (!settlement.factionId) return [];
  const routes: SecessionRoute[] = [];
  if ((world.factions[settlement.factionId]?.taxRate ?? 0) > TAX_DRIFT_THRESHOLD) routes.push("tax");
  const since = world.tick - PROMISE_WINDOW_TICKS;
  let breaches = 0;
  for (const contract of Object.values(world.contracts ?? {})) {
    if (contract.status === "breached" && contract.destinationId === settlement.id && (contract.observedTick ?? -Infinity) > since) breaches += 1;
  }
  if (breaches >= PROMISE_BREACH_COUNT) routes.push("promise");
  const holderId = commandHolderId(world, settlement.factionId);
  const actingId = world.factions[settlement.factionId]?.actingCommanderId ?? null;
  const earned = (id: string | null) => (id ? (governor.relationships[id]?.grievance ?? 0) - startingGrievance(world.seed, governor.id, id) : 0);
  if (Math.max(earned(holderId), earned(actingId)) >= HATED_GRIEVANCE) routes.push("hated");
  if (!routes.includes("tax") && routes.length > 0) {
    const held = Object.values(world.settlements).filter((other) => other.factionId === settlement.factionId).length;
    if (held <= 1) return [];
  }
  return routes;
}

/** Read who would leave. Does not write the world. */
export function secessionReadout(world: WorldState, settlement: Settlement): SecessionReadout {
  const livePressed = settlementPressed(world, settlement, false);
  const openPressed = settlementPressed(world, settlement, true);
  return {
    ownerId: settlement.ownerId,
    ownerGate: ownerGatePasses(world, settlement),
    followerCount: countFollowers(world, settlement, livePressed),
    garrisonFollows: garrisonReading(settlement.garrison, livePressed),
    taxOpen: {
      followerCount: countFollowers(world, settlement, openPressed),
      garrisonFollows: garrisonReading(settlement.garrison, openPressed),
    },
  };
}
