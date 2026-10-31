import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fetchAttempts } from "./helpers/no-network.ts";
import { buildTaxStepBriefing, type ContextRequest } from "../src/sim/ai-context.ts";
import { TAX_STEP_PROMPT_VERSION, type TaxStepRequest } from "../src/sim/ai-provider.ts";
import { CostLedger, DEEPSEEK_PRICES, deepSeekCostUsd, deepSeekPricePeriod, JEV_PRICES, type CostLine } from "../src/sim/ai-vendor/cost.ts";
import { DEEPSEEK_MAX_TOKENS, DEEPSEEK_MODEL, DEEPSEEK_URL, deepSeekBrain, deepSeekRequestBody, deepSeekWorstCaseUsd } from "../src/sim/ai-vendor/deepseek.ts";
import { JEV_MODEL, JEV_URL, jevContextReader, jevRequestBody } from "../src/sim/ai-vendor/jev.ts";
import { workerTransport, type SyncRequest, type SyncResponse, type SyncTransport } from "../src/sim/ai-vendor/sync-http.ts";
import { runTick, runTicks, type TickAiOptions } from "../src/sim/engine.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { canonicalJson, stateHash } from "../src/sim/state.ts";

/**
 * A5 (docs/design/ai-providers.md at 725f023). Fully offline: every vendor
 * call goes to an injected transport; `fetch` throws; keys are fakes.
 */
const FAKE_DS = "sk-FAKE-DEEPSEEK-0000-do-not-use";
const FAKE_JEV = "ts-FAKE-JEV-1111-do-not-use";
const ENV = { DEEPSEEK_API_KEY: FAKE_DS, JEV_API_KEY: FAKE_JEV };
const PEAK = () => new Date("2026-11-02T02:00:00Z"); // Monday 02:00 UTC
const OFF_PEAK = () => new Date("2026-11-01T02:00:00Z"); // Sunday

function mock(answer: (request: SyncRequest, index: number) => SyncResponse) {
  const requests: SyncRequest[] = [];
  const transport: SyncTransport = (request) => {
    requests.push(request);
    return answer(request, requests.length - 1);
  };
  return { transport, requests };
}
const json = (status: number, body: unknown): SyncResponse => ({ kind: "response", status, body: JSON.stringify(body) });
const completion = (content: string | null, finish = "stop", usage = { prompt_cache_hit_tokens: 100, prompt_cache_miss_tokens: 300, completion_tokens: 7 }) =>
  json(200, {
    id: "chatcmpl-test", object: "chat.completion", model: DEEPSEEK_MODEL, system_fingerprint: "fp_test",
    choices: [{ index: 0, finish_reason: finish, message: { role: "assistant", content } }],
    usage: { ...usage, prompt_tokens: usage.prompt_cache_hit_tokens + usage.prompt_cache_miss_tokens, total_tokens: 0 },
  });
const jevAnswer = (answers: Record<string, unknown>, inputTokens = 900) =>
  json(200, { model: JEV_MODEL, answers, usage: { input_tokens: inputTokens, output_tokens: 12 } });

const REQUEST: TaxStepRequest = {
  tick: 24, factionId: "free-tide", holderId: "character-14", rateCents: 8, pressed: false, short: true,
  lowestStabilityThousandths: 400, treasuryCents: 280000, freeMates: 6, options: ["down", "hold", "up"],
  scorerChoice: "up", promptVersion: TAX_STEP_PROMPT_VERSION,
};
const world96 = (() => { const world = createPrototypeWorld(1847); runTicks(world, 96); return world; })();
const holderId = Object.values(world96.characters).find((character) => character.factionId === "free-tide" && Object.values(character.relationships).some((relation) => relation.grievance > 0))!.id;
const CONTEXT: ContextRequest = { tick: 96, factionId: "free-tide", holderId, serializer: buildTaxStepBriefing(world96, holderId), promptVersion: "sha256:test" };

