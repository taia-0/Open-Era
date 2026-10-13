import { provisionDemand } from "./engine.ts";
import { commandHolderId, CLAIM_STABILITY_FLOOR, round } from "./state.ts";
import { TAX_DRIFT_THRESHOLD } from "./tax-rate.ts";
import type { Character, Settlement, WorldState } from "./types.ts";

/**
 * Loyalty below this follows a declaration. It is the floor of the officer
 * band in `personalityFor`. The sum is the one the cover sort reads.
 */
export const SECESSION_LOYALTY_LINE = 0.75;

/**
 * What a declaration would do to one port, read from the world as it is.
 *
 * Nothing here writes the world or an event, and nothing draws. Slice 1 is
 * this readout. The command and the autonomous walker are later slices.
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
