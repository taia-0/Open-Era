// Prototype retention for state-prune.md. Not imported by src.
// The measured hook prunes only closed, settled supply contracts older than
// PROMISE_WINDOW_TICKS (240). Other rules below were tried and are not applied:
//   news/carriedNews at 180 re-posts a dropped item on arrival (news-posted differs).
//   closed standing orders at 180 change commandHolderId (state.ts:310-322) and
//   post-battle "under standing orders" (engine.ts:1123), which moves decisions.
import type { WorldState } from "../../../src/sim/types.ts";

/** secession.ts:449 PROMISE_WINDOW_TICKS and occupation.ts:22/58 OCCUPATION_INTEGRATION_TICKS; feed-reasons.ts:157. */
export const CLOSED_CONTRACT_RETAIN_TICKS = 240;
/** view-model.ts:87 CHECK_IN_TICKS. Not applied in this prototype (see file header). */
export const NEWS_RETAIN_TICKS = 180;
export const CLOSED_ORDER_RETAIN_TICKS = 180;
/** alliances.ts:11 ALLIANCE_RAID_WINDOW. Not applied in this prototype. */
export const RAID_RETAIN_TICKS = 152;

const OPEN_CONTRACT = new Set(["offered", "accepted"]);

/**
 * Deterministic, end-of-tick prune. Call after every `runTick` and after each
 * replayed `tick-advanced`, so replay stays exact on the pruned world.
 * Does not emit events. On the measured seeds this is event-identical to the
 * unpruned run (same event count, types, and payloads) and hash-moving.
 */
export function pruneWorld(world: WorldState): void {
  const tick = world.tick;
  if (!world.contracts) return;
  const next: typeof world.contracts = {};
  for (const [id, contract] of Object.entries(world.contracts)) {
    const live = OPEN_CONTRACT.has(contract.status) || !contract.settled || tick - contract.observedTick <= CLOSED_CONTRACT_RETAIN_TICKS;
    if (live) next[id] = contract;
  }
  if (Object.keys(next).length === 0) delete world.contracts;
  else world.contracts = next;
}

export function ledgerSizes(world: WorldState): {
  contracts: number;
  news: number;
  carriedNews: number;
  standingOrders: number;
  allianceRaids: number;
  scheduledReplies: number;
} {
  return {
    contracts: Object.keys(world.contracts ?? {}).length,
    news: Object.values(world.settlements).reduce((n, s) => n + (s.news ?? []).length, 0),
    carriedNews: Object.values(world.characters).reduce((n, c) => n + (c.carriedNews ?? []).length, 0),
    standingOrders: Object.values(world.characters).reduce((n, c) => n + c.standingOrders.length, 0),
    allianceRaids: Object.keys(world.allianceRaids ?? {}).length,
    scheduledReplies: world.scheduledReplies.length,
  };
}
