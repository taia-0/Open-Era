import { parseTaxChoice, TAX_STEP_PROMPT_TEMPLATE, TAX_STEP_PROMPT_TEMPLATE_BRIEFED, TAX_STEP_TIMEOUT_MS, type TaxStepAnswer, type TaxStepProvider, type TaxStepRequest } from "../ai-provider.ts";
import { canonicalJson, CLAIM_STABILITY_FLOOR } from "../state.ts";
import { TAX_RATE_MAX } from "../tax-rate.ts";
import { CostLedger, DEEPSEEK_PRICES, deepSeekCostUsd, deepSeekPricePeriod, type CostLine } from "./cost.ts";
import type { SyncTransport } from "./sync-http.ts";

/** A5 brain: DeepSeek, non-thinking, JSON output (ai-providers.md sections 1 and 2). */
export const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
export const DEEPSEEK_MODEL = "deepseek-v4-pro";
export const DEEPSEEK_MAX_TOKENS = 64;
export const DEEPSEEK_SYSTEM = "Answer as JSON: {\"choice\":\"<option>\"}.";
/** Prompt v2: the system message for the briefed template, matching its reply format. */
export const DEEPSEEK_SYSTEM_BRIEFED = "Answer as JSON: {\"reason\":\"<at most 12 words>\",\"choice\":\"<option>\"}.";

export interface DeepSeekBrainOptions {
  transport: SyncTransport;
  ledger: CostLedger;
  /** Defaults to `process.env`. Read once, here. */
  env?: Record<string, string | undefined>;
  /** Wall clock for the price period and latency. */
  now?: () => Date;
  timeoutMs?: number;
}

/** Fill `{name}` slots from the request. The key is never a request field. */
export function fillTemplate(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? (typeof values[name] === "string" ? values[name] as string : canonicalJson(values[name])) : match);
}

const OPTION_TEXT: Record<string, string> = {
  down: "down = cut the rate one point (calms unrest, less income)",
  hold: "hold = keep the rate",
  up: "up = raise the rate one point (more income, more unrest)",
};

/** Plain-language slots for the briefed template (ai-brain-hold-bias.md). Derived from the request only. */
export function taxStepPromptSlots(request: TaxStepRequest): Record<string, string> {
  const low = request.lowestStabilityThousandths;
  const unrestText = low === null
    ? "no current stability report from your ports."
    : `lowest port stability ${(low / 1000).toFixed(2)}; revolt risk at or below ${CLAIM_STABILITY_FLOOR.toFixed(2)}. ${request.pressed ? "PRESSED: a port is at or below the revolt line." : "Not pressed."}`;
  const payText = request.short ? "SHORT: the treasury cannot cover a day's pay for the mates." : "The treasury covers a day's pay.";
  const maxCents = Math.round(TAX_RATE_MAX * 100);
  // Prompt text only: the scorer's hold at a rate bound says why. Nothing here reaches the sim or an event.
  const scorerReason = request.scorerChoice === "down" ? "a port is at or below the revolt line, so cut."
    : request.scorerChoice === "up" ? "the treasury is short and no port is pressed, so raise."
    : request.pressed && request.rateCents <= 0 ? "a port is at or below the revolt line, but the rate is already 0%, so hold."
    : !request.pressed && request.short && request.rateCents >= maxCents ? `the treasury is short, but the rate is already at the ${maxCents}% maximum, so hold.`
    : "no port is pressed and pay is covered, so hold.";
  return { unrestText, payText, scorerReason, optionsText: request.options.map((option) => OPTION_TEXT[option]).join("; ") + "." };
}

export function deepSeekRequestBody(request: TaxStepRequest): string {
  const template = request.briefing ? TAX_STEP_PROMPT_TEMPLATE_BRIEFED : TAX_STEP_PROMPT_TEMPLATE;
  const user = fillTemplate(template, { ...taxStepPromptSlots(request), ...(request as unknown as Record<string, unknown>) });
  return JSON.stringify({
    model: DEEPSEEK_MODEL,
    messages: [
      { role: "system", content: request.briefing ? DEEPSEEK_SYSTEM_BRIEFED : DEEPSEEK_SYSTEM },
      { role: "user", content: user },
    ],
    thinking: { type: "disabled" },
    response_format: { type: "json_object" },
    max_tokens: DEEPSEEK_MAX_TOKENS,
    temperature: 0,
    stream: false,
  });
}

