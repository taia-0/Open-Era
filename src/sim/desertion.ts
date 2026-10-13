import { shortPayMember } from "./allowance.ts";
import { DeterministicRng } from "./rng.ts";
import { createPrototypeWorld } from "./scenario.ts";
import { round } from "./state.ts";
import type { WorldState } from "./types.ts";

/**
 * Passage rate the short-pay cap already uses. A morning under one day of it
 * lengthens the streak.
 */
const PASSAGE_COST_PER_TICK = 3;

/** Fork seed for each world seed: `rngState` after setup, not the raw seed. */
const forkSeeds = new Map<number, number>();

function forkSeed(seed: number): number {
  let found = forkSeeds.get(seed);
  if (found === undefined) {
    found = createPrototypeWorld(seed).rngState;
    forkSeeds.set(seed, found);
  }
  return found;
}

/**
 * The side stream, restored from the world when a roll has already been drawn.
 *
 * The fork is `rngState` at the start of tick 0. It is not the tick rng.
 * A stay stores the advanced state and emits nothing, so the position has to
 * sit on the world or a restored process redraws the stay.
 */
function desertionRng(world: WorldState): DeterministicRng {
  if (world.desertionRngState !== undefined) {
    const rng = new DeterministicRng(1);
    rng.state = world.desertionRngState;
    return rng;
  }
  return new DeterministicRng(forkSeed(world.seed));
}

export interface DesertionNotice {
  characterId: string;
  previousFactionId: string | null;
  roll: number;
}

/**
 * Twelve short mornings, then one side-stream roll. Does not emit.
 *
 * Read at the start of the morning, before production. A short mate's streak
 * grows by one and is stored on the character. Any other morning clears it.
 * On the morning the streak becomes 12, a mate whose loyalty is under 0.75
 * draws one `next()`. The roll is stored to 3 decimals. Under 0.5, `factionId`
 * becomes null. Place, travel, and troops stay. The cap is the cap at the
 * start of the morning. The stream position is written back only when a roll
 * was drawn.
 */
export function noteMorningDesertion(world: WorldState): DesertionNotice[] {
  if (world.ticksPerDay <= 0 || world.tick % world.ticksPerDay !== 0) return [];
  const characters = Object.values(world.characters).sort((left, right) => left.id.localeCompare(right.id));
  const short = new Set(
    characters.filter((character) => shortPayMember(world, character, PASSAGE_COST_PER_TICK)).map((character) => character.id),
  );
  const rng = desertionRng(world);
  let drew = false;
  const leavers: DesertionNotice[] = [];
  for (const character of characters) {
    if (character.dead) continue;
    const next = short.has(character.id) ? (character.shortMorningStreak ?? 0) + 1 : 0;
    if (next === 0) delete character.shortMorningStreak;
    else character.shortMorningStreak = next;
    if (next !== 12) continue;
    const loyalty = character.personality.loyalty + (character.loyaltyAdjustment ?? 0);
    if (!(loyalty < 0.75)) continue;
    const roll = rng.next();
    drew = true;
    if (!(roll < 0.5)) continue;
    const previousFactionId = character.factionId;
    character.factionId = null;
    leavers.push({
      characterId: character.id,
      previousFactionId,
      roll: round(roll, 3),
    });
  }
  if (drew) world.desertionRngState = rng.state;
  return leavers;
}
