// Seed 3000 / exile-off mechanism trace: ATLS + fix, flag off vs on, event diffs from a sale tick.
// Usage: node --experimental-strip-types docs/design/negotiated-transfer/trace-3000.ts
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { freeMateCount } from "../../../src/sim/allowance.ts";
import type { SimEvent, WorldState } from "../../../src/sim/types.ts";
import { writeFileSync } from "node:fs";

const ATLS = { occupation: false, alliances: true, portTransfer: true, lifecycle: true, secessionAftermath: true } as const;
const ticks = 1200;
const portsOf = (w: WorldState, f: string) => Object.values(w.settlements).filter((s) => s.factionId === f).map((s) => s.id).sort();
const reserve = (w: WorldState, f: string) => 18 * (freeMateCount(w, f) + portsOf(w, f).length);
const r2 = (n: number) => Math.round(n * 100) / 100;
const fname = (w: WorldState, id: string | null | undefined) => {
  if (!id) return null;
  const c = w.characters[id];
  return c ? `${c.name}<${c.factionId ?? "none"}:${c.troops.count}t>` : id;
};
const holder = (w: WorldState, port: string) => w.settlements[port]?.factionId ?? "neutral";

type Row = {
  label: string;
  seed: number;
  exileOff: boolean;
  nt: boolean;
  transfers: any[];
  captures: any[];
  starts: any[];
  resolved: any[];
  claims: any[];
  recruited: any[];
  decisions: any[];
  diplomacy: any[];
  snapshots: any[];
  treasuries: any[];
  tax: Record<string, number>;
  drawn: Record<string, Record<string, number>>;
};

