import { freeMateCount, fullAllowance, spendRole } from "./allowance.ts";
import { newsStabilityThousandths } from "./news.ts";
import { CLAIM_STABILITY_FLOOR, commandHolderId } from "./state.ts";
import type { Character, WorldState } from "./types.ts";

/**
 * Prototype guard on the rate the free command holder may name.
 *
 * Inclusive bounds, one-cent steps, and a 24-tick cooldown. The field that
 * records the last set stays off the faction until a set actually happens.
 */
export const TAX_RATE_MIN = 0;
export const TAX_RATE_MAX = 0.3;
export const TAX_RATE_STEP = 0.01;
export const TAX_RATE_COOLDOWN_TICKS = 24;

/**
 * A holding rate at or below this subtracts no stability. There is no
 * recovery term for a low rate.
 */
export const TAX_DRIFT_THRESHOLD = 0.15;
/** Stability subtracted for one band of 0.05 above the threshold. */
export const TAX_DRIFT_PER_BAND = 0.03;

const TAX_RATE_ERROR = "The tax rate must be from 0.00 to 0.30 in steps of 0.01.";

/** Whole percent for a rate already on the one-cent grid. 0.12 is 12. */
export function taxRatePercent(rate: number): number {
  return Math.round(rate * 100);
}

/**
 * Stability a holding rate subtracts on one peaceful upkeep.
 *
 * A rate at or below 0.15 subtracts zero. Above it the count is integer
 * hundredths: `bands = ceil((nearest(rate * 100) - 15) / 5)`, and the drift
 * is `bands * 0.03`. Rates 0.16 through 0.20 subtract 0.03, 0.21 through
 * 0.25 subtract 0.06, and 0.26 through 0.30 subtract 0.09. A neutral port
 * has no holding rate; the caller passes 0.
 */
export function taxDrift(taxRate: number): number {
  if (!(taxRate > TAX_DRIFT_THRESHOLD)) return 0;
  const cents = Math.round(taxRate * 100);
  const bands = Math.ceil((cents - 15) / 5);
  return bands * TAX_DRIFT_PER_BAND;
}

/**
 * An absolute rate on the one-cent grid, from 0.00 through 0.30.
 *
 * A value that is not already a hundredth is refused. It is not rounded onto
 * the grid. The stored rate is the cent count divided by 100.
 */
export function parseTaxRate(
  value: unknown,
): { ok: true; taxRate: number } | { ok: false; code: "invalid-tax-rate"; error: string } {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, code: "invalid-tax-rate", error: TAX_RATE_ERROR };
  }
  const scaled = value * 100;
  const cents = Math.round(scaled);
  if (Math.abs(scaled - cents) > 1e-8 || cents < TAX_RATE_MIN * 100 || cents > TAX_RATE_MAX * 100) {
    return { ok: false, code: "invalid-tax-rate", error: TAX_RATE_ERROR };
  }
  return { ok: true, taxRate: cents / 100 };
}

/**
 * Why this character may not set the rate, or null when the set may proceed.
 *
 * The free command holder is the only writer. A captive holder is refused
 * earlier, by the captivity gate. The acting commander is a member and does
 * not inherit the power. A repeat of the live rate is refused before the
 * cooldown, so it does not burn the clock. A missing `taxRateSetTick` means
 * the rate has never been changed. `exceptCommandId` is the command now
 * resolving, which is already sitting in `pendingCommands`.
 */
export function taxRateCommandRefusal(
  world: WorldState,
  character: Character,
  taxRate: number,
  exceptCommandId?: string,
): { ok: false; code: string; error: string } | null {
  if (!character.factionId || spendRole(world, character) !== "holder") {
    return {
      ok: false,
      code: "not-command-holder",
      error: "Only the free command holder may set this faction's tax rate.",
    };
  }
  const faction = world.factions[character.factionId];
  if (faction.taxRate === taxRate) {
    return {
      ok: false,
      code: "tax-rate-unchanged",
      error: `The tax rate is already ${taxRatePercent(taxRate)}%.`,
    };
  }
  const setTick = faction.taxRateSetTick;
  if (setTick !== undefined && world.tick < setTick + TAX_RATE_COOLDOWN_TICKS) {
    const next = setTick + TAX_RATE_COOLDOWN_TICKS;
    return {
      ok: false,
      code: "tax-rate-cooldown",
      error: `The tax rate was set on tick ${setTick} and cannot change again until tick ${next}.`,
    };
  }
  const queued = world.pendingCommands.some((command) =>
    command.type === "set-tax-rate" &&
    command.factionId === character.factionId &&
    command.id !== exceptCommandId,
  );
  if (queued) {
    return {
      ok: false,
      code: "tax-rate-already-queued",
      error: "A tax-rate change is already queued.",
    };
  }
  return null;
}

/**
 * One sea tick of passage. The same figure `PASSAGE_COST_PER_TICK` charges.
 * A day of it is `ticksPerDay * 3`, which is 18, and the short-treasury test
 * is that day in whole cents: `mates * 1800`.
 */
export const PASSAGE_PER_TICK = 3;

export interface AutonomousTaxStep {
  holderId: string;
  taxRate: number;
  previousTaxRate: number;
}

/**
 * The free command holder of one faction, or null when that seat is empty,
 * captive, or not this faction's holder. The acting commander is a member
 * and is not returned.
 */
