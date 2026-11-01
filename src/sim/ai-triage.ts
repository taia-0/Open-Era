import { sha256 } from "./ai-provider.ts";
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
export const BRAIN_SYSTEM = "Answer as JSON: {\"choice\":\"<option id>\"}.";
export const BRAIN_TEMPLATE = [
  "You are {name} ({actorId}), deciding what to do next. Your temperament (0 to 1): {persona}. Your purse: {purse} coins.",
  "What you know: {briefing}",
  "Your social read: {social}",
  "The decision ({kind}): {situation}",
  "This decision was flagged as weighty for: {flagged}.",
  "Legal options: {legal}",
  "Copy one option id exactly as written, including every colon and dash (for example \"work:-:-\", not \"work\").",
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
  scoreOutcome: "model" | "timeout" | "error" | "cap";
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
export function triageStep(state: TriageState, actorId: string, tick: number, noul: Record<TriageTest, number> | null, threshold: number = TRIAGE_THRESHOLD, cooldownTicks: number = TRIAGE_COOLDOWN_TICKS, kind?: TriageKind): Omit<TriageRecord, "kind" | "actorRole" | "inputHash" | "scoreOutcome" | "legal" | "defaultChoice"> {
  const flagged = flaggedTests(noul, threshold);
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
  /** What the sim does without the brain (not sent in the prompt). */
  defaultChoice: string;
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
  /** v2: the answer was legal only after normalizing (e.g. "work" -> "work:-:-"). */
  normalized: boolean;
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
    if (typeof choice !== "string") return null;
    if (legal.includes(choice)) return choice;
    return normalizeBrainChoice(choice, legal);
  } catch { return null; }
}

/**
 * v2: a bare action name ("work") or an id missing its "-" parts maps to the one legal id
 * it abbreviates; an ambiguous or unknown name stays illegal. Counted as `normalized`.
 */
export function normalizeBrainChoice(choice: string, legal: string[]): string | null {
  const bare = choice.trim().replace(/(:-)+$/, "");
  if (!bare) return null;
  const matches = legal.filter((id) => id === bare || id.replace(/(:-)+$/, "") === bare);
  return matches.length === 1 ? matches[0] : null;
}

/** True when the raw answer parsed only through normalization. */
export function brainNormalized(raw: string | null, legal: string[]): boolean {
  if (typeof raw !== "string") return false;
  try { const c = (JSON.parse(raw) as { choice?: unknown })?.choice; return typeof c === "string" && !legal.includes(c) && normalizeBrainChoice(c, legal) !== null; } catch { return false; }
}

/** §4.4: legal id, else the picker's sample, else `candidates[0]`. */
export function finishBrain(request: EscalationRequest, answer: EscalationAnswer, provider: string, model: string, inputHash: string, pickerSampled: string, scorerPick: string, live: boolean): BrainRecord {
  // §4.4 fallback order: the default, then the first legal id.
  let fallbackReason: BrainFallbackReason | null = answer.error ?? (live && answer.latencyMs > BRAIN_TIMEOUT_MS ? "timeout" : null);
  const raw = answer.finishReason === "length" ? null : answer.raw;
  const parsed = fallbackReason ? null : parseBrainChoice(raw, request.legal);
  if (!fallbackReason && !parsed) fallbackReason = "illegal";
  const choice = parsed ?? (request.legal.includes(pickerSampled) ? pickerSampled : scorerPick);
  return { role: BRAIN_ROLE, provider, model, promptVersion: request.promptVersion, inputHash, raw: answer.raw, choice, outcome: fallbackReason ? "fallback" : "model", fallbackReason, normalized: !fallbackReason && brainNormalized(raw, request.legal), pickerSampled, latencyMs: answer.latencyMs };
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
/** The first legal id other than the default: always overrides. */
export function stubBrainOther(): EscalationBrain & { calls: number } {
  return stubBrain((request) => request.legal.find((id) => id !== request.defaultChoice) ?? request.legal[0], "stubBrainOther");
}
export function stubBrainLast(): EscalationBrain & { calls: number } {
  return stubBrain((request) => request.legal[request.legal.length - 1], "stubBrainLast");
}
