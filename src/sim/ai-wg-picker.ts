import { pickerDraw } from "./ai-picker.ts";
import { brainBlend } from "./ai-triage.ts";
import type { ActionPickerRecord } from "./ai-action-picker.ts";

/**
 * World Government picker, v1 (docs/design/wg-jev-picker.md). Behind `ai.pickerFactions`
 * (`--picker-factions free-tide,world-government`); the default is Free Tide only, so nothing here runs.
 * v1 consults WG's command holder and governors (ruling 2). The holder is Mara Vane, the player, so the
 * holder path is dormant: it is wired but only fires for an autonomous holder, after a seat change.
 * Nudge-only (ruling 3): q = 0.7·prior + 0.3·p (prior 0.95, weight 0.3), where p is Jev's probability of the
 * sim's own choice; the sim's choice is kept when u < q, otherwise Jev's top other legal id is taken.
 */
export const WG_FACTION_ID = "world-government";
export const PICKER_FACTIONS_DEFAULT: readonly string[] = ["free-tide"];
export const PICKER_FACTIONS = ["free-tide", WG_FACTION_ID] as const;
/** Ruling 1: recount max 1,482 × 1.25, per run. */
export const WG_PICKER_DEFAULT_CAP = 1853;
/** Ruling 1: 1,853 × $0.0000544, rounded up to the cent, per run. */
export const WG_PICKER_DEFAULT_SPEND_CAP_USD = 0.11;
export const WG_NUDGE_PRIOR = 0.95;
export const WG_NUDGE_WEIGHT = 0.3;
export const WG_NUDGE_STREAM = "ai-pick-wg";

export type WgRole = "holder" | "governor";

export interface WgNudge {
  role: WgRole;
  /** Jev's probability of the sim's choice (scorerPick); null on a fallback. */
  p: number | null;
  /** The picker answers probabilities only; it carries no reason (recorded as null). */
  reason: string | null;
  prior: number;
  weight: number;
  /** q, the probability of keeping the sim's choice; null on a fallback. */
  blend: number | null;
  u: number | null;
  /** Jev's highest-probability legal id other than the sim's choice (ties: id order); null on a fallback or no other id. */
  alternative: string | null;
  kept: boolean;
}

export function parsePickerFactions(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const list = value.split(",").map((s) => s.trim()).filter(Boolean);
  for (const f of list) if (!(PICKER_FACTIONS as readonly string[]).includes(f)) throw new Error(`--picker-factions: unknown faction ${f} (allowed: ${PICKER_FACTIONS.join(", ")})`);
  return list;
}

/** The nudge on a finished pick record. Pure: reads the record, the seed and the ids; replay recomputes it from the record. */
export function wgNudge(record: ActionPickerRecord, role: WgRole, seed: number, actorId: string, tick: number, prior = WG_NUDGE_PRIOR, weight = WG_NUDGE_WEIGHT): WgNudge {
  const dist = record.outcome === "model" ? record.jevDistribution ?? record.distribution : null;
  if (!dist) return { role, p: null, reason: null, prior, weight, blend: null, u: null, alternative: null, kept: true };
  const p = Math.round((dist[record.scorerPick] ?? 0) * 1e6) / 1e6;
  const blend = brainBlend(p, prior, weight);
  const u = pickerDraw(WG_NUDGE_STREAM, seed, actorId, tick);
  let alternative: string | null = null;
  for (const id of record.legal) if (id !== record.scorerPick && (alternative === null || (dist[id] ?? 0) > (dist[alternative] ?? 0))) alternative = id;
  const kept = u < blend || alternative === null;
  return { role, p, reason: null, prior, weight, blend, u, alternative, kept };
}
