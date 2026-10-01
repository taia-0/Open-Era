import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { projectCharacter } from "../src/dashboard/visibility.ts";
import { queuedCommandSentence, treasuryDrawSentence } from "../src/dashboard/wording.ts";
import { projectEventFeed } from "../src/dashboard/view-model.ts";
import { submitCommand } from "../src/sim/commands.ts";
import { runTick, runTicks } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import type { Character, SimEvent, WorldState } from "../src/sim/types.ts";

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
  if (!character.locationId) throw new Error("expected a berth");
  world.settlements[character.locationId].stocks.arms = 20;
}

test("the draw sentence names the purse without a pronoun", () => {
  const world = createPrototypeWorld(1847);
  const both = treasuryDrawSentence(world, "world-government", {
    sequence: 1,
    tick: 0,
    type: "market-trade",
    actorId: "character-04",
    data: { treasuryDrawn: 18, purseDrawn: 78 },
  });
  assert.equal(both, "Sable Morrow drew 18 from the treasury and paid 78 from the purse.");
  const treasuryOnly = treasuryDrawSentence(world, "world-government", {
    sequence: 2,
    tick: 0,
    type: "market-trade",
    actorId: "character-01",
    data: { treasuryDrawn: 12, purseDrawn: 0 },
  });
  assert.equal(treasuryOnly, "Mara Vane drew 12 from the treasury.");
});

test("a purse recruit and a treasury recruit each name the count and the cost", () => {
  const purseWorld = createPrototypeWorld(1847);
  const mara = purseWorld.characters["character-01"];
  arm(purseWorld, mara);
  const purseCommand = submitCommand(purseWorld, {
    playerId: PLAYER,
    type: "character-action",
    action: "recruit",
    source: "purse",
  });
  assert.equal(purseCommand.ok, true);
  if (!purseCommand.ok) return;
  const [queuedPurse] = projectEventFeed(purseWorld, mara.id, [purseCommand.event]);
  assert.equal(queuedPurse.summary, "Command queued for Mara Vane: recruit at Crown Harbor (from the purse)");
  const purseTick = runTick(purseWorld);
  const purseRecruit = purseTick.events.find((event) => event.type === "recruited" && event.actorId === mara.id);
  assert.ok(purseRecruit);
  const [purseRow] = projectEventFeed(purseWorld, mara.id, [purseRecruit]);
  assert.equal(purseRow.payloadWithheld, false);
  assert.equal(purseRow.summary, "Mara Vane recruited 8 at Crown Harbor for 96 from the purse.");
  const [purseRival] = projectEventFeed(purseWorld, "character-14", [purseRecruit]);
  assert.equal(purseRival.payloadWithheld, true);
  assert.equal(purseRival.data, null);
  assert.equal(purseRival.summary, "Mara Vane recruited at Crown Harbor.");

  const treasuryWorld = createPrototypeWorld(1847);
  const holder = treasuryWorld.characters["character-01"];
  arm(treasuryWorld, holder);
  const treasuryCommand = submitCommand(treasuryWorld, {
    playerId: PLAYER,
    type: "character-action",
    action: "recruit",
  });
  assert.equal(treasuryCommand.ok, true);
  if (!treasuryCommand.ok) return;
  const [queuedTreasury] = projectEventFeed(treasuryWorld, holder.id, [treasuryCommand.event]);
  assert.equal(queuedTreasury.summary, "Command queued for Mara Vane: recruit at Crown Harbor (from the treasury)");
  const treasuryTick = runTick(treasuryWorld);
  const treasuryRecruit = treasuryTick.events.find((event) => event.type === "recruited" && event.actorId === holder.id);
  assert.ok(treasuryRecruit);
  assert.equal(treasuryRecruit.data.treasuryDrawn, 96);
  assert.equal(treasuryRecruit.data.purseDrawn, 0);
  const [treasuryRow] = projectEventFeed(treasuryWorld, holder.id, [treasuryRecruit]);
  assert.equal(treasuryRow.summary, "Mara Vane recruited 8 at Crown Harbor for 96 from the treasury.");
});

