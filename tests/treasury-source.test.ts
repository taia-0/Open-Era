import assert from "node:assert/strict";
import test from "node:test";
import { spendRole } from "../src/sim/allowance.ts";
import { PASSAGE_COST_PER_TICK, quotedPassage, runTick } from "../src/sim/engine.ts";
import { submitCommand } from "../src/sim/commands.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { applyEvent, stateHash } from "../src/sim/state.ts";
import type { Character, PlayerCommand, WorldState } from "../src/sim/types.ts";

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

function commandOf(submitted: ReturnType<typeof submitCommand>): PlayerCommand {
  assert.equal(submitted.ok, true);
  if (!submitted.ok) throw new Error("expected a command");
  return submitted.command;
}

test("source purse skips the allowance and pays the purse", () => {
  const world = createPrototypeWorld(1847);
  const bram = control(world, "character-02");
  assert.equal(spendRole(world, bram), "member");
  arm(world, bram);
  bram.money = 96;
  delete bram.allowanceRemaining;
  const submitted = submitCommand(world, {
    playerId: PLAYER,
    type: "character-action",
    action: "recruit",
    source: "purse",
  });
  const command = commandOf(submitted);
  assert.equal(command.type, "character-action");
  if (command.type !== "character-action") return;
  assert.equal(command.source, "purse");
  if (!submitted.ok) return;
  assert.equal(submitted.event.type, "player-command-accepted");
  assert.equal((submitted.event.data.command as PlayerCommand).type, "character-action");
  const echoed = submitted.event.data.command as Extract<PlayerCommand, { type: "character-action" }>;
  assert.equal(echoed.source, "purse");

  const before = JSON.parse(JSON.stringify(world)) as WorldState;
  const result = runTick(world);
  const recruited = result.events.find((event) => event.type === "recruited" && event.actorId === bram.id);
  assert.ok(recruited);
  assert.equal(recruited.data.cost, 96);
  assert.equal(recruited.data.treasuryDrawn, 0);
  assert.equal(recruited.data.purseDrawn, 96);
  assert.equal("allowanceRemaining" in recruited.data, false);
  assert.equal("factionTreasury" in recruited.data, false);
  assert.equal(recruited.data.characterMoney, 0);
  assert.equal(world.characters[bram.id].money, 0);
  assert.equal(world.characters[bram.id].allowanceRemaining, undefined);

  const replay = before;
  for (const event of result.events) applyEvent(replay, event);
  assert.equal(stateHash(replay), stateHash(world));
  assert.equal(replay.characters[bram.id].allowanceRemaining, undefined);
  assert.equal(replay.characters[bram.id].money, 0);
});

test("a command without source still draws the allowance, then the purse", () => {
  const world = createPrototypeWorld(1847);
  const bram = control(world, "character-02");
  arm(world, bram);
  bram.money = 96;
  delete bram.allowanceRemaining;
  const treasuryBefore = world.factions["world-government"].treasury;
  const submitted = submitCommand(world, { playerId: PLAYER, type: "character-action", action: "recruit" });
  const command = commandOf(submitted);
  assert.equal(command.type, "character-action");
  if (command.type !== "character-action") return;
  assert.equal(command.source, undefined);
  const result = runTick(world);
  const recruited = result.events.find((event) => event.type === "recruited" && event.actorId === bram.id);
  assert.ok(recruited);
  assert.equal(recruited.data.cost, 96);
  assert.equal(recruited.data.treasuryDrawn, 18);
  assert.equal(recruited.data.purseDrawn, 78);
  assert.equal(recruited.data.allowanceRemaining, 0);
  assert.equal(recruited.data.factionTreasury, treasuryBefore - 18);
  assert.equal(world.characters[bram.id].money, 18);
  assert.equal(world.characters[bram.id].allowanceRemaining, 0);
});

