import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import "./helpers/no-network.ts";
import { runTick, runTicks, type TickOptions } from "../src/sim/engine.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";
import {
  scriptKey, stubAgree, stubFail, stubScript,
  type TaxStepProvider, type TaxStepRequest, type TaxStepTraceEntry,
} from "../src/sim/ai-provider.ts";
import type { SimEvent } from "../src/sim/types.ts";

/**
 * AI pilot A, section 5 (docs/design/ai-pilot-a.md at 753514e). Stubs only.
 * The flag-off pins are the breakaway-polish baseline at 1200 ticks.
 */
const FLAG_OFF_1200: Record<number, { hash: string; events: number }> = {
  // Re-pinned for secession routes (secession-routes.md §5.5): was f80c529f/165833, 2b5060c0/157639, e8ae4443/162123.
  // Before that, for the raise shock (low-tax-cost.md): c4d99822/163679, 738181c0/159177, cbd66565/161386.
  1847: { hash: "5641b4c45aaf9f5097be2def442de81d727ae86a60199acde1011f431f2e5e54", events: 162167 },
  2718: { hash: "a6ff3924ddc9d90a9e2839b9a14eda38935a51223b422db055e0b6511dc4ab9d", events: 156996 },
  4096: { hash: "b19aa02e7e4b7603d2bce282ab67cf58d6413239d1abfff28f47d20340547cdc", events: 163536 },
};
/**
 * Calls the built gate makes on the agree stub over 1200 ticks. The brief's
 * harness counted 45 / 45 / 42 on an older tree that had no landless freeze;
 * this tree freezes a faction with no port, and a one-option set is not sent.
 */
// Secession routes (secession-routes.md): 21 / 25 / 22; was 30 / 22 / 19 (raise shock).
const CLOCK_POINTS_1200: Record<number, number> = { 1847: 21, 2718: 25, 4096: 22 };
const SEEDS = [1847, 2718, 4096];

function run(seed: number, ticks: number, options: TickOptions = {}) {
  const result = runTicks(createPrototypeWorld(seed), ticks, options);
  return { hash: stateHash(result.state), events: result.events, trace: result.aiTrace };
}
const ftSteps = (events: SimEvent[]) => events.filter((event) => event.type === "tax-rate-set" && event.targetId === "free-tide");
const withoutLatency = (event: SimEvent) => {
  const ai = event.data.ai as Record<string, unknown> | undefined;
  if (!ai) return event;
  const { latencyMs: _latency, ...rest } = ai;
  return { ...event, data: { ...event.data, ai: rest } };
};

test("1. flag off: 1200-tick hashes and counts unchanged, no data.ai, no trace", () => {
  for (const seed of SEEDS) {
    const off = run(seed, 1200);
    assert.equal(off.hash, FLAG_OFF_1200[seed].hash, `seed ${seed}`);
    assert.equal(off.events.length, FLAG_OFF_1200[seed].events, `seed ${seed}`);
    assert.equal(off.events.some((event) => "ai" in event.data), false);
    assert.equal(off.trace, undefined);
  }
});

test("2. agree stub: same world and counts as flag off; every Free Tide step is the model's and equals the scorer", () => {
  for (const seed of SEEDS) {
    const on = run(seed, 1200, { ai: { brainTaxStep: stubAgree() } });
    assert.equal(on.hash, FLAG_OFF_1200[seed].hash, `seed ${seed}`);
    assert.equal(on.events.length, FLAG_OFF_1200[seed].events, `seed ${seed}`);
    const steps = ftSteps(on.events);
    assert.ok(steps.length > 0);
    for (const step of steps) {
      const ai = step.data.ai as Record<string, unknown>;
      assert.equal(ai.outcome, "model");
      assert.equal(ai.fallbackReason, null);
      assert.equal(ai.finalChoice, ai.scorerChoice);
      assert.equal(ai.model, "stub-agree@1");
      const cents = Math.round(Number(step.data.taxRate) * 100) - Math.round(Number(step.data.previousTaxRate) * 100);
      assert.equal(cents, ai.finalChoice === "up" ? 1 : -1);
    }
    // Only Free Tide events carry data.ai.
    assert.equal(on.events.filter((event) => "ai" in event.data).length, steps.length);
    assert.equal(on.trace!.length, CLOCK_POINTS_1200[seed], `seed ${seed} clock points`);
    assert.equal(on.trace!.filter((entry) => entry.applied).length, steps.length);
    // Two agree runs give the same log once latencyMs is stripped.
    const again = run(seed, 1200, { ai: { brainTaxStep: stubAgree() } });
    assert.deepEqual(ftSteps(again.events).map(withoutLatency), steps.map(withoutLatency));
  }
});

