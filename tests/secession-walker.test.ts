import assert from "node:assert/strict";
import test from "node:test";
import { submitCommand } from "../src/sim/commands.ts";
import { runTick, runTicks } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { autonomousSecessionReady } from "../src/sim/secession.ts";
import { applyEvent, commandHolderId } from "../src/sim/state.ts";
import type { Character, WorldState } from "../src/sim/types.ts";

/**
 * Slice 3. The autonomous rule in section 6.
 * After upkeep and player commands, before battles. No draw.
 * A headless run on the scenario rates emits nothing.
 */

const PLAYER = "prototype-player";

function wgMember(world: WorldState, exceptId?: string): Character {
  const member = Object.values(world.characters).find((character) =>
    character.factionId === "world-government" &&
    character.controller.kind === "autonomous" &&
    character.id !== exceptId
  );
  if (!member) throw new Error("unreachable");
  return member;
}

function seat(world: WorldState, settlementId: string, owner: Character, stability: number, taxRate: number): void {
  const settlement = world.settlements[settlementId];
  settlement.ownerId = owner.id;
  settlement.factionId = "world-government";
  settlement.stability = stability;
  settlement.garrison = 6;
  settlement.stocks.provisions = 500;
  owner.factionId = "world-government";
  owner.locationId = settlementId;
  owner.travel = null;
  owner.captivity = null;
  owner.controller = { kind: "autonomous" };
  world.factions["world-government"].taxRate = taxRate;
}

test("a headless run and a live session emit no secession on the scenario rates", () => {
  for (const seed of [1847, 2718, 4096]) {
    for (const liveSession of [false, true]) {
      const world = createPrototypeWorld(seed);
      const { events } = runTicks(world, 72, { liveSession });
      assert.equal(events.some((event) => event.type === "secession-declared"), false);
    }
  }
});

test("an autonomous owner declares once when the rate is above 0.15 and stability is at or below 55", () => {
  const world = createPrototypeWorld(1847);
  const owner = wgMember(world);
  seat(world, "crown-harbor", owner, 55, 0.16);
  assert.equal(commandHolderId(world, "world-government") === owner.id, false);
  assert.equal(autonomousSecessionReady(world, world.settlements["crown-harbor"], false), true);
  const beforeRng = world.rngState;
  const tick = runTick(world);
  const declared = tick.events.filter((event) => event.type === "secession-declared");
  assert.equal(declared.length, 1);
  assert.equal(declared[0].actorId, owner.id);
  assert.equal(declared[0].targetId, "world-government");
  assert.equal(declared[0].settlementId, "crown-harbor");
  assert.equal(Object.prototype.hasOwnProperty.call(declared[0].data, "commandId"), false);
  assert.equal(declared[0].data.successorId, null);
  assert.equal(declared[0].data.ownerId, owner.id);
  assert.equal(world.settlements["crown-harbor"].secessionDeclaredBy, owner.id);
  assert.equal(world.settlements["crown-harbor"].factionId, (declared[0].data.faction as { id: string }).id);
  assert.equal(tick.events.some((event) => event.type === "player-command-resolved"), false);
  assert.notEqual(world.rngState, beforeRng);
  const again = runTick(world);
  assert.equal(again.events.some((event) => event.type === "secession-declared"), false);
  assert.equal(autonomousSecessionReady(world, world.settlements["crown-harbor"], true), false);
});

test("the tax line at 0.15 and a stability above 55 do not declare", () => {
  const closed = createPrototypeWorld(1847);
  const owner = wgMember(closed);
  seat(closed, "crown-harbor", owner, 55, 0.15);
  assert.equal(autonomousSecessionReady(closed, closed.settlements["crown-harbor"]), false);
  assert.equal(runTick(closed).events.some((event) => event.type === "secession-declared"), false);

  const high = createPrototypeWorld(1847);
  const other = wgMember(high);
  seat(high, "crown-harbor", other, 55.01, 0.2);
  assert.equal(autonomousSecessionReady(high, high.settlements["crown-harbor"]), false);
  assert.equal(runTick(high).events.some((event) => event.type === "secession-declared"), false);
});

