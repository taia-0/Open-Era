// Generic arm comparison for results/<prefix>-<arm>-<cfg>.jsonl rows written by holder.ts / news.ts. No sim runs.
// Usage: node --experimental-strip-types docs/design/engine-hygiene/cmp.ts <prefix> <baseArm> <otherArm>
import { readFileSync } from "node:fs";
const [prefix, a, b] = process.argv.slice(2);
const load = (arm: string, c: string): any[] => readFileSync(new URL(`./results/${prefix}-${arm}-${c}.jsonl`, import.meta.url), "utf8").trim().split("\n").map((x) => JSON.parse(x));
const sum = (xs: number[]) => xs.reduce((x, y) => x + y, 0);
for (const cfg of ["flag-off", "atls"]) {
  const A = load(a, cfg), B = load(b, cfg);
  const n = A.length;
  const evSame = A.filter((r, i) => r.eventDigest === B[i].eventDigest).length;
  const typeSame = A.filter((r, i) => r.typeDigest === B[i].typeDigest && r.events === B[i].events).length;
  const h72Same = A.filter((r, i) => r.h72 === B[i].h72).length, h1200Same = A.filter((r, i) => r.h1200 === B[i].h1200).length;
  console.log(`## ${prefix} ${cfg}: ${a} vs ${b} (${n} seeds)`);
  console.log(`event log identical (digest incl. sequence): ${evSame}/${n}; same count+type order: ${typeSame}/${n}; events ${sum(A.map((r) => r.events))} vs ${sum(B.map((r) => r.events))}`);
  console.log(`h72 unchanged ${h72Same}/${n}; h1200 unchanged ${h1200Same}/${n}`);
  const cols = ["claims", "portChanges", "battles", "captures", "secessions"];
  console.log(`${a}: ` + cols.map((c) => `${c} ${sum(A.map((r) => r[c]))}`).join(", ") + `; wipeouts ${A.flatMap((r) => r.wipeouts).length}; secession seeds ${A.filter((r) => r.secessions > 0).length}`);
  console.log(`${b}: ` + cols.map((c) => `${c} ${sum(B.map((r) => r[c]))}`).join(", ") + `; wipeouts ${B.flatMap((r) => r.wipeouts).length}; secession seeds ${B.filter((r) => r.secessions > 0).length}`);
  if (B[0].mismatchTicks !== undefined) console.log(`holder oracle mismatches (ticks with any faction differing from legacy derivation): ${a} ${sum(A.map((r) => r.mismatchTicks))}, ${b} ${sum(B.map((r) => r.mismatchTicks))}; holder changes ${sum(B.map((r) => r.holderChanges))}`);
  console.log(`replay exact ${b}: ${B.filter((r) => r.replayExact).length}/${n}`);
  const first = B.find((r) => r.mismatches?.length); if (first) console.log("first mismatches", JSON.stringify(first.mismatches.slice(0, 4)), "seed", first.seed);
  const dv = A.map((r, i) => (r.eventDigest === B[i].eventDigest ? null : r.seed)).filter((x) => x !== null);
  if (dv.length) console.log("seeds with different event log:", dv.join(","));
  console.log(`pins ${b}: ` + B.slice(0, 3).map((r) => `${r.seed} ${r.h72}/${r.h1200}`).join("; "));
}
