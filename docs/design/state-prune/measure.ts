// state-prune.md harness: one config x N seeds x T ticks, offline, no AI, $0.
// Usage: node --experimental-strip-types docs/design/state-prune/measure.ts <label> '<TickOptions JSON>'
// Env: SEEDS (default 13 standard), TICKS=1200, REPLAY=1 (0 to skip),
//      SNAPS=0,72,1200 (comma ticks to inventory; always includes TICKS and 72).
// One JSON row per seed: pins, replay, world bytes, per-structure entry counts
// and canonical-JSON bytes at each snap, event-log size, and growth between snaps.
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { canonicalJson, stateHash } from "../../../src/sim/state.ts";
import { replayWithSilentStarts } from "../../../src/sim/tick-start.ts";
import type { SimEvent, WorldState } from "../../../src/sim/types.ts";

const [label, optsJson] = process.argv.slice(2);
const opts = JSON.parse(optsJson ?? "{}");
const ticks = Number(process.env.TICKS ?? 1200);
const seeds = (process.env.SEEDS ?? "1847,2718,4096,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000").split(",").map(Number);
const doReplay = process.env.REPLAY !== "0";
const requestedSnaps = (process.env.SNAPS ?? "0,72,200,400,600,800,1000,1200,2000,3000,4000,5000")
  .split(",")
  .map(Number)
  .filter((t) => t >= 0 && t <= ticks);
const snapTicks = [...new Set([0, 72, ...requestedSnaps, ticks].filter((t) => t <= ticks))].sort((a, b) => a - b);

const bytes = (value: unknown): number => Buffer.byteLength(canonicalJson(value), "utf8");
const jsonBytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), "utf8");

const OPEN_CONTRACT = new Set(["offered", "accepted"]);
const OPEN_ORDER = new Set(["pending", "active", "awaiting-confirmation"]);

type CountBytes = { n: number; bytes: number };
const cb = (n: number, value: unknown): CountBytes => ({ n, bytes: n === 0 ? 0 : bytes(value) });

function byKey<T>(items: T[], key: (item: T) => string): Record<string, CountBytes> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = groups.get(k);
    if (list) list.push(item);
    else groups.set(k, [item]);
  }
  return Object.fromEntries([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, list]) => [k, cb(list.length, list)]));
}

