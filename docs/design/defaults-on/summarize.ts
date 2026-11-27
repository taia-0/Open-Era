// Summarise raw/*.jsonl into the defaults-on.md tables. Gates: replay exact on every seed; claims and port changes > 0
// on every seed; no wipeout absent from (a) on the same seed; secessions on ≥ 6/13 seeds. (Property checks: see props-*.txt.)
//   node --experimental-strip-types docs/design/defaults-on/summarize.ts [labels...]
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const dir = join(import.meta.dirname, "raw");
const load = (l: string) => readFileSync(join(dir, `${l}.jsonl`), "utf8").trim().split("\n").map((s) => JSON.parse(s));
const labels = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(dir).map((f) => f.replace(/\.jsonl$/, "")).sort();
const base = load("a-main-defaults"); const baseOpt = load("a-exile-optout");
const keys = ["claims", "portChanges", "battles", "captures", "secessions", "peaces", "peaceBreaks", "joins", "pacts", "protectionPacts", "purchases", "promotions", "retirements", "returns", "portless"] as const;
console.log(`| Config | ${keys.join(" | ")} | sec seeds | min claims | min port chg | replay | new wipeouts | gates |`);
console.log(`|---|${keys.map(() => "---").join("|")}|---|---|---|---|---|---|`);
for (const l of labels) {
  const rows = load(l);
  const ref = l.includes("exile-optout") ? baseOpt : base;
  const tot = (k: string) => rows.reduce((a, r) => a + r[k], 0);
  const secSeeds = rows.filter((r) => r.secessions > 0).length;
  const minC = Math.min(...rows.map((r) => r.claims)); const minP = Math.min(...rows.map((r) => r.portChanges));
  const replay = rows.every((r) => r.replayExact);
  const newW = rows.flatMap((r) => r.wipeouts.filter((f: string) => !ref.find((x) => x.seed === r.seed).wipeouts.includes(f)).map((f: string) => `${r.seed}:${f}`));
  const pass = replay && minC > 0 && minP > 0 && newW.length === 0 && secSeeds >= 6;
  console.log(`| ${l} | ${keys.map((k) => tot(k)).join(" | ")} | ${secSeeds}/13 | ${minC} | ${minP} | ${replay ? "exact" : "MISMATCH"} | ${newW.join(" ") || "none"} | ${pass ? "PASS" : "FAIL"} |`);
}
for (const l of labels.filter((x) => process.env.PERSEED?.split(",").includes(x))) {
  console.log(`\n${l} per seed (claims/portChanges/battles/captures/secessions/portless; hash72 hash1200; wipeouts):`);
  for (const r of load(l)) console.log(`  ${r.seed}: ${r.claims}/${r.portChanges}/${r.battles}/${r.captures}/${r.secessions}/${r.portless}; ${r.hash72} ${r.hash1200}; ${r.wipeouts.join("+") || "-"}`);
}
