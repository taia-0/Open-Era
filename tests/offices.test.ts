import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runTick } from "../src/sim/engine.ts";
import { governorId, payGovernorStipends, syncGovernorSeats } from "../src/sim/governor.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { round, stateHash } from "../src/sim/state.ts";
import type { WorldState } from "../src/sim/types.ts";

function idNamed(world: WorldState, name: string): string {
  const character = Object.values(world.characters).find((candidate) => candidate.name === name);
  assert.ok(character, name);
  return character.id;
}

test("opening seats name the cover sort, and the first morning pays 18 a seat", () => {
  const expected: Record<number, [string, string, string]> = {
    1847: ["Jun Marrow", "Esme Dusk", "Lio Crow"],
    2718: ["Ada Sorn", "Esme Dusk", "Vale Drake"],
    4096: ["Orin Rill", "Esme Dusk", "Lio Crow"],
  };
  for (const [seedText, names] of Object.entries(expected)) {
    const world = createPrototypeWorld(Number(seedText));
    const treasury = {
      "world-government": world.factions["world-government"].treasury,
      "free-tide": world.factions["free-tide"].treasury,
    };
    const purses = Object.fromEntries(
      names.map((name) => [name, world.characters[idNamed(world, name)].money]),
    );
    syncGovernorSeats(world);
    assert.equal(governorId(world, "crown-harbor"), idNamed(world, names[0]));
    assert.equal(governorId(world, "cinder-key"), idNamed(world, names[1]));
    assert.equal(governorId(world, "glassport"), idNamed(world, names[2]));
    assert.equal(governorId(world, "verdant-cay"), null);
    payGovernorStipends(world);
    assert.equal(world.factions["world-government"].treasury, round(treasury["world-government"] - 36, 2));
    assert.equal(world.factions["free-tide"].treasury, round(treasury["free-tide"] - 18, 2));
    for (const name of names) {
      assert.equal(world.characters[idNamed(world, name)].money, round(purses[name] + 18, 2));
    }
  }
});

test("a captive holder appoints nobody, and captivity does not clear a filled seat", () => {
  const world = createPrototypeWorld(1847);
  syncGovernorSeats(world);
  const governor = governorId(world, "crown-harbor");
  assert.ok(governor);
  const holderId = Object.values(world.characters).find((character) => character.name === "Mara Vane")?.id;
  assert.ok(holderId);
  world.characters[holderId].captivity = {
    captorFactionId: "free-tide",
    settlementId: "crown-harbor",
    capturedTick: 0,
    mandatoryReleaseTick: 30,
    cause: "major-defeat",
    displayedRisk: "low",
    scatteredTroops: { count: 0, experience: 0, discipline: 0 },
    releaseDestinationId: null,
  };
  world.settlements["verdant-cay"].factionId = "world-government";
  syncGovernorSeats(world);
  assert.equal(governorId(world, "crown-harbor"), governor);
  assert.equal(governorId(world, "verdant-cay"), null);
  world.characters[governor].captivity = {
    captorFactionId: "free-tide",
    settlementId: "crown-harbor",
    capturedTick: 0,
    mandatoryReleaseTick: 30,
    cause: "major-defeat",
    displayedRisk: "low",
    scatteredTroops: { count: 0, experience: 0, discipline: 0 },
    releaseDestinationId: null,
  };
  syncGovernorSeats(world);
  assert.equal(governorId(world, "crown-harbor"), governor);
});

test("a recovered morning pays the same governors as a continuous run", () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-offices-recovery-"));
  try {
    const continuous = createPrototypeWorld(1847);
    for (let index = 0; index < 72; index += 1) runTick(continuous);

    const databasePath = join(directory, "world.sqlite");
    const store = new WorldStore(databasePath);
    const split = createPrototypeWorld(1847);
    store.initialize(split);
    for (let index = 0; index < 47; index += 1) {
      const result = runTick(split);
      store.appendTick(result.events, split);
    }
    store.close();

    const reopened = new WorldStore(databasePath);
    const recovered = reopened.recover();
    assert.ok(recovered.replayedEvents > 0);
    for (let index = 47; index < 72; index += 1) runTick(recovered.state);
    reopened.close();
    assert.equal(stateHash(recovered.state), stateHash(continuous));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
