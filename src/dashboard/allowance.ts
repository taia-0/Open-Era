import { PASSAGE_COST_PER_TICK } from "../sim/engine.ts";
import { commandHolderId, round } from "../sim/state.ts";
import type { Character, WorldState } from "../sim/types.ts";

/**
 * Read-time allowance. Nothing here is written onto `WorldState`.
 *
 * The cap is one day of the passage charge already in the code:
 * `ticksPerDay * PASSAGE_COST_PER_TICK` (6 × 3 = 18). It refreshes when the
 * world tick lands on a day boundary (`tick % ticksPerDay === 0`). Unused
 * allowance does not carry. There is no spend in this slice, so a capped
 * member's remaining equals the cap and the field is omitted. Omitted means
 * full, the same omission `loyaltyAdjustment` uses at 0.
 *
 * The free command holder has no cap. A captive holder cannot spend. The
 * acting commander does not inherit the holder's cap; they keep 18.
 */

export function allowanceCap(world: WorldState): number {
  return round(world.ticksPerDay * PASSAGE_COST_PER_TICK, 2);
}

export interface QuotedBillDraw {
  treasuryDrawn: number;
  purseDrawn: number;
  /** Null when the drawer is uncapped. Otherwise what remains of today's cap. */
  allowanceRemaining: number | null;
}

/**
 * How a quoted bill would be drawn. Not called from `runTick`.
 *
 * Whole cents. Allowance first, then the purse, and never more from the
 * treasury than it holds. The two shares sum to the bill. A shortfall refuses
 * the whole quote. An uncapped holder draws the treasury only; the purse is
 * the later `source: "purse"` choice, not this default.
 */
export function drawQuotedBill(input: {
  bill: number;
  uncapped: boolean;
  allowanceRemaining: number;
  purse: number;
  treasury: number;
}): { ok: true } & QuotedBillDraw | { ok: false; reason: "shortfall" } {
  const billCents = Math.round(input.bill * 100);
  if (billCents < 0) return { ok: false, reason: "shortfall" };
  const treasuryCents = Math.max(0, Math.round(input.treasury * 100));
  const purseCents = Math.max(0, Math.round(input.purse * 100));
  if (input.uncapped) {
    if (treasuryCents < billCents) return { ok: false, reason: "shortfall" };
    return {
      ok: true,
      treasuryDrawn: round(billCents / 100, 2),
      purseDrawn: 0,
      allowanceRemaining: null,
    };
  }
  const allowanceCents = Math.max(0, Math.round(input.allowanceRemaining * 100));
  const treasuryDrawnCents = Math.min(billCents, allowanceCents, treasuryCents);
  const purseDrawnCents = billCents - treasuryDrawnCents;
  if (purseCents < purseDrawnCents) return { ok: false, reason: "shortfall" };
  return {
    ok: true,
    treasuryDrawn: round(treasuryDrawnCents / 100, 2),
    purseDrawn: round(purseDrawnCents / 100, 2),
    allowanceRemaining: round((allowanceCents - treasuryDrawnCents) / 100, 2),
  };
}

/**
 * Own-faction allowance on a character row. A rival row is null on every field.
 * `allowanceRemaining` is absent while it would equal the cap.
 */
export function projectAllowance(
  world: WorldState,
  reader: Character,
  character: Character,
): Record<string, unknown> {
  const hidden = {
    allowanceCap: null,
    allowanceRemaining: null,
    allowanceUncapped: null,
    allowanceRole: null,
    allowanceOnDayBoundary: null,
    allowanceDayStart: null,
    allowanceResetsOnTick: null,
    allowanceNote: null,
  };
  if (reader.factionId === null || character.factionId !== reader.factionId) return hidden;

  const holderId = commandHolderId(world, character.factionId);
  if (holderId === character.id && character.captivity === null) {
    return {
      ...hidden,
      allowanceUncapped: true,
      allowanceRole: "holder",
    };
  }
  if (holderId === character.id) {
    return {
      ...hidden,
      allowanceUncapped: false,
      allowanceRole: "captive-holder",
      allowanceNote: "Cannot spend while held.",
    };
  }

  const cap = allowanceCap(world);
  const dayStart = world.tick - (world.tick % world.ticksPerDay);
  const acting = world.factions[character.factionId]?.actingCommanderId === character.id;
  // No spend is recorded. Remaining equals the cap, so it is omitted.
  return {
    allowanceCap: cap,
    allowanceUncapped: false,
    allowanceRole: acting ? "acting-commander" : "member",
    allowanceOnDayBoundary: world.tick % world.ticksPerDay === 0,
    allowanceDayStart: dayStart,
    allowanceResetsOnTick: dayStart + world.ticksPerDay,
    allowanceNote: null,
  };
}
