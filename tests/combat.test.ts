import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { dashboardState, fullEventFeed } from "../src/dashboard/view-model.ts";
import { captureChanceForRisk, combatForecast, isMajorBattle, selectRetreatDestination, settlementDefensePower } from "../src/sim/combat.ts";
import { submitCommand } from "../src/sim/commands.ts";
import { runTick } from "../src/sim/engine.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { DeterministicRng } from "../src/sim/rng.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { partyPower, stateHash, surrenderStabilityLimit } from "../src/sim/state.ts";
import type { SimEvent, WorldState } from "../src/sim/types.ts";

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

test("retreat routing prefers the nearest settlement controlled by the attacker's faction", () => {
  const world = createPrototypeWorld(1847, { playerCharacterId: "character-14" });
  assert.equal(selectRetreatDestination(world, "character-14", "crown-harbor"), "cinder-key");
  assert.equal(selectRetreatDestination(world, "character-01", "cinder-key"), "glassport");
});

test("with no friendly port, retreat goes to Verdant Cay", () => {
  const freeTide = createPrototypeWorld(1847);
  assert.equal(selectRetreatDestination(freeTide, "character-19", "glassport"), "cinder-key");
  freeTide.settlements["cinder-key"].factionId = "world-government";
  assert.equal(selectRetreatDestination(freeTide, "character-19", "glassport"), "verdant-cay");

  const worldGovernment = createPrototypeWorld(1847);
  worldGovernment.settlements["crown-harbor"].factionId = "free-tide";
  worldGovernment.settlements["glassport"].factionId = "free-tide";
  assert.equal(selectRetreatDestination(worldGovernment, "character-01", "glassport"), "verdant-cay");
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
  const view = dashboardState(world, result.events, fullEventFeed(result.events)) as {
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
  assert.equal(retreat.data.retreatRisk, battle.lastPhase?.retreatRisk);
  assert.equal(retreat.data.captureRisk, battle.lastPhase?.captureRisk);
  assert.equal(retreat.data.retreatDestinationId, "glassport");
  const recordedWithdrawal = retreat.data.retreatTravel as { totalTicks: number; remainingTicks: number };
  assert.equal(recordedWithdrawal.remainingTicks, recordedWithdrawal.totalTicks);
  assert.equal(Object.keys(world.activeBattles).length, 0);
  assert.equal(commander.defeats, defeatsBeforeRetreat);
  assert.ok(commander.health <= healthBeforeRetreat);
  assert.ok(Number(retreat.data.pursuitLosses) < battle.attackerInitialTroops * 0.2);
  assert.equal(commander.locationId, null);
  assert.equal(commander.travel?.fromId, "cinder-key");
  assert.equal(commander.travel?.toId, "glassport");
  assert.equal(commander.travel?.remainingTicks, recordedWithdrawal.totalTicks - 1);
  assert.deepEqual(submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "rest",
  }), {
    ok: false,
    code: "character-traveling",
    error: "The character is already traveling",
  });

  while (commander.travel) runTick(world);
  assert.equal(commander.locationId, "glassport");
  assert.equal(commander.knowledge["glassport"].source, "direct");
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

/**
 * Other characters at the port can raid on the same tick. The cases below
 * assert one battle's garrison and stability, so everyone else is put on the
 * raid cooldown first.
 */
function holdOtherRaiders(world: ReturnType<typeof createPrototypeWorld>, attackerId: string): void {
  for (const character of Object.values(world.characters)) {
    if (character.id !== attackerId) character.lastBattleTick = world.tick;
  }
}

function prepareImmediateSurrender(garrison: number, stability: number) {
  const world = createPrototypeWorld(1847);
  const commander = world.characters[world.players["prototype-player"].characterId];
  const settlement = world.settlements["cinder-key"];
  holdOtherRaiders(world, commander.id);
  commander.locationId = settlement.id;
  commander.travel = null;
  commander.skills.strategy = 125;
  commander.troops.count = 40;
  commander.health = 100;
  commander.morale = 100;
  // Walls and population are flattened so the loss rate is the attacker's
  // power against the garrison alone, and the post-battle figures are exact.
  settlement.population = 0;
  settlement.fortification = 1;
  settlement.garrison = garrison;
  settlement.stability = stability;
  settlement.surrender = null;
  return { world, commander, settlement };
}

function immediateVictory(garrison: number, stability: number) {
  const prepared = prepareImmediateSurrender(garrison, stability);
  assert.equal(submitCommand(prepared.world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "raid",
  }).ok, true);
  const result = runTick(prepared.world);
  const battle = result.events.find((event) =>
    event.type === "battle-resolved" && event.actorId === prepared.commander.id
  );
  assert.ok(battle);
  assert.equal(battle.data.phases, 1);
  assert.equal(battle.data.outcome, "attacker-victory");
  return { ...prepared, battle };
}

test("an immediate victory at garrison 14 and stability 39.55 offers surrender", () => {
  const { commander, settlement, battle } = immediateVictory(39, 51.52);
  assert.equal(battle.data.defenderGarrison, 14);
  assert.equal(battle.data.settlementStability, 39.55);
  assert.deepEqual(settlement.surrender, {
    offeredToId: commander.id,
    offeredTick: 0,
    previousFactionId: "free-tide",
  });
});

test("an immediate victory at garrison 8 and stability 55 still offers surrender", () => {
  const { commander, settlement, battle } = immediateVictory(22, 66.97);
  assert.equal(battle.data.defenderGarrison, 8);
  assert.equal(battle.data.settlementStability, 55);
  assert.ok(55 <= surrenderStabilityLimit(8));
  assert.deepEqual(settlement.surrender, {
    offeredToId: commander.id,
    offeredTick: 0,
    previousFactionId: "free-tide",
  });
});

