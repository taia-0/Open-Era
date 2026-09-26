import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { combatForecast } from "../src/sim/combat.ts";
import { submitCommand } from "../src/sim/commands.ts";
import { runTick, travelDuration } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { createDashboardApp } from "../src/dashboard/server.ts";
import { dashboardState, fullEventFeed } from "../src/dashboard/view-model.ts";
import type { SettlementKnowledge } from "../src/sim/types.ts";

function staleReport(settlementId: string, factionId: string | null, garrisonEstimate: number): SettlementKnowledge {
  return {
    settlementId,
    observedTick: 0,
    confidence: 0.4,
    factionId,
    garrisonEstimate,
    stocksEstimate: { provisions: 10, arms: 10, medicine: 10, shipMaterials: 10 },
    priceEstimate: { provisions: 2, arms: 2, medicine: 2, shipMaterials: 2 },
    source: "rumor",
  };
}

test("a forecast for a never-visited settlement cannot be inverted to recover its true defenses", () => {
  const world = createPrototypeWorld(1847);
  const commander = world.characters[world.players["prototype-player"].characterId];
  const target = Object.values(world.settlements).find((entry) => entry.factionId !== null && entry.factionId !== commander.factionId)!;
  commander.locationId = "crown-harbor";
  commander.travel = null;
  commander.captivity = null;
  commander.knowledge = {};
  world.tick = 40;

  // With nothing stored at all.
  const strangerBefore = combatForecast(world, commander.id, target.id);
  const strangerTruth = { fortification: target.fortification, population: target.population, garrison: target.garrison };
  target.fortification = 9.5;
  target.population = 400_000;
  target.garrison = 8_888;
  const strangerAfter = combatForecast(world, commander.id, target.id);
  assert.deepEqual(strangerAfter, strangerBefore, "hidden truth must not move a single projected field");

  // Now with a partial-confidence rumour, which is the realistic case and the
  // one where a confidence-scaled truth term would leak proportionally.
  target.fortification = strangerTruth.fortification;
  target.population = strangerTruth.population;
  target.garrison = strangerTruth.garrison;
  commander.knowledge[target.id] = staleReport(target.id, target.factionId, 240);
  const rumourBefore = combatForecast(world, commander.id, target.id);
  target.fortification = 11.5;
  target.population = 900_000;
  target.garrison = 33_333;
  const rumourAfter = combatForecast(world, commander.id, target.id);

  assert.deepEqual(rumourAfter, rumourBefore, "a rumour must not scale the truth into the projection");
  const serialized = JSON.stringify(rumourAfter);
  for (const truth of [target.fortification, target.population, target.garrison]) {
    assert.ok(!serialized.includes(String(truth)), `the projection must not contain the true value ${truth}`);
  }
  // The honest replacement for the old ground-truth label.
  assert.ok(
    rumourAfter.revealedFactors.includes("defensive ground remains poorly understood"),
    "a remote forecast must admit that the ground is unknown",
  );
});

test("a locally observed forecast still reads the ground exactly", () => {
  const world = createPrototypeWorld(1847);
  const commander = world.characters[world.players["prototype-player"].characterId];
  const target = Object.values(world.settlements).find((entry) => entry.factionId !== null && entry.factionId !== commander.factionId)!;
  commander.locationId = target.id;
  commander.travel = null;
  commander.captivity = null;

  const forecast = combatForecast(world, commander.id, target.id);
  assert.equal(forecast.intelligence.source, "direct");
  assert.ok(
    !forecast.revealedFactors.includes("defensive ground remains poorly understood"),
    "standing on the island must still describe the ground",
  );
  assert.ok(forecast.revealedFactors.some((factor) => factor.includes("defensive ground")));
});

test("a quoted travel time equals the voyage the simulation actually runs", () => {
  const world = createPrototypeWorld(1847);
  const commander = world.characters[world.players["prototype-player"].characterId];
  const destination = Object.values(world.settlements).find((entry) => entry.id !== commander.locationId)!;
  const quoted = travelDuration(world, commander, destination.id);

  const submission = submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "travel",
    targetId: destination.id,
  });
  assert.equal(submission.ok, true);

  const started = runTick(world).events.find((event) => event.type === "travel-started");
  assert.ok(started, "the voyage must start");
  const recorded = started.data.travel as { totalTicks: number };
  assert.equal(recorded.totalTicks, quoted, "the quote must be the duration the voyage uses");
});

