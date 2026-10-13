import assert from "node:assert/strict";
import test from "node:test";
import { dashboardState, fullEventFeed } from "../src/dashboard/view-model.ts";
import { projectEvent } from "../src/dashboard/visibility.ts";
import { commandCapabilities, submitCommand } from "../src/sim/commands.ts";
import { runTick, runTicks } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { secessionDeclaredSentence } from "../src/dashboard/wording.ts";
import {
  buildSecessionDeclaration,
  secessionFollowerIds,
  SECESSION_FACTION_COLOR,
  SECESSION_FOUNDING_TAX_RATE,
} from "../src/sim/secession.ts";
import { applyEvent, commandHolderId, stateHash } from "../src/sim/state.ts";
import type { Character, WorldState } from "../src/sim/types.ts";

/**
 * Slice 2. The player command, the reducer, and `secession-declared`.
 * No autonomous caller. A headless run never queues the command.
 */

const PLAYER = "prototype-player";

function mara(world: WorldState): Character {
  return world.characters[world.players[PLAYER].characterId];
}

function ownCrownHarbor(world: WorldState): void {
  const harbor = world.settlements["crown-harbor"];
  const owner = mara(world);
  harbor.ownerId = owner.id;
  harbor.factionId = "world-government";
  owner.locationId = "crown-harbor";
  owner.travel = null;
  owner.captivity = null;
  owner.factionId = "world-government";
}

test("the boundary refuses a declaration that the owner gate does not pass", () => {
  const world = createPrototypeWorld(1847);
  const owner = mara(world);
  const notOwner = submitCommand(world, { playerId: PLAYER, type: "declare-secession", settlementId: "crown-harbor" });
  assert.equal(notOwner.ok, false);
  if (notOwner.ok) throw new Error("unreachable");
  assert.equal(notOwner.code, "not-owner");
  assert.match(notOwner.error, /owner/);

  const neutral = submitCommand(world, { playerId: PLAYER, type: "declare-secession", settlementId: "verdant-cay" });
  assert.equal(neutral.ok, false);
  if (neutral.ok) throw new Error("unreachable");
  assert.equal(neutral.code, "no-faction");

  const missing = submitCommand(world, { playerId: PLAYER, type: "declare-secession", settlementId: "no-such-port" });
  assert.equal(missing.ok, false);
  if (missing.ok) throw new Error("unreachable");
  assert.equal(missing.code, "unknown-settlement");

  const blank = submitCommand(world, { playerId: PLAYER, type: "declare-secession", settlementId: "crown-harbor", name: "  " });
  assert.equal(blank.ok, false);
  if (blank.ok) throw new Error("unreachable");
  assert.equal(blank.code, "invalid-name");

  ownCrownHarbor(world);
  owner.locationId = "glassport";
  const away = submitCommand(world, { playerId: PLAYER, type: "declare-secession", settlementId: "crown-harbor" });
  assert.equal(away.ok, false);
  if (away.ok) throw new Error("unreachable");
  assert.equal(away.code, "away");

  owner.locationId = "crown-harbor";
  owner.travel = { fromId: "crown-harbor", toId: "glassport", totalTicks: 4, remainingTicks: 2 };
  const atSea = submitCommand(world, { playerId: PLAYER, type: "declare-secession", settlementId: "crown-harbor" });
  assert.equal(atSea.ok, false);
  if (atSea.ok) throw new Error("unreachable");
  assert.equal(atSea.code, "at-sea");
  owner.travel = null;

  owner.factionId = "free-tide";
  const member = submitCommand(world, { playerId: PLAYER, type: "declare-secession", settlementId: "crown-harbor" });
  assert.equal(member.ok, false);
  if (member.ok) throw new Error("unreachable");
  assert.equal(member.code, "not-member");
  owner.factionId = "world-government";

  owner.controller = { kind: "autonomous" };
  const holder = submitCommand(world, { playerId: PLAYER, type: "declare-secession", settlementId: "crown-harbor" });
  assert.equal(holder.ok, false);
  if (holder.ok) throw new Error("unreachable");
  assert.equal(holder.code, "autonomous-holder");
  owner.controller = { kind: "human", playerId: PLAYER };

  owner.captivity = {
    captorFactionId: "free-tide",
    settlementId: "crown-harbor",
    capturedTick: 0,
    mandatoryReleaseTick: 84,
    cause: "major-defeat",
    displayedRisk: "high",
    scatteredTroops: { count: 1, experience: 0, discipline: 0 },
    releaseDestinationId: null,
  };
  const captive = submitCommand(world, { playerId: PLAYER, type: "declare-secession", settlementId: "crown-harbor" });
  assert.equal(captive.ok, false);
  if (captive.ok) throw new Error("unreachable");
  assert.equal(captive.code, "character-captive");
  assert.equal(world.pendingCommands.some((command) => command.type === "declare-secession"), false);
});