test("a queued command falls back when the action, the source, or the berth is missing", () => {
  const world = createPrototypeWorld(1847);
  const bram = control(world, "character-02");
  arm(world, bram);
  const submitted = submitCommand(world, { playerId: PLAYER, type: "character-action", action: "recruit" });
  assert.equal(submitted.ok, true);
  if (!submitted.ok) return;
  const [queued] = projectEventFeed(world, bram.id, [submitted.event]);
  assert.equal(queued.summary, "Command queued for Bram Quill");

  const atSea: SimEvent = {
    sequence: 1,
    tick: 0,
    type: "player-command-accepted",
    actorId: "character-01",
    data: { command: { type: "character-action", action: "recruit", source: "purse" } },
  };
  world.characters["character-01"].locationId = null;
  assert.equal(queuedCommandSentence(world, atSea, "Mara Vane", null), "Command queued for Mara Vane");
  const noAction: SimEvent = {
    sequence: 2,
    tick: 0,
    type: "player-command-accepted",
    actorId: "character-01",
    data: { command: { type: "issue-order" } },
  };
  assert.equal(queuedCommandSentence(world, noAction, "Mara Vane", "Crown Harbor"), "Command queued for Mara Vane");
});

test("a withheld purse-only recruit and a rival recruit do not leak the count or the cost", () => {
  const world = createPrototypeWorld(1847);
  const hidden: SimEvent = {
    sequence: 9,
    tick: 0,
    type: "recruited",
    actorId: "character-02",
    settlementId: "verdant-cay",
    data: { quantity: 8, cost: 96, treasuryDrawn: 0, purseDrawn: 96 },
  };
  const [mate] = projectEventFeed(world, "character-01", [hidden]);
  assert.equal(mate.payloadWithheld, true);
  assert.equal(mate.data, null);
  assert.equal(mate.summary, "Bram Quill recruited at Verdant Cay.");
  const [rival] = projectEventFeed(world, "character-14", [hidden]);
  assert.equal(rival.summary, "Bram Quill recruited at Verdant Cay.");
  assert.equal(rival.data, null);
});

test("a recruit that cannot name its count keeps the draw sentence", () => {
  const world = createPrototypeWorld(1847);
  const partial: SimEvent = {
    sequence: 3,
    tick: 0,
    type: "recruited",
    actorId: "character-04",
    settlementId: "glassport",
    data: { treasuryDrawn: 18, purseDrawn: 78 },
  };
  const [row] = projectEventFeed(world, "character-01", [partial]);
  assert.equal(row.payloadWithheld, true);
  assert.equal(row.data, null);
  assert.equal(row.summary, "Sable Morrow drew 18 from the treasury and paid 78 from the purse.");
});

test("a spent-out allowance reads cap used, and a partial remainder stays blank", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  const bram = world.characters["character-02"];
  bram.allowanceRemaining = 0;
  const spent = projectCharacter(world, mara, bram);
  assert.equal(spent.allowanceRemaining, 0);
  assert.equal(spent.allowanceNote, "cap used");
  bram.allowanceRemaining = 4;
  const partial = projectCharacter(world, mara, bram);
  assert.equal(partial.allowanceRemaining, 4);
  assert.equal(partial.allowanceNote, null);
  delete bram.allowanceRemaining;
  const full = projectCharacter(world, mara, bram);
  assert.equal("allowanceRemaining" in full, false);
  assert.equal(full.allowanceNote, "none spent today");
  const rival = projectCharacter(world, world.characters["character-14"], bram);
  assert.equal(rival.allowanceNote, null);
});

test("own-faction money stays hidden at sea, which the Lead left as an open question", () => {
  const run = runTicks(createPrototypeWorld(1847), 6);
  const mara = run.state.characters["character-01"];
  const sable = run.state.characters["character-04"];
  assert.equal(sable.locationId, null);
  assert.ok(sable.travel);
  const card = projectCharacter(run.state, mara, sable);
  assert.equal(card.money, null);
  const self = projectCharacter(run.state, mara, mara);
  assert.equal(typeof self.money, "number");
  const progress = readFileSync(new URL("../progress.md", import.meta.url), "utf8");
  assert.match(progress, /own-faction officers' money is hidden at sea \/ when not co-located \(visibility\.ts:63-65, :110, :733\)/);
  assert.match(progress, /Open Era Lead/);
  assert.match(progress, /open question/);
});
