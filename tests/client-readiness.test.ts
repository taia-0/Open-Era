import assert from "node:assert/strict";
import test from "node:test";
import { PLAYER_FEED_BOOKKEEPING } from "../src/dashboard/client-readiness.ts";
import { dashboardState, fullEventFeed, projectEventFeed } from "../src/dashboard/view-model.ts";
import { projectEvent } from "../src/dashboard/visibility.ts";
import { dashboardTickOptions, simulationTickOptions, tickOptionsFromFlags, type SimFlagValues } from "../src/cli/tick-options.ts";
import { OCCUPATION_DEFAULT } from "../src/sim/occupation.ts";
import { submitCommand } from "../src/sim/commands.ts";
import { stubFeedReasonWriter } from "../src/sim/feed-reasons.ts";
import { runTick } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";
import type { Character, SimEvent } from "../src/sim/types.ts";

const BOOKKEEPING = new Set<string>(PLAYER_FEED_BOOKKEEPING);

function run(seed: number, ticks: number, options: Parameters<typeof runTick>[1] = {}) {
  const world = createPrototypeWorld(seed);
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i += 1) events.push(...runTick(world, options).events);
  return { world, events };
}

test("shared tick options match for the dashboard and run-simulation, and occupation stays off by default", () => {
  assert.equal(OCCUPATION_DEFAULT, false);
  const samples: Array<{ values: SimFlagValues; env: NodeJS.ProcessEnv }> = [
    { values: {}, env: {} },
    { values: { occupation: true }, env: {} },
    { values: {}, env: { OCCUPATION: "1" } },
    { values: { alliances: true, "port-transfer": true, lifecycle: true, "secession-aftermath": true }, env: {} },
    { values: { "no-exile-recovery": true, "no-feed-reasons": true }, env: {} },
    { values: {}, env: { EXILE_RECOVERY: "0", FEED_REASONS: "0", ALLIANCES: "1", PORT_TRANSFER: "1", LIFECYCLE: "1", SECESSION_AFTERMATH: "1" } },
  ];
  const flagsOf = (options: ReturnType<typeof tickOptionsFromFlags>) => {
    const feed = options.ai?.feedReasons;
    return {
      exileRecovery: options.exileRecovery ?? null,
      occupation: options.occupation === true,
      alliances: options.alliances === true,
      portTransfer: options.portTransfer === true,
      lifecycle: options.lifecycle === true,
      secessionAftermath: options.secessionAftermath === true,
      feedOn: Boolean(feed),
      feedExile: feed && typeof feed === "object" ? feed.exileRecovery ?? null : null,
      feedCap: feed && typeof feed === "object" ? feed.callCap ?? null : null,
    };
  };
  for (const sample of samples) {
    const shared = tickOptionsFromFlags(sample.values, sample.env);
    assert.deepEqual(shared, tickOptionsFromFlags(sample.values, sample.env));
    const prepared = shared.ai?.feedReasons && typeof shared.ai.feedReasons === "object"
      ? { ...shared.ai.feedReasons, writer: stubFeedReasonWriter() }
      : false;
    const simulated = simulationTickOptions(sample.values, sample.env, prepared);
    const dashboard = dashboardTickOptions(sample.values, sample.env);
    assert.deepEqual(flagsOf(simulated), flagsOf(dashboard));
    assert.equal(dashboard.liveSession, true);
    assert.equal(simulated.liveSession, undefined);
    if (prepared && typeof prepared === "object") assert.equal(simulated.ai?.feedReasons, prepared);
  }
  const defaults = tickOptionsFromFlags({}, {});
  assert.equal(defaults.exileRecovery, true);
  assert.equal(defaults.occupation, undefined);
  assert.equal(defaults.alliances, undefined);
  assert.equal(defaults.portTransfer, undefined);
  assert.equal(defaults.lifecycle, undefined);
  assert.equal(defaults.secessionAftermath, undefined);
  assert.equal(typeof defaults.ai?.feedReasons, "object");
});

