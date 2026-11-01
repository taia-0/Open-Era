import { HATED_GRIEVANCE, startingGrievance } from "./secession.ts";
import type { Settlement, WorldState } from "./types.ts";

/**
 * Occupation and the population's response after conquest (docs/design/occupation.md),
 * behind the OCCUPATION flag (default off). Deterministic: no roll, no RNG draw, existing state only.
 * With the flag off nothing here runs and `Settlement.occupation` never exists.
 */
export const OCCUPATION_DEFAULT = false;
export const OCCUPATION_WEIGHTS = { tax: 0.35, food: 0.25, conduct: 0.20, residents: 0.20 } as const;
export const OCCUPATION_TAX_SCALE = 0.10;
export const OCCUPATION_DRIFT = 0.10;
export const OCCUPATION_REGROWTH_STOP = 0.5;
export const OCCUPATION_FOOD_WINDOW = 24;
export const OCCUPATION_CONDUCT_SCALE = 10;
export const OCCUPATION_RESIDENTS_SCALE = 3;
/** = PROMISE_WINDOW_TICKS (240); a literal, because secession.ts and engine.ts import each other. */
export const OCCUPATION_INTEGRATION_TICKS = 240;
export const OCCUPATION_INTEGRATION_H = 0.25;

export interface OccupationRecord {
  tick: number;
  fromFactionId: string | null;
  byFactionId: string | null;
  fromRate: number;
  /** Latest harshness, from the last upkeep (0 at the claim). */
  harshness: number;
  /** Last tick with a provisions shortage at the port while occupied, or null. */
  lastShortageTick: number | null;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

export function occupationTerms(world: WorldState, settlement: Settlement, occupation: OccupationRecord, shortageNow: boolean) {
  const holderRate = settlement.factionId ? world.factions[settlement.factionId]?.taxRate ?? 0 : 0;
  const tax = clamp01((holderRate - occupation.fromRate) / OCCUPATION_TAX_SCALE);
  const lastShort = shortageNow ? world.tick : occupation.lastShortageTick;
  const food = lastShort !== null && world.tick - lastShort < OCCUPATION_FOOD_WINDOW ? 1 : 0;
  const since = world.tick - OCCUPATION_INTEGRATION_TICKS;
  let breaches = 0;
  for (const contract of Object.values(world.contracts ?? {})) {
    if (contract.status === "breached" && contract.destinationId === settlement.id && (contract.observedTick ?? -Infinity) > since) breaches += 1;
  }
  const conduct = Math.min(1, breaches / OCCUPATION_CONDUCT_SCALE);
  // Residents: previous-faction members docked here (ruling 2: unaffiliated residents do not count),
  // and their mean earned grievance at the port's owner (route C's rule).
  let residents = 0;
  if (occupation.fromFactionId) {
    const docked = Object.values(world.characters).filter((c) => !c.dead && c.factionId === occupation.fromFactionId && c.locationId === settlement.id && !c.travel)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (docked.length) {
      const owner = settlement.ownerId;
      const earned = owner ? docked.reduce((sum, c) => sum + Math.max(0, (c.relationships[owner]?.grievance ?? 0) - startingGrievance(world.seed, c.id, owner)), 0) / docked.length : 0;
      residents = 0.5 * Math.min(1, docked.length / OCCUPATION_RESIDENTS_SCALE) + 0.5 * Math.min(1, earned / HATED_GRIEVANCE);
    }
  }
  const w = OCCUPATION_WEIGHTS;
  const harshness = r4(clamp01(w.tax * tax + w.food * food + w.conduct * conduct + w.residents * residents));
  return { tax: r4(tax), food, conduct: r4(conduct), residents: r4(residents), harshness, lastShortageTick: lastShort };
}

/** Effect 3: soldiers who leave an occupied garrison when the previous faction attacks. */
export function occupationDefectors(settlement: Settlement, attackerFactionId: string | null): number {
  const occupation = settlement.occupation;
  if (!occupation || !attackerFactionId || attackerFactionId !== occupation.fromFactionId || occupation.harshness <= 0) return 0;
  return Math.floor((settlement.garrison * occupation.harshness) / 2);
}
