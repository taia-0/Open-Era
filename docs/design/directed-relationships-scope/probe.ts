// directed-relationships-scope.md read-only probe. Offline, no AI, $0. Reads the world and event list; writes nothing back.
// Usage: node --experimental-strip-types docs/design/directed-relationships-scope/probe.ts <label> '<TickOptions JSON>'
// One JSON row per seed (13 seeds x 1,200 ticks unless SEEDS / TICKS are set).
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { commandHolderId, stateHash } from "../../../src/sim/state.ts";
import type { SimEvent } from "../../../src/sim/types.ts";

const [label, optsJson] = process.argv.slice(2);
const opts = JSON.parse(optsJson ?? "{}");
const ticks = Number(process.env.TICKS ?? 1200);
const seeds = (process.env.SEEDS ?? "1847,2718,4096,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000").split(",").map(Number);
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null; };
const trig = (t: string) => t.replace(/ at .*$/, " at <port>");

for (const seed of seeds) {
  const w = createPrototypeWorld(seed);
  const start = JSON.parse(JSON.stringify(Object.fromEntries(Object.values(w.characters).map((c) => [c.id, c.relationships]))));
  const types: Record<string, number> = {};
  const relTrig: Record<string, number> = {};
  const pairsTouched = new Set<string>();
  const events: SimEvent[] = [];
  let crossRaidPairs = 0, crossRaidPairsWithEntry = 0, captures = 0, capturesWithEntry = 0, capturesWithGrievance = 0;
  for (let i = 0; i < ticks; i++) {
    const r = runTick(w, opts);
    for (const e of r.events) {
      types[e.type] = (types[e.type] ?? 0) + 1;
      if (e.type === "relationship-changed") { const k = trig(String(e.data.trigger)); relTrig[k] = (relTrig[k] ?? 0) + 1; pairsTouched.add(`${e.actorId}>${e.targetId}`); }
      if (e.type === "character-captured") {
        captures++;
        const prisoner = e.actorId ? w.characters[e.actorId] : undefined;
        const captor = e.targetId ? commandHolderId(w, e.targetId) : null; // captor is a faction; its command holder is the nearest character target
        const rel = prisoner && captor ? prisoner.relationships[captor] : undefined;
        if (rel) { capturesWithEntry++; if (rel.grievance > 0) capturesWithGrievance++; }
      }
      if (e.type === "battle-started") {
        const atk = e.actorId ? w.characters[e.actorId] : undefined;
        const st = e.settlementId ? w.settlements[e.settlementId] : undefined;
        if (atk && st && st.factionId && st.factionId !== atk.factionId) {
          crossRaidPairs++;
          const gov = st.ownerId; const holder = commandHolderId(w, st.factionId);
          const g = gov ? w.characters[gov] : undefined;
          if ((gov && atk.relationships[gov]) || (holder && atk.relationships[holder]) || (g && g.relationships[atk.id])) crossRaidPairsWithEntry++;
        }
      }
      events.push(e);
    }
  }
  const chars = Object.values(w.characters);
  let entries = 0, same = 0, cross = 0, noFaction = 0, seeded = 0, changedFromStart = 0;
  const grievances: number[] = [], earned: number[] = [];
  const sample = chars.flatMap((c) => Object.values(c.relationships))[0];
  const bytesPerEntry = sample ? JSON.stringify(sample).length : 0;
  for (const c of chars) for (const [oid, rel] of Object.entries(c.relationships)) {
    entries++;
    const o = w.characters[oid];
    if (!o || c.factionId === null || o.factionId === null) noFaction++; else if (o.factionId === c.factionId) same++; else cross++;
    const s = start[c.id]?.[oid]; if (s) { seeded++; if (JSON.stringify(s) !== JSON.stringify(rel)) changedFromStart++; }
    grievances.push(rel.grievance); earned.push(rel.grievance - (s?.grievance ?? 0));
  }
  // raids: battle-started events whose attacker/defender governors are different factions
  console.log(JSON.stringify({
    label, seed, hash: stateHash(w).slice(0, 8), chars: chars.length, relEntries: entries, same, cross, noFaction, seeded, changedFromStart,
    relEvents: types["relationship-changed"] ?? 0, relTrig, distinctDirectedPairsWritten: pairsTouched.size,
    grievanceP50: q(grievances, 0.5), grievanceP90: q(grievances, 0.9), grievanceMax: q(grievances, 1),
    earnedP50: q(earned, 0.5), earnedP90: q(earned, 0.9), earnedMax: q(earned, 1), earnedNonZero: earned.filter((x) => Math.abs(x) > 1e-9).length,
    captures, capturesWithEntry, capturesWithGrievance, crossRaidPairs, crossRaidPairsWithEntry, bytesPerEntry,
    types,
  }));
}
