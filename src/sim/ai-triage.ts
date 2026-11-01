import { sha256 } from "./ai-provider.ts";
import { pickerDraw } from "./ai-picker.ts";
import { canonicalJson } from "./state.ts";

/**
 * Slice 5, triage (docs/design/jev-triage.md). Lead rulings (2026-10-31, rework):
 * triage is its OWN scoring request (role `triage.score`), never part of the
 * picker's Choice request, which stays byte-for-byte the picker-only request.
 * It scores the decision kinds the probe set covered, for every actor whose
 * decision reaches them: tax steps, desertion, secession, surrender/claim
 * (a raid or claim-settlement is legal) and contract break (a carrier about
 * to divert from an accepted haul). Routine moves are not scored.
 * Any `noul ≥ 0.6` flags (§6 ruling 1). A flag escalates to the brain while
 * the run's budget (50) lasts and the actor is off its 24-tick cooldown (§4.2).
 * The brain answers one legal option id (§4.3); anything else falls back to
 * the default (what the sim would have done) (§4.4). Without escalation the
 * default is applied unchanged, so picks equal the run without triage.
 * Flag off (no `TickAiOptions.triage`) never reaches this module.
 */

export const TRIAGE_KINDS = ["tax", "desertion", "secession", "claim", "contract-break"] as const;
export type TriageKind = typeof TRIAGE_KINDS[number];
export const TRIAGE_ROLE = "triage.score";
/** Per-run scoring call cap (run memory). */
export const TRIAGE_DEFAULT_SCORE_CAP = 4000;

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
/**
 * v2 (Lead ruling 1): the 50 split per kind, so rare late kinds are not starved by early claims.
 * Sized from the offline real-decision counts per 1,200-tick run (see progress.md): desertion and
 * secession are rare (a handful per run) and get a reserve that covers them; tax steps that change
 * the rate and contract breaks get roughly their share; claims, the most frequent, take the rest.
 */
export const TRIAGE_KIND_BUDGETS: Record<TriageKind, number> = { claim: 20, tax: 10, "contract-break": 8, desertion: 6, secession: 6 };
/** §4.2: no second escalation for the same actor inside 24 ticks. */
export const TRIAGE_COOLDOWN_TICKS = 24;
export const TRIAGE_PROMPT_VERSION = sha256(canonicalJson(TRIAGE_QUESTIONS));
export const BRAIN_ROLE = "brain.escalation";
/** §4.3–4.4: 30,000 ms brain timeout (ai-providers.md:87). */
export const BRAIN_TIMEOUT_MS = 30_000;

/** §4.3: the system line and the fixed user template; both hashed into the brain prompt version. */
export const BRAIN_SYSTEM = "Answer as JSON: {\"proceed\": <number from 0 to 1>, \"reason\": \"<one short sentence>\"}.";
export const BRAIN_TEMPLATE = [
  "You are {name} ({actorId}), deciding what to do next. Your temperament (0 to 1): {persona}. Your purse: {purse} coins.",
  "What you know: {briefing}",
  "Your social read: {social}",
  "The decision ({kind}): {situation}",
  "This decision was flagged as weighty for: {flagged}.",
  "What you are about to do: {defaultChoice}. If you do not go ahead: {alternative}.",
  "How likely is it that you go ahead? Reply as JSON with proceed (0 to 1) and a short reason.",
].join("\n");
export const BRAIN_PROMPT_VERSION = sha256(`${BRAIN_SYSTEM}\n${BRAIN_TEMPLATE}`);

/**
 * v3 (Lead ruling 2, the #145 tax pattern): the brain never picks. It returns a proceed probability
 * `p` and a reason; the run blends it with a prior favouring the sim's own choice,
 * q = (1 − w)·prior + w·p, and samples proceed when u < q, u from the stateless sha256
 * side-stream (`pickerDraw`, stream `triage-brain:<kind>`), so replay is exact and no world rng moves.
 * Tuned offline with the stub (see progress.md). A failed or illegal answer keeps the sim's choice.
 */
export const BRAIN_PRIOR = 0.95;
export const BRAIN_WEIGHT = 0.3;
export const BRAIN_STREAM = "triage-brain";
export function brainBlend(p: number, prior: number = BRAIN_PRIOR, weight: number = BRAIN_WEIGHT): number {
  return Math.round(((1 - weight) * prior + weight * p) * 1e6) / 1e6;
}
/** Gated kinds (Lead ruling 1): no Noul call; a gated decision flags on its kind's probe tests. */
export const SCORE_GATED = "gated";

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

/** §1(b): the situation the Nouls read: explicit kind, actor, facts and options; no briefing. */
export interface TriageSituation { tick: number; kind: string; actorId: string; targetId: string | null; settlementId: string | null; facts: Record<string, unknown> }

