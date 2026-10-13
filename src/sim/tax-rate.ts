import { spendRole } from "./allowance.ts";
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

const TAX_RATE_ERROR = "The tax rate must be from 0.00 to 0.30 in steps of 0.01.";

/** Whole percent for a rate already on the one-cent grid. 0.12 is 12. */
export function taxRatePercent(rate: number): number {
  return Math.round(rate * 100);
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
