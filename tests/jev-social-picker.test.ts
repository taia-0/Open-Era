import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fetchAttempts } from "./helpers/no-network.ts";
import { ActionPickerReplay, pickerState, stubArgmaxPicker, stubUniformPicker, type ActionPickerRecord } from "../src/sim/ai-action-picker.ts";
import {
  railRead, READ_PROMPT_VERSION, SOCIAL_GRUDGE_CRITERIA, SOCIAL_GRUDGE_INSTRUCTIONS, SOCIAL_LOYALTY_CRITERIA, SOCIAL_LOYALTY_INSTRUCTIONS, SOCIAL_PICK_INSTRUCTIONS,
  SOCIAL_STATE_MAX_BYTES, socialFromAnswer, socialReadRequest, SocialReplay, stubSocialFromTraits, type SocialReader, type SocialReadRecord,
} from "../src/sim/ai-social.ts";
import { CostLedger } from "../src/sim/ai-vendor/cost.ts";
import { jevActionPicker, jevSocialReader } from "../src/sim/ai-vendor/jev.ts";
import { runTick, type TickAiOptions } from "../src/sim/engine.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { canonicalJson, stateHash } from "../src/sim/state.ts";
import { aiSummary, memberEntropy } from "../src/tools/social-gate.ts";
import type { SimEvent } from "../src/sim/types.ts";

type Rec = { tick: number; actorId: string; picker: ActionPickerRecord; read?: SocialReadRecord };
function run(ai: TickAiOptions | null, seed: number, ticks: number, onTick?: (members: Set<string>, events: SimEvent[]) => void) {
  const world = createPrototypeWorld(seed);
  const records: Rec[] = []; const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i += 1) {
    const before = new Set(Object.values(world.characters).filter((c) => c.factionId === "free-tide").map((c) => c.id));
    const tickEvents = runTick(world, ai ? { ai } : {}).events;
    onTick?.(before, tickEvents);
    for (const event of tickEvents) {
      events.push(event);
      const block = (event.data as { ai?: { picker?: ActionPickerRecord; read?: SocialReadRecord } })?.ai;
      if (block?.picker) records.push({ tick: event.tick, actorId: event.actorId!, picker: block.picker, ...(block.read ? { read: block.read } : {}) });
    }
  }
  return { hash: stateHash(world), records, events, world };
}
const social = (reader: SocialReader = stubSocialFromTraits()): TickAiOptions => ({ picker: stubUniformPicker(), social: reader });

test("1. pick state with social holds 2,560 bytes; truncation drops situation, ports, then grudges from the last, never loyalty", () => {
  const world = createPrototypeWorld(1847);
  const character = world.characters["character-14"];
  const loyalty = { firm: 0.2, wavering: 0.5, breaking: 0.3, confidence: 0.6 };
  const grudges = [0, 1, 2].map((i) => ({ id: `character-${i}-${"x".repeat(60)}`, low: 0.2, mid: 0.3, high: 0.5, confidence: 0.4 }));
  const full = pickerState(world, character, undefined, { loyalty, grudges }, SOCIAL_STATE_MAX_BYTES);
  assert.ok(Buffer.byteLength(canonicalJson(full.state)) <= SOCIAL_STATE_MAX_BYTES);
  const tiny = pickerState(world, character, undefined, { loyalty, grudges }, 200);
  assert.equal(tiny.truncated, true);
  assert.equal(tiny.state.situation, undefined);
  assert.deepEqual((tiny.state.social as { loyalty: unknown }).loyalty, loyalty);
  assert.deepEqual((tiny.state.social as { grudges: unknown[] }).grudges, []);
  const mid = pickerState(world, character, undefined, { loyalty, grudges }, Buffer.byteLength(canonicalJson(full.state)) - 10);
  const kept = (mid.state.social as { grudges: Array<{ id: string }> }).grudges;
  if (mid.state.situation === undefined && kept.length < 3) assert.deepEqual(kept.map((g) => g.id), grudges.slice(0, kept.length).map((g) => g.id));
  const nullSocial = pickerState(world, character, undefined, null, SOCIAL_STATE_MAX_BYTES);
  assert.equal(nullSocial.state.social, null);
});

test("2. flag off: the 72-tick fixture and no data.ai.read anywhere", () => {
  const off = run(null, 1847, 72);
  assert.equal(off.hash.slice(0, 8), "6efa334f");
  assert.equal(off.events.length, 8496);
  assert.ok(off.events.every((e) => !(e.data as { ai?: unknown }).ai));
});

