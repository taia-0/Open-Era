import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { dashboardState, fullEventFeed, projectEventFeed } from "../src/dashboard/view-model.ts";
import { characterIntelligence, projectCharacter, projectEvent, troopQualityBand } from "../src/dashboard/visibility.ts";
import { wholeNumberReached } from "../src/dashboard/wording.ts";
import { submitCommand } from "../src/sim/commands.ts";
import { runTick } from "../src/sim/engine.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { practicedSkill, round, stateHash } from "../src/sim/state.ts";
import type { Character, SimEvent, WorldState } from "../src/sim/types.ts";

const PLAYER = "prototype-player";

function maraOf(world: WorldState): Character {
  return world.characters[world.players[PLAYER].characterId];
}

function workedSummary(world: WorldState, actorId: string): string {
  const tickEvents = runTick(world).events;
  const worked = tickEvents.find((event) => event.type === "worked" && event.actorId === actorId);
  assert.ok(worked);
  const [row] = projectEventFeed(world, maraOf(world).id, [worked]);
  return String(row.summary);
}

test("every 3-decimal skill reports a crossing only when the step crossed", () => {
  let failures = 0;
  let sample = "";
  for (let milli = 0; milli <= 100_000; milli += 1) {
    const previous = round(milli / 1000, 3);
    const next = practicedSkill(previous);
    const nextWhole = Math.floor(round(next, 3) + 1e-9);
    const previousWhole = Math.floor(round(previous, 3) + 1e-9);
    const actual = nextWhole > previousWhole ? nextWhole : null;
    const got = wholeNumberReached(next);
    if (got !== actual) {
      failures += 1;
      if (!sample) sample = `${previous} -> ${next} actual ${actual} got ${got}`;
    }
  }
  assert.equal(failures, 0, sample);
});

test("a work that stays inside the whole number adds no skill line", () => {
  const world = createPrototypeWorld(1847);
  const mara = maraOf(world);
  assert.equal(mara.skills.trade, 57);
  assert.equal(mara.skills.leadership, 77);
  const before = stateHash(world);
  assert.equal(submitCommand(world, { playerId: PLAYER, type: "character-action", action: "work" }).ok, true);
  const tick = runTick(world);
  const worked = tick.events.find((event) => event.type === "worked" && event.actorId === mara.id);
  assert.ok(worked);
  assert.equal(worked.data.trade, 57.043);
  assert.equal(worked.data.leadership, 77.023);
  assert.equal(wholeNumberReached(57.043), null);
  assert.equal(wholeNumberReached(77.023), null);
  const hashAfterTick = stateHash(world);
  const [row] = projectEventFeed(world, mara.id, [worked]);
  assert.equal(row.summary, "Mara Vane worked at Crown Harbor. Tax of 2.82 went to the treasury.");
  assert.equal(row.payloadWithheld, false);
  assert.equal(String(row.summary).includes("rose"), false);
  assert.equal(stateHash(world), hashAfterTick);
  assert.notEqual(hashAfterTick, before);
  assert.equal(tick.events.some((event) => event.type.includes("skill")), false);
});

