import { buildTaxStepBriefing, CONTEXT_TIMEOUT_MS, validateBriefing } from "./ai-context.ts";
import { pickerDraw, indexAt } from "./ai-picker.ts";
import { sha256 } from "./ai-provider.ts";
import { canonicalJson } from "./state.ts";
import type { Character, DecisionCandidate, WorldState } from "./types.ts";

/**
 * Slice 3 (docs/design/jev-action-picker.md) on the slice-1 seam
 * (next-slices.md): a picker returns probabilities over the legal rows of
 * `buildCandidates`; the sim draws the row on the `ai-pick` side stream.
 * The picker never chooses. Flag off (no `TickAiOptions.picker`) never
 * reaches this module.
 */

export const PICKER_ROLE = "picker.action";
/** Section 7: call cap per run. */
export const PICKER_DEFAULT_CAP = 1000;
/** Section 4: the `state` cap, canonical JSON bytes. */
export const PICKER_STATE_MAX_BYTES = 2048;
/** Section 5: the timeout, as the context reader's. */
export const PICKER_TIMEOUT_MS = CONTEXT_TIMEOUT_MS;
/** Section 2: rows that are brain escalations; a legal set with one is not consulted. */
export const ESCALATION_ACTIONS = new Set(["raid", "claim-settlement"]);
export const LEGAL_FLOOR = -1000;

/** Section 1: `sha256("ai-pick:" + seed + ":" + actorId + ":" + tick)`, first 8 hex ÷ 2^32. Stateless; never touches `world.rngState`. */
export function pickDraw(seed: number, actorId: string, tick: number): number {
  return pickerDraw("ai-pick", seed, actorId, tick);
}

/** Section 2: the stable option id. */
export function optionId(row: DecisionCandidate): string {
  return `${row.action}:${row.targetId ?? "-"}:${row.resource ?? "-"}`;
}

/** Section 2: legal = score > -1000; ids sorted by localeCompare. Null when an id repeats. */
export function legalIds(candidates: DecisionCandidate[]): string[] | null {
  const ids = candidates.filter((row) => row.score > LEGAL_FLOOR).map(optionId);
  if (new Set(ids).size !== ids.length) return null;
  return ids.sort((a, b) => a.localeCompare(b));
}

/** Section 3: one fixed sentence per action kind, names filled in from the world. Hashed into the prompt version. */
export const PICKER_CRITERIA_WORDING = {
  rest: "Rest here to recover health and morale.",
  work: "Work here for dependable local income: about {workNet} coins after tax.",
  "buy-provisions": "Buy {resource} for the crew here.",
  recruit: "Recruit more crew here.",
  "trade-local": "Trade {resource} in the local market.",
  travel: "Sail to {target} (passage affordable).",
  other: "Take the {action} action{targetText}.",
} as const;
export const PICKER_INSTRUCTIONS = "You are this character. Given your temperament, purse, crew and what you know, which one of these actions would you most likely take now?";
export const PICKER_PROMPT_VERSION = sha256(`${PICKER_INSTRUCTIONS}\n${canonicalJson(PICKER_CRITERIA_WORDING)}`);

function settlementName(world: WorldState, id: string | undefined): string {
  return id ? world.settlements[id]?.name ?? id : "-";
}

export function criterionFor(world: WorldState, row: DecisionCandidate, workNet = 0): string {
  const W = PICKER_CRITERIA_WORDING;
  const resource = row.resource ?? "goods";
  switch (row.action) {
    case "rest": return W.rest;
    case "work": return W.work.replace("{workNet}", workNet.toFixed(2));
    case "recruit": return W.recruit;
    case "buy-provisions": return W["buy-provisions"].replace("{resource}", resource);
    case "trade-local": return W["trade-local"].replace("{resource}", resource);
    case "travel": return W.travel.replace("{target}", settlementName(world, row.targetId));
    default: return W.other.replace("{action}", row.action).replace("{targetText}", row.targetId ? ` at ${settlementName(world, row.targetId)}` : "");
  }
}

const r2 = (value: number) => Math.round(value * 100) / 100;

/** Section 4: character, briefing, situation; at most 2,048 bytes, dropping situation then known ports oldest first. */
/**
 * Lead ruling 2: what work earns and what the purse must cover. `workNet` is
 * `workGross` less the port's trade tax and levy (engine.ts `tradeTax`); the
 * pay need is the passage cost per day and a mate's full daily allowance.
 */
