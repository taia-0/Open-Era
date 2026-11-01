import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { secessionGate, secessionSeed } from "../tools/secession-gate.ts";
import type { SimEvent } from "../sim/types.ts";

/**
 * Secession-routes dynamism gate (docs/design/secession-routes.md §4):
 *   npm run secession-gate -- --pair 1847:run.jsonl:baseline.jsonl … [--json out.json]
 * The baseline is the pre-routes (tax-only) event log. Exits 1 when a check fails.
 */
const { values } = parseArgs({ options: { pair: { type: "string", multiple: true }, json: { type: "string" } } });
const read = (path: string): SimEvent[] => readFileSync(path, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const seeds = (values.pair ?? []).map((pair) => { const [seed, run, base] = pair.split(":"); return secessionSeed(Number(seed), read(run), read(base)); });
if (seeds.length === 0) throw new Error("give at least one --pair seed:run.jsonl:baseline.jsonl");
const gate = secessionGate(seeds);
if (values.json) writeFileSync(values.json, `${JSON.stringify(gate, null, 2)}\n`);
console.log(JSON.stringify(gate, null, 2));
process.exit(gate.pass ? 0 : 1);