test("3. stubArgmax with social reads for all members: flag-off hashes at 72 and 1,200 ticks; sampled is always the scorer's pick", () => {
  const short = run({ picker: stubArgmaxPicker(), social: stubSocialFromTraits() }, 1847, 72);
  assert.equal(short.hash.slice(0, 8), "6efa334f");
  const long = run({ picker: stubArgmaxPicker(), social: stubSocialFromTraits() }, 1847, 1200);
  assert.equal(long.hash.slice(0, 8), "f80c529f");
  assert.equal(long.events.length, 165833);
  assert.ok(long.records.length > 4000);
  assert.ok(long.records.every((r) => r.picker.sampled === r.picker.scorerPick && r.read));
  assert.ok(new Set(long.records.map((r) => r.actorId)).size > 1);
});

test("4. stubUniform + trait reads: deterministic, only members consulted (a deserter stops), member entropy above flag off", () => {
  const offending: string[] = [];
  const check = (members: Set<string>, events: SimEvent[]) => {
    for (const e of events) if ((e.data as { ai?: unknown }).ai && !members.has(e.actorId!)) offending.push(`${e.tick}:${e.actorId}`);
  };
  const a = run(social(), 4096, 1200, check);
  const b = run(social(), 4096, 1200);
  assert.equal(a.hash, b.hash);
  assert.deepEqual(offending, []);
  const off = run(null, 4096, 1200);
  assert.ok(memberEntropy(a.events) > memberEntropy(off.events));
  // Members who left Free Tide make later decisions with no consult.
  const left = Object.values(a.world.characters).filter((c) => /^character-(1[4-9]|2[0-2])$/.test(c.id) && c.factionId !== "free-tide").map((c) => c.id);
  assert.ok(left.length > 0);
  for (const id of left) {
    const last = Math.max(...a.records.filter((r) => r.actorId === id).map((r) => r.tick), -1);
    assert.ok(a.events.some((e) => e.type === "decision-made" && e.actorId === id && e.tick > last && !(e.data as { ai?: unknown }).ai));
  }
});

test("5. read questions: exact wording and criteria; 1 + min(3, grudges) questions; pick instructions", () => {
  assert.equal(SOCIAL_PICK_INSTRUCTIONS, "You are this character. Given your temperament, purse, crew, your loyalty and grudges, and what you know, which one of these actions would you most likely take now?");
  const world = createPrototypeWorld(1847);
  for (const id of ["character-14", "character-18", "character-22"]) {
    const built = socialReadRequest(world, id)!;
    const names = Object.keys(built.request.questions);
    assert.equal(names.length, 1 + Math.min(3, built.request.state.briefing.grudges.length));
    assert.equal(built.request.questions.loyaltyRead.instructions, SOCIAL_LOYALTY_INSTRUCTIONS);
    assert.deepEqual(built.request.questions.loyaltyRead.criteria, SOCIAL_LOYALTY_CRITERIA);
    built.request.state.briefing.grudges.slice(0, 3).forEach((g, i) => {
      assert.equal(built.request.questions[`grudge_${i}`].instructions, SOCIAL_GRUDGE_INSTRUCTIONS.replace("${id}", g.id));
      assert.deepEqual(built.request.questions[`grudge_${i}`].criteria, SOCIAL_GRUDGE_CRITERIA);
    });
    assert.equal(built.request.promptVersion, READ_PROMPT_VERSION);
  }
});