test("flag-off pins stay put", () => {
  for (const [seed, pin] of [[1847, "7f76e474"], [2718, "976c40bd"], [4096, "08943ea5"]] as const) {
    const world = createPrototypeWorld(seed);
    for (let i = 0; i < 72; i += 1) runTick(world, {});
    assert.equal(stateHash(world).slice(0, 8), pin, `seed ${seed}`);
  }
  const opted = createPrototypeWorld(1847);
  for (let i = 0; i < 72; i += 1) runTick(opted, { exileRecovery: false });
  assert.equal(stateHash(opted).slice(0, 8), "66e8ccb7");
});

test("a player raid during peace is accepted and the confirm step names the peace", () => {
  const world = createPrototypeWorld(1847);
  const commander = world.characters[world.players["prototype-player"].characterId];
  const settlement = world.settlements["cinder-key"];
  commander.locationId = settlement.id;
  commander.troops = { ...commander.troops, count: 30 };
  world.secessionAftermath = {
    records: [],
    peace: [{ factionIds: ["world-government", "free-tide"], tick: 4, cause: "SECRET cause and grievance 9" }],
  };
  const submission = submitCommand(world, { playerId: "prototype-player", type: "character-action", action: "raid" });
  assert.equal(submission.ok, true);
  if (!submission.ok) return;
  assert.match(submission.notice ?? "", /breaks the peace with Free Tide Compact/);
  assert.equal(JSON.stringify(submission.event).includes("breaks the peace"), false);
  assert.equal(JSON.stringify(submission.event.data).includes("SECRET"), false);

  const state = dashboardState(world, [], fullEventFeed([])) as {
    settlements: Array<{ id: string; combatForecast: { peaceWarning: string | null } | null }>;
    factions: Array<{ id: string; diplomacy: { peace: Array<{ withFactionId: string; sinceTick: number }> } | null }>;
  };
  const port = state.settlements.find((row) => row.id === "cinder-key");
  assert.match(port?.combatForecast?.peaceWarning ?? "", /breaks the peace with Free Tide Compact/);
  const own = state.factions.find((row) => row.id === "world-government");
  assert.deepEqual(own?.diplomacy?.peace, [{ withFactionId: "free-tide", sinceTick: 4 }]);
  assert.equal(JSON.stringify(own?.diplomacy).includes("SECRET"), false);
  assert.equal(JSON.stringify(own?.diplomacy).includes("grievance"), false);
});

test("occupation harshness is exact for the holder and dated for everyone who surveyed it", () => {
  const world = createPrototypeWorld(1847);
  const holder = world.characters["character-14"];
  const rival = world.characters["character-01"];
  const port = world.settlements["verdant-cay"];
  port.factionId = holder.factionId;
  port.occupation = {
    tick: 12,
    fromFactionId: "world-government",
    byFactionId: "free-tide",
    fromRate: 0.2,
    harshness: 0.62,
    lastShortageTick: 9,
    foodBaseline: 0.4,
  };
  port.foodRatios = [[11, 0.5], [12, 0.4]];
  const player = world.players["prototype-player"];
  const saved = player.characterId;

  player.characterId = holder.id;
  const held = dashboardState(world, [], fullEventFeed([])) as { settlements: Array<Record<string, unknown>> };
  const heldPort = held.settlements.find((row) => row.id === port.id)!;
  assert.deepEqual(heldPort.occupation, {
    harshness: 0.62,
    sinceTick: 12,
    fromFactionId: "world-government",
    byFactionId: "free-tide",
    regrowthStopped: true,
  });
  assert.equal("foodRatios" in heldPort, false);
  assert.equal(JSON.stringify(heldPort.occupation).includes("fromRate"), false);
  assert.equal(JSON.stringify(heldPort.occupation).includes("foodBaseline"), false);

  player.characterId = rival.id;
  rival.locationId = "crown-harbor";
  const away = dashboardState(world, [], fullEventFeed([])) as { settlements: Array<Record<string, unknown>> };
  const hidden = away.settlements.find((row) => row.id === port.id)!;
  assert.equal(hidden.occupation, null);
  assert.equal("foodRatios" in hidden, false);

  rival.knowledge[port.id] = {
    ...rival.knowledge[port.id],
    ground: {
      population: port.population,
      fortification: port.fortification,
      observedTick: 15,
      source: "direct",
      occupation: { harshness: 0.62, sinceTick: 12, fromFactionId: "world-government" },
    },
  };
  const learned = dashboardState(world, [], fullEventFeed([])) as { settlements: Array<Record<string, unknown>> };
  const seen = learned.settlements.find((row) => row.id === port.id)!;
  assert.equal((seen.occupation as { learnedTick: number; harshness: number }).learnedTick, 15);
  assert.equal((seen.occupation as { harshness: number }).harshness, 0.62);
  assert.equal((seen.occupation as { source: string }).source, "ground");
  player.characterId = saved;
});

