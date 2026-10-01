import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDashboardApp } from "../src/dashboard/server.ts";
import { dashboardState, fullEventFeed } from "../src/dashboard/view-model.ts";
import { projectCharacter, projectEvent, seaSightingsFor } from "../src/dashboard/visibility.ts";
import { eventBriefingTitle } from "../src/dashboard/wording.ts";
import { provisionRunway, runTicks, travelDuration } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { round, stateHash } from "../src/sim/state.ts";
import type { Character, PartySighting, SimEvent, WorldState } from "../src/sim/types.ts";

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

test("a shared stretch says so, and does not use sharing as a verb", () => {
  const world = createPrototypeWorld(1847);
  const mara = commanderOf(world);
  const sable = world.characters["character-04"];
  sail(mara, "cinder-key", "glassport", 4, 2);
  sail(sable, "cinder-key", "glassport", 4, 2);
  sable.troops.count = 19;
  const row = seaSightingsFor(world, mara)?.[sable.id];
  assert.ok(row);
  assert.equal(row.kind, "sharing");
  assert.equal(
    row.summary,
    "Sable Morrow is in the same stretch of water, Cinder Key to Glassport. 19 troops, 0 ticks old.",
  );
});

test("a port record is labelled Sighted troops in the state the player reads", () => {
  const world = createPrototypeWorld(1847);
  const mara = commanderOf(world);
  const sable = world.characters["character-04"];
  const sighting: PartySighting = {
    characterId: sable.id,
    locationId: "cinder-key",
    travel: null,
    troops: 21,
    partyPower: 1,
    observedTick: 0,
    source: "direct",
    confidence: 1,
  };
  mara.partySightings = { [sable.id]: sighting };
  const card = projectCharacter(world, mara, sable);
  const port = card.partySighting as { label: string; troops: number };
  assert.equal(port.label, "Sighted troops");
  assert.equal(port.troops, 21);
  const own = projectCharacter(world, mara, mara);
  const listed = (own.partySightings as Record<string, { label: string }>)[sable.id];
  assert.equal(listed.label, "Sighted troops");
  assert.equal(sighting && "label" in sighting, false);
});

test("capture, battle, and release briefing titles are not the event type", () => {
  const world = createPrototypeWorld(1847);
  const events = [
    event({
      sequence: 10,
      type: "character-captured",
      actorId: "character-11",
      targetId: "free-tide",
      settlementId: "glassport",
      data: { cause: "failed-retreat" },
    }),
    event({
      sequence: 11,
      type: "battle-resolved",
      actorId: "character-01",
      targetId: "free-tide",
      settlementId: "crown-harbor",
      data: { outcome: "attacker-victory" },
    }),
    event({
      sequence: 12,
      type: "captivity-released",
      actorId: "character-04",
      settlementId: "cinder-key",
      data: { terms: { moneyPaid: 13.4, debtValue: 103.21 } },
    }),
  ];
  const view = dashboardState(world, events, fullEventFeed([])) as {
    briefing: { items: Array<{ id: string; title: string }> };
  };
  const title = (id: string) => view.briefing.items.find((item) => item.id === id)?.title;
  assert.equal(title("event:10"), "A captain was taken");
  assert.equal(title("event:11"), "A battle was decided");
  assert.equal(title("event:12"), "A captain was released");
  assert.equal(title("event:10"), eventBriefingTitle("character-captured"));
  assert.notEqual(eventBriefingTitle("character-captured"), "character captured");
  assert.equal(eventBriefingTitle("captivity-escaped"), "A captain escaped");
  assert.equal(eventBriefingTitle("player-command-failed"), "A command failed");
  assert.equal(eventBriefingTitle("standing-order-completed"), "An order was completed");
  assert.equal(eventBriefingTitle("settlement-claimed"), "A port was claimed");
  assert.equal(eventBriefingTitle("travel-progressed"), "travel progressed");
});

test("a briefing title does not change when actorId and targetId are swapped", () => {
  const world = createPrototypeWorld(1847);
  const stored = event({
    sequence: 10,
    type: "character-captured",
    actorId: "character-11",
    targetId: "free-tide",
    settlementId: "glassport",
    data: { cause: "failed-retreat" },
  });
  const swappedIds = event({
    sequence: 11,
    type: "character-captured",
    actorId: "free-tide",
    targetId: "character-11",
    settlementId: "glassport",
    data: { cause: "failed-retreat" },
  });
  const titleOf = (item: SimEvent) => {
    const view = dashboardState(world, [item], fullEventFeed([])) as {
      briefing: { items: Array<{ id: string; title: string }> };
    };
    return view.briefing.items.find((row) => row.id === `event:${item.sequence}`)?.title;
  };
  assert.equal(titleOf(stored), "A captain was taken");
  assert.equal(titleOf(swappedIds), titleOf(stored));
  const projected = projectEvent(world, commanderOf(world), stored, "stored sentence");
  assert.equal(projected.actorId, "character-11");
  assert.equal(projected.targetId, "free-tide");
});

