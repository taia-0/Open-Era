import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { dashboardState, fullEventFeed } from "../src/dashboard/view-model.ts";
import { captiveIntelFor, projectCharacter, type CaptiveIntel } from "../src/dashboard/visibility.ts";
import { runTick, runTicks } from "../src/sim/engine.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { partyPower, partyPowerFromTroops, stateHash } from "../src/sim/state.ts";
import type { Character, ReleaseSighting, SettlementKnowledge, WorldState } from "../src/sim/types.ts";

function commanderOf(world: WorldState): Character {
  return world.characters[world.players["prototype-player"].characterId];
}

function hold(
  character: Character,
  captorFactionId: string,
  settlementId: string,
  capturedTick: number,
  scatteredCount: number,
): void {
  character.captivity = {
    captorFactionId,
    settlementId,
    capturedTick,
    mandatoryReleaseTick: capturedTick + 84,
    cause: "failed-retreat",
    displayedRisk: "low",
    scatteredTroops: {
      count: scatteredCount,
      experience: character.troops.experience,
      discipline: character.troops.discipline,
    },
    releaseDestinationId: "glassport",
  };
  character.troops = { ...character.troops, count: 0 };
  character.locationId = settlementId;
  character.travel = null;
}

function belief(
  settlementId: string,
  factionId: string | null,
  source: SettlementKnowledge["source"],
  garrisonEstimate: number,
  observedTick: number,
  confidence = 1,
): SettlementKnowledge {
  return {
    settlementId,
    observedTick,
    confidence,
    factionId,
    garrisonEstimate,
    stocksEstimate: { provisions: 1, arms: 1, medicine: 1, shipMaterials: 1 },
    priceEstimate: { provisions: 2, arms: 2, medicine: 2, shipMaterials: 2 },
    source,
  };
}

function row(world: WorldState, reader: Character, prisoner: Character): CaptiveIntel | null {
  return projectCharacter(world, reader, prisoner).captiveIntel as CaptiveIntel | null;
}

test("a captor reads the captured strength, and the live power stays zero.", () => {
  const world = createPrototypeWorld(1847);
  const reader = commanderOf(world);
  const prisoner = Object.values(world.characters).find((character) => character.factionId !== reader.factionId);
  assert.ok(prisoner);
  assert.ok(reader.factionId);
  assert.ok(reader.locationId);
  world.tick = 12;
  hold(prisoner, reader.factionId, reader.locationId, 11, 12);

  const seen = row(world, reader, prisoner);
  assert.ok(seen);
  assert.equal(seen.troops, 12);
  assert.equal(seen.partyPower, partyPowerFromTroops(prisoner, prisoner.captivity!.scatteredTroops));
  assert.notEqual(seen.partyPower, 0);
  assert.equal(seen.observedTick, 11);
  assert.equal(seen.ageTicks, 1);
  assert.equal(seen.confidence, 1);
  assert.equal(seen.source, "direct");
  assert.equal(seen.leadership, prisoner.skills.leadership);
  assert.equal(seen.settlementId, reader.locationId);
  const projected = projectCharacter(world, reader, prisoner);
  assert.equal((projected.troops as { count: number }).count, 0);
  assert.equal(projected.partyPower, 0);
  assert.equal(partyPower(prisoner), 0);
  assert.notEqual(seen.troops, (projected.troops as { count: number }).count);
  assert.notEqual(seen.partyPower, projected.partyPower);
});

test("a port belief ignores a later live garrison.", () => {
  const world = createPrototypeWorld(1847);
  const reader = commanderOf(world);
  const prisoner = Object.values(world.characters).find((character) =>
    character.factionId !== null && character.factionId !== reader.factionId,
  );
  assert.ok(prisoner);
  assert.ok(reader.factionId);
  assert.ok(reader.locationId);
  assert.ok(prisoner.factionId);
  const ownPort = Object.values(world.settlements).find((settlement) => settlement.factionId === prisoner.factionId);
  assert.ok(ownPort);
  const unnamed = Object.values(world.settlements).find((settlement) => settlement.id !== ownPort.id);
  assert.ok(unnamed);
  unnamed.factionId = prisoner.factionId;
  world.tick = 35;
  hold(prisoner, reader.factionId, reader.locationId, 11, 9);
  prisoner.knowledge = {
    [ownPort.id]: belief(ownPort.id, prisoner.factionId, "direct", 11, -23, 0.76),
  };
  ownPort.garrison = 9999;
  unnamed.garrison = 9999;

  const seen = row(world, reader, prisoner);
  assert.ok(seen);
  assert.equal(seen.ports.length, 1);
  const port = seen.ports[0];
  assert.equal(port.settlementId, ownPort.id);
  assert.equal(port.garrisonEstimate, 11);
  assert.equal(port.observedTick, 0);
  assert.equal(port.ageTicks, 58);
  assert.equal(port.confidence, 0.76);
  assert.equal(port.displayConfidence, 0.34);
  assert.equal(port.source, "direct");
  assert.equal(port.stale, true);
  assert.equal(seen.ports.some((entry) => entry.settlementId === unnamed.id), false);
  assert.equal(JSON.stringify(seen).includes("9999"), false);
});

