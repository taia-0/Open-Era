import assert from "node:assert/strict";
import test from "node:test";
import { spendRole, resolveQuotedSpend } from "../src/sim/allowance.ts";
import { projectCharacter } from "../src/dashboard/visibility.ts";
import { PASSAGE_COST_PER_TICK, runTick, runTicks } from "../src/sim/engine.ts";
import { submitCommand } from "../src/sim/commands.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { applyEvent, stateHash } from "../src/sim/state.ts";
import type { Character, WorldState } from "../src/sim/types.ts";

const PLAYER = "prototype-player";

function control(world: WorldState, characterId: string): Character {
  const player = world.players[PLAYER];
  const previous = world.characters[player.characterId];
  if (previous.controller.kind === "human") previous.controller = { kind: "autonomous" };
  const character = world.characters[characterId];
  character.controller = { kind: "human", playerId: PLAYER };
  player.characterId = characterId;
  return character;
}

function arm(world: WorldState, character: Character): void {
  if (!character.locationId) {
    character.locationId = "crown-harbor";
    character.travel = null;
  }
  world.settlements[character.locationId].stocks.arms = 20;
}

test("a member draws the allowance, then the purse", () => {
  const world = createPrototypeWorld(1847);
  const bram = control(world, "character-02");
  assert.equal(bram.name, "Bram Quill");
  assert.equal(spendRole(world, bram), "member");
  assert.equal(bram.factionId, "world-government");
  arm(world, bram);
  bram.money = 12;
  delete bram.allowanceRemaining;
  const treasuryBefore = world.factions["world-government"].treasury;
  const purseBefore = bram.money;
  const submitted = submitCommand(world, { playerId: PLAYER, type: "character-action", action: "recruit" });
  assert.equal(submitted.ok, true);
  const before = JSON.parse(JSON.stringify(world)) as WorldState;
  const result = runTick(world);
  const recruited = result.events.find((event) => event.type === "recruited" && event.actorId === bram.id);
  assert.ok(recruited);
  assert.equal(recruited.data.cost, 24);
  assert.equal(recruited.data.treasuryDrawn, 18);
  assert.equal(recruited.data.purseDrawn, 6);
  assert.equal(recruited.data.allowanceRemaining, 0);
  assert.equal(recruited.data.characterMoney, 6);
  assert.equal(recruited.data.factionTreasury, treasuryBefore - 18);
  assert.equal(world.characters[bram.id].money, purseBefore - 6);
  assert.equal(world.characters[bram.id].allowanceRemaining, 0);
  // Later spends in the same tick move the treasury again. The event holds this draw.

  const replay = before;
  for (const event of result.events) applyEvent(replay, event);
  assert.equal(stateHash(replay), stateHash(world));
  assert.equal(replay.characters[bram.id].allowanceRemaining, 0);
  assert.equal(replay.characters[bram.id].money, purseBefore - 6);

  const row = projectCharacter(world, world.characters[bram.id], world.characters[bram.id]);
  assert.equal(row.allowanceCap, 18);
  assert.equal(row.allowanceRemaining, 0);
  assert.equal(row.allowanceRole, "member");
});

test("the free command holder draws the treasury without a cap", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  assert.equal(mara.name, "Mara Vane");
  assert.equal(spendRole(world, mara), "holder");
  arm(world, mara);
  mara.money = 0;
  const treasuryBefore = world.factions["world-government"].treasury;
  const submitted = submitCommand(world, { playerId: PLAYER, type: "character-action", action: "recruit" });
  assert.equal(submitted.ok, true, "a holder with an empty purse still recruits from the treasury");
  const result = runTick(world);
  const recruited = result.events.find((event) => event.type === "recruited" && event.actorId === mara.id);
  assert.ok(recruited);
  assert.equal(recruited.data.treasuryDrawn, 96);
  assert.equal(recruited.data.purseDrawn, 0);
  assert.equal(recruited.data.characterMoney, 0);
  assert.equal(recruited.data.factionTreasury, treasuryBefore - 96);
  assert.equal("allowanceRemaining" in recruited.data, false);
  assert.equal(world.characters[mara.id].money, 0);
  assert.equal("allowanceRemaining" in world.characters[mara.id], false);
  const row = projectCharacter(world, mara, mara);
  assert.equal(row.allowanceCap, null);
  assert.equal(row.allowanceRemaining, null);
  assert.equal(row.allowanceUncapped, true);
});

