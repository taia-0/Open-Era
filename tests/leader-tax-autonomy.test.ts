import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { projectEventFeed } from "../src/dashboard/view-model.ts";
import { projectFactions } from "../src/dashboard/visibility.ts";
import { submitCommand } from "../src/sim/commands.ts";
import { runTick, runTicks } from "../src/sim/engine.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { applyEvent, stateHash } from "../src/sim/state.ts";
import { autonomousTaxStep } from "../src/sim/tax-rate.ts";
import type { SimEvent, WorldState } from "../src/sim/types.ts";

/**
 * Slice 3. A free holder steps the faction rate one cent on the 24-tick
 * clock, down when a held port is at or under 55, up when the treasury
 * cannot pay every free mate a day of passage. A headless run includes a
 * human holder. A live session skips her. The acting commander is not the
 * writer.
 */

const PLAYER = "prototype-player";

function clockWorld(): WorldState {
  const world = createPrototypeWorld(1847);
  world.tick = 24;
  return world;
}

function publishStability(world: WorldState, settlementId: string): void {
  const settlement = world.settlements[settlementId];
  const record = {
    item: {
      id: `press-${settlementId}`,
      type: "battle-resolved",
      observedTick: world.tick,
      factionId: settlement.factionId,
    },
    aboutSettlementId: settlementId,
    stability: settlement.stability,
    followerIds: [] as string[],
    sequence: world.tick,
  };
  for (const port of Object.values(world.settlements)) {
    const rest = (port.news ?? []).filter((held) => held.item.id !== record.item.id);
    port.news = [...rest, record];
  }
}

function press(world: WorldState, factionId: string, stability: number): void {
  for (const settlement of Object.values(world.settlements)) {
    if (settlement.factionId !== factionId) continue;
    settlement.stability = stability;
    publishStability(world, settlement.id);
  }
}

function forceCapture(world: WorldState, characterId: string): void {
  const character = world.characters[characterId];
  const settlementId = character.locationId ?? "crown-harbor";
  const settlement = world.settlements[settlementId];
  applyEvent(world, {
    sequence: world.nextEventSequence,
    tick: world.tick,
    type: "character-captured",
    actorId: characterId,
    settlementId,
    targetId: settlement.factionId ?? undefined,
    data: {
      battleId: `tax-autonomy-${characterId}`,
      cause: "major-defeat",
      displayedRisk: "high",
      health: character.health,
      morale: character.morale,
      captivity: {
        captorFactionId: settlement.factionId,
        settlementId,
        capturedTick: world.tick,
        mandatoryReleaseTick: world.tick + 84,
        cause: "major-defeat",
        displayedRisk: "high",
        scatteredTroops: { ...character.troops },
        releaseDestinationId: null,
      },
    },
  });
  world.nextEventSequence += 1;
}

test("the cent follows the port, then the treasury, and stops at the ends", () => {
  const down = clockWorld();
  press(down, "free-tide", 55);
  down.factions["free-tide"].treasury = 10_000;
  const pressed = autonomousTaxStep(down, "free-tide");
  assert.equal(pressed?.holderId, "character-14");
  assert.equal(pressed?.taxRate, 0.07);
  assert.equal(pressed?.previousTaxRate, 0.08);

  const both = clockWorld();
  press(both, "free-tide", 40);
  both.factions["free-tide"].treasury = 1;
  assert.equal(autonomousTaxStep(both, "free-tide")?.taxRate, 0.07);

  const up = clockWorld();
  press(up, "free-tide", 55.001);
  up.factions["free-tide"].treasury = 1;
  assert.equal(autonomousTaxStep(up, "free-tide")?.taxRate, 0.09);

  const calm = clockWorld();
  press(calm, "free-tide", 80);
  calm.factions["free-tide"].treasury = 10_000;
  assert.equal(autonomousTaxStep(calm, "free-tide"), null);

  const floor = clockWorld();
  floor.factions["free-tide"].taxRate = 0;
  press(floor, "free-tide", 10);
  floor.factions["free-tide"].treasury = 1;
  assert.equal(autonomousTaxStep(floor, "free-tide"), null);

  const ceiling = clockWorld();
  ceiling.factions["free-tide"].taxRate = 0.3;
  press(ceiling, "free-tide", 80);
  ceiling.factions["free-tide"].treasury = 1;
  assert.equal(autonomousTaxStep(ceiling, "free-tide"), null);
});

