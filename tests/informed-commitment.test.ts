import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { combatForecast } from "../src/sim/combat.ts";
import { submitCommand } from "../src/sim/commands.ts";
import { runTick, travelDuration } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { createDashboardApp } from "../src/dashboard/server.ts";
import type { SettlementKnowledge } from "../src/sim/types.ts";

function staleReport(settlementId: string, factionId: string | null, garrisonEstimate: number): SettlementKnowledge {
  return {
    settlementId,
    observedTick: 0,
    confidence: 0.4,
    factionId,
    garrisonEstimate,
    stocksEstimate: { provisions: 10, arms: 10, medicine: 10, shipMaterials: 10 },
    priceEstimate: { provisions: 2, arms: 2, medicine: 2, shipMaterials: 2 },
    source: "rumor",
  };
}

test("a forecast for a never-visited settlement cannot be inverted to recover its true defenses", () => {
  const world = createPrototypeWorld(1847);
  const commander = world.characters[world.players["prototype-player"].characterId];
  const target = Object.values(world.settlements).find((entry) => entry.factionId !== null && entry.factionId !== commander.factionId)!;
  commander.locationId = "crown-harbor";
  commander.travel = null;
  commander.captivity = null;
  commander.knowledge = {};
  world.tick = 40;

  // With nothing stored at all.
  const strangerBefore = combatForecast(world, commander.id, target.id);
  const strangerTruth = { fortification: target.fortification, population: target.population, garrison: target.garrison };
  target.fortification = 9.5;
  target.population = 400_000;
  target.garrison = 8_888;
  const strangerAfter = combatForecast(world, commander.id, target.id);
  assert.deepEqual(strangerAfter, strangerBefore, "hidden truth must not move a single projected field");

  // Now with a partial-confidence rumour, which is the realistic case and the
  // one where a confidence-scaled truth term would leak proportionally.
  target.fortification = strangerTruth.fortification;
  target.population = strangerTruth.population;
  target.garrison = strangerTruth.garrison;
  commander.knowledge[target.id] = staleReport(target.id, target.factionId, 240);
  const rumourBefore = combatForecast(world, commander.id, target.id);
  target.fortification = 11.5;
  target.population = 900_000;
  target.garrison = 33_333;
  const rumourAfter = combatForecast(world, commander.id, target.id);

  assert.deepEqual(rumourAfter, rumourBefore, "a rumour must not scale the truth into the projection");
  const serialized = JSON.stringify(rumourAfter);
  for (const truth of [target.fortification, target.population, target.garrison]) {
    assert.ok(!serialized.includes(String(truth)), `the projection must not contain the true value ${truth}`);
  }
  // The honest replacement for the old ground-truth label.
  assert.ok(
    rumourAfter.revealedFactors.includes("defensive ground remains poorly understood"),
    "a remote forecast must admit that the ground is unknown",
  );
});

test("a locally observed forecast still reads the ground exactly", () => {
  const world = createPrototypeWorld(1847);
  const commander = world.characters[world.players["prototype-player"].characterId];
  const target = Object.values(world.settlements).find((entry) => entry.factionId !== null && entry.factionId !== commander.factionId)!;
  commander.locationId = target.id;
  commander.travel = null;
  commander.captivity = null;

  const forecast = combatForecast(world, commander.id, target.id);
  assert.equal(forecast.intelligence.source, "direct");
  assert.ok(
    !forecast.revealedFactors.includes("defensive ground remains poorly understood"),
    "standing on the island must still describe the ground",
  );
  assert.ok(forecast.revealedFactors.some((factor) => factor.includes("defensive ground")));
});

test("a quoted travel time equals the voyage the simulation actually runs", () => {
  const world = createPrototypeWorld(1847);
  const commander = world.characters[world.players["prototype-player"].characterId];
  const destination = Object.values(world.settlements).find((entry) => entry.id !== commander.locationId)!;
  const quoted = travelDuration(world, commander, destination.id);

  const submission = submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "travel",
    targetId: destination.id,
  });
  assert.equal(submission.ok, true);

  const started = runTick(world).events.find((event) => event.type === "travel-started");
  assert.ok(started, "the voyage must start");
  const recorded = started.data.travel as { totalTicks: number };
  assert.equal(recorded.totalTicks, quoted, "the quote must be the duration the voyage uses");
});

