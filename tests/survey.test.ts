import assert from "node:assert/strict";
import test from "node:test";
import { eventPayloadVisible } from "../src/dashboard/visibility.ts";
import { dashboardState, fullEventFeed, projectEventFeed } from "../src/dashboard/view-model.ts";
import { directObservation } from "../src/sim/agency.ts";
import { combatForecast } from "../src/sim/combat.ts";
import { ACTION_CAPABILITIES, COMMAND_LIMITS, submitCommand } from "../src/sim/commands.ts";
import { passageCost, quotedPassage, runTick, runTicks, travelDuration } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { applyEvent } from "../src/sim/state.ts";
import type { Character, Settlement, SettlementGround, SettlementKnowledge, SimEvent, StandingOrder, WorldState } from "../src/sim/types.ts";

function commanderOf(world: WorldState): Character {
  return world.characters[world.players["prototype-player"].characterId];
}

function foreignPort(world: WorldState, commander: Character): Settlement {
  return Object.values(world.settlements).find((settlement) =>
    settlement.factionId !== null && settlement.factionId !== commander.factionId
  )!;
}

function place(character: Character, settlementId: string): void {
  character.locationId = settlementId;
  character.travel = null;
  character.captivity = null;
}

function surveyAt(world: WorldState, settlementId: string): number {
  const commander = commanderOf(world);
  place(commander, settlementId);
  const submitted = submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "survey",
  });
  assert.equal(submitted.ok, true);
  const tick = world.tick;
  const events = runTick(world).events;
  const updated = events.find((event) =>
    event.type === "knowledge-updated" &&
    event.actorId === commander.id &&
    event.data.reason === "survey"
  );
  assert.ok(updated, "a survey must emit knowledge-updated");
  assert.equal(updated.tick, tick);
  return tick;
}

interface PanelSettlement {
  id: string;
  population: number | null;
  fortification: number | null;
  garrison: number | null;
  stocks: Record<string, number> | null;
  prices: Record<string, number> | null;
  factionId: string | null;
  groundIntelligence: { source: string; observedTick: number; ageTicks: number } | null;
  garrisonIntelligence: { source: string; observedTick: number; ageTicks: number } | null;
  intelligence: {
    exact: boolean;
    present: boolean;
    source: string;
    observedTick: number;
    ageTicks: number;
    confidence: number;
  } | null;
  combatForecast: {
    revealedFactors: string[];
    defenderPower: { low: number; high: number };
    intelligence: { ageTicks: number | null; confidence: number };
  } | null;
}

function panel(world: WorldState, settlementId: string): PanelSettlement {
  const state = dashboardState(world, [], fullEventFeed([])) as { settlements: PanelSettlement[] };
  return state.settlements.find((entry) => entry.id === settlementId)!;
}

test("survey is a direct action against the settlement the commander is standing in", () => {
  const capability = ACTION_CAPABILITIES.find((entry) => entry.action === "survey");
  assert.ok(capability, "survey must be a published player action");
  assert.equal(capability.target, "current-settlement");
  assert.equal(COMMAND_LIMITS.directActionsQueued, 1);

  const world = createPrototypeWorld(1847);
  const commander = commanderOf(world);
  const port = foreignPort(world, commander);
  place(commander, port.id);

  const own = submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "survey",
    targetId: "crown-harbor",
  });
  assert.equal(own.ok, false);
  assert.equal(own.ok === false ? own.code : null, "not-here");

  place(commander, "crown-harbor");
  const held = submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "survey",
  });
  assert.equal(held.ok, false);
  assert.equal(held.ok === false ? held.code : null, "faction-held");

  place(commander, port.id);
  const accepted = submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "survey",
  });
  assert.equal(accepted.ok, true);
  const blocked = submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "work",
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.ok === false ? blocked.code : null, "action-already-queued");
});

