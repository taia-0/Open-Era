import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assessStandingOrder, judgeOrderCompletion, reviewPlan } from "../src/sim/agency.ts";
import { submitCommand } from "../src/sim/commands.ts";
import { AT_SEA_REASON, VOYAGE_REASON, assessSupplyContract } from "../src/sim/contracts.ts";
import { projectEventFeed } from "../src/dashboard/view-model.ts";
import { runTick, runTicks } from "../src/sim/engine.ts";
import { DeterministicRng } from "../src/sim/rng.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { applyEvent, clamp, round, stateHash } from "../src/sim/state.ts";
import type { Relationship, SimEvent, WorldState } from "../src/sim/types.ts";

test("characters begin with rooted goals, beliefs, relationships, and faction orders", () => {
  const world = createPrototypeWorld(1847);
  const characters = Object.values(world.characters);

  assert.ok(characters.every((character) => character.goals.length >= 2));
  assert.ok(characters.every((character) => Object.keys(character.knowledge).length === 4));
  assert.ok(characters.every((character) => Object.keys(character.relationships).length >= 1));

  const ordered = characters.filter((character) => character.standingOrders.length > 0);
  assert.equal(ordered.length, 20);
  const assessments = ordered.map((character) => assessStandingOrder(character, character.standingOrders[0])!);
  assert.ok(assessments.some((assessment) => assessment.willComply));
  assert.ok(assessments.some((assessment) => !assessment.willComply));
});

test("initial planning records alternatives and independent order judgments", () => {
  const world = createPrototypeWorld(1847);
  const result = runTick(world);
  const reviews = result.events.filter((event) => event.type === "plan-reconsidered");

  assert.equal(reviews.length, 29);
  const assessments = reviews
    .map((event) => event.data.orderAssessment as { willComply: boolean } | null)
    .filter((assessment): assessment is { willComply: boolean } => Boolean(assessment));
  assert.equal(assessments.length, 20);
  assert.ok(assessments.some((assessment) => assessment.willComply));
  assert.ok(assessments.some((assessment) => !assessment.willComply));
  assert.ok(reviews.every((event) => Array.isArray(event.data.goalScores)));
});

test("a merchant travels according to believed prices rather than hidden true prices", () => {
  const world = createPrototypeWorld(1847);
  const merchant = world.characters["character-02"];
  merchant.locationId = "crown-harbor";
  merchant.travel = null;
  merchant.standingOrders = [];
  merchant.plan = null;
  merchant.cargo.arms = 50;
  for (const goal of merchant.goals) goal.priority = goal.kind === "build-wealth" ? 2 : 0.1;
  for (const [settlementId, knowledge] of Object.entries(merchant.knowledge)) {
    knowledge.confidence = 1;
    knowledge.observedTick = 0;
    knowledge.priceEstimate.arms = settlementId === "verdant-cay" ? 50 : 1;
  }

  const result = runTick(world);
  const decision = result.events.find(
    (event) => event.type === "decision-made" && event.actorId === merchant.id,
  );
  assert.equal((decision?.data.chosen as { action: string }).action, "travel");
  assert.equal((decision?.data.chosen as { targetId: string }).targetId, "verdant-cay");
  assert.equal((decision?.data.targetKnowledge as { priceEstimate: { arms: number } }).priceEstimate.arms, 50);
});

test("urgent survival needs can override an aggressive character's established ambition", () => {
  const world = createPrototypeWorld(1847);
  const raider = world.characters["character-14"];
  raider.cargo.provisions = 0;
  raider.plan = null;

  const result = runTick(world);
  const review = result.events.find(
    (event) => event.type === "plan-reconsidered" && event.actorId === raider.id,
  );
  assert.equal(review?.data.selectedGoalId, `${raider.id}:material-security`);
});

test("battle experiences reshape goals and may change hierarchical relationships", () => {
  const result = runTicks(createPrototypeWorld(1847), 90);
  const evolved = result.events.filter((event) => event.type === "goal-evolved");
  const relationships = result.events.filter((event) => event.type === "relationship-changed");

  assert.ok(evolved.length > 0);
  assert.ok(evolved.some((event) => event.data.trigger === "victory"));
  assert.ok(evolved.some((event) => event.data.trigger === "defeat"));
  assert.ok(relationships.length > 0);
});

test("after a claim at garrison 13, regrowth reaches 15 and a hostile raid is offered", () => {
  const world = createPrototypeWorld(1847);
  const claimant = world.characters["character-03"];
  const raider = world.characters["character-14"];
  const settlement = world.settlements["cinder-key"];
  assert.notEqual(raider.factionId, claimant.factionId);
  assert.ok(raider.factionId);
  // Cinder Key is Free Tide's only port. Another settlement under the floor
  // keeps the ordinary gate of 15. Garrison 7 cannot be raided away.
  const anchor = world.settlements["verdant-cay"];
  anchor.factionId = raider.factionId;
  anchor.garrison = 7;
  claimant.locationId = settlement.id;
  claimant.travel = null;
  settlement.garrison = 13;
  settlement.stability = 18;
  settlement.surrender = {
    offeredToId: claimant.id,
    offeredTick: world.tick,
    previousFactionId: "free-tide",
  };

  const claimed = runTick(world);
  assert.ok(claimed.events.some((event) =>
    event.type === "settlement-claimed" && event.settlementId === settlement.id && event.actorId === claimant.id
  ));
  assert.equal(settlement.garrison, 13);

  raider.personality = {
    ...raider.personality,
    aggression: 0.99,
    ambition: 0.99,
    caution: 0,
    curiosity: 0,
    commerce: 0,
  };
  raider.troops.count = 120;
  raider.plan = null;

  const claims = claimed.events.filter((event) =>
    event.type === "settlement-claimed" && event.settlementId === settlement.id
  );
  let raidOffered = false;
  let crossedAt: number | null = null;
  const upkeepGarrison = new Map<number, number>();

  while (world.tick <= 62) {
    for (const character of Object.values(world.characters)) {
      if (character.id === raider.id) continue;
      character.lastBattleTick = world.tick;
      if (character.id !== claimant.id && character.locationId === settlement.id) {
        character.locationId = "crown-harbor";
        character.travel = null;
      }
    }
    raider.locationId = settlement.id;
    raider.travel = null;
    raider.captivity = null;
    raider.plan = null;
    raider.lastBattleTick = -100;
    settlement.stocks.provisions = 100_000;
    const result = runTick(world);
    for (const event of result.events) {
      if (event.type === "settlement-claimed" && event.settlementId === settlement.id) claims.push(event);
      if (
        (event.type === "settlement-upkeep" || event.type === "settlement-shortage") &&
        event.settlementId === settlement.id
      ) {
        upkeepGarrison.set(event.tick, event.data.garrison as number);
      }
      const candidates = event.data.candidates as Array<{ action?: string; targetId?: string }> | undefined;
      if (
        event.type === "decision-made" &&
        event.actorId === raider.id &&
        candidates?.some((candidate) => candidate.action === "raid" && candidate.targetId === settlement.id)
      ) {
        raidOffered = true;
        crossedAt = event.tick;
      }
    }
  }

  assert.equal(upkeepGarrison.get(31), 14);
  assert.equal(upkeepGarrison.get(62), 15);
  assert.equal(raidOffered, true);
  assert.equal(crossedAt, 62);
  assert.equal(claims.length, 1);
  assert.ok(claims.length < world.tick, "claims must not arrive on every tick");
});

