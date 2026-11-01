import assert from "node:assert/strict";
import test from "node:test";
import { projectCharacter, seaSightingsFor, type SeaSighting } from "../src/dashboard/visibility.ts";
import { submitCommand } from "../src/sim/commands.ts";
import { runTick } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { partyPower, stateHash } from "../src/sim/state.ts";
import type { Character, TravelState, WorldState } from "../src/sim/types.ts";

function commanderOf(world: WorldState): Character {
  return world.characters[world.players["prototype-player"].characterId];
}

function otherThan(world: WorldState, id: string): Character {
  const found = Object.values(world.characters)
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    .find((character) => character.id !== id);
  assert.ok(found);
  return found;
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

function row(world: WorldState, observer: Character, subject: Character): SeaSighting | null {
  const projected = projectCharacter(world, observer, subject);
  return projected.seaSighting as SeaSighting | null;
}

function leg(travel: TravelState | null): string {
  assert.ok(travel);
  return `${travel.fromId} ${travel.remainingTicks}/${travel.totalTicks}`;
}

test("two ships that cast off together share the departure snapshot.", () => {
  const world = createPrototypeWorld(1847);
  const observer = commanderOf(world);
  const subject = otherThan(world, observer.id);
  world.tick = 11;
  sail(observer, "crown-harbor", "glassport", 4, 4);
  sail(subject, "crown-harbor", "glassport", 4, 4);

  const seen = row(world, observer, subject);
  assert.ok(seen);
  assert.equal(seen.kind, "sharing");
  assert.equal(seen.arriving, false);
  assert.equal(seen.confidence, 1);
  assert.equal(seen.source, "direct");
  assert.equal(seen.observedTick, world.tick);
  assert.equal(seen.ageTicks, 0);
  assert.equal(seen.sailors, subject.sailors);
  assert.equal(seen.troops, subject.troops.count);
  assert.equal(seen.partyPower, partyPower(subject));
  assert.equal(seen.characterId, subject.id);
  assert.equal(seen.factionId, subject.factionId);
  assert.equal(seen.fromId, "crown-harbor");
  assert.equal(seen.toId, "glassport");
  assert.equal("captivity" in seen, false);

  const own = projectCharacter(world, observer, observer);
  const list = own.seaSightings as Record<string, SeaSighting>;
  assert.equal(list[subject.id].kind, "sharing");
  assert.equal(list[observer.id], undefined);
  assert.equal(projectCharacter(world, observer, subject).seaSightings, null);
});

test("a ship one step ahead on the same duration is not alongside.", () => {
  const world = createPrototypeWorld(1847);
  const observer = commanderOf(world);
  const subject = otherThan(world, observer.id);
  sail(observer, "crown-harbor", "glassport", 4, 4);
  sail(subject, "crown-harbor", "glassport", 4, 3);

  assert.equal(row(world, observer, subject), null);
  assert.equal(row(world, subject, observer), null);
  const list = seaSightingsFor(world, observer);
  assert.ok(list);
  assert.equal(list[subject.id], undefined);
});

test("different durations whose spans overlap are an overtaking.", () => {
  const world = createPrototypeWorld(1847);
  const observer = commanderOf(world);
  const subject = otherThan(world, observer.id);
  sail(observer, "crown-harbor", "glassport", 4, 2);
  sail(subject, "crown-harbor", "glassport", 3, 2);

  const forward = row(world, observer, subject);
  const back = row(world, subject, observer);
  assert.ok(forward);
  assert.ok(back);
  assert.equal(forward.kind, "overtaking");
  assert.equal(back.kind, "overtaking");
  assert.equal(forward.arriving, false);
  assert.equal(back.arriving, false);
});

test("opposite spans that meet are a passing.", () => {
  const world = createPrototypeWorld(1847);
  const observer = commanderOf(world);
  const subject = otherThan(world, observer.id);
  sail(observer, "crown-harbor", "glassport", 4, 1);
  sail(subject, "glassport", "crown-harbor", 4, 2);

  const passing = row(world, observer, subject);
  assert.ok(passing);
  assert.equal(passing.kind, "passing");
  assert.equal(passing.arriving, false);
  assert.equal(row(world, subject, observer)?.kind, "passing");

  sail(subject, "glassport", "crown-harbor", 4, 4);
  assert.equal(row(world, observer, subject), null);
  assert.equal(row(world, subject, observer), null);
});

test("both on the last tick, different origins, same destination, is arriving.", () => {
  const world = createPrototypeWorld(1847);
  const observer = commanderOf(world);
  const subject = otherThan(world, observer.id);
  sail(observer, "crown-harbor", "glassport", 4, 1);
  sail(subject, "cinder-key", "glassport", 3, 1);

  const arriving = row(world, observer, subject);
  assert.ok(arriving);
  assert.equal(arriving.kind, "arriving");
  assert.equal(arriving.arriving, true);
  assert.equal(row(world, subject, observer)?.kind, "arriving");

  sail(observer, "crown-harbor", "glassport", 4, 1);
  sail(subject, "crown-harbor", "glassport", 4, 1);
  const sharing = row(world, observer, subject);
  assert.ok(sharing);
  assert.equal(sharing.kind, "sharing");
  assert.equal(sharing.arriving, true);

  sail(subject, "crown-harbor", "glassport", 3, 1);
  const overtaking = row(world, observer, subject);
  assert.ok(overtaking);
  assert.equal(overtaking.kind, "overtaking");
  assert.equal(overtaking.arriving, true);
});

test("a ship in port is absent, and so is a captive.", () => {
  const world = createPrototypeWorld(1847);
  const observer = commanderOf(world);
  const subject = otherThan(world, observer.id);
  sail(observer, "crown-harbor", "glassport", 4, 2);
  subject.travel = null;
  subject.locationId = "glassport";
  assert.equal(row(world, observer, subject), null);

  subject.captivity = {
    captorFactionId: "free-tide",
    settlementId: "glassport",
    capturedTick: 0,
    mandatoryReleaseTick: 40,
    cause: "outscore-loss",
    displayedRisk: "low",
    scatteredTroops: { ...subject.troops },
    releaseDestinationId: "crown-harbor",
  };
  assert.equal(row(world, observer, subject), null);
  assert.equal(seaSightingsFor(world, subject), null);

  observer.travel = null;
  observer.locationId = "crown-harbor";
  sail(subject, "crown-harbor", "glassport", 4, 2);
  subject.captivity = null;
  assert.equal(projectCharacter(world, observer, observer).seaSightings, null);
  assert.equal(row(world, observer, subject), null);
});

test("the hold stays off the row.", () => {
  const world = createPrototypeWorld(1847);
  const observer = commanderOf(world);
  const subject = otherThan(world, observer.id);
  sail(observer, "crown-harbor", "glassport", 4, 4);
  sail(subject, "crown-harbor", "glassport", 4, 4);
  subject.cargo = { provisions: 424242.42, arms: 4242, medicine: 4242, shipMaterials: 4242 };
  subject.money = 987654;

  const seen = row(world, observer, subject);
  assert.ok(seen);
  const encoded = JSON.stringify(seen);
  assert.equal(encoded.includes("424242"), false);
  assert.equal(encoded.includes("987654"), false);
  assert.equal(encoded.includes("cargo"), false);
  assert.equal(encoded.includes("money"), false);

  const projected = projectCharacter(world, observer, subject);
  assert.equal(projected.cargo, null);
  assert.equal(projected.money, null);
  assert.equal(projected.troops, null);
  assert.equal(projected.partyPower, null);
});

test("separating drops the row and does not leave a troop count.", () => {
  const world = createPrototypeWorld(1847);
  const observer = commanderOf(world);
  const subject = otherThan(world, observer.id);
  sail(observer, "crown-harbor", "glassport", 4, 4);
  sail(subject, "crown-harbor", "glassport", 4, 4);
  assert.equal(row(world, observer, subject)?.kind, "sharing");

  sail(subject, "crown-harbor", "glassport", 4, 1);
  assert.equal(row(world, observer, subject), null);
  assert.equal(projectCharacter(world, observer, subject).troops, null);

  subject.troops.count = 9999;
  const apart = projectCharacter(world, observer, subject);
  assert.equal(apart.seaSighting, null);
  assert.equal(apart.troops, null);
  assert.equal(JSON.stringify(apart).includes("9999"), false);
});

test("the derivation does not write the world.", () => {
  const world = createPrototypeWorld(1847);
  const observer = commanderOf(world);
  const subject = otherThan(world, observer.id);
  sail(observer, "crown-harbor", "glassport", 4, 4);
  sail(subject, "crown-harbor", "glassport", 4, 4);
  assert.equal(world.version, 5);
  assert.equal(observer.partySightings, undefined);
  assert.equal(subject.partySightings, undefined);
  const hash = stateHash(world);
  const rng = world.rngState;
  const sequence = world.nextEventSequence;

  const seen = row(world, observer, subject);
  assert.ok(seen);
  assert.equal(seaSightingsFor(world, observer)?.[subject.id].kind, "sharing");
  assert.equal(stateHash(world), hash);
  assert.equal(world.rngState, rng);
  assert.equal(world.nextEventSequence, sequence);
  assert.equal(observer.partySightings, undefined);
  assert.equal(subject.partySightings, undefined);
  assert.equal(world.version, 5);
});

test("the commanded Glassport crossing names Ada at tick 2 and is gone at tick 4.", () => {
  const world = createPrototypeWorld(1847);
  const mara = commanderOf(world);
  assert.equal(mara.name, "Mara Vane");
  assert.equal(mara.locationId, "crown-harbor");
  const submitted = submitCommand(world, {
    playerId: "prototype-player",
    type: "character-action",
    action: "travel",
    targetId: "glassport",
  });
  assert.equal(submitted.ok, true);

  runTick(world);
  runTick(world);
  assert.equal(world.tick, 2);
  assert.equal(leg(mara.travel), "crown-harbor 2/4");
  assert.equal(mara.locationId, null);

  const ada = world.characters["character-13"];
  assert.equal(ada.name, "Ada Sorn");
  assert.equal(leg(ada.travel), "crown-harbor 2/3");
  const adaRow = row(world, mara, ada);
  assert.ok(adaRow);
  assert.equal(adaRow.kind, "overtaking");
  assert.equal(adaRow.arriving, false);
  assert.equal(adaRow.sailors, 18);
  assert.equal(adaRow.troops, 35);
  assert.equal(adaRow.partyPower, 81.529);
  assert.equal(adaRow.confidence, 1);
  assert.equal(adaRow.source, "direct");
  assert.equal(adaRow.observedTick, 2);
  assert.equal(adaRow.ageTicks, 0);
  assert.equal(adaRow.factionId, "world-government");
  assert.equal(
    adaRow.summary,
    "Ada Sorn is overtaking on this route, Crown Harbor to Glassport. 35 troops, 0 ticks old.",
  );
  const adaProjected = projectCharacter(world, mara, ada);
  assert.equal(adaProjected.troops, null);
  assert.equal(adaProjected.partyPower, null);
  assert.equal(adaProjected.cargo, null);
  assert.equal(adaProjected.money, null);

  runTick(world);
  assert.equal(world.tick, 3);
  // Port balance (home starts): the opposite-course ship at tick 3 is Sable Morrow (was Sable Sorn,
  // who now sails from Verdant Cay), and the tagged arriving ship is Toma Hale (unaffiliated) from
  // Verdant Cay (was Toma Reef, World Government, from Cinder Key).
  const sable = world.characters["character-04"];
  assert.equal(sable.name, "Sable Morrow");
  assert.equal(leg(sable.travel), "glassport 2/4");
  const sableRow = row(world, mara, sable);
  assert.ok(sableRow);
  assert.equal(sableRow.kind, "passing");
  assert.equal(sableRow.sailors, 22);
  assert.equal(sableRow.troops, 18);
  assert.equal(sableRow.partyPower, 69.441);
  assert.equal(
    sableRow.summary,
    "Sable Morrow is passing on the opposite course, Glassport to Crown Harbor. 18 troops, 0 ticks old.",
  );
  const adaLater = row(world, mara, ada);
  assert.equal(adaLater?.kind, "overtaking");
  assert.equal(adaLater?.arriving, true);
  assert.equal(
    adaLater?.summary,
    "Ada Sorn is overtaking on this route, Crown Harbor to Glassport. Docks at Glassport on this tick. 35 troops, 0 ticks old.",
  );
  const toma = world.characters["character-27"];
  assert.equal(toma.name, "Toma Hale");
  const tomaRow = row(world, mara, toma);
  assert.equal(tomaRow?.kind, "arriving");
  assert.equal(
    tomaRow?.summary,
    "Toma Hale (unaffiliated) is arriving at the same port, Verdant Cay to Glassport. Docks at Glassport on this tick. 16 troops, 0 ticks old.",
  );

  runTick(world);
  assert.equal(world.tick, 4);
  assert.equal(mara.locationId, "glassport");
  assert.equal(mara.travel, null);
  assert.equal(projectCharacter(world, mara, mara).seaSightings, null);
  assert.equal(row(world, mara, ada), null);
});
