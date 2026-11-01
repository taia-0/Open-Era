import { canonicalJson } from "./state.ts";
import type { WorldState } from "./types.ts";

/**
 * AI pilot B (docs/design/ai-pilot-b.md): the context reader's briefing for
 * Free Tide's tax step. Read-only: nothing here writes the world, emits an
 * event, or draws a number. Sorting is by id, so the output is order-stable.
 */
export const LOYALTY_READS = ["firm", "wavering", "breaking"] as const;
export type LoyaltyRead = typeof LOYALTY_READS[number];
export const GRUDGE_WEIGHTS = ["low", "mid", "high"] as const;
export type GrudgeWeight = typeof GRUDGE_WEIGHTS[number];

export interface BriefingGrudge { id: string; grievance: number; weight?: GrudgeWeight }
export interface BriefingAlly { id: string; trust: number }
export interface BriefingPort { port: string; holder: string | null; garrison: number; ageTicks: number }

export interface TaxStepBriefing {
  morale: number;
  loyalty: number;
  loyaltyRead: LoyaltyRead | null;
  grudges: BriefingGrudge[];
  allies: BriefingAlly[];
  knownPorts: BriefingPort[];
  /** Port ids whose knowledge is older than one tax clock. */
  staleKnowledge: string[];
  /** Present, and true, only when the validator cut the briefing to the cap. */
  truncated?: true;
}

/** Cap on the recorded briefing, in bytes of canonical JSON (section 2). */
export const BRIEFING_MAX_BYTES = 1024;
export const BRIEFING_TOP = 3;
/** Knowledge older than one tax clock is stale (section 8, default 4). */
export const STALE_AGE_TICKS = 24;

const round2 = (value: number) => Math.round(value * 100) / 100;
const byId = (left: { id: string }, right: { id: string }) => left.id.localeCompare(right.id);

export function briefingBytes(briefing: unknown): number {
  return Buffer.byteLength(canonicalJson(briefing), "utf8");
}

/** The deterministic serializer: the fallback and what the echo stub returns. */
export function buildTaxStepBriefing(world: WorldState, holderId: string): TaxStepBriefing {
  const holder = world.characters[holderId];
  if (!holder) {
    return { morale: 0, loyalty: 0, loyaltyRead: null, grudges: [], allies: [], knownPorts: [], staleKnowledge: [] };
  }
  const relationships = Object.values(holder.relationships ?? {});
  const grudges = relationships
    .filter((relation) => relation.grievance > 0)
    .map((relation) => ({ id: relation.characterId, grievance: round2(relation.grievance) }))
    .sort((left, right) => right.grievance - left.grievance || byId(left, right))
    .slice(0, BRIEFING_TOP);
  const allies = relationships
    .filter((relation) => holder.factionId !== null && world.characters[relation.characterId]?.factionId === holder.factionId)
    .map((relation) => ({ id: relation.characterId, trust: round2(relation.trust) }))
    .sort((left, right) => right.trust - left.trust || byId(left, right))
    .slice(0, BRIEFING_TOP);
  const knownPorts = Object.values(holder.knowledge ?? {})
    .map((entry) => ({
      port: entry.settlementId,
      holder: entry.factionId,
      garrison: Math.round(entry.garrisonEstimate),
      ageTicks: world.tick - entry.observedTick,
    }))
    .sort((left, right) => left.port.localeCompare(right.port));
  return {
    morale: Math.round(holder.morale),
    loyalty: round2(holder.personality.loyalty + (holder.loyaltyAdjustment ?? 0)),
    loyaltyRead: null,
    grudges,
    allies,
    knownPorts,
    staleKnowledge: knownPorts.filter((entry) => entry.ageTicks > STALE_AGE_TICKS).map((entry) => entry.port),
  };
}

export interface ValidatedBriefing {
  briefing: TaxStepBriefing;
  droppedIds: number;
  truncated: boolean;
}

const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

