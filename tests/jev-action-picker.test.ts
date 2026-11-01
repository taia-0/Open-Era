import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fetchAttempts } from "./helpers/no-network.ts";
import { stubContextEcho } from "../src/sim/ai-context.ts";
import { pickerGate, seedGate, WORK_SHARE_FLOOR } from "../src/tools/picker-gate.ts";
import {
  ActionPickerReplay, blendDistribution, PICKER_BLEND, stubFittedPicker, legalIds, optionId, pickDraw, PICKER_STATE_MAX_BYTES, pickerState, railProbabilities, stubArgmaxPicker, stubScriptedPicker,
  stubUniformPicker, type ActionPicker, type ActionPickerRecord, type PickerAnswer,
} from "../src/sim/ai-action-picker.ts";
import { stubAgree } from "../src/sim/ai-provider.ts";
import { CostLedger } from "../src/sim/ai-vendor/cost.ts";
import { jevActionPicker } from "../src/sim/ai-vendor/jev.ts";
import { type TickAiOptions, type TickOptions } from "../src/sim/engine.ts";
import { runTick } from "./helpers/exile-off.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { canonicalJson, stateHash } from "../src/sim/state.ts";
import type { DecisionCandidate, SimEvent } from "../src/sim/types.ts";

type Rec = { tick: number; actorId: string; picker: ActionPickerRecord };
function run(ai: TickAiOptions | null, seed: number, ticks: number): { hash: string; records: Rec[]; events: SimEvent[]; consultsOff: number } {
  const world = createPrototypeWorld(seed);
  const records: Rec[] = [];
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i += 1) {
    for (const event of runTick(world, ai ? { ai } : {}).events) {
      events.push(event);
      const picker = (event.data as { ai?: { picker?: ActionPickerRecord } })?.ai?.picker;
      if (picker) records.push({ tick: event.tick, actorId: event.actorId!, picker });
    }
  }
  return { hash: stateHash(world), records, events, consultsOff: 0 };
}
const entropy = (events: SimEvent[], actor: string) => {
  const counts = new Map<string, number>();
  for (const e of events) if (e.type === "decision-made" && e.actorId === actor) counts.set(String(e.data.goal), (counts.get(String(e.data.goal)) ?? 0) + 1);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return [...counts.values()].reduce((h, c) => h - (c / total) * Math.log2(c / total), 0);
};

test("1. option ids are stable and sorted, and legal excludes -1000 rows", () => {
  const rows: DecisionCandidate[] = [
    { action: "work", score: 5, reason: "" }, { action: "travel", score: 3, reason: "", targetId: "glassport" },
    { action: "trade-local", score: 2, reason: "", resource: "arms" }, { action: "recruit", score: -1000, reason: "" },
    { action: "rest", score: 1, reason: "" },
  ];
  assert.equal(optionId(rows[1]), "travel:glassport:-");
  assert.deepEqual(legalIds(rows), ["rest:-:-", "trade-local:-:arms", "travel:glassport:-", "work:-:-"]);
  assert.equal(legalIds([...rows, { action: "work", score: 1, reason: "" }]), null);
});

test("2. flag off: the 72-tick fixture and no data.ai.picker anywhere", () => {
  const pins: Record<number, string> = { 1847: "66e8ccb7", 2718: "b4ccedab", 4096: "b04c5ac4" };
  for (const seed of [1847, 2718, 4096]) {
    const off = run(null, seed, 72);
    assert.equal(off.hash.slice(0, 8), pins[seed]);
    assert.equal(off.records.length, 0);
  }
});

test("3. stubArgmax: 1,200-tick hash equals flag off (b51aa07a) and every sampled is the scorer's pick", () => {
  const picker = stubArgmaxPicker();
  const on = run({ picker, pickerCap: 1e9 }, 1847, 1200);
  assert.equal(on.hash.slice(0, 8), "b51aa07a");
  // Port balance: Pax is consulted 549 times now (840 before home starts); pinned exactly instead of the old > 800 floor.
  assert.equal(on.records.length, 549);
  assert.ok(on.records.every((r) => r.picker.sampled === r.picker.scorerPick && r.picker.outcome === "model"));
});