test("the island panel cannot be used to read a settlement's true defenses", async () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-inversion-"));
  const app = createDashboardApp({ databasePath: join(directory, "dashboard.sqlite"), seed: 1847 });
  try {
    const world = app.getWorld();
    const commander = world.characters[world.players["prototype-player"].characterId];
    commander.locationId = "crown-harbor";
    commander.travel = null;
    commander.captivity = null;
    const target = Object.values(world.settlements)
      .find((entry) => entry.id !== commander.locationId && entry.factionId !== null && entry.factionId !== commander.factionId)!;
    commander.knowledge[target.id] = staleReport(target.id, target.factionId, 240);
    world.tick = 40;

    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port");
    const base = `http://127.0.0.1:${address.port}`;

    type Panel = {
      combatForecast: unknown;
      travelTicks: number | null;
      travelDays: number | null;
      intelligence: { source: string } | null;
      garrison: number;
      fortification: number | null;
    };
    const read = async (): Promise<Panel> => {
      const state = await (await fetch(`${base}/api/state`)).json() as { settlements: Array<Panel & { id: string }> };
      return state.settlements.find((entry) => entry.id === target.id)!;
    };

    const before = await read();
    assert.ok(before.combatForecast, "a forecast must be available before the commander commits");
    assert.notEqual(before.intelligence?.source, "direct", "this island has not been visited");
    assert.ok(before.travelTicks != null && before.travelTicks > 0, "the voyage must be quoted");

    target.fortification = 11.5;
    target.population = 900_000;
    target.garrison = 33_333;

    const after = await read();
    assert.deepEqual(after.combatForecast, before.combatForecast, "true defenses must not reach the panel");
    assert.equal(after.garrison, before.garrison, "the true garrison must not reach the panel");
    assert.equal(after.fortification, before.fortification, "the true fortification must not reach the panel");
    assert.equal(after.travelTicks, before.travelTicks);
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("declining a surrender keeps the offer answerable and the settlement unclaimed", () => {
  const world = createPrototypeWorld(1847);
  const commander = world.characters[world.players["prototype-player"].characterId];
  const settlement = Object.values(world.settlements)
    .find((entry) => entry.factionId !== null && entry.factionId !== commander.factionId)!;
  const originalFaction = settlement.factionId;
  const originalOwner = settlement.ownerId;
  commander.locationId = settlement.id;
  commander.travel = null;
  commander.captivity = null;
  settlement.surrender = { offeredToId: commander.id, offeredTick: world.tick, previousFactionId: originalFaction! };

  const submission = submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "decline-surrender",
  });
  assert.equal(submission.ok, true);
  assert.ok(settlement.surrender, "the offer must stand until the order resolves");

  const events = runTick(world).events;
  assert.ok(
    events.some((event) => event.type === "settlement-surrender-declined"),
    "declining must be recorded as its own event",
  );
  assert.equal(settlement.surrender, null, "declining must clear the offer");
  assert.equal(settlement.ownerId, originalOwner, "declining must not transfer ownership");
  assert.equal(settlement.factionId, originalFaction, "the settlement stays with its faction");
});

test("a surrender cannot be declined where none is offered", () => {
  const world = createPrototypeWorld(1847);
  const commander = world.characters[world.players["prototype-player"].characterId];
  const settlement = Object.values(world.settlements)
    .find((entry) => entry.factionId !== null && entry.factionId !== commander.factionId)!;
  commander.locationId = settlement.id;
  commander.travel = null;
  settlement.surrender = null;

  const submission = submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "decline-surrender",
  });
  assert.equal(submission.ok, false);
  if (submission.ok) throw new Error("unreachable");
  assert.equal(submission.code, "not-surrendering");
});

/** Mirrors `outlook()` in `src/sim/combat.ts`, so the test can name the reading. */
const OUTLOOK_RANK = ["grave-danger", "underdog", "contested", "favored", "decisive-advantage"] as const;
function rankOf(chance: number): string {
  if (chance >= 72) return "decisive-advantage";
  if (chance >= 58) return "favored";
  if (chance >= 43) return "contested";
  if (chance >= 28) return "underdog";
  return "grave-danger";
}
function rankIndex(label: string): number {
  return OUTLOOK_RANK.indexOf(label as (typeof OUTLOOK_RANK)[number]);
}

