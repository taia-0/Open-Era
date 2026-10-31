import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { dashboardState, fullEventFeed } from "../src/dashboard/view-model.ts";
import { captureChanceForRisk } from "../src/sim/combat.ts";
import { submitCommand } from "../src/sim/commands.ts";
import { createConversationThread, sendConversationMessage } from "../src/sim/conversations.ts";
import { runTick, workGross } from "../src/sim/engine.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { applyEvent, round, stateHash } from "../src/sim/state.ts";
import type { Character, WorldState } from "../src/sim/types.ts";

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
  assert.equal(result.events.some((event) => event.type === "debt-repaid"), false);
});

test("a purse that cannot pay a debt emits nothing and does not draw", () => {
  const left = createPrototypeWorld(1847);
  const right = createPrototypeWorld(1847);
  const debtor = left.characters["character-04"];
  const twin = right.characters["character-04"];
  debtor.money = 0;
  twin.money = 0;
  debtor.debts.push({
    id: "debt-empty",
    creditorFactionId: "free-tide",
    originalValue: 40,
    remainingValue: 40,
    incurredTick: -1,
    reason: "prisoner-release",
  });
  const leftTick = runTick(left);
  const rightTick = runTick(right);
  assert.equal(leftTick.events.some((event) => event.type === "debt-repaid"), false);
  assert.equal(left.rngState, right.rngState);
  assert.equal(debtor.money, 0);
  assert.equal(debtor.debts[0].remainingValue, 40);
});

test("the next world day pays one day's wages toward the oldest open debt", () => {
  const world = forceRetreatCapture();
  const commander = world.characters[world.players["prototype-player"].characterId];
  commander.money = 10;
  commander.captivity!.capturedTick = world.tick - 14 * world.ticksPerDay;
  commander.captivity!.mandatoryReleaseTick = world.tick;
  const releaseResult = runTick(world);
  assert.equal(releaseResult.events.some((event) => event.type === "debt-repaid"), false);
  assert.equal(commander.debts.length, 1);
  const newer = commander.debts[0];
  assert.ok(newer.creditorFactionId);
  const older = {
    id: "debt-older",
    creditorFactionId: newer.creditorFactionId,
    originalValue: 500,
    remainingValue: 500,
    incurredTick: newer.incurredTick - 1,
    reason: "prisoner-release" as const,
  };
  commander.debts.unshift(older);

  while (world.tick % world.ticksPerDay !== 0) runTick(world);
  const wage = workGross(commander);
  commander.money = 0;
  const quiet = runTick(world);
  assert.equal(quiet.events.some((event) => event.type === "debt-repaid" && event.actorId === commander.id), false);
  assert.equal(commander.debts.find((debt) => debt.id === older.id)?.remainingValue, 500);
  while (world.tick % world.ticksPerDay !== 0) runTick(world);
  commander.money = round(wage * 2, 2);
  commander.captivity = null;
  const treasuryBefore = world.factions[newer.creditorFactionId].treasury;
  const paid = runTick(world);
  const repayment = paid.events.find((event) => event.type === "debt-repaid");
  assert.ok(repayment);
  assert.equal(repayment.actorId, commander.id);
  assert.equal(repayment.targetId, newer.creditorFactionId);
  assert.equal(repayment.settlementId, undefined);
  assert.equal(repayment.data.debtId, older.id);
  assert.equal(repayment.data.paid, wage);
  assert.equal(repayment.data.remainingValue, round(500 - wage, 2));
  assert.equal(repayment.data.characterMoney, round(wage, 2));
  // The morning stipend of one seat is drawn before the wage is credited.
  assert.equal(repayment.data.factionTreasury, round(treasuryBefore - 18 + wage, 2));
  assert.equal(repayment.data.closed, false);
  assert.equal(commander.debts.find((debt) => debt.id === older.id)?.remainingValue, round(500 - wage, 2));
  assert.equal(commander.debts.find((debt) => debt.id === newer.id)?.remainingValue, newer.remainingValue);
  assert.equal("roll" in repayment.data, false);

  commander.captivity = {
    captorFactionId: newer.creditorFactionId,
    settlementId: commander.locationId ?? "crown-harbor",
    capturedTick: world.tick,
    mandatoryReleaseTick: world.tick + 84,
    cause: "major-defeat",
    displayedRisk: "low",
    scatteredTroops: { count: 0, experience: 0, discipline: 0 },
    releaseDestinationId: null,
  };
  const remaining = commander.debts.find((debt) => debt.id === older.id)!.remainingValue;
  while (world.tick % world.ticksPerDay !== 0) runTick(world);
  commander.money = round(wage * 2, 2);
  const held = runTick(world);
  assert.equal(held.events.some((event) => event.type === "debt-repaid" && event.actorId === commander.id), false);
  assert.equal(commander.debts.find((debt) => debt.id === older.id)?.remainingValue, remaining);
  assert.equal(commander.money, round(wage * 2, 2));

  commander.captivity = null;
  const blocked = commander.debts.find((debt) => debt.id === older.id)!;
  blocked.creditorFactionId = null;
  const blockedRemaining = blocked.remainingValue;
  while (world.tick % world.ticksPerDay !== 0) runTick(world);
  commander.money = round(wage * 2, 2);
  const skipped = runTick(world);
  assert.equal(skipped.events.some((event) => event.type === "debt-repaid" && event.data.debtId === older.id), false);
  assert.equal(commander.debts.find((debt) => debt.id === older.id)?.remainingValue, blockedRemaining);
  assert.equal(commander.debts.find((debt) => debt.id === older.id)?.creditorFactionId, null);
});