test("an immediate victory at garrison 14 and stability 50 does not offer surrender", () => {
  const { settlement, battle } = immediateVictory(39, 61.97);
  assert.equal(battle.data.defenderGarrison, 14);
  assert.equal(battle.data.settlementStability, 50);
  assert.equal(settlement.surrender, null);
  assert.equal(battle.data.surrender, null);
});

test("an immediate victory at garrison 16 and stability 20 does not offer surrender", () => {
  const { settlement, battle } = immediateVictory(44, 31.97);
  assert.equal(battle.data.defenderGarrison, 16);
  assert.equal(battle.data.settlementStability, 20);
  assert.equal(settlement.surrender, null);
  assert.equal(battle.data.surrender, null);
});

function majorVictoryAt(garrison: number, stability: number) {
  const world = createPrototypeWorld(1847);
  const commander = world.characters[world.players["prototype-player"].characterId];
  const settlement = world.settlements["cinder-key"];
  holdOtherRaiders(world, commander.id);
  commander.locationId = settlement.id;
  commander.travel = null;
  commander.skills.strategy = 125;
  commander.troops.count = 80;
  commander.health = 100;
  commander.morale = 100;
  settlement.population = 0;
  settlement.fortification = 1;
  settlement.garrison = 40;
  settlement.stability = 80;
  settlement.surrender = null;
  assert.equal(submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "raid",
  }).ok, true);
  runTick(world);
  runTick(world);
  assert.equal(Object.keys(world.activeBattles).length, 1);
  settlement.garrison = garrison;
  settlement.stability = stability;
  settlement.population = 0;
  settlement.fortification = 1;
  const result = runTick(world);
  const battle = result.events.find((event) =>
    event.type === "battle-resolved" && event.actorId === commander.id
  );
  assert.ok(battle);
  assert.equal(battle.data.phases, 3);
  assert.equal(battle.data.outcome, "attacker-victory");
  return { commander, settlement, battle };
}

test("a completed major battle uses the same surrender limit", () => {
  const offered = majorVictoryAt(21, 43.55);
  assert.equal(offered.battle.data.defenderGarrison, 14);
  assert.equal(offered.battle.data.settlementStability, 39.55);
  assert.deepEqual(offered.settlement.surrender, {
    offeredToId: offered.commander.id,
    offeredTick: 2,
    previousFactionId: "free-tide",
  });

  const stable = majorVictoryAt(21, 54);
  assert.equal(stable.battle.data.defenderGarrison, 14);
  assert.equal(stable.battle.data.settlementStability, 50);
  assert.equal(stable.settlement.surrender, null);

  const garrisoned = majorVictoryAt(24, 24);
  assert.equal(garrisoned.battle.data.defenderGarrison, 16);
  assert.equal(garrisoned.battle.data.settlementStability, 20);
  assert.equal(garrisoned.settlement.surrender, null);
});

test("the ration floor does not read the surrender limit", () => {
  const low = createPrototypeWorld(1847);
  const high = createPrototypeWorld(1847);
  const lowHarbor = low.settlements["crown-harbor"];
  const highHarbor = high.settlements["crown-harbor"];
  lowHarbor.garrison = 6;
  highHarbor.garrison = 15;
  lowHarbor.stability = 0;
  highHarbor.stability = 0;
  lowHarbor.stocks.provisions = 0;
  highHarbor.stocks.provisions = 0;
  assert.equal(surrenderStabilityLimit(lowHarbor.garrison), 80);
  assert.equal(surrenderStabilityLimit(highHarbor.garrison), 30);
  assert.notEqual(
    surrenderStabilityLimit(lowHarbor.garrison),
    surrenderStabilityLimit(highHarbor.garrison),
  );

  const lowTick = runTick(low);
  const highTick = runTick(high);
  const provisionsOf = (events: typeof lowTick.events, settlementId: string) => {
    const produced = events.find((event) =>
      event.type === "settlement-produced" && event.settlementId === settlementId
    );
    return (produced?.data.stocks as { provisions: number } | undefined)?.provisions;
  };
  assert.equal(provisionsOf(lowTick.events, lowHarbor.id), 5);
  assert.equal(provisionsOf(highTick.events, highHarbor.id), 5);
  assert.equal(lowHarbor.surrender, null);
  assert.equal(highHarbor.surrender, null);
});

function prepareScriptedMajor(options: {
  troops: number;
  garrison: number;
  fortification: number;
  stability: number;
  morale: number;
  health: number;
}) {
  const world = createPrototypeWorld(1847);
  const commander = world.characters[world.players["prototype-player"].characterId];
  const settlement = world.settlements["cinder-key"];
  holdOtherRaiders(world, commander.id);
  commander.locationId = settlement.id;
  commander.travel = null;
  commander.skills.strategy = 125;
  commander.troops.count = options.troops;
  commander.health = options.health;
  commander.morale = options.morale;
  commander.cargo.provisions = 40;
  settlement.population = 0;
  settlement.fortification = options.fortification;
  settlement.garrison = options.garrison;
  settlement.stability = options.stability;
  settlement.surrender = null;
  return { world, commander, settlement };
}

function raidThisTick(world: WorldState) {
  assert.equal(submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "raid",
  }).ok, true);
  return runTick(world);
}

function playerBattle(events: SimEvent[], actorId: string) {
  return events.find((event) => event.type === "battle-resolved" && event.actorId === actorId);
}