test("an autonomous character claims a hostile settlement that offers surrender", () => {
  const world = createPrototypeWorld(1847);
  const claimant = world.characters["character-03"];
  const settlement = world.settlements["cinder-key"];
  claimant.locationId = settlement.id;
  claimant.travel = null;
  settlement.garrison = 8;
  settlement.stability = 18;
  settlement.surrender = {
    offeredToId: claimant.id,
    offeredTick: world.tick,
    previousFactionId: "free-tide",
  };

  const result = runTick(world);
  const claim = result.events.find((event) =>
    event.type === "settlement-claimed" && event.actorId === claimant.id
  );
  assert.ok(claim);
  assert.equal(settlement.ownerId, claimant.id);
  assert.equal(settlement.factionId, claimant.factionId);
});

test("a claimed port is not claimed or raided again while its garrison stays under 15", () => {
  const world = createPrototypeWorld(1847);
  const claimant = world.characters["character-03"];
  const settlement = world.settlements["cinder-key"];
  claimant.locationId = settlement.id;
  claimant.travel = null;
  settlement.garrison = 8;
  settlement.stability = 18;
  settlement.surrender = {
    offeredToId: claimant.id,
    offeredTick: world.tick,
    previousFactionId: "free-tide",
  };
  // The faction that loses this port still holds Verdant Cay, under the floor,
  // so garrison 8 stays on the ordinary raid gate.
  const anchor = world.settlements["verdant-cay"];
  anchor.factionId = "free-tide";
  anchor.garrison = 7;

  const claimed = runTick(world);
  assert.ok(claimed.events.some((event) =>
    event.type === "settlement-claimed" && event.settlementId === settlement.id
  ));
  assert.ok(settlement.garrison < 15);

  const later = runTicks(world, 36);
  const events = [...claimed.events, ...later.events];
  const claims = events.filter((event) =>
    event.type === "settlement-claimed" && event.settlementId === settlement.id
  );
  assert.equal(claims.length, 1);
  const raids = events.filter((event) => {
    const chosen = event.data.chosen as { action?: string; targetId?: string } | undefined;
    return event.type === "decision-made" &&
      chosen?.action === "raid" &&
      (event.settlementId === settlement.id || chosen.targetId === settlement.id);
  });
  assert.equal(raids.length, 0);
  assert.ok(settlement.garrison < 15, `garrison recovered to ${settlement.garrison}`);
});

test("a landless faction is offered a raid at garrison 8, and not below it or while it holds a port", () => {
  const raidCandidates = (events: SimEvent[], actorId: string, settlementId: string) =>
    events.some((event) => {
      const candidates = event.data.candidates as Array<{ action?: string; targetId?: string }> | undefined;
      return event.type === "decision-made" &&
        event.actorId === actorId &&
        candidates?.some((candidate) => candidate.action === "raid" && candidate.targetId === settlementId);
    });

  const place = (seedWorld: WorldState, garrison: number) => {
    const raider = seedWorld.characters["character-14"];
    const settlement = seedWorld.settlements.glassport;
    assert.equal(raider.factionId, "free-tide");
    assert.equal(raider.name, "Pax Ash");
    for (const character of Object.values(seedWorld.characters)) {
      if (character.id === raider.id) continue;
      character.lastBattleTick = seedWorld.tick;
      if (character.locationId === settlement.id) {
        character.locationId = "verdant-cay";
        character.travel = null;
      }
    }
    raider.locationId = settlement.id;
    raider.travel = null;
    raider.captivity = null;
    raider.plan = null;
    raider.lastBattleTick = -100;
    raider.troops.count = 25;
    settlement.garrison = garrison;
    settlement.factionId = "world-government";
    return { raider, settlement };
  };

  const landlessAt = (garrison: number) => {
    const world = createPrototypeWorld(1847);
    world.settlements["cinder-key"].factionId = "world-government";
    assert.equal(Object.values(world.settlements).some((settlement) => settlement.factionId === "free-tide"), false);
    const placed = place(world, garrison);
    const result = runTick(world);
    return { world, ...placed, result };
  };

  const offered = landlessAt(8);
  assert.equal(raidCandidates(offered.result.events, offered.raider.id, offered.settlement.id), true);

  const below = landlessAt(7);
  assert.equal(raidCandidates(below.result.events, below.raider.id, below.settlement.id), false);

  const holding = createPrototypeWorld(1847);
  assert.equal(holding.settlements["cinder-key"].factionId, "free-tide");
  const held = place(holding, 8);
  assert.equal(raidCandidates(runTick(holding).events, held.raider.id, held.settlement.id), false);

  const fight = createPrototypeWorld(1847);
  fight.settlements["cinder-key"].factionId = "world-government";
  const attacker = place(fight, 8);
  attacker.settlement.population = 0;
  attacker.settlement.fortification = 1;
  attacker.settlement.stability = 70;
  attacker.raider.skills.strategy = 125;
  attacker.raider.health = 100;
  attacker.raider.morale = 100;
  const battleTick = runTick(fight);
  const battle = battleTick.events.find((event) =>
    event.type === "battle-resolved" && event.actorId === attacker.raider.id
  );
  assert.ok(battle);
  assert.equal(battle.data.outcome, "attacker-victory");
  assert.ok(attacker.settlement.surrender);
  const claimTick = runTick(fight);
  assert.ok(claimTick.events.some((event) =>
    event.type === "settlement-claimed" &&
    event.actorId === attacker.raider.id &&
    event.settlementId === attacker.settlement.id
  ));
  assert.equal(attacker.settlement.factionId, "free-tide");
  assert.ok(attacker.settlement.garrison < 15);

  const later = runTicks(fight, 24);
  const laterRaids = later.events.filter((event) => {
    const chosen = event.data.chosen as { action?: string; targetId?: string } | undefined;
    return event.type === "decision-made" &&
      chosen?.action === "raid" &&
      (event.settlementId === attacker.settlement.id || chosen.targetId === attacker.settlement.id);
  });
  assert.equal(laterRaids.length, 0);
  assert.ok(attacker.settlement.garrison < 15, `garrison recovered to ${attacker.settlement.garrison}`);
  assert.equal(attacker.settlement.factionId, "free-tide");
});

