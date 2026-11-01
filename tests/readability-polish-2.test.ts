import assert from "node:assert/strict";
import test from "node:test";
import { checkInEvents, dashboardState, fullEventFeed, projectEventFeed } from "../src/dashboard/view-model.ts";
import { projectCharacter } from "../src/dashboard/visibility.ts";
import { captivityReleasedParts } from "../src/dashboard/wording.ts";
import { runTick, runTicks } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { round, stateHash } from "../src/sim/state.ts";
import type { SimEvent, WorldState } from "../src/sim/types.ts";

/**
 * Seed 1847 in the live session, the run the dashboard shows. The contract
 * haul moved Mara Vane's Crown Harbor hold (tick 528 to 612) out of the
 * headless run; the live run keeps it.
 */
function liveTicks(seed: number, ticks: number): { state: WorldState; events: SimEvent[] } {
  const state = createPrototypeWorld(seed);
  const events: SimEvent[] = [];
  while (state.tick < ticks) events.push(...runTick(state, { liveSession: true }).events);
  return { state, events };
}

function rawTypeLine(world: WorldState, event: SimEvent): string {
  const actor = event.actorId ? world.characters[event.actorId]?.name ?? event.actorId : "World";
  return `${actor}: ${event.type.replaceAll("-", " ")}`;
}

test("seed 1847 withholds standing-order refusals as sentences, and no feed row keeps the raw type", () => {
  const early = runTicks(createPrototypeWorld(1847), 30);
  const before = stateHash(early.state);
  const finn = early.events.find((event) => event.sequence === 113);
  const bram = early.events.find((event) => event.sequence === 137);
  assert.ok(finn && bram);
  assert.equal(finn.type, "standing-order-refused");
  assert.equal(bram.type, "standing-order-refused");
  const [finnRow] = projectEventFeed(early.state, "character-01", [finn]);
  const [bramRow] = projectEventFeed(early.state, "character-01", [bram]);
  assert.equal(finnRow?.payloadWithheld, true);
  assert.equal(finnRow?.data, null);
  assert.equal(finnRow?.summary, "Finn Frost refused a standing order. Finn Frost is sailing from Crown Harbor to Verdant Cay.");
  assert.equal(String(finnRow?.summary).includes("explore"), false);
  assert.equal(bramRow?.payloadWithheld, true);
  assert.equal(bramRow?.summary, "Bram Tern refused a standing order. Bram Tern is at Verdant Cay.");
  assert.equal(String(bramRow?.summary).includes("trade supplies"), false);

  const feed = projectEventFeed(early.state, "character-01", early.events);
  const raw = feed.filter((row, index) => row.summary === rawTypeLine(early.state, early.events[index]));
  assert.deepEqual(raw.map((row) => row.summary), []);
  assert.equal(stateHash(early.state), before);
});

test("seed 1847 at state tick 12 agrees the routine digest with completed orders", () => {
  const run = runTicks(createPrototypeWorld(1847), 12);
  const view = dashboardState(run.state, run.events, fullEventFeed(run.events)) as {
    briefing: { items: Array<{ title: string; summary: string }> };
  };
  const digest = view.briefing.items.find((item) => item.summary.includes("routine order"));
  assert.ok(digest);
  assert.equal(digest.title, "Jun Marrow sent a routine digest.");
  assert.equal(
    digest.summary,
    "16 routine order updates: 8 accepted, 3 resumed, 5 completed. No command decision is required.",
  );
  assert.equal(digest.summary.includes("confirmed"), false);
  assert.equal(digest.summary.includes("1 routine order updates"), false);

  const one = run.events.find((event) => event.sequence === 718);
  assert.ok(one);
  assert.equal(one.type, "standing-order-completed");
  assert.equal(one.tick, 6);
  const singular = dashboardState(run.state, [one], fullEventFeed([])) as {
    briefing: { items: Array<{ summary: string }> };
  };
  const single = singular.briefing.items.find((item) => item.summary.includes("routine order"));
  assert.ok(single);
  assert.equal(single.summary, "1 routine order update: 1 completed. No command decision is required.");
});