test("the floor is 55 in thousandths, and the lowest held port is the one that counts", () => {
  const onFloor = clockWorld();
  press(onFloor, "free-tide", 55);
  onFloor.factions["free-tide"].treasury = 10_000;
  assert.equal(autonomousTaxStep(onFloor, "free-tide")?.taxRate, 0.07);

  const above = clockWorld();
  press(above, "free-tide", 55.001);
  above.factions["free-tide"].treasury = 10_000;
  assert.equal(autonomousTaxStep(above, "free-tide"), null);

  const split = clockWorld();
  split.settlements["cinder-key"].stability = 90;
  split.settlements["verdant-cay"].factionId = "free-tide";
  split.settlements["verdant-cay"].stability = 40;
  publishStability(split, "cinder-key");
  publishStability(split, "verdant-cay");
  split.factions["free-tide"].treasury = 10_000;
  assert.equal(autonomousTaxStep(split, "free-tide")?.taxRate, 0.07);

  const landless = clockWorld();
  landless.settlements["cinder-key"].factionId = null;
  landless.factions["free-tide"].treasury = 1;
  assert.equal(autonomousTaxStep(landless, "free-tide"), null);
});

test("the clock is every 24 ticks after tick 0, and a recent set waits", () => {
  const world = createPrototypeWorld(1847);
  press(world, "free-tide", 10);
  world.factions["free-tide"].treasury = 1;
  for (const tick of [0, 23, 25, 47]) {
    world.tick = tick;
    assert.equal(autonomousTaxStep(world, "free-tide"), null, `tick ${tick}`);
  }
  world.tick = 24;
  assert.equal(autonomousTaxStep(world, "free-tide")?.taxRate, 0.07);

  world.factions["free-tide"].taxRateSetTick = 24;
  assert.equal(autonomousTaxStep(world, "free-tide"), null);
  world.tick = 48;
  press(world, "free-tide", 10);
  assert.equal(autonomousTaxStep(world, "free-tide")?.taxRate, 0.07);

  world.factions["free-tide"].taxRateSetTick = 25;
  assert.equal(autonomousTaxStep(world, "free-tide"), null);
});

test("the rule includes a human holder, and a captive holder stays out", () => {
  const human = clockWorld();
  press(human, "world-government", 10);
  human.factions["world-government"].treasury = 0;
  assert.equal(human.characters["character-01"].controller.kind, "human");
  const step = autonomousTaxStep(human, "world-government");
  assert.equal(step?.holderId, "character-01");
  assert.equal(step?.taxRate, 0.13);
  assert.equal(step?.previousTaxRate, 0.14);

  const captive = clockWorld();
  forceCapture(captive, "character-14");
  const coverId = captive.factions["free-tide"].actingCommanderId;
  assert.ok(coverId);
  assert.notEqual(coverId, "character-14");
  press(captive, "free-tide", 10);
  captive.factions["free-tide"].treasury = 0;
  assert.equal(autonomousTaxStep(captive, "free-tide"), null);
});

test("the step is emitted after upkeep and writes the rate", () => {
  const world = createPrototypeWorld(1847);
  runTicks(world, 24);
  assert.equal(world.tick, 24);
  assert.equal(world.factions["free-tide"].taxRate, 0.08);
  assert.equal(world.factions["world-government"].taxRate, 0.14);
  press(world, "free-tide", 90);
  world.factions["free-tide"].treasury = 1;

  const tick = runTick(world);
  const sets = tick.events.filter((event) => event.type === "tax-rate-set");
  assert.equal(sets.length, 1);
  const set = sets[0];
  assert.equal(set.actorId, "character-14");
  assert.equal(set.targetId, "free-tide");
  assert.equal(set.tick, 24);
  assert.equal(set.data.factionId, "free-tide");
  assert.equal(set.data.taxRate, 0.09);
  assert.equal(set.data.previousTaxRate, 0.08);
  assert.equal(set.data.taxRateSetTick, 24);
  assert.equal(Object.hasOwn(set.data, "commandId"), false);
  assert.equal(world.factions["free-tide"].taxRate, 0.09);
  assert.equal(world.factions["free-tide"].taxRateSetTick, 24);
  assert.equal(world.factions["world-government"].taxRate, 0.14);
  assert.equal(Object.hasOwn(world.factions["world-government"], "taxRateSetTick"), false);

  const upkeep = tick.events.find((event) => event.settlementId === "cinder-key" && event.type === "settlement-upkeep");
  assert.ok(upkeep);
  assert.ok(upkeep.sequence < set.sequence);
});

