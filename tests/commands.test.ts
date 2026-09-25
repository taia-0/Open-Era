import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { submitCommand } from "../src/sim/commands.ts";
import { runTick } from "../src/sim/engine.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";

test("the human-controlled character never receives autonomous decisions", () => {
  const world = createPrototypeWorld(1847);
  const result = runTick(world);
  const playerCharacterId = world.players["prototype-player"].characterId;

  assert.equal(world.characters[playerCharacterId].controller.kind, "human");
  assert.ok(!result.events.some((event) => event.type === "decision-made" && event.actorId === playerCharacterId));
  assert.equal(result.events.filter((event) => event.type === "plan-reconsidered").length, 29);
});

test("a prototype session may assign the human controller to another named character", () => {
  const world = createPrototypeWorld(1847, { playerCharacterId: "character-14" });
  const player = world.players["prototype-player"];
  const commander = world.characters[player.characterId];

  assert.equal(player.characterId, "character-14");
  assert.deepEqual(commander.controller, { kind: "human", playerId: "prototype-player" });
  assert.equal(world.characters["character-01"].controller.kind, "autonomous");
  assert.equal(commander.factionId, "free-tide");
  assert.equal(world.characters[player.reportingOfficerId!].factionId, commander.factionId);
});

test("a validated direct action is queued, executed once, and removed", () => {
  const world = createPrototypeWorld(1847);
  const submission = submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "travel",
    targetId: "verdant-cay",
  });
  assert.equal(submission.ok, true);
  assert.equal(world.pendingCommands.length, 1);

  const result = runTick(world);
  const commander = world.characters[world.players["prototype-player"].characterId];
  assert.equal(world.pendingCommands.length, 0);
  assert.equal(commander.travel?.toId, "verdant-cay");
  assert.equal(result.events.filter((event) => event.type === "player-action-executed").length, 1);
  assert.equal(result.events.filter((event) => event.type === "player-command-resolved").length, 1);
});

test("arrival immediately refreshes the player's local intelligence", () => {
  const world = createPrototypeWorld(1847);
  const commander = world.characters[world.players["prototype-player"].characterId];
  const destination = world.settlements["cinder-key"];
  const submission = submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "travel",
    targetId: destination.id,
  });
  assert.equal(submission.ok, true);

  let arrivalEvents = runTick(world).events;
  while (commander.travel) arrivalEvents = runTick(world).events;

  assert.equal(commander.locationId, destination.id);
  assert.equal(commander.knowledge[destination.id].source, "direct");
  assert.equal(commander.knowledge[destination.id].observedTick, world.tick - 1);
  const observation = arrivalEvents.find((event) => event.type === "knowledge-updated" && event.actorId === commander.id);
  assert.ok(observation);
  assert.equal(
    commander.knowledge[destination.id].garrisonEstimate,
    (observation.data.knowledge as { garrisonEstimate: number }).garrisonEstimate,
  );
});

test("a surrendering settlement can be claimed by the conquering character", () => {
  const world = createPrototypeWorld(1847);
  const commander = world.characters[world.players["prototype-player"].characterId];
  const settlement = world.settlements["cinder-key"];
  commander.locationId = settlement.id;
  settlement.garrison = 12;
  settlement.stability = 24;
  settlement.surrender = {
    offeredToId: commander.id,
    offeredTick: world.tick,
    previousFactionId: "free-tide",
  };

  const submission = submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "claim-settlement",
  });
  assert.equal(submission.ok, true);

  const result = runTick(world);
  const claim = result.events.find((event) => event.type === "settlement-claimed");
  assert.ok(claim);
  assert.equal(claim.actorId, commander.id);
  assert.equal(claim.settlementId, settlement.id);
  assert.equal(claim.data.previousFactionId, "free-tide");
  assert.equal(settlement.ownerId, commander.id);
  assert.equal(settlement.factionId, "world-government");
  assert.equal(settlement.stability, 55);
  assert.equal(world.pendingCommands.length, 0);
});