test("a rumor is not a port belief.", () => {
  const world = createPrototypeWorld(1847);
  const reader = commanderOf(world);
  const prisoner = Object.values(world.characters).find((character) => character.factionId !== reader.factionId);
  assert.ok(prisoner);
  assert.ok(reader.factionId);
  assert.ok(reader.locationId);
  assert.ok(prisoner.factionId);
  world.tick = 4;
  hold(prisoner, reader.factionId, reader.locationId, 3, 4);
  prisoner.knowledge = {
    "crown-harbor": belief("crown-harbor", prisoner.factionId, "rumor", 4242, 1, 0.4),
    "glassport": belief("glassport", "someone-else", "direct", 8, 1, 1),
  };

  const seen = row(world, reader, prisoner);
  assert.ok(seen);
  assert.equal(seen.ports.length, 0);
  assert.equal(JSON.stringify(seen).includes("4242"), false);
});

test("orders, money, and treasury stay off the row.", () => {
  const world = createPrototypeWorld(1847);
  const reader = commanderOf(world);
  const prisoner = Object.values(world.characters).find((character) => character.factionId !== reader.factionId);
  assert.ok(prisoner);
  assert.ok(reader.factionId);
  assert.ok(reader.locationId);
  world.tick = 6;
  hold(prisoner, reader.factionId, reader.locationId, 5, 6);
  prisoner.money = 123456.78;
  prisoner.standingOrders = [{
    id: "order-secret",
    issuerId: "character-14",
    directive: "pressure",
    targetId: "world-government",
    priority: 0.9,
    issuedTick: 0,
    expiresTick: null,
    revision: 1,
    status: "active",
    adherence: "following",
    statusChangedTick: 0,
    deviationCount: 0,
    lastReport: null,
  }];
  const faction = world.factions[prisoner.factionId ?? "free-tide"];
  faction.treasury = 987654.32;

  const seen = row(world, reader, prisoner);
  assert.ok(seen);
  const encoded = JSON.stringify(seen);
  assert.equal(encoded.includes("pressure"), false);
  assert.equal(encoded.includes("123456.78"), false);
  assert.equal(encoded.includes("987654.32"), false);
  assert.equal(encoded.includes("order-secret"), false);
});

test("the captor row ends at release.", () => {
  const world = createPrototypeWorld(1847);
  const reader = commanderOf(world);
  const prisoner = Object.values(world.characters).find((character) =>
    character.id !== reader.id && character.factionId !== reader.factionId,
  );
  assert.ok(prisoner);
  assert.ok(reader.factionId);
  const prison = reader.locationId ?? "crown-harbor";
  hold(prisoner, reader.factionId, prison, 0, 8);
  prisoner.captivity!.mandatoryReleaseTick = 0;
  prisoner.captivity!.releaseDestinationId = prison === "glassport" ? "crown-harbor" : "glassport";
  assert.ok(row(world, reader, prisoner));

  runTick(world);
  assert.equal(prisoner.captivity, null);
  assert.equal(row(world, reader, prisoner), null);
  const projected = projectCharacter(world, reader, prisoner);
  assert.equal(projected.captiveIntel, null);
  assert.equal(projected.troops, null);
  assert.equal(projected.partyPower, null);
});

