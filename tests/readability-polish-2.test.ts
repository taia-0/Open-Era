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

test("seed 2718 Mina Vale at tick 72 rounds the held troop figures", () => {
  const run = runTicks(createPrototypeWorld(2718), 72);
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
  const scattered = runTicks(createPrototypeWorld(2718), 168);
  // GET /api/state builds the check-in from the last 180 ticks, capped at
  // 40,000 events. The newest 5,000 events still drop the opening warnings.
  const counted = scattered.events.slice(-5_000);
  const countedView = dashboardState(scattered.state, counted, fullEventFeed(counted)) as {
    briefing: { attentionCount: number; omittedInfoCount: number };
  };
  assert.equal(counted.length, 5_000);
  assert.equal(countedView.briefing.attentionCount, 4);
  assert.equal(countedView.briefing.omittedInfoCount, 0);
  const windowed = checkInEvents(scattered.events, scattered.state.tick);
  const full = dashboardState(scattered.state, windowed, fullEventFeed(windowed)) as {
    briefing: { items: Array<{ title: string; summary: string }>; attentionCount: number; omittedInfoCount: number };
  };
  assert.deepEqual(full.briefing.items.map((item) => item.title), [
    "The party is starving",
    "Intelligence is stale",
    "Intelligence is stale",
    "A captain was released",
    "A captain was taken",
    "A battle was decided",
    "An order was not followed, 2 times.",
    "An order was refused",
    "An order was refused",
    "An order was not followed.",
    "An order was refused",
    "An order was refused",
  ]);
  assert.equal(full.briefing.attentionCount, 12);
  assert.equal(full.briefing.omittedInfoCount, 8);
  const returnsOnly = dashboardState(
    scattered.state,
    scattered.events.filter((event) => event.type === "scattered-troops-returned"),
    fullEventFeed([]),
  ) as { briefing: { items: Array<{ title: string; summary: string }> } };
  const returned = returnsOnly.briefing.items.find((item) => item.title.startsWith("Scattered troops came back"));
  assert.ok(returned);
  assert.equal(returned.title, "Scattered troops came back, 2 times.");
  assert.equal(returned.summary.includes(".."), false);
  assert.equal(full.briefing.items.some((item) => item.title.startsWith("An order was not followed")), true);
  const returns = scattered.events.filter((event) => event.type === "scattered-troops-returned");
  assert.deepEqual(returns.map((event) => event.tick), [161, 167]);

  const held = runTicks(createPrototypeWorld(2718), 1035);
  assert.equal(held.state.characters["character-01"].captivity?.settlementId, "crown-harbor");
  const heldView = dashboardState(held.state, held.events, fullEventFeed(held.events)) as {
    briefing: { items: Array<{ id: string; title: string }> };
  };
  const captivity = heldView.briefing.items.find((item) => item.id === "captivity:1034");
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
  const at119 = runTicks(createPrototypeWorld(1847), 119);
  const mara = at119.state.characters["character-01"];
  const sable = at119.state.characters["character-04"];
  const pax = at119.state.characters["character-14"];
  const sableCard = projectCharacter(at119.state, mara, sable, at119.events);
  const paxCard = projectCharacter(at119.state, mara, pax, at119.events);
  assert.equal(sable.name, "Sable Morrow");
  assert.equal(sableCard.debts, null);
  assert.equal(sableCard.releaseDebtNote, "Owes 103.21 from the release at Cinder Key.");
  assert.equal(paxCard.money, 44.88);
  assert.equal(paxCard.ransomIncomeNote, null);
  assert.equal(String(paxCard.money).includes("6.7"), false);

  const at902 = runTicks(createPrototypeWorld(1847), 902);
  const before = stateHash(at902.state);
  const maraLater = at902.state.characters["character-01"];
  const dax = at902.state.characters["character-20"];
  const daxCard = projectCharacter(at902.state, maraLater, dax, at902.events);
  const maraCard = projectCharacter(at902.state, maraLater, maraLater, at902.events);
  assert.equal(dax.captivity, null);
  assert.equal(daxCard.releaseDebtNote, null);
  assert.equal(maraCard.money, 0);
  assert.equal(maraCard.ransomIncomeNote, null);
  assert.equal(stateHash(at902.state), before);
});

test("seed 1847 tick 118 separates the ransom from the Crown Harbor tax", () => {
  const run = runTicks(createPrototypeWorld(1847), 119);
  const before = stateHash(run.state);
  const release = run.events.find((event) => event.sequence === 13680);
  const upkeep = run.events.find((event) => event.sequence === 13673);
  const harbor = run.events.find((event) => event.sequence === 13675);
  const traded = run.events.find((event) => event.sequence === 13701);
  assert.ok(release && upkeep && harbor && traded);
  const mara = run.state.characters["character-01"];
  const line = "Sable Morrow was released from Cinder Key. 13.4 was paid and 103.21 was recorded as debt. Loyalty fell. 13.4 went to the Free Tide Compact treasury. The balance is not visible to you. The ransom line covers only the ransom.";
  const [releaseRow] = projectEventFeed(run.state, "character-01", [release]);
  assert.equal(releaseRow?.payloadWithheld, true);
  assert.equal(releaseRow?.data, null);
  assert.equal(releaseRow?.summary, line);
  assert.deepEqual(releaseRow?.details, captivityReleasedParts(run.state, release, false, mara));
  assert.deepEqual(releaseRow?.details, [
    "Sable Morrow was released from Cinder Key.",
    "13.4 was paid and 103.21 was recorded as debt.",
    "Loyalty fell.",
    "13.4 went to the Free Tide Compact treasury. The balance is not visible to you.",
    "The ransom line covers only the ransom.",
  ]);
  assert.equal(String(line).includes("29.01"), false);
  assert.equal(String(line).includes("Pax Ash"), false);

  const [cinder] = projectEventFeed(run.state, "character-01", [upkeep]);
  const [crown] = projectEventFeed(run.state, "character-01", [harbor]);
  assert.equal(cinder?.summary, "Cinder Key kept its stores.");
  assert.equal(cinder?.payloadWithheld, true);
  assert.equal(crown?.summary, "Crown Harbor kept its stores.");
  assert.equal(crown?.payloadWithheld, false);

  const [taxRow] = projectEventFeed(run.state, "character-01", [traded]);
  assert.equal(traded.type, "market-trade");
  assert.equal(taxRow?.payloadWithheld, true);
  assert.equal(taxRow?.data, null);
  assert.equal(taxRow?.summary, "Toma Reef (World Government) traded at Crown Harbor. Tax of 29.01 went to the treasury.");
  assert.equal(String(taxRow?.summary).includes("13.4"), false);
  assert.equal(stateHash(run.state), before);
});