test("a major that ends at morale 12 with a higher attacker score is an attacker victory and can offer surrender", () => {
  const { world, commander, settlement } = prepareScriptedMajor({
    troops: 110,
    garrison: 18,
    fortification: 1,
    stability: 43.97,
    morale: 9,
    health: 90,
  });
  assert.equal(isMajorBattle(commander, settlement), true);
  assert.ok(partyPower(commander) > settlementDefensePower(settlement) * 1.22);
  const result = raidThisTick(world);
  const battle = playerBattle(result.events, commander.id);
  assert.ok(battle);
  assert.equal(battle.data.phases, 1);
  assert.equal(battle.data.attackerMorale, 12);
  assert.equal(battle.data.attackerTroops, 107);
  assert.equal(battle.data.attackerHealth, 88);
  assert.ok(Number(battle.data.attackerTroops) >= 8);
  assert.ok(Number(battle.data.attackerHealth) > 15);
  assert.equal(battle.data.defenderGarrison, 14);
  assert.equal(battle.data.settlementStability, 40);
  assert.ok(Number(battle.data.attackerScore) > Number(battle.data.defenderScore));
  assert.equal(battle.data.outcome, "attacker-victory");
  assert.equal(40 <= surrenderStabilityLimit(14), true);
  assert.deepEqual(settlement.surrender, {
    offeredToId: commander.id,
    offeredTick: 0,
    previousFactionId: "free-tide",
  });
  assert.equal(result.events.some((event) => event.type === "character-captured" && event.actorId === commander.id), false);
  assert.equal(commander.captivity, null);
  assert.equal(commander.victories, 1);
});

test("the same major with a lower attacker score stays a defender victory and offers no surrender", () => {
  const { world, commander, settlement } = prepareScriptedMajor({
    troops: 100,
    garrison: 30,
    fortification: 40,
    stability: 44,
    morale: 9,
    health: 90,
  });
  assert.equal(isMajorBattle(commander, settlement), true);
  assert.ok(partyPower(commander) < settlementDefensePower(settlement) * 0.78);
  const result = raidThisTick(world);
  const battle = playerBattle(result.events, commander.id);
  assert.ok(battle);
  assert.equal(battle.data.phases, 1);
  assert.ok(Number(battle.data.attackerMorale) <= 12);
  assert.ok(Number(battle.data.attackerTroops) >= 8);
  assert.ok(Number(battle.data.attackerHealth) > 15);
  assert.ok(Number(battle.data.defenderGarrison) > 0);
  assert.ok(Number(battle.data.attackerScore) < Number(battle.data.defenderScore));
  assert.equal(battle.data.outcome, "defender-victory");
  assert.equal(settlement.surrender, null);
  assert.equal(battle.data.surrender, null);
});

test("an outscore victory does not offer surrender when stability or garrison fails the existing limit", () => {
  const stable = prepareScriptedMajor({
    troops: 110,
    garrison: 18,
    fortification: 1,
    stability: 44.97,
    morale: 9,
    health: 90,
  });
  const stableResult = raidThisTick(stable.world);
  const stableBattle = playerBattle(stableResult.events, stable.commander.id);
  assert.ok(stableBattle);
  assert.equal(stableBattle.data.outcome, "attacker-victory");
  assert.equal(stableBattle.data.defenderGarrison, 14);
  assert.equal(stableBattle.data.settlementStability, 41);
  assert.ok(41 > surrenderStabilityLimit(14));
  assert.equal(stable.settlement.surrender, null);

  const garrisoned = prepareScriptedMajor({
    troops: 90,
    garrison: 40,
    fortification: 1,
    stability: 20,
    morale: 9,
    health: 90,
  });
  const garrisonedResult = raidThisTick(garrisoned.world);
  const garrisonedBattle = playerBattle(garrisonedResult.events, garrisoned.commander.id);
  assert.ok(garrisonedBattle);
  assert.equal(garrisonedBattle.data.outcome, "attacker-victory");
  assert.equal(garrisonedBattle.data.defenderGarrison, 31);
  assert.ok(Number(garrisonedBattle.data.defenderGarrison) > 15);
  assert.equal(garrisoned.settlement.surrender, null);
});

test("troops under 8 or health at 15 keep a higher-score major as a defender victory", () => {
  const thin = prepareScriptedMajor({
    troops: 80,
    garrison: 50,
    fortification: 1,
    stability: 60,
    morale: 80,
    health: 90,
  });
  assert.equal(isMajorBattle(thin.commander, thin.settlement), true);
  raidThisTick(thin.world);
  assert.equal(Object.keys(thin.world.activeBattles).length, 1);
  // A player raid requires 25 troops, so the under-8 end is the next phase.
  thin.commander.troops.count = 8;
  thin.commander.morale = 40;
  thin.commander.health = 90;
  thin.settlement.fortification = 1;
  thin.settlement.garrison = 40;
  thin.settlement.population = 0;
  const thinResult = runTick(thin.world);
  const thinBattle = playerBattle(thinResult.events, thin.commander.id);
  assert.ok(thinBattle);
  assert.equal(thinBattle.data.attackerTroops, 7);
  assert.ok(Number(thinBattle.data.attackerScore) > Number(thinBattle.data.defenderScore));
  assert.equal(thinBattle.data.outcome, "defender-victory");
  assert.equal(thin.settlement.surrender, null);

  const wounded = prepareScriptedMajor({
    troops: 110,
    garrison: 18,
    fortification: 1,
    stability: 44,
    morale: 9,
    health: 17,
  });
  const woundedResult = raidThisTick(wounded.world);
  const woundedBattle = playerBattle(woundedResult.events, wounded.commander.id);
  assert.ok(woundedBattle);
  assert.equal(woundedBattle.data.attackerHealth, 15);
  assert.equal(woundedBattle.data.attackerMorale, 12);
  assert.ok(Number(woundedBattle.data.attackerScore) > Number(woundedBattle.data.defenderScore));
  assert.equal(woundedBattle.data.outcome, "defender-victory");
  assert.equal(wounded.settlement.surrender, null);

  const justHealthy = prepareScriptedMajor({
    troops: 110,
    garrison: 18,
    fortification: 1,
    stability: 44,
    morale: 9,
    health: 18,
  });
  const healthyResult = raidThisTick(justHealthy.world);
  const healthyBattle = playerBattle(healthyResult.events, justHealthy.commander.id);
  assert.ok(healthyBattle);
  assert.equal(healthyBattle.data.attackerHealth, 16);
  assert.equal(healthyBattle.data.outcome, "attacker-victory");
});