test("a remote outlook reads the floor of the range, not the drifting midpoint", () => {
  const world = createPrototypeWorld(1847);
  const commander = world.characters[world.players["prototype-player"].characterId];
  const target = Object.values(world.settlements)
    .find((entry) => entry.factionId !== null && entry.factionId !== commander.factionId)!;
  commander.locationId = "crown-harbor";
  commander.travel = null;
  commander.captivity = null;

  const report = { ...staleReport(target.id, target.factionId, 240), confidence: 1 };
  const forecastAt = (tick: number) => {
    world.tick = tick;
    commander.knowledge[target.id] = { ...report };
    return combatForecast(world, commander.id, target.id);
  };

  const early = forecastAt(20);
  const late = forecastAt(40);
  const earlyMid = rankOf((early.winChance.low + early.winChance.high) / 2);
  const lateMid = rankOf((late.winChance.low + late.winChance.high) / 2);
  const lateFloor = rankOf(late.winChance.low);

  // The reported defect: widening the range moved the midpoint *up*, so the
  // headline read as more confident as the report aged and the commander knew
  // less. Nothing about the floor can do that.
  assert.ok(
    rankIndex(lateMid) > rankIndex(earlyMid),
    `the midpoint must still rise with uncertainty for this test to have teeth (${earlyMid} -> ${lateMid})`,
  );
  assert.ok(
    rankIndex(lateMid) > rankIndex(lateFloor),
    `the two readings must genuinely disagree here (${lateFloor} vs ${lateMid})`,
  );
  assert.equal(late.outlook, lateFloor, "a pre-commitment headline must read the bad case");
  assert.ok(
    rankIndex(late.outlook) < rankIndex(lateMid),
    "a remote forecast must not claim the optimism of its best case",
  );
});

test("a local forecast still reads its own midpoint", () => {
  const world = createPrototypeWorld(1847);
  const commander = world.characters[world.players["prototype-player"].characterId];
  const target = Object.values(world.settlements)
    .find((entry) => entry.factionId !== null && entry.factionId !== commander.factionId)!;
  commander.locationId = target.id;
  commander.travel = null;
  commander.captivity = null;
  world.tick = 40;

  const forecast = combatForecast(world, commander.id, target.id);
  // Standing on the ground means the range is narrow and trustworthy. The
  // headline may use the midpoint there, so the local reading must not regress.
  assert.equal(forecast.intelligence.source, "direct");
  assert.equal(forecast.outlook, rankOf((forecast.winChance.low + forecast.winChance.high) / 2));
});

