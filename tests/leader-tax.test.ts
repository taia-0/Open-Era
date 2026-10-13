import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { projectEventFeed } from "../src/dashboard/view-model.ts";
import { projectFactions } from "../src/dashboard/visibility.ts";
import { createDashboardApp } from "../src/dashboard/server.ts";
import { commandCapabilities, submitCommand } from "../src/sim/commands.ts";
import { runTick, runTicks, workGross } from "../src/sim/engine.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { applyEvent, round, stateHash } from "../src/sim/state.ts";
import type { Character, SimEvent, WorldState } from "../src/sim/types.ts";

/**
 * Slice 1. The free command holder sets the faction tax rate. Headless runs
 * do not. `taxRateSetTick` stays off the faction until the first set.
 */

const PLAYER = "prototype-player";

function refusal(world: WorldState, taxRate: number): { code: string; error: string } {
  const result = submitCommand(world, { playerId: PLAYER, type: "set-tax-rate", taxRate });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  return result;
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

function forceCapture(world: WorldState, characterId: string): void {
  const character = world.characters[characterId];
  const settlementId = character.locationId ?? "crown-harbor";
  const settlement = world.settlements[settlementId];
  applyEvent(world, {
    sequence: world.nextEventSequence,
    tick: world.tick,
    type: "character-captured",
    actorId: characterId,
    settlementId,
    targetId: settlement.factionId ?? undefined,
    data: {
      battleId: `tax-test-${characterId}`,
      cause: "major-defeat",
      displayedRisk: "high",
      health: character.health,
      morale: character.morale,
      captivity: {
        captorFactionId: settlement.factionId,
        settlementId,
        capturedTick: world.tick,
        mandatoryReleaseTick: world.tick + 84,
        cause: "major-defeat",
        displayedRisk: "high",
        scatteredTroops: { ...character.troops },
        releaseDestinationId: null,
      },
    },
  });
}

function unchanged(world: WorldState, rate = 0.14): void {
  const faction = world.factions["world-government"];
  assert.equal(faction.taxRate, rate);
  assert.equal(Object.hasOwn(faction, "taxRateSetTick"), rate === 0.14 ? false : true);
  assert.equal(world.pendingCommands.some((command) => command.type === "set-tax-rate"), false);
}

test("taxRateSetTick is omitted until the first set", () => {
  const world = createPrototypeWorld(1847);
  assert.equal(world.version, 5);
  assert.equal(Object.hasOwn(world.factions["world-government"], "taxRateSetTick"), false);
  assert.equal(Object.hasOwn(world.factions["free-tide"], "taxRateSetTick"), false);
  assert.equal(world.factions["world-government"].taxRate, 0.14);
  assert.equal(world.factions["free-tide"].taxRate, 0.08);
});

test("the free holder sets the rate, and the next wage reads it", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  assert.equal(mara.name, "Mara Vane");
  const queued = submitCommand(world, { playerId: PLAYER, type: "set-tax-rate", taxRate: 0.12 });
  assert.equal(queued.ok, true);
  if (!queued.ok) return;
  assert.equal(queued.command.type, "set-tax-rate");
  assert.equal(queued.event.type, "player-command-accepted");
  const [queuedRow] = projectEventFeed(world, mara.id, [queued.event]);
  assert.equal(queuedRow.summary, "Command queued for Mara Vane: set tax rate to 12%");

  const tick = runTick(world);
  const set = tick.events.find((event) => event.type === "tax-rate-set");
  assert.ok(set);
  assert.equal(set.actorId, mara.id);
  assert.equal(set.targetId, "world-government");
  assert.equal(set.tick, 0);
  assert.equal(set.data.factionId, "world-government");
  assert.equal(set.data.taxRate, 0.12);
  assert.equal(set.data.previousTaxRate, 0.14);
  assert.equal(set.data.taxRateSetTick, 0);
  assert.equal(world.factions["world-government"].taxRate, 0.12);
  assert.equal(world.factions["world-government"].taxRateSetTick, 0);
  assert.equal(world.factions["free-tide"].taxRate, 0.08);
  assert.equal(Object.hasOwn(world.factions["free-tide"], "taxRateSetTick"), false);
  assert.equal(world.pendingCommands.length, 0);

  const [confirmation] = projectEventFeed(world, mara.id, [set]);
  assert.equal(confirmation.summary, "Mara Vane set the World Government tax rate to 12%.");
  assert.equal(confirmation.payloadWithheld, false);

  const pax = world.characters["character-14"];
  const rivalRows = projectFactions(world, pax) as Array<{
    id: string;
    taxRate: number;
    taxRateSetTick: number | null;
    treasury: number | null;
    power: number | null;
  }>;
  const rivalGovernment = rivalRows.find((row) => row.id === "world-government");
  const rivalTide = rivalRows.find((row) => row.id === "free-tide");
  assert.ok(rivalGovernment && rivalTide);
  assert.equal(rivalGovernment.taxRate, 0.12);
  assert.equal(rivalGovernment.taxRateSetTick, 0);
  assert.equal(rivalGovernment.treasury, null);
  assert.equal(rivalGovernment.power, null);
  assert.equal(rivalTide.taxRate, 0.08);
  assert.equal(rivalTide.taxRateSetTick, null);
  const [rivalLine] = projectEventFeed(world, pax.id, [set]);
  assert.equal(rivalLine.summary, "Mara Vane set the World Government tax rate to 12%.");
  assert.equal(rivalLine.payloadWithheld, true);
  assert.equal(rivalLine.data, null);

  const work = submitCommand(world, { playerId: PLAYER, type: "character-action", action: "work" });
  assert.equal(work.ok, true);
  const workedTick = runTick(world);
  const worked = workedTick.events.find((event) => event.type === "worked" && event.actorId === mara.id);
  assert.ok(worked);
  const gross = workGross(mara);
  assert.equal(worked.data.gross, gross);
  assert.equal(worked.data.tax, round(gross * 0.12, 2));
  assert.equal(world.factions["world-government"].taxRate, 0.12);
});

