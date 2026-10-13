import { spendRole } from "./allowance.ts";
import { applyEvent, commandHolderId } from "./state.ts";
import type { Character, SimEvent, WorldState } from "./types.ts";

/**
 * Governor levy of 0.05. The seat is the offices rule, kept beside the run
 * and left off the hashed world. A breakaway, and a captive holder, appoint
 * nobody. Captivity does not clear a seat that is already filled.
 */
export const GOVERNOR_LEVY_RATE = 0.05;

interface Seat {
  characterId: string;
  factionId: string;
}

interface Memory {
  seats: Map<string, Seat>;
  /** Settlements seated when this tick began. Null between ticks. */
  levySettlements: Set<string> | null;
}

const memories = new WeakMap<WorldState, Memory>();

function memory(world: WorldState): Memory {
  let found = memories.get(world);
  if (!found) {
    found = { seats: new Map(), levySettlements: null };
    memories.set(world, found);
  }
  return found;
}

function scarredLoyalty(character: Character): number {
  return character.personality.loyalty + (character.loyaltyAdjustment ?? 0);
}

function coverScore(character: Character): number {
  return character.skills.leadership + scarredLoyalty(character) * 50;
}

/**
 * One governor for a port, or null when nobody eligible is anchored.
 * No draw. The command holder is not eligible.
 */
function appointGovernor(world: WorldState, settlementId: string, factionId: string): string | null {
  const holderId = commandHolderId(world, factionId);
  const ranked = Object.values(world.characters)
    .filter((character) =>
      character.factionId === factionId &&
      character.locationId === settlementId &&
      character.travel === null &&
      character.captivity === null &&
      character.id !== holderId,
    )
    .sort((left, right) => coverScore(right) - coverScore(left) || left.id.localeCompare(right.id));
  return ranked[0]?.id ?? null;
}

function syncSeats(world: WorldState, seats: Map<string, Seat>): void {
  const settlements = Object.values(world.settlements).sort((left, right) => left.id.localeCompare(right.id));
  for (const settlement of settlements) {
    const seat = seats.get(settlement.id);
    if (seat) {
      const governor = world.characters[seat.characterId];
      const factionChanged = settlement.factionId !== seat.factionId;
      const leftFaction = !governor || governor.factionId !== seat.factionId;
      const becameHolder = commandHolderId(world, seat.factionId) === seat.characterId;
      if (factionChanged || leftFaction || becameHolder) seats.delete(settlement.id);
    }
    if (seats.has(settlement.id) || !settlement.factionId) continue;
    const holderId = commandHolderId(world, settlement.factionId);
    if (!holderId) continue;
    const holder = world.characters[holderId];
    if (!holder || spendRole(world, holder) !== "holder") continue;
    const chosen = appointGovernor(world, settlement.id, settlement.factionId);
    if (!chosen) continue;
    seats.set(settlement.id, { characterId: chosen, factionId: settlement.factionId });
  }
}

/** Fill and clear seats from the world as it is now. Does not write the world. */
export function syncGovernorSeats(world: WorldState): void {
  syncSeats(world, memory(world).seats);
}

/**
 * Call at the start of a tick, before work and sales.
 * The levy set is the seats after this sync, and it stays for the whole tick.
 */
export function beginGovernorLevy(world: WorldState): void {
  const found = memory(world);
  syncSeats(world, found.seats);
  found.levySettlements = new Set(found.seats.keys());
}

/** Call when the tick's events are done, so a later quote previews the next tick. */
export function endGovernorLevy(world: WorldState): void {
  memory(world).levySettlements = null;
}

/**
 * 0.05 while this settlement's seat was filled at the start of the tick.
 * Between ticks, the figure is the seat the next tick would open with.
 */
export function governorLevyRate(world: WorldState, settlementId: string): number {
  const found = memory(world);
  if (found.levySettlements) {
    return found.levySettlements.has(settlementId) ? GOVERNOR_LEVY_RATE : 0;
  }
  const preview = new Map(found.seats);
  syncSeats(world, preview);
  return preview.has(settlementId) ? GOVERNOR_LEVY_RATE : 0;
}

/** The governor the offices rule would name for the next tick, or null. */
export function governorId(world: WorldState, settlementId: string): string | null {
  const found = memory(world);
  if (found.levySettlements) return found.seats.get(settlementId)?.characterId ?? null;
  const preview = new Map(found.seats);
  syncSeats(world, preview);
  return preview.get(settlementId)?.characterId ?? null;
}

/** Move the seat memory onto a world rebuilt by replay. The hash does not see it. */
export function transplantGovernorSeats(from: WorldState, to: WorldState): void {
  const source = memory(from);
  memories.set(to, {
    seats: new Map(source.seats),
    levySettlements: null,
  });
}

/**
 * Replay the offices rule beside an event log.
 *
 * Sync once on the opening world, then again after each `tick-advanced`,
 * which is the start of the next tick. The seat is not an event and not a field.
 */
export function replayGovernorSeats(world: WorldState, events: readonly SimEvent[]): void {
  syncGovernorSeats(world);
  for (const event of events) {
    applyEvent(world, event);
    if (event.type === "tick-advanced") syncGovernorSeats(world);
  }
}
