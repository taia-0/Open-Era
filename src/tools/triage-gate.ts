import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dynamismReadout, firstDivergentTick } from "./dynamism.ts";
import { TRIAGE_BUDGET, TRIAGE_COOLDOWN_TICKS, TRIAGE_TESTS, TRIAGE_THRESHOLD, type BrainRecord, type TriageRecord } from "../sim/ai-triage.ts";
import { runTick } from "../sim/engine.ts";
import { createPrototypeWorld } from "../sim/scenario.ts";
import { stateHash } from "../sim/state.ts";
import type { SimEvent } from "../sim/types.ts";

/**
 * Slice 5 gate (docs/design/jev-triage.md §4.7), the checks exactly as listed:
 *  1. probe: precision and recall ≥ 0.75 per test at the threshold, and item 29 flags faction_number;
 *  2. flag off: the 72- and 1,200-tick pins are unchanged;
 *  3. a never-flag triage stub gives the picker-only hash (same stub picks);
 *  4. an always-flag stub: exactly min(50, eligible) escalations, cooldown respected,
 *     every brain choice legal or fallen back, zero rail breaks;
 *  5. replay exact with zero vendor calls;
 *  6. readout against picker-only: first divergent tick when an escalation changed `chosen`;
 *     holder entropy not below picker-only (proposed); escalations per test and the differ share reported;
 *  7. caps: ≤ 50 brain calls, ≤ $0.25 brain spend, one cost line per call, and `npm test` passes.
 */
export const PROBE_MIN = 0.75;
export const BRAIN_CALL_CAP = TRIAGE_BUDGET;
export const BRAIN_SPEND_CAP_USD = 0.25;
/** The current pins (the spec's §4.7 item 2 lists the older #144 pins; port balance #154 moved them). */
export const FLAG_OFF_PINS: Record<number, { t72: string; t1200: string }> = {
  1847: { t72: "66e8ccb7", t1200: "b51aa07a" },
  2718: { t72: "b4ccedab", t1200: "091f7628" },
  4096: { t72: "b04c5ac4", t1200: "25bdbf15" },
};
export const HOLDER = "character-14";