/**
 * Reduce any object to a legal briefing. Null when `value` is not an object
 * (the reader's `illegal` fallback). Unknown character, port, or faction ids
 * are dropped and counted; enums outside their set are cleared; keys outside
 * the schema are dropped; lists are cut to the top 3. Over the cap, drop
 * `staleKnowledge`, then `knownPorts` oldest first, then `allies`, then
 * `grudges` from the last, and set `truncated: true`.
 */
export function validateBriefing(world: WorldState, value: unknown): ValidatedBriefing | null {
  const input = record(value);
  if (!input) return null;
  let droppedIds = 0;
  const knownCharacter = (id: unknown): id is string => {
    if (typeof id === "string" && world.characters[id]) return true;
    droppedIds += 1;
    return false;
  };
  const knownPort = (id: unknown): id is string => {
    if (typeof id === "string" && world.settlements[id]) return true;
    droppedIds += 1;
    return false;
  };
  const grudges: BriefingGrudge[] = [];
  for (const raw of list(input.grudges)) {
    const entry = record(raw);
    if (!entry || !knownCharacter(entry.id)) continue;
    const grudge: BriefingGrudge = { id: entry.id as string, grievance: round2(finite(entry.grievance, 0)) };
    if ((GRUDGE_WEIGHTS as readonly unknown[]).includes(entry.weight)) grudge.weight = entry.weight as GrudgeWeight;
    grudges.push(grudge);
  }
  const allies: BriefingAlly[] = [];
  for (const raw of list(input.allies)) {
    const entry = record(raw);
    if (!entry || !knownCharacter(entry.id)) continue;
    allies.push({ id: entry.id as string, trust: round2(finite(entry.trust, 0)) });
  }
  const knownPorts: BriefingPort[] = [];
  for (const raw of list(input.knownPorts)) {
    const entry = record(raw);
    if (!entry || !knownPort(entry.port)) continue;
    let holder: string | null = null;
    if (typeof entry.holder === "string") {
      if (world.factions[entry.holder]) holder = entry.holder;
      else droppedIds += 1;
    }
    knownPorts.push({
      port: entry.port as string,
      holder,
      garrison: Math.round(finite(entry.garrison, 0)),
      ageTicks: Math.max(0, Math.round(finite(entry.ageTicks, 0))),
    });
  }
  const staleKnowledge = list(input.staleKnowledge).filter(knownPort) as string[];
  const briefing: TaxStepBriefing = {
    morale: Math.round(finite(input.morale, 0)),
    loyalty: round2(finite(input.loyalty, 0)),
    loyaltyRead: (LOYALTY_READS as readonly unknown[]).includes(input.loyaltyRead) ? input.loyaltyRead as LoyaltyRead : null,
    grudges: grudges.slice(0, BRIEFING_TOP),
    allies: allies.slice(0, BRIEFING_TOP),
    knownPorts,
    staleKnowledge,
  };
  let truncated = false;
  const over = () => briefingBytes(briefing) > BRIEFING_MAX_BYTES;
  const cut = () => { truncated = true; briefing.truncated = true; };
  if (over()) { cut(); briefing.staleKnowledge = []; }
  if (over()) {
    // Oldest first: largest ageTicks, ties by port id.
    briefing.knownPorts.sort((left, right) => right.ageTicks - left.ageTicks || left.port.localeCompare(right.port));
    while (over() && briefing.knownPorts.length > 0) briefing.knownPorts.shift();
    briefing.knownPorts.sort((left, right) => left.port.localeCompare(right.port));
  }
  if (over()) briefing.allies = [];
  while (over() && briefing.grudges.length > 0) briefing.grudges.pop();
  return { briefing, droppedIds, truncated };
}

/** What the reader is asked. `serializer` is the deterministic briefing it may refine. */
export interface ContextRequest {
  tick: number;
  factionId: string;
  holderId: string;
  serializer: TaxStepBriefing;
  promptVersion: string;
}