test("0.00 and 0.30 are legal, and a same-rate repeat is refused", () => {
  for (const taxRate of [0, 0.3]) {
    const world = createPrototypeWorld(1847);
    const accepted = submitCommand(world, { playerId: PLAYER, type: "set-tax-rate", taxRate });
    assert.equal(accepted.ok, true, String(taxRate));
    runTick(world);
    assert.equal(world.factions["world-government"].taxRate, taxRate);
    assert.equal(world.factions["world-government"].taxRateSetTick, 0);
  }

  const world = createPrototypeWorld(1847);
  const same = refusal(world, 0.14);
  assert.equal(same.code, "tax-rate-unchanged");
  assert.match(same.error, /14%/);
  unchanged(world);
  assert.equal(world.nextEventSequence, 1);
});

test("a non-holder, the regency cover, and a captive holder are refused", () => {
  const memberWorld = createPrototypeWorld(1847);
  const member = Object.values(memberWorld.characters).find((character) =>
    character.factionId === "world-government" && character.id !== "character-01",
  );
  assert.ok(member);
  control(memberWorld, member.id);
  const memberRefusal = refusal(memberWorld, 0.2);
  assert.equal(memberRefusal.code, "not-command-holder");
  assert.match(memberRefusal.error, /free command holder/);
  unchanged(memberWorld);

  const coverWorld = createPrototypeWorld(1847);
  forceCapture(coverWorld, "character-01");
  const coverId = coverWorld.factions["world-government"].actingCommanderId;
  assert.ok(coverId);
  assert.notEqual(coverId, "character-01");
  const cover = control(coverWorld, coverId);
  assert.equal(cover.captivity, null);
  const coverRefusal = refusal(coverWorld, 0.2);
  assert.equal(coverRefusal.code, "not-command-holder");
  unchanged(coverWorld);

  const captiveWorld = createPrototypeWorld(1847);
  forceCapture(captiveWorld, "character-01");
  assert.equal(captiveWorld.characters["character-01"].captivity !== null, true);
  const captiveRefusal = refusal(captiveWorld, 0.2);
  assert.equal(captiveRefusal.code, "character-captive");
  assert.match(captiveRefusal.error, /captive/);
  unchanged(captiveWorld);
});

