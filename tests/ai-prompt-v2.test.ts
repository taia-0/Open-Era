import assert from "node:assert/strict";
import test from "node:test";
import { fetchAttempts } from "./helpers/no-network.ts";
import { TAX_STEP_PROMPT_VERSION, TAX_STEP_PROMPT_VERSION_BRIEFED, type TaxStepRequest } from "../src/sim/ai-provider.ts";
import { DEEPSEEK_MAX_TOKENS, DEEPSEEK_SYSTEM, DEEPSEEK_URL, deepSeekBrain, deepSeekRequestBody, taxStepPromptSlots } from "../src/sim/ai-vendor/deepseek.ts";
import { CostLedger } from "../src/sim/ai-vendor/cost.ts";
import type { SyncResponse } from "../src/sim/ai-vendor/sync-http.ts";
import { CLAIM_STABILITY_FLOOR } from "../src/sim/state.ts";

/** Prompt v2 (docs/design/ai-brain-hold-bias.md at 149a214). Offline; the body is built, never sent. */
const V1_BRIEFED = "sha256:fbb3d1146610686f7861faf7b88dcb5effdccf2b457ccca0946d866a012a7ff9";
const V2_0_BRIEFED = "sha256:1ee28a066533cce10ed9f1486d812a517896847c85ba79c89f476ed842d45b86";
const V1_PLAIN = "sha256:a1c414139184ff5f08c1e187f443f13fc815383ecd8570ca6b87c826b179e8a5";

const tick96: TaxStepRequest = {
  tick: 96, factionId: "free-tide", holderId: "character-14", rateCents: 8, pressed: true, short: false,
  lowestStabilityThousandths: 55000, treasuryCents: 62518, freeMates: 8, options: ["down", "hold", "up"],
  scorerChoice: "down", promptVersion: TAX_STEP_PROMPT_VERSION_BRIEFED,
  briefing: { morale: 12, loyalty: 0.71, loyaltyRead: null, grudges: [], allies: [], knownPorts: [], staleKnowledge: [] },
};

test("the briefed promptVersion moved with the v2 template; the unbriefed one did not", () => {
  assert.notEqual(TAX_STEP_PROMPT_VERSION_BRIEFED, V1_BRIEFED);
  assert.notEqual(TAX_STEP_PROMPT_VERSION_BRIEFED, V2_0_BRIEFED, "the wording fixes moved the version again");
  assert.match(TAX_STEP_PROMPT_VERSION_BRIEFED, /^sha256:[0-9a-f]{64}$/);
  assert.equal(TAX_STEP_PROMPT_VERSION, V1_PLAIN);
  assert.equal(DEEPSEEK_MAX_TOKENS, 64);
});

test("the tick-96 prompt renders as in the rationale doc", () => {
  const body = JSON.parse(deepSeekRequestBody(tick96));
  assert.equal(body.max_tokens, 64);
  const user: string = body.messages[1].content;
  assert.ok(user.startsWith("You hold the tax seat of free-tide at tick 96. Your job is to keep the faction's ports from revolting and its crew paid.\n"));
  for (const line of [
    "Tax rate: 8% (allowed 0% to 30%, one point per step).",
    "Unrest: lowest port stability 55.00; revolt risk at or below 55.00. PRESSED: a port is at or below the revolt line.",
    "Pay: The treasury covers a day's pay.",
    "Treasury: 62518 cents for 8 free mates.",
    "The standing rule recommends down: a port is at or below the revolt line, so cut.",
    "Options: down = cut the rate one point (calms unrest, less income); hold = keep the rate; up = raise the rate one point (more income, more unrest).",
    "Reply as JSON with a reason of at most 12 words, then the choice: {\"reason\":\"...\",\"choice\":\"<option>\"}.",
  ]) assert.ok(user.includes(line), line);
  assert.equal(/\{\w+\}/.test(user), false, "no unfilled slot");
  assert.equal(taxStepPromptSlots({ ...tick96, lowestStabilityThousandths: null }).unrestText, "no current stability report from your ports.");
  assert.equal(fetchAttempts(), 0);
});

test("the briefed system message asks for reason and choice; the unbriefed one is unchanged", () => {
  assert.equal(JSON.parse(deepSeekRequestBody(tick96)).messages[0].content, "Answer as JSON: {\"reason\":\"<at most 12 words>\",\"choice\":\"<option>\"}.");
  const { briefing: _briefing, ...plain } = tick96;
  assert.equal(JSON.parse(deepSeekRequestBody(plain)).messages[0].content, DEEPSEEK_SYSTEM);
  assert.equal(DEEPSEEK_SYSTEM, "Answer as JSON: {\"choice\":\"<option>\"}.");
});

test("the revolt line comes from CLAIM_STABILITY_FLOOR", () => {
  const text = taxStepPromptSlots({ ...tick96, pressed: false, lowestStabilityThousandths: 72720 }).unrestText;
  assert.equal(text, `lowest port stability 72.72; revolt risk at or below ${CLAIM_STABILITY_FLOOR.toFixed(2)}. Not pressed.`);
});

test("the scorer's hold says why at the rate bounds", () => {
  const hold = { ...tick96, scorerChoice: "hold" as const };
  assert.equal(taxStepPromptSlots({ ...hold, pressed: true, rateCents: 0, options: ["hold", "up"] }).scorerReason,
    "a port is at or below the revolt line, but the rate is already 0%, so hold.");
  assert.equal(taxStepPromptSlots({ ...hold, pressed: false, short: true, rateCents: 30, options: ["down", "hold"] }).scorerReason,
    "the treasury is short, but the rate is already at the 30% maximum, so hold.");
  assert.equal(taxStepPromptSlots({ ...hold, pressed: false, short: false }).scorerReason, "no port is pressed and pay is covered, so hold.");
  assert.equal(taxStepPromptSlots({ ...tick96, scorerChoice: "up", pressed: false, short: true }).scorerReason, "the treasury is short and no port is pressed, so raise.");
});

test("finish_reason is logged on the brain cost line", () => {
  const reply = (finish: unknown): SyncResponse => ({ kind: "response", status: 200, body: JSON.stringify({
    model: "deepseek-v4-pro", choices: [{ index: 0, finish_reason: finish, message: { role: "assistant", content: "{\"reason\":\"port at the line\",\"choice\":\"down\"}" } }],
    usage: { prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 480, completion_tokens: 14 },
  }) });
  const env = { DEEPSEEK_API_KEY: "sk-FAKE-PROMPT-V2" };
  for (const [finish, expected] of [["stop", "stop"], ["length", "length"], [undefined, null], [42, null]] as const) {
    const ledger = new CostLedger();
    const answer = deepSeekBrain({ transport: (request) => { assert.equal(request.url, DEEPSEEK_URL); return reply(finish); }, ledger, env }).decide(tick96);
    assert.equal(ledger.lines[0].finishReason, expected, String(finish));
    if (finish === "stop") assert.equal(answer.raw, "{\"reason\":\"port at the line\",\"choice\":\"down\"}");
    assert.equal(JSON.stringify(ledger.lines).includes("FAKE"), false);
  }
  const unreached = new CostLedger();
  deepSeekBrain({ transport: () => ({ kind: "timeout" }), ledger: unreached, env }).decide(tick96);
  assert.equal(unreached.lines[0].finishReason, null);
});
