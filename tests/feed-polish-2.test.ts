import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDashboardApp } from "../src/dashboard/server.ts";
import { dashboardState, fullEventFeed, projectEventFeed } from "../src/dashboard/view-model.ts";
import { submitCommand } from "../src/sim/commands.ts";
import { runTick } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import type { SimEvent, WorldState } from "../src/sim/types.ts";

/**
 * Feed polish 2. Dashboard sentences and page counts. The simulation is unchanged.
 */

const PLAYER = "prototype-player";

function listen(app: ReturnType<typeof createDashboardApp>): Promise<string> {
  return new Promise((resolve) => {
    app.server.listen(0, "127.0.0.1", () => {
      const address = app.server.address();
      if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port");
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

test("a submit-time refusal is a feed row and the HTTP body stays the refusal", async () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-feed-polish-2-"));
  const app = createDashboardApp({ databasePath: join(directory, "dashboard.sqlite"), seed: 1847, reset: true });
  try {
    const base = await listen(app);
    const post = (path: string, body: unknown) => fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const queued = await post("/api/commands", {
      playerId: PLAYER,
      type: "character-action",
      action: "travel",
      targetId: "glassport",
    });
    assert.equal(queued.status, 202);
    const beforeAdvance = await (await fetch(`${base}/api/state?limit=200`)).json() as {
      events: Array<{ sequence: number; summary: string }>;
    };
    assert.equal(
      beforeAdvance.events.find((event) => event.sequence === 1)?.summary,
      "Command queued for Mara Vane: travel from Crown Harbor to Glassport (from the treasury)",
    );
    await post("/api/advance", { ticks: 1 });
    const before = await (await fetch(`${base}/api/state?limit=200`)).json() as {
      eventPage: { total: number; count: number };
    };
    const refused = await post("/api/commands", { playerId: PLAYER, type: "character-action", action: "rest" });
    assert.equal(refused.status, 400);
    assert.deepEqual(await refused.json(), {
      ok: false,
      code: "character-traveling",
      error: "The character is already traveling",
    });
    const after = await (await fetch(`${base}/api/state?limit=200`)).json() as {
      events: Array<{ type: string; sequence: number | null; summary: string; payloadWithheld: boolean; data: unknown }>;
      eventPage: { total: number; count: number };
    };
    const row = after.events.find((event) => event.type === "command-refused");
    assert.ok(row);
    assert.equal(row.summary, "Mara Vane's command failed: The character is already traveling");
    assert.equal(row.sequence, null);
    assert.equal(row.payloadWithheld, false);
    assert.equal(row.data, null);
    assert.equal(after.eventPage.total, before.eventPage.total);
    assert.equal(after.eventPage.count, after.events.length);
    assert.equal(after.events[0]?.type, "command-refused");
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("event page count and total are the projected rows, and sequence gaps are the omitted action rows", async () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-feed-polish-2-count-"));
  const app = createDashboardApp({ databasePath: join(directory, "dashboard.sqlite"), seed: 1847, reset: true });
  try {
    const base = await listen(app);
    await fetch(`${base}/api/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: PLAYER, type: "character-action", action: "buy-provisions", source: "purse" }),
    });
    await fetch(`${base}/api/advance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticks: 1 }),
    });
    const state = await (await fetch(`${base}/api/state?limit=200`)).json() as {
      events: Array<{ sequence: number; type: string }>;
      eventPage: { count: number; total: number; hasMore: boolean; oldestSequence: number; newestSequence: number };
      capabilities: { requests: { state: { response: { eventPage: string } } } };
    };
    const health = await (await fetch(`${base}/api/health`)).json() as { events: number };
    assert.equal(state.eventPage.hasMore, false);
    assert.equal(state.eventPage.count, state.events.length);
    assert.equal(state.eventPage.total, state.events.length);
    assert.equal(state.eventPage.count, 184);
    assert.equal(health.events, 186);
    assert.equal(state.events.some((event) => event.type === "player-action-executed" || event.type === "player-command-resolved"), false);
    const sequences = new Set(state.events.map((event) => event.sequence));
    assert.equal(sequences.has(10), false);
    assert.equal(sequences.has(12), false);
    assert.equal(state.eventPage.oldestSequence, state.events.at(-1)?.sequence);
    assert.equal(state.eventPage.newestSequence, state.events[0]?.sequence);
    assert.match(state.capabilities.requests.state.response.eventPage, /player-action-executed/);
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Breakwater's line says the treasury starts empty, and the breakdown is the same-tick tax", () => {
  const world = createPrototypeWorld(1847);
  const events: SimEvent[] = [];
  const command = (body: Parameters<typeof submitCommand>[1]) => {
    const result = submitCommand(world, body);
    assert.equal(result.ok, true);
    if (result.ok) events.push(result.event);
  };
  const advance = (ticks: number) => {
    for (let index = 0; index < ticks; index += 1) events.push(...runTick(world, { liveSession: true }).events);
  };
  command({ playerId: PLAYER, type: "character-action", action: "travel", targetId: "cinder-key" });
  advance(6);
  command({ playerId: PLAYER, type: "character-action", action: "raid" });
  advance(3);
  command({ playerId: PLAYER, type: "character-action", action: "raid" });
  advance(3);
  command({ playerId: PLAYER, type: "character-action", action: "raid" });
  advance(1);
  command({ playerId: PLAYER, type: "character-action", action: "claim-settlement" });
  advance(1);
  command({ playerId: PLAYER, type: "declare-secession", settlementId: "cinder-key", name: "Breakwater" });
  advance(1);
  const view = dashboardState(world, events, fullEventFeed(events)) as {
    events: Array<{ type: string; summary: string; data: { faction?: { treasury?: number } } | null }>;
    factions: Array<{ id: string; name: string; treasury: number | null; treasuryLine: string | null }>;
  };
  const line = view.events.find((event) => event.type === "secession-declared");
  assert.equal(
    line?.summary,
    "Mara Vane declared Cinder Key separate from World Government. Breakwater starts with an empty treasury. Jun Marrow takes the seat.",
  );
  assert.equal(line?.data?.faction?.treasury, 0);
  const breakwater = view.factions.find((faction) => faction.name === "Breakwater");
  assert.equal(breakwater?.treasury, 2.69);
  assert.equal(breakwater?.treasuryLine, "Tax income 2.69, spending 0, over the last 180 ticks.");
  const rival = view.factions.find((faction) => faction.id === "free-tide");
  assert.equal(rival?.treasuryLine, null);
});

test("an autonomous tax set names the reason, and settlementId is null", () => {
  const raised = createPrototypeWorld(1847);
  raised.tick = 24;
  for (const settlement of Object.values(raised.settlements)) {
    if (settlement.factionId === "free-tide") settlement.stability = 90;
  }
  raised.factions["free-tide"].treasury = 1;
  const raisedTick = runTick(raised);
  const raisedEvent = raisedTick.events.find((event) => event.type === "tax-rate-set");
  assert.ok(raisedEvent);
  const raisedRow = projectEventFeed(raised, "character-01", [raisedEvent], raisedTick.events)[0];
  assert.equal(raisedRow.summary, "Pax Ash raised the Free Tide Compact tax to 9% (treasury short).");
  assert.equal(raisedRow.settlementId, null);
  assert.equal(Object.hasOwn(raisedRow, "settlementId"), true);
  assert.equal(raisedRow.payloadWithheld, true);
  assert.equal(raisedRow.data, null);

  const lowered = createPrototypeWorld(1847);
  lowered.tick = 24;
  for (const settlement of Object.values(lowered.settlements)) {
    if (settlement.factionId === "free-tide") settlement.stability = 10;
  }
  lowered.factions["free-tide"].treasury = 100_000;
  const loweredTick = runTick(lowered);
  const loweredEvent = loweredTick.events.find((event) => event.type === "tax-rate-set");
  assert.ok(loweredEvent);
  const loweredRow = projectEventFeed(lowered, "character-01", [loweredEvent], loweredTick.events)[0];
  assert.equal(loweredRow.summary, "Pax Ash lowered the Free Tide Compact tax to 7% (unrest at Cinder Key).");
  assert.equal(loweredRow.settlementId, null);

  const player = createPrototypeWorld(1847);
  const queued = submitCommand(player, { playerId: PLAYER, type: "set-tax-rate", taxRate: 0.12 });
  assert.equal(queued.ok, true);
  if (!queued.ok) return;
  const playerTick = runTick(player);
  const playerEvent = playerTick.events.find((event) => event.type === "tax-rate-set");
  assert.ok(playerEvent);
  const playerRow = projectEventFeed(player, "character-01", [playerEvent], playerTick.events)[0];
  assert.equal(playerRow.summary, "Mara Vane set the World Government tax rate to 12%.");
  assert.equal(playerRow.settlementId, null);
});

test("an autonomous secession with no successor ends with no leader yet", () => {
  const world = createPrototypeWorld(1847);
  const declared: SimEvent[] = [];
  let siblings: SimEvent[] = [];
  for (let index = 0; index < 439; index += 1) {
    const tick = runTick(world, { liveSession: true });
    const rows = tick.events.filter((event) => event.type === "secession-declared");
    if (rows.length > 0) {
      declared.push(...rows);
      siblings = tick.events;
      break;
    }
  }
  assert.equal(world.tick, 439);
  assert.equal(declared.length, 2);
  const view = projectEventFeed(world, "character-01", declared, siblings);
  assert.equal(
    view.find((row) => row.settlementId === "crown-harbor")?.summary,
    "Corin Hale declared Crown Harbor separate from Free Tide Compact. Free Crown Harbor starts with an empty treasury. (no leader yet)",
  );
  assert.equal(
    view.find((row) => row.settlementId === "glassport")?.summary,
    "Mina Vale declared Glassport separate from Free Tide Compact. Free Glassport starts with an empty treasury. (no leader yet)",
  );
  assert.equal(view.every((row) => row.payloadWithheld === true && row.data === null), true);
  assert.equal(declared.every((event) => event.data.successorId === null), true);
});

test("a world with no events still publishes the treasury line for the viewer's faction", () => {
  const world: WorldState = createPrototypeWorld(1847);
  const view = dashboardState(world, [], fullEventFeed([])) as {
    factions: Array<{ id: string; treasuryLine: string | null }>;
  };
  assert.equal(
    view.factions.find((faction) => faction.id === "world-government")?.treasuryLine,
    "Tax income 0, spending 0, over the last 180 ticks.",
  );
  assert.equal(view.factions.find((faction) => faction.id === "free-tide")?.treasuryLine, null);
});
