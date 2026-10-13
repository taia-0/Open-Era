import assert from "node:assert/strict";
import test from "node:test";
import { characterVisibilityTier, projectCharacter, type SeaSighting } from "../src/dashboard/visibility.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { partyPower, round, stateHash } from "../src/sim/state.ts";
import type { Character, WorldState } from "../src/sim/types.ts";

function maraOf(world: WorldState): Character {
  const mara = world.characters[world.players["prototype-player"].characterId];
  assert.equal(mara.name, "Mara Vane");
  assert.equal(mara.factionId, "world-government");
  return mara;
}

function dock(character: Character, locationId: string): void {
  character.locationId = locationId;
  character.travel = null;
  character.captivity = null;
}

test("a rival in another held port is not co-located, and the location stays", () => {
  const world = createPrototypeWorld(1847);
  const mara = maraOf(world);
  dock(mara, "crown-harbor");
  const mina = world.characters["character-15"];
  assert.notEqual(mina.factionId, mara.factionId);
  dock(mina, "glassport");
  assert.equal(world.settlements["glassport"].factionId, mara.factionId);
  mina.money = 213;
  mina.morale = 99.1;
  mina.sailors = 19;
  mina.health = 100;
  mina.troops = { ...mina.troops, count: 47 };

  const hash = stateHash(world);
  const sequence = world.nextEventSequence;
  const rng = world.rngState;
  const card = projectCharacter(world, mara, mina);

  assert.equal(characterVisibilityTier(world, mara, mina), "distant");
  assert.equal(card.locationId, "glassport");
  assert.equal(card.travel, null);
  assert.equal(card.money, null);
  assert.equal(card.morale, null);
  assert.equal(card.sailors, null);
  assert.equal(card.troops, null);
  assert.equal(card.health, null);
  assert.equal(card.partyPower, null);
  assert.equal(card.skills, null);
  assert.equal(card.attributes, null);
  assert.equal(card.plan, null);
  assert.equal(stateHash(world), hash);
  assert.equal(world.nextEventSequence, sequence);
  assert.equal(world.rngState, rng);
  assert.equal(world.version, 5);
});

test("a mate in another held port keeps skills and loses condition", () => {
  const world = createPrototypeWorld(1847);
  const mara = maraOf(world);
  dock(mara, "crown-harbor");
  const mate = world.characters["character-02"];
  assert.equal(mate.factionId, mara.factionId);
  assert.notEqual(mate.id, mara.id);
  dock(mate, "glassport");
  mate.money = 400;
  mate.morale = 80;
  mate.sailors = 12;
  mate.troops = { ...mate.troops, count: 30 };
  mate.travel = null;

  const card = projectCharacter(world, mara, mate);
  assert.equal(characterVisibilityTier(world, mara, mate), "faction");
  assert.equal(card.locationId, "glassport");
  assert.equal(card.travel, null);
  assert.deepEqual(card.skills, mate.skills);
  assert.deepEqual(card.attributes, mate.attributes);
  assert.equal(card.money, null);
  assert.equal(card.morale, null);
  assert.equal(card.sailors, null);
  assert.equal(card.troops, null);
  assert.equal(card.plan, null);
});

test("a rival standing in the same port stays co-located", () => {
  const world = createPrototypeWorld(1847);
  const mara = maraOf(world);
  dock(mara, "crown-harbor");
  const rival = world.characters["character-14"];
  assert.notEqual(rival.factionId, mara.factionId);
  dock(rival, "crown-harbor");
  rival.money = 55.5;
  rival.morale = 70;
  rival.sailors = 11;
  rival.troops = { ...rival.troops, count: 8 };

  const card = projectCharacter(world, mara, rival);
  assert.equal(characterVisibilityTier(world, mara, rival), "co-located");
  assert.equal(card.locationId, "crown-harbor");
  assert.equal(card.travel, null);
  assert.equal(card.money, round(rival.money, 2));
  assert.equal(card.morale, round(rival.morale, 1));
  assert.equal(card.sailors, rival.sailors);
  const troops = card.troops as { count: number };
  assert.equal(troops.count, 8);
  assert.equal(card.partyPower, partyPower(rival));
  assert.equal(card.plan, null);
  assert.deepEqual(card.skills, rival.skills);
});

test("travel is on the viewer's own card and null on every other card", () => {
  const world = createPrototypeWorld(1847);
  const mara = maraOf(world);
  const mate = world.characters["character-02"];
  const distant = world.characters["character-15"];
  assert.equal(mate.factionId, mara.factionId);
  assert.notEqual(distant.factionId, mara.factionId);

  mara.locationId = null;
  mara.captivity = null;
  mara.travel = { fromId: "crown-harbor", toId: "glassport", totalTicks: 4, remainingTicks: 2 };
  mate.locationId = null;
  mate.captivity = null;
  mate.travel = { fromId: "crown-harbor", toId: "glassport", totalTicks: 4, remainingTicks: 2 };
  distant.locationId = null;
  distant.captivity = null;
  distant.travel = { fromId: "cinder-key", toId: "glassport", totalTicks: 2, remainingTicks: 2 };

  const hash = stateHash(world);
  const sequence = world.nextEventSequence;
  const rng = world.rngState;

  const own = projectCharacter(world, mara, mara);
  assert.deepEqual(own.travel, mara.travel);

  const mateCard = projectCharacter(world, mara, mate);
  assert.equal(characterVisibilityTier(world, mara, mate), "faction");
  assert.equal(mateCard.travel, null);
  assert.equal(mateCard.locationId, null);
  assert.deepEqual(mateCard.skills, mate.skills);
  assert.equal(mateCard.money, null);
  assert.equal(mateCard.morale, null);
  assert.equal(mateCard.sailors, null);
  const mateSea = mateCard.seaSighting as SeaSighting;
  assert.equal(mateSea.fromId, "crown-harbor");
  assert.equal(mateSea.toId, "glassport");
  assert.equal(mateSea.kind, "sharing");

  const distantCard = projectCharacter(world, mara, distant);
  assert.equal(characterVisibilityTier(world, mara, distant), "distant");
  assert.equal(distantCard.travel, null);
  assert.equal(distantCard.locationId, null);
  assert.equal(distantCard.seaSighting, null);
  assert.equal(distantCard.skills, null);
  assert.equal(distantCard.money, null);

  assert.equal(stateHash(world), hash);
  assert.equal(world.nextEventSequence, sequence);
  assert.equal(world.rngState, rng);
  assert.equal("news" in world, false);
});
