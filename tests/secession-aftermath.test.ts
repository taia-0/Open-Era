import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveSecessionAftermath } from "../src/cli/secession-aftermath-flag.ts";
import { submitCommand } from "../src/sim/commands.ts";
import { runTick } from "../src/sim/engine.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { applyEvent, commandHolderId, distanceBetween, stateHash } from "../src/sim/state.ts";
import {
  AFTERMATH_WINDOW,
  PATRON_NEAR,
  PEACE_GRIEVANCE,
  SECESSION_AFTERMATH_DEFAULT,
  aftermathStep,
  atPeace,
  earnedGrievance,
  factionSurplus,
  portDistance,
} from "../src/sim/secession-aftermath.ts";
import { ALLIANCE_NEAR } from "../src/sim/alliances.ts";
import { HATED_GRIEVANCE } from "../src/sim/secession.ts";
import type { Relationship, SimEvent, WorldState } from "../src/sim/types.ts";

function run(seed: number, ticks: number, options: { secessionAftermath?: boolean; exileRecovery?: boolean } = {}) {
  const world = createPrototypeWorld(seed);
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...runTick(world, options).events);
  return { world, events };
}

function applyDraft(world: WorldState, draft: { type: string; data: Record<string, unknown>; settlementId?: string; actorId?: string; targetId?: string }): SimEvent {
  const event = { sequence: world.nextEventSequence, tick: world.tick, ...draft } as SimEvent;
  applyEvent(world, event);
  return event;
}

function step(world: WorldState): SimEvent[] {
  const events: SimEvent[] = [];
  aftermathStep(world, [], (draft) => {
    const event = { sequence: world.nextEventSequence, tick: world.tick, ...draft } as SimEvent;
    applyEvent(world, event);
    events.push(event);
  });
  return events;
}

/** A seceded Glassport, age measured from tick 0, old faction World Government. Free Tide still holds Cinder Key. */
function secededGlassport(world: WorldState, ownerId = "character-02") {
  applyDraft(world, { type: "aftermath-ledger-opened", data: {} });
  applyDraft(world, { type: "alliance-ledger-opened", data: {} });
  const owner = world.characters[ownerId];
  world.factions["sec-s"] = { id: "sec-s", name: "Free Glassport", color: "#ddd", treasury: 0, taxRate: 0.1, founderId: ownerId };
  owner.factionId = "sec-s";
  delete owner.dead;
  world.settlements.glassport.factionId = "sec-s";
  world.settlements.glassport.ownerId = ownerId;
  applyDraft(world, {
    type: "aftermath-watch",
    settlementId: "glassport",
    data: { record: { factionId: "sec-s", settlementId: "glassport", oldFactionId: "world-government", ownerId, declaredTick: 0 } },
  });
  return owner;
}

function relation(holderId: string, grievance: number): Relationship {
  return { characterId: holderId, trust: 0, affinity: 0, respect: 0, fear: 0, grievance, obligation: 0, lastChangedTick: 0 };
}

function addPatron(world: WorldState) {
  world.factions["patron-a"] = { id: "patron-a", name: "Patron", color: "#abc", treasury: 5000, taxRate: 0.05 };
  const mate = world.characters["character-23"];
  mate.factionId = "patron-a";
  delete mate.dead;
  world.settlements["verdant-cay"].factionId = "patron-a";
  world.settlements["verdant-cay"].ownerId = mate.id;
}

test("SECESSION_AFTERMATH is off by default; off, explicit false, and the exile opt-out match the pins with no aftermath state", () => {
  assert.equal(SECESSION_AFTERMATH_DEFAULT, false);
  assert.equal(AFTERMATH_WINDOW, 67);
  assert.equal(PATRON_NEAR, 43.829);
  assert.equal(PEACE_GRIEVANCE, 0.12);
  assert.equal(PEACE_GRIEVANCE, HATED_GRIEVANCE);
  const pins = [[1847, "7f76e474"], [2718, "976c40bd"], [4096, "08943ea5"]] as const;
  const optOut = [[1847, "66e8ccb7"], [2718, "b4ccedab"], [4096, "b04c5ac4"]] as const;
  for (const [seed, pin] of pins) {
    const omitted = run(seed, 72);
    const explicit = run(seed, 72, { secessionAftermath: false });
    assert.equal(stateHash(omitted.world).slice(0, 8), pin);
    assert.equal(stateHash(explicit.world), stateHash(omitted.world));
    assert.equal(omitted.world.secessionAftermath, undefined);
    assert.equal(omitted.world.allianceRaids, undefined);
    assert.ok(!omitted.events.some((event) => event.type.startsWith("aftermath-") || event.type.startsWith("faction-peace") || event.type === "secession-joined"));
  }
  for (const [seed, pin] of optOut) {
    const world = run(seed, 72, { exileRecovery: false }).world;
    assert.equal(stateHash(world).slice(0, 8), pin);
    assert.equal(world.secessionAftermath, undefined);
  }
});