test("6. cache: hits within 24 ticks on an unchanged signature, misses otherwise; hits write no cost line; failed reads are not cached", () => {
  const reader = stubSocialFromTraits();
  const on = run(social(reader), 1847, 300);
  const reads = on.records.map((r) => r.read!);
  const misses = reads.filter((r) => !r.hit);
  assert.equal(misses.length, reader.calls);
  assert.ok(reads.some((r) => r.hit));
  for (const r of on.records) if (r.read!.hit) {
    assert.ok(r.tick - r.read!.readTick < 24);
    assert.deepEqual(Object.keys(r.read!).sort(), ["cacheKey", "hit", "readTick", "role"]);
  }
  // Same member, same key, back to back within 24 ticks → the later one must be a hit.
  const last = new Map<string, Rec>();
  for (const r of on.records) {
    const prev = last.get(r.actorId);
    if (prev && prev.read!.cacheKey === r.read!.cacheKey && r.tick - (prev.read!.hit ? prev.read!.readTick : prev.tick) < 24) assert.equal(r.read!.hit, true);
    last.set(r.actorId, r);
  }
  const failing: SocialReader = { name: "fail", model: "x", read: () => ({ answers: null, latencyMs: 0, error: "error" }) };
  const failed = run(social(failing), 1847, 150);
  assert.ok(failed.records.length > 0 && failed.records.every((r) => r.read && !r.read.hit && r.read.fallbackReason === "error"));
  // Jev reader + picker: one cost line per call, by role; hits none.
  const ledger = new CostLedger(0.35);
  const pickBody = JSON.stringify({ model: "jev-1.14.0", usage: { input_tokens: 900, output_tokens: 3 }, answers: { next_action: { choice: "x", probabilities: {}, confidence: 0.5 } } });
  const readBody = JSON.stringify({ model: "jev-1.14.0", usage: { input_tokens: 500, output_tokens: 3 }, answers: { loyaltyRead: { choice: "firm", probabilities: { firm: 0.2, wavering: 0.5, breaking: 0.3 }, confidence: 0.5 } } });
  const ai: TickAiOptions = {
    picker: jevActionPicker({ transport: () => ({ kind: "response", status: 200, body: pickBody }), ledger, env: { JEV_API_KEY: "test" } }),
    social: jevSocialReader({ transport: () => ({ kind: "response", status: 200, body: readBody }), ledger, env: { JEV_API_KEY: "test" } }),
  };
  const jev = run(ai, 1847, 100);
  const roles = (role: string) => ledger.lines.filter((l) => l.role === role).length;
  assert.equal(roles("picker.social"), jev.records.filter((r) => !r.read!.hit).length);
  assert.equal(roles("picker.action"), jev.records.filter((r) => r.picker.fallbackReason !== "illegal" || r.picker.provider === "jev").length);
  assert.equal(ledger.lines.length, ai.pickerCalls);
  assert.equal(fetchAttempts(), 0);
});

test("7. read rails: garbage labels, NaN and zero sums become null; a failed read gives a pick with social: null", () => {
  assert.equal(railRead({ probabilities: { loyal: 1, maybe: 0.5 } }, ["firm", "wavering", "breaking"]), null);
  assert.equal(railRead({ probabilities: { firm: Number.NaN, wavering: 0, breaking: 0 } }, ["firm", "wavering", "breaking"]), null);
  assert.equal(railRead({ probabilities: "firm" }, ["firm", "wavering", "breaking"]), null);
  assert.deepEqual(railRead({ probabilities: { firm: 2, wavering: 1, breaking: 1, bogus: 9 }, confidence: Number.NaN }, ["firm", "wavering", "breaking"]),
    { firm: 0, wavering: 0.5, breaking: 0.5, confidence: null });
  const world = createPrototypeWorld(1847);
  const { request } = socialReadRequest(world, "character-14")!;
  assert.equal(socialFromAnswer(request, { answers: { loyaltyRead: { probabilities: { x: 1 } } }, latencyMs: 0 }), null);
  let seen: unknown = "unset";
  const picker = stubUniformPicker();
  const spy = { ...picker, choose: (req: Parameters<typeof picker.choose>[0]) => { seen = req.state.social; return picker.choose(req); } };
  const garbage: SocialReader = { name: "g", model: "g", read: () => ({ answers: { loyaltyRead: { probabilities: { nope: 1 } } }, latencyMs: 0 }) };
  const on = run({ picker: spy, social: garbage }, 1847, 40);
  assert.ok(on.records.length > 0);
  assert.equal(seen, null);
  assert.ok(on.records.every((r) => r.read!.fallbackReason === "illegal"));
});

test("8. slice 3 rails and skips hold for all members", () => {
  const on = run(social(), 2718, 600);
  for (const { picker } of on.records) {
    assert.ok(picker.legal.length >= 2);
    assert.equal(new Set(picker.legal).size, picker.legal.length);
    assert.ok(picker.legal.includes(picker.sampled));
    assert.ok(!picker.legal.some((id) => id.startsWith("raid:") || id.startsWith("claim-settlement:")));
  }
  for (const e of on.events) if (e.type === "decision-made" && e.data.goal === "haul") assert.equal((e.data as { ai?: unknown }).ai, undefined);
  assert.equal(aiSummary(on.events).railBreaks, 0);
  assert.equal(aiSummary(on.events).picksWithoutRead, 0);
});

