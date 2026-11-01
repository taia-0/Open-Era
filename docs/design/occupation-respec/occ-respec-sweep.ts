// Occupation sweep (docs/design/occupation.md §5–§6): 13 seeds × 1,200 ticks, EXILE_RECOVERY on in both,
// OCCUPATION off (the exile-on baseline) vs on. Offline; no AI. Prints one JSON row per seed and mode,
// the per-bucket table, and exits 1 when an acceptance item fails.
//   node --experimental-strip-types scripts/occupation-sweep.ts [--seeds 1847,2718,...] [--ticks 1200] [--json out.json]
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { runTick } from "../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../src/sim/scenario.ts";
import { stateHash } from "../../src/sim/state.ts";
import { FOOD_LOG, BASELINE_LOG } from "../../src/sim/occupation.ts";
import { dynamismReadout } from "../../src/tools/dynamism.ts";
import type { SimEvent } from "../../src/sim/types.ts";

const { values } = parseArgs({ options: { seeds: { type: "string", default: "1847,2718,4096,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000" }, ticks: { type: "string", default: "1200" }, json: { type: "string" } } });
const seeds = values.seeds!.split(",").map(Number);
const ticks = Number(values.ticks);
/** §5 item 7: the exile-on baselines (13-seed port changes on 5e06c4c; §1 hold medians). */
export const CHURN_BASELINE_PORT_CHANGES = 713;
export const CHURN_LIMIT = Math.floor(1.5 * CHURN_BASELINE_PORT_CHANGES);
export const HOLD_BASELINE: Record<number, number> = { 1847: 38, 2718: 38, 4096: 37 };

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

interface Occ { port: string; tick: number; from: string | null; hs: number[]; stab0: number; stab60: number | null; upkeepLoss60: number; upkeeps60: number; end: number; flipBack120: boolean; ended: boolean; attempts: number; defectors: number; lastH: number }