test("CLI flag: --secession-aftermath or SECESSION_AFTERMATH=1 turns it on; otherwise off", () => {
  assert.equal(resolveSecessionAftermath({}, {}), false);
  assert.equal(resolveSecessionAftermath({ "secession-aftermath": true }, {}), true);
  assert.equal(resolveSecessionAftermath({}, { SECESSION_AFTERMATH: "1" }), true);
  assert.equal(resolveSecessionAftermath({}, { SECESSION_AFTERMATH: "0" }), false);
});

test("patron radius includes Crown Harbor–Glassport; the threat's near test does not", () => {
  const world = createPrototypeWorld(1847);
  assert.equal(portDistance(world, "crown-harbor", "glassport"), 43.829);
  assert.equal(portDistance(world, "crown-harbor", "glassport") <= PATRON_NEAR, true);
  assert.equal(portDistance(world, "cinder-key", "verdant-cay") <= PATRON_NEAR, false);
  // Threat distance is the raw alliance radius, not the patron radius.
  assert.equal(distanceBetween(world, "crown-harbor", "glassport") <= ALLIANCE_NEAR, false);
  assert.equal(distanceBetween(world, "cinder-key", "glassport") <= ALLIANCE_NEAR, true);
});

test("ruling 2: age 66 does not fire; age 67 peaces when the causes already hold", () => {
  const early = createPrototypeWorld(1847);
  secededGlassport(early);
  early.tick = 66;
  assert.deepEqual(step(early).map((event) => event.type), []);
  const due = createPrototypeWorld(1847);
  secededGlassport(due);
  due.tick = AFTERMATH_WINDOW;
  const events = step(due);
  const peace = events.find((event) => event.type === "faction-peace");
  assert.ok(peace, events.map((event) => event.type).join(","));
  assert.equal(peace.data.age, 67);
  assert.ok((peace.data.grievance as number) < PEACE_GRIEVANCE);
  assert.deepEqual((peace.data.peace as { factionIds: string[] }).factionIds, ["sec-s", "world-government"]);
  assert.equal(due.secessionAftermath?.records[0].peaceTick, 67);
  assert.equal(atPeace(due, "sec-s", "world-government"), true);
  assert.equal(atPeace(due, "sec-s", "free-tide"), false);
});

test("ruling 3: a broken peace does not peace again, and join can still fire", () => {
  const world = createPrototypeWorld(1847);
  secededGlassport(world);
  world.tick = 67;
  assert.equal(step(world).some((event) => event.type === "faction-peace"), true);
  // The old faction's raid is the threat, which would otherwise let Free Tide patron a join in the same step.
  world.factions["free-tide"].treasury = 0;
  world.tick = 68;
  world.allianceRaids = { "world-government>sec-s": 68 };
  const broken = step(world);
  const brk = broken.find((event) => event.type === "faction-peace-broken");
  assert.ok(brk);
  assert.equal(broken.some((event) => event.type === "faction-peace" || event.type === "secession-joined"), false);
  assert.equal((brk.data.evidence as { raiderFactionId: string }).raiderFactionId, "world-government");
  assert.equal(brk.data.reason, "raid");
  assert.equal(world.secessionAftermath?.records[0].peaceTick, 67);
  assert.equal(world.secessionAftermath?.peace.length, 0);
  world.allianceRaids = {};
  world.tick = 69;
  const again = step(world);
  assert.equal(again.some((event) => event.type === "faction-peace"), false, "a break does not allow a second peace");
  addPatron(world);
  world.factions["sec-s"].treasury = 0;
  assert.ok(factionSurplus(world, "sec-s") < 0);
  assert.ok(factionSurplus(world, "patron-a") >= 0);
  world.settlements.glassport.occupation = { tick: 1, fromFactionId: "world-government", byFactionId: "sec-s", fromRate: 0.1, harshness: 0, lastShortageTick: null, foodBaseline: 1 };
  const joined = step(world);
  assert.equal(joined.some((event) => event.type === "faction-peace"), false);
  const join = joined.find((event) => event.type === "secession-joined");
  assert.ok(join, joined.map((event) => event.type).join(",") || "no join");
  assert.equal(join.data.joinedFactionId, "patron-a");
  assert.equal(world.characters["character-02"].factionId, "patron-a");
  assert.equal(world.settlements.glassport.factionId, "patron-a");
  assert.equal(world.settlements.glassport.occupation, undefined);
  assert.equal(world.factions["sec-s"].treasury, 0);
  assert.equal(world.secessionAftermath?.records[0].joinedTick, 69);
  world.tick = 70;
  assert.equal(step(world).some((event) => event.type === "secession-joined" || event.type === "faction-peace"), false);
});