test("the acting commander stays on the allowance", () => {
  const world = createPrototypeWorld(1847);
  world.factions["world-government"].actingCommanderId = "character-02";
  const bram = control(world, "character-02");
  assert.equal(spendRole(world, bram), "member");
  arm(world, bram);
  bram.money = 12;
  const treasuryBefore = world.factions["world-government"].treasury;
  assert.equal(submitCommand(world, { playerId: PLAYER, type: "character-action", action: "recruit" }).ok, true);
  const result = runTick(world);
  const recruited = result.events.find((event) => event.type === "recruited" && event.actorId === bram.id);
  assert.ok(recruited);
  assert.equal(recruited.data.treasuryDrawn, 18);
  assert.equal(recruited.data.purseDrawn, 6);
  assert.equal(recruited.data.factionTreasury, treasuryBefore - 18);
  assert.equal(world.characters[bram.id].money, 6);
  assert.equal(world.characters[bram.id].allowanceRemaining, 0);
  const row = projectCharacter(world, world.characters["character-01"], world.characters[bram.id]);
  assert.equal(row.allowanceRole, "acting-commander");
  assert.equal(row.allowanceUncapped, false);
  assert.equal(row.allowanceCap, 18);
  assert.equal(row.allowanceRemaining, 0);
});

test("the daily reset drops unused allowance and does not carry it", () => {
  const world = createPrototypeWorld(1847);
  const bram = world.characters["character-02"];
  bram.controller = { kind: "human", playerId: PLAYER };
  world.characters["character-01"].controller = { kind: "autonomous" };
  world.players[PLAYER].characterId = bram.id;
  bram.travel = null;
  runTicks(world, 5);
  assert.equal(world.tick, 5);
  bram.allowanceRemaining = 4;
  runTick(world);
  assert.equal(world.tick, 6);
  assert.equal(bram.allowanceRemaining, undefined);

  arm(world, bram);
  bram.money = 12;
  const treasuryBefore = world.factions["world-government"].treasury;
  assert.equal(submitCommand(world, { playerId: PLAYER, type: "character-action", action: "recruit" }).ok, true);
  const recruitedTick = runTick(world);
  const recruited = recruitedTick.events.find((event) => event.type === "recruited" && event.actorId === bram.id);
  assert.ok(recruited);
  assert.equal(recruited.data.treasuryDrawn, 18);
  assert.equal(recruited.data.purseDrawn, 6);
  assert.equal(recruited.data.factionTreasury, treasuryBefore - 18);
  assert.equal(bram.money, 6);
  assert.equal(bram.allowanceRemaining, 0);
});

test("a short allowance plus purse reuses the short-purse refusal", () => {
  const world = createPrototypeWorld(1847);
  const bram = control(world, "character-02");
  arm(world, bram);
  bram.money = 5;
  delete bram.allowanceRemaining;
  const treasuryBefore = world.factions["world-government"].treasury;
  const refused = submitCommand(world, { playerId: PLAYER, type: "character-action", action: "recruit" });
  assert.equal(refused.ok, false);
  if (!refused.ok) {
    assert.equal(refused.code, "insufficient-money");
    assert.equal(refused.error, "Recruitment costs 30 money; the character holds 5");
  }
  assert.equal(world.factions["world-government"].treasury, treasuryBefore);
  assert.equal(bram.money, 5);
  assert.equal(resolveQuotedSpend(world, bram, 30, PASSAGE_COST_PER_TICK).ok, false);
});