test("out of range and off-step rates are refused", () => {
  for (const taxRate of [-0.01, 0.31, 0.125]) {
    const world = createPrototypeWorld(1847);
    const result = refusal(world, taxRate);
    assert.equal(result.code, "invalid-tax-rate", String(taxRate));
    assert.match(result.error, /0\.00 to 0\.30/);
    unchanged(world);
    assert.equal(world.nextEventSequence, 1);
  }
});

test("a different rate is refused at tick+23 and allowed at tick+24", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  const first = submitCommand(world, { playerId: PLAYER, type: "set-tax-rate", taxRate: 0.12 });
  assert.equal(first.ok, true);
  runTick(world);
  assert.equal(world.factions["world-government"].taxRateSetTick, 0);
  assert.equal(mara.captivity, null);

  const immediate = refusal(world, 0.2);
  assert.equal(immediate.code, "tax-rate-cooldown");
  assert.match(immediate.error, /tick 0/);
  assert.match(immediate.error, /tick 24/);
  assert.equal(world.factions["world-government"].taxRate, 0.12);
  assert.equal(world.factions["world-government"].taxRateSetTick, 0);

  while (world.tick < 23) runTick(world);
  assert.equal(world.tick, 23);
  assert.equal(mara.captivity, null);
  const at23 = refusal(world, 0.2);
  assert.equal(at23.code, "tax-rate-cooldown");
  assert.equal(world.factions["world-government"].taxRate, 0.12);
  assert.equal(world.factions["world-government"].taxRateSetTick, 0);

  runTick(world);
  assert.equal(world.tick, 24);
  const same = refusal(world, 0.12);
  assert.equal(same.code, "tax-rate-unchanged");
  assert.equal(world.factions["world-government"].taxRateSetTick, 0);

  const next = submitCommand(world, { playerId: PLAYER, type: "set-tax-rate", taxRate: 0.2 });
  assert.equal(next.ok, true);
  const resolved = runTick(world);
  const set = resolved.events.find((event) => event.type === "tax-rate-set");
  assert.ok(set);
  assert.equal(set.data.taxRate, 0.2);
  assert.equal(set.data.previousTaxRate, 0.12);
  assert.equal(set.data.taxRateSetTick, 24);
  assert.equal(set.tick, 24);
  assert.equal(world.factions["world-government"].taxRate, 0.2);
  assert.equal(world.factions["world-government"].taxRateSetTick, 24);
});

