import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { HOME_CLAIM_HALF_LIFE_TICKS, homeClaim } from "../src/sim/exile.ts";
import { runTick, type TickOptions } from "../src/sim/engine.ts";
import { OWN_LOSS_COURIER_TICKS, ownLossCouriers } from "../src/sim/news.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";
import type { SimEvent, WorldState } from "../src/sim/types.ts";

const ON: TickOptions = { exileRecovery: true };
function run(seed: number, ticks: number, options: TickOptions = {}) {
  const world = createPrototypeWorld(seed);
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...runTick(world, options).events);
  return { world, events };
}
const courierEvents = (events: SimEvent[]) => events.filter((e) => e.type === "knowledge-updated" && e.data.reason === "faction courier: own port lost");

test("opt-out (exileRecovery: false): the pre-default 72-tick and 1,200-tick pins, no courier, no homeService", () => {
  const short = run(1847, 72, { exileRecovery: false });
  assert.equal(stateHash(short.world).slice(0, 8), "66e8ccb7");
  const long = run(1847, 1200, { exileRecovery: false });
  assert.equal(stateHash(long.world).slice(0, 8), "b51aa07a");
  assert.equal(courierEvents(long.events).length, 0);
  assert.ok(long.events.every((e) => e.data.homeService === undefined));
  assert.ok(Object.values(long.world.characters).every((c) => c.homeService === undefined));
});

test("step 1: a loss reaches the losing faction's members by courier exactly one day after the claim, once", () => {
  assert.equal(OWN_LOSS_COURIER_TICKS, 6);
  const { events } = run(2718, 400, { exileRecovery: "news-only" });
  const couriers = courierEvents(events);
  assert.ok(couriers.length > 0);
  const claims = events.filter((e) => e.type === "settlement-claimed");
  const seen = new Set<string>();
  for (const e of couriers) {
    const knowledge = e.data.knowledge as { observedTick: number; factionId: string | null; source: string };
    assert.equal(e.tick - knowledge.observedTick, OWN_LOSS_COURIER_TICKS);
    assert.equal(knowledge.source, "faction-report");
    const claim = claims.find((c) => c.tick === knowledge.observedTick && c.settlementId === e.settlementId);
    const seceded = events.find((c) => c.type === "secession-declared" && c.tick === knowledge.observedTick && c.settlementId === e.settlementId);
    assert.ok(claim || seceded);
    assert.equal(knowledge.factionId, claim ? claim.data.factionId : (seceded!.data.faction as { id: string }).id);
    const key = `${e.actorId}>${e.settlementId}>${knowledge.observedTick}`;
    assert.ok(!seen.has(key)); seen.add(key);
  }
  // news-only adds no claim term.
  assert.ok(events.every((e) => e.type !== "decision-made" || !String((e.data.chosen as { reason: string }).reason).includes("to win back")));
});

test("step 1: no courier before the delay, none to a captive, none when the belief is newer or already right", () => {
  const world = createPrototypeWorld(1847);
  const port = world.settlements["cinder-key"];
  const member = world.characters["character-15"];
  assert.equal(member.factionId, "free-tide");
  member.knowledge["cinder-key"] = { ...member.knowledge["cinder-key"], factionId: "free-tide", observedTick: 0 };
  world.tick = 10;
  port.factionId = "world-government";
  port.news = [{ item: { id: "news-1", type: "settlement-claimed", observedTick: 10, factionId: "world-government" }, aboutSettlementId: "cinder-key", stability: 30, followerIds: [], sequence: 1 }];
  const mine = (w: WorldState) => ownLossCouriers(w).filter((c) => c.characterId === member.id);
  assert.equal(mine(world).length, 0);
  world.tick = 16;
  assert.deepEqual(mine(world), [{ characterId: member.id, settlementId: "cinder-key", observedTick: 10, factionId: "world-government" }]);
  member.captivity = { captorFactionId: "world-government" } as never;
  assert.equal(mine(world).length, 0);
  member.captivity = null;
  member.knowledge["cinder-key"] = { ...member.knowledge["cinder-key"], observedTick: 12 };
  assert.equal(mine(world).length, 0);
  member.knowledge["cinder-key"] = { ...member.knowledge["cinder-key"], factionId: "world-government", observedTick: 0 };
  assert.equal(mine(world).length, 0);
});

test("ruling 4: a port lost to secession is couriered to the old faction one day later, with the new faction as holder", () => {
  let found = 0;
  for (const seed of [1847, 4096]) {
    const { events } = run(seed, 1200, { exileRecovery: "news-only" });
    for (const s of events.filter((e) => e.type === "secession-declared")) {
      const newFaction = (s.data.faction as { id: string }).id;
      const recorded = events.find((e) => e.type === "secession-loss-recorded" && e.tick === s.tick && e.settlementId === s.settlementId);
      assert.ok(recorded, "each secession is recorded on the port");
      assert.equal(recorded.data.factionId, newFaction);
      for (const c of courierEvents(events).filter((e) => e.settlementId === s.settlementId && (e.data.knowledge as { observedTick: number }).observedTick === s.tick)) {
        const k = c.data.knowledge as { factionId: string };
        // Never before the delay. A member who joins, is freed, or turns stale later is reached later.
        assert.ok(c.tick - s.tick >= OWN_LOSS_COURIER_TICKS);
        assert.equal(k.factionId, newFaction);
        if (c.tick - s.tick === OWN_LOSS_COURIER_TICKS) found++;
      }
    }
  }
  assert.ok(found > 0, "at least one secession courier on 1847/4096");
});

