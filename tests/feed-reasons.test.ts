import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { CostLedger } from "../src/sim/ai-vendor/cost.ts";
import type { SyncTransport } from "../src/sim/ai-vendor/sync-http.ts";
import { runTick } from "./helpers/exile-off.ts";
import {
  annotateFeedReasons, raidCause, FEED_REASON_CALL_CAP, FEED_REASON_CALL_CAP_EXILE, FEED_REASON_CAP_USD, feedReasonCallCap, buildFeedFacts, deepSeekFeedReasonWriter, feedReasonKind, feedReasonReplay, jevFeedReasonChecker,
  stubFeedReasonWriter, validateFeedReason, withFeedReason, type FeedReasonOptions, type FeedReasonRecord,
} from "../src/sim/feed-reasons.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";
import type { SimEvent } from "../src/sim/types.ts";

const FAKE_ENV = { DEEPSEEK_API_KEY: "test-not-a-key", JEV_API_KEY: "test-not-a-key" };
const facts = { event: "claim", tick: 58, actor: { name: "Dax Pike", faction: "Free Tide Compact" }, port: { name: "Glassport" }, garrison: 6, trigger: "the port surrendered and the claim was accepted" };
const reply = (reason: string) => JSON.stringify({ reason });

function run(seed: number, ticks: number, feedReasons?: FeedReasonOptions, exileRecovery = false) {
  const world = createPrototypeWorld(seed);
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...runTick(world, { ...(exileRecovery ? { exileRecovery: true } : {}), ...(feedReasons ? { ai: { feedReasons } } : {}) }).events);
  return { world, events };
}
const strip = (events: SimEvent[]) => JSON.stringify(events.map((e) => {
  const ai = e.data.ai as Record<string, unknown> | undefined;
  if (!ai?.reason) return e;
  const { reason: _reason, ...rest } = ai;
  const data = { ...e.data } as Record<string, unknown>;
  if (Object.keys(rest).length) data.ai = rest; else delete data.ai;
  return { ...e, data };
}));

test("acceptance 1–2: stub reasons on leave stateHash and every other byte of the events unchanged (72-tick pins)", () => {
  const pins: Record<number, string> = { 1847: "66e8ccb7", 2718: "b4ccedab", 4096: "b04c5ac4" };
  for (const seed of [1847, 2718, 4096]) {
    const off = run(seed, 72);
    const on = run(seed, 72, { writer: stubFeedReasonWriter() });
    assert.equal(stateHash(off.world).slice(0, 8), pins[seed]);
    assert.equal(stateHash(on.world), stateHash(off.world));
    assert.ok(off.events.every((e) => !(e.data.ai as { reason?: unknown } | undefined)?.reason));
    assert.ok(on.events.some((e) => (e.data.ai as { reason?: unknown } | undefined)?.reason));
    assert.equal(strip(on.events), JSON.stringify(off.events));
  }
});

test("acceptance 3: replay reuses the recorded text with zero writer calls and identical feed text", () => {
  const live = run(1847, 300, { writer: stubFeedReasonWriter() });
  let calls = 0;
  const replayed = run(1847, 300, { writer: { model: "x", write() { calls++; throw new Error("no calls in replay"); } }, replay: feedReasonReplay(live.events) });
  assert.equal(calls, 0);
  const feed = (r: typeof live) => r.events.filter((e) => feedReasonKind(e)).map((e) => withFeedReason("line", e)).join("\n");
  assert.equal(feed(replayed), feed(live));
  assert.equal(stateHash(replayed.world), stateHash(live.world));
});

test("acceptance 4: the validator rejects >20 words, unknown names, unknown numbers, bad JSON and pronouns", () => {
  assert.equal(validateFeedReason(reply("Dax Pike claimed Glassport after the port surrendered."), facts), "Dax Pike claimed Glassport after the port surrendered.");
  assert.equal(validateFeedReason(reply(Array(21).fill("Dax").join(" ")), facts), null);
  assert.equal(validateFeedReason(reply("Dax Pike claimed Glassport for Queen Mab."), facts), null);
  assert.equal(validateFeedReason(reply("Dax Pike claimed Glassport with 7 troops."), facts), null);
  assert.equal(validateFeedReason(reply("Dax Pike claimed Glassport with 6 troops."), facts), "Dax Pike claimed Glassport with 6 troops.");
  assert.equal(validateFeedReason("{not json", facts), null);
  assert.equal(validateFeedReason(JSON.stringify({ text: "x" }), facts), null);
  assert.equal(validateFeedReason(reply("Dax Pike claimed Glassport because she could."), facts), null);
});

