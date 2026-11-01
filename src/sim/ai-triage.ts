import { sha256 } from "./ai-provider.ts";
import { canonicalJson } from "./state.ts";

/**
 * Slice 5, triage (docs/design/jev-triage.md). Four Nouls ride on the picker's
 * own Jev request (§4.1); any `noul ≥ 0.6` flags (§1, §6 ruling 1). A flag
 * escalates the decision to the brain while the run's budget (50) lasts and the
 * actor is off its 24-tick cooldown (§4.2). The brain answers one legal option
 * id (§4.3); anything else falls back to the picker's sample (§4.4). Flag off
 * (no `TickAiOptions.triage`) never reaches this module.
 */

export const TRIAGE_TESTS = ["port_holding", "faction_number", "allegiance_freedom", "broken_promise"] as const;
export type TriageTest = typeof TRIAGE_TESTS[number];

/** §1, exact wording. */
export const TRIAGE_QUESTIONS: Record<TriageTest, { type: "noul"; instructions: string }> = {
  port_holding: { type: "noul", instructions: "Could the outcome of this situation change which faction or person holds a port, for example a raid, an assault, a surrender claim or a secession? Answer no for ordinary travel, trade, rest or work, even when it happens in a port, and no when the fight that decided a port is already over." },
  faction_number: { type: "noul", instructions: "Does this situation decide a number that applies to a whole faction, such as its tax rate, and does that count even when the decision is to keep the number unchanged? A single person's trade, wage, purchase, ransom or contract payment is not faction-wide." },
  allegiance_freedom: { type: "noul", instructions: "Does this situation decide whether a person changes which faction they serve, or whether a person is captured, held or released? A grudge, a mood or a relationship change on its own is not enough." },
  broken_promise: { type: "noul", instructions: "Does this situation involve someone choosing not to keep an agreement they had already accepted, when they could have kept it? Answer no if they failed only because they could not pay or could not reach it, and no if they kept it or simply declined to accept it." },
};

/** §6 ruling 1. A test flags when `noul >= 0.6`. */
export const TRIAGE_THRESHOLD = 0.6;
/** §4.2: escalations per run. */
export const TRIAGE_BUDGET = 50;
/** §4.2: no second escalation for the same actor inside 24 ticks. */
export const TRIAGE_COOLDOWN_TICKS = 24;
export const TRIAGE_PROMPT_VERSION = sha256(canonicalJson(TRIAGE_QUESTIONS));
export const BRAIN_ROLE = "brain.escalation";
/** §4.3–4.4: 30,000 ms brain timeout (ai-providers.md:87). */
export const BRAIN_TIMEOUT_MS = 30_000;

/** §4.3: the system line and the fixed user template; both hashed into the brain prompt version. */
export const BRAIN_SYSTEM = "Answer as JSON: {\"choice\":\"<option id>\"}.";
export const BRAIN_TEMPLATE = [
  "You are {name} ({actorId}), deciding what to do next. Your temperament (0 to 1): {persona}. Your purse: {purse} coins.",
  "What you know: {briefing}",
  "Your social read: {social}",
  "This decision was flagged as weighty for: {flagged}.",
  "Legal options: {legal}",
  "Reply with one option id from the list as JSON.",
].join("\n");
export const BRAIN_PROMPT_VERSION = sha256(`${BRAIN_SYSTEM}\n${BRAIN_TEMPLATE}`);

/** The flag rule: tests at or above the threshold, in the fixed test order. */
export function flaggedTests(noul: Partial<Record<TriageTest, number>> | null, threshold: number = TRIAGE_THRESHOLD): TriageTest[] {
  if (!noul) return [];
  return TRIAGE_TESTS.filter((test) => typeof noul[test] === "number" && noul[test]! >= threshold);
}