test("a victory crossing both thresholds offers surrender only to the victor", () => {
  const world = createPrototypeWorld(1847);
  const commander = world.characters[world.players["prototype-player"].characterId];
  const settlement = world.settlements["cinder-key"];
  commander.locationId = settlement.id;
  settlement.garrison = 1;
  settlement.stability = 20;

  const submission = submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "raid",
  });
  assert.equal(submission.ok, true);

  const result = runTick(world);
  const battle = result.events.find((event) =>
    event.type === "battle-resolved" && event.actorId === commander.id
  );
  assert.equal(battle?.data.outcome, "attacker-victory");
  assert.deepEqual(settlement.surrender, {
    offeredToId: commander.id,
    offeredTick: 0,
    previousFactionId: "free-tide",
  });
  assert.equal(settlement.ownerId, null);
});

test("threshold conditions alone do not grant a claim without the victor's surrender offer", () => {
  const world = createPrototypeWorld(1847);
  const commander = world.characters[world.players["prototype-player"].characterId];
  const settlement = world.settlements["cinder-key"];
  commander.locationId = settlement.id;
  settlement.garrison = 10;
  settlement.stability = 20;
  settlement.surrender = null;

  assert.deepEqual(submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "claim-settlement",
  }), {
    ok: false,
    code: "not-surrendering",
    error: "The settlement is not offering surrender to this character",
  });

  settlement.surrender = {
    offeredToId: "character-03",
    offeredTick: world.tick,
    previousFactionId: "free-tide",
  };
  assert.equal(submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "claim-settlement",
  }).ok, false);

  settlement.stability = 30.05;
  settlement.surrender = {
    offeredToId: commander.id,
    offeredTick: world.tick,
    previousFactionId: "free-tide",
  };
  assert.equal(submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "claim-settlement",
  }).ok, true);
});

test("server validation rejects commands outside player authority without mutating state", () => {
  const world = createPrototypeWorld(1847);
  const beforeSequence = world.nextEventSequence;
  const submission = submitCommand(world, {
    playerId: "prototype-player",
    type: "issue-order",
    characterId: "character-14",
    directive: "protect",
    targetId: "crown-harbor",
  });

  assert.deepEqual(submission, {
    ok: false,
    code: "outside-authority",
    error: "The recipient is outside the commander's faction authority",
  });
  assert.equal(world.pendingCommands.length, 0);
  assert.equal(world.nextEventSequence, beforeSequence);
});

test("a delivered standing order immediately enters autonomous plan review", () => {
  const world = createPrototypeWorld(1847);
  const recipient = world.characters["character-04"];
  const submission = submitCommand(world, {
    playerId: "prototype-player",
    type: "issue-order",
    characterId: recipient.id,
    directive: "protect",
    targetId: "glassport",
    priority: 0.97,
    expiresInTicks: 72,
  });
  assert.equal(submission.ok, true);

  const result = runTick(world);
  const issued = result.events.find((event) => event.type === "standing-order-issued" && event.targetId === recipient.id);
  const review = result.events.find((event) => event.type === "plan-reconsidered" && event.actorId === recipient.id);
  assert.ok(issued);
  assert.equal((issued.data.order as { targetId: string }).targetId, "glassport");
  assert.equal((review?.data.orderAssessment as { orderId: string }).orderId, "command-00001:standing-order");
  const order = recipient.standingOrders.find((candidate) => candidate.id === "command-00001:standing-order");
  assert.equal(order?.status, "active");
  assert.equal(order?.adherence, "following");
  assert.ok(result.events.some((event) => event.type === "standing-order-accepted" && event.actorId === recipient.id));
});