test("each failure falls back to today's line with the right fallbackReason", () => {
  const event = (seq: number): SimEvent => ({ sequence: seq, tick: 5, type: "settlement-claimed", actorId: "character-01", settlementId: "glassport", data: { factionId: "free-tide", basis: "accepted-surrender" } } as SimEvent);
  const world = createPrototypeWorld(1847);
  const answers: SyncTransport[] = [
    () => ({ kind: "timeout" }),
    () => ({ kind: "error" }),
    () => ({ kind: "response", status: 200, body: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: reply("Nobody Known did it.") } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) }),
  ];
  const expected = ["timeout", "error", "illegal"];
  answers.forEach((transport, i) => {
    const e = event(i + 1);
    annotateFeedReasons(world, [e], { writer: deepSeekFeedReasonWriter({ transport, ledger: new CostLedger(0.1), env: FAKE_ENV }) });
    const r = (e.data.ai as { reason: FeedReasonRecord }).reason;
    assert.equal(r.outcome, "fallback"); assert.equal(r.fallbackReason, expected[i]); assert.equal(r.text, null);
    assert.equal(withFeedReason("Today's line.", e), "Today's line.");
  });
  const e = event(9);
  annotateFeedReasons(world, [e], { writer: deepSeekFeedReasonWriter({ transport: () => { throw new Error("no call"); }, ledger: new CostLedger(0.1), env: {} }) });
  assert.equal((e.data.ai as { reason: FeedReasonRecord }).reason.fallbackReason, "missing-key");
});

test("acceptance 5: past the spend cap or the call cap → fallback cap; spend never passes the cap; one cost line per call", () => {
  let sent = 0;
  const transport: SyncTransport = () => { sent++; return { kind: "response", status: 200, body: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: reply("Dax Pike acted.") } }], usage: { prompt_cache_miss_tokens: 300, prompt_cache_hit_tokens: 0, completion_tokens: 20 } }) }; };
  const ledger = new CostLedger(0.002);
  const writer = deepSeekFeedReasonWriter({ transport, ledger, env: FAKE_ENV, now: () => new Date("2026-10-31T12:00:00Z") });
  const r = run(1847, 400, { writer });
  const records = r.events.map((e) => (e.data.ai as { reason?: FeedReasonRecord } | undefined)?.reason).filter(Boolean) as FeedReasonRecord[];
  assert.ok(records.some((x) => x.fallbackReason === "cap"));
  assert.ok(ledger.spendUsd <= ledger.capUsd);
  assert.equal(ledger.lines.length, records.filter((x) => x.outcome !== "cached").length);
  assert.ok(ledger.lines.every((l) => l.role === "brain.feedReason"));
  assert.equal(sent, ledger.lines.filter((l) => l.status !== null).length);

  let calls = 0;
  const options: FeedReasonOptions = { writer: { model: "count", write() { calls++; return { raw: reply("Someone acted."), latencyMs: 0 }; } }, callCap: 3 };
  const capped = run(1847, 400, options);
  assert.equal(calls, 3);
  assert.ok(capped.events.some((e) => (e.data.ai as { reason?: FeedReasonRecord } | undefined)?.reason?.fallbackReason === "cap"));
});

test("Jev check is advisory: a flag is recorded and the text is kept", () => {
  const world = createPrototypeWorld(1847);
  const e = { sequence: 1, tick: 5, type: "settlement-claimed", actorId: "character-01", settlementId: "glassport", data: {} } as unknown as SimEvent;
  const name = world.characters["character-01"].name;
  const ledger = new CostLedger(0.1);
  annotateFeedReasons(world, [e], {
    writer: { model: "m", write: () => ({ raw: reply(`${name} claimed Glassport.`), latencyMs: 1 }) },
    check: true, checker: jevFeedReasonChecker({ transport: () => ({ kind: "response", status: 200, body: JSON.stringify({ answers: { invented: { noul: 0.9 } }, usage: { input_tokens: 400 } }) }), ledger, env: FAKE_ENV }),
  });
  const r = (e.data.ai as { reason: FeedReasonRecord }).reason;
  assert.equal(r.text, `${name} claimed Glassport.`);
  assert.deepEqual(r.check, { noul: 0.9, flagged: true, outcome: "model" });
  assert.equal(ledger.lines[0].role, "check.feedReason");
});

test("EXILE_RECOVERY on: home-port raids carry the claim as trigger; off: no cause recorded", () => {
  const on = run(1847, 400, { writer: stubFeedReasonWriter(), exileRecovery: true }, true);
  const raidFacts = (r: typeof on) => r.events.filter((e) => feedReasonKind(e) === "raid").map((e) => (e.data.ai as { reason: FeedReasonRecord }).reason.text ?? "");
  assert.ok(raidFacts(on).some((t) => /to win back [A-Z][\w ]+, lost to [A-Z]/.test(t)));
  const off = run(1847, 400, { writer: stubFeedReasonWriter() });
  assert.ok(raidFacts(off).every((t) => !t.includes("win back")));
  const world = createPrototypeWorld(1847);
  const facts0 = buildFeedFacts(world, { sequence: 1, tick: 3, type: "battle-started", actorId: "character-01", data: { battle: {} } } as unknown as SimEvent, "raid");
  assert.equal(facts0.trigger, "not recorded: the raid event carries no cause");
});

