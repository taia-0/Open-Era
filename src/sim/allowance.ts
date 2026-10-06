import { commandHolderId, round } from "./state.ts";
import type { Character, WorldState } from "./types.ts";

/**
 * How a quoted bill is drawn.
 *
 * Whole cents. Allowance first, then the purse, and never more from the
 * treasury than it holds. The two shares sum to the bill. A shortfall refuses
 * the whole quote. An uncapped holder draws the treasury only.
 * A player command may pass `source: "purse"` to pay the purse and skip the
 * allowance. The autonomous path never does.
 *
 * A member's cap is the balance share: `min(18, treasury / free mates)`,
 * floored to a cent so the mates' shares cannot sum past the treasury.
 * It is read from the treasury and the mate count on each quote. The free
 * command holder does not use it.
 */
export interface QuotedBillDraw {
  treasuryDrawn: number;
  purseDrawn: number;
  /** Null when the drawer is uncapped or has no allowance. Otherwise what remains of today's cap. */
  allowanceRemaining: number | null;
}

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

export type SpendRole = "captive" | "factionless" | "holder" | "member";

/** `"purse"` pays the purse and does not draw the allowance or the treasury. */
export type SpendSource = "default" | "purse";

/**
 * Who is paying.
 *
 * A captive draws nothing. A character with no faction stays on the purse.
 * The free command holder is uncapped. The acting commander is a member:
 * they keep the balance share and do not inherit the holder's draw.
 */
export function spendRole(world: WorldState, character: Character): SpendRole {
  if (character.captivity) return "captive";
  if (character.factionId === null) return "factionless";
  if (commandHolderId(world, character.factionId) === character.id) return "holder";
  return "member";
}

/** Omitted allowance means the cap. The field is absent while nothing has been drawn today. */
export function storedAllowance(character: Character, cap: number): number {
  return character.allowanceRemaining === undefined ? cap : character.allowanceRemaining;
}

/**
 * Free mates are the faction's members who are not captive and are not the
 * command holder. The acting commander is included. People at sea are included.
 * A captive is not free. The holder is not a mate.
 */
export function freeMateCount(world: WorldState, factionId: string): number {
  const holderId = commandHolderId(world, factionId);
  let count = 0;
  for (const character of Object.values(world.characters)) {
    if (character.factionId !== factionId) continue;
    if (character.captivity) continue;
    if (holderId !== null && character.id === holderId) continue;
    count += 1;
  }
  return count;
}

/** One day of passage. The balance share never rises above this. */
export function fullAllowance(world: WorldState, passagePerTick: number): number {
  return round(world.ticksPerDay * passagePerTick, 2);
}

/**
 * The mate's daily cap, checked on this quote.
 *
 * `min(fullAllowance, treasury / free mates)` in whole cents. The division
 * floors, so `mates * share` cannot exceed the treasury. Zero free mates
 * returns 0 and does not divide. An empty treasury returns 0. The stored
 * remainder is a separate clamp: this function is only the cap.
 */
export function memberAllowanceCap(world: WorldState, factionId: string, passagePerTick: number): number {
  const mates = freeMateCount(world, factionId);
  if (mates <= 0) return 0;
  const treasuryCents = Math.max(0, Math.round(world.factions[factionId].treasury * 100));
  if (treasuryCents <= 0) return 0;
  const ceilingCents = Math.max(0, Math.round(fullAllowance(world, passagePerTick) * 100));
  const shareCents = Math.min(ceilingCents, Math.floor(treasuryCents / mates));
  return round(shareCents / 100, 2);
}

/**
 * What this member can still draw today.
 *
 * Omitted means the current share. A stored remainder is clamped down to the
 * current share, so a poorer treasury shrinks an unused remainder, and a
 * remainder of 0 stays spent until the day reset deletes the field.
 */
function effectiveAllowance(character: Character, cap: number): number {
  return round(Math.min(storedAllowance(character, cap), cap), 2);
}

function cents(value: number): number {
  return Math.round(value * 100);
}

