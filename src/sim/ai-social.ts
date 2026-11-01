import { buildTaxStepBriefing, GRUDGE_WEIGHTS, LOYALTY_READS, validateBriefing, type TaxStepBriefing } from "./ai-context.ts";
import { sha256 } from "./ai-provider.ts";
import { canonicalJson } from "./state.ts";
import type { WorldState } from "./types.ts";

/**
 * Slice 4 (docs/design/jev-social-picker.md): a social read per Free Tide
 * member, fed into the pick's `state` as full distributions. Read-only: a
 * read never writes the world. The cache is run-local and rebuilt on replay
 * from the recorded read records, so it is a pure function of the event log.
 */
export const SOCIAL_FACTION_ID = "free-tide";
export const SOCIAL_ROLE = "picker.social";
/** §5: cache expiry in ticks. */
export const SOCIAL_CACHE_TICKS = 24;
/** §6: the pick `state` cap with `social`. */
export const SOCIAL_STATE_MAX_BYTES = 2560;
/** §10: caps. */
export const SOCIAL_DEFAULT_CALL_CAP = 8000;
export const SOCIAL_DEFAULT_SPEND_CAP_USD = 0.35;

/** §4, exact wording: Pilot B's criteria with "the holder" → "this character". */
export const SOCIAL_LOYALTY_INSTRUCTIONS = "How firm is this character's loyalty to their faction?";
export const SOCIAL_LOYALTY_CRITERIA = {
  firm: "This character is settled in the faction and would not consider leaving.",
  wavering: "This character has doubts or grievances that could push them away.",
  breaking: "This character is close to leaving or acting against the faction.",
} as const;
export const SOCIAL_GRUDGE_INSTRUCTIONS = "How heavy is this character's grudge against ${id}?";
export const SOCIAL_GRUDGE_CRITERIA = {
  low: "A minor grievance that would not change what they do.",
  mid: "A grievance that colours their choices.",
  high: "A grievance that could drive them to act against the other.",
} as const;
export const SOCIAL_PICK_INSTRUCTIONS = "You are this character. Given your temperament, purse, crew, your loyalty and grudges, and what you know, which one of these actions would you most likely take now?";
export const READ_PROMPT_VERSION = sha256(`${SOCIAL_LOYALTY_INSTRUCTIONS}\n${canonicalJson(SOCIAL_LOYALTY_CRITERIA)}\n${SOCIAL_GRUDGE_INSTRUCTIONS}\n${canonicalJson(SOCIAL_GRUDGE_CRITERIA)}`);

export interface SocialQuestion { type: "choice"; instructions: string; criteria: Record<string, string> }

export interface SocialReadRequest {
  tick: number;
  memberId: string;
  state: { briefing: TaxStepBriefing };
  questions: Record<string, SocialQuestion>;
  promptVersion: string;
}

/** A Choice answer per question, as the vendor returns it (before the read rails). */
export interface SocialReadAnswer {
  answers: Record<string, { probabilities?: unknown; confidence?: unknown }> | null;
  latencyMs: number;
  error?: "timeout" | "error" | "cap";
}

export interface SocialReader {
  readonly name: string;
  readonly model: string;
  read(request: SocialReadRequest): SocialReadAnswer;
}

// Label → probability (2 dp), plus `confidence` (number or null) and, on grudges, `id`.
export type Dist = Record<string, any>;
export interface SocialBlock {
  loyalty: Dist | null;
  grudges: Array<(Dist & { id: string }) | null>;
  readTick: number;
  readInputHash: string;
}

/** §9: `data.ai.read`. On a hit only `cacheKey`, `hit` and `readTick` are kept. */
export interface SocialReadRecord {
  role: typeof SOCIAL_ROLE;
  cacheKey: string;
  hit: boolean;
  readTick: number;
  inputHash?: string;
  promptVersion?: string;
  provider?: string;
  model?: string;
  outcome?: "model" | "fallback";
  fallbackReason?: "timeout" | "error" | "illegal" | "cap" | null;
  loyalty?: Dist | null;
  grudges?: Array<(Dist & { id: string }) | null>;
  latencyMs?: number;
}

/** §2 signature: loyalty ×100 and the top-3 grudges (id, grievance ×100). */
export function socialSignature(briefing: TaxStepBriefing): { loyalty: number; grudges: Array<[string, number]> } {
  return { loyalty: Math.round(briefing.loyalty * 100), grudges: briefing.grudges.slice(0, 3).map((g) => [g.id, Math.round(g.grievance * 100)]) };
}

export function socialCacheKey(memberId: string, briefing: TaxStepBriefing): string {
  return sha256(`${READ_PROMPT_VERSION}:${memberId}:${canonicalJson(socialSignature(briefing))}`);
}