test("replay and recovery reproduce the set", () => {
  const play = (): { hash: string; rate: number; setTick: number } => {
    const world = createPrototypeWorld(1847);
    const accepted = submitCommand(world, { playerId: PLAYER, type: "set-tax-rate", taxRate: 0.2 });
    assert.equal(accepted.ok, true);
    runTick(world);
    runTicks(world, 3);
    return {
      hash: stateHash(world),
      rate: world.factions["world-government"].taxRate,
      setTick: world.factions["world-government"].taxRateSetTick ?? -1,
    };
  };
  const first = play();
  const second = play();
  assert.equal(second.hash, first.hash);
  assert.equal(first.rate, 0.2);
  assert.equal(first.setTick, 0);

  const directory = mkdtempSync(join(tmpdir(), "open-era-leader-tax-"));
  const databasePath = join(directory, "world.sqlite");
  const store = new WorldStore(databasePath);
  try {
    const world = createPrototypeWorld(1847);
    store.initialize(world);
    const accepted = submitCommand(world, { playerId: PLAYER, type: "set-tax-rate", taxRate: 0.2 });
    assert.equal(accepted.ok, true);
    if (!accepted.ok) return;
    store.appendTick([accepted.event], world);
    const tick = runTick(world);
    store.appendTick(tick.events, world);
    const liveHash = stateHash(world);
    const recovered = store.recover();
    assert.ok(recovered.replayedEvents > 0);
    assert.equal(stateHash(recovered.state), liveHash);
    assert.equal(recovered.state.factions["world-government"].taxRate, 0.2);
    assert.equal(recovered.state.factions["world-government"].taxRateSetTick, 0);
    assert.equal(recovered.state.factions["free-tide"].taxRate, 0.08);
    assert.equal(Object.hasOwn(recovered.state.factions["free-tide"], "taxRateSetTick"), false);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a 72-tick headless run emits no tax-rate-set", () => {
  const run = runTicks(createPrototypeWorld(1847), 72);
  const sets = run.events.filter((event: SimEvent) => event.type === "tax-rate-set");
  assert.equal(sets.length, 0);
  assert.equal(run.state.factions["world-government"].taxRate, 0.14);
  assert.equal(run.state.factions["free-tide"].taxRate, 0.08);
  assert.equal(Object.hasOwn(run.state.factions["world-government"], "taxRateSetTick"), false);
  assert.equal(Object.hasOwn(run.state.factions["free-tide"], "taxRateSetTick"), false);
  assert.equal(stateHash(run.state), "4ea893a485b05ce6eab599919765903ade9a0ce45f383437f4698064faa7a297");
  assert.equal(run.events.length, 8413);
});

test("capabilities publish set-tax-rate", () => {
  const capabilities = commandCapabilities({ eventFeed: { limitMax: 200, limitDefault: 100 } });
  const types = capabilities.commandTypes as string[];
  assert.ok(types.includes("set-tax-rate"));
  const requests = capabilities.requests as { commands: { body: Record<string, string> } };
  assert.match(requests.commands.body.taxRate, /set-tax-rate/);
  assert.match(requests.commands.body.taxRate, /0\.00/);
  assert.match(requests.commands.body.taxRate, /0\.30/);
  assert.match(requests.commands.body.type, /set-tax-rate/);
});

test("the dashboard returns the public rate, the queued line, the confirmation, and a 400", async () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-leader-tax-http-"));
  const app = createDashboardApp({ databasePath: join(directory, "dashboard.sqlite"), seed: 1847 });
  try {
    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port");
    const base = `http://127.0.0.1:${address.port}`;
    const read = async () => await (await fetch(`${base}/api/state?limit=200`)).json() as {
      tick: number;
      factions: Array<{ id: string; taxRate: number; taxRateSetTick: number | null; treasury: number | null }>;
      events: Array<{ type: string; summary: string; tick: number }>;
      capabilities: { commandTypes: string[] };
    };

    const opening = await read();
    assert.ok(opening.capabilities.commandTypes.includes("set-tax-rate"));
    const government = opening.factions.find((faction) => faction.id === "world-government");
    const tide = opening.factions.find((faction) => faction.id === "free-tide");
    assert.ok(government && tide);
    assert.equal(government.taxRate, 0.14);
    assert.equal(government.taxRateSetTick, null);
    assert.equal(typeof government.treasury, "number");
    assert.equal(tide.taxRate, 0.08);
    assert.equal(tide.taxRateSetTick, null);
    assert.equal(tide.treasury, null);

    const accepted = await fetch(`${base}/api/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: PLAYER, type: "set-tax-rate", taxRate: 0.12 }),
    });
    assert.equal(accepted.status, 202);
    const queuedState = await read();
    const queued = queuedState.events.find((event) => event.type === "player-command-accepted");
    assert.equal(queued?.summary, "Command queued for Mara Vane: set tax rate to 12%");

    const advanced = await fetch(`${base}/api/advance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticks: 1 }),
    });
    assert.equal(advanced.status, 200);
    const after = await read();
    assert.equal(after.tick, 1);
    const row = after.factions.find((faction) => faction.id === "world-government");
    assert.equal(row?.taxRate, 0.12);
    assert.equal(row?.taxRateSetTick, 0);
    const confirmation = after.events.find((event) => event.type === "tax-rate-set");
    assert.equal(confirmation?.summary, "Mara Vane set the World Government tax rate to 12%.");
    assert.equal(after.factions.find((faction) => faction.id === "free-tide")?.taxRate, 0.08);

    const refused = await fetch(`${base}/api/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: PLAYER, type: "set-tax-rate", taxRate: 0.2 }),
    });
    const body = await refused.json() as { ok: boolean; code: string; error: string };
    assert.equal(refused.status, 400);
    assert.equal(body.ok, false);
    assert.equal(body.code, "tax-rate-cooldown");
    assert.match(body.error, /tick 24/);
    const still = await read();
    assert.equal(still.factions.find((faction) => faction.id === "world-government")?.taxRate, 0.12);
    assert.equal(still.factions.find((faction) => faction.id === "world-government")?.taxRateSetTick, 0);
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
