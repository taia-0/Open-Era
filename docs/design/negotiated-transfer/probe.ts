// negotiated-transfer.md threshold probe: measured distributions for the triggers, flag-free (the new layer is not used).
// Usage: node --experimental-strip-types docs/design/negotiated-transfer/probe.ts <label> '<TickOptions JSON>'
// Prints one JSON row per seed with the raw samples; summarize-probe.ts reduces them to percentiles.
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { freeMateCount } from "../../../src/sim/allowance.ts";
import type { SimEvent, WorldState } from "../../../src/sim/types.ts";

const [label, optsJson] = process.argv.slice(2);
const opts = JSON.parse(optsJson ?? "{}");
const ticks = Number(process.env.TICKS ?? 1200);
const seeds = (process.env.SEEDS ?? "1847,2718,4096,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000").split(",").map(Number);
const portsOf = (w: WorldState, f: string) => Object.values(w.settlements).filter((s) => s.factionId === f).length;
const surplus = (w: WorldState, f: string) => w.factions[f].treasury - 18 * (freeMateCount(w, f) + portsOf(w, f));

for (const seed of seeds) {
  const w = createPrototypeWorld(seed);
  const events: SimEvent[] = [];
  // Garrison of a held port at the start of the tick a raid on it began; outcome filled from later claims.
  const raids: Array<{ tick: number; port: string; holder: string; garrison: number; attacker: string | null; lostTick: number | null }> = [];
  const spells: Array<{ faction: string; start: number; length: number; minPorts: number; open: boolean }> = [];
  const open = new Map<string, { start: number; minPorts: number }>();
  const portsHeldSamples: number[] = [];
  const heldGarrisonSamples: number[] = [];
  const surplusSamples: number[] = [];
  for (let i = 0; i < ticks; i++) {
    const garrison = new Map(Object.values(w.settlements).map((s) => [s.id, s.garrison]));
    const holderAt = new Map(Object.values(w.settlements).map((s) => [s.id, s.factionId]));
    for (const f of Object.keys(w.factions)) {
      const p = portsOf(w, f);
      const sp = p > 0 ? surplus(w, f) : null;
      const o = open.get(f);
      if (sp !== null && sp < 0) {
        if (o) o.minPorts = Math.min(o.minPorts, p); else open.set(f, { start: w.tick, minPorts: p });
      } else if (o) {
        spells.push({ faction: f, start: o.start, length: w.tick - o.start, minPorts: o.minPorts, open: false });
        open.delete(f);
      }
      if (w.tick % 24 === 0 && w.tick > 0 && p > 0) { portsHeldSamples.push(p); surplusSamples.push(Math.round(sp! * 100) / 100); }
    }
    if (w.tick % 24 === 0 && w.tick > 0) for (const s of Object.values(w.settlements)) if (s.factionId) heldGarrisonSamples.push(s.garrison);
    const out = runTick(w, { ...opts }).events;
    events.push(...out);
    for (const e of out) {
      if (e.type === "battle-started" && e.settlementId && holderAt.get(e.settlementId)) {
        const attacker = e.actorId ? w.characters[e.actorId]?.factionId ?? null : null;
        raids.push({ tick: e.tick, port: e.settlementId, holder: holderAt.get(e.settlementId)!, garrison: garrison.get(e.settlementId)!, attacker, lostTick: null });
      }
      if ((e.type === "settlement-claimed" || e.type === "secession-declared") && e.settlementId) {
        const prev = (e.data.previousFactionId as string | null | undefined) ?? e.targetId ?? null;
        for (const r of raids) if (r.port === e.settlementId && r.holder === prev && r.lostTick === null && e.tick - r.tick <= 152 && e.type === "settlement-claimed") r.lostTick = e.tick;
      }
    }
  }
  for (const [f, o] of open) spells.push({ faction: f, start: o.start, length: w.tick - o.start, minPorts: o.minPorts, open: true });
  console.log(JSON.stringify({ label, seed, raids, spells, portsHeldSamples, heldGarrisonSamples, surplusSamples }));
}
