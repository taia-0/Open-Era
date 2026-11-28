// Totals tables for negotiated-transfer.md from raw/<label>.jsonl (measure-nt.ts rows).
import { readFileSync } from "node:fs";
const labels = process.argv.slice(2);
const load = (l: string) => readFileSync(`docs/design/negotiated-transfer/raw/${l}.jsonl`, "utf8").trim().split("\n").map((x) => JSON.parse(x));
const sum = (rs: any[], k: string) => rs.reduce((a, r) => a + (r[k] ?? 0), 0);
const merge = (rs: any[], k: string) => rs.reduce((a: Record<string, number>, r) => { for (const [x, n] of Object.entries(r[k] ?? {})) a[x] = (a[x] ?? 0) + (n as number); return a; }, {});
const fmt = (o: Record<string, number>) => Object.keys(o).length ? Object.entries(o).sort().map(([k, v]) => `${k} ${v}`).join(", ") : "—";
console.log("| Set | Offers (trigger) | Accepts | Sales / grants | Declines (reason) | Price paid | Claims | Port changes | Battles | Captures | Secessions (seeds) | Peaces | Pacts (protection) | Pact breaks | Purchases | Portless | Wipeouts | Low claims / port changes | Replay | Violations |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const l of labels) {
  const rs = load(l);
  const k = merge(rs, "acceptsByKind");
  const minC = rs.reduce((a, r) => (r.claims < a.claims ? r : a)); const minP = rs.reduce((a, r) => (r.portChanges < a.portChanges ? r : a));
  console.log(`| ${l} | ${sum(rs, "offers")} (${fmt(merge(rs, "offersByTrigger"))}) | ${sum(rs, "accepts")} | ${k.sale ?? 0} / ${k.grant ?? 0} | ${sum(rs, "declines")} (${fmt(merge(rs, "declinesByReason"))}) | ${sum(rs, "pricePaid")} | ${sum(rs, "claims")} | ${sum(rs, "portChanges")} | ${sum(rs, "battles")} | ${sum(rs, "captures")} | ${sum(rs, "secessions")} (${rs.filter((r) => r.secessions > 0).length}/13) | ${sum(rs, "peaces")} | ${sum(rs, "pacts")} (${sum(rs, "protectionPacts")}) | ${sum(rs, "pactBreaks")} | ${sum(rs, "purchases")} | ${sum(rs, "portless")} | ${rs.flatMap((r) => r.wipeouts.map((w: string) => `${r.seed}:${w}`)).join(" ") || "none"} | ${minC.claims} (${minC.seed}) / ${minP.portChanges} (${minP.seed}) | ${rs.every((r) => r.replayExact) ? "13/13 exact" : "NOT exact"} | ${sum(rs, "violations")} |`);
}
if (process.env.PERSEED) for (const l of labels) {
  console.log(`\n${l}\n| Seed | Offers | Accepts | Declines | Transfers (tick port from→to kind price) | Claims | Port changes | Secessions | Portless | hash72/hash1200 |\n|---|---|---|---|---|---|---|---|---|---|`);
  for (const r of load(l)) console.log(`| ${r.seed} | ${r.offers} | ${r.accepts} | ${r.declines} ${r.declines ? JSON.stringify(r.declinesByReason) : ""} | ${r.transfers.map((t: any) => `${t.tick} ${t.port} ${t.from}→${t.to} ${t.kind} ${t.price}`).join("; ") || "—"} | ${r.claims} | ${r.portChanges} | ${r.secessions} | ${r.portless} | ${r.hash72}/${r.hash1200} |`);
}
