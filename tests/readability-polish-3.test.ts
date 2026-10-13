import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { projectCharacter } from "../src/dashboard/visibility.ts";
import {
  CHECK_IN_EVENT_CAP,
  CHECK_IN_TICKS,
  checkInEvents,
  dashboardState,
  fullEventFeed,
  projectEventFeed,
} from "../src/dashboard/view-model.ts";
import { runTick, runTicks } from "../src/sim/engine.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";
import type { SimEvent } from "../src/sim/types.ts";

test("seed 2718 tick 168 keeps the opening order warnings inside a 180-tick check-in", () => {
  // Treasury spending moved the titles inside this check-in. The window still starts at tick 0.
  const run = runTicks(createPrototypeWorld(2718), 168);
  const before = stateHash(run.state);
  assert.equal(CHECK_IN_TICKS, 180);
  assert.equal(CHECK_IN_EVENT_CAP, 40_000);
  const counted = run.events.slice(-5_000);
  const countedView = dashboardState(run.state, counted, fullEventFeed(counted)) as {
    briefing: { attentionCount: number; omittedInfoCount: number; items: Array<{ title: string }> };
  };
  assert.equal(counted[0]?.tick, 128);
  assert.deepEqual(countedView.briefing.items.map((item) => item.title), [
    "The party is starving",
    "Intelligence is stale",
    "A port was claimed",
    "A port was claimed",
    "A port was claimed",
    "A port was claimed",
    "A battle was decided",
    "A battle was decided",
    "A battle was decided",
    "A port was claimed",
  ]);
  assert.equal(countedView.briefing.attentionCount, 2);
  assert.equal(countedView.briefing.omittedInfoCount, 0);

  const windowed = checkInEvents(run.events, run.state.tick);
  assert.equal(windowed[0]?.tick, 0);
  assert.equal(windowed.length, 20248);
  assert.equal(windowed.length, run.events.length);
  const view = dashboardState(run.state, windowed, fullEventFeed(windowed)) as {
    briefing: { attentionCount: number; omittedInfoCount: number; items: Array<{ title: string }> };
  };
  assert.deepEqual(view.briefing.items.map((item) => item.title), [
    "The party is starving",
    "Intelligence is stale",
    "An order was not followed, 3 times.",
    "An order was not followed, 2 times.",
    "An order was refused",
    "An order was refused",
    "An order was refused",
    "An order was refused",
    "Iris Stone sent a routine digest.",
    "A port was claimed",
  ]);
  assert.equal(view.briefing.attentionCount, 8);
  assert.equal(view.briefing.omittedInfoCount, 17);
  assert.equal(stateHash(run.state), before);
});