test("Crown Harbor left at garrison 6 and stability 0 reaches 15 and a hostile raid is offered", () => {
  const world = createPrototypeWorld(1847);
  const raider = world.characters["character-14"];
  const settlement = world.settlements["crown-harbor"];
  assert.equal(raider.factionId, "free-tide");
  assert.notEqual(raider.factionId, settlement.factionId);
  settlement.garrison = 6;
  settlement.stability = 0;
  settlement.stocks.provisions = 0;
  raider.personality = {
    ...raider.personality,
    aggression: 0.99,
    ambition: 0.99,
    caution: 0,
    curiosity: 0,
    commerce: 0,
  };
  raider.troops.count = 120;
  raider.plan = null;

  let raidOffered = false;
  let crossedAt: number | null = null;
  const upkeepGarrison = new Map<number, number>();

  while (world.tick <= 99) {
    for (const character of Object.values(world.characters)) {
      if (character.id === raider.id) continue;
      character.lastBattleTick = world.tick;
      if (character.locationId === settlement.id) {
        character.locationId = "verdant-cay";
        character.travel = null;
      }
    }
    raider.locationId = settlement.id;
    raider.travel = null;
    raider.captivity = null;
    raider.plan = null;
    raider.lastBattleTick = -100;
    const result = runTick(world);
    for (const event of result.events) {
      if (
        (event.type === "settlement-upkeep" || event.type === "settlement-shortage") &&
        event.settlementId === settlement.id
      ) {
        upkeepGarrison.set(event.tick, event.data.garrison as number);
        assert.equal(event.type, "settlement-upkeep");
        assert.equal(event.data.shortage, 0);
      }
      const candidates = event.data.candidates as Array<{ action?: string; targetId?: string }> | undefined;
      if (
        event.type === "decision-made" &&
        event.actorId === raider.id &&
        candidates?.some((candidate) => candidate.action === "raid" && candidate.targetId === settlement.id)
      ) {
        raidOffered = true;
        crossedAt = event.tick;
      }
    }
  }

  assert.equal(upkeepGarrison.get(11), 7);
  assert.equal(upkeepGarrison.get(88), 14);
  assert.equal(upkeepGarrison.get(99), 15);
  assert.equal(raidOffered, true);
  assert.equal(crossedAt, 99);
});

test("satisfying the last ambition renews opening roots and leaves battle goals finished", () => {
  const world = createPrototypeWorld(1847);
  const character = world.characters["character-25"];
  assert.equal(character.archetype, "steward");
  assert.equal(character.factionId, null);
  const security = character.goals.find((goal) => goal.kind === "material-security");
  const power = character.goals.find((goal) => goal.kind === "build-power");
  assert.ok(security && power);
  security.progress = 1;
  security.status = "satisfied";
  power.progress = 0.999;
  power.status = "active";
  character.activeGoalId = power.id;
  character.goals.push({
    id: `${character.id}:recover-strength`,
    kind: "recover-strength",
    label: "Recover strength after a consequential defeat",
    priority: 0.92,
    progress: 1,
    status: "satisfied",
    origin: "defeat at Glassport",
    createdTick: 40,
  });

  let renewed = false;
  for (let attempt = 0; attempt < 6 && !renewed; attempt += 1) {
    const result = runTick(world);
    renewed = result.events.some((event) =>
      event.type === "goal-evolved" &&
      event.actorId === character.id &&
      event.data.trigger === "satisfying every open ambition"
    );
  }
  assert.equal(renewed, true);
  const recovery = character.goals.find((goal) => goal.kind === "recover-strength");
  const renewedSecurity = character.goals.find((goal) => goal.kind === "material-security");
  const renewedPower = character.goals.find((goal) => goal.kind === "build-power");
  assert.equal(recovery?.status, "satisfied");
  assert.equal(recovery?.progress, 1);
  for (const goal of [renewedSecurity, renewedPower]) {
    assert.ok(goal);
    assert.equal(goal.status, "active");
    assert.equal(goal.progress, 0);
    assert.equal(goal.origin.startsWith("renewed: "), true);
  }
  assert.doesNotThrow(() => runTick(world));
  assert.ok(character.goals.some((goal) => goal.status === "active"));
});