test("a player set on the clock tick lands first and the autonomous step waits", () => {
  const world = createPrototypeWorld(1847);
  runTicks(world, 24);
  const queued = submitCommand(world, { playerId: PLAYER, type: "set-tax-rate", taxRate: 0.2 });
  assert.equal(queued.ok, true);
  press(world, "world-government", 10);

  const tick = runTick(world);
  const wg = tick.events.filter((event) => event.type === "tax-rate-set" && event.targetId === "world-government");
  assert.equal(wg.length, 1);
  assert.equal(wg[0].data.taxRate, 0.2);
  assert.equal(wg[0].data.commandId, "command-00001");
  assert.equal(world.factions["world-government"].taxRate, 0.2);
  assert.equal(world.factions["world-government"].taxRateSetTick, 24);
});

test("factions step in id order, and a headless run includes the human holder", () => {
  const world = createPrototypeWorld(1847);
  runTicks(world, 24);
  assert.equal(world.characters["character-01"].controller.kind, "human");
  press(world, "free-tide", 40);
  press(world, "world-government", 40);
  const tick = runTick(world);
  const sets = tick.events.filter((event) => event.type === "tax-rate-set");
  assert.deepEqual(sets.map((event) => event.targetId), ["free-tide", "world-government"]);
  assert.equal(sets[0].data.taxRate, 0.07);
  assert.equal(sets[1].data.taxRate, 0.13);
  assert.equal(sets[0].actorId, "character-14");
  assert.equal(sets[1].actorId, "character-01");
});

test("a live session skips the human holder", () => {
  const world = createPrototypeWorld(1847);
  runTicks(world, 24);
  press(world, "world-government", 10);
  world.factions["world-government"].treasury = 0;
  const tick = runTick(world, { liveSession: true });
  assert.equal(tick.events.some((event) => event.type === "tax-rate-set" && event.targetId === "world-government"), false);
  assert.equal(world.factions["world-government"].taxRate, 0.14);
  assert.equal(Object.hasOwn(world.factions["world-government"], "taxRateSetTick"), false);

  const headless = createPrototypeWorld(1847);
  runTicks(headless, 24);
  press(headless, "world-government", 10);
  headless.factions["world-government"].treasury = 0;
  const chosen = runTick(headless);
  const set = chosen.events.find((event) => event.type === "tax-rate-set" && event.targetId === "world-government");
  assert.ok(set);
  assert.equal(set.actorId, "character-01");
  assert.equal(set.data.taxRate, 0.13);
  assert.equal(Object.hasOwn(set.data, "commandId"), false);
  assert.equal(headless.factions["world-government"].taxRate, 0.13);
});

test("seed 1847 lets Mara choose at tick 72 in a headless run and not in a live session", () => {
  const headless = runTicks(createPrototypeWorld(1847), 73);
  const set = headless.events.find((event) => event.type === "tax-rate-set" && event.targetId === "world-government");
  assert.ok(set);
  assert.equal(set.tick, 72);
  assert.equal(set.sequence, 8505);
  assert.equal(set.actorId, "character-01");
  assert.equal(set.data.taxRate, 0.13);
  assert.equal(set.data.previousTaxRate, 0.14);
  assert.equal(Object.hasOwn(set.data, "commandId"), false);
  assert.equal(headless.state.factions["world-government"].taxRate, 0.13);
  assert.equal(headless.state.factions["world-government"].taxRateSetTick, 72);

  const live = runTicks(createPrototypeWorld(1847), 73, { liveSession: true });
  assert.equal(live.events.some((event) => event.type === "tax-rate-set" && event.actorId === "character-01"), false);
  assert.equal(live.state.factions["world-government"].taxRate, 0.14);
  assert.equal(Object.hasOwn(live.state.factions["world-government"], "taxRateSetTick"), false);
});

