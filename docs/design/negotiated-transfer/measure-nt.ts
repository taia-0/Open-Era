// negotiated-transfer.md harness: one config × 13 seeds × 1,200 ticks, offline, no AI, $0.
// Usage: node --experimental-strip-types docs/design/negotiated-transfer/measure-nt.ts <label> '<TickOptions JSON>'
// One JSON row per seed: the defaults-on/measure.ts counts and hashes, the negotiated-transfer totals, and the
// property checks, replayed event by event on a fresh world so each check reads the world just before the event.
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { applyEvent, stateHash } from "../../../src/sim/state.ts";
import { applySilentTickStart } from "../../../src/sim/tick-start.ts";
import { freeMateCount } from "../../../src/sim/allowance.ts";
import { dynamismReadout } from "../../../src/tools/dynamism.ts";
import { projectEventFeed } from "../../../src/dashboard/view-model.ts";
import type { SimEvent, WorldState } from "../../../src/sim/types.ts";

const [label, optsJson] = process.argv.slice(2);
const opts = JSON.parse(optsJson ?? "{}");
const ticks = Number(process.env.TICKS ?? 1200);
const seeds = (process.env.SEEDS ?? "1847,2718,4096,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000").split(",").map(Number);
const portsOf = (w: WorldState, f: string) => Object.values(w.settlements).filter((s) => s.factionId === f).length;
const members = (w: WorldState, f: string) => Object.values(w.characters).filter((c) => !c.dead && c.factionId === f).length;
const cls = (f: string | null | undefined) => !f ? "none" : f.startsWith("secession-") ? "breakaway" : f;
const reserveOf = (w: WorldState, f: string) => 18 * (freeMateCount(w, f) + portsOf(w, f));
function emptyFlow() { return { tax: 0, ransom: 0, debt: 0, drawn: 0, purchase: 0, transferIn: 0, transferOut: 0, joinIn: 0, otherIn: 0, otherOut: 0 }; }
function emptySpell() { return { start: 0, minPorts: 0, open: true as boolean }; }

const PRIVATE = ["price", "priceBasis", "kind", "trigger", "since", "cause", "reserve", "offerId", "payerFactionId", "receiverStanding", "reason"];