function run(seed: number, occupation: boolean) {
  const world = createPrototypeWorld(seed);
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) for (const e of runTick(world, { exileRecovery: true, occupation }).events) events.push(e);
  const t = dynamismReadout(events).totals;
  // Holds: from a claim to the next claim or secession at the port; censored at the run's end.
  const occs: Occ[] = [];
  const open = new Map<string, Occ>();
  // Measurement only (diagnosis 2026-11-01): the port's last known stability, so upkeep drift can be separated from battle losses.
  const lastStability = new Map<string, number>();
  const close = (port: string, tick: number, newFaction: string | null) => {
    const o = open.get(port); if (!o) return;
    o.end = tick; o.ended = true; o.flipBack120 = newFaction !== null && newFaction === o.from && tick - o.tick <= 120; open.delete(port);
  };
  for (const e of events) {
    const port = e.settlementId!;
    const stabilityAfter = e.type === "battle-phase-resolved" ? Number(e.data.settlementStability) : e.type === "settlement-claimed" || e.type === "settlement-upkeep" || e.type === "settlement-shortage" || e.type === "secession-declared" ? Number(e.data.stability) : NaN;
    try {
    if (e.type === "settlement-claimed") {
      close(port, e.tick, (e.data.factionId as string | null) ?? null);
      const o: Occ = { port, tick: e.tick, from: (e.data.previousFactionId as string | null) ?? null, hs: [], stab0: Number(e.data.stability), stab60: null, upkeepLoss60: 0, upkeeps60: 0, end: ticks, flipBack120: false, ended: false, attempts: 0, defectors: 0, lastH: 0 };
      occs.push(o); open.set(port, o);
    } else if (e.type === "secession-declared") close(port, e.tick, String((e.data.faction as { id: string }).id));
    else if ((e.type === "settlement-upkeep" || e.type === "settlement-shortage") && open.has(port)) {
      const o = open.get(port)!;
      { const lh = (e.data.occupation as { harshness?: number } | undefined)?.harshness; if (typeof lh === "number") o.lastH = lh; }
      if (e.tick - o.tick <= 60) {
        const before = lastStability.get(port);
        if (before !== undefined) { o.upkeepLoss60 += before - Number(e.data.stability); o.upkeeps60++; }
        const h = (e.data.occupation as { harshness?: number } | undefined)?.harshness;
        if (typeof h === "number") o.hs.push(h);
        o.stab60 = Number(e.data.stability);
      }
    } else if (e.type === "battle-started" && open.has(port)) {
      const o = open.get(port)!;
      // Flag on, battle-started records the attacker's faction; the off baseline has no occupation to attempt.
      const attackerFaction = (e.data.attackerFactionId as string | null | undefined) ?? null;
      if (o.from && attackerFaction === o.from) { o.attempts++; o.defectors += Number(e.data.occupationDefectors ?? 0); }
    }
    } finally { if (port && Number.isFinite(stabilityAfter)) lastStability.set(port, stabilityAfter); }
  }
  const holds = occs.map((o) => o.end - o.tick);
  const ended = occs.filter((o) => o.ended);
  const ports = (f: string) => Object.values(world.settlements).filter((s) => s.factionId === f).length;
  const members = (f: string) => Object.values(world.characters).filter((c) => !c.dead && c.factionId === f).length;
  const wipeouts = ["world-government", "free-tide"].filter((f) => ports(f) === 0 && members(f) === 0);
  const meanH = (o: Occ) => o.hs.length ? o.hs.reduce((a, b) => a + b, 0) / o.hs.length : 0;
  const bucket = (name: "harsh" | "benign") => {
    const list = occs.filter((o) => (name === "harsh" ? meanH(o) >= 0.5 : meanH(o) < 0.25));
    return { n: list.length, stabLoss60: list.filter((o) => o.stab60 !== null).map((o) => o.stab0 - o.stab60!), upkeepLoss60: list.filter((o) => o.upkeeps60 > 0).map((o) => o.upkeepLoss60), attempts: list.reduce((a, o) => a + o.attempts, 0), defectors: list.reduce((a, o) => a + o.defectors, 0), flipBack120: list.filter((o) => o.flipBack120).length, ended: list.filter((o) => o.ended).length };
  };
  return {
    seed, mode: occupation ? "on" : "off", hash: stateHash(world).slice(0, 8),
    claims: occs.length, portChanges: t.portOwnershipChanges, secessions: t.secessions,
    holdMedian: median(holds), flipBack120: ended.filter((o) => o.flipBack120).length, endedHolds: ended.length,
    defectors: events.reduce((a, e) => a + (e.type === "battle-started" ? Number(e.data.occupationDefectors ?? 0) : 0), 0),
    integrations: events.filter((e) => e.type === "occupation-integrated").length,
    harsh: bucket("harsh"), benign: bucket("benign"), wipeouts, occs: occs.map((o) => ({ h: meanH(o), stab: o.stab60 !== null ? o.stab0 - o.stab60 : null, up: o.upkeeps60 > 0 ? o.upkeepLoss60 : null, attempts: o.attempts, defectors: o.defectors, flip: o.flipBack120, ended: o.ended, lastH: o.lastH })),
    hHistogram: { zero: occs.filter((o) => meanH(o) === 0).length, low: occs.filter((o) => meanH(o) > 0 && meanH(o) < 0.25).length, mid: occs.filter((o) => meanH(o) >= 0.25 && meanH(o) < 0.5).length, harsh: occs.filter((o) => meanH(o) >= 0.5).length, maxMeanH: Math.round(Math.max(0, ...occs.map(meanH)) * 1e4) / 1e4 },
  };
}