export interface ContextAnswer {
  raw: string | null;
  latencyMs: number;
  error?: "timeout" | "error" | "cap";
  /**
   * The reader's full per-question results, already sanitized by the
   * provider. Recorded on `data.ai.context.answers` only on a model outcome.
   * Stubs leave it out, so stub records are unchanged.
   */
  answers?: Record<string, ChoiceAnswerRecord>;
}

/**
 * One Jev Choice result as recorded (jev-capabilities.md section 2): the
 * argmax `choice`, the full `probabilities` over the offered options, and
 * `confidence`. Only known keys, only offered options, finite numbers in
 * [0, 1]. `probabilitySum` is the sum of the kept values as returned; the
 * record is not renormalised.
 */
export interface ChoiceAnswerRecord {
  type: "choice";
  options: string[];
  choice: string | null;
  probabilities: Record<string, number>;
  probabilitySum: number;
  confidence: number | null;
}

/** Synchronous, like `TaxStepProvider`. */
export interface ContextReader {
  readonly name: string;
  readonly model: string;
  read(request: ContextRequest): ContextAnswer;
}

/** Reader timeout from ai-brain.md. Proposed, not measured; stubs never reach it. */
export const CONTEXT_TIMEOUT_MS = 2_000;

export type ContextFallbackReason = "timeout" | "error" | "illegal" | "cap";

/** `data.ai.context` (ai-pilot-b.md section 3). The reducer never reads it. */
export interface ContextRecord {
  role: "context.taxStep";
  provider: string;
  model: string;
  promptVersion: string;
  inputHash: string;
  briefing: TaxStepBriefing;
  outcome: "model" | "fallback";
  fallbackReason: ContextFallbackReason | null;
  droppedIds: number;
  truncated: boolean;
  latencyMs: number;
  /** A5 Jev: the full Choice result per question, present only when the reader returned them. */
  answers?: Record<string, ChoiceAnswerRecord>;
}

/** Returns the serializer output. Deterministic. */
export function stubContextEcho(): ContextReader {
  return {
    name: "stub-context-echo",
    model: "stub-context-echo@1",
    read: (request) => ({ raw: JSON.stringify(request.serializer), latencyMs: 0 }),
  };
}

export type StubContextFailMode = "timeout" | "error" | "illegal" | "cycle";

/** As `stubFail`: fixed modes, or `cycle` rotating timeout, error, illegal. `illegal` is not an object. */
export function stubContextFail(mode: StubContextFailMode): ContextReader {
  let calls = 0;
  const order = ["timeout", "error", "illegal"] as const;
  return {
    name: "stub-context-fail",
    model: "stub-context-fail@1",
    read: () => {
      const kind = mode === "cycle" ? order[calls % order.length] : mode;
      calls += 1;
      if (kind === "illegal") return { raw: JSON.stringify("sideways"), latencyMs: 0 };
      return { raw: null, latencyMs: 0, error: kind };
    },
  };
}

/**
 * Valid shape, wrong content: ids not in the state, an out-of-set
 * `loyaltyRead` and grudge weight, an unknown faction, and a 4 KB padding field.
 */
export function stubContextGarbage(): ContextReader {
  return {
    name: "stub-context-garbage",
    model: "stub-context-garbage@1",
    read: (request) => ({
      raw: JSON.stringify({
        ...request.serializer,
        loyaltyRead: "ecstatic",
        grudges: [{ id: "character-999", grievance: 9, weight: "enormous" }, ...request.serializer.grudges],
        allies: [{ id: "ghost-ally", trust: 1 }, ...request.serializer.allies],
        knownPorts: [...request.serializer.knownPorts, { port: "atlantis", holder: "no-such-faction", garrison: 5, ageTicks: 1 }],
        staleKnowledge: [...request.serializer.staleKnowledge, "el-dorado"],
        padding: "x".repeat(4096),
      }),
      latencyMs: 0,
    }),
  };
}