test("morale 13 does not end the major, so outscore has nothing to resolve yet", () => {
  const { world, commander } = prepareScriptedMajor({
    troops: 110,
    garrison: 18,
    fortification: 1,
    stability: 44,
    morale: 10,
    health: 90,
  });
  const result = raidThisTick(world);
  assert.equal(playerBattle(result.events, commander.id), undefined);
  const battle = Object.values(world.activeBattles)[0];
  assert.ok(battle);
  assert.equal(battle.phase, 1);
  assert.equal(battle.lastPhase?.attackerMorale, 13);
  assert.ok(commander.morale > 12);
});

test("a higher last-phase score wins a finished major that is still above morale 12", () => {
  const { world, commander, settlement } = prepareScriptedMajor({
    troops: 140,
    garrison: 40,
    fortification: 80,
    stability: 70,
    morale: 80,
    health: 100,
  });
  assert.equal(raidThisTick(world).events.some((event) => event.type === "battle-resolved" && event.actorId === commander.id), false);
  settlement.fortification = 80;
  assert.equal(runTick(world).events.some((event) => event.type === "battle-resolved" && event.actorId === commander.id), false);
  settlement.fortification = 1;
  settlement.population = 0;
  const result = runTick(world);
  const battle = playerBattle(result.events, commander.id);
  assert.ok(battle);
  assert.equal(battle.data.phases, 3);
  assert.ok(Number(battle.data.attackerMorale) > 12);
  assert.ok(Number(battle.data.attackerHealth) > 15);
  assert.ok(Number(battle.data.attackerTroops) >= 8);
  assert.ok(Number(battle.data.defenderGarrison) > 0);
  assert.ok(Number(battle.data.attackerScore) > Number(battle.data.defenderScore));
  assert.equal(battle.data.outcome, "attacker-victory");
  assert.equal(result.events.some((event) => event.type === "character-captured" && event.actorId === commander.id), false);
});

/**
 * Everyone except the player, and an optional witness, is captive so the tick's
 * only RNG draws are the battle and that witness's decision.
 */
function quietExcept(world: WorldState, keep: Set<string>): void {
  for (const character of Object.values(world.characters)) {
    if (keep.has(character.id)) continue;
    character.captivity = {
      captorFactionId: "world-government",
      settlementId: "crown-harbor",
      capturedTick: 0,
      mandatoryReleaseTick: 10_000,
      cause: "major-defeat",
      displayedRisk: "low",
      scatteredTroops: { count: 0, experience: 0, discipline: 0 },
      releaseDestinationId: null,
    };
  }
}

function witnessScores(events: SimEvent[]): number[] {
  const decision = events.find((event) => event.type === "decision-made" && event.actorId === "character-02");
  assert.ok(decision);
  return (decision.data.candidates as Array<{ score: number }>).map((candidate) => candidate.score);
}

test("a flipped outscore victory consumes the defeat path's capture roll and no roll is added to a win the old rule already had", () => {
  const flip = prepareScriptedMajor({
    troops: 110,
    garrison: 18,
    fortification: 1,
    stability: 44,
    morale: 9,
    health: 90,
  });
  const defeat = prepareScriptedMajor({
    troops: 100,
    garrison: 30,
    fortification: 40,
    stability: 44,
    morale: 9,
    health: 90,
  });
  const alreadyWon = prepareScriptedMajor({
    troops: 120,
    garrison: 1,
    fortification: 1,
    stability: 40,
    morale: 80,
    health: 100,
  });
  for (const prepared of [flip, defeat, alreadyWon]) {
    const witness = prepared.world.characters["character-02"];
    witness.locationId = "verdant-cay";
    witness.travel = null;
    quietExcept(prepared.world, new Set([prepared.commander.id, witness.id]));
  }
  assert.equal(flip.world.rngState, defeat.world.rngState);
  assert.equal(flip.world.rngState, alreadyWon.world.rngState);
  const startState = flip.world.rngState;

  const flipResult = raidThisTick(flip.world);
  const defeatResult = raidThisTick(defeat.world);
  const wonResult = raidThisTick(alreadyWon.world);
  const flipBattle = playerBattle(flipResult.events, flip.commander.id);
  const defeatBattle = playerBattle(defeatResult.events, defeat.commander.id);
  const wonBattle = playerBattle(wonResult.events, alreadyWon.commander.id);
  assert.ok(flipBattle && defeatBattle && wonBattle);
  assert.equal(flipBattle.data.outcome, "attacker-victory");
  assert.equal(defeatBattle.data.outcome, "defender-victory");
  assert.equal(wonBattle.data.outcome, "attacker-victory");
  assert.equal(wonBattle.data.defenderGarrison, 0);
  assert.ok(Number(wonBattle.data.attackerMorale) > 12);
  assert.deepEqual(witnessScores(flipResult.events), witnessScores(defeatResult.events));
  assert.equal(flip.world.rngState, defeat.world.rngState);
  assert.notEqual(alreadyWon.world.rngState, flip.world.rngState);

  const isolatedFlip = prepareScriptedMajor({
    troops: 110,
    garrison: 18,
    fortification: 1,
    stability: 44,
    morale: 9,
    health: 90,
  });
  const isolatedDefeat = prepareScriptedMajor({
    troops: 100,
    garrison: 30,
    fortification: 40,
    stability: 44,
    morale: 9,
    health: 90,
  });
  const isolatedWon = prepareScriptedMajor({
    troops: 120,
    garrison: 1,
    fortification: 1,
    stability: 40,
    morale: 80,
    health: 100,
  });
  for (const prepared of [isolatedFlip, isolatedDefeat, isolatedWon]) {
    quietExcept(prepared.world, new Set([prepared.commander.id]));
  }
  raidThisTick(isolatedFlip.world);
  raidThisTick(isolatedDefeat.world);
  raidThisTick(isolatedWon.world);

  const replay = new DeterministicRng(startState);
  replay.between(0, 0);
  replay.between(-0.22, 0.22);
  const captureRoll = replay.next();
  assert.equal(isolatedFlip.world.rngState, replay.state);
  assert.equal(isolatedDefeat.world.rngState, replay.state);
  const later = replay.next();
  assert.equal(new DeterministicRng(isolatedFlip.world.rngState).next(), later);
  assert.equal(new DeterministicRng(isolatedDefeat.world.rngState).next(), later);
  assert.notEqual(later, captureRoll);

  const wonReplay = new DeterministicRng(startState);
  wonReplay.between(0, 0);
  wonReplay.between(-0.22, 0.22);
  assert.equal(isolatedWon.world.rngState, wonReplay.state);
  assert.notEqual(isolatedWon.world.rngState, isolatedFlip.world.rngState);
});

