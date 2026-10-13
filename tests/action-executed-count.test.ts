import assert from "node:assert/strict";
import test from "node:test";
import { projectEventFeed } from "../src/dashboard/view-model.ts";
import { submitCommand } from "../src/sim/commands.ts";
import { runTick } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import type { Character, SimEvent, WorldState } from "../src/sim/types.ts";

/**
 * The feed keeps the result sentence. The executed and resolved rows are not
 * shown. The recruit sentence still names the count, the cost, and the payer.
 */

const PLAYER = "prototype-player";

function arm(world: WorldState, character: Character): void {
  if (!character.locationId) throw new Error("expected a berth");
  world.settlements[character.locationId].stocks.arms = 20;
}

function control(world: WorldState, characterId: string): Character {
  const player = world.players[PLAYER];
  const previous = world.characters[player.characterId];
  if (previous.controller.kind === "human") previous.controller = { kind: "autonomous" };
  const character = world.characters[characterId];
  character.controller = { kind: "human", playerId: PLAYER };
  player.characterId = characterId;
  return character;
}

function feedRow(world: WorldState, viewerId: string, events: SimEvent[], type: string): Record<string, unknown> | undefined {
  return projectEventFeed(world, viewerId, events).find((candidate) => candidate.type === type);
}

test("a purse recruit names the count and the purse on the result line", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  arm(world, mara);
  const queued = submitCommand(world, {
    playerId: PLAYER,
    type: "character-action",
    action: "recruit",
    source: "purse",
  });
  assert.equal(queued.ok, true);
  if (!queued.ok) return;
  const [queuedRow] = projectEventFeed(world, mara.id, [queued.event]);
  assert.equal(queuedRow.summary, "Command queued for Mara Vane: recruit at Crown Harbor (from the purse)");
  const tick = runTick(world);
  assert.equal(feedRow(world, mara.id, tick.events, "player-action-executed"), undefined);
  assert.equal(feedRow(world, mara.id, tick.events, "player-command-resolved"), undefined);
  const recruited = feedRow(world, mara.id, tick.events, "recruited");
  assert.ok(recruited);
  assert.equal(recruited.summary, "Mara Vane recruited 8 at Crown Harbor for 96 from the purse.");
});

test("a treasury recruit names the treasury on the result line", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  arm(world, mara);
  const queued = submitCommand(world, { playerId: PLAYER, type: "character-action", action: "recruit" });
  assert.equal(queued.ok, true);
  if (!queued.ok) return;
  const [queuedRow] = projectEventFeed(world, mara.id, [queued.event]);
  assert.equal(queuedRow.summary, "Command queued for Mara Vane: recruit at Crown Harbor (from the treasury)");
  const tick = runTick(world);
  const recruited = feedRow(world, mara.id, tick.events, "recruited");
  assert.ok(recruited);
  assert.equal(recruited.summary, "Mara Vane recruited 8 at Crown Harbor for 96 from the treasury.");
  assert.equal(feedRow(world, mara.id, tick.events, "player-action-executed"), undefined);
});

test("a mixed recruit names both payers on the result line", () => {
  const world = createPrototypeWorld(1847);
  const sable = control(world, "character-04");
  arm(world, sable);
  const queued = submitCommand(world, { playerId: PLAYER, type: "character-action", action: "recruit" });
  assert.equal(queued.ok, true);
  if (!queued.ok) return;
  const tick = runTick(world);
  const recruited = feedRow(world, sable.id, tick.events, "recruited");
  assert.ok(recruited);
  assert.equal(recruited.summary, "Sable Morrow recruited 8 at Glassport for 96: 18 from the treasury and 78 from the purse.");
  assert.equal(feedRow(world, sable.id, tick.events, "player-command-resolved"), undefined);
});