test("a release record keeps the prison and does not follow it.", () => {
  const world = createPrototypeWorld(1847);
  const reader = commanderOf(world);
  const prisoner = Object.values(world.characters).find((character) =>
    character.id !== reader.id && character.locationId && !character.travel,
  );
  assert.ok(prisoner);
  const prison = prisoner.locationId!;
  const captor = world.settlements[prison].factionId ?? "world-government";
  hold(prisoner, captor, prison, 0, 5);
  prisoner.captivity!.mandatoryReleaseTick = 0;
  prisoner.captivity!.releaseDestinationId = prison === "glassport" ? "crown-harbor" : "glassport";

  const events = runTick(world).events;
  const upkeep = events.find((event) =>
    event.settlementId === prison && (event.type === "settlement-upkeep" || event.type === "settlement-shortage"),
  );
  assert.ok(upkeep);
  const record = prisoner.releaseSighting;
  assert.ok(record);
  assert.equal(record.garrison, upkeep.data.garrison);
  assert.equal(record.observedTick, 0);
  assert.equal(record.settlementId, prison);
  assert.equal(record.source, "direct");
  assert.equal(record.confidence, 1);
  world.settlements[prison].garrison = 9999;
  assert.equal(prisoner.releaseSighting?.garrison, upkeep.data.garrison);

  const own = projectCharacter(world, prisoner, prisoner).releaseSighting as { ageTicks: number; garrison: number };
  assert.equal(own.ageTicks, world.tick - record.observedTick);
  assert.equal(own.garrison, upkeep.data.garrison);
  assert.equal(projectCharacter(world, reader, prisoner).releaseSighting, null);

  const again = (): void => {
    prisoner.captivity = {
      captorFactionId: captor,
      settlementId: prison,
      capturedTick: world.tick,
      mandatoryReleaseTick: world.tick,
      cause: "failed-retreat",
      displayedRisk: "low",
      scatteredTroops: { count: 5, experience: 0.2, discipline: 0.2 },
      releaseDestinationId: prison === "glassport" ? "crown-harbor" : "glassport",
    };
    prisoner.locationId = prison;
    prisoner.travel = null;
  };

  again();
  const replacedAt = world.tick;
  runTick(world);
  assert.equal(prisoner.releaseSighting?.observedTick, replacedAt);
  const replacedGarrison = prisoner.releaseSighting?.garrison;
  world.settlements[prison].garrison = 8888;
  assert.equal(prisoner.releaseSighting?.garrison, replacedGarrison);

  const kept = prisoner.releaseSighting;
  assert.ok(kept);
  prisoner.releaseSighting = { ...kept, observedTick: 500, garrison: 111111 };
  again();
  runTick(world);
  assert.equal(prisoner.releaseSighting?.observedTick, 500);
  assert.equal(prisoner.releaseSighting?.garrison, 111111);
});

test("another faction does not read the prisoner.", () => {
  const world = createPrototypeWorld(1847);
  const reader = commanderOf(world);
  const prisoner = Object.values(world.characters).find((character) => character.factionId !== reader.factionId);
  const outsider = Object.values(world.characters).find((character) =>
    character.id !== reader.id && character.id !== prisoner?.id && character.factionId !== reader.factionId,
  );
  assert.ok(prisoner);
  assert.ok(outsider);
  assert.ok(reader.factionId);
  assert.ok(reader.locationId);
  world.tick = 8;
  hold(prisoner, reader.factionId, reader.locationId, 7, 3);
  assert.equal(row(world, outsider, prisoner), null);
  world.settlements[reader.locationId].factionId = outsider.factionId;
  assert.equal(row(world, outsider, prisoner), null);
  assert.ok(row(world, reader, prisoner));
  assert.equal(row(world, prisoner, prisoner), null);
  assert.equal(projectCharacter(world, prisoner, prisoner).captiveIntel, null);

  reader.locationId = null;
  reader.travel = { fromId: "crown-harbor", toId: "glassport", totalTicks: 4, remainingTicks: 3 };
  const distant = projectCharacter(world, reader, prisoner);
  assert.equal(distant.intelligence && (distant.intelligence as { tier: string }).tier, "distant");
  assert.equal(distant.troops, null);
  assert.equal(distant.captivity, null);
  assert.ok(distant.captiveIntel);
});

test("the captor derivation does not write the world.", () => {
  const world = createPrototypeWorld(1847);
  const reader = commanderOf(world);
  const prisoner = Object.values(world.characters).find((character) => character.id !== reader.id);
  assert.ok(prisoner);
  assert.ok(reader.factionId);
  assert.ok(reader.locationId);
  hold(prisoner, reader.factionId, reader.locationId, 1, 2);
  const hash = stateHash(world);
  const rng = world.rngState;
  projectCharacter(world, reader, prisoner);
  captiveIntelFor(world, reader, prisoner);
  assert.equal(stateHash(world), hash);
  assert.equal(world.rngState, rng);
  assert.equal(prisoner.releaseSighting, undefined);
  assert.equal(reader.releaseSighting, undefined);
});

