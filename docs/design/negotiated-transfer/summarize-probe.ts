// Reduce probe rows to the percentiles negotiated-transfer.md cites. Nearest-rank percentiles.
import { readFileSync } from "node:fs";
const file = process.argv[2];
const rows = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)] : null; };
const dist = (xs: number[]) => ({ n: xs.length, min: pct(xs, 0.0001), p10: pct(xs, 10), p25: pct(xs, 25), p50: pct(xs, 50), p75: pct(xs, 75), p90: pct(xs, 90), max: pct(xs, 100) });
const raids = rows.flatMap((r) => r.raids);
const lost = raids.filter((r: any) => r.lostTick !== null);
const kept = raids.filter((r: any) => r.lostTick === null);
const spells = rows.flatMap((r) => r.spells);
const closed = spells.filter((s: any) => !s.open);
const multi = closed.filter((s: any) => s.minPorts >= 2);
const out = {
  file,
  raidsOnHeldPorts: raids.length, lostWithin152: lost.length,
  garrisonAtRaidLost: dist(lost.map((r: any) => r.garrison)),
  garrisonAtRaidKept: dist(kept.map((r: any) => r.garrison)),
  heldGarrisonAtClock: dist(rows.flatMap((r) => r.heldGarrisonSamples)),
  shortageSpellsClosed: dist(closed.map((s: any) => s.length)),
  shortageSpellsClosedMultiPort: dist(multi.map((s: any) => s.length)),
  shortageSpellsOpenAtEnd: spells.filter((s: any) => s.open).length,
  portsHeldAtClock: dist(rows.flatMap((r) => r.portsHeldSamples)),
  surplusAtClock: dist(rows.flatMap((r) => r.surplusSamples)),
};
// Loss rate by garrison band at raid start: share of raids on a held port followed by its claim within 152.
const bands = [0, 10, 20, 30, 40, 60, 80, 120, 1e9];
(out as any).lossRateByGarrison = bands.slice(0, -1).map((lo, i) => { const hi = bands[i + 1]; const b = raids.filter((r: any) => r.garrison >= lo && r.garrison < hi); return { band: `${lo}-${hi === 1e9 ? "inf" : hi}`, raids: b.length, lost: b.filter((r: any) => r.lostTick !== null).length }; });
console.log(JSON.stringify(out, null, 1));
// The surrender line (world-simulation.md:97): garrison at most 15.
const le15 = raids.filter((r: any) => r.garrison <= 15), gt15 = raids.filter((r: any) => r.garrison > 15);
console.log(JSON.stringify({ surrenderLine15: { atOrBelow: { raids: le15.length, lost: le15.filter((r: any) => r.lostTick !== null).length }, above: { raids: gt15.length, lost: gt15.filter((r: any) => r.lostTick !== null).length } },
  heldGarrisonAtOrBelow15Share: (() => { const xs = rows.flatMap((r) => r.heldGarrisonSamples); return `${xs.filter((g: number) => g <= 15).length}/${xs.length}`; })(),
  portsHeldAtLeast2Share: (() => { const xs = rows.flatMap((r) => r.portsHeldSamples); return `${xs.filter((p: number) => p >= 2).length}/${xs.length}`; })(),
  surplusNegativeShare: (() => { const xs = rows.flatMap((r) => r.surplusSamples); return `${xs.filter((p: number) => p < 0).length}/${xs.length}`; })() }));
