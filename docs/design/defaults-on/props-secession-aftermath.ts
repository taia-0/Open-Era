// SECESSION_AFTERMATH acceptance (docs/design/secession-aftermath.md §5 + Lead rulings), offline, no AI.
// 13 seeds × 1,200 ticks, defaults (EXILE_RECOVERY on), flag off vs on. Exits 1 when a gated item fails.
// Gated: flag-off pins (default and exile opt-out, 72 and 1,200); 0 property violations; replay exact;
// liveness (claims and port changes > 0 every seed, no new wipeouts, secessions on ≥ 6/13).
// Rulings checked as properties: no autonomous raid across a live peace; age 67 is legal (the check is age < 67);
// at most one peace and one protection; no peace after a break; join may still fire.
// Report-only: peaces, breaks, protections, joins, claims and battles vs off.
//   node --experimental-strip-types scripts/secession-aftermath-sweep.ts [--seeds ...] [--ticks 1200] [--json out.json]
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { ALLIANCE_RAID_WINDOW, allied } from "../../../src/sim/alliances.ts";
import { AFTERMATH_WINDOW, PATRON_NEAR, PEACE_GRIEVANCE, type Peace } from "../../../src/sim/secession-aftermath.ts";
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { stateHash } from "../../../src/sim/state.ts";
import { replayWithSilentStarts } from "../../../src/sim/tick-start.ts";
import { dynamismReadout } from "../../../src/tools/dynamism.ts";
import type { SimEvent, WorldState } from "../../../src/sim/types.ts";

const { values } = parseArgs({ options: { seeds: { type: "string", default: "1847,2718,4096,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000" }, ticks: { type: "string", default: "1200" }, json: { type: "string" } } });
const seeds = values.seeds!.split(",").map(Number);
const BASE: Record<string, unknown> = JSON.parse(process.env.DEFAULTS_ON_BASE ?? "{}"); // defaults-on.md: the other layers of the set under test
const ticks = Number(values.ticks);
const DEFAULT_PINS: Record<number, [string, string]> = { 1847: ["7f76e474", "94de9c02"], 2718: ["976c40bd", "7a3741c9"], 4096: ["08943ea5", "af6eeaea"] };
const OPT_OUT_PINS: Record<number, [string, string]> = { 1847: ["66e8ccb7", "b51aa07a"], 2718: ["b4ccedab", "091f7628"], 4096: ["b04c5ac4", "25bdbf15"] };

const portsOf = (w: WorldState, f: string) => Object.values(w.settlements).filter((s) => s.factionId === f).length;
const aliveF = (w: WorldState, f: string) => Object.values(w.characters).some((c) => !c.dead && c.factionId === f);
const wipeouts = (w: WorldState) => ["world-government", "free-tide"].filter((f) => portsOf(w, f) === 0 && !aliveF(w, f));
const isRaid = (e: SimEvent) => e.type === "battle-started" || (e.type === "battle-resolved" && !e.data.battleId);

