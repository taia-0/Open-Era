import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { characterCadence, runTick, runTicks } from "../src/sim/engine.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { applyEvent, canonicalJson, factionPower, round, stateHash } from "../src/sim/state.ts";
import type { WorldState } from "../src/sim/types.ts";

test("the same seed produces byte-for-byte deterministic events and state", () => {
  const first = runTicks(createPrototypeWorld(1847), 24);
  const second = runTicks(createPrototypeWorld(1847), 24);

  assert.equal(stateHash(first.state), stateHash(second.state));
  assert.equal(canonicalJson(first.events), canonicalJson(second.events));
});

test("different seeds create different histories", () => {
  const first = runTicks(createPrototypeWorld(1847), 12);
  const second = runTicks(createPrototypeWorld(9051), 12);

  assert.notEqual(stateHash(first.state), stateHash(second.state));
});

test("recovery from a snapshot plus event replay matches uninterrupted simulation", () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-recovery-"));
  const databasePath = join(directory, "world.sqlite");
  try {
    const baseline = runTicks(createPrototypeWorld(333), 19).state;
    const interrupted = createPrototypeWorld(333);
    const store = new WorldStore(databasePath);
    store.initialize(interrupted);
    for (let index = 0; index < 13; index += 1) {
      const result = runTick(interrupted);
      store.appendTick(result.events, interrupted);
    }
    const interruptedHash = stateHash(interrupted);
    store.close();

    const reopened = new WorldStore(databasePath);
    const recovered = reopened.recover();
    assert.ok(recovered.replayedEvents > 0, "expected recovery to replay post-snapshot events");
    assert.equal(recovered.state.tick, 13);
    assert.equal(stateHash(recovered.state), interruptedHash);

    for (let index = 0; index < 6; index += 1) {
      const result = runTick(recovered.state);
      reopened.appendTick(result.events, recovered.state);
    }
    assert.equal(stateHash(recovered.state), stateHash(baseline));
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the pressure-test scenario exercises its connected systems", () => {
  const result = runTicks(createPrototypeWorld(1847), 24);
  const types = new Set(result.events.map((event) => event.type));

  for (const expected of [
    "decision-made",
    "settlement-produced",
    "market-trade",
    "travel-started",
    "arrived",
    "worked",
    "recruited",
    "battle-resolved",
    "metrics-recorded",
  ]) {
    assert.ok(types.has(expected), `expected an event of type ${expected}`);
  }

  const sequences = result.events.map((event) => event.sequence);
  assert.deepEqual(sequences, Array.from({ length: sequences.length }, (_, index) => index + 1));
});

test("a faction that loses its last port keeps its record until a claim restores one", () => {
  const world = createPrototypeWorld(1847);
  const factionId = "free-tide";
  const faction = world.factions[factionId];
  const memberIds = Object.values(world.characters)
    .filter((character) => character.factionId === factionId)
    .map((character) => character.id)
    .sort();
  const treasury = faction.treasury;
  assert.equal(
    Object.values(world.settlements).filter((settlement) => settlement.factionId === factionId).length,
    1,
    "Free Tide opens with one port, so reassigning it is the landless case",
  );

  world.settlements["cinder-key"].factionId = "world-government";
  assert.equal(world.factions[factionId], faction, "the faction record is not deleted");
  assert.equal(faction.id, factionId);
  assert.equal(faction.treasury, treasury);
  assert.deepEqual(
    Object.values(world.characters)
      .filter((character) => character.factionId === factionId)
      .map((character) => character.id)
      .sort(),
    memberIds,
  );
  assert.equal(Number.isFinite(factionPower(world, factionId)), true);
  assert.equal(
    Object.values(world.settlements).some((settlement) => settlement.factionId === factionId),
    false,
  );

  const early: ReturnType<typeof runTick>["events"] = [];
  assert.doesNotThrow(() => {
    for (let index = 0; index < 40; index += 1) early.push(...runTick(world).events);
  });
  assert.equal(world.tick, 40);
  assert.equal(world.factions[factionId], faction);
  // Members draw the daily allowance, so this balance is no longer the opening figure.
  assert.equal(Number.isFinite(faction.treasury), true);
  assert.equal(Number.isFinite(factionPower(world, factionId)), true);
  assert.deepEqual(
    Object.values(world.characters)
      .filter((character) => character.factionId === factionId)
      .map((character) => character.id)
      .sort(),
    memberIds,
  );

  const restores = (events: typeof early) => events.find((event) =>
    event.type === "settlement-claimed" && event.data.factionId === factionId
  );
  let claim = restores(early);
  for (let index = 0; index < 160 && !claim; index += 1) {
    claim = restores(runTick(world).events);
  }
  assert.ok(claim, "a later claim restores a port onto the landless faction");
  assert.equal(world.settlements[claim.settlementId!].factionId, factionId);
  assert.deepEqual(
    Object.values(world.characters)
      .filter((character) => character.factionId === factionId)
      .map((character) => character.id)
      .sort(),
    memberIds,
  );
});

