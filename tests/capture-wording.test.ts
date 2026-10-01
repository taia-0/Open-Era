import assert from "node:assert/strict";
import test from "node:test";
import { dashboardState, fullEventFeed, projectEventFeed } from "../src/dashboard/view-model.ts";
import { outOfStretchFor, projectCharacter, projectFactions, seaSightingsFor } from "../src/dashboard/visibility.ts";
import {
  captivityReleasedChronicle,
  characterCapturedChronicle,
  characterCapturedSentence,
  higherScoreClause,
} from "../src/dashboard/wording.ts";
import { runTicks } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { round, stateHash } from "../src/sim/state.ts";
import type { Character, SimEvent, WorldState } from "../src/sim/types.ts";

function commanderOf(world: WorldState): Character {
  return world.characters[world.players["prototype-player"].characterId];
}

function sail(
  character: Character,
  fromId: string,
  toId: string,
  totalTicks: number,
  remainingTicks: number,
): void {
  character.locationId = null;
  character.captivity = null;
  character.travel = { fromId, toId, totalTicks, remainingTicks };
}

function event(partial: Partial<SimEvent> & Pick<SimEvent, "type">): SimEvent {
  return {
    sequence: partial.sequence ?? 1,
    tick: partial.tick ?? 0,
    type: partial.type,
    actorId: partial.actorId,
    targetId: partial.targetId,
    settlementId: partial.settlementId,
    data: partial.data ?? {},
  };
}

test("the view derives the commander's name and leaves the stored string", () => {
  const world = createPrototypeWorld(1847);
  const before = stateHash(world);
  const view = dashboardState(world, [], fullEventFeed([])) as {
    player: { displayName: string };
  };
  assert.equal(view.player.displayName, "Mara Vane");
  assert.equal(world.players["prototype-player"].displayName, "Prototype Commander");
  assert.equal(stateHash(world), before);
});

test("a capture names the captor, and an outscore row does not say outscore", () => {
  const world = createPrototypeWorld(4096);
  const commander = commanderOf(world);
  const battle = event({
    sequence: 59635,
    tick: 475,
    type: "battle-resolved",
    actorId: "character-14",
    settlementId: "glassport",
    data: {
      battleId: "glassport-battle",
      outcome: "attacker-victory",
      attackerTroops: 219,
      attackerHealth: 96.08,
      attackerMorale: 3,
      defenderGarrison: 6,
      attackerScore: 511.279,
      defenderScore: 26.305,
    },
  });
  const capture = event({
    sequence: 59637,
    tick: 475,
    type: "character-captured",
    actorId: "character-11",
    targetId: "free-tide",
    settlementId: "glassport",
    data: {
      battleId: "glassport-battle",
      cause: "outscore-loss",
      captivity: { captorFactionId: "free-tide" },
    },
  });
  const siblings = [battle, capture];
  assert.equal(
    characterCapturedSentence(world, capture, siblings),
    "Free Tide Compact took Rook Tern on the dock at Glassport after Pax Ash won there on a higher score",
  );
  assert.equal(
    characterCapturedSentence(world, capture),
    "Free Tide Compact took Rook Tern on the dock at Glassport after the attacker won there on a higher score",
  );
  assert.equal(
    characterCapturedChronicle(world, capture, siblings),
    "**Free Tide Compact** took **Rook Tern** on the dock at **Glassport** after **Pax Ash** won there on a higher score; their surviving troops scattered.",
  );
  assert.equal(higherScoreClause(battle.data), " on a higher score");

  const feed = projectEventFeed(world, commander.id, siblings);
  const battleRow = feed.find((row) => row.sequence === 59635);
  const captureRow = feed.find((row) => row.sequence === 59637);
  assert.equal(battleRow?.payloadWithheld, true);
  assert.equal(battleRow?.data, null);
  assert.equal(battleRow?.summary, "Pax Ash won the fight at Glassport on a higher score, after morale gave out.");
  assert.equal(captureRow?.payloadWithheld, true);
  assert.equal(captureRow?.data, null);
  assert.equal(
    captureRow?.summary,
    "Free Tide Compact took Rook Tern on the dock at Glassport after Pax Ash won there on a higher score",
  );
  assert.equal(String(captureRow?.summary).includes("outscore"), false);

  const standing = { ...battle.data, attackerMorale: 13 };
  assert.equal(higherScoreClause(standing), "");
});