test("a captive draws nothing", () => {
  const world = createPrototypeWorld(1847);
  const bram = control(world, "character-02");
  bram.captivity = {
    captorFactionId: "free-tide",
    settlementId: bram.locationId ?? "crown-harbor",
    capturedTick: 0,
    mandatoryReleaseTick: 84,
    cause: "major-defeat",
    displayedRisk: "low",
    scatteredTroops: { count: 0, experience: 0, discipline: 0 },
    releaseDestinationId: null,
  };
  const treasuryBefore = world.factions["world-government"].treasury;
  const refused = submitCommand(world, { playerId: PLAYER, type: "character-action", action: "recruit" });
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.code, "character-captive");
  assert.equal(spendRole(world, bram), "captive");
  assert.equal(resolveQuotedSpend(world, bram, 3, PASSAGE_COST_PER_TICK).ok, false);
  assert.equal(world.factions["world-government"].treasury, treasuryBefore);
});

test("a factionless character spends the purse only", () => {
  const world = createPrototypeWorld(1847);
  const unaffiliated = control(world, "character-23");
  assert.equal(unaffiliated.factionId, null);
  assert.equal(spendRole(world, unaffiliated), "factionless");
  arm(world, unaffiliated);
  unaffiliated.money = 48;
  assert.equal(submitCommand(world, { playerId: PLAYER, type: "character-action", action: "recruit" }).ok, true);
  const result = runTick(world);
  const recruited = result.events.find((event) => event.type === "recruited" && event.actorId === unaffiliated.id);
  assert.ok(recruited);
  assert.equal(recruited.data.cost, 48);
  assert.equal(recruited.data.treasuryDrawn, 0);
  assert.equal(recruited.data.purseDrawn, 48);
  assert.equal("factionTreasury" in recruited.data, false);
  assert.equal("allowanceRemaining" in recruited.data, false);
  assert.equal(recruited.data.characterMoney, 0);
  assert.equal(world.characters[unaffiliated.id].money, 0);
  assert.equal("allowanceRemaining" in world.characters[unaffiliated.id], false);
});

test("passage spends allowance first, then the purse, and replay keeps it", () => {
  const world = createPrototypeWorld(1847);
  const bram = world.characters["character-02"];
  bram.locationId = null;
  bram.travel = { fromId: "crown-harbor", toId: "glassport", totalTicks: 4, remainingTicks: 4 };
  bram.money = 1;
  bram.allowanceRemaining = 2;
  const treasuryBefore = world.factions["world-government"].treasury;
  const before = JSON.parse(JSON.stringify(world)) as WorldState;
  const result = runTick(world);
  const upkeep = result.events.find((event) => event.type === "character-upkeep" && event.actorId === bram.id);
  assert.ok(upkeep);
  assert.equal(upkeep.data.passageCost, 3);
  assert.equal(upkeep.data.treasuryDrawn, 2);
  assert.equal(upkeep.data.purseDrawn, 1);
  assert.equal(upkeep.data.allowanceRemaining, 0);
  assert.equal(upkeep.data.characterMoney, 0);
  assert.equal(world.characters[bram.id].money, 0);
  assert.equal(world.characters[bram.id].allowanceRemaining, 0);
  assert.equal(upkeep.data.factionTreasury, treasuryBefore - 2);

  const replay = before;
  for (const event of result.events) applyEvent(replay, event);
  assert.equal(stateHash(replay), stateHash(world));
});

test("contract escrow draws the allowance, then the purse", () => {
  const world = createPrototypeWorld(1847);
  const bram = control(world, "character-02");
  bram.money = 5;
  delete bram.allowanceRemaining;
  const treasuryBefore = world.factions["world-government"].treasury;
  const submitted = submitCommand(world, {
    playerId: PLAYER,
    type: "offer-contract",
    characterId: "character-03",
    quantity: 4,
    destinationId: "glassport",
    price: 20,
    expiresInTicks: 12,
  });
  assert.equal(submitted.ok, true);
  const result = runTick(world);
  const offered = result.events.find((event) => event.type === "contract-offered" && event.actorId === bram.id);
  assert.ok(offered);
  assert.equal(offered.data.treasuryDrawn, 18);
  assert.equal(offered.data.purseDrawn, 2);
  assert.equal(offered.data.buyerMoney, 3);
  assert.equal(offered.data.characterMoney, 3);
  assert.equal(offered.data.allowanceRemaining, 0);
  assert.equal(offered.data.factionTreasury, treasuryBefore - 18);
  assert.equal(world.characters[bram.id].money, 3);
  assert.equal(world.characters[bram.id].allowanceRemaining, 0);
});
