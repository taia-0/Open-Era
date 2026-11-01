import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { ActionPickerReplay, PICKER_DEFAULT_CAP, stubArgmaxPicker, stubUniformPicker, type ActionPicker, type ActionPickerRecord } from "../sim/ai-action-picker.ts";
import { CostLedger } from "../sim/ai-vendor/cost.ts";
import { jevActionPicker } from "../sim/ai-vendor/jev.ts";
import { workerTransport } from "../sim/ai-vendor/sync-http.ts";
import { runTick, type TickAiOptions } from "../sim/engine.ts";
import { createPrototypeWorld } from "../sim/scenario.ts";
import { stateHash } from "../sim/state.ts";

/**
 * Slice 3 runner (jev-action-picker.md).
 *   npm run action-picker -- --picker uniform|argmax|jev --seed 1847 --ticks 1200 [--max-calls 1000] [--cap-usd 0.05] [--actors all] --output <dir>
 *   npm run action-picker -- --replay <dir>
 * Writes events.jsonl (for `npm run dynamism`), picker.jsonl, summary.json and cost.jsonl.
 * `--picker jev` needs JEV_API_KEY in the environment and Micah's go-ahead; the key is never written.
 */
const { values } = parseArgs({
  options: {
    picker: { type: "string", default: "uniform" },
    seed: { type: "string", default: "1847" },
    ticks: { type: "string", default: "1200" },
    "max-calls": { type: "string", default: String(PICKER_DEFAULT_CAP) },
    "cap-usd": { type: "string", default: "0.05" },
    actors: { type: "string" },
    output: { type: "string" },
    replay: { type: "string" },
  },
});
const replayDir = values.replay === undefined ? null : resolve(values.replay);
let recorded: { summary: any; records: Array<{ tick: number; actorId: string; picker: ActionPickerRecord }> } | null = null;
if (replayDir) {
  globalThis.fetch = (() => { throw new Error("network is disabled during --replay"); }) as typeof fetch;
  const summary = JSON.parse(readFileSync(join(replayDir, "summary.json"), "utf8"));
  const records = readFileSync(join(replayDir, "picker.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  recorded = { summary, records };
  values.seed = String(summary.seed); values.ticks = String(summary.ticks); values["max-calls"] = String(summary.maxCalls);
  if (summary.actors) values.actors = summary.actors;
}
const seed = Number.parseInt(values.seed!, 10);
const ticks = Number.parseInt(values.ticks!, 10);
const maxCalls = Number.parseInt(values["max-calls"]!, 10);
const capUsd = Number(values["cap-usd"]);
const output = resolve(values.output ?? (replayDir ? join(replayDir, "replay") : join("simulation-output", "jev-action-picker", `${values.picker}-${seed}-${ticks}`)));
if (replayDir && output === replayDir) throw new Error("--output must not be the recorded run's directory");
mkdirSync(output, { recursive: true });
const costPath = join(output, "cost.jsonl");
rmSync(costPath, { force: true });
const ledger = new CostLedger(capUsd, (line) => appendFileSync(costPath, `${JSON.stringify(line)}\n`));

let picker: ActionPicker & { calls?: number };
if (recorded) picker = new ActionPickerReplay(recorded.records);
else if (values.picker === "argmax") picker = stubArgmaxPicker();
else if (values.picker === "uniform") picker = stubUniformPicker();
else if (values.picker === "jev") picker = jevActionPicker({ transport: workerTransport(), ledger });
else throw new Error("--picker must be argmax, uniform or jev");
const ai: TickAiOptions = { picker, pickerCap: maxCalls, ...(values.actors === "all" ? { pickerActors: "all" as const } : {}) };

const world = createPrototypeWorld(seed);
const eventsPath = join(output, "events.jsonl");
const pickerPath = join(output, "picker.jsonl");
writeFileSync(eventsPath, ""); writeFileSync(pickerPath, "");
const records: ActionPickerRecord[] = [];
let events = 0;
for (let index = 0; index < ticks; index += 1) {
  const result = runTick(world, { ai });
  const lines: string[] = [];
  const pickLines: string[] = [];
  for (const event of result.events) {
    lines.push(JSON.stringify(event));
    const record = (event.data as { ai?: { picker?: ActionPickerRecord } } | undefined)?.ai?.picker;
    if (record) { records.push(record); pickLines.push(JSON.stringify({ tick: event.tick, actorId: event.actorId, picker: record })); }
  }
  events += result.events.length;
  if (lines.length) appendFileSync(eventsPath, lines.join("\n") + "\n");
  if (pickLines.length) appendFileSync(pickerPath, pickLines.join("\n") + "\n");
}
const finalHash = stateHash(world);
const count = (fn: (r: ActionPickerRecord) => boolean) => records.filter(fn).length;
const summary = {
  mode: recorded ? "replay" : values.picker, seed, ticks, maxCalls, capUsd, actors: values.actors ?? null, stateHash: finalHash, events,
  consults: records.length, calls: ai.pickerCalls ?? 0, offScorer: count((r) => r.sampled !== r.scorerPick),
  fallbacks: count((r) => r.outcome === "fallback"),
  fallbackReasons: Object.fromEntries(["timeout", "error", "illegal", "cap"].map((reason) => [reason, count((r) => r.fallbackReason === reason)])),
  railBreaks: count((r) => !r.legal.includes(r.sampled)), truncated: count((r) => r.truncated),
  spendUsd: ledger.spendUsd, costLines: ledger.lines.length,
};
if (recorded && picker instanceof ActionPickerReplay) {
  const result = {
    ...summary, replayOf: replayDir, recordedStateHash: recorded.summary.stateHash, hashMatches: finalHash === recorded.summary.stateHash,
    providerCalls: picker.calls, recordsUsed: picker.used, recordsRecorded: picker.size,
  };
  writeFileSync(join(output, "replay.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
  process.exit(result.hashMatches && picker.calls === 0 && picker.used === picker.size ? 0 : 1);
}
writeFileSync(join(output, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary));
