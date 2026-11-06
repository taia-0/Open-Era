import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveLifecycle } from "../src/cli/lifecycle-flag.ts";
import { runTick, type TickOptions } from "../src/sim/engine.ts";
import { beginGovernorLevy, endGovernorLevy, governorId, syncGovernorSeats } from "../src/sim/governor.ts";
import { LIFECYCLE_DEFAULT, isRetired, nameAt, rosterName, rosterOffset } from "../src/sim/lifecycle.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { applyEvent, stateHash } from "../src/sim/state.ts";
import type { SimEvent } from "../src/sim/types.ts";

function run(seed: number, ticks: number, options: TickOptions = {}) {
  const world = createPrototypeWorld(seed); const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...runTick(world, options).events);
  return { world, events };
}

test("LIFECYCLE is off by default; off and explicit false match the 72-tick pins with no lifecycle field", () => {
  assert.equal(LIFECYCLE_DEFAULT, false);
  for (const [seed, pin] of [[1847, "7f76e474"], [2718, "976c40bd"], [4096, "08943ea5"]] as const) {
    const a = run(seed, 72); const b = run(seed, 72, { lifecycle: false });
    assert.equal(stateHash(a.world).slice(0, 8), pin);
    assert.equal(stateHash(b.world), stateHash(a.world));
    assert.ok(Object.values(a.world.characters).every((c) => c.lifecycle === undefined));
    assert.ok(!a.events.some((e) => e.type.startsWith("lifecycle-") || e.type.startsWith("character-retired") || e.type.startsWith("character-returned") || e.type.startsWith("character-promoted")));
  }
});

test("CLI flag: --lifecycle or LIFECYCLE=1 turns it on; otherwise off", () => {
  assert.equal(resolveLifecycle({}, {}), false);
  assert.equal(resolveLifecycle({ lifecycle: true }, {}), true);
  assert.equal(resolveLifecycle({}, { LIFECYCLE: "1" }), true);
});

test("Lead ruling 1: the promotion roster is offset by seed — same index, different worlds, different names; deterministic within a seed", () => {
  assert.notEqual(rosterOffset(1847), rosterOffset(2718));
  assert.equal(rosterOffset(1847), rosterOffset(1847));
  const a = createPrototypeWorld(1847); const b = createPrototypeWorld(2718); const c = createPrototypeWorld(1847);
  assert.equal(rosterName(a, 30), rosterName(c, 30));
  assert.notEqual(rosterName(a, 30), rosterName(b, 30));
  assert.equal(rosterName(a, 30), nameAt(30 + rosterOffset(1847)));
  assert.equal(rosterName(b, 30), nameAt(30 + rosterOffset(2718)));
  // Live promotions on two seeds must not always share the first name (ruling 1's purpose).
  const p1847 = run(1847, 1200, { lifecycle: true }).events.filter((e) => e.type === "character-promoted").map((e) => (e.data as any).character.name);
  const p2718 = run(2718, 1200, { lifecycle: true }).events.filter((e) => e.type === "character-promoted").map((e) => (e.data as any).character.name);
  assert.ok(p1847.length && p2718.length);
  assert.notEqual(p1847[0], p2718[0]);
});

test("Lead ruling 2: a returning governor competes for the seat — return does not auto-reclaim it", () => {
  const world = createPrototypeWorld(1847);
  syncGovernorSeats(world);
  const port = Object.values(world.settlements).find((s) => s.factionId === "world-government" && governorId(world, s.id))!;
  const govId = governorId(world, port.id)!;
  const gov = world.characters[govId];
  assert.ok(gov && !isRetired(gov));
  for (const c of Object.values(world.characters)) if (c.locationId === port.id && c.id !== govId) c.locationId = "glassport";
  applyEvent(world, { type: "character-retired", tick: world.tick, sequence: world.nextEventSequence, actorId: govId, settlementId: port.id, data: { cause: "power-loss: test", watchSince: 0, troops: 10, portsAtRetire: 2, office: port.id } } as SimEvent);
  assert.ok(isRetired(gov));
  syncGovernorSeats(world);
  // Freeze seats so governorId reads the stored map (no between-tick preview).
  beginGovernorLevy(world);
  assert.equal(governorId(world, port.id), null, "retired governor vacates");
  endGovernorLevy(world);
  const rival = Object.values(world.characters).find((c) => c.factionId === gov.factionId && c.id !== govId && !c.dead && c.controller.kind === "autonomous")!;
  rival.locationId = port.id; rival.travel = null; rival.captivity = null;
  rival.skills = { ...rival.skills, leadership: gov.skills.leadership + 50 };
  applyEvent(world, { type: "character-returned", tick: world.tick, sequence: world.nextEventSequence, actorId: govId, settlementId: port.id, data: { cause: "crisis: test", retiredTick: 0, troops: 10, factionPorts: 1 } } as SimEvent);
  assert.ok(!isRetired(gov));
  // Return itself never writes the seat map.
  beginGovernorLevy(world);
  assert.equal(governorId(world, port.id), null, "return does not auto-reclaim the seat");
  endGovernorLevy(world);
  gov.locationId = port.id;
  syncGovernorSeats(world);
  beginGovernorLevy(world);
  const after = governorId(world, port.id);
  endGovernorLevy(world);
  assert.equal(after, rival.id, "stronger rival wins the open competition");
  assert.notEqual(after, govId);
});

test("flag on: retirements and crisis returns carry causes; promotions split troops; recovery replays", () => {
  const { world, events } = run(4096, 1200, { lifecycle: true });
  const retires = events.filter((e) => e.type === "character-retired");
  const returns = events.filter((e) => e.type === "character-returned");
  const promos = events.filter((e) => e.type === "character-promoted");
  assert.ok(retires.every((e) => String(e.data.cause).startsWith("power-loss:")));
  assert.ok(returns.every((e) => String(e.data.cause).startsWith("crisis:")));
  for (const p of promos) {
    assert.ok(String(p.data.cause).startsWith("battle:"));
    assert.equal((p.data as any).split + (p.data as any).captainTroopsAfter, (p.data as any).split * 2 || (p.data as any).split + (p.data as any).captainTroopsAfter);
    assert.ok(/^[A-Z][a-z]+ [A-Z][a-z]+$/.test((p.data as any).character.name));
  }
  const directory = mkdtempSync(join(tmpdir(), "open-era-lifecycle-"));
  try {
    const store = new WorldStore(join(directory, "world.sqlite"));
    const w = createPrototypeWorld(4096); store.initialize(w);
    while (w.tick < 400) store.appendTick(runTick(w, { lifecycle: true }).events, w);
    assert.equal(stateHash(store.recover().state), stateHash(w));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
