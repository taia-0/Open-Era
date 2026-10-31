import assert from "node:assert/strict";
import test from "node:test";
import { projectEventFeed } from "../src/dashboard/view-model.ts";
import { runTick, runTicks } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";
import type { SimEvent } from "../src/sim/types.ts";

function live(seed: number, ticks: number): { world: ReturnType<typeof createPrototypeWorld>; events: SimEvent[] } {
  const world = createPrototypeWorld(seed);
  const events: SimEvent[] = [];
  while (world.tick < ticks) events.push(...runTick(world, { liveSession: true }).events);
  return { world, events };
}

test("seed 1847 shows every Free Tide step from 7% to the tick 792 cut, each with its previous rate", () => {
  // Re-pinned for the contract haul: the haul run has 16 Free Tide steps, ending with the tick 792 cut.
  const { world, events } = live(1847, 841);
  const steps = events.filter((event) => event.type === "tax-rate-set" && event.data.factionId === "free-tide");
  const rows = steps.map((event) => projectEventFeed(world, "character-01", [event], events)[0]);
  assert.equal(rows.length, 16);
  assert.equal(rows.every((row) => row?.payloadWithheld === true), true);
  // Breakaway polish ruling 2: a faction holding one port names it as the pressed port.
  assert.equal(rows[0]?.summary, "Pax Ash lowered the Free Tide Compact tax from 8% to 7% (unrest at Glassport).");
  assert.equal(rows[1]?.summary, "Pax Ash raised the Free Tide Compact tax from 7% to 8% (treasury short).");
  assert.equal(rows[14]?.summary, "Pax Ash raised the Free Tide Compact tax from 14% to 15% (treasury short).");
  assert.equal(rows[15]?.summary, "Pax Ash lowered the Free Tide Compact tax from 15% to 14% (unrest).");
  for (let index = 1; index < steps.length; index += 1) {
    assert.equal(steps[index].data.previousTaxRate, steps[index - 1].data.taxRate);
  }
});

test("a contract offer names the carrier and the cargo, and only the parties see the price", () => {
  const { world, events } = live(1847, 137);
  const offer = events.find((event) => event.sequence === 16039);
  assert.ok(offer);
  const line = "Bram Quill offered Iris Stone a contract to carry 10 provisions to Crown Harbor.";
  for (const reader of ["character-01", "character-14"]) {
    const [row] = projectEventFeed(world, reader, [offer], events);
    assert.equal(row?.payloadWithheld, true);
    assert.equal(row?.summary, line);
    assert.equal(String(row?.summary).includes("56.25"), false);
  }
  for (const reader of ["character-02", "character-06"]) {
    const [row] = projectEventFeed(world, reader, [offer], events);
    assert.equal(row?.payloadWithheld, false);
    assert.equal(row?.summary, `${line} The price is 56.25.`);
  }
});

test("seed 1847 says why Mara's morale falls when her hold runs dry, and only to her and her holder", () => {
  const { world, events } = live(1847, 72);
  const before = stateHash(world);
  const dry = events.find((event) => event.type === "character-upkeep" && event.actorId === "character-01" && event.tick === 63);
  assert.ok(dry);
  const [own] = projectEventFeed(world, "character-01", [dry], events);
  assert.equal(own?.summary, "Mara Vane's upkeep was recorded. The hold was short 0.576 provisions, so morale fell to 93.41 and health to 99.31.");
  const [rival] = projectEventFeed(world, "character-14", [dry], events);
  assert.equal(String(rival?.summary).includes("morale"), false);
  const fed = events.find((event) => event.type === "character-upkeep" && event.actorId === "character-01" && event.tick === 61);
  assert.ok(fed);
  assert.equal(projectEventFeed(world, "character-01", [fed], events)[0]?.summary, "Mara Vane's upkeep was recorded.");
  assert.equal(world.characters["character-01"].morale, 82.351);
  assert.equal(stateHash(world), before);
});

test("the contract haul moves the 72-tick pin on 2718 and 4096 only", () => {
  // Re-pinned for the contract haul: 1847 has no haul by tick 72; 2718 and 4096 do.
  const hashes = [1847, 2718, 4096].map((seed) => stateHash(runTicks(createPrototypeWorld(seed), 72).state).slice(0, 8));
  assert.deepEqual(hashes, ["6efa334f", "e8f9cfab", "8ac8529b"]);
});
