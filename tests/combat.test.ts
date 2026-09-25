import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { dashboardState } from "../src/dashboard/view-model.ts";
import { combatForecast } from "../src/sim/combat.ts";
import { submitCommand } from "../src/sim/commands.ts";
import { runTick } from "../src/sim/engine.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";

function prepareMajorBattle(seed = 1847) {
  const world = createPrototypeWorld(seed);
  const commander = world.characters[world.players["prototype-player"].characterId];
  const settlement = world.settlements["cinder-key"];
  commander.locationId = settlement.id;
  commander.travel = null;
  commander.troops.count = 90;
  settlement.garrison = 120;
  settlement.stability = 72;
  settlement.surrender = null;
  return { world, commander, settlement };
}

test("strategy narrows the combat forecast and reveals more factors", () => {
  const { world, commander, settlement } = prepareMajorBattle();
  commander.skills.strategy = 20;
  const basic = combatForecast(world, commander.id, settlement.id);
  commander.skills.strategy = 90;
  const command = combatForecast(world, commander.id, settlement.id);

  assert.equal(basic.majorBattle, true);
  assert.equal(command.phases, 3);
  assert.ok((basic.winChance.high - basic.winChance.low) > (command.winChance.high - command.winChance.low));
  assert.ok((basic.defenderPower.high - basic.defenderPower.low) > (command.defenderPower.high - command.defenderPower.low));
  assert.equal(basic.detailLevel, "basic");
  assert.equal(command.detailLevel, "command");
  assert.ok(command.revealedFactors.some((factor) => factor.includes("defensive ground estimated")));
});

test("a major player attack resolves one phase and refreshes local intelligence", () => {
  const { world, commander, settlement } = prepareMajorBattle();
  const submission = submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "raid",
  });
  assert.equal(submission.ok, true);

  const result = runTick(world);
  const battle = Object.values(world.activeBattles)[0];
  assert.ok(result.events.some((event) => event.type === "battle-started"));
  assert.ok(result.events.some((event) => event.type === "battle-phase-resolved"));
  assert.ok(battle);
  assert.equal(battle.phase, 1);
  assert.equal(battle.totalPhases, 3);
  assert.equal(commander.knowledge[settlement.id].observedTick, 0);
  assert.equal(commander.knowledge[settlement.id].garrisonEstimate, settlement.garrison);
  assert.ok(!result.events.some((event) => event.type === "battle-resolved"));
  const view = dashboardState(world, result.events) as {
    settlements: Array<{ id: string; battleInProgress: boolean; combatForecast: unknown }>;
  };
  const target = view.settlements.find((candidate) => candidate.id === settlement.id);
  assert.equal(target?.battleInProgress, true);
  assert.equal(target?.combatForecast, null);
});

test("retreat is the only player command during a battle and ends it with lighter consequences", () => {
  const { world, commander } = prepareMajorBattle();
  assert.equal(submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "raid",
  }).ok, true);
  runTick(world);
  const battle = Object.values(world.activeBattles)[0];
  assert.ok(battle);

  assert.deepEqual(submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "rest",
  }), {
    ok: false,
    code: "battle-in-progress",
    error: "Only a retreat decision is available while the character is in battle",
  });

  const healthBeforeRetreat = commander.health;
  const defeatsBeforeRetreat = commander.defeats;
  assert.equal(submitCommand(world, {
    playerId: "prototype-player",
    type: "retreat-battle",
    battleId: battle.id,
  }).ok, true);
  const result = runTick(world);
  const retreat = result.events.find((event) => event.type === "battle-retreated");
  assert.ok(retreat);
  assert.equal(Object.keys(world.activeBattles).length, 0);
  assert.equal(commander.defeats, defeatsBeforeRetreat);
  assert.ok(commander.health <= healthBeforeRetreat);
  assert.ok(Number(retreat.data.pursuitLosses) < battle.attackerInitialTroops * 0.2);
});

test("a continued major battle resolves by its third phase", () => {
  const { world, commander } = prepareMajorBattle(2718);
  assert.equal(submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "raid",
  }).ok, true);

  const events = [...runTick(world).events];
  events.push(...runTick(world).events);
  events.push(...runTick(world).events);
  assert.equal(Object.keys(world.activeBattles).length, 0);
  const resolved = events.find((event) => event.type === "battle-resolved");
  assert.ok(resolved);
  assert.equal(resolved.data.phases, 3);
  assert.equal(events.filter((event) =>
    event.type === "battle-phase-resolved" && event.actorId === commander.id
  ).length, 3);
});

test("an active battle survives snapshot and event recovery", () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-combat-recovery-"));
  const databasePath = join(directory, "world.sqlite");
  try {
    const { world } = prepareMajorBattle(4096);
    const store = new WorldStore(databasePath);
    store.initialize(world);
    const submission = submitCommand(world, {
      playerId: "prototype-player",
      type: "character-action",
      action: "raid",
    });
    assert.equal(submission.ok, true);
    if (submission.ok) store.appendTick([submission.event], world);
    const result = runTick(world);
    store.appendTick(result.events, world);
    const expectedHash = stateHash(world);
    store.close();

    const reopened = new WorldStore(databasePath);
    const recovered = reopened.recover().state;
    assert.equal(stateHash(recovered), expectedHash);
    assert.equal(Object.values(recovered.activeBattles)[0]?.phase, 1);
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