test("seeds that used to exhaust ambitions still have a goal after 400 ticks", () => {
  for (const seed of [1847, 2718, 4096]) {
    const result = runTicks(createPrototypeWorld(seed), 400);
    assert.equal(result.state.tick, 400);
    const renewals = result.events.filter((event) =>
      event.type === "goal-evolved" && event.data.trigger === "satisfying every open ambition"
    );
    assert.ok(renewals.length > 0, `seed ${seed} never renewed an ambition`);
    assert.ok(renewals.every((event) => event.tick > 72), `seed ${seed} renewed inside the golden window`);
    for (const character of Object.values(result.state.characters)) {
      assert.ok(
        character.goals.some((goal) => goal.status === "active"),
        `${character.name} on seed ${seed} has no active goal at tick 400`,
      );
    }
  }
});

test("accepted orders report temporary deviations, resumptions, and completion judgments", () => {
  const result = runTicks(createPrototypeWorld(1847), 24);
  const deviations = result.events.filter((event) => event.type === "standing-order-deviated");
  const resumptions = result.events.filter((event) => event.type === "standing-order-resumed");
  const reports = result.events.filter((event) => event.type === "standing-order-completion-reported");

  assert.ok(deviations.length > 0);
  assert.ok(resumptions.some((event) => deviations.some((deviation) => deviation.data.orderId === event.data.orderId)));
  assert.ok(reports.length > 0);
  assert.ok(reports.every((event) => {
    const character = result.state.characters[event.actorId!];
    return character.standingOrders.some((order) =>
      order.id === event.data.orderId &&
      (order.status === "awaiting-confirmation" || order.status === "completed")
    );
  }));
});

test("a free autonomous issuer confirms the report on the next tick without drawing rng", () => {
  const world = createPrototypeWorld(1847);
  const reported = runTick(world);
  const report = reported.events.find((event) =>
    event.type === "standing-order-completion-reported" && event.data.issuerId === "character-14"
  );
  assert.ok(report);
  const holder = world.characters[report.actorId!];
  const order = holder.standingOrders.find((candidate) => candidate.id === report.data.orderId)!;
  const issuer = world.characters["character-14"];
  assert.equal(order.status, "awaiting-confirmation");
  assert.equal(issuer.controller.kind, "autonomous");
  assert.equal(issuer.captivity, null);

  const held = structuredClone(world);
  for (const character of Object.values(held.characters)) {
    for (const waiting of character.standingOrders) {
      if (waiting.status === "awaiting-confirmation") waiting.statusChangedTick = held.tick;
    }
  }
  const closed = runTick(world);
  runTick(held);
  const completion = closed.events.find((event) =>
    event.type === "standing-order-completed" && event.data.orderId === order.id
  );
  assert.ok(completion);
  assert.equal(completion.data.reason, "issuer-judgment");
  assert.equal(completion.actorId, issuer.id);
  assert.equal(completion.targetId, holder.id);
  assert.equal(completion.data.commandId, undefined);
  assert.equal(closed.events.some((event) => event.type === "player-command-resolved" && event.data.orderId === order.id), false);
  assert.equal(order.status, "completed");
  assert.equal(order.lastReport?.kind, "confirmed");
  assert.equal(world.rngState, held.rngState);
});

test("a pressure completion writes no relationship, and a protect completion writes the victory deltas once", () => {
  const victory = { trust: 0.012, respect: 0.028, fear: -0.005, grievance: -0.006, obligation: -0.01 };

  const pressureWorld = createPrototypeWorld(1847);
  const esme = pressureWorld.characters["character-19"];
  const pax = pressureWorld.characters["character-14"];
  assert.equal(esme.name, "Esme Dusk");
  const pressure = esme.standingOrders.find((order) => order.directive === "pressure" && order.issuerId === pax.id);
  assert.ok(pressure);
  pressure.status = "awaiting-confirmation";
  pressure.adherence = "following";
  pressure.statusChangedTick = -1;
  const pressureTick = runTick(pressureWorld);
  assert.equal(pressure.status, "completed");
  assert.equal(pressure.lastReport?.kind, "confirmed");
  assert.equal(pressureTick.events.some((event) =>
    event.type === "standing-order-completed" &&
    event.data.orderId === pressure.id &&
    event.data.reason === "issuer-judgment"
  ), true);
  assert.equal(pressureTick.events.some((event) =>
    event.type === "relationship-changed" && event.data.trigger === "order confirmed"
  ), false);

  const protectWorld = createPrototypeWorld(1847);
  const zara = protectWorld.characters["character-17"];
  const issuer = protectWorld.characters["character-14"];
  assert.equal(zara.name, "Zara Gale");
  const protect = zara.standingOrders[0];
  assert.ok(protect);
  protect.directive = "protect";
  protect.targetId = "cinder-key";
  protect.issuerId = issuer.id;
  protect.status = "awaiting-confirmation";
  protect.adherence = "following";
  protect.statusChangedTick = -1;
  const prior = zara.relationships[issuer.id];
  assert.ok(prior);
  const protectTick = runTick(protectWorld);
  const completion = protectTick.events.find((event) =>
    event.type === "standing-order-completed" && event.data.orderId === protect.id
  );
  const relationship = protectTick.events.find((event) =>
    event.type === "relationship-changed" &&
    event.data.trigger === "order confirmed" &&
    event.actorId === zara.id
  );
  assert.ok(completion);
  assert.equal(completion.data.reason, "issuer-judgment");
  assert.ok(relationship);
  const written = relationship.data.relationship as Relationship;
  assert.equal(written.trust, round(clamp(prior.trust + victory.trust, 0, 1)));
  assert.equal(written.respect, round(clamp(prior.respect + victory.respect, 0, 1)));
  assert.equal(written.fear, round(clamp(prior.fear + victory.fear, 0, 1)));
  assert.equal(written.grievance, round(clamp(prior.grievance + victory.grievance, 0, 1)));
  assert.equal(written.obligation, round(clamp(prior.obligation + victory.obligation, 0, 1)));
  assert.equal(written.affinity, prior.affinity);
  assert.equal(protect.status, "completed");

  const again = runTick(protectWorld);
  assert.equal(again.events.some((event) =>
    event.type === "relationship-changed" &&
    event.data.trigger === "order confirmed" &&
    event.actorId === zara.id &&
    event.targetId === issuer.id
  ), false);
  assert.equal(again.events.some((event) =>
    event.type === "standing-order-completed" && event.data.orderId === protect.id
  ), false);
});