test("a survey writes ground with the survey tick, and later presence keeps it", () => {
  const world = createPrototypeWorld(1847);
  const commander = commanderOf(world);
  const port = foreignPort(world, commander);
  const surveyTick = surveyAt(world, port.id);
  const ground = commander.knowledge[port.id].ground;
  assert.ok(ground, "the survey must store a ground record");
  assert.equal(ground.observedTick, surveyTick);
  assert.equal(ground.source, "direct");
  assert.equal(ground.population, port.population);
  assert.equal(ground.fortification, port.fortification);
  assert.equal(commander.knowledge[port.id].source, "direct");
  assert.equal(commander.knowledge[port.id].observedTick, surveyTick);

  // Standing there is still present tense. The stored survey does not freeze
  // the panel while the commander can see the walls.
  const surveyedPopulation = ground.population;
  const surveyedFortification = ground.fortification;
  port.population = surveyedPopulation + 5_000;
  port.fortification = surveyedFortification + 2;
  const present = panel(world, port.id);
  assert.equal(present.population, port.population, "standing on the island shows the ground that is there now");
  assert.equal(present.fortification, port.fortification);
  assert.equal(present.groundIntelligence?.source, "direct-observation");
  assert.equal(commander.knowledge[port.id].ground?.population, surveyedPopulation, "looking at the walls must not rewrite the survey");

  let refreshed = false;
  for (let step = 0; step < world.ticksPerDay + 2 && !refreshed; step += 1) {
    const events = runTick(world).events;
    refreshed = events.some((event) =>
      event.type === "knowledge-updated" &&
      event.actorId === commander.id &&
      event.settlementId === port.id &&
      event.data.reason === "direct local observation"
    );
  }
  assert.ok(refreshed, "a day of standing must refresh the direct record");
  assert.equal(commander.knowledge[port.id].ground?.observedTick, surveyTick, "the daily refresh must keep the survey tick");
  assert.equal(commander.knowledge[port.id].ground?.population, surveyedPopulation);
  assert.equal(commander.knowledge[port.id].ground?.fortification, surveyedFortification);
  assert.ok(commander.knowledge[port.id].observedTick > surveyTick, "the rest of the entry still refreshes");

  const home = "crown-harbor";
  assert.notEqual(home, port.id);
  assert.equal(submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "travel",
    targetId: home,
  }).ok, true);
  let arrivedHome = false;
  for (let step = 0; step < 20 && !arrivedHome; step += 1) {
    arrivedHome = runTick(world).events.some((event) =>
      event.type === "arrived" && event.actorId === commander.id && event.settlementId === home
    );
  }
  assert.ok(arrivedHome, "the commander must reach home");
  const away = panel(world, port.id);
  assert.equal(away.population, surveyedPopulation, "away, the panel reads the survey, not the walls as they are now");
  assert.equal(away.fortification, surveyedFortification);
  assert.equal(away.groundIntelligence?.source, "direct");
  assert.equal(away.groundIntelligence?.observedTick, surveyTick);
  assert.equal(away.groundIntelligence?.ageTicks, world.tick - surveyTick);

  assert.equal(submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "travel",
    targetId: port.id,
  }).ok, true);
  let arrivedBack = false;
  for (let step = 0; step < 20 && !arrivedBack; step += 1) {
    const events = runTick(world).events;
    arrivedBack = events.some((event) =>
      event.type === "arrived" && event.actorId === commander.id && event.settlementId === port.id
    );
    if (arrivedBack) {
      const arrival = events.find((event) =>
        event.type === "knowledge-updated" &&
        event.actorId === commander.id &&
        event.settlementId === port.id &&
        event.data.reason === "arrival observation"
      );
      assert.ok(arrival, "arrival must refresh the record");
      const carried = (arrival.data.knowledge as SettlementKnowledge).ground;
      assert.equal(carried?.observedTick, surveyTick, "arrival must carry the survey forward");
      assert.equal(carried?.population, surveyedPopulation);
    }
  }
  assert.ok(arrivedBack, "the commander must return");
  assert.equal(commander.knowledge[port.id].ground?.observedTick, surveyTick);
  assert.equal(commander.knowledge[port.id].ground?.population, surveyedPopulation);
});

test("passive presence does not invent a ground record", () => {
  const world = createPrototypeWorld(1847);
  const commander = commanderOf(world);
  const port = foreignPort(world, commander);
  place(commander, port.id);
  const before = commander.knowledge[port.id];
  assert.equal("ground" in before, false);
  runTick(world);
  const observed = commander.knowledge[port.id];
  assert.equal(observed.source, "direct");
  assert.equal("ground" in observed, false, "a daily observation must leave the ground key absent");
  const fresh = directObservation(world, commander);
  assert.ok(fresh);
  assert.equal("ground" in fresh, false);
});

function stationExplorer(
  world: WorldState,
  officer: Character,
  targetId: string,
  targeted: boolean,
): void {
  const commander = commanderOf(world);
  place(officer, targetId);
  officer.health = 90;
  officer.morale = 80;
  officer.money = 400;
  officer.cargo = { ...officer.cargo, provisions: 80, arms: 0, medicine: 0, shipMaterials: 0 };
  officer.personality = { ...officer.personality, caution: 0, ambition: 1, curiosity: 0, commerce: 0 };
  const goal = officer.goals.find((entry) => entry.status === "active") ?? officer.goals[0];
  goal.status = "active";
  officer.activeGoalId = goal.id;
  officer.plan = {
    id: "test-plan",
    goalId: goal.id,
    intent: targeted ? "stay and work" : "trade where they stand",
    preferredActions: targeted ? ["work"] : ["trade-local"],
    createdTick: world.tick,
    reviewAfterTick: world.tick + 500,
    reason: "stationed for the survey test",
    orderId: "test-explore",
  };
  officer.lastPlanReviewTick = world.tick;
  const order: StandingOrder = {
    id: "test-explore",
    issuerId: commander.id,
    directive: "explore",
    priority: 1,
    issuedTick: world.tick,
    expiresTick: null,
    revision: 1,
    status: "active",
    adherence: "following",
    statusChangedTick: world.tick,
    deviationCount: 0,
    lastReport: null,
  };
  if (targeted) order.targetId = targetId;
  officer.standingOrders = [order];
  const settlement = world.settlements[targetId];
  officer.knowledge[targetId] = {
    settlementId: targetId,
    observedTick: world.tick,
    confidence: 1,
    factionId: settlement.factionId,
    garrisonEstimate: settlement.garrison,
    stocksEstimate: { ...settlement.stocks },
    priceEstimate: { provisions: 2, arms: 2, medicine: 2, shipMaterials: 2 },
    source: "direct",
  };
}

