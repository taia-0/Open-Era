import type { WorldState } from "../../src/sim/types.ts";

// Before home starts (feature/port-balance), captain N started at the round-robin
// port ["crown-harbor", "verdant-cay", "cinder-key", "glassport"][(N - 1) % 4]
// (character-14 was already overridden to Crown Harbor). Tick-0 constructed tests
// whose rule needs a captain docked at a particular port place them there
// explicitly with this helper, so the rule is still checked at the same setup.
const ROUND_ROBIN = ["crown-harbor", "verdant-cay", "cinder-key", "glassport"];

export function oldStartPort(characterId: string): string {
  const index = Number(characterId.replace("character-", "")) - 1;
  return characterId === "character-14" ? "crown-harbor" : ROUND_ROBIN[index % ROUND_ROBIN.length];
}

/** Dock the named captains (default: all) at their pre-home-starts ports. */
export function placeAtOldStarts(world: WorldState, characterIds?: string[]): void {
  for (const id of characterIds ?? Object.keys(world.characters)) {
    const character = world.characters[id];
    if (!character) continue;
    character.locationId = oldStartPort(id);
    character.travel = null;
  }
}
