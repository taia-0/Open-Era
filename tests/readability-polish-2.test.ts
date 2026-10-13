import assert from "node:assert/strict";
import test from "node:test";
import { checkInEvents, dashboardState, fullEventFeed, projectEventFeed } from "../src/dashboard/view-model.ts";
import { projectCharacter } from "../src/dashboard/visibility.ts";
import { captivityReleasedParts } from "../src/dashboard/wording.ts";
import { runTicks } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { round, stateHash } from "../src/sim/state.ts";
import type { SimEvent, WorldState } from "../src/sim/types.ts";

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

  const one = run.events.find((event) => event.sequence === 713);
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

test("seed 1847 Mina Vale at tick 282 rounds the held troop figures", () => {
  // The levy moved her co-located hold to seed 1847, tick 281.
  const run = runTicks(createPrototypeWorld(1847), 282);
  const before = stateHash(run.state);
  const mina = run.state.characters["character-15"];
  const mara = run.state.characters["character-01"];
  assert.equal(mina.name, "Mina Vale");
  assert.equal(mina.troops.experience, 0.23115545285400002);
  assert.equal(mina.troops.discipline, 0.3581968812993727);
  const card = projectCharacter(run.state, mara, mina);
  const troops = card.troops as { count: number; experience: number; discipline: number };
  assert.equal(troops.count, 0);
  assert.equal(troops.experience, 0.231);
  assert.equal(troops.discipline, 0.358);
  assert.equal(troops.experience, round(mina.troops.experience, 3));
  assert.equal(troops.discipline, round(mina.troops.discipline, 3));
  assert.equal(
    card.troopsNote,
    "0 with Mina Vale; 30 held by World Government. The experience and discipline are the troops now held by World Government.",
  );
  const scattered = (card.captivity as { scatteredTroops: { experience: number; discipline: number } }).scatteredTroops;
  assert.equal(scattered.experience, 0.231);
  assert.equal(scattered.discipline, 0.358);
  assert.equal(mina.troops.experience, 0.23115545285400002);
  assert.equal(mina.captivity?.scatteredTroops.experience, 0.23115545285400002);
  assert.equal(stateHash(run.state), before);
});