test("seed 2718 Mina Vale at tick 80 rounds the held troop figures", () => {
  // The skill step moved her capture to seed 2718, tick 79.
  const run = runTicks(createPrototypeWorld(2718), 80);
  const before = stateHash(run.state);
  const mina = run.state.characters["character-15"];
  const mara = run.state.characters["character-01"];
  assert.equal(mina.name, "Mina Vale");
  assert.equal(mina.troops.experience, 0.19867861845996232);
  assert.equal(mina.troops.discipline, 0.3837455657846294);
  const card = projectCharacter(run.state, mara, mina);
  const troops = card.troops as { count: number; experience: number; discipline: number };
  assert.equal(troops.count, 0);
  assert.equal(troops.experience, 0.199);
  assert.equal(troops.discipline, 0.384);
  assert.equal(troops.experience, round(mina.troops.experience, 3));
  assert.equal(troops.discipline, round(mina.troops.discipline, 3));
  assert.equal(
    card.troopsNote,
    "0 with Mina Vale; 12 held by World Government. The experience and discipline are the troops now held by World Government.",
  );
  const scattered = (card.captivity as { scatteredTroops: { experience: number; discipline: number } }).scatteredTroops;
  assert.equal(scattered.experience, 0.199);
  assert.equal(scattered.discipline, 0.384);
  assert.equal(mina.troops.experience, 0.19867861845996232);
  assert.equal(mina.captivity?.scatteredTroops.experience, 0.19867861845996232);
  assert.equal(stateHash(run.state), before);
});

test("briefing titles on a held captain and on returned troops are sentences", () => {
  // Re-pinned for the contract haul: hauls on 2718 change the check-in titles and counts.
  // Treasury spending moved the tick 168 check-in and the first troop returns.
  const scattered = runTicks(createPrototypeWorld(2718), 168);
  // GET /api/state builds the check-in from the last 180 ticks, capped at
  // 40,000 events. The newest 5,000 events still drop the opening warnings.
  const counted = scattered.events.slice(-5_000);
  const countedView = dashboardState(scattered.state, counted, fullEventFeed(counted)) as {
    briefing: { attentionCount: number; omittedInfoCount: number };
  };
  assert.equal(counted.length, 5_000);
  assert.equal(counted[0]?.tick, 126);
  assert.equal(countedView.briefing.attentionCount, 4);
  assert.equal(countedView.briefing.omittedInfoCount, 0);
  const windowed = checkInEvents(scattered.events, scattered.state.tick);
  const full = dashboardState(scattered.state, windowed, fullEventFeed(windowed)) as {
    briefing: { items: Array<{ title: string; summary: string }>; attentionCount: number; omittedInfoCount: number };
  };
  assert.deepEqual(full.briefing.items.map((item) => item.title), [ 'The party is starving', 'Intelligence is stale', 'Intelligence is stale', 'A captain was released', 'A battle was decided', 'A captain was taken', 'An order was not followed, 5 times.', 'A battle was decided', 'A battle was decided', 'An order was not followed, 3 times.', 'An order was refused', 'An order was refused', 'An order was refused', 'An order was refused' ]);
  assert.equal(full.briefing.attentionCount, 14);
  assert.equal(full.briefing.omittedInfoCount, 8);
  const returnedRun = runTicks(createPrototypeWorld(2718), 200);
  const returnsOnly = dashboardState(
    returnedRun.state,
    returnedRun.events.filter((event) => event.type === "scattered-troops-returned"),
    fullEventFeed([]),
  ) as { briefing: { items: Array<{ title: string; summary: string }> } };
  const returned = returnsOnly.briefing.items.find((item) => item.title.startsWith("Scattered troops came back"));
  assert.ok(returned);
  assert.equal(returned.title, "Scattered troops came back, 6 times.");
  assert.equal(returned.summary.includes(".."), false);
  assert.equal(full.briefing.items.some((item) => item.title.startsWith("An order was not followed")), true);
  const returns = returnedRun.events.filter((event) => event.type === "scattered-troops-returned");
  assert.deepEqual(returns.map((event) => event.tick), [167, 173, 179, 185, 191, 197]);

  // The batch 2 pin moved Mara's hold to Crown Harbor, captured on tick 528. Tick 534 is a day boundary during that hold.
  // Re-pinned for the raise shock (low-tax-cost.md): she is now captured on tick 726; tick 732 is the day boundary during that hold (was 534).
  const held = liveTicks(1847, 732);
  assert.equal(held.state.characters["character-01"].captivity?.settlementId, "crown-harbor");
  const heldView = dashboardState(held.state, held.events, fullEventFeed(held.events)) as {
    briefing: { items: Array<{ id: string; title: string }> };
  };
  const captivity = heldView.briefing.items.find((item) => item.id === "captivity:726");
  assert.ok(captivity);
  assert.equal(captivity.title, "A captain is held captive.");
});

test("the loyalty note uses plain words and only the rounded figure", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  mara.loyaltyAdjustment = -0.04;
  const card = projectCharacter(world, mara, mara);
  assert.equal(card.loyaltyNote, "The seat reads 0.768. That rounded figure is the one the seat uses.");
  assert.equal(String(card.loyaltyNote).includes("personality"), false);
  assert.equal(String(card.loyaltyNote).includes("0.807927391717676"), false);
  assert.equal(String(card.loyaltyNote).includes("0.767927391717676"), false);
});

