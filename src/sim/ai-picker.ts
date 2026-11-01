import { createHash } from "node:crypto";

/**
 * Slice 1 picker seam (docs/design/next-slices.md, "Slice 1: Picker seam,
 * side stream, recorded probabilities"). Generic: any decision that has a
 * set of option ids and a probability per option can be sampled here.
 *
 * Side stream (`pickerRngState`, ai-brain.md line 92 / M33 rule 6): the draw
 * `u` is keyed by seed, tick and actor. It is derived by hashing the key, so
 * it is stateless: it never reads or writes `world.rngState`,
 * `desertionRngState`, or any world field, and never calls `Math.random`.
 * Nothing about it lands in `stateHash`. A stateful `world.pickerRngState`
 * would change the hash the first time the picker ran, which would break the
 * slice-1 gate "stubArgmax equals flag off"; the keyed derivation gives the
 * same independence with no world field.
 *
 * The record (`PickerRecord`) follows ai-brain.md line 208 (`data.ai.picker`:
 * model, promptVersion, inputHash, outcome, index, p) plus `options` and `u`,
 * so replay redraws from the recorded probabilities and never calls a provider.
 */

/** The stream name; also the key prefix. Kept as "ai-tax-weighted" for the tax step so earlier traces replay unchanged. */
export type PickerStream = string;
export const PICKER_RNG_STATE = "pickerRngState";

export function pickerDraw(stream: PickerStream, seed: number, actorId: string, tick: number): number {
  const hex = createHash("sha256").update(`${stream}:${seed}:${actorId}:${tick}`).digest("hex").slice(0, 8);
  return Number.parseInt(hex, 16) / 0x1_0000_0000;
}

export interface PickerRecord {
  model: string;
  promptVersion: string;
  inputHash: string;
  outcome: "model" | "fallback" | "stub" | "replay";
  /** Legal option ids, sorted by id (jev-capabilities.md lines 70–81). */
  options: string[];
  /** Renormalized probabilities, aligned with `options`. */
  p: number[];
  index: number;
  u: number;
}

/**
 * Sort by id, drop illegal or zero-weight-undefined options, renormalize, and
 * pick by inverse CDF at `u`. Throws on an empty legal set or a non-finite or
 * negative weight, and on a zero total.
 */
export function pick(weights: Record<string, number>, legal: readonly string[], u: number): { options: string[]; p: number[]; index: number } {
  if (!(u >= 0 && u < 1)) throw new Error(`picker: draw ${u} outside [0, 1)`);
  const options = [...legal].sort();
  if (options.length === 0) throw new Error("picker: no legal option");
  const raw = options.map((id) => weights[id] ?? 0);
  if (raw.some((w) => !Number.isFinite(w) || w < 0)) throw new Error("picker: bad weight");
  const total = raw.reduce((a, b) => a + b, 0);
  if (!(total > 0)) throw new Error("picker: zero total weight");
  const p = raw.map((w) => w / total);
  return { options, p, index: indexAt(p, u) };
}

/** Inverse CDF; the last option takes any rounding remainder. */
export function indexAt(p: readonly number[], u: number): number {
  let cumulative = 0;
  for (let i = 0; i < p.length; i += 1) {
    cumulative += p[i];
    if (u < cumulative) return i;
  }
  return p.length - 1;
}

/** Stub distributions (next-slices.md slice 1). `top` is the scorer's pick (candidates[0]). */
export type PickerStubName = "stubArgmax" | "stubUniform" | "stubScripted";
export function stubArgmax(legal: readonly string[], top: string): Record<string, number> {
  return Object.fromEntries(legal.map((id) => [id, id === top ? 1 : 0]));
}
export function stubUniform(legal: readonly string[]): Record<string, number> {
  return Object.fromEntries(legal.map((id) => [id, 1]));
}
export function stubScripted(script: Record<string, Record<string, number>>, key: string, legal: readonly string[], top: string): Record<string, number> {
  return script[key] ?? stubArgmax(legal, top);
}

/**
 * Replay source: the recorded p and u per (tick, actor), used as-is. `take`
 * throws when no record exists; `check` throws when the live decision's legal
 * options differ from the recorded ones or the redraw lands elsewhere.
 */
export class PickerReplay {
  private readonly records = new Map<string, PickerRecord>();
  used = 0;
  constructor(entries: Iterable<{ tick: number; actorId: string; picker: PickerRecord }>) {
    for (const { tick, actorId, picker } of entries) this.records.set(`${tick}:${actorId}`, picker);
  }
  get size(): number { return this.records.size; }
  take(tick: number, actorId: string, legal: readonly string[]): PickerRecord {
    const record = this.records.get(`${tick}:${actorId}`);
    if (!record) throw new Error(`picker replay: no recorded draw for ${actorId} at tick ${tick}`);
    const options = [...legal].sort();
    if (options.join(",") !== record.options.join(",")) {
      throw new Error(`picker replay: options mismatch for ${actorId} at tick ${tick}: live [${options}] recorded [${record.options}]`);
    }
    const index = indexAt(record.p, record.u);
    if (index !== record.index) throw new Error(`picker replay: redraw index ${index} != recorded ${record.index} for ${actorId} at tick ${tick}`);
    this.used += 1;
    return record;
  }
}
