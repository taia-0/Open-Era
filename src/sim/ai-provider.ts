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
  /** Judgment v3 (ai-brain-judgment.md): the holder's personality, two decimals. Present only with a context reader. */
  persona?: TaxStepPersona;
  /** Judgment v3: whole days of the mates' pay the treasury covers; null with no mates. Present only with a context reader. */
  payDaysCovered?: number | null;
  /** ai-tax-weighted: the option the sim already drew. Present only in weighted mode; the vendor writes the reason only. */
  chosen?: TaxChoice;
  /** ai-tax-weighted: Jev triage's escalation note, or null. Reason prompt only; never changes the choice. */
  escalation?: string | null;
}

export interface TaxStepPersona { ambition: number; aggression: number; caution: number; commerce: number; loyalty: number }

export interface TaxStepAnswer {
  raw: string | null;
  latencyMs: number;
  error?: "timeout" | "error" | "cap";
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
/**
 * Judgment v3 hard rail (ai-brain-judgment.md section 3, option C): no raise
 * when pressed; no cut when short and not pressed. Applied in code to the
 * parse whenever a context reader is set; a railed answer is `illegal`.
 */
export function railedOptions(options: TaxChoice[], pressed: boolean, short: boolean): TaxChoice[] {
  return options.filter((option) => !(pressed && option === "up") && !(!pressed && short && option === "down"));
}

export const TAX_STEP_PROMPT_TEMPLATE_BRIEFED = [
  "You are {holderId}, who holds the tax seat of {factionId} at tick {tick}. Decide as this person would, from their temperament and situation.",
  "Tax rate: {rateCents}% (allowed 0% to 30%, one point per step).",
  "Unrest: {unrestText}",
  "Pay: {payText} Treasury {treasuryCents} cents, {payDaysText} for {freeMates} free mates.",
  "Your temperament (0 to 1): {personaText}",
  "Cost of raising: {raiseCostText}",
  "Safety: {safetyText}",
  "Options: {optionsText}",
  "Briefing on you (validated, at most 1,024 bytes): {briefing}.",
  "Reply as JSON with a reason of at most 12 words naming what in your temperament or situation decides it, then the choice: {\"reason\":\"...\",\"choice\":\"<option>\"}.",
].join("\n");
/**
 * The fixed wording the briefed prompt's slots and system message use. It is
 * part of the prompt, so it is part of `TAX_STEP_PROMPT_VERSION_BRIEFED`: a
 * wording change moves the version even when the template is unchanged.
 * `{floor}` is filled from CLAIM_STABILITY_FLOOR. Judgment v3 hides the
 * scorer's pick and reason, so those phrases are gone.
 */
export const TAX_STEP_BRIEFED_WORDING = {
  system: "Answer as JSON: {\"reason\":\"<at most 12 words naming the trait or situation that decides it>\",\"choice\":\"<option>\"}.",
  noReport: "no current stability report from your ports.",
  unrest: "lowest port stability {low}; revolt risk at or below {floor}. {pressedText}",
  pressed: "PRESSED: a port is at or below the revolt line. You may cut or hold; you may not raise.",
  notPressed: "Not pressed.",
  short: "SHORT: the treasury cannot cover a day's pay for the mates.",
  covered: "The treasury covers a day's pay.",
  payDays: "{days} days of pay",
  noMates: "no mates to pay",
  persona: "ambition {ambition}, aggression {aggression}, caution {caution}, commerce {commerce}, loyalty {loyalty}.",
  personaUnknown: "unknown.",
  safety: "when a port is at or below the revolt line ({floor}) you may not raise, but you may cut or hold; when pay is short and no port is pressed you may not cut. An answer that breaks this is refused.",
  // Raise costs, from what the engine does (judgment v3.2, raise shock): tax income is gross trade times
  // the rate (engine.ts:512, 968). The raise itself takes RAISE_SHOCK_PER_POINT (1.0) stability per point,
  // once, from every port the faction holds (tax-rate.ts:30, 39; carried on the event and written at
  // state.ts:635-636). Each peaceful upkeep then subtracts taxDrift(rate) (tax-rate.ts:74, engine.ts:354:
  // 0 up to 15%, then 0.03 per band of 5 points) while a fed port gains 0.03 (engine.ts:354), so one
  // point heals in about 34 fed upkeeps. Above 15% an owner at or below the revolt line may secede
  // (secession.ts:429-430, engine.ts:3494). No engine path ties the tax rate to morale; short pay costs
  // a mate 0.5 morale per upkeep (engine.ts:631), so income guards morale only through pay.
  raiseCost: "every port you hold loses {shock} stability at once; income goes from {rate}% to {next}% of taxed trade; tax drift goes from {driftNow} to {driftNext} stability per upkeep, against +0.03 a fed port regains, {healText}; above 15%, a port owner at or below the revolt line may secede. Tax does not touch morale directly; a mate short of pay loses 0.5 morale per upkeep.",
  healIn: "so the {shock} takes about {heal} fed upkeeps to win back",
  healNever: "so at that rate a fed port does not win the {shock} back",
  noRaise: "raising is not an option.",
  down: "down = cut the rate one point (calms unrest, less income)",
  hold: "hold = keep the rate",
  up: "up = raise the rate one point (more income, more unrest)",
} as const;
export const TAX_STEP_PROMPT_VERSION_BRIEFED = sha256(`${TAX_STEP_PROMPT_TEMPLATE_BRIEFED}\n${canonicalJson(TAX_STEP_BRIEFED_WORDING)}`);

/**
 * ai-tax-weighted: the reason-only template. The sim has drawn the choice
 * from the trait-weighted distribution (ai-weighted.ts); the vendor writes
 * one line of reason for it and nothing else.
 */
export const TAX_STEP_PROMPT_TEMPLATE_REASON = [
  "You are {holderId}, who holds the tax seat of {factionId} at tick {tick}.",
  "Tax rate: {rateCents}% (allowed 0% to 30%, one point per step).",
  "Unrest: {unrestText}",
  "Pay: {payText} Treasury {treasuryCents} cents, {payDaysText} for {freeMates} free mates.",
  "Your temperament (0 to 1): {personaText}",
  "Cost of raising: {raiseCostText}",
  "{escalationText}",
  "Briefing on you (validated, at most 1,024 bytes): {briefing}.",
  "You have decided: {chosenText}",
  "In at most 12 words, give the reason in your temperament or situation for this decision. Reply as JSON: {\"reason\":\"...\"}.",
].join("\n");
export const TAX_STEP_REASON_WORDING = {
  system: "Answer as JSON: {\"reason\":\"<at most 12 words naming the trait or situation behind the decision>\"}.",
  escalation: "Your crew's mood needs care: {why}.",
  noEscalation: "",
} as const;
export const TAX_STEP_PROMPT_VERSION_REASON = sha256(`${TAX_STEP_PROMPT_TEMPLATE_REASON}\n${canonicalJson(TAX_STEP_REASON_WORDING)}\n${canonicalJson(TAX_STEP_BRIEFED_WORDING)}`);

/** ai-tax-weighted: the reason string from a reason-only answer, or null (bad JSON, no string, empty, over 200 chars). */
export function parseReason(raw: string | null): string | null {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as { reason?: unknown };
    const reason = typeof value?.reason === "string" ? value.reason.trim() : "";
    return reason.length > 0 && reason.length <= 200 ? reason : null;
  } catch { return null; }
}

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
  /** Judgment v3, with a context reader only: the answer was a legal option the safety rail refused. */
  railBlocked?: boolean;
  /** Judgment v3, with a context reader only: whether the reason names a trait or situation. Recorded; never changes the choice. */
  reasonCheck?: ReasonCheck;
  /** ai-tax-weighted only: the distribution, its parts and the draw, enough to replay the choice. */
  weighted?: {
    paramsVersion: string;
    params: import("./ai-weighted.ts").WeightedParams;
    persona: TaxStepPersona;
    legal: TaxChoice[];
    components: import("./ai-weighted.ts").WeightedComponents;
    distribution: import("./ai-weighted.ts").Distribution;
    draw: number;
    sampled: TaxChoice;
    escalation: string | null;
  };
  /** ai-tax-weighted only: the reason line and who wrote it. */
  reason?: string;
  reasonSource?: "model" | "template";
  /** Slice 1 picker record (ai-brain.md line 208 shape plus options and u). Weighted mode only. */
  picker?: import("./ai-picker.ts").PickerRecord;
}

