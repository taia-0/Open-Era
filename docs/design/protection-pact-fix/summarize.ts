// Totals + gates for protection-pact-fix.md from raw/*.jsonl (written by docs/design/defaults-on/measure.ts).
//   node --experimental-strip-types docs/design/protection-pact-fix/summarize.ts <labels...>
import { readFileSync } from "node:fs";
import { join } from "node:path";
const load = (l: string) => readFileSync(join(import.meta.dirname, "raw", `${l}.jsonl`), "utf8").trim().split("\n").map((s) => JSON.parse(s));
const base = load("main");
const keys = ["peaces", "peaceBreaks", "protectionPacts", "joins", "pacts", "pactBreaks", "claims", "portChanges", "battles", "captures", "secessions", "portless"];
console.log(`| Set | ${keys.join(" | ")} | sec seeds | low claims | low PC | replay | new wipeouts |`);
console.log(`|---|${keys.map(() => "---").join("|")}|---|---|---|---|---|`);
for (const l of process.argv.slice(2)) {
  const r = load(l); const t = (k: string) => r.reduce((a, x) => a + x[k], 0);
  const lo = (k: string) => { const m = Math.min(...r.map((x) => x[k])); return `${m} (${r.filter((x) => x[k] === m).map((x) => x.seed).join(",")})`; };
  const nw = r.flatMap((x) => x.wipeouts.filter((f: string) => !base.find((b) => b.seed === x.seed).wipeouts.includes(f)));
  console.log(`| ${l} | ${keys.map(t).join(" | ")} | ${r.filter((x) => x.secessions > 0).length}/13 | ${lo("claims")} | ${lo("portChanges")} | ${r.every((x) => x.replayExact) ? "exact" : "MISMATCH"} | ${nw.join(",") || "none"} |`);
}
for (const l of process.argv.slice(2).filter((x) => /ATLS|S-alone/.test(x))) console.log(`${l} pins: ${load(l).filter((x) => [1847, 2718, 4096].includes(x.seed)).map((x) => `${x.seed} ${x.hash72}/${x.hash1200}`).join("; ")}`);
