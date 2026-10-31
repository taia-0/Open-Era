import assert from "node:assert/strict";
import test from "node:test";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { autonomousTaxStep } from "../src/sim/tax-rate.ts";

test("a faction that holds no port does not raise or lower its rate", () => {
  const world = createPrototypeWorld(1847);
  world.tick = 24;
  const faction = world.factions["free-tide"];
  faction.treasury = 0;
  faction.taxRate = 0.08;
  for (const settlement of Object.values(world.settlements)) {
    if (settlement.factionId === "free-tide") settlement.factionId = null;
  }
  assert.equal(autonomousTaxStep(world, "free-tide"), null);

  faction.taxRate = 0.2;
  const port = world.settlements["cinder-key"];
  port.factionId = "free-tide";
  port.stability = 10;
  const holder = world.characters["character-14"];
  holder.locationId = "cinder-key";
  holder.travel = null;
  holder.captivity = null;
  const step = autonomousTaxStep(world, "free-tide");
  assert.equal(step?.taxRate, 0.19);
});