/** Keep each asked test's finite `noul`, clamped to [0, 1], 4 dp. Null when none is left. */
export function sanitizeNoul(raw: unknown): Record<TriageTest, number> | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Partial<Record<TriageTest, number>> = {};
  for (const test of TRIAGE_TESTS) {
    const entry = (raw as Record<string, unknown>)[test];
    const value = typeof entry === "number" ? entry : entry && typeof entry === "object" ? (entry as { noul?: unknown }).noul : undefined;
    if (typeof value === "number" && Number.isFinite(value)) out[test] = Math.round(Math.min(1, Math.max(0, value)) * 1e4) / 1e4;
  }
  return Object.keys(out).length ? out as Record<TriageTest, number> : null;
}

/** §4.1: the decision situation the Nouls read. */
export function decisionSituation(tick: number, actorId: string, settlementId: string | null, legal: string[]) {
  return { tick, kind: "decision", actorId, settlementId, facts: { legalOptions: [...legal] } };
}

/** Run memory (§4.2). Not on the world; recomputed in event order on replay. */
export interface TriageState { budgetLeft: number; cooldownUntil: Record<string, number> }

export interface TriageRecord {
  promptVersion: string;
  noul: Record<TriageTest, number> | null;
  threshold: number;
  flagged: TriageTest[];
  budgetLeft: number;
  cooldownUntilTick: number | null;
  escalated: boolean;
  /** Why a flagged decision did not escalate; null when it did or nothing flagged. */
  skipped: "budget" | "cooldown" | null;
}

/** §4.2: deterministic given the scores; spends budget and starts the cooldown. */
export function triageStep(state: TriageState, actorId: string, tick: number, noul: Record<TriageTest, number> | null, threshold: number = TRIAGE_THRESHOLD, cooldownTicks: number = TRIAGE_COOLDOWN_TICKS): TriageRecord {
  const flagged = flaggedTests(noul, threshold);
  const until = state.cooldownUntil[actorId];
  let escalated = false;
  let skipped: TriageRecord["skipped"] = null;
  if (flagged.length) {
    if (until !== undefined && tick < until) skipped = "cooldown";
    else if (state.budgetLeft <= 0) skipped = "budget";
    else { escalated = true; state.budgetLeft -= 1; state.cooldownUntil[actorId] = tick + cooldownTicks; }
  }
  return { promptVersion: TRIAGE_PROMPT_VERSION, noul, threshold, flagged, budgetLeft: state.budgetLeft, cooldownUntilTick: state.cooldownUntil[actorId] ?? null, escalated, skipped };
}

export interface EscalationRequest {
  tick: number;
  actorId: string;
  name: string;
  persona: Record<string, number>;
  purse: number;
  briefing: unknown;
  social: unknown;
  flagged: TriageTest[];
  legal: string[];
  promptVersion: string;
}

export interface EscalationAnswer {
  raw: string | null;
  latencyMs: number;
  error?: "timeout" | "error" | "cap";
  finishReason?: string | null;
}

export interface EscalationBrain {
  readonly name: string;
  readonly model: string;
  escalate(request: EscalationRequest): EscalationAnswer;
}

export type BrainFallbackReason = "timeout" | "error" | "illegal" | "cap";

/** §4.5: `data.ai.brain`. */
export interface BrainRecord {
  role: typeof BRAIN_ROLE;
  provider: string;
  model: string;
  promptVersion: string;
  inputHash: string;
  raw: string | null;
  choice: string;
  outcome: "model" | "fallback";
  fallbackReason: BrainFallbackReason | null;
  /** The picker's sampled row, the first fallback (§4.4). */
  pickerSampled: string;
  latencyMs: number;
}

export function brainUserPrompt(request: EscalationRequest): string {
  const values: Record<string, string> = {
    name: request.name, actorId: request.actorId,
    persona: Object.entries(request.persona).map(([k, v]) => `${k} ${v}`).join(", "),
    purse: String(request.purse),
    briefing: request.briefing ? canonicalJson(request.briefing) : "none",
    social: request.social ? canonicalJson(request.social) : "none",
    flagged: request.flagged.join(", "),
    legal: request.legal.join(", "),
  };
  return BRAIN_TEMPLATE.replace(/\{(\w+)\}/g, (match, key: string) => key in values ? values[key] : match);
}

