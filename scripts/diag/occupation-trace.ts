// Diagnosis only: run one patched src copy (scripts/diag/occupation-variants.sh) on a seed with
// OCCUPATION on vs off and report claims, battles, the first tick whose state hash differs, and the
// first differing events at that tick. Reads engine state only.
//   node --experimental-strip-types scripts/diag/occupation-trace.ts <variantRoot> <seed> [ticks]
const [root, seedArg, ticksArg] = process.argv.slice(2);
const seed = Number(seedArg); const ticks = Number(ticksArg ?? 1200);
const { runTick } = await import(`${root}/src/sim/engine.ts`);
const { createPrototypeWorld } = await import(`${root}/src/sim/scenario.ts`);
const { stateHash } = await import(`${root}/src/sim/state.ts`);
const strip = (e: any) => { const d = { ...e.data }; delete d.occupation; delete d.occupationTerms; delete d.attackerFactionId; delete d.occupationDefectors; return JSON.stringify({ ...e, sequence: 0, data: d }); };
function run(occupation: boolean) {
  const w = createPrototypeWorld(seed); const hashes: string[] = []; const byTick: any[][] = [];
  let claims = 0, battles = 0, defectors = 0, regrowthStops = 0; const claimsBy200 = Array(Math.ceil(ticks / 200)).fill(0); const holders: Record<string, number> = {};
  for (let i = 0; i < ticks; i++) {
    const ev = runTick(w, { exileRecovery: true, occupation }).events;
    // Serialize at once: some event payloads hold live references (e.g. goals) that later ticks mutate.
    byTick.push(ev.map((e: any) => ({ s: strip(e), e: JSON.parse(JSON.stringify(e)) })));
    for (const e of ev) { if (e.type === "settlement-claimed") { claims++; claimsBy200[Math.floor(e.tick / 200)]++; const f = String(e.data.factionId); holders[f] = (holders[f] ?? 0) + 1; } if (e.type === "battle-started") { battles++; defectors += Number(e.data.occupationDefectors ?? 0); } if ((e.type === "settlement-upkeep" || e.type === "settlement-shortage") && (e.data.occupation?.harshness ?? 0) >= 0.5) regrowthStops++; }
    hashes.push(stateHash(w));
  }
  const portsEnd = Object.fromEntries(Object.keys(w.factions).map((f: string) => [f, Object.values(w.settlements).filter((x: any) => x.factionId === f).length]).filter(([, n]) => (n as number) > 0));
  return { claims, battles, defectors, regrowthStops, hashes, byTick, claimsBy200, holders, portsEnd };
}
const off = run(false); const on = run(true);
// The state hash diverges at the first flag-on claim (the record itself); behaviour diverges at the first event that differs once occupation payload fields are stripped.
const t = on.byTick.findIndex((evs: any[], i: number) => evs.length !== off.byTick[i].length || evs.some((e: any, j: number) => e.s !== off.byTick[i][j].s));
const hashTick = on.hashes.findIndex((h, i) => h !== off.hashes[i]);
let first: unknown = null;
if (t >= 0) {
  const a = off.byTick[t].map((x: any) => x.s); const b = on.byTick[t].map((x: any) => x.s);
  const k = b.findIndex((x: string, i: number) => x !== a[i]);
  first = { tick: on.byTick[t][0]?.e.tick, index: k, off: a[k]?.slice(0, 400) ?? null, on: b[k]?.slice(0, 400) ?? null,
    occupationEventsBefore: on.byTick.slice(0, t + 1).flat().map((x: any) => x.e).filter((e: any) => e.data?.occupation).map((e: any) => `${e.tick}:${e.type}:${e.settlementId}:H=${e.data.occupation.harshness}`).slice(-4) };
}
console.log(JSON.stringify({ variant: root.split("/").pop(), seed, off: { claims: off.claims, battles: off.battles, claimsBy200: off.claimsBy200, claimsByFaction: off.holders, portsEnd: off.portsEnd }, on: { claims: on.claims, battles: on.battles, claimsBy200: on.claimsBy200, claimsByFaction: on.holders, portsEnd: on.portsEnd, defectors: on.defectors, upkeepsAtHge05: on.regrowthStops }, hashDivergenceTick: hashTick >= 0 ? hashTick + 1 : null, firstDivergence: first }));