test("9. replay rebuilds the cache and reaches the hash with zero calls; a flipped hit or inputHash fails", () => {
  const live = run(social(), 2718, 400);
  const replayOf = (records: Rec[]): TickAiOptions => ({
    picker: new ActionPickerReplay(records),
    social: new SocialReplay(records.filter((r) => r.read).map((r) => ({ tick: r.tick, actorId: r.actorId, read: r.read! }))),
  });
  const ai = replayOf(live.records);
  const again = run(ai, 2718, 400);
  assert.equal(again.hash, live.hash);
  assert.equal((ai.picker as ActionPickerReplay).calls, 0);
  assert.equal((ai.social as SocialReplay).calls, 0);
  const firstHit = live.records.findIndex((r) => r.read!.hit);
  const flipped = live.records.map((r, i) => (i === firstHit ? { ...r, read: { ...r.read!, hit: false } } : r));
  assert.throws(() => run(replayOf(flipped), 2718, 400), /hit/);
  const firstMiss = live.records.findIndex((r) => !r.read!.hit);
  const tampered = live.records.map((r, i) => (i === firstMiss ? { ...r, read: { ...r.read!, inputHash: "x" } } : r));
  assert.throws(() => run(replayOf(tampered), 2718, 400), /inputHash/);
  assert.equal(fetchAttempts(), 0);
});

test("9b. WorldStore.recover mid-run with the social picker on matches the continuous run", () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-social-recover-"));
  try {
    const continuous = createPrototypeWorld(1847);
    const options = { ai: social() };
    for (let i = 0; i < 230; i += 1) runTick(continuous, options);
    const store = new WorldStore(join(directory, "world.sqlite"));
    const split = createPrototypeWorld(1847);
    store.initialize(split);
    const splitOptions = { ai: social() };
    while (split.tick < 197) store.appendTick(runTick(split, splitOptions).events, split);
    const live = stateHash(split);
    const recovered = store.recover();
    assert.ok(recovered.replayedEvents > 0);
    assert.equal(stateHash(recovered.state), live);
    const world = recovered.state;
    // The read cache is run-local, so the resumed run carries it on (§5: it is not world state).
    while (world.tick < 230) store.appendTick(runTick(world, splitOptions).events, world);
    assert.equal(stateHash(world), stateHash(continuous));
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("10. caps: past the call cap or the spend cap → cap; reads are skipped before picks near the cap", () => {
  const reader = stubSocialFromTraits();
  const ai: TickAiOptions = { ...social(reader), pickerCap: 9 };
  const on = run(ai, 1847, 200);
  assert.ok((ai.pickerCalls ?? 0) <= 9);
  assert.ok(on.records.some((r) => r.read!.fallbackReason === "cap"));
  assert.ok(on.records.some((r) => r.picker.fallbackReason === "cap"));
  // When one call is left a read is skipped and the pick still runs.
  const lastCall = on.records.find((r) => !r.read!.hit && r.read!.fallbackReason === "cap" && r.picker.fallbackReason !== "cap");
  assert.ok(lastCall);
  const ledger = new CostLedger(0.0005);
  const pickBody = JSON.stringify({ model: "jev-1.14.0", usage: { input_tokens: 900, output_tokens: 3 }, answers: { next_action: { choice: "x", probabilities: {}, confidence: 0.5 } } });
  const readBody = JSON.stringify({ model: "jev-1.14.0", usage: { input_tokens: 500, output_tokens: 3 }, answers: { loyaltyRead: { probabilities: { firm: 1, wavering: 0, breaking: 0 }, confidence: 0.5 } } });
  const jev = run({
    picker: jevActionPicker({ transport: () => ({ kind: "response", status: 200, body: pickBody }), ledger, env: { JEV_API_KEY: "test" } }),
    social: jevSocialReader({ transport: () => ({ kind: "response", status: 200, body: readBody }), ledger, env: { JEV_API_KEY: "test" } }),
  }, 1847, 200);
  assert.ok(jev.records.some((r) => r.read!.fallbackReason === "cap"));
  assert.ok(ledger.spendUsd <= ledger.capUsd);
  assert.equal(fetchAttempts(), 0);
});