test("step 2: the home-port claim needs service, a lost port and positive traits; grievance scales it; it halves every 240 ticks", () => {
  const world = createPrototypeWorld(1847);
  const c = world.characters["character-15"];
  assert.equal(homeClaim(world, c, "cinder-key"), null);
  c.homeService = { "cinder-key": 100 };
  c.knowledge["cinder-key"] = { ...c.knowledge["cinder-key"], factionId: "free-tide" };
  world.tick = 100;
  assert.equal(homeClaim(world, c, "cinder-key"), null);
  c.knowledge["cinder-key"] = { ...c.knowledge["cinder-key"], factionId: "world-government" };
  c.personality = { ...c.personality, loyalty: 0.8, aggression: 0.5, ambition: 0.5, caution: 0.2 };
  const holder = "character-01";
  c.relationships[holder] = { ...(c.relationships[holder] ?? { trust: 0, respect: 0, obligation: 0 }), grievance: 0 } as never;
  world.settlements["cinder-key"].ownerId = null;
  const base = 0.5 * 0.8 + 0.3 * 0.5 + 0.2 * 0.5 - 0.3 * 0.2;
  assert.ok(Math.abs(homeClaim(world, c, "cinder-key")!.weight - base) < 1e-9);
  c.relationships[holder] = { ...c.relationships[holder], grievance: 0.5 };
  assert.ok(Math.abs(homeClaim(world, c, "cinder-key")!.weight - base * 1.5) < 1e-9);
  world.tick = 100 + HOME_CLAIM_HALF_LIFE_TICKS;
  assert.ok(Math.abs(homeClaim(world, c, "cinder-key")!.weight - base * 1.5 * 0.5) < 1e-9);
  c.personality = { ...c.personality, loyalty: 0, aggression: 0, ambition: 0, caution: 1 };
  assert.equal(homeClaim(world, c, "cinder-key"), null);
});

test("flag on: homeService is written only where the faction holds the port; claim reasons only from captains who served there", () => {
  const { events } = run(2718, 1200, ON);
  const served = new Map<string, Set<string>>();
  let claimRaids = 0; let claimTravel = 0;
  for (const e of events) {
    if (e.type !== "decision-made") continue;
    if (typeof e.data.homeService === "string") {
      assert.equal(e.data.homeService, e.settlementId);
      (served.get(e.actorId!) ?? served.set(e.actorId!, new Set()).get(e.actorId!)!).add(e.data.homeService);
    }
    for (const c of (e.data.candidates as Array<{ action: string; targetId?: string; reason: string }>)) {
      if (!c.reason.includes("to win back")) continue;
      assert.ok(served.get(e.actorId!)?.has(c.targetId!), `${e.actorId} claims ${c.targetId} without service`);
      if (c.action === "raid") claimRaids++; else if (c.action === "travel") claimTravel++;
      else assert.fail(`claim on ${c.action}`);
    }
  }
  assert.ok(claimRaids > 0 && claimTravel > 0);
});

test("acceptance: on 1847, 2718 and 4096 an exiled Free Tide captain raids a port they once held", () => {
  for (const seed of [1847, 2718, 4096]) {
    const world = createPrototypeWorld(seed);
    let homeRaids = 0;
    for (let i = 0; i < 1200 && homeRaids === 0; i++) {
      const portless = !Object.values(world.settlements).some((s) => s.factionId === "free-tide");
      for (const e of runTick(world, ON).events) {
        if (!portless || e.type !== "decision-made" || e.data.goal !== "raid") continue;
        const actor = world.characters[e.actorId!];
        if (actor.factionId === "free-tide" && actor.homeService?.[e.targetId!] !== undefined) homeRaids++;
      }
    }
    assert.ok(homeRaids > 0, `seed ${seed}`);
  }
});

test("flag on: WorldStore.recover mid-run matches the continuous run", () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-exile-"));
  try {
    const continuous = createPrototypeWorld(2718);
    for (let i = 0; i < 230; i++) runTick(continuous, ON);
    const store = new WorldStore(join(directory, "world.sqlite"));
    const split = createPrototypeWorld(2718);
    store.initialize(split);
    while (split.tick < 197) store.appendTick(runTick(split, ON).events, split);
    const recovered = store.recover();
    assert.ok(recovered.replayedEvents > 0);
    assert.equal(stateHash(recovered.state), stateHash(split));
    const world = recovered.state;
    while (world.tick < 230) store.appendTick(runTick(world, ON).events, world);
    assert.equal(stateHash(world), stateHash(continuous));
    store.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