test("the free holder echoes treasury when source is omitted, and purse pays the purse", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  assert.equal(spendRole(world, mara), "holder");
  arm(world, mara);
  mara.money = 96;

  const echoed = submitCommand(world, { playerId: PLAYER, type: "character-action", action: "work" });
  const work = commandOf(echoed);
  assert.equal(work.type, "character-action");
  if (work.type === "character-action") assert.equal(work.source, "treasury");

  const broke = createPrototypeWorld(1847);
  const brokeMara = broke.characters["character-01"];
  arm(broke, brokeMara);
  brokeMara.money = 0;
  const brokeTreasury = broke.factions["world-government"].treasury;
  const refused = submitCommand(broke, {
    playerId: PLAYER,
    type: "character-action",
    action: "recruit",
    source: "purse",
  });
  assert.equal(refused.ok, false);
  if (!refused.ok) {
    assert.equal(refused.code, "insufficient-money");
    assert.equal(refused.error, "Recruitment costs 30 money; the character holds 0");
  }
  assert.equal(broke.factions["world-government"].treasury, brokeTreasury);

  const purseWorld = createPrototypeWorld(1847);
  const purseMara = purseWorld.characters["character-01"];
  arm(purseWorld, purseMara);
  purseMara.money = 96;
  const submitted = submitCommand(purseWorld, {
    playerId: PLAYER,
    type: "character-action",
    action: "recruit",
    source: "purse",
  });
  const command = commandOf(submitted);
  if (command.type === "character-action") assert.equal(command.source, "purse");
  const result = runTick(purseWorld);
  const recruited = result.events.find((event) => event.type === "recruited" && event.actorId === purseMara.id);
  assert.ok(recruited);
  assert.equal(recruited.data.treasuryDrawn, 0);
  assert.equal(recruited.data.purseDrawn, 96);
  assert.equal(recruited.data.characterMoney, 0);
  assert.equal("factionTreasury" in recruited.data, false);
  assert.equal(purseWorld.characters[purseMara.id].money, 0);
});

test("an invalid or unauthorized source is refused, and a captive keeps the captive refusal", () => {
  const world = createPrototypeWorld(1847);
  const bram = control(world, "character-02");
  arm(world, bram);
  bram.money = 96;
  const bad = submitCommand(world, {
    playerId: PLAYER,
    type: "character-action",
    action: "recruit",
    source: "wallet" as "purse",
  });
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.equal(bad.code, "invalid-source");
    assert.equal(bad.error, 'source is "purse" or omitted; "wallet" was requested');
  }

  const treasury = submitCommand(world, {
    playerId: PLAYER,
    type: "character-action",
    action: "recruit",
    source: "treasury",
  });
  assert.equal(treasury.ok, false);
  if (!treasury.ok) {
    assert.equal(treasury.code, "invalid-source");
    assert.equal(treasury.error, 'source is "purse" or omitted; "treasury" was requested');
  }

  const order = submitCommand(world, {
    playerId: PLAYER,
    type: "issue-order",
    characterId: "character-03",
    directive: "protect",
    targetId: "crown-harbor",
    source: "purse",
  } as never);
  assert.equal(order.ok, false);
  if (!order.ok) {
    assert.equal(order.code, "invalid-source");
    assert.equal(order.error, 'source is "purse" or omitted; "purse" was requested');
  }

  const unaffiliated = control(world, "character-23");
  arm(world, unaffiliated);
  unaffiliated.money = 96;
  const noTreasury = submitCommand(world, {
    playerId: PLAYER,
    type: "character-action",
    action: "recruit",
    source: "treasury",
  });
  assert.equal(noTreasury.ok, false);
  if (!noTreasury.ok) assert.equal(noTreasury.code, "invalid-source");

  const holder = createPrototypeWorld(1847);
  const named = submitCommand(holder, {
    playerId: PLAYER,
    type: "character-action",
    action: "work",
    source: "treasury",
  });
  const namedCommand = commandOf(named);
  if (namedCommand.type === "character-action") assert.equal(namedCommand.source, "treasury");

  const captive = createPrototypeWorld(1847);
  const mara = captive.characters["character-01"];
  mara.captivity = {
    captorFactionId: "free-tide",
    settlementId: mara.locationId ?? "crown-harbor",
    capturedTick: 0,
    mandatoryReleaseTick: 84,
    cause: "major-defeat",
    displayedRisk: "low",
    scatteredTroops: { count: 0, experience: 0, discipline: 0 },
    releaseDestinationId: null,
  };
  const refused = submitCommand(captive, {
    playerId: PLAYER,
    type: "character-action",
    action: "recruit",
    source: "purse",
  });
  assert.equal(refused.ok, false);
  if (!refused.ok) {
    assert.equal(refused.code, "character-captive");
    assert.equal(refused.error, "Only an escape attempt is available while the character is captive");
  }
});

