// human-contracts.md part 2: what debt state exists today, from the flag-off event log. 13 seeds × 1,200 ticks, offline.
// Usage: node --experimental-strip-types docs/design/human-contracts/debt-census.ts '<TickOptions JSON>'
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
const opts = JSON.parse(process.argv[2] ?? "{}");
const seeds = [1847, 2718, 4096, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
const T = { released: 0, withDebt: 0, repaid: 0, closed: 0, openAtEnd: 0, cmdDebts: 0, cmdRepaid: 0, debtorsHuman: 0, humanCreditorFactionDebts: 0 };
const firstRepayLag: number[] = []; const closeLag: number[] = []; const original: number[] = []; const creditorNull: number[] = [];
for (const seed of seeds) {
  const w = createPrototypeWorld(seed); const cmd = Object.values(w.players)[0].characterId; const cmdFaction = w.characters[cmd].factionId;
  const born = new Map<string, number>(); const seenRepay = new Set<string>();
  for (let i = 0; i < 1200; i++) {
    const r = runTick(w, { ...opts });
    for (const e of r.events) {
      if (e.type === "captivity-released") { T.released++; const d = e.data.debt as { id: string; originalValue: number; creditorFactionId: string | null } | undefined; if (d) { T.withDebt++; born.set(d.id, e.tick); original.push(d.originalValue); if (d.creditorFactionId === null) creditorNull.push(1); if (e.actorId === cmd) T.cmdDebts++; if (d.creditorFactionId && d.creditorFactionId === cmdFaction) T.humanCreditorFactionDebts++; } }
      if (e.type === "debt-repaid") {
        T.repaid++; const id = String(e.data.debtId); if (e.actorId === cmd) T.cmdRepaid++;
        if (!seenRepay.has(id) && born.has(id)) { seenRepay.add(id); firstRepayLag.push(e.tick - born.get(id)!); }
        if (e.data.closed === true && born.has(id)) { T.closed++; closeLag.push(e.tick - born.get(id)!); }
      }
    }
  }
  T.openAtEnd += Object.values(w.characters).reduce((n, c) => n + c.debts.length, 0);
}
const q = (xs: number[], p: number) => { if (!xs.length) return "-"; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
console.log(JSON.stringify({ opts, ...T, creditorNone: creditorNull.length, firstRepayLag: { n: firstRepayLag.length, p50: q(firstRepayLag, 0.5), p90: q(firstRepayLag, 0.9), max: q(firstRepayLag, 1) }, closeLag: { n: closeLag.length, p50: q(closeLag, 0.5), p90: q(closeLag, 0.9), max: q(closeLag, 1) }, original: { n: original.length, p50: q(original, 0.5), max: q(original, 1) } }));
