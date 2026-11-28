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
const PRIVATE = ["price", "priceBasis", "kind", "trigger", "since", "cause", "reserve", "offerId", "payerFactionId", "receiverStanding", "reason"];

for (const seed of seeds) {
  const w = createPrototypeWorld(seed);
  const events: SimEvent[] = [];
  let hash72 = "";
  for (let i = 0; i < ticks; i++) {
    events.push(...runTick(w, { ...opts }).events);
    if (i === 71) hash72 = stateHash(w).slice(0, 8);
  }
  // Replay with a pre-apply check (same loop as tick-start.ts replayWithSilentStarts).
  const r = createPrototypeWorld(seed);
  const viol: string[] = [];
  const offers = new Map<string, SimEvent>(); const declined = new Set<string>();
  const partyAt = new Map<string, number>(); const lastGiven = new Map<string, { from: string; tick: number }>();
  let idx = 0, atStart = events.length > 0;
  while (idx < events.length) {
    if (atStart) { while (idx < events.length && events[idx].type === "character-died") applyEvent(r, events[idx++]); applySilentTickStart(r); atStart = false; continue; }
    const e = events[idx];
    if (e.type === "transfer-offered") {
      offers.set(e.data.offerId as string, e);
      if (r.settlements[e.settlementId!].factionId !== e.data.sellerFactionId) viol.push(`offer by a non-holder t${e.tick} ${e.settlementId}`);
      if (portsOf(r, e.data.sellerFactionId as string) < 2) viol.push(`offer from a seller with < 2 ports t${e.tick}`);
    }
    if (e.type === "transfer-declined") {
      if (!offers.has(e.data.offerId as string)) viol.push(`decline without offer t${e.tick}`);
      declined.add(e.data.offerId as string);
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
  }));
}