/**
 * The seed-1847 scripted major draws one capture roll, about 0.524, after the
 * two phase rolls. Health 39 ends the phase at 37, and morale 9 ends at 12, so
 * capture risk is raised twice to severe (0.55) and that roll is a hit. A
 * higher starting health stays at high (0.3) and the same roll misses.
 */
function hittingOutscore() {
  return prepareScriptedMajor({
    troops: 110,
    garrison: 18,
    fortification: 1,
    stability: 44,
    morale: 9,
    health: 39,
  });
}

function placeOnDock(
  world: WorldState,
  id: string,
  leadership: number,
  loyalty: number,
) {
  const character = world.characters[id];
  character.captivity = null;
  character.factionId = "free-tide";
  character.locationId = "cinder-key";
  character.travel = null;
  character.skills.leadership = leadership;
  character.personality.loyalty = loyalty;
  return character;
}

function scriptedCaptureRoll(startState: number): { roll: number; stateAfterRoll: number } {
  const replay = new DeterministicRng(startState);
  replay.between(0, 0);
  replay.between(-0.22, 0.22);
  const roll = replay.next();
  return { roll, stateAfterRoll: replay.state };
}

test("an outscore win captures the senior losing officer on the dock at the drawn roll", () => {
  const prepared = hittingOutscore();
  const { world, commander, settlement } = prepared;
  quietExcept(world, new Set([commander.id, "character-16", "character-22", "character-19"]));
  const senior = placeOnDock(world, "character-22", 90, 0.9);
  const junior = placeOnDock(world, "character-16", 40, 0.5);
  const absent = placeOnDock(world, "character-19", 99, 0.99);
  absent.locationId = "glassport";
  const travelling = world.characters["character-20"];
  travelling.captivity = null;
  travelling.factionId = "free-tide";
  travelling.locationId = "cinder-key";
  travelling.travel = { fromId: "cinder-key", toId: "glassport", totalTicks: 4, remainingTicks: 4 };
  travelling.skills.leadership = 99;
  travelling.personality.loyalty = 0.99;
  const seniorTroops = senior.troops.count;
  const seniorHealth = senior.health;
  const seniorMorale = senior.morale;
  const drawn = scriptedCaptureRoll(world.rngState);
  assert.equal(captureChanceForRisk("severe"), 0.55);
  assert.ok(drawn.roll < 0.55);
  assert.ok(drawn.roll >= 0.3);

  const result = raidThisTick(world);
  const battle = playerBattle(result.events, commander.id);
  assert.ok(battle);
  assert.equal(battle.data.outcome, "attacker-victory");
  assert.equal(battle.data.defenderGarrison, 14);
  assert.equal(settlement.garrison, 14);
  assert.equal(commander.captivity, null);
  assert.equal(commander.victories, 1);
  const captures = result.events.filter((event) => event.type === "character-captured");
  assert.equal(captures.length, 1);
  const capture = captures[0];
  assert.equal(capture.actorId, senior.id);
  assert.equal(capture.data.cause, "outscore-loss");
  assert.equal(capture.data.captureChance, 0.55);
  assert.equal(capture.data.captureRoll, 0.5239);
  assert.equal(capture.data.health, seniorHealth);
  assert.equal(capture.data.morale, seniorMorale);
  const hold = capture.data.captivity as { captorFactionId: string; cause: string; scatteredTroops: { count: number } };
  assert.equal(hold.captorFactionId, commander.factionId);
  assert.equal(hold.cause, "outscore-loss");
  assert.equal(hold.scatteredTroops.count, seniorTroops);
  assert.equal(senior.captivity?.captorFactionId, "world-government");
  assert.equal(senior.troops.count, 0);
  assert.equal(junior.captivity, null);
  assert.equal(absent.captivity, null);
  assert.equal(travelling.captivity, null);
});