function explorer(world: WorldState, commander: Character): Character {
  return Object.values(world.characters)
    .filter((character) =>
      character.id !== commander.id &&
      character.controller.kind === "autonomous" &&
      character.factionId === commander.factionId
    )
    .sort((left, right) => left.id.localeCompare(right.id))[0];
}

test("a targeted explore completion delivers a faction-report to the issuer only", () => {
  const world = createPrototypeWorld(1847);
  const commander = commanderOf(world);
  const port = foreignPort(world, commander);
  const officer = explorer(world, commander);
  place(commander, "crown-harbor");
  stationExplorer(world, officer, port.id, true);
  // Below the raid gate, so no one else spends this tick changing the garrison
  // the officer is about to report.
  port.garrison = 10;
  world.activeBattles = {};
  const population = port.population;
  const fortification = port.fortification;
  const garrison = port.garrison;

  const events = runTick(world).events;
  const reportTick = world.tick - 1;
  const delivered = events.find((event) =>
    event.type === "knowledge-updated" &&
    event.actorId === commander.id &&
    event.settlementId === port.id
  );
  assert.ok(delivered, "the issuer must receive the officer's survey");
  assert.equal(delivered.data.reason, "explore-report");
  assert.equal(delivered.tick, reportTick);
  const knowledge = delivered.data.knowledge as SettlementKnowledge;
  assert.equal(knowledge.source, "faction-report");
  assert.equal(knowledge.observedTick, reportTick);
  assert.equal(knowledge.garrisonEstimate, garrison);
  assert.equal(knowledge.ground?.source, "faction-report");
  assert.equal(knowledge.ground?.observedTick, reportTick);
  assert.equal(knowledge.ground?.population, population);
  assert.equal(knowledge.ground?.fortification, fortification);
  assert.equal(commander.knowledge[port.id].source, "faction-report");
  assert.equal("ground" in officer.knowledge[port.id], false, "the officer's own map does not gain a ground record");

  const peer = Object.values(world.characters).find((character) =>
    character.id !== commander.id && character.id !== officer.id && character.factionId === commander.factionId
  )!;
  const rival = Object.values(world.characters).find((character) => character.factionId !== commander.factionId)!;
  assert.equal(eventPayloadVisible(world, commander, delivered), true);
  assert.equal(eventPayloadVisible(world, officer, delivered), false);
  assert.equal(eventPayloadVisible(world, peer, delivered), false);
  assert.equal(eventPayloadVisible(world, rival, delivered), false);

  // Untargeted explore completes the same way and delivers nothing.
  const untouched = createPrototypeWorld(1847);
  const untouchedCommander = commanderOf(untouched);
  const untouchedPort = foreignPort(untouched, untouchedCommander);
  const untouchedOfficer = explorer(untouched, untouchedCommander);
  place(untouchedCommander, "crown-harbor");
  const snapshot = JSON.stringify(untouchedCommander.knowledge[untouchedPort.id]);
  stationExplorer(untouched, untouchedOfficer, untouchedPort.id, false);
  // Stay put and trade. A raid or a recruitment would be a deviation, and an
  // untargeted explore only completes while the officer is still following.
  untouchedPort.garrison = 10;
  untouched.activeBattles = {};
  untouchedOfficer.money = 20;
  untouchedOfficer.skills = { ...untouchedOfficer.skills, trade: 100 };
  untouchedOfficer.personality = {
    ...untouchedOfficer.personality,
    commerce: 1,
    ambition: 0.2,
    caution: 0,
    curiosity: 0,
    aggression: 0,
  };
  const reserve = 20 + untouchedOfficer.troops.count * 0.18;
  untouchedOfficer.cargo = { provisions: reserve + 1, arms: 0, medicine: 0, shipMaterials: 0 };
  const quiet = runTick(untouched).events;
  assert.ok(
    quiet.some((event) => event.type === "standing-order-completion-reported" && event.actorId === untouchedOfficer.id),
    "an untargeted explore can still be completed",
  );
  assert.equal(
    quiet.some((event) =>
      event.type === "knowledge-updated" &&
      event.actorId === untouchedCommander.id &&
      event.data.reason === "explore-report"
    ),
    false,
    "an untargeted explore must not deliver a report",
  );
  assert.equal(JSON.stringify(untouchedCommander.knowledge[untouchedPort.id]), snapshot);
});

