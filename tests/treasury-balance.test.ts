import assert from "node:assert/strict";
import test from "node:test";
import { projectCharacter, projectFactions } from "../src/dashboard/visibility.ts";
import { freeMateCount, memberAllowanceCap, resolveQuotedSpend, spendRole } from "../src/sim/allowance.ts";
import { submitCommand } from "../src/sim/commands.ts";
import { PASSAGE_COST_PER_TICK, runTick, runTicks } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { applyEvent, round, stateHash } from "../src/sim/state.ts";
import type { Character, WorldState } from "../src/sim/types.ts";

const PLAYER = "prototype-player";
const WG = "world-government";

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

function hold(character: Character): void {
  character.captivity = {
    captorFactionId: character.factionId === "free-tide" ? WG : "free-tide",
    settlementId: character.locationId ?? "crown-harbor",
    capturedTick: 0,
    mandatoryReleaseTick: 84,
    cause: "major-defeat",
    displayedRisk: "low",
    scatteredTroops: { count: 0, experience: 0, discipline: 0 },
    releaseDestinationId: null,
  };
}

test("the share is below 18 when the treasury cannot pay 18 to every free mate", () => {
  const world = createPrototypeWorld(1847);
  assert.equal(freeMateCount(world, WG), 12);
  world.factions[WG].treasury = 100;
  // floor(10000 / 12) cents = 8.33. 12 * 8.33 = 99.96, which does not exceed 100.
  assert.equal(memberAllowanceCap(world, WG, PASSAGE_COST_PER_TICK), 8.33);
  const bram = world.characters["character-02"];
  const mara = world.characters["character-01"];
  const row = projectCharacter(world, mara, bram);
  assert.equal(row.allowanceCap, 8.33);
  assert.equal(row.allowanceNote, "none spent today");
  assert.equal("allowanceRemaining" in row, false);
  const quoted = resolveQuotedSpend(world, bram, 10, PASSAGE_COST_PER_TICK);
  assert.equal(quoted.ok, true);
  if (quoted.ok) {
    assert.equal(quoted.treasuryDrawn, 8.33);
    assert.equal(quoted.purseDrawn, 1.67);
    assert.equal(quoted.allowanceRemaining, 0);
  }
});

test("a rich treasury keeps the share capped at 18", () => {
  const world = createPrototypeWorld(1847);
  assert.equal(world.factions[WG].treasury, 18000);
  assert.equal(memberAllowanceCap(world, WG, PASSAGE_COST_PER_TICK), 18);
  assert.equal(memberAllowanceCap(world, "free-tide", PASSAGE_COST_PER_TICK), 18);
  const bram = world.characters["character-02"];
  const quoted = resolveQuotedSpend(world, bram, 30, PASSAGE_COST_PER_TICK);
  assert.equal(quoted.ok, true);
  if (quoted.ok) {
    assert.equal(quoted.treasuryDrawn, 18);
    assert.equal(quoted.purseDrawn, 12);
    assert.equal(quoted.allowanceRemaining, 0);
  }
  const row = projectCharacter(world, world.characters["character-01"], bram);
  assert.equal(row.allowanceCap, 18);
  assert.equal(row.allowanceNote, "none spent today");
});

test("treasury 0 gives a share of 0, so the purse pays or the quote is refused", () => {
  const paid = createPrototypeWorld(1847);
  const bram = control(paid, "character-02");
  arm(paid, bram);
  paid.factions[WG].treasury = 0;
  bram.money = 96;
  delete bram.allowanceRemaining;
  assert.equal(memberAllowanceCap(paid, WG, PASSAGE_COST_PER_TICK), 0);
  assert.equal(submitCommand(paid, { playerId: PLAYER, type: "character-action", action: "recruit" }).ok, true);
  const result = runTick(paid);
  const recruited = result.events.find((event) => event.type === "recruited" && event.actorId === bram.id);
  assert.ok(recruited);
  assert.equal(recruited.data.cost, 96);
  assert.equal(recruited.data.treasuryDrawn, 0);
  assert.equal(recruited.data.purseDrawn, 96);
  assert.equal("factionTreasury" in recruited.data, false);
  assert.equal(paid.characters[bram.id].money, 0);

  const refused = createPrototypeWorld(1847);
  const short = control(refused, "character-02");
  arm(refused, short);
  refused.factions[WG].treasury = 0;
  short.money = 5;
  const rejection = submitCommand(refused, { playerId: PLAYER, type: "character-action", action: "recruit" });
  assert.equal(rejection.ok, false);
  if (!rejection.ok) {
    assert.equal(rejection.code, "insufficient-money");
    assert.equal(rejection.error, "Recruitment costs 30 money; the character holds 5");
  }
  assert.equal(refused.factions[WG].treasury, 0);
  assert.equal(short.money, 5);
});

