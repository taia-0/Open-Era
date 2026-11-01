import assert from "node:assert/strict";
import test from "node:test";
import { submitCommand } from "../src/sim/commands.ts";
import { runTick } from "./helpers/exile-off.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import type { SimEvent, WorldState } from "../src/sim/types.ts";
import { projectEventFeed } from "../src/dashboard/view-model.ts";

// An empty destination shelf floors the margin, so these offers pay 80 to clear the threshold.
function offer(world: WorldState, expiresInTicks = 12, carrierId = "character-17") {
  return submitCommand(world, {
    playerId: "prototype-player",
    type: "offer-contract",
    characterId: carrierId,
    quantity: 10,
    destinationId: "crown-harbor",
    price: 80,
    expiresInTicks,
  });
}

function acceptAt(world: WorldState, locationId: string, cargo: number, carrierId = "character-17") {
  assert.equal(offer(world, 12, carrierId).ok, true);
  runTick(world);
  const zara = world.characters[carrierId];
  zara.locationId = locationId;
  zara.travel = null;
  zara.cargo.provisions = cargo;
  world.settlements["crown-harbor"].stocks.provisions = 0;
  return runTick(world);
}

test("acceptance issues the haul order and stores it on the contract", () => {
  const world = createPrototypeWorld(1847);
  const judged = acceptAt(world, "crown-harbor", 0);
  const order = judged.events.find((event) => event.type === "contract-order-issued");
  assert.ok(order);
  const contract = Object.values(world.contracts ?? {})[0];
  assert.equal(contract.status, "accepted");
  assert.deepEqual(contract.order, {
    score: order.data.score,
    destinationId: "crown-harbor",
    quantity: 10,
    deadlineTick: contract.deadlineTick,
  });
});

test("a destination shelf that holds the quantity cancels the contract as no longer needed", () => {
  const world = createPrototypeWorld(1847);
  acceptAt(world, "crown-harbor", 0);
  world.settlements["crown-harbor"].stocks.provisions = 10;
  const next = runTick(world);
  const cancelled = next.events.find((event) => event.type === "contract-cancelled");
  assert.ok(cancelled);
  assert.equal(cancelled.data.reason, "no-longer-needed");
  const contract = Object.values(world.contracts ?? {})[0];
  assert.equal(contract.status, "cancelled");
  assert.equal(contract.settled, true);
  assert.equal(contract.escrow, 0);
});

test("a carrier whose ordinary choice outscores the haul breaches on that cause", () => {
  const world = createPrototypeWorld(1847);
  // Port balance: Zara's opening tie to Mara is weaker now and she refuses at Verdant Cay (0.553 under
  // 0.561); Niko Wren accepts the same 80 haul there and breaches it on choice.
  acceptAt(world, "verdant-cay", 0, "character-03");
  const contract = Object.values(world.contracts ?? {})[0];
  assert.equal(contract.status, "accepted");
  let breached: { data: Record<string, unknown> } | undefined;
  while (!breached && world.tick <= contract.deadlineTick) {
    // Keep Crown Harbor short so the contract stays needed.
    world.settlements["crown-harbor"].stocks.provisions = 0;
    breached = runTick(world).events.find((event) => event.type === "contract-breached");
  }
  assert.ok(breached);
  assert.equal(breached.data.cause, "choice");
  assert.equal(breached.data.detail, "better-motive");
});

test("seed 1847 carriers make haul decisions that buy or sail", () => {
  const world = createPrototypeWorld(1847);
  let hauls = 0;
  for (let i = 0; i < 400; i += 1) {
    const tick = runTick(world);
    for (const event of tick.events) {
      if (event.type !== "decision-made" || event.data.goal !== "haul") continue;
      hauls += 1;
      const acted = tick.events.some((other) =>
        other.actorId === event.actorId &&
        ((other.type === "market-trade" && other.data.direction === "bought") || other.type === "travel-started")
      );
      assert.ok(acted, `haul at tick ${world.tick} bought or sailed`);
    }
  }
  assert.ok(hauls > 0);
});


test("the walk never offers the job to a carrier docked on the destination without the quantity", () => {
  const world = createPrototypeWorld(1847);
  let offers = 0;
  for (let i = 0; i < 400; i += 1) {
    const before = structuredClone(world.characters);
    const tick = runTick(world);
    for (const event of tick.events) {
      if (event.type !== "contract-offered" || event.data.commandId !== undefined) continue;
      const carrierId = String(event.data.carrierId);
      const destinationId = String(event.data.destinationId);
      const carrier = before[carrierId];
      offers += 1;
      if (carrier.locationId === destinationId) assert.ok(carrier.cargo.provisions >= 10);
    }
  }
  assert.ok(offers > 0, "the walk offered at least once");
});

test("seed 1847 live names the haul order and a cancellation in the feed", () => {
  // Port balance: Iris's t137 order (16164) and Lio's t151 cancellation for Iris (17788) no longer
  // happen; Toma Reef's t130 order for Iris (14899, by tick 134) and Lio's t154 cancellation for
  // Niko Wren (17655) are the same shapes.
  const world = createPrototypeWorld(1847);
  const events: SimEvent[] = [];
  while (world.tick < 155) events.push(...runTick(world, { liveSession: true }).events);
  const order = events.find((event) => event.sequence === 14899);
  assert.equal(order?.type, "contract-order-issued");
  const [mara] = projectEventFeed(world, "character-01", [order!], events);
  assert.equal(mara?.payloadWithheld, true);
  assert.equal(mara?.summary, "Toma Reef took the order to carry 10 provisions to Crown Harbor.");
  const [toma] = projectEventFeed(world, "character-07", [order!], events);
  assert.equal(toma?.payloadWithheld, false);
  assert.equal(toma?.summary, "Toma Reef took the order to carry 10 provisions to Crown Harbor by tick 134.");
  const cancelled = events.find((event) => event.sequence === 17655);
  assert.equal(cancelled?.type, "contract-cancelled");
  const [rival] = projectEventFeed(world, "character-01", [cancelled!], events);
  assert.equal(rival?.summary, "Lio Crow's contract for Niko Wren was cancelled because the port no longer needs it.");
  const [lio] = projectEventFeed(world, "character-12", [cancelled!], events);
  assert.equal(lio?.summary, "Lio Crow's provisions contract for Niko Wren was cancelled: Crown Harbor already holds the quantity. The escrow returned.");
});