test("a stale port belief warns, and the person row does not.", () => {
  const world = createPrototypeWorld(1847);
  const reader = commanderOf(world);
  const prisoner = Object.values(world.characters).find((character) =>
    character.factionId !== null && character.factionId !== reader.factionId,
  );
  assert.ok(prisoner);
  assert.ok(reader.factionId);
  assert.ok(reader.locationId);
  assert.ok(prisoner.factionId);
  world.tick = 20;
  hold(prisoner, reader.factionId, reader.locationId, 19, 4);
  prisoner.knowledge = {};
  const fresh = dashboardState(world, [], fullEventFeed([])) as {
    briefing: { items: Array<{ title: string; summary: string }> };
  };
  assert.equal(
    fresh.briefing.items.some((item) => item.summary.includes(`${prisoner.name}'s report of`)),
    false,
  );

  const port = Object.values(world.settlements).find((settlement) => settlement.factionId === prisoner.factionId);
  assert.ok(port);
  prisoner.knowledge = {
    ...prisoner.knowledge,
    [port.id]: belief(port.id, prisoner.factionId, "faction-report", 15, 0, 0.76),
  };
  const stale = dashboardState(world, [], fullEventFeed([])) as {
    briefing: { items: Array<{ title: string; summary: string }> };
  };
  const warning = stale.briefing.items.find((item) => item.summary.includes(`${prisoner.name}'s report of ${port.name}`));
  assert.ok(warning);
  assert.equal(warning.title, "Intelligence is stale");
});

test("Mina Vale's hold on seed 1847 matches the note.", () => {
  // Treasury spending moved this capture off seed 2718 tick 72. The balance share moved it to tick 137.
  const world = createPrototypeWorld(1847);
  runTicks(world, 138);
  const mara = world.characters["character-01"];
  const mina = world.characters["character-15"];
  assert.equal(world.tick, 138);
  assert.equal(mara.locationId, "crown-harbor");
  assert.equal(mara.travel, null);
  assert.equal(mina.locationId, "crown-harbor");
  assert.equal(mina.troops.count, 0);
  assert.equal(partyPower(mina), 0);
  assert.equal(mina.captivity?.scatteredTroops.count, 7);
  assert.equal(mina.captivity?.capturedTick, 137);
  assert.equal(mina.captivity?.captorFactionId, "world-government");

  const seen = row(world, mara, mina);
  assert.ok(seen);
  assert.equal(seen.troops, 7);
  assert.equal(seen.partyPower, 52.59);
  assert.equal(seen.leadership, 25);
  assert.equal(seen.observedTick, 137);
  assert.equal(seen.ageTicks, 1);
  assert.equal(seen.confidence, 1);
  assert.equal(seen.source, "direct");
  assert.equal(seen.settlementId, "crown-harbor");
  assert.equal(seen.portsNote, null);
  assert.equal("garrisonEstimate" in seen, false);
  const encoded = JSON.stringify(seen);
  assert.equal(encoded.includes("110.08"), false);

  const hash = stateHash(world);
  projectCharacter(world, mara, mina);
  assert.equal(stateHash(world), hash);

  runTicks(world, 84);
  assert.equal(world.tick, 222);
  assert.equal(mina.captivity, null);
  assert.equal(row(world, mara, mina), null);
  const projected = projectCharacter(world, mara, mina);
  assert.equal(projected.troops, null);
  assert.equal(projected.partyPower, null);
  assert.equal(projected.captiveIntel, null);
  assert.equal(projected.releaseSighting, null);
  assert.equal(mara.releaseSighting, undefined);
  assert.equal(mina.travel?.fromId, "crown-harbor");
  assert.equal(mina.travel?.toId, "cinder-key");
  assert.equal(mina.travel?.remainingTicks, 4);
  assert.equal(mina.travel?.totalTicks, 5);

  const release = projectCharacter(world, mina, mina).releaseSighting as {
    settlementId: string;
    factionId: string;
    captorFactionId: string;
    garrison: number;
    observedTick: number;
    ageTicks: number;
    parties: Array<{ characterId: string; troops: number; partyPower: number }>;
  };
  assert.equal(release.settlementId, "crown-harbor");
  assert.equal(release.factionId, "world-government");
  assert.equal(release.captorFactionId, "world-government");
  assert.equal(release.garrison, 168);
  assert.equal(release.observedTick, 221);
  assert.equal(release.ageTicks, 1);
  assert.deepEqual(
    release.parties.map((party) => [party.characterId, party.troops, party.partyPower]),
    [
      ["character-01", 80, 194.678],
      ["character-06", 35, 88.984],
      ["character-19", 0, 0],
      ["character-24", 91, 147.877],
      ["character-25", 107, 175.092],
    ],
  );
});