test("other capture causes name the captor and keep the cause words", () => {
  const world = createPrototypeWorld(2718);
  const retreat = event({
    type: "character-captured",
    actorId: "character-01",
    targetId: "free-tide",
    settlementId: "cinder-key",
    data: { cause: "failed-retreat", captivity: { captorFactionId: "free-tide" } },
  });
  assert.equal(
    characterCapturedSentence(world, retreat),
    "Free Tide Compact took Mara Vane at Cinder Key after failed retreat",
  );
  const defeat = event({
    type: "character-captured",
    actorId: "character-20",
    targetId: "world-government",
    settlementId: "glassport",
    data: { cause: "major-defeat" },
  });
  assert.equal(
    characterCapturedSentence(world, defeat),
    "World Government took Dax Pike at Glassport after major defeat",
  );
});

test("a withheld release keeps the payment, and loyalty fell only when the debt is unpaid", () => {
  const world = createPrototypeWorld(1847);
  const commander = commanderOf(world);
  const sable = event({
    sequence: 13680,
    type: "captivity-released",
    actorId: "character-04",
    settlementId: "cinder-key",
    data: { terms: { moneyPaid: 13.4, debtValue: 103.21 } },
  });
  const lio = event({
    sequence: 74787,
    type: "captivity-released",
    actorId: "character-12",
    settlementId: "glassport",
    data: { terms: { moneyPaid: 126.63, debtValue: 0 } },
  });
  const feed = projectEventFeed(world, commander.id, [sable, lio]);
  assert.equal(feed[0]?.payloadWithheld, true);
  assert.equal(feed[0]?.data, null);
  assert.equal(
    feed[0]?.summary,
    "Sable Morrow was released from Cinder Key. 13.4 was paid and 103.21 was recorded as debt. Loyalty fell.",
  );
  assert.equal(
    feed[1]?.summary,
    "Lio Crow was released from Glassport. 126.63 was paid and 0 was recorded as debt.",
  );
});

test("the holder's release names the seat she returns to", () => {
  const world = createPrototypeWorld(1847);
  const release = event({
    type: "captivity-released",
    actorId: "character-01",
    settlementId: "crown-harbor",
    data: { terms: { moneyPaid: 108, debtValue: 72.25 } },
  });
  const [row] = projectEventFeed(world, "character-01", [release]);
  assert.equal(row?.payloadWithheld, false);
  assert.equal(
    row?.summary,
    "Mara Vane was released from Crown Harbor. 108 was paid and 72.25 was recorded as debt. Loyalty fell. Mara Vane holds the seat of World Government again.",
  );
});

test("the escape card names the capture risk, and the seat line names the cover", () => {
  const world = createPrototypeWorld(1847);
  const commander = commanderOf(world);
  commander.captivity = {
    captorFactionId: "free-tide",
    settlementId: "cinder-key",
    capturedTick: world.tick,
    mandatoryReleaseTick: world.tick + 83,
    cause: "failed-retreat",
    displayedRisk: "low",
    scatteredTroops: { ...commander.troops },
    releaseDestinationId: "crown-harbor",
  };
  const view = dashboardState(world, [], fullEventFeed([])) as {
    briefing: { items: Array<{ id: string; summary: string }> };
    captivity: { active: { cause: string; causeLabel: string | null } };
    factions: Array<{ id: string; seatSummary: string | null; actingCommanderId: string | null }>;
  };
  const card = view.briefing.items.find((item) => item.id.startsWith("captivity:"));
  assert.ok(card);
  assert.match(card.summary, /Escape always works, and it wounds you\. The capture risk was low\./);
  assert.equal(card.summary.includes("dangerous"), false);
  assert.equal(view.captivity.active.cause, "failed-retreat");
  assert.equal(view.captivity.active.causeLabel, null);

  world.factions["world-government"].actingCommanderId = "character-06";
  const covered = (projectFactions(world, commander) as Array<{ id: string; seatSummary: string | null }>)
    .find((faction) => faction.id === "world-government");
  assert.equal(
    covered?.seatSummary,
    "Iris Stone covers Mara Vane's seat in World Government while Mara Vane is held. The orders stay Mara Vane's.",
  );
  assert.equal(stateHash(world) !== "", true);
});

