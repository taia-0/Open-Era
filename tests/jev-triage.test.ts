import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fetchAttempts } from "./helpers/no-network.ts";
import { stubArgmaxPicker, stubUniformPicker, type ActionPicker, type PickerRequest } from "../src/sim/ai-action-picker.ts";
import {
  ALWAYS_FLAG, alwaysScorer, TRIAGE_KIND_BUDGETS, BRAIN_PROMPT_VERSION, flaggedTests, kindScorer, NEVER_FLAG, neverScorer, parseBrainProceed, BRAIN_PRIOR, BRAIN_WEIGHT, stubBrain, stubBrainLast, stubBrainOther, stubScorer,
  TRIAGE_BUDGET, TRIAGE_COOLDOWN_TICKS, TRIAGE_KINDS, TRIAGE_QUESTIONS, TRIAGE_TESTS, TRIAGE_THRESHOLD, TriageReplay, triageStep, type EscalationBrain, type TriageEntry, type TriageScorer,
} from "../src/sim/ai-triage.ts";
import { CostLedger } from "../src/sim/ai-vendor/cost.ts";
import { deepSeekEscalationBody, deepSeekEscalationBrain } from "../src/sim/ai-vendor/deepseek.ts";
import { jevActionPicker, jevPickerRequestBody, jevTriageScorer } from "../src/sim/ai-vendor/jev.ts";
import { runTick, type TickAiOptions } from "../src/sim/engine.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";
import type { SimEvent } from "../src/sim/types.ts";
import { escalationCheck } from "../src/tools/triage-gate.ts";

function run(ai: TickAiOptions | null, seed: number, ticks: number) {
  const world = createPrototypeWorld(seed);
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i += 1) for (const event of runTick(world, ai ? { ai } : {}).events) events.push(event);
  return { hash: stateHash(world), events, triage: (ai?.triageLog ?? []) as TriageEntry[], world };
}
const tri = (scorer: TriageScorer, brain: EscalationBrain = stubBrainLast(), extra: Partial<NonNullable<TickAiOptions["triage"]>> = {}, picker: ActionPicker | null = stubArgmaxPicker()): TickAiOptions =>
  ({ ...(picker ? { picker } : {}), triage: { scorer, brain, ...extra } });

test("question wording, threshold and the decision kinds (jev-triage.md §1, §6; Lead rework)", () => {
  assert.deepEqual([...TRIAGE_TESTS], ["port_holding", "faction_number", "allegiance_freedom", "broken_promise"]);
  assert.deepEqual([...TRIAGE_KINDS], ["tax", "desertion", "secession", "claim", "contract-break"]);
  assert.equal(TRIAGE_THRESHOLD, 0.6);
  assert.equal(TRIAGE_BUDGET, 50);
  assert.equal(TRIAGE_COOLDOWN_TICKS, 24);
  assert.ok(TRIAGE_QUESTIONS.port_holding.instructions.startsWith("Could the outcome of this situation change which faction or person holds a port"));
  assert.ok(TRIAGE_QUESTIONS.broken_promise.instructions.endsWith("and no if they kept it or simply declined to accept it."));
  for (const q of Object.values(TRIAGE_QUESTIONS)) assert.equal(q.type, "noul");
});

test("the flag rule at 0.59, 0.60 and 0.61", () => {
  const at = (v: number) => flaggedTests({ port_holding: 0, faction_number: v, allegiance_freedom: 0, broken_promise: 0 });
  assert.deepEqual(at(0.59), []);
  assert.deepEqual(at(0.6), ["faction_number"]);
  assert.deepEqual(at(0.61), ["faction_number"]);
  assert.deepEqual(flaggedTests(null), []);
});

test("budget and cooldown: one escalation per actor per 24 ticks, none once the budget is spent", () => {
  const state = { budgetLeft: 2, cooldownUntil: {} as Record<string, number> };
  const flag = ALWAYS_FLAG();
  assert.equal(triageStep(state, "a", 0, flag).escalated, true);
  const cool = triageStep(state, "a", 23, flag);
  assert.equal(cool.escalated, false); assert.equal(cool.skipped, "cooldown");
  assert.equal(triageStep(state, "b", 23, flag).escalated, true);
  const spent = triageStep(state, "a", 24, flag);
  assert.equal(spent.escalated, false); assert.equal(spent.skipped, "budget"); assert.equal(spent.budgetLeft, 0);
  assert.equal(triageStep({ budgetLeft: 5, cooldownUntil: {} }, "a", 0, NEVER_FLAG()).escalated, false);
});