/** Coins this character can put toward one quoted bill. A captive has none. */
export function spendableAmount(
  world: WorldState,
  character: Character,
  passagePerTick: number,
  source: SpendSource = "default",
): number {
  const role = spendRole(world, character);
  if (role === "captive") return 0;
  const purse = Math.max(0, cents(character.money));
  if (source === "purse" || role === "factionless") return round(purse / 100, 2);
  const treasury = Math.max(0, cents(world.factions[character.factionId!].treasury));
  if (role === "holder") return round(treasury / 100, 2);
  const cap = memberAllowanceCap(world, character.factionId!, passagePerTick);
  const allowance = Math.min(Math.max(0, cents(effectiveAllowance(character, cap))), treasury);
  return round((allowance + purse) / 100, 2);
}

export function quoteCharacterBill(
  world: WorldState,
  character: Character,
  bill: number,
  passagePerTick: number,
  source: SpendSource = "default",
): { ok: true } & QuotedBillDraw | { ok: false; reason: "shortfall" } {
  const role = spendRole(world, character);
  if (role === "captive") return { ok: false, reason: "shortfall" };
  const billCents = cents(bill);
  if (billCents < 0) return { ok: false, reason: "shortfall" };
  if (source === "purse" || role === "factionless") {
    if (Math.max(0, cents(character.money)) < billCents) return { ok: false, reason: "shortfall" };
    return {
      ok: true,
      treasuryDrawn: 0,
      purseDrawn: round(billCents / 100, 2),
      allowanceRemaining: null,
    };
  }
  const cap = memberAllowanceCap(world, character.factionId!, passagePerTick);
  return drawQuotedBill({
    bill,
    uncapped: role === "holder",
    allowanceRemaining: effectiveAllowance(character, cap),
    purse: character.money,
    treasury: world.factions[character.factionId!].treasury,
  });
}

export interface ResolvedSpend {
  ok: true;
  treasuryDrawn: number;
  purseDrawn: number;
  allowanceRemaining: number | null;
  characterMoney: number;
  /** Set when coins left the faction treasury. */
  factionTreasury?: number;
}

/**
 * A quoted bill. Refuses the whole quote when allowance and purse cannot cover it.
 * Does not mutate the world. The event carries the absolutes, and `applyEvent` writes them.
 */
export function resolveQuotedSpend(
  world: WorldState,
  character: Character,
  bill: number,
  passagePerTick: number,
  source: SpendSource = "default",
): ResolvedSpend | { ok: false; reason: "shortfall" } {
  const quote = quoteCharacterBill(world, character, bill, passagePerTick, source);
  if (!quote.ok) return quote;
  const resolved: ResolvedSpend = {
    ok: true,
    treasuryDrawn: quote.treasuryDrawn,
    purseDrawn: quote.purseDrawn,
    allowanceRemaining: quote.allowanceRemaining,
    characterMoney: round(character.money - quote.purseDrawn, 2),
  };
  if (quote.treasuryDrawn > 0 && character.factionId) {
    resolved.factionTreasury = round(world.factions[character.factionId].treasury - quote.treasuryDrawn, 2);
  }
  return resolved;
}

/**
 * An underway passage tick. Charge up to one passage rate and do not turn the
 * ship around when the coins run short.
 */
export function resolvePassageCharge(
  world: WorldState,
  character: Character,
  passagePerTick: number,
): ResolvedSpend {
  const source: SpendSource = character.travel?.source === "purse" ? "purse" : "default";
  const affordable = Math.min(passagePerTick, Math.max(0, spendableAmount(world, character, passagePerTick, source)));
  const bill = round(affordable, 2);
  if (bill <= 0) {
    return {
      ok: true,
      treasuryDrawn: 0,
      purseDrawn: 0,
      allowanceRemaining: null,
      characterMoney: round(character.money, 2),
    };
  }
  const spent = resolveQuotedSpend(world, character, bill, passagePerTick, source);
  if (!spent.ok) {
    return {
      ok: true,
      treasuryDrawn: 0,
      purseDrawn: 0,
      allowanceRemaining: null,
      characterMoney: round(character.money, 2),
    };
  }
  return spent;
}

/** Fields a spend event adds. `allowanceRemaining` is present only when a capped member drew. */
export function spendData(spend: ResolvedSpend): Record<string, unknown> {
  return {
    treasuryDrawn: spend.treasuryDrawn,
    purseDrawn: spend.purseDrawn,
    ...(spend.factionTreasury !== undefined ? { factionTreasury: spend.factionTreasury } : {}),
    ...(spend.allowanceRemaining !== null && spend.treasuryDrawn > 0
      ? { allowanceRemaining: spend.allowanceRemaining }
      : {}),
  };
}