test("an outscore hold keeps the stored cause and adds the plain label", () => {
  const world = createPrototypeWorld(1847);
  const commander = commanderOf(world);
  const before = stateHash(world);
  commander.captivity = {
    captorFactionId: "free-tide",
    settlementId: "glassport",
    capturedTick: 1,
    mandatoryReleaseTick: 80,
    cause: "outscore-loss",
    displayedRisk: "low",
    scatteredTroops: { ...commander.troops },
    releaseDestinationId: null,
  };
  const view = dashboardState(world, [], fullEventFeed([])) as {
    captivity: { active: { cause: string; causeLabel: string | null } };
  };
  const card = projectCharacter(world, commander, commander);
  const hold = card.captivity as { cause: string; causeLabel: string | null };
  assert.equal(hold.cause, "outscore-loss");
  assert.equal(hold.causeLabel, "taken on the dock after the other side won on a higher score");
  assert.equal(view.captivity.active.cause, "outscore-loss");
  assert.equal(view.captivity.active.causeLabel, hold.causeLabel);
  assert.equal(commander.captivity.cause, "outscore-loss");
  commander.captivity = null;
  assert.equal(stateHash(world), before);
});

test("the commander's card says which loyalty figure the seat reads", () => {
  const world = createPrototypeWorld(1847);
  const commander = commanderOf(world);
  const plain = projectCharacter(world, commander, commander);
  const seed = commander.personality.loyalty;
  const rounded = round(seed, 3);
  assert.equal(
    plain.loyaltyNote,
    `The seat reads ${rounded}. That rounded figure is the one the seat uses.`,
  );
  assert.equal(/\d+\.\d{4,}/.test(String(plain.loyaltyNote)), false);
  commander.loyaltyAdjustment = -0.04;
  const scarred = projectCharacter(world, commander, commander);
  assert.equal(
    scarred.loyaltyNote,
    `The seat reads ${round(seed + -0.04, 3)}. That rounded figure is the one the seat uses.`,
  );
  assert.equal(/\d+\.\d{4,}/.test(String(scarred.loyaltyNote)), false);
  const mate = world.characters["character-05"];
  assert.equal(projectCharacter(world, commander, mate).loyaltyNote, null);
  assert.equal(commander.personality.loyalty, seed);
});

test("a withheld skill says so, and a docked card says the hold was learned", () => {
  const world = createPrototypeWorld(1847);
  const commander = commanderOf(world);
  const pax = world.characters["character-14"];
  sail(pax, "cinder-key", "verdant-cay", 4, 3);
  commander.locationId = null;
  commander.travel = { fromId: "crown-harbor", toId: "glassport", totalTicks: 4, remainingTicks: 3 };
  const distant = projectCharacter(world, commander, pax);
  assert.equal(distant.skills, null);
  assert.equal(
    distant.skillsNote,
    "Pax Ash's leadership is withheld on this card. The reading is distant (reputation), so skills stay off the card.",
  );

  commander.travel = null;
  commander.locationId = "glassport";
  pax.travel = null;
  pax.locationId = "glassport";
  const learned = projectCharacter(world, commander, pax);
  assert.equal(learned.skillsNote, null);
  assert.equal(
    learned.conditionNote,
    "Learned at Glassport. The hold and the purse are on this card because both ships are in port.",
  );
  assert.equal(projectCharacter(world, commander, commander).conditionNote, null);
});