test("3b. slice 1 seam: stubArgmax for every free autonomous character equals flag off at 72 ticks", () => {
  for (const seed of [1847, 2718, 4096]) {
    const off = run(null, seed, 72);
    const on = run({ picker: stubArgmaxPicker(), pickerActors: "all", pickerCap: 1e9 }, seed, 72);
    assert.equal(on.hash, off.hash);
    assert.ok(new Set(on.records.map((r) => r.actorId)).size > 1);
  }
});

test("4. stubUniform: deterministic, legal, and the holder's entropy exceeds flag off", () => {
  const a = run({ picker: stubUniformPicker() }, 4096, 1200);
  const b = run({ picker: stubUniformPicker() }, 4096, 1200);
  assert.equal(a.hash, b.hash);
  assert.ok(a.records.every((r) => r.picker.legal.includes(r.picker.sampled)));
  const off = run(null, 4096, 1200);
  assert.ok(entropy(a.events, "character-14") > entropy(off.events, "character-14"));
});

test("5. pickDraw is pure, in [0, 1), and differs by actor and tick", () => {
  assert.equal(pickDraw(1, "a", 1), pickDraw(1, "a", 1));
  assert.notEqual(pickDraw(1, "a", 1), pickDraw(1, "b", 1));
  assert.notEqual(pickDraw(1, "a", 1), pickDraw(1, "a", 2));
  for (let t = 0; t < 500; t += 1) { const u = pickDraw(9, "x", t); assert.ok(u >= 0 && u < 1); }
});

test("6. rails: garbage drops to legal ids or falls back to candidates[0] with illegal", () => {
  const legal = ["a", "b"];
  assert.deepEqual(railProbabilities({ a: 0.5, zz: 0.9, b: Number.NaN }, legal)!.distribution, { a: 1, b: 0 });
  assert.deepEqual(railProbabilities({ a: -1, b: 0.25 }, legal)!.distribution, { a: 0, b: 1 });
  assert.equal(railProbabilities({ a: 0, b: 0 }, legal), null);
  assert.equal(railProbabilities({ zz: 1 }, legal), null);
  assert.equal(railProbabilities(null, legal), null);
  const cases: Array<(legalIds: string[]) => Record<string, unknown>> = [
    () => ({ "nope:-:-": 1 }), (ids) => Object.fromEntries(ids.map((id) => [id, Number.NaN])),
    (ids) => Object.fromEntries(ids.map((id) => [id, -0.5])), (ids) => Object.fromEntries(ids.map((id) => [id, 0])),
  ];
  for (const make of cases) {
    const garbage = stubScriptedPicker((request) => ({ probabilities: make(request.legal), latencyMs: 0 }));
    const on = run({ picker: garbage }, 1847, 120);
    assert.ok(on.records.length > 0);
    for (const { picker } of on.records) {
      assert.equal(picker.fallbackReason, "illegal");
      assert.equal(picker.sampled, picker.scorerPick);
    }
    assert.equal(on.hash, run(null, 1847, 120).hash);
  }
  // Argmax on an illegal id plus some legal mass: drops to legal ids.
  const mixed = stubScriptedPicker((request) => ({ probabilities: { "raid:x:-": 0.9, [request.legal[0]]: 0.1 }, latencyMs: 0 }));
  const m = run({ picker: mixed }, 1847, 120);
  assert.ok(m.records.every((r) => r.picker.outcome === "model" && r.picker.jevDistribution![r.picker.legal[0]] === 1 && r.picker.legal.includes(r.picker.sampled)));
});