test("ruling 3: the picker's Choice request is byte-for-byte the picker-only request with triage on", () => {
  const capture = (bodies: string[]): ActionPicker => {
    const inner = stubArgmaxPicker();
    return { name: "capture", model: "stub", choose(request: PickerRequest) { bodies.push(jevPickerRequestBody(request)); return inner.choose(request); } };
  };
  for (const seed of [1847, 2718]) {
    const plain: string[] = []; const withTriage: string[] = [];
    const a = run({ picker: capture(plain) }, seed, 400);
    // Every kind flags and escalates, and the brain keeps the default: no pick may change, so every byte matches.
    const b = run(tri(kindScorer(), stubBrain(() => 1, "agree"), { prior: 1 }, capture(withTriage)), seed, 400);
    assert.ok(plain.length > 50);
    assert.ok(b.triage.filter((t) => t.triage.escalated).length > 0);
    assert.deepEqual(withTriage, plain);
    assert.equal(b.hash, a.hash);
    // With a never-flag scorer every request is identical, start to end, and the hash matches.
    const never: string[] = [];
    const c = run(tri(neverScorer(), stubBrainLast(), {}, capture(never)), seed, 400);
    assert.deepEqual(never, plain);
    assert.equal(c.hash, a.hash);
    for (const body of never) assert.equal(/port_holding|faction_number|allegiance_freedom|broken_promise/.test(body), false);
  }
});

test("ruling 1: every decision kind is scored, for every actor role, and routine moves are not", () => {
  const r = run(tri(neverScorer(), stubBrainLast(), {}, null), 1847, 1200);
  const kinds = new Set(r.triage.map((t) => t.triage.kind));
  for (const kind of TRIAGE_KINDS) assert.ok(kinds.has(kind), `kind ${kind} scored`);
  const roles = new Set(r.triage.map((t) => t.triage.actorRole));
  assert.ok(roles.size >= 3);
  assert.ok(r.triage.some((t) => t.actorId !== "character-14"));
  for (const t of r.triage) {
    // v2: only real decisions. A claim is scored only when the sim's own choice raids or claims; a tax step only when it changes the rate.
    if (t.triage.kind === "claim") assert.ok(t.triage.defaultChoice.startsWith("raid:") || t.triage.defaultChoice.startsWith("claim-settlement:"));
    if (t.triage.kind === "tax") { assert.ok(t.triage.legal.includes("hold")); assert.notEqual(t.triage.defaultChoice, "hold"); }
    if (t.triage.kind === "secession") assert.deepEqual(t.triage.legal, ["secede", "stay"]);
    if (t.triage.kind === "desertion") assert.deepEqual(t.triage.legal, ["desert", "stay"]);
    if (t.triage.kind === "contract-break") assert.deepEqual(t.triage.legal, ["break", "keep"]);
  }
  // Routine moves are not scored: every scored decision is one of the five kinds, and a claim decision always has a raid or claim legal (above).
  assert.ok(r.triage.every((t) => (TRIAGE_KINDS as readonly string[]).includes(t.triage.kind)));
  assert.ok(r.events.filter((e) => e.type === "decision-made").length > r.triage.filter((t) => t.triage.kind === "claim").length);
  assert.equal(r.hash.slice(0, 8), "b51aa07a");
});

