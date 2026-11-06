// PORT_TRANSFER acceptance (docs/design/port-transfer.md §4 + the Lead's buyer rulings), offline, no AI.
// 13 seeds × 1,200 ticks, main defaults, port transfer off vs on. Exits 1 when a gated item fails.
// Gated: flag-off pins; every purchase valid (§4 properties 1–7) and caused, with the rulings checked
// (buyer = largest treasury surplus over reserve among qualifying factions, ties by id; agent = the buyer's first
// free docked member), recomputed from the world at the start of the tick; liveness (claims and port changes > 0
// on every seed, no new wipeouts, secessions on ≥ 6/13).
// Report-only: buyers, purchase ticks, prices, the owner at t1200, Verdant Cay battles and claims off vs on, claims and
// port changes (a purchase counts as a port change in the readout, per the Lead).
//   node --experimental-strip-types scripts/port-transfer-sweep.ts [--seeds ...] [--ticks 1200] [--json out.json]
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { PRICE_PER_SOLDIER, PURCHASE_CLOCK, rankBuyers, freeDocked } from "../src/sim/port-transfer.ts";
import { runTick } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";
import { dynamismReadout } from "../src/tools/dynamism.ts";
import type { SimEvent, WorldState } from "../src/sim/types.ts";

const { values } = parseArgs({ options: { seeds: { type: "string", default: "1847,2718,4096,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000" }, ticks: { type: "string", default: "1200" }, json: { type: "string" } } });
const seeds = values.seeds!.split(",").map(Number);
const ticks = Number(values.ticks);
export const DEFAULT_PINS: Record<number, [string, string]> = { 1847: ["7f76e474", "94de9c02"], 2718: ["976c40bd", "7a3741c9"], 4096: ["08943ea5", "af6eeaea"] };
const VC = "verdant-cay";
const portsOf = (w: WorldState, f: string) => Object.values(w.settlements).filter((s) => s.factionId === f).length;
const aliveF = (w: WorldState, f: string) => Object.values(w.characters).some((c) => !c.dead && c.factionId === f);
const wipeouts = (w: WorldState) => ["world-government", "free-tide"].filter((f) => portsOf(w, f) === 0 && !aliveF(w, f));
const label = (f: string | null) => (f === null ? "neutral" : f.startsWith("secession") ? `breakaway (${f})` : f);

function run(seed: number, on: boolean) {
  const w = createPrototypeWorld(seed); const events: SimEvent[] = []; const viol: string[] = []; const recompute: string[] = [];
  for (let i = 0; i < ticks; i++) {
    const clock = w.tick + 1 > 0 && (w.tick + 1) % PURCHASE_CLOCK === 0;
    const before = on && clock ? structuredClone(w) : null;
    const neutralBefore = new Set(Object.values(w.settlements).filter((s) => s.factionId === null).map((s) => s.id));
    const evs = runTick(w, on ? { portTransfer: true } : {}).events;
    for (const e of evs) {
      events.push(e);
      if (e.type !== "settlement-purchased") continue;
      const d = e.data as Record<string, any>;
      if (!neutralBefore.has(e.settlementId!)) viol.push(`1 port not neutral before the tick t${e.tick}`);
      if (e.tick <= 0 || e.tick % PURCHASE_CLOCK !== 0) viol.push(`2 off the clock t${e.tick}`);
      if (!d.payerFactionId || !w.factions[d.payerFactionId] || d.payerFactionId !== d.factionId) viol.push(`3 payer t${e.tick}`);
      if (d.price !== PRICE_PER_SOLDIER * d.priceBasis.garrison || !(d.price > 0)) viol.push(`4 price t${e.tick}`);
      if (!(d.treasuryBefore >= d.price + d.reserve) || Math.abs(d.treasuryAfter - (d.treasuryBefore - d.price)) > 0.005) viol.push(`5 cover/payment t${e.tick}`);
      if (!d.cause || !/^(adjacent|landless): /.test(d.cause)) viol.push(`6 cause t${e.tick}`);
      if (w.characters[d.ownerId]?.factionId !== d.factionId || e.actorId !== d.ownerId) viol.push(`7 agent not of buyer t${e.tick}`);
      // Ruling 1 on the record: candidates ordered by surplus desc then id; buyer first.
      const c = d.candidates as Array<{ factionId: string; surplus: number }>;
      if (!c?.length || c[0].factionId !== d.factionId || c.some((x, k) => k > 0 && (c[k - 1].surplus < x.surplus || (c[k - 1].surplus === x.surplus && c[k - 1].factionId > x.factionId)))) viol.push(`R1 candidate order t${e.tick}`);
      // Rulings 1 and 2 recomputed from the world at the start of the tick (secessions and alliances precede purchases in-tick).
      if (before) {
        before.tick = e.tick;
        const ranked = rankBuyers(before, e.settlementId!);
        const agent = freeDocked(before, e.settlementId!).find((x) => x.factionId === d.factionId);
        if (ranked[0]?.factionId !== d.factionId) recompute.push(`R1 buyer ${d.factionId} vs recomputed ${ranked[0]?.factionId ?? "none"} t${e.tick}`);
        if (agent?.id !== d.ownerId) recompute.push(`R2 agent ${d.ownerId} vs recomputed ${agent?.id ?? "none"} t${e.tick}`);
      }
    }
  }
  const t = dynamismReadout(events).totals;
  const buys = events.filter((e) => e.type === "settlement-purchased");
  return { seed, on, hash: stateHash(w).slice(0, 8), claims: events.filter((e) => e.type === "settlement-claimed").length, portChanges: t.portOwnershipChanges, secessions: t.secessions, wipeouts: wipeouts(w),
    vcBattles: events.filter((e) => e.type === "battle-started" && e.settlementId === VC).length, vcClaims: events.filter((e) => e.type === "settlement-claimed" && e.settlementId === VC).length,
    purchases: buys.map((b) => ({ tick: b.tick, port: b.settlementId, buyer: b.data.factionId as string, agent: b.actorId, price: b.data.price as number, cause: String(b.data.cause).split(":")[0], candidates: (b.data.candidates as unknown[]).length })),
    vcEnd: label(w.settlements[VC].factionId), violations: viol, recompute };
}