test("a provision buy names the count, the cost, the purse, and the hold", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  const queued = submitCommand(world, {
    playerId: PLAYER,
    type: "character-action",
    action: "buy-provisions",
    source: "purse",
  });
  assert.equal(queued.ok, true);
  if (!queued.ok) return;
  const tick = runTick(world);
  const trade = feedRow(world, mara.id, tick.events, "market-trade");
  assert.ok(trade);
  assert.equal(trade.summary, "Mara Vane bought 12 provisions at Crown Harbor for 17.64 from the purse (hold now 47.42).");
  assert.equal(feedRow(world, mara.id, tick.events, "player-action-executed"), undefined);
  assert.equal(feedRow(world, mara.id, tick.events, "player-command-resolved"), undefined);
});

test("a goods buy names the good, the count, the purse, and the hold", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  const queued = submitCommand(world, {
    playerId: PLAYER,
    type: "character-action",
    action: "buy-resource",
    resource: "medicine",
    quantity: 2,
    source: "purse",
  });
  assert.equal(queued.ok, true);
  if (!queued.ok) return;
  const tick = runTick(world);
  const trade = feedRow(world, mara.id, tick.events, "market-trade");
  assert.ok(trade);
  assert.equal(trade.summary, "Mara Vane bought 2 medicine at Crown Harbor for 34.54 from the purse (hold now 6).");
});

test("a passage keeps the departure and drops the executed line", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  const queued = submitCommand(world, {
    playerId: PLAYER,
    type: "character-action",
    action: "travel",
    targetId: "glassport",
    source: "purse",
  });
  assert.equal(queued.ok, true);
  if (!queued.ok) return;
  const tick = runTick(world);
  const departed = feedRow(world, mara.id, tick.events, "travel-started");
  assert.ok(departed);
  assert.equal(departed.summary, "Mara Vane departed for Glassport");
  assert.equal(feedRow(world, mara.id, tick.events, "player-action-executed"), undefined);
  assert.equal(String(departed.summary).includes("from the purse"), false);
});

test("a rest keeps the rested line", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  const queued = submitCommand(world, { playerId: PLAYER, type: "character-action", action: "rest" });
  assert.equal(queued.ok, true);
  if (!queued.ok) return;
  const tick = runTick(world);
  const rested = feedRow(world, mara.id, tick.events, "rested");
  assert.ok(rested);
  assert.equal(rested.summary, "Mara Vane rested at Crown Harbor.");
  assert.equal(feedRow(world, mara.id, tick.events, "player-action-executed"), undefined);
  assert.equal(feedRow(world, mara.id, tick.events, "player-command-resolved"), undefined);
});

test("a rival does not see the recruit count, and a mate keeps the one result line", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  arm(world, mara);
  const queued = submitCommand(world, {
    playerId: PLAYER,
    type: "character-action",
    action: "recruit",
    source: "purse",
  });
  assert.equal(queued.ok, true);
  if (!queued.ok) return;
  const tick = runTick(world);
  const rival = feedRow(world, "character-14", tick.events, "recruited");
  assert.ok(rival);
  assert.equal(rival.payloadWithheld, true);
  assert.equal(rival.data, null);
  assert.equal(rival.summary, "Mara Vane recruited at Crown Harbor.");
  assert.equal(/\b8\b|\b96\b|purse|treasury/.test(String(rival.summary)), false);
  assert.equal(feedRow(world, "character-14", tick.events, "player-action-executed"), undefined);

  const mateWorld = createPrototypeWorld(1847);
  const sable = control(mateWorld, "character-04");
  arm(mateWorld, sable);
  const mateCommand = submitCommand(mateWorld, { playerId: PLAYER, type: "character-action", action: "recruit" });
  assert.equal(mateCommand.ok, true);
  if (!mateCommand.ok) return;
  const mateTick = runTick(mateWorld);
  const withheld = feedRow(mateWorld, "character-01", mateTick.events, "recruited");
  assert.ok(withheld);
  assert.equal(withheld.payloadWithheld, true);
  assert.equal(withheld.data, null);
  assert.equal(withheld.summary, "Sable Morrow recruited 8 at Glassport for 96: 18 from the treasury and 78 from the purse.");
  assert.equal(feedRow(mateWorld, "character-01", mateTick.events, "player-action-executed"), undefined);
  assert.equal(feedRow(mateWorld, "character-01", mateTick.events, "player-command-resolved"), undefined);
});
