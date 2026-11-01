import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { stubContextEcho, type ContextReader } from "../sim/ai-context.ts";
import { stubAgree, TAX_STEP_DEFAULT_CAP, TAX_STEP_PROMPT_VERSION_BRIEFED, type TaxStepProvider } from "../sim/ai-provider.ts";
import { CostLedger, DEFAULT_SPEND_CAP_USD } from "../sim/ai-vendor/cost.ts";
import { deepSeekBrain } from "../sim/ai-vendor/deepseek.ts";
import { jevContextReader } from "../sim/ai-vendor/jev.ts";
import { replayFromTrace, type Replay } from "../sim/ai-replay.ts";
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
    replay: { type: "string" },
    // ai-tax-weighted: "weighted" (default) draws the choice from the trait-weighted distribution; "brain" lets the vendor choose.
    "choice-mode": { type: "string", default: "weighted" },
  },
});
const replayDir = values.replay === undefined ? null : resolve(values.replay);
let recordedSummary: { seed: number; ticks: number; stateHash: string; maxCalls?: number; choiceMode?: string } | null = null;
let recordedTrace: TaxStepTraceEntry[] = [];
if (replayDir) {
  if (values["ai-vendor"]) throw new Error("--replay runs offline; it cannot be combined with --ai-vendor");
  // Offline guard: a replay never reaches the network.
  globalThis.fetch = (() => { throw new Error("network is disabled during --replay"); }) as typeof fetch;
  recordedSummary = JSON.parse(readFileSync(join(replayDir, "summary.json"), "utf8"));
  recordedTrace = JSON.parse(readFileSync(join(replayDir, "trace.json"), "utf8"));
  values.seed = String(recordedSummary!.seed);
  values.ticks = String(recordedSummary!.ticks);
  if (recordedSummary!.maxCalls !== undefined) values["max-calls"] = String(recordedSummary!.maxCalls);
  // Runs recorded before ai-tax-weighted have no choiceMode: the brain chose.
  values["choice-mode"] = recordedSummary!.choiceMode ?? "brain";
}
const choiceMode = values["choice-mode"];
if (choiceMode !== "weighted" && choiceMode !== "brain") throw new Error("--choice-mode must be weighted or brain");
const seed = Number.parseInt(values.seed!, 10);
const ticks = Number.parseInt(values.ticks!, 10);
const capUsd = Number(values["cap-usd"]);
const maxCalls = Number.parseInt(values["max-calls"]!, 10);
if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(ticks) || ticks < 0) throw new Error("--seed and --ticks must be integers");
if (!(capUsd >= 0)) throw new Error("--cap-usd must be a non-negative number");
if (!Number.isSafeInteger(maxCalls) || maxCalls < 0) throw new Error("--max-calls must be a non-negative integer");

const vendor = values["ai-vendor"] === true;
const output = resolve(values.output ?? (replayDir ? join(replayDir, "replay")
  : join("simulation-output", "ai-providers", `${vendor ? "vendor" : "stub"}-${seed}-${ticks}`)));
if (replayDir && output === replayDir) throw new Error("--output must not be the recorded run's directory");
mkdirSync(output, { recursive: true });
const costPath = join(output, "cost.jsonl");
rmSync(costPath, { force: true });
const ledger = new CostLedger(capUsd, (line) => appendFileSync(costPath, `${JSON.stringify(line)}\n`));

let brain: TaxStepProvider;
let context: ContextReader;
let replay: Replay | null = null;
if (replayDir) {
  replay = replayFromTrace(recordedTrace);
  brain = replay.brain;
  context = replay.context;
} else if (vendor) {
  const transport = workerTransport();
  brain = deepSeekBrain({ transport, ledger });
  context = jevContextReader({ transport, ledger });
} else {
  brain = stubAgree();
  context = stubContextEcho();
}
const ai: TickAiOptions = { brainTaxStep: brain, context, cap: maxCalls, ledger, weighted: choiceMode === "weighted" };

const world = createPrototypeWorld(seed);
const trace: TaxStepTraceEntry[] = [];
let events = 0;
for (let index = 0; index < ticks; index += 1) {
  const result = runTick(world, { ai });
  events += result.events.length;
  trace.push(...(result.aiTrace ?? []));
}
writeFileSync(join(output, "trace.json"), `${JSON.stringify(trace, null, 2)}\n`);
const finalHash = stateHash(world);
if (replay && recordedSummary) {
  const report = replay.report(trace);
  const result = {
    mode: "replay", replayOf: replayDir, seed, ticks, maxCalls, choiceMode, stateHash: finalHash, recordedStateHash: recordedSummary.stateHash,
    hashMatches: finalHash === recordedSummary.stateHash, ...report,
    currentPromptVersion: TAX_STEP_PROMPT_VERSION_BRIEFED,
  };
  writeFileSync(join(output, "replay.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
  const ok = result.hashMatches && report.traceMatches && report.missingBrain === 0 && report.missingContext === 0;
  process.exit(ok ? 0 : 1);
}
const summary = {
  mode: vendor ? "vendor" : "stub",
  choiceMode, seed, ticks, stateHash: finalHash, events,
  calls: ai.calls ?? 0, maxCalls, capUsd, spendUsd: ledger.spendUsd, costLines: ledger.lines.length,
  costLog: vendor ? costPath : null,
  fallbacks: trace.filter((entry) => entry.ai.outcome === "fallback").length,
  decisions: trace.length,
  disagreements: trace.filter((entry) => entry.ai.finalChoice !== entry.ai.scorerChoice).length,
  expectedDisagreement: trace.length === 0 ? 0 : Math.round(trace.reduce((sum, entry) =>
    sum + (entry.ai.weighted ? 1 - (entry.ai.weighted.distribution[entry.ai.scorerChoice] ?? 0) : 0), 0) / trace.length * 1e4) / 1e4,
  escalations: trace.filter((entry) => entry.ai.weighted?.escalation).length,
  modelReasons: trace.filter((entry) => entry.ai.reasonSource === "model").length,
};
writeFileSync(join(output, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary));