test("a distant battle neither flags a settlement nor removes a foreign forecast", async () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-distant-battle-"));
  const app = createDashboardApp({ databasePath: join(directory, "dashboard.sqlite"), seed: 1847 });
  try {
    const world = app.getWorld();
    const commander = world.characters[world.players["prototype-player"].characterId];
    commander.locationId = "crown-harbor";
    commander.travel = null;
    commander.captivity = null;
    const target = Object.values(world.settlements)
      .find((entry) => entry.id !== commander.locationId && entry.factionId !== null && entry.factionId !== commander.factionId)!;
    commander.knowledge[target.id] = staleReport(target.id, target.factionId, 240);

    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port");
    const base = `http://127.0.0.1:${address.port}`;
    type Panel = { combatForecast: unknown; battleInProgress: boolean };
    const read = async (): Promise<Panel> => {
      const state = await (await fetch(`${base}/api/state`)).json() as { settlements: Array<Panel & { id: string }> };
      return state.settlements.find((entry) => entry.id === target.id)!;
    };

    const before = await read();
    assert.equal(before.battleInProgress, false);
    assert.ok(before.combatForecast, "a foreign island must offer a forecast");

    // A rival battle rages on the island. The commander is nowhere near it.
    const rival = Object.values(world.characters).find((character) => character.id !== commander.id && character.factionId !== null)!;
    world.activeBattles["distant-battle"] = {
      id: "distant-battle",
      attackerId: rival.id,
      settlementId: target.id,
      defenderFactionId: target.factionId,
      startedTick: world.tick,
      phase: 1,
      totalPhases: 3,
      attackerInitialPower: 100,
      defenderInitialPower: 100,
      attackerInitialTroops: Math.max(10, rival.troops.count),
      defenderInitialGarrison: 100,
      attackerPhaseWins: 0,
      defenderPhaseWins: 0,
      retreatDestinationId: null,
      lastPhase: null,
      startingForecast: combatForecast(world, rival.id, target.id, { observedLocally: true }),
    };

    const after = await read();
    assert.equal(after.battleInProgress, false, "a battle the commander cannot see must not raise a flag");
    assert.deepEqual(
      after.combatForecast,
      before.combatForecast,
      "a hidden battle must not announce itself by removing the forecast",
    );
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the settlement panel and the forecast agree on how stale a report is", async () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-staleness-"));
  const app = createDashboardApp({ databasePath: join(directory, "dashboard.sqlite"), seed: 1847 });
  try {
    const world = app.getWorld();
    const commander = world.characters[world.players["prototype-player"].characterId];
    commander.locationId = "crown-harbor";
    commander.travel = null;
    commander.captivity = null;
    const target = Object.values(world.settlements)
      .find((entry) => entry.id !== commander.locationId && entry.factionId !== null && entry.factionId !== commander.factionId)!;
    commander.knowledge[target.id] = staleReport(target.id, target.factionId, 240);
    world.tick = 90;

    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port");
    const base = `http://127.0.0.1:${address.port}`;
    type Panel = {
      combatForecast: { intelligence: { confidence: number; ageTicks: number | null } } | null;
      intelligence: { confidence: number; ageTicks: number } | null;
    };
    const state = await (await fetch(`${base}/api/state`)).json() as { settlements: Array<Panel & { id: string }> };
    const panel = state.settlements.find((entry) => entry.id === target.id)!;

    assert.ok(panel.intelligence && panel.combatForecast, "both surfaces must be present for this comparison");
    assert.ok(
      panel.intelligence.confidence < 0.4,
      `the panel must apply age decay, not repeat the stored confidence (${panel.intelligence.confidence})`,
    );
    assert.equal(
      panel.intelligence.confidence,
      panel.combatForecast.intelligence.confidence,
      "two surfaces reading the same report must not disagree about its confidence",
    );
    assert.equal(panel.intelligence.ageTicks, panel.combatForecast.intelligence.ageTicks);
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the capability block documents the request contract, not just the rules", async () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-contract-"));
  const app = createDashboardApp({ databasePath: join(directory, "dashboard.sqlite"), seed: 1847 });
  try {
    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port");
    const base = `http://127.0.0.1:${address.port}`;

    const state = await (await fetch(`${base}/api/state`)).json() as {
      capabilities: {
        commandTypes: string[];
        limits: { advancedTicksPerRequest: { min: number; max: number } };
        requests: {
          commands: { path: string; body: Record<string, string> };
          state: { path: string; query: Record<string, string>; response: Record<string, string> };
          advance: { path: string; body: Record<string, string> };
        };
        actions: Array<{ action: string; requires: string[] }>;
      };
    };
    const requests = state.capabilities.requests;
    assert.ok(requests, "the state payload must publish the request contract");
    // Every field a client must send is named, so it is never discovered by trial.
    for (const field of ["playerId", "type", "action", "targetId", "priority"]) {
      assert.ok(requests.commands.body[field], `the command body must document ${field}`);
    }
    // The trade verbs need two fields the contract used to omit, and a playtest
    // had to guess both names. They are documented, and the verbs are published.
    for (const action of ["buy-resource", "sell-resource"]) {
      assert.ok(
        state.capabilities.actions.some((entry) => entry.action === action),
        `${action} must be a published action`,
      );
    }
    for (const field of ["resource", "quantity"]) {
      assert.ok(requests.commands.body[field], `the command body must document ${field}`);
    }
    assert.equal(requests.state.path, "GET /api/state");
    assert.ok(requests.state.query.beforeSequence, "the paging cursor must be documented");
    assert.ok(requests.state.query.limit, "the page limit must be documented");
    // The paging descriptor says where the events are. It used to be called
    // `eventFeed`, which read as though it held them, and a client paged it for
    // events and got an empty result.
    assert.ok(requests.state.response.events, "the contract must say where events live");
    assert.ok(requests.state.response.eventPage, "the page descriptor must be documented");
    assert.ok(
      !("eventFeed" in (await (await fetch(`${base}/api/state`)).json() as Record<string, unknown>)),
      "the misleading eventFeed key must be gone",
    );
    // The published bound must be the one the server actually enforces.
    const limitCeiling = Number(requests.state.query.limit.match(/1\.\.(\d+)/)?.[1]);
    const overLimit = await fetch(`${base}/api/state?limit=${limitCeiling + 1}`);
    assert.equal(overLimit.status, 400, "the published ceiling must be the enforced ceiling");
    const withinLimit = await fetch(`${base}/api/state?limit=${limitCeiling}`);
    assert.equal(withinLimit.status, 200, "the published ceiling must itself be accepted");
    const advanceCeiling = state.capabilities.limits.advancedTicksPerRequest.max;
    assert.ok(
      requests.advance.body.ticks.includes(String(advanceCeiling)),
      "the advance contract must quote the same limit the validator enforces",
    );

    // These routes worked the whole time but went unpublished, which a playtest
    // read as the conversation system not existing. A route is only documented
    // if a client can act on the documentation, so each is called as published.
    const conversations = requests as unknown as Record<string, { path: string; body: Record<string, string> }>;
    const published = ["briefingAcknowledge", "briefingOfficer", "threads", "messages"] as const;
    assert.equal(conversations.threads.path, "POST /api/threads");
    assert.equal(conversations.messages.path, "POST /api/messages");
    assert.equal(conversations.briefingOfficer.path, "POST /api/briefing/officer");
    assert.equal(conversations.briefingAcknowledge.path, "POST /api/briefing/acknowledge");

    for (const name of published) {
      const entry = conversations[name];
      const [method, route] = entry.path.split(" ");
      const served = await fetch(`${base}${route}`, {
        method,
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      assert.notEqual(served.status, 404, `${name} is published as ${entry.path} but nothing serves it`);
    }

    const roster = await (await fetch(`${base}/api/state`)).json() as { characters: Array<{ id: string }> };
    const peer = roster.characters.find((character) => character.id !== "character-01")!;
    const threadResponse = await fetch(`${base}/api/threads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: "prototype-player", kind: "direct", participantIds: [peer.id], title: "Check-in" }),
    });
    assert.equal(threadResponse.status, 201, "the published thread body must be the accepted body");
    const thread = (await threadResponse.json() as { thread: { id: string } }).thread;

    const messageResponse = await fetch(`${base}/api/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: "prototype-player", threadId: thread.id, body: "Report in." }),
    });
    assert.equal(messageResponse.status, 202, "the published message body must be the accepted body");

    // Acknowledging an id that names nothing is a no-op, not a false success
    // about a decision: an action-required id is still refused.
    const refused = await fetch(`${base}/api/briefing/acknowledge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: "prototype-player", itemId: "confirm:character-02:order-00001" }),
    });
    assert.equal(refused.status, 400, "an unresolved decision must not be acknowledgeable");
    assert.equal((await refused.json() as { code: string }).code, "action-required");
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("standing in a settlement shows the ground the forecast already describes", () => {
  const world = createPrototypeWorld(1847);
  const commander = world.characters[world.players["prototype-player"].characterId];
  const target = Object.values(world.settlements)
    .find((entry) => entry.factionId !== null && entry.factionId !== commander.factionId)!;
  commander.travel = null;
  commander.captivity = null;
  commander.knowledge[target.id] = staleReport(target.id, target.factionId, 400);
  world.tick = 60;

  const panel = (settlementId: string) => {
    const state = dashboardState(world, [], fullEventFeed([])) as {
      settlements: Array<{
        id: string;
        population: number | null;
        fortification: number | null;
        garrison: number | null;
        intelligence: { source: string } | null;
        combatForecast: { revealedFactors: string[] } | null;
      }>;
    };
    return state.settlements.find((entry) => entry.id === settlementId)!;
  };

  // From a distance the ground is unknown, and the panel says so.
  commander.locationId = "crown-harbor";
  const remote = panel(target.id);
  assert.equal(remote.fortification, null);
  assert.equal(remote.population, null);

  // Standing there is direct perception. Before this, the forecast's factor line
  // quoted a fortification multiple for an island whose own panel read
  // "fortification unknown", which is the contradiction a playtest caught.
  commander.locationId = target.id;
  const present = panel(target.id);
  assert.equal(present.fortification, target.fortification);
  assert.equal(present.population, target.population);
  assert.equal(present.garrison, target.garrison);
  assert.ok(
    present.combatForecast?.revealedFactors.length,
    "the panel and the forecast must be describing the same ground",
  );

  // And it does not persist. Nothing stored records the ground of a place the
  // commander has left, so the panel must not keep claiming to know it.
  commander.locationId = "crown-harbor";
  const departed = panel(target.id);
  assert.equal(departed.fortification, null, "a departed commander does not retain the walls");
  assert.equal(departed.population, null);
});