test("briefing titles on a held captain and on returned troops are sentences", () => {
  // Treasury spending moved the tick 168 check-in and the first troop returns.
  const scattered = runTicks(createPrototypeWorld(2718), 168);
  // GET /api/state builds the check-in from the last 180 ticks, capped at
  // 40,000 events. The newest 5,000 events still drop the opening warnings.
  const counted = scattered.events.slice(-5_000);
  const countedView = dashboardState(scattered.state, counted, fullEventFeed(counted)) as {
    briefing: { attentionCount: number; omittedInfoCount: number };
  };
  assert.equal(counted.length, 5_000);
  assert.equal(counted[0]?.tick, 128);
  assert.equal(countedView.briefing.attentionCount, 2);
  assert.equal(countedView.briefing.omittedInfoCount, 0);
  const windowed = checkInEvents(scattered.events, scattered.state.tick);
  const full = dashboardState(scattered.state, windowed, fullEventFeed(windowed)) as {
    briefing: { items: Array<{ title: string; summary: string }>; attentionCount: number; omittedInfoCount: number };
  };
  assert.deepEqual(full.briefing.items.map((item) => item.title), [
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
  assert.equal(full.briefing.attentionCount, 8);
  assert.equal(full.briefing.omittedInfoCount, 17);
  const returnedRun = runTicks(createPrototypeWorld(2718), 530);
  const returnsOnly = dashboardState(
    returnedRun.state,
    returnedRun.events.filter((event) => event.type === "scattered-troops-returned"),
    fullEventFeed([]),
  ) as { briefing: { items: Array<{ title: string; summary: string }> } };
  const returned = returnsOnly.briefing.items.find((item) => item.title.startsWith("Scattered troops came back"));
  assert.ok(returned);
  assert.equal(returned.title, "Scattered troops came back, 7 times.");
  assert.equal(returned.summary.includes(".."), false);
  assert.equal(full.briefing.items.some((item) => item.title.startsWith("An order was not followed")), true);
  const returns = returnedRun.events.filter((event) => event.type === "scattered-troops-returned");
  assert.deepEqual(returns.map((event) => event.tick), [486, 492, 498, 504, 510, 516, 522]);

  // The levy moved Mara's hold to seed 1847, captured on tick 803.
  const held = runTicks(createPrototypeWorld(1847), 804);
  assert.equal(held.state.characters["character-01"].captivity?.settlementId, "crown-harbor");
  const heldView = dashboardState(held.state, held.events, fullEventFeed(held.events)) as {
    briefing: { items: Array<{ id: string; title: string }> };
  };
  const captivity = heldView.briefing.items.find((item) => item.id === "captivity:803");
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
  // The levy left Esme Dusk's Crown Harbor debt on the card Mara can read at tick 400.
  const at400 = runTicks(createPrototypeWorld(1847), 400);
  const mara = at400.state.characters["character-01"];
  const esme = at400.state.characters["character-19"];
  const pax = at400.state.characters["character-14"];
  const esmeCard = projectCharacter(at400.state, mara, esme, at400.events);
  const paxCard = projectCharacter(at400.state, mara, pax, at400.events);
  assert.equal(esme.name, "Esme Dusk");
  assert.equal(esme.locationId, "glassport");
  assert.equal(esmeCard.debts, null);
  assert.equal(esmeCard.releaseDebtNote, "Owes 69.96 from the release at Crown Harbor.");
  assert.equal(pax.locationId, "verdant-cay");
  assert.equal(pax.money, 2104.61);
  assert.equal(paxCard.money, null);
  assert.equal(paxCard.ransomIncomeNote, null);

  const at807 = runTicks(createPrototypeWorld(1847), 807);
  const before = stateHash(at807.state);
  const maraLater = at807.state.characters["character-01"];
  const esmeLater = at807.state.characters["character-19"];
  const dax = at807.state.characters["character-20"];
  const esmeCardLater = projectCharacter(at807.state, maraLater, esmeLater, at807.events);
  const daxCard = projectCharacter(at807.state, maraLater, dax, at807.events);
  const maraCard = projectCharacter(at807.state, maraLater, maraLater, at807.events);
  assert.equal(dax.name, "Dax Pike");
  assert.equal(dax.captivity, null);
  assert.equal(dax.locationId, null);
  assert.equal(daxCard.releaseDebtNote, "Owes 502.05 from the release at Glassport.");
  assert.equal(esmeCardLater.releaseDebtNote, "Owes 69.96 from the release at Crown Harbor. Owes 309.42 from the release at Glassport.");
  assert.equal(maraCard.ransomIncomeNote, null);
  assert.equal(stateHash(at807.state), before);
});

test("seed 1847 tick 887 separates the ransom from the Crown Harbor work", () => {
  // The levy put Mara's release and Dax Pike's work on the same tick. They stay different sentences.
  const run = runTicks(createPrototypeWorld(1847), 888);
  const before = stateHash(run.state);
  const release = run.events.find((event) => event.sequence === 119648);
  const cinderUpkeep = run.events.find((event) => event.sequence === 119641);
  const crownUpkeep = run.events.find((event) => event.sequence === 119643);
  const glassUpkeep = run.events.find((event) => event.sequence === 119645);
  const verdantUpkeep = run.events.find((event) => event.sequence === 119647);
  const traded = run.events.find((event) => event.sequence === 119731);
  assert.ok(release && cinderUpkeep && crownUpkeep && glassUpkeep && verdantUpkeep && traded);
  const mara = run.state.characters["character-01"];
  const line = "Mara Vane was released from Crown Harbor. 108 was paid and 106.34 was recorded as debt. Loyalty fell. 108 went to the Free Cinder Key treasury. The balance is not visible to you. The ransom line covers only the ransom. Mara Vane holds the seat of World Government again.";
  const [releaseRow] = projectEventFeed(run.state, "character-01", [release]);
  assert.equal(releaseRow?.payloadWithheld, false);
  assert.equal(releaseRow?.summary, line);
  assert.deepEqual(releaseRow?.details, captivityReleasedParts(run.state, release, false, mara));
  assert.deepEqual(releaseRow?.details, [
    "Mara Vane was released from Crown Harbor.",
    "108 was paid and 106.34 was recorded as debt.",
    "Loyalty fell.",
    "108 went to the Free Cinder Key treasury. The balance is not visible to you.",
    "The ransom line covers only the ransom.",
    "Mara Vane holds the seat of World Government again.",
  ]);
  assert.equal(String(line).includes("1072.9"), false);

  const [cinder] = projectEventFeed(run.state, "character-01", [cinderUpkeep]);
  const [crown] = projectEventFeed(run.state, "character-01", [crownUpkeep]);
  const [glass] = projectEventFeed(run.state, "character-01", [glassUpkeep]);
  const [verdant] = projectEventFeed(run.state, "character-01", [verdantUpkeep]);
  assert.equal(cinder?.summary, "Cinder Key kept its stores.");
  assert.equal(cinder?.payloadWithheld, false);
  assert.equal(crown?.summary, "Crown Harbor kept its stores.");
  assert.equal(crown?.payloadWithheld, true);
  assert.equal(glass?.summary, "Glassport kept its stores.");
  assert.equal(glass?.payloadWithheld, true);
  assert.equal(verdant?.summary, "Verdant Cay kept its stores.");
  assert.equal(verdant?.payloadWithheld, true);

  const [workRow] = projectEventFeed(run.state, "character-01", [traded]);
  assert.equal(traded.type, "worked");
  assert.equal(traded.actorId, "character-20");
  assert.equal(workRow?.payloadWithheld, true);
  assert.equal(workRow?.data, null);
  assert.equal(workRow?.summary, "Dax Pike worked at Crown Harbor.");
  assert.equal(String(workRow?.summary).includes("108"), false);
  assert.equal(String(workRow?.summary).includes("106.34"), false);
  assert.equal(stateHash(run.state), before);
});
