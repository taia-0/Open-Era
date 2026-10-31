import { CONTEXT_TIMEOUT_MS, GRUDGE_WEIGHTS, LOYALTY_READS, type ContextAnswer, type ContextReader, type ContextRequest, type TaxStepBriefing } from "../ai-context.ts";
import { CostLedger, JEV_PRICES, jevCostUsd, type CostLine } from "./cost.ts";
import type { SyncTransport } from "./sync-http.ts";

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
      return { raw: JSON.stringify(assembleBriefing(request.serializer, parsed.answers)), latencyMs };
    },
  };
}
