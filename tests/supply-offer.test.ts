import assert from "node:assert/strict";
import test from "node:test";
import { assessSupplyContract } from "../src/sim/contracts.ts";
import { offerAutonomousSupply, runTicks } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import type { SimEvent, WorldState } from "../src/sim/types.ts";

function shelf(world: WorldState, provisions: number): void {
  for (const settlement of Object.values(world.settlements)) {
    settlement.production = { provisions: 0, arms: 0, medicine: 0, shipMaterials: 0 };
    settlement.population = 0;
    settlement.stocks.provisions = settlement.id === "crown-harbor" ? provisions : 20;
  }
}

test("a shelf at 1 is not offered, and a shelf under 1 pays 56.25 to someone who would accept", () => {
  const quiet = createPrototypeWorld(1847);
  shelf(quiet, 1);
  const none: SimEvent[] = [];
  offerAutonomousSupply(quiet, none);
  assert.equal(none.length, 0);

  const world = createPrototypeWorld(1847);
  shelf(world, 0.4);
  const events: SimEvent[] = [];
  offerAutonomousSupply(world, events);
  const offered = events.filter((event) => event.type === "contract-offered");
  assert.equal(offered.length, 1);
  assert.equal(offered[0].data.price, 56.25);
  assert.equal(offered[0].data.quantity, 10);
  assert.equal(offered[0].data.destinationId, "crown-harbor");
  const contract = offered[0].data.contract as { buyerId: string; carrierId: string; deadlineTick: number };
  const carrier = world.characters[contract.carrierId];
  const assessment = assessSupplyContract(world, carrier, {
    buyerId: contract.buyerId,
    quantity: 10,
    price: 56.25,
    destinationId: "crown-harbor",
    deadlineTick: contract.deadlineTick,
  });
  assert.equal(assessment.accepted, true);

  const blocked = Object.values(world.characters)
    .filter((character) => character.controller.kind === "autonomous" && character.captivity === null && character.travel === null)
    .sort((left, right) => left.id.localeCompare(right.id));
  const lower = blocked.find((character) => character.id < carrier.id);
  if (lower) {
    const refused = assessSupplyContract(world, lower, {
      buyerId: contract.buyerId,
      quantity: 10,
      price: 56.25,
      destinationId: "crown-harbor",
      deadlineTick: contract.deadlineTick,
    });
    assert.equal(refused.accepted, false);
  }
});

test("the offer stays open for a later tick, and the same pair is not hired again", () => {
  const world = createPrototypeWorld(1847);
  shelf(world, 0.4);
  const first: SimEvent[] = [];
  offerAutonomousSupply(world, first);
  const offered = first.filter((event) => event.type === "contract-offered");
  assert.equal(offered.length, 1);
  const contract = offered[0].data.contract as { id: string; buyerId: string; carrierId: string };
  assert.equal(world.contracts?.[contract.id]?.status, "offered");
  const again: SimEvent[] = [];
  offerAutonomousSupply(world, again);
  assert.equal(world.contracts?.[contract.id]?.status, "offered");
  const duplicate = again.some((event) => {
    const next = event.data.contract as { buyerId?: string; carrierId?: string } | undefined;
    return next?.buyerId === contract.buyerId && next?.carrierId === contract.carrierId;
  });
  assert.equal(duplicate, false);
});

test("seed 4096 never offers a haul to the buyer himself", () => {
  // character-02 was once both buyer and carrier on the tick 67 Crown Harbor shelf.
  const run = runTicks(createPrototypeWorld(4096), 72);
  const offers = run.events.filter((event) => event.type === "contract-offered");
  assert.ok(offers.length > 0);
  for (const event of offers) {
    const contract = event.data.contract as { buyerId: string; carrierId: string };
    assert.notEqual(contract.buyerId, contract.carrierId, String(event.sequence));
  }
});