const VICTORY = { trust: 0.012, respect: 0.028, fear: -0.005, grievance: -0.006, obligation: -0.01 };
const DEFEAT = { trust: -0.025, respect: -0.008, fear: 0.018, grievance: 0.035, obligation: 0.015 };

function offerDelivery(
  world: WorldState,
  price: number,
  quantity = 10,
  expiresInTicks = 12,
) {
  return submitCommand(world, {
    playerId: "prototype-player",
    type: "offer-contract",
    characterId: "character-17",
    quantity,
    destinationId: "crown-harbor",
    price,
    expiresInTicks,
  });
}

function contractEvents(events: SimEvent[]): SimEvent[] {
  return events.filter((event) => event.type.startsWith("contract-"));
}

function pinCarrier(world: WorldState): void {
  const carrier = world.characters["character-17"];
  carrier.locationId = "crown-harbor";
  carrier.travel = null;
}

test("Zara accepts price 18 and refuses price 8 at the opening factors, and scoring does not advance the rng", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  const zara = world.characters["character-17"];
  assert.equal(zara.name, "Zara Gale");
  assert.equal(zara.locationId, "crown-harbor");
  assert.equal(zara.cargo.provisions, 32);
  assert.equal(zara.money, 93);
  assert.equal(mara.money, 108);
  const rng = world.rngState;
  const hash = stateHash(world);
  const terms = {
    buyerId: mara.id,
    quantity: 10,
    destinationId: "crown-harbor",
    deadlineTick: 12,
  };
  const accept = assessSupplyContract(world, zara, { ...terms, price: 18 });
  const refuse = assessSupplyContract(world, zara, { ...terms, price: 8 });

  assert.equal(accept.accepted, true);
  assert.equal(accept.gate, null);
  assert.equal(accept.score, 0.671);
  assert.equal(accept.threshold, 0.561);
  assert.equal(accept.costBasis, 14.7);
  assert.equal(accept.travelTicks, 0);
  assert.deepEqual(accept.factors, {
    commerce: 0.268,
    margin: 0.224,
    trust: 0.093,
    respect: 0.111,
    grievance: -0.022,
    obligation: 0.017,
    perceivedRisk: -0.02,
  });
  assert.equal(refuse.accepted, false);
  assert.equal(refuse.gate, "score");
  assert.equal(refuse.score, 0.197);
  assert.equal(refuse.factors.margin, -0.25);
  assert.equal(refuse.threshold, 0.561);
  assert.equal(world.rngState, rng);
  assert.equal(stateHash(world), hash);
  assert.equal(Object.keys(world.contracts ?? {}).length, 0);
});

test("a carrier already at sea refuses under the travel gate and the escrow returns once", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  const corin = world.characters["character-16"];
  assert.equal(corin.name, "Corin Hale");
  assert.equal(corin.locationId, "glassport");
  assert.equal(corin.travel, null);
  const submission = submitCommand(world, {
    playerId: "prototype-player",
    type: "offer-contract",
    characterId: "character-16",
    quantity: 10,
    destinationId: "crown-harbor",
    price: 30,
    expiresInTicks: 24,
  });
  assert.equal(submission.ok, true);

  const offered = runTick(world);
  const contract = Object.values(world.contracts ?? {})[0];
  assert.ok(contract);
  assert.equal(contract.status, "offered");
  assert.equal(contract.escrow, 30);
  assert.equal(contract.settled, false);
  // The holder draws the escrow from the treasury. The purse stays 108.
  assert.equal(mara.money, 108);
  assert.equal(offered.events.some((event) => event.type === "contract-refused"), false);
  assert.equal(offered.events.some((event) => event.type === "contract-accepted"), false);

  corin.locationId = null;
  corin.travel = { fromId: "glassport", toId: "cinder-key", totalTicks: 2, remainingTicks: 2 };
  const judged = runTick(world);
  const refusal = judged.events.find((event) => event.type === "contract-refused");
  assert.ok(refusal);
  assert.equal(refusal.data.gate, "travel");
  assert.notEqual(refusal.data.gate, "score");
  assert.equal(refusal.data.reason, AT_SEA_REASON);
  assert.equal(refusal.data.score, null);
  assert.equal(refusal.data.costBasis, null);
  assert.equal(typeof refusal.data.threshold, "number");
  assert.deepEqual(refusal.data.factors, {
    commerce: 0,
    margin: 0,
    trust: 0,
    respect: 0,
    grievance: 0,
    obligation: 0,
    perceivedRisk: 0,
  });
  assert.equal(refusal.data.travelTicks, 2);
  assert.equal(refusal.data.escrow, 0);
  // The refund of the treasury-funded 30 credits the purse.
  assert.equal(refusal.data.buyerMoney, 138);
  assert.equal(world.contracts?.[contract.id].status, "refused");
  assert.equal(world.contracts?.[contract.id].settled, true);
  assert.equal(world.contracts?.[contract.id].escrow, 0);
  assert.equal(mara.money, 138);
  assert.equal(
    judged.events.filter((event) => event.type === "contract-refused").length,
    1,
  );
  const feed = projectEventFeed(world, mara.id, [refusal]);
  assert.equal(
    feed[0].summary,
    "Corin Hale refused the provisions contract. The carrier is already at sea.",
  );

  const again = runTick(world);
  assert.equal(again.events.some((event) => event.type === "contract-refused"), false);
  assert.equal(mara.money, 138);
});