test("a declaration founds the faction from the event and does not draw", () => {
  const world = createPrototypeWorld(1847);
  ownCrownHarbor(world);
  const harbor = world.settlements["crown-harbor"];
  harbor.stability = 40;
  harbor.garrison = 11;
  harbor.stocks.provisions = 500;
  const owner = mara(world);
  const population = harbor.population;
  const beforeOrders = owner.standingOrders.length;
  world.factions["world-government"].actingCommanderId = "character-04";
  const pressedFollowers = secessionFollowerIds(world, harbor, true);
  assert.equal(pressedFollowers.includes("character-01"), false);
  assert.equal(pressedFollowers.includes("character-04"), false);

  const accepted = submitCommand(world, {
    playerId: PLAYER,
    type: "declare-secession",
    settlementId: "crown-harbor",
    name: "  Finn Frost  ",
  });
  assert.equal(accepted.ok, true);
  if (!accepted.ok) throw new Error("unreachable");
  assert.equal(accepted.command.type, "declare-secession");
  if (accepted.command.type !== "declare-secession") throw new Error("unreachable");
  assert.equal(accepted.command.name, "Finn Frost");

  const duplicate = submitCommand(world, { playerId: PLAYER, type: "declare-secession", settlementId: "crown-harbor" });
  assert.equal(duplicate.ok, false);
  if (duplicate.ok) throw new Error("unreachable");
  assert.equal(duplicate.code, "secession-already-queued");

  const tick = runTick(world);
  const declared = tick.events.find((event) => event.type === "secession-declared");
  assert.ok(declared);
  assert.equal(declared.actorId, owner.id);
  assert.equal(declared.targetId, "world-government");
  assert.equal(declared.settlementId, "crown-harbor");
  assert.equal(declared.data.previousFactionId, "world-government");
  assert.equal(declared.data.ownerId, owner.id);
  assert.deepEqual(declared.data.followerIds, [...declared.data.followerIds as string[]].sort());
  assert.equal((declared.data.followerIds as string[]).includes(owner.id), false);
  assert.equal((declared.data.followerIds as string[]).includes("character-04"), false);
  const upkeep = tick.events.find((event) =>
    (event.type === "settlement-upkeep" || event.type === "settlement-shortage") && event.settlementId === "crown-harbor"
  );
  assert.ok(upkeep);
  const upkeepGarrison = upkeep.data.garrison as number;
  assert.equal(declared.data.garrisonFollowed, upkeepGarrison > 0 && (upkeep.data.stability as number) <= 55);
  assert.equal(declared.data.garrison, declared.data.garrisonFollowed ? upkeepGarrison : 0);
  assert.equal(harbor.garrison, declared.data.garrison);
  assert.equal(harbor.stability, declared.data.stability);
  assert.equal(typeof declared.data.stability, "number");
  const faction = declared.data.faction as { id: string; name: string; color: string; treasury: number; taxRate: number; actingCommanderId?: string };
  assert.equal(faction.id, `secession-${owner.id}-crown-harbor-0`);
  assert.equal(faction.name, "Finn Frost");
  assert.equal(faction.color, SECESSION_FACTION_COLOR);
  assert.equal(faction.treasury, 0);
  assert.equal(faction.taxRate, SECESSION_FOUNDING_TAX_RATE);
  assert.equal(faction.actingCommanderId, undefined);
  assert.equal(declared.data.previousActingCommanderId, "character-04");
  const left = new Set([owner.id, ...(declared.data.followerIds as string[])]);
  if (left.has("character-04")) {
    assert.notEqual(declared.data.actingCommanderId, "character-04");
  } else {
    assert.equal(declared.data.actingCommanderId, "character-04");
  }

  const founded = world.factions[faction.id];
  assert.equal(founded.name, "Finn Frost");
  assert.equal(founded.taxRate, 0.08);
  assert.equal(founded.actingCommanderId, undefined);
  assert.equal(founded.taxRateSetTick, undefined);
  assert.equal(harbor.factionId, faction.id);
  assert.equal(harbor.ownerId, owner.id);
  assert.equal(harbor.garrison, declared.data.garrison);
  assert.equal(harbor.population, population);
  assert.equal(owner.factionId, faction.id);
  assert.equal(Object.prototype.hasOwnProperty.call(declared.data, "previousTreasury"), false);
  assert.equal(world.factions["world-government"].actingCommanderId, declared.data.actingCommanderId ?? undefined);
  assert.equal(owner.standingOrders.length, beforeOrders);
  assert.equal(world.version, 5);
  for (const followerId of declared.data.followerIds as string[]) {
    assert.equal(world.characters[followerId].factionId, faction.id);
  }

  const resolved = tick.events.find((event) => event.type === "player-command-resolved" && event.data.outcome === "secession-declared");
  assert.ok(resolved);
  const view = dashboardState(world, [], fullEventFeed([accepted.event, ...tick.events])) as {
    events: Array<{ type: string; summary: string; data: Record<string, unknown> | null; payloadWithheld: boolean }>;
    factions: Array<{ id: string; name: string; treasury: number | null; power: number | null; taxRate: number }>;
    capabilities: { commandTypes: string[] };
  };
  const queued = view.events.find((event) => event.type === "player-command-accepted");
  assert.match(queued?.summary ?? "", /Command queued for Mara Vane: declare Crown Harbor separate as Finn Frost/);
  const line = view.events.find((event) => event.type === "secession-declared");
  assert.equal(line?.summary, "Mara Vane declared Crown Harbor separate from World Government.");
  assert.equal(line?.payloadWithheld, false);
  assert.equal(line?.summary.includes("character-"), false);
  assert.equal(
    secessionDeclaredSentence(world, resolved, "Mara Vane"),
    "Mara Vane declared Crown Harbor separate from World Government.",
  );
  const row = view.factions.find((entry) => entry.id === faction.id);
  assert.ok(row);
  assert.equal(row.name, "Finn Frost");
  assert.equal(row.taxRate, 0.08);
  assert.equal(typeof row.treasury, "number");
  assert.equal(typeof row.power, "number");
  assert.ok(view.capabilities.commandTypes.includes("declare-secession"));

  const rival = world.characters["character-14"];
  const rivalView = projectEvent(world, rival, declared, secessionDeclaredSentence(world, declared, "Mara Vane"));
  assert.equal(rivalView.payloadWithheld, true);
  assert.equal(rivalView.data, null);
  assert.equal(rivalView.summary, "Mara Vane declared Crown Harbor separate from World Government.");
  const mate = Object.values(world.characters).find((character) => character.factionId === "world-government");
  assert.ok(mate);
  const mateView = projectEvent(world, mate, declared, secessionDeclaredSentence(world, declared, "Mara Vane"));
  assert.equal(mateView.payloadWithheld, false);
  assert.ok(mateView.data);
});