/** Worst case (section 6): prompt UTF-8 bytes as a token ceiling at the peak miss price, plus max_tokens at peak output. */
export function deepSeekWorstCaseUsd(body: string): number {
  return Buffer.byteLength(body, "utf8") * DEEPSEEK_PRICES.peak.miss + DEEPSEEK_MAX_TOKENS * DEEPSEEK_PRICES.peak.out;
}

const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;

export function deepSeekBrain(options: DeepSeekBrainOptions): TaxStepProvider {
  const key = (options.env ?? process.env).DEEPSEEK_API_KEY;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? TAX_STEP_TIMEOUT_MS;
  const base = (tick: number): Omit<CostLine, "runSpendUsd" | "outcome" | "fallbackReason" | "status" | "pricePeriod"> => ({
    tick, role: "brain.taxStep", provider: "deepseek", model: DEEPSEEK_MODEL, responseModel: null, systemFingerprint: null, finishReason: null,
    tokensIn: 0, tokensInCacheHit: 0, tokensOut: 0, estimatedCostUsd: 0,
    priceSource: DEEPSEEK_PRICES.source, priceCheckedOn: DEEPSEEK_PRICES.checkedOn,
  });
  return {
    name: "deepseek",
    model: DEEPSEEK_MODEL,
    decide(request: TaxStepRequest): TaxStepAnswer {
      const started = now();
      const period = deepSeekPricePeriod(started);
      const unreached = (reason: "cap" | "error"): TaxStepAnswer => {
        options.ledger.record({ ...base(request.tick), pricePeriod: period, outcome: "fallback", fallbackReason: reason, status: null });
        return { raw: null, latencyMs: 0, error: reason };
      };
      if (!key) return unreached("error");
      const body = deepSeekRequestBody(request);
      if (options.ledger.wouldExceed(deepSeekWorstCaseUsd(body))) return unreached("cap");
      const response = options.transport({
        url: DEEPSEEK_URL,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body,
        timeoutMs,
      });
      const latencyMs = Math.max(0, now().getTime() - started.getTime());
      if (response.kind !== "response") {
        const reason = response.kind === "timeout" ? "timeout" : "error";
        options.ledger.record({ ...base(request.tick), pricePeriod: period, outcome: "fallback", fallbackReason: reason, status: null });
        return { raw: null, latencyMs, error: reason };
      }
      let parsed: Record<string, any> | null = null;
      try {
        const value = JSON.parse(response.body);
        parsed = value && typeof value === "object" ? value : null;
      } catch {
        parsed = null;
      }
      const usage = parsed?.usage ?? {};
      const hit = num(usage.prompt_cache_hit_tokens);
      const miss = usage.prompt_cache_miss_tokens !== undefined ? num(usage.prompt_cache_miss_tokens) : Math.max(0, num(usage.prompt_tokens) - hit);
      const out = num(usage.completion_tokens);
      const cost = deepSeekCostUsd(period, miss, hit, out);
      const line = {
        ...base(request.tick),
        responseModel: typeof parsed?.model === "string" ? parsed.model : null,
        systemFingerprint: typeof parsed?.system_fingerprint === "string" ? parsed.system_fingerprint : null,
        finishReason: typeof parsed?.choices?.[0]?.finish_reason === "string" ? String(parsed.choices[0].finish_reason).slice(0, 40) : null,
        tokensIn: miss + hit, tokensInCacheHit: hit, tokensOut: out, estimatedCostUsd: cost,
        pricePeriod: period, status: response.status,
      };
      if (response.status !== 200 || !parsed) {
        options.ledger.record({ ...line, outcome: "fallback", fallbackReason: "error" });
        return { raw: null, latencyMs, error: "error" };
      }
      const choice = parsed.choices?.[0];
      const content = typeof choice?.message?.content === "string" ? choice.message.content : null;
      // A cut answer (finish_reason "length") is illegal: no raw, no error, so the engine records illegal.
      const raw = choice?.finish_reason === "length" ? null : content;
      const legal = parseTaxChoice(raw, request.options) !== null;
      options.ledger.record({ ...line, outcome: legal ? "model" : "fallback", fallbackReason: legal ? null : "illegal" });
      return { raw, latencyMs };
    },
  };
}
