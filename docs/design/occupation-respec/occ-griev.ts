import { runTick } from "../../src/sim/engine.ts";
import { RESPEC_LOG } from "../../src/sim/occupation.ts";
import { createPrototypeWorld } from "../../src/sim/scenario.ts";
for (const seed of "1847,2718,4096,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000".split(",").map(Number)) { const w = createPrototypeWorld(seed); for (let i = 0; i < 1200; i++) runTick(w, { exileRecovery: true, occupation: true }); }
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 1e4) / 1e4 : null; };
const pos = RESPEC_LOG.filter((x) => x > 0);
console.log(JSON.stringify({ upkeepsWithDocked: RESPEC_LOG.length, nonZero: pos.length, share: Math.round(pos.length / RESPEC_LOG.length * 1e4) / 1e4, positives: { p10: q(pos, .1), p25: q(pos, .25), p50: q(pos, .5), p75: q(pos, .75), p90: q(pos, .9), max: q(pos, 1) } }));
