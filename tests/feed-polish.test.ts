import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { projectEventFeed } from "../src/dashboard/view-model.ts";
import { createDashboardApp } from "../src/dashboard/server.ts";
import { submitCommand } from "../src/sim/commands.ts";
import { runTick } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import type { SimEvent, WorldState } from "../src/sim/types.ts";

/**
 * One result line per player action. Buys and sells name the live hold.
 * An empty `beforeSequence` is not the cursor 0.
 */

const PLAYER = "prototype-player";

function lines(world: WorldState, viewerId: string, events: SimEvent[], actorId = viewerId): string[] {
  return projectEventFeed(world, viewerId, events)
    .filter((row) => row.actorId === actorId)
    .map((row) => `${row.type}|${row.summary}`);
}

test("a tax set keeps the confirmation and drops the resolved line", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  const queued = submitCommand(world, { playerId: PLAYER, type: "set-tax-rate", taxRate: 0.12 });
  assert.equal(queued.ok, true);
  if (!queued.ok) return;
  const [queuedRow] = projectEventFeed(world, mara.id, [queued.event]);
  assert.equal(queuedRow.summary, "Command queued for Mara Vane: set tax rate to 12%");
  const tick = runTick(world);
  assert.deepEqual(lines(world, mara.id, tick.events).filter((line) => line.includes("tax")), [
    "tax-rate-set|Mara Vane set the World Government tax rate to 12%.",
  ]);
});

test("a provision buy keeps one line and names the live hold", () => {
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
  const [queuedRow] = projectEventFeed(world, mara.id, [queued.event]);
  assert.equal(queuedRow.summary, "Command queued for Mara Vane: 12 provisions at 1.47 each, 17.64 total");
  const tick = runTick(world);
  const actorLines = lines(world, mara.id, tick.events);
  assert.equal(actorLines.some((line) => line.startsWith("player-action-executed|")), false);
  assert.equal(actorLines.some((line) => line.startsWith("player-command-resolved|")), false);
  assert.ok(actorLines.includes(
    "market-trade|Mara Vane bought 12 provisions at Crown Harbor for 17.64 from the purse (hold now 47.42).",
  ));
});

test("a goods buy and a sale name the live hold of that good", () => {
  const buyWorld = createPrototypeWorld(1847);
  const buyer = buyWorld.characters["character-01"];
  const buy = submitCommand(buyWorld, {
    playerId: PLAYER,
    type: "character-action",
    action: "buy-resource",
    resource: "medicine",
    quantity: 2,
    source: "purse",
  });
  assert.equal(buy.ok, true);
  if (!buy.ok) return;
  const bought = runTick(buyWorld);
  assert.ok(lines(buyWorld, buyer.id, bought.events).includes(
    "market-trade|Mara Vane bought 2 medicine at Crown Harbor for 34.54 from the purse (hold now 6).",
  ));

  const sellWorld = createPrototypeWorld(1847);
  const seller = sellWorld.characters["character-01"];
  const sell = submitCommand(sellWorld, {
    playerId: PLAYER,
    type: "character-action",
    action: "sell-resource",
    resource: "arms",
    quantity: 2,
    source: "purse",
  });
  assert.equal(sell.ok, true);
  if (!sell.ok) return;
  const sold = runTick(sellWorld);
  const sellLines = lines(sellWorld, seller.id, sold.events);
  assert.equal(sellLines.some((line) => line.startsWith("player-action-executed|")), false);
  assert.equal(sellLines.some((line) => line.startsWith("player-command-resolved|")), false);
  assert.ok(sellLines.includes(
    "market-trade|Mara Vane sold 2 arms at Crown Harbor (hold now 1). Tax of 1.24 went to the treasury.",
  ));
});

