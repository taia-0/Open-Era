import assert from "node:assert/strict";
import test from "node:test";
import { dashboardState, fullEventFeed } from "../src/dashboard/view-model.ts";
import {
  characterVisibilityTier,
  eventPayloadVisible,
  projectCharacter,
  projectEvent,
  projectFactions,
  projectSupplyContracts,
  visibleStandingOrders,
} from "../src/dashboard/visibility.ts";
import { runTick } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { applyEvent, partyPower, round, stateHash } from "../src/sim/state.ts";
import type { Character, SimEvent, WorldState } from "../src/sim/types.ts";

interface ProjectedIntelligence {
  tier: string;
  source: string;
  conditionExact: boolean;
  capabilityExact: boolean;
  observedTick: number | null;
}

type ProjectedCharacter = Record<string, unknown> & {
  id: string;
  name: string;
  archetype: string;
  controller: { kind: string };
  factionId: string | null;
  locationId: string | null;
  money: number | null;
  health: number | null;
  troops: unknown;
  skills: unknown;
  activeGoal: unknown;
  partyPower: number | null;
  victories: number;
  defeats: number;
  standingOrders: unknown[];
  intelligence: ProjectedIntelligence;
};

interface ProjectedFaction {
  id: string;
  name: string;
  color: string;
  commanderId: string | null;
  actingCommanderId: string | null;
  treasury: number | null;
  taxRate: number | null;
  power: number | null;
  intelligence: { exact: boolean };
}

/** Fields describing condition or capability rather than identity. */
const WITHHELD_WHEN_DISTANT = [
  "money",
  "cargo",
  "health",
  "morale",
  "sailors",
  "troops",
  "captivity",
  "troopRecovery",
  "scars",
  "debts",
  "attributes",
  "skills",
  "personality",
  "partyPower",
  "activeGoal",
  "plan",
  "knowledge",
] as const;

function fixture(): { world: WorldState; commander: Character } {
  const world = createPrototypeWorld(1847);
  const commander = world.characters[world.players["prototype-player"].characterId];
  return { world, commander };
}

function subject(
  world: WorldState,
  commander: Character,
  predicate: (candidate: Character) => boolean,
): Character {
  const found = Object.values(world.characters)
    .sort((left, right) => left.id.localeCompare(right.id))
    .find((candidate) => candidate.id !== commander.id && predicate(candidate));
  assert.ok(found, "the prototype world must contain a matching character");
  return found;
}

function rival(world: WorldState, commander: Character): Character {
  return subject(world, commander, (candidate) => candidate.factionId !== commander.factionId);
}

function peer(world: WorldState, commander: Character): Character {
  return subject(world, commander, (candidate) => candidate.factionId === commander.factionId);
}

/** Park a character nowhere so proximity cannot make it observable. */
function makeUnobserved(character: Character): void {
  character.locationId = null;
  character.travel = null;
}

function project(world: WorldState, commander: Character, character: Character): ProjectedCharacter {
  return projectCharacter(world, commander, character) as unknown as ProjectedCharacter;
}

test("the commander is the only character reported exactly", () => {
  const { world, commander } = fixture();
  const projected = project(world, commander, commander);

  assert.equal(projected.intelligence.tier, "self");
  assert.equal(projected.intelligence.source, "own-character");
  assert.equal(projected.money, round(commander.money, 2));
  assert.deepEqual(projected.plan, commander.plan);
  assert.deepEqual(projected.personality, commander.personality);
  assert.deepEqual(projected.standingOrders, commander.standingOrders);

  // Knowledge is the commander's own, but a report seeded before the world began
  // carries a deliberately negative tick of observation internally. A player must
  // not be shown a tick that does not exist, so the projection floors it at 0 and
  // changes nothing else about the entry.
  const knowledge = projected.knowledge as Record<string, Record<string, unknown>>;
  assert.deepEqual(Object.keys(knowledge).sort(), Object.keys(commander.knowledge).sort());
  for (const [settlementId, entry] of Object.entries(knowledge)) {
    const source = commander.knowledge[settlementId];
    assert.ok(Number(entry.observedTick) >= 0, `${settlementId} must not report a negative observedTick`);
    assert.deepEqual(
      { ...entry, observedTick: source.observedTick },
      source,
      `${settlementId} must be the commander's own knowledge with only the age made sane`,
    );
  }
});

