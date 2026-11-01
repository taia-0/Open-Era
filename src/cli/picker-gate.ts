import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { pickerGate, seedGate } from "../tools/picker-gate.ts";
import type { SimEvent } from "../sim/types.ts";

/**
 * The Lead's action-picker gate additions (src/tools/picker-gate.ts):
 *   npm run picker-gate -- --pair 1847:run.jsonl:off.jsonl --pair 2718:… --pair 4096:… [--json out.json]
 * Exits 1 when any check fails.
 */
const { values } = parseArgs({ options: { pair: { type: "string", multiple: true }, json: { type: "string" } } });
const read = (path: string): SimEvent[] => readFileSync(path, "utf8").split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line));
const seeds = (values.pair ?? []).map((pair) => {
  const [seed, run, off] = pair.split(":");
  return seedGate(Number(seed), read(run), read(off));
});
if (seeds.length === 0) throw new Error("give at least one --pair seed:run.jsonl:off.jsonl");
const gate = pickerGate(seeds);
if (values.json) writeFileSync(values.json, `${JSON.stringify(gate, null, 2)}\n`);
console.log(JSON.stringify(gate, null, 2));
process.exit(gate.pass ? 0 : 1);