function forceCapture(world: WorldState, characterId: string): void {
  const character = world.characters[characterId];
  const settlementId = character.locationId ?? "crown-harbor";
  const settlement = world.settlements[settlementId];
  applyEvent(world, {
    sequence: world.nextEventSequence,
    tick: world.tick,
    type: "character-captured",
    actorId: characterId,
    targetId: settlement.factionId ?? undefined,
    settlementId,
    data: {
      battleId: `seat-test-${characterId}`,
      cause: "major-defeat",
      displayedRisk: "high",
      health: character.health,
      morale: character.morale,
      captivity: {
        captorFactionId: settlement.factionId,
        settlementId,
        capturedTick: world.tick,
        mandatoryReleaseTick: world.tick + 84,
        cause: "major-defeat",
        displayedRisk: "high",
        scatteredTroops: { ...character.troops },
        releaseDestinationId: null,
      },
    },
  });
}

function forceRelease(world: WorldState, characterId: string): void {
  const character = world.characters[characterId];
  applyEvent(world, {
    sequence: world.nextEventSequence,
    tick: world.tick,
    type: "captivity-released",
    actorId: characterId,
    settlementId: character.captivity?.settlementId,
    data: {
      characterMoney: character.money,
      releaseLocationId: character.captivity?.settlementId ?? character.locationId,
      troopRecovery: null,
      travel: null,
    },
  });
}

function forceEscape(world: WorldState, characterId: string): void {
  const character = world.characters[characterId];
  applyEvent(world, {
    sequence: world.nextEventSequence,
    tick: world.tick,
    type: "captivity-escaped",
    actorId: characterId,
    settlementId: character.captivity?.settlementId,
    data: {
      health: character.health,
      morale: character.morale,
      attributes: character.attributes,
      releaseLocationId: character.captivity?.settlementId ?? character.locationId,
      troopRecovery: null,
      travel: null,
    },
  });
}

function issuedOrders(world: WorldState, issuerId: string) {
  return Object.values(world.characters).flatMap((character) =>
    character.standingOrders
      .filter((order) => order.issuerId === issuerId)
      .map((order) => ({
        id: order.id,
        holderId: character.id,
        issuerId: order.issuerId,
        targetId: order.targetId ?? null,
        status: order.status,
        directive: order.directive,
      }))
  );
}

test("a captive command holder is covered until release, and the cover does not take the orders", () => {
  for (const seed of [1847, 2718, 4096]) {
    const world = createPrototypeWorld(seed);
    const player = world.players["prototype-player"];
    const mara = world.characters[player.characterId];
    assert.equal(mara.name, "Mara Vane");
    assert.equal(Object.hasOwn(world.factions["world-government"], "actingCommanderId"), false);
    assert.equal(Object.hasOwn(world.factions["free-tide"], "actingCommanderId"), false);

    const orders = issuedOrders(world, mara.id);
    const tax = world.factions["world-government"].taxRate;
    const rng = world.rngState;
    forceCapture(world, mara.id);
    assert.equal(world.factions["world-government"].actingCommanderId, player.reportingOfficerId);
    assert.deepEqual(issuedOrders(world, mara.id), orders);
    assert.equal(world.factions["world-government"].taxRate, tax);
    assert.equal(world.rngState, rng);
    const cover = world.characters[player.reportingOfficerId!];
    assert.equal(cover.standingOrders.some((order) => order.issuerId === cover.id), false);
    forceRelease(world, mara.id);
    assert.equal(Object.hasOwn(world.factions["world-government"], "actingCommanderId"), false);
  }

  const covered = createPrototypeWorld(4096);
  const pax = covered.characters["character-14"];
  assert.equal(pax.name, "Pax Ash");
  const corin = covered.characters["character-16"];
  assert.equal(corin.name, "Corin Hale");
  const paxOrders = issuedOrders(covered, pax.id);
  const paxTax = covered.factions["free-tide"].taxRate;
  const paxRng = covered.rngState;
  forceCapture(covered, pax.id);
  assert.equal(covered.factions["free-tide"].actingCommanderId, corin.id);
  assert.deepEqual(issuedOrders(covered, pax.id), paxOrders);
  assert.equal(covered.factions["free-tide"].taxRate, paxTax);
  assert.equal(covered.rngState, paxRng);
  forceCapture(covered, corin.id);
  assert.equal(covered.characters["character-22"].name, "Bram Tern");
  assert.equal(covered.factions["free-tide"].actingCommanderId, "character-22");
  assert.deepEqual(issuedOrders(covered, pax.id), paxOrders);
  forceRelease(covered, pax.id);
  assert.equal(Object.hasOwn(covered.factions["free-tide"], "actingCommanderId"), false);
  assert.equal(corin.captivity === null, false);

  const locked = createPrototypeWorld(4096);
  forceCapture(locked, "character-16");
  assert.equal(Object.hasOwn(locked.factions["free-tide"], "actingCommanderId"), false);
  forceCapture(locked, "character-14");
  assert.equal(locked.factions["free-tide"].actingCommanderId, "character-22");
  forceRelease(locked, "character-16");
  assert.equal(locked.factions["free-tide"].actingCommanderId, "character-22");
  forceRelease(locked, "character-14");
  assert.equal(Object.hasOwn(locked.factions["free-tide"], "actingCommanderId"), false);

  const escaped = createPrototypeWorld(4096);
  forceCapture(escaped, "character-14");
  assert.equal(escaped.factions["free-tide"].actingCommanderId, "character-16");
  forceEscape(escaped, "character-14");
  assert.equal(Object.hasOwn(escaped.factions["free-tide"], "actingCommanderId"), false);
  assert.equal(escaped.characters["character-14"].captivity, null);
});