test("a captive holder emits nothing on the clock tick", () => {
  const world = createPrototypeWorld(1847);
  runTicks(world, 24);
  forceCapture(world, "character-14");
  const coverId = world.factions["free-tide"].actingCommanderId;
  assert.ok(coverId);
  press(world, "free-tide", 10);
  world.factions["free-tide"].treasury = 0;
  const tick = runTick(world);
  assert.equal(tick.events.some((event) => event.type === "tax-rate-set"), false);
  assert.equal(world.factions["free-tide"].taxRate, 0.08);
  assert.equal(Object.hasOwn(world.factions["free-tide"], "taxRateSetTick"), false);
  assert.notEqual(coverId, "character-14");
});

test("the player seat sees the sentence and the public rate, and not the payload or the treasury", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  runTicks(world, 24);
  press(world, "free-tide", 90);
  world.factions["free-tide"].treasury = 1;
  const tick = runTick(world);
  const set = tick.events.find((event) => event.type === "tax-rate-set");
  assert.ok(set);
  const [row] = projectEventFeed(world, mara.id, [set]);
  assert.equal(row.summary, "Pax Ash raised the Free Tide Compact tax to 9% (treasury short).");
  assert.equal(row.settlementId, null);
  assert.equal(Object.hasOwn(row, "settlementId"), true);
  assert.equal(row.payloadWithheld, true);
  assert.equal(row.data, null);
  assert.equal(row.actorId, "character-14");
  assert.equal(row.targetId, "free-tide");

  const factions = projectFactions(world, mara) as Array<{
    id: string;
    taxRate: number;
    taxRateSetTick: number | null;
    treasury: number | null;
    power: number | null;
  }>;
  const freeTide = factions.find((faction) => faction.id === "free-tide");
  const government = factions.find((faction) => faction.id === "world-government");
  assert.equal(freeTide?.taxRate, 0.09);
  assert.equal(freeTide?.taxRateSetTick, 24);
  assert.equal(freeTide?.treasury, null);
  assert.equal(freeTide?.power, null);
  assert.equal(government?.taxRate, 0.14);
  assert.equal(government?.taxRateSetTick, null);
});

test("recovery replays an autonomous set", () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-leader-tax-autonomy-"));
  const databasePath = join(directory, "world.sqlite");
  const store = new WorldStore(databasePath);
  try {
    const world = createPrototypeWorld(1847);
    store.initialize(world);
    let set: SimEvent | undefined;
    for (let index = 0; index < 200 && !set; index += 1) {
      const tick = runTick(world);
      store.appendTick(tick.events, world);
      set = tick.events.find((event) => event.type === "tax-rate-set");
    }
    assert.ok(set);
    assert.equal(set.tick, 72);
    assert.equal(set.sequence, 8505);
    assert.equal(set.targetId, "world-government");
    assert.equal(set.actorId, "character-01");
    assert.equal(set.data.taxRate, 0.13);
    assert.equal(set.data.previousTaxRate, 0.14);
    assert.equal(set.data.taxRateSetTick, 72);
    assert.equal(Object.hasOwn(set.data, "commandId"), false);
    assert.equal(world.tick, 73);
    assert.equal(world.factions["world-government"].taxRate, 0.13);
    assert.equal(world.factions["free-tide"].taxRate, 0.08);
    const liveHash = stateHash(world);
    const recovered = store.recover();
    assert.ok(recovered.replayedEvents > 0);
    assert.equal(stateHash(recovered.state), liveHash);
    assert.equal(recovered.state.factions["world-government"].taxRate, world.factions["world-government"].taxRate);
    assert.equal(recovered.state.factions["world-government"].taxRateSetTick, set.tick);
    assert.equal(Object.hasOwn(recovered.state.factions["free-tide"], "taxRateSetTick"), false);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