/** §4: 1 loyalty question + one per top grudge (at most 3). */
export function socialQuestions(briefing: TaxStepBriefing): Record<string, SocialQuestion> {
  const questions: Record<string, SocialQuestion> = {
    loyaltyRead: { type: "choice", instructions: SOCIAL_LOYALTY_INSTRUCTIONS, criteria: { ...SOCIAL_LOYALTY_CRITERIA } },
  };
  briefing.grudges.slice(0, 3).forEach((grudge, index) => {
    questions[`grudge_${index}`] = { type: "choice", instructions: SOCIAL_GRUDGE_INSTRUCTIONS.replace("${id}", grudge.id), criteria: { ...SOCIAL_GRUDGE_CRITERIA } };
  });
  return questions;
}

export function socialReadRequest(world: WorldState, memberId: string): { request: SocialReadRequest; key: string } | null {
  const validated = validateBriefing(world, buildTaxStepBriefing(world, memberId));
  if (!validated) return null;
  const briefing = validated.briefing;
  return {
    request: { tick: world.tick, memberId, state: { briefing }, questions: socialQuestions(briefing), promptVersion: READ_PROMPT_VERSION },
    key: socialCacheKey(memberId, briefing),
  };
}

const r2 = (value: number) => Math.round(value * 100) / 100;

/** §8 read rails: known labels, finite values in [0, 1], renormalized; a zero sum is null. */
export function railRead(raw: { probabilities?: unknown; confidence?: unknown } | undefined, labels: readonly string[]): Dist | null {
  const given = raw && raw.probabilities && typeof raw.probabilities === "object" && !Array.isArray(raw.probabilities) ? raw.probabilities as Record<string, unknown> : null;
  if (!given) return null;
  const kept = labels.map((label) => { const v = given[label]; return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0; });
  const sum = kept.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return null;
  const out: Dist = {};
  labels.forEach((label, i) => { out[label] = r2(kept[i] / sum); });
  const c = raw!.confidence;
  out.confidence = typeof c === "number" && Number.isFinite(c) ? r2(Math.min(1, Math.max(0, c))) : null;
  return out;
}

export function socialFromAnswer(request: SocialReadRequest, answer: SocialReadAnswer): { loyalty: Dist | null; grudges: Array<(Dist & { id: string }) | null> } | null {
  if (answer.error || !answer.answers) return null;
  const loyalty = railRead(answer.answers.loyaltyRead, LOYALTY_READS);
  const grudges = request.state.briefing.grudges.slice(0, 3).map((g, i) => {
    const d = railRead(answer.answers![`grudge_${i}`], GRUDGE_WEIGHTS);
    return d ? { id: g.id, ...d } : null;
  });
  if (!loyalty && grudges.every((g) => g === null)) return null;
  return { loyalty, grudges };
}

/** §11 item 7: a loyalty-driven pick departs from the scorer with wavering + breaking ≥ 0.5. */
export function loyaltyDriven(record: { sampled: string; scorerPick: string }, social: SocialBlock | null | undefined): boolean {
  const l = social?.loyalty;
  return record.sampled !== record.scorerPick && !!l && (l.wavering ?? 0) + (l.breaking ?? 0) >= 0.5;
}

// Stubs.
/** Deterministic read stub: loyalty from the briefing's loyalty, grudges from grievance. */
export function stubSocialFromTraits(): SocialReader & { calls: number } {
  const reader = { name: "stubSocial", model: "stub", calls: 0, read(request: SocialReadRequest): SocialReadAnswer {
    reader.calls += 1;
    const loyal = Math.min(1, Math.max(0, request.state.briefing.loyalty));
    const answers: Record<string, { probabilities: Record<string, number>; confidence: number }> = {
      loyaltyRead: { probabilities: { firm: loyal, wavering: (1 - loyal) * 0.7, breaking: (1 - loyal) * 0.3 }, confidence: 0.5 },
    };
    request.state.briefing.grudges.slice(0, 3).forEach((g, i) => {
      const h = Math.min(1, Math.max(0, g.grievance));
      answers[`grudge_${i}`] = { probabilities: { low: 1 - h, mid: 0.5, high: h }, confidence: 0.5 };
    });
    return { answers, latencyMs: 0 };
  } };
  return reader;
}

/** Replay (§9): recorded misses by (tick, member); never asks the vendor. */
export class SocialReplay implements SocialReader {
  readonly name = "replay";
  readonly model = "replay";
  calls = 0;
  private readonly misses = new Map<string, SocialReadRecord>();
  private readonly all = new Map<string, SocialReadRecord>();
  constructor(entries: Iterable<{ tick: number; actorId: string; read: SocialReadRecord }>) {
    for (const { tick, actorId, read } of entries) {
      this.all.set(`${tick}:${actorId}`, read);
      if (!read.hit) this.misses.set(`${tick}:${actorId}`, read);
    }
  }
  recorded(tick: number, memberId: string): SocialReadRecord | undefined { return this.all.get(`${tick}:${memberId}`); }
  read(): SocialReadAnswer { this.calls += 1; throw new Error("social replay: the reader must not be called"); }
}