const pins: Record<string, { short: string; long: string; ok: boolean }> = {};
for (const [s, [p72, p1200]] of Object.entries(DEFAULT_PINS)) {
  const w = createPrototypeWorld(Number(s)); let short = "";
  for (let i = 0; i < 1200; i++) { runTick(w, {}); if (i === 71) short = stateHash(w).slice(0, 8); }
  pins[s] = { short, long: stateHash(w).slice(0, 8), ok: short === p72 && stateHash(w).slice(0, 8) === p1200 };
}
const off = seeds.map((s) => run(s, false)); const on = seeds.map((s) => run(s, true));
const offOf = (s: number) => off.find((r) => r.seed === s)!;
console.log("| Seed | Purchases | Buyer(s) | Tick(s) | Price(s) | Cause | VC owner t1200 (off → on) | VC battles off → on | VC claims off → on | Claims off → on | Port changes off → on | Secessions off → on | Violations |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const b of on) { const a = offOf(b.seed); const p = b.purchases; console.log(`| ${b.seed} | ${p.length} | ${p.map((x) => label(x.buyer)).join(", ") || "—"} | ${p.map((x) => x.tick).join(", ") || "—"} | ${p.map((x) => x.price).join(", ") || "—"} | ${p.map((x) => x.cause).join(", ") || "—"} | ${a.vcEnd} → ${b.vcEnd} | ${a.vcBattles} → ${b.vcBattles} | ${a.vcClaims} → ${b.vcClaims} | ${a.claims} → ${b.claims} | ${a.portChanges} → ${b.portChanges} | ${a.secessions} → ${b.secessions} | ${b.violations.length + b.recompute.length} |`); }
const sum = (rs: typeof on, k: "claims" | "portChanges" | "secessions" | "vcBattles" | "vcClaims") => rs.reduce((x, r) => x + r[k], 0);
const nBuys = on.reduce((a, r) => a + r.purchases.length, 0);
console.log(`| total | ${nBuys} | | | | | | ${sum(off, "vcBattles")} → ${sum(on, "vcBattles")} | ${sum(off, "vcClaims")} → ${sum(on, "vcClaims")} | ${sum(off, "claims")} → ${sum(on, "claims")} | ${sum(off, "portChanges")} → ${sum(on, "portChanges")} | ${sum(off, "secessions")} → ${sum(on, "secessions")} | ${on.reduce((a, r) => a + r.violations.length + r.recompute.length, 0)} |`);
const checks = {
  "pins_flagOff": Object.values(pins).every((p) => p.ok),
  "purchases_validAndCaused_0violations": on.every((r) => r.violations.length === 0) && off.every((r) => r.purchases.length === 0),
  "rulings_buyerAndAgentRecomputed_0mismatches": on.every((r) => r.recompute.length === 0),
  "liveness_claimsAndPortChangesEverySeed": on.every((r) => r.claims > 0 && r.portChanges > 0),
  "liveness_noNewWipeouts": on.every((r) => r.wipeouts.every((f) => offOf(r.seed).wipeouts.includes(f))),
  "liveness_secessionsOn6of13": on.filter((r) => r.secessions > 0).length >= 6,
};
console.log("pins:", JSON.stringify(pins));
console.log(`purchases ${nBuys} on ${on.filter((r) => r.purchases.length).length}/13 seeds; multi-candidate purchases ${on.reduce((a, r) => a + r.purchases.filter((p) => p.candidates > 1).length, 0)}; secession seeds ${on.filter((r) => r.secessions > 0).length}/13; min claims ${Math.min(...on.map((r) => r.claims))}, min port changes ${Math.min(...on.map((r) => r.portChanges))}`);
const bad = on.flatMap((r) => [...r.violations, ...r.recompute].map((v) => `${r.seed}: ${v}`)); if (bad.length) console.log("violations:", JSON.stringify(bad.slice(0, 20)));
console.log(JSON.stringify(checks));
const pass = Object.values(checks).every(Boolean);
if (values.json) writeFileSync(values.json, JSON.stringify({ pins, off, on, checks, pass }, null, 2));
if (!pass) { console.log("PORT TRANSFER ACCEPTANCE FAILED"); process.exitCode = 1; } else console.log("PORT TRANSFER ACCEPTANCE PASSED");