function freeCommandHolder(world: WorldState, factionId: string): Character | null {
  const holders = Object.values(world.characters)
    .filter((character) => character.factionId === factionId && spendRole(world, character) === "holder")
    .sort((left, right) => left.id.localeCompare(right.id));
  if (holders[0]) return holders[0];
  // Founder tax seat (breakaway-tax.md, ruling 1): until someone issues an order,
  // the declaring owner holds the tax seat of a breakaway if alive, still a member,
  // and not captive. Nothing else reads this fallback.
  const founderId = world.factions[factionId]?.founderId;
  if (!founderId || commandHolderId(world, factionId) !== null) return null;
  const founder = world.characters[founderId];
  if (!founder || founder.dead || founder.factionId !== factionId || founder.captivity) return null;
  return founder;
}

/**
 * One cent a free holder would apply on this tick, or null.
 *
 * The clock is tick `t > 0` with `t % 24 === 0`. Every free holder is
 * eligible, including a human one. A live session drops her afterward; this
 * function does not. A missing `taxRateSetTick` means the rate has never
 * changed. A tick still inside `taxRateSetTick + 24` waits. The same rate
 * emits nothing; the caller treats null as no event.
 *
 * Pressed is the live lowest stability among ports the faction holds, in
 * thousandths, at or under the claim floor of 55. Short is the allowance
 * test: free mates exist and the treasury cannot pay each of them one day
 * of passage. Pressed steps down. Short steps up only when the port is not
 * pressed. The cent stops at 0 and at 30.
 */
/** One step of the autonomous tax clock (ai-pilot-a.md, slice A0). */
export type TaxChoice = "down" | "hold" | "up";

/**
 * What the scorer sees at one open clock point. Pure, no draw, writes nothing.
 * `options` is the legal set in the fixed order down, hold, up: hold always,
 * down when cents > 0, up when cents < 30. A faction with no port is frozen by
 * the tree already, so its set is hold only and `landless` is true.
 */
export interface TaxStepOptions {
  holderId: string;
  rateCents: number;
  pressed: boolean;
  short: boolean;
  lowestStabilityThousandths: number | null;
  treasuryCents: number;
  freeMates: number;
  landless: boolean;
  options: TaxChoice[];
  scorerChoice: TaxChoice;
}

/** Null when the clock gate is closed: not a 24-tick point, no free holder, or cooldown. */
export function taxStepOptions(world: WorldState, factionId: string): TaxStepOptions | null {
  if (world.tick <= 0 || world.tick % TAX_RATE_COOLDOWN_TICKS !== 0) return null;
  const faction = world.factions[factionId];
  if (!faction) return null;
  const holder = freeCommandHolder(world, factionId);
  if (!holder) return null;
  const setTick = faction.taxRateSetTick;
  if (setTick !== undefined && world.tick < setTick + TAX_RATE_COOLDOWN_TICKS) return null;

  const cents = Math.round(faction.taxRate * 100);
  const maxCents = Math.round(TAX_RATE_MAX * 100);
  const treasuryCents = Math.round(faction.treasury * 100);
  const held = Object.values(world.settlements).filter((settlement) => settlement.factionId === factionId);
  // A faction with no port does not step up or down until it holds one again.
  if (held.length === 0) {
    return {
      holderId: holder.id, rateCents: cents, pressed: false, short: false, lowestStabilityThousandths: null,
      treasuryCents, freeMates: 0, landless: true, options: ["hold"], scorerChoice: "hold",
    };
  }
  let lowest = Number.POSITIVE_INFINITY;
  let known = false;
  for (const settlement of held) {
    const figure = newsStabilityThousandths(world, holder, settlement.id, true);
    if (figure === null) continue;
    known = true;
    lowest = Math.min(lowest, figure);
  }
  const pressed = known && lowest <= CLAIM_STABILITY_FLOOR * 1000;
  // The founder seat is not a mate (breakaway-tax.md, ruling 2): a faction with
  // no mates does not step up for short. freeMateCount counts the founder,
  // since only this step reads the fallback, so take the founder back out.
  const founderSeat = commandHolderId(world, factionId) === null;
  const mates = freeMateCount(world, factionId) - (founderSeat ? 1 : 0);
  const dayCents = Math.round(fullAllowance(world, PASSAGE_PER_TICK) * 100);
  const short = mates > 0 && treasuryCents < mates * dayCents;
  let scorerChoice: TaxChoice = "hold";
  if (pressed && cents > 0) scorerChoice = "down";
  else if (!pressed && short && cents < maxCents) scorerChoice = "up";
  const options: TaxChoice[] = [];
  if (cents > 0) options.push("down");
  options.push("hold");
  if (cents < maxCents) options.push("up");
  return {
    holderId: holder.id, rateCents: cents, pressed, short,
    lowestStabilityThousandths: known ? lowest : null,
    treasuryCents, freeMates: mates, landless: false, options, scorerChoice,
  };
}

/** The rate a choice lands on, in cents. */
export function taxChoiceCents(rateCents: number, choice: TaxChoice): number {
  return rateCents + (choice === "up" ? 1 : choice === "down" ? -1 : 0);
}

/** Thin wrapper over `taxStepOptions`: null for a closed gate or a hold. */
export function autonomousTaxStep(world: WorldState, factionId: string): AutonomousTaxStep | null {
  const step = taxStepOptions(world, factionId);
  if (!step || step.scorerChoice === "hold") return null;
  const faction = world.factions[factionId];
  return {
    holderId: step.holderId,
    taxRate: taxChoiceCents(step.rateCents, step.scorerChoice) / 100,
    previousTaxRate: faction.taxRate,
  };
}