test("the store read is the same tick window, and the cap keeps the newest rows", () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-check-in-"));
  const store = new WorldStore(join(directory, "world.sqlite"));
  try {
    const world = createPrototypeWorld(2718);
    store.initialize(world);
    for (let index = 0; index < 4; index += 1) {
      const result = runTick(world);
      store.appendTick(result.events, world);
    }
    const all = store.allEvents();
    const minTick = Math.max(0, world.tick - CHECK_IN_TICKS);
    const read = store.eventsSinceTick(minTick, CHECK_IN_EVENT_CAP);
    assert.deepEqual(read.map((event) => event.sequence), checkInEvents(all, world.tick).map((event) => event.sequence));
    const capped = store.eventsSinceTick(0, 2);
    assert.equal(capped.length, 2);
    assert.deepEqual(capped.map((event) => event.sequence), all.slice(-2).map((event) => event.sequence));
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("seed 1847 tick 281 states the captured troops on the captor's feed and not on a rival's", () => {
  // The levy moved Mina Vale's capture to seed 1847, tick 281.
  const run = runTicks(createPrototypeWorld(1847), 282);
  const capture = run.events.find((event) => event.sequence === 33644);
  assert.ok(capture);
  assert.equal(capture.type, "character-captured");
  assert.equal(capture.tick, 281);
  const [forMara] = projectEventFeed(run.state, "character-01", [capture]);
  assert.equal(forMara?.payloadWithheld, true);
  assert.equal(forMara?.data, null);
  assert.equal(
    forMara?.summary,
    "World Government took Mina Vale at Crown Harbor after major defeat. 30 troops were taken, power 71.081.",
  );
  const [forPax] = projectEventFeed(run.state, "character-14", [capture]);
  assert.equal(forPax?.data, null);
  assert.equal(forPax?.summary, "World Government took Mina Vale at Crown Harbor after major defeat");
  assert.equal(String(forPax?.summary).includes("71.081"), false);
  assert.equal(String(forPax?.summary).includes("30 troops"), false);
});

test("seed 1847 names both captains and does not say each one took the port", () => {
  // The levy moved the shared surrender to Zara Gale and Dax Pike at Glassport, battle tick 47 and claim tick 48.
  const claimedRun = runTicks(createPrototypeWorld(1847), 49);
  const zaraBattle = claimedRun.events.find((event) => event.sequence === 5504);
  const daxBattle = claimedRun.events.find((event) => event.sequence === 5517);
  const claim = claimedRun.events.find((event) => event.sequence === 5647);
  assert.ok(zaraBattle && daxBattle && claim);
  assert.equal(zaraBattle.type, "battle-resolved");
  assert.equal(zaraBattle.tick, 47);
  assert.equal(zaraBattle.actorId, "character-17");
  assert.equal(daxBattle.actorId, "character-20");
  assert.equal(claim.type, "settlement-claimed");
  assert.equal(claim.tick, 48);
  assert.equal(claim.actorId, "character-20");
  const claimedFeed = projectEventFeed(claimedRun.state, "character-01", [zaraBattle, daxBattle, claim]);
  const zara = claimedFeed.find((row) => row.sequence === 5504);
  const dax = claimedFeed.find((row) => row.sequence === 5517);
  const claimed = claimedFeed.find((row) => row.sequence === 5647);
  const sharedLine = "2 captains won a fight here on this tick: Zara Gale, Dax Pike. This fight left the garrison standing.";
  assert.equal(zara?.summary, `Zara Gale won the fight at Glassport on a higher score. ${sharedLine}`);
  assert.equal(
    dax?.summary,
    `Dax Pike won the fight at Glassport on a higher score. ${sharedLine} The surrender was taken on the next tick.`,
  );
  assert.equal(
    claimed?.summary,
    "Dax Pike claimed Glassport. The surrender was offered and taken on the next tick, so it was not waiting.",
  );
  for (const row of [zara, dax, claimed]) {
    assert.equal(row?.payloadWithheld, true);
    assert.equal(row?.data, null);
    assert.equal(String(row?.summary).includes("outscore"), false);
    assert.equal(String(row?.summary).includes("nerve"), false);
    assert.equal(String(row?.summary).includes("accepted"), false);
    assert.equal(String(row?.summary).includes("each"), false);
  }
});

test("seed 1847 tick 475 says morale gave out, and does not say nerve broke", () => {
  // The levy moved this fight to Corin Hale at Glassport on tick 475.
  const run = runTicks(createPrototypeWorld(1847), 476);
  const battle = run.events.find((event) => event.sequence === 60148);
  assert.ok(battle);
  assert.equal(battle.type, "battle-resolved");
  assert.equal(battle.tick, 475);
  assert.equal(battle.actorId, "character-16");
  assert.equal(battle.settlementId, "glassport");
  assert.equal(battle.data.outcome, "attacker-victory");
  assert.equal(typeof battle.data.battleId, "string");
  const [row] = projectEventFeed(run.state, "character-01", [battle]);
  assert.equal(row?.payloadWithheld, true);
  assert.equal(row?.data, null);
  assert.equal(row?.summary, "Corin Hale won the fight at Glassport on a higher score, after morale gave out. A surrender was offered.");
  assert.equal(String(row?.summary).includes("nerve"), false);
  assert.equal(String(row?.summary).includes("outscore"), false);
});

test("seed 1847 tick 1 hints that a refusal was a standing order and does not name the directive", () => {
  const run = runTicks(createPrototypeWorld(1847), 1);
  const finn = run.events.find((event) => event.sequence === 113) as SimEvent;
  const bram = run.events.find((event) => event.sequence === 137) as SimEvent;
  assert.equal(finn.type, "standing-order-refused");
  assert.equal(bram.type, "standing-order-refused");
  const [finnRow] = projectEventFeed(run.state, "character-01", [finn]);
  const [bramRow] = projectEventFeed(run.state, "character-01", [bram]);
  assert.equal(finnRow?.payloadWithheld, true);
  assert.equal(finnRow?.data, null);
  assert.equal(
    finnRow?.summary,
    "Finn Frost refused a standing order. Finn Frost is sailing from Verdant Cay to Crown Harbor.",
  );
  assert.equal(bramRow?.payloadWithheld, true);
  assert.equal(bramRow?.data, null);
  assert.equal(
    bramRow?.summary,
    "Bram Tern refused a standing order. Bram Tern is sailing from Verdant Cay to Glassport.",
  );
  assert.equal(String(finnRow?.summary).includes("explore"), false);
  assert.equal(String(bramRow?.summary).includes("trade"), false);
});

test("Toma Reef and Toma Hale are qualified in display, and the stored names stay", () => {
  const world = createPrototypeWorld(1847);
  const before = stateHash(world);
  const mara = world.characters["character-01"];
  const reef = projectCharacter(world, mara, world.characters["character-07"]);
  const hale = projectCharacter(world, mara, world.characters["character-27"]);
  assert.equal(world.characters["character-07"].name, "Toma Reef");
  assert.equal(world.characters["character-27"].name, "Toma Hale");
  assert.equal(reef.name, "Toma Reef");
  assert.equal(hale.name, "Toma Hale");
  assert.equal(reef.displayName, "Toma Reef (World Government)");
  assert.equal(hale.displayName, "Toma Hale (unaffiliated)");
  assert.equal(stateHash(world), before);
});