test("a fractional share across 7 mates is exact cents and does not exceed the treasury", () => {
  const world = createPrototypeWorld(1847);
  const mates = Object.values(world.characters)
    .filter((character) => character.factionId === WG && character.id !== "character-01")
    .sort((left, right) => left.id.localeCompare(right.id));
  assert.equal(mates.length, 12);
  for (const extra of mates.slice(7)) hold(extra);
  world.factions[WG].actingCommanderId = "character-02";
  assert.equal(freeMateCount(world, WG), 7);
  world.factions[WG].treasury = 100;
  const share = memberAllowanceCap(world, WG, PASSAGE_COST_PER_TICK);
  assert.equal(share, 14.28);
  assert.ok(7 * 1428 <= 10000);

  const bram = control(world, "character-02");
  arm(world, bram);
  bram.money = 96;
  delete bram.allowanceRemaining;
  assert.equal(submitCommand(world, { playerId: PLAYER, type: "character-action", action: "recruit" }).ok, true);
  const before = JSON.parse(JSON.stringify(world)) as WorldState;
  const result = runTick(world);
  const recruited = result.events.find((event) => event.type === "recruited" && event.actorId === bram.id);
  assert.ok(recruited);
  assert.equal(recruited.data.treasuryDrawn, 14.28);
  assert.equal(recruited.data.purseDrawn, 81.72);
  assert.equal(recruited.data.allowanceRemaining, 0);
  assert.equal(recruited.data.factionTreasury, 85.72);
  assert.equal(world.characters[bram.id].money, 14.28);
  assert.equal(world.characters[bram.id].allowanceRemaining, 0);

  const replay = before;
  for (const event of result.events) applyEvent(replay, event);
  assert.equal(stateHash(replay), stateHash(world));
  assert.equal(replay.characters[bram.id].allowanceRemaining, 0);
  assert.equal(replay.factions[WG].treasury, world.factions[WG].treasury);
});

test("zero free mates is safe", () => {
  const world = createPrototypeWorld(1847);
  for (const character of Object.values(world.characters)) {
    if (character.factionId === WG && character.id !== "character-01") hold(character);
  }
  assert.equal(freeMateCount(world, WG), 0);
  world.factions[WG].treasury = 100;
  assert.equal(memberAllowanceCap(world, WG, PASSAGE_COST_PER_TICK), 0);
  const captive = world.characters["character-02"];
  const row = projectCharacter(world, world.characters["character-01"], captive);
  assert.equal(row.allowanceCap, 0);
  assert.equal(resolveQuotedSpend(world, captive, 3, PASSAGE_COST_PER_TICK).ok, false);
});

test("the holder stays uncapped when the share is below the bill", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  assert.equal(spendRole(world, mara), "holder");
  world.factions[WG].treasury = 40;
  assert.equal(memberAllowanceCap(world, WG, PASSAGE_COST_PER_TICK), 3.33);
  arm(world, mara);
  mara.money = 0;
  const row = projectCharacter(world, mara, mara);
  assert.equal(row.allowanceCap, "no cap");
  assert.equal(row.allowanceRemaining, null);
  assert.equal(row.allowanceUncapped, true);
  assert.equal(submitCommand(world, { playerId: PLAYER, type: "character-action", action: "recruit" }).ok, true);
  const result = runTick(world);
  const recruited = result.events.find((event) => event.type === "recruited" && event.actorId === mara.id);
  assert.ok(recruited);
  assert.equal(recruited.data.cost, 36);
  assert.equal(recruited.data.treasuryDrawn, 36);
  assert.equal(recruited.data.purseDrawn, 0);
  assert.equal("allowanceRemaining" in recruited.data, false);
  assert.equal(recruited.data.factionTreasury, 4);
  assert.equal(world.characters[mara.id].money, 0);
});

