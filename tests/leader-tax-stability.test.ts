import assert from "node:assert/strict";
import test from "node:test";
import { submitCommand } from "../src/sim/commands.ts";
import { runTick, runTicks } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { taxDrift } from "../src/sim/tax-rate.ts";
import type { SimEvent, WorldState } from "../src/sim/types.ts";

/**
 * Slice 2. A holding rate above 0.15 subtracts 0.03 of stability per 0.05
 * band on each peaceful upkeep. Scenario rates 0.14 and 0.08 sit at or below
 * the threshold, so those upkeeps add nothing. The autonomous choice is
 * tested in `leader-tax-autonomy.test.ts`. A three-tick run still emits no
 * `tax-rate-set`, because the clock is tick 24.
 */

const PLAYER = "prototype-player";

test("the graded drift is 0.03 per 0.05 band above 0.15", () => {
  assert.equal(taxDrift(0), 0);
  assert.equal(taxDrift(0.04), 0);
  assert.equal(taxDrift(0.08), 0);
  assert.equal(taxDrift(0.14), 0);
  assert.equal(taxDrift(0.15), 0);
  assert.equal(taxDrift(0.151), 0);
  for (const rate of [0.16, 0.17, 0.2]) assert.equal(taxDrift(rate), 0.03);
  for (const rate of [0.21, 0.25]) assert.equal(taxDrift(rate), 0.06);
  for (const rate of [0.26, 0.3]) assert.equal(taxDrift(rate), 0.09);
  assert.equal(taxDrift(0.155), 0.03);
});

function upkeep(world: WorldState, settlementId: string): SimEvent | undefined {
  const tick = runTick(world);
  return tick.events.find((event) =>
    event.settlementId === settlementId &&
    (event.type === "settlement-upkeep" || event.type === "settlement-shortage"),
  );
}

test("a rate at or below 0.15 leaves the fed upkeep, and each band subtracts from it", () => {
  const fed = (rate: number, settlementId: string): number => {
    const world = createPrototypeWorld(1847);
    world.factions["world-government"].taxRate = rate;
    const event = upkeep(world, settlementId);
    assert.equal(event?.type, "settlement-upkeep");
    assert.equal(event?.data.shortage, 0);
    return event?.data.stability as number;
  };

  assert.equal(fed(0.14, "crown-harbor"), 91.03);
  assert.equal(fed(0.15, "crown-harbor"), 91.03);
  assert.equal(fed(0.16, "crown-harbor"), 91);
  assert.equal(fed(0.2, "crown-harbor"), 91);
  assert.equal(fed(0.21, "crown-harbor"), 90.97);
  assert.equal(fed(0.25, "crown-harbor"), 90.97);
  assert.equal(fed(0.26, "crown-harbor"), 90.94);
  assert.equal(fed(0.3, "crown-harbor"), 90.94);

  assert.equal(fed(0.14, "glassport"), 86.03);
  assert.equal(fed(0.2, "glassport"), 86);
  assert.equal(fed(0.25, "glassport"), 85.97);
  assert.equal(fed(0.3, "glassport"), 85.94);

  const world = createPrototypeWorld(1847);
  world.factions["world-government"].taxRate = 0.3;
  const tick = runTick(world);
  const cinder = tick.events.find((event) => event.settlementId === "cinder-key" && event.type === "settlement-upkeep");
  const verdant = tick.events.find((event) => event.settlementId === "verdant-cay" && event.type === "settlement-upkeep");
  assert.equal(cinder?.data.stability, 73.03);
  assert.equal(verdant?.data.stability, 78.03);
});

test("a shortage upkeep still subtracts the band, and does not add the fed 0.03", () => {
  const short = (rate: number): number => {
    const world = createPrototypeWorld(1847);
    const harbor = world.settlements["crown-harbor"];
    harbor.stocks.provisions = 0;
    harbor.production.provisions = 0;
    world.factions["world-government"].taxRate = rate;
    const event = upkeep(world, "crown-harbor");
    assert.equal(event?.type, "settlement-shortage");
    assert.equal(event?.data.shortage, 5);
    return event?.data.stability as number;
  };

  assert.equal(short(0.14), 89.25);
  assert.equal(short(0.2), 89.22);
  assert.equal(short(0.25), 89.19);
  assert.equal(short(0.3), 89.16);
});

test("the set lands after upkeep, and the next peaceful upkeep carries the band", () => {
  const atTick3 = (rate: number): { crown: number; glass: number; cinder: number; verdant: number } => {
    const world = createPrototypeWorld(1847);
    const queued = submitCommand(world, { playerId: PLAYER, type: "set-tax-rate", taxRate: rate });
    assert.equal(queued.ok, true);
    const first = runTick(world);
    assert.equal(world.factions["world-government"].taxRate, rate);
    assert.equal(first.events.find((event) => event.settlementId === "crown-harbor" && event.type === "settlement-upkeep")?.data.stability, 91.03);
    assert.equal(world.settlements["crown-harbor"].stability, 90.03);
    assert.equal(world.settlements["glassport"].stability, 86.03);
    const second = runTick(world);
    assert.equal(second.events.some((event) => event.settlementId === "crown-harbor" && (event.type === "settlement-upkeep" || event.type === "settlement-shortage")), false);
    assert.equal(world.settlements["crown-harbor"].stability, 90.03);
    runTick(world);
    assert.equal(world.tick, 3);
    return {
      crown: world.settlements["crown-harbor"].stability,
      glass: world.settlements["glassport"].stability,
      cinder: world.settlements["cinder-key"].stability,
      verdant: world.settlements["verdant-cay"].stability,
    };
  };

  const threshold = atTick3(0.15);
  assert.deepEqual(threshold, { crown: 90.06, glass: 86.09, cinder: 73.09, verdant: 78.09 });
  assert.deepEqual(atTick3(0.16), { crown: 90.03, glass: 86.03, cinder: 73.09, verdant: 78.09 });
  assert.deepEqual(atTick3(0.2), { crown: 90.03, glass: 86.03, cinder: 73.09, verdant: 78.09 });
  assert.deepEqual(atTick3(0.21), { crown: 90, glass: 85.97, cinder: 73.09, verdant: 78.09 });
  assert.deepEqual(atTick3(0.25), { crown: 90, glass: 85.97, cinder: 73.09, verdant: 78.09 });
  assert.deepEqual(atTick3(0.26), { crown: 89.97, glass: 85.91, cinder: 73.09, verdant: 78.09 });
  assert.deepEqual(atTick3(0.3), { crown: 89.97, glass: 85.91, cinder: 73.09, verdant: 78.09 });
});

test("a headless run still emits no tax-rate-set", () => {
  const run = runTicks(createPrototypeWorld(1847), 3);
  assert.equal(run.events.some((event) => event.type === "tax-rate-set"), false);
  assert.equal(run.state.factions["world-government"].taxRate, 0.14);
  assert.equal(run.state.factions["free-tide"].taxRate, 0.08);
});