/**
 * Replay from one snapshot through `through`, using `WorldStore.recover`.
 *
 * A snapshot the store would not have written on its own is inserted at
 * `splitAt`, and every later snapshot is removed, so recover starts there.
 */
function recoverThrough(seed: number, splitAt: number, through: number, characterId: string): {
  liveHash: string;
  rebuiltHash: string;
  replayedEvents: number;
  liveRecord: ReleaseSighting | undefined;
  rebuiltRecord: ReleaseSighting | undefined;
} {
  const live = runTicks(createPrototypeWorld(seed), through).state;
  const directory = mkdtempSync(join(tmpdir(), "open-era-release-recovery-"));
  const databasePath = join(directory, "world.sqlite");
  const store = new WorldStore(databasePath);
  try {
    const world = createPrototypeWorld(seed);
    store.initialize(world);
    let splitSequence: number | null = null;
    let splitJson: string | null = null;
    let splitHash: string | null = null;
    for (let index = 0; index < through; index += 1) {
      const result = runTick(world);
      store.appendTick(result.events, world);
      if (world.tick === splitAt && splitSequence === null) {
        splitSequence = result.events.at(-1)!.sequence;
        splitJson = JSON.stringify(world);
        splitHash = stateHash(world);
      }
    }
    assert.ok(splitSequence !== null && splitJson !== null && splitHash !== null, `no state at tick ${splitAt}`);
    store.database.prepare(
      "INSERT OR REPLACE INTO snapshots(sequence, tick, state_json, state_hash) VALUES (?, ?, ?, ?)",
    ).run(splitSequence, splitAt, splitJson, splitHash);
    store.database.prepare("DELETE FROM snapshots WHERE tick > ?").run(splitAt);
    const recovered = store.recover();
    assert.ok(recovered.replayedEvents > 0, "the split must replay events, not restore the final snapshot");
    assert.equal(recovered.state.tick, through);
    return {
      liveHash: stateHash(live),
      rebuiltHash: stateHash(recovered.state),
      replayedEvents: recovered.replayedEvents,
      liveRecord: live.characters[characterId]?.releaseSighting,
      rebuiltRecord: recovered.state.characters[characterId]?.releaseSighting,
    };
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

test("Mara Calder's release at tick 204 recovers from the tick 198 snapshot", () => {
  // Treasury spending moved Sable Morrow's tick 118 release. Mara Calder's release is the replay check now.
  const live = runTicks(createPrototypeWorld(1847), 204).state;
  const calder = live.characters["character-21"];
  assert.equal(calder.name, "Mara Calder");
  assert.equal(calder.captivity, null);
  assert.equal(calder.releaseSighting?.observedTick, 203);
  // The balance share moved the garrison on this same release.
  assert.equal(calder.releaseSighting?.garrison, 175);
  const split = recoverThrough(1847, 198, 204, "character-21");
  assert.equal(split.rebuiltHash, split.liveHash);
  assert.equal(split.liveHash, stateHash(live));
  assert.deepEqual(split.rebuiltRecord, calder.releaseSighting);
});

test("Mina Vale's release recovers from the tick 138 snapshot", () => {
  // Treasury spending moved her release off seed 2718. The balance share moved seed 1847 to tick 221.
  const live = runTicks(createPrototypeWorld(1847), 222).state;
  const mina = live.characters["character-15"];
  assert.equal(mina.name, "Mina Vale");
  assert.equal(mina.releaseSighting?.observedTick, 221);
  assert.equal(mina.releaseSighting?.garrison, 168);
  const split = recoverThrough(1847, 138, 222, "character-15");
  assert.equal(split.rebuiltHash, split.liveHash);
  assert.equal(split.liveHash, stateHash(live));
  assert.deepEqual(split.rebuiltRecord, mina.releaseSighting);
});

test("seed 2718 replays through tick 160 from the tick 100 and tick 150 snapshots", () => {
  const live = runTicks(createPrototypeWorld(2718), 160).state;
  const liveHash = stateHash(live);
  for (const splitAt of [100, 150]) {
    const split = recoverThrough(2718, splitAt, 160, "character-15");
    assert.equal(split.rebuiltHash, liveHash, `tick ${splitAt} rebuilt ${split.rebuiltHash}`);
    assert.equal(split.liveHash, liveHash);
    assert.deepEqual(split.rebuiltRecord, live.characters["character-15"].releaseSighting);
  }
});
