import { CONTEXT_TIMEOUT_MS, type ChoiceAnswerRecord, GRUDGE_WEIGHTS, LOYALTY_READS, type ContextAnswer, type ContextReader, type ContextRequest, type TaxStepBriefing } from "../ai-context.ts";
import { CostLedger, JEV_PRICES, jevCostUsd, type CostLine } from "./cost.ts";
import type { SyncTransport } from "./sync-http.ts";
import { PICKER_INSTRUCTIONS as PICKER_INSTRUCTIONS_TEXT, PICKER_TIMEOUT_MS as PICKER_TIMEOUT } from "../ai-action-picker.ts";
import type { ActionPicker, PickerAnswer, PickerRequest } from "../ai-action-picker.ts";
import type { SocialReadAnswer, SocialReader, SocialReadRequest } from "../ai-social.ts";

/** A5 context reader: TypeSafe's Jev, choice questions only (ai-providers.md sections 1 and 2). */
export const JEV_URL = "https://api.typesafe.ai/v1/systemone";
export const JEV_MODEL = "jev-1.14.0";

export interface JevReaderOptions {
  transport: SyncTransport;
  ledger: CostLedger;
  env?: Record<string, string | undefined>;
  now?: () => Date;
  timeoutMs?: number;
}

const LOYALTY_CRITERIA = {
  firm: "The holder is settled in the faction and would not consider leaving.",
  wavering: "The holder has doubts or grievances that could push them away.",
  breaking: "The holder is close to leaving or acting against the faction.",
};
const WEIGHT_CRITERIA = {
  low: "A minor grievance that would not change what they do.",
  mid: "A grievance that colours their choices.",
  high: "A grievance that could drive them to act against the other.",
};

export function jevRequestBody(request: ContextRequest): string {
  const questions: Record<string, unknown> = {
    loyaltyRead: { type: "choice", instructions: "How firm is the holder's loyalty to their faction?", criteria: LOYALTY_CRITERIA },
  };
  request.serializer.grudges.forEach((grudge, index) => {
    questions[`grudge_${index}`] = { type: "choice", instructions: `How heavy is the holder's grudge against ${grudge.id}?`, criteria: WEIGHT_CRITERIA };
  });
  return JSON.stringify({
    model: JEV_MODEL,
    state: { holderId: request.holderId, factionId: request.factionId, tick: request.tick, serializer: request.serializer },
    questions,
  });
}

/** Worst case (section 6): request bytes at the input price. */
export function jevWorstCaseUsd(body: string): number {
  return jevCostUsd(Buffer.byteLength(body, "utf8"));
}

const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;

/**
 * Ids and numbers are copied from the serializer; only `loyaltyRead` and each
 * grudge `weight` come from Jev's choices. The engine then validates it.
 */
/** The options each question offered, in a fixed order. */
export function jevQuestionOptions(request: ContextRequest): Record<string, string[]> {
  const options: Record<string, string[]> = { loyaltyRead: [...LOYALTY_READS] };
  request.serializer.grudges.forEach((_, index) => { options[`grudge_${index}`] = [...GRUDGE_WEIGHTS]; });
  return options;
}

const unit = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null;

/**
 * Keep the full Choice result for each question we asked, conservatively:
 * questions we did not ask are dropped; per question only `choice`,
 * `probabilities` and `confidence` are read; a probability is kept only for
 * an offered option and a finite number (clamped to [0, 1]); `choice` is kept
 * only if offered; anything else is null or absent. Nothing from headers.
 */
export function sanitizeChoiceAnswers(answers: unknown, asked: Record<string, string[]>): Record<string, ChoiceAnswerRecord> {
  const out: Record<string, ChoiceAnswerRecord> = {};
  const source = answers && typeof answers === "object" && !Array.isArray(answers) ? answers as Record<string, unknown> : {};
  for (const [name, options] of Object.entries(asked)) {
    const raw = source[name];
    const entry = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
    if (!entry) continue;
    const given = entry.probabilities && typeof entry.probabilities === "object" && !Array.isArray(entry.probabilities)
      ? entry.probabilities as Record<string, unknown>
      : {};
    const probabilities: Record<string, number> = {};
    let sum = 0;
    for (const option of options) {
      const value = Object.prototype.hasOwnProperty.call(given, option) ? unit(given[option]) : null;
      if (value === null) continue;
      probabilities[option] = value;
      sum += value;
    }
    out[name] = {
      type: "choice",
      options: [...options],
      choice: typeof entry.choice === "string" && options.includes(entry.choice) ? entry.choice : null,
      probabilities,
      probabilitySum: Math.round(sum * 1e9) / 1e9,
      confidence: unit(entry.confidence),
    };
  }
  return out;
}