function run(label: string, seed: number, opts: Record<string, unknown>, saleTickFocus: number): Row {
  const w = createPrototypeWorld(seed);
  const transfers: any[] = [];
  const captures: any[] = [];
  const starts: any[] = [];
  const resolved: any[] = [];
  const claims: any[] = [];
  const recruited: any[] = [];
  const decisions: any[] = [];
  const diplomacy: any[] = [];
  const snapshots: any[] = [];
  const treasuries: any[] = [];
  const tax: Record<string, number> = { "world-government": 0, "free-tide": 0 };
  const drawn: Record<string, Record<string, number>> = { "world-government": {}, "free-tide": {} };
  const snapAt = new Set([saleTickFocus - 1, saleTickFocus, saleTickFocus + 1, 200, 300, 400, 600, 900, 1199]);
  const ports = ["cinder-key", "crown-harbor", "glassport", "verdant-cay"];
  const addDrawn = (f: string | null | undefined, type: string, n: number) => {
    if (!f || !drawn[f] || !n) return;
    drawn[f][type] = (drawn[f][type] ?? 0) + n;
  };
  const snap = (tag: string) => {
    const fac = (f: string) => ({
      treasury: r2(w.factions[f].treasury),
      reserve: reserve(w, f),
      surplus: r2(w.factions[f].treasury - reserve(w, f)),
      ports: portsOf(w, f),
      mates: freeMateCount(w, f),
      tax: w.factions[f].taxRate,
      living: Object.values(w.characters).filter((c) => !c.dead && c.factionId === f).length,
      troops: Object.values(w.characters).filter((c) => !c.dead && c.factionId === f).reduce((n, c) => n + c.troops.count, 0),
      docked: Object.fromEntries(ports.map((p) => [p, Object.values(w.characters).filter((c) => !c.dead && !c.travel && !c.captivity && c.factionId === f && c.locationId === p).map((c) => `${c.id}:${c.name}:${c.troops.count}`)])),
    });
    const pstate = Object.fromEntries(ports.map((p) => [p, { holder: holder(w, p), garrison: w.settlements[p].garrison, stability: r2(w.settlements[p].stability) }]));
    const pacts = ((w as any).alliances ?? []).map((a: any) => ({ factions: a.factionIds, enemy: a.enemyFactionId, formed: a.formedTick }));
    const peace = (w.secessionAftermath?.peace ?? []).map((p) => ({ factions: p.factionIds, tick: p.tick }));
    snapshots.push({ tag, tick: w.tick, wg: fac("world-government"), ft: fac("free-tide"), ports: pstate, pacts, peace });
  };
  for (let i = 0; i < ticks; i++) {
    if (w.tick === saleTickFocus) snap("before-sale-tick");
    const evs = runTick(w, opts).events;
    for (const e of evs) {
      const actor = e.actorId ? w.characters[e.actorId] : undefined;
      const actorFac = actor?.factionId ?? null;
      if (e.type === "settlement-transferred" || e.type === "settlement-purchased") {
        transfers.push({ type: e.type, tick: e.tick, port: e.settlementId, from: e.data.sellerFactionId ?? e.data.previousFactionId ?? null, to: e.data.factionId, kind: e.data.kind, trigger: e.data.trigger, price: e.data.price, garrison: (e.data.priceBasis as any)?.garrison, actor: fname(w, e.actorId) });
      }
      if (e.type === "character-captured") {
        captures.push({ tick: e.tick, port: e.settlementId, who: fname(w, e.actorId), whoId: e.actorId, whoFaction: actorFac, captor: e.targetId, cause: e.data.cause, risk: e.data.displayedRisk, chance: e.data.captureChance, roll: e.data.captureRoll, health: e.data.health, morale: e.data.morale, troops: actor?.troops.count ?? (e.data.captivity as any)?.scatteredTroops?.count, battleId: e.data.battleId });
      }
      if (e.type === "battle-started") {
        starts.push({ tick: e.tick, port: e.settlementId, attacker: fname(w, e.actorId), attackerId: e.actorId, attackerFaction: actorFac, defender: e.targetId, troops: actor?.troops.count, garrison: e.settlementId ? w.settlements[e.settlementId].garrison : null, holder: e.settlementId ? holder(w, e.settlementId) : null });
      }
      if (e.type === "battle-resolved") {
        resolved.push({ tick: e.tick, port: e.settlementId, attacker: fname(w, e.actorId), attackerId: e.actorId, attackerFaction: actorFac, defender: e.targetId, dataOutcome: e.data.outcome ?? e.data.result ?? e.data.winner ?? null });
      }
      if (e.type === "settlement-claimed") {
        claims.push({ tick: e.tick, port: e.settlementId, actor: fname(w, e.actorId), actorId: e.actorId, actorFaction: actorFac, previous: e.data.previousFactionId ?? e.targetId, next: e.data.factionId, garrison: e.settlementId ? w.settlements[e.settlementId].garrison : null });
      }
      if (e.type === "recruited") {
        recruited.push({ tick: e.tick, port: e.settlementId, actor: fname(w, e.actorId), actorId: e.actorId, actorFaction: actorFac, qty: e.data.quantity, cost: e.data.cost ?? (typeof e.data.treasuryDrawn === "number" ? e.data.treasuryDrawn : null), treasuryDrawn: e.data.treasuryDrawn ?? 0 });
      }
      if (e.type === "decision-made" && (e.data.goal === "raid" || e.data.goal === "claim-settlement")) {
        decisions.push({ tick: e.tick, port: e.settlementId ?? e.data.targetId, goal: e.data.goal, actor: fname(w, e.actorId), actorId: e.actorId, actorFaction: actorFac, troops: actor?.troops.count });
      }
      if (e.type === "alliance-formed" || e.type === "alliance-broken" || e.type === "faction-peace" || e.type === "faction-peace-broken" || e.type === "secession-joined") {
        diplomacy.push({ type: e.type, tick: e.tick, data: { factionIds: e.data.factionIds ?? (e.data.alliance as any)?.factionIds, enemy: (e.data.alliance as any)?.enemyFactionId ?? e.data.enemyFactionId, reason: e.data.reason ?? e.data.cause, joined: e.data.joinedFactionId, factionId: e.data.factionId, port: e.settlementId } });
      }
      if ((e.type === "worked" || e.type === "market-trade") && typeof e.data.tax === "number" && e.settlementId) {
        const h = w.settlements[e.settlementId].factionId;
        if (h && tax[h] !== undefined) tax[h] += e.data.tax as number;
      }
      if (typeof e.data.treasuryDrawn === "number" && e.data.treasuryDrawn && actorFac && drawn[actorFac]) addDrawn(actorFac, e.type, e.data.treasuryDrawn as number);
    }
    if (w.tick === saleTickFocus || snapAt.has(w.tick) || (w.tick > saleTickFocus && w.tick <= saleTickFocus + 24 && w.tick % 6 === 0)) {
      if (w.tick === saleTickFocus) snap("after-sale-tick");
      else if (snapAt.has(w.tick) && w.tick !== saleTickFocus) snap(`t${w.tick}`);
      treasuries.push({ tick: w.tick, wg: r2(w.factions["world-government"].treasury), ft: r2(w.factions["free-tide"].treasury), wgPorts: portsOf(w, "world-government"), ftPorts: portsOf(w, "free-tide"), ftMates: freeMateCount(w, "free-tide"), ftReserve: reserve(w, "free-tide"), ftTroops: Object.values(w.characters).filter((c) => !c.dead && c.factionId === "free-tide").reduce((n, c) => n + c.troops.count, 0), wgTroops: Object.values(w.characters).filter((c) => !c.dead && c.factionId === "world-government").reduce((n, c) => n + c.troops.count, 0) });
    }
  }
  return { label, seed, exileOff: opts.exileRecovery === false, nt: opts.negotiatedTransfer === true, transfers, captures, starts, resolved, claims, recruited, decisions, diplomacy, snapshots, treasuries, tax, drawn };
}

const jobs: Array<[string, number, Record<string, unknown>, number]> = [
  ["ATLS-off-3000", 3000, { ...ATLS }, 120],
  ["ATLS-NT-3000", 3000, { ...ATLS, negotiatedTransfer: true }, 120],
  ["ATLS-exoff-off-3000", 3000, { ...ATLS, exileRecovery: false }, 120],
  ["ATLS-exoff-NT-3000", 3000, { ...ATLS, exileRecovery: false, negotiatedTransfer: true }, 120],
];
// 2718 exile-off has a single Glassport sale and captures at transferred ports 3→7.
jobs.push(["ATLS-exoff-off-2718", 2718, { ...ATLS, exileRecovery: false }, 408]);
jobs.push(["ATLS-exoff-NT-2718", 2718, { ...ATLS, exileRecovery: false, negotiatedTransfer: true }, 408]);

const out: Record<string, Row> = {};
for (const j of jobs) {
  console.error("running", j[0]);
  out[j[0]] = run(...j);
}
writeFileSync("docs/design/negotiated-transfer/raw/trace-runs.json", JSON.stringify(out));
console.log("wrote raw/trace-runs.json", Object.keys(out).map((k) => `${k}: cap ${out[k].captures.length} starts ${out[k].starts.length} xfer ${out[k].transfers.length}`).join("; "));
