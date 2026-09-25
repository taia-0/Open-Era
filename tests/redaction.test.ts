import assert from "node:assert/strict";
import test from "node:test";
import { dashboardState } from "../src/dashboard/view-model.ts";
import {
  characterVisibilityTier,
  eventPayloadVisible,
  projectCharacter,
  projectEvent,
  projectFactions,
  visibleStandingOrders,
} from "../src/dashboard/visibility.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { round, stateHash } from "../src/sim/state.ts";
import type { Character, SimEvent, WorldState } from "../src/sim/types.ts";

interface ProjectedIntelligence {
  tier: string;
  source: string;
  conditionExact: boolean;
  capabilityExact: boolean;
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
  assert.deepEqual(projected.knowledge, commander.knowledge);
  assert.deepEqual(projected.personality, commander.personality);
  assert.deepEqual(projected.standingOrders, commander.standingOrders);
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
  assert.deepEqual(projected.troops, companion.troops);
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

  const projected = project(world, commander, outsider);
  assert.equal(projected.intelligence.tier, "co-located");
  assert.deepEqual(projected.troops, outsider.troops);
  assert.equal(projected.plan, null, "territory reveals presence, not motive");
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
    // Names and colours survive because the map and order targets need them.
    assert.equal(typeof faction.name, "string");
    assert.equal(typeof faction.color, "string");
  }
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
  dashboardState(world, []);
  assert.equal(
    stateHash(world),
    before,
    "redaction must be a read-only projection, not a change to authoritative state",
  );
});