test("the separate Jev scoring request: situation and the four Nouls only, one triage.score cost line per call", () => {
  const ledger = new CostLedger(0.05);
  const seen: string[] = [];
  const scorer = jevTriageScorer({ ledger, env: { JEV_API_KEY: "test" }, transport: (request) => {
    seen.push(request.body);
    return { kind: "response", status: 200, body: JSON.stringify({ model: "jev-1.14.0", usage: { input_tokens: 800 }, answers: { port_holding: { type: "noul", noul: 0.61 }, faction_number: { type: "noul", noul: 0.59 }, allegiance_freedom: { type: "noul", noul: 0.1 }, broken_promise: { type: "noul", noul: 0.02 } } }) };
  } });
  const ai = tri(scorer, stubBrainLast(), {}, null);
  const r = run(ai, 1847, 120);
  const sent = JSON.parse(seen[0]);
  assert.deepEqual(Object.keys(sent.questions), [...TRIAGE_TESTS]);
  assert.deepEqual(Object.keys(sent.state), ["situation"]);
  assert.ok(TRIAGE_KINDS.includes(sent.state.situation.kind));
  assert.ok(Array.isArray(sent.state.situation.facts.options));
  assert.ok(ledger.lines.every((l) => l.role === "triage.score"));
  assert.equal(ledger.lines.length, ai.triageCalls);
  assert.equal(r.triage.length, ai.triageCalls);
  assert.deepEqual(r.triage[0].triage.noul, { port_holding: 0.61, faction_number: 0.59, allegiance_freedom: 0.1, broken_promise: 0.02 });
  assert.deepEqual(r.triage[0].triage.flagged, ["port_holding"]);
  // A failed score never flags, and the default stands.
  const broken = run(tri(jevTriageScorer({ ledger: new CostLedger(0.05), env: { JEV_API_KEY: "test" }, transport: () => ({ kind: "timeout" }) }), stubBrainOther(), {}, null), 1847, 200);
  assert.ok(broken.triage.length > 0);
  for (const t of broken.triage) { assert.equal(t.triage.scoreOutcome, "timeout"); assert.equal(t.triage.escalated, false); assert.equal(t.applied, t.triage.defaultChoice); }
  assert.equal(broken.hash, run(null, 1847, 200).hash);
  // The scoring call cap: once reached, decisions score as "cap".
  const capped = run(tri(alwaysScorer(), stubBrainLast(), { scoreCap: 5 }, null), 1847, 300);
  assert.equal(capped.triage.filter((t) => t.triage.scoreOutcome === "model").length, 5);
  assert.ok(capped.triage.some((t) => t.triage.scoreOutcome === "cap"));
  assert.equal(fetchAttempts(), 0);
});

test("illegal, length, timeout, error and cap brain answers fall back to the default", () => {
  const check = (brain: EscalationBrain, reason: string) => {
    const r = run(tri(alwaysScorer(), brain, {}, null), 1847, 300);
    const esc = r.triage.filter((t) => t.triage.escalated);
    assert.ok(esc.length > 0);
    for (const t of esc) { assert.equal(t.brain!.fallbackReason, reason); assert.equal(t.applied, t.triage.defaultChoice); }
    assert.equal(r.hash, run(null, 1847, 300).hash);
  };
  check(stubBrain(() => null), "illegal");
  check({ name: "range", model: "stub", escalate: () => ({ raw: "{\"proceed\":1.5}", latencyMs: 0 }) }, "illegal");
  const lengthBody = JSON.stringify({ model: "deepseek-v4-pro", choices: [{ finish_reason: "length", message: { content: "{\"choice\":\"stay\"" } }], usage: { prompt_tokens: 100, completion_tokens: 64 } });
  check(deepSeekEscalationBrain({ transport: () => ({ kind: "response", status: 200, body: lengthBody }), ledger: new CostLedger(0.25), env: { DEEPSEEK_API_KEY: "test" } }), "illegal");
  for (const kind of ["timeout", "error"] as const) check(deepSeekEscalationBrain({ transport: () => ({ kind }), ledger: new CostLedger(0.25), env: { DEEPSEEK_API_KEY: "test" } }), kind);
  check({ name: "slow", model: "stub", escalate: () => ({ raw: JSON.stringify({ proceed: 0, reason: "slow" }), latencyMs: 30_001 }) }, "timeout");
  check(deepSeekEscalationBrain({ transport: () => { throw new Error("never"); }, ledger: new CostLedger(0), env: { DEEPSEEK_API_KEY: "test" } }), "cap");
  assert.equal(fetchAttempts(), 0);
});