test("7. failures: timeout, error and cap fall back with the right reason; the Jev cost line shows 0 tokens", () => {
  const timeout = stubScriptedPicker(() => ({ probabilities: { x: 1 }, latencyMs: 5000 }));
  assert.ok(run({ picker: timeout }, 1847, 72).records.every((r) => r.picker.fallbackReason === "timeout"));
  const error: ActionPicker = { name: "err", model: "none", choose: (): PickerAnswer => { throw new Error("boom"); } };
  assert.ok(run({ picker: error }, 1847, 72).records.every((r) => r.picker.fallbackReason === "error"));
  const capped = run({ picker: stubUniformPicker(), pickerCap: 0 }, 1847, 72);
  assert.ok(capped.records.length > 0 && capped.records.every((r) => r.picker.fallbackReason === "cap"));
  for (const kind of ["timeout", "error"] as const) {
    const ledger = new CostLedger(0.05);
    const jev = jevActionPicker({ transport: () => ({ kind }), ledger, env: { JEV_API_KEY: "test" } });
    const on = run({ picker: jev }, 1847, 48);
    assert.ok(on.records.length > 0 && on.records.every((r) => r.picker.fallbackReason === kind));
    assert.ok(ledger.lines.every((line) => line.tokensIn === 0 && line.role === "picker.action" && line.fallbackReason === kind));
  }
  assert.equal(fetchAttempts(), 0);
});

test("8. skips: no consult with raid or claim-settlement legal, or a haul able to act", () => {
  // Over 1,200 ticks on 1847, 19 of the holder's 853 decisions have a 9th row (raid or claim); none is consulted.
  const on = run({ picker: stubUniformPicker() }, 1847, 1200);
  for (const { picker } of on.records) assert.ok(!picker.legal.some((id) => id.startsWith("raid:") || id.startsWith("claim-settlement:")));
  const skipped = on.events.filter((e) => e.type === "decision-made" && e.actorId === "character-14" && !(e.data as { ai?: unknown }).ai);
  assert.ok(skipped.length > 0);
  for (const e of on.events) if (e.type === "decision-made" && e.data.goal === "haul") assert.equal((e.data as { ai?: unknown }).ai, undefined);
});

test("9. replay: a stubUniform run replays to its hash with zero provider calls; WorldStore.recover mid-run matches", () => {
  const live = run({ picker: stubUniformPicker() }, 2718, 600);
  const replay = new ActionPickerReplay(live.records);
  const again = run({ picker: replay }, 2718, 600);
  assert.equal(again.hash, live.hash);
  assert.equal(replay.calls, 0);
  assert.equal(replay.used, replay.size);
  // A tampered record fails loudly.
  const tampered = live.records.map((r, i) => (i === 0 ? { ...r, picker: { ...r.picker, inputHash: "sha256:x" } } : r));
  assert.throws(() => run({ picker: new ActionPickerReplay(tampered) }, 2718, 600), /inputHash mismatch/);
  const flipped = live.records.map((r, i) => (i === 0 ? { ...r, picker: { ...r.picker, sampled: r.picker.legal.find((id) => id !== r.picker.sampled)! } } : r));
  assert.throws(() => run({ picker: new ActionPickerReplay(flipped) }, 2718, 600), /sampled/);
  assert.equal(fetchAttempts(), 0);
});