test("a remote forecast reads the stored ground and ignores later truth", () => {
  const world = createPrototypeWorld(1847);
  const commander = commanderOf(world);
  const port = foreignPort(world, commander);
  const surveyTick = surveyAt(world, port.id);
  place(commander, "crown-harbor");
  world.tick = surveyTick + 12;

  const before = combatForecast(world, commander.id, port.id);
  assert.ok(before.revealedFactors.includes(`surveyed ground is ${world.tick - surveyTick} ticks old`));
  assert.equal(before.revealedFactors.includes("defensive ground remains poorly understood"), false);

  const truth = { fortification: port.fortification, population: port.population, garrison: port.garrison };
  port.fortification = 9.5;
  port.population = 400_000;
  port.garrison = 8_888;
  const after = combatForecast(world, commander.id, port.id);
  assert.deepEqual(after, before, "changing the true walls and population must not move a remote forecast");
  const serialized = JSON.stringify(after);
  for (const leaked of [port.fortification, port.population, port.garrison]) {
    assert.equal(serialized.includes(String(leaked)), false, `the forecast must not contain ${leaked}`);
  }
  const shown = panel(world, port.id);
  assert.equal(shown.population, truth.population);
  assert.equal(shown.fortification, truth.fortification);
  assert.equal(shown.groundIntelligence?.source, "direct");

  const stored = commander.knowledge[port.id];
  commander.knowledge[port.id] = {
    ...stored,
    ground: {
      ...stored.ground!,
      fortification: stored.ground!.fortification + 4,
      population: stored.ground!.population + 1_000,
    },
  };
  const shifted = combatForecast(world, commander.id, port.id);
  assert.notDeepEqual(shifted.defenderPower, before.defenderPower, "the forecast must follow the stored record");
});

test("the surrender predicate does not read a survey", () => {
  const fight = (plantSurvey: boolean) => {
    const world = createPrototypeWorld(1847);
    const commander = commanderOf(world);
    const port = foreignPort(world, commander);
    for (const character of Object.values(world.characters)) {
      if (character.id !== commander.id) character.lastBattleTick = world.tick;
    }
    place(commander, port.id);
    commander.skills.strategy = 125;
    commander.troops.count = 40;
    commander.health = 100;
    commander.morale = 100;
    port.population = 0;
    port.fortification = 1;
    port.garrison = 39;
    port.stability = 51.52;
    port.surrender = null;
    if (plantSurvey) {
      commander.knowledge[port.id] = {
        ...commander.knowledge[port.id],
        ground: { population: 999_999, fortification: 9.9, observedTick: 0, source: "direct" },
      };
    } else if (commander.knowledge[port.id]) {
      delete commander.knowledge[port.id].ground;
    }
    assert.equal(submitCommand(world, {
      playerId: "prototype-player",
      type: "character-action",
      action: "raid",
    }).ok, true);
    const battle = runTick(world).events.find((event) =>
      event.type === "battle-resolved" && event.actorId === commander.id
    );
    assert.ok(battle);
    assert.equal(JSON.stringify(battle.data).includes("999999"), false);
    const surrender = battle.data.surrender as { offeredToId?: string } | null;
    return {
      defenderGarrison: battle.data.defenderGarrison,
      settlementStability: battle.data.settlementStability,
      offeredToId: surrender?.offeredToId ?? null,
    };
  };

  const withSurvey = fight(true);
  const withoutSurvey = fight(false);
  assert.deepEqual(withSurvey, withoutSurvey);
  assert.equal(withSurvey.defenderGarrison, 14);
  assert.equal(withSurvey.settlementStability, 39.55);
  assert.equal(withSurvey.offeredToId, "character-01");
});

test("forecast availability follows the report's owner, not the true owner", () => {
  const world = createPrototypeWorld(1847);
  const commander = commanderOf(world);
  const port = foreignPort(world, commander);
  place(commander, "crown-harbor");
  commander.troops.count = 80;
  world.activeBattles = {};
  port.surrender = null;
  const enemy = port.factionId!;
  commander.knowledge[port.id] = {
    settlementId: port.id,
    observedTick: 0,
    confidence: 0.8,
    factionId: enemy,
    garrisonEstimate: 120,
    stocksEstimate: { provisions: 10, arms: 10, medicine: 10, shipMaterials: 10 },
    priceEstimate: { provisions: 2, arms: 2, medicine: 2, shipMaterials: 2 },
    source: "faction-report",
  };

  assert.ok(panel(world, port.id).combatForecast, "a hostile report offers a forecast");
  port.factionId = null;
  assert.ok(
    panel(world, port.id).combatForecast,
    "the island changing hands in truth must not remove a forecast the report still supports",
  );
  port.factionId = enemy;
  commander.knowledge[port.id].factionId = commander.factionId;
  assert.equal(
    panel(world, port.id).combatForecast,
    null,
    "a report of the commander's own faction must not grow a forecast just because the truth is hostile",
  );
  commander.knowledge[port.id].factionId = null;
  assert.equal(panel(world, port.id).combatForecast, null, "a report with no owner is not a hostile target");

  place(commander, port.id);
  commander.knowledge[port.id].factionId = commander.factionId;
  port.factionId = enemy;
  assert.ok(panel(world, port.id).combatForecast, "standing on a hostile island uses the faction that is there");
});