test("an empty berth is named, and a stocked market is not called unsold", () => {
  const world = createPrototypeWorld(1847);
  const commander = commanderOf(world);
  commander.locationId = "crown-harbor";
  commander.travel = null;
  commander.cargo.provisions = 0;
  commander.morale = 0;
  for (const settlement of Object.values(world.settlements)) {
    settlement.stocks.provisions = 0;
  }
  const glassport = world.settlements["glassport"];
  glassport.factionId = commander.factionId;
  glassport.stocks.provisions = 40;
  const runway = provisionRunway(world, commander);
  const ticks = travelDuration(world, commander, "glassport");
  const view = dashboardState(world, [], fullEventFeed([])) as {
    briefing: { items: Array<{ id: string; summary: string; settlementId: string | null }> };
  };
  const starving = view.briefing.items.find((item) => item.id === "provision:critical");
  assert.ok(starving);
  assert.equal(starving.settlementId, "glassport");
  assert.equal(
    starving.summary,
    `The hold is empty and ${runway.shortage} provisions per tick cannot be found. That costs health ${runway.shortageHealthPerTick} per tick. Morale is already 0, so the shortage does not lower it. Morale gains nothing while the shortage lasts, so it will not recover on its own. Crown Harbor has no provisions to sell. Glassport is ${ticks} ticks away — out of reach, which is short by ${ticks - runway.runwayTicks} ticks.`,
  );

  commander.captivity = {
    captorFactionId: "free-tide",
    settlementId: "crown-harbor",
    capturedTick: 1,
    mandatoryReleaseTick: 80,
    cause: "failed-retreat",
    displayedRisk: "low",
    scatteredTroops: { count: 0, experience: 0, discipline: 0 },
    releaseDestinationId: null,
  };
  glassport.stocks.provisions = 0;
  const verdant = world.settlements["verdant-cay"];
  verdant.factionId = commander.factionId;
  verdant.stocks.provisions = 269;
  const held = dashboardState(world, [], fullEventFeed([])) as {
    briefing: { items: Array<{ id: string; summary: string }> };
  };
  const heldLine = held.briefing.items.find((item) => item.id === "provision:critical");
  assert.ok(heldLine);
  const heldRunway = provisionRunway(world, commander);
  assert.equal(
    heldLine.summary,
    `The hold is empty and ${heldRunway.shortage} provisions per tick cannot be found. That costs health ${heldRunway.shortageHealthPerTick} per tick. Morale is already 0, so the shortage does not lower it. Morale gains nothing while the shortage lasts, so it will not recover on its own. Crown Harbor has no provisions to sell. Verdant Cay sells provisions, and you cannot reach it while you are held.`,
  );
});

test("the commander's loyalty note shows only the rounded figure", () => {
  const world = createPrototypeWorld(1847);
  const commander = commanderOf(world);
  const seed = commander.personality.loyalty;
  const plain = projectCharacter(world, commander, commander);
  assert.equal(
    plain.loyaltyNote,
    `The seat reads ${round(seed, 3)}. That rounded figure is the one the seat uses.`,
  );
  assert.equal(/\d+\.\d{4,}/.test(String(plain.loyaltyNote)), false);
  assert.equal(String(plain.loyaltyNote).includes(String(seed)), false);
  commander.loyaltyAdjustment = -0.04;
  const scarred = projectCharacter(world, commander, commander);
  assert.equal(
    scarred.loyaltyNote,
    `The seat reads ${round(seed - 0.04, 3)}. That rounded figure is the one the seat uses.`,
  );
  assert.equal(scarred.loyaltyNote, "The seat reads 0.768. That rounded figure is the one the seat uses.");
  assert.equal(/\d+\.\d{4,}/.test(String(scarred.loyaltyNote)), false);
  assert.equal(String(scarred.loyaltyNote).includes("0.767927391717676"), false);
  assert.equal(String(scarred.loyaltyNote).includes("0.807927391717676"), false);
  assert.equal(commander.personality.loyalty, seed);
});

test("overtaking, passing, and arriving read as sentences, and the kind stays", () => {
  const world = createPrototypeWorld(1847);
  const mara = commanderOf(world);
  const ada = world.characters["character-13"];
  const sable = world.characters["character-24"];
  const toma = world.characters["character-07"];
  assert.equal(ada.name, "Ada Sorn");
  assert.equal(sable.name, "Sable Sorn");
  assert.equal(toma.name, "Toma Reef");

  sail(mara, "crown-harbor", "glassport", 4, 2);
  sail(ada, "crown-harbor", "glassport", 3, 2);
  ada.troops.count = 35;
  const overtaking = seaSightingsFor(world, mara)?.[ada.id];
  assert.ok(overtaking);
  assert.equal(overtaking.kind, "overtaking");
  assert.equal(
    overtaking.summary,
    "Ada Sorn is overtaking on this route, Crown Harbor to Glassport. 35 troops, 0 ticks old.",
  );

  sail(mara, "crown-harbor", "glassport", 4, 1);
  sail(sable, "glassport", "crown-harbor", 4, 2);
  sable.troops.count = 36;
  const passing = seaSightingsFor(world, mara)?.[sable.id];
  assert.ok(passing);
  assert.equal(passing.kind, "passing");
  assert.equal(
    passing.summary,
    "Sable Sorn is passing on the opposite course, Glassport to Crown Harbor. 36 troops, 0 ticks old.",
  );

  sail(toma, "cinder-key", "glassport", 2, 1);
  toma.troops.count = 42;
  const arriving = seaSightingsFor(world, mara)?.[toma.id];
  assert.ok(arriving);
  assert.equal(arriving.kind, "arriving");
  assert.equal(arriving.arriving, true);
  assert.equal(
    arriving.summary,
    "Toma Reef (World Government) is arriving at the same port, Cinder Key to Glassport. Docks at Glassport on this tick. 42 troops, 0 ticks old.",
  );
});

