import { DeterministicRng } from "./rng.ts";
import { actingCoverId, commandHolderId, round } from "./state.ts";
import type { Character, DebtObligation, WorldState } from "./types.ts";

/** Check-in year. A fixed death at 120 uses this, not the 2190-tick calendar. */
export const YEAR_TICKS = 180;

const AGE_MIN = 18;
const AGE_MAX = 119;

const agesBySeed = new Map<number, Map<string, number>>();

/**
 * Span ages, drawn once per seed in id order.
 *
 * The draw is `DeterministicRng(seed)`, not `world.rngState`. Nothing stores
 * the age. The same seed always names the same death ticks.
 */
export function spanAges(seed: number): Map<string, number> {
  let found = agesBySeed.get(seed);
  if (found) return found;
  const rng = new DeterministicRng(seed);
  found = new Map();
  for (let index = 1; index <= 30; index += 1) {
    const id = `character-${String(index).padStart(2, "0")}`;
    found.set(id, rng.integer(AGE_MIN, AGE_MAX));
  }
  agesBySeed.set(seed, found);
  return found;
}

/** True on the tick where span age plus `tick / 180` reaches 120. */
export function diesOfOldAge(seed: number, characterId: string, tick: number): boolean {
  const start = spanAges(seed).get(characterId);
  if (start === undefined) return false;
  return start * YEAR_TICKS + tick >= 120 * YEAR_TICKS;
}

export interface AgingDeathData {
  cause: "old-age";
  ageYears: 120;
  policy: "vacant";
  characterMoney: number;
  sailors: number;
  troops: Character["troops"];
  debts: DebtObligation[];
  factionId: null;
  clearCaptivity: boolean;
  clearRecovery: boolean;
  ports: string[];
  treasuries: { factionId: string; treasury: number }[];
  endBattleIds: string[];
  /** Set when this death clears or replaces the faction's acting commander. */
  commandFactionId?: string;
  /** Null clears the cover. A string names the next one. Absent leaves the seat. */
  actingCommanderId?: string | null;
}

/**
 * Vacant death. The purse pays debts in id order, `min(purse, remaining)`,
 * into the creditor treasury. Sailors, troops, and the unpaid remainder stay.
 * The heir is not the cover. A holder death clears the acting commander and
 * does not promote. An acting commander's death writes the next cover.
 */
export function agingDeathData(world: WorldState, character: Character): AgingDeathData {
  let purseCents = Math.round(character.money * 100);
  const credits = new Map<string, number>();
  const debts: DebtObligation[] = [];
  const ordered = [...character.debts].sort((left, right) => left.id.localeCompare(right.id));
  for (const debt of ordered) {
    const remainCents = Math.max(0, Math.round(debt.remainingValue * 100));
    const creditorId = debt.creditorFactionId;
    const creditor = creditorId ? world.factions[creditorId] : undefined;
    if (!creditorId || !creditor || remainCents === 0) {
      if (remainCents > 0) debts.push({ ...debt });
      continue;
    }
    const pay = Math.min(purseCents, remainCents);
    purseCents -= pay;
    if (pay > 0) credits.set(creditorId, (credits.get(creditorId) ?? 0) + pay);
    const left = remainCents - pay;
    if (left > 0) debts.push({ ...debt, remainingValue: round(left / 100, 2) });
  }
  const treasuries = [...credits.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([factionId, cents]) => ({
      factionId,
      treasury: round(world.factions[factionId].treasury + cents / 100, 2),
    }));

  const data: AgingDeathData = {
    cause: "old-age",
    ageYears: 120,
    policy: "vacant",
    characterMoney: round(purseCents / 100, 2),
    sailors: character.sailors,
    troops: {
      count: character.troops.count,
      experience: character.troops.experience,
      discipline: character.troops.discipline,
    },
    debts,
    factionId: null,
    clearCaptivity: character.captivity !== null,
    clearRecovery: character.troopRecovery !== null,
    ports: Object.values(world.settlements)
      .filter((settlement) => settlement.ownerId === character.id)
      .map((settlement) => settlement.id)
      .sort((left, right) => left.localeCompare(right)),
    treasuries,
    endBattleIds: Object.values(world.activeBattles)
      .filter((battle) => battle.attackerId === character.id)
      .map((battle) => battle.id)
      .sort((left, right) => left.localeCompare(right)),
  };

  const factionId = character.factionId;
  if (factionId && world.factions[factionId]) {
    const holderId = commandHolderId(world, factionId);
    const actingId = world.factions[factionId].actingCommanderId;
    if (holderId === character.id) {
      data.commandFactionId = factionId;
      data.actingCommanderId = null;
    } else if (actingId === character.id) {
      data.commandFactionId = factionId;
      data.actingCommanderId = actingCoverId(world, factionId, holderId, [character.id]);
    }
  }
  return data;
}