function releaseWithDebt(world: WorldState, character: Character, debtValue: number): void {
  applyEvent(world, {
    sequence: world.nextEventSequence,
    tick: world.tick,
    type: "captivity-released",
    actorId: character.id,
    settlementId: character.locationId ?? "crown-harbor",
    data: {
      characterMoney: character.money,
      releaseLocationId: character.locationId,
      troopRecovery: null,
      travel: null,
      terms: { systemMaximum: 600, demandedValue: Math.max(debtValue, 0), moneyPaid: 0, debtValue },
    },
  });
}

test("an unpaid release writes the loyalty scar, and a paid release does not", () => {
  const world = createPrototypeWorld(1847);
  const character = world.characters["character-04"];
  assert.equal(character.factionId !== null, true);
  character.personality.loyalty = 0.577;
  const rng = world.rngState;
  const loyalty = character.personality.loyalty;
  releaseWithDebt(world, character, 103.21);
  assert.equal(world.rngState, rng);
  assert.equal(character.personality.loyalty, loyalty);
  assert.equal(character.loyaltyAdjustment, -0.04);
  assert.equal(round(character.personality.loyalty + character.loyaltyAdjustment, 3), 0.537);
  assert.equal(Object.hasOwn(world.characters["character-04"], "loyaltyAdjustment"), true);

  const paid = createPrototypeWorld(1847);
  const payer = paid.characters["character-04"];
  payer.personality.loyalty = 0.577;
  const paidRng = paid.rngState;
  releaseWithDebt(paid, payer, 0);
  assert.equal(paid.rngState, paidRng);
  assert.equal(payer.personality.loyalty, 0.577);
  assert.equal(Object.hasOwn(payer, "loyaltyAdjustment"), false);

  payer.loyaltyAdjustment = -0.04;
  releaseWithDebt(paid, payer, 0);
  assert.equal(payer.loyaltyAdjustment, -0.04);
  assert.equal(payer.personality.loyalty, 0.577);
});