export function assembleBriefing(serializer: TaxStepBriefing, answers: Record<string, any>): TaxStepBriefing {
  const pick = (name: string, allowed: readonly string[]) => {
    const choice = answers?.[name]?.choice;
    return typeof choice === "string" && allowed.includes(choice) ? choice : undefined;
  };
  return {
    ...serializer,
    loyaltyRead: (pick("loyaltyRead", LOYALTY_READS) as TaxStepBriefing["loyaltyRead"]) ?? null,
    grudges: serializer.grudges.map((grudge, index) => {
      const weight = pick(`grudge_${index}`, GRUDGE_WEIGHTS);
      return weight ? { ...grudge, weight: weight as "low" | "mid" | "high" } : { ...grudge };
    }),
  };
}

export function jevContextReader(options: JevReaderOptions): ContextReader {
  const key = (options.env ?? process.env).JEV_API_KEY;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? CONTEXT_TIMEOUT_MS;
  const base = (tick: number): Omit<CostLine, "runSpendUsd" | "outcome" | "fallbackReason" | "status"> => ({
    tick, role: "context.taxStep", provider: "jev", model: JEV_MODEL, responseModel: null,
    tokensIn: 0, tokensInCacheHit: 0, tokensOut: 0, pricePeriod: "flat", estimatedCostUsd: 0,
    priceSource: JEV_PRICES.source, priceCheckedOn: JEV_PRICES.checkedOn,
  });
  return {
    name: "jev",
    model: JEV_MODEL,
    read(request: ContextRequest): ContextAnswer {
      const unreached = (reason: "cap" | "error"): ContextAnswer => {
        options.ledger.record({ ...base(request.tick), outcome: "fallback", fallbackReason: reason, status: null });
        return { raw: null, latencyMs: 0, error: reason };
      };
      if (!key) return unreached("error");
      const body = jevRequestBody(request);
      if (options.ledger.wouldExceed(jevWorstCaseUsd(body))) return unreached("cap");
      const started = now();
      const response = options.transport({
        url: JEV_URL,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body,
        timeoutMs,
      });
      const latencyMs = Math.max(0, now().getTime() - started.getTime());
      if (response.kind !== "response") {
        const reason = response.kind === "timeout" ? "timeout" : "error";
        options.ledger.record({ ...base(request.tick), outcome: "fallback", fallbackReason: reason, status: null });
        return { raw: null, latencyMs, error: reason };
      }
      let parsed: Record<string, any> | null = null;
      try {
        const value = JSON.parse(response.body);
        parsed = value && typeof value === "object" ? value : null;
      } catch {
        parsed = null;
      }
      const tokensIn = num(parsed?.usage?.input_tokens);
      const line = {
        ...base(request.tick),
        responseModel: typeof parsed?.model === "string" ? parsed.model : null,
        tokensIn, tokensOut: num(parsed?.usage?.output_tokens), estimatedCostUsd: jevCostUsd(tokensIn), status: response.status,
      };
      // 400, 401, 413, 415, 422, 429, 529 and any other non-200 are errors; no retry inside a tick.
      if (response.status !== 200 || !parsed || !parsed.answers || typeof parsed.answers !== "object") {
        options.ledger.record({ ...line, outcome: "fallback", fallbackReason: "error" });
        return { raw: null, latencyMs, error: "error" };
      }
      options.ledger.record({ ...line, outcome: "model", fallbackReason: null });
      return {
        raw: JSON.stringify(assembleBriefing(request.serializer, parsed.answers)),
        latencyMs,
        answers: sanitizeChoiceAnswers(parsed.answers, jevQuestionOptions(request)),
      };
    },
  };
}

/** Slice 3 (jev-action-picker.md section 3): one Choice question over the legal ids. */
export function jevPickerRequestBody(request: PickerRequest): string {
  return JSON.stringify({
    model: JEV_MODEL,
    state: request.state,
    questions: {
      next_action: { type: "choice", instructions: request.instructions ?? PICKER_INSTRUCTIONS_TEXT, criteria: request.criteria },
    },
  });
}

