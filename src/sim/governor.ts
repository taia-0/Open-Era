import { freeMateCount, spendRole } from "./allowance.ts";
import { commandHolderId, round } from "./state.ts";
import type { Character, WorldState } from "./types.ts";

/**
 * Port governor. The seat is the offices rule, kept beside the run and left
 * off the hashed world. A breakaway, and a captive holder, appoint nobody.
 * Captivity does not clear a seat that is already filled.
 *
 * Storing `governorId` would move tick 0. The stipend and the levy are what
 * move coins. The levy reads the seats filled at the start of the tick.
 */

/** Taken from work gross and sale gross while the dock was seated. */
export const GOVERNOR_LEVY_RATE = 0.05;

/** One day of passage, the same 18 the mate allowance already uses. */
const STIPEND = 18;

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
    if (settlement.factionId.startsWith("secession-")) continue;
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
 * Call after the morning seat sync, before work and sales.
 * The levy set stays for the whole tick.
 */
export function beginGovernorLevy(world: WorldState): void {
  const found = memory(world);
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
  if (found.levySettlements) return found.levySettlements.has(settlementId) ? GOVERNOR_LEVY_RATE : 0;
  const preview = new Map(found.seats);
  syncSeats(world, preview);
  return preview.has(settlementId) ? GOVERNOR_LEVY_RATE : 0;
}

/**
 * The seated governor. During a tick this is the seat the levy froze.
 * Between ticks it is the seat the next tick would open with.
 */
export function governorId(world: WorldState, settlementId: string): string | null {
  const found = memory(world);
  if (found.levySettlements) return found.seats.get(settlementId)?.characterId ?? null;
  const preview = new Map(found.seats);
  syncSeats(world, preview);
  return preview.get(settlementId)?.characterId ?? null;
}

/**
 * Morning stipend. `seats × 18` from the treasury into the governors' purses,
 * and only when the treasury covers 18 for every free mate and every seat.
 * A morning that cannot pay leaves both purses where they are. No event.
 */
export function payGovernorStipends(world: WorldState): void {
  if (world.ticksPerDay <= 0 || world.tick % world.ticksPerDay !== 0) return;
  const byFaction = new Map<string, Seat[]>();
  for (const seat of memory(world).seats.values()) {
    const list = byFaction.get(seat.factionId) ?? [];
    list.push(seat);
    byFaction.set(seat.factionId, list);
  }
  for (const [factionId, seats] of byFaction) {
    const faction = world.factions[factionId];
    if (!faction || seats.length === 0) continue;
    const mates = freeMateCount(world, factionId);
    const treasuryCents = Math.round(faction.treasury * 100);
    const needCents = (mates + seats.length) * STIPEND * 100;
    if (treasuryCents < needCents) continue;
    const payCents = seats.length * STIPEND * 100;
    faction.treasury = round((treasuryCents - payCents) / 100, 2);
    const purses = new Map<string, number>();
    for (const seat of seats) purses.set(seat.characterId, (purses.get(seat.characterId) ?? 0) + STIPEND * 100);
    for (const [characterId, cents] of purses) {
      const governor = world.characters[characterId];
      if (!governor) continue;
      governor.money = round((Math.round(governor.money * 100) + cents) / 100, 2);
    }
  }
}

/** Move the seat memory onto a world rebuilt by replay. The hash does not see it. */
export function transplantGovernorSeats(from: WorldState, to: WorldState): void {
  const source = memory(from);
  memories.set(to, { seats: new Map(source.seats), levySettlements: null });
}