export interface TriageScoreRequest { tick: number; actorId: string; kind: TriageKind; situation: TriageSituation; questions: typeof TRIAGE_QUESTIONS; promptVersion: string }
export interface TriageScoreAnswer { noul: unknown; latencyMs: number; error?: "timeout" | "error" | "cap" }
/** The separate scoring seam: one request per triaged decision. */
export interface TriageScorer { readonly name: string; readonly model: string; score(request: TriageScoreRequest): TriageScoreAnswer }

/** Offline stub scorers (§4.7). */
export function stubScorer(fn: (request: TriageScoreRequest) => Partial<Record<TriageTest, number>>, name = "stubScorer"): TriageScorer & { calls: number } {
  const scorer = { name, model: "stub", calls: 0, score(request: TriageScoreRequest): TriageScoreAnswer { scorer.calls += 1; return { noul: fn(request), latencyMs: 0 }; } };
  return scorer;
}
export const neverScorer = () => stubScorer(() => NEVER_FLAG(), "stubNever");
export const alwaysScorer = () => stubScorer(() => ALWAYS_FLAG(), "stubAlways");
/** Flags the test each kind is about (the probe labels), at 0.9. */
export const KIND_TESTS: Record<TriageKind, TriageTest[]> = {
  tax: ["faction_number"], desertion: ["allegiance_freedom"], secession: ["port_holding", "faction_number", "allegiance_freedom"],
  claim: ["port_holding"], "contract-break": ["broken_promise"],
};
export const kindScorer = () => stubScorer((r) => ({ ...NEVER_FLAG(), ...Object.fromEntries(KIND_TESTS[r.kind].map((t) => [t, 0.9])) }), "stubKind");

/** Run memory (§4.2). Not on the world; recomputed in event order on replay. */
export interface TriageState { budgetLeft: number; cooldownUntil: Record<string, number>; /** v2: per-kind budgets; when set, a kind spends only its own. */ kindLeft?: Partial<Record<TriageKind, number>> }

export interface TriageRecord {
  kind: TriageKind;
  /** The actor's role at the decision: faction holder, governor, carrier, member or factionless. */
  actorRole: string;
  promptVersion: string;
  inputHash: string;
  /** Scoring outcome: model, or why no scores came back. */
  scoreOutcome: "model" | "timeout" | "error" | "cap" | "gated";
  legal: string[];
  defaultChoice: string;
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
export function triageStep(state: TriageState, actorId: string, tick: number, noul: Record<TriageTest, number> | null, threshold: number = TRIAGE_THRESHOLD, cooldownTicks: number = TRIAGE_COOLDOWN_TICKS, kind?: TriageKind, gatedFlags?: TriageTest[]): Omit<TriageRecord, "kind" | "actorRole" | "inputHash" | "scoreOutcome" | "legal" | "defaultChoice"> {
  const flagged = gatedFlags ? [...gatedFlags] : flaggedTests(noul, threshold);
  const perKind = !!state.kindLeft && kind !== undefined;
  const until = state.cooldownUntil[actorId];
  let escalated = false;
  let skipped: TriageRecord["skipped"] = null;
  if (flagged.length) {
    if (until !== undefined && tick < until) skipped = "cooldown";
    else if ((perKind ? state.kindLeft![kind!] ?? 0 : state.budgetLeft) <= 0) skipped = "budget";
    else { escalated = true; state.budgetLeft -= 1; if (perKind) state.kindLeft![kind!] = (state.kindLeft![kind!] ?? 0) - 1; state.cooldownUntil[actorId] = tick + cooldownTicks; }
  }
  return { promptVersion: TRIAGE_PROMPT_VERSION, noul, threshold, flagged, budgetLeft: perKind ? state.kindLeft![kind!] ?? 0 : state.budgetLeft, cooldownUntilTick: state.cooldownUntil[actorId] ?? null, escalated, skipped };
}

export interface EscalationRequest {
  tick: number;
  actorId: string;
  kind: TriageKind;
  situation: TriageSituation;
  name: string;
  persona: Record<string, number>;
  purse: number;
  briefing: unknown;
  social: unknown;
  flagged: TriageTest[];
  legal: string[];
  /** What the sim does without the brain. */
  defaultChoice: string;
  /** v3: what happens if the actor does not go ahead (the second legal id). */
  alternative: string;
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
  /** v3: the brain's proceed probability (null on a fallback), its reason, the prior, weight, blend q and draw u. */
  p: number | null;
  reason: string | null;
  prior: number;
  weight: number;
  blend: number | null;
  u: number | null;
  alternative: string;
  /** The default (the sim's own choice, the picker's sample on a picked row), the fallback (§4.4). */
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
    kind: request.kind,
    situation: canonicalJson(request.situation),
    flagged: request.flagged.join(", "),
    defaultChoice: request.defaultChoice,
    alternative: request.alternative,
  };
  return BRAIN_TEMPLATE.replace(/\{(\w+)\}/g, (match, key: string) => key in values ? values[key] : match);
}