test("a purchase reads as a purchase, the price stays with the buyer, and carried news updates the label", () => {
  const world = createPrototypeWorld(1847);
  const buyer = world.characters["character-01"];
  const outsider = world.characters["character-14"];
  const event: SimEvent = {
    sequence: 1,
    tick: 24,
    type: "settlement-purchased",
    actorId: "character-06",
    targetId: "world-government",
    settlementId: "verdant-cay",
    data: {
      factionId: "world-government",
      payerFactionId: "world-government",
      price: 840,
      reserve: 100,
      treasuryBefore: 2000,
      treasuryAfter: 1160,
      cause: "adjacent: world-government holds glassport",
      candidates: [{ factionId: "free-tide", surplus: 999, cause: "landless: secret" }],
    },
  };
  const asBuyer: SimEvent = { ...event, actorId: buyer.id };
  const buyerRow = projectEventFeed(world, buyer.id, [asBuyer])[0];
  assert.match(String(buyerRow.summary), /bought Verdant Cay for World Government/);
  assert.match(String(buyerRow.summary), /The price was 840/);
  assert.equal(JSON.stringify(buyerRow.data).includes("999"), false);
  assert.equal(JSON.stringify(buyerRow.data).includes("candidates"), false);
  assert.equal((buyerRow.data as { price?: number }).price, 840);

  const outsiderRow = projectEventFeed(world, outsider.id, [event])[0];
  assert.match(String(outsiderRow.summary), /bought Verdant Cay for World Government/);
  assert.equal(String(outsiderRow.summary).includes("840"), false);
  assert.equal(String(outsiderRow.summary).includes("999"), false);
  assert.equal(outsiderRow.data, null);

  outsider.carriedNews = [{
    item: { id: "news-1", type: "settlement-purchased", observedTick: 24, factionId: "world-government" },
    aboutSettlementId: "verdant-cay",
    stability: 70,
    followerIds: ["character-06"],
    sequence: 1,
  }];
  outsider.travel = { fromId: "glassport", toId: "cinder-key", remainingTicks: 2, totalTicks: 4 };
  outsider.locationId = null;
  const player = world.players["prototype-player"];
  const saved = player.characterId;
  player.characterId = outsider.id;
  const state = dashboardState(world, [], fullEventFeed([])) as { settlements: Array<Record<string, unknown>> };
  const port = state.settlements.find((row) => row.id === "verdant-cay")!;
  assert.equal(port.factionId, "world-government");
  assert.equal(port.factionLearnedTick, 24);
  const news = port.portNews as Array<Record<string, unknown>>;
  assert.equal(news[0].type, "settlement-purchased");
  assert.equal(news[0].learnedTick, 24);
  assert.equal(JSON.stringify(news).includes("character-06"), false);
  player.characterId = saved;
});