export interface PickerEconomy {
  purse: number;
  workGross: number;
  workTax: number;
  workNet: number;
  passagePerDay: number;
  purseDaysOfPassage: number;
  mateAllowancePerDay: number;
}

export function pickerState(
  world: WorldState, character: Character, economy?: PickerEconomy,
  social?: { loyalty: unknown; grudges: unknown[] } | null, maxBytes: number = PICKER_STATE_MAX_BYTES,
): { state: Record<string, unknown>; truncated: boolean } {
  const p = character.personality;
  const characterBlock = {
    id: character.id,
    personality: { ambition: r2(p.ambition), aggression: r2(p.aggression), caution: r2(p.caution), loyalty: r2(p.loyalty), curiosity: r2(p.curiosity), commerce: r2(p.commerce) },
    health: r2(character.health), morale: r2(character.morale), money: r2(character.money),
    troops: character.troops.count, provisions: r2(character.cargo.provisions),
    currentGoal: character.activeGoalId ?? null, planIntent: character.plan?.intent ?? null,
  };
  const validated = validateBriefing(world, buildTaxStepBriefing(world, character.id));
  const briefing = validated ? { ...validated.briefing } : null;
  const port = character.locationId ? world.settlements[character.locationId] : undefined;
  const faction = port?.factionId ? world.factions[port.factionId] : undefined;
  const situation = {
    portId: port?.id ?? null, holderFactionId: port?.factionId ?? null,
    factionRate: faction ? r2(faction.taxRate) : null, factionTreasury: faction ? r2(faction.treasury) : null,
  };
  let truncated = validated?.truncated ?? false;
  // Slice 4 §6: `social` rides along when set (null when the read failed); cap 2,560 then.
  const state: Record<string, unknown> = { character: characterBlock, ...(economy ? { economy } : {}), briefing, situation, ...(social !== undefined ? { social: social ? { loyalty: social.loyalty, grudges: [...social.grudges] } : null } : {}) };
  const size = () => Buffer.byteLength(canonicalJson(state), "utf8");
  if (size() > maxBytes) { delete state.situation; truncated = true; }
  const ports = (briefing as { knownPorts?: Array<{ ageTicks?: number }> } | null)?.knownPorts;
  if (briefing && Array.isArray(ports)) {
    const kept = [...ports];
    while (size() > maxBytes && kept.length > 0) {
      // Oldest = largest age; drop it.
      let oldest = 0;
      kept.forEach((port, index) => { if ((port.ageTicks ?? 0) > (kept[oldest].ageTicks ?? 0)) oldest = index; });
      kept.splice(oldest, 1);
      (briefing as Record<string, unknown>).knownPorts = [...kept];
      truncated = true;
    }
  }
  // Slice 4 §6: then social grudges from the last; never social.loyalty.
  const socialBlock = state.social as { grudges: unknown[] } | null | undefined;
  while (socialBlock && size() > maxBytes && socialBlock.grudges.length > 0) { socialBlock.grudges.pop(); truncated = true; }
  return { state, truncated };
}

export interface PickerRequest {
  tick: number;
  actorId: string;
  legal: string[];
  criteria: Record<string, string>;
  state: Record<string, unknown>;
  promptVersion: string;
  /** The scorer's row id (`candidates[0]`). For stubs and the record; never sent to a vendor. */
  scorerPick: string;
  /** The scorer's score per legal id (4 dp). For the blend prior; never sent to a vendor. */
  scores: Record<string, number>;
  /** Slice 4: the social pick instructions (§4); absent for slice 3, which keeps PICKER_INSTRUCTIONS. */
  instructions?: string;
  /** Slice 5 (jev-triage.md §4.1): the four Noul questions riding on this request; absent without triage. */
  triage?: Record<string, { type: "noul"; instructions: string }>;
}

export interface PickerAnswer {
  probabilities: Record<string, unknown> | null;
  confidence?: number | null;
  responseModel?: string | null;
  latencyMs: number;
  error?: "timeout" | "error" | "cap";
  /** Stub only: use these probabilities as the final distribution, no blend (stubArgmax: "all on the top row"). */
  exact?: boolean;
  /** Slice 5: the raw Noul answers when triage questions were asked (sanitized by the engine). */
  noul?: unknown;
}