test("the dock sort ranks seeded loyalty and ignores the loyalty scar", () => {
  const { world, commander } = hittingOutscore();
  quietExcept(world, new Set([commander.id, "character-16", "character-22"]));
  const senior = placeOnDock(world, "character-22", 80, 0.8);
  const junior = placeOnDock(world, "character-16", 70, 0.8);
  senior.loyaltyAdjustment = -0.3;
  const seededSenior = senior.skills.leadership + senior.personality.loyalty * 50;
  const seededJunior = junior.skills.leadership + junior.personality.loyalty * 50;
  const scarredSenior = senior.skills.leadership + (senior.personality.loyalty + (senior.loyaltyAdjustment ?? 0)) * 50;
  assert.ok(seededSenior > seededJunior);
  assert.ok(scarredSenior < seededJunior);

  const result = raidThisTick(world);
  const captures = result.events.filter((event) => event.type === "character-captured");
  assert.equal(captures.length, 1);
  assert.equal(captures[0].actorId, senior.id);
  assert.equal(captures[0].data.cause, "outscore-loss");
  assert.equal(junior.captivity, null);
  assert.equal(senior.loyaltyAdjustment, -0.3);
  assert.equal(senior.personality.loyalty, 0.8);
});

test("a tie on the dock breaks toward the lower id", () => {
  const { world, commander } = hittingOutscore();
  quietExcept(world, new Set([commander.id, "character-16", "character-22"]));
  const lower = placeOnDock(world, "character-16", 50, 0.4);
  const higher = placeOnDock(world, "character-22", 50, 0.4);
  assert.ok(lower.id < higher.id);
  assert.equal(lower.skills.leadership + lower.personality.loyalty * 50, higher.skills.leadership + higher.personality.loyalty * 50);

  const result = raidThisTick(world);
  const captures = result.events.filter((event) => event.type === "character-captured");
  assert.equal(captures.length, 1);
  assert.equal(captures[0].actorId, lower.id);
  assert.equal(captures[0].data.cause, "outscore-loss");
  assert.equal(higher.captivity, null);
  assert.equal(playerBattle(result.events, commander.id)?.data.outcome, "attacker-victory");
});

test("the attacker and an already captive member are not the outscore prisoner", () => {
  const excludedAttacker = hittingOutscore();
  quietExcept(excludedAttacker.world, new Set([excludedAttacker.commander.id, "character-16"]));
  assert.equal(submitCommand(excludedAttacker.world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "raid",
  }).ok, true);
  excludedAttacker.commander.factionId = "free-tide";
  excludedAttacker.commander.skills.leadership = 100;
  excludedAttacker.commander.personality.loyalty = 0.99;
  const mate = placeOnDock(excludedAttacker.world, "character-16", 1, 0.1);
  assert.ok(
    excludedAttacker.commander.skills.leadership + excludedAttacker.commander.personality.loyalty * 50 >
    mate.skills.leadership + mate.personality.loyalty * 50,
  );
  const attackerResult = runTick(excludedAttacker.world);
  const attackerCaptures = attackerResult.events.filter((event) => event.type === "character-captured");
  assert.equal(attackerCaptures.length, 1);
  assert.equal(attackerCaptures[0].actorId, mate.id);
  assert.equal(attackerCaptures[0].data.cause, "outscore-loss");
  assert.equal(
    (attackerCaptures[0].data.captivity as { captorFactionId: string }).captorFactionId,
    "free-tide",
  );
  assert.equal(excludedAttacker.commander.captivity, null);

  const skippedCaptive = hittingOutscore();
  quietExcept(skippedCaptive.world, new Set([skippedCaptive.commander.id, "character-16", "character-22"]));
  const already = placeOnDock(skippedCaptive.world, "character-22", 99, 0.99);
  already.captivity = {
    captorFactionId: "world-government",
    settlementId: "cinder-key",
    capturedTick: 0,
    mandatoryReleaseTick: 10_000,
    cause: "major-defeat",
    displayedRisk: "low",
    scatteredTroops: { count: 0, experience: 0, discipline: 0 },
    releaseDestinationId: null,
  };
  const freeMate = placeOnDock(skippedCaptive.world, "character-16", 5, 0.1);
  const captiveResult = raidThisTick(skippedCaptive.world);
  const captiveCaptures = captiveResult.events.filter((event) => event.type === "character-captured");
  assert.equal(captiveCaptures.length, 1);
  assert.equal(captiveCaptures[0].actorId, freeMate.id);
  assert.equal(captiveCaptures[0].data.cause, "outscore-loss");
  assert.equal(already.captivity?.cause, "major-defeat");
});

test("an empty dock spends the outscore roll, captures nobody, and leaves the same rngState", () => {
  const empty = hittingOutscore();
  const occupied = hittingOutscore();
  const defeat = prepareScriptedMajor({
    troops: 100,
    garrison: 30,
    fortification: 40,
    stability: 44,
    morale: 9,
    health: 39,
  });
  quietExcept(empty.world, new Set([empty.commander.id]));
  quietExcept(occupied.world, new Set([occupied.commander.id, "character-22"]));
  quietExcept(defeat.world, new Set([defeat.commander.id]));
  placeOnDock(occupied.world, "character-22", 90, 0.9);
  assert.equal(empty.world.rngState, occupied.world.rngState);
  assert.equal(empty.world.rngState, defeat.world.rngState);
  const drawn = scriptedCaptureRoll(empty.world.rngState);

  const emptyResult = raidThisTick(empty.world);
  const occupiedResult = raidThisTick(occupied.world);
  const defeatResult = raidThisTick(defeat.world);
  assert.equal(playerBattle(emptyResult.events, empty.commander.id)?.data.outcome, "attacker-victory");
  assert.equal(emptyResult.events.some((event) => event.type === "character-captured"), false);
  assert.equal(occupiedResult.events.filter((event) => event.type === "character-captured").length, 1);
  assert.equal(defeatResult.events.filter((event) => event.type === "character-captured" && event.data.cause === "outscore-loss").length, 0);
  assert.equal(empty.world.rngState, drawn.stateAfterRoll);
  assert.equal(occupied.world.rngState, empty.world.rngState);
  assert.equal(defeat.world.rngState, empty.world.rngState);
  const later = new DeterministicRng(drawn.stateAfterRoll).next();
  assert.equal(new DeterministicRng(empty.world.rngState).next(), later);
  assert.equal(new DeterministicRng(defeat.world.rngState).next(), later);
});