test("no projected field is zero where the commander has no report", () => {
  const world = createPrototypeWorld(1847);
  const commander = commanderOf(world);
  place(commander, "crown-harbor");
  commander.knowledge = {};
  const state = dashboardState(world, [], fullEventFeed([])) as { settlements: Array<Record<string, unknown> & { id: string }> };
  const unreported = state.settlements.find((settlement) => settlement.id !== commander.locationId && settlement.id !== "glassport");
  assert.ok(unreported, "a settlement outside the faction and the commander's feet");
  // Crown Harbor and Glassport are the commander's faction, so they stay exact.
  assert.notEqual(world.settlements[unreported.id].factionId, commander.factionId);

  for (const field of [
    "population",
    "fortification",
    "garrison",
    "stocks",
    "prices",
    "stability",
    "workers",
    "focus",
    "production",
    "targetStocks",
    "partyCount",
    "market",
    "priceDrift",
    "priceQuote",
    "combatForecast",
    "groundIntelligence",
    "garrisonIntelligence",
    "ownerId",
    "intelligence",
    "factionId",
  ]) {
    assert.equal(unreported[field], null, `${field} must be unknown, not a number`);
    assert.notEqual(unreported[field], 0, `${field} must not be zero`);
  }

  const publicNumbers = new Set(["taxRate", "passageCostPerTick", "x", "y", "travelTicks", "travelDays", "passageCost"]);
  const visit = (value: unknown, path: string): void => {
    if (typeof value === "number") {
      const key = path.split(".").pop() ?? path;
      if (value === 0 && !publicNumbers.has(key)) {
        assert.fail(`${path} is 0 where an unknown should be null`);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, nested] of Object.entries(value)) visit(nested, `${path}.${key}`);
    }
  };
  visit(unreported, unreported.id);

  const owned = state.settlements.find((settlement) => settlement.id === "glassport")!;
  const ownedGround = owned.groundIntelligence as { source: string };
  assert.equal(ownedGround.source, "owned");
});

test("a remote garrison carries the report's tick and age, and a negative tick is not shown", () => {
  const world = createPrototypeWorld(1847);
  const commander = commanderOf(world);
  const port = foreignPort(world, commander);
  assert.ok(commander.knowledge[port.id].observedTick < 0, "the seeded rumor is backdated inside the simulation");

  const shown = panel(world, port.id);
  assert.equal(shown.garrison, commander.knowledge[port.id].garrisonEstimate);
  assert.notEqual(shown.garrison, port.garrison, "the panel must not substitute the live garrison");
  assert.ok(shown.garrisonIntelligence, "a remote garrison estimate must name its provenance");
  assert.equal(shown.garrisonIntelligence.source, commander.knowledge[port.id].source);
  assert.ok(shown.garrisonIntelligence.observedTick >= 0);
  assert.equal(shown.garrisonIntelligence.observedTick, shown.intelligence?.observedTick);
  assert.equal(shown.garrisonIntelligence.ageTicks, shown.intelligence?.ageTicks);
  assert.equal(
    shown.garrisonIntelligence.ageTicks,
    world.tick - shown.garrisonIntelligence.observedTick,
    "the shown age is the world tick minus the shown tick",
  );
  assert.ok(shown.combatForecast, "the forecast is the other surface that ages this report");
  assert.equal(
    shown.combatForecast.intelligence.ageTicks,
    Math.max(0, world.tick - commander.knowledge[port.id].observedTick),
    "the forecast band still ages from the raw tick",
  );
  assert.equal(shown.garrisonIntelligence.ageTicks, 0, "on day one the floored tick is 0, so the shown age is 0");
  assert.ok(shown.intelligence && shown.intelligence.observedTick >= 0, "settlement intelligence must not print a tick before the world");
});

test("a garrison age equals the world tick minus the tick the player is shown", () => {
  // Treasury spending moved the tick 72 reports. Verdant Cay is the stale rumor. Glassport is owned and fresh.
  const world = createPrototypeWorld(2718);
  runTicks(world, 72);
  assert.equal(world.tick, 72);
  const state = dashboardState(world, [], fullEventFeed([])) as { settlements: PanelSettlement[] };
  const shown = (id: string): PanelSettlement => state.settlements.find((entry) => entry.id === id)!;

  const verdant = shown("verdant-cay");
  assert.equal(verdant.garrison, 85);
  assert.ok(verdant.garrisonIntelligence);
  assert.ok(verdant.intelligence);
  assert.equal(verdant.garrisonIntelligence.source, "rumor");
  assert.equal(verdant.garrisonIntelligence.observedTick, 0);
  assert.equal(verdant.garrisonIntelligence.ageTicks, world.tick - verdant.garrisonIntelligence.observedTick);
  assert.equal(verdant.intelligence.ageTicks, world.tick - verdant.intelligence.observedTick);

  const glass = shown("glassport");
  assert.equal(glass.garrison, 122);
  assert.ok(glass.garrisonIntelligence);
  assert.ok(glass.intelligence);
  assert.equal(glass.garrisonIntelligence.source, "owned");
  assert.equal(glass.garrisonIntelligence.observedTick, 72);
  assert.equal(glass.garrisonIntelligence.ageTicks, world.tick - glass.garrisonIntelligence.observedTick);
  assert.equal(glass.intelligence.ageTicks, world.tick - glass.intelligence.observedTick);
  assert.equal(glass.garrisonIntelligence.ageTicks, glass.intelligence.ageTicks);
});