test("lifecycle bookkeeping stays out of the feed, and the roster shows retired, returned, and promoted", () => {
  const world = createPrototypeWorld(1847);
  const mate = world.characters["character-05"];
  const rival = world.characters["character-14"];
  (mate as Character & { lifecycle?: unknown }).lifecycle = {
    retired: { tick: 40, cause: "power-loss secret", portsAtRetire: 2 },
    returned: { tick: 50 },
  };
  const watch: SimEvent = { sequence: 1, tick: 0, type: "lifecycle-watch", actorId: mate.id, data: { since: 0, troops: 12 } };
  const opened: SimEvent = { sequence: 2, tick: 0, type: "aftermath-ledger-opened", data: {} };
  const ledger: SimEvent = { sequence: 3, tick: 0, type: "alliance-ledger-opened", data: {} };
  const cleared: SimEvent = { sequence: 4, tick: 1, type: "lifecycle-watch-cleared", actorId: mate.id, data: { since: 0, troops: 30 } };
  const feed = projectEventFeed(world, world.players["prototype-player"].characterId, [watch, opened, ledger, cleared]);
  assert.equal(feed.length, 0);

  const player = world.players["prototype-player"];
  const saved = player.characterId;
  player.characterId = Object.values(world.characters).find((character) => character.factionId === mate.factionId)!.id;
  const own = dashboardState(world, [], fullEventFeed([])) as { characters: Array<{ id: string; lifecycle: { retired: { tick: number } | null; returned: { tick: number } | null } | null }> };
  const card = own.characters.find((row) => row.id === mate.id)!;
  assert.equal(card.lifecycle?.retired?.tick, 40);
  assert.equal(card.lifecycle?.returned?.tick, 50);
  assert.equal(JSON.stringify(card.lifecycle).includes("secret"), false);
  assert.equal(JSON.stringify(card.lifecycle).includes("portsAtRetire"), false);

  player.characterId = rival.id;
  const foreign = dashboardState(world, [], fullEventFeed([])) as { characters: Array<{ id: string; lifecycle: unknown }> };
  assert.equal(foreign.characters.find((row) => row.id === mate.id)?.lifecycle, null);
  player.characterId = saved;
});

test("picker provenance and an unearned garrison belief stay off the client", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  const decision: SimEvent = {
    sequence: 1,
    tick: 3,
    type: "decision-made",
    actorId: mara.id,
    data: {
      goal: "raid",
      ai: { picker: { legal: ["raid"], probabilities: [0.9], wg: { role: "holder", q: 0.2, kept: false } } },
    },
  };
  const row = projectEvent(world, mara, decision, "Mara Vane made a decision.");
  assert.equal(row.payloadWithheld, false);
  assert.equal(JSON.stringify(row.data).includes("picker"), false);
  assert.equal(JSON.stringify(row.data).includes("probabilities"), false);
  assert.equal((row.data as { goal?: string }).goal, "raid");

  const raid: SimEvent = {
    sequence: 2,
    tick: 4,
    type: "battle-started",
    actorId: mara.id,
    settlementId: "cinder-key",
    data: { ai: { reason: { text: "Mara Vane acted: to seize supplies from a garrison believed to be about 133." } } },
  };
  mara.locationId = "crown-harbor";
  const belief = mara.knowledge["cinder-key"];
  belief.source = "rumor";
  belief.garrisonEstimate = 10;
  const hidden = projectEventFeed(world, mara.id, [raid]);
  assert.equal(String(hidden[0].summary).includes("133"), false);
  assert.equal(String(hidden[0].summary).includes("garrison believed"), false);
  assert.equal(JSON.stringify(hidden[0].data).includes("picker"), false);

  belief.source = "direct";
  belief.garrisonEstimate = 133;
  const earned = projectEventFeed(world, mara.id, [raid]);
  assert.match(String(earned[0].summary), /garrison believed to be about 133/);
});

