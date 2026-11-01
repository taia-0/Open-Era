import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { pickerGate, seedGate } from "../tools/picker-gate.ts";
import { socialGate, socialSeedGate } from "../tools/social-gate.ts";
import type { SimEvent } from "../sim/types.ts";

/**
 * The Lead's action-picker gate additions (src/tools/picker-gate.ts):
 *   npm run picker-gate -- --pair 1847:run.jsonl:off.jsonl --pair 2718:… --pair 4096:… [--json out.json]
 * Slice 4: `--social [--live]` adds the social gate (src/tools/social-gate.ts); a pair may carry a 4th part,
 * the run's summary.json (calls, spend, cost lines), needed with --live. The slice-3 checks are reported too.
 * Exits 1 when any check fails (with --social, the social checks decide).
 */
const { values } = parseArgs({ options: { pair: { type: "string", multiple: true }, json: { type: "string" }, social: { type: "boolean" }, live: { type: "boolean" } } });
const read = (path: string): SimEvent[] => readFileSync(path, "utf8").split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line));
const loaded = (values.pair ?? []).map((pair) => {
  const [seed, run, off, summary] = pair.split(":");
  return { seed: Number(seed), run: read(run), off: read(off), summary: summary ? JSON.parse(readFileSync(summary, "utf8")) : undefined };
});
if (loaded.length === 0) throw new Error("give at least one --pair seed:run.jsonl:off.jsonl");
const slice3 = pickerGate(loaded.map((p) => seedGate(p.seed, p.run, p.off)));
const gate = values.social
  ? { ...socialGate(loaded.map((p) => socialSeedGate(p.seed, p.run, p.off, p.summary)), !!values.live), slice3 }
  : slice3;
if (values.json) writeFileSync(values.json, `${JSON.stringify(gate, null, 2)}\n`);
console.log(JSON.stringify(gate, null, 2));
process.exit(gate.pass ? 0 : 1);
