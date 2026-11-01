import assert from "node:assert/strict";
import test from "node:test";
import { stubContextEcho } from "../src/sim/ai-context.ts";
import { indexAt, pick, pickerDraw, PickerReplay, stubArgmax, stubScripted, stubUniform, type PickerRecord } from "../src/sim/ai-picker.ts";
import type { TaxStepProvider, TaxStepTraceEntry } from "../src/sim/ai-provider.ts";
import { runTick, type TickAiOptions } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";

let providerCalls = 0;
const counting: TaxStepProvider = { name: "count", model: "none", decide: () => { providerCalls += 1; return { raw: JSON.stringify({ reason: "caution" }), latencyMs: 0 }; } };

function run(ai: TickAiOptions | null, seed: number, ticks: number): { hash: string; trace: TaxStepTraceEntry[] } {
  const world = createPrototypeWorld(seed);
  const trace: TaxStepTraceEntry[] = [];
  for (let i = 0; i < ticks; i += 1) trace.push(...(runTick(world, ai ? { ai } : {}).aiTrace ?? []));
  return { hash: stateHash(world), trace };
}
const replayOf = (trace: TaxStepTraceEntry[]) => new PickerReplay(trace.map((e) => ({ tick: e.tick, actorId: e.factionId, picker: e.ai.picker! })));

test("pick sorts by id, drops illegal options, renormalizes, and inverts the CDF", () => {
  const out = pick({ up: 2, down: 1, hold: 1, raid: 5 }, ["up", "hold", "down"], 0.6);
  assert.deepEqual(out.options, ["down", "hold", "up"]);
  assert.deepEqual(out.p, [0.25, 0.25, 0.5]);
  assert.equal(out.index, 2);
  assert.equal(indexAt([0.5, 0.5], 0.49), 0);
  assert.throws(() => pick({ a: 1 }, [], 0.1));
  assert.throws(() => pick({ a: 0 }, ["a"], 0.1));
  assert.throws(() => pick({ a: 1 }, ["a"], 1));
  assert.deepEqual(stubArgmax(["a", "b"], "b"), { a: 0, b: 1 });
  assert.deepEqual(stubUniform(["a", "b"]), { a: 1, b: 1 });
  assert.deepEqual(stubScripted({}, "k", ["a", "b"], "a"), { a: 1, b: 0 });
});

test("the side stream is keyed by seed, actor and tick, and is stateless", () => {
  assert.equal(pickerDraw("s", 1, "x", 5), pickerDraw("s", 1, "x", 5));
  assert.notEqual(pickerDraw("s", 1, "x", 5), pickerDraw("s", 1, "y", 5));
  assert.notEqual(pickerDraw("s", 1, "x", 5), pickerDraw("s", 2, "x", 5));
});

test("stubArgmax (all on the top row) equals flag off at 72 ticks on every seed, with no provider call", () => {
  for (const seed of [1847, 2718, 4096]) {
    providerCalls = 0;
    const off = run(null, seed, 72);
    const on = run({ brainTaxStep: counting, context: stubContextEcho(), cap: 1e9, weighted: true, pickerStub: "stubArgmax" }, seed, 72);
    assert.equal(on.hash, off.hash);
    assert.equal(providerCalls, 0);
    for (const e of on.trace) {
      assert.equal(e.ai.finalChoice, e.ai.scorerChoice);
      assert.equal(e.ai.picker!.outcome, "stub");
      assert.equal(e.ai.picker!.p[e.ai.picker!.index], 1);
    }
  }
});

test("stubArgmax equals flag off at 1,200 ticks on seed 1847 (5641b4c4)", () => {
  const on = run({ brainTaxStep: counting, context: stubContextEcho(), cap: 1e9, weighted: true, pickerStub: "stubArgmax" }, 1847, 1200);
  assert.equal(on.hash.slice(0, 8), "5641b4c4");
});

test("a stubUniform run replays from its recorded p and u with zero provider calls", () => {
  const live = run({ brainTaxStep: counting, context: stubContextEcho(), cap: 1e9, weighted: true, pickerStub: "stubUniform" }, 2718, 240);
  assert.ok(live.trace.some((e) => e.ai.finalChoice !== e.ai.scorerChoice));
  providerCalls = 0;
  const replay = replayOf(live.trace);
  const again = run({ brainTaxStep: counting, context: stubContextEcho(), cap: 1e9, weighted: true, pickerStub: "stubUniform", pickerReplay: replay }, 2718, 240);
  assert.equal(again.hash, live.hash);
  assert.equal(providerCalls, 0);
  assert.equal(replay.used, replay.size);
  assert.ok(again.trace.every((e) => e.ai.picker!.outcome === "replay"));
});

test("replay uses the recorded distribution, not a recomputed one", () => {
  const live = run({ brainTaxStep: counting, context: stubContextEcho(), cap: 1e9, weighted: true }, 1847, 240);
  // Re-record every decision as all mass on the recorded pick with u = 0.5: the replay must carry these p, not the trait ones.
  const forced = live.trace.map((e) => {
    const r = e.ai.picker!;
    const index = r.index;
    return { tick: e.tick, actorId: e.factionId, picker: { ...r, p: r.options.map((_, i) => (i === index ? 1 : 0)), u: 0.5, index } };
  });
  const again = run({ brainTaxStep: counting, context: stubContextEcho(), cap: 1e9, weighted: true, pickerReplay: new PickerReplay(forced) }, 1847, 240);
  assert.equal(again.hash, live.hash);
  for (const e of again.trace) {
    assert.equal(e.ai.weighted!.distribution[e.ai.finalChoice], 1);
    assert.equal(e.ai.weighted!.draw, 0.5);
  }
});

test("replay fails loudly on a missing record, an options mismatch, or a tampered index", () => {
  const live = run({ brainTaxStep: counting, context: stubContextEcho(), cap: 1e9, weighted: true }, 4096, 240);
  const entries = live.trace.map((e) => ({ tick: e.tick, actorId: e.factionId, picker: e.ai.picker! }));
  const go = (list: Array<{ tick: number; actorId: string; picker: PickerRecord }>) =>
    run({ brainTaxStep: counting, context: stubContextEcho(), cap: 1e9, weighted: true, pickerReplay: new PickerReplay(list) }, 4096, 240);
  assert.throws(() => go(entries.slice(1)), /no recorded draw/);
  assert.throws(() => go(entries.map((e, i) => (i === 0 ? { ...e, picker: { ...e.picker, options: ["x"] } } : e))), /options mismatch/);
  assert.throws(() => go(entries.map((e, i) => (i === 0 ? { ...e, picker: { ...e.picker, index: (e.picker.index + 1) % e.picker.options.length } } : e))), /redraw index/);
});