test("an outscore capture leaves the victory, the surrender offer, and the garrison unchanged", () => {
  const empty = prepareScriptedMajor({
    troops: 110,
    garrison: 18,
    fortification: 1,
    stability: 43.97,
    morale: 9,
    health: 39,
  });
  const occupied = prepareScriptedMajor({
    troops: 110,
    garrison: 18,
    fortification: 1,
    stability: 43.97,
    morale: 9,
    health: 39,
  });
  quietExcept(empty.world, new Set([empty.commander.id]));
  quietExcept(occupied.world, new Set([occupied.commander.id, "character-22"]));
  placeOnDock(occupied.world, "character-22", 90, 0.9);

  const emptyResult = raidThisTick(empty.world);
  const occupiedResult = raidThisTick(occupied.world);
  const emptyBattle = playerBattle(emptyResult.events, empty.commander.id);
  const occupiedBattle = playerBattle(occupiedResult.events, occupied.commander.id);
  assert.ok(emptyBattle && occupiedBattle);
  assert.equal(emptyBattle.data.outcome, "attacker-victory");
  assert.equal(occupiedBattle.data.outcome, emptyBattle.data.outcome);
  assert.equal(occupiedBattle.data.defenderGarrison, emptyBattle.data.defenderGarrison);
  assert.equal(occupiedBattle.data.settlementStability, emptyBattle.data.settlementStability);
  assert.deepEqual(occupiedBattle.data.surrender, emptyBattle.data.surrender);
  assert.equal(occupied.settlement.garrison, empty.settlement.garrison);
  assert.equal(occupied.settlement.garrison, 14);
  assert.deepEqual(occupied.settlement.surrender, empty.settlement.surrender);
  assert.deepEqual(occupied.settlement.surrender, {
    offeredToId: occupied.commander.id,
    offeredTick: 0,
    previousFactionId: "free-tide",
  });
  assert.equal(emptyResult.events.some((event) => event.type === "character-captured"), false);
  assert.equal(occupiedResult.events.some((event) => event.type === "character-captured" && event.data.cause === "outscore-loss"), true);
});

test("a defender victory and a standing attacker victory do not take the dock", () => {
  const defeat = prepareScriptedMajor({
    troops: 100,
    garrison: 30,
    fortification: 40,
    stability: 44,
    morale: 9,
    health: 90,
  });
  quietExcept(defeat.world, new Set([defeat.commander.id, "character-22"]));
  const defeatMate = placeOnDock(defeat.world, "character-22", 90, 0.9);
  const defeatResult = raidThisTick(defeat.world);
  const defeatBattle = playerBattle(defeatResult.events, defeat.commander.id);
  assert.ok(defeatBattle);
  assert.equal(defeatBattle.data.outcome, "defender-victory");
  assert.equal(defeat.settlement.surrender, null);
  const defeatCaptures = defeatResult.events.filter((event) => event.type === "character-captured");
  assert.equal(defeatCaptures.length, 1);
  assert.equal(defeatCaptures[0].actorId, defeat.commander.id);
  assert.equal(defeatCaptures[0].data.cause, "major-defeat");
  assert.equal(defeatMate.captivity, null);

  const standing = prepareScriptedMajor({
    troops: 120,
    garrison: 1,
    fortification: 1,
    stability: 40,
    morale: 80,
    health: 100,
  });
  quietExcept(standing.world, new Set([standing.commander.id, "character-22"]));
  const standingMate = placeOnDock(standing.world, "character-22", 90, 0.9);
  const standingResult = raidThisTick(standing.world);
  const standingBattle = playerBattle(standingResult.events, standing.commander.id);
  assert.ok(standingBattle);
  assert.equal(standingBattle.data.outcome, "attacker-victory");
  assert.equal(standingBattle.data.defenderGarrison, 0);
  assert.equal(standing.settlement.garrison, 0);
  assert.equal(standingResult.events.some((event) => event.type === "character-captured"), false);
  assert.equal(standingMate.captivity, null);
  assert.equal(standing.commander.captivity, null);

  const immediate = prepareImmediateSurrender(39, 51.52);
  quietExcept(immediate.world, new Set([immediate.commander.id, "character-22"]));
  const immediateMate = placeOnDock(immediate.world, "character-22", 90, 0.9);
  assert.equal(isMajorBattle(immediate.commander, immediate.settlement), false);
  const immediateResult = raidThisTick(immediate.world);
  const immediateBattle = playerBattle(immediateResult.events, immediate.commander.id);
  assert.ok(immediateBattle);
  assert.equal(immediateBattle.data.outcome, "attacker-victory");
  assert.equal(immediateBattle.data.battleId, undefined);
  assert.equal(immediateResult.events.some((event) => event.data.cause === "outscore-loss"), false);
  assert.equal(immediateMate.captivity, null);
});