test("DeepSeek request: endpoint, bearer header, non-thinking JSON output, max_tokens 32, temperature 0", () => {
  const { transport, requests } = mock(() => completion("{\"choice\":\"up\"}"));
  const ledger = new CostLedger();
  const answer = deepSeekBrain({ transport, ledger, env: ENV, now: PEAK }).decide(REQUEST);
  assert.equal(answer.raw, "{\"choice\":\"up\"}");
  assert.equal(answer.error, undefined);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, DEEPSEEK_URL);
  assert.equal(requests[0].headers.Authorization, `Bearer ${FAKE_DS}`);
  assert.equal(requests[0].timeoutMs, 30_000);
  const body = JSON.parse(requests[0].body);
  assert.equal(body.model, "deepseek-v4-pro");
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.equal(body.max_tokens, 32);
  assert.equal(body.temperature, 0);
  assert.equal(body.stream, false);
  assert.match(body.messages[1].content, /Answer as JSON/);
  assert.equal(requests[0].body.includes(FAKE_DS), false);
  assert.equal(ledger.lines[0].outcome, "model");
  assert.equal(ledger.lines[0].responseModel, DEEPSEEK_MODEL);
  assert.equal(ledger.lines[0].systemFingerprint, "fp_test");
});

test("DeepSeek errors and malformed answers fall back with the right reason", () => {
  const cases: [string, SyncResponse, { raw: string | null; error?: string }][] = [
    ["401", json(401, { error: { message: "Authentication Fails", type: "authentication_error" } }), { raw: null, error: "error" }],
    ["429", json(429, { error: { type: "rate_limit" } }), { raw: null, error: "error" }],
    ["529", json(529, { error: { type: "overloaded" } }), { raw: null, error: "error" }],
    ["timeout", { kind: "timeout" }, { raw: null, error: "timeout" }],
    ["transport error", { kind: "error" }, { raw: null, error: "error" }],
    ["not JSON", { kind: "response", status: 200, body: "<html>oops" }, { raw: null, error: "error" }],
    ["finish_reason length", completion("{\"choi", "length"), { raw: null }],
    ["empty content", completion(""), { raw: "" }],
    ["null content", completion(null), { raw: null }],
  ];
  for (const [name, response, expected] of cases) {
    const ledger = new CostLedger();
    const answer = deepSeekBrain({ transport: mock(() => response).transport, ledger, env: ENV, now: PEAK }).decide(REQUEST);
    assert.equal(answer.raw, expected.raw, name);
    assert.equal(answer.error, expected.error, name);
    assert.equal(ledger.lines.length, 1, name);
    assert.equal(ledger.lines[0].outcome, "fallback", name);
  }
  // A missing key never reaches the transport.
  const { transport, requests } = mock(() => completion("{\"choice\":\"up\"}"));
  const ledger = new CostLedger();
  const answer = deepSeekBrain({ transport, ledger, env: {}, now: PEAK }).decide(REQUEST);
  assert.deepEqual([answer.raw, answer.error, requests.length], [null, "error", 0]);
  assert.equal(ledger.lines[0].tokensIn, 0);
  assert.equal(ledger.lines[0].estimatedCostUsd, 0);
});

test("cost line: fields and arithmetic against the price constants, peak and off-peak", () => {
  for (const [now, period] of [[PEAK, "peak"], [OFF_PEAK, "off-peak"]] as const) {
    const ledger = new CostLedger();
    deepSeekBrain({ transport: mock(() => completion("{\"choice\":\"hold\"}")).transport, ledger, env: ENV, now }).decide(REQUEST);
    const line = ledger.lines[0];
    const price = period === "peak" ? DEEPSEEK_PRICES.peak : DEEPSEEK_PRICES.offPeak;
    assert.equal(line.pricePeriod, period);
    assert.equal(line.tokensIn, 400);
    assert.equal(line.tokensInCacheHit, 100);
    assert.equal(line.tokensOut, 7);
    assert.equal(line.estimatedCostUsd, 300 * price.miss + 100 * price.hit + 7 * price.out);
    assert.equal(line.runSpendUsd, line.estimatedCostUsd);
    assert.equal(line.priceSource, "https://api-docs.deepseek.com/quick_start/pricing");
    assert.equal(line.priceCheckedOn, "2026-10-31");
    assert.equal(line.role, "brain.taxStep");
    assert.equal(line.tick, 24);
  }
  assert.equal(deepSeekPricePeriod(new Date("2026-11-02T07:30:00Z")), "peak");
  assert.equal(deepSeekPricePeriod(new Date("2026-11-02T05:00:00Z")), "off-peak");
  assert.equal(deepSeekPricePeriod(new Date("2026-11-07T07:30:00Z")), "off-peak");
  assert.equal(deepSeekCostUsd("peak", 1e6, 0, 0), 1.32);
  // Jev: flat, input only.
  const ledger = new CostLedger();
  jevContextReader({ transport: mock(() => jevAnswer({ loyaltyRead: { choice: "firm" } }, 1000)).transport, ledger, env: ENV }).read(CONTEXT);
  assert.equal(ledger.lines[0].pricePeriod, "flat");
  assert.equal(ledger.lines[0].estimatedCostUsd, 1000 * JEV_PRICES.input);
  assert.equal(ledger.lines[0].tokensOut, 12);
  assert.equal(ledger.lines[0].priceSource, "https://docs.typesafe.ai/models");
});