test("a human owner is not auto-declared in a live session or a headless run", () => {
  for (const liveSession of [false, true]) {
    const world = createPrototypeWorld(1847);
    const owner = wgMember(world);
    seat(world, "crown-harbor", owner, 40, 0.2);
    owner.controller = { kind: "human", playerId: PLAYER };
    assert.equal(autonomousSecessionReady(world, world.settlements["crown-harbor"], liveSession), false);
    const tick = runTick(world, { liveSession });
    assert.equal(tick.events.some((event) => event.type === "secession-declared"), false);
  }
});

test("an autonomous command holder does not declare", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters[world.players[PLAYER].characterId];
  seat(world, "crown-harbor", mara, 40, 0.2);
  assert.equal(commandHolderId(world, "world-government"), mara.id);
  assert.equal(autonomousSecessionReady(world, world.settlements["crown-harbor"], false), false);
  assert.equal(runTick(world).events.some((event) => event.type === "secession-declared"), false);
});

test("qualifying ports declare in id order, and a claim starts a new spell", () => {
  const world = createPrototypeWorld(1847);
  const first = wgMember(world);
  const second = wgMember(world, first.id);
  seat(world, "glassport", first, 50, 0.16);
  seat(world, "crown-harbor", second, 50, 0.16);
  const tick = runTick(world);
  const declared = tick.events.filter((event) => event.type === "secession-declared");
  assert.deepEqual(declared.map((event) => event.settlementId), ["crown-harbor", "glassport"]);
  assert.equal(world.settlements["crown-harbor"].secessionDeclaredBy, second.id);

  const next = wgMember(world, first.id);
  if (next.id === second.id) throw new Error("unreachable");
  next.factionId = "world-government";
  next.locationId = "crown-harbor";
  next.travel = null;
  next.captivity = null;
  next.controller = { kind: "autonomous" };
  const previousFactionId = world.settlements["crown-harbor"].factionId ?? "world-government";
  applyEvent(world, {
    sequence: world.nextEventSequence,
    tick: world.tick,
    type: "settlement-claimed",
    actorId: next.id,
    settlementId: "crown-harbor",
    targetId: previousFactionId,
    data: {
      ownerId: next.id,
      factionId: "world-government",
      stability: 50,
      previousFactionId,
      previousOwnerId: second.id,
      garrison: 6,
      basis: "accepted-surrender",
    },
  });
  assert.equal(world.settlements["crown-harbor"].secessionDeclaredBy, undefined);
  assert.equal(world.settlements["crown-harbor"].ownerId, next.id);
  world.settlements["crown-harbor"].stability = 50;
  world.settlements["crown-harbor"].stocks.provisions = 500;
  world.factions["world-government"].taxRate = 0.16;
  const follow = runTick(world);
  const again = follow.events.filter((event) => event.type === "secession-declared" && event.settlementId === "crown-harbor");
  assert.equal(again.length, 1);
  assert.equal(again[0].actorId, next.id);
});

test("a player declaration records the spell, so the walker does not repeat it", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters[world.players[PLAYER].characterId];
  const harbor = world.settlements["crown-harbor"];
  harbor.ownerId = mara.id;
  harbor.factionId = "world-government";
  harbor.stability = 40;
  mara.locationId = "crown-harbor";
  mara.travel = null;
  mara.captivity = null;
  const accepted = submitCommand(world, { playerId: PLAYER, type: "declare-secession", settlementId: "crown-harbor" });
  assert.equal(accepted.ok, true);
  runTick(world);
  assert.equal(harbor.secessionDeclaredBy, mara.id);
  assert.equal(autonomousSecessionReady(world, harbor, true), false);
});