const jsonl = (path: string) => readFileSync(path, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

/** Check 1, from the recorded probe log (no new calls). */
export function probeCheck(dir: string, threshold = TRIAGE_THRESHOLD) {
  const set = new Map(jsonl(join(dir, "set.jsonl")).map((item: any) => [item.id, item.labels]));
  const log = jsonl(join(dir, "live-log-2026-10-31.jsonl"));
  const perTest: Record<string, { tp: number; fp: number; fn: number; tn: number; precision: number; recall: number; ok: boolean }> = {};
  for (const test of TRIAGE_TESTS) {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (const entry of log) {
      const label = set.get(entry.id)?.[test]; const noul = entry.response?.answers?.[test]?.noul;
      const flag = typeof noul === "number" && noul >= threshold;
      if (label && flag) tp++; else if (!label && flag) fp++; else if (label) fn++; else tn++;
    }
    const precision = tp + fp ? tp / (tp + fp) : 1; const recall = tp + fn ? tp / (tp + fn) : 1;
    perTest[test] = { tp, fp, fn, tn, precision: r4(precision), recall: r4(recall), ok: precision >= PROBE_MIN && recall >= PROBE_MIN };
  }
  const item29 = log.find((e: any) => e.id === "triage-29")?.response?.answers?.faction_number?.noul ?? null;
  return { threshold, perTest, item29FactionNumber: item29, pass: Object.values(perTest).every((t) => t.ok) && typeof item29 === "number" && item29 >= threshold };
}

/** Check 2: flag-off runs against the pins. */
export function flagOffCheck(seeds = [1847, 2718, 4096]) {
  const rows = seeds.map((seed) => {
    const world = createPrototypeWorld(seed);
    let t72 = "";
    for (let i = 0; i < 1200; i++) { runTick(world); if (world.tick === 72) t72 = stateHash(world).slice(0, 8); }
    const t1200 = stateHash(world).slice(0, 8);
    return { seed, t72, t1200, ok: t72 === FLAG_OFF_PINS[seed]?.t72 && t1200 === FLAG_OFF_PINS[seed]?.t1200 };
  });
  return { rows, pass: rows.every((r) => r.ok) };
}

interface RunDir { events: SimEvent[]; summary: any; cost: any[]; replay: any | null }
export function loadRun(dir: string): RunDir {
  const safe = (path: string) => { try { return readFileSync(path, "utf8"); } catch { return null; } };
  const replay = safe(join(dir, "replay", "replay.json"));
  const cost = safe(join(dir, "cost.jsonl"));
  return { events: jsonl(join(dir, "events.jsonl")), summary: JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")), cost: cost ? cost.split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [], replay: replay ? JSON.parse(replay) : null };
}

type Decided = { tick: number; actorId: string; chosen: string; legal: string[]; sampled: string; triage: TriageRecord; brain?: BrainRecord };
const key = (row: { action: string; targetId?: string; resource?: string }) => `${row.action}:${row.targetId ?? "-"}:${row.resource ?? "-"}`;
export function triaged(events: readonly SimEvent[]): Decided[] {
  const out: Decided[] = [];
  for (const e of events) {
    if (e.type !== "decision-made") continue;
    const ai = (e.data as any).ai; if (!ai?.triage) continue;
    out.push({ tick: e.tick, actorId: e.actorId!, chosen: key((e.data as any).chosen), legal: ai.picker.legal, sampled: ai.picker.sampled, triage: ai.triage, brain: ai.brain });
  }
  return out;
}

/** Check 4 helpers: eligible = flagged decisions off cooldown, recomputed from the events; the budget then caps. */
export function escalationCheck(events: readonly SimEvent[]) {
  const rows = triaged(events);
  const last = new Map<string, number>(); let eligible = 0; let expected = 0; let cooldownBreaks = 0;
  for (const r of rows) {
    if (!r.triage.flagged.length) continue;
    const was = last.get(r.actorId);
    const off = was === undefined || r.tick - was >= TRIAGE_COOLDOWN_TICKS;
    if (off) { eligible++; if (expected < TRIAGE_BUDGET) { expected++; last.set(r.actorId, r.tick); } }
  }
  const esc = rows.filter((r) => r.triage.escalated);
  const seen = new Map<string, number>();
  for (const r of esc) { const was = seen.get(r.actorId); if (was !== undefined && r.tick - was < TRIAGE_COOLDOWN_TICKS) cooldownBreaks++; seen.set(r.actorId, r.tick); }
  const brainBad = esc.filter((r) => !r.brain || !(r.brain.outcome === "model" ? r.legal.includes(r.brain.choice) : r.brain.fallbackReason !== null && r.legal.includes(r.brain.choice))).length;
  const railBreaks = esc.filter((r) => !r.brain || r.chosen !== r.brain.choice || !r.legal.includes(r.chosen)).length + rows.filter((r) => !r.triage.escalated && r.chosen !== r.sampled).length;
  return { triaged: rows.length, eligibleOffCooldown: eligible, expected: Math.min(TRIAGE_BUDGET, eligible), escalations: esc.length, cooldownBreaks, brainNotLegalOrFallback: brainBad, railBreaks };
}

function holderEntropy(events: readonly SimEvent[]): number {
  return dynamismReadout(events, { minDecisions: 1 }).actionVariety.actors.find((a) => a.actorId === HOLDER)?.entropyBits ?? 0;
}

/** Check 6. */
export function readoutCheck(run: readonly SimEvent[], pickerOnly: readonly SimEvent[]) {
  const rows = triaged(run).filter((r) => r.triage.escalated);
  const changed = rows.filter((r) => r.brain && r.brain.choice !== r.brain.pickerSampled).length;
  const divergence = firstDivergentTick(run, pickerOnly);
  const entropy = { run: r4(holderEntropy(run)), pickerOnly: r4(holderEntropy(pickerOnly)) };
  return {
    firstDivergentTick: divergence, escalationsChangedChosen: changed, divergenceOk: changed === 0 || divergence !== null,
    holderEntropy: { ...entropy, notBelow: entropy.run >= entropy.pickerOnly },
    escalationsPerTest: Object.fromEntries(TRIAGE_TESTS.map((t) => [t, rows.filter((r) => r.triage.flagged.includes(t)).length])),
    brainDiffersShare: rows.length ? r4(changed / rows.length) : 0,
  };
}

/** Check 7. */
export function capsCheck(run: RunDir) {
  const brainLines = run.cost.filter((l) => l.role === "brain.escalation");
  const pickerLines = run.cost.filter((l) => l.role === "picker.action");
  const brainCalls = run.summary.triageSummary?.brainCalls ?? 0;
  const brainSpend = brainLines.reduce((a, l) => a + l.estimatedCostUsd, 0);
  const vendor = run.summary.mode === "jev";
  return {
    brainCalls, brainSpendUsd: brainSpend, brainCostLines: brainLines.length, pickerCalls: run.summary.calls, pickerCostLines: pickerLines.length,
    ok: brainCalls <= BRAIN_CALL_CAP && brainSpend <= BRAIN_SPEND_CAP_USD
      && (!vendor || (brainLines.length === brainCalls && pickerLines.length === run.summary.calls)),
  };
}

export function replayCheck(run: RunDir) {
  const r = run.replay;
  return { present: !!r, hashMatches: !!r?.hashMatches, providerCalls: r?.providerCalls ?? null, fetchAttempts: r?.fetchAttempts ?? null,
    ok: !!r && r.hashMatches && r.providerCalls === 0 && (r.fetchAttempts ?? 0) === 0 && r.recordsUsed === r.recordsRecorded && r.triageRecordsUsed === r.triageRecordsRecorded };
}

export function testsCheck(logPath: string | undefined) {
  if (!logPath) return { given: false, ok: false };
  const log = readFileSync(logPath, "utf8");
  const fail = /ℹ fail (\d+)/.exec(log); const pass = /ℹ pass (\d+)/.exec(log);
  return { given: true, pass: pass ? Number(pass[1]) : null, fail: fail ? Number(fail[1]) : null, ok: !!fail && fail[1] === "0" && !!pass };
}
