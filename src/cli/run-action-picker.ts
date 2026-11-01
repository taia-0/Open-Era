import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { ActionPickerReplay, PICKER_DEFAULT_CAP, stubArgmaxPicker, stubFittedPicker, stubUniformPicker, type ActionPicker, type ActionPickerRecord } from "../sim/ai-action-picker.ts";
import { CostLedger } from "../sim/ai-vendor/cost.ts";
import { jevActionPicker, jevSocialReader } from "../sim/ai-vendor/jev.ts";
import { loyaltyDriven, SOCIAL_DEFAULT_CALL_CAP, SOCIAL_DEFAULT_SPEND_CAP_USD, SOCIAL_FACTION_ID, SocialReplay, stubSocialFromTraits, type SocialReader, type SocialReadRecord } from "../sim/ai-social.ts";
import { workerTransport } from "../sim/ai-vendor/sync-http.ts";
import { runTick, type TickAiOptions } from "../sim/engine.ts";
import { createPrototypeWorld } from "../sim/scenario.ts";
import { stateHash } from "../sim/state.ts";

/**
 * Slice 3 runner (jev-action-picker.md).
 *   npm run action-picker -- --picker uniform|argmax|jev --seed 1847 --ticks 1200 [--max-calls 1000] [--cap-usd 0.05] [--actors all] --output <dir>
 *   npm run action-picker -- --replay <dir>
 * `--picker off` writes the flag-off baseline. Then `npm run picker-gate -- --pair 1847:<run>/events.jsonl:<off>/events.jsonl ...`.
 * Writes events.jsonl (for `npm run dynamism`), picker.jsonl, summary.json and cost.jsonl.
 * Slice 4 (jev-social-picker.md): `--social stub|jev` consults every Free Tide member with a social read;
 * caps default to 8,000 calls and $0.35. `--picker fitted --fit <picker.jsonl,...>` replays recorded Jev distributions offline.
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
    social: { type: "string", default: "off" },
    fit: { type: "string" },
  },
});
const replayDir = values.replay === undefined ? null : resolve(values.replay);
let recorded: { summary: any; records: Array<{ tick: number; actorId: string; picker: ActionPickerRecord; read?: SocialReadRecord }> } | null = null;
if (replayDir) {
  globalThis.fetch = (() => { throw new Error("network is disabled during --replay"); }) as typeof fetch;
  const summary = JSON.parse(readFileSync(join(replayDir, "summary.json"), "utf8"));
  const records = readFileSync(join(replayDir, "picker.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  recorded = { summary, records };
  values.seed = String(summary.seed); values.ticks = String(summary.ticks); values["max-calls"] = String(summary.maxCalls);
  if (summary.actors) values.actors = summary.actors;
  if (summary.social) values.social = summary.social;
}
const seed = Number.parseInt(values.seed!, 10);
const ticks = Number.parseInt(values.ticks!, 10);
const socialOn = values.social !== "off";
const argv = process.argv.join(" ");
if (socialOn && !replayDir && !argv.includes("--max-calls")) values["max-calls"] = String(SOCIAL_DEFAULT_CALL_CAP);
if (socialOn && !argv.includes("--cap-usd")) values["cap-usd"] = String(SOCIAL_DEFAULT_SPEND_CAP_USD);
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
else if (values.picker === "off") picker = null as unknown as ActionPicker;
else if (values.picker === "jev") picker = jevActionPicker({ transport: workerTransport(), ledger });
else if (values.picker === "fitted") {
  if (!values.fit) throw new Error("--picker fitted needs --fit <picker.jsonl,...>");
  const fit = values.fit.split(",").flatMap((path) => readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line).picker))
    .filter((r: ActionPickerRecord) => r.outcome === "model" && r.jevDistribution);
  picker = stubFittedPicker(fit.map((r: ActionPickerRecord) => ({ legal: r.legal, distribution: r.jevDistribution! })));
}
else throw new Error("--picker must be off, argmax, uniform, fitted or jev");
let social: SocialReader | undefined;
if (!socialOn || !picker) social = undefined;
else if (recorded) social = new SocialReplay(recorded.records.filter((r) => r.read).map((r) => ({ tick: r.tick, actorId: r.actorId, read: r.read! })));
else if (values.social === "stub") social = stubSocialFromTraits();
else if (values.social === "jev") social = jevSocialReader({ transport: workerTransport(), ledger });
else throw new Error("--social must be off, stub or jev");
const ai: TickAiOptions = { ...(picker ? { picker } : {}), ...(social ? { social } : {}), pickerCap: maxCalls, ...(values.actors === "all" ? { pickerActors: "all" as const } : {}) };

const world = createPrototypeWorld(seed);
const eventsPath = join(output, "events.jsonl");
const pickerPath = join(output, "picker.jsonl");
writeFileSync(eventsPath, ""); writeFileSync(pickerPath, "");
const records: ActionPickerRecord[] = [];
const reads: SocialReadRecord[] = [];
const lastLoyalty = new Map<string, SocialReadRecord["loyalty"]>();
let loyaltyPicks = 0;
let events = 0;
for (let index = 0; index < ticks; index += 1) {
  const result = runTick(world, picker ? { ai } : {});
  const lines: string[] = [];
  const pickLines: string[] = [];
  for (const event of result.events) {
    lines.push(JSON.stringify(event));
    const block = (event.data as { ai?: { picker?: ActionPickerRecord; read?: SocialReadRecord } } | undefined)?.ai;
    const record = block?.picker;
    const read = block?.read;
    if (record) {
      records.push(record);
      if (read) {
        reads.push(read);
        if (!read.hit) lastLoyalty.set(event.actorId!, read.outcome === "model" ? read.loyalty ?? null : null);
        const loyalty = read.hit ? lastLoyalty.get(event.actorId!) : (read.outcome === "model" ? read.loyalty : null);
        if (loyaltyDriven(record, loyalty ? { loyalty, grudges: [], readTick: 0, readInputHash: "" } : null)) loyaltyPicks += 1;
      }
      pickLines.push(JSON.stringify({ tick: event.tick, actorId: event.actorId, picker: record, ...(read ? { read } : {}) }));
    }
  }
  events += result.events.length;
  if (lines.length) appendFileSync(eventsPath, lines.join("\n") + "\n");
  if (pickLines.length) appendFileSync(pickerPath, pickLines.join("\n") + "\n");
}
const finalHash = stateHash(world);
const count = (fn: (r: ActionPickerRecord) => boolean) => records.filter(fn).length;
const summary = {
  mode: recorded ? "replay" : values.picker, social: socialOn ? values.social : null, seed, ticks, maxCalls, capUsd, actors: values.actors ?? null, stateHash: finalHash, events,
  consults: records.length, calls: ai.pickerCalls ?? 0, offScorer: count((r) => r.sampled !== r.scorerPick),
  fallbacks: count((r) => r.outcome === "fallback"),
  fallbackReasons: Object.fromEntries(["timeout", "error", "illegal", "cap"].map((reason) => [reason, count((r) => r.fallbackReason === reason)])),
  railBreaks: count((r) => !r.legal.includes(r.sampled)), truncated: count((r) => r.truncated),
  spendUsd: ledger.spendUsd, costLines: ledger.lines.length,
  ...(socialOn ? {
    reads: reads.length, readHits: reads.filter((r) => r.hit).length, readMisses: reads.filter((r) => !r.hit).length,
    readFallbacks: Object.fromEntries(["timeout", "error", "illegal", "cap"].map((reason) => [reason, reads.filter((r) => !r.hit && r.fallbackReason === reason).length])),
    consultsWithoutRead: records.length - reads.length, loyaltyDrivenPicks: loyaltyPicks,
    costLinesByRole: Object.fromEntries(["picker.action", "picker.social"].map((role) => [role, ledger.lines.filter((l) => l.role === role).length])),
  } : {}),
};
if (recorded && picker instanceof ActionPickerReplay) {
  const result = {
    ...summary, replayOf: replayDir, recordedStateHash: recorded.summary.stateHash, hashMatches: finalHash === recorded.summary.stateHash,
    providerCalls: picker.calls + (social instanceof SocialReplay ? social.calls : 0), recordsUsed: picker.used, recordsRecorded: picker.size,
  };
  writeFileSync(join(output, "replay.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
  process.exit(result.hashMatches && picker.calls === 0 && picker.used === picker.size ? 0 : 1);
}
writeFileSync(join(output, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary));