test("standing on an island, the forecast names the same fortification the panel shows", () => {
  const world = createPrototypeWorld(1847);
  const commander = commanderOf(world);
  const port = foreignPort(world, commander);
  place(commander, port.id);
  commander.skills = { ...commander.skills, strategy: 80 };
  commander.troops.count = 80;

  const shown = panel(world, port.id);
  assert.equal(shown.fortification, port.fortification);
  const factor = shown.combatForecast?.revealedFactors.find((entry) => entry.includes("defensive ground"));
  assert.equal(factor, `defensive ground is ${port.fortification.toFixed(2)}×, skill-scaled`);
  const quoted = shown.combatForecast?.revealedFactors.join(" ") ?? "";
  assert.equal(quoted.includes("estimated near"), false);
  assert.equal(shown.garrisonIntelligence?.source, "direct-observation");
  assert.equal(shown.garrisonIntelligence?.ageTicks, 0);
});

test("an officer already on the target is named, and the survey still completes immediately", () => {
  const world = createPrototypeWorld(1847);
  const commander = commanderOf(world);
  const port = foreignPort(world, commander);
  const officer = explorer(world, commander);
  place(commander, "crown-harbor");
  place(officer, port.id);

  const away = submitCommand(world, {
    playerId: "prototype-player",
    type: "issue-order",
    characterId: officer.id,
    directive: "explore",
    targetId: "crown-harbor",
    priority: 0.95,
  });
  assert.equal(away.ok, true);
  assert.equal(away.ok ? away.notice : "set", undefined, "an officer who must still sail is not described as already there");

  const fresh = createPrototypeWorld(1847);
  const freshCommander = commanderOf(fresh);
  const freshPort = foreignPort(fresh, freshCommander);
  const freshOfficer = explorer(fresh, freshCommander);
  place(freshOfficer, freshPort.id);
  const ordered = submitCommand(fresh, {
    playerId: "prototype-player",
    type: "issue-order",
    characterId: freshOfficer.id,
    directive: "explore",
    targetId: freshPort.id,
    priority: 0.95,
  });
  assert.equal(ordered.ok, true);
  assert.match(ordered.ok ? ordered.notice ?? "" : "", /already at/);
  assert.match(ordered.ok ? ordered.notice ?? "" : "", /officer already there/);

  const completing = createPrototypeWorld(1847);
  const completingCommander = commanderOf(completing);
  const completingPort = foreignPort(completing, completingCommander);
  const completingOfficer = explorer(completing, completingCommander);
  stationExplorer(completing, completingOfficer, completingPort.id, true);
  const events = runTick(completing).events;
  const completion = events.find((event) =>
    event.type === "standing-order-completion-reported" && event.actorId === completingOfficer.id
  );
  assert.ok(completion, "an officer already on the target still finishes on the issue tick");
  assert.match(String(completion.data.summary), /officer already there/);
  const report = events.find((event) => event.type === "knowledge-updated" && event.data.reason === "explore-report");
  assert.equal(report?.data.alreadyPresent, true);
  const lines = projectEventFeed(completing, completingCommander.id, events).map((event) => String(event.summary));
  assert.ok(lines.some((line) => line.includes("officer already there")));

  const later = createPrototypeWorld(1847);
  const laterCommander = commanderOf(later);
  const laterPort = foreignPort(later, laterCommander);
  const laterOfficer = explorer(later, laterCommander);
  stationExplorer(later, laterOfficer, laterPort.id, true);
  laterOfficer.standingOrders[0].issuedTick = later.tick - 4;
  laterOfficer.knowledge[laterPort.id].observedTick = later.tick;
  const sailed = runTick(later).events.find((event) =>
    event.type === "standing-order-completion-reported" && event.actorId === laterOfficer.id
  );
  assert.ok(sailed);
  assert.match(String(sailed.data.summary), /considers the survey/);
  assert.equal(String(sailed.data.summary).includes("already there"), false);
});

test("a player voyage the quoted passage cannot cover is refused", () => {
  const world = createPrototypeWorld(1847);
  const commander = commanderOf(world);
  const destination = Object.values(world.settlements).find((settlement) => settlement.id !== commander.locationId)!;
  const cost = passageCost(travelDuration(world, commander, destination.id));
  const quote = quotedPassage(world, commander, destination.id);
  assert.equal(quote.cost, cost);
  assert.equal(quote.ticks, travelDuration(world, commander, destination.id));
  // The free holder draws the treasury. A purse that could pay does not.
  commander.money = 500;
  world.factions[commander.factionId!].treasury = Math.max(0, cost - 0.01);
  assert.equal(quotedPassage(world, commander, destination.id).affordable, false);
  const refused = submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "travel",
    targetId: destination.id,
  });
  assert.equal(refused.ok, false);
  assert.equal(refused.ok === false ? refused.code : null, "insufficient-passage");
  assert.match(refused.ok === false ? refused.error : "", new RegExp(String(cost)));
  assert.equal(world.pendingCommands.length, 0);

  world.factions[commander.factionId!].treasury = cost;
  assert.equal(quotedPassage(world, commander, destination.id).affordable, true);
  const accepted = submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "travel",
    targetId: destination.id,
  });
  assert.equal(accepted.ok, true);
});