for (const [label, makeOptions] of [
  ["action picker (stubUniform)", (): TickOptions => ({ ai: { picker: stubUniformPicker() } })],
  ["weighted tax step (slice 1)", (): TickOptions => ({ ai: { brainTaxStep: stubAgree(), context: stubContextEcho(), weighted: true, pickerStub: "stubUniform" } })],
] as const) {
  test(`9b. WorldStore.recover mid-run with the ${label} on matches the continuous run and calls nothing`, () => {
    const directory = mkdtempSync(join(tmpdir(), "open-era-picker-recover-"));
    try {
      const continuous = createPrototypeWorld(1847);
      const continuousOptions = makeOptions();
      for (let i = 0; i < 230; i += 1) runTick(continuous, continuousOptions);
      const store = new WorldStore(join(directory, "world.sqlite"));
      const split = createPrototypeWorld(1847);
      store.initialize(split);
      const splitOptions = makeOptions();
      // 197 sits between snapshot boundaries, so recovery replays events.
      while (split.tick < 197) store.appendTick(runTick(split, splitOptions).events, split);
      const live = stateHash(split);
      const recovered = store.recover();
      assert.ok(recovered.replayedEvents > 0);
      assert.equal(stateHash(recovered.state), live);
      const world = recovered.state;
      const resumeOptions = makeOptions();
      while (world.tick < 230) store.appendTick(runTick(world, resumeOptions).events, world);
      assert.equal(stateHash(world), stateHash(continuous));
      store.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test("10. cap: past the call cap or the spend cap the fallback is cap, and the ledger never exceeds the cap", () => {
  const calls = run({ picker: stubUniformPicker(), pickerCap: 5 }, 1847, 300);
  assert.equal(calls.records.filter((r) => r.picker.fallbackReason !== "cap").length, 5);
  const ledger = new CostLedger(0.0001);
  const body = JSON.stringify({ model: "jev-1.14.0", usage: { input_tokens: 900, output_tokens: 3 }, answers: { next_action: { choice: "x", probabilities: {}, confidence: 0.5 } } });
  const jev = jevActionPicker({ transport: () => ({ kind: "response", status: 200, body }), ledger, env: { JEV_API_KEY: "test" } });
  const on = run({ picker: jev }, 1847, 300);
  assert.ok(on.records.some((r) => r.picker.fallbackReason === "cap"));
  assert.ok(ledger.spendUsd <= ledger.capUsd);
  assert.ok(ledger.lines.every((line) => line.role === "picker.action"));
});

test("state stays within 2,048 bytes", () => {
  const world = createPrototypeWorld(1847);
  for (let i = 0; i < 200; i += 1) runTick(world);
  const { state } = pickerState(world, world.characters["character-14"]);
  assert.ok(Buffer.byteLength(canonicalJson(state), "utf8") <= PICKER_STATE_MAX_BYTES);
});

test("blend: the prior centres on the scorer's row, Jev tilts it, the weight and floor bound it, and it sums to 1", () => {
  const legal = ["rest:-:-", "travel:a:-", "work:-:-"];
  const scores = { "rest:-:-": 30, "travel:a:-": 20, "work:-:-": 40 };
  const flat = blendDistribution({ "rest:-:-": 1 / 3, "travel:a:-": 1 / 3, "work:-:-": 1 / 3 }, scores, "work:-:-", legal, PICKER_BLEND);
  assert.ok(flat.distribution["work:-:-"] > flat.distribution["rest:-:-"] && flat.distribution["rest:-:-"] > flat.distribution["travel:a:-"]);
  assert.equal(flat.prior["work:-:-"], PICKER_BLEND.centre);
  assert.ok(Math.abs(Object.values(flat.distribution).reduce((a, b) => a + b, 0) - 1) < 1e-5);
  const jev = blendDistribution({ "rest:-:-": 0, "travel:a:-": 1, "work:-:-": 0 }, scores, "work:-:-", legal, PICKER_BLEND);
  assert.ok(jev.distribution["travel:a:-"] > flat.distribution["travel:a:-"]);
  assert.ok(jev.distribution["rest:-:-"] > 0, "the floor keeps a zero-probability row possible");
  const off = blendDistribution({ "rest:-:-": 0, "travel:a:-": 1, "work:-:-": 0 }, scores, "work:-:-", legal, { ...PICKER_BLEND, jevWeight: 0 });
  assert.deepEqual(off.distribution, flat.distribution);
});

test("blend records the prior, Jev's distribution, the weight, the final distribution and the draw; replay uses the recorded blend", () => {
  const live = run({ picker: stubUniformPicker() }, 1847, 300);
  assert.ok(live.records.length > 0);
  for (const { picker } of live.records) {
    assert.deepEqual(picker.blend, PICKER_BLEND);
    assert.ok(picker.prior && picker.jevDistribution && picker.distribution);
    assert.equal(picker.prior![picker.scorerPick], PICKER_BLEND.centre);
  }
  // Replaying with a different default blend still follows the record.
  const again = run({ picker: new ActionPickerReplay(live.records), pickerBlend: { centre: 9, temperature: 1, jevWeight: 3, floor: 0.5 } }, 1847, 300);
  assert.equal(again.hash, live.hash);
});

test("Jev's state says what work earns, within 2,048 bytes", () => {
  const seen: string[] = [];
  const spy = stubScriptedPicker((request) => { seen.push(canonicalJson(request.state)); assert.match(request.criteria["work:-:-"] ?? "Work here for dependable local income: about 0.00", /about \d+\.\d\d coins after tax/); return { probabilities: Object.fromEntries(request.legal.map((id) => [id, 1])), latencyMs: 0 }; });
  run({ picker: spy }, 2718, 200);
  assert.ok(seen.length > 0);
  for (const state of seen) {
    const parsed = JSON.parse(state);
    for (const field of ["purse", "workGross", "workTax", "workNet", "passagePerDay", "purseDaysOfPassage", "mateAllowancePerDay"]) assert.equal(typeof parsed.economy[field], "number");
    assert.ok(Buffer.byteLength(state, "utf8") <= PICKER_STATE_MAX_BYTES);
  }
});

test("the fitted stub replays recorded distributions by exact legal list, else per-kind means", () => {
  const stub = stubFittedPicker([{ legal: ["rest:-:-", "work:-:-"], distribution: { "rest:-:-": 0.8, "work:-:-": 0.2 } }]);
  const base = { tick: 1, actorId: "c", criteria: {}, state: {}, promptVersion: "v", scorerPick: "work:-:-", scores: {} };
  assert.deepEqual(stub.choose({ ...base, legal: ["rest:-:-", "work:-:-"] }).probabilities, { "rest:-:-": 0.8, "work:-:-": 0.2 });
  const p = stub.choose({ ...base, legal: ["rest:-:-", "travel:x:-", "work:-:-"] }).probabilities as Record<string, number>;
  assert.ok(p["rest:-:-"] > p["work:-:-"]);
  assert.equal(stub.exactHits, 1);
});

test("gate additions: entropy up, no zero where flag off has some, not systematically below, work share floor", () => {
  const ev = (tick: number, type: string, data: Record<string, unknown> = {}, actorId = "character-14") => ({ sequence: 0, tick, type, actorId, data } as SimEvent);
  const off = [ev(1, "decision-made", { goal: "rest" }), ev(2, "decision-made", { goal: "rest" }), ev(3, "decision-made", { goal: "work" }), ev(4, "character-captured"), ev(5, "secession-declared")];
  const good = [ev(1, "decision-made", { goal: "rest" }), ev(2, "decision-made", { goal: "travel" }), ev(3, "decision-made", { goal: "work" }), ev(4, "character-captured"), ev(5, "secession-declared")];
  const g = seedGate(1, good, off);
  assert.equal(g.holderEntropy.up, true);
  assert.equal(g.workShare.ok, true);
  assert.equal(pickerGate([g]).pass, true);
  const bad = [ev(1, "decision-made", { goal: "rest" }), ev(2, "decision-made", { goal: "rest" }), ev(3, "decision-made", { goal: "rest" })];
  const b = seedGate(1, bad, off);
  const gate = pickerGate([b, b]);
  assert.equal(gate.checks.holderEntropyUpAllSeeds, false);
  assert.equal(gate.checks.secessionsNoZeroWhereBaselineHas, false);
  assert.equal(gate.checks.capturesNotSystematicallyBelow, false);
  assert.equal(gate.checks.workShareFloor, false);
  assert.ok(WORK_SHARE_FLOOR > 0);
  // One-sided: more work than flag off never fails; a collapse below 70% and below 0.05 does.
  const workDecisions = (work: number, other: number) => [
    ...Array.from({ length: work }, (_, i) => ev(i, "decision-made", { goal: "work" })),
    ...Array.from({ length: other }, (_, i) => ev(100 + i, "decision-made", { goal: "rest" })),
  ];
  const lowOff = workDecisions(3, 97);
  assert.equal(seedGate(1, workDecisions(15, 85), lowOff).workShare.ok, true, "2.7% → 15% passes: no ceiling");
  const off20 = workDecisions(20, 80);
  assert.equal(seedGate(1, workDecisions(14, 86), off20).workShare.ok, true, "70% of flag off passes");
  assert.equal(seedGate(1, workDecisions(4, 96), off20).workShare.ok, false, "below 70% and below 0.05 fails");
  assert.equal(seedGate(1, workDecisions(6, 94), off20).workShare.ok, true, "0.05 absolute passes");
});
