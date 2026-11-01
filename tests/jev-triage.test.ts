import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fetchAttempts } from "./helpers/no-network.ts";
import { ActionPickerReplay, stubArgmaxPicker, stubScriptedPicker, stubUniformPicker, type ActionPickerRecord } from "../src/sim/ai-action-picker.ts";
import {
  ALWAYS_FLAG, BRAIN_PROMPT_VERSION, flaggedTests, NEVER_FLAG, parseBrainChoice, stubBrain, stubBrainLast, TRIAGE_BUDGET, TRIAGE_COOLDOWN_TICKS,
  TRIAGE_QUESTIONS, TRIAGE_TESTS, TRIAGE_THRESHOLD, TriageReplay, triageStep, type BrainRecord, type EscalationBrain, type TriageRecord,
} from "../src/sim/ai-triage.ts";
import { CostLedger } from "../src/sim/ai-vendor/cost.ts";
import { deepSeekEscalationBody, deepSeekEscalationBrain } from "../src/sim/ai-vendor/deepseek.ts";
import { jevActionPicker, jevPickerRequestBody } from "../src/sim/ai-vendor/jev.ts";
import { runTick, type TickAiOptions } from "../src/sim/engine.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";
import type { SimEvent } from "../src/sim/types.ts";
import { escalationCheck } from "../src/tools/triage-gate.ts";

type Rec = { tick: number; actorId: string; picker: ActionPickerRecord; triage?: TriageRecord; brain?: BrainRecord; chosen: string };
function run(ai: TickAiOptions | null, seed: number, ticks: number) {
  const world = createPrototypeWorld(seed);
  const records: Rec[] = []; const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i += 1) {
    for (const event of runTick(world, ai ? { ai } : {}).events) {
      events.push(event);
      const block = (event.data as { ai?: { picker?: ActionPickerRecord; triage?: TriageRecord; brain?: BrainRecord } })?.ai;
      const c = (event.data as { chosen?: { action: string; targetId?: string; resource?: string } }).chosen;
      if (block?.picker) records.push({ tick: event.tick, actorId: event.actorId!, picker: block.picker, triage: block.triage, brain: block.brain, chosen: `${c!.action}:${c!.targetId ?? "-"}:${c!.resource ?? "-"}` });
    }
  }
  return { hash: stateHash(world), records, events };
}
const always = (brain: EscalationBrain = stubBrainLast()): TickAiOptions => ({ picker: stubArgmaxPicker(), triage: { brain, noul: ALWAYS_FLAG } });