test("a second unpaid release stacks the scar, and both clamps hold", () => {
  const world = createPrototypeWorld(1847);
  const character = world.characters["character-08"];
  character.personality.loyalty = 0.73;
  releaseWithDebt(world, character, 10);
  assert.equal(character.loyaltyAdjustment, -0.04);
  assert.equal(round(character.personality.loyalty + character.loyaltyAdjustment, 3), 0.69);
  releaseWithDebt(world, character, 10);
  assert.equal(character.personality.loyalty, 0.73);
  assert.equal(character.loyaltyAdjustment, -0.08);
  assert.equal(round(character.personality.loyalty + character.loyaltyAdjustment, 3), 0.65);

  const low = createPrototypeWorld(1847);
  const floored = low.characters["character-08"];
  floored.personality.loyalty = 0.06;
  releaseWithDebt(low, floored, 12);
  assert.equal(floored.personality.loyalty, 0.06);
  assert.equal(round(floored.personality.loyalty + (floored.loyaltyAdjustment ?? 0), 3), 0.05);
  assert.equal(floored.loyaltyAdjustment, -0.01);
  releaseWithDebt(low, floored, 12);
  assert.equal(round(floored.personality.loyalty + (floored.loyaltyAdjustment ?? 0), 3), 0.05);
  assert.equal(floored.loyaltyAdjustment, -0.01);

  const floorWorld = createPrototypeWorld(1847);
  const atFloor = floorWorld.characters["character-08"];
  atFloor.personality.loyalty = 0.05;
  releaseWithDebt(floorWorld, atFloor, 12);
  assert.equal(Object.hasOwn(atFloor, "loyaltyAdjustment"), false);

  const high = createPrototypeWorld(1847);
  const capped = high.characters["character-08"];
  capped.personality.loyalty = 1.1;
  releaseWithDebt(high, capped, 12);
  assert.equal(capped.personality.loyalty, 1.1);
  assert.equal(round(capped.personality.loyalty + (capped.loyaltyAdjustment ?? 0), 3), 0.98);
  assert.equal(capped.loyaltyAdjustment, round(0.98 - 1.1, 3));

  const uneven = createPrototypeWorld(1847);
  const rounded = uneven.characters["character-08"];
  rounded.personality.loyalty = 0.3336;
  const rng = uneven.rngState;
  releaseWithDebt(uneven, rounded, 4.5);
  assert.equal(uneven.rngState, rng);
  assert.equal(rounded.personality.loyalty, 0.3336);
  const scarred = round(Math.max(0.05, Math.min(0.98, 0.3336 - 0.04)), 3);
  assert.equal(scarred, 0.294);
  assert.equal(round(rounded.personality.loyalty + (rounded.loyaltyAdjustment ?? 0), 3), scarred);
  assert.equal(rounded.loyaltyAdjustment, round(scarred - 0.3336, 3));

  const unaligned = createPrototypeWorld(1847);
  const outsider = unaligned.characters["character-08"];
  outsider.factionId = null;
  outsider.personality.loyalty = 0.5;
  releaseWithDebt(unaligned, outsider, 20);
  assert.equal(Object.hasOwn(outsider, "loyaltyAdjustment"), false);
  assert.equal(outsider.personality.loyalty, 0.5);
});

test("an escape stores no loyalty scar and does not clear one already stored", () => {
  const world = createPrototypeWorld(1847);
  const character = world.characters["character-04"];
  character.loyaltyAdjustment = -0.04;
  const loyalty = character.personality.loyalty;
  const rng = world.rngState;
  const sequence = world.nextEventSequence;
  applyEvent(world, {
    sequence: world.nextEventSequence,
    tick: world.tick,
    type: "captivity-escaped",
    actorId: character.id,
    settlementId: character.locationId ?? "crown-harbor",
    data: {
      health: character.health,
      morale: character.morale,
      attributes: character.attributes,
      releaseLocationId: character.locationId,
      troopRecovery: null,
      travel: null,
    },
  });
  assert.equal(character.loyaltyAdjustment, -0.04);
  assert.equal(character.personality.loyalty, loyalty);
  assert.equal(world.rngState, rng);
  assert.equal(world.nextEventSequence, sequence + 1);
});

test("a mandatory unpaid release writes the scar and a fully paid release does not", () => {
  const unpaid = forceRetreatCapture();
  const commander = unpaid.characters[unpaid.players["prototype-player"].characterId];
  const seeded = commander.personality.loyalty;
  commander.money = 0;
  commander.captivity!.capturedTick = unpaid.tick - 14 * unpaid.ticksPerDay;
  commander.captivity!.mandatoryReleaseTick = unpaid.tick;
  const result = runTick(unpaid);
  const release = result.events.find((event) => event.type === "captivity-released");
  assert.ok(release);
  const debtValue = (release.data.terms as { debtValue: number }).debtValue;
  assert.ok(debtValue > 0);
  assert.equal(commander.personality.loyalty, seeded);
  assert.equal(commander.loyaltyAdjustment, round(round(Math.max(0.05, Math.min(0.98, seeded - 0.04)), 3) - seeded, 3));
  assert.equal(result.events.some((event) => event.type === "loyalty-scarred"), false);
  assert.equal(Object.hasOwn(release.data, "loyaltyAdjustment"), false);

  const paid = forceRetreatCapture();
  const payer = paid.characters[paid.players["prototype-player"].characterId];
  const paidSeed = payer.personality.loyalty;
  payer.money = 1_000_000;
  payer.captivity!.capturedTick = paid.tick - 14 * paid.ticksPerDay;
  payer.captivity!.mandatoryReleaseTick = paid.tick;
  const paidResult = runTick(paid);
  const paidRelease = paidResult.events.find((event) => event.type === "captivity-released");
  assert.ok(paidRelease);
  assert.equal((paidRelease.data.terms as { debtValue: number }).debtValue, 0);
  assert.equal(payer.personality.loyalty, paidSeed);
  assert.equal(Object.hasOwn(payer, "loyaltyAdjustment"), false);
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
