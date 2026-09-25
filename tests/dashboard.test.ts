import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { combatForecast } from "../src/sim/combat.ts";
import { createDashboardApp } from "../src/dashboard/server.ts";

/**
 * The stable part of an `/api/advance` response. The response also carries the
 * projected event diff, which is asserted separately.
 */
function advanceShape(body: {
  ok: boolean;
  tick: number;
  day: number;
  ticksAdvanced: number;
  combatUpdated: boolean;
  attentionUpdated: boolean;
  pausedForBattle: boolean;
}): Record<string, unknown> {
  return {
    ok: body.ok,
    tick: body.tick,
    day: body.day,
    ticksAdvanced: body.ticksAdvanced,
    combatUpdated: body.combatUpdated,
    attentionUpdated: body.attentionUpdated,
    pausedForBattle: body.pausedForBattle,
  };
}

test("the local dashboard serves state and executes its command API", async () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-dashboard-"));
  const app = createDashboardApp({ databasePath: join(directory, "dashboard.sqlite"), seed: 1847 });
  try {
    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port");
    const base = `http://127.0.0.1:${address.port}`;

    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    const pageHtml = await page.text();
    assert.match(pageHtml, /Open Era/);
    assert.match(pageHtml, /Accept surrender &amp; claim/);
    assert.match(pageHtml, /Exception-first check-in/);
    assert.match(pageHtml, /Queue amendment/);
    assert.match(pageHtml, /Combat forecast/);
    assert.match(pageHtml, /Retreat toward/);

    const initialResponse = await fetch(`${base}/api/state`);
    const initial = await initialResponse.json() as {
      tick: number;
      commanderId: string;
      characters: Array<{
        id: string;
        controller: { kind: string };
        knowledge: Record<string, { stocksEstimate: Record<string, number> }> | null;
        plan: unknown;
        activeGoal: unknown;
        skills: unknown;
        personality: unknown;
        intelligence: { tier: string; conditionExact: boolean; capabilityExact: boolean };
      }>;
      factions: Array<{ id: string; power: number | null; intelligence: { exact: boolean } }>;
      settlements: Array<{ id: string; stocks: Record<string, number>; fortification: number | null; stability: number | null; intelligence: { exact: boolean } }>;
    };
    assert.equal(initial.tick, 0);
    assert.equal(initial.characters.find((character) => character.id === initial.commanderId)?.controller.kind, "human");
    const commander = initial.characters.find((character) => character.id === initial.commanderId)!;
    const commanderKnowledge = commander.knowledge;
    assert.ok(commanderKnowledge, "the commander must retain their own knowledge");
    const foreign = initial.settlements.find((settlement) => settlement.id === "cinder-key")!;
    assert.deepEqual(foreign.stocks, commanderKnowledge["cinder-key"].stocksEstimate);
    assert.equal(foreign.intelligence.exact, false);
    assert.equal(foreign.fortification, null);
    assert.equal(foreign.stability, null);

    // The commander's own mind is exact.
    assert.equal(commander.intelligence.tier, "self");
    assert.equal(commander.intelligence.capabilityExact, true);
    assert.notEqual(commander.personality, null, "the commander's own personality remains visible");

    // A character the commander cannot observe must not leak motive or capability.
    const distant = initial.characters.find((character) => character.intelligence.tier === "distant");
    assert.ok(distant, "the scenario must contain a character outside the commander's observation");
    assert.equal(distant.plan, null, "foreign plans must not cross the player boundary");
    assert.equal(distant.knowledge, null, "foreign beliefs must not cross the player boundary");
    assert.equal(distant.activeGoal, null);
    assert.equal(distant.skills, null);
    assert.equal(distant.personality, null);
    assert.notEqual(distant.skills, 0, "unknown capability must not be reported as zero");

    // Faction strength is exact only for the commander's own faction.
    const ownFaction = initial.factions.find((faction) =>
      initial.characters.find((character) => character.id === initial.commanderId)?.intelligence.tier === "self" &&
      faction.intelligence.exact,
    );
    assert.ok(ownFaction, "the commander's own faction power must remain exact");
    assert.equal(typeof ownFaction.power, "number");
    for (const faction of initial.factions.filter((entry) => !entry.intelligence.exact)) {
      assert.equal(faction.power, null, `${faction.id} power must be withheld`);
    }

    const commandResponse = await fetch(`${base}/api/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        playerId: "prototype-player",
        type: "issue-order",
        characterId: "character-04",
        directive: "protect",
        targetId: "glassport",
        priority: 0.95,
        expiresInTicks: 72,
      }),
    });
    assert.equal(commandResponse.status, 202);

    const advanceResponse = await fetch(`${base}/api/advance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticks: 1 }),
    });
    assert.equal(advanceResponse.status, 200);

    const final = await (await fetch(`${base}/api/state`)).json() as {
      tick: number;
      pendingCommands: unknown[];
      briefing: {
        attentionCount: number;
        reportingOfficer: { id: string } | null;
        items: Array<{ id: string; action?: string; characterId?: string; orderId?: string; routed?: boolean; throughSequence?: number }>;
      };
      characters: Array<{ id: string; standingOrders: Array<{ id: string; status: string; revision: number }> }>;
      events: Array<{ type: string; data: unknown; payloadWithheld: boolean }>;
    };
    assert.equal(final.tick, 1);
    assert.equal(final.pendingCommands.length, 0);
    assert.ok(final.events.length > 0, "the feed must report the events that occurred");

    // No event may ship a payload the commander did not earn.
    for (const event of final.events) {
      if (event.payloadWithheld) {
        assert.equal(event.data, null, `${event.type} withheld its payload but still shipped data`);
      }
    }
    assert.ok(final.characters.find((character) => character.id === "character-04")?.standingOrders.some((order) => order.id === "command-00001:standing-order"));
    assert.equal(final.briefing.reportingOfficer?.id, "character-05");
    const digest = final.briefing.items.find((item) => item.routed);
    assert.ok(digest?.throughSequence);
    const acknowledgeResponse = await fetch(`${base}/api/briefing/acknowledge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        playerId: "prototype-player",
        itemId: digest.id,
        routineThroughSequence: digest.throughSequence,
      }),
    });
    assert.equal(acknowledgeResponse.status, 200);
    const afterAcknowledgement = await (await fetch(`${base}/api/state`)).json() as {
      briefing: { items: Array<{ routed?: boolean }> };
    };
    assert.ok(!afterAcknowledgement.briefing.items.some((item) => item.routed));

    const officerResponse = await fetch(`${base}/api/briefing/officer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: "prototype-player", characterId: "character-10" }),
    });
    assert.equal(officerResponse.status, 200);
    const afterOfficer = await (await fetch(`${base}/api/state`)).json() as {
      briefing: { reportingOfficer: { id: string } | null };
    };
    assert.equal(afterOfficer.briefing.reportingOfficer?.id, "character-10");

    // The officer field accepts its natural alias, and a body naming no officer
    // is rejected with a message that says what to send.
    const aliasResponse = await fetch(`${base}/api/briefing/officer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: "prototype-player", officerId: "character-05" }),
    });
    assert.equal(aliasResponse.status, 200);
    const afterAlias = await (await fetch(`${base}/api/state`)).json() as {
      briefing: { reportingOfficer: { id: string } | null };
    };
    assert.equal(afterAlias.briefing.reportingOfficer?.id, "character-05");

    const noOfficer = await fetch(`${base}/api/briefing/officer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: "prototype-player" }),
    });
    assert.equal(noOfficer.status, 400);
    assert.match((await noOfficer.json() as { error: string }).error, /characterId/);

    const amendmentResponse = await fetch(`${base}/api/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        playerId: "prototype-player",
        type: "amend-order",
        characterId: "character-04",
        orderId: "command-00001:standing-order",
        priority: 0.88,
        expiresInTicks: 90,
      }),
    });
    assert.equal(amendmentResponse.status, 202);
    assert.equal((await fetch(`${base}/api/advance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticks: 1 }),
    })).status, 200);
    const afterAmendment = await (await fetch(`${base}/api/state`)).json() as {
      characters: Array<{ id: string; standingOrders: Array<{ id: string; revision: number; priority: number }> }>;
    };
    const amended = afterAmendment.characters.find((character) => character.id === "character-04")
      ?.standingOrders.find((order) => order.id === "command-00001:standing-order");
    assert.equal(amended?.revision, 2);
    assert.equal(amended?.priority, 0.88);

    const completion = final.briefing.items.find((item) => item.action === "confirm-order");
    assert.ok(completion?.characterId && completion.orderId);

    const confirmResponse = await fetch(`${base}/api/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        playerId: "prototype-player",
        type: "confirm-order",
        characterId: completion.characterId,
        orderId: completion.orderId,
      }),
    });
    assert.equal(confirmResponse.status, 202);
    assert.equal((await fetch(`${base}/api/advance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticks: 1 }),
    })).status, 200);
    const afterConfirmation = await (await fetch(`${base}/api/state`)).json() as {
      characters: Array<{ id: string; standingOrders: Array<{ id: string; status: string }> }>;
    };
    assert.equal(
      afterConfirmation.characters.find((character) => character.id === completion.characterId)
        ?.standingOrders.find((order) => order.id === completion.orderId)?.status,
      "completed",
    );

    const threadResponse = await fetch(`${base}/api/threads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: "prototype-player", kind: "direct", participantIds: ["character-02"] }),
    });
    assert.equal(threadResponse.status, 201);
    const threadBody = await threadResponse.json() as { thread: { id: string } };
    const messageResponse = await fetch(`${base}/api/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: "prototype-player", threadId: threadBody.thread.id, body: "Urgent: please report." }),
    });
    assert.equal(messageResponse.status, 202);
    const messageBody = await messageResponse.json() as { replies: Array<{ dueTick: number }> };
    assert.equal(messageBody.replies.length, 1);
    const dueTick = messageBody.replies[0].dueTick;
    const chatAdvance = await fetch(`${base}/api/advance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticks: dueTick - 1 }),
    });
    assert.equal(chatAdvance.status, 200);
    const withReply = await (await fetch(`${base}/api/state`)).json() as { conversations: { messages: Array<{ source: string }> } };
    assert.equal(withReply.conversations.messages.length, 2);
    assert.equal(withReply.conversations.messages.at(-1)?.source, "autonomous");
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("accelerated time pauses at a player battle phase", async () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-dashboard-combat-"));
  const app = createDashboardApp({ databasePath: join(directory, "dashboard.sqlite"), seed: 2718 });
  try {
    const world = app.getWorld();
    const commander = world.characters[world.players["prototype-player"].characterId];
    const settlement = world.settlements["cinder-key"];
    commander.locationId = settlement.id;
    commander.travel = null;
    commander.troops.count = 90;
    settlement.garrison = 120;
    settlement.stability = 72;
    settlement.surrender = null;

    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port");
    const base = `http://127.0.0.1:${address.port}`;

    const command = await fetch(`${base}/api/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: "prototype-player", type: "character-action", action: "raid" }),
    });
    assert.equal(command.status, 202);

    const advance = await fetch(`${base}/api/advance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticks: 24 }),
    });
    assert.equal(advance.status, 200);
    const advanceBody = await advance.json() as {
      ok: boolean;
      tick: number;
      day: number;
      ticksAdvanced: number;
      combatUpdated: boolean;
      attentionUpdated: boolean;
      pausedForBattle: boolean;
      eventSequence: number;
      events: Array<{ type: string; payloadWithheld: boolean; data: unknown }>;
    };
    assert.deepEqual(advanceShape(advanceBody), {
      ok: true,
      tick: 1,
      day: 1 / world.ticksPerDay,
      ticksAdvanced: 1,
      combatUpdated: true,
      attentionUpdated: false,
      pausedForBattle: true,
    });
    // A step reports what it produced rather than forcing a follow-up read, and
    // everything it reports must already be redacted.
    assert.ok(advanceBody.events.length > 0, "advance must report the events that occurred");
    assert.ok(advanceBody.eventSequence > 0, "advance must report the sequence it reached");
    for (const event of advanceBody.events) {
      if (event.payloadWithheld) assert.equal(event.data, null, `${event.type} withheld its payload but still shipped data`);
    }

    const state = await (await fetch(`${base}/api/state`)).json() as {
      combat: { active: { phase: number; canRetreat: boolean } | null };
      briefing: { items: Array<{ action?: string }> };
    };
    assert.equal(state.combat.active?.phase, 1);
    assert.equal(state.combat.active?.canRetreat, true);
    assert.ok(state.briefing.items.some((item) => item.action === "review-battle"));
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("accelerated time pauses when mandatory captivity release changes player state", async () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-dashboard-captivity-"));
  const app = createDashboardApp({ databasePath: join(directory, "dashboard.sqlite"), seed: 1847 });
  try {
    const world = app.getWorld();
    const commander = world.characters[world.players["prototype-player"].characterId];
    commander.locationId = "cinder-key";
    commander.troops.count = 0;
    commander.money = 20;
    commander.captivity = {
      captorFactionId: "free-tide",
      settlementId: "cinder-key",
      capturedTick: -14 * world.ticksPerDay,
      mandatoryReleaseTick: 0,
      cause: "major-defeat",
      displayedRisk: "high",
      scatteredTroops: { count: 30, experience: 0.5, discipline: 0.6 },
      releaseDestinationId: "glassport",
    };

    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port");
    const base = `http://127.0.0.1:${address.port}`;
    const advance = await fetch(`${base}/api/advance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticks: 24 }),
    });
    const advanceBody = await advance.json() as {
      ok: boolean;
      tick: number;
      day: number;
      ticksAdvanced: number;
      combatUpdated: boolean;
      attentionUpdated: boolean;
      pausedForBattle: boolean;
      eventSequence: number;
      events: unknown[];
    };
    assert.deepEqual(advanceShape(advanceBody), {
      ok: true,
      tick: 1,
      day: 1 / world.ticksPerDay,
      ticksAdvanced: 1,
      combatUpdated: false,
      attentionUpdated: true,
      pausedForBattle: false,
    });
    assert.ok(advanceBody.events.length > 0, "advance must report the events that occurred");
    const state = await (await fetch(`${base}/api/state`)).json() as {
      captivity: { active: unknown };
      briefing: { items: Array<{ title: string; summary: string }> };
    };
    assert.equal(state.captivity.active, null);
    assert.ok(state.briefing.items.some((item) =>
      item.title === "captivity released" && item.summary.includes("recorded as debt")
    ));
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the event feed is paged by cursor and cannot be read past the page", async () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-feed-"));
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
      events: Array<{ sequence: number; type: string; data: unknown; payloadWithheld: boolean }>;
      eventFeed: { count: number; limit: number; total: number; hasMore: boolean; oldestSequence: number; newestSequence: number; cursor: number };
    };

    const first = await (await fetch(`${base}/api/state?limit=50`)).json() as Feed;
    assert.equal(first.eventFeed.count, 50, "the page must honour the requested size");
    assert.equal(first.eventFeed.limit, 50);
    assert.ok(first.eventFeed.total > 50, "the world must have enough history to page");
    assert.equal(first.eventFeed.hasMore, true);
    assert.ok(first.eventFeed.newestSequence > first.eventFeed.oldestSequence);

    const second = await (await fetch(`${base}/api/state?beforeSequence=${first.eventFeed.cursor}&limit=50`)).json() as Feed;
    assert.equal(second.eventFeed.count, 50);
    const firstSequences = new Set(first.events.map((event) => event.sequence));
    for (const event of second.events) {
      assert.ok(event.sequence < first.eventFeed.cursor, `${event.sequence} must be older than the cursor`);
      assert.ok(!firstSequences.has(event.sequence), `${event.sequence} must not repeat across pages`);
    }

    // A page is projected exactly like the feed, so a withheld payload stays withheld.
    for (const event of [...first.events, ...second.events]) {
      if (event.payloadWithheld) assert.equal(event.data, null, `${event.type} withheld its payload but still shipped data`);
    }

    // Reading past the beginning of history returns an empty page, not an error.
    const beyond = await (await fetch(`${base}/api/state?beforeSequence=1&limit=50`)).json() as Feed;
    assert.equal(beyond.events.length, 0);
    assert.equal(beyond.eventFeed.hasMore, false);

    for (const path of ["/api/state?limit=0", "/api/state?limit=201", "/api/state?limit=abc", "/api/state?beforeSequence=-1"]) {
      const invalid = await fetch(`${base}${path}`);
      assert.equal(invalid.status, 400, `${path} must be rejected`);
    }
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("battle authority separates a commanded battle from an observed one", async () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-authority-"));
  const app = createDashboardApp({ databasePath: join(directory, "dashboard.sqlite"), seed: 1847 });
  try {
    const world = app.getWorld();
    const commander = world.characters[world.players["prototype-player"].characterId];
    commander.locationId = "cinder-key";
    commander.travel = null;
    commander.captivity = null;
    // A rival leads a battle where the commander is standing.
    const rival = Object.values(world.characters).find((character) => character.id !== commander.id && character.factionId !== null)!;
    rival.locationId = "cinder-key";
    rival.travel = null;
    for (const settlementId of ["cinder-key", "glassport"]) {
      const id = `battle-authority-${settlementId}`;
      world.activeBattles[id] = {
        id,
        attackerId: rival.id,
        settlementId,
        defenderFactionId: world.settlements[settlementId].factionId,
        startedTick: 0,
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
        startingForecast: combatForecast(world, rival.id, settlementId),
      };
    }

    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port");
    const base = `http://127.0.0.1:${address.port}`;

    const state = await (await fetch(`${base}/api/state`)).json() as {
      combat: {
        commandedBattle: unknown;
        observedBattles: Array<{ attackerName: string; settlementId: string; phase: number }>;
        active: unknown;
      };
      settlements: Array<{ id: string; battleInProgress: boolean }>;
    };

    // The reported defect: `active` was null while battleInProgress was true,
    // with nothing saying why. The reason is now explicit and the two agree.
    assert.equal(state.combat.commandedBattle, null, "the commander is not leading this battle");
    assert.equal(state.combat.active, null, "the compatibility alias must agree with the explicit name");
    assert.equal(state.settlements.find((entry) => entry.id === "cinder-key")?.battleInProgress, true);

    assert.equal(state.combat.observedBattles.length, 1, "only the co-located battle is observable");
    assert.equal(state.combat.observedBattles[0].settlementId, "cinder-key");
    assert.equal(state.combat.observedBattles[0].phase, 1);
    assert.ok(state.combat.observedBattles[0].attackerName, "an observed battle must name its attacker");
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the published command capabilities match what the boundary accepts", async () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-capabilities-"));
  const app = createDashboardApp({ databasePath: join(directory, "dashboard.sqlite"), seed: 1847 });
  try {
    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port");
    const base = `http://127.0.0.1:${address.port}`;

    const state = await (await fetch(`${base}/api/state`)).json() as {
      capabilities: {
        limits: { orderPriority: { min: number; max: number; default: number }; orderDurationTicks: { min: number; max: number }; advancedTicksPerRequest: { min: number; max: number } };
        actions: Array<{ action: string; target: string; requires: string[] }>;
        directives: Array<{ directive: string; target: string }>;
        actionPreconditions: string[];
        orderPreconditions: string[];
      };
    };

    assert.deepEqual(state.capabilities.limits.orderPriority, { min: 0.1, max: 1, default: 0.78 });
    const actions = state.capabilities.actions.map((entry) => entry.action);
    for (const action of ["travel", "buy-provisions", "trade-local", "work", "recruit", "raid", "claim-settlement", "rest"]) {
      assert.ok(actions.includes(action), `${action} must be documented`);
    }
    const directives = state.capabilities.directives.map((entry) => entry.directive);
    assert.deepEqual(directives.sort(), ["explore", "pressure", "protect", "trade-supplies"]);
    // The documented target kinds must match the validator, not a wish.
    assert.equal(state.capabilities.directives.find((entry) => entry.directive === "pressure")?.target, "faction");
    assert.equal(state.capabilities.directives.find((entry) => entry.directive === "protect")?.target, "settlement");
    assert.ok(state.capabilities.actionPreconditions.length > 0);
    assert.ok(state.capabilities.orderPreconditions.length > 0);

    // A rejection now names the supported values instead of only refusing.
    const rejected = await fetch(`${base}/api/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: "prototype-player", type: "character-action", action: "teleport" }),
    });
    assert.equal(rejected.status, 400);
    const rejection = await rejected.json() as { error: string };
    assert.match(rejection.error, /travel/, "the error must name what is accepted");

    // The pressure-order rejection names the expected target kind.
    const pressure = await fetch(`${base}/api/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: "prototype-player", type: "issue-order", characterId: "character-04", directive: "pressure", targetId: "glassport" }),
    });
    assert.equal(pressure.status, 400);
    assert.match((await pressure.json() as { error: string }).error, /faction/i);
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
