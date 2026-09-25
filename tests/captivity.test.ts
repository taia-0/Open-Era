import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { dashboardState } from "../src/dashboard/view-model.ts";
import { captureChanceForRisk } from "../src/sim/combat.ts";
import { submitCommand } from "../src/sim/commands.ts";
import { createConversationThread, sendConversationMessage } from "../src/sim/conversations.ts";
import { runTick } from "../src/sim/engine.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";
import type { WorldState } from "../src/sim/types.ts";

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

test("captivity is visible through the public dashboard and survives recovery", () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-captivity-recovery-"));
  const databasePath = join(directory, "world.sqlite");
  try {
    const world = forceRetreatCapture(4096);
    const commander = world.characters[world.players["prototype-player"].characterId];
    const view = dashboardState(world, []) as {
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
