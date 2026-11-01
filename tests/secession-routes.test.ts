import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { WorldStore } from "../src/sim/persistence.ts";
import { governorId } from "../src/sim/governor.ts";
import { runTick } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { HATED_GRIEVANCE, PROMISE_BREACH_COUNT, PROMISE_WINDOW_TICKS, secessionRoutes, startingGrievance } from "../src/sim/secession.ts";
import { commandHolderId, stateHash } from "../src/sim/state.ts";
import type { SimEvent, SupplyContract, WorldState } from "../src/sim/types.ts";

/** A fixture port with a seated governor who is not the holder, its faction at a low rate. */
function fixture(seed = 1847) {
  const world = createPrototypeWorld(seed);
  for (const settlement of Object.values(world.settlements).sort((a, b) => a.id.localeCompare(b.id))) {
    if (!settlement.factionId) continue;
    const id = governorId(world, settlement.id);
    if (!id || id === commandHolderId(world, settlement.factionId)) continue;
    world.factions[settlement.factionId].taxRate = 0.1;
    // Keep a second port in the faction so the last-port exemption is not in play.
    const other = Object.values(world.settlements).find((s) => s.id !== settlement.id);
    if (other) other.factionId = settlement.factionId;
    return { world, settlement, governor: world.characters[id] };
  }
  throw new Error("no governed port");
}
function breach(world: WorldState, port: string, n: number, tick: number) {
  world.contracts ??= {};
  for (let i = 0; i < n; i += 1) {
    world.contracts[`c-${port}-${tick}-${i}`] = { id: `c-${port}-${tick}-${i}`, destinationId: port, status: "breached", observedTick: tick } as unknown as SupplyContract;
  }
}
const run = (seed: number, ticks: number) => {
  const world = createPrototypeWorld(seed); const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i += 1) events.push(...runTick(world, {}).events);
  return { world, events };
};

test("no route on a quiet fixture port: rate 0.10, no breaches, setup grievance only", () => {
  const { world, settlement, governor } = fixture();
  assert.deepEqual(secessionRoutes(world, settlement, governor), []);
});

test("tax alone: rate above 0.15", () => {
  const { world, settlement, governor } = fixture();
  world.factions[settlement.factionId!].taxRate = 0.16;
  assert.deepEqual(secessionRoutes(world, settlement, governor), ["tax"]);
});

test("promise alone: 10 breached contracts to the port inside 240 ticks; 9, or older ones, do not count", () => {
  const { world, settlement, governor } = fixture();
  world.tick = 500;
  breach(world, settlement.id, PROMISE_BREACH_COUNT - 1, 400);
  assert.deepEqual(secessionRoutes(world, settlement, governor), []);
  breach(world, settlement.id, 5, world.tick - PROMISE_WINDOW_TICKS); // at the window edge: outside
  assert.deepEqual(secessionRoutes(world, settlement, governor), []);
  breach(world, settlement.id, 1, 450);
  assert.deepEqual(secessionRoutes(world, settlement, governor), ["promise"]);
  breach(world, "elsewhere", 20, 450);
  assert.deepEqual(secessionRoutes(world, settlement, governor), ["promise"]);
});

test("hated alone: grievance EARNED since setup ≥ 0.12 at the holder; setup grievance alone never fires", () => {
  const { world, settlement, governor } = fixture();
  const holder = commandHolderId(world, settlement.factionId!)!;
  const start = startingGrievance(world.seed, governor.id, holder);
  assert.equal(start, createPrototypeWorld(world.seed).characters[governor.id].relationships[holder]?.grievance ?? 0);
  governor.relationships[holder] = { ...(governor.relationships[holder] ?? { trust: 0, respect: 0, grievance: 0 }), grievance: start + HATED_GRIEVANCE - 0.001 } as never;
  assert.deepEqual(secessionRoutes(world, settlement, governor), []);
  governor.relationships[holder].grievance = start + HATED_GRIEVANCE;
  assert.deepEqual(secessionRoutes(world, settlement, governor), ["hated"]);
  // Fixed order tax, promise, hated.
  world.factions[settlement.factionId!].taxRate = 0.2; world.tick = 300; breach(world, settlement.id, 10, 299);
  assert.deepEqual(secessionRoutes(world, settlement, governor), ["tax", "promise", "hated"]);
});