test("a purse contract does not draw the allowance, and replay keeps the purse", () => {
  const world = createPrototypeWorld(1847);
  const bram = control(world, "character-02");
  bram.money = 30;
  delete bram.allowanceRemaining;
  const submitted = submitCommand(world, {
    playerId: PLAYER,
    type: "offer-contract",
    characterId: "character-03",
    quantity: 4,
    destinationId: "glassport",
    price: 20,
    expiresInTicks: 12,
    source: "purse",
  });
  const command = commandOf(submitted);
  assert.equal(command.type, "offer-contract");
  if (command.type === "offer-contract") assert.equal(command.source, "purse");
  const before = JSON.parse(JSON.stringify(world)) as WorldState;
  const result = runTick(world);
  const offered = result.events.find((event) => event.type === "contract-offered" && event.actorId === bram.id);
  assert.ok(offered);
  assert.equal(offered.data.treasuryDrawn, 0);
  assert.equal(offered.data.purseDrawn, 20);
  assert.equal("allowanceRemaining" in offered.data, false);
  assert.equal("factionTreasury" in offered.data, false);
  assert.equal(offered.data.characterMoney, 10);
  assert.equal(world.characters[bram.id].money, 10);
  assert.equal(world.characters[bram.id].allowanceRemaining, undefined);

  const replay = before;
  for (const event of result.events) applyEvent(replay, event);
  assert.equal(stateHash(replay), stateHash(world));
});

test("a purse voyage quotes the purse and does not draw the allowance at sea", () => {
  const world = createPrototypeWorld(1847);
  const bram = control(world, "character-02");
  const origin = bram.locationId ?? "crown-harbor";
  const destination = origin === "glassport" ? "crown-harbor" : "glassport";
  bram.money = 1;
  delete bram.allowanceRemaining;
  const treasuryBefore = world.factions["world-government"].treasury;
  const quote = quotedPassage(world, bram, destination, "purse");
  assert.equal(quote.affordable, false);
  assert.ok(quote.cost > 1);
  const short = submitCommand(world, {
    playerId: PLAYER,
    type: "character-action",
    action: "travel",
    targetId: destination,
    source: "purse",
  });
  assert.equal(short.ok, false);
  if (!short.ok) {
    assert.equal(short.code, "insufficient-passage");
    assert.match(short.error, /the character holds 1$/);
  }
  assert.equal(world.factions["world-government"].treasury, treasuryBefore);

  bram.money = quote.cost;
  const submitted = submitCommand(world, {
    playerId: PLAYER,
    type: "character-action",
    action: "travel",
    targetId: destination,
    source: "purse",
  });
  assert.equal(submitted.ok, true);
  const before = JSON.parse(JSON.stringify(world)) as WorldState;
  const result = runTick(world);
  const started = result.events.find((event) => event.type === "travel-started" && event.actorId === bram.id);
  assert.ok(started);
  const travel = started.data.travel as { source?: string };
  assert.equal(travel.source, "purse");
  const upkeep = result.events.find((event) => event.type === "character-upkeep" && event.actorId === bram.id);
  assert.ok(upkeep);
  assert.equal(upkeep.data.passageCost, PASSAGE_COST_PER_TICK);
  assert.equal(upkeep.data.treasuryDrawn, 0);
  assert.equal(upkeep.data.purseDrawn, PASSAGE_COST_PER_TICK);
  assert.equal(upkeep.data.characterMoney, quote.cost - PASSAGE_COST_PER_TICK);
  assert.equal("allowanceRemaining" in upkeep.data, false);
  assert.equal(world.characters[bram.id].allowanceRemaining, undefined);
  assert.equal(world.characters[bram.id].money, quote.cost - PASSAGE_COST_PER_TICK);
  assert.equal("factionTreasury" in upkeep.data, false);
  assert.equal(world.characters[bram.id].travel?.source, "purse");

  const replay = before;
  for (const event of result.events) applyEvent(replay, event);
  assert.equal(stateHash(replay), stateHash(world));
  assert.equal(replay.characters[bram.id].travel?.source, "purse");
  assert.equal(replay.characters[bram.id].money, quote.cost - PASSAGE_COST_PER_TICK);
});
