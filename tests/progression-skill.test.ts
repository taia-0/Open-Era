import assert from "node:assert/strict";
import test from "node:test";
import { submitCommand } from "../src/sim/commands.ts";
import { runTick, travelDuration, workGross } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { applyEvent, practicedSkill } from "../src/sim/state.ts";
import type { Character, CharacterSkills, SimEvent, WorldState } from "../src/sim/types.ts";

const PLAYER = "prototype-player";

function maraOf(world: WorldState): Character {
  return world.characters[world.players[PLAYER].characterId];
}

function skillsOf(character: Character): CharacterSkills {
  return { ...character.skills };
}

function holdOtherRaiders(world: WorldState, attackerId: string): void {
  for (const character of Object.values(world.characters)) {
    if (character.id !== attackerId) character.lastBattleTick = world.tick;
  }
}

function step(start: number, uses: number): number {
  let skill = start;
  for (let index = 0; index < uses; index += 1) skill = practicedSkill(skill);
  return skill;
}

test("a use closes 0.1% of the gap to 100, rounded to 3 decimals", () => {
  assert.equal(practicedSkill(25), 25.075);
  assert.equal(step(25, 40), 27.942);
  assert.equal(step(25, 200), 38.603);
  assert.equal(step(25, 700), 62.768);
  assert.equal(step(77, 40), 77.902);
  assert.equal(step(77, 200), 81.17);
  assert.equal(step(77, 700), 88.585);
  // The 1% step is the sensitivity. It is not this step.
  assert.notEqual(practicedSkill(25), 25.75);
  assert.equal(practicedSkill(100), 100);
  assert.equal(step(100, 700), 100);
  assert.equal(practicedSkill(125), 100);
  // Three decimals already sit on the cap, so another use does not move them.
  assert.equal(practicedSkill(99.999), 99.999);
  assert.equal(practicedSkill(0), 0.1);
});

test("work practices leadership and trade, and the pay uses the old skills", () => {
  const world = createPrototypeWorld(1847);
  const mara = maraOf(world);
  mara.skills.leadership = 25;
  mara.skills.trade = 77;
  const before = skillsOf(mara);
  const gross = workGross(mara);
  assert.equal(submitCommand(world, { playerId: PLAYER, type: "character-action", action: "work" }).ok, true);
  const tick = runTick(world);
  const worked = tick.events.find((event) => event.type === "worked" && event.actorId === mara.id);
  assert.ok(worked);
  assert.equal(worked.data.gross, gross);
  assert.equal(worked.data.gross, 17.39);
  assert.equal(worked.data.leadership, 25.075);
  assert.equal(worked.data.trade, 77.023);
  assert.equal(Object.hasOwn(worked.data, "navigation"), false);
  assert.equal(Object.hasOwn(worked.data, "strategy"), false);
  assert.equal(mara.skills.leadership, 25.075);
  assert.equal(mara.skills.trade, 77.023);
  assert.equal(mara.skills.navigation, before.navigation);
  assert.equal(mara.skills.strategy, before.strategy);
  assert.deepEqual(Object.keys(mara.skills).sort(), ["leadership", "navigation", "strategy", "trade"]);

  // The next work reads the skills this event stored.
  assert.equal(submitCommand(world, { playerId: PLAYER, type: "character-action", action: "work" }).ok, true);
  const second = runTick(world).events.find((event) => event.type === "worked" && event.actorId === mara.id);
  assert.ok(second);
  assert.equal(second.data.gross, workGross({ ...mara, skills: { ...before, leadership: 25.075, trade: 77.023 } }));
  assert.equal(second.data.gross, 17.4);
  assert.equal(second.data.leadership, practicedSkill(25.075));
  assert.equal(second.data.trade, practicedSkill(77.023));

  // applyEvent copies the absolute. A second copy does not take another step, and it does not draw.
  mara.skills = { ...before };
  const rngBeforeCopy = world.rngState;
  applyEvent(world, worked);
  assert.equal(mara.skills.leadership, 25.075);
  assert.equal(mara.skills.trade, 77.023);
  applyEvent(world, worked);
  assert.equal(mara.skills.leadership, 25.075);
  assert.equal(mara.skills.trade, 77.023);
  assert.equal(world.rngState, rngBeforeCopy);

  const untouched = skillsOf(mara);
  applyEvent(world, {
    sequence: world.nextEventSequence,
    tick: world.tick,
    type: "worked",
    actorId: mara.id,
    settlementId: mara.locationId ?? undefined,
    data: {
      characterMoney: mara.money,
      morale: mara.morale,
      factionTreasury: world.factions["world-government"].treasury,
    },
  });
  assert.deepEqual(mara.skills, untouched);
});

