import assert from "node:assert/strict";
import test from "node:test";
import { stubContextEcho, type ChoiceAnswerRecord } from "../src/sim/ai-context.ts";
import { deepSeekRequestBody } from "../src/sim/ai-vendor/deepseek.ts";
import { railedOptions, type TaxChoice, type TaxStepPersona, type TaxStepProvider, type TaxStepRequest, type TaxStepTraceEntry } from "../src/sim/ai-provider.ts";
import { replayFromTrace } from "../src/sim/ai-replay.ts";
import { sampleChoice, taxStepDistribution, templateReason, traitDrive, triage, weightedDraw, WEIGHTED_PARAMS } from "../src/sim/ai-weighted.ts";
import { runTick, type TickAiOptions } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";

const MID: TaxStepPersona = { ambition: 0.5, aggression: 0.5, caution: 0.5, commerce: 0.5, loyalty: 0.5 };
const HAWK: TaxStepPersona = { ambition: 0.94, aggression: 0.97, caution: 0.08, commerce: 0.6, loyalty: 0.3 };
const DOVE: TaxStepPersona = { ambition: 0.1, aggression: 0.1, caution: 0.9, commerce: 0.3, loyalty: 0.9 };
const ALL: TaxChoice[] = ["down", "hold", "up"];
const sum = (d: Record<string, number | undefined>) => Object.values(d).reduce((a, b) => a! + b!, 0)!;

/** Writes the reason and nothing else; asks for a choice it never gets to make. */
const reasoner: TaxStepProvider = {
  name: "test-reasoner", model: "none",
  decide: (request) => ({ raw: JSON.stringify({ reason: `my ambition says ${request.chosen}`, choice: "up" }), latencyMs: 0 }),
};

function run(ai: TickAiOptions, seed = 1847, ticks = 240): { hash: string; trace: TaxStepTraceEntry[] } {
  const world = createPrototypeWorld(seed);
  const trace: TaxStepTraceEntry[] = [];
  for (let index = 0; index < ticks; index += 1) trace.push(...(runTick(world, { ai }).aiTrace ?? []));
  return { hash: stateHash(world), trace };
}

test("the distribution sums to one, peaks on the scorer's pick for a neutral ruler, and is symmetric", () => {
  for (const scorer of ALL) {
    const { distribution } = taxStepDistribution(scorer, ALL, false, false, MID);
    assert.ok(Math.abs(sum(distribution) - 1) < 1e-5);
    for (const option of ALL) if (option !== scorer) assert.ok(distribution[scorer]! > distribution[option]!);
  }
  assert.equal(traitDrive(MID), 0);
});

test("traits tilt the distribution: a hawk leans up, a dove leans down and to hold", () => {
  const hawk = taxStepDistribution("hold", ALL, false, false, HAWK).distribution;
  const dove = taxStepDistribution("hold", ALL, false, false, DOVE).distribution;
  assert.ok(hawk.up! > hawk.down!);
  assert.ok(dove.down! > dove.up!);
  assert.ok(dove.hold! > hawk.hold!);
  assert.ok(traitDrive(HAWK) > 0 && traitDrive(DOVE) < 0);
});

test("rails run before sampling: pressed drops up but keeps down; short and calm drops down", () => {
  const pressed = taxStepDistribution("down", ALL, true, true, HAWK);
  assert.deepEqual(pressed.legal, ["down", "hold"]);
  assert.equal(pressed.distribution.up, undefined);
  assert.ok(Math.abs(sum(pressed.distribution) - 1) < 1e-5);
  const short = taxStepDistribution("up", ALL, false, true, DOVE);
  assert.deepEqual(short.legal, ["hold", "up"]);
  assert.equal(short.distribution.down, undefined);
  for (let i = 0; i < 1000; i += 1) {
    const draw = i / 1000;
    assert.ok(pressed.legal.includes(sampleChoice(pressed.distribution, pressed.legal, draw)));
    assert.ok(short.legal.includes(sampleChoice(short.distribution, short.legal, draw)));
  }
});

test("the social blend is off by default and documented weight moves the distribution when set", () => {
  const answers = { loyaltyRead: { type: "choice", options: ["firm", "wavering", "breaking"], choice: "breaking", probabilities: { firm: 0, wavering: 0.2, breaking: 0.8 }, probabilitySum: 1, confidence: 0.8 } } as unknown as Record<string, ChoiceAnswerRecord>;
  const off = taxStepDistribution("hold", ALL, false, false, MID, answers);
  assert.equal(off.components.social, null);
  const on = taxStepDistribution("hold", ALL, false, false, MID, answers, { ...WEIGHTED_PARAMS, social: 0.5 });
  assert.ok(on.distribution.down! > off.distribution.down!);
  assert.ok(Math.abs(sum(on.distribution) - 1) < 1e-5);
  assert.deepEqual(triage(answers), { escalate: true, why: "loyalty read breaking" });
  assert.equal(triage(undefined).escalate, false);
});