test("recruit, work, rest, and travel each keep the result sentence", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  world.settlements[mara.locationId!].stocks.arms = 20;
  const recruit = submitCommand(world, {
    playerId: PLAYER,
    type: "character-action",
    action: "recruit",
    source: "purse",
  });
  assert.equal(recruit.ok, true);
  if (!recruit.ok) return;
  const recruited = runTick(world);
  const recruitLines = lines(world, mara.id, recruited.events);
  assert.deepEqual(recruitLines.filter((line) => line.includes("recruit")), [
    "recruited|Mara Vane recruited 8 at Crown Harbor for 96 from the purse.",
  ]);

  const workWorld = createPrototypeWorld(1847);
  const worker = workWorld.characters["character-01"];
  assert.equal(submitCommand(workWorld, { playerId: PLAYER, type: "character-action", action: "work" }).ok, true);
  const worked = runTick(workWorld);
  assert.deepEqual(lines(workWorld, worker.id, worked.events).filter((line) => line.startsWith("worked|") || line.includes("player-")), [
    "worked|Mara Vane worked at Crown Harbor. Tax of 3.83 went to the treasury.",
  ]);

  const restWorld = createPrototypeWorld(1847);
  const rester = restWorld.characters["character-01"];
  assert.equal(submitCommand(restWorld, { playerId: PLAYER, type: "character-action", action: "rest" }).ok, true);
  const rested = runTick(restWorld);
  assert.deepEqual(lines(restWorld, rester.id, rested.events).filter((line) => line.startsWith("rested|") || line.includes("player-action") || line.includes("player-command-resolved")), [
    "rested|Mara Vane rested at Crown Harbor.",
  ]);

  const sailWorld = createPrototypeWorld(1847);
  const sailor = sailWorld.characters["character-01"];
  assert.equal(submitCommand(sailWorld, {
    playerId: PLAYER,
    type: "character-action",
    action: "travel",
    targetId: "glassport",
  }).ok, true);
  const sailed = runTick(sailWorld);
  const sailLines = lines(sailWorld, sailor.id, sailed.events);
  assert.equal(sailLines.some((line) => line.startsWith("player-action-executed|")), false);
  assert.equal(sailLines.some((line) => line.startsWith("player-command-resolved|")), false);
  assert.ok(sailLines.includes("travel-started|Mara Vane departed for Glassport"));
});

test("a refusal stays, and the queued line stays", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  const queued = submitCommand(world, { playerId: PLAYER, type: "character-action", action: "rest" });
  assert.equal(queued.ok, true);
  if (!queued.ok) return;
  const [queuedRow] = projectEventFeed(world, mara.id, [queued.event]);
  assert.equal(queuedRow.type, "player-command-accepted");
  assert.equal(queuedRow.summary, "Command queued for Mara Vane: rest at Crown Harbor (from the treasury)");
  mara.travel = { fromId: "crown-harbor", toId: "glassport", totalTicks: 4, remainingTicks: 3 };
  const tick = runTick(world);
  const failed = projectEventFeed(world, mara.id, tick.events).find((row) => row.type === "player-command-failed");
  assert.ok(failed);
  assert.equal(failed.summary, "Mara Vane's command failed: controlled character cannot act while traveling");
  assert.equal(projectEventFeed(world, mara.id, tick.events).some((row) => row.type === "player-command-resolved"), false);
});

test("an empty beforeSequence is no bound, and 0 is still a bound", async () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-feed-polish-"));
  const app = createDashboardApp({ databasePath: join(directory, "dashboard.sqlite"), seed: 1847 });
  try {
    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port");
    const base = `http://127.0.0.1:${address.port}`;
    await fetch(`${base}/api/advance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticks: 1 }),
    });

    type Feed = {
      events: Array<{ sequence: number }>;
      eventPage: { count: number; total: number; hasMore: boolean };
    };

    const missing = await (await fetch(`${base}/api/state?limit=50`)).json() as Feed;
    const empty = await (await fetch(`${base}/api/state?beforeSequence=&limit=50`)).json() as Feed;
    const blank = await (await fetch(`${base}/api/state?beforeSequence=%20&limit=50`)).json() as Feed;
    assert.ok(missing.events.length > 0);
    assert.deepEqual(empty.events.map((event) => event.sequence), missing.events.map((event) => event.sequence));
    assert.deepEqual(blank.events.map((event) => event.sequence), missing.events.map((event) => event.sequence));
    assert.equal(empty.eventPage.count, missing.eventPage.count);
    assert.equal(empty.eventPage.hasMore, missing.eventPage.hasMore);

    const zero = await (await fetch(`${base}/api/state?beforeSequence=0&limit=50`)).json() as Feed;
    assert.equal(zero.events.length, 0);
    assert.equal(zero.eventPage.hasMore, false);

    const invalid = await fetch(`${base}/api/state?beforeSequence=-1`);
    assert.equal(invalid.status, 400);
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
