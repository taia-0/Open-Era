import assert from "node:assert/strict";
import test from "node:test";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { autonomousTaxStep } from "../src/sim/tax-rate.ts";
import type { WorldState } from "../src/sim/types.ts";

const BREAKAWAY = "secession-character-19-cinder-key-24";

/** A one-port breakaway founded by Esme Dusk at Cinder Key, with no standing order. */
function breakaway(stability: number, treasury = 0): WorldState {
  const world = createPrototypeWorld(1847);
  world.tick = 24;
  world.factions[BREAKAWAY] = {
    id: BREAKAWAY,
    name: "Free Cinder Key",
    color: "#888888",
    treasury,
    taxRate: 0.08,
    founderId: "character-19",
  };
  const founder = world.characters["character-19"];
  founder.factionId = BREAKAWAY;
  founder.locationId = "cinder-key";
  founder.travel = null;
  founder.captivity = null;
  for (const character of Object.values(world.characters)) {
    character.standingOrders = character.standingOrders.filter((order) => order.issuerId !== founder.id);
  }
  const port = world.settlements["cinder-key"];
  port.factionId = BREAKAWAY;
  port.ownerId = founder.id;
  port.stability = stability;
  return world;
}

test("the founder holds a breakaway's tax seat and steps a pressed port down", () => {
  const world = breakaway(40);
  assert.deepEqual(autonomousTaxStep(world, BREAKAWAY), {
    holderId: "character-19",
    taxRate: 0.07,
    previousTaxRate: 0.08,
  });
});

test("a one-person breakaway with an empty treasury does not step up for short", () => {
  const world = breakaway(80, 0);
  assert.equal(autonomousTaxStep(world, BREAKAWAY), null);
});

test("a breakaway with a free mate and an empty treasury steps up for short", () => {
  const world = breakaway(80, 0);
  world.characters["character-20"].factionId = BREAKAWAY;
  world.characters["character-20"].captivity = null;
  assert.deepEqual(autonomousTaxStep(world, BREAKAWAY), {
    holderId: "character-19",
    taxRate: 0.09,
    previousTaxRate: 0.08,
  });
});

test("a captive or departed founder, or a faction with no founder, has no seat", () => {
  const captive = breakaway(40);
  captive.characters["character-19"].captivity = { captorFactionId: "world-government" } as never;
  assert.equal(autonomousTaxStep(captive, BREAKAWAY), null);
  const departed = breakaway(40);
  departed.characters["character-19"].factionId = "free-tide";
  assert.equal(autonomousTaxStep(departed, BREAKAWAY), null);
  const unfounded = breakaway(40);
  delete unfounded.factions[BREAKAWAY].founderId;
  assert.equal(autonomousTaxStep(unfounded, BREAKAWAY), null);
});