test("scoring a contract always has a positive cost basis", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  const docked = Object.values(world.characters).filter((character) => character.locationId && !character.travel);
  assert.ok(docked.length > 0);
  for (const carrier of docked) {
    for (const price of [8, 18, 30]) {
      const assessment = assessSupplyContract(world, carrier, {
        buyerId: mara.id,
        quantity: 10,
        price,
        destinationId: "crown-harbor",
        deadlineTick: 720,
      });
      if (assessment.gate === null || assessment.gate === "score" || assessment.gate === "purse") {
        assert.ok(
          assessment.costBasis !== null && assessment.costBasis > 0,
          `${carrier.id} price ${price} gate ${assessment.gate} costBasis ${assessment.costBasis}`,
        );
      }
      if (assessment.gate === "travel") {
        assert.equal(assessment.reason, VOYAGE_REASON);
        assert.ok(
          assessment.costBasis !== null && assessment.costBasis > 0,
          `${carrier.id} voyage refusal still has a market price`,
        );
      }
    }
  }

  const corin = world.characters["character-16"];
  corin.locationId = null;
  corin.travel = { fromId: "glassport", toId: "cinder-key", totalTicks: 2, remainingTicks: 2 };
  const atSea = assessSupplyContract(world, corin, {
    buyerId: mara.id,
    quantity: 10,
    price: 30,
    destinationId: "crown-harbor",
    deadlineTick: 720,
  });
  assert.equal(atSea.gate, "travel");
  assert.equal(atSea.reason, AT_SEA_REASON);
  assert.notEqual(atSea.gate, "score");
  assert.equal(atSea.score, null);
  assert.equal(atSea.costBasis, null);
  assert.equal(atSea.threshold, round(0.54 + corin.personality.ambition * 0.08));

  corin.locationId = "glassport";
  corin.travel = null;
  const tooShort = assessSupplyContract(world, corin, {
    buyerId: mara.id,
    quantity: 10,
    price: 30,
    destinationId: "crown-harbor",
    deadlineTick: world.tick + 1,
  });
  assert.equal(tooShort.gate, "travel");
  assert.equal(tooShort.reason, VOYAGE_REASON);
  assert.equal(typeof tooShort.score, "number");
  assert.notEqual(tooShort.score, null);
  assert.ok(tooShort.costBasis !== null && tooShort.costBasis > 0);
  assert.ok(tooShort.travelTicks > tooShort.ticksLeft);
});

test("a docked voyage that misses the deadline keeps the computed score on the refusal", () => {
  const world = createPrototypeWorld(1847);
  const corin = world.characters["character-16"];
  assert.equal(corin.locationId, "glassport");
  assert.equal(corin.travel, null);
  const submission = submitCommand(world, {
    playerId: "prototype-player",
    type: "offer-contract",
    characterId: "character-16",
    quantity: 10,
    destinationId: "crown-harbor",
    price: 30,
    expiresInTicks: 1,
  });
  assert.equal(submission.ok, true);
  const offered = runTick(world);
  assert.equal(offered.events.some((event) => event.type === "contract-refused"), false);
  // The offer tick can send him to sea. Put him back on the dock before the
  // judgment, which is the next tick, so this refusal is the voyage gate.
  corin.locationId = "glassport";
  corin.travel = null;

  const judged = runTick(world);
  const refusal = judged.events.find((event) => event.type === "contract-refused");
  assert.ok(refusal);
  assert.equal(refusal.data.gate, "travel");
  assert.equal(refusal.data.reason, VOYAGE_REASON);
  assert.equal(typeof refusal.data.score, "number");
  assert.notEqual(refusal.data.score, null);
  assert.equal(typeof refusal.data.costBasis, "number");
  assert.ok(Number(refusal.data.costBasis) > 0);
  assert.notEqual(refusal.data.factors, undefined);
  assert.notEqual((refusal.data.factors as { commerce: number }).commerce, 0);
});

test("fulfilling a delivery of 10 adds 10 provisions to Crown Harbor, pays the carrier from escrow, and is not a market-trade", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  const zara = world.characters["character-17"];
  const submission = offerDelivery(world, 18);
  assert.equal(submission.ok, true);
  assert.equal(mara.money, 108, "escrow is taken when the offer is applied, not when it is queued");
  assert.equal(Object.keys(world.contracts ?? {}).length, 0);

  const offered = runTick(world);
  const contractId = contractEvents(offered.events)[0]?.data.contractId as string
    ?? Object.keys(world.contracts ?? {})[0];
  const contract = world.contracts?.[contractId];
  assert.ok(contract);
  assert.equal(contract.status, "offered");
  assert.equal(contract.escrow, 18);
  assert.equal(contract.settled, false);
  // The holder draws the escrow from the treasury. The purse stays 108.
  assert.equal(mara.money, 108);
  assert.equal(offered.events.some((event) => event.type === "contract-accepted"), false);
  assert.equal(offered.events.some((event) => event.type === "contract-fulfilled"), false);

  const carrierMoney = zara.money;
  const cargo = zara.cargo.provisions;
  const shelfBefore = world.settlements["crown-harbor"].stocks.provisions;
  const landed = runTick(world);
  const accepted = landed.events.find((event) => event.type === "contract-accepted");
  const fulfilled = landed.events.find((event) => event.type === "contract-fulfilled");
  const upkeep = landed.events.find((event) =>
    event.settlementId === "crown-harbor" &&
    (event.type === "settlement-upkeep" || event.type === "settlement-shortage")
  );
  assert.ok(accepted);
  assert.ok(fulfilled);
  const shelf = upkeep ? (upkeep.data.stocks as { provisions: number }).provisions : shelfBefore;
  assert.equal(accepted.data.buyerMoney, 108);
  assert.equal(accepted.data.carrierMoney, carrierMoney);
  assert.equal(accepted.data.escrow, 18);
  assert.equal(fulfilled.data.buyerMoney, 108);
  assert.equal(fulfilled.data.carrierMoney, round(carrierMoney + 18, 2));
  assert.equal(fulfilled.data.escrow, 0);
  assert.equal(
    (fulfilled.data.settlementStocks as { provisions: number }).provisions,
    round(shelf + 10),
  );
  assert.equal(
    (fulfilled.data.carrierCargo as { provisions: number }).provisions,
    round(cargo - 10),
  );
  assert.equal(world.contracts?.[contract.id].status, "fulfilled");
  assert.equal(world.contracts?.[contract.id].settled, true);
  assert.equal(world.contracts?.[contract.id].escrow, 0);
  assert.equal(mara.money, 108);
  assert.equal(
    landed.events.filter((event) => event.type === "market-trade" && event.data.contractId !== undefined).length,
    0,
  );
  assert.equal(
    landed.events.filter((event) =>
      event.type === "relationship-changed" && event.data.trigger === "supply contract fulfilled"
    ).length,
    2,
  );
  const again = runTick(world);
  assert.equal(again.events.some((event) => event.type === "contract-fulfilled"), false);
});