function curiousTraveler(money: number): { world: WorldState; traveler: Character; away: Settlement } {
  const world = createPrototypeWorld(1847);
  const traveler = Object.values(world.characters).find((character) => character.controller.kind === "autonomous" && character.factionId)!;
  const home = Object.values(world.settlements).find((settlement) => settlement.factionId === traveler.factionId)!;
  place(traveler, home.id);
  const away = Object.values(world.settlements).find((settlement) => settlement.id !== home.id)!;
  traveler.health = 100;
  traveler.morale = 100;
  traveler.cargo = { provisions: 80, arms: 0, medicine: 0, shipMaterials: 0 };
  traveler.personality = { caution: 0, ambition: 0, aggression: 0, loyalty: 0, commerce: 0, curiosity: 1 };
  traveler.troops = { ...traveler.troops, count: 0 };
  traveler.standingOrders = [];
  traveler.captivity = null;
  const goal = traveler.goals[0];
  goal.status = "active";
  goal.kind = "explore-world";
  traveler.activeGoalId = goal.id;
  traveler.plan = {
    id: "sail-broke",
    goalId: goal.id,
    intent: "sail when the purse can cover it",
    preferredActions: ["travel"],
    targetId: away.id,
    createdTick: world.tick,
    reviewAfterTick: world.tick + 500,
    reason: "the same passage quote the player command uses",
  };
  traveler.lastPlanReviewTick = world.tick;
  traveler.money = money;
  // Exhaust today's allowance so these tests still measure the purse. A member
  // otherwise covers the quote from the allowance first.
  traveler.allowanceRemaining = 0;
  return { world, traveler, away };
}

function travelStarted(events: SimEvent[], travelerId: string): SimEvent | undefined {
  return events.find((event) => event.type === "travel-started" && event.actorId === travelerId);
}

test("an autonomous character with a short purse does not pick unaffordable travel", () => {
  const { world, traveler, away } = curiousTraveler(0);
  const quote = quotedPassage(world, traveler, away.id);
  traveler.money = Math.max(0, quote.cost - 0.01);
  assert.equal(quotedPassage(world, traveler, away.id).affordable, false);

  const events = runTick(world).events;
  assert.equal(travelStarted(events, traveler.id), undefined);
  const decision = events.find((event) => event.type === "decision-made" && event.actorId === traveler.id);
  assert.ok(decision, "the character still chooses something else");
  const chosen = decision.data.chosen as { action: string };
  assert.notEqual(chosen.action, "travel");
  assert.equal(traveler.travel, null);
});

test("affordable autonomous travel is still offered", () => {
  const { world, traveler, away } = curiousTraveler(0);
  const quote = quotedPassage(world, traveler, away.id);
  traveler.money = quote.cost;
  assert.equal(quotedPassage(world, traveler, away.id).affordable, true);

  const sailed = travelStarted(runTick(world).events, traveler.id);
  assert.ok(sailed, "a purse that covers the quote still sails");
  assert.equal(sailed.targetId, away.id);
  assert.equal(traveler.travel?.toId, away.id);
});

test("autonomous travel comes back once the purse can cover it", () => {
  const { world, traveler, away } = curiousTraveler(0);
  assert.equal(quotedPassage(world, traveler, away.id).affordable, false);
  const broke = runTick(world).events;
  assert.equal(travelStarted(broke, traveler.id), undefined);
  assert.equal(traveler.travel, null);

  // One tick of work or trade can refill a purse. Put it back under the quote
  // and the same character still stays in port, then sails once it covers it.
  const quote = quotedPassage(world, traveler, away.id);
  traveler.money = Math.max(0, quote.cost - 0.01);
  assert.equal(quotedPassage(world, traveler, away.id).affordable, false);
  const stillShort = runTick(world).events;
  assert.equal(travelStarted(stillShort, traveler.id), undefined);
  assert.equal(traveler.travel, null);

  traveler.money = quotedPassage(world, traveler, away.id).cost;
  assert.equal(quotedPassage(world, traveler, away.id).affordable, true);
  const sailed = travelStarted(runTick(world).events, traveler.id);
  assert.ok(sailed, "funding the same passage puts travel back on the table");
  assert.equal(sailed.targetId, away.id);
});

const PLANTED_GROUND: SettlementGround = {
  population: 1111,
  fortification: 2.5,
  observedTick: 0,
  source: "direct",
};

function plantGround(character: Character, settlementId: string, ground: SettlementGround = PLANTED_GROUND): void {
  const current = character.knowledge[settlementId];
  character.knowledge[settlementId] = { ...current, ground: { ...ground } };
}

function replaceKnowledge(world: WorldState, actor: Character, settlementId: string, knowledge: SettlementKnowledge): void {
  const event: SimEvent = {
    sequence: world.nextEventSequence,
    tick: world.tick,
    type: "knowledge-updated",
    actorId: actor.id,
    settlementId,
    data: { settlementId, knowledge, reason: "synthetic replacement" },
  };
  applyEvent(world, event);
}

