import { runTick } from "../../src/sim/engine.ts";
import { allianceCause, alliancesOf } from "../../src/sim/alliances.ts";
import { createPrototypeWorld } from "../../src/sim/scenario.ts";
const seeds = [1847, 2718, 4096, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
const w0 = createPrototypeWorld(1847); const ids = Object.keys(w0.settlements).sort();
for (const a of ids) for (const b of ids) if (a < b) { const p = w0.settlements[a].position, q = w0.settlements[b].position; console.log("dist", a, b, Math.hypot(p.x - q.x, p.y - q.y).toFixed(3)); }
let clocks = 0, nearBoth = 0, nearBothFree = 0, nearOne = 0, holderPairs = 0; const gaps: number[] = []; const raidLast = new Map<string, number>();
const phases: number[] = [];
for (const seed of seeds) {
  const w = createPrototypeWorld(seed); const start = new Map<string, number>();
  for (let i = 0; i < 1200; i++) {
    const on = process.argv[2] === "on";
    if ((w.tick) > 0 && w.tick % 24 === 0) {
      clocks++;
      const fs = Object.keys(w.factions).filter((f) => Object.values(w.characters).some((c) => !c.dead && c.factionId === f)).sort();
      const held = (f: string) => Object.values(w.settlements).some((s) => s.factionId === f);
      const inPact = (f: string) => alliancesOf(w).some((a) => a.factionIds.includes(f));
      for (const p of fs) for (const q of fs) if (p < q) for (const e of fs) if (e !== p && e !== q && held(e)) {
        const cp = allianceCause(w, p, e), cq = allianceCause(w, q, e);
        if (held(p) && held(q)) holderPairs++;
        const np = cp?.startsWith("near"), nq = cq?.startsWith("near");
        if (np && nq) { nearBoth++; if (!inPact(p) && !inPact(q)) nearBothFree++; } else if ((np && cq) || (nq && cp)) nearOne++;
      }
    }
    for (const e of runTick(w, { alliances: on } as never).events) {
      if (e.type === "battle-started" || (e.type === "battle-resolved" && !e.data.battleId)) {
        const atk = w.characters[e.actorId!]?.factionId; const def = e.targetId; if (!atk || !def) continue;
        const k = `${seed}|${atk}>${def}`; const last = raidLast.get(k); if (last !== undefined) gaps.push(e.tick - last); raidLast.set(k, e.tick);
        if (e.type === "battle-started") start.set((e.data.battle as { id: string }).id, e.tick);
      }
      if (e.type === "battle-resolved" && e.data.battleId && start.has(e.data.battleId as string)) { phases.push(e.tick - start.get(e.data.battleId as string)!); start.delete(e.data.battleId as string); }
    }
  }
}
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
console.log(JSON.stringify({ clocks, pairEnemyChecks_holderPairs: holderPairs, nearBoth, nearBothFree, nearOneOtherLandless: nearOne }));
console.log("raid gaps same attacker faction -> defender faction:", JSON.stringify({ n: gaps.length, p25: q(gaps, .25), p50: q(gaps, .5), p75: q(gaps, .75), p90: q(gaps, .9), max: q(gaps, 1) }));
console.log("major battle start->resolved ticks:", JSON.stringify({ n: phases.length, p50: q(phases, .5), p90: q(phases, .9), max: q(phases, 1) }));