/** v3: `{"proceed": p, "reason": "…"}` with a finite p in [0, 1]; the reason is kept up to 200 chars. Else null. */
export function parseBrainProceed(raw: string | null): { p: number; reason: string | null } | null {
  if (typeof raw !== "string") return null;
  try {
    const value = JSON.parse(raw) as { proceed?: unknown; reason?: unknown };
    const p = value && typeof value === "object" ? value.proceed : undefined;
    if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1) return null;
    return { p: Math.round(p * 1e4) / 1e4, reason: typeof value.reason === "string" ? value.reason.slice(0, 200) : null };
  } catch { return null; }
}

/** §4.4 + v3: parse p, blend with the prior, draw u; proceed keeps the sim's choice, else the alternative. A fallback keeps the sim's choice. */
export function finishBrain(request: EscalationRequest, answer: EscalationAnswer, provider: string, model: string, inputHash: string, seed: number, live: boolean, prior: number = BRAIN_PRIOR, weight: number = BRAIN_WEIGHT): BrainRecord {
  let fallbackReason: BrainFallbackReason | null = answer.error ?? (live && answer.latencyMs > BRAIN_TIMEOUT_MS ? "timeout" : null);
  const raw = answer.finishReason === "length" ? null : answer.raw;
  const parsed = fallbackReason ? null : parseBrainProceed(raw);
  if (!fallbackReason && !parsed) fallbackReason = "illegal";
  const blend = parsed ? brainBlend(parsed.p, prior, weight) : null;
  const u = parsed ? pickerDraw(`${BRAIN_STREAM}:${request.kind}`, seed, request.actorId, request.tick) : null;
  const choice = parsed && u! >= blend! ? request.alternative : request.defaultChoice;
  return { role: BRAIN_ROLE, provider, model, promptVersion: request.promptVersion, inputHash, raw: answer.raw, choice, outcome: fallbackReason ? "fallback" : "model", fallbackReason,
    p: parsed?.p ?? null, reason: parsed?.reason ?? null, prior, weight, blend, u, alternative: request.alternative, pickerSampled: request.defaultChoice, latencyMs: answer.latencyMs };
}

/** §4.5 replay: the recorded triage and brain per (tick, actor); no vendor is called. */
export interface TriageEntry { tick: number; actorId: string; triage: TriageRecord; brain?: BrainRecord; applied: string }

export class TriageReplay implements EscalationBrain, TriageScorer {
  readonly name = "replay";
  readonly model = "replay";
  calls = 0;
  used = 0;
  private readonly records = new Map<string, { triage: TriageRecord; brain?: BrainRecord }>();
  constructor(entries: Iterable<{ tick: number; actorId: string; triage?: TriageRecord; brain?: BrainRecord }>) {
    for (const entry of entries) if (entry.triage) this.records.set(`${entry.tick}:${entry.actorId}:${entry.triage.kind}`, { triage: entry.triage, brain: entry.brain });
  }
  get size(): number { return this.records.size; }
  recorded(tick: number, actorId: string, kind: TriageKind): { triage: TriageRecord; brain?: BrainRecord } {
    const found = this.records.get(`${tick}:${actorId}:${kind}`);
    if (!found) throw new Error(`triage replay: no record for ${actorId} ${kind} at tick ${tick}`);
    this.used += 1;
    return found;
  }
  score(): TriageScoreAnswer {
    this.calls += 1;
    throw new Error("triage replay: the scorer must not be called");
  }
  escalate(): EscalationAnswer {
    this.calls += 1;
    throw new Error("triage replay: the brain must not be called");
  }
}

export const NEVER_FLAG = () => ({ port_holding: 0, faction_number: 0, allegiance_freedom: 0, broken_promise: 0 });
export const ALWAYS_FLAG = () => ({ port_holding: 1, faction_number: 0, allegiance_freedom: 0, broken_promise: 0 });

/** A brain stub that answers proceed `p(request)` (null: an empty, illegal answer); counts its calls. */
export function stubBrain(p: (request: EscalationRequest) => number | null, name = "stubBrain"): EscalationBrain & { calls: number } {
  const brain = { name, model: "stub", calls: 0, escalate(request: EscalationRequest): EscalationAnswer {
    brain.calls += 1;
    const value = p(request);
    return { raw: value === null ? "{}" : JSON.stringify({ proceed: value, reason: "stub" }), latencyMs: 0 };
  } };
  return brain;
}
/** Always says do not go ahead (p = 0). Under the blend it overrides with probability 1 − (1 − w)·prior. */
export function stubBrainOther(): EscalationBrain & { calls: number } { return stubBrain(() => 0, "stubBrainOther"); }
/** p = 0.5. */
export function stubBrainLast(): EscalationBrain & { calls: number } { return stubBrain(() => 0.5, "stubBrainLast"); }
/** Offline tuning stub shaped like the v2 live brain (agreed about 30 %): a deterministic 30 % at p 0.9, else p 0.1. */
export function stubBrainLiveLike(): EscalationBrain & { calls: number } {
  return stubBrain((r) => (pickerDraw("stub-live-like", 0, r.actorId, r.tick) < 0.3 ? 0.9 : 0.1), "stubBrainLiveLike");
}
