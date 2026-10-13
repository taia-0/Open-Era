import assert from "node:assert/strict";
import test from "node:test";
import { projectEventFeed } from "../src/dashboard/view-model.ts";
import { runTick } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { commandHolderId } from "../src/sim/state.ts";
import type { Character, SimEvent, WorldState } from "../src/sim/types.ts";

function pin(world: WorldState, under: Character[]): void {
  world.factions["free-tide"].treasury = 0;
  for (const character of Object.values(world.characters)) {
    character.personality.loyalty = 0.99;
    delete character.loyaltyAdjustment;
    if (!character.captivity) character.cargo = { ...character.cargo, provisions: 40 };
  }
  for (const character of under) character.personality.loyalty = 0.1;
}

test("twelve short mornings roll the side stream once, and a roll under 0.5 leaves", () => {
  const world = createPrototypeWorld(1847);
  const holderId = commandHolderId(world, "free-tide");
  assert.ok(holderId);
  const holder = world.characters[holderId];
  const mates = Object.values(world.characters)
    .filter((character) => character.factionId === "free-tide" && character.id !== holderId)
    .sort((left, right) => left.id.localeCompare(right.id));
  const stays = mates[0];
  const leaves = mates[1];
  assert.ok(stays && leaves);

  const seen: SimEvent[] = [];
  let mornings = 0;
  while (mornings < 12) {
    if (world.tick % world.ticksPerDay === 0) {
      pin(world, [stays, leaves, holder]);
      mornings += 1;
    }
    const place = leaves.locationId;
    const travel = leaves.travel ? { ...leaves.travel } : null;
    const troops = leaves.troops.count;
    const result = runTick(world);
    const desertions = result.events.filter((event) => event.type === "character-deserted");
    if (mornings < 12) assert.equal(desertions.length, 0);
    if (mornings === 12) {
      seen.push(...desertions);
      assert.equal(leaves.locationId, place);
      assert.equal(leaves.travel?.fromId, travel?.fromId);
      assert.equal(leaves.travel?.toId, travel?.toId);
      assert.equal(leaves.troops.count, troops);
    }
  }

  assert.equal(seen.length, 1);
  assert.equal(seen[0].actorId, leaves.id);
  assert.equal(seen[0].data.roll, 0.245);
  assert.equal(seen[0].data.factionId, null);
  assert.equal(leaves.factionId, null);
  assert.equal(stays.factionId, "free-tide");
  assert.equal(holder.factionId, "free-tide");
  assert.equal(holder.personality.loyalty, 0.1);

  const commander = world.characters[world.players["prototype-player"].characterId];
  const name = leaves.name;
  const [projected] = projectEventFeed(world, commander.id, [seen[0]]);
  assert.equal(projected.summary, `${name} left Free Tide Compact.`);
  assert.equal(String(projected.summary).includes("0.245"), false);
  assert.equal(String(projected.summary).includes("roll"), false);
  assert.equal(projected.data, null);
  const [own] = projectEventFeed(world, leaves.id, [seen[0]]);
  assert.equal(own.summary, `${name} left Free Tide Compact.`);
  assert.equal((own.data as { roll?: number } | null)?.roll, 0.245);
});
