import { dynamismReadout, firstDivergentTick } from "./dynamism.ts";
import { loyaltyDriven, type SocialReadRecord } from "../sim/ai-social.ts";
import type { SimEvent } from "../sim/types.ts";

/**
 * Slice 4 gate (docs/design/jev-social-picker.md §11 items 4, 6–8), fixed
 * before any live result. Thresholds are the spec's flag-off figures.
 */
export const SOCIAL_MEMBERS = Array.from({ length: 9 }, (_, i) => `character-${14 + i}`);
export const SOCIAL_ENTROPY_FLOOR: Record<number, number> = { 1847: 1.8683, 2718: 1.7446, 4096: 1.9165 };
export const SOCIAL_CALL_CAP = 8000;
export const SOCIAL_SPEND_CAP_USD = 0.35;

interface PickLike { sampled: string; scorerPick: string; legal: string[] }

/** The `--ai` summary (§11 item 7): picks, reads and loyalty-driven picks, counted from `data.ai`. */
export function aiSummary(events: readonly SimEvent[]) {
  const last = new Map<string, SocialReadRecord["loyalty"]>();
  let picks = 0; let offScorer = 0; let reads = 0; let hits = 0; let readFallbacks = 0; let withoutRead = 0; let railBreaks = 0; let loyaltyPicks = 0;
  const byActor: Record<string, { picks: number; loyaltyDriven: number }> = {};
  for (const e of events) {
    if (e.type !== "decision-made") continue;
    const ai = (e.data as { ai?: { picker?: PickLike; read?: SocialReadRecord } }).ai;
    if (!ai?.picker) continue;
    const p = ai.picker; const actor = e.actorId ?? "";
    picks += 1; if (p.sampled !== p.scorerPick) offScorer += 1; if (!p.legal.includes(p.sampled)) railBreaks += 1;
    const row = (byActor[actor] ??= { picks: 0, loyaltyDriven: 0 }); row.picks += 1;
    const r = ai.read;
    if (!r) { withoutRead += 1; continue; }
    reads += 1;
    if (r.hit) hits += 1;
    else { if (r.outcome !== "model") readFallbacks += 1; last.set(actor, r.outcome === "model" ? r.loyalty ?? null : null); }
    const loyalty = r.hit ? last.get(actor) : (r.outcome === "model" ? r.loyalty : null);
    if (loyaltyDriven(p, loyalty ? { loyalty, grudges: [], readTick: 0, readInputHash: "" } : null)) { loyaltyPicks += 1; row.loyaltyDriven += 1; }
  }
  return { picks, offScorer, reads, readHits: hits, readMisses: reads - hits, readFallbacks, picksWithoutRead: withoutRead, railBreaks, loyaltyDrivenPicks: loyaltyPicks, byActor };
}

export function memberEntropy(events: readonly SimEvent[]): number {
  const actors = dynamismReadout(events).actionVariety.actors.filter((a) => SOCIAL_MEMBERS.includes(a.actorId));
  return actors.length ? Math.round((actors.reduce((sum, a) => sum + a.entropyBits, 0) / actors.length) * 1e4) / 1e4 : 0;
}

export interface SocialSeedGate {
  seed: number;
  memberEntropy: { run: number; baseline: number; floor: number; up: boolean };
  firstDivergentTick: number | null;
  desertions: { run: number; baseline: number };
  secessions: { run: number; baseline: number };
  ai: ReturnType<typeof aiSummary>;
  run?: { calls: number; spendUsd: number; costLines: number };
}

export function socialSeedGate(seed: number, run: readonly SimEvent[], baseline: readonly SimEvent[], summary?: { calls: number; spendUsd: number; costLines: number }): SocialSeedGate {
  const r = dynamismReadout(run).totals; const b = dynamismReadout(baseline).totals;
  const floor = SOCIAL_ENTROPY_FLOOR[seed] ?? memberEntropy(baseline);
  const entropy = memberEntropy(run);
  return {
    seed, memberEntropy: { run: entropy, baseline: memberEntropy(baseline), floor, up: entropy > floor },
    firstDivergentTick: firstDivergentTick(run, baseline),
    desertions: { run: r.desertions, baseline: b.desertions }, secessions: { run: r.secessions, baseline: b.secessions },
    ai: aiSummary(run), ...(summary ? { run: { calls: summary.calls, spendUsd: summary.spendUsd, costLines: summary.costLines } } : {}),
  };
}

export function socialGate(seeds: SocialSeedGate[], live: boolean) {
  const checks: Record<string, boolean> = {
    noRailBreaksOrUnreadPicks: seeds.every((s) => s.ai.railBreaks === 0 && s.ai.picksWithoutRead === 0),
    memberEntropyUpAllSeeds: seeds.every((s) => s.memberEntropy.up),
    firstDivergentTickAllSeeds: seeds.every((s) => s.firstDivergentTick !== null),
    desertionsOrSecessionsDifferOneSeed: seeds.some((s) => s.desertions.run !== s.desertions.baseline || s.secessions.run !== s.secessions.baseline),
    loyaltyDrivenPicksAllSeeds: seeds.every((s) => s.ai.loyaltyDrivenPicks > 0),
  };
  if (live) {
    checks.callCap = seeds.every((s) => !!s.run && s.run.calls <= SOCIAL_CALL_CAP);
    checks.spendCap = seeds.every((s) => !!s.run && s.run.spendUsd <= SOCIAL_SPEND_CAP_USD);
    checks.oneCostLinePerCall = seeds.every((s) => !!s.run && s.run.costLines === s.run.calls);
  }
  return { seeds, checks, pass: Object.values(checks).every(Boolean) };
}