test("escalations apply the brain's choice at each kind", () => {
  const r = run(tri(kindScorer(), stubBrainOther(), { budget: 1000, cooldownTicks: 0, prior: 0 }, null), 1847, 1200);
  const by = (kind: string) => r.triage.filter((t) => t.triage.kind === kind && t.triage.escalated);
  for (const kind of TRIAGE_KINDS) for (const t of by(kind)) { assert.notEqual(t.applied, t.triage.defaultChoice); assert.equal(t.applied, t.brain!.choice); }
  // A "stay" desertion leaves the member in the faction with no character-deserted event that morning.
  for (const t of by("desertion")) assert.equal(r.events.some((e) => e.type === "character-deserted" && e.tick === t.tick && e.actorId === t.actorId), false);
  for (const t of by("secession")) assert.equal(r.events.some((e) => e.type === "secession-declared" && e.tick === t.tick && e.actorId === t.actorId), false);
  for (const t of by("claim")) {
    const d = r.events.find((e) => e.type === "decision-made" && e.tick === t.tick && e.actorId === t.actorId)!;
    if ((d.data as { goal: string }).goal === "haul") continue; // a contract-break "keep" followed on the same decision
    const c = (d.data as { chosen: { action: string; targetId?: string; resource?: string } }).chosen;
    assert.equal(`${c.action}:${c.targetId ?? "-"}:${c.resource ?? "-"}`, t.applied);
  }
  assert.ok(by("claim").length > 0 && by("tax").length > 0);
});

test("the record shape and the brain request", () => {
  const r = run(tri(alwaysScorer(), stubBrainLast(), {}, null), 1847, 200);
  const e = r.triage.find((t) => t.triage.escalated)!;
  assert.deepEqual(Object.keys(e.triage).sort(), ["actorRole", "budgetLeft", "cooldownUntilTick", "defaultChoice", "escalated", "flagged", "inputHash", "kind", "legal", "noul", "promptVersion", "scoreOutcome", "skipped", "threshold"]);
  assert.equal(e.triage.cooldownUntilTick, e.tick + 24);
  assert.deepEqual(Object.keys(e.brain!).sort(), ["choice", "fallbackReason", "inputHash", "latencyMs", "alternative", "blend", "model", "outcome", "p", "pickerSampled", "prior", "promptVersion", "provider", "raw", "reason", "role", "u", "weight"].sort());
  assert.equal(e.brain!.promptVersion, BRAIN_PROMPT_VERSION);
  assert.equal(e.brain!.pickerSampled, e.triage.defaultChoice);
  const body = JSON.parse(deepSeekEscalationBody({ tick: 3, actorId: "character-14", kind: "secession", situation: { tick: 3, kind: "secession", actorId: "character-14", targetId: "free-tide", settlementId: "cinder-key", facts: { options: ["secede", "stay"] } }, name: "Pax Ash", persona: { ambition: 0.9 }, purse: 10, briefing: null, social: null, flagged: ["port_holding"], legal: ["secede", "stay"], defaultChoice: "secede", alternative: "stay", promptVersion: BRAIN_PROMPT_VERSION }));
  assert.equal(body.model, "deepseek-v4-pro"); assert.equal(body.max_tokens, 64); assert.equal(body.temperature, 0);
  assert.match(body.messages[1].content, /The decision \(secession\): /);
  assert.match(body.messages[1].content, /flagged as weighty for: port_holding\./);
  assert.equal(body.messages[1].content.includes("Legal options"), false);
  assert.equal(body.messages[1].content.includes("defaultChoice"), false);
  // v3: the brain does not pick; it answers a proceed probability and a reason.
  assert.deepEqual(parseBrainProceed("{\"proceed\":0.25,\"reason\":\"too risky\"}"), { p: 0.25, reason: "too risky" });
  assert.equal(parseBrainProceed("{\"proceed\":2}"), null);
  assert.equal(parseBrainProceed("{\"choice\":\"stay\"}"), null);
  assert.match(body.messages[1].content, /What you are about to do: secede\. If you do not go ahead: stay\./);
  const b = e.brain!;
  assert.equal(b.prior, BRAIN_PRIOR); assert.equal(b.weight, BRAIN_WEIGHT);
  assert.equal(b.blend, Math.round(((1 - BRAIN_WEIGHT) * BRAIN_PRIOR + BRAIN_WEIGHT * b.p!) * 1e6) / 1e6);
  assert.equal(b.choice, b.u! < b.blend! ? e.triage.defaultChoice : b.alternative);
});

