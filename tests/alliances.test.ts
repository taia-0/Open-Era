import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveAlliances } from "../src/cli/alliances-flag.ts";
import { ALLIANCES_DEFAULT, ALLIANCE_COOLDOWN, ALLIANCE_NEAR, ALLIANCE_RAID_WINDOW, allied, applyJoinerLosses, shareSideLosses, type Alliance, type AllyJoiner } from "../src/sim/alliances.ts";
import { runTick, type TickOptions } from "../src/sim/engine.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";
import type { SimEvent } from "../src/sim/types.ts";

function run(seed: number, ticks: number, options: TickOptions = {}) {
  const world = createPrototypeWorld(seed); const events: SimEvent[] = [];
  // Serialized at capture: event payloads can hold live references that later ticks mutate.
  for (let i = 0; i < ticks; i++) events.push(...runTick(world, options).events.map((e) => JSON.parse(JSON.stringify(e)) as SimEvent));
  return { world, events };
}

test("ALLIANCES is off by default; off and explicit false are byte-identical to the 72-tick pins with no alliance state", () => {
  assert.equal(ALLIANCES_DEFAULT, false);
  assert.deepEqual([ALLIANCE_NEAR, ALLIANCE_RAID_WINDOW, ALLIANCE_COOLDOWN], [30, 152, 240]);
  for (const [seed, pin] of [[1847, "7f76e474"], [2718, "976c40bd"], [4096, "08943ea5"]] as const) {
    const a = run(seed, 72); const b = run(seed, 72, { alliances: false });
    assert.equal(stateHash(a.world).slice(0, 8), pin);
    assert.equal(stateHash(b.world), stateHash(a.world));
    assert.ok(a.world.alliances === undefined && a.world.allianceMemory === undefined && a.world.allianceRaids === undefined);
    assert.ok(!a.events.some((e) => e.type.startsWith("alliance-")));
  }
});

test("CLI flag: --alliances or ALLIANCES=1 turns it on; otherwise off", () => {
  assert.equal(resolveAlliances({}, {}), false);
  assert.equal(resolveAlliances({ alliances: true }, {}), true);
  assert.equal(resolveAlliances({}, { ALLIANCES: "1" }), true);
});

test("Lead ruling: with no joiners a side's losses are exactly today's formula", () => {
  for (const [own, rate] of [[40, 0.21], [3, 0.05], [0, 0.3], [120, 0.48]] as const) {
    assert.equal(shareSideLosses(own, 50, rate, []).principal, Math.min(own, Math.max(1, Math.round(own * rate))));
  }
});

test("Lead ruling: joiners take losses pro-rata to their share of the side's power (no free help)", () => {
  const joiners: AllyJoiner[] = [{ id: "a", side: "attacker", at: "p", power: 30, troops: 40 }, { id: "b", side: "attacker", at: "p", power: 10, troops: 20 }];
  const split = shareSideLosses(60, 60, 0.2, joiners);
  const sideLoss = Math.round((60 + 40 + 20) * 0.2); // 24
  assert.equal(split.principal, Math.round(sideLoss * 60 / 100));
  assert.deepEqual(split.joiners, [Math.round(sideLoss * 30 / 100), Math.round(sideLoss * 10 / 100)]);
  assert.ok(split.joiners.every((l) => l > 0));
  // Never more than a joiner has.
  assert.deepEqual(shareSideLosses(1, 1, 1, [{ id: "c", side: "defender", at: "p", power: 99, troops: 2 }]).joiners, [2]);
});

test("joiner losses are applied to the joiner's troops from the battle event", () => {
  const world = createPrototypeWorld(1847);
  const c = Object.values(world.characters).find((x) => x.troops.count > 5)!;
  const before = c.troops.count;
  applyJoinerLosses(world, { type: "battle-phase-resolved", tick: 1, sequence: 0, data: { allyJoiners: [{ id: c.id, side: "defender", at: "x", power: 1, troops: before, losses: 3 }] } } as unknown as SimEvent);
  assert.equal(world.characters[c.id].troops.count, before - 3);
});

test("flag on (4096): pacts form with a cause per side, joined rounds carry pro-rata joiner losses", () => {
  const { world, events } = run(4096, 1200, { alliances: true });
  const forms = events.filter((e) => e.type === "alliance-formed");
  assert.ok(forms.length > 0);
  for (const f of forms) { const a = f.data.alliance as Alliance; assert.ok(a.factionIds.every((id) => /^(raided|near|landless): /.test(a.causes[id]))); }
  const joined = events.filter((e) => (e.type === "battle-resolved" || e.type === "battle-phase-resolved") && e.data.allyJoiners);
  assert.ok(joined.length > 0);
  const js = joined.flatMap((e) => e.data.allyJoiners as AllyJoiner[]);
  assert.ok(js.every((j) => typeof j.losses === "number" && j.losses >= 0 && j.losses <= j.troops));
  assert.ok(js.reduce((a, j) => a + j.losses!, 0) > 0, "joiners take losses");
  assert.ok(world.allianceRaids !== undefined);
});

test("no raid or claim between allies while allied (1847, 4096 flag on)", () => {
  for (const seed of [1847, 4096]) {
    const world = createPrototypeWorld(seed);
    for (let i = 0; i < 1200; i++) for (const e of runTick(world, { alliances: true }).events) {
      const atk = e.actorId ? world.characters[e.actorId]?.factionId : null;
      if (e.type === "battle-started" || (e.type === "battle-resolved" && !e.data.battleId)) assert.ok(!allied(world, atk, e.targetId), `raid between allies at t${e.tick}`);
    }
  }
});

test("flag on: recovery from the store replays to the same hash", () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-alliances-"));
  try {
    const store = new WorldStore(join(directory, "world.sqlite"));
    const world = createPrototypeWorld(4096); store.initialize(world);
    while (world.tick < 800) store.appendTick(runTick(world, { alliances: true }).events, world);
    assert.ok(world.allianceRaids !== undefined && world.allianceMemory !== undefined);
    assert.equal(stateHash(store.recover().state), stateHash(world));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
