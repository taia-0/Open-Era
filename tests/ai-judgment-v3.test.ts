import assert from "node:assert/strict";
import test from "node:test";
import { fetchAttempts } from "./helpers/no-network.ts";
import {
  checkTaxStepReason, railedOptions, TAX_STEP_PROMPT_VERSION, TAX_STEP_PROMPT_VERSION_BRIEFED,
  type TaxStepAiRecord, type TaxStepProvider, type TaxStepRequest,
} from "../src/sim/ai-provider.ts";
import { DEEPSEEK_SYSTEM, deepSeekRequestBody, taxStepPromptSlots } from "../src/sim/ai-vendor/deepseek.ts";
import { stubContextEcho } from "../src/sim/ai-context.ts";
import { runTicks } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { CLAIM_STABILITY_FLOOR } from "../src/sim/state.ts";

/** Judgment v3 (docs/design/ai-brain-judgment.md at 9139755). Offline; bodies are built, never sent. */
const V3_BRIEFED = "sha256:890a2ce6960b3d8e80a29c97d20326f11e3eb2ca169ef9712ed2698558173197";
const V1_PLAIN = "sha256:a1c414139184ff5f08c1e187f443f13fc815383ecd8570ca6b87c826b179e8a5";

const tick96: TaxStepRequest = {
  tick: 96, factionId: "free-tide", holderId: "character-14", rateCents: 8, pressed: true, short: false,
  lowestStabilityThousandths: 55000, treasuryCents: 62518, freeMates: 8, options: ["down", "hold", "up"],
  scorerChoice: "down", promptVersion: TAX_STEP_PROMPT_VERSION_BRIEFED,
  briefing: { morale: 12, loyalty: 0.71, loyaltyRead: null, grudges: [], allies: [], knownPorts: [], staleKnowledge: [] },
  persona: { ambition: 0.62, aggression: 0.31, caution: 0.77, commerce: 0.4, loyalty: 0.71 },
  payDaysCovered: 26,
};

test("the v3 promptVersion is pinned; the plain one did not move", () => {
  assert.equal(TAX_STEP_PROMPT_VERSION_BRIEFED, V3_BRIEFED);
  assert.equal(TAX_STEP_PROMPT_VERSION, V1_PLAIN);
});

test("the tick-96 v3 prompt hides the scorer and shows temperament, pay days and the safety rule", () => {
  const body = JSON.parse(deepSeekRequestBody(tick96));
  const user: string = body.messages[1].content;
  for (const line of [
    "You are character-14, who holds the tax seat of free-tide at tick 96. Decide as this person would, from their temperament and situation.",
    "Unrest: lowest port stability 55.00; revolt risk at or below 55.00. PRESSED: a port is at or below the revolt line.",
    "Pay: The treasury covers a day's pay. Treasury 62518 cents, 26 days of pay for 8 free mates.",
    "Your temperament (0 to 1): ambition 0.62, aggression 0.31, caution 0.77, commerce 0.4, loyalty 0.71.",
    `Safety: when a port is at or below the revolt line (${CLAIM_STABILITY_FLOOR.toFixed(2)}) you may not raise; when pay is short and no port is pressed you may not cut. An answer that breaks this is refused.`,
    "Reply as JSON with a reason of at most 12 words naming what in your temperament or situation decides it, then the choice: {\"reason\":\"...\",\"choice\":\"<option>\"}.",
  ]) assert.ok(user.includes(line), line);
  assert.equal(/recommend|standing rule|scorer/i.test(user), false, "the scorer's pick and reason are hidden");
  assert.equal(/\{\w+\}/.test(user), false, "no unfilled slot");
  assert.equal(body.max_tokens, 64);
  assert.equal(body.messages[0].content, "Answer as JSON: {\"reason\":\"<at most 12 words naming the trait or situation that decides it>\",\"choice\":\"<option>\"}.");
  const { briefing: _b, persona: _p, payDaysCovered: _d, ...plain } = tick96;
  assert.equal(JSON.parse(deepSeekRequestBody(plain)).messages[0].content, DEEPSEEK_SYSTEM);
  const slots = taxStepPromptSlots({ ...tick96, persona: undefined, payDaysCovered: null });
  assert.equal(slots.personaText, "unknown.");
  assert.equal(slots.payDaysText, "no mates to pay");
  assert.equal(fetchAttempts(), 0);
});

test("the rail: no raise when pressed, no cut when short and not pressed", () => {
  const all = ["down", "hold", "up"] as const;
  assert.deepEqual(railedOptions([...all], true, false), ["down", "hold"]);
  assert.deepEqual(railedOptions([...all], true, true), ["down", "hold"]);
  assert.deepEqual(railedOptions([...all], false, true), ["hold", "up"]);
  assert.deepEqual(railedOptions([...all], false, false), [...all]);
});

test("the reason check names traits or situations; failure is recorded only", () => {
  assert.deepEqual(checkTaxStepReason("{\"reason\":\"cautious; a port is near revolt\",\"choice\":\"down\"}"), { status: "named", terms: ["caution", "unrest"] });
  assert.deepEqual(checkTaxStepReason("{\"reason\":\"seems right\",\"choice\":\"hold\"}"), { status: "unnamed", terms: [] });
  assert.deepEqual(checkTaxStepReason("{\"choice\":\"hold\"}"), { status: "missing", terms: [] });
  assert.deepEqual(checkTaxStepReason("not json"), { status: "missing", terms: [] });
  assert.deepEqual(checkTaxStepReason(null), { status: "missing", terms: [] });
});

test("in the engine a railed answer is illegal and the scorer applies; persona and pay days ride the request", () => {
  const requests: TaxStepRequest[] = [];
  const breaker: TaxStepProvider = {
    name: "test-breaker", model: "none",
    decide: (request) => {
      requests.push(request);
      const choice = request.pressed ? "up" : request.short ? "down" : request.scorerChoice;
      return { raw: JSON.stringify({ reason: "ambition says so", choice }), latencyMs: 0 };
    },
  };
  const result = runTicks(createPrototypeWorld(1), 1200, { ai: { brainTaxStep: breaker, context: stubContextEcho() } });
  const records = result.events.filter((event) => "ai" in event.data).map((event) => event.data.ai as TaxStepAiRecord);
  assert.ok(records.length > 0);
  let blocked = 0;
  for (const record of records) {
    assert.deepEqual(record.reasonCheck, { status: "named", terms: ["ambition"] });
    if (record.railBlocked) {
      blocked += 1;
      assert.equal(record.outcome, "fallback");
      assert.equal(record.fallbackReason, "illegal");
      assert.equal(record.finalChoice, record.scorerChoice);
    }
  }
  assert.ok(blocked > 0, "the breaker hit the rail at least once");
  assert.ok(requests.every((request) => request.persona && "payDaysCovered" in request));
  const plain = runTicks(createPrototypeWorld(1), 72, { ai: { brainTaxStep: breaker } });
  for (const event of plain.events) if ("ai" in event.data) {
    const record = event.data.ai as TaxStepAiRecord;
    assert.equal(record.railBlocked, undefined);
    assert.equal(record.reasonCheck, undefined);
  }
  assert.equal(fetchAttempts(), 0);
});