/**
 * Judgment v3 reason check (ai-brain-judgment.md section 4, "stated and
 * tied"): the reason must name a temperament trait or a situation field that
 * is in the prompt. `named` lists the terms found. `unnamed` has a reason
 * with none; `missing` has no reason string. Audit only: the choice stands.
 */
export interface ReasonCheck {
  status: "named" | "unnamed" | "missing";
  terms: string[];
}

/** Term → the word stems that count as naming it. Traits first, then situation fields. */
export const REASON_TERMS: Record<string, RegExp> = {
  ambition: /\bambiti/i,
  aggression: /\baggress/i,
  caution: /\bcauti/i,
  commerce: /\b(commerc|trade|trading)/i,
  loyalty: /\bloyal/i,
  unrest: /\b(unrest|stabilit|stable|unstable|revolt)/i,
  pressed: /\bpressed\b/i,
  pay: /\b(pay|paid|wages?|short)\b/i,
  treasury: /\b(treasury|coffers?|funds?|reserves?)\b/i,
  mates: /\b(mates?|crew)\b/i,
  morale: /\bmorale\b/i,
  grudge: /\b(grudges?|grievances?)\b/i,
  allies: /\b(ally|allies)\b/i,
};

export function checkTaxStepReason(raw: string | null): ReasonCheck {
  let reason: unknown = null;
  try {
    const parsed = raw === null ? null : JSON.parse(raw);
    reason = parsed && typeof parsed === "object" ? (parsed as { reason?: unknown }).reason : null;
  } catch {
    reason = null;
  }
  if (typeof reason !== "string" || reason.trim() === "") return { status: "missing", terms: [] };
  const terms = Object.entries(REASON_TERMS).filter(([, pattern]) => pattern.test(reason as string)).map(([term]) => term);
  return { status: terms.length > 0 ? "named" : "unnamed", terms };
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