test("a sea row carries its sentence, and a ship outside the stretch is named without troops", () => {
  const world = createPrototypeWorld(1847);
  const mara = commanderOf(world);
  const ada = world.characters["character-13"];
  const zara = world.characters["character-17"];
  sail(mara, "crown-harbor", "glassport", 4, 1);
  sail(ada, "crown-harbor", "glassport", 3, 1);
  sail(zara, "crown-harbor", "glassport", 4, 4);
  ada.troops.count = 35;

  const adaRow = seaSightingsFor(world, mara)?.[ada.id];
  assert.ok(adaRow);
  assert.equal(adaRow.kind, "overtaking");
  assert.equal(adaRow.arriving, true);
  assert.equal(
    adaRow.summary,
    "Ada Sorn is overtaking on this route, Crown Harbor to Glassport. Docks at Glassport on this tick. 35 troops, 0 ticks old.",
  );
  const stretch = outOfStretchFor(world, mara);
  assert.ok(stretch);
  const zaraRow = stretch.find((entry) => entry.characterId === zara.id);
  assert.ok(zaraRow);
  assert.equal(
    zaraRow.summary,
    "Zara Gale is on Crown Harbor to Glassport, 4 of 4 ticks left, and is not in the same stretch of water.",
  );
  assert.equal("troops" in zaraRow, false);
  assert.equal(projectCharacter(world, mara, zara).outOfStretch, null);
  mara.travel = null;
  mara.locationId = "crown-harbor";
  assert.equal(outOfStretchFor(world, mara), null);

  sail(mara, "crown-harbor", "glassport", 4, 1);
  const atSea = dashboardState(world, [], fullEventFeed([])) as {
    briefing: { items: Array<{ title: string; summary: string }>; attentionCount: number };
  };
  const lines = atSea.briefing.items.filter((item) => item.title === "A ship was sighted at sea.");
  assert.ok(lines.some((item) => item.summary === adaRow.summary));
});

test("passage is read off the upkeep row, and morale at 0 drops the morale cost", () => {
  const world = createPrototypeWorld(1847);
  const upkeep = event({
    type: "character-upkeep",
    actorId: "character-01",
    data: { passageCost: 3, characterMoney: 102 },
  });
  const [row] = projectEventFeed(world, "character-01", [upkeep]);
  assert.equal(row?.summary, "Mara Vane paid 3 passage. 102 left.");
  const other = projectEventFeed(world, "character-14", [upkeep])[0];
  assert.equal(other?.payloadWithheld, true);
  assert.equal(other?.summary, "Mara Vane's upkeep was recorded.");

  const commander = commanderOf(world);
  commander.cargo.provisions = 0;
  commander.morale = 0;
  const view = dashboardState(world, [], fullEventFeed([])) as {
    briefing: { items: Array<{ id: string; summary: string }>; attentionCount: number; shownCount: number; attentionLabel: string };
  };
  const starving = view.briefing.items.find((item) => item.id === "provision:critical");
  assert.ok(starving);
  assert.match(starving.summary, /Morale is already 0, so the shortage does not lower it/);
  assert.equal(starving.summary.includes("morale "), false);
  const background = view.briefing.shownCount - view.briefing.attentionCount;
  if (background > 0) {
    assert.match(view.briefing.attentionLabel, /background line/);
  } else {
    assert.equal(view.briefing.attentionLabel, `Check-in · ${view.briefing.attentionCount} need attention`);
  }
});