/** Slice 3 Jev picker: probabilities only (it never picks); one cost line per call; spend cap through the ledger. */
export function jevActionPicker(options: JevReaderOptions): ActionPicker {
  const key = (options.env ?? process.env).JEV_API_KEY;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? PICKER_TIMEOUT;
  const base = (tick: number): Omit<CostLine, "runSpendUsd" | "outcome" | "fallbackReason" | "status"> => ({
    tick, role: "picker.action", provider: "jev", model: JEV_MODEL, responseModel: null,
    tokensIn: 0, tokensInCacheHit: 0, tokensOut: 0, pricePeriod: "flat", estimatedCostUsd: 0,
    priceSource: JEV_PRICES.source, priceCheckedOn: JEV_PRICES.checkedOn,
  });
  return {
    name: "jev",
    model: JEV_MODEL,
    choose(request: PickerRequest): PickerAnswer {
      const unreached = (reason: "cap" | "error"): PickerAnswer => {
        options.ledger.record({ ...base(request.tick), outcome: "fallback", fallbackReason: reason, status: null });
        return { probabilities: null, latencyMs: 0, error: reason };
      };
      if (!key) return unreached("error");
      const body = jevPickerRequestBody(request);
      if (options.ledger.wouldExceed(jevWorstCaseUsd(body))) return unreached("cap");
      const started = now();
      const response = options.transport({ url: JEV_URL, headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body, timeoutMs });
      const latencyMs = Math.max(0, now().getTime() - started.getTime());
      if (response.kind !== "response") {
        const reason = response.kind === "timeout" ? "timeout" : "error";
        options.ledger.record({ ...base(request.tick), outcome: "fallback", fallbackReason: reason, status: null });
        return { probabilities: null, latencyMs, error: reason };
      }
      let parsed: Record<string, any> | null = null;
      try { const value = JSON.parse(response.body); parsed = value && typeof value === "object" ? value : null; } catch { parsed = null; }
      const tokensIn = num(parsed?.usage?.input_tokens);
      const responseModel = typeof parsed?.model === "string" ? String(parsed.model).slice(0, 40) : null;
      const line = { ...base(request.tick), responseModel, tokensIn, tokensOut: num(parsed?.usage?.output_tokens), estimatedCostUsd: jevCostUsd(tokensIn), status: response.status };
      const answer = parsed?.answers?.next_action;
      const probabilities = answer && typeof answer.probabilities === "object" && answer.probabilities ? answer.probabilities as Record<string, unknown> : null;
      if (response.status !== 200 || !probabilities) {
        options.ledger.record({ ...line, outcome: "fallback", fallbackReason: "error" });
        return { probabilities: null, latencyMs, error: "error" };
      }
      options.ledger.record({ ...line, outcome: "model", fallbackReason: null });
      return { probabilities, confidence: typeof answer.confidence === "number" ? answer.confidence : null, responseModel, latencyMs };
    },
  };
}

/** Slice 4 (jev-social-picker.md §4–§5): the social read, briefing-only state; reads yield to picks near the spend cap (§8). */
export function jevSocialReader(options: JevReaderOptions & { pickReserveUsd?: number }): SocialReader {
  const key = (options.env ?? process.env).JEV_API_KEY;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? PICKER_TIMEOUT;
  const base = (tick: number): Omit<CostLine, "runSpendUsd" | "outcome" | "fallbackReason" | "status"> => ({
    tick, role: "picker.social", provider: "jev", model: JEV_MODEL, responseModel: null,
    tokensIn: 0, tokensInCacheHit: 0, tokensOut: 0, pricePeriod: "flat", estimatedCostUsd: 0,
    priceSource: JEV_PRICES.source, priceCheckedOn: JEV_PRICES.checkedOn,
  });
  return {
    name: "jev",
    model: JEV_MODEL,
    read(request: SocialReadRequest): SocialReadAnswer {
      const unreached = (reason: "cap" | "error"): SocialReadAnswer => {
        options.ledger.record({ ...base(request.tick), outcome: "fallback", fallbackReason: reason, status: null });
        return { answers: null, latencyMs: 0, error: reason };
      };
      if (!key) return unreached("error");
      const body = JSON.stringify({ model: JEV_MODEL, state: request.state, questions: request.questions });
      // Read worst case plus a pick's reserve: reads are skipped before picks.
      if (options.ledger.wouldExceed(jevWorstCaseUsd(body) + (options.pickReserveUsd ?? jevCostUsd(4096)))) return unreached("cap");
      const started = now();
      const response = options.transport({ url: JEV_URL, headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body, timeoutMs });
      const latencyMs = Math.max(0, now().getTime() - started.getTime());
      if (response.kind !== "response") {
        const reason = response.kind === "timeout" ? "timeout" : "error";
        options.ledger.record({ ...base(request.tick), outcome: "fallback", fallbackReason: reason, status: null });
        return { answers: null, latencyMs, error: reason };
      }
      let parsed: Record<string, any> | null = null;
      try { const value = JSON.parse(response.body); parsed = value && typeof value === "object" ? value : null; } catch { parsed = null; }
      const tokensIn = num(parsed?.usage?.input_tokens);
      const responseModel = typeof parsed?.model === "string" ? String(parsed.model).slice(0, 40) : null;
      const line = { ...base(request.tick), responseModel, tokensIn, tokensOut: num(parsed?.usage?.output_tokens), estimatedCostUsd: jevCostUsd(tokensIn), status: response.status };
      if (response.status !== 200 || !parsed?.answers || typeof parsed.answers !== "object") {
        options.ledger.record({ ...line, outcome: "fallback", fallbackReason: "error" });
        return { answers: null, latencyMs, error: "error" };
      }
      options.ledger.record({ ...line, outcome: "model", fallbackReason: null });
      return { answers: parsed.answers, latencyMs };
    },
  };
}