test("hated at the acting commander; a relationship formed after setup starts at 0", () => {
  const { world, settlement, governor } = fixture();
  const acting = "character-0-not-at-setup";
  world.factions[settlement.factionId!].actingCommanderId = acting;
  assert.equal(startingGrievance(world.seed, governor.id, acting), 0);
  governor.relationships[acting] = { trust: 0, respect: 0, grievance: HATED_GRIEVANCE } as never;
  assert.deepEqual(secessionRoutes(world, settlement, governor), ["hated"]);
});

test("last-port exemption: a route never takes the faction's only port; tax still can", () => {
  const { world, settlement, governor } = fixture();
  for (const other of Object.values(world.settlements)) if (other.id !== settlement.id && other.factionId === settlement.factionId) other.factionId = null as never;
  world.tick = 300; breach(world, settlement.id, 12, 299);
  assert.deepEqual(secessionRoutes(world, settlement, governor), []);
  world.factions[settlement.factionId!].taxRate = 0.2;
  assert.deepEqual(secessionRoutes(world, settlement, governor), ["tax", "promise"]);
});

test("1,200-tick runs: every autonomous declaration records its routes; once per spell; never the holder; route-only never a last port", () => {
  for (const seed of [1847, 2718, 4096]) {
    const world = createPrototypeWorld(seed);
    const seen = new Set<string>();
    let nonTax = 0;
    for (let i = 0; i < 1200; i += 1) {
      const held = new Map<string, number>();
      for (const s of Object.values(world.settlements)) if (s.factionId) held.set(s.factionId, (held.get(s.factionId) ?? 0) + 1);
      const holders = new Map(Object.keys(world.factions).map((f) => [f, commandHolderId(world, f)]));
      for (const e of runTick(world, {}).events) {
        if (e.type !== "secession-declared") continue;
        const routes = e.data.routes as string[];
        assert.ok(Array.isArray(routes) && routes.length > 0);
        assert.deepEqual(routes, ["tax", "promise", "hated"].filter((r) => routes.includes(r)));
        const from = String(e.targetId);
        assert.notEqual(e.actorId, holders.get(from));
        assert.ok(!from.startsWith("secession-"), "a breakaway never secedes autonomously");
        const key = `${e.settlementId}:${e.actorId}`;
        assert.ok(!seen.has(key), `once per spell: ${key}`); seen.add(key);
        if (!routes.includes("tax")) { nonTax += 1; assert.ok((held.get(from) ?? 0) >= 2, `route took a last port at t${e.tick}`); }
      }
    }
    assert.ok(nonTax >= 1, `seed ${seed}: at least one non-tax secession`);
  }
});

test("pins: 72-tick fixture unchanged; 1,200-tick pins re-recorded (5641b4c4 / a6ff3924 / b19aa02e)", () => {
  const short: Record<number, string> = { 1847: "6efa334f", 2718: "e8f9cfab", 4096: "8ac8529b" };
  for (const [seed, hash] of Object.entries(short)) assert.equal(stateHash(run(Number(seed), 72).world).slice(0, 8), hash);
  const long = run(2718, 1200);
  assert.equal(stateHash(long.world).slice(0, 8), "a6ff3924");
  assert.equal(long.events.length, 156996);
  assert.ok(long.events.some((e) => e.type === "secession-declared" && (e.data.routes as string[]).includes("hated")));
});

test("WorldStore.recover across route declarations matches the continuous run (events replay through applyEvent)", () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-routes-"));
  try {
    const continuous = run(4096, 260);
    assert.ok(continuous.events.some((e) => e.type === "secession-declared" && !(e.data.routes as string[]).includes("tax")));
    const store = new WorldStore(join(directory, "world.sqlite"));
    const world = createPrototypeWorld(4096);
    store.initialize(world);
    // 4096 declares by route at t185 and t189; 191 sits between snapshots, so recovery replays those ticks' events.
    while (world.tick < 191) store.appendTick(runTick(world, {}).events, world);
    const recovered = store.recover();
    assert.ok(recovered.replayedEvents > 0);
    assert.equal(stateHash(recovered.state), stateHash(world));
    const resumed = recovered.state;
    while (resumed.tick < 260) store.appendTick(runTick(resumed, {}).events, resumed);
    assert.equal(stateHash(resumed), stateHash(continuous.world));
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
