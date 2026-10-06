import { drawQuotedBill, memberAllowanceCap } from "../sim/allowance.ts";
import { PASSAGE_COST_PER_TICK } from "../sim/engine.ts";
import { commandHolderId, round } from "../sim/state.ts";
import type { Character, WorldState } from "../sim/types.ts";

export { drawQuotedBill };

/**
 * Allowance on a character row.
 *
 * The ceiling is one day of the passage charge already in the code:
 * `ticksPerDay * PASSAGE_COST_PER_TICK` (6 × 3 = 18). A member's row shows
 * the balance share, `min(18, treasury / free mates)`, not a hard-coded 18.
 * The sim stores `allowanceRemaining` when a capped member draws, and deletes
 * it when `tick-advanced` lands on a day boundary. Omitted means full, the
 * same omission `loyaltyAdjustment` uses at 0.
 *
 * The free command holder has no cap. A captive holder cannot spend. The
 * acting commander does not inherit the holder's cap; they keep the share.
 */

/** The ceiling, 18. A member row uses `memberAllowanceCap` instead. */
export function allowanceCap(world: WorldState): number {
  return round(world.ticksPerDay * PASSAGE_COST_PER_TICK, 2);
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
      allowanceCap: "no cap",
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

  const cap = memberAllowanceCap(world, character.factionId, PASSAGE_COST_PER_TICK);
  const dayStart = world.tick - (world.tick % world.ticksPerDay);
  const acting = world.factions[character.factionId]?.actingCommanderId === character.id;
  const remaining = character.allowanceRemaining;
  // A stored remainder cannot sit above the share this quote would allow.
  const effective = typeof remaining === "number" ? round(Math.min(remaining, cap), 2) : cap;
  // Omitted while full. A stored figure below the cap is what was drawn today.
  const showRemaining = typeof remaining === "number" && effective < cap;
  return {
    allowanceCap: cap,
    ...(showRemaining ? { allowanceRemaining: effective } : {}),
    allowanceUncapped: false,
    allowanceRole: acting ? "acting-commander" : "member",
    allowanceOnDayBoundary: world.tick % world.ticksPerDay === 0,
    allowanceDayStart: dayStart,
    allowanceResetsOnTick: dayStart + world.ticksPerDay,
    // Remainder 0 is spent out. A partial remainder stays blank. Omitted is full.
    allowanceNote: effective === 0 && typeof remaining === "number" ? "cap used" : showRemaining ? null : "none spent today",
  };
}
