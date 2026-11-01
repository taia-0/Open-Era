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
import { runTick, runTicks } from "./helpers/exile-off.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";
import type { SimEvent } from "../src/sim/types.ts";


test("seed 2718 tick 168 keeps the opening order warnings inside a 180-tick check-in", () => {
  // Re-pinned for the contract haul: hauls on 2718 change the titles and counts in this check-in.
  // Treasury spending moved the titles inside this check-in. The window still starts at tick 0.
  // Port balance (home starts) re-pinned the titles and counts; the opening refusals stay in the full window.
  const run = runTicks(createPrototypeWorld(2718), 168);
  const before = stateHash(run.state);
  assert.equal(CHECK_IN_TICKS, 180);
  assert.equal(CHECK_IN_EVENT_CAP, 40_000);
  const counted = run.events.slice(-5_000);
  const countedView = dashboardState(run.state, counted, fullEventFeed(counted)) as {
    briefing: { attentionCount: number; omittedInfoCount: number; items: Array<{ title: string }> };
  };
  assert.equal(counted[0]?.tick, 125);
  assert.deepEqual(countedView.briefing.items.map((item) => item.title), ["The party is starving", "Intelligence is stale", "Intelligence is stale", "Intelligence is stale", "Intelligence is stale", "Intelligence is stale", "Intelligence is stale", "A captain was taken", "Scattered troops came back, 3 times.", "Scattered troops came back, 2 times."]);
  assert.equal(countedView.briefing.attentionCount, 8);
  assert.equal(countedView.briefing.omittedInfoCount, 0);

  const windowed = checkInEvents(run.events, run.state.tick);
  assert.equal(windowed[0]?.tick, 0);
  assert.equal(windowed.length, 19316);
  assert.equal(windowed.length, run.events.length);
  const view = dashboardState(run.state, windowed, fullEventFeed(windowed)) as {
    briefing: { attentionCount: number; omittedInfoCount: number; items: Array<{ title: string }> };
  };
  assert.deepEqual(view.briefing.items.map((item) => item.title), ["The party is starving", "Intelligence is stale", "Intelligence is stale", "Intelligence is stale", "Intelligence is stale", "Intelligence is stale", "Intelligence is stale", "A captain was taken", "A captain was released", "An order was not followed, 11 times.", "A captain was released", "A captain was taken", "A battle was decided", "A battle was decided, 2 times.", "A battle was decided", "A battle was decided", "A captain was taken", "A battle was decided", "A captain was taken", "An order was refused", "An order was refused", "An order was not followed.", "An order was refused", "An order was refused", "An order was refused"]);
  assert.equal(view.briefing.attentionCount, 25);
  assert.equal(view.briefing.omittedInfoCount, 13);
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

test("seed 2718 tick 79 states the captured troops on the captor's feed and not on a rival's", () => {
  // Port balance (home starts): Mina's failed-retreat capture is gone. Pax Ash's failed-retreat capture
  // (seq 14431, tick 126) is the matching event; Zara Gale (character-17), a non-captor, is the rival view.
  const run = runTicks(createPrototypeWorld(2718), 129);
  const capture = run.events.find((event) => event.sequence === 14431);
  assert.ok(capture);
  assert.equal(capture.type, "character-captured");
  assert.equal(capture.tick, 126);
  const [forMara] = projectEventFeed(run.state, "character-01", [capture]);
  assert.equal(forMara?.payloadWithheld, true);
  assert.equal(forMara?.data, null);
  assert.equal(
    forMara?.summary,
    "World Government took Pax Ash at Crown Harbor after failed retreat. 46 troops were taken, power 155.285.",
  );
  const [forPax] = projectEventFeed(run.state, "character-17", [capture]);
  assert.equal(forPax?.data, null);
  assert.equal(forPax?.summary, "World Government took Pax Ash at Crown Harbor after failed retreat");
  assert.equal(String(forPax?.summary).includes("155.285"), false);
  assert.equal(String(forPax?.summary).includes("46 troops"), false);
});

test("seed 2718 names both captains and does not say each one took the port", () => {
  // Port balance (home starts): the 1847 shared fight is gone. On 2718 Pax Ash and Mara Calder share the
  // Glassport fight on tick 47 and Mara Calder takes the surrender on tick 48.
  const claimedRun = runTicks(createPrototypeWorld(2718), 49);
  const battle = claimedRun.events.find((event) => event.sequence === 5390);
  const other = claimedRun.events.find((event) => event.sequence === 5454);
  const claim = claimedRun.events.find((event) => event.sequence === 5567);
  assert.ok(battle && other && claim);
  assert.equal(battle.type, "battle-resolved");
  assert.equal(battle.tick, 47);
  assert.equal(battle.actorId, "character-14");
  assert.equal(other.actorId, "character-21");
  assert.equal(claim.type, "settlement-claimed");
  assert.equal(claim.tick, 48);
  assert.equal(claim.actorId, "character-21");
  const claimedFeed = projectEventFeed(claimedRun.state, "character-01", [battle, other, claim]);
  const zara = claimedFeed.find((row) => row.sequence === 5390);
  const dax = claimedFeed.find((row) => row.sequence === 5454);
  const claimed = claimedFeed.find((row) => row.sequence === 5567);
  const sharedLine = "2 captains won a fight here on this tick: Pax Ash, Mara Calder. This fight left the garrison standing.";
  assert.equal(
    zara?.summary,
    `Pax Ash won the fight at Glassport on a higher score. ${sharedLine}`,
  );
  assert.equal(
    dax?.summary,
    `Mara Calder won the fight at Glassport on a higher score. ${sharedLine} The surrender was taken on the next tick.`,
  );
  assert.equal(
    claimed?.summary,
    "Mara Calder claimed Glassport. The surrender was offered and taken on the next tick, so it was not waiting.",
  );
  for (const row of [zara, dax, claimed]) {
    assert.equal(row?.payloadWithheld, true);
    assert.equal(row?.data, null);
    assert.equal(String(row?.summary).includes("outscore"), false);
    assert.equal(String(row?.summary).includes("nerve"), false);
    assert.equal(String(row?.summary).includes("accepted"), false);
  }
});

test("seed 1847 tick 1 hints that a refusal was a standing order and does not name the directive", () => {
  // Port balance (home starts): FT captains now start at Cinder Key, so the setup rng shifts the sequences.
  const run = runTicks(createPrototypeWorld(1847), 1);
  const finn = run.events.find((event) => event.sequence === 114) as SimEvent;
  const bram = run.events.find((event) => event.sequence === 141) as SimEvent;
  assert.equal(finn.type, "standing-order-refused");
  assert.equal(bram.type, "standing-order-refused");
  const [finnRow] = projectEventFeed(run.state, "character-01", [finn]);
  const [bramRow] = projectEventFeed(run.state, "character-01", [bram]);
  assert.equal(finnRow?.payloadWithheld, true);
  assert.equal(finnRow?.data, null);
  assert.equal(
    finnRow?.summary,
    "Finn Frost refused a standing order. Finn Frost is sailing from Cinder Key to Verdant Cay.",
  );
  assert.equal(bramRow?.payloadWithheld, true);
  assert.equal(bramRow?.data, null);
  assert.equal(
    bramRow?.summary,
    "Bram Tern refused a standing order. Bram Tern is sailing from Cinder Key to Glassport.",
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