test("ruling 3: protection fires once, at the window, and a second protection does not", () => {
  const world = createPrototypeWorld(1847);
  const owner = secededGlassport(world);
  const holder = commandHolderId(world, "world-government");
  assert.ok(holder);
  owner.relationships[holder] = relation(holder, 1);
  assert.ok(earnedGrievance(world, owner.id, "world-government") >= PEACE_GRIEVANCE);
  world.factions["sec-s"].treasury = 100_000;
  addPatron(world);
  world.tick = 67;
  const first = step(world);
  assert.equal(first.some((event) => event.type === "faction-peace"), false);
  const formed = first.find((event) => event.type === "alliance-formed" && event.data.aftermath === "protection");
  assert.ok(formed);
  assert.equal((formed.data.alliance as { id: string }).id, "protection-67-sec-s-patron-a");
  assert.ok((formed.data.ownSurplus as number) >= 0);
  assert.ok((formed.data.patron as { surplus: number }).surplus >= 0);
  assert.equal(world.secessionAftermath?.records[0].protectionTick, 67);
  world.alliances = [];
  world.tick = 80;
  const second = step(world);
  assert.equal(second.some((event) => event.type === "alliance-formed"), false);
  assert.equal(second.some((event) => event.type === "secession-joined"), false);
});

test("ruling 1: peace blocks an autonomous raid and does not block a player raid, which breaks the peace", () => {
  const raiderId = "character-14";
  function prepare(peace: boolean) {
    const world = createPrototypeWorld(1847);
    const raider = world.characters[raiderId];
    raider.troops.count = 80;
    raider.personality = { ...raider.personality, aggression: 1, ambition: 1, caution: 0, curiosity: 0, commerce: 0, loyalty: 0 };
    raider.cargo = { provisions: 0, arms: 0, medicine: 0, shipMaterials: 0 };
    raider.money = 400;
    raider.health = 100;
    raider.morale = 100;
    raider.lastBattleTick = -100;
    world.settlements["crown-harbor"].garrison = 15;
    world.settlements["crown-harbor"].fortification = 1;
    for (const character of Object.values(world.characters)) if (character.id !== raiderId) character.lastBattleTick = 0;
    if (peace) {
      applyDraft(world, { type: "aftermath-ledger-opened", data: {} });
      applyDraft(world, {
        type: "faction-peace",
        data: { peace: { factionIds: ["free-tide", "world-government"], tick: -1, cause: "test" }, grievance: 0, lastOldRaid: null, age: 67 },
      });
    }
    return world;
  }
  const open = runTick(prepare(false), { secessionAftermath: true });
  const openDecision = open.events.find((event) => event.type === "decision-made" && event.actorId === raiderId);
  assert.equal((openDecision?.data.chosen as { action?: string } | undefined)?.action, "raid");
  const closed = runTick(prepare(true), { secessionAftermath: true });
  const closedDecision = closed.events.find((event) => event.type === "decision-made" && event.actorId === raiderId);
  const candidates = (closedDecision?.data.candidates as { action: string }[] | undefined) ?? [];
  assert.notEqual((closedDecision?.data.chosen as { action?: string } | undefined)?.action, "raid");
  assert.ok(!candidates.some((candidate) => candidate.action === "raid"));
  assert.ok(!closed.events.some((event) => (event.type === "battle-started" || event.type === "battle-resolved") && event.actorId === raiderId));

  const world = createPrototypeWorld(1847);
  applyDraft(world, { type: "alliance-ledger-opened", data: {} });
  applyDraft(world, { type: "aftermath-ledger-opened", data: {} });
  applyDraft(world, {
    type: "faction-peace",
    data: { peace: { factionIds: ["world-government", "free-tide"], tick: -1, cause: "test" }, grievance: 0, lastOldRaid: null, age: 67 },
  });
  const commander = world.characters[world.players["prototype-player"].characterId];
  commander.locationId = "cinder-key";
  commander.travel = null;
  commander.troops.count = 80;
  world.settlements["cinder-key"].garrison = 1;
  world.settlements["cinder-key"].stability = 20;
  for (const character of Object.values(world.characters)) if (character.id !== commander.id) character.lastBattleTick = 0;
  const submission = submitCommand(world, { playerId: "prototype-player", type: "character-action", action: "raid" });
  assert.equal(submission.ok, true);
  const played = runTick(world, { secessionAftermath: true });
  assert.ok(played.events.some((event) => (event.type === "battle-started" || event.type === "battle-resolved") && event.actorId === commander.id));
  const brk = played.events.find((event) => event.type === "faction-peace-broken");
  assert.ok(brk);
  assert.deepEqual(brk.data.evidence, { raiderFactionId: "world-government", targetFactionId: "free-tide", raidTick: 0 });
  assert.equal(atPeace(world, "world-government", "free-tide"), false);
});

test("flag on: recovery from the store replays to the same hash", () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-aftermath-"));
  try {
    const store = new WorldStore(join(directory, "world.sqlite"));
    const world = createPrototypeWorld(4096);
    store.initialize(world);
    while (world.tick < 200) store.appendTick(runTick(world, { secessionAftermath: true }).events, world);
    assert.ok(world.secessionAftermath);
    assert.ok(world.allianceRaids);
    assert.equal(stateHash(store.recover().state), stateHash(world));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