test("no rival-only or undated foreign fact reaches a non-party across seeds", () => {
  const seeds = [1847, 2718, 4096];
  for (const seed of seeds) {
    const { world, events } = run(seed, 72, {
      exileRecovery: true,
      occupation: true,
      alliances: true,
      portTransfer: true,
      lifecycle: true,
      secessionAftermath: true,
    });
    const player = world.players["prototype-player"];
    const saved = player.characterId;
    for (const viewer of Object.values(world.characters)) {
      if (viewer.dead) continue;
      player.characterId = viewer.id;
      const state = dashboardState(world, events, fullEventFeed(events)) as {
        settlements: Array<Record<string, any>>;
        factions: Array<Record<string, any>>;
        characters: Array<Record<string, any>>;
        events: Array<Record<string, any>>;
      };
      const feed = projectEventFeed(world, viewer.id, events);
      for (const event of [...state.events, ...feed]) {
        assert.equal(BOOKKEEPING.has(String(event.type)), false, `${seed} ${viewer.id} ${event.type}`);
        const data = event.data as Record<string, unknown> | null;
        if (data) {
          assert.equal("ai" in data, false, "picker and model traces stay off the row");
          if (event.type === "settlement-purchased") {
            assert.equal("candidates" in data, false);
            assert.equal("surplus" in data, false);
          }
          if (event.type === "character-promoted") assert.equal("character" in data, false);
          if (event.type === "faction-peace" || event.type === "secession-joined" || event.type === "alliance-formed") {
            assert.equal("grievance" in data, false);
            assert.equal("ownSurplus" in data, false);
          }
          if (event.type === "settlement-upkeep" || event.type === "settlement-shortage") {
            assert.equal("occupationTerms" in data, false);
            assert.equal("foodRatio" in data, false);
            assert.equal("foodRatios" in data, false);
          }
        }
        const summary = String(event.summary ?? "");
        if (summary.includes("garrison believed")) {
          assert.equal(event.actorId, viewer.id);
        }
        if (summary.includes("The price was")) {
          assert.equal(event.targetId, viewer.factionId);
        }
        if (event.type === "faction-peace" || event.type === "faction-peace-broken" || event.type === "alliance-formed" || event.type === "alliance-broken") {
          const blob = JSON.stringify(event);
          assert.equal(blob.includes(viewer.factionId ?? "___none___"), true);
          assert.equal(blob.includes("\"cause\""), false);
          assert.equal(blob.includes("surplus"), false);
        }
      }
      for (const settlement of state.settlements) {
        assert.equal("foodRatios" in settlement, false);
        assert.equal("fromRate" in settlement, false);
        assert.equal("foodBaseline" in settlement, false);
        const occupation = settlement.occupation as Record<string, unknown> | null;
        if (occupation) {
          assert.equal("fromRate" in occupation, false);
          assert.equal("foodBaseline" in occupation, false);
          assert.equal("lastShortageTick" in occupation, false);
          const owned = settlement.factionId === viewer.factionId && settlement.intelligence?.source === "owned";
          if (!owned) {
            assert.equal(typeof occupation.learnedTick, "number", `${seed} undated harshness for ${viewer.id} at ${settlement.id}`);
          }
        }
        const governor = settlement.governor as { name?: string | null } | null;
        if (governor?.name) assert.equal(settlement.factionId, viewer.factionId);
        const news = settlement.portNews as Array<Record<string, unknown>> | null;
        if (news) {
          for (const item of news) {
            assert.equal("followerIds" in item, false);
            assert.equal(typeof item.learnedTick, "number");
            if (item.occupation) assert.equal(typeof (item.occupation as { learnedTick: number }).learnedTick, "number");
          }
        }
      }
      for (const faction of state.factions) {
        if (faction.diplomacy) {
          assert.equal(JSON.stringify(faction.diplomacy).includes("cause"), false);
          assert.equal(JSON.stringify(faction.diplomacy).includes("surplus"), false);
          assert.equal(JSON.stringify(faction.diplomacy).includes("grievance"), false);
        }
        if (faction.governors) assert.equal(faction.id, viewer.factionId);
      }
      for (const character of state.characters) {
        if (character.lifecycle) assert.equal(character.factionId, viewer.factionId);
      }
    }
    player.characterId = saved;
  }
});