test("the island panel cannot be used to read a settlement's true defenses", async () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-inversion-"));
  const app = createDashboardApp({ databasePath: join(directory, "dashboard.sqlite"), seed: 1847 });
  try {
    const world = app.getWorld();
    const commander = world.characters[world.players["prototype-player"].characterId];
    commander.locationId = "crown-harbor";
    commander.travel = null;
    commander.captivity = null;
    const target = Object.values(world.settlements)
      .find((entry) => entry.id !== commander.locationId && entry.factionId !== null && entry.factionId !== commander.factionId)!;
    commander.knowledge[target.id] = staleReport(target.id, target.factionId, 240);
    world.tick = 40;

    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port");
    const base = `http://127.0.0.1:${address.port}`;

    type Panel = {
      combatForecast: unknown;
      travelTicks: number | null;
      travelDays: number | null;
      intelligence: { source: string } | null;
      garrison: number;
      fortification: number | null;
    };
    const read = async (): Promise<Panel> => {
      const state = await (await fetch(`${base}/api/state`)).json() as { settlements: Array<Panel & { id: string }> };
      return state.settlements.find((entry) => entry.id === target.id)!;
    };

    const before = await read();
    assert.ok(before.combatForecast, "a forecast must be available before the commander commits");
    assert.notEqual(before.intelligence?.source, "direct", "this island has not been visited");
    assert.ok(before.travelTicks != null && before.travelTicks > 0, "the voyage must be quoted");

    target.fortification = 11.5;
    target.population = 900_000;
    target.garrison = 33_333;

    const after = await read();
    assert.deepEqual(after.combatForecast, before.combatForecast, "true defenses must not reach the panel");
    assert.equal(after.garrison, before.garrison, "the true garrison must not reach the panel");
    assert.equal(after.fortification, before.fortification, "the true fortification must not reach the panel");
    assert.equal(after.travelTicks, before.travelTicks);
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("declining a surrender keeps the offer answerable and the settlement unclaimed", () => {
  const world = createPrototypeWorld(1847);
  const commander = world.characters[world.players["prototype-player"].characterId];
  const settlement = Object.values(world.settlements)
    .find((entry) => entry.factionId !== null && entry.factionId !== commander.factionId)!;
  const originalFaction = settlement.factionId;
  const originalOwner = settlement.ownerId;
  commander.locationId = settlement.id;
  commander.travel = null;
  commander.captivity = null;
  settlement.surrender = { offeredToId: commander.id, offeredTick: world.tick, previousFactionId: originalFaction! };

  const submission = submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "decline-surrender",
  });
  assert.equal(submission.ok, true);
  assert.ok(settlement.surrender, "the offer must stand until the order resolves");

  const events = runTick(world).events;
  assert.ok(
    events.some((event) => event.type === "settlement-surrender-declined"),
    "declining must be recorded as its own event",
  );
  assert.equal(settlement.surrender, null, "declining must clear the offer");
  assert.equal(settlement.ownerId, originalOwner, "declining must not transfer ownership");
  assert.equal(settlement.factionId, originalFaction, "the settlement stays with its faction");
});

test("a surrender cannot be declined where none is offered", () => {
  const world = createPrototypeWorld(1847);
  const commander = world.characters[world.players["prototype-player"].characterId];
  const settlement = Object.values(world.settlements)
    .find((entry) => entry.factionId !== null && entry.factionId !== commander.factionId)!;
  commander.locationId = settlement.id;
  commander.travel = null;
  settlement.surrender = null;

  const submission = submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "decline-surrender",
  });
  assert.equal(submission.ok, false);
  if (submission.ok) throw new Error("unreachable");
  assert.equal(submission.code, "not-surrendering");
});