test("a hold of 9 does not fulfil a delivery of 10", () => {
  const world = createPrototypeWorld(1847);
  const zara = world.characters["character-17"];
  const submission = offerDelivery(world, 18);
  assert.equal(submission.ok, true);
  runTick(world);
  pinCarrier(world);
  zara.cargo.provisions = 9;
  const judged = runTick(world);
  const contract = Object.values(world.contracts ?? {})[0];
  assert.equal(contract.status, "accepted");
  assert.equal(contract.escrow, 18);
  assert.equal(contract.settled, false);
  assert.equal(judged.events.some((event) => event.type === "contract-accepted"), true);
  assert.equal(judged.events.some((event) => event.type === "contract-fulfilled"), false);
});

test("a passed deadline returns the escrow and writes the defeat deltas", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  const zara = world.characters["character-17"];
  const submission = offerDelivery(world, 18, 10, 1);
  assert.equal(submission.ok, true);
  runTick(world);
  pinCarrier(world);
  const beforeBuyer = mara.relationships[zara.id];
  const beforeCarrier = zara.relationships[mara.id];
  const carrierMoney = zara.money;
  const cargo = zara.cargo.provisions;
  const judged = runTick(world);
  const contract = Object.values(world.contracts ?? {})[0];
  const breached = judged.events.find((event) => event.type === "contract-breached");
  assert.ok(breached);
  assert.equal(contract.status, "breached");
  assert.equal(contract.escrow, 0);
  assert.equal(contract.settled, true);
  // The refund of a treasury-funded escrow credits the purse.
  assert.equal(breached.data.buyerMoney, 126);
  assert.equal(breached.data.carrierMoney, carrierMoney);
  assert.equal(breached.data.escrow, 0);
  assert.equal(breached.data.carrierCargo, undefined);
  assert.equal(mara.money, 126);
  assert.ok(Math.abs(zara.cargo.provisions - cargo) < 1, "the grain stays aboard");
  assert.equal(judged.events.some((event) => event.type === "contract-fulfilled"), false);
  assert.equal(
    judged.events.filter((event) => event.type === "market-trade" && event.data.contractId !== undefined).length,
    0,
  );

  const shifts = judged.events.filter((event) =>
    event.type === "relationship-changed" && event.data.trigger === "supply contract breached"
  );
  assert.equal(shifts.length, 2);
  assertRelationshipShift(shifts, mara.id, zara.id, beforeBuyer, false, world.tick - 1);
  assertRelationshipShift(shifts, zara.id, mara.id, beforeCarrier, false, world.tick - 1);
});

function assertRelationshipShift(
  events: SimEvent[],
  fromId: string,
  toId: string,
  prior: Relationship | undefined,
  victory: boolean,
  tick: number,
): void {
  const event = events.find((candidate) => candidate.actorId === fromId && candidate.data.characterId === toId);
  assert.ok(event, `${fromId} -> ${toId}`);
  const next = event.data.relationship as Relationship;
  const base = prior ?? {
    trust: 0.28,
    affinity: 0.25,
    respect: 0.28,
    fear: 0.08,
    grievance: 0,
    obligation: 0,
  };
  const delta = victory ? VICTORY : DEFEAT;
  assert.equal(next.trust, round(clamp(base.trust + delta.trust, 0, 1)));
  assert.equal(next.respect, round(clamp(base.respect + delta.respect, 0, 1)));
  assert.equal(next.fear, round(clamp(base.fear + delta.fear, 0, 1)));
  assert.equal(next.grievance, round(clamp(base.grievance + delta.grievance, 0, 1)));
  assert.equal(next.obligation, round(clamp(base.obligation + delta.obligation, 0, 1)));
  assert.equal(next.affinity, base.affinity ?? 0.25);
  assert.equal(next.lastChangedTick, tick);
}

test("an active protect order does not complete once the target's faction has changed", () => {
  const world = createPrototypeWorld(1847);
  const character = world.characters["character-16"];
  assert.equal(character.name, "Corin Hale");
  const order = character.standingOrders.find((candidate) => candidate.directive === "protect");
  assert.ok(order);
  assert.equal(order.targetId, "cinder-key");
  order.status = "active";
  order.adherence = "following";
  // One day of evidence, with this rng, scores under the threshold. Two days
  // is long enough for a faction that still holds the port to complete.
  order.statusChangedTick = world.tick - world.ticksPerDay * 2;
  character.locationId = order.targetId;
  character.travel = null;

  const held = judgeOrderCompletion(world, character, order, "rest", [], new DeterministicRng(1));
  assert.ok(held);
  assert.equal(held.score >= held.threshold, true);
  assert.match(held.summary, /Corin Hale reports that Cinder Key is secure/);

  world.settlements["cinder-key"].factionId = "world-government";
  assert.equal(character.locationId, "cinder-key");
  assert.equal(
    judgeOrderCompletion(world, character, order, "rest", [], new DeterministicRng(1)),
    null,
    "standing on a port another faction holds is not a completed protection",
  );

  // Equality, including null. An unaligned officer on an unowned port can still finish.
  character.factionId = null;
  world.settlements["cinder-key"].factionId = null;
  const unowned = judgeOrderCompletion(world, character, order, "rest", [], new DeterministicRng(1));
  assert.ok(unowned);
  assert.match(unowned.summary, /Cinder Key is secure/);

  world.settlements["cinder-key"].factionId = "world-government";
  const esme = world.characters["character-19"];
  assert.equal(esme.factionId, "free-tide");
  assert.ok(esme.goals.some((goal) => goal.status === "active"));
  const review = reviewPlan(world, esme, new DeterministicRng(1));
  assert.ok(review, "losing the last port does not leave the character with no goal");
  assert.equal(review.selectedGoalId, "character-19:serve-faction");
  assert.equal(review.goalScores[0]?.kind, "serve-faction");
});