test("an omitted name uses the owner's, and an unpressed port stores garrison 0", () => {
  const world = createPrototypeWorld(1847);
  ownCrownHarbor(world);
  const harbor = world.settlements["crown-harbor"];
  harbor.stability = 80;
  harbor.garrison = 9;
  harbor.stocks.provisions = 500;
  world.factions["world-government"].taxRate = 0.14;
  const preview = buildSecessionDeclaration(world, harbor);
  assert.equal(preview.faction.name, mara(world).name);
  assert.equal(preview.garrisonFollowed, false);
  assert.equal(preview.garrison, 0);
  assert.equal(preview.previousActingCommanderId, null);
  assert.equal(preview.actingCommanderId, null);

  harbor.garrison = 0;
  harbor.stability = 40;
  const empty = buildSecessionDeclaration(world, harbor);
  assert.equal(empty.garrisonFollowed, false);
  assert.equal(empty.garrison, 0);

  const accepted = submitCommand(world, { playerId: PLAYER, type: "declare-secession", settlementId: "crown-harbor" });
  assert.equal(accepted.ok, true);
  runTick(world);
  assert.equal(harbor.garrison, 0);
  assert.equal(world.factions[`secession-${mara(world).id}-crown-harbor-0`].name, "Mara Vane");
});

test("a queued declaration fails when the owner is no longer the owner", () => {
  const world = createPrototypeWorld(1847);
  ownCrownHarbor(world);
  const accepted = submitCommand(world, { playerId: PLAYER, type: "declare-secession", settlementId: "crown-harbor" });
  assert.equal(accepted.ok, true);
  world.settlements["crown-harbor"].ownerId = "character-02";
  const tick = runTick(world);
  const failed = tick.events.find((event) => event.type === "player-command-failed");
  assert.ok(failed);
  assert.match(String(failed.data.reason), /owner/);
  assert.equal(tick.events.some((event) => event.type === "secession-declared"), false);
  assert.equal(world.settlements["crown-harbor"].factionId, "world-government");
});