test("proximity reveals condition but never motive", () => {
  const { world, commander } = fixture();
  const companion = peer(world, commander);
  companion.locationId = commander.locationId;
  companion.travel = null;

  const projected = project(world, commander, companion);
  assert.equal(projected.intelligence.tier, "co-located");
  assert.equal(projected.intelligence.conditionExact, true);

  // Observable condition crosses the boundary.
  assert.equal(projected.health, round(companion.health, 1));
  const troops = projected.troops as { count: number; experience: number; discipline: number };
  assert.equal(troops.count, companion.troops.count);
  assert.equal(troops.experience, round(companion.troops.experience, 3));
  assert.equal(troops.discipline, round(companion.troops.discipline, 3));
  assert.equal(companion.troops.experience, 0.14849378322251142);
  assert.deepEqual(projected.skills, companion.skills);

  // Motive does not, even at arm's length.
  assert.equal(projected.plan, null);
  assert.equal(projected.activeGoal, null);
  assert.equal(projected.knowledge, null);
  assert.equal(projected.personality, null);
});

test("a character outside the commander's observation exposes identity only", () => {
  const { world, commander } = fixture();
  const stranger = rival(world, commander);
  makeUnobserved(stranger);

  const projected = project(world, commander, stranger);
  assert.equal(projected.intelligence.tier, "distant");

  // Identity and presence stay legible, because the map depends on them.
  assert.equal(projected.name, stranger.name);
  assert.equal(projected.archetype, stranger.archetype);
  assert.equal(projected.controller.kind, stranger.controller.kind);
  assert.equal(projected.locationId, stranger.locationId);

  // Public renown is not a secret.
  assert.equal(projected.victories, stranger.victories);
  assert.equal(projected.defeats, stranger.defeats);

  for (const field of WITHHELD_WHEN_DISTANT) {
    assert.equal(projected[field], null, `${field} must be withheld at a distance`);
    assert.notEqual(projected[field], 0, `${field} must read as unknown, never as zero`);
  }
  // A sighting is a record, not a live count. With no record the field is null,
  // and it must not be copied into troops.
  assert.equal(projected.troops, null);
  assert.equal(projected.partySighting, null);
  assert.equal(projected.seaSighting, null);
  assert.equal(projected.seaSightings, null);

  const liveTroops = stranger.troops.count;
  stranger.troops = { ...stranger.troops, count: 0 };
  stranger.captivity = {
    captorFactionId: commander.factionId === "free-tide" ? "world-government" : "free-tide",
    settlementId: "glassport",
    capturedTick: 4,
    mandatoryReleaseTick: 88,
    cause: "failed-retreat",
    displayedRisk: "low",
    scatteredTroops: { count: 22, experience: stranger.troops.experience, discipline: stranger.troops.discipline },
    releaseDestinationId: null,
  };
  const heldByAnother = project(world, commander, stranger);
  assert.equal(heldByAnother.captiveIntel, null, "a distant prisoner of another faction has no captor row");
  assert.equal(heldByAnother.troops, null);
  stranger.captivity = null;
  stranger.troops = { ...stranger.troops, count: liveTroops };

  // A different leg is still not a meeting. The course is not on this card.
  commander.locationId = null;
  commander.travel = { fromId: "cinder-key", toId: "verdant-cay", totalTicks: 4, remainingTicks: 4 };
  stranger.locationId = null;
  stranger.travel = { fromId: "crown-harbor", toId: "glassport", totalTicks: 4, remainingTicks: 4 };
  const apart = project(world, commander, stranger);
  assert.equal(apart.seaSighting, null, "a character outside the commander's leg has no sea sighting");
  assert.equal(apart.troops, null);
  assert.equal(apart.seaSightings, null);
  const own = project(world, commander, commander);
  const ownList = own.seaSightings as Record<string, unknown> | null;
  assert.ok(ownList);
  assert.equal(ownList[stranger.id], undefined);
});