function inventory(world: WorldState, eventsSoFar: SimEvent[]) {
  const contracts = Object.values(world.contracts ?? {});
  const threads = Object.values(world.conversationThreads);
  const messages = world.conversationMessages;
  const replies = world.scheduledReplies;
  const factions = Object.values(world.factions);
  const settlements = Object.values(world.settlements);
  const characters = Object.values(world.characters);
  const players = Object.values(world.players);
  const news = settlements.flatMap((s) => (s.news ?? []).map((record) => ({ settlementId: s.id, record })));
  const foodRatios = settlements.flatMap((s) => s.foodRatios ?? []);
  const occupations = settlements.filter((s) => s.occupation);
  const scars = characters.flatMap((c) => c.scars);
  const debts = characters.flatMap((c) => c.debts.map((d) => ({ characterId: c.id, debt: d })));
  const carriedNews = characters.flatMap((c) => c.carriedNews ?? []);
  const goals = characters.flatMap((c) => c.goals);
  const orders = characters.flatMap((c) => c.standingOrders);
  const relationships = characters.flatMap((c) => Object.entries(c.relationships).map(([id, rel]) => ({ from: c.id, to: id, rel })));
  const knowledge = characters.flatMap((c) => Object.entries(c.knowledge).map(([id, k]) => ({ characterId: c.id, settlementId: id, k })));
  const homeService = characters.flatMap((c) => Object.entries(c.homeService ?? {}));
  const sightings = characters.flatMap((c) => Object.entries(c.partySightings ?? {}).map(([id, s]) => ({ viewerId: c.id, subjectId: id, s })));
  const releaseSightings = characters.filter((c) => c.releaseSighting);
  const tagScores = players.flatMap((p) => Object.entries(p.conversationTagScores));
  const acknowledgements = players.flatMap((p) => Object.entries(p.briefingAcknowledgements));
  const known = players.flatMap((p) => p.knownCharacterIds);
  const aftermath = world.secessionAftermath;
  const newsByPort = Object.fromEntries(settlements.map((s) => [s.id, (s.news ?? []).length]));
  const eventTypes: Record<string, number> = {};
  for (const event of eventsSoFar) eventTypes[event.type] = (eventTypes[event.type] ?? 0) + 1;

  const structures: Record<string, CountBytes & { extra?: Record<string, unknown> }> = {
    contracts: {
      ...cb(contracts.length, world.contracts ?? {}),
      extra: {
        byStatus: byKey(contracts, (c) => c.status),
        open: cb(contracts.filter((c) => OPEN_CONTRACT.has(c.status)).length, contracts.filter((c) => OPEN_CONTRACT.has(c.status))),
        closed: cb(contracts.filter((c) => !OPEN_CONTRACT.has(c.status)).length, contracts.filter((c) => !OPEN_CONTRACT.has(c.status))),
        settled: contracts.filter((c) => c.settled).length,
        unsettled: contracts.filter((c) => !c.settled).length,
        closedOlderThan180: contracts.filter((c) => !OPEN_CONTRACT.has(c.status) && world.tick - c.observedTick > 180).length,
        closedOlderThan240: contracts.filter((c) => !OPEN_CONTRACT.has(c.status) && world.tick - c.observedTick > 240).length,
      },
    },
    conversationThreads: cb(threads.length, world.conversationThreads),
    conversationMessages: cb(messages.length, messages),
    scheduledReplies: {
      ...cb(replies.length, replies),
      extra: {
        pending: replies.filter((r) => r.status === "pending").length,
        other: replies.filter((r) => r.status !== "pending").length,
      },
    },
    pendingCommands: cb(world.pendingCommands.length, world.pendingCommands),
    activeBattles: cb(Object.keys(world.activeBattles).length, world.activeBattles),
    alliances: cb((world.alliances ?? []).length, world.alliances ?? []),
    allianceMemory: cb((world.allianceMemory ?? []).length, world.allianceMemory ?? []),
    allianceRaids: cb(Object.keys(world.allianceRaids ?? {}).length, world.allianceRaids ?? {}),
    aftermathRecords: cb((aftermath?.records ?? []).length, aftermath?.records ?? []),
    aftermathPeace: cb((aftermath?.peace ?? []).length, aftermath?.peace ?? []),
    factions: cb(factions.length, world.factions),
    settlements: cb(settlements.length, world.settlements),
    characters: {
      ...cb(characters.length, world.characters),
      extra: { alive: characters.filter((c) => !c.dead).length, dead: characters.filter((c) => c.dead).length },
    },
    players: cb(players.length, world.players),
    settlementNews: {
      ...cb(news.length, settlements.map((s) => s.news ?? [])),
      extra: {
        portsWithNews: settlements.filter((s) => (s.news ?? []).length > 0).length,
        byPort: newsByPort,
        maxPerPort: Math.max(0, ...Object.values(newsByPort)),
        olderThan24: news.filter((n) => world.tick - n.record.item.observedTick > 24).length,
        olderThan180: news.filter((n) => world.tick - n.record.item.observedTick > 180).length,
      },
    },
    foodRatios: cb(foodRatios.length, settlements.map((s) => s.foodRatios ?? [])),
    occupations: cb(occupations.length, occupations.map((s) => s.occupation)),
    scars: cb(scars.length, characters.map((c) => c.scars)),
    debts: {
      ...cb(debts.length, characters.map((c) => c.debts)),
      extra: {
        remainingPositive: debts.filter((d) => d.debt.remainingValue > 0).length,
        remainingZero: debts.filter((d) => d.debt.remainingValue <= 0).length,
      },
    },
    carriedNews: {
      ...cb(carriedNews.length, characters.map((c) => c.carriedNews ?? [])),
      extra: { carriers: characters.filter((c) => (c.carriedNews ?? []).length > 0).length },
    },
    goals: cb(goals.length, characters.map((c) => c.goals)),
    standingOrders: {
      ...cb(orders.length, characters.map((c) => c.standingOrders)),
      extra: {
        open: orders.filter((o) => OPEN_ORDER.has(o.status)).length,
        closed: orders.filter((o) => !OPEN_ORDER.has(o.status)).length,
        closedOlderThan180: orders.filter((o) => !OPEN_ORDER.has(o.status) && world.tick - o.statusChangedTick > 180).length,
      },
    },
    relationships: cb(relationships.length, characters.map((c) => c.relationships)),
    knowledge: cb(knowledge.length, characters.map((c) => c.knowledge)),
    homeService: cb(homeService.length, characters.map((c) => c.homeService ?? {})),
    partySightings: {
      ...cb(sightings.length, characters.map((c) => c.partySightings ?? {})),
      extra: { viewers: characters.filter((c) => Object.keys(c.partySightings ?? {}).length > 0).length },
    },
    releaseSightings: cb(releaseSightings.length, releaseSightings.map((c) => c.releaseSighting)),
    conversationTagScores: cb(tagScores.length, players.map((p) => p.conversationTagScores)),
    briefingAcknowledgements: cb(acknowledgements.length, players.map((p) => p.briefingAcknowledgements)),
    knownCharacterIds: cb(known.length, players.map((p) => p.knownCharacterIds)),
  };

  const namedRoots = new Set([
    "contracts",
    "conversationThreads",
    "conversationMessages",
    "scheduledReplies",
    "pendingCommands",
    "activeBattles",
    "alliances",
    "allianceMemory",
    "allianceRaids",
    "secessionAftermath",
    "factions",
    "settlements",
    "characters",
    "players",
  ]);
  const discovered: Array<{ path: string; n: number; bytes: number }> = [];
  const walk = (value: unknown, path: string, skip: boolean) => {
    if (value == null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      if (!skip && value.length > 0) discovered.push({ path, n: value.length, bytes: bytes(value) });
      for (let i = 0; i < value.length; i++) walk(value[i], `${path}[]`, false);
      return;
    }
    const entries = Object.entries(value as Record<string, unknown>);
    const recordLike = entries.length > 0 && entries.every(([, v]) => v !== null && typeof v === "object" && !Array.isArray(v));
    if (!skip && recordLike && path !== "world") discovered.push({ path, n: entries.length, bytes: bytes(value) });
    for (const [key, nested] of entries) {
      const child = path === "world" ? key : `${path}.${key}`;
      walk(nested, child, path === "world" && namedRoots.has(key));
    }
  };
  walk(world, "world", false);

  return {
    tick: world.tick,
    hash8: stateHash(world).slice(0, 8),
    hash: stateHash(world),
    worldBytes: bytes(world),
    worldJsonBytes: jsonBytes(world),
    eventCount: eventsSoFar.length,
    eventBytes: eventsSoFar.length === 0 ? 0 : jsonBytes(eventsSoFar),
    nextEventSequence: world.nextEventSequence,
    structures,
    topEventTypes: Object.entries(eventTypes)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([type, n]) => ({ type, n })),
    discovered: discovered
      .filter((d) => d.n >= 8 || d.bytes >= 2048)
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 40),
  };
}