test("the reducer replays the absolutes and does not re-test loyalty", () => {
  const world = createPrototypeWorld(1847);
  ownCrownHarbor(world);
  const harbor = world.settlements["crown-harbor"];
  harbor.stability = 40;
  harbor.garrison = 4;
  const accepted = submitCommand(world, { playerId: PLAYER, type: "declare-secession", settlementId: "crown-harbor", name: "Replay" });
  assert.equal(accepted.ok, true);
  if (!accepted.ok) throw new Error("unreachable");
  const tick = runTick(world);
  const declared = tick.events.find((event) => event.type === "secession-declared");
  assert.ok(declared);
  const followerIds = [...declared.data.followerIds as string[]];
  assert.ok(followerIds.length > 0);

  const replay = createPrototypeWorld(1847);
  ownCrownHarbor(replay);
  replay.settlements["crown-harbor"].stability = 40;
  replay.settlements["crown-harbor"].garrison = 4;
  for (const followerId of followerIds) replay.characters[followerId].personality.loyalty = 0.99;
  applyEvent(replay, accepted.event);
  for (const event of tick.events) applyEvent(replay, event);
  const factionId = (declared.data.faction as { id: string }).id;
  for (const followerId of followerIds) {
    assert.equal(replay.characters[followerId].factionId, factionId);
  }
  assert.equal(replay.settlements["crown-harbor"].garrison, declared.data.garrison);
  assert.equal(replay.factions[factionId].name, "Replay");
});

test("a headless run never emits secession-declared", () => {
  for (const seed of [1847, 2718, 4096]) {
    const world = createPrototypeWorld(seed);
    const { events } = runTicks(world, 72);
    assert.equal(events.some((event) => event.type === "secession-declared"), false);
    assert.equal(world.pendingCommands.some((command) => command.type === "declare-secession"), false);
  }
});

test("capabilities publish declare-secession", () => {
  const capabilities = commandCapabilities({ eventFeed: { limitMax: 500, limitDefault: 100 } });
  const types = capabilities.commandTypes as string[];
  assert.ok(types.includes("declare-secession"));
  const requests = capabilities.requests as { commands: { body: { settlementId: string; name: string; type: string } } };
  assert.match(requests.commands.body.settlementId, /declare-secession/);
  assert.match(requests.commands.body.name, /declare-secession/);
  assert.match(requests.commands.body.type, /declare-secession/);
  assert.equal(commandHolderId(createPrototypeWorld(1847), "world-government"), "character-01");
});
