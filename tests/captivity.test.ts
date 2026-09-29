import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { dashboardState, fullEventFeed } from "../src/dashboard/view-model.ts";
import { captureChanceForRisk } from "../src/sim/combat.ts";
import { submitCommand } from "../src/sim/commands.ts";
import { createConversationThread, sendConversationMessage } from "../src/sim/conversations.ts";
import { runTick } from "../src/sim/engine.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { applyEvent, round, stateHash } from "../src/sim/state.ts";
import type { SimEvent, WorldState } from "../src/sim/types.ts";

function forceRetreatCapture(seed = 1847): WorldState {
  const world = createPrototypeWorld(seed);
  const commander = world.characters[world.players["prototype-player"].characterId];
  const settlement = world.settlements["cinder-key"];
  commander.locationId = settlement.id;
  commander.travel = null;
  commander.troops.count = 90;
  settlement.garrison = 120;
  assert.equal(submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "raid",
  }).ok, true);
  runTick(world);
  const battle = Object.values(world.activeBattles)[0];
  assert.ok(battle?.lastPhase);
  battle.lastPhase.captureRisk = "severe";
  battle.lastPhase.retreatRisk = "severe";
  world.rngState = 1;
  assert.equal(submitCommand(world, {
    playerId: "prototype-player",
    type: "retreat-battle",
    battleId: battle.id,
  }).ok, true);
  const result = runTick(world);
  assert.ok(result.events.some((event) => event.type === "character-captured"));
  return world;
}

test("displayed capture risk maps to stable capture probabilities", () => {
  assert.deepEqual([
    captureChanceForRisk("low"),
    captureChanceForRisk("moderate"),
    captureChanceForRisk("high"),
    captureChanceForRisk("severe"),
  ], [0.04, 0.12, 0.3, 0.55]);
});

test("a failed dangerous withdrawal captures the character and scatters surviving troops", () => {
  const world = forceRetreatCapture();
  const commander = world.characters[world.players["prototype-player"].characterId];
  assert.equal(commander.captivity?.cause, "failed-retreat");
  assert.equal(commander.captivity?.displayedRisk, "severe");
  assert.equal(commander.captivity?.settlementId, "cinder-key");
  assert.equal(commander.captivity?.mandatoryReleaseTick, world.tick - 1 + 14 * world.ticksPerDay);
  assert.ok((commander.captivity?.scatteredTroops.count ?? 0) > 0);
  assert.equal(commander.troops.count, 0);
  assert.equal(commander.travel, null);
  assert.equal(Object.keys(world.activeBattles).length, 0);

  assert.deepEqual(submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "rest",
  }), {
    ok: false,
    code: "character-captive",
    error: "Only an escape attempt is available while the character is captive",
  });

  const thread = createConversationThread(world, {
    playerId: "prototype-player",
    kind: "direct",
    participantIds: ["character-02"],
  });
  assert.equal(thread.ok, true);
  assert.equal(thread.ok && sendConversationMessage(world, {
    playerId: "prototype-player",
    threadId: thread.value.id,
    body: "I have been captured. Please arrange help or terms.",
  }).ok, true);
});

test("guaranteed escape wounds the character, may scar them, and starts gradual troop recovery", () => {
  const world = forceRetreatCapture();
  const commander = world.characters[world.players["prototype-player"].characterId];
  const healthBefore = commander.health;
  const scattered = commander.captivity!.scatteredTroops.count;
  world.rngState = 1;

  assert.equal(submitCommand(world, {
    playerId: "prototype-player",
    type: "escape-captivity",
  }).ok, true);
  const escapeTick = runTick(world);
  assert.ok(escapeTick.events.some((event) => event.type === "captivity-escaped"));
  assert.equal(commander.captivity, null);
  assert.ok(commander.health < healthBefore);
  assert.equal(commander.locationId, null);
  assert.equal(commander.travel?.toId, "glassport");
  assert.equal(commander.troopRecovery?.remaining, scattered);
  assert.equal(commander.scars.length, 1);
  assert.ok(commander.scars[0].penalty >= 1 && commander.scars[0].penalty <= 3);

  let returnEvent = escapeTick.events.find((event) => event.type === "scattered-troops-returned");
  while (!returnEvent) returnEvent = runTick(world).events.find((event) => event.type === "scattered-troops-returned");
  assert.ok(returnEvent);
  assert.ok(commander.troops.count > 0);
  assert.ok((commander.troopRecovery?.remaining ?? 0) < scattered);
});