for (const seed of seeds) {
  const w = createPrototypeWorld(seed);
  const events: SimEvent[] = [];
  let hash72 = "";
  const startTreasury: Record<string, number> = { "world-government": w.factions["world-government"].treasury, "free-tide": w.factions["free-tide"].treasury };
  const startTax: Record<string, number> = { "world-government": w.factions["world-government"].taxRate, "free-tide": w.factions["free-tide"].taxRate };
  const flow: Record<string, ReturnType<typeof emptyFlow>> = { "world-government": emptyFlow(), "free-tide": emptyFlow(), breakaway: emptyFlow() };
  const drawnBy: Record<string, Record<string, number>> = { "world-government": {}, "free-tide": {}, breakaway: {} };
  const bucket = (f: string | null | undefined) => f && flow[cls(f)] ? cls(f) : null;
  const add = (f: string | null | undefined, k: keyof ReturnType<typeof emptyFlow>, n: number) => { const b = bucket(f); if (b && n) flow[b][k] += n; };
  const taxTicks: Record<string, number[]> = { "world-government": [], "free-tide": [] };
  const clock: Record<string, { surplus: number[]; treasury: number[]; reserve: number[]; ports: number[]; mates: number[]; tax: number[] }> = {
    "world-government": { surplus: [], treasury: [], reserve: [], ports: [], mates: [], tax: [] },
    "free-tide": { surplus: [], treasury: [], reserve: [], ports: [], mates: [], tax: [] },
  };
  const spells: Record<string, { start: number; minPorts: number } | undefined> = {};
  const closedSpells: Record<string, number[]> = { "world-government": [], "free-tide": [], breakaway: [] };
  const closedSpells2: Record<string, number[]> = { "world-government": [], "free-tide": [], breakaway: [] };
  const belowTicks: Record<string, number> = { "world-government": 0, "free-tide": 0, breakaway: 0 };
  const belowTicks2: Record<string, number> = { "world-government": 0, "free-tide": 0, breakaway: 0 };
  const shortageTicks: Record<string, number> = { "world-government": 0, "free-tide": 0, breakaway: 0 };
  const garrisonLoss: Record<string, number> = { "world-government": 0, "free-tide": 0, breakaway: 0 };
  const holderTicks: Record<string, number> = { "world-government": 0, "free-tide": 0, breakaway: 0 };
  const taxRateIntegral: Record<string, number> = { "world-government": 0, "free-tide": 0 };
  for (let i = 0; i < ticks; i++) {
    for (const f of ["world-government", "free-tide"] as const) {
      taxRateIntegral[f] += w.factions[f].taxRate;
      taxTicks[f].push(w.factions[f].taxRate);
    }
    for (const f of Object.keys(w.factions)) {
      const p = portsOf(w, f); const b = cls(f);
      const short = p > 0 && w.factions[f].treasury < reserveOf(w, f);
      if (short) { belowTicks[b] = (belowTicks[b] ?? 0) + 1; if (p >= 2) belowTicks2[b] = (belowTicks2[b] ?? 0) + 1; }
      const cur = spells[f];
      if (short && !cur) spells[f] = { start: w.tick, minPorts: p };
      else if (short && cur) cur.minPorts = Math.min(cur.minPorts, p);
      else if (!short && cur) {
        const len = w.tick - cur.start;
        (closedSpells[b] ??= []).push(len);
        if (cur.minPorts >= 2) (closedSpells2[b] ??= []).push(len);
        delete spells[f];
      }
    }
    if (w.tick % 24 === 0 && w.tick > 0) {
      for (const f of ["world-government", "free-tide"] as const) {
        const p = portsOf(w, f), mates = freeMateCount(w, f), res = 18 * (mates + p), tre = w.factions[f].treasury;
        clock[f].surplus.push(Math.round((tre - res) * 100) / 100);
        clock[f].treasury.push(Math.round(tre * 100) / 100);
        clock[f].reserve.push(res);
        clock[f].ports.push(p);
        clock[f].mates.push(mates);
        clock[f].tax.push(w.factions[f].taxRate);
      }
    }
    const evs = runTick(w, { ...opts }).events;
    events.push(...evs);
    for (const e of evs) {
      const holder = e.settlementId ? w.settlements[e.settlementId]?.factionId : null;
      if ((e.type === "worked" || e.type === "market-trade") && typeof e.data.tax === "number") add(holder, "tax", e.data.tax as number);
      if (e.type === "captivity-released") {
        const r = e.data.ransom as { treasuryShare?: number; treasuryFactionId?: string } | undefined;
        if (r?.treasuryShare) add(r.treasuryFactionId, "ransom", r.treasuryShare);
      }
      if (e.type === "debt-repaid" && typeof e.data.amount === "number") add(e.targetId ?? (e.data.creditorFactionId as string), "debt", e.data.amount as number);
      if (typeof e.data.treasuryDrawn === "number" && e.data.treasuryDrawn) {
        const fac = e.actorId ? w.characters[e.actorId]?.factionId : null;
        add(fac, "drawn", e.data.treasuryDrawn as number);
        const b = bucket(fac);
        if (b) drawnBy[b][e.type] = (drawnBy[b][e.type] ?? 0) + (e.data.treasuryDrawn as number);
      }
      if (e.type === "settlement-purchased") add(e.data.payerFactionId as string, "purchase", e.data.price as number);
      if (e.type === "settlement-transferred") {
        const price = e.data.price as number;
        add(e.data.factionId as string, "transferOut", price);
        add(e.data.sellerFactionId as string, "transferIn", price);
      }
      if (e.type === "secession-joined" && typeof e.data.treasury === "number") add(e.data.joinedFactionId as string ?? e.targetId, "joinIn", e.data.treasury as number);
      if (e.type === "settlement-shortage") {
        add(holder, "otherOut", 0);
        const h = bucket(holder);
        if (h) { shortageTicks[h] += 1; garrisonLoss[h] += Number(e.data.garrisonLoss ?? 0); }
      }
    }
    for (const s of Object.values(w.settlements)) { const b = bucket(s.factionId); if (b) holderTicks[b] += 1; }
    if (i === 71) hash72 = stateHash(w).slice(0, 8);
  }
  for (const [f, cur] of Object.entries(spells)) {
    const b = cls(f), len = w.tick - cur.start;
    (closedSpells[b] ??= []).push(len);
    if (cur.minPorts >= 2) (closedSpells2[b] ??= []).push(len);
  }
  // Replay with a pre-apply check (same loop as tick-start.ts replayWithSilentStarts).
  const r = createPrototypeWorld(seed);
  const viol: string[] = [];
  const offers = new Map<string, SimEvent>(); const declined = new Set<string>();
  const partyAt = new Map<string, number>(); const lastGiven = new Map<string, { from: string; tick: number }>();
  const lastDecline = new Map<string, number>(); // ruling 3: seller|port|receiver -> decline tick
  let idx = 0, atStart = events.length > 0;
  while (idx < events.length) {
    if (atStart) { while (idx < events.length && events[idx].type === "character-died") applyEvent(r, events[idx++]); applySilentTickStart(r); atStart = false; continue; }
    const e = events[idx];
    if (e.type === "transfer-offered") {
      offers.set(e.data.offerId as string, e);
      if (r.settlements[e.settlementId!].factionId !== e.data.sellerFactionId) viol.push(`offer by a non-holder t${e.tick} ${e.settlementId}`);
      if (portsOf(r, e.data.sellerFactionId as string) < 2) viol.push(`offer from a seller with < 2 ports t${e.tick}`);
      const dk = `${e.data.sellerFactionId}|${e.settlementId}|${e.data.factionId}`;
      const prev = lastDecline.get(dk);
      if (prev !== undefined && e.tick - prev <= 152) viol.push(`re-offer within 152 after decline t${e.tick} ${dk} (declined t${prev})`);
    }
    if (e.type === "transfer-declined") {
      if (!offers.has(e.data.offerId as string)) viol.push(`decline without offer t${e.tick}`);
      declined.add(e.data.offerId as string);
      lastDecline.set(`${e.data.sellerFactionId}|${e.settlementId}|${e.data.factionId}`, e.tick);
    }
    if (e.type === "settlement-transferred") {
      const o = offers.get(e.data.offerId as string);
      if (!o || o.tick !== e.tick) viol.push(`transfer without a same-tick offer t${e.tick} ${e.settlementId}`);
      if (declined.has(e.data.offerId as string)) viol.push(`transfer after a decline t${e.tick}`);
      if (events[idx - 1]?.data?.offerId !== e.data.offerId || events[idx - 1].type !== "transfer-offered") viol.push(`transfer not immediately after its offer (no acceptance step) t${e.tick}`);
      const seller = e.data.sellerFactionId as string, buyer = e.data.factionId as string, price = e.data.price as number;
      if (r.settlements[e.settlementId!].factionId !== seller) viol.push(`seller did not hold the port t${e.tick} ${e.settlementId}`);
      if (portsOf(r, seller) < 2) viol.push(`seller left portless t${e.tick}`);
      const reserve = 18 * (freeMateCount(r, buyer) + portsOf(r, buyer) + 1);
      if (r.factions[buyer].treasury < price + reserve) viol.push(`buyer cannot pay t${e.tick}: ${r.factions[buyer].treasury} < ${price} + ${reserve}`);
      if (price < 0 || (e.data.kind === "grant" && price !== 0)) viol.push(`bad price t${e.tick}`);
      if (members(r, buyer) === 0) viol.push(`transfer to a dead faction t${e.tick}`);
      for (const f of [seller, buyer]) { if (partyAt.get(f) === e.tick) viol.push(`${f} in two transfers at t${e.tick}`); partyAt.set(f, e.tick); }
      const g = lastGiven.get(e.settlementId!);
      if (g && g.from === buyer && e.tick - g.tick <= 152) viol.push(`returned to its giver within 152 t${e.tick} ${e.settlementId}`);
      lastGiven.set(e.settlementId!, { from: seller, tick: e.tick });
      const agent = r.characters[e.actorId!];
      if (!agent || agent.dead || agent.factionId !== buyer || agent.locationId !== e.settlementId || agent.travel || agent.captivity) viol.push(`agent not a free docked member t${e.tick}`);
      if (Object.values(r.activeBattles).some((b) => b.settlementId === e.settlementId)) viol.push(`transfer during a battle t${e.tick}`);
      const next = events[idx + 1];
      if (!(next?.type === "news-posted" && next.settlementId === e.settlementId && (next.data.record as any)?.item?.type === "settlement-transferred")) viol.push(`no public news line t${e.tick}`);
      else if (PRIVATE.some((k) => JSON.stringify((next.data.record as any).item).includes(`"${k}"`))) viol.push(`news item carries a term t${e.tick}`);
      if (next?.type === "news-posted" && (next.data.record as any)?.item?.factionId !== buyer) viol.push(`news names the wrong holder t${e.tick}`);
    }
    applyEvent(r, e); idx += 1; if (e.type === "tick-advanced") atStart = true;
  }
  const replayExact = stateHash(r) === stateHash(w);
  // Projection: every negotiation row through the one feed path, for one viewer per faction (first living member by id).
  let projChecked = 0;
  const viewers = Object.keys(w.factions).map((f) => Object.values(w.characters).filter((c) => !c.dead && c.factionId === f).sort((a, b) => a.id.localeCompare(b.id))[0]).filter(Boolean);
  for (const e of events.filter((x) => x.type === "settlement-transferred" || x.type === "transfer-offered" || x.type === "transfer-declined")) {
    for (const v of viewers) {
      const party = v.factionId === e.data.sellerFactionId || v.factionId === e.data.factionId;
      const rows = projectEventFeed(w, v.id, [e]);
      projChecked += 1;
      if (e.type !== "settlement-transferred") {
        if (!party && rows.length) viol.push(`non-party sees ${e.type} t${e.tick}`);
        if (party && !rows.length) viol.push(`party misses ${e.type} t${e.tick}`);
        continue;
      }
      if (rows.length !== 1) { viol.push(`transfer row missing for ${v.id} t${e.tick}`); continue; }
      const row = rows[0] as any;
      if (!party) {
        if (row.data !== null && PRIVATE.some((k) => k in row.data)) viol.push(`non-party data carries a term t${e.tick}`);
        if (/Terms|sale|grant|price/i.test(String(row.summary))) viol.push(`non-party summary carries a term t${e.tick}: ${row.summary}`);
      } else if (row.data === null || typeof row.data.price !== "number" || !/Terms/.test(String(row.summary))) viol.push(`party cannot read the terms t${e.tick}`);
    }
  }
  const t = dynamismReadout(events).totals;
  const n = (type: string) => events.filter((e) => e.type === type).length;
  const tr = events.filter((e) => e.type === "settlement-transferred");
  const dec = events.filter((e) => e.type === "transfer-declined");
  const by = (xs: SimEvent[], k: string) => xs.reduce((a: Record<string, number>, e) => { const key = String(e.data[k]); a[key] = (a[key] ?? 0) + 1; return a; }, {});
  const factions = Object.keys(w.factions);
  const portless = factions.filter((f) => portsOf(w, f) === 0);
  console.log(JSON.stringify({
    label, seed, hash72, hash1200: stateHash(w).slice(0, 8), replayExact,
    claims: n("settlement-claimed"), portChanges: t.portOwnershipChanges, battles: n("battle-resolved"), captures: t.captures,
    secessions: t.secessions, peaces: n("faction-peace"), peaceBreaks: n("faction-peace-broken"), joins: n("secession-joined"),
    pacts: n("alliance-formed"), protectionPacts: events.filter((e) => e.type === "alliance-formed" && e.data.aftermath === "protection").length,
    pactBreaks: n("alliance-broken"), purchases: n("settlement-purchased"), promotions: n("character-promoted"), retirements: n("character-retired"),
    deaths: t.deaths, factions: factions.length, portless: portless.length, portlessWithMembers: portless.filter((f) => members(w, f) > 0).length,
    wipeouts: ["world-government", "free-tide"].filter((f) => portsOf(w, f) === 0 && members(w, f) === 0),
    offers: n("transfer-offered"), offersByTrigger: by(events.filter((e) => e.type === "transfer-offered"), "trigger"),
    accepts: tr.length, acceptsByKind: by(tr, "kind"), acceptsByTrigger: by(tr, "trigger"), acceptsByStanding: by(tr, "receiverStanding"),
    declines: dec.length, declinesByReason: by(dec, "reason"),
    pricePaid: tr.reduce((a, e) => a + (e.data.price as number), 0), prices: tr.map((e) => e.data.price),
    transfers: tr.map((e) => ({ tick: e.tick, port: e.settlementId, from: e.data.sellerFactionId, to: e.data.factionId, kind: e.data.kind, trigger: e.data.trigger, price: e.data.price, standing: e.data.receiverStanding })),
    watches: n("transfer-watch"), projChecked, violations: viol.length, sample: viol.slice(0, 5),
    battleStarts: n("battle-started"),
    capturesPerBattle: t.captures && n("battle-resolved") ? Math.round(1000 * t.captures / n("battle-resolved")) / 1000 : 0,
    byPort: (() => {
      const ports = new Set(events.flatMap((e) => e.settlementId ? [e.settlementId] : []));
      const out: Record<string, { started: number; resolved: number; captures: number; claims: number }> = {};
      for (const id of [...ports].sort()) out[id] = {
        started: events.filter((e) => e.type === "battle-started" && e.settlementId === id).length,
        resolved: events.filter((e) => e.type === "battle-resolved" && e.settlementId === id).length,
        captures: events.filter((e) => e.type === "character-captured" && e.settlementId === id).length,
        claims: events.filter((e) => e.type === "settlement-claimed" && e.settlementId === id).length,
      };
      return out;
    })(),
    transferWindows: tr.map((e) => {
      const t0 = e.tick, port = e.settlementId;
      const inWin = (type: string, lo: number, hi: number) => events.filter((x) => x.type === type && x.settlementId === port && x.tick >= lo && x.tick <= hi).length;
      const basis = e.data.priceBasis as { garrison?: number } | undefined;
      return {
        tick: t0, port, from: e.data.sellerFactionId, to: e.data.factionId, kind: e.data.kind, trigger: e.data.trigger, price: e.data.price,
        garrison: basis?.garrison ?? null, standing: e.data.receiverStanding,
        startedBefore: inWin("battle-started", t0 - 152, t0 - 1), startedAfter: inWin("battle-started", t0 + 1, t0 + 152),
        resolvedBefore: inWin("battle-resolved", t0 - 152, t0 - 1), resolvedAfter: inWin("battle-resolved", t0 + 1, t0 + 152),
        capturesBefore: inWin("character-captured", t0 - 152, t0 - 1), capturesAfter: inWin("character-captured", t0 + 1, t0 + 152),
        claimsBefore: inWin("settlement-claimed", t0 - 152, t0 - 1), claimsAfter: inWin("settlement-claimed", t0 + 1, t0 + 152),
      };
    }),
    capturesDetail: events.filter((e) => e.type === "character-captured").map((e) => ({
      tick: e.tick, port: e.settlementId, actorId: e.actorId, captor: e.targetId, cause: e.data.cause, actorFaction: e.actorId ? (w.characters[e.actorId]?.factionId ?? null) : null,
    })),
    raidStarts: events.filter((e) => e.type === "battle-started").map((e) => ({ tick: e.tick, port: e.settlementId, attacker: e.actorId, defender: e.targetId })),
    ft: (() => {
      const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)] : null; };
      const mean2 = (xs: number[]) => xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : 0;
      const r2 = (n: number) => Math.round(n * 100) / 100;
      const one = (f: "world-government" | "free-tide") => {
        const c = clock[f];
        const end = w.factions[f]?.treasury ?? 0;
        const attributed = flow[f].tax + flow[f].ransom + flow[f].debt + flow[f].transferIn + flow[f].joinIn - flow[f].drawn - flow[f].purchase - flow[f].transferOut;
        return {
          startTreasury: startTreasury[f], endTreasury: r2(end), startTax: startTax[f], endTax: w.factions[f]?.taxRate ?? null,
          taxTimeAvg: r2(taxRateIntegral[f] / ticks), taxSets: events.filter((e) => e.type === "tax-rate-set" && (e.data.factionId === f || e.targetId === f)).length,
          flow: { ...flow[f], tax: r2(flow[f].tax), ransom: r2(flow[f].ransom), debt: r2(flow[f].debt), drawn: r2(flow[f].drawn), purchase: r2(flow[f].purchase), transferIn: r2(flow[f].transferIn), transferOut: r2(flow[f].transferOut), joinIn: r2(flow[f].joinIn) },
          drawnBy: Object.fromEntries(Object.entries(drawnBy[f]).map(([k, v]) => [k, r2(v)])),
          residual: r2(end - startTreasury[f] - attributed),
          shortageSpells: closedSpells[f].length, shortageSpellP50: pct(closedSpells[f], 50), shortageSpellP90: pct(closedSpells[f], 90),
          shortageSpells2: closedSpells2[f].length, shortageSpell2P50: pct(closedSpells2[f], 50), shortageSpell2P90: pct(closedSpells2[f], 90),
          ticksBelow: belowTicks[f], ticksBelow2: belowTicks2[f],
          upkeepShortageTicks: shortageTicks[f], garrisonLoss: garrisonLoss[f], holderTicks: holderTicks[f],
          clock: { n: c.surplus.length, surplusP10: pct(c.surplus, 10), surplusP50: pct(c.surplus, 50), surplusP90: pct(c.surplus, 90),
            treasuryAvg: mean2(c.treasury), reserveAvg: mean2(c.reserve), portsAvg: mean2(c.ports), matesAvg: mean2(c.mates),
            surplusNeg: c.surplus.filter((x) => x < 0).length, portsAtLeast2: c.ports.filter((x) => x >= 2).length },
        };
      };
      return { "world-government": one("world-government"), "free-tide": one("free-tide"), breakaway: { flow: { ...flow.breakaway, tax: r2(flow.breakaway.tax) }, drawnBy: Object.fromEntries(Object.entries(drawnBy.breakaway).map(([k, v]) => [k, r2(v)])), ticksBelow: belowTicks.breakaway, ticksBelow2: belowTicks2.breakaway, shortageSpells: closedSpells.breakaway.length, shortageSpells2: closedSpells2.breakaway.length, upkeepShortageTicks: shortageTicks.breakaway, garrisonLoss: garrisonLoss.breakaway, holderTicks: holderTicks.breakaway } };
    })(),
  }));
}