test("the draw is a pure function of seed, faction and tick, in [0, 1)", () => {
  assert.equal(weightedDraw(1847, "f", 96), weightedDraw(1847, "f", 96));
  assert.notEqual(weightedDraw(1847, "f", 96), weightedDraw(1847, "f", 97));
  for (let t = 0; t < 200; t += 1) { const d = weightedDraw(4096, "x", t); assert.ok(d >= 0 && d < 1); }
});

test("weighted runs are deterministic, legal, recorded, and ignore the vendor's choice", () => {
  const a = run({ brainTaxStep: reasoner, context: stubContextEcho(), cap: 1000, weighted: true });
  const b = run({ brainTaxStep: { ...reasoner, decide: (r) => ({ raw: JSON.stringify({ reason: "caution", choice: "down" }), latencyMs: 0 }) }, context: stubContextEcho(), cap: 1000, weighted: true });
  assert.ok(a.trace.length > 0);
  assert.equal(a.hash, b.hash);
  assert.deepEqual(a.trace.map((e) => e.ai.finalChoice), b.trace.map((e) => e.ai.finalChoice));
  for (const { ai, tick, factionId } of a.trace) {
    const w = ai.weighted!;
    assert.equal(ai.finalChoice, w.sampled);
    assert.equal(sampleChoice(w.distribution, w.legal, w.draw), w.sampled);
    assert.equal(w.draw, weightedDraw(1847, factionId, tick));
    assert.equal(ai.reasonSource, "model");
    assert.equal(ai.parsedChoice, null);
  }
});

test("past the cap or with a bad reason, the choice still samples and the template writes the reason", () => {
  const capped = run({ brainTaxStep: reasoner, context: stubContextEcho(), cap: 0, weighted: true });
  const full = run({ brainTaxStep: reasoner, context: stubContextEcho(), cap: 1000, weighted: true });
  assert.equal(capped.hash, full.hash);
  for (const { ai } of capped.trace) {
    assert.equal(ai.fallbackReason, "cap");
    assert.equal(ai.reasonSource, "template");
    assert.equal(ai.reasonCheck!.status, "named");
  }
  const bad = run({ brainTaxStep: { ...reasoner, decide: () => ({ raw: "nonsense", latencyMs: 0 }) }, context: stubContextEcho(), cap: 1000, weighted: true });
  assert.equal(bad.hash, full.hash);
  assert.ok(bad.trace.every((e) => e.ai.fallbackReason === "illegal" && e.ai.reasonSource === "template"));
  assert.match(templateReason("up", HAWK, false, false), /high aggression and high ambition; .*so raise\./);
});

test("a weighted run replays exactly from its trace", () => {
  const live = run({ brainTaxStep: reasoner, context: stubContextEcho(), cap: 10, weighted: true }, 4096);
  const replay = replayFromTrace(live.trace);
  const again = run({ brainTaxStep: replay.brain, context: replay.context, cap: 10, weighted: true }, 4096);
  assert.equal(again.hash, live.hash);
  const report = replay.report(again.trace);
  assert.equal(report.traceMatches, true);
  assert.equal(report.missingBrain + report.missingContext, 0);
});

test("the reason-only DeepSeek prompt states the drawn choice and asks for a reason only", () => {
  const request: TaxStepRequest = {
    tick: 96, factionId: "f", holderId: "h", rateCents: 12, pressed: true, short: false, lowestStabilityThousandths: 300,
    treasuryCents: 500, freeMates: 2, options: ALL, scorerChoice: "down", promptVersion: "v", persona: HAWK, payDaysCovered: 3,
    briefing: "b", chosen: "hold", escalation: "loyalty read breaking",
  };
  const body = JSON.parse(deepSeekRequestBody(request));
  const user: string = body.messages[1].content;
  assert.match(user, /You have decided: hold = keep the rate/);
  assert.match(user, /loyalty read breaking/);
  assert.doesNotMatch(body.messages[0].content, /choice/);
  assert.deepEqual(railedOptions(ALL, true, false), ["down", "hold"]);
});