/** §4.4: a legal id from `{"choice": "<id>"}`, else null. */
export function parseBrainChoice(raw: string | null, legal: string[]): string | null {
  if (typeof raw !== "string") return null;
  try {
    const value = JSON.parse(raw);
    const choice = value && typeof value === "object" ? (value as { choice?: unknown }).choice : undefined;
    return typeof choice === "string" && legal.includes(choice) ? choice : null;
  } catch { return null; }
}

/** §4.4: legal id, else the picker's sample, else `candidates[0]`. */
export function finishBrain(request: EscalationRequest, answer: EscalationAnswer, provider: string, model: string, inputHash: string, pickerSampled: string, scorerPick: string, live: boolean): BrainRecord {
  let fallbackReason: BrainFallbackReason | null = answer.error ?? (live && answer.latencyMs > BRAIN_TIMEOUT_MS ? "timeout" : null);
  const raw = answer.finishReason === "length" ? null : answer.raw;
  const parsed = fallbackReason ? null : parseBrainChoice(raw, request.legal);
  if (!fallbackReason && !parsed) fallbackReason = "illegal";
  const choice = parsed ?? (request.legal.includes(pickerSampled) ? pickerSampled : scorerPick);
  return { role: BRAIN_ROLE, provider, model, promptVersion: request.promptVersion, inputHash, raw: answer.raw, choice, outcome: fallbackReason ? "fallback" : "model", fallbackReason, pickerSampled, latencyMs: answer.latencyMs };
}

/** §4.5 replay: the recorded triage and brain per (tick, actor); no vendor is called. */
export class TriageReplay implements EscalationBrain {
  readonly name = "replay";
  readonly model = "replay";
  calls = 0;
  used = 0;
  private readonly records = new Map<string, { triage: TriageRecord; brain?: BrainRecord }>();
  constructor(entries: Iterable<{ tick: number; actorId: string; triage?: TriageRecord; brain?: BrainRecord }>) {
    for (const entry of entries) if (entry.triage) this.records.set(`${entry.tick}:${entry.actorId}`, { triage: entry.triage, brain: entry.brain });
  }
  get size(): number { return this.records.size; }
  recorded(tick: number, actorId: string): { triage: TriageRecord; brain?: BrainRecord } {
    const found = this.records.get(`${tick}:${actorId}`);
    if (!found) throw new Error(`triage replay: no record for ${actorId} at tick ${tick}`);
    this.used += 1;
    return found;
  }
  escalate(): EscalationAnswer {
    this.calls += 1;
    throw new Error("triage replay: the brain must not be called");
  }
}

/** Stubs (§4.7). Offline and synchronous. */
export function stubNoul(fn: (legal: string[], tick: number, actorId: string) => Record<TriageTest, number>) {
  return fn;
}
export const NEVER_FLAG = () => ({ port_holding: 0, faction_number: 0, allegiance_freedom: 0, broken_promise: 0 });
export const ALWAYS_FLAG = () => ({ port_holding: 1, faction_number: 0, allegiance_freedom: 0, broken_promise: 0 });

/** A brain stub that answers with `pick(legal)`; counts its calls. */
export function stubBrain(pick: (request: EscalationRequest) => string | null, name = "stubBrain"): EscalationBrain & { calls: number } {
  const brain = { name, model: "stub", calls: 0, escalate(request: EscalationRequest): EscalationAnswer {
    brain.calls += 1;
    const choice = pick(request);
    return { raw: choice === null ? "{}" : JSON.stringify({ choice }), latencyMs: 0 };
  } };
  return brain;
}
/** The last legal id: a deterministic answer that often differs from the picker. */
export function stubBrainLast(): EscalationBrain & { calls: number } {
  return stubBrain((request) => request.legal[request.legal.length - 1], "stubBrainLast");
}
