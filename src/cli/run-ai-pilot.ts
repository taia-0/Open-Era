import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { stubContextEcho, type ContextReader } from "../sim/ai-context.ts";
import { stubAgree, TAX_STEP_DEFAULT_CAP, TAX_STEP_PROMPT_VERSION_BRIEFED, type TaxStepProvider } from "../sim/ai-provider.ts";
import { CostLedger, DEFAULT_SPEND_CAP_USD } from "../sim/ai-vendor/cost.ts";
import { deepSeekBrain } from "../sim/ai-vendor/deepseek.ts";
import { jevContextReader } from "../sim/ai-vendor/jev.ts";
import { replayFromTrace, type Replay } from "../sim/ai-replay.ts";
import { PickerReplay } from "../sim/ai-picker.ts";
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
    // Slice 1 stubs: "argmax" (stubArgmax, probability 1 on the scorer's pick) and "uniform" (stubUniform); no vendor calls.
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
const CHOICE_MODES = ["weighted", "brain", "argmax", "uniform"];
if (!CHOICE_MODES.includes(choiceMode!)) throw new Error(`--choice-mode must be one of ${CHOICE_MODES.join(", ")}`);
const picked = choiceMode !== "brain";
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
const ai: TickAiOptions = {
  brainTaxStep: brain, context, cap: maxCalls, ledger, weighted: picked,
  ...(choiceMode === "argmax" ? { pickerStub: "stubArgmax" as const } : choiceMode === "uniform" ? { pickerStub: "stubUniform" as const } : {}),
  // Slice 1: a replay of a picked run reuses the recorded p and u, and throws on any mismatch.
  ...(replayDir && picked ? { pickerReplay: pickerReplayFromTrace(recordedTrace) } : {}),
};

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
  const pickerUsed = ai.pickerReplay ? ai.pickerReplay.used : null;
  if (ai.pickerReplay && pickerUsed !== ai.pickerReplay.size) throw new Error(`picker replay: used ${pickerUsed} of ${ai.pickerReplay.size} recorded draws`);
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

/** Picker records from a trace; traces from before the picker record fall back to `data.ai.weighted` (legal, distribution, draw). */
function pickerReplayFromTrace(trace: TaxStepTraceEntry[]): PickerReplay {
  return new PickerReplay(trace.filter((entry) => entry.ai.picker || entry.ai.weighted).map((entry) => {
    const w = entry.ai.weighted!;
    const picker = entry.ai.picker ?? {
      model: "tax-weighted", promptVersion: w.paramsVersion, inputHash: entry.ai.inputHash, outcome: "model" as const,
      options: [...w.legal].sort(), p: [...w.legal].sort().map((id) => w.distribution[id] ?? 0),
      index: [...w.legal].sort().indexOf(w.sampled), u: w.draw,
    };
    return { tick: entry.tick, actorId: entry.factionId, picker };
  }));
}
