import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runTick, type TickOptions } from "../src/sim/engine.ts";
import { OCCUPATION_DEFAULT, occupationDefectors, occupationTerms } from "../src/sim/occupation.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";
import type { SimEvent } from "../src/sim/types.ts";

function run(seed: number, ticks: number, options: TickOptions = {}) {
  const world = createPrototypeWorld(seed);
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...runTick(world, options).events);
  return { world, events };
}

test("OCCUPATION is off by default; off is byte-identical to the default and opt-out pins, with no occupation field anywhere", () => {
  assert.equal(OCCUPATION_DEFAULT, false);
  const pins = { 1847: ["7f76e474", "94de9c02", "66e8ccb7", "b51aa07a"], 2718: ["976c40bd", "7a3741c9", "b4ccedab", "091f7628"], 4096: ["08943ea5", "af6eeaea", "b04c5ac4", "25bdbf15"] } as const;
  for (const [seed, [d72, d1200, o72, o1200]] of Object.entries(pins)) {
    for (const [exileRecovery, t72, t1200] of [[true, d72, d1200], [false, o72, o1200]] as const) {
      const world = createPrototypeWorld(Number(seed)); const off: SimEvent[] = []; let h72 = "";
      for (let i = 0; i < 1200; i++) { off.push(...runTick(world, { exileRecovery, occupation: false }).events); if (world.tick === 72) h72 = stateHash(world).slice(0, 8); }
      assert.equal(h72, t72); assert.equal(stateHash(world).slice(0, 8), t1200);
      assert.ok(Object.values(world.settlements).every((s) => s.occupation === undefined));
      assert.ok(off.every((e) => e.type !== "occupation-integrated" && e.data.occupation === undefined && e.data.occupationDefectors === undefined && e.data.attackerFactionId === undefined));
    }
  }
});

test("flag on: claims open an occupation, upkeeps carry H, integration clears it, and recovery replays to the same hash", () => {
  const on = run(1847, 1200, { occupation: true });
  const claims = on.events.filter((e) => e.type === "settlement-claimed");
  assert.ok(claims.length > 0 && claims.every((e) => (e.data.occupation as { tick: number }).tick === e.tick));
  assert.ok(on.events.some((e) => e.type === "settlement-upkeep" && typeof (e.data.occupation as { harshness?: number } | undefined)?.harshness === "number"));
  assert.ok(on.events.some((e) => e.type === "occupation-integrated"));
  assert.notEqual(stateHash(on.world), stateHash(run(1847, 1200).world));
  const directory = mkdtempSync(join(tmpdir(), "open-era-occupation-"));
  try {
    const store = new WorldStore(join(directory, "world.sqlite"));
    const world = createPrototypeWorld(2718); store.initialize(world);
    while (world.tick < 400) store.appendTick(runTick(world, { occupation: true }).events, world);
    assert.equal(stateHash(store.recover().state), stateHash(world));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("acceptance 6: no resistance without a cause — at H = 0 no defector and no unrest drift", () => {
  const world = createPrototypeWorld(1847);
  const port = Object.values(world.settlements).find((s) => s.factionId)!;
  port.occupation = { tick: 0, fromFactionId: "free-tide", byFactionId: port.factionId, fromRate: world.factions[port.factionId!].taxRate, harshness: 0, lastShortageTick: null };
  for (const c of Object.values(world.characters)) if (c.factionId === "free-tide" && c.locationId === port.id) c.locationId = null;
  world.contracts = {};
  const terms = occupationTerms(world, port, port.occupation, false);
  assert.equal(terms.harshness, 0);
  assert.equal(occupationDefectors(port, "free-tide"), 0);
  // Over a flag-on run, every defection happened at H > 0, and every H = 0 upkeep has no drift term.
  const on = run(4096, 1200, { occupation: true });
  for (const e of on.events) {
    if (e.type === "battle-started" && e.data.occupationDefectors) assert.ok(Number(e.data.occupationDefectors) > 0);
  }
  // Defection helps only the previous faction (ruling 3).
  port.occupation.harshness = 1; port.garrison = 6;
  assert.equal(occupationDefectors(port, "free-tide"), 3);
  assert.equal(occupationDefectors(port, port.factionId), 0);
  assert.equal(occupationDefectors(port, null), 0);
});

test("the integration window equals the promise window", async () => {
  const { PROMISE_WINDOW_TICKS } = await import("../src/sim/secession.ts");
  const { OCCUPATION_INTEGRATION_TICKS } = await import("../src/sim/occupation.ts");
  assert.equal(OCCUPATION_INTEGRATION_TICKS, PROMISE_WINDOW_TICKS);
});
