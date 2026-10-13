import assert from "node:assert/strict";
import test from "node:test";
import { secessionDeclaredSentence } from "../src/dashboard/wording.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import type { Faction, SimEvent } from "../src/sim/types.ts";

/**
 * The treasury clause names the new faction. A missing name still says the
 * treasury starts empty. The simulation's stored name is not changed here.
 */

function declaration(name: string | undefined): SimEvent {
  const faction: Record<string, unknown> = {
    id: "secession-character-16-crown-harbor-439",
    color: "#2f6f4e",
    treasury: 0,
    taxRate: 0.08,
  };
  if (name !== undefined) faction.name = name;
  return {
    sequence: 1,
    tick: 439,
    type: "secession-declared",
    actorId: "character-16",
    targetId: "free-tide",
    settlementId: "crown-harbor",
    data: {
      previousFactionId: "free-tide",
      ownerId: "character-16",
      successorId: null,
      faction,
    },
  };
}

test("a named new faction is the subject of the empty-treasury sentence", () => {
  const world = createPrototypeWorld(1847);
  assert.equal(
    secessionDeclaredSentence(world, declaration("Breakwater"), "Corin Hale"),
    "Corin Hale declared Crown Harbor separate from Free Tide Compact. Breakwater starts with an empty treasury. (no leader yet)",
  );
});

test("a new faction with no name yet still says the treasury starts empty", () => {
  const world = createPrototypeWorld(1847);
  const expected = "Corin Hale declared Crown Harbor separate from Free Tide Compact. The new faction starts with an empty treasury. (no leader yet)";
  assert.equal(secessionDeclaredSentence(world, declaration(undefined), "Corin Hale"), expected);
  assert.equal(secessionDeclaredSentence(world, declaration("   "), "Corin Hale"), expected);
});

test("an omitted event name uses the faction already in the world", () => {
  const world = createPrototypeWorld(1847);
  const founded: Faction = {
    id: "secession-character-16-crown-harbor-439",
    name: "Crown Harbor Compact",
    color: "#2f6f4e",
    treasury: 0,
    taxRate: 0.08,
  };
  world.factions[founded.id] = founded;
  assert.equal(
    secessionDeclaredSentence(world, declaration(undefined), "Corin Hale"),
    "Corin Hale declared Crown Harbor separate from Free Tide Compact. Crown Harbor Compact starts with an empty treasury. (no leader yet)",
  );
});