test("the issuer confirms a character's completion report before an order closes", () => {
  const world = createPrototypeWorld(1847);
  const firstTick = runTick(world);
  const report = firstTick.events.find((event) =>
    event.type === "standing-order-completion-reported" && event.data.issuerId === "character-01"
  );
  assert.ok(report);
  const recipient = world.characters[report.actorId!];
  const order = recipient.standingOrders.find((candidate) => candidate.id === report.data.orderId)!;
  assert.equal(order.status, "awaiting-confirmation");

  const submission = submitCommand(world, {
    playerId: "prototype-player",
    type: "confirm-order",
    characterId: recipient.id,
    orderId: order.id,
  });
  assert.equal(submission.ok, true);
  const confirmationTick = runTick(world);
  assert.equal(order.status, "completed");
  assert.equal(order.lastReport?.kind, "confirmed");
  assert.ok(confirmationTick.events.some((event) =>
    event.type === "standing-order-completed" && event.data.orderId === order.id
  ));
});

test("an uncompleted timed order expires and no longer drives the character's plan", () => {
  const world = createPrototypeWorld(1847);
  const recipient = world.characters["character-04"];
  const submission = submitCommand(world, {
    playerId: "prototype-player",
    type: "issue-order",
    characterId: recipient.id,
    directive: "protect",
    targetId: "glassport",
    priority: 0.97,
    expiresInTicks: 1,
  });
  assert.equal(submission.ok, true);
  runTick(world);
  const result = runTick(world);
  const order = recipient.standingOrders.find((candidate) => candidate.id === "command-00001:standing-order")!;
  assert.equal(order.status, "expired");
  assert.notEqual(recipient.plan?.orderId, order.id);
  assert.ok(result.events.some((event) => event.type === "standing-order-expired" && event.data.orderId === order.id));
});

test("a major amendment creates a new revision and requires fresh acceptance", () => {
  const world = createPrototypeWorld(1847);
  const recipient = world.characters["character-04"];
  assert.equal(submitCommand(world, {
    playerId: "prototype-player",
    type: "issue-order",
    characterId: recipient.id,
    directive: "protect",
    targetId: "glassport",
    priority: 0.97,
    expiresInTicks: 72,
  }).ok, true);
  runTick(world);
  const orderId = "command-00001:standing-order";

  assert.equal(submitCommand(world, {
    playerId: "prototype-player",
    type: "amend-order",
    characterId: recipient.id,
    orderId,
    directive: "explore",
    targetId: "verdant-cay",
    priority: 0.97,
    expiresInTicks: 72,
  }).ok, true);
  const result = runTick(world);
  const order = recipient.standingOrders.find((candidate) => candidate.id === orderId)!;
  assert.equal(order.revision, 2);
  assert.equal(order.directive, "explore");
  assert.equal(order.targetId, "verdant-cay");
  assert.equal(order.status, "active");
  assert.ok(result.events.some((event) =>
    event.type === "standing-order-amended" && event.data.orderId === orderId && event.data.majorChange === true
  ));
  assert.ok(result.events.some((event) => event.type === "standing-order-accepted" && event.data.orderId === orderId));
});

test("a deadline or priority amendment preserves an accepted objective", () => {
  const world = createPrototypeWorld(1847);
  const recipient = world.characters["character-04"];
  submitCommand(world, {
    playerId: "prototype-player",
    type: "issue-order",
    characterId: recipient.id,
    directive: "protect",
    targetId: "glassport",
    priority: 0.97,
    expiresInTicks: 72,
  });
  runTick(world);
  const orderId = "command-00001:standing-order";

  assert.equal(submitCommand(world, {
    playerId: "prototype-player",
    type: "amend-order",
    characterId: recipient.id,
    orderId,
    priority: 0.88,
    expiresInTicks: 120,
  }).ok, true);
  const result = runTick(world);
  const order = recipient.standingOrders.find((candidate) => candidate.id === orderId)!;
  assert.equal(order.revision, 2);
  assert.equal(order.priority, 0.88);
  assert.equal(order.status, "active");
  assert.ok(result.events.some((event) =>
    event.type === "standing-order-amended" && event.data.orderId === orderId && event.data.majorChange === false
  ));
  assert.ok(!result.events.some((event) => event.type === "standing-order-accepted" && event.data.orderId === orderId));
});