/** The seam. `choose` returns probabilities; it never picks. */
export interface ActionPicker {
  readonly name: string;
  readonly model: string;
  choose(request: PickerRequest): PickerAnswer;
}

export type PickerFallbackReason = "timeout" | "error" | "illegal" | "cap";

/** Section 6: `data.ai.picker` on the actor's `decision-made`. */
export interface ActionPickerRecord {
  role: typeof PICKER_ROLE;
  provider: string;
  model: string;
  responseModel: string | null;
  promptVersion: string;
  inputHash: string;
  legal: string[];
  probabilities: Record<string, number> | null;
  probabilitySum: number | null;
  confidence: number | null;
  /** Lead ruling 1: Jev's railed probabilities renormalized over the legal ids (6 dp). */
  jevDistribution?: Record<string, number> | null;
  /** The scorer prior's logits per legal id (6 dp). Null when exact or on a fallback. */
  prior?: Record<string, number> | null;
  /** The blend parameters used; null when the answer was exact or no blend was set. */
  blend?: BlendParams | null;
  exact?: boolean;
  distribution: Record<string, number> | null;
  draw: number;
  sampled: string;
  scorerPick: string;
  outcome: "model" | "fallback";
  fallbackReason: PickerFallbackReason | null;
  truncated: boolean;
  latencyMs: number;
  /** Slice 4 §9: sha256 of the social block in the pick state; absent in slice 3. */
  socialInputHash?: string;
}

/** Section 5 step 3: keep legal keys with finite values in [0, 1]; renormalize in id order; null when nothing is left. */
export function railProbabilities(raw: Record<string, unknown> | null, legal: string[]): { kept: Record<string, number>; distribution: Record<string, number> } | null {
  if (!raw || typeof raw !== "object") return null;
  const kept: Record<string, number> = {};
  for (const id of legal) {
    const value = (raw as Record<string, unknown>)[id];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1) kept[id] = value;
  }
  const sum = legal.reduce((total, id) => total + (kept[id] ?? 0), 0);
  if (!(sum > 0)) return null;
  const distribution: Record<string, number> = {};
  for (const id of legal) distribution[id] = Math.round(((kept[id] ?? 0) / sum) * 1e6) / 1e6;
  return { kept, distribution };
}

/**
 * Lead ruling 1, the blend. For legal id i with scorer score s_i, top row t:
 *
 *   prior_i  = centre                        if i = t
 *            = (s_i − s_t) / temperature     otherwise (≤ 0)
 *   logit_i  = prior_i + jevWeight · ln(max(p_jev_i, floor))
 *   final    = softmax(logit) over the legal ids
 *
 * The rails have already dropped illegal ids and bad values from p_jev.
 */
export interface BlendParams { centre: number; temperature: number; jevWeight: number; floor: number }
/**
 * Tuned offline (Lead ruling 3) with `stubFittedPicker` over the recorded live
 * Jev distributions; centre raised from 1.25 to 1.75 after the second live gate
 * (overrides 43 / 38 / 36% live). Fitted-stub check at 1.75, 1,200 ticks,
 * 1847 / 2718 / 4096: overrides 27.4 / 30.9 / 24.1% (see progress.md).
 */
export const PICKER_BLEND: BlendParams = { centre: 1.75, temperature: 24, jevWeight: 0.4, floor: 0.02 };