test("spend cap: the call that would cross the cap is not made and falls back with cap", () => {
  const worst = deepSeekWorstCaseUsd(deepSeekRequestBody(REQUEST));
  assert.ok(worst > 0);
  // Room for one worst case, not two.
  const ledger = new CostLedger(worst * 1.5);
  const { transport, requests } = mock(() => completion("{\"choice\":\"hold\"}", "stop", { prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 300, completion_tokens: 7 }));
  const brain = deepSeekBrain({ transport, ledger, env: ENV, now: PEAK });
  assert.equal(brain.decide(REQUEST).error, undefined);
  // The real spend is far below the worst case, so the second still fits; force the spend up.
  ledger.spendUsd = worst * 0.6;
  const blocked = brain.decide(REQUEST);
  assert.deepEqual([blocked.raw, blocked.error], [null, "cap"]);
  assert.equal(requests.length, 1);
  const capLine = ledger.lines.at(-1)!;
  assert.deepEqual([capLine.fallbackReason, capLine.tokensIn, capLine.estimatedCostUsd, capLine.status], ["cap", 0, 0, null]);
  // A zero cap blocks the reader too.
  const reader = jevContextReader({ transport, ledger: new CostLedger(0), env: ENV });
  assert.equal(reader.read(CONTEXT).error, "cap");
  assert.equal(requests.length, 1);
});

test("engine: spend cap and call cap bind, record cap, and keep the flag-off world", () => {
  const off = runTicks(createPrototypeWorld(1847), 480);
  // Illegal answers: the scorer applies, so the world stays the flag-off world.
  const { transport, requests } = mock((request) => request.url === DEEPSEEK_URL
    ? completion("{\"choice\":\"sideways\"}", "stop", { prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 2000, completion_tokens: 32 })
    : jevAnswer({ loyaltyRead: { choice: "firm" } }));
  const ledger = new CostLedger(0.012);
  const ai: TickAiOptions = {
    brainTaxStep: deepSeekBrain({ transport, ledger, env: ENV, now: PEAK }),
    context: jevContextReader({ transport, ledger, env: ENV }), ledger,
  };
  const on = runTicks(createPrototypeWorld(1847), 480, { ai });
  assert.equal(stateHash(on.state), stateHash(off.state));
  const reasons = on.aiTrace!.map((entry) => entry.ai.fallbackReason);
  assert.ok(reasons.includes("illegal"));
  assert.ok(reasons.includes("cap"), "the spend cap bound");
  assert.ok(ledger.spendUsd <= 0.012);
  const firstCap = reasons.indexOf("cap");
  assert.ok(reasons.slice(firstCap).every((reason) => reason === "cap"));
  // Call cap 3: three brain and three reader requests, then cap.
  const second = mock((request) => request.url === DEEPSEEK_URL ? completion("{\"choice\":\"sideways\"}") : jevAnswer({}));
  const ledger2 = new CostLedger();
  const capped = runTicks(createPrototypeWorld(1847), 480, { ai: {
    brainTaxStep: deepSeekBrain({ transport: second.transport, ledger: ledger2, env: ENV, now: PEAK }),
    context: jevContextReader({ transport: second.transport, ledger: ledger2, env: ENV }), ledger: ledger2, cap: 3,
  } });
  assert.equal(second.requests.filter((request) => request.url === DEEPSEEK_URL).length, 3);
  assert.equal(second.requests.filter((request) => request.url === JEV_URL).length, 3);
  assert.ok(capped.aiTrace!.slice(3).every((entry) => entry.ai.fallbackReason === "cap" && entry.ai.context!.fallbackReason === "cap"));
  assert.equal(stateHash(capped.state), stateHash(off.state));
  assert.ok(requests.length > 0);
});