test("Mina Vale's capture on seed 1847 names World Government beside the captor row", () => {
  // Treasury spending moved this capture off seed 2718 tick 72. The balance share moved it to tick 137.
  const result = runTicks(createPrototypeWorld(1847), 138);
  const world = result.state;
  const mara = world.characters["character-01"];
  const mina = world.characters["character-15"];
  const before = stateHash(world);
  const card = projectCharacter(world, mara, mina);
  const intel = card.captiveIntel as {
    leadership: number;
    troops: number;
    partyPower: number;
    ports: unknown[];
    portsNote: string | null;
  };
  assert.equal(intel.leadership, 25);
  assert.equal(intel.troops, 7);
  assert.equal(intel.partyPower, 52.59);
  assert.equal(intel.ports.length, 2);
  assert.equal(intel.portsNote, null);
  assert.equal((card.troops as { count: number }).count, 0);
  assert.equal(card.troopsNote, "0 with Mina Vale; 7 held by World Government. The experience and discipline are the troops now held by World Government.");
  assert.equal(card.skillsNote, null);
  const held = card.captivity as { cause: string; causeLabel: string | null };
  assert.equal(held.cause, "major-defeat");
  assert.equal(held.causeLabel, null);
  assert.equal(projectCharacter(world, mina, mina).captiveIntel, null);

  const capture = result.events.find((item) => item.sequence === 16104);
  assert.ok(capture);
  assert.equal(capture.type, "character-captured");
  assert.equal(capture.tick, 137);
  assert.equal(capture.actorId, "character-15");
  assert.equal(capture.targetId, "world-government");
  const sentence = "World Government took Mina Vale at Crown Harbor after major defeat. 7 troops were taken, power 52.59.";
  const [row] = projectEventFeed(world, mara.id, [capture]);
  assert.equal(row?.payloadWithheld, true);
  assert.equal(row?.data, null);
  assert.equal(row?.summary, sentence);
  const view = dashboardState(world, result.events, fullEventFeed(result.events)) as {
    briefing: { items: Array<{ id: string; title: string; summary: string }> };
  };
  const briefing = view.briefing.items.find((item) => item.id === "event:16104");
  assert.equal(briefing?.title, "A captain was taken");
  assert.equal(briefing?.summary, sentence);
  assert.equal(
    characterCapturedChronicle(world, capture, result.events),
    "**World Government** took **Mina Vale** at **Crown Harbor** after major defeat; their surviving troops scattered.",
  );
  assert.equal(stateHash(world), before);
});

test("a captor row that already shows leadership does not say the skill is withheld", () => {
  // Treasury spending moved Mina Vale's capture off seed 2718 tick 72.
  const world = runTicks(createPrototypeWorld(1847), 138).state;
  const mara = world.characters["character-01"];
  const mina = world.characters["character-15"];
  const foreign = Object.values(world.settlements).find((settlement) => settlement.factionId !== mara.factionId);
  assert.ok(foreign);
  mina.locationId = foreign.id;
  mina.travel = null;
  mara.locationId = null;
  mara.travel = { fromId: "crown-harbor", toId: foreign.id, totalTicks: 3, remainingTicks: 2 };
  const card = projectCharacter(world, mara, mina);
  assert.equal((card.captiveIntel as { leadership: number }).leadership, 25);
  assert.equal(card.skills, null);
  assert.equal(card.skillsNote, null);
});