test("3. failing stub: timeout, error and illegal each reproduce the flag-off world, scorer applied", () => {
  for (const mode of ["timeout", "error", "illegal"] as const) {
    for (const seed of SEEDS) {
      const on = run(seed, 1200, { ai: { brainTaxStep: stubFail(mode) } });
      assert.equal(on.hash, FLAG_OFF_1200[seed].hash, `${mode} seed ${seed}`);
      assert.equal(on.events.length, FLAG_OFF_1200[seed].events);
      for (const step of ftSteps(on.events)) {
        const ai = step.data.ai as Record<string, unknown>;
        assert.equal(ai.outcome, "fallback");
        assert.equal(ai.fallbackReason, mode);
        assert.equal(ai.parsedChoice, null);
        assert.equal(ai.finalChoice, ai.scorerChoice);
        if (mode === "illegal") assert.equal(ai.rawAnswer, "{\"choice\":\"sideways\"}");
        else assert.equal(ai.rawAnswer, null);
      }
      assert.ok(on.trace!.every((entry) => entry.ai.fallbackReason === mode));
    }
  }
});

test("4. recovery reaches the scripted live hash without calling the provider", () => {
  // 1847: the scorer holds at 24 and 120 (script says up). 96 says hold, where flag off steps down.
  const table = {
    [scriptKey(1847, 24, "free-tide")]: "up",
    [scriptKey(1847, 96, "free-tide")]: "hold",
    [scriptKey(1847, 120, "free-tide")]: "up",
  };
  const directory = mkdtempSync(join(tmpdir(), "open-era-ai-pilot-a-"));
  const databasePath = join(directory, "recovery.sqlite");
  try {
    const store = new WorldStore(databasePath);
    const world = createPrototypeWorld(1847);
    store.initialize(world);
    const options: TickOptions = { ai: { brainTaxStep: stubScript(1847, table) } };
    const trace: TaxStepTraceEntry[] = [];
    // Stop at 124: the latest snapshot is the tick-120 morning, so recovery
    // replays tick 120's scripted step from the event log.
    while (world.tick < 124) {
      const result = runTick(world, options);
      trace.push(...(result.aiTrace ?? []));
      store.appendTick(result.events, world);
    }
    const live = stateHash(world);
    store.close();
    const scripted = trace.filter((entry) => entry.ai.finalChoice !== entry.ai.scorerChoice).map((entry) => entry.tick);
    // After the tick-24 step, the scorer itself holds at 96 on this run, so 96 is not a disagreement.
    assert.deepEqual(scripted, [24, 120]);
    assert.notEqual(live, run(1847, 124).hash, "the scripted run diverges from flag off");

    let thrown = 0;
    const throwing: TaxStepProvider = {
      name: "stub-throw", model: "stub-throw@1",
      decide: (_request: TaxStepRequest) => { thrown += 1; throw new Error("provider called during recovery"); },
    };
    void throwing; // recover() takes no provider: the seam is unreachable from replay.
    const reopened = new WorldStore(databasePath);
    const recovered = reopened.recover();
    assert.ok(recovered.replayedEvents > 0);
    assert.equal(stateHash(recovered.state), live);
    assert.equal(thrown, 0);
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("5. the provider is called only by the tax step, only for Free Tide, once per clock point", () => {
  for (const seed of SEEDS) {
    const calls: TaxStepRequest[] = [];
    const agree = stubAgree();
    const counting: TaxStepProvider = {
      name: agree.name, model: agree.model,
      decide: (request) => {
        assert.match(new Error().stack ?? "", /chooseAutonomousTaxRates/);
        calls.push(request);
        return agree.decide(request);
      },
    };
    const on = run(seed, 1200, { ai: { brainTaxStep: counting } });
    assert.equal(on.hash, FLAG_OFF_1200[seed].hash);
    assert.ok(calls.every((request) => request.factionId === "free-tide"));
    assert.ok(calls.every((request) => request.tick > 0 && request.tick % 24 === 0));
    assert.equal(new Set(calls.map((request) => request.tick)).size, calls.length);
    assert.ok(calls.every((request) => request.options.length > 1));
    assert.equal(calls.length, CLOCK_POINTS_1200[seed], `seed ${seed}: recorded ${calls.length}`);
    // World Government steps on the scorer, with no data.ai.
    const wg = on.events.filter((event) => event.type === "tax-rate-set" && event.targetId === "world-government");
    assert.ok(wg.every((event) => !("ai" in event.data)));
  }
});

test("6. cap of 10: later clock points apply the scorer with reason cap; the default 50 does not bind", () => {
  for (const seed of SEEDS) {
    let called = 0;
    const agree = stubAgree();
    const counting: TaxStepProvider = { ...agree, name: agree.name, model: agree.model, decide: (request) => { called += 1; return agree.decide(request); } };
    const capped = run(seed, 1200, { ai: { brainTaxStep: counting, cap: 10 } });
    assert.equal(capped.hash, FLAG_OFF_1200[seed].hash);
    assert.equal(called, 10);
    capped.trace!.forEach((entry, index) => {
      if (index < 10) assert.equal(entry.ai.outcome, "model");
      else {
        assert.equal(entry.ai.fallbackReason, "cap");
        assert.equal(entry.ai.rawAnswer, null);
        assert.equal(entry.ai.finalChoice, entry.ai.scorerChoice);
      }
    });
    const open = run(seed, 1200, { ai: { brainTaxStep: stubAgree() } });
    assert.ok(open.trace!.length < 50);
    assert.ok(open.trace!.every((entry) => entry.ai.fallbackReason === null));
  }
});
