import { startingGrievance } from "./secession.ts";
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
/** occupation.md §9.4 / §10.1: min(1, breaches / 4). */
export const OCCUPATION_CONDUCT_SCALE = 4;
/** occupation.md §9.3 / §10.1: earned grievance at the owner saturates at 0.075 (p90 of the non-zero readings). */
export const OCCUPATION_GRIEVANCE_SCALE = 0.075;
/** occupation.md §10.1 ruling 3: the food baseline is the mean post-upkeep provisions/demand over the 20 ticks before the capture. */
export const OCCUPATION_FOOD_BASELINE_TICKS = 20;
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
  /** Last tick with a provisions shortage at the port while occupied, or null (kept for the record; food reads `foodBaseline`). */
  lastShortageTick: number | null;
  /** occupation.md §10.1 ruling 3: the port's mean post-upkeep provisions/demand over the 20 ticks before the capture. */
  foodBaseline?: number;
}

/** Flag on only: the port's [tick, provisions/demand] after each upkeep, last 20 ticks (event-sourced from `settlement-upkeep.foodRatio`). */
export function trimFoodRatios(ratios: Array<[number, number]>, tick: number): Array<[number, number]> {
  return ratios.filter(([t]) => t >= tick - OCCUPATION_FOOD_BASELINE_TICKS);
}
/** Mean post-upkeep provisions/demand over the 20 ticks before `tick` (0 with no history). */
export function foodBaseline(settlement: Settlement, tick: number): number {
  const window = (settlement.foodRatios ?? []).filter(([t]) => t >= tick - OCCUPATION_FOOD_BASELINE_TICKS && t < tick);
  return window.length ? window.reduce((sum, [, r]) => sum + r, 0) / window.length : 0;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

export function occupationTerms(world: WorldState, settlement: Settlement, occupation: OccupationRecord, shortageNow: boolean, provisionsAfter: number, demand: number) {
  const holderRate = settlement.factionId ? world.factions[settlement.factionId]?.taxRate ?? 0 : 0;
  const tax = clamp01((holderRate - occupation.fromRate) / OCCUPATION_TAX_SCALE);
  const lastShort = shortageNow ? world.tick : occupation.lastShortageTick;
  // §10.1 ruling 3: food against the port's own pre-capture level, max(0, baseline − current ratio), clamped to ≤ 1.
  const food = r4(clamp01((occupation.foodBaseline ?? 0) - provisionsAfter / demand));
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
      residents = 0.5 * Math.min(1, docked.length / OCCUPATION_RESIDENTS_SCALE) + 0.5 * Math.min(1, earned / OCCUPATION_GRIEVANCE_SCALE);
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
