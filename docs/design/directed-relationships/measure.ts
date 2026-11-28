// directed-relationships.md harness: one config × 13 seeds × 1,200 ticks, offline, no AI, $0.
// Needs fix.patch + relationships.patch (or fix.patch + negotiated-transfer.patch + relationships-nt.patch) applied to src (not committed).
// Usage: node --experimental-strip-types docs/design/directed-relationships/measure.ts <label> '<TickOptions JSON>'
// One JSON row per seed: totals, reader decisions, ledger size, grievance distribution, hashes, replay, and the R / R-char
// property and projection-privacy checks. The checks restate the spec's rules here; they do not call the reducer hook.
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { applyEvent, clamp, commandHolderId, round, stateHash } from "../../../src/sim/state.ts";
import { applySilentTickStart, replayWithSilentStarts } from "../../../src/sim/tick-start.ts";
import { dynamismReadout } from "../../../src/tools/dynamism.ts";
import { projectFactions } from "../../../src/dashboard/visibility.ts";
import { projectEventFeed } from "../../../src/dashboard/view-model.ts";
import { ALLIANCE_RAID_WINDOW } from "../../../src/sim/alliances.ts";
import { GRUDGE_STEP, HARM_WINDOW, harmReceivedRows } from "../../../src/sim/relationships.ts";
import type { SimEvent, WorldState } from "../../../src/sim/types.ts";

const [label, optsJson] = process.argv.slice(2);
const opts = JSON.parse(optsJson ?? "{}");
const ticks = Number(process.env.TICKS ?? 1200);
const seeds = (process.env.SEEDS ?? "1847,2718,4096,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000").split(",").map(Number);
const PRESSED = 55; // secession.ts: a governor's port can secede at stability ≤ 55
const HATED = 0.12; // secession.ts HATED_GRIEVANCE
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null; };
const portsOf = (w: WorldState, f: string) => Object.values(w.settlements).filter((s) => s.factionId === f).length;
const members = (w: WorldState, f: string) => Object.values(w.characters).filter((c) => !c.dead && c.factionId === f).length;
type H = Record<string, { recent: Array<{ tick: number; kind: string }>; total: number; lastTick: number }>;
if (HARM_WINDOW !== ALLIANCE_RAID_WINDOW) throw new Error("HARM_WINDOW must equal ALLIANCE_RAID_WINDOW");

