import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { spanAges } from "../src/sim/aging.ts";
import { runTick, runTicks } from "../src/sim/engine.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";

test("span ages are not stored, and the fixed deaths are Lio, Esme, and Kessa", () => {
  const ages = {
    1847: spanAges(1847).get("character-12"),
    2718: spanAges(2718).get("character-12"),
    4096: spanAges(4096).get("character-30"),
  };
  assert.equal(ages[1847], 114);
  assert.equal(spanAges(2718).get("character-19"), 116);
  assert.equal(ages[2718], 119);
  assert.equal(ages[4096], 117);

  const early = createPrototypeWorld(1847);
  assert.equal(Object.values(early.characters).some((character) => character.dead), false);
  assert.equal(Object.hasOwn(early.characters["character-12"], "dead"), false);

  const seed1847 = runTicks(createPrototypeWorld(1847), 1081);
  const lio = seed1847.events.filter((event) => event.type === "character-died");
  assert.equal(lio.length, 1);
  assert.equal(lio[0].tick, 1080);
  assert.equal(lio[0].actorId, "character-12");
  assert.equal(lio[0].data.cause, "old-age");
  assert.equal(lio[0].data.ageYears, 120);
  assert.equal(lio[0].data.policy, "vacant");
  assert.equal(seed1847.state.characters["character-12"].dead, true);
  assert.equal(seed1847.state.characters["character-12"].factionId, null);
  assert.equal(Object.hasOwn(seed1847.state.characters["character-12"], "ageYears"), false);

  const seed2718 = runTicks(createPrototypeWorld(2718), 721);
  const deaths = seed2718.events.filter((event) => event.type === "character-died");
  assert.deepEqual(deaths.map((event) => [event.tick, event.actorId]), [
    [180, "character-12"],
    [720, "character-19"],
  ]);

  const seed4096 = runTicks(createPrototypeWorld(4096), 541);
  const kessa = seed4096.events.filter((event) => event.type === "character-died");
  assert.equal(kessa.length, 1);
  assert.equal(kessa[0].tick, 540);
  assert.equal(kessa[0].actorId, "character-30");
});

test("a restart on the death morning does not emit a second death", () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-aging-recovery-"));
  try {
    const continuous = createPrototypeWorld(2718);
    for (let index = 0; index < 181; index += 1) runTick(continuous);

    const databasePath = join(directory, "world.sqlite");
    const store = new WorldStore(databasePath);
    const split = createPrototypeWorld(2718);
    store.initialize(split);
    for (let index = 0; index < 180; index += 1) {
      const result = runTick(split);
      store.appendTick(result.events, split);
    }
    const recovered = store.recover().state;
    const resumed = runTick(recovered);
    store.appendTick(resumed.events, recovered);
    const deaths = store.allEvents().filter((event) => event.type === "character-died" && event.actorId === "character-12");
    assert.equal(deaths.length, 1);
    assert.equal(deaths[0].tick, 180);
    assert.equal(stateHash(recovered), stateHash(continuous));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