test("a stored skill that crosses a whole number says so once", () => {
  const world = createPrototypeWorld(1847);
  const mara = maraOf(world);
  mara.skills.trade = 57.96;
  assert.equal(practicedSkill(57.96), 58.002);
  assert.equal(wholeNumberReached(58.002), 58);
  assert.equal(submitCommand(world, { playerId: PLAYER, type: "character-action", action: "work" }).ok, true);
  const tick = runTick(world);
  const worked = tick.events.find((event) => event.type === "worked" && event.actorId === mara.id);
  assert.ok(worked);
  assert.equal(worked.data.trade, 58.002);
  assert.equal(worked.type, "worked");
  const [row] = projectEventFeed(world, mara.id, [worked]);
  assert.match(String(row.summary), /Mara Vane worked at Crown Harbor\./);
  assert.match(String(row.summary), /Mara Vane's trade rose to 58\.$/);
  assert.equal(String(row.summary).includes("58.002"), false);
  assert.equal(String(row.summary).includes("leadership rose"), false);
  assert.equal(mara.skills.trade, 58.002);
});

test("two skills crossing on one work are two sentences", () => {
  const world = createPrototypeWorld(1847);
  const mara = maraOf(world);
  mara.skills.leadership = 57.96;
  mara.skills.trade = 63.97;
  assert.equal(practicedSkill(63.97), 64.006);
  assert.equal(submitCommand(world, { playerId: PLAYER, type: "character-action", action: "work" }).ok, true);
  const summary = workedSummary(world, mara.id);
  assert.match(summary, /Mara Vane's leadership rose to 58\. Mara Vane's trade rose to 64\.$/);
  assert.equal(summary.includes("navigation rose"), false);
  assert.equal(summary.includes("strategy rose"), false);
});

test("a hidden character's crossing stays off the feed, and a faction mate's does not", () => {
  const world = createPrototypeWorld(1847);
  const mara = maraOf(world);
  const hidden = world.characters["character-25"];
  hidden.locationId = "glassport";
  hidden.travel = null;
  hidden.factionId = null;
  const mate = world.characters["character-10"];
  mate.locationId = "verdant-cay";
  mate.travel = null;
  assert.equal(mate.factionId, "world-government");
  assert.equal(characterIntelligence(world, mara, hidden).capabilityExact, false);
  assert.equal(characterIntelligence(world, mara, mate).capabilityExact, true);
  assert.equal(characterIntelligence(world, mara, mate).tier, "faction");

  const data = {
    leadership: practicedSkill(40),
    trade: practicedSkill(57.96),
  };
  assert.equal(wholeNumberReached(data.trade), 58);
  assert.equal(wholeNumberReached(data.leadership), null);
  const hiddenEvent: SimEvent = {
    sequence: 1,
    tick: 1,
    type: "worked",
    actorId: hidden.id,
    settlementId: "glassport",
    data,
  };
  const before = stateHash(world);
  const hiddenRow = projectEvent(world, mara, hiddenEvent, `${hidden.name} worked at Glassport.`);
  assert.equal(hiddenRow.payloadWithheld, true);
  assert.equal(hiddenRow.summary, `${hidden.name} worked at Glassport.`);
  assert.equal(String(hiddenRow.summary).includes("rose"), false);
  assert.equal(hiddenRow.data, null);

  const mateEvent: SimEvent = {
    sequence: 2,
    tick: 1,
    type: "worked",
    actorId: mate.id,
    settlementId: "verdant-cay",
    data,
  };
  const mateRow = projectEvent(world, mara, mateEvent, `${mate.name} worked at Verdant Cay.`);
  assert.equal(mateRow.payloadWithheld, true);
  assert.equal(mateRow.data, null);
  assert.equal(mateRow.summary, `${mate.name} worked at Verdant Cay. ${mate.name}'s trade rose to 58.`);

  const sea: SimEvent = {
    sequence: 3,
    tick: 1,
    type: "travel-progressed",
    actorId: mara.id,
    targetId: "glassport",
    data: { navigation: practicedSkill(57.96) },
  };
  const seaRow = projectEvent(world, mara, sea, "Mara Vane continued toward Glassport.");
  assert.equal(String(seaRow.summary).includes("rose"), false);
  assert.equal(stateHash(world), before);
});

test("the progression readout shows skills, troop quality, feed counts, and battle totals", () => {
  const world = createPrototypeWorld(1847);
  const mara = maraOf(world);
  const hidden = world.characters["character-25"];
  hidden.locationId = "glassport";
  hidden.travel = null;
  hidden.factionId = null;
  const before = stateHash(world);
  const card = projectCharacter(world, mara, mara);
  const progression = card.progression as {
    skills: { trade: number; leadership: number; navigation: number; strategy: number } | null;
    troopQuality: { experience: number; discipline: number; band: string } | null;
    feedCounts: { worked: number; voyages: number; battles: number } | null;
    battleTotals: { victories: number; defeats: number };
  };
  assert.deepEqual(progression.skills, mara.skills);
  assert.equal(progression.troopQuality?.experience, round(mara.troops.experience, 3));
  assert.equal(progression.troopQuality?.discipline, round(mara.troops.discipline, 3));
  assert.equal(progression.troopQuality?.band, "veteran");
  assert.equal(progression.troopQuality?.band, troopQualityBand(mara.troops.experience));
  assert.equal(progression.feedCounts, null);
  assert.deepEqual(progression.battleTotals, { victories: mara.victories, defeats: mara.defeats });

  const distant = projectCharacter(world, mara, hidden).progression as {
    skills: unknown;
    troopQuality: unknown;
    feedCounts: unknown;
    battleTotals: { victories: number; defeats: number };
  };
  assert.equal(distant.skills, null);
  assert.equal(distant.troopQuality, null);
  assert.equal(projectCharacter(world, mara, hidden).skills, null);
  assert.deepEqual(distant.battleTotals, { victories: hidden.victories, defeats: hidden.defeats });

  const counts = { [mara.id]: { worked: 4, voyages: 1, battles: 0 } };
  const counted = projectCharacter(world, mara, mara, undefined, counts).progression as {
    feedCounts: { worked: number; voyages: number; battles: number };
  };
  assert.deepEqual(counted.feedCounts, { worked: 4, voyages: 1, battles: 0 });
  const other = projectCharacter(world, mara, hidden, undefined, counts).progression as {
    feedCounts: { worked: number; voyages: number; battles: number };
    skills: unknown;
  };
  assert.deepEqual(other.feedCounts, { worked: 0, voyages: 0, battles: 0 });
  assert.equal(other.skills, null);
  assert.equal(stateHash(world), before);

  mara.troops.experience = 0.349;
  assert.equal(troopQualityBand(mara.troops.experience), "ordinary");
  mara.troops.experience = 0.35;
  assert.equal(troopQualityBand(mara.troops.experience), "gap");
  mara.troops.experience = 0.549;
  assert.equal(troopQualityBand(mara.troops.experience), "gap");
  mara.troops.experience = 0.55;
  assert.equal(troopQualityBand(mara.troops.experience), "veteran");
  mara.troops.experience = 0.799;
  assert.equal(troopQualityBand(mara.troops.experience), "veteran");
  mara.troops.experience = 0.8;
  assert.equal(troopQualityBand(mara.troops.experience), "past");

  const view = dashboardState(world, [], fullEventFeed([]), [], counts);
  const projected = (view.characters as Array<{ id: string; progression: { feedCounts: { worked: number } } }>)
    .find((character) => character.id === mara.id);
  assert.equal(projected?.progression.feedCounts.worked, 4);
  const withoutLog = dashboardState(world, [], fullEventFeed([]));
  const missing = (withoutLog.characters as Array<{ id: string; progression: { feedCounts: unknown } }>)
    .find((character) => character.id === mara.id);
  assert.equal(missing?.progression.feedCounts, null);
});

test("feeding counts are read from the log and do not move the world hash", () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-readout-"));
  const databasePath = join(directory, "world.sqlite");
  try {
    const world = createPrototypeWorld(1847);
    const store = new WorldStore(databasePath);
    store.initialize(world);
    const tick = runTick(world);
    store.appendTick(tick.events, world);
    const before = stateHash(world);
    const counts = store.feedingCounts();
    assert.equal(stateHash(world), before);
    const worked = tick.events.filter((event) => event.type === "worked" && event.actorId).length;
    const voyages = tick.events.filter((event) => event.type === "travel-started" && event.actorId).length;
    const battles = tick.events.filter((event) => event.type === "battle-resolved" && event.actorId).length;
    const summed = Object.values(counts).reduce(
      (total, row) => ({
        worked: total.worked + row.worked,
        voyages: total.voyages + row.voyages,
        battles: total.battles + row.battles,
      }),
      { worked: 0, voyages: 0, battles: 0 },
    );
    assert.deepEqual(summed, { worked, voyages, battles });
    assert.ok(voyages > 0);
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
