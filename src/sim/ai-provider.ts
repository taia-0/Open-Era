import { createHash } from "node:crypto";
import { canonicalJson } from "./state.ts";
import type { ContextRecord, TaxStepBriefing } from "./ai-context.ts";
import type { TaxChoice } from "./tax-rate.ts";

/**
 * AI pilot A (docs/design/ai-pilot-a.md): the tax-step provider seam.
 * Stubs only. No vendor, no network, no key. The provider is synchronous.
 */
export type { TaxChoice } from "./tax-rate.ts";

export interface TaxStepRequest {
  tick: number;
  factionId: string;
  holderId: string;
  rateCents: number;
  pressed: boolean;
  short: boolean;
  lowestStabilityThousandths: number | null;
  treasuryCents: number;
  freeMates: number;
  options: TaxChoice[];
  scorerChoice: TaxChoice;
  promptVersion: string;
  /** Pilot B: the validated briefing, present only when a context reader is set. */
  briefing?: TaxStepBriefing;
}

export interface TaxStepAnswer {
  raw: string | null;
  latencyMs: number;
  error?: "timeout" | "error";
}

export interface TaxStepProvider {
  readonly name: string;
  readonly model: string;
  decide(request: TaxStepRequest): TaxStepAnswer; // synchronous in pilot A
}

/** The prompt template a real vendor would receive. Pinned by sha256 in `promptVersion`. */
export const TAX_STEP_PROMPT_TEMPLATE = [
  "You hold the tax seat of {factionId} at tick {tick}.",
  "The rate is {rateCents} cents. Pressed: {pressed}. Short: {short}.",
  "Lowest held-port stability (thousandths): {lowestStabilityThousandths}.",
  "Treasury (cents): {treasuryCents}. Free mates: {freeMates}.",
  "Choose one of {options}. Answer as JSON: {\"choice\":\"<option>\"}.",
].join("\n");

export function sha256(text: string): string {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

export const TAX_STEP_PROMPT_VERSION = sha256(TAX_STEP_PROMPT_TEMPLATE);

/**
 * Pilot B (slice B3): the brain's template with the briefing. Runs with a
 * context reader send this version; runs without one keep the pilot A version.
 */
export const TAX_STEP_PROMPT_TEMPLATE_BRIEFED = [
  TAX_STEP_PROMPT_TEMPLATE,
  "Briefing on the holder (validated, at most 1,024 bytes): {briefing}.",
].join("\n");
export const TAX_STEP_PROMPT_VERSION_BRIEFED = sha256(TAX_STEP_PROMPT_TEMPLATE_BRIEFED);

/** Brain timeout from ai-brain.md. Proposed, not measured; stubs never reach it. */
export const TAX_STEP_TIMEOUT_MS = 30_000;
/** Default per-run call cap (section 7, default 9). */
export const TAX_STEP_DEFAULT_CAP = 50;
/** `rawAnswer` is capped at this many characters. */
export const RAW_ANSWER_MAX = 400;

/** The context reader's prompt template, pinned like the brain's. */
export const CONTEXT_PROMPT_TEMPLATE = [
  "You brief {holderId}, who holds the tax seat of {factionId} at tick {tick}.",
  "Here is what they know, from the state: {serializer}.",
  "Return the same JSON shape. You may set loyaltyRead to firm, wavering or breaking,",
  "and a grudge weight to low, mid or high. Use only ids that appear above.",
].join("\n");
export const CONTEXT_PROMPT_VERSION = sha256(CONTEXT_PROMPT_TEMPLATE);

export function taxStepInputHash(request: TaxStepRequest): string {
  return sha256(canonicalJson(request));
}

/**
 * Parse an answer into the legal set. Accepts `{"choice":"up"}` or a bare
 * `up`. Anything else, or a choice outside `options`, is null.
 */
export function parseTaxChoice(raw: string | null, options: TaxChoice[]): TaxChoice | null {
  if (raw === null) return null;
  let candidate: unknown = raw.trim();
  try {
    const parsed = JSON.parse(raw);
    candidate = parsed && typeof parsed === "object" ? (parsed as { choice?: unknown }).choice : parsed;
  } catch {
    // a bare word
  }
  return typeof candidate === "string" && (options as string[]).includes(candidate) ? candidate as TaxChoice : null;
}

/** Returns the scorer's choice. Deterministic, latency 0. */
export function stubAgree(): TaxStepProvider {
  return {
    name: "stub-agree",
    model: "stub-agree@1",
    decide: (request) => ({ raw: JSON.stringify({ choice: request.scorerChoice }), latencyMs: 0 }),
  };
}

export type StubFailMode = "timeout" | "error" | "illegal" | "cycle";

/**
 * Fails every call. `timeout`, `error` and `illegal` are fixed; `cycle`
 * rotates timeout, error, illegal by call count, starting at timeout.
 */
export function stubFail(mode: StubFailMode): TaxStepProvider {
  let calls = 0;
  const order = ["timeout", "error", "illegal"] as const;
  return {
    name: "stub-fail",
    model: "stub-fail@1",
    decide: () => {
      const kind = mode === "cycle" ? order[calls % order.length] : mode;
      calls += 1;
      if (kind === "illegal") return { raw: JSON.stringify({ choice: "sideways" }), latencyMs: 0 };
      return { raw: null, latencyMs: 0, error: kind };
    },
  };
}

/** Key for `stubScript`'s table. */
export function scriptKey(seed: number, tick: number, factionId: string): string {
  return `${seed}:${tick}:${factionId}`;
}

/** Choices from a fixed `(seed, tick, factionId)` table; the scorer's choice when the key is missing. */
export function stubScript(seed: number, table: Record<string, string>): TaxStepProvider {
  return {
    name: "stub-script",
    model: "stub-script@1",
    decide: (request) => ({
      raw: JSON.stringify({ choice: table[scriptKey(seed, request.tick, request.factionId)] ?? request.scorerChoice }),
      latencyMs: 0,
    }),
  };
}

export type TaxStepFallbackReason = "timeout" | "error" | "illegal" | "cap";

/** The `data.ai` record on a `tax-rate-set` (ai-pilot-a.md section 2). The reducer never reads it. */
export interface TaxStepAiRecord {
  role: "brain.taxStep";
  provider: string;
  model: string;
  promptVersion: string;
  inputHash: string;
  options: TaxChoice[];
  scorerChoice: TaxChoice;
  rawAnswer: string | null;
  parsedChoice: TaxChoice | null;
  finalChoice: TaxChoice;
  outcome: "model" | "fallback";
  fallbackReason: TaxStepFallbackReason | null;
  latencyMs: number;
  /** Null in pilot A and whenever no context reader is set. */
  context: ContextRecord | null;
}

/**
 * One consultation, kept in run memory beside the events and outside the
 * world. A hold (the provider's or a fallback's) lives only here; a step is
 * also on its `tax-rate-set` as `data.ai`. Replay never reads the trace.
 */
export interface TaxStepTraceEntry {
  tick: number;
  factionId: string;
  applied: boolean;
  ai: TaxStepAiRecord;
}