test("nothing in src/sim reads data.ai.reason (section 5)", () => {
  for (const file of readdirSync("src/sim", { recursive: true }) as string[]) {
    if (!file.endsWith(".ts") || file === "feed-reasons.ts") continue;
    const text = readFileSync(`src/sim/${file}`, "utf8");
    assert.ok(!/ai\??\.reason\b|\["reason"\]/.test(text), `${file} reads the reason`);
    if (file !== "engine.ts") assert.ok(!text.includes("feed-reasons"), `${file} imports feed-reasons`);
  }
});

test("EXILE_RECOVERY raises the brain call cap to 300; the Jev check count stays separate at 200 and the $0.10 cap is unchanged", () => {
  assert.equal(feedReasonCallCap(false), 200); assert.equal(feedReasonCallCap(true), 300);
  assert.equal(FEED_REASON_CALL_CAP, 200); assert.equal(FEED_REASON_CALL_CAP_EXILE, 300); assert.equal(FEED_REASON_CAP_USD, 0.10);
  for (const exileRecovery of [false, true]) {
    const world = createPrototypeWorld(1847);
    const name = world.characters["character-01"].name;
    let writes = 0; let checks = 0;
    const options: FeedReasonOptions = {
      writer: { model: "count", write: () => { writes++; return { raw: reply(`${name} claimed Glassport.`), latencyMs: 0 }; } },
      check: true, checker: { check: () => { checks++; return { noul: 0.1, flagged: false, outcome: "model" } as never; } },
      exileRecovery,
    };
    const events = Array.from({ length: 450 }, (_, i) => ({ sequence: i + 1, tick: i + 1, type: "settlement-claimed", actorId: "character-01", settlementId: "glassport", data: {} }) as unknown as SimEvent);
    for (const e of events) annotateFeedReasons(world, [e], options);
    assert.equal(writes, exileRecovery ? 300 : 200);
    assert.equal(options.calls, writes);
    assert.equal(checks, 200);
    assert.equal(options.checks, 200);
    assert.ok(events.slice(-1)[0].data.ai === undefined || (events.slice(-1)[0].data.ai as { reason?: FeedReasonRecord }).reason?.fallbackReason === "cap");
  }
});

test("follow-up (a): the Jev check is opt-in; a checker without check: true is never called", () => {
  let checks = 0;
  const world = createPrototypeWorld(1847);
  const name = world.characters["character-01"].name;
  const e = { sequence: 1, tick: 5, type: "settlement-claimed", actorId: "character-01", settlementId: "glassport", data: {} } as unknown as SimEvent;
  const options: FeedReasonOptions = { writer: { model: "m", write: () => ({ raw: reply(`${name} claimed Glassport.`), latencyMs: 0 }) }, checker: { check: () => { checks++; return { noul: 0.1, flagged: false, outcome: "model" } as never; } } };
  annotateFeedReasons(world, [e], options);
  assert.equal(checks, 0);
  assert.equal((e.data.ai as { reason: FeedReasonRecord }).reason.check, undefined);
});

test("follow-up (b): raids carry the scorer's cause without EXILE_RECOVERY, with no new event bytes and the pins unchanged", () => {
  const pins: Record<number, string> = { 1847: "b51aa07a", 2718: "091f7628", 4096: "25bdbf15" };
  for (const seed of [1847, 2718, 4096]) {
    const off = run(seed, 1200);
    const on = run(seed, 1200, { writer: stubFeedReasonWriter() });
    assert.equal(stateHash(off.world).slice(0, 8), pins[seed]);
    assert.equal(stateHash(on.world), stateHash(off.world));
    assert.equal(strip(on.events), JSON.stringify(off.events));
    const raids = on.events.filter((x) => feedReasonKind(x) === "raid");
    assert.ok(raids.length > 20);
    const bare = raids.filter((x) => /acted\.$/.test(String((x.data.ai as { reason?: FeedReasonRecord } | undefined)?.reason?.text ?? "")));
    assert.equal(bare.length, 0, `seed ${seed}: ${bare.length} bare raids`);
    for (const r of raids) {
      const tick = on.events.filter((x) => x.tick === r.tick);
      const cause = raidCause(r, tick);
      assert.ok(cause && ["order", "plan", "loot"].includes(cause.cause));
      assert.match(String((r.data.ai as { reason: FeedReasonRecord }).reason.text), new RegExp(cause!.trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }
});