test("a landless mate at Verdant Cay is distant and a rival faction hides its purse", () => {
  const { world, commander } = fixture();
  assert.equal(commander.locationId, "crown-harbor");
  world.settlements["cinder-key"].factionId = "world-government";
  assert.equal(
    Object.values(world.settlements).some((settlement) => settlement.factionId === "free-tide"),
    false,
  );

  const mate = world.characters["character-18"];
  assert.equal(mate.factionId, "free-tide");
  mate.locationId = "verdant-cay";
  mate.travel = null;

  const projected = project(world, commander, mate);
  assert.equal(projected.intelligence.tier, "distant");
  assert.equal(projected.factionId, "free-tide");
  assert.equal(projected.locationId, "verdant-cay");
  assert.equal(projected.money, null);
  assert.equal(projected.troops, null);
  assert.equal(projected.skills, null);
  assert.equal(projected.activeGoal, null);
  assert.equal(projected.intelligence.observedTick, null);

  const rival = (projectFactions(world, commander) as unknown as ProjectedFaction[])
    .find((faction) => faction.id === "free-tide");
  assert.ok(rival, "a faction with no ports is still listed");
  assert.equal(rival.treasury, null);
  assert.equal(rival.power, null);
});

test("a rival row names the seat and the cover, and still hides treasury and power", () => {
  const { world, commander } = fixture();
  const atStart = projectFactions(world, commander) as unknown as ProjectedFaction[];
  const own = atStart.find((faction) => faction.id === commander.factionId);
  const rival = atStart.find((faction) => faction.id === "free-tide");
  assert.ok(own);
  assert.ok(rival);
  assert.equal(commander.name, "Mara Vane");
  assert.equal(own.commanderId, "character-01");
  assert.equal(own.actingCommanderId, null);
  assert.equal(rival.commanderId, "character-14");
  assert.equal(rival.actingCommanderId, null);
  assert.equal(rival.treasury, null);
  assert.equal(rival.power, null);

  const pax = world.characters["character-14"];
  assert.equal(pax.name, "Pax Ash");
  const settlementId = pax.locationId ?? "crown-harbor";
  applyEvent(world, {
    sequence: world.nextEventSequence,
    tick: world.tick,
    type: "character-captured",
    actorId: pax.id,
    settlementId,
    data: {
      battleId: "seat-test-character-14",
      health: pax.health,
      morale: pax.morale,
      captivity: {
        captorFactionId: world.settlements[settlementId].factionId,
        settlementId,
        capturedTick: world.tick,
        mandatoryReleaseTick: world.tick + 84,
        cause: "major-defeat",
        displayedRisk: "high",
        scatteredTroops: { ...pax.troops },
        releaseDestinationId: null,
      },
    },
  });

  const covered = (projectFactions(world, commander) as unknown as ProjectedFaction[])
    .find((faction) => faction.id === "free-tide");
  assert.ok(covered);
  assert.equal(world.characters["character-20"].name, "Dax Pike");
  assert.equal(covered.commanderId, "character-14");
  assert.equal(covered.actingCommanderId, "character-20");
  assert.equal(covered.treasury, null);
  assert.equal(covered.power, null);
});

test("a faction peer is known by record without exposing condition or motive", () => {
  const { world, commander } = fixture();
  const factionPeer = peer(world, commander);
  makeUnobserved(factionPeer);

  const projected = project(world, commander, factionPeer);
  assert.equal(projected.intelligence.tier, "faction");

  // Capability sits on the faction record.
  assert.deepEqual(projected.skills, factionPeer.skills);
  assert.deepEqual(projected.attributes, factionPeer.attributes);

  // Condition and motive do not.
  assert.equal(projected.health, null);
  assert.equal(projected.troops, null);
  assert.equal(projected.plan, null);
  assert.equal(projected.knowledge, null);
  assert.equal(projected.personality, null);
});

test("tier resolution prefers proximity over affiliation", () => {
  const { world, commander } = fixture();
  const factionPeer = peer(world, commander);
  makeUnobserved(factionPeer);
  assert.equal(characterVisibilityTier(world, commander, factionPeer), "faction");

  factionPeer.locationId = commander.locationId;
  assert.equal(characterVisibilityTier(world, commander, factionPeer), "co-located");

  factionPeer.travel = { fromId: "crown-harbor", toId: "glassport", totalTicks: 5, remainingTicks: 3 };
  assert.equal(
    characterVisibilityTier(world, commander, factionPeer),
    "faction",
    "a character under way is not directly observed",
  );

  commander.locationId = null;
  commander.travel = { fromId: "crown-harbor", toId: "glassport", totalTicks: 4, remainingTicks: 3 };
  const alongside = project(world, commander, factionPeer);
  assert.equal(alongside.troops, null, "a character under way is not directly observed");
  assert.equal(alongside.partyPower, null);
  const sea = alongside.seaSighting as { troops: number; partyPower: number };
  assert.equal(sea.troops, factionPeer.troops.count);
  assert.equal(sea.partyPower, partyPower(factionPeer));
});

