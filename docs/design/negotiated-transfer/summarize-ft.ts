// Aggregate Free Tide vs World Government treasury/tax/shortage figures from measure-nt JSONL `ft` blocks.
import { readFileSync } from "node:fs";
const labels = process.argv.slice(2);
const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => xs.length ? r2(sum(xs) / xs.length) : 0;
for (const l of labels) {
  const rs = readFileSync(`docs/design/negotiated-transfer/raw/${l}.jsonl`, "utf8").trim().split("\n").map((x) => JSON.parse(x));
  console.log(`\n## ${l} (${rs.length} seeds)`);
  for (const f of ["world-government", "free-tide"] as const) {
    const rows = rs.map((r) => r.ft[f]);
    const flowKeys = ["tax", "ransom", "debt", "drawn", "purchase", "transferIn", "transferOut", "joinIn"] as const;
    const flow = Object.fromEntries(flowKeys.map((k) => [k, r2(sum(rows.map((x) => x.flow[k] ?? 0)))]));
    const drawnBy: Record<string, number> = {};
    for (const x of rows) for (const [k, v] of Object.entries(x.drawnBy ?? {})) drawnBy[k] = r2((drawnBy[k] ?? 0) + (v as number));
    console.log(`\n### ${f}`);
    console.log(`start treasury ${rows[0].startTreasury}, end avg ${mean(rows.map((x) => x.endTreasury))}, end min/max ${Math.min(...rows.map((x) => x.endTreasury))}/${Math.max(...rows.map((x) => x.endTreasury))}`);
    console.log(`tax rate start ${rows[0].startTax}, time-avg (mean of per-seed avgs) ${mean(rows.map((x) => x.taxTimeAvg))}, end avg ${mean(rows.map((x) => x.endTax ?? 0))}, tax-rate-set events ${sum(rows.map((x) => x.taxSets))}`);
    console.log(`flow (sum over seeds): ${JSON.stringify(flow)}; residual sum ${r2(sum(rows.map((x) => x.residual)))} (mostly silent stipend)`);
    console.log(`treasury draws by event (sum): ${JSON.stringify(drawnBy)}`);
    console.log(`ticks below reserve ${sum(rows.map((x) => x.ticksBelow))} / 13×1200, of which while holding ≥2 ports ${sum(rows.map((x) => x.ticksBelow2))}`);
    console.log(`shortage spells ${sum(rows.map((x) => x.shortageSpells))} (2+ ports ${sum(rows.map((x) => x.shortageSpells2))})`);
    console.log(`upkeep shortage ticks ${sum(rows.map((x) => x.upkeepShortageTicks))}, garrison loss from shortage ${sum(rows.map((x) => x.garrisonLoss))}, holder-ticks ${sum(rows.map((x) => x.holderTicks))}`);
    console.log(`clock surplus p10/p50/p90 (median across seeds of that percentile): ${mean(rows.map((x) => x.clock.surplusP10))}, ${mean(rows.map((x) => x.clock.surplusP50))}, ${mean(rows.map((x) => x.clock.surplusP90))}; clocks below reserve ${sum(rows.map((x) => x.clock.surplusNeg))} / ${sum(rows.map((x) => x.clock.n))}; clocks with ≥2 ports ${sum(rows.map((x) => x.clock.portsAtLeast2))} / ${sum(rows.map((x) => x.clock.n))}`);
    console.log(`clock avgs (mean of seed avgs): treasury ${mean(rows.map((x) => x.clock.treasuryAvg))}, reserve ${mean(rows.map((x) => x.clock.reserveAvg))}, ports ${mean(rows.map((x) => x.clock.portsAvg))}, mates ${mean(rows.map((x) => x.clock.matesAvg))}`);
  }
  const b = rs.map((r) => r.ft.breakaway);
  console.log(`\n### breakaways (aggregated)`);
  console.log(`tax ${r2(sum(b.map((x) => x.flow.tax)))}, ticks below ${sum(b.map((x) => x.ticksBelow))} (2+ ${sum(b.map((x) => x.ticksBelow2))}), spells ${sum(b.map((x) => x.shortageSpells))}, holder-ticks ${sum(b.map((x) => x.holderTicks))}, upkeep shortage ${sum(b.map((x) => x.upkeepShortageTicks))}`);
}