for (const seed of seeds) {
  const w = createPrototypeWorld(seed);
  const setup = Object.fromEntries(Object.values(w.characters).map((c) => [c.id, Object.fromEntries(Object.entries(c.relationships).map(([k, r]) => [k, r.grievance]))]));
  const events: SimEvent[] = [];
  let hash72 = "";
  const rd = { allianceDecisions: 0, allianceChanged: 0, transferDecisions: 0, transferOrderChanged: 0, transferFirstChanged: 0 };
  const grudges: Record<string, number> = {};
  const viol: Record<string, number> = {};
  const bad = (k: string) => { viol[k] = (viol[k] ?? 0) + 1; };
  (globalThis as { __relHook?: unknown }).__relHook = (d: Record<string, any>) => {
    if (d.reader === "grudge") { grudges[d.kind] = (grudges[d.kind] ?? 0) + 1; return; }
    if (d.reader === "alliance") {
      rd.allianceDecisions++; if (d.changed) rd.allianceChanged++;
      const c = d.candidates as Array<{ harm: number }>; const min = Math.min(...c.map((x) => x.harm));
      if (c[d.chosenIdx].harm !== min || c.findIndex((x) => x.harm === min) !== d.chosenIdx) bad("reader1-not-min-harm-then-id");
    }
    if (d.reader === "transfer") {
      rd.transferDecisions++; if (d.changed) rd.transferOrderChanged++; if (d.firstChanged) rd.transferFirstChanged++;
      const r = d.ranked as Array<{ factionId: string; pact: boolean; peace: boolean; harm: number; troops: number }>;
      for (let i = 1; i < r.length; i++) {
        const a = r[i - 1], b = r[i];
        const cmp = Number(b.pact) - Number(a.pact) || Number(b.peace) - Number(a.peace) || a.harm - b.harm || b.troops - a.troops || a.factionId.localeCompare(b.factionId);
        if (cmp > 0) bad("reader2-order");
      }
    }
  };
  let pressedPortTicks = 0, privacyChecks = 0;
  for (let i = 0; i < ticks; i++) {
    events.push(...runTick(w, { ...opts }).events);
    if (i === 71) hash72 = stateHash(w).slice(0, 8);
    pressedPortTicks += Object.values(w.settlements).filter((s) => s.factionId && s.stability <= PRESSED).length;
    if ((i + 1) % 100 === 0 || i === ticks - 1) {
      // Projection privacy (ruling 5): each faction's first living member as the viewer.
      for (const f of Object.keys(w.factions).sort()) {
        const viewer = Object.values(w.characters).filter((c) => !c.dead && c.factionId === f).sort((a, b) => a.id.localeCompare(b.id))[0];
        if (!viewer) continue;
        privacyChecks++;
        const rows = projectFactions(w, viewer) as Array<Record<string, any>>;
        for (const row of rows) {
          const has = "harmReceived" in row;
          if (!w.harm) { if (has) bad("privacy-key-without-ledger"); continue; }
          if (!has) { bad("privacy-key-missing"); continue; }
          if (row.id !== f) { if (row.harmReceived !== null) bad("privacy-rival-row-shows-harm"); continue; }
          const expect = Object.entries(w.harm as H).filter(([k]) => k.split(">")[1] === f)
            .map(([k, p]) => ({ factionId: k.split(">")[0], recent: p.recent.filter((e) => w.tick - e.tick <= HARM_WINDOW).length, total: p.total, lastTick: p.lastTick }))
            .sort((a, b) => a.factionId.localeCompare(b.factionId));
          if (JSON.stringify(row.harmReceived) !== JSON.stringify(expect)) bad("privacy-own-row-mismatch");
          if ((row.harmReceived as Array<{ factionId: string }>).some((x) => x.factionId === f)) bad("privacy-self-row");
          if (JSON.stringify(harmReceivedRows(w, f)) !== JSON.stringify(expect)) bad("privacy-helper-mismatch");
        }
      }
    }
  }
  (globalThis as { __relHook?: unknown }).__relHook = undefined;
  // Replay exact.
  const replay = createPrototypeWorld(seed);
  replayWithSilentStarts(replay, events);
  const replayExact = stateHash(replay) === stateHash(w);
  // Independent restatement on a second replay: ledger = fold of raid / capture / claim events; each grudge write = +GRUDGE_STEP.
  const r2 = createPrototypeWorld(seed);
  const expH: H = {};
  const addH = (by: string, on: string, kind: string, t: number) => { const k = `${by}>${on}`; const p = expH[k] ?? { recent: [], total: 0, lastTick: t }; p.recent = [...p.recent.filter((e) => t - e.tick <= HARM_WINDOW), { tick: t, kind }]; p.total++; p.lastTick = t; expH[k] = p; };
  let ledgerOn = false, charOn = false, grudgeChecks = 0;
  const step = (e: SimEvent) => {
    if (e.type === "harm-ledger-opened") ledgerOn = true;
    if (e.type === "grudge-ledger-opened") charOn = true;
    const pairs: Array<[string, string]> = [];
    if (e.type === "battle-started" || (e.type === "battle-resolved" && !e.data.battleId)) {
      const a = e.actorId ? r2.characters[e.actorId] : undefined; const atk = a?.factionId ?? null; const def = e.targetId ?? null;
      if (a && atk && def && atk !== def) {
        if (ledgerOn) addH(atk, def, "raid", e.tick);
        if (charOn) { const holder = e.settlementId ? r2.settlements[e.settlementId]?.ownerId ?? null : null; const cmd = commandHolderId(r2, def); for (const t of [...new Set([holder, cmd])]) if (t && t !== a.id && r2.characters[t]) pairs.push([a.id, t]); }
      }
    } else if (e.type === "character-captured") {
      const p = e.actorId ? r2.characters[e.actorId] : undefined; const cf = e.targetId ?? null; const pf = p?.factionId ?? null;
      if (ledgerOn && cf && pf && cf !== pf) addH(cf, pf, "capture", e.tick);
      if (charOn && p) { const c = e.data.captorId as string | undefined; if (c && c !== p.id && r2.characters[c]) pairs.push([p.id, c]); else if (!c) bad("capture-without-captorId"); }
    } else if (e.type === "captivity-released" && charOn) {
      const t = e.data.terms as { moneyPaid?: number; debtValue?: number }; const ransom = e.data.ransom as { leaderId?: string } | undefined;
      if ((t?.moneyPaid ?? 0) + (t?.debtValue ?? 0) > 0) { const who = ransom?.leaderId ?? (e.targetId ? commandHolderId(r2, e.targetId) : null); if (e.actorId && who && who !== e.actorId && r2.characters[who]) pairs.push([e.actorId, who]); }
    } else if (e.type === "settlement-claimed" && ledgerOn) {
      const by = e.data.factionId as string | null, on = e.data.previousFactionId as string | null; if (by && on && by !== on) addH(by, on, "claim", e.tick);
    }
    const before = pairs.map(([f, t]) => r2.characters[f].relationships[t]?.grievance ?? 0);
    const seatLost = e.type === "relationship-changed" && String(e.data.trigger).startsWith("lost the seat at ");
    const seatBefore = seatLost ? (r2.characters[e.actorId!].relationships[e.targetId!]?.grievance ?? 0) : 0;
    applyEvent(r2, e);
    pairs.forEach(([f, t], i) => { grudgeChecks++; if (r2.characters[f].relationships[t]?.grievance !== round(clamp(before[i] + GRUDGE_STEP, 0, 1))) bad("grudge-step"); });
    if (seatLost) {
      grudgeChecks++;
      if (r2.characters[e.actorId!].relationships[e.targetId!]?.grievance !== round(clamp(seatBefore + GRUDGE_STEP, 0, 1))) bad("seat-grudge-step");
      if (!events.some((x) => x.tick === e.tick && x.type === "settlement-transferred" && x.settlementId === e.settlementId && x.sequence < e.sequence)) bad("seat-grudge-without-transfer");
    }
  };
  { let idx = 0, atStart = events.length > 0;
    while (idx < events.length) {
      if (atStart) { while (idx < events.length && events[idx].type === "character-died") { step(events[idx]); idx++; } applySilentTickStart(r2); atStart = false; continue; }
      const e = events[idx]; step(e); idx++; if (e.type === "tick-advanced") atStart = true;
    } }
  const harm = (w.harm ?? undefined) as H | undefined;
  if (harm || ledgerOn) {
    if (JSON.stringify(Object.keys(harm ?? {}).sort().map((k) => [k, harm![k]])) !== JSON.stringify(Object.keys(expH).sort().map((k) => [k, expH[k]]))) bad("ledger-not-fold-of-events");
    for (const [k, p] of Object.entries(harm ?? {})) { const [by, on] = k.split(">"); if (by === on) bad("ledger-self-pair"); if (p.recent.some((e) => p.lastTick - e.tick > HARM_WINDOW)) bad("ledger-stale-entry"); }
  }
  if (!opts.relationships && w.harm) bad("ledger-present-flag-off");
  if (!opts.relationshipsChar && (w as { grudges?: true }).grudges) bad("grudges-present-flag-off");
  // Seat-lost writes are relationship-changed events: a non-actor viewer must not see the payload.
  const seatEvents = events.filter((e) => e.type === "relationship-changed" && String(e.data.trigger).startsWith("lost the seat at "));
  if (seatEvents.length) {
    const others = Object.values(w.characters).filter((c) => !c.dead).sort((a, b) => a.id.localeCompare(b.id));
    for (const viewer of others.slice(0, 6)) {
      const feed = projectEventFeed(w, viewer.id, seatEvents) as unknown as { events?: Array<Record<string, any>> } | Array<Record<string, any>>;
      const rows = Array.isArray(feed) ? feed : feed.events ?? [];
      for (const row of rows) if (row.actorId !== viewer.id && row.data && (row.data as Record<string, unknown>).relationship) bad("privacy-seat-grudge-payload");
    }
  }
  const t = dynamismReadout(events).totals;
  const n = (type: string) => events.filter((e) => e.type === type).length;
  const routes: Record<string, number> = {};
  for (const e of events) if (e.type === "secession-declared") for (const r of (e.data.routes as string[] ?? [])) routes[r] = (routes[r] ?? 0) + 1;
  const g: number[] = [], earned: number[] = [];
  for (const c of Object.values(w.characters)) for (const [k, r] of Object.entries(c.relationships)) { g.push(r.grievance); earned.push(r.grievance - (setup[c.id]?.[k] ?? 0)); }
  const factions = Object.keys(w.factions);
  const portless = factions.filter((f) => portsOf(w, f) === 0);
  console.log(JSON.stringify({
    label, seed, hash72, hash1200: stateHash(w).slice(0, 8), replayExact,
    claims: n("settlement-claimed"), portChanges: t.portOwnershipChanges, battles: n("battle-resolved"), captures: t.captures,
    secessions: t.secessions, routes, peaces: n("faction-peace"), peaceBreaks: n("faction-peace-broken"), joins: n("secession-joined"),
    pacts: n("alliance-formed"), pactBreaks: n("alliance-broken"), allyAttackBreaks: events.filter((e) => e.type === "alliance-broken" && e.data.reason === "ally-attack").length,
    purchases: n("settlement-purchased"), offers: n("transfer-offered"), declines: n("transfer-declined"), transfers: n("settlement-transferred"),
    promotions: n("character-promoted"), retirements: n("character-retired"), returns: n("character-returned"),
    pressedPortTicks, ...rd, grudges,
    ledgerPairs: Object.keys(harm ?? {}).length, ledgerEntries: Object.values(harm ?? {}).reduce((a, p) => a + p.recent.length, 0), ledgerTotal: Object.values(harm ?? {}).reduce((a, p) => a + p.total, 0), ledgerBytes: harm ? JSON.stringify(harm).length : 0,
    relEntries: g.length, gP50: q(g, 0.5), gP90: q(g, 0.9), gP99: q(g, 0.99), gMax: q(g, 1), gAtHated: g.filter((x) => x >= HATED).length,
    earnedNonZero: earned.filter((x) => Math.abs(x) > 1e-9).length, earnedP99: q(earned, 0.99), earnedAtHated: earned.filter((x) => x >= HATED).length,
    factions: factions.length, portless: portless.length,
    wipeouts: ["world-government", "free-tide"].filter((f) => portsOf(w, f) === 0 && members(w, f) === 0),
    privacyChecks, grudgeChecks, violations: viol,
  }));
}