test("the acting commander is bound by the share", () => {
  const world = createPrototypeWorld(1847);
  for (const character of Object.values(world.characters)) {
    if (character.factionId === WG && character.id !== "character-01" && character.id !== "character-02") hold(character);
  }
  world.factions[WG].actingCommanderId = "character-02";
  world.factions[WG].treasury = 10;
  assert.equal(freeMateCount(world, WG), 1);
  assert.equal(memberAllowanceCap(world, WG, PASSAGE_COST_PER_TICK), 10);
  const bram = control(world, "character-02");
  assert.equal(spendRole(world, bram), "member");
  arm(world, bram);
  bram.money = 20;
  const mara = world.characters["character-01"];
  const before = projectCharacter(world, mara, bram);
  assert.equal(before.allowanceRole, "acting-commander");
  assert.equal(before.allowanceUncapped, false);
  assert.equal(before.allowanceCap, 10);
  assert.equal(before.allowanceNote, "none spent today");
  assert.equal(submitCommand(world, { playerId: PLAYER, type: "character-action", action: "recruit" }).ok, true);
  const result = runTick(world);
  const recruited = result.events.find((event) => event.type === "recruited" && event.actorId === bram.id);
  assert.ok(recruited);
  assert.equal(recruited.data.cost, 24);
  assert.equal(recruited.data.treasuryDrawn, 10);
  assert.equal(recruited.data.purseDrawn, 14);
  assert.equal(recruited.data.allowanceRemaining, 0);
  assert.equal(recruited.data.factionTreasury, 0);
  assert.equal(world.characters[bram.id].allowanceRemaining, 0);
  const after = projectCharacter(world, mara, world.characters[bram.id]);
  assert.equal(after.allowanceRole, "acting-commander");
  assert.equal(after.allowanceUncapped, false);
  assert.equal(after.allowanceNote, "cap used");
});

test("the daily reset recomputes the share", () => {
  const world = createPrototypeWorld(1847);
  const bram = control(world, "character-02");
  runTicks(world, 5);
  assert.equal(world.tick, 5);
  world.factions[WG].treasury = 100;
  delete bram.allowanceRemaining;
  assert.equal(memberAllowanceCap(world, WG, PASSAGE_COST_PER_TICK), 8.33);
  // Checked on the quote: a richer treasury raises the cap before the day resets.
  world.factions[WG].treasury = 18000;
  assert.equal(memberAllowanceCap(world, WG, PASSAGE_COST_PER_TICK), 18);
  bram.allowanceRemaining = 0;
  const blocked = resolveQuotedSpend(world, bram, 3, PASSAGE_COST_PER_TICK);
  assert.equal(blocked.ok, true);
  if (blocked.ok) assert.equal(blocked.treasuryDrawn, 0);
  runTick(world);
  assert.equal(world.tick, 6);
  assert.equal(bram.allowanceRemaining, undefined);
  assert.equal(memberAllowanceCap(world, WG, PASSAGE_COST_PER_TICK), 18);
  arm(world, bram);
  bram.money = 12;
  const treasuryBefore = world.factions[WG].treasury;
  assert.equal(submitCommand(world, { playerId: PLAYER, type: "character-action", action: "recruit" }).ok, true);
  const recruitedTick = runTick(world);
  const recruited = recruitedTick.events.find((event) => event.type === "recruited" && event.actorId === bram.id);
  assert.ok(recruited);
  assert.equal(recruited.data.treasuryDrawn, 18);
  assert.equal(recruited.data.purseDrawn, 6);
  assert.equal(recruited.data.factionTreasury, round(treasuryBefore - 18, 2));
});

test("a rival still sees no allowance, and a hidden treasury stays hidden", () => {
  const world = createPrototypeWorld(1847);
  world.factions["free-tide"].treasury = 20;
  const mara = world.characters["character-01"];
  const pax = world.characters["character-14"];
  const rivalMate = world.characters["character-15"];
  const asMara = projectCharacter(world, mara, rivalMate);
  assert.equal(asMara.allowanceCap, null);
  assert.equal(asMara.allowanceRemaining, null);
  assert.equal(asMara.allowanceNote, null);
  const tide = projectCharacter(world, mara, pax);
  assert.equal(tide.allowanceCap, null);
  assert.equal(tide.allowanceNote, null);
  const factions = projectFactions(world, mara) as Array<{ id: string; treasury: number | null; treasuryNote: string | null }>;
  const freeTide = factions.find((faction) => faction.id === "free-tide");
  assert.equal(freeTide?.treasury, null);
  assert.equal(freeTide?.treasuryNote, "not visible to you");
});

function offer(world: WorldState, price: number, source?: "purse") {
  return submitCommand(world, {
    playerId: PLAYER,
    type: "offer-contract",
    characterId: "character-03",
    quantity: 4,
    destinationId: "glassport",
    price,
    expiresInTicks: 12,
    ...(source ? { source } : {}),
  });
}

function cancel(world: WorldState, contractId: string) {
  return submitCommand(world, {
    playerId: PLAYER,
    type: "cancel-contract",
    characterId: "character-03",
    contractId,
  });
}

