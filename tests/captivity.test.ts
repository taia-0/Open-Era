import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { dashboardState, fullEventFeed } from "../src/dashboard/view-model.ts";
import { projectCharacter } from "../src/dashboard/visibility.ts";
import { captureChanceForRisk } from "../src/sim/combat.ts";
import { submitCommand } from "../src/sim/commands.ts";
import {
  createConversationThread,
  DeterministicDialogueProvider,
  resolveDueReplies,
  sendConversationMessage,
} from "../src/sim/conversations.ts";
import { runTick } from "../src/sim/engine.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { eventStory } from "../src/sim/reports.ts";
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
    error: "Only an escape attempt or response to open release terms is available while the character is captive",
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

async function persuadeCaptor(world: WorldState): Promise<string> {
  const commander = world.characters[world.players["prototype-player"].characterId];
  const negotiatorId = commander.captivity?.negotiation.negotiatorId;
  assert.ok(negotiatorId);
  const created = createConversationThread(world, {
    playerId: "prototype-player",
    kind: "direct",
    participantIds: [negotiatorId],
  });
  assert.equal(created.ok, true);
  const bodies = [
    "Please open release negotiations. I can pay a ransom and honor the debt.",
    "I appreciate your duty. Could we discuss fair terms for my release?",
    "Please negotiate my freedom. A peaceful agreement benefits both factions.",
    "I am asking for clear release terms and will honor a lawful debt.",
  ];
  for (const body of bodies) {
    const sent = sendConversationMessage(world, {
      playerId: "prototype-player",
      threadId: created.value.id,
      body,
    });
    assert.equal(sent.ok, true);
    const dueTick = sent.value.replies[0].dueTick;
    while (world.tick < dueTick) runTick(world);
    await resolveDueReplies(world, new DeterministicDialogueProvider());
    if (commander.captivity?.negotiation.offer) return created.value.id;
  }
  assert.fail("the local authority should open negotiations after several credible messages");
}

test("capture assigns a local authority whose qualitative stance changes through messages", async () => {
  const world = forceRetreatCapture();
  const commander = world.characters[world.players["prototype-player"].characterId];
  const negotiatorId = commander.captivity?.negotiation.negotiatorId;
  assert.ok(negotiatorId);
  assert.equal(world.characters[negotiatorId].factionId, commander.captivity?.captorFactionId);
  const availableLocals = Object.values(world.characters).filter((character) =>
    character.controller.kind === "autonomous" &&
    character.factionId === commander.captivity?.captorFactionId &&
    character.locationId === commander.captivity?.settlementId
  );
  if (availableLocals.length > 0) {
    assert.equal(world.characters[negotiatorId].locationId, commander.captivity?.settlementId);
  }
  assert.ok(world.players["prototype-player"].knownCharacterIds.includes(negotiatorId));

  const bystanderId = world.players["prototype-player"].knownCharacterIds.find((id) =>
    id !== commander.id && id !== negotiatorId && world.characters[id]?.controller.kind === "autonomous"
  );
  assert.ok(bystanderId);
  const bystanderThread = createConversationThread(world, {
    playerId: "prototype-player",
    kind: "direct",
    participantIds: [bystanderId],
  });
  assert.equal(bystanderThread.ok, true);
  const misplacedRequest = sendConversationMessage(world, {
    playerId: "prototype-player",
    threadId: bystanderThread.value.id,
    body: "Please arrange my release and negotiate ransom terms.",
  });
  assert.equal(misplacedRequest.ok, true);
  while (world.tick < misplacedRequest.value.replies[0].dueTick) runTick(world);
  await resolveDueReplies(world, new DeterministicDialogueProvider());
  assert.equal(commander.captivity?.negotiation.persuasion, 0);

  await persuadeCaptor(world);
  const negotiation = commander.captivity?.negotiation;
  assert.equal(negotiation?.status, "open");
  assert.ok(negotiation?.offer);
  assert.ok(negotiation.offer.demandedValue <= negotiation.offer.systemMaximum);

  const view = dashboardState(world, [], fullEventFeed([])) as {
    captivity: {
      active: {
        negotiation: Record<string, unknown> & { offer: Record<string, unknown> };
      };
    };
  };
  assert.equal(view.captivity.active.negotiation.status, "open");
  assert.equal("persuasion" in view.captivity.active.negotiation, false);
  assert.equal("attempts" in view.captivity.active.negotiation, false);
  assert.equal("systemMaximum" in view.captivity.active.negotiation.offer, false);

  const observer = world.characters[negotiatorId];
  observer.locationId = commander.locationId;
  observer.travel = null;
  const foreignProjection = projectCharacter(world, observer, commander) as {
    captivity: { negotiation: unknown };
  };
  assert.equal(foreignProjection.captivity.negotiation, null);
});

test("one structured counter is validated and an acceptable counter releases the captive", async () => {
  const world = forceRetreatCapture();
  const commander = world.characters[world.players["prototype-player"].characterId];
  await persuadeCaptor(world);
  const offer = commander.captivity!.negotiation.offer!;
  const submitted = submitCommand(world, {
    playerId: "prototype-player",
    type: "respond-captivity-offer",
    offerId: offer.id,
    response: "counter",
    counterValue: offer.demandedValue,
  });
  assert.equal(submitted.ok, true);
  const result = runTick(world);
  const release = result.events.find((event) => event.type === "captivity-released");
  assert.ok(release);
  assert.equal(release.data.reason, "negotiated-counter");
  assert.match(eventStory(world, release)!, /after a negotiated counter/);
  assert.doesNotMatch(eventStory(world, release)!, /mandatory/);
  assert.equal(commander.captivity, null);
});

test("a rejected low counter cannot be repeated against the same offer", async () => {
  const world = forceRetreatCapture();
  const commander = world.characters[world.players["prototype-player"].characterId];
  await persuadeCaptor(world);
  const offer = commander.captivity!.negotiation.offer!;
  assert.equal(submitCommand(world, {
    playerId: "prototype-player",
    type: "respond-captivity-offer",
    offerId: offer.id,
    response: "counter",
    counterValue: 0,
  }).ok, true);
  const result = runTick(world);
  assert.ok(result.events.some((event) => event.type === "captivity-counter-rejected"));
  assert.equal(commander.captivity?.negotiation.offer?.countered, true);
  assert.deepEqual(submitCommand(world, {
    playerId: "prototype-player",
    type: "respond-captivity-offer",
    offerId: offer.id,
    response: "counter",
    counterValue: 1,
  }), {
    ok: false,
    code: "counter-already-used",
    error: "This offer has already received its one counterproposal",
  });
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
