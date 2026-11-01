import assert from "node:assert/strict";
import test from "node:test";
import { dashboardState, fullEventFeed } from "../src/dashboard/view-model.ts";
import { provisionDemand, runTicks } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import {
  ownerGatePasses,
  secessionLoyalty,
  secessionReadout,
  settlementPressed,
  settlementProvisionRation,
  SECESSION_LOYALTY_LINE,
} from "../src/sim/secession.ts";
import { commandHolderId, stateHash } from "../src/sim/state.ts";
import type { Character, Settlement, WorldState } from "../src/sim/types.ts";

/**
 * Slice 1. The settlement panel reads who would leave. The world and the
 * event log are not written. There is no command and no autonomous walker.
 */

function port(world: WorldState, id: string): Settlement {
  return world.settlements[id];
}

function moveOff(world: WorldState, settlementId: string): void {
  for (const character of Object.values(world.characters)) {
    if (character.locationId === settlementId) character.locationId = "verdant-cay";
  }
}

function place(character: Character, settlementId: string): void {
  character.locationId = settlementId;
  character.travel = null;
  character.captivity = null;
}

function viewOf(world: WorldState) {
  return dashboardState(world, [], fullEventFeed([])) as {
    settlements: Array<{
      id: string;
      secession: {
        ownerId: string | null;
        ownerGate: boolean;
        followerCount: number | null;
        garrisonFollows: boolean | "none";
        taxOpen: { followerCount: number | null; garrisonFollows: boolean | "none" };
      } | null;
    }>;
  };
}

test("an unowned port fails the owner gate and does not write the world", () => {
  const world = createPrototypeWorld(1847);
  const before = stateHash(world);
  const harbor = port(world, "crown-harbor");
  assert.equal(harbor.ownerId, null);
  const readout = secessionReadout(world, harbor);
  assert.equal(readout.ownerId, null);
  assert.equal(readout.ownerGate, false);
  assert.equal(readout.garrisonFollows, false);
  assert.equal(readout.followerCount, 0);
  assert.equal(readout.taxOpen.garrisonFollows, true);
  assert.equal(stateHash(world), before);
  assert.equal(world.settlements["crown-harbor"].ownerId, null);
});

test("the owner gate is presence, membership, and the holder split", () => {
  const world = createPrototypeWorld(1847);
  const harbor = port(world, "crown-harbor");
  const mara = world.characters["character-01"];
  assert.equal(commandHolderId(world, "world-government"), mara.id);
  assert.equal(mara.controller.kind, "human");
  place(mara, "crown-harbor");
  harbor.ownerId = mara.id;
  assert.equal(ownerGatePasses(world, harbor), true);

  const mate = world.characters["character-02"];
  place(mate, "crown-harbor");
  mate.factionId = "world-government";
  harbor.ownerId = mate.id;
  assert.notEqual(commandHolderId(world, "world-government"), mate.id);
  assert.equal(ownerGatePasses(world, harbor), true);

  mate.locationId = "glassport";
  assert.equal(ownerGatePasses(world, harbor), false);
  place(mate, "crown-harbor");
  mate.travel = { fromId: "crown-harbor", toId: "glassport", totalTicks: 4, remainingTicks: 2 };
  assert.equal(ownerGatePasses(world, harbor), false);
  mate.travel = null;
  mate.captivity = {
    captorFactionId: "free-tide",
    settlementId: "crown-harbor",
    capturedTick: 0,
    mandatoryReleaseTick: 84,
    cause: "major-defeat",
    displayedRisk: "high",
    scatteredTroops: { count: 1, experience: 0, discipline: 0 },
    releaseDestinationId: null,
  };
  assert.equal(ownerGatePasses(world, harbor), false);
  mate.captivity = null;
  mate.factionId = "free-tide";
  assert.equal(ownerGatePasses(world, harbor), false);

  const cinder = port(world, "cinder-key");
  const pax = world.characters["character-14"];
  assert.equal(commandHolderId(world, "free-tide"), pax.id);
  assert.equal(pax.controller.kind, "autonomous");
  place(pax, "cinder-key");
  cinder.ownerId = pax.id;
  assert.equal(ownerGatePasses(world, cinder), false);

  harbor.ownerId = "character-missing";
  assert.equal(ownerGatePasses(world, harbor), false);

  for (const character of Object.values(world.characters)) character.standingOrders = [];
  assert.equal(commandHolderId(world, "world-government"), null);
  place(mate, "crown-harbor");
  mate.factionId = "world-government";
  harbor.ownerId = mate.id;
  harbor.factionId = "world-government";
  assert.equal(ownerGatePasses(world, harbor), true);

  const cay = port(world, "verdant-cay");
  const bystander = world.characters["character-23"];
  place(bystander, "verdant-cay");
  bystander.factionId = null;
  cay.ownerId = bystander.id;
  assert.equal(cay.factionId, null);
  assert.equal(ownerGatePasses(world, cay), false);
});