test("seed 1847 shows the release debt and the ransom credit the line already states", () => {
  // Re-pinned for the raise shock (low-tax-cost.md): Mara's release is now tick 810, so the cards are read at tick 811 (was 613).
  // Re-pinned for the contract haul: the live session keeps both debts; the figures moved.
  // The batch 2 pin leaves Corin Hale's Crown Harbor debt, and Mara's own Crown Harbor debt, on the cards at tick 613.
  const at613 = liveTicks(1847, 811);
  const before = stateHash(at613.state);
  const mara = at613.state.characters["character-01"];
  const dax = at613.state.characters["character-16"];
  const daxCard = projectCharacter(at613.state, mara, dax, at613.events);
  const maraCard = projectCharacter(at613.state, mara, mara, at613.events);
  assert.equal(dax.name, "Corin Hale");
  assert.equal(dax.captivity, null);
  assert.equal(daxCard.debts, null);
  assert.equal(daxCard.releaseDebtNote, "Owes 79.38 from the release at Crown Harbor.");
  assert.equal(maraCard.releaseDebtNote, "Owes 139.93 from the release at Crown Harbor.");
  assert.equal(maraCard.ransomIncomeNote, null);
  assert.equal(stateHash(at613.state), before);
});

test("seed 1847 tick 810 separates the ransom from the Crown Harbor work", () => {
  // Re-pinned for the raise shock (low-tax-cost.md): release and work now on tick 810; the Crown Harbor worker is Kessa Dusk; upkeep visibility moved with the port holders.
  // Re-pinned for the contract haul: the live session keeps this release; sequences, the debt and the worker moved.
  // The batch 2 pin put Mara's release and Crown Harbor work on tick 612. They stay different sentences.
  const run = liveTicks(1847, 811);
  const before = stateHash(run.state);
  const release = run.events.find((event) => event.sequence === 109241);
  const cinderUpkeep = run.events.find((event) => event.sequence === 109234);
  const crownUpkeep = run.events.find((event) => event.sequence === 109236);
  const glassUpkeep = run.events.find((event) => event.sequence === 109238);
  const verdantUpkeep = run.events.find((event) => event.sequence === 109240);
  const traded = run.events.find((event) => event.sequence === 109380);
  assert.ok(release && cinderUpkeep && crownUpkeep && glassUpkeep && verdantUpkeep && traded);
  const mara = run.state.characters["character-01"];
  const line = "Mara Vane was released from Crown Harbor. 108 was paid and 139.93 was recorded as debt. Loyalty fell. 108 went to the Free Tide Compact treasury. The balance is not visible to you. The ransom line covers only the ransom. Mara Vane holds the seat of World Government again.";
  const [releaseRow] = projectEventFeed(run.state, "character-01", [release]);
  assert.equal(releaseRow?.payloadWithheld, false);
  assert.equal(releaseRow?.summary, line);
  assert.deepEqual(releaseRow?.details, captivityReleasedParts(run.state, release, false, mara));
  assert.deepEqual(releaseRow?.details, [
    "Mara Vane was released from Crown Harbor.",
    "108 was paid and 139.93 was recorded as debt.",
    "Loyalty fell.",
    "108 went to the Free Tide Compact treasury. The balance is not visible to you.",
    "The ransom line covers only the ransom.",
    "Mara Vane holds the seat of World Government again.",
  ]);
  assert.equal(String(line).includes("108 went to the Free Tide Compact treasury. The balance"), true);

  const [cinder] = projectEventFeed(run.state, "character-01", [cinderUpkeep]);
  const [crown] = projectEventFeed(run.state, "character-01", [crownUpkeep]);
  const [glass] = projectEventFeed(run.state, "character-01", [glassUpkeep]);
  const [verdant] = projectEventFeed(run.state, "character-01", [verdantUpkeep]);
  assert.equal(cinder?.summary, "Cinder Key kept its stores.");
  assert.equal(cinder?.payloadWithheld, true);
  assert.equal(crown?.summary, "Crown Harbor kept its stores.");
  assert.equal(crown?.payloadWithheld, true);
  assert.equal(glass?.summary, "Glassport kept its stores.");
  assert.equal(glass?.payloadWithheld, false);
  assert.equal(verdant?.summary, "Verdant Cay kept its stores.");
  assert.equal(verdant?.payloadWithheld, true);

  const [workRow] = projectEventFeed(run.state, "character-01", [traded]);
  assert.equal(traded.type, "worked");
  assert.equal(traded.actorId, "character-30");
  assert.equal(workRow?.payloadWithheld, true);
  assert.equal(workRow?.data, null);
  assert.equal(workRow?.summary, "Kessa Dusk worked at Crown Harbor.");
  assert.equal(String(workRow?.summary).includes("108"), false);
  assert.equal(String(workRow?.summary).includes("139.93"), false);
  assert.equal(stateHash(run.state), before);
});