function run(seed: number, on: boolean) {
  const w = createPrototypeWorld(seed);
  const events: SimEvent[] = [];
  const counts: Record<string, number> = {};
  const samples: string[] = [];
  const v = (property: string, detail: string) => {
    counts[property] = (counts[property] ?? 0) + 1;
    if (samples.length < 8) samples.push(`${property}: ${detail}`);
  };
  const livePeace: Peace[] = [];
  const peaceCount = new Map<string, number>();
  const protectionCount = new Map<string, number>();
  const joinCount = new Map<string, number>();
  const broken = new Set<string>();
  const raidTape = new Set<string>();
  const ages: number[] = [];
  let hash72 = "";
  const pairLive = (a?: string | null, b?: string | null) => !!a && !!b && a !== b && livePeace.some((p) => p.factionIds.includes(a) && p.factionIds.includes(b));
  for (let i = 0; i < ticks; i++) {
    const factionOf = new Map(Object.values(w.characters).map((c) => [c.id, c.factionId]));
    const evs = runTick(w, on ? { ...BASE, secessionAftermath: true } : {}).events;
    const playerRaiders = new Set<string>();
    evs.forEach((e, index) => {
      events.push(e);
      if (!on && (e.type.startsWith("aftermath-") || e.type.startsWith("faction-peace") || e.type === "secession-joined" || (e.type === "alliance-formed" && e.data.aftermath === "protection"))) v("flag-off-event", `${e.type} t${e.tick}`);
      if (e.type === "player-action-executed" && e.data.action === "raid" && e.actorId) playerRaiders.add(e.actorId);
      if (e.type === "secession-declared") {
        const data = e.data as { faction?: { id?: string }; ownerId?: string; followerIds?: string[] };
        const id = data.faction?.id;
        if (id && data.ownerId) factionOf.set(data.ownerId, id);
        for (const follower of data.followerIds ?? []) factionOf.set(follower, id ?? factionOf.get(follower) ?? null);
      }
      if (isRaid(e)) {
        const atk = e.actorId ? factionOf.get(e.actorId) : null;
        if (atk && e.targetId) raidTape.add(`${atk}>${e.targetId}@${e.tick}`);
        if (pairLive(atk, e.targetId)) {
          if (!e.actorId || !playerRaiders.has(e.actorId)) v("autonomous-raid-during-peace", `${atk}>${e.targetId} t${e.tick}`);
          const evidence = evs.some((other) => other.type === "faction-peace-broken" && (other.data.evidence as { raidTick?: number; raiderFactionId?: string; targetFactionId?: string }).raidTick === e.tick && (other.data.evidence as { raiderFactionId?: string }).raiderFactionId === atk && (other.data.evidence as { targetFactionId?: string }).targetFactionId === e.targetId);
          if (!evidence) v("break-same-tick", `${atk}>${e.targetId} t${e.tick}`);
        }
      }
      if (e.type === "faction-peace-broken") {
        const ids = e.data.factionIds as [string, string];
        const evidence = e.data.evidence as { raiderFactionId?: string; targetFactionId?: string; raidTick?: number };
        if (e.data.reason !== "raid" || !e.data.cause || !(typeof evidence.raidTick === "number" && evidence.raidTick > (e.data.peaceTick as number)) || !ids.includes(evidence.raiderFactionId ?? "") || !ids.includes(evidence.targetFactionId ?? "") || !raidTape.has(`${evidence.raiderFactionId}>${evidence.targetFactionId}@${evidence.raidTick}`)) v("break-evidence", `t${e.tick}`);
        const idx = livePeace.findIndex((p) => p.factionIds[0] === ids[0] && p.factionIds[1] === ids[1] && p.tick === e.data.peaceTick);
        if (idx < 0) v("break-evidence", `no live peace t${e.tick}`);
        else livePeace.splice(idx, 1);
        broken.add(ids[0]);
      }
      if (e.type === "faction-peace") {
        const peace = e.data.peace as Peace;
        const ids = peace.factionIds;
        const record = w.secessionAftermath?.records.find((r) => r.factionId === ids[0]);
        if (!peace.cause) v("cause", `peace t${e.tick}`);
        // Bilateral: the new friendly pair is exactly [S, O]. No other faction is added.
        if (!record || ids.length !== 2 || ids[0] !== record.factionId || ids[1] !== record.oldFactionId) v("peace-pair", `t${e.tick} ${ids?.join(",")}`);
        if (!((e.data.grievance as number) < PEACE_GRIEVANCE)) v("peace-grievance", `t${e.tick} ${e.data.grievance}`);
        if ((e.data.age as number) < AFTERMATH_WINDOW) v("age", `peace t${e.tick} age ${e.data.age}`);
        if (record && e.tick - record.declaredTick !== e.data.age) v("age", `peace age mismatch t${e.tick}`);
        const recent = [...raidTape].some((key) => {
          const [pair, tickText] = key.split("@");
          return pair === `${ids[1]}>${ids[0]}` && e.tick - Number(tickText) <= ALLIANCE_RAID_WINDOW && Number(tickText) <= e.tick;
        });
        if (recent) v("peace-old-raid", `t${e.tick}`);
        if ((peaceCount.get(ids[0]) ?? 0) >= 1) v("peace-once", ids[0]);
        if (broken.has(ids[0])) v("peace-after-break", `${ids[0]} t${e.tick}`);
        peaceCount.set(ids[0], (peaceCount.get(ids[0]) ?? 0) + 1);
        if (typeof e.data.age === "number") ages.push(e.data.age as number);
        livePeace.push(peace);
      }
      if (e.type === "alliance-formed" && e.data.aftermath === "protection") {
        const alliance = e.data.alliance as { factionIds: [string, string]; enemyFactionId: string; causes: Record<string, string> };
        const patron = e.data.patron as { factionId: string; distance: number; surplus: number; port: string };
        const record = w.secessionAftermath?.records.find((r) => r.factionId === alliance.factionIds[0]);
        if (!record) v("protection-patron", `no record t${e.tick}`);
        else {
          const age = e.tick - record.declaredTick;
          if (age < AFTERMATH_WINDOW) v("age", `protection t${e.tick} age ${age}`);
          else ages.push(age);
          if (!alliance.causes[alliance.factionIds[0]] || !alliance.causes[alliance.factionIds[1]]) v("protection-causes", `t${e.tick}`);
          if (!((e.data.ownSurplus as number) >= 0)) v("protection-own-surplus", `t${e.tick}`);
          if (!(patron.surplus >= 0)) v("patron-surplus", `protection t${e.tick}`);
          if (patron.factionId === record.oldFactionId || patron.factionId === alliance.enemyFactionId || patron.distance > PATRON_NEAR || alliance.factionIds[1] !== patron.factionId) v("protection-patron", `t${e.tick}`);
          if (pairLive(patron.factionId, record.oldFactionId) || pairLive(patron.factionId, alliance.enemyFactionId) || allied(w, patron.factionId, record.oldFactionId) || allied(w, patron.factionId, alliance.enemyFactionId)) v("protection-hostility", `t${e.tick}`);
          if ((protectionCount.get(record.factionId) ?? 0) >= 1) v("protection-once", record.factionId);
          protectionCount.set(record.factionId, (protectionCount.get(record.factionId) ?? 0) + 1);
        }
      }
      if (e.type === "secession-joined") {
        const data = e.data as { cause?: string; factionId: string; joinedFactionId: string; oldFactionId: string; memberIds: string[]; ports: string[]; patron: { factionId: string; distance: number; surplus: number; port: string }; ownSurplus: number };
        const record = w.secessionAftermath?.records.find((r) => r.factionId === data.factionId);
        if (!data.cause) v("cause", `join t${e.tick}`);
        if (!record) v("join-patron", `no record t${e.tick}`);
        else {
          const age = e.tick - record.declaredTick;
          if (age < AFTERMATH_WINDOW) v("age", `join t${e.tick} age ${age}`);
          else ages.push(age);
        }
        if (!(data.ownSurplus < 0)) v("join-own-surplus", `t${e.tick}`);
        if (!(data.patron.surplus >= 0) || data.patron.distance > PATRON_NEAR || data.patron.factionId === data.oldFactionId || data.joinedFactionId !== data.patron.factionId) v("join-patron", `t${e.tick}`);
        const threatId = data.cause?.match(/threat (?:raided|near): (\S+)/)?.[1];
        if (pairLive(data.patron.factionId, data.oldFactionId) || allied(w, data.patron.factionId, data.oldFactionId) || (threatId !== undefined && (data.patron.factionId === threatId || pairLive(data.patron.factionId, threatId) || allied(w, data.patron.factionId, threatId)))) v("join-hostility", `t${e.tick}`);
        const later = evs.slice(index + 1);
        for (const id of data.memberIds) {
          let expected = data.joinedFactionId;
          for (const laterEvent of later) if (laterEvent.type === "secession-joined" && (laterEvent.data.memberIds as string[]).includes(id)) expected = laterEvent.data.joinedFactionId as string;
          if (w.characters[id]?.factionId !== expected) v("join-moved", `member ${id} t${e.tick}`);
        }
        for (const portId of data.ports) {
          let expected = data.joinedFactionId;
          for (const laterEvent of later) if (laterEvent.type === "secession-joined" && (laterEvent.data.ports as string[]).includes(portId)) expected = laterEvent.data.joinedFactionId as string;
          if (w.settlements[portId]?.factionId !== expected) v("join-moved", `port ${portId} t${e.tick}`);
          if (w.settlements[portId]?.occupation) v("join-moved", `occupation ${portId} t${e.tick}`);
        }
        if (w.factions[data.factionId]?.treasury !== 0) v("join-moved", `treasury t${e.tick}`);
        if ((joinCount.get(data.factionId) ?? 0) >= 1) v("join-terminal", data.factionId);
        joinCount.set(data.factionId, (joinCount.get(data.factionId) ?? 0) + 1);
      }
    });
    if (i === 71) hash72 = stateHash(w).slice(0, 8);
  }
  let replayOk = true;
  if (on) {
    const replay = createPrototypeWorld(seed);
    replayWithSilentStarts(replay, events);
    replayOk = stateHash(replay) === stateHash(w);
    if (!replayOk) v("replay", "hash mismatch");
    const statePairs = (w.secessionAftermath?.peace ?? []).map((p) => `${p.factionIds[0]}|${p.factionIds[1]}|${p.tick}`).sort().join(",");
    const tapePairs = livePeace.map((p) => `${p.factionIds[0]}|${p.factionIds[1]}|${p.tick}`).sort().join(",");
    if (statePairs !== tapePairs) v("peace-bilateral", "peace tape diverges from state");
  }
  const t = dynamismReadout(events).totals;
  const n = (type: string) => events.filter((e) => e.type === type).length;
  return {
    seed, on, hash72, hash: stateHash(w).slice(0, 8),
    claims: n("settlement-claimed"), portChanges: t.portOwnershipChanges, battles: n("battle-resolved"), secessions: t.secessions,
    peace: n("faction-peace"), breaks: n("faction-peace-broken"),
    protection: events.filter((e) => e.type === "alliance-formed" && e.data.aftermath === "protection").length,
    joins: n("secession-joined"), ages, wipeouts: wipeouts(w), counts, samples, replayOk,
  };
}

