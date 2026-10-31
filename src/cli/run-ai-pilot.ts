import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { stubContextEcho, type ContextReader } from "../sim/ai-context.ts";
import { stubAgree, TAX_STEP_DEFAULT_CAP, type TaxStepProvider } from "../sim/ai-provider.ts";
import { CostLedger, DEFAULT_SPEND_CAP_USD } from "../sim/ai-vendor/cost.ts";
import { deepSeekBrain } from "../sim/ai-vendor/deepseek.ts";
import { jevContextReader } from "../sim/ai-vendor/jev.ts";
import { workerTransport } from "../sim/ai-vendor/sync-http.ts";
import { runTick, type TickAiOptions } from "../sim/engine.ts";
import type { TaxStepTraceEntry } from "../sim/ai-provider.ts";
import { createPrototypeWorld } from "../sim/scenario.ts";
import { stateHash } from "../sim/state.ts";

/**
 * Pilot A/B runner (ai-providers.md section 7). Stubs by default. The real
 * DeepSeek brain and Jev reader are built only with `--ai-vendor`, which
 * needs Micah's go-ahead. Keys come from the environment and are never printed.
 */
const { values } = parseArgs({
  options: {
    seed: { type: "string", default: "1847" },
    ticks: { type: "string", default: "72" },
    "ai-vendor": { type: "boolean", default: false },
    "cap-usd": { type: "string", default: String(DEFAULT_SPEND_CAP_USD) },
    "max-calls": { type: "string", default: String(TAX_STEP_DEFAULT_CAP) },
    output: { type: "string" },
  },
});
const seed = Number.parseInt(values.seed!, 10);
const ticks = Number.parseInt(values.ticks!, 10);
const capUsd = Number(values["cap-usd"]);
const maxCalls = Number.parseInt(values["max-calls"]!, 10);
if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(ticks) || ticks < 0) throw new Error("--seed and --ticks must be integers");
if (!(capUsd >= 0)) throw new Error("--cap-usd must be a non-negative number");
if (!Number.isSafeInteger(maxCalls) || maxCalls < 0) throw new Error("--max-calls must be a non-negative integer");

const vendor = values["ai-vendor"] === true;
const output = resolve(values.output ?? join("simulation-output", "ai-providers", `${vendor ? "vendor" : "stub"}-${seed}-${ticks}`));
mkdirSync(output, { recursive: true });
const costPath = join(output, "cost.jsonl");
rmSync(costPath, { force: true });
const ledger = new CostLedger(capUsd, (line) => appendFileSync(costPath, `${JSON.stringify(line)}\n`));

let brain: TaxStepProvider;
let context: ContextReader;
if (vendor) {
  const transport = workerTransport();
  brain = deepSeekBrain({ transport, ledger });
  context = jevContextReader({ transport, ledger });
} else {
  brain = stubAgree();
  context = stubContextEcho();
}
const ai: TickAiOptions = { brainTaxStep: brain, context, cap: maxCalls, ledger };

const world = createPrototypeWorld(seed);
const trace: TaxStepTraceEntry[] = [];
let events = 0;
for (let index = 0; index < ticks; index += 1) {
  const result = runTick(world, { ai });
  events += result.events.length;
  trace.push(...(result.aiTrace ?? []));
}
writeFileSync(join(output, "trace.json"), `${JSON.stringify(trace, null, 2)}\n`);
const summary = {
  mode: vendor ? "vendor" : "stub",
  seed, ticks, stateHash: stateHash(world), events,
  calls: ai.calls ?? 0, capUsd, spendUsd: ledger.spendUsd, costLines: ledger.lines.length,
  costLog: vendor ? costPath : null,
  fallbacks: trace.filter((entry) => entry.ai.outcome === "fallback").length,
};
writeFileSync(join(output, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary));
