import { provisionDemand } from "./engine.ts";
import { actingCoverId, commandHolderId, CLAIM_STABILITY_FLOOR, round } from "./state.ts";
import { TAX_DRIFT_THRESHOLD } from "./tax-rate.ts";
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
 * payload from this same reading. Nothing here draws. There is no autonomous
 * caller.
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

/**
 * The payload for one declaration. Does not write the world.
 *
 * `name` is the faction name when the command passed one. Omitted, the
 * owner's name is used. The garrison follows only when the port is pressed
 * and the stack is not empty. Otherwise the event stores garrison 0.
 * If the acting commander is leaving, the replacement is the cover sort
 * over the members who remain. When the declarer is the command holder, the
 * cover-sort successor stays, is left out of `followerIds`, and the regency
 * ends: `actingCommanderId` is null because that cover has taken the seat.
 * A holder with no successor is refused before this runs.
 */
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
      name: name ?? owner.name,
      color: SECESSION_FACTION_COLOR,
      treasury: 0,
      taxRate: SECESSION_FOUNDING_TAX_RATE,
    },
    previousActingCommanderId: previousActing,
    actingCommanderId,
    successorId,
  };
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