test("an issuer may cancel an open order but cannot modify another character's order", () => {
  const world = createPrototypeWorld(1847);
  const recipient = world.characters["character-04"];
  submitCommand(world, {
    playerId: "prototype-player",
    type: "issue-order",
    characterId: recipient.id,
    directive: "protect",
    targetId: "glassport",
    priority: 0.97,
    expiresInTicks: 72,
  });
  runTick(world);
  const orderId = "command-00001:standing-order";
  assert.equal(submitCommand(world, {
    playerId: "prototype-player",
    type: "cancel-order",
    characterId: recipient.id,
    orderId,
  }).ok, true);
  const result = runTick(world);
  const order = recipient.standingOrders.find((candidate) => candidate.id === orderId)!;
  assert.equal(order.status, "cancelled");
  assert.notEqual(recipient.plan?.orderId, order.id);
  assert.ok(result.events.some((event) => event.type === "standing-order-cancelled" && event.data.orderId === order.id));

  const foreignOrder = world.characters["character-15"].standingOrders[0];
  assert.deepEqual(submitCommand(world, {
    playerId: "prototype-player",
    type: "amend-order",
    characterId: "character-15",
    orderId: foreignOrder.id,
    priority: 1,
  }), {
    ok: false,
    code: "not-issuer",
    error: "Only the character who issued an order may change it",
  });
});

test("an accepted command survives restart and resolves after event replay", () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-command-"));
  const path = join(directory, "world.sqlite");
  try {
    const world = createPrototypeWorld(808);
    const store = new WorldStore(path);
    store.initialize(world);
    const submission = submitCommand(world, {
      playerId: "prototype-player",
      type: "character-action",
      action: "work",
    });
    assert.equal(submission.ok, true);
    if (submission.ok) store.appendTick([submission.event], world);
    store.close();

    const reopened = new WorldStore(path);
    const recovered = reopened.recover().state;
    assert.equal(recovered.pendingCommands.length, 1);
    const result = runTick(recovered);
    reopened.appendTick(result.events, recovered);
    assert.equal(recovered.pendingCommands.length, 0);
    assert.ok(result.events.some((event) => event.type === "player-command-resolved"));
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("schema-3 saves without lifecycle fields recover with pending legacy orders", () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-order-migration-"));
  const path = join(directory, "world.sqlite");
  try {
    const world = createPrototypeWorld(1847);
    const legacyWorld = world as unknown as Record<string, unknown>;
    legacyWorld.version = 3;
    delete legacyWorld.activeBattles;
    for (const character of Object.values(world.characters)) {
      for (const order of character.standingOrders) {
        const legacy = order as unknown as Record<string, unknown>;
        delete legacy.status;
        delete legacy.adherence;
        delete legacy.statusChangedTick;
        delete legacy.deviationCount;
        delete legacy.lastReport;
        delete legacy.revision;
      }
    }
    const legacyPlayer = world.players["prototype-player"] as unknown as Record<string, unknown>;
    delete legacyPlayer.briefingAcknowledgements;
    delete legacyPlayer.routineBriefingThroughSequence;
    delete legacyPlayer.reportingOfficerId;
    const store = new WorldStore(path);
    store.initialize(world);
    store.close();

    const reopened = new WorldStore(path);
    const recovered = reopened.recover().state;
    assert.equal(recovered.version, 4);
    assert.deepEqual(recovered.activeBattles, {});
    const orders = Object.values(recovered.characters).flatMap((character) => character.standingOrders);
    assert.ok(orders.length > 0);
    assert.ok(orders.every((order) =>
      order.status === "pending" &&
      order.adherence === "unassessed" &&
      order.revision === 1 &&
      order.deviationCount === 0 &&
      order.lastReport === null
    ));
    assert.deepEqual(recovered.players["prototype-player"].briefingAcknowledgements, {});
    assert.equal(recovered.players["prototype-player"].routineBriefingThroughSequence, 0);
    assert.equal(recovered.players["prototype-player"].reportingOfficerId, null);
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