test("territory the commander's faction controls counts as observed", () => {
  const { world, commander } = fixture();
  assert.notEqual(commander.factionId, null);
  const ownedSettlement = Object.values(world.settlements).find(
    (settlement) => settlement.factionId === commander.factionId,
  );
  assert.ok(ownedSettlement, "the scenario must contain a settlement owned by the commander's faction");

  const outsider = rival(world, commander);
  outsider.locationId = ownedSettlement.id;
  outsider.travel = null;

  outsider.troops = { ...outsider.troops, count: 0 };
  outsider.captivity = {
    captorFactionId: commander.factionId,
    settlementId: ownedSettlement.id,
    capturedTick: 4,
    mandatoryReleaseTick: 88,
    cause: "failed-retreat",
    displayedRisk: "low",
    scatteredTroops: { count: 40, experience: outsider.troops.experience, discipline: outsider.troops.discipline },
    releaseDestinationId: null,
  };
  world.tick = 5;

  const projected = project(world, commander, outsider);
  assert.equal(projected.intelligence.tier, "co-located");
  const troops = projected.troops as { count: number; experience: number; discipline: number };
  assert.equal(troops.count, 0);
  assert.equal(troops.experience, round(outsider.troops.experience, 3));
  assert.equal(troops.discipline, round(outsider.troops.discipline, 3));
  assert.equal(outsider.troops.experience, 0.6677598488284275);
  assert.equal((projected.troops as { count: number }).count, 0);
  assert.equal(projected.partyPower, 0);
  assert.equal(projected.plan, null, "territory reveals presence, not motive");
  const intel = projected.captiveIntel as { troops: number; partyPower: number; leadership: number };
  assert.equal(intel.troops, 40, "the captured strength stays on captiveIntel");
  assert.equal(intel.leadership, outsider.skills.leadership);
  assert.notEqual(intel.partyPower, 0);
  assert.notEqual(intel.troops, (projected.troops as { count: number }).count);
});

test("only the commander's own orders are projected", () => {
  const { world, commander } = fixture();
  const factionPeer = peer(world, commander);
  makeUnobserved(factionPeer);

  const foreignOrder = {
    id: "order-foreign",
    issuerId: "character-14",
    directive: "protect" as const,
    targetId: "crown-harbor",
    priority: 0.9,
    issuedTick: 0,
    expiresTick: null,
    revision: 1,
    status: "active" as const,
    adherence: "following" as const,
    statusChangedTick: 0,
    deviationCount: 0,
    lastReport: null,
  };
  const ownOrder = { ...foreignOrder, id: "order-own", issuerId: commander.id };
  factionPeer.standingOrders = [foreignOrder, ownOrder];

  assert.deepEqual(
    visibleStandingOrders(commander, factionPeer).map((order) => order.id),
    ["order-own"],
    "another chain of command must not become visible",
  );
  assert.deepEqual(visibleStandingOrders(commander, commander), commander.standingOrders);
});