const rows = seeds.flatMap((seed) => [run(seed, false), run(seed, true)]);
for (const row of rows) console.log(JSON.stringify({ ...row, occs: undefined, harsh: { ...row.harsh, stabLoss60: median(row.harsh.stabLoss60), upkeepLoss60: median(row.harsh.upkeepLoss60) }, benign: { ...row.benign, stabLoss60: median(row.benign.stabLoss60), upkeepLoss60: median(row.benign.upkeepLoss60) } }));
const off = rows.filter((r) => r.mode === "off"); const on = rows.filter((r) => r.mode === "on");
const sum = (rs: typeof rows, k: "portChanges" | "claims" | "defectors" | "integrations" | "secessions") => rs.reduce((a, r) => a + r[k], 0);
const pool = (k: "harsh" | "benign") => ({ n: on.reduce((a, r) => a + r[k].n, 0), stabLoss60: median(on.flatMap((r) => r[k].stabLoss60)), upkeepLoss60: median(on.flatMap((r) => r[k].upkeepLoss60)), attempts: on.reduce((a, r) => a + r[k].attempts, 0), defectors: on.reduce((a, r) => a + r[k].defectors, 0), flipBack120: on.reduce((a, r) => a + r[k].flipBack120, 0), ended: on.reduce((a, r) => a + r[k].ended, 0) });
const allOcc = on.flatMap((r) => r.occs); const hs = allOcc.map((o) => o.h).sort((a, b) => a - b);
const t1 = hs[Math.floor(hs.length / 3)], t2 = hs[Math.floor((2 * hs.length) / 3)];
const tb = (list: typeof allOcc) => ({ n: list.length, stabLoss60: median(list.filter((o) => o.stab !== null).map((o) => o.stab!)), upkeepLoss60: median(list.filter((o) => o.up !== null).map((o) => o.up!)), attempts: list.reduce((a, o) => a + o.attempts, 0), defectors: list.reduce((a, o) => a + o.defectors, 0), flipBack120: list.filter((o) => o.flip).length, ended: list.filter((o) => o.ended).length });
const benign = tb(allOcc.filter((o) => o.h < t1)); const mid = tb(allOcc.filter((o) => o.h >= t1 && o.h < t2)); const harsh = tb(allOcc.filter((o) => o.h >= t2));
console.log(`tertiles of mean H: n=${hs.length} t1=${t1?.toFixed(4)} t2=${t2?.toFixed(4)} min ${hs[0]?.toFixed(4)} median ${hs[Math.floor(hs.length/2)]?.toFixed(4)} max ${hs[hs.length-1]?.toFixed(4)}; mid n=${mid.n} upkeepLoss60 ${mid.upkeepLoss60} stabLoss60 ${mid.stabLoss60} def/att ${mid.defectors}/${mid.attempts} flip ${mid.flipBack120}/${mid.ended}`);
const endedOcc = allOcc.filter((o) => o.ended); const hAt = endedOcc.filter((o) => o.lastH >= t2), bAt = endedOcc.filter((o) => o.lastH < t1);
const c2 = { n: hAt.length, harshFlip: hAt.filter((o) => o.flip).length, harshRate: hAt.length ? hAt.filter((o) => o.flip).length / hAt.length : 0, nb: bAt.length, benignFlip: bAt.filter((o) => o.flip).length, benignRate: bAt.length ? bAt.filter((o) => o.flip).length / bAt.length : 0 };
console.log("2c at flip:", JSON.stringify(c2), "old 2c (mean-H tertile):", JSON.stringify({ h: [harsh.flipBack120, harsh.ended], b: [benign.flipBack120, benign.ended] }));
const perAttempt = (b: ReturnType<typeof tb>) => (b.attempts ? b.defectors / b.attempts : 0);
const flipRate = (b: ReturnType<typeof tb>) => (b.ended ? b.flipBack120 / b.ended : 0);
const secMed = (rs: typeof rows) => median(rs.map((r) => r.secessions))!;
const checks = {
  "2a_upkeepOnly_harshLosesMore": (harsh.upkeepLoss60 ?? -Infinity) > (benign.upkeepLoss60 ?? Infinity),
  "2a_raw_info_only": true,
  "liveness_claimsAggregate_ge_0.33x": sum(on, "claims") >= 0.33 * sum(off, "claims"),
  "liveness_everySeedClaimsAndPortChanges": on.every((r) => r.claims > 0 && r.portChanges > 0),
  "2b_moreDefectorsPerRetake": perAttempt(harsh) > perAttempt(benign),
  "2c_atFlip_gatedIfN10": c2.n < 10 || c2.harshRate > c2.benignRate,
  "3_noNewWipeouts": on.every((r) => r.wipeouts.every((f) => off.find((o) => o.seed === r.seed)!.wipeouts.includes(f))),
  "4a_secessionMedianWithin1": Math.abs(secMed(on) - secMed(off)) <= 1,
  "4b_secessionSeeds": on.filter((r) => r.secessions >= 1).length >= Math.ceil(seeds.length / 2),
  "5_integrationOnHalfTheSeeds": on.filter((r) => r.integrations >= 1).length >= Math.ceil(seeds.length / 2),
  "7a_churnPortChanges": sum(on, "portChanges") <= CHURN_LIMIT,
  "7b_holdMedianNotFalling": Object.entries(HOLD_BASELINE).every(([s, base]) => { const r = on.find((x) => x.seed === Number(s)); return !r || (r.holdMedian ?? 0) >= base; }),
};
console.log("| Seed | Claims off/on | Port changes off/on | Secessions off/on | Hold median off/on | Flip-back≤120 off/on | Defectors | Integrations |");
console.log("|---|---|---|---|---|---|---|---|");
for (const seed of seeds) { const a = off.find((r) => r.seed === seed)!; const b = on.find((r) => r.seed === seed)!; console.log(`| ${seed} | ${a.claims} / ${b.claims} | ${a.portChanges} / ${b.portChanges} | ${a.secessions} / ${b.secessions} | ${a.holdMedian} / ${b.holdMedian} | ${a.flipBack120}/${a.endedHolds} / ${b.flipBack120}/${b.endedHolds} | ${b.defectors} | ${b.integrations} |`); }
console.log(`| total | ${sum(off, "claims")} / ${sum(on, "claims")} | ${sum(off, "portChanges")} / ${sum(on, "portChanges")} (limit ${CHURN_LIMIT}) | ${sum(off, "secessions")} / ${sum(on, "secessions")} (median ${secMed(off)} / ${secMed(on)}) | | | ${sum(on, "defectors")} | ${sum(on, "integrations")} |`);
console.log(`buckets: harsh n=${harsh.n} stabLoss60 median ${harsh.stabLoss60} defectors/attempt ${perAttempt(harsh).toFixed(3)} (${harsh.defectors}/${harsh.attempts}) flip-back≤120 ${harsh.flipBack120}/${harsh.ended}; benign n=${benign.n} stabLoss60 median ${benign.stabLoss60} defectors/attempt ${perAttempt(benign).toFixed(3)} (${benign.defectors}/${benign.attempts}) flip-back≤120 ${benign.flipBack120}/${benign.ended}`);
const hist = on.reduce((h, r) => ({ zero: h.zero + r.hHistogram.zero, low: h.low + r.hHistogram.low, mid: h.mid + r.hHistogram.mid, harsh: h.harsh + r.hHistogram.harsh, maxMeanH: Math.max(h.maxMeanH, r.hHistogram.maxMeanH) }), { zero: 0, low: 0, mid: 0, harsh: 0, maxMeanH: 0 });
console.log(`mean H over the first 60 ticks (flag on, all claims): 0: ${hist.zero}, (0, 0.25): ${hist.low}, [0.25, 0.5): ${hist.mid}, ≥ 0.5: ${hist.harsh}; max ${hist.maxMeanH}`);
// Measurement only (diagnosis, not a gate item yet): 2a with battle losses at the port excluded, i.e. the stability change from upkeeps alone over the first 60 ticks.
const measurement = { "2a_upkeepOnly_harshLosesMore": (harsh.upkeepLoss60 ?? -Infinity) > (benign.upkeepLoss60 ?? Infinity), harshUpkeepLoss60: harsh.upkeepLoss60, benignUpkeepLoss60: benign.upkeepLoss60 };
console.log(`measurement (not gated): 2a upkeep-only stability loss over 60 ticks, median harsh ${harsh.upkeepLoss60} vs benign ${benign.upkeepLoss60}`);
console.log(JSON.stringify(checks)); console.log(`claims ${sum(on, "claims")} vs 0.75x ${0.75 * sum(off, "claims")}; raw 2a harsh ${harsh.stabLoss60} benign ${benign.stabLoss60}`);
{ const q = (xs: number[], p: number) => { const z = [...xs].sort((a, b) => a - b); return z.length ? Math.round(z[Math.min(z.length - 1, Math.floor(p * z.length))] * 1e4) / 1e4 : null; }; const dd = (xs: number[]) => ({ n: xs.length, nonZero: xs.filter((x) => x > 0).length, p25: q(xs, .25), p50: q(xs, .5), p75: q(xs, .75), p90: q(xs, .9), max: q(xs, 1) });
console.log("food term per upkeep:", JSON.stringify(dd(FOOD_LOG)), "nonzero:", JSON.stringify(dd(FOOD_LOG.filter((x) => x > 0))), "baseline:", JSON.stringify(dd(BASELINE_LOG)));
console.log(`liveness: min claims on ${Math.min(...on.map((r) => r.claims))}, min port changes on ${Math.min(...on.map((r) => r.portChanges))}, ratio ${(sum(on, "claims") / sum(off, "claims")).toFixed(4)}, wipeouts on ${JSON.stringify(on.map((r) => r.wipeouts))}, off ${JSON.stringify(off.map((r) => r.wipeouts))}, integration seeds ${on.filter((r) => r.integrations > 0).length}, secession seeds ${on.filter((r) => r.secessions > 0).length}`); }
const pass = Object.values(checks).every(Boolean);
if (false) writeFileSync(values.json, JSON.stringify({ rows, harsh, benign, checks, measurement, churnLimit: CHURN_LIMIT, holdBaseline: HOLD_BASELINE, pass }, null, 2));
if (!pass) { console.log("OCCUPATION ACCEPTANCE FAILED"); process.exitCode = 1; } else console.log("OCCUPATION ACCEPTANCE PASSED");
