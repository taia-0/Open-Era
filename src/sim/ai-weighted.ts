import type { ChoiceAnswerRecord } from "./ai-context.ts";
import { railedOptions, sha256, type TaxChoice, type TaxStepPersona } from "./ai-provider.ts";
import { canonicalJson } from "./state.ts";

/**
 * Variant b: the ruler's traits weight the tax step (ai-tax-weighted).
 *
 * The scorer's pick is the centre of a distribution over down / hold / up.
 * The holder's traits tilt it, the safety rails remove illegal options before
 * sampling, and the sim draws the choice from a derived RNG stream, so the
 * choice never depends on a vendor's answer. DeepSeek only writes the reason.
 *
 * Logits, with t = trait - 0.5 for each trait in [0, 1]:
 *
 *   drive      = ambition·t_amb + aggression·t_agg + commerce·t_com − caution·t_cau − loyalty·t_loy
 *   L(scorer) += centre
 *   L(up)     += drive
 *   L(down)   −= drive
 *   L(hold)   += steady · t_cau          (a cautious ruler leans to holding)
 *
 * The probabilities are a softmax over the legal options only (the rails run
 * first), which renormalizes. An optional social read from Jev's `loyaltyRead`
 * Choice is blended linearly with weight `social` (default 0: off, because
 * Jev's probabilities vary between identical calls and the repeat must be exact).
 */
export interface WeightedParams {
  /** Logit bonus for the scorer's pick. Larger means fewer departures. */
  centre: 2.1,
  /** Per-trait weights in the drive toward raising. */
  ambition: number;
  aggression: number;
  commerce: number;
  caution: number;
  loyalty: number;
  /** Logit pull toward hold per unit of (caution − 0.5). */
  steady: number;
  /** Blend weight for Jev's social read, 0 to 1. */
  social: number;
}

/** Tuned offline (seeds 1847 / 2718 / 4096, stub path, 1200 ticks): expected disagreement 23.2% / 31.4% / 18.7%, mean 24.5% (centre 2.6 gave 14–19%, 2.0 gave 20–37%). */
export const WEIGHTED_PARAMS: WeightedParams = {
  centre: 2.1,
  ambition: 1.0,
  aggression: 0.6,
  commerce: 0.4,
  caution: 1.0,
  loyalty: 0.3,
  steady: 0.8,
  social: 0,
};

export const WEIGHTED_PARAMS_VERSION = sha256(canonicalJson(WEIGHTED_PARAMS));

export type Distribution = Partial<Record<TaxChoice, number>>;

export interface WeightedComponents {
  drive: number;
  logits: Distribution;
  traits: Distribution;
  social: Distribution | null;
}

export interface WeightedDistribution {
  legal: TaxChoice[];
  components: WeightedComponents;
  distribution: Distribution;
}

const ORDER: TaxChoice[] = ["down", "hold", "up"];
const r6 = (value: number): number => Math.round(value * 1e6) / 1e6;

export function traitDrive(persona: TaxStepPersona, params: WeightedParams = WEIGHTED_PARAMS): number {
  return params.ambition * (persona.ambition - 0.5) + params.aggression * (persona.aggression - 0.5)
    + params.commerce * (persona.commerce - 0.5) - params.caution * (persona.caution - 0.5)
    - params.loyalty * (persona.loyalty - 0.5);
}

/** Jev's loyaltyRead as a lean: breaking or wavering crews favour a cut, a firm crew tolerates a raise. */
export function socialRead(answers: Record<string, ChoiceAnswerRecord> | undefined): Distribution | null {
  const read = answers?.loyaltyRead;
  if (!read || read.type !== "choice") return null;
  const p = (key: string): number => (typeof read.probabilities[key] === "number" ? read.probabilities[key] : 0);
  const raw = { down: 0.2 + p("breaking") + 0.5 * p("wavering"), hold: 0.4 + 0.5 * p("wavering"), up: 0.2 + 0.5 * p("firm") };
  const total = raw.down + raw.hold + raw.up;
  return { down: raw.down / total, hold: raw.hold / total, up: raw.up / total };
}