test("an order confirmation is visible only to the issuer and the holder's own relationship", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  const zara = world.characters["character-17"];
  const pax = world.characters["character-14"];
  assert.equal(zara.name, "Zara Gale");
  assert.equal(pax.name, "Pax Ash");
  runTick(world);
  const judged = runTick(world);
  const completed = judged.events.find((event) =>
    event.type === "standing-order-completed" && event.targetId === zara.id
  );
  assert.ok(completed);
  assert.equal(completed.data.reason, "issuer-judgment");
  assert.equal(completed.actorId, pax.id);
  const relationship = judged.events.find((event) =>
    event.type === "relationship-changed" &&
    event.data.trigger === "order confirmed" &&
    event.actorId === zara.id &&
    event.targetId === pax.id
  );
  assert.ok(relationship);

  assert.equal(
    visibleStandingOrders(mara, zara).some((order) => order.issuerId === pax.id),
    false,
  );
  assert.equal(eventPayloadVisible(world, mara, completed), false);
  assert.equal(eventPayloadVisible(world, pax, completed), true);
  assert.equal(eventPayloadVisible(world, zara, relationship), true);
  assert.equal(projectEvent(world, zara, relationship, "rich").payloadWithheld, false);
  assert.equal(
    (projectEvent(world, zara, relationship, "rich").data as { trigger: string }).trigger,
    "order confirmed",
  );

  assert.equal(eventPayloadVisible(world, mara, relationship), false);
  const distant = world.characters["character-15"];
  assert.notEqual(distant.id, pax.id);
  assert.notEqual(distant.id, zara.id);
  assert.notEqual(distant.factionId, mara.factionId);
  makeUnobserved(distant);
  assert.equal(characterVisibilityTier(world, mara, distant), "distant");
  assert.equal(eventPayloadVisible(world, distant, completed), false);
  assert.equal(eventPayloadVisible(world, distant, relationship), false);
  const withheld = projectEvent(world, distant, completed, "rich summary");
  assert.equal(withheld.data, null);
  assert.equal(withheld.payloadWithheld, true);
  assert.equal(projectEvent(world, distant, relationship, "rich summary").data, null);
});

test("foreign faction strength is withheld while the commander's own is exact", () => {
  const { world, commander } = fixture();
  const factions = projectFactions(world, commander) as unknown as ProjectedFaction[];

  const own = factions.find((faction) => faction.id === commander.factionId);
  assert.ok(own);
  assert.equal(own.intelligence.exact, true);
  assert.equal(typeof own.power, "number");
  assert.equal(typeof own.treasury, "number");

  const foreign = factions.filter((faction) => faction.id !== commander.factionId);
  assert.ok(foreign.length > 0, "the scenario must contain a rival faction");
  for (const faction of foreign) {
    assert.equal(faction.power, null, `${faction.id} power must be withheld`);
    assert.equal(faction.treasury, null);
    assert.equal(faction.intelligence.exact, false);
    // Tax is what a sale in that faction's ports will pay. It is public even
    // though the treasury the tax flows into is not.
    assert.equal(faction.taxRate, world.factions[faction.id].taxRate);
    assert.equal(typeof faction.taxRate, "number");
    // Names and colours survive because the map and order targets need them.
    assert.equal(typeof faction.name, "string");
    assert.equal(typeof faction.color, "string");
  }
});

test("a debt row and its repayment stay off a bystander's json", () => {
  const { world, commander } = fixture();
  const debtor = rival(world, commander);
  const amount = 17.13;
  debtor.locationId = "cinder-key";
  debtor.travel = null;
  debtor.debts.push({
    id: "debt-redaction",
    creditorFactionId: "free-tide",
    originalValue: 58.18,
    remainingValue: amount,
    incurredTick: 4,
    reason: "prisoner-release",
  });
  debtor.money = 80.77;

  const distant = project(world, commander, debtor);
  assert.equal(distant.debts, null);
  assert.equal(JSON.stringify(distant).includes(String(amount)), false);

  commander.locationId = "cinder-key";
  commander.travel = null;
  const alongside = project(world, commander, debtor);
  assert.equal(alongside.intelligence.tier, "co-located");
  assert.notEqual(alongside.money, null);
  assert.equal(alongside.debts, null);
  const before = JSON.stringify(alongside);
  debtor.debts[0].remainingValue = 3.5;
  const edited = project(world, commander, debtor);
  assert.equal(JSON.stringify(edited), before);
  debtor.debts[0].remainingValue = amount;

  const mate = peer(world, commander);
  makeUnobserved(mate);
  const mateView = project(world, mate, debtor);
  assert.equal(mateView.debts, null);

  const repayment: SimEvent = {
    sequence: 9,
    tick: 6,
    type: "debt-repaid",
    actorId: debtor.id,
    targetId: "free-tide",
    data: {
      debtId: "debt-redaction",
      paid: amount,
      remainingValue: 41.08,
      originalValue: 58.18,
      characterMoney: 62.9,
      factionTreasury: 2817.1,
      closed: false,
    },
  };
  const bystander = projectEvent(world, commander, repayment, `rich paid ${amount}`);
  assert.equal(bystander.data, null);
  assert.equal(bystander.payloadWithheld, true);
  assert.equal(bystander.summary, `${debtor.name} paid toward a debt to Free Tide Compact.`);
  assert.equal(String(bystander.summary).includes(String(amount)), false);

  const creditor = world.characters["character-14"];
  assert.equal(creditor.factionId, "free-tide");
  const seen = projectEvent(world, creditor, repayment, `rich paid ${amount}`);
  assert.equal(seen.payloadWithheld, false);
  assert.equal((seen.data as { paid?: number } | null)?.paid, amount);
  const ledger = (projectFactions(world, creditor) as Array<{ id: string; debts: Array<{ debtorId: string; remainingValue: number; characterMoney?: number }> | null }>)
    .find((faction) => faction.id === "free-tide");
  assert.ok(ledger?.debts);
  const row = ledger.debts.find((entry) => entry.debtorId === debtor.id);
  assert.ok(row);
  assert.equal(row.remainingValue, amount);
  assert.equal("characterMoney" in row, false);
  assert.equal(JSON.stringify(row).includes(String(debtor.money)), false);

  const hiddenLedger = (projectFactions(world, commander) as Array<{ id: string; debts: unknown }>)
    .find((faction) => faction.id === "free-tide");
  assert.equal(hiddenLedger?.debts, null);
});