test("every knowledge replacement carries ground forward unless the new record is newer ground", () => {
  const seeded = createPrototypeWorld(1847);
  const sources = new Set<string>();
  for (const character of Object.values(seeded.characters)) {
    for (const entry of Object.values(character.knowledge)) {
      sources.add(entry.source);
      assert.equal(entry.ground, undefined, `${entry.source} seeding must not invent ground`);
    }
  }
  assert.deepEqual([...sources].sort(), ["direct", "faction-report", "rumor"]);

  const world = createPrototypeWorld(1847);
  const commander = commanderOf(world);
  const port = foreignPort(world, commander);
  place(commander, port.id);
  plantGround(commander, port.id);

  let daily: SimEvent | undefined;
  for (let step = 0; step < 3 && !daily; step += 1) {
    daily = runTick(world).events.find((event) =>
      event.type === "knowledge-updated" &&
      event.actorId === commander.id &&
      event.settlementId === port.id &&
      event.data.reason === "direct local observation"
    );
  }
  assert.ok(daily, "daily refresh is a knowledge-updated writer");
  assert.deepEqual((daily.data.knowledge as SettlementKnowledge).ground, PLANTED_GROUND);
  assert.deepEqual(commander.knowledge[port.id].ground, PLANTED_GROUND);

  const home = "crown-harbor";
  assert.equal(submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "travel",
    targetId: home,
  }).ok, true);
  let arrivedHome = false;
  for (let step = 0; step < 20 && !arrivedHome; step += 1) {
    arrivedHome = runTick(world).events.some((event) =>
      event.type === "arrived" && event.actorId === commander.id && event.settlementId === home
    );
  }
  assert.ok(arrivedHome);
  assert.deepEqual(commander.knowledge[port.id].ground, PLANTED_GROUND, "leaving must not drop the survey");

  assert.equal(submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "travel",
    targetId: port.id,
  }).ok, true);
  let arrival: SimEvent | undefined;
  for (let step = 0; step < 20 && !arrival; step += 1) {
    arrival = runTick(world).events.find((event) =>
      event.type === "knowledge-updated" &&
      event.actorId === commander.id &&
      event.settlementId === port.id &&
      event.data.reason === "arrival observation"
    );
  }
  assert.ok(arrival, "arrival is a knowledge-updated writer");
  assert.deepEqual((arrival.data.knowledge as SettlementKnowledge).ground, PLANTED_GROUND);

  commander.troops.count = 30;
  port.garrison = 10;
  world.activeBattles = {};
  assert.equal(submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "raid",
  }).ok, true);
  const fought = runTick(world).events.filter((event) =>
    event.type === "knowledge-updated" &&
    event.actorId === commander.id &&
    event.settlementId === port.id &&
    String(event.data.reason).includes("assessment")
  );
  assert.ok(fought.length > 0, "combat observation is a knowledge-updated writer");
  for (const event of fought) {
    assert.deepEqual((event.data.knowledge as SettlementKnowledge).ground, PLANTED_GROUND);
  }
  assert.deepEqual(commander.knowledge[port.id].ground, PLANTED_GROUND);

  const omitted = { ...commander.knowledge[port.id] };
  delete omitted.ground;
  replaceKnowledge(world, commander, port.id, omitted);
  assert.deepEqual(commander.knowledge[port.id].ground, PLANTED_GROUND, "a payload that forgets ground must not erase it");

  replaceKnowledge(world, commander, port.id, {
    ...commander.knowledge[port.id],
    ground: { population: 1, fortification: 1, observedTick: PLANTED_GROUND.observedTick - 1, source: "direct" },
  });
  assert.deepEqual(commander.knowledge[port.id].ground, PLANTED_GROUND, "an older ground record must not replace a newer one");

  const newer: SettlementGround = { population: 2222, fortification: 3.25, observedTick: world.tick, source: "direct" };
  replaceKnowledge(world, commander, port.id, { ...commander.knowledge[port.id], ground: newer });
  assert.deepEqual(commander.knowledge[port.id].ground, newer);

  const surveyed = createPrototypeWorld(1847);
  const surveyor = commanderOf(surveyed);
  const surveyPort = foreignPort(surveyed, surveyor);
  place(surveyor, surveyPort.id);
  plantGround(surveyor, surveyPort.id);
  assert.equal(submitCommand(surveyed, {
    playerId: "prototype-player",
    type: "character-action",
    action: "survey",
  }).ok, true);
  const surveyEvent = runTick(surveyed).events.find((event) => event.data.reason === "survey");
  assert.ok(surveyEvent, "survey is a knowledge-updated writer");
  const surveyGround = (surveyEvent.data.knowledge as SettlementKnowledge).ground;
  assert.equal(surveyGround?.population, surveyPort.population);
  assert.notEqual(surveyGround?.population, PLANTED_GROUND.population);
  assert.equal(surveyGround?.observedTick, surveyEvent.tick);

  const reported = createPrototypeWorld(1847);
  const issuer = commanderOf(reported);
  const reportPort = foreignPort(reported, issuer);
  const officer = explorer(reported, issuer);
  place(issuer, "crown-harbor");
  plantGround(issuer, reportPort.id, { ...PLANTED_GROUND, observedTick: -5 });
  stationExplorer(reported, officer, reportPort.id, true);
  const delivered = runTick(reported).events.find((event) => event.data.reason === "explore-report");
  assert.ok(delivered, "explore-report is a knowledge-updated writer");
  const deliveredGround = (delivered.data.knowledge as SettlementKnowledge).ground;
  assert.equal(deliveredGround?.population, reportPort.population);
  assert.ok((deliveredGround?.observedTick ?? -1) > -5);
  assert.equal(issuer.knowledge[reportPort.id].ground?.population, reportPort.population);
  assert.equal(officer.knowledge[reportPort.id].ground, undefined, "the officer's own map is not given the delivered ground");
});
