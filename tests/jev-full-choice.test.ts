import assert from "node:assert/strict";
import test from "node:test";
import { fetchAttempts } from "./helpers/no-network.ts";
import { stubContextEcho } from "../src/sim/ai-context.ts";
import { stubAgree } from "../src/sim/ai-provider.ts";
import { CostLedger } from "../src/sim/ai-vendor/cost.ts";
import { JEV_MODEL, JEV_URL, jevContextReader, sanitizeChoiceAnswers } from "../src/sim/ai-vendor/jev.ts";
import type { SyncResponse, SyncTransport } from "../src/sim/ai-vendor/sync-http.ts";
import { runTicks } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";

/** Full Jev Choice results on data.ai.context (jev-capabilities.md at b90a519). Offline. */
const FAKE_JEV = "ts-FAKE-JEV-2222-do-not-use";
const ENV = { JEV_API_KEY: FAKE_JEV };
const ASKED = { loyaltyRead: ["firm", "wavering", "breaking"], grudge_0: ["low", "mid", "high"] };
const reply = (answers: unknown): SyncResponse => ({
  kind: "response", status: 200,
  body: JSON.stringify({ model: JEV_MODEL, answers, usage: { input_tokens: 800, output_tokens: 82 } }),
});

test("sanitize keeps choice, probabilities over offered options, and confidence", () => {
  const out = sanitizeChoiceAnswers({
    loyaltyRead: { type: "choice", choice: "firm", confidence: 0.42, probabilities: { firm: 0.61, wavering: 0.35, breaking: 0.04 } },
  }, ASKED);
  assert.deepEqual(out, {
    loyaltyRead: {
      type: "choice", options: ["firm", "wavering", "breaking"], choice: "firm",
      probabilities: { firm: 0.61, wavering: 0.35, breaking: 0.04 }, probabilitySum: 1, confidence: 0.42,
    },
  });
});

test("sanitize drops or clamps garbage conservatively", () => {
  const out = sanitizeChoiceAnswers({
    loyaltyRead: {
      choice: "ecstatic", confidence: "high", noul: 0.9, secret: "x", Authorization: "Bearer leak",
      probabilities: { firm: 1.7, wavering: -0.2, breaking: "0.5", ecstatic: 0.3, __proto__: 0.1 },
    },
    grudge_0: { choice: "mid", confidence: Number.NaN, probabilities: [0.2, 0.8] },
    grudge_7: { choice: "high", probabilities: { high: 1 } },
    extra: "padding".repeat(100),
  }, ASKED);
  assert.deepEqual(Object.keys(out).sort(), ["grudge_0", "loyaltyRead"]);
  assert.deepEqual(out.loyaltyRead, {
    type: "choice", options: ["firm", "wavering", "breaking"], choice: null,
    probabilities: { firm: 1, wavering: 0 }, probabilitySum: 1, confidence: null,
  });
  assert.deepEqual(out.grudge_0, { type: "choice", options: ["low", "mid", "high"], choice: "mid", probabilities: {}, probabilitySum: 0, confidence: null });
  assert.deepEqual(sanitizeChoiceAnswers(null, ASKED), {});
  assert.deepEqual(sanitizeChoiceAnswers({ loyaltyRead: [1, 2] }, ASKED), {});
  assert.equal(JSON.stringify(out).includes("leak"), false);
});

test("the engine records the full results; the briefing and the world are unchanged; no key recorded", () => {
  const off = runTicks(createPrototypeWorld(1847), 240);
  const transport: SyncTransport = (request) => {
    assert.equal(request.url, JEV_URL);
    const asked = Object.keys(JSON.parse(request.body).questions);
    const answers: Record<string, unknown> = {};
    for (const name of asked) {
      answers[name] = name === "loyaltyRead"
        ? { type: "choice", choice: "wavering", confidence: 0.3, probabilities: { firm: 0.3, wavering: 0.55, breaking: 0.15 } }
        : { type: "choice", choice: "low", confidence: 0.6, probabilities: { low: 0.73, mid: 0.2, high: 0.07 } };
    }
    return reply(answers);
  };
  const choiceOnly: SyncTransport = (request) => {
    const asked = Object.keys(JSON.parse(request.body).questions);
    return reply(Object.fromEntries(asked.map((name) => [name, { choice: name === "loyaltyRead" ? "wavering" : "low" }])));
  };
  const run = (t: SyncTransport) => {
    const ledger = new CostLedger();
    return runTicks(createPrototypeWorld(1847), 240, { ai: { brainTaxStep: stubAgree(), context: jevContextReader({ transport: t, ledger, env: ENV }), ledger } });
  };
  const full = run(transport);
  const bare = run(choiceOnly);
  assert.equal(stateHash(full.state), stateHash(off.state));
  assert.ok(full.aiTrace!.length > 0);
  full.aiTrace!.forEach((entry, index) => {
    const context = entry.ai.context!;
    assert.equal(context.outcome, "model");
    assert.ok(context.answers);
    assert.deepEqual(context.answers.loyaltyRead.probabilities, { firm: 0.3, wavering: 0.55, breaking: 0.15 });
    assert.equal(context.answers.loyaltyRead.choice, "wavering");
    assert.equal(context.answers.loyaltyRead.confidence, 0.3);
    assert.equal(Object.keys(context.answers).length, 1 + context.briefing.grudges.length);
    // The briefing the brain saw is what the choice-only answer gives.
    assert.deepEqual(context.briefing, bare.aiTrace![index].ai.context!.briefing);
    assert.equal(entry.ai.inputHash, bare.aiTrace![index].ai.inputHash);
  });
  for (const text of [JSON.stringify(full.events), JSON.stringify(full.aiTrace)]) {
    assert.equal(text.includes("FAKE"), false);
  }
  const steps = full.events.filter((event) => event.type === "tax-rate-set" && "ai" in event.data);
  assert.ok(steps.every((event) => (event.data.ai as { context: { answers?: unknown } }).context.answers));
});

test("stubs and fallbacks record no answers field; flag off and the stub runner are unchanged", () => {
  const stub = runTicks(createPrototypeWorld(1847), 240, { ai: { brainTaxStep: stubAgree(), context: stubContextEcho() } });
  assert.ok(stub.aiTrace!.every((entry) => !("answers" in entry.ai.context!)));
  const ledger = new CostLedger();
  const timeouts = runTicks(createPrototypeWorld(1847), 240, { ai: {
    brainTaxStep: stubAgree(), context: jevContextReader({ transport: () => ({ kind: "timeout" }), ledger, env: ENV }), ledger,
  } });
  assert.ok(timeouts.aiTrace!.every((entry) => entry.ai.context!.fallbackReason === "timeout" && !("answers" in entry.ai.context!)));
  // Re-pinned for the raise shock: the 240-tick flag-off hash (was a30b4361); the stub still equals flag off.
  assert.equal(stateHash(stub.state), "7c9ed679c62291ae9eb269f573f46e4d7ef3d064848494e311be4969932b84e7");
  assert.equal(stateHash(runTicks(createPrototypeWorld(1847), 240).state), stateHash(stub.state));
  assert.equal(stateHash(runTicks(createPrototypeWorld(1847), 72).state), "6efa334f66ef885392a88d7112e41984df1793b00ee5c57635946d5121bab9c3");
  assert.equal(fetchAttempts(), 0);
});