test("a foreign decision payload is withheld and its summary neutralised", () => {
  const { world, commander } = fixture();
  const outsider = rival(world, commander);
  makeUnobserved(outsider);

  const decision: SimEvent = {
    sequence: 1,
    tick: 0,
    type: "decision-made",
    actorId: outsider.id,
    data: {
      activeLongTermGoalId: "goal-secret",
      planIntent: "quietly betray the commander",
      targetKnowledge: { "crown-harbor": { garrisonEstimate: 260 } },
      candidates: [{ action: "raid", score: 0.91 }],
    },
  };

  assert.equal(eventPayloadVisible(world, commander, decision), false);
  const projected = projectEvent(
    world,
    commander,
    decision,
    `rich summary ${String(decision.data.planIntent)}`,
  );
  assert.equal(projected.data, null, "private payloads must not cross the boundary");
  assert.equal(projected.payloadWithheld, true);
  assert.ok(
    !String(projected.summary).includes("betray"),
    "a withheld event must not leak its content through the summary",
  );

  const own: SimEvent = { ...decision, sequence: 2, actorId: commander.id };
  assert.equal(eventPayloadVisible(world, commander, own), true);
  assert.deepEqual(projectEvent(world, commander, own, "rich summary").data, own.data);
});

test("conversation payloads require thread participation", () => {
  const { world, commander } = fixture();
  const outsider = rival(world, commander);

  const privateMessage: SimEvent = {
    sequence: 1,
    tick: 0,
    type: "conversation-message-sent",
    actorId: outsider.id,
    data: { message: { id: "message-1", threadId: "thread-private", body: "a secret offer" } },
  };
  assert.equal(eventPayloadVisible(world, commander, privateMessage), false);

  world.conversationThreads["thread-shared"] = {
    id: "thread-shared",
    kind: "direct",
    title: "Shared",
    participantIds: [commander.id, outsider.id],
    createdById: commander.id,
    createdTick: 0,
    lastMessageTick: null,
  };
  const sharedMessage: SimEvent = {
    ...privateMessage,
    sequence: 2,
    data: { message: { id: "message-2", threadId: "thread-shared", body: "an offer" } },
  };
  assert.equal(eventPayloadVisible(world, commander, sharedMessage), true);
});

test("projecting the dashboard state does not mutate the world", () => {
  const { world } = fixture();
  const before = stateHash(world);
  dashboardState(world, [], fullEventFeed([]));
  assert.equal(
    stateHash(world),
    before,
    "redaction must be a read-only projection, not a change to authoritative state",
  );
});

