import { actionKind, dynamismReadout, entropyBits } from "./dynamism.ts";
import type { SimEvent } from "../sim/types.ts";

/**
 * Lead gate additions for the action picker (applied offline and live), each
 * seed against flag off at 1,200 ticks:
 *  - holderEntropyUp: the holder's action entropy exceeds flag off on every seed;
 *  - world metrics (secessions, port ownership changes, captures): no seed at 0
 *    where flag off has some, and not below flag off on every seed (systematic);
 *  - workShare: the holder's share of `work` decisions within ±WORK_SHARE_TOLERANCE
 *    relative of flag off, with an absolute floor of WORK_SHARE_FLOOR (a 2.7% baseline
 *    share would otherwise allow less than one point of movement).
 */
export const WORK_SHARE_TOLERANCE = 0.3;
export const WORK_SHARE_FLOOR = 0.05;
export const GATE_METRICS = ["secessions", "portOwnershipChanges", "captures"] as const;

export interface SeedGate {
  seed: number;
  holderEntropy: { run: number; baseline: number; up: boolean };
  metrics: Record<string, { run: number; baseline: number; zeroWhereBaselineHas: boolean; below: boolean }>;
  workShare: { run: number; baseline: number; ratio: number | null; ok: boolean };
  overrides: { consults: number; offScorer: number; rate: number };
}

export interface PickerGate { seeds: SeedGate[]; checks: Record<string, boolean>; pass: boolean }

function holderEntropy(events: readonly SimEvent[], holder: string): number {
  // Same measure as the readout (entropy of the holder's decision kinds), with no minimum-decisions filter.
  const counts = new Map<string, number>();
  for (const e of events) if (e.type === "decision-made" && e.actorId === holder) counts.set(actionKind(e), (counts.get(actionKind(e)) ?? 0) + 1);
  return Math.round(entropyBits(counts.values()) * 1e4) / 1e4;
}
function workShare(events: readonly SimEvent[], holder: string): number {
  let all = 0; let work = 0;
  for (const e of events) if (e.type === "decision-made" && e.actorId === holder) { all += 1; if (e.data.goal === "work") work += 1; }
  return all === 0 ? 0 : work / all;
}

export function seedGate(seed: number, run: readonly SimEvent[], baseline: readonly SimEvent[], holder = "character-14"): SeedGate {
  const r = dynamismReadout(run).totals as unknown as Record<string, number>;
  const b = dynamismReadout(baseline).totals as unknown as Record<string, number>;
  const metrics: SeedGate["metrics"] = {};
  for (const m of GATE_METRICS) metrics[m] = { run: r[m], baseline: b[m], zeroWhereBaselineHas: r[m] === 0 && b[m] > 0, below: r[m] < b[m] };
  const he = { run: holderEntropy(run, holder), baseline: holderEntropy(baseline, holder), up: false };
  he.up = he.run > he.baseline;
  const ws = workShare(run, holder); const wb = workShare(baseline, holder);
  const ratio = wb > 0 ? ws / wb : null;
  const records = run.filter((e) => e.type === "decision-made" && (e.data as { ai?: { picker?: { sampled: string; scorerPick: string } } }).ai?.picker)
    .map((e) => (e.data as { ai: { picker: { sampled: string; scorerPick: string } } }).ai.picker);
  const off = records.filter((p) => p.sampled !== p.scorerPick).length;
  return {
    seed, holderEntropy: he, metrics,
    workShare: { run: Math.round(ws * 1e4) / 1e4, baseline: Math.round(wb * 1e4) / 1e4, ratio: ratio === null ? null : Math.round(ratio * 1e4) / 1e4,
      ok: Math.abs(ws - wb) <= Math.max(WORK_SHARE_TOLERANCE * wb, WORK_SHARE_FLOOR) },
    overrides: { consults: records.length, offScorer: off, rate: records.length ? Math.round((off / records.length) * 1e4) / 1e4 : 0 },
  };
}

export function pickerGate(seeds: SeedGate[]): PickerGate {
  const checks: Record<string, boolean> = { holderEntropyUpAllSeeds: seeds.every((s) => s.holderEntropy.up) };
  for (const m of GATE_METRICS) {
    checks[`${m}NoZeroWhereBaselineHas`] = seeds.every((s) => !s.metrics[m].zeroWhereBaselineHas);
    checks[`${m}NotSystematicallyBelow`] = !(seeds.length > 1 && seeds.every((s) => s.metrics[m].below));
  }
  checks.workShareWithin30pct = seeds.every((s) => s.workShare.ok);
  return { seeds, checks, pass: Object.values(checks).every(Boolean) };
}