test("a treasury-paid escrow refunds to the treasury and the holder's purse does not rise", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  assert.equal(offer(world, 18).ok, true);
  const offeredTick = runTick(world);
  const offered = offeredTick.events.find((event) => event.type === "contract-offered");
  assert.ok(offered);
  assert.equal(offered.data.treasuryDrawn, 18);
  assert.equal(offered.data.purseDrawn, 0);
  assert.equal(mara.money, 108);
  const contract = Object.values(world.contracts ?? {})[0];
  assert.equal(contract.escrowFromTreasury, 18);
  assert.equal(contract.escrowFromPurse, 0);
  const treasuryBeforeCancel = world.factions[WG].treasury;
  assert.equal(cancel(world, contract.id).ok, true);
  const before = JSON.parse(JSON.stringify(world)) as WorldState;
  const cancelledTick = runTick(world);
  const cancelled = cancelledTick.events.find((event) => event.type === "contract-cancelled");
  assert.ok(cancelled);
  assert.equal(cancelled.data.treasuryRefunded, 18);
  assert.equal(cancelled.data.purseRefunded, 0);
  assert.equal(cancelled.data.buyerMoney, 108);
  assert.equal(cancelled.data.factionTreasury, round(treasuryBeforeCancel + 18, 2));
  assert.equal(mara.money, 108);
  assert.equal("allowanceRemaining" in cancelled.data, false);

  const replay = before;
  for (const event of cancelledTick.events) applyEvent(replay, event);
  assert.equal(stateHash(replay), stateHash(world));
  assert.equal(replay.characters[mara.id].money, 108);
});

test("a mixed escrow refunds each part to its source and does not restore the allowance", () => {
  const world = createPrototypeWorld(1847);
  const bram = control(world, "character-02");
  bram.money = 5;
  delete bram.allowanceRemaining;
  assert.equal(offer(world, 20).ok, true);
  const offeredTick = runTick(world);
  const offered = offeredTick.events.find((event) => event.type === "contract-offered" && event.actorId === bram.id);
  assert.ok(offered);
  assert.equal(offered.data.treasuryDrawn, 18);
  assert.equal(offered.data.purseDrawn, 2);
  assert.equal(world.characters[bram.id].money, 3);
  assert.equal(world.characters[bram.id].allowanceRemaining, 0);
  const contract = Object.values(world.contracts ?? {})[0];
  assert.equal(contract.escrowFromTreasury, 18);
  assert.equal(contract.escrowFromPurse, 2);
  const treasuryBeforeCancel = world.factions[WG].treasury;
  assert.equal(cancel(world, contract.id).ok, true);
  const cancelledTick = runTick(world);
  const cancelled = cancelledTick.events.find((event) => event.type === "contract-cancelled");
  assert.ok(cancelled);
  assert.equal(cancelled.data.treasuryRefunded, 18);
  assert.equal(cancelled.data.purseRefunded, 2);
  assert.equal(cancelled.data.buyerMoney, 5);
  assert.equal(cancelled.data.factionTreasury, round(treasuryBeforeCancel + 18, 2));
  assert.equal(world.characters[bram.id].money, 5);
  assert.equal(world.characters[bram.id].allowanceRemaining, 0);
  assert.equal("allowanceRemaining" in cancelled.data, false);
});

test("a purse-paid escrow refunds to the purse", () => {
  const world = createPrototypeWorld(1847);
  const bram = control(world, "character-02");
  bram.money = 30;
  delete bram.allowanceRemaining;
  assert.equal(offer(world, 20, "purse").ok, true);
  runTick(world);
  const contract = Object.values(world.contracts ?? {})[0];
  assert.equal(contract.escrowFromTreasury, 0);
  assert.equal(contract.escrowFromPurse, 20);
  assert.equal(world.characters[bram.id].money, 10);
  assert.equal(world.characters[bram.id].allowanceRemaining, undefined);
  assert.equal(cancel(world, contract.id).ok, true);
  const cancelledTick = runTick(world);
  const cancelled = cancelledTick.events.find((event) => event.type === "contract-cancelled");
  assert.ok(cancelled);
  assert.equal(cancelled.data.treasuryRefunded, 0);
  assert.equal(cancelled.data.purseRefunded, 20);
  assert.equal(cancelled.data.buyerMoney, 30);
  assert.equal("factionTreasury" in cancelled.data, false);
  assert.equal(world.characters[bram.id].money, 30);
  assert.equal(world.characters[bram.id].allowanceRemaining, undefined);
});