test("a captive issuer's order is not retargeted, refused, or confirmed, and the cover is not read", () => {
  const world = createPrototypeWorld(4096);
  const issuer = world.characters["character-14"];
  assert.equal(issuer.name, "Pax Ash");
  const recipient = Object.values(world.characters).find((character) =>
    character.standingOrders.some((order) => order.issuerId === issuer.id)
  );
  assert.ok(recipient);
  const order = recipient.standingOrders.find((candidate) => candidate.issuerId === issuer.id);
  assert.ok(order);
  order.status = "active";
  const targetId = order.targetId;
  const directive = order.directive;
  const tax = world.factions["free-tide"].taxRate;
  const rng = world.rngState;
  const settlementId = issuer.locationId ?? "crown-harbor";
  applyEvent(world, {
    sequence: world.nextEventSequence,
    tick: world.tick,
    type: "character-captured",
    actorId: issuer.id,
    settlementId,
    data: {
      battleId: "seat-test-issuer",
      health: issuer.health,
      morale: issuer.morale,
      captivity: {
        captorFactionId: world.settlements[settlementId].factionId,
        settlementId,
        capturedTick: world.tick,
        mandatoryReleaseTick: world.tick + 84,
        cause: "major-defeat",
        displayedRisk: "high",
        scatteredTroops: { ...issuer.troops },
        releaseDestinationId: null,
      },
    },
  });
  assert.equal(order.status, "active");
  assert.equal(order.targetId, targetId);
  assert.equal(order.directive, directive);
  assert.equal(order.issuerId, issuer.id);
  assert.equal(world.factions["free-tide"].taxRate, tax);
  assert.equal(world.rngState, rng);
  const actingId = world.factions["free-tide"].actingCommanderId;
  assert.equal(actingId, "character-16");
  assert.ok(actingId);
  assert.equal(world.characters[actingId].standingOrders.some((entry) => entry.issuerId === actingId), false);

  const covered = reviewPlan(world, recipient, new DeterministicRng(4));
  delete world.factions["free-tide"].actingCommanderId;
  const bare = reviewPlan(world, recipient, new DeterministicRng(4));
  world.factions["free-tide"].actingCommanderId = actingId;
  assert.deepEqual(covered, bare);
  assert.equal(reviewPlan.toString().includes("actingCommanderId"), false);
  const engine = readFileSync(new URL("../src/sim/engine.ts", import.meta.url), "utf8");
  const candidatesAt = engine.indexOf("function buildCandidates(");
  const candidatesEnd = engine.indexOf("\nfunction ", candidatesAt + 1);
  assert.equal(engine.slice(candidatesAt, candidatesEnd).includes("actingCommanderId"), false);

  order.status = "awaiting-confirmation";
  order.statusChangedTick = world.tick;
  const ticked = runTick(world);
  assert.equal(order.status, "awaiting-confirmation");
  assert.equal(order.targetId, targetId);
  assert.equal(order.issuerId, issuer.id);
  assert.equal(ticked.events.some((event) =>
    (event.type === "standing-order-completed" || event.type === "standing-order-refused") &&
    event.data.orderId === order.id
  ), false);
  assert.equal(ticked.events.some((event) =>
    event.type === "standing-order-completed" && event.actorId === actingId
  ), false);
  assert.equal(Object.values(world.characters).some((character) =>
    character.standingOrders.some((entry) => entry.issuerId === actingId)
  ), false);
});

test("orders, plans, and work ignore a stored loyalty scar", () => {
  const seeded = createPrototypeWorld(1847);
  const scarred = createPrototypeWorld(1847);
  const officer = Object.values(scarred.characters).find((character) =>
    character.controller.kind === "autonomous" &&
    character.standingOrders.length > 0 &&
    character.locationId !== null &&
    character.travel === null
  );
  assert.ok(officer);
  const twin = seeded.characters[officer.id];
  const order = officer.standingOrders[0];
  const before = assessStandingOrder(twin, twin.standingOrders[0]);
  officer.loyaltyAdjustment = -0.12;
  assert.deepEqual(assessStandingOrder(officer, order), before);
  assert.equal(officer.personality.loyalty, twin.personality.loyalty);

  officer.plan = null;
  twin.plan = null;
  const seededReview = reviewPlan(seeded, twin, new DeterministicRng(1));
  const scarredReview = reviewPlan(scarred, officer, new DeterministicRng(1));
  assert.ok(seededReview);
  assert.ok(scarredReview);
  const serve = (review: NonNullable<typeof seededReview>) =>
    review.goalScores.find((goal) => goal.kind === "serve-faction");
  assert.deepEqual(serve(scarredReview), serve(seededReview));
  assert.deepEqual(scarredReview.orderAssessment, seededReview.orderAssessment);

  const seededTick = runTick(seeded);
  const scarredTick = runTick(scarred);
  assert.equal(JSON.stringify(scarredTick.events), JSON.stringify(seededTick.events));
  assert.equal(scarred.rngState, seeded.rngState);
  assert.equal(scarred.nextEventSequence, seeded.nextEventSequence);
  const decision = scarredTick.events.find((event) => event.type === "decision-made" && event.actorId === officer.id);
  assert.ok(decision);
  const candidates = decision.data.candidates as Array<{ action: string; score: number }>;
  const work = candidates.find((candidate) => candidate.action === "work");
  assert.ok(work);
  const seededDecision = seededTick.events.find((event) => event.type === "decision-made" && event.actorId === officer.id);
  assert.ok(seededDecision);
  const seededWork = (seededDecision.data.candidates as Array<{ action: string; score: number }>).find((candidate) => candidate.action === "work");
  assert.equal(work.score, seededWork?.score);
  assert.equal(officer.loyaltyAdjustment, -0.12);
  assert.equal(officer.personality.loyalty, twin.personality.loyalty);
  assert.equal(Object.hasOwn(twin, "loyaltyAdjustment"), false);
});