test("the garrison follows only when the port is pressed", () => {
  const world = createPrototypeWorld(1847);
  const harbor = port(world, "crown-harbor");
  harbor.factionId = "world-government";
  world.factions["world-government"].taxRate = 0.14;
  harbor.stability = 55.001;
  const ration = settlementProvisionRation(harbor);
  harbor.stocks.provisions = ration;
  assert.equal(settlementPressed(world, harbor), false);
  assert.equal(secessionReadout(world, harbor).garrisonFollows, false);

  harbor.stability = 55;
  assert.equal(secessionReadout(world, harbor).garrisonFollows, true);
  harbor.stability = 55.001;
  harbor.stocks.provisions = ration - 0.001;
  assert.equal(secessionReadout(world, harbor).garrisonFollows, true);
  harbor.stocks.provisions = ration;
  world.factions["world-government"].taxRate = 0.15;
  assert.equal(secessionReadout(world, harbor).garrisonFollows, false);
  world.factions["world-government"].taxRate = 0.16;
  assert.equal(secessionReadout(world, harbor).garrisonFollows, true);

  harbor.garrison = 0;
  assert.equal(secessionReadout(world, harbor).garrisonFollows, "none");
  assert.equal(secessionReadout(world, harbor).taxOpen.garrisonFollows, "none");

  const cay = port(world, "verdant-cay");
  cay.stability = 80;
  cay.stocks.provisions = settlementProvisionRation(cay);
  assert.equal(secessionReadout(world, cay).garrisonFollows, false);
  assert.equal(secessionReadout(world, cay).taxOpen.garrisonFollows, true);
});

test("followers are anchored members under 0.75, and the tax-open line presses the port", () => {
  const world = createPrototypeWorld(1847);
  const harbor = port(world, "crown-harbor");
  moveOff(world, "crown-harbor");
  world.factions["world-government"].taxRate = 0.14;
  harbor.stability = 80;
  harbor.stocks.provisions = 500;
  harbor.ownerId = null;

  const owner = world.characters["character-02"];
  const loyal = world.characters["character-03"];
  const shaky = world.characters["character-04"];
  const line = world.characters["character-05"];
  const scarred = world.characters["character-06"];
  const holder = world.characters["character-01"];
  const rival = world.characters["character-15"];
  const unaffiliated = world.characters["character-23"];
  const captive = world.characters["character-07"];
  const sailing = world.characters["character-08"];
  const short = world.characters["character-09"];
  const fed = world.characters["character-10"];

  for (const character of [owner, loyal, shaky, line, scarred, holder, rival, unaffiliated, captive, sailing, short, fed]) {
    place(character, "crown-harbor");
    character.loyaltyAdjustment = undefined;
    delete character.loyaltyAdjustment;
  }
  for (const character of [owner, loyal, shaky, line, scarred, holder, captive, sailing, short, fed]) {
    character.factionId = "world-government";
  }
  rival.factionId = "free-tide";
  unaffiliated.factionId = null;
  harbor.ownerId = owner.id;

  owner.personality.loyalty = 0.2;
  loyal.personality.loyalty = 0.9;
  shaky.personality.loyalty = SECESSION_LOYALTY_LINE - 0.001;
  line.personality.loyalty = SECESSION_LOYALTY_LINE;
  scarred.personality.loyalty = 0.76;
  scarred.loyaltyAdjustment = -0.04;
  holder.personality.loyalty = 0.2;
  short.personality.loyalty = 0.4;
  fed.personality.loyalty = 0.4;
  captive.personality.loyalty = 0.2;
  sailing.personality.loyalty = 0.2;
  captive.captivity = {
    captorFactionId: "free-tide",
    settlementId: "crown-harbor",
    capturedTick: 0,
    mandatoryReleaseTick: 84,
    cause: "major-defeat",
    displayedRisk: "high",
    scatteredTroops: { count: 1, experience: 0, discipline: 0 },
    releaseDestinationId: null,
  };
  sailing.travel = { fromId: "glassport", toId: "crown-harbor", totalTicks: 4, remainingTicks: 1 };

  const plenty = 40;
  for (const character of [owner, loyal, shaky, line, scarred, holder, rival, unaffiliated, captive, sailing, fed]) {
    character.cargo.provisions = plenty;
    assert.ok(character.cargo.provisions >= provisionDemand(character));
  }
  short.cargo.provisions = 0;
  assert.ok(short.cargo.provisions < provisionDemand(short));
  assert.ok(secessionLoyalty(scarred) < SECESSION_LOYALTY_LINE);
  assert.equal(secessionLoyalty(line) < SECESSION_LOYALTY_LINE, false);

  const quiet = secessionReadout(world, harbor);
  assert.equal(quiet.garrisonFollows, false);
  assert.equal(quiet.followerCount, 1);
  assert.equal(quiet.taxOpen.garrisonFollows, true);
  assert.equal(quiet.taxOpen.followerCount, 4);

  harbor.stability = 55;
  const pressed = secessionReadout(world, harbor);
  assert.equal(pressed.garrisonFollows, true);
  assert.equal(pressed.followerCount, 4);
  assert.equal(pressed.taxOpen.followerCount, 4);
  assert.equal(pressed.ownerGate, true);

  world.factions["world-government"].actingCommanderId = shaky.id;
  const covered = secessionReadout(world, harbor);
  assert.equal(covered.followerCount, 3);
  assert.equal(covered.taxOpen.followerCount, 3);
  delete world.factions["world-government"].actingCommanderId;
  assert.equal(secessionReadout(world, harbor).followerCount, 4);
});

