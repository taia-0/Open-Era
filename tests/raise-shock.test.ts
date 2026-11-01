import assert from "node:assert/strict";
import test from "node:test";
import { runTicks } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { applyEvent, stateHash } from "../src/sim/state.ts";
import { RAISE_SHOCK_PER_POINT, raiseShock, raiseShockData } from "../src/sim/tax-rate.ts";
import { taxRateSetSentence } from "../src/dashboard/wording.ts";
import type { SimEvent } from "../src/sim/types.ts";

/** Raise shock (docs/design/low-tax-cost.md at aa87529, section 9 default 1). */
const faction = "free-tide";

test("a raise of n points costs n × 1.0 stability at every held port; a hold or cut costs none", () => {
  const world = createPrototypeWorld(1847);
  const held = Object.values(world.settlements).filter((s) => s.factionId === faction);
  assert.ok(held.length > 0);
  assert.equal(RAISE_SHOCK_PER_POINT, 1);
  const one = raiseShock(world, faction, 0.08, 0.09);
  const three = raiseShock(world, faction, 0.20, 0.23);
  assert.deepEqual(one.map((e) => e.settlementId), held.map((s) => s.id).sort());
  for (const entry of one) assert.equal(entry.stability, Math.round((entry.before - 1) * 100) / 100);
  for (const entry of three) assert.equal(entry.stability, Math.max(0, Math.round((entry.before - 3) * 100) / 100));
  assert.deepEqual(raiseShock(world, faction, 0.09, 0.09), []);
  assert.deepEqual(raiseShock(world, faction, 0.09, 0.08), []);
  assert.deepEqual(raiseShockData(world, faction, 0.09, 0.08), {});
  held[0].stability = 0.4;
  assert.equal(raiseShock(world, faction, 0.08, 0.09).find((e) => e.settlementId === held[0].id)!.stability, 0, "clamped at 0");
});

test("the reducer writes the carried stabilities, and the feed line names the ports", () => {
  const world = createPrototypeWorld(1847);
  const shock = raiseShock(world, faction, world.factions[faction].taxRate, world.factions[faction].taxRate + 0.01);
  const event = {
    sequence: 999999, tick: world.tick, type: "tax-rate-set", actorId: null, targetId: faction,
    data: { factionId: faction, taxRate: world.factions[faction].taxRate + 0.01, previousTaxRate: world.factions[faction].taxRate, taxRateSetTick: world.tick, raiseShock: shock },
  } as unknown as SimEvent;
  const line = taxRateSetSentence(world, event, "Pax Ash");
  applyEvent(world, event);
  for (const entry of shock) assert.equal(world.settlements[entry.settlementId].stability, entry.stability);
  const first = world.settlements[shock[0].settlementId];
  assert.ok(line.includes(`The raise cost stability at ${first.name} ${shock[0].before.toFixed(2)} to ${shock[0].stability.toFixed(2)}`), line);
});

test("every raise in a 1200-tick run carries the shock; no hold or cut does; replay of events reaches the hash", () => {
  const result = runTicks(createPrototypeWorld(1847), 1200);
  const sets = result.events.filter((e) => e.type === "tax-rate-set");
  let raises = 0;
  for (const event of sets) {
    const up = Math.round((event.data.taxRate as number) * 100) > Math.round((event.data.previousTaxRate as number) * 100);
    if (up) raises += 1;
    assert.equal(Array.isArray(event.data.raiseShock), up);
  }
  assert.ok(raises > 0);
  assert.match(stateHash(result.state), /^f80c529f/);
});