test("capturing the losing seat holder writes the acting commander", () => {
  const { world, commander } = hittingOutscore();
  quietExcept(world, new Set([commander.id, "character-14", "character-16"]));
  const pax = placeOnDock(world, "character-14", 80, 0.8);
  assert.equal(pax.name, "Pax Ash");
  const cover = world.characters["character-16"];
  cover.captivity = null;
  cover.locationId = "glassport";
  cover.travel = null;
  cover.skills.leadership = 10;
  cover.personality.loyalty = 0.1;
  const paxOrders = Object.values(world.characters).flatMap((character) =>
    character.standingOrders.filter((order) => order.issuerId === pax.id).map((order) => order.id),
  );
  assert.ok(paxOrders.length > 0);
  assert.equal(Object.hasOwn(world.factions["free-tide"], "actingCommanderId"), false);

  const result = raidThisTick(world);
  assert.equal(playerBattle(result.events, commander.id)?.data.outcome, "attacker-victory");
  const capture = result.events.find((event) => event.type === "character-captured");
  assert.ok(capture);
  assert.equal(capture.actorId, pax.id);
  assert.equal(capture.data.cause, "outscore-loss");
  assert.equal(pax.captivity?.cause, "outscore-loss");
  assert.equal(world.factions["free-tide"].actingCommanderId, cover.id);
  assert.equal(Object.hasOwn(world.factions["world-government"], "actingCommanderId"), false);
  assert.deepEqual(
    Object.values(world.characters).flatMap((character) =>
      character.standingOrders.filter((order) => order.issuerId === pax.id).map((order) => order.id),
    ),
    paxOrders,
  );
  assert.equal(cover.standingOrders.some((order) => order.issuerId === cover.id), false);
  assert.equal(cover.captivity, null);
});

test("an immediate battle is still the higher score when morale is 0", () => {
  const weaken = (commander: ReturnType<typeof prepareScriptedMajor>["commander"]): void => {
    commander.troops.experience = 0;
    commander.troops.discipline = 0;
    commander.skills.leadership = 0;
    commander.attributes = { power: 8, speed: 8, endurance: 8, resilience: 8 };
  };
  const won = prepareScriptedMajor({
    troops: 25,
    garrison: 8,
    fortification: 1,
    stability: 40,
    morale: 0,
    health: 100,
  });
  weaken(won.commander);
  assert.equal(isMajorBattle(won.commander, won.settlement), false);
  assert.ok(partyPower(won.commander) > settlementDefensePower(won.settlement) * 1.22);
  const wonResult = raidThisTick(won.world);
  const wonBattle = playerBattle(wonResult.events, won.commander.id);
  assert.ok(wonBattle);
  assert.equal(wonBattle.data.battleId, undefined);
  assert.equal(wonBattle.data.phases, 1);
  assert.equal(wonBattle.data.attackerMorale, 10);
  assert.ok(Number(wonBattle.data.attackerScore) > Number(wonBattle.data.defenderScore));
  assert.equal(wonBattle.data.outcome, "attacker-victory");

  const lost = prepareScriptedMajor({
    troops: 25,
    garrison: 12,
    fortification: 8,
    stability: 40,
    morale: 0,
    health: 100,
  });
  weaken(lost.commander);
  assert.equal(isMajorBattle(lost.commander, lost.settlement), false);
  assert.ok(partyPower(lost.commander) < settlementDefensePower(lost.settlement) * 0.78);
  const lostResult = raidThisTick(lost.world);
  const lostBattle = playerBattle(lostResult.events, lost.commander.id);
  assert.ok(lostBattle);
  assert.equal(lostBattle.data.battleId, undefined);
  assert.equal(lostBattle.data.attackerMorale, 0);
  assert.ok(Number(lostBattle.data.attackerScore) < Number(lostBattle.data.defenderScore));
  assert.equal(lostBattle.data.outcome, "defender-victory");
});

test("buy-provisions stays scored at -1000 when the shelf is under 1", () => {
  const closed = createPrototypeWorld(1847);
  const buyer = closed.characters["character-02"];
  assert.notEqual(buyer.id, closed.players["prototype-player"].characterId);
  assert.equal(buyer.controller.kind, "autonomous");
  buyer.locationId = "glassport";
  buyer.travel = null;
  buyer.money = 5;
  buyer.allowanceRemaining = 0;
  buyer.cargo.provisions = 0;
  closed.settlements.glassport.population = 0;
  closed.settlements.glassport.production.provisions = 0;
  closed.settlements.glassport.stocks.provisions = 0.4;
  const closedDecision = runTick(closed).events.find((event) =>
    event.type === "decision-made" && event.actorId === buyer.id
  );
  assert.ok(closedDecision);
  const closedBuy = (closedDecision.data.candidates as Array<{ action: string; score: number }>)
    .find((candidate) => candidate.action === "buy-provisions");
  assert.ok(closedBuy);
  assert.equal(closedBuy.score, -1000);

  const open = createPrototypeWorld(1847);
  const openBuyer = open.characters["character-02"];
  openBuyer.locationId = "glassport";
  openBuyer.travel = null;
  openBuyer.money = 5;
  openBuyer.allowanceRemaining = 0;
  openBuyer.cargo.provisions = 0;
  open.settlements.glassport.population = 0;
  open.settlements.glassport.production.provisions = 0;
  open.settlements.glassport.stocks.provisions = 5;
  const openDecision = runTick(open).events.find((event) =>
    event.type === "decision-made" && event.actorId === openBuyer.id
  );
  assert.ok(openDecision);
  const openBuy = (openDecision.data.candidates as Array<{ action: string; score: number }>)
    .find((candidate) => candidate.action === "buy-provisions");
  assert.ok(openBuy);
  assert.notEqual(openBuy.score, -1000);
});