function pinRun(options: { exileRecovery?: boolean }) {
  const out: Record<string, { short: string; long: string; ok: boolean }> = {};
  const table = options.exileRecovery === false ? OPT_OUT_PINS : DEFAULT_PINS;
  for (const [seedText, expected] of Object.entries(table)) {
    const seed = Number(seedText);
    const world = createPrototypeWorld(seed);
    let short = "";
    for (let i = 0; i < 1200; i++) {
      runTick(world, options);
      if (i === 71) short = stateHash(world).slice(0, 8);
    }
    const long = stateHash(world).slice(0, 8);
    out[seedText] = { short, long, ok: short === expected[0] && long === expected[1] };
  }
  return out;
}

const optOutPins = pinRun({ exileRecovery: false });
const off = seeds.map((seed) => run(seed, false));
const on = seeds.map((seed) => run(seed, true));
const defaultPins = Object.fromEntries(off.filter((row) => DEFAULT_PINS[row.seed]).map((row) => {
  const expected = DEFAULT_PINS[row.seed];
  return [String(row.seed), { short: row.hash72, long: row.hash, ok: row.hash72 === expected[0] && row.hash === expected[1] }];
}));
const offOf = (seed: number) => off.find((row) => row.seed === seed)!;
const sum = (rows: typeof on, key: "claims" | "portChanges" | "battles" | "secessions" | "peace" | "breaks" | "protection" | "joins") => rows.reduce((total, row) => total + row[key], 0);
const violations = on.reduce((total, row) => total + Object.values(row.counts).reduce((a, n) => a + n, 0), 0) + off.reduce((total, row) => total + Object.values(row.counts).reduce((a, n) => a + n, 0), 0);
const byProperty: Record<string, number> = {};
for (const row of [...off, ...on]) for (const [property, count] of Object.entries(row.counts)) byProperty[property] = (byProperty[property] ?? 0) + count;