test("a voyage practices navigation once, and the length stays the length it started with", () => {
  const world = createPrototypeWorld(1847);
  const mara = maraOf(world);
  mara.skills.navigation = 54.312;
  const before = skillsOf(mara);
  const quoted = travelDuration(world, mara, "glassport");
  assert.equal(quoted, 4);
  assert.equal(submitCommand(world, {
    playerId: PLAYER,
    type: "character-action",
    action: "travel",
    targetId: "glassport",
  }).ok, true);
  const startedTick = runTick(world);
  const started = startedTick.events.find((event) => event.type === "travel-started" && event.actorId === mara.id);
  assert.ok(started);
  const travel = started.data.travel as { totalTicks: number };
  assert.equal(travel.totalTicks, quoted);
  assert.equal(started.data.navigation, practicedSkill(54.312));
  assert.equal(started.data.navigation, 54.358);
  assert.equal(Object.hasOwn(started.data, "leadership"), false);
  assert.equal(Object.hasOwn(started.data, "trade"), false);
  assert.equal(Object.hasOwn(started.data, "strategy"), false);
  assert.equal(mara.skills.navigation, 54.358);
  assert.equal(mara.skills.leadership, before.leadership);
  assert.equal(mara.skills.strategy, before.strategy);
  assert.equal(mara.skills.trade, before.trade);
  assert.equal(mara.travel?.totalTicks, 4);

  const progressed = startedTick.events.filter((event) => event.type === "travel-progressed" && event.actorId === mara.id);
  assert.ok(progressed.length > 0);
  for (const event of progressed) assert.equal(Object.hasOwn(event.data, "navigation"), false);

  while (mara.travel) {
    const tick = runTick(world);
    for (const event of tick.events) {
      if (event.actorId === mara.id && (event.type === "travel-progressed" || event.type === "arrived")) {
        assert.equal(Object.hasOwn(event.data, "navigation"), false);
      }
    }
  }
  assert.equal(mara.locationId, "glassport");
  assert.equal(mara.skills.navigation, 54.358);

  assert.equal(travelDuration(world, mara, "crown-harbor"), 3);
  assert.equal(submitCommand(world, {
    playerId: PLAYER,
    type: "character-action",
    action: "travel",
    targetId: "crown-harbor",
  }).ok, true);
  const second = runTick(world).events.find((event) => event.type === "travel-started" && event.actorId === mara.id);
  assert.ok(second);
  assert.equal((second.data.travel as { totalTicks: number }).totalTicks, 3);
  assert.equal(second.data.navigation, practicedSkill(54.358));
  assert.equal(mara.skills.navigation, practicedSkill(54.358));
});

test("a finished battle practices strategy and leadership, and the fight uses the old ones", () => {
  const world = createPrototypeWorld(1847);
  const mara = maraOf(world);
  const settlement = world.settlements["cinder-key"];
  holdOtherRaiders(world, mara.id);
  mara.locationId = settlement.id;
  mara.travel = null;
  mara.skills.strategy = 0.065;
  mara.skills.leadership = 25;
  mara.troops.count = 40;
  mara.health = 100;
  mara.morale = 100;
  settlement.population = 0;
  settlement.fortification = 1;
  settlement.garrison = 39;
  settlement.stability = 80;
  settlement.surrender = null;
  const before = skillsOf(mara);
  const experience = mara.troops.experience;
  const discipline = mara.troops.discipline;
  assert.equal(submitCommand(world, { playerId: PLAYER, type: "character-action", action: "raid" }).ok, true);
  const tick = runTick(world);
  const battle = tick.events.find((event) => event.type === "battle-resolved" && event.actorId === mara.id);
  assert.ok(battle);
  assert.equal(battle.data.phases, 1);
  assert.equal(battle.data.strategyUncertainty, 0.38);
  assert.equal(battle.data.strategy, practicedSkill(0.065));
  assert.equal(battle.data.strategy, 0.165);
  assert.equal(battle.data.leadership, practicedSkill(25));
  assert.equal(Object.hasOwn(battle.data, "navigation"), false);
  assert.equal(Object.hasOwn(battle.data, "trade"), false);
  assert.equal(mara.skills.strategy, 0.165);
  assert.equal(mara.skills.leadership, practicedSkill(25));
  assert.equal(mara.skills.navigation, before.navigation);
  assert.equal(mara.skills.trade, before.trade);
  assert.equal(mara.troops.experience, experience);
  assert.equal(mara.troops.discipline, discipline);
  assert.equal(Object.hasOwn(battle.data, "experience"), false);
  assert.equal(Object.hasOwn(battle.data, "discipline"), false);

  for (const event of tick.events) {
    if (event.type === "battle-phase-resolved" && event.actorId === mara.id) {
      assert.equal(Object.hasOwn(event.data, "strategy"), false);
      assert.equal(Object.hasOwn(event.data, "leadership"), false);
    }
  }

  settlement.garrison = 39;
  settlement.stability = 80;
  mara.troops.count = 40;
  mara.health = 100;
  mara.morale = 100;
  assert.equal(submitCommand(world, { playerId: PLAYER, type: "character-action", action: "raid" }).ok, true);
  const next = runTick(world).events.find((event) => event.type === "battle-resolved" && event.actorId === mara.id);
  assert.ok(next);
  assert.equal(next.data.strategyUncertainty, 0.379);
  assert.equal(next.data.strategy, practicedSkill(0.165));
  assert.equal(mara.skills.strategy, practicedSkill(0.165));
});