test("Jev request: versioned model, one choice question per grudge, ids copied from the serializer", () => {
  const { transport, requests } = mock(() => jevAnswer({
    loyaltyRead: { choice: "wavering" }, grudge_0: { choice: "high" }, grudge_1: { choice: "enormous" },
  }));
  const answer = jevContextReader({ transport, ledger: new CostLedger(), env: ENV }).read(CONTEXT);
  assert.equal(requests[0].url, "https://api.typesafe.ai/v1/systemone");
  assert.equal(requests[0].headers.Authorization, `Bearer ${FAKE_JEV}`);
  assert.equal(requests[0].timeoutMs, 2_000);
  assert.equal(Object.keys(requests[0].headers).some((name) => /long/i.test(name)), false);
  const body = JSON.parse(requests[0].body);
  assert.equal(body.model, "jev-1.14.0");
  assert.equal(Object.keys(body.questions).length, 1 + CONTEXT.serializer.grudges.length);
  assert.ok(Object.values(body.questions).every((question: any) => question.type === "choice"));
  const briefing = JSON.parse(answer.raw!);
  assert.equal(briefing.loyaltyRead, "wavering");
  assert.equal(briefing.grudges[0].weight, "high");
  if (briefing.grudges[1]) assert.equal(briefing.grudges[1].weight, undefined, "an out-of-set choice is dropped");
  assert.deepEqual(briefing.grudges.map((grudge: any) => grudge.id), CONTEXT.serializer.grudges.map((grudge) => grudge.id));
  assert.deepEqual(briefing.knownPorts, CONTEXT.serializer.knownPorts);
  assert.equal(jevRequestBody(CONTEXT).includes(FAKE_JEV), false);
});

test("Jev errors, timeouts and malformed bodies fall back", () => {
  for (const status of [400, 401, 413, 415, 422, 429, 529]) {
    const answer = jevContextReader({ transport: mock(() => json(status, { error: { type: "x" } })).transport, ledger: new CostLedger(), env: ENV }).read(CONTEXT);
    assert.deepEqual([answer.raw, answer.error], [null, "error"], String(status));
  }
  for (const [response, error] of [[{ kind: "timeout" }, "timeout"], [{ kind: "error" }, "error"], [{ kind: "response", status: 200, body: "{" }, "error"], [json(200, { model: JEV_MODEL }), "error"]] as const) {
    const answer = jevContextReader({ transport: mock(() => response as SyncResponse).transport, ledger: new CostLedger(), env: ENV }).read(CONTEXT);
    assert.equal(answer.error, error);
  }
  const { transport, requests } = mock(() => jevAnswer({}));
  assert.equal(jevContextReader({ transport, ledger: new CostLedger(), env: {} }).read(CONTEXT).error, "error");
  assert.equal(requests.length, 0);
});

