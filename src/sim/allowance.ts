import { commandHolderId, round } from "./state.ts";
import type { Character, WorldState } from "./types.ts";

/**
 * How a quoted bill is drawn.
 *
 * Whole cents. Allowance first, then the purse, and never more from the
 * treasury than it holds. The two shares sum to the bill. A shortfall refuses
 * the whole quote. An uncapped holder draws the treasury only. The purse is
 * the later `source: "purse"` choice, not this default.
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

/**
 * Who is paying.
 *
 * A captive draws nothing. A character with no faction stays on the purse.
 * The free command holder is uncapped. The acting commander is a member:
 * they keep the daily cap and do not inherit the holder's draw.
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

function cents(value: number): number {
  return Math.round(value * 100);
}

/** Coins this character can put toward one quoted bill. A captive has none. */
export function spendableAmount(world: WorldState, character: Character, passagePerTick: number): number {
  const role = spendRole(world, character);
  if (role === "captive") return 0;
  const purse = Math.max(0, cents(character.money));
  if (role === "factionless") return round(purse / 100, 2);
  const treasury = Math.max(0, cents(world.factions[character.factionId!].treasury));
  if (role === "holder") return round(treasury / 100, 2);
  const cap = cents(world.ticksPerDay * passagePerTick);
  const allowance = Math.min(Math.max(0, cents(storedAllowance(character, round(world.ticksPerDay * passagePerTick, 2)))), treasury);
  return round((allowance + purse) / 100, 2);
}

export function quoteCharacterBill(
  world: WorldState,
  character: Character,
  bill: number,
  passagePerTick: number,
): { ok: true } & QuotedBillDraw | { ok: false; reason: "shortfall" } {
  const role = spendRole(world, character);
  if (role === "captive") return { ok: false, reason: "shortfall" };
  const billCents = cents(bill);
  if (billCents < 0) return { ok: false, reason: "shortfall" };
  if (role === "factionless") {
    if (Math.max(0, cents(character.money)) < billCents) return { ok: false, reason: "shortfall" };
    return {
      ok: true,
      treasuryDrawn: 0,
      purseDrawn: round(billCents / 100, 2),
      allowanceRemaining: null,
    };
  }
  const cap = round(world.ticksPerDay * passagePerTick, 2);
  return drawQuotedBill({
    bill,
    uncapped: role === "holder",
    allowanceRemaining: storedAllowance(character, cap),
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
): ResolvedSpend | { ok: false; reason: "shortfall" } {
  const quote = quoteCharacterBill(world, character, bill, passagePerTick);
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
  const affordable = Math.min(passagePerTick, Math.max(0, spendableAmount(world, character, passagePerTick)));
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
  const spent = resolveQuotedSpend(world, character, bill, passagePerTick);
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
