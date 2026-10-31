import assert from "node:assert/strict";
import test from "node:test";
import { fetchAttempts } from "./helpers/no-network.ts";
import { TAX_STEP_PROMPT_VERSION, TAX_STEP_PROMPT_VERSION_BRIEFED, type TaxStepRequest } from "../src/sim/ai-provider.ts";
import { DEEPSEEK_MAX_TOKENS, deepSeekRequestBody, taxStepPromptSlots } from "../src/sim/ai-vendor/deepseek.ts";

/** Prompt v2 (docs/design/ai-brain-hold-bias.md at 149a214). Offline; the body is built, never sent. */
const V1_BRIEFED = "sha256:fbb3d1146610686f7861faf7b88dcb5effdccf2b457ccca0946d866a012a7ff9";
const V1_PLAIN = "sha256:a1c414139184ff5f08c1e187f443f13fc815383ecd8570ca6b87c826b179e8a5";

const tick96: TaxStepRequest = {
  tick: 96, factionId: "free-tide", holderId: "character-14", rateCents: 8, pressed: true, short: false,
  lowestStabilityThousandths: 55000, treasuryCents: 62518, freeMates: 8, options: ["down", "hold", "up"],
  scorerChoice: "down", promptVersion: TAX_STEP_PROMPT_VERSION_BRIEFED,
  briefing: { morale: 12, loyalty: 0.71, loyaltyRead: null, grudges: [], allies: [], knownPorts: [], staleKnowledge: [] },
};

test("the briefed promptVersion moved with the v2 template; the unbriefed one did not", () => {
  assert.notEqual(TAX_STEP_PROMPT_VERSION_BRIEFED, V1_BRIEFED);
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
    "Unrest: lowest port stability 55.00; revolt risk at or below 55.00. PRESSED: a port is at the revolt line.",
    "Pay: The treasury covers a day's pay.",
    "Treasury: 62518 cents for 8 free mates.",
    "The standing rule recommends down: a port is at the revolt line, so cut.",
    "Options: down = cut the rate one point (calms unrest, less income); hold = keep the rate; up = raise the rate one point (more income, more unrest).",
    "Reply as JSON with a reason of at most 12 words, then the choice: {\"reason\":\"...\",\"choice\":\"<option>\"}.",
  ]) assert.ok(user.includes(line), line);
  assert.equal(/\{\w+\}/.test(user), false, "no unfilled slot");
  assert.equal(taxStepPromptSlots({ ...tick96, lowestStabilityThousandths: null }).unrestText, "no current stability report from your ports.");
  assert.equal(fetchAttempts(), 0);
});
