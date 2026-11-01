import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fetchAttempts } from "./helpers/no-network.ts";
import { stubContextEcho } from "../src/sim/ai-context.ts";
import { taxStepInputHash, type TaxStepProvider, type TaxStepRequest, type TaxStepTraceEntry } from "../src/sim/ai-provider.ts";
import { replayFromTrace } from "../src/sim/ai-replay.ts";
import { runTick, type TickAiOptions } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";

/** A brain that disagrees by tick, so a replay that drops an answer changes the world. */
const contrarian: TaxStepProvider = {
  name: "test-contrarian", model: "none",
  decide: (request) => ({ raw: JSON.stringify({ reason: "ambition", choice: request.options[request.tick % request.options.length] }), latencyMs: 0 }),
};

function run(ai: TickAiOptions, seed = 4096, ticks = 240): { hash: string; trace: TaxStepTraceEntry[] } {
  const world = createPrototypeWorld(seed);
  const trace: TaxStepTraceEntry[] = [];
  for (let index = 0; index < ticks; index += 1) trace.push(...(runTick(world, { ai }).aiTrace ?? []));
  return { hash: stateHash(world), trace };
}

test("a replay from the trace reaches the recorded hash with matching requests", () => {
  const live = run({ brainTaxStep: contrarian, context: stubContextEcho(), cap: 10 });
  const replay = replayFromTrace(live.trace);
  const again = run({ brainTaxStep: replay.brain, context: replay.context, cap: 10 });
  assert.equal(again.hash, live.hash);
  const report = replay.report(again.trace);
  assert.equal(report.traceMatches, true);
  assert.equal(report.promptVersionMismatches, 0);
  assert.equal(report.missingBrain + report.missingContext, 0);
  assert.equal(fetchAttempts(), 0);
});

test("an older recorded prompt version is matched and flagged, not failed", () => {
  const requests: TaxStepRequest[] = [];
  const capture: TaxStepProvider = { ...contrarian, decide: (request) => { requests.push(request); return contrarian.decide(request); } };
  const live = run({ brainTaxStep: capture, context: stubContextEcho(), cap: 10 });
  let called = 0;
  const old = live.trace.map((entry) => entry.ai.fallbackReason === "cap" ? entry : {
    ...entry, ai: { ...entry.ai, promptVersion: "sha256:old", inputHash: taxStepInputHash({ ...requests[called++], promptVersion: "sha256:old" }) },
  });
  const replay = replayFromTrace(old);
  const again = run({ brainTaxStep: replay.brain, context: replay.context, cap: 10 });
  assert.equal(again.hash, live.hash);
  const report = replay.report(again.trace);
  assert.equal(report.traceMatches, true);
  assert.equal(report.promptVersionMismatches, requests.length);
  assert.deepEqual(report.recordedPromptVersions, ["sha256:old"]);
});

test("a tampered answer or a missing context answer fails the replay", () => {
  const live = run({ brainTaxStep: contrarian, context: stubContextEcho(), cap: 10 });
  const tampered = live.trace.map((entry, index) => index === 0
    ? { ...entry, ai: { ...entry.ai, rawAnswer: JSON.stringify({ choice: entry.ai.finalChoice === "hold" ? "down" : "hold" }) } } : entry);
  const replay = replayFromTrace(tampered);
  const again = run({ brainTaxStep: replay.brain, context: replay.context, cap: 10 });
  assert.equal(replay.report(again.trace).traceMatches, false);
  const noContext = live.trace.map((entry) => ({ ...entry, ai: { ...entry.ai, context: null } }));
  const replay2 = replayFromTrace(noContext);
  run({ brainTaxStep: replay2.brain, context: replay2.context, cap: 10 });
  assert.ok(replay2.report([]).missingContext > 0);
});

test("the runner's --replay reproduces a stub run offline and refuses --ai-vendor", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-replay-"));
  try {
    const env = { ...process.env };
    delete env.DEEPSEEK_API_KEY;
    delete env.JEV_API_KEY;
    execFileSync("npm", ["run", "-s", "ai-pilot", "--", "--seed", "1847", "--ticks", "120", "--output", join(dir, "run")], { env });
    const out = execFileSync("npm", ["run", "-s", "ai-pilot", "--", "--replay", join(dir, "run")], { env, encoding: "utf8" });
    const result = JSON.parse(out.trim().split("\n").pop()!);
    assert.equal(result.mode, "replay");
    assert.equal(result.hashMatches, true);
    assert.equal(result.traceMatches, true);
    assert.equal(result.maxCalls, JSON.parse(readFileSync(join(dir, "run", "summary.json"), "utf8")).maxCalls);
    const summary = JSON.parse(readFileSync(join(dir, "run", "summary.json"), "utf8"));
    writeFileSync(join(dir, "run", "summary.json"), JSON.stringify({ ...summary, stateHash: "0".repeat(64) }));
    assert.equal(spawnSync("npm", ["run", "-s", "ai-pilot", "--", "--replay", join(dir, "run")], { env }).status, 1);
    assert.notEqual(spawnSync("npm", ["run", "-s", "ai-pilot", "--", "--replay", join(dir, "run"), "--ai-vendor"], { env }).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
