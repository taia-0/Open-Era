import { readFileSync } from "node:fs";
import { dynamismReadout } from "../../../src/tools/dynamism.ts";
const load = (p: string) => readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const out: any = {};
for (const s of [1847, 2718, 4096]) {
  const jevDirs = [`/tmp/wglive/jev-${s}`, ...[2, 3, 4].map((r) => `/tmp/wgn/jev${r}-${s}`)];
  const govs = new Set<string>(jevDirs.flatMap((d) => load(`${d}/picker.jsonl`).map((r) => r.actorId)));
  const ent = (d: string) => { const a = dynamismReadout(load(`${d}/events.jsonl`)).actionVariety.actors.filter((x: any) => govs.has(x.actorId)); return r4(a.reduce((t: number, x: any) => t + x.entropyBits, 0) / a.length); };
  const jev = jevDirs.map(ent);
  const mean = jev.reduce((a, b) => a + b, 0) / jev.length;
  const sd = Math.sqrt(jev.reduce((a, b) => a + (b - mean) ** 2, 0) / (jev.length - 1));
  const sums = jevDirs.map((d) => JSON.parse(readFileSync(`${d}/summary.json`, "utf8")));
  out[s] = { governors: [...govs].sort(), off: ent(`/tmp/wglive/off-${s}`), argmax: ent(`/tmp/wglive/arg-${s}`), uniform: ent(`/tmp/wglive/uni-${s}`), jev, mean: r4(mean), sd: r4(sd), min: Math.min(...jev), max: Math.max(...jev),
    changed: sums.map((x) => x.wgOverrides), calls: sums.map((x) => x.wgCalls), meanP: sums.map((x) => x.wgMeanP), spend: sums.map((x) => r4(x.spendUsd)) };
}
console.log(JSON.stringify(out, null, 1));
