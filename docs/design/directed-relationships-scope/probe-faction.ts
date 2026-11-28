// directed-relationships-scope.md second read-only probe: faction-to-faction harm and goodwill event volume. Offline, no AI, $0.
// Usage: node --experimental-strip-types docs/design/directed-relationships-scope/probe-faction.ts <label> '<TickOptions JSON>'
// Harm by B on A (ordered pair "B>A"): a raid (battle-started, or an immediate battle-resolved with no battleId, as alliances.ts noteRaid counts) by a B captain on an A-held port, a capture of an A member
// by B, a claim by B of an A-held port. Goodwill: alliance-formed (both directions), faction-peace (both directions).
// Window = ALLIANCE_RAID_WINDOW (152), the existing p90 raid gap. One JSON row per seed.
import { ALLIANCE_RAID_WINDOW, allianceCause } from "../../../src/sim/alliances.ts";
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import type { WorldState } from "../../../src/sim/types.ts";

const [label, optsJson] = process.argv.slice(2);
const opts = JSON.parse(optsJson ?? "{}");
const ticks = Number(process.env.TICKS ?? 1200);
const seeds = (process.env.SEEDS ?? "1847,2718,4096,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000").split(",").map(Number);
const W = ALLIANCE_RAID_WINDOW;
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null; };
const alive = (w: WorldState, f: string) => Object.values(w.characters).some((c) => !c.dead && c.factionId === f);
const portsOf = (w: WorldState, f: string) => Object.values(w.settlements).filter((s) => s.factionId === f);

for (const seed of seeds) {
  const w = createPrototypeWorld(seed);
  const harm: Record<string, number[]> = {}; const good: Record<string, number[]> = {};
  const kinds: Record<string, number> = {};
  const add = (m: Record<string, number[]>, k: string, t: number) => { (m[k] ??= []).push(t); };
  let clockChecks = 0, clockWithAnyCandidate = 0, clockWithMultiPartner = 0;
  for (let i = 0; i < ticks; i++) {
    // approximate pre-tick look at the alliance clock: unpacted, unblocked pairs with a shared enemy cause (read only, same rule as allianceForms; secessions in the same tick can still change it)
    if ((w.tick + 1) % 24 === 0 && opts.alliances) {
      const fs = Object.keys(w.factions).filter((f) => alive(w, f)).sort();
      const pairs: string[] = [];
      const inPact = (f: string) => (w.alliances ?? []).some((a) => a.factionIds.includes(f));
      const blocked = (a: string, b: string) => (w.allianceMemory ?? []).some((m) => m.factionIds.includes(a) && m.factionIds.includes(b) && w.tick + 1 - m.brokenTick < 240);
      for (const p of fs) for (const qf of fs) if (qf > p && !inPact(p) && !inPact(qf) && !blocked(p, qf)) for (const e of fs) if (e !== p && e !== qf && portsOf(w, e).length && allianceCause(w, p, e) && allianceCause(w, qf, e)) { pairs.push(`${p}|${qf}|${e}`); break; }
      clockChecks++; if (pairs.length) clockWithAnyCandidate++;
      const partnersOf: Record<string, Set<string>> = {};
      for (const pr of pairs) { const [a, b] = pr.split("|"); (partnersOf[a] ??= new Set()).add(b); (partnersOf[b] ??= new Set()).add(a); }
      if (Object.values(partnersOf).some((s) => s.size > 1)) clockWithMultiPartner++;
    }
    const r = runTick(w, opts);
    for (const e of r.events) {
      if (e.type === "battle-started") {
        const b = (e.data as { battle?: { attackerId: string; defenderFactionId: string | null } }).battle;
        const atkF = b ? w.characters[b.attackerId]?.factionId : null;
        if (atkF && b?.defenderFactionId && atkF !== b.defenderFactionId) { add(harm, `${atkF}>${b.defenderFactionId}`, e.tick); kinds.raid = (kinds.raid ?? 0) + 1; }
      } else if (e.type === "battle-resolved" && !e.data.battleId) {
        // immediate-resolution raid, the other branch alliances.ts noteRaid counts
        const atkF = e.actorId ? w.characters[e.actorId]?.factionId : null; const defF = e.targetId;
        if (atkF && defF && atkF !== defF) { add(harm, `${atkF}>${defF}`, e.tick); kinds.raidImmediate = (kinds.raidImmediate ?? 0) + 1; }
      } else if (e.type === "character-captured") {
        const pf = e.actorId ? w.characters[e.actorId]?.factionId : null;
        if (pf && e.targetId && pf !== e.targetId) { add(harm, `${e.targetId}>${pf}`, e.tick); kinds.capture = (kinds.capture ?? 0) + 1; }
      } else if (e.type === "settlement-claimed") {
        const prev = e.data.previousFactionId as string | null; const by = e.data.factionId as string | null;
        if (prev && by && prev !== by) { add(harm, `${by}>${prev}`, e.tick); kinds.claim = (kinds.claim ?? 0) + 1; }
      } else if (e.type === "alliance-formed") {
        const [x, y] = (e.data.alliance as { factionIds: [string, string] }).factionIds; add(good, `${x}>${y}`, e.tick); add(good, `${y}>${x}`, e.tick); kinds.pact = (kinds.pact ?? 0) + 1;
      } else if (e.type === "faction-peace") {
        const [x, y] = (e.data.peace as { factionIds: [string, string] }).factionIds; add(good, `${x}>${y}`, e.tick); add(good, `${y}>${x}`, e.tick); kinds.peace = (kinds.peace ?? 0) + 1;
      }
    }
  }
  // window count at each harm event (events in (t-W, t])
  const atEvent: number[] = []; let maxLive = 0;
  for (const ts of Object.values(harm)) for (const t of ts) { const n = ts.filter((u) => u <= t && u > t - W).length; atEvent.push(n); }
  // unordered pairs: asymmetry of total harm
  const un: Record<string, [number, number]> = {};
  for (const [k, ts] of Object.entries(harm)) { const [a, b] = k.split(">"); const key = [a, b].sort().join("|"); const i = a < b ? 0 : 1; (un[key] ??= [0, 0])[i] += ts.length; }
  const pairsBoth = Object.values(un).filter(([x, y]) => x > 0 && y > 0).length;
  const pairsOneWay = Object.values(un).filter(([x, y]) => (x > 0) !== (y > 0)).length;
  const pairsSkew3 = Object.values(un).filter(([x, y]) => Math.min(x, y) * 3 <= Math.max(x, y) && Math.max(x, y) > 0).length;
  console.log(JSON.stringify({ label, seed, kinds, orderedHarmPairs: Object.keys(harm).length, unorderedPairs: Object.keys(un).length, pairsBothWays: pairsBoth, pairsOneWay, pairsSkewAtLeast3to1: pairsSkew3,
    windowCountAtHarmEvent: { n: atEvent.length, p50: q(atEvent, 0.5), p90: q(atEvent, 0.9), max: q(atEvent, 1) }, maxLive,
    goodwillOrderedPairs: Object.keys(good).length, clockChecks, clockWithAnyCandidate, clockWithMultiPartner, factionsEnd: Object.keys(w.factions).length }));
}