test("Mina Vale's release at event tick 221 keeps the paid line beside her prison record", () => {
  // Treasury spending moved her release off seed 2718 tick 155. The balance share moved it to tick 221.
  const result = runTicks(createPrototypeWorld(1847), 222);
  const world = result.state;
  const mara = world.characters["character-01"];
  const mina = world.characters["character-15"];
  assert.equal(world.tick, 222);
  assert.equal(mina.captivity, null);
  assert.equal(mina.releaseSighting?.observedTick, 221);
  const before = stateHash(world);
  const own = projectCharacter(world, mina, mina);
  const remembered = own.releaseSighting as { settlementId: string; observedTick: number; garrison: number };
  assert.equal(remembered.settlementId, "crown-harbor");
  assert.equal(remembered.observedTick, 221);
  assert.equal(remembered.garrison, 168);
  assert.equal(projectCharacter(world, mara, mina).releaseSighting, null);
  assert.equal(projectCharacter(world, mara, mina).captiveIntel, null);

  const release = result.events.find((item) => item.sequence === 25615);
  assert.ok(release);
  assert.equal(release.type, "captivity-released");
  assert.equal(release.tick, 221);
  const sentence = "Mina Vale was released from Crown Harbor. 5.31 was paid and 41.7 was recorded as debt. Loyalty fell. 5.31 went to the World Government treasury. The ransom line covers only the ransom.";
  const [maraRow] = projectEventFeed(world, mara.id, [release]);
  assert.equal(maraRow?.payloadWithheld, true);
  assert.equal(maraRow?.data, null);
  assert.equal(maraRow?.summary, sentence);
  const [ownRow] = projectEventFeed(world, mina.id, [release]);
  assert.equal(ownRow?.payloadWithheld, false);
  assert.equal(
    ownRow?.summary,
    "Mina Vale was released from Crown Harbor. 5.31 was paid and 41.7 was recorded as debt. Loyalty fell. 5.31 went to the World Government treasury. The balance is not visible to you. The ransom line covers only the ransom.",
  );
  assert.equal((ownRow?.data as { ransom: { factionTreasury?: number } }).ransom.factionTreasury, undefined);
  const view = dashboardState(world, result.events, fullEventFeed(result.events)) as {
    briefing: { items: Array<{ id: string; summary: string }> };
  };
  assert.equal(view.briefing.items.find((item) => item.id === "event:25615")?.summary, sentence);
  assert.equal(
    captivityReleasedChronicle(world, release),
    "**Mina Vale** was released from **Crown Harbor** under mandatory terms. 5.31 was paid and 41.7 was recorded as debt. Loyalty fell. 5.31 went to the **World Government** treasury. The ransom line covers only the ransom.",
  );
  assert.equal(stateHash(world), before);
});

test("Bram Quill's release at state tick 772 says loyalty fell beside his prison record", () => {
  // Treasury spending moved Sable Morrow's tick 118 release. The balance share moved the debt line to Bram Quill at tick 771.
  const result = runTicks(createPrototypeWorld(1847), 772);
  const world = result.state;
  const mara = world.characters["character-01"];
  const bram = world.characters["character-02"];
  assert.equal(world.tick, 772);
  assert.equal(bram.name, "Bram Quill");
  assert.equal(bram.captivity, null);
  assert.equal(bram.releaseSighting?.observedTick, 771);
  assert.equal(bram.releaseSighting?.settlementId, "cinder-key");
  const before = stateHash(world);
  const own = projectCharacter(world, bram, bram);
  assert.equal((own.releaseSighting as { garrison: number }).garrison, 6);
  assert.equal(projectCharacter(world, mara, bram).releaseSighting, null);

  const release = result.events.find((item) => item.sequence === 99850);
  assert.ok(release);
  assert.equal(release.type, "captivity-released");
  assert.equal(release.tick, 771);
  const sentence = "Bram Quill was released from Cinder Key. 129.67 was paid and 302.99 was recorded as debt. Loyalty fell. 129.67 went to the Free Tide Compact treasury. The balance is not visible to you. The ransom line covers only the ransom.";
  const [maraRow] = projectEventFeed(world, mara.id, [release]);
  assert.equal(maraRow?.payloadWithheld, true);
  assert.equal(maraRow?.data, null);
  assert.equal(maraRow?.summary, sentence);
  const [ownRow] = projectEventFeed(world, bram.id, [release]);
  assert.equal(ownRow?.payloadWithheld, false);
  assert.equal(ownRow?.summary, sentence);
  assert.equal(
    (ownRow?.data as { ransom: { factionTreasury?: number } }).ransom.factionTreasury,
    undefined,
  );
  const view = dashboardState(world, result.events, fullEventFeed(result.events)) as {
    briefing: { items: Array<{ id: string; summary: string }> };
  };
  assert.equal(view.briefing.items.find((item) => item.id === "event:99850")?.summary, sentence);
  assert.equal(
    captivityReleasedChronicle(world, release),
    "**Bram Quill** was released from **Cinder Key** under mandatory terms. 129.67 was paid and 302.99 was recorded as debt. Loyalty fell. 129.67 went to the **Free Tide Compact** treasury. The ransom line covers only the ransom.",
  );
  assert.equal(stateHash(world), before);
});