test("keys from process.env never appear in events, trace, cost lines, errors or console output", () => {
  const saved = { ds: process.env.DEEPSEEK_API_KEY, jev: process.env.JEV_API_KEY };
  const printed: string[] = [];
  const originals = { log: console.log, error: console.error, warn: console.warn };
  try {
    process.env.DEEPSEEK_API_KEY = FAKE_DS;
    process.env.JEV_API_KEY = FAKE_JEV;
    for (const name of ["log", "error", "warn"] as const) console[name] = (...args: unknown[]) => { printed.push(args.map(String).join(" ")); };
    const seen: string[] = [];
    let index = 0;
    const responses: SyncResponse[] = [completion("{\"choice\":\"sideways\"}"), json(401, { error: { message: "bad key" } }), { kind: "timeout" }, { kind: "error" }];
    const transport: SyncTransport = (request) => {
      seen.push(request.headers.Authorization);
      return request.url === JEV_URL ? jevAnswer({ loyaltyRead: { choice: "firm" } }) : responses[index++ % responses.length];
    };
    const lines: CostLine[] = [];
    const ledger = new CostLedger(0.25, (line) => lines.push(line));
    // No `env`: the providers read process.env, as the runner does.
    const result = runTicks(createPrototypeWorld(1847), 480, { ai: { brainTaxStep: deepSeekBrain({ transport, ledger, now: PEAK }), context: jevContextReader({ transport, ledger }), ledger } });
    assert.ok(seen.includes(`Bearer ${FAKE_DS}`) && seen.includes(`Bearer ${FAKE_JEV}`), "the keys were read from process.env");
    const outputs = [JSON.stringify(result.events), JSON.stringify(result.aiTrace), JSON.stringify(lines), JSON.stringify(ledger.lines), canonicalJson(result.state), printed.join("\n")];
    for (const text of outputs) {
      assert.equal(text.includes(FAKE_DS), false);
      assert.equal(text.includes(FAKE_JEV), false);
      assert.equal(text.includes("FAKE"), false);
    }
    // A transport that throws: the engine records error, not the message.
    const throwing: SyncTransport = () => { throw new Error(`boom ${FAKE_DS}`); };
    const thrown = runTicks(createPrototypeWorld(1847), 120, { ai: { brainTaxStep: deepSeekBrain({ transport: throwing, ledger: new CostLedger(), now: PEAK }) } });
    assert.equal(JSON.stringify(thrown.aiTrace).includes("FAKE"), false);
    assert.ok(thrown.aiTrace!.every((entry) => entry.ai.fallbackReason === "error"));
  } finally {
    Object.assign(console, originals);
    if (saved.ds === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = saved.ds;
    if (saved.jev === undefined) delete process.env.JEV_API_KEY; else process.env.JEV_API_KEY = saved.jev;
  }
});

test("replay and WorldStore.recover call neither vendor", () => {
  let calls = 0;
  const transport: SyncTransport = (request) => {
    calls += 1;
    return request.url === DEEPSEEK_URL ? completion("{\"choice\":\"hold\"}") : jevAnswer({ loyaltyRead: { choice: "firm" } });
  };
  const directory = mkdtempSync(join(tmpdir(), "open-era-ai-providers-"));
  try {
    const store = new WorldStore(join(directory, "recovery.sqlite"));
    const world = createPrototypeWorld(1847);
    store.initialize(world);
    const ledger = new CostLedger();
    const ai: TickAiOptions = { brainTaxStep: deepSeekBrain({ transport, ledger, env: ENV, now: PEAK }), context: jevContextReader({ transport, ledger, env: ENV }), ledger };
    while (world.tick < 100) store.appendTick(runTick(world, { ai }).events, world);
    const live = stateHash(world);
    store.close();
    const before = calls;
    assert.ok(before > 0);
    const reopened = new WorldStore(join(directory, "recovery.sqlite"));
    const recovered = reopened.recover();
    assert.ok(recovered.replayedEvents > 0);
    assert.equal(stateHash(recovered.state), live);
    assert.equal(calls, before);
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("worker transport, offline: answers, times out at the role's timeout, and reports errors", () => {
  const writer = (status: number, text: string) => `
    const { workerData } = require("node:worker_threads");
    const view = new Int32Array(workerData.shared, 0, 2);
    const data = new Uint8Array(workerData.shared, 8);
    const bytes = Buffer.from(${JSON.stringify(text)}, "utf8");
    data.set(bytes); view[1] = ${status}; Atomics.store(view, 0, ${status === -1 ? 1 : "bytes.length + 1"}); Atomics.notify(view, 0);`;
  const request = { url: "http://offline.invalid", headers: {}, body: "{}", timeoutMs: 2_000 };
  assert.deepEqual(workerTransport(writer(200, "{\"ok\":true}"))(request), { kind: "response", status: 200, body: "{\"ok\":true}" });
  assert.deepEqual(workerTransport(writer(-1, ""))(request), { kind: "error" });
  const started = Date.now();
  assert.deepEqual(workerTransport("setInterval(() => {}, 1000);")({ ...request, timeoutMs: 150 }), { kind: "timeout" });
  const waited = Date.now() - started;
  assert.ok(waited >= 140 && waited < 2_000, `waited ${waited} ms`);
});

test("flag off and stubs: hashes byte-identical; the fetch guard was never tripped", () => {
  const golden: Record<number, string> = {
    1847: "6efa334f66ef885392a88d7112e41984df1793b00ee5c57635946d5121bab9c3",
  };
  assert.equal(stateHash(runTicks(createPrototypeWorld(1847), 72).state), golden[1847]);
  // Vendor providers with a transport that always fails reproduce flag off.
  const failing = mock(() => ({ kind: "error" }) as SyncResponse);
  const ledger = new CostLedger();
  const on = runTicks(createPrototypeWorld(1847), 72, { ai: { brainTaxStep: deepSeekBrain({ transport: failing.transport, ledger, env: ENV }), context: jevContextReader({ transport: failing.transport, ledger, env: ENV }), ledger } });
  assert.equal(stateHash(on.state), golden[1847]);
  assert.equal(fetchAttempts(), 0);
});