export function blendDistribution(jev: Record<string, number>, scores: Record<string, number>, scorerPick: string, legal: string[], params: BlendParams): { prior: Record<string, number>; distribution: Record<string, number> } {
  const top = scores[scorerPick] ?? 0;
  const prior: Record<string, number> = {};
  const logits = legal.map((id) => {
    prior[id] = id === scorerPick ? params.centre : ((scores[id] ?? top) - top) / params.temperature;
    return prior[id] + params.jevWeight * Math.log(Math.max(jev[id] ?? 0, params.floor));
  });
  const max = Math.max(...logits);
  const exp = logits.map((l) => Math.exp(l - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  const distribution: Record<string, number> = {};
  legal.forEach((id, i) => { distribution[id] = Math.round((exp[i] / sum) * 1e6) / 1e6; prior[id] = Math.round(prior[id] * 1e6) / 1e6; });
  return { prior, distribution };
}

/** Section 5 step 4: walk the cumulative sum in id order; the last id takes any remainder. */
export function sampleId(distribution: Record<string, number>, legal: string[], u: number): string {
  return legal[indexAt(legal.map((id) => distribution[id] ?? 0), u)];
}

/** Replay (section 6): the recorded record per (tick, actor); reused, never asked again. */
export class ActionPickerReplay implements ActionPicker {
  readonly name = "replay";
  readonly model = "replay";
  private readonly records = new Map<string, ActionPickerRecord>();
  calls = 0;
  used = 0;
  constructor(entries: Iterable<{ tick: number; actorId: string; picker: ActionPickerRecord }>) {
    for (const { tick, actorId, picker } of entries) this.records.set(`${tick}:${actorId}`, picker);
  }
  get size(): number { return this.records.size; }
  recorded(tick: number, actorId: string): ActionPickerRecord {
    const found = this.records.get(`${tick}:${actorId}`);
    if (!found) throw new Error(`action picker replay: no record for ${actorId} at tick ${tick}`);
    this.used += 1;
    return found;
  }
  choose(): PickerAnswer {
    this.calls += 1;
    throw new Error("action picker replay: the provider must not be called");
  }
}

// Stubs (section 9). All synchronous and offline.
export function stubArgmaxPicker(): ActionPicker & { calls: number } {
  const picker = { name: "stubArgmax", model: "stub", calls: 0, choose(request: PickerRequest): PickerAnswer {
    picker.calls += 1;
    const top = request.scorerPick;
    return { probabilities: Object.fromEntries(request.legal.map((id) => [id, id === top ? 1 : 0])), confidence: 1, latencyMs: 0, exact: true };
  } };
  return picker;
}
export function stubUniformPicker(): ActionPicker & { calls: number } {
  const picker = { name: "stubUniform", model: "stub", calls: 0, choose(request: PickerRequest): PickerAnswer {
    picker.calls += 1;
    return { probabilities: Object.fromEntries(request.legal.map((id) => [id, 1 / request.legal.length])), confidence: 1 / request.legal.length, latencyMs: 0 };
  } };
  return picker;
}
export function stubScriptedPicker(script: (request: PickerRequest) => PickerAnswer): ActionPicker {
  return { name: "stubScripted", model: "stub", choose: script };
}

/**
 * Offline tuning stub (Lead ruling 3): answers with distributions recorded from
 * live Jev runs. An exact legal-id list seen live returns one of its recorded
 * distributions (chosen by tick, so the run is deterministic); otherwise each id
 * gets its action kind's mean live share, renormalized.
 */
export function stubFittedPicker(recorded: Array<{ legal: string[]; distribution: Record<string, number> }>): ActionPicker & { calls: number; exactHits: number } {
  const byLegal = new Map<string, Array<Record<string, number>>>();
  const kindSum = new Map<string, number>();
  const kindN = new Map<string, number>();
  for (const { legal, distribution } of recorded) {
    const key = legal.join("|");
    byLegal.set(key, [...(byLegal.get(key) ?? []), distribution]);
    for (const id of legal) {
      const kind = id.split(":")[0];
      kindSum.set(kind, (kindSum.get(kind) ?? 0) + (distribution[id] ?? 0));
      kindN.set(kind, (kindN.get(kind) ?? 0) + 1);
    }
  }
  const picker = {
    name: "stubFitted", model: "stub", calls: 0, exactHits: 0,
    choose(request: PickerRequest): PickerAnswer {
      picker.calls += 1;
      const seen = byLegal.get(request.legal.join("|"));
      if (seen) { picker.exactHits += 1; return { probabilities: seen[request.tick % seen.length], latencyMs: 0 }; }
      const raw = request.legal.map((id) => { const kind = id.split(":")[0]; return (kindSum.get(kind) ?? 0.05) / (kindN.get(kind) ?? 1); });
      const total = raw.reduce((a, b) => a + b, 0);
      return { probabilities: Object.fromEntries(request.legal.map((id, i) => [id, raw[i] / total])), latencyMs: 0 };
    },
  };
  return picker;
}