export function taxStepDistribution(
  scorerChoice: TaxChoice, options: TaxChoice[], pressed: boolean, short: boolean, persona: TaxStepPersona,
  answers?: Record<string, ChoiceAnswerRecord>, params: WeightedParams = WEIGHTED_PARAMS,
): WeightedDistribution {
  // Rails first: no raise when pressed; no cut when short and not pressed.
  const legal = ORDER.filter((option) => railedOptions(options, pressed, short).includes(option));
  const drive = traitDrive(persona, params);
  const logits: Distribution = {};
  for (const option of legal) {
    let logit = option === scorerChoice ? params.centre : 0;
    if (option === "up") logit += drive;
    if (option === "down") logit -= drive;
    if (option === "hold") logit += params.steady * (persona.caution - 0.5);
    logits[option] = logit;
  }
  const max = Math.max(...legal.map((option) => logits[option]!));
  const exp = legal.map((option) => Math.exp(logits[option]! - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  const traits: Distribution = {};
  legal.forEach((option, index) => { traits[option] = exp[index] / sum; });
  const socialRaw = params.social > 0 ? socialRead(answers) : null;
  let social: Distribution | null = null;
  const distribution: Distribution = {};
  if (socialRaw) {
    const legalSum = legal.reduce((a, option) => a + (socialRaw[option] ?? 0), 0);
    social = {};
    for (const option of legal) social[option] = (socialRaw[option] ?? 0) / legalSum;
    for (const option of legal) distribution[option] = (1 - params.social) * traits[option]! + params.social * social[option]!;
  } else {
    for (const option of legal) distribution[option] = traits[option]!;
  }
  const round = (d: Distribution): Distribution => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, r6(v!)]));
  return { legal, components: { drive: r6(drive), logits: round(logits), traits: round(traits), social: social ? round(social) : null }, distribution: round(distribution) };
}

/** Inverse-CDF pick in the fixed order down, hold, up. */
export function sampleChoice(distribution: Distribution, legal: TaxChoice[], draw: number): TaxChoice {
  let cumulative = 0;
  for (const option of legal) {
    cumulative += distribution[option] ?? 0;
    if (draw < cumulative) return option;
  }
  return legal[legal.length - 1];
}

/**
 * The draw: a dedicated stream per decision, from the world seed, faction and tick.
 * It never touches `world.rngState`, so flag off (and every other draw) is unaffected.
 */
export function weightedDraw(seed: number, factionId: string, tick: number): number {
  const hex = sha256(`ai-tax-weighted:${seed}:${factionId}:${tick}`).replace(/^sha256:/, "").slice(0, 8);
  return Number.parseInt(hex, 16) / 0x1_0000_0000;
}

/**
 * Jev triage: escalate when the social read is uncertain or alarming —
 * loyaltyRead is "breaking", or its confidence is below ESCALATE_CONFIDENCE.
 * An escalation is logged and passed to the reason writer; it never changes the choice.
 */
export const ESCALATE_CONFIDENCE = 0.3;

export function triage(answers: Record<string, ChoiceAnswerRecord> | undefined): { escalate: boolean; why: string | null } {
  const read = answers?.loyaltyRead;
  if (!read) return { escalate: false, why: null };
  if (read.choice === "breaking") return { escalate: true, why: "loyalty read breaking" };
  if (typeof read.confidence === "number" && read.confidence < ESCALATE_CONFIDENCE) return { escalate: true, why: `loyalty read confidence ${read.confidence}` };
  return { escalate: false, why: null };
}

const TRAIT_WORDS: Record<keyof TaxStepPersona, string> = {
  ambition: "ambition", aggression: "aggression", caution: "caution", commerce: "commerce", loyalty: "loyalty",
};

/** The template reason when the writer fails: names the two traits that move the drive most, and the situation. */
export function templateReason(choice: TaxChoice, persona: TaxStepPersona, pressed: boolean, short: boolean): string {
  const situation = pressed ? "a port is at the revolt line" : short ? "pay is short" : "ports and pay are steady";
  const ranked = (Object.keys(TRAIT_WORDS) as Array<keyof TaxStepPersona>)
    .map((trait) => ({ trait, pull: Math.abs(persona[trait] - 0.5) }))
    .sort((a, b) => b.pull - a.pull || (a.trait < b.trait ? -1 : 1))
    .slice(0, 2)
    .map(({ trait }) => `${persona[trait] >= 0.5 ? "high" : "low"} ${TRAIT_WORDS[trait]}`);
  const verb = choice === "up" ? "raise" : choice === "down" ? "cut" : "hold";
  return `${ranked.join(" and ")}; ${situation}, so ${verb}.`;
}
