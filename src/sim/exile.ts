import { commandHolderId } from "./state.ts";
import type { Character, WorldState } from "./types.ts";

/**
 * Exile recovery, step 2 (next-dynamic-slice.md, revised slice A item 2): the
 * per-captain home-port claim. Motivation, not a balance bonus (Lead ruling 2):
 * a captain holds a claim on port P when they served at P while their faction
 * held it (`homeService`) and now believe another faction holds it. Read-only;
 * no draw. Only behind the EXILE_RECOVERY flag.
 *
 *   w = (0.5·loyalty + 0.3·aggression + 0.2·ambition − 0.3·caution)
 *       × (1 + grievance(captain → current holder))
 *       × 0.5^((tick − last served) / 240)
 *
 * Zero when the trait term is ≤ 0 or the captain never served at P.
 * Grievance is the existing relationship value (as secession route C reads it,
 * secession.ts), toward the holding faction's command holder or the port's
 * owner, whichever is larger, floored at 0.
 */
export const HOME_CLAIM_TRAITS = { loyalty: 0.5, aggression: 0.3, ambition: 0.2, caution: -0.3 } as const;
/** Tunable default: half-life in ticks since the captain last served at the port. */
export const HOME_CLAIM_HALF_LIFE_TICKS = 240;
export const HOME_CLAIM_RAID_POINTS = 40;
export const HOME_CLAIM_TRAVEL_POINTS = 20;

export interface HomeClaim { weight: number; holderFactionId: string | null; servedTick: number }

export function homeClaim(world: WorldState, character: Character, settlementId: string): HomeClaim | null {
  const served = character.homeService?.[settlementId];
  if (served === undefined || !character.factionId) return null;
  const believed = character.knowledge[settlementId]?.factionId ?? null;
  if (believed === character.factionId) return null;
  const p = character.personality;
  const traits = HOME_CLAIM_TRAITS.loyalty * p.loyalty + HOME_CLAIM_TRAITS.aggression * p.aggression + HOME_CLAIM_TRAITS.ambition * p.ambition + HOME_CLAIM_TRAITS.caution * p.caution;
  if (!(traits > 0)) return null;
  const holderId = believed && world.factions[believed] ? commandHolderId(world, believed) : null;
  const ownerId = world.settlements[settlementId]?.ownerId ?? null;
  const grievance = Math.max(0,
    holderId ? character.relationships[holderId]?.grievance ?? 0 : 0,
    ownerId ? character.relationships[ownerId]?.grievance ?? 0 : 0);
  const decay = Math.pow(0.5, Math.max(0, world.tick - served) / HOME_CLAIM_HALF_LIFE_TICKS);
  const weight = traits * (1 + grievance) * decay;
  return weight > 0 ? { weight, holderFactionId: believed, servedTick: served } : null;
}

export function homeClaimReason(world: WorldState, settlementId: string, claim: HomeClaim): string {
  const port = world.settlements[settlementId]?.name ?? settlementId;
  const holder = claim.holderFactionId ? world.factions[claim.holderFactionId]?.name ?? claim.holderFactionId : "no one";
  return `to win back ${port}, lost to ${holder}`;
}