console.log("| Seed | Peace | Breaks | Protection | Joins | Ages | Claims off/on | Port changes off/on | Battles off/on | Secessions off/on | Violations | Replay |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const row of on) {
  const base = offOf(row.seed);
  console.log(`| ${row.seed} | ${row.peace} | ${row.breaks} | ${row.protection} | ${row.joins} | ${row.ages.join(", ") || "—"} | ${base.claims}/${row.claims} | ${base.portChanges}/${row.portChanges} | ${base.battles}/${row.battles} | ${base.secessions}/${row.secessions} | ${Object.values(row.counts).reduce((a, n) => a + n, 0)} | ${row.replayOk ? "exact" : "MISMATCH"} |`);
}
console.log(`| total | ${sum(on, "peace")} | ${sum(on, "breaks")} | ${sum(on, "protection")} | ${sum(on, "joins")} | | ${sum(off, "claims")}/${sum(on, "claims")} | ${sum(off, "portChanges")}/${sum(on, "portChanges")} | ${sum(off, "battles")}/${sum(on, "battles")} | ${sum(off, "secessions")}/${sum(on, "secessions")} | ${violations} | |`);
const secessionSeeds = on.filter((row) => row.secessions > 0).length;
const checks = {
  "1_flagOffPinsDefault": Object.values(defaultPins).every((pin) => pin.ok),
  "1_flagOffPinsOptOut": Object.values(optOutPins).every((pin) => pin.ok),
  "2_propertyViolations0": violations === 0,
  "2_replayExact": on.every((row) => row.replayOk),
  liveness_claimsAndPortChangesEverySeed: on.every((row) => row.claims > 0 && row.portChanges > 0),
  liveness_noNewWipeouts: on.every((row) => row.wipeouts.every((faction) => offOf(row.seed).wipeouts.includes(faction))),
  liveness_secessionsOn6of13: secessionSeeds >= 6,
};
console.log("default pins:", JSON.stringify(defaultPins));
console.log("opt-out pins:", JSON.stringify(optOutPins));
console.log(`seeds with secession ${secessionSeeds}/13; min claims ${Math.min(...on.map((row) => row.claims))}, min port changes ${Math.min(...on.map((row) => row.portChanges))}`);
console.log("wipeouts off/on:", on.map((row) => `${row.seed}:${offOf(row.seed).wipeouts.join("+") || "none"}/${row.wipeouts.join("+") || "none"}`).join(" "));
console.log("violations by property:", JSON.stringify(byProperty));
if (violations) console.log("samples:", JSON.stringify([...off, ...on].flatMap((row) => row.samples.map((sample) => `${row.seed}${row.on ? "" : " off"}: ${sample}`)).slice(0, 30)));
console.log(JSON.stringify(checks));
const pass = Object.values(checks).every(Boolean);
if (values.json) writeFileSync(values.json, JSON.stringify({ defaultPins, optOutPins, off, on, checks, byProperty, pass }, null, 2));
if (!pass) { console.log("SECESSION AFTERMATH ACCEPTANCE FAILED"); process.exitCode = 1; }
else console.log("SECESSION AFTERMATH ACCEPTANCE PASSED");