test("replay with zero calls: an overriding run replays to its hash; a tampered record fails", () => {
  const ai = tri(kindScorer(), stubBrainOther(), { prior: 0 }, null);
  const live = run(ai, 2718, 600);
  assert.ok(live.triage.some((t) => t.triage.escalated));
  const replay = new TriageReplay(live.triage);
  const again = run({ triage: { scorer: replay, brain: replay } }, 2718, 600);
  assert.equal(again.hash, live.hash);
  assert.equal(replay.calls, 0);
  assert.equal(replay.used, replay.size);
  const i = live.triage.findIndex((t) => t.triage.escalated);
  const tampered = live.triage.map((t, j) => (j === i ? { ...t, brain: { ...t.brain!, inputHash: "sha256:x" } } : t));
  const bad = new TriageReplay(tampered);
  assert.throws(() => run({ triage: { scorer: bad, brain: bad } }, 2718, 600), /brain inputHash mismatch/);
  const quiet = live.triage.map((t, j) => (j === i ? { ...t, triage: { ...t.triage, noul: NEVER_FLAG() } } : t));
  const q = new TriageReplay(quiet);
  assert.throws(() => run({ triage: { scorer: q, brain: q } }, 2718, 600), /triage replay/);
  assert.equal(fetchAttempts(), 0);
});