test("the fourteen-day deadline forces release on bounded terms", () => {
  const world = forceRetreatCapture();
  const commander = world.characters[world.players["prototype-player"].characterId];
  commander.money = 10;
  commander.captivity!.capturedTick = world.tick - 14 * world.ticksPerDay;
  commander.captivity!.mandatoryReleaseTick = world.tick;
  const result = runTick(world);
  const release = result.events.find((event) => event.type === "captivity-released");
  assert.ok(release);
  const terms = release.data.terms as {
    systemMaximum: number;
    demandedValue: number;
    moneyPaid: number;
    debtValue: number;
  };
  assert.ok(terms.demandedValue <= terms.systemMaximum);
  assert.equal(terms.moneyPaid, 10);
  assert.equal(terms.debtValue, terms.demandedValue - terms.moneyPaid);
  assert.equal(commander.captivity, null);
  assert.equal(commander.money, 0);
  assert.equal(commander.debts.length, 1);
  assert.equal(commander.troopRecovery?.remaining, commander.troopRecovery?.total);
});

function coinStock(world: WorldState): number {
  const purses = Object.values(world.characters).reduce((sum, character) => sum + character.money, 0);
  const treasuries = Object.values(world.factions).reduce((sum, faction) => sum + faction.treasury, 0);
  const escrow = Object.values(world.contracts ?? {}).reduce((sum, contract) => sum + contract.escrow, 0);
  return round(purses + treasuries + escrow, 2);
}

function dueForRelease(world: WorldState, characterId: string): void {
  const character = world.characters[characterId];
  const captivity = character.captivity;
  assert.ok(captivity);
  captivity.capturedTick = world.tick - 14 * world.ticksPerDay;
  captivity.mandatoryReleaseTick = world.tick;
}

/**
 * Replay the tick through the named character's release and prove that event
 * did not create or destroy coins. Later wages and passage are outside this check.
 */
function assertReleaseConserves(
  before: WorldState,
  events: SimEvent[],
  characterId: string,
  captorId: string | null,
  treasuryBefore: number | null,
  moneyPaid: number,
): void {
  const replay = structuredClone(before);
  let matched = false;
  for (const event of events) {
    const stockBefore = coinStock(replay);
    applyEvent(replay, event);
    if (event.type === "captivity-released" && event.actorId === characterId) {
      matched = true;
      assert.equal(coinStock(replay), stockBefore);
      assert.equal(replay.characters[characterId].money, round(before.characters[characterId].money - moneyPaid, 2));
      if (captorId && treasuryBefore !== null) {
        assert.equal(replay.factions[captorId].treasury, round(treasuryBefore + moneyPaid, 2));
      }
      assert.equal(event.data.factionTreasury, undefined);
      break;
    }
  }
  assert.equal(matched, true);
}

test("a ransom release moves the purse into the captor treasury and conserves coins", () => {
  const world = forceRetreatCapture();
  const commander = world.characters[world.players["prototype-player"].characterId];
  const captorId = commander.captivity?.captorFactionId ?? null;
  assert.ok(captorId);
  commander.money = 10;
  dueForRelease(world, commander.id);
  const treasuryBefore = world.factions[captorId].treasury;
  const snapshot = structuredClone(world);
  const result = runTick(world);
  const release = result.events.find((event) => event.type === "captivity-released" && event.actorId === commander.id);
  assert.ok(release);
  const terms = release.data.terms as { moneyPaid: number; debtValue: number; demandedValue: number };
  assert.equal(terms.moneyPaid, 10);
  assert.equal(terms.debtValue, round(terms.demandedValue - 10, 2));
  assert.equal(release.data.characterMoney, 0);
  assert.equal(release.targetId, captorId);
  assertReleaseConserves(snapshot, result.events, commander.id, captorId, treasuryBefore, 10);
});

test("a purse that covers the ransom pays it in full and records no debt", () => {
  const world = forceRetreatCapture();
  const commander = world.characters[world.players["prototype-player"].characterId];
  const captorId = commander.captivity!.captorFactionId!;
  commander.money = 10_000;
  dueForRelease(world, commander.id);
  const treasuryBefore = world.factions[captorId].treasury;
  const snapshot = structuredClone(world);
  const result = runTick(world);
  const release = result.events.find((event) => event.type === "captivity-released" && event.actorId === commander.id);
  assert.ok(release);
  const terms = release.data.terms as { moneyPaid: number; debtValue: number; demandedValue: number };
  assert.equal(terms.debtValue, 0);
  assert.equal(release.data.debt, null);
  assert.equal(terms.moneyPaid, terms.demandedValue);
  assert.ok(terms.moneyPaid > 0);
  assert.equal(release.data.characterMoney, round(10_000 - terms.moneyPaid, 2));
  assertReleaseConserves(snapshot, result.events, commander.id, captorId, treasuryBefore, terms.moneyPaid);
});

test("an empty purse records the debt and does not touch the treasury", () => {
  const world = forceRetreatCapture();
  const commander = world.characters[world.players["prototype-player"].characterId];
  const captorId = commander.captivity!.captorFactionId!;
  commander.money = 0;
  dueForRelease(world, commander.id);
  const treasuryBefore = world.factions[captorId].treasury;
  const snapshot = structuredClone(world);
  const result = runTick(world);
  const release = result.events.find((event) => event.type === "captivity-released" && event.actorId === commander.id);
  assert.ok(release);
  const terms = release.data.terms as { moneyPaid: number; debtValue: number; demandedValue: number };
  assert.equal(terms.moneyPaid, 0);
  assert.equal(terms.debtValue, terms.demandedValue);
  assert.equal(release.data.characterMoney, 0);
  assert.equal(commander.debts.length, 1);
  assertReleaseConserves(snapshot, result.events, commander.id, captorId, treasuryBefore, 0);
});