test("the panel shows the readout on an exact port and withholds it offshore", () => {
  const world = createPrototypeWorld(1847);
  const before = stateHash(world);
  const view = viewOf(world);
  assert.equal(stateHash(world), before);

  const harbor = view.settlements.find((settlement) => settlement.id === "crown-harbor");
  const glass = view.settlements.find((settlement) => settlement.id === "glassport");
  const cinder = view.settlements.find((settlement) => settlement.id === "cinder-key");
  const cay = view.settlements.find((settlement) => settlement.id === "verdant-cay");
  assert.ok(harbor?.secession);
  assert.ok(glass?.secession);
  assert.equal(harbor.secession.ownerId, null);
  assert.equal(harbor.secession.ownerGate, false);
  assert.equal(harbor.secession.followerCount, 0);
  assert.equal(harbor.secession.garrisonFollows, false);
  assert.equal(harbor.secession.taxOpen.garrisonFollows, true);
  assert.equal(typeof harbor.secession.taxOpen.followerCount, "number");
  assert.equal(glass.secession.ownerGate, false);
  assert.equal(glass.secession.garrisonFollows, false);
  assert.equal(cinder?.secession, null);
  assert.equal(cay?.secession, null);

  const keys = view.settlements.map((settlement) => Object.keys(settlement).sort().join(","));
  assert.equal(new Set(keys).size, 1);

  const commander = world.characters[world.players["prototype-player"].characterId];
  commander.locationId = "cinder-key";
  commander.travel = null;
  const beside = viewOf(world).settlements.find((settlement) => settlement.id === "cinder-key");
  assert.ok(beside?.secession);
  assert.equal(beside.secession.followerCount, null);
  assert.equal(beside.secession.taxOpen.followerCount, null);
  assert.equal(typeof beside.secession.garrisonFollows, "boolean");
  assert.equal(beside.secession.taxOpen.garrisonFollows, true);
  assert.equal(beside.secession.ownerId, world.settlements["cinder-key"].ownerId);

  commander.locationId = "verdant-cay";
  const onCay = viewOf(world).settlements.find((settlement) => settlement.id === "verdant-cay");
  assert.equal(onCay?.secession, null);
  const harborAway = viewOf(world).settlements.find((settlement) => settlement.id === "crown-harbor");
  assert.ok(harborAway?.secession);
  assert.equal(typeof harborAway.secession.followerCount, "number");
});

// Port balance: Free Tide takes Glassport at t60 now, so the away-port check moves to t54, when
// Glassport is still the original (unclaimed) World Government port and Mara knows it. Was t72, owner Rook Tern.
test("Glassport at tick 54 is a World Government port the commander is standing away from", () => {
  const world = createPrototypeWorld(1847);
  runTicks(world, 54);
  const live = world.settlements["glassport"];
  const mara = world.characters["character-01"];
  assert.equal(mara.locationId, "crown-harbor");
  assert.equal(live.factionId, "world-government");
  assert.equal(live.ownerId, null);
  assert.equal(mara.knowledge["glassport"].factionId, "world-government");

  const view = viewOf(world);
  const glass = view.settlements.find((settlement) => settlement.id === "glassport");
  const harbor = view.settlements.find((settlement) => settlement.id === "crown-harbor");
  const cinder = view.settlements.find((settlement) => settlement.id === "cinder-key");
  const verdant = view.settlements.find((settlement) => settlement.id === "verdant-cay");
  assert.ok(glass?.secession);
  assert.equal(typeof glass.secession.followerCount, "number");
  assert.ok(harbor?.secession);
  assert.equal(typeof harbor.secession.followerCount, "number");
  // At t54 Cinder Key is still Free Tide's: a rival port Mara is away from shows no readout
  // (at t72 it had been World Government's, so it showed one).
  assert.equal(world.settlements["cinder-key"].factionId, "free-tide");
  assert.equal(cinder?.secession, null);
  assert.equal(verdant?.secession, null);
});