test("owning the ground a decision was taken on grants no insight into the decision", () => {
  const { world, commander } = fixture();
  const ownedSettlement = Object.values(world.settlements).find(
    (settlement) => settlement.factionId === commander.factionId,
  );
  assert.ok(ownedSettlement, "the scenario must contain a settlement the commander's faction owns");

  const visitor = rival(world, commander);
  visitor.locationId = ownedSettlement.id;
  visitor.travel = null;

  // Control of the ground makes their condition observable...
  assert.equal(characterVisibilityTier(world, commander, visitor), "co-located");

  // ...but the decision they take there is still theirs, not the commander's.
  const decision: SimEvent = {
    sequence: 1,
    tick: 0,
    type: "decision-made",
    actorId: visitor.id,
    settlementId: ownedSettlement.id,
    data: {
      activeLongTermGoalId: "character-29:material-security",
      planIntent: "reinforce the target before the commander arrives",
      chosen: { action: "travel", score: 66.12, reason: "supports plan" },
      candidates: [{ action: "raid", score: 61.4 }],
    },
  };

  assert.equal(
    eventPayloadVisible(world, commander, decision),
    false,
    "capturing a port must not reveal the private motives of everyone standing in it",
  );
  const projected = projectEvent(world, commander, decision, "rich summary");
  assert.equal(projected.data, null);
  assert.equal(projected.payloadWithheld, true);
  assert.ok(
    !String(projected.summary).includes("reinforce"),
    "the neutralised summary must not carry the withheld intent",
  );
});

test("a faction peer's decision payload is withheld just as their plan field is", () => {
  const { world, commander } = fixture();
  const factionPeer = peer(world, commander);
  makeUnobserved(factionPeer);

  // The character projection withholds a peer's motive...
  assert.equal(project(world, commander, factionPeer).plan, null);

  // ...so the event feed must not hand the same information back.
  const decision: SimEvent = {
    sequence: 1,
    tick: 0,
    type: "decision-made",
    actorId: factionPeer.id,
    data: { planIntent: "quietly reposition", activeLongTermGoalId: "goal-secret" },
  };
  assert.equal(
    eventPayloadVisible(world, commander, decision),
    false,
    "the feed must never be more permissive than the character projection",
  );
});

test("unattributed settlement events still follow control of the ground", () => {
  const { world, commander } = fixture();
  const owned = Object.values(world.settlements).find(
    (settlement) => settlement.factionId === commander.factionId,
  );
  const foreign = Object.values(world.settlements).find(
    (settlement) => settlement.factionId !== commander.factionId,
  );
  assert.ok(owned, "expected an owned settlement");
  assert.ok(foreign, "expected a foreign settlement");

  const production: SimEvent = {
    sequence: 1,
    tick: 0,
    type: "settlement-produced",
    settlementId: owned.id,
    data: { focus: "provisions", stocks: { provisions: 12 } },
  };
  assert.equal(
    eventPayloadVisible(world, commander, production),
    true,
    "the commander's own settlement administration is theirs to read",
  );
  assert.deepEqual(projectEvent(world, commander, production, "rich").data, production.data);

  const foreignProduction: SimEvent = { ...production, sequence: 2, settlementId: foreign.id };
  assert.equal(eventPayloadVisible(world, commander, foreignProduction), false);
});