test("a captor with no faction keeps the coins in the purse", () => {
  const world = forceRetreatCapture();
  const commander = world.characters[world.players["prototype-player"].characterId];
  commander.captivity!.captorFactionId = null;
  commander.money = 40;
  dueForRelease(world, commander.id);
  const treasuriesBefore = Object.fromEntries(Object.values(world.factions).map((faction) => [faction.id, faction.treasury]));
  const snapshot = structuredClone(world);
  const result = runTick(world);
  const release = result.events.find((event) => event.type === "captivity-released" && event.actorId === commander.id);
  assert.ok(release);
  const terms = release.data.terms as { moneyPaid: number; debtValue: number; demandedValue: number };
  assert.equal(terms.moneyPaid, 0);
  assert.equal(terms.debtValue, terms.demandedValue);
  assert.equal(release.data.characterMoney, 40);
  assert.equal(release.targetId, undefined);
  const debt = release.data.debt as { creditorFactionId: string | null; remainingValue: number };
  assert.equal(debt.creditorFactionId, null);
  assert.equal(debt.remainingValue, terms.demandedValue);
  assertReleaseConserves(snapshot, result.events, commander.id, null, null, 0);
  for (const [id, treasury] of Object.entries(treasuriesBefore)) {
    const replay = structuredClone(snapshot);
    for (const event of result.events) {
      applyEvent(replay, event);
      if (event === release) break;
    }
    assert.equal(replay.factions[id].treasury, treasury);
  }
});

test("a captor id with no faction record keeps the coins in the purse", () => {
  const world = forceRetreatCapture();
  const commander = world.characters[world.players["prototype-player"].characterId];
  commander.captivity!.captorFactionId = "retired-faction";
  commander.money = 40;
  dueForRelease(world, commander.id);
  const snapshot = structuredClone(world);
  const result = runTick(world);
  const release = result.events.find((event) => event.type === "captivity-released" && event.actorId === commander.id);
  assert.ok(release);
  const terms = release.data.terms as { moneyPaid: number; debtValue: number; demandedValue: number };
  assert.equal(terms.moneyPaid, 0);
  assert.equal(release.data.characterMoney, 40);
  assert.equal(terms.debtValue, terms.demandedValue);
  const debt = release.data.debt as { creditorFactionId: string | null };
  assert.equal(debt.creditorFactionId, "retired-faction");
  assert.equal(world.factions["retired-faction"], undefined);
  assertReleaseConserves(snapshot, result.events, commander.id, null, null, 0);
});

test("a landless captor faction still receives the release-day coins", () => {
  const world = forceRetreatCapture();
  const commander = world.characters[world.players["prototype-player"].characterId];
  const captorId = commander.captivity!.captorFactionId!;
  for (const settlement of Object.values(world.settlements)) {
    if (settlement.factionId === captorId) settlement.factionId = settlement.factionId === "world-government" ? "free-tide" : "world-government";
  }
  assert.equal(Object.values(world.settlements).some((settlement) => settlement.factionId === captorId), false);
  commander.money = 25.5;
  dueForRelease(world, commander.id);
  const treasuryBefore = world.factions[captorId].treasury;
  const snapshot = structuredClone(world);
  const result = runTick(world);
  const release = result.events.find((event) => event.type === "captivity-released" && event.actorId === commander.id);
  assert.ok(release);
  const terms = release.data.terms as { moneyPaid: number };
  assert.equal(terms.moneyPaid, 25.5);
  assert.equal(release.targetId, captorId);
  assertReleaseConserves(snapshot, result.events, commander.id, captorId, treasuryBefore, 25.5);
});

test("captivity is visible through the public dashboard and survives recovery", () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-captivity-recovery-"));
  const databasePath = join(directory, "world.sqlite");
  try {
    const world = forceRetreatCapture(4096);
    const commander = world.characters[world.players["prototype-player"].characterId];
    const view = dashboardState(world, [], fullEventFeed([])) as {
      captivity: { active: { settlementId: string; canEscape: boolean } | null };
    };
    assert.equal(view.captivity.active?.settlementId, commander.captivity?.settlementId);
    assert.equal(view.captivity.active?.canEscape, true);

    const store = new WorldStore(databasePath);
    store.initialize(world);
    const expectedHash = stateHash(world);
    store.close();
    const reopened = new WorldStore(databasePath);
    const recovered = reopened.recover().state;
    assert.equal(stateHash(recovered), expectedHash);
    assert.deepEqual(recovered.characters[commander.id].captivity, commander.captivity);
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