test("seed 1847 at tick 595 names Verdant Cay while she is held", () => {
  const result = runTicks(createPrototypeWorld(1847), 595);
  const commander = commanderOf(result.state);
  const view = dashboardState(result.state, result.events, fullEventFeed(result.events)) as {
    day: number;
    party: { resupply: { settlementId: string; provisions: number; price: number; reachable: boolean; travelTicks: number | null } | null };
    briefing: { items: Array<{ id: string; summary: string; settlementId: string | null }> };
  };
  assert.equal(result.state.tick, 595);
  assert.equal(view.day, 99.17);
  assert.equal(commander.captivity?.settlementId, "crown-harbor");
  assert.equal(commander.locationId, "crown-harbor");
  const starving = view.briefing.items.find((item) => item.id === "provision:critical");
  assert.ok(starving);
  assert.equal(starving.settlementId, "verdant-cay");
  assert.equal(
    starving.summary,
    "The hold is empty and 0.256 provisions per tick cannot be found. That costs health 0.205 per tick. Morale is already 0, so the shortage does not lower it. Morale gains nothing while the shortage lasts, so it will not recover on its own. Crown Harbor has no provisions to sell. Verdant Cay sells provisions, and you cannot reach it while you are held.",
  );
  assert.equal(starving.summary.includes("No market you could still reach sells provisions"), false);
  const resupply = view.party.resupply;
  assert.ok(resupply);
  assert.equal(resupply.settlementId, "verdant-cay");
  assert.equal(resupply.provisions, 269);
  assert.equal(resupply.price, 1.18);
  assert.equal(resupply.reachable, false);
  assert.equal(resupply.travelTicks, null);
});

test("seed 1847 at tick 679 shows only the rounded scarred loyalty", () => {
  const world = runTicks(createPrototypeWorld(1847), 679).state;
  const commander = commanderOf(world);
  const card = projectCharacter(world, commander, commander);
  assert.equal(world.tick, 679);
  assert.equal(commander.captivity, null);
  assert.equal(commander.loyaltyAdjustment, -0.04);
  assert.equal(card.loyalty, 0.768);
  assert.equal(
    card.loyaltyNote,
    "The seat reads 0.768. That rounded figure is the one the seat uses.",
  );
  assert.equal(/\d+\.\d{4,}/.test(String(card.loyaltyNote)), false);
  assert.equal(commander.personality.loyalty, 0.807927391717676);
  assert.equal(String(card.loyaltyNote).includes("0.807927391717676"), false);
  assert.equal(String(card.loyaltyNote).includes("0.767927391717676"), false);
});

test("Mina Vale at tick 72 says she named no ports, and 12 are held by World Government", () => {
  const world = runTicks(createPrototypeWorld(2718), 72).state;
  const before = stateHash(world);
  const mara = commanderOf(world);
  const mina = world.characters["character-15"];
  assert.equal(mina.name, "Mina Vale");
  assert.equal(world.tick, 72);
  const card = projectCharacter(world, mara, mina);
  const intel = card.captiveIntel as {
    troops: number;
    ports: unknown[];
    portsNote: string | null;
  };
  assert.equal(intel.troops, 12);
  assert.deepEqual(intel.ports, []);
  assert.equal(intel.portsNote, "Mina Vale named no ports. The list may be incomplete.");
  assert.equal((card.troops as { count: number }).count, 0);
  assert.equal(card.troopsNote, "0 with Mina Vale; 12 held by World Government. The experience and discipline are the troops now held by World Government.");
  assert.equal(mina.troops.count, 0);
  assert.equal(projectCharacter(world, mina, mina).captiveIntel, null);
  assert.equal(projectCharacter(world, mina, mina).troopsNote, null);
  assert.equal(stateHash(world), before);
});

test("an advance response rounds day the way the state does", async () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-readability-"));
  const app = createDashboardApp({ databasePath: join(directory, "dashboard.sqlite"), seed: 1847 });
  try {
    await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port");
    const base = `http://127.0.0.1:${address.port}`;
    const advance = await fetch(`${base}/api/advance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticks: 2 }),
    });
    const body = await advance.json() as { day: number; tick: number };
    assert.equal(body.tick, 2);
    assert.equal(body.day, 0.33);
    const state = await (await fetch(`${base}/api/state`)).json() as { day: number };
    assert.equal(state.day, 0.33);
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