test("question wording and threshold constants match jev-triage.md §1 and §6", () => {
  assert.deepEqual([...TRIAGE_TESTS], ["port_holding", "faction_number", "allegiance_freedom", "broken_promise"]);
  assert.equal(TRIAGE_THRESHOLD, 0.6);
  assert.equal(TRIAGE_BUDGET, 50);
  assert.equal(TRIAGE_COOLDOWN_TICKS, 24);
  assert.ok(TRIAGE_QUESTIONS.port_holding.instructions.startsWith("Could the outcome of this situation change which faction or person holds a port"));
  assert.ok(TRIAGE_QUESTIONS.faction_number.instructions.endsWith("A single person's trade, wage, purchase, ransom or contract payment is not faction-wide."));
  assert.ok(TRIAGE_QUESTIONS.allegiance_freedom.instructions.endsWith("A grudge, a mood or a relationship change on its own is not enough."));
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

test("no triage under a hard test: a legal raid or claim-settlement is never triaged", () => {
  const on = run(always(), 1847, 1200);
  assert.ok(on.records.length > 0);
  for (const r of on.records) assert.ok(!r.picker.legal.some((id) => id.startsWith("raid:") || id.startsWith("claim-settlement:")));
  const hard = on.events.filter((e) => e.type === "decision-made" && e.actorId === "character-14" && ((e.data as { candidates: Array<{ action: string; score: number }> }).candidates ?? []).some((c) => c.score > -1000 && (c.action === "raid" || c.action === "claim-settlement")));
  for (const e of hard) assert.equal((e.data as { ai?: { triage?: unknown } }).ai?.triage, undefined);
  for (const e of on.events) if (e.type === "tax-rate-set") assert.equal((e.data as { ai?: { triage?: unknown } }).ai?.triage, undefined);
});

test("illegal or length brain answers fall back to the picker's sample", () => {
  const illegal = run(always(stubBrain(() => "fly:moon:-")), 1847, 300);
  const esc = illegal.records.filter((r) => r.triage?.escalated);
  assert.ok(esc.length > 0);
  for (const r of esc) { assert.equal(r.brain!.fallbackReason, "illegal"); assert.equal(r.brain!.choice, r.picker.sampled); assert.equal(r.chosen, r.picker.sampled); }
  const ledger = new CostLedger(0.25);
  const body = JSON.stringify({ model: "deepseek-v4-pro", choices: [{ finish_reason: "length", message: { content: "{\"choice\":\"rest:-:-\"" } }], usage: { prompt_tokens: 100, completion_tokens: 64 } });
  const cut = run({ picker: stubArgmaxPicker(), triage: { brain: deepSeekEscalationBrain({ transport: () => ({ kind: "response", status: 200, body }), ledger, env: { DEEPSEEK_API_KEY: "test" } }), noul: ALWAYS_FLAG } }, 1847, 300);
  const cutEsc = cut.records.filter((r) => r.triage?.escalated);
  assert.ok(cutEsc.length > 0);
  for (const r of cutEsc) { assert.equal(r.brain!.fallbackReason, "illegal"); assert.equal(r.chosen, r.picker.sampled); }
  assert.ok(ledger.lines.every((l) => l.role === "brain.escalation" && l.fallbackReason === "illegal" && l.finishReason === "length"));
  assert.equal(fetchAttempts(), 0);
});

test("fallback order: timeout, error and cap use the picker's sample; a picker fallback means candidates[0]", () => {
  for (const kind of ["timeout", "error"] as const) {
    const ledger = new CostLedger(0.25);
    const on = run({ picker: stubUniformPicker(), triage: { brain: deepSeekEscalationBrain({ transport: () => ({ kind }), ledger, env: { DEEPSEEK_API_KEY: "test" } }), noul: ALWAYS_FLAG } }, 2718, 200);
    const esc = on.records.filter((r) => r.triage?.escalated);
    assert.ok(esc.length > 0);
    for (const r of esc) { assert.equal(r.brain!.fallbackReason, kind); assert.equal(r.chosen, r.picker.sampled); }
  }
  const slow = run(always({ name: "slow", model: "stub", escalate: () => ({ raw: "{\"choice\":\"rest:-:-\"}", latencyMs: 30_001 }) }), 1847, 200);
  for (const r of slow.records.filter((r) => r.triage?.escalated)) assert.equal(r.brain!.fallbackReason, "timeout");
  const capLedger = new CostLedger(0);
  const capped = run({ picker: stubUniformPicker(), triage: { brain: deepSeekEscalationBrain({ transport: () => { throw new Error("never"); }, ledger: capLedger, env: { DEEPSEEK_API_KEY: "test" } }), noul: ALWAYS_FLAG } }, 1847, 200);
  for (const r of capped.records.filter((r) => r.triage?.escalated)) assert.equal(r.brain!.fallbackReason, "cap");
  // A failed picker yields no Nouls, so nothing flags; the row stays candidates[0].
  const broken = run({ picker: stubScriptedPicker(() => ({ probabilities: null, latencyMs: 0, error: "error" })), triage: { brain: stubBrainLast(), noul: ALWAYS_FLAG } }, 1847, 200);
  for (const r of broken.records) { assert.equal(r.triage!.escalated, false); assert.deepEqual(r.triage!.flagged, []); assert.equal(r.chosen, r.picker.scorerPick); }
  assert.equal(fetchAttempts(), 0);
});

test("the record shape under data.ai (§4.5)", () => {
  const on = run(always(), 1847, 200);
  const r = on.records.find((x) => x.triage?.escalated)!;
  assert.deepEqual(Object.keys(r.triage!).sort(), ["budgetLeft", "cooldownUntilTick", "escalated", "flagged", "noul", "promptVersion", "skipped", "threshold"]);
  assert.equal(r.triage!.threshold, 0.6);
  assert.deepEqual(r.triage!.flagged, ["port_holding"]);
  assert.equal(r.triage!.cooldownUntilTick, r.tick + 24);
  assert.deepEqual(Object.keys(r.brain!).sort(), ["choice", "fallbackReason", "inputHash", "latencyMs", "model", "outcome", "pickerSampled", "promptVersion", "provider", "raw", "role"]);
  assert.equal(r.brain!.promptVersion, BRAIN_PROMPT_VERSION);
  assert.equal(r.brain!.role, "brain.escalation");
  assert.match(r.brain!.inputHash, /^sha256:/);
  assert.equal(r.chosen, r.brain!.choice);
  const quiet = on.records.find((x) => x.triage && !x.triage.escalated)!;
  assert.equal(quiet.brain, undefined);
});

test("the Nouls ride on the picker's Jev request with the decision situation, and the cost line counts 4 questions", () => {
  const ledger = new CostLedger(0.05);
  const seen: string[] = [];
  const answers = (legal: string[]) => ({ next_action: { probabilities: Object.fromEntries(legal.map((id) => [id, 1 / legal.length])), confidence: 0.5 }, port_holding: { type: "noul", noul: 0.61 }, faction_number: { type: "noul", noul: 0.59 }, allegiance_freedom: { type: "noul", noul: 0.1 }, broken_promise: { type: "noul", noul: 0.02 } });
  const jev = jevActionPicker({ ledger, env: { JEV_API_KEY: "test" }, transport: (request) => {
    seen.push(request.body);
    const legal = JSON.parse(request.body).state.situation.facts.legalOptions;
    return { kind: "response", status: 200, body: JSON.stringify({ model: "jev-1.14.0", usage: { input_tokens: 900 }, answers: answers(legal) }) };
  } });
  const on = run({ picker: jev, triage: { brain: stubBrainLast() } }, 1847, 120);
  const sent = JSON.parse(seen[0]);
  assert.deepEqual(Object.keys(sent.questions), ["next_action", ...TRIAGE_TESTS]);
  assert.equal(sent.state.situation.kind, "decision");
  assert.equal(sent.state.situation.actorId, "character-14");
  assert.ok(Array.isArray(sent.state.situation.facts.legalOptions));
  assert.ok(ledger.lines.every((l) => l.role === "picker.action" && l.triageQuestions === 4));
  assert.equal(ledger.lines.length, on.records.length);
  const first = on.records[0];
  assert.deepEqual(first.triage!.noul, { port_holding: 0.61, faction_number: 0.59, allegiance_freedom: 0.1, broken_promise: 0.02 });
  assert.deepEqual(first.triage!.flagged, ["port_holding"]);
  assert.equal(jevPickerRequestBody({ tick: 0, actorId: "a", legal: [], criteria: {}, state: {}, promptVersion: "", scorerPick: "", scores: {} }).includes("port_holding"), false);
});

test("the brain request: system line, flagged tests and legal ids; parse accepts a legal id only", () => {
  const body = JSON.parse(deepSeekEscalationBody({ tick: 3, actorId: "character-14", name: "Pax Ash", persona: { ambition: 0.9 }, purse: 10, briefing: null, social: null, flagged: ["port_holding"], legal: ["rest:-:-", "work:-:-"], promptVersion: BRAIN_PROMPT_VERSION }));
  assert.equal(body.model, "deepseek-v4-pro"); assert.equal(body.max_tokens, 64); assert.equal(body.temperature, 0);
  assert.deepEqual(body.thinking, { type: "disabled" }); assert.deepEqual(body.response_format, { type: "json_object" });
  assert.match(body.messages[1].content, /flagged as weighty for: port_holding\./);
  assert.match(body.messages[1].content, /Legal options: rest:-:-, work:-:-/);
  assert.ok(body.messages[1].content.endsWith("Reply with one option id from the list as JSON."));
  assert.equal(parseBrainChoice("{\"choice\":\"work:-:-\"}", ["rest:-:-", "work:-:-"]), "work:-:-");
  assert.equal(parseBrainChoice("{\"choice\":\"raid:x:-\"}", ["rest:-:-"]), null);
  assert.equal(parseBrainChoice("nope", ["rest:-:-"]), null);
});

test("replay with zero calls: an always-flag run replays to its hash; a tampered record fails; WorldStore.recover matches", () => {
  const live = run(always(), 2718, 600);
  const pickerReplay = new ActionPickerReplay(live.records);
  const triageReplay = new TriageReplay(live.records);
  const again = run({ picker: pickerReplay, triage: { brain: triageReplay } }, 2718, 600);
  assert.equal(again.hash, live.hash);
  assert.equal(pickerReplay.calls + triageReplay.calls, 0);
  assert.equal(triageReplay.used, triageReplay.size);
  const i = live.records.findIndex((r) => r.triage?.escalated);
  const tampered = live.records.map((r, j) => (j === i ? { ...r, brain: { ...r.brain!, inputHash: "sha256:x" } } : r));
  assert.throws(() => run({ picker: new ActionPickerReplay(live.records), triage: { brain: new TriageReplay(tampered) } }, 2718, 600), /brain inputHash mismatch/);
  const quiet = live.records.map((r, j) => (j === i ? { ...r, triage: { ...r.triage!, noul: NEVER_FLAG() } } : r));
  assert.throws(() => run({ picker: new ActionPickerReplay(live.records), triage: { brain: new TriageReplay(quiet) } }, 2718, 600), /triage replay/);
  const directory = mkdtempSync(join(tmpdir(), "open-era-triage-recover-"));
  try {
    const store = new WorldStore(join(directory, "world.sqlite"));
    const split = createPrototypeWorld(2718);
    store.initialize(split);
    const options = always();
    while (split.tick < 197) store.appendTick(runTick(split, { ai: options }).events, split);
    const recovered = store.recover();
    assert.ok(recovered.replayedEvents > 0);
    assert.equal(stateHash(recovered.state), stateHash(split));
    store.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
  assert.equal(fetchAttempts(), 0);
});

test("caps: never more than 50 escalations, the brain ledger never passes its cap, one cost line per brain call", () => {
  const on = run(always(), 4096, 1200);
  assert.ok(on.records.filter((r) => r.triage?.escalated).length <= TRIAGE_BUDGET);
  const small = run({ picker: stubArgmaxPicker(), triage: { brain: stubBrainLast(), noul: ALWAYS_FLAG, budget: 3 } }, 1847, 600);
  assert.equal(small.records.filter((r) => r.triage?.escalated).length, 3);
  const ledger = new CostLedger(0.004);
  const body = JSON.stringify({ model: "deepseek-v4-pro", choices: [{ finish_reason: "stop", message: { content: "{\"choice\":\"rest:-:-\"}" } }], usage: { prompt_cache_miss_tokens: 1000, prompt_tokens: 1000, completion_tokens: 10 } });
  const ai: TickAiOptions = { picker: stubArgmaxPicker(), triage: { brain: deepSeekEscalationBrain({ transport: () => ({ kind: "response", status: 200, body }), ledger, env: { DEEPSEEK_API_KEY: "test" } }), noul: ALWAYS_FLAG } };
  const priced = run(ai, 1847, 1200);
  assert.ok(ledger.spendUsd <= ledger.capUsd);
  assert.ok(priced.records.some((r) => r.brain?.fallbackReason === "cap"));
  assert.equal(ledger.lines.length, ai.brainCalls);
  assert.ok(ledger.lines.every((l) => l.role === "brain.escalation"));
});

test("gate items 2–3: flag off keeps the pins, and a never-flag triage stub equals picker-only", () => {
  const off = run(null, 1847, 72);
  assert.equal(off.hash.slice(0, 8), "66e8ccb7");
  assert.ok(off.events.every((e) => !(e.data as { ai?: unknown }).ai));
  for (const seed of [1847, 4096]) {
    const pickerOnly = run({ picker: stubUniformPicker() }, seed, 600);
    const never = run({ picker: stubUniformPicker(), triage: { brain: stubBrainLast(), noul: NEVER_FLAG } }, seed, 600);
    assert.equal(never.hash, pickerOnly.hash);
    assert.ok(never.records.every((r) => r.triage && !r.triage.escalated));
  }
  const argmax = run({ picker: stubArgmaxPicker(), triage: { brain: stubBrainLast(), noul: NEVER_FLAG } }, 1847, 1200);
  assert.equal(argmax.hash.slice(0, 8), "b51aa07a");
});

test("gate item 4: an always-flag stub makes exactly min(50, eligible) escalations, cooldown kept, every choice legal or fallen back", () => {
  const on = run(always(), 1847, 1200);
  const check = escalationCheck(on.events);
  assert.equal(check.escalations, check.expected);
  assert.equal(check.cooldownBreaks, 0);
  assert.equal(check.brainNotLegalOrFallback, 0);
  assert.equal(check.railBreaks, 0);
  const all = run({ picker: stubArgmaxPicker(), pickerActors: "all", triage: { brain: stubBrainLast(), noul: ALWAYS_FLAG } }, 2718, 300);
  const many = escalationCheck(all.events);
  assert.equal(many.expected, TRIAGE_BUDGET);
  assert.equal(many.escalations, TRIAGE_BUDGET);
  assert.equal(many.cooldownBreaks, 0);
});