test("Jun Marrow's seeded score still covers Mara, and a -0.08 scar names Bram Quill", () => {
  const named = (world: WorldState, name: string) => {
    const found = Object.values(world.characters).find((character) => character.name === name);
    assert.ok(found, name);
    return found;
  };
  const seeded = createPrototypeWorld(1847);
  const jun = named(seeded, "Jun Marrow");
  const bram = named(seeded, "Bram Quill");
  const mara = named(seeded, "Mara Vane");
  const seededScore = (leadership: number, loyalty: number) => round(leadership + loyalty * 50, 3);
  assert.equal(seededScore(jun.skills.leadership, jun.personality.loyalty), 97.508);
  assert.equal(seededScore(bram.skills.leadership, bram.personality.loyalty), 94.184);
  const rng = seeded.rngState;
  const orders = issuedOrders(seeded, mara.id);
  forceCapture(seeded, mara.id);
  assert.equal(seeded.rngState, rng);
  assert.equal(seeded.factions["world-government"].actingCommanderId, jun.id);
  assert.deepEqual(issuedOrders(seeded, mara.id), orders);
  assert.equal(Object.hasOwn(jun, "loyaltyAdjustment"), false);

  const scarred = createPrototypeWorld(1847);
  const scarredJun = named(scarred, "Jun Marrow");
  const scarredMara = named(scarred, "Mara Vane");
  scarredJun.loyaltyAdjustment = -0.08;
  assert.equal(
    seededScore(scarredJun.skills.leadership, scarredJun.personality.loyalty + scarredJun.loyaltyAdjustment),
    93.508,
  );
  const scarredRng = scarred.rngState;
  forceCapture(scarred, scarredMara.id);
  assert.equal(scarred.rngState, scarredRng);
  assert.equal(scarred.factions["world-government"].actingCommanderId, named(scarred, "Bram Quill").id);
  assert.equal(scarredJun.personality.loyalty, jun.personality.loyalty);
  assert.equal(scarredJun.loyaltyAdjustment, -0.08);
});

test("a character's periodic cadence stays distinct once ids outgrow two digits", () => {
  // This offset used to come from `id.slice(-2)`, which reads character-100 and
  // character-101 as the same "00" and "01" as the first two characters. The
  // zero-padded prototype roster hides that, so the aliasing is asserted
  // directly rather than waited for.
  const cadences = ["character-01", "character-02", "character-100", "character-101"].map(characterCadence);
  assert.deepEqual(cadences, [1, 2, 100, 101]);
  assert.equal(new Set(cadences).size, cadences.length, "two characters must not share one cadence slot");

  // A malformed id must not throw or poison the modular arithmetic with NaN.
  assert.equal(characterCadence("character-"), 0);
  assert.equal(characterCadence("character-abc"), 0);
});

test("every character's relationships are reviewed on one tick per day", () => {
  const world = createPrototypeWorld(1847);
  const ids = Object.keys(world.characters);
  // A stagger is only a stagger if it spreads work out rather than collapsing it
  // onto a single tick, and it must revisit each character exactly once a day.
  for (const id of ids) {
    const offset = characterCadence(id);
    const days = Array.from({ length: world.ticksPerDay }, (_, tick) => (tick + offset) % world.ticksPerDay);
    assert.equal(days.filter((value) => value === 0).length, 1, `${id} must be reviewed once per day`);
  }
});