test("a battle phase and a retreat do not practice", () => {
  const world = createPrototypeWorld(1847);
  const mara = maraOf(world);
  const settlement = world.settlements["cinder-key"];
  holdOtherRaiders(world, mara.id);
  mara.locationId = settlement.id;
  mara.travel = null;
  mara.skills.strategy = 40;
  mara.skills.leadership = 50;
  mara.troops.count = 90;
  settlement.garrison = 120;
  settlement.stability = 72;
  settlement.surrender = null;
  const before = skillsOf(mara);
  assert.equal(submitCommand(world, { playerId: PLAYER, type: "character-action", action: "raid" }).ok, true);
  const opened = runTick(world);
  const phase = opened.events.find((event) => event.type === "battle-phase-resolved" && event.actorId === mara.id);
  assert.ok(phase);
  assert.equal(opened.events.some((event) => event.type === "battle-resolved" && event.actorId === mara.id), false);
  assert.equal(Object.hasOwn(phase.data, "strategy"), false);
  assert.equal(Object.hasOwn(phase.data, "leadership"), false);
  assert.deepEqual(mara.skills, before);

  const battle = Object.values(world.activeBattles)[0];
  assert.ok(battle);
  assert.equal(submitCommand(world, {
    playerId: PLAYER,
    type: "retreat-battle",
    battleId: battle.id,
  }).ok, true);
  const retreated = runTick(world);
  const retreat = retreated.events.find((event) => event.type === "battle-retreated" && event.actorId === mara.id);
  assert.ok(retreat);
  assert.equal(retreated.events.some((event) => event.type === "battle-resolved"), false);
  assert.equal(Object.hasOwn(retreat.data, "strategy"), false);
  assert.equal(Object.hasOwn(retreat.data, "leadership"), false);
  assert.deepEqual(mara.skills, before);
});

test("recruiting does not roll a rarity or change the stack's experience", () => {
  const world = createPrototypeWorld(1847);
  const mara = maraOf(world);
  const experience = mara.troops.experience;
  const discipline = mara.troops.discipline;
  assert.equal(submitCommand(world, { playerId: PLAYER, type: "character-action", action: "recruit" }).ok, true);
  const recruited = runTick(world).events.find((event) => event.type === "recruited" && event.actorId === mara.id);
  assert.ok(recruited);
  assert.equal(Object.hasOwn(recruited.data, "rarity"), false);
  assert.equal(Object.hasOwn(recruited.data, "roll"), false);
  assert.equal(mara.troops.experience, experience);
  assert.equal(mara.troops.discipline, discipline);
  assert.ok(mara.troops.count > 0);
});

function eventTypes(events: SimEvent[], actorId: string): string[] {
  return events.filter((event) => event.actorId === actorId).map((event) => event.type);
}

test("sea ticks are not a second navigation write", () => {
  const world = createPrototypeWorld(1847);
  const mara = maraOf(world);
  const before = mara.skills.navigation;
  assert.equal(submitCommand(world, {
    playerId: PLAYER,
    type: "character-action",
    action: "travel",
    targetId: "verdant-cay",
  }).ok, true);
  const first = runTick(world);
  assert.ok(eventTypes(first.events, mara.id).includes("travel-started"));
  assert.ok(eventTypes(first.events, mara.id).includes("travel-progressed"));
  const stepped = practicedSkill(before);
  assert.equal(mara.skills.navigation, stepped);
  const sea = runTick(world);
  assert.ok(eventTypes(sea.events, mara.id).includes("travel-progressed"));
  assert.equal(sea.events.some((event) => event.type === "travel-started" && event.actorId === mara.id), false);
  assert.equal(mara.skills.navigation, stepped);
});