type Inv = ReturnType<typeof inventory>;

function growth(snaps: Inv[]) {
  const out: Array<{ from: number; to: number; ticks: number; per1000: Record<string, { n: number; bytes: number; worldBytes: number; eventCount: number; eventBytes: number }> }> = [];
  for (let i = 1; i < snaps.length; i++) {
    const a = snaps[i - 1], b = snaps[i];
    const dt = b.tick - a.tick;
    if (dt <= 0) continue;
    const scale = 1000 / dt;
    const per1000: Record<string, { n: number; bytes: number; worldBytes: number; eventCount: number; eventBytes: number }> = {};
    const keys = new Set([...Object.keys(a.structures), ...Object.keys(b.structures)]);
    for (const key of keys) {
      per1000[key] = {
        n: ((b.structures[key]?.n ?? 0) - (a.structures[key]?.n ?? 0)) * scale,
        bytes: ((b.structures[key]?.bytes ?? 0) - (a.structures[key]?.bytes ?? 0)) * scale,
        worldBytes: 0,
        eventCount: 0,
        eventBytes: 0,
      };
    }
    per1000._world = {
      n: 0,
      bytes: 0,
      worldBytes: (b.worldBytes - a.worldBytes) * scale,
      eventCount: (b.eventCount - a.eventCount) * scale,
      eventBytes: (b.eventBytes - a.eventBytes) * scale,
    };
    out.push({ from: a.tick, to: b.tick, ticks: dt, per1000 });
  }
  return out;
}

for (const seed of seeds) {
  const started = Date.now();
  const world = createPrototypeWorld(seed);
  const events: SimEvent[] = [];
  const snaps: Inv[] = [];
  const take = () => snaps.push(inventory(world, events));
  take();
  let hash72 = "";
  for (let i = 0; i < ticks; i++) {
    events.push(...runTick(world, { ...opts }).events);
    const tick = world.tick;
    if (tick === 72) hash72 = stateHash(world).slice(0, 8);
    if (snapTicks.includes(tick)) take();
  }
  let replayExact: boolean | null = null;
  if (doReplay) {
    const replay = createPrototypeWorld(seed);
    replayWithSilentStarts(replay, events);
    replayExact = stateHash(replay) === stateHash(world);
  }
  const last = snaps[snaps.length - 1];
  const row = {
    label,
    seed,
    ticks,
    hash72,
    hashEnd8: last.hash8,
    hashEnd: last.hash,
    replayExact,
    elapsedMs: Date.now() - started,
    snaps,
    growth: growth(snaps),
  };
  console.log(JSON.stringify(row));
}
