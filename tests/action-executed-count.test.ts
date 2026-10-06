import assert from "node:assert/strict";
import test from "node:test";
import { projectEventFeed } from "../src/dashboard/view-model.ts";
import { submitCommand } from "../src/sim/commands.ts";
import { runTick } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import type { Character, SimEvent, WorldState } from "../src/sim/types.ts";

/**
 * The player-action-executed row used to be `{name} carried out an action.`
 * for every action. These tests replace that pin where the paired result
 * already stores a count. A missing pair, a rest, a rival, and a withheld
 * row keep the old sentence. The recruit line keeps its period. The resolved
 * line stays `{name}: action executed`.
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

function feedRow(world: WorldState, viewerId: string, events: SimEvent[], type: string): Record<string, unknown> {
  const row = projectEventFeed(world, viewerId, events).find((candidate) => candidate.type === type);
  assert.ok(row, type);
  return row;
}

test("a purse recruit names the count and the purse on the executed line", () => {
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
  const executed = feedRow(world, mara.id, tick.events, "player-action-executed");
  const recruited = feedRow(world, mara.id, tick.events, "recruited");
  const resolved = feedRow(world, mara.id, tick.events, "player-command-resolved");
  assert.equal(executed.payloadWithheld, false);
  assert.equal(executed.summary, "Mara Vane: recruited 8 at Crown Harbor for 96 from the purse");
  assert.equal(recruited.summary, "Mara Vane recruited 8 at Crown Harbor for 96 from the purse.");
  assert.equal(resolved.summary, "Mara Vane: action executed");
});

test("a treasury recruit names the treasury on the executed line", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  arm(world, mara);
  const queued = submitCommand(world, { playerId: PLAYER, type: "character-action", action: "recruit" });
  assert.equal(queued.ok, true);
  if (!queued.ok) return;
  const [queuedRow] = projectEventFeed(world, mara.id, [queued.event]);
  assert.equal(queuedRow.summary, "Command queued for Mara Vane: recruit at Crown Harbor (from the treasury)");
  const tick = runTick(world);
  const executed = feedRow(world, mara.id, tick.events, "player-action-executed");
  const recruited = feedRow(world, mara.id, tick.events, "recruited");
  assert.equal(executed.summary, "Mara Vane: recruited 8 at Crown Harbor for 96 from the treasury");
  assert.equal(recruited.summary, "Mara Vane recruited 8 at Crown Harbor for 96 from the treasury.");
});

test("a mixed recruit names both payers on the executed line", () => {
  const world = createPrototypeWorld(1847);
  const sable = control(world, "character-04");
  arm(world, sable);
  const queued = submitCommand(world, { playerId: PLAYER, type: "character-action", action: "recruit" });
  assert.equal(queued.ok, true);
  if (!queued.ok) return;
  const tick = runTick(world);
  const executed = feedRow(world, sable.id, tick.events, "player-action-executed");
  const recruited = feedRow(world, sable.id, tick.events, "recruited");
  assert.equal(executed.summary, "Sable Morrow: recruited 8 at Glassport for 96: 18 from the treasury and 78 from the purse");
  assert.equal(recruited.summary, "Sable Morrow recruited 8 at Glassport for 96: 18 from the treasury and 78 from the purse.");
});

test("a provision buy names the count, the cost, and the purse", () => {
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
  const executed = feedRow(world, mara.id, tick.events, "player-action-executed");
  const trade = feedRow(world, mara.id, tick.events, "market-trade");
  assert.equal(executed.summary, "Mara Vane: bought 12 provisions at Crown Harbor for 17.64 from the purse");
  assert.equal(trade.summary, "Mara Vane bought 12 provisions at Crown Harbor for 17.64 (1.47 each).");
});

test("a goods buy names the good, the count, and the purse", () => {
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
  const executed = feedRow(world, mara.id, tick.events, "player-action-executed");
  const trade = feedRow(world, mara.id, tick.events, "market-trade");
  assert.equal(executed.summary, "Mara Vane: bought 2 medicine at Crown Harbor for 34.54 from the purse");
  assert.equal(trade.summary, "Mara Vane bought 2 medicine at Crown Harbor for 34.54 (17.27 each).");
});

test("a passage names the tick count and not a coin cost", () => {
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
  const executed = feedRow(world, mara.id, tick.events, "player-action-executed");
  assert.equal(executed.summary, "Mara Vane: traveled 4 ticks to Glassport");
  assert.equal(String(executed.summary).includes("from the purse"), false);
  assert.equal(String(executed.summary).includes("treasury"), false);
});

test("a rest, and a recruit with no paired count, keep the old executed line", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  const queued = submitCommand(world, { playerId: PLAYER, type: "character-action", action: "rest" });
  assert.equal(queued.ok, true);
  if (!queued.ok) return;
  const tick = runTick(world);
  const rested = feedRow(world, mara.id, tick.events, "player-action-executed");
  assert.equal(rested.summary, "Mara Vane carried out an action.");

  const executed: SimEvent = {
    sequence: 10,
    tick: 0,
    type: "player-action-executed",
    actorId: "character-01",
    settlementId: "crown-harbor",
    data: { commandId: "command-00001", action: "recruit" },
  };
  const unpaired = feedRow(world, mara.id, [executed], "player-action-executed");
  assert.equal(unpaired.summary, "Mara Vane carried out an action.");
  const partial: SimEvent = {
    sequence: 11,
    tick: 0,
    type: "recruited",
    actorId: "character-01",
    settlementId: "crown-harbor",
    data: { treasuryDrawn: 18, purseDrawn: 78 },
  };
  const missingCount = feedRow(world, mara.id, [executed, partial], "player-action-executed");
  assert.equal(missingCount.summary, "Mara Vane carried out an action.");
});

test("a rival and a withheld mate do not see the count, the cost, or the payer", () => {
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
  const rival = feedRow(world, "character-14", tick.events, "player-action-executed");
  assert.equal(rival.payloadWithheld, true);
  assert.equal(rival.data, null);
  assert.equal(rival.summary, "Mara Vane carried out an action.");
  assert.equal(/\b8\b|\b96\b|purse|treasury/.test(String(rival.summary)), false);

  const mateWorld = createPrototypeWorld(1847);
  const sable = control(mateWorld, "character-04");
  arm(mateWorld, sable);
  const mateCommand = submitCommand(mateWorld, { playerId: PLAYER, type: "character-action", action: "recruit" });
  assert.equal(mateCommand.ok, true);
  if (!mateCommand.ok) return;
  const mateTick = runTick(mateWorld);
  const withheld = feedRow(mateWorld, "character-01", mateTick.events, "player-action-executed");
  assert.equal(withheld.payloadWithheld, true);
  assert.equal(withheld.data, null);
  assert.equal(withheld.summary, "Sable Morrow carried out an action.");
  assert.equal(/\b8\b|\b96\b|\b18\b|\b78\b|purse|treasury/.test(String(withheld.summary)), false);
});
