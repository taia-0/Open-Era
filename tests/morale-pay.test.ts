import assert from "node:assert/strict";
import test from "node:test";
import { projectCharacter, projectEvent } from "../src/dashboard/visibility.ts";
import { PASSAGE_COST_PER_TICK, runTick } from "../src/sim/engine.ts";
import { shortPayMember } from "../src/sim/allowance.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { clamp, commandHolderId, round } from "../src/sim/state.ts";
import type { Character, SimEvent, WorldState } from "../src/sim/types.ts";

function hungerAndTravel(character: Character, shortage: number, traveling: boolean): number {
  return clamp(
    character.morale - shortage * 2.4 - (traveling ? 0.03 : 0) + (shortage === 0 ? 0.04 : 0),
    0,
    100,
  );
}

test("a short mate loses 0.5 morale on upkeep and the holder does not", () => {
  const world = createPrototypeWorld(1847);
  world.factions["free-tide"].treasury = 0;
  const holderId = commandHolderId(world, "free-tide");
  assert.ok(holderId);
  const holder = world.characters[holderId];
  const mate = Object.values(world.characters)
    .filter((character) => character.factionId === "free-tide" && character.id !== holderId && !character.captivity)
    .sort((left, right) => left.id.localeCompare(right.id))[0];
  assert.ok(mate);
  assert.equal(shortPayMember(world, mate, PASSAGE_COST_PER_TICK), true);
  assert.equal(shortPayMember(world, holder, PASSAGE_COST_PER_TICK), false);

  const rich = Object.values(world.characters).find((character) =>
    character.factionId === "world-government" && character.id !== commandHolderId(world, "world-government"),
  );
  assert.ok(rich);
  assert.equal(shortPayMember(world, rich, PASSAGE_COST_PER_TICK), false);

  const mateBefore = mate.morale;
  const holderBefore = holder.morale;
  const richBefore = rich.morale;
  const mateTraveling = mate.travel !== null;
  const holderTraveling = holder.travel !== null;
  const richTraveling = rich.travel !== null;
  const result = runTick(world);
  const upkeep = (id: string) => result.events.find((event) => event.type === "character-upkeep" && event.actorId === id);
  const mateEvent = upkeep(mate.id);
  const holderEvent = upkeep(holder.id);
  const richEvent = upkeep(rich.id);
  assert.ok(mateEvent && holderEvent && richEvent);

  const mateHunger = hungerAndTravel(mateBeforeAs(mateBefore, mate), mateEvent.data.shortage as number, mateTraveling);
  assert.equal(mateEvent.data.shortPay, true);
  assert.equal(mateEvent.data.morale, round(clamp(mateHunger - 0.5, 0, 100)));
  assert.equal(holderEvent.data.shortPay, undefined);
  assert.equal(
    holderEvent.data.morale,
    round(hungerAndTravel(moraleCarrier(holderBefore, holder), holderEvent.data.shortage as number, holderTraveling)),
  );
  assert.equal(richEvent.data.shortPay, undefined);
  assert.equal(
    richEvent.data.morale,
    round(hungerAndTravel(moraleCarrier(richBefore, rich), richEvent.data.shortage as number, richTraveling)),
  );
  assert.equal("roll" in mateEvent.data, false);

  mate.morale = 0;
  mate.cargo = { ...mate.cargo, provisions: 0 };
  world.factions["free-tide"].treasury = 0;
  const floored = runTick(world).events.find((event) => event.type === "character-upkeep" && event.actorId === mate.id);
  assert.ok(floored);
  assert.equal(floored.data.morale, 0);
  assert.equal(floored.data.shortPay, true);
});

function mateBeforeAs(morale: number, character: Character): Character {
  return moraleCarrier(morale, character);
}

function moraleCarrier(morale: number, character: Character): Character {
  return { ...character, morale };
}

test("the pay term is on the mate's own upkeep line and on a co-located card", () => {
  const world: WorldState = createPrototypeWorld(1847);
  world.factions["free-tide"].treasury = 0;
  const commander = world.characters[world.players["prototype-player"].characterId];
  const holderId = commandHolderId(world, "free-tide");
  const mate = Object.values(world.characters).find((character) =>
    character.factionId === "free-tide" && character.id !== holderId,
  );
  assert.ok(mate && holderId);
  mate.locationId = "crown-harbor";
  mate.travel = null;
  commander.locationId = "crown-harbor";
  commander.travel = null;

  const card = projectCharacter(world, commander, mate) as { morale: number | null; payNote: string | null };
  assert.equal(card.payNote, "Pay is short, so morale loses 0.5 on upkeep.");
  assert.notEqual(card.morale, null);
  const holderCard = projectCharacter(world, commander, world.characters[holderId]) as { payNote: string | null };
  world.characters[holderId].locationId = "crown-harbor";
  world.characters[holderId].travel = null;
  const holderSeen = projectCharacter(world, commander, world.characters[holderId]) as { payNote: string | null };
  assert.equal(holderCard.payNote, null);
  assert.equal(holderSeen.payNote, null);

  mate.locationId = "glassport";
  const distant = projectCharacter(world, commander, mate) as { morale: number | null; payNote: string | null };
  assert.equal(distant.morale, null);
  assert.equal(distant.payNote, null);

  const event: SimEvent = {
    sequence: 1,
    tick: 0,
    type: "character-upkeep",
    actorId: mate.id,
    data: { morale: 40, shortPay: true, demand: 1, consumed: 1, shortage: 0 },
  };
  const own = projectEvent(world, mate, event, "Esme's upkeep was recorded. Pay was short, and morale lost 0.5.");
  assert.equal(own.payloadWithheld, false);
  assert.equal(String(own.summary).includes("morale lost 0.5"), true);
  const bystander = projectEvent(world, commander, event, "Esme's upkeep was recorded. Pay was short, and morale lost 0.5.");
  assert.equal(bystander.payloadWithheld, true);
  assert.equal(String(bystander.summary).includes("0.5"), false);
});