test("v2: a brain-kept deserter is in the save, and WorldStore.recover matches a run whose brain overrides", () => {
  const ai = tri(kindScorer(), stubBrainOther(), { budget: 1000, cooldownTicks: 0, prior: 0 }, null);
  const directory = mkdtempSync(join(tmpdir(), "open-era-triage-recover-override-"));
  try {
    const store = new WorldStore(join(directory, "world.sqlite"));
    const world = createPrototypeWorld(1847);
    store.initialize(world);
    let kept = 0;
    // Through the first kept deserter (t846 on 1847), stopping off a day boundary so the log is replayed.
    while (world.tick < 875) {
      const events = runTick(world, { ai }).events;
      kept += events.filter((e) => e.type === "desertion-withheld").length;
      store.appendTick(events, world);
    }
    assert.ok(kept > 0, "a deserter was kept");
    const overrides = (ai.triageLog ?? []).filter((t) => t.triage.escalated && t.applied !== t.triage.defaultChoice);
    assert.ok(new Set(overrides.map((t) => t.triage.kind)).size >= 3);
    const recovered = store.recover();
    assert.equal(stateHash(recovered.state), stateHash(world));
    store.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("WorldStore.recover matches a triage run whose escalations agree with the default", () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-triage-recover-"));
  try {
    const store = new WorldStore(join(directory, "world.sqlite"));
    const split = createPrototypeWorld(2718);
    store.initialize(split);
    const ai = tri(alwaysScorer(), stubBrain(() => 1, "agree"), { prior: 1 }, stubUniformPicker());
    while (split.tick < 197) store.appendTick(runTick(split, { ai }).events, split);
    const recovered = store.recover();
    assert.ok(recovered.replayedEvents > 0);
    assert.equal(stateHash(recovered.state), stateHash(split));
    store.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("caps: never more than 50 escalations, the brain ledger never passes its cap, one cost line per brain call", () => {
  const on = run(tri(alwaysScorer(), stubBrainLast(), {}, null), 4096, 1200);
  assert.ok(on.triage.filter((t) => t.triage.escalated).length <= TRIAGE_BUDGET);
  const small = run(tri(alwaysScorer(), stubBrainLast(), { budget: 3 }, null), 1847, 600);
  assert.equal(small.triage.filter((t) => t.triage.escalated).length, 3);
  const ledger = new CostLedger(0.004);
  const body = JSON.stringify({ model: "deepseek-v4-pro", choices: [{ finish_reason: "stop", message: { content: "{\"choice\":\"hold\"}" } }], usage: { prompt_cache_miss_tokens: 1000, prompt_tokens: 1000, completion_tokens: 10 } });
  const ai = tri(alwaysScorer(), deepSeekEscalationBrain({ transport: () => ({ kind: "response", status: 200, body }), ledger, env: { DEEPSEEK_API_KEY: "test" } }), {}, null);
  const priced = run(ai, 1847, 1200);
  assert.ok(ledger.spendUsd <= ledger.capUsd);
  assert.ok(priced.triage.some((t) => t.brain?.fallbackReason === "cap"));
  assert.equal(ledger.lines.length, ai.brainCalls);
  assert.ok(ledger.lines.every((l) => l.role === "brain.escalation"));
});

test("gate items 2–3: flag off keeps the pins, and a never-flag triage stub equals picker-only", () => {
  const off = run(null, 1847, 72);
  assert.equal(off.hash.slice(0, 8), "66e8ccb7");
  assert.ok(off.events.every((e) => !(e.data as { ai?: unknown }).ai));
  for (const seed of [1847, 4096]) {
    const pickerOnly = run({ picker: stubUniformPicker() }, seed, 600);
    const never = run(tri(neverScorer(), stubBrainLast(), {}, stubUniformPicker()), seed, 600);
    assert.equal(never.hash, pickerOnly.hash);
    assert.ok(never.triage.length > 0 && never.triage.every((t) => !t.triage.escalated));
  }
  assert.equal(run(tri(neverScorer(), stubBrainLast()), 1847, 1200).hash.slice(0, 8), "b51aa07a");
});

test("gate item 4: an always-flag stub makes exactly min(50, eligible) escalations, cooldown kept, every choice legal or fallen back", () => {
  for (const seed of [1847, 2718]) {
    const on = run(tri(alwaysScorer(), stubBrainLast()), seed, 1200);
    const check = escalationCheck(on.triage);
    assert.ok(check.expected > 0 && check.expected <= TRIAGE_BUDGET);
    assert.equal(check.escalations, check.expected);
    for (const [kind, n] of Object.entries(check.escByKind)) assert.ok(n <= TRIAGE_KIND_BUDGETS[kind as keyof typeof TRIAGE_KIND_BUDGETS]);
    assert.equal(check.cooldownBreaks, 0);
    assert.equal(check.brainNotLegalOrFallback, 0);
    assert.equal(check.railBreaks, 0);
    assert.equal(check.defaultBreaks, 0);
  }
  // A shared pool when a number is given.
  const pool = run(tri(alwaysScorer(), stubBrainLast(), { budget: 50 }), 1847, 1200);
  const pc = escalationCheck(pool.triage, 50);
  assert.equal(pc.escalations, pc.expected);
  const custom = stubScorer((q) => (q.kind === "tax" ? { faction_number: 0.6 } : { faction_number: 0.59 }));
  const taxOnly = run(tri(custom, stubBrainLast(), {}, null), 1847, 600);
  assert.ok(taxOnly.triage.filter((t) => t.triage.escalated).every((t) => t.triage.kind === "tax"));
  assert.ok(taxOnly.triage.some((t) => t.triage.escalated));
});

test("v3: gated triage needs no scorer, the brain only nudges, and the gated run replays with zero calls", () => {
  const fetches = fetchAttempts();
  const ai: TickAiOptions = { triage: { brain: stubBrainOther() } };
  const live = run(ai, 1847, 800);
  const esc = live.triage.filter((t) => t.triage.escalated);
  assert.ok(esc.length > 0);
  for (const t of esc) { assert.equal(t.triage.scoreOutcome, "gated"); assert.equal(t.triage.legal.length, 2); }
  const overrides = esc.filter((t) => t.applied !== t.triage.defaultChoice).length / esc.length;
  // p = 0: blend = (1 − 0.3)·0.95 = 0.665, so about a third overrides, never all.
  assert.ok(overrides > 0.15 && overrides < 0.6, String(overrides));
  const replay = new TriageReplay(live.triage);
  assert.equal(run({ triage: { brain: replay } }, 1847, 800).hash, live.hash);
  assert.equal(replay.calls, 0);
  assert.equal(fetchAttempts(), fetches);
});