test("a contract's price is visible only to the two parties", () => {
  const { world, commander } = fixture();
  const carrier = world.characters["character-17"];
  assert.equal(carrier.name, "Zara Gale");
  assert.notEqual(carrier.factionId, commander.factionId);
  const price = 41;
  world.contracts = {
    "command-00001:contract": {
      id: "command-00001:contract",
      buyerId: commander.id,
      carrierId: carrier.id,
      good: "provisions",
      quantity: 10,
      destinationId: "crown-harbor",
      price,
      escrow: price,
      settled: false,
      deadlineTick: 12,
      issuedTick: 0,
      acceptedTick: null,
      status: "offered",
      revision: 1,
      observedTick: 0,
    },
  };
  const contract = world.contracts["command-00001:contract"];

  const own = projectSupplyContracts(world, commander);
  assert.equal(own.length, 1);
  assert.equal(own[0].source, "own-character");
  assert.equal(own[0].price, price);
  assert.equal(own[0].quantity, 10);
  assert.equal(own[0].escrow, price);
  assert.equal(own[0].destinationId, "crown-harbor");
  assert.equal(own[0].status, "offered");
  assert.equal(own[0].ageTicks, 0);
  const carrierView = projectSupplyContracts(world, carrier);
  assert.equal(carrierView[0].source, "own-character");
  assert.equal(carrierView[0].price, price);

  const mate = peer(world, commander);
  makeUnobserved(mate);
  assert.equal(mate.factionId, commander.factionId);
  assert.notEqual(mate.id, commander.id);
  const reported = projectSupplyContracts(world, mate);
  assert.equal(reported.length, 1);
  assert.equal(reported[0].source, "faction-report");
  assert.equal(reported[0].status, "offered");
  assert.equal(reported[0].destinationId, "crown-harbor");
  assert.equal(reported[0].price, null);
  assert.equal(reported[0].quantity, null);
  assert.equal(reported[0].escrow, null);
  const beforeEdit = JSON.stringify(reported);
  contract.price = 99;
  contract.escrow = 99;
  contract.quantity = 50;
  assert.equal(JSON.stringify(projectSupplyContracts(world, mate)), beforeEdit);
  contract.price = price;
  contract.escrow = price;
  contract.quantity = 10;

  const bystander = world.characters["character-23"];
  assert.equal(bystander.factionId, null);
  makeUnobserved(bystander);
  assert.deepEqual(projectSupplyContracts(world, bystander), []);

  bystander.locationId = "crown-harbor";
  carrier.locationId = "crown-harbor";
  carrier.travel = null;
  const live = project(world, bystander, carrier);
  assert.equal(live.intelligence.tier, "co-located");
  assert.equal(live.money, round(carrier.money, 2));
  assert.deepEqual(projectSupplyContracts(world, bystander), []);

  const offered: SimEvent = {
    sequence: 1,
    tick: 0,
    type: "contract-offered",
    actorId: commander.id,
    targetId: carrier.id,
    settlementId: "crown-harbor",
    data: {
      buyerId: commander.id,
      carrierId: carrier.id,
      price,
      quantity: 10,
      escrow: price,
      destinationId: "crown-harbor",
      contract,
    },
  };
  assert.equal(world.settlements["crown-harbor"].factionId, mate.factionId);
  assert.equal(eventPayloadVisible(world, commander, offered), true);
  assert.equal(eventPayloadVisible(world, carrier, offered), true);
  assert.equal(eventPayloadVisible(world, mate, offered), false);
  assert.equal(eventPayloadVisible(world, bystander, offered), false);
  const withheld = projectEvent(
    world,
    mate,
    offered,
    `${commander.name} offered ${price} to land 10 provisions at Crown Harbor.`,
  );
  assert.equal(withheld.payloadWithheld, true);
  assert.equal(withheld.data, null);
  assert.equal(withheld.summary, `${commander.name} offered a contract.`);
  assert.equal(String(withheld.summary).includes(String(price)), false);

  const view = dashboardState(world, [], fullEventFeed([])) as { contracts: Array<{ price: number | null }> };
  assert.equal(view.contracts.length, 1);
  assert.equal(view.contracts[0].price, price);
});

test("own-faction rows include the scarred loyalty and a rival row leaves it null", () => {
  const { world, commander } = fixture();
  const mate = peer(world, commander);
  const stranger = rival(world, commander);
  mate.loyaltyAdjustment = -0.04;
  stranger.loyaltyAdjustment = -0.08;
  commander.loyaltyAdjustment = -0.04;

  const projectedMate = project(world, commander, mate);
  const projectedSelf = project(world, commander, commander);
  const projectedRival = project(world, commander, stranger);
  assert.equal(projectedMate.loyalty, round(mate.personality.loyalty - 0.04, 3));
  assert.equal(projectedMate.personality, null);
  assert.equal(projectedSelf.loyalty, round(commander.personality.loyalty - 0.04, 3));
  assert.equal((projectedSelf.personality as { loyalty: number }).loyalty, commander.personality.loyalty);
  assert.notEqual(projectedSelf.loyalty, commander.personality.loyalty);
  assert.equal(projectedRival.loyalty, null);
  assert.equal(projectedRival.personality, null);

  const factions = projectFactions(world, commander) as unknown as ProjectedFaction[];
  const rivalFaction = factions.find((faction) => faction.id !== commander.factionId);
  assert.ok(rivalFaction);
  assert.equal(rivalFaction.treasury, null);
  assert.equal(rivalFaction.power, null);
});
