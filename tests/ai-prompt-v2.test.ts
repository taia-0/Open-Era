import assert from "node:assert/strict";
import test from "node:test";
import { fetchAttempts } from "./helpers/no-network.ts";
import { TAX_STEP_PROMPT_VERSION, TAX_STEP_PROMPT_VERSION_BRIEFED, type TaxStepRequest } from "../src/sim/ai-provider.ts";
import { DEEPSEEK_MAX_TOKENS, DEEPSEEK_URL, deepSeekBrain, deepSeekRequestBody, taxStepPromptSlots } from "../src/sim/ai-vendor/deepseek.ts";
import { CostLedger } from "../src/sim/ai-vendor/cost.ts";
import type { SyncResponse } from "../src/sim/ai-vendor/sync-http.ts";
import { CLAIM_STABILITY_FLOOR } from "../src/sim/state.ts";

/** Prompt v2 (docs/design/ai-brain-hold-bias.md at 149a214). Offline; the body is built, never sent.
 * The v2 render, system-message and scorer-reason tests were superseded by judgment v3 and moved to tests/ai-judgment-v3.test.ts. */
const V1_BRIEFED = "sha256:fbb3d1146610686f7861faf7b88dcb5effdccf2b457ccca0946d866a012a7ff9";
const V2_0_BRIEFED = "sha256:1ee28a066533cce10ed9f1486d812a517896847c85ba79c89f476ed842d45b86";
/** v2.1 (7cb5a29); judgment v3 moves it again (tests/ai-judgment-v3.test.ts). */
const V2_1_BRIEFED = "sha256:859c4f19bbb62557f55ce51814eed1774589296ec3b4533d4323a9c4be50e836";
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
  assert.notEqual(TAX_STEP_PROMPT_VERSION_BRIEFED, V2_1_BRIEFED, "judgment v3 moved the version again");
  assert.match(TAX_STEP_PROMPT_VERSION_BRIEFED, /^sha256:[0-9a-f]{64}$/);
  assert.equal(TAX_STEP_PROMPT_VERSION, V1_PLAIN);
  assert.equal(DEEPSEEK_MAX_TOKENS, 64);
});

test("the revolt line comes from CLAIM_STABILITY_FLOOR", () => {
  const text = taxStepPromptSlots({ ...tick96, pressed: false, lowestStabilityThousandths: 72720 }).unrestText;
  assert.equal(text, `lowest port stability 72.72; revolt risk at or below ${CLAIM_STABILITY_FLOOR.toFixed(2)}. Not pressed.`);
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
