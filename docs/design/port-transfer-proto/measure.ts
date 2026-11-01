import { runTick } from "/tmp/pt-proto/src/sim/engine.ts";
import { createPrototypeWorld } from "/tmp/pt-proto/src/sim/scenario.ts";
const seeds = [1847, 2718, 4096, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
const tre: Record<string, number[]> = {}; const g: number[] = []; let clocks = 0; const dockedBy: Record<string, number> = {}; const adjHold: Record<string, number> = {};
for (const s of seeds) { const w = createPrototypeWorld(s); for (let i = 0; i < 1200; i++) { runTick(w); if (w.tick % 24) continue; clocks++; const vc = w.settlements["verdant-cay"]; g.push(vc.garrison);
  for (const f of Object.values(w.factions)) { const k = f.id.startsWith("secession") ? "secession" : f.id; (tre[k] ??= []).push(f.treasury); }
  const seen = new Set<string>(); for (const c of Object.values(w.characters)) if (!c.dead && c.factionId && c.locationId === "verdant-cay" && !c.travel && !c.captivity) seen.add(c.factionId.startsWith("secession") ? "secession" : c.factionId); for (const k of seen) dockedBy[k] = (dockedBy[k] ?? 0) + 1;
  const gp = w.settlements["glassport"].factionId; if (gp) { const k = gp.startsWith("secession") ? "secession" : gp; adjHold[k] = (adjHold[k] ?? 0) + 1; } } }
const q = (xs: number[], p: number) => { const z = [...xs].sort((a, b) => a - b); return Math.round(z[Math.min(z.length - 1, Math.floor(p * z.length))] * 100) / 100; };
console.log({ clocks, vcGarrison: { p10: q(g, .1), p50: q(g, .5), p90: q(g, .9), max: q(g, 1) } });
for (const [k, v] of Object.entries(tre)) console.log(k, { n: v.length, p10: q(v, .1), p25: q(v, .25), p50: q(v, .5), p75: q(v, .75), p90: q(v, .9) });
console.log({ clocksWithFactionDockedAtVC: dockedBy, clocksHoldingGlassport: adjHold });
