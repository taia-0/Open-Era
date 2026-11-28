// Pooled quantiles of nonzero proxy cells (per 180-tick window per entity/pair), from results/*.jsonl.
import { readFileSync } from "node:fs";
const dir = new URL("./results/", import.meta.url);
const load = (n: string): any[] => readFileSync(new URL(n, dir), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]; };
for (const f of process.argv.slice(2)) {
  const rs = load(f);
  console.log(`## ${f}`);
  console.log("| cells | n | p50 | p90 | p95 | p99 | max |\n|---|---|---|---|---|---|---|");
  for (const k of ["recv", "pair", "send", "rawRecv", "rawPair"]) {
    const a: number[] = rs.flatMap((r) => r.proxy[k] as number[]);
    console.log(`| ${k} | ${a.length} | ${q(a, .5)} | ${q(a, .9)} | ${q(a, .95)} | ${q(a, .99)} | ${Math.max(...a)} |`);
  }
  const p = rs.map((r) => r.proxy);
  console.log(`proxy raw ${p.reduce((n, x) => n + x.raw, 0)} notVisible ${p.reduce((n, x) => n + x.notVisible, 0)} afterPair ${p.reduce((n, x) => n + x.afterPair, 0)}`);
}
