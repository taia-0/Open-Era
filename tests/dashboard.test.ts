import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDashboardApp } from "../src/dashboard/server.ts";

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
    assert.match(pageHtml, /Retreat now/);

    const initialResponse = await fetch(`${base}/api/state`);
    const initial = await initialResponse.json() as {
      tick: number;
      commanderId: string;
      characters: Array<{ id: string; controller: { kind: string }; knowledge: Record<string, { stocksEstimate: Record<string, number> }> }>;
      settlements: Array<{ id: string; stocks: Record<string, number>; fortification: number | null; stability: number | null; intelligence: { exact: boolean } }>;
    };
    assert.equal(initial.tick, 0);
    assert.equal(initial.characters.find((character) => character.id === initial.commanderId)?.controller.kind, "human");
    const commander = initial.characters.find((character) => character.id === initial.commanderId)!;
    const foreign = initial.settlements.find((settlement) => settlement.id === "cinder-key")!;
    assert.deepEqual(foreign.stocks, commander.knowledge["cinder-key"].stocksEstimate);
    assert.equal(foreign.intelligence.exact, false);
    assert.equal(foreign.fortification, null);
    assert.equal(foreign.stability, null);

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
    };
    assert.equal(final.tick, 1);
    assert.equal(final.pendingCommands.length, 0);
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
    assert.deepEqual(await advance.json(), {
      ok: true,
      tick: 1,
      day: 1 / world.ticksPerDay,
      ticksAdvanced: 1,
      combatUpdated: true,
      pausedForBattle: true,
    });

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
