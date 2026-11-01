import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { ActionPickerReplay, PICKER_DEFAULT_CAP, stubArgmaxPicker, stubFittedPicker, stubUniformPicker, type ActionPicker, type ActionPickerRecord } from "../sim/ai-action-picker.ts";
import { CostLedger } from "../sim/ai-vendor/cost.ts";
import { jevActionPicker, jevSocialReader } from "../sim/ai-vendor/jev.ts";
import { loyaltyDriven, SOCIAL_DEFAULT_CALL_CAP, SOCIAL_DEFAULT_SPEND_CAP_USD, SOCIAL_FACTION_ID, SocialReplay, stubSocialFromTraits, type SocialReader, type SocialReadRecord } from "../sim/ai-social.ts";
import { workerTransport } from "../sim/ai-vendor/sync-http.ts";
import { deepSeekEscalationBrain } from "../sim/ai-vendor/deepseek.ts";
import { ALWAYS_FLAG, NEVER_FLAG, stubBrainLast, TRIAGE_BUDGET, TRIAGE_TESTS, TriageReplay, type BrainRecord, type EscalationBrain, type TriageRecord } from "../sim/ai-triage.ts";
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
 * Slice 5 (jev-triage.md): `--triage never|always|jev` adds the four Nouls (stubs: never or always flag; `jev`
 * reads them from the picker's own Jev answer) and `--brain stub|deepseek` (default stub: the last legal id).
 * The brain has its own ledger, `--brain-cap-usd` (default $0.25); its lines go to the same cost.jsonl.
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
    triage: { type: "string", default: "off" },
    brain: { type: "string", default: "stub" },
    "brain-cap-usd": { type: "string", default: "0.25" },
  },
});
let fetchAttempts = 0;
const replayDir = values.replay === undefined ? null : resolve(values.replay);
let recorded: { summary: any; records: Array<{ tick: number; actorId: string; picker: ActionPickerRecord; read?: SocialReadRecord }> } | null = null;
if (replayDir) {
  globalThis.fetch = (() => { fetchAttempts += 1; throw new Error("network is disabled during --replay"); }) as typeof fetch;
  const summary = JSON.parse(readFileSync(join(replayDir, "summary.json"), "utf8"));
  const records = readFileSync(join(replayDir, "picker.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  recorded = { summary, records };
  values.seed = String(summary.seed); values.ticks = String(summary.ticks); values["max-calls"] = String(summary.maxCalls);
  if (summary.actors) values.actors = summary.actors;
  if (summary.social) values.social = summary.social;
  if (summary.triage) values.triage = summary.triage;
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
const triageOn = values.triage !== "off" && !!picker;
const brainLedger = new CostLedger(Number(values["brain-cap-usd"]), (line) => appendFileSync(costPath, `${JSON.stringify(line)}\n`));
let brain: (EscalationBrain & { calls?: number }) | null = null;
if (triageOn) {
  if (recorded) brain = new TriageReplay(recorded.records as Array<{ tick: number; actorId: string; triage?: TriageRecord; brain?: BrainRecord }>);
  else if (values.brain === "stub") brain = stubBrainLast();
  else if (values.brain === "deepseek") brain = deepSeekEscalationBrain({ transport: workerTransport(), ledger: brainLedger });
  else throw new Error("--brain must be stub or deepseek");
  if (!["never", "always", "jev"].includes(values.triage!)) throw new Error("--triage must be off, never, always or jev");
  if (values.triage === "jev" && !recorded && values.picker !== "jev") throw new Error("--triage jev needs --picker jev (the Nouls ride on the picker's request)");
}
const noulStub = values.triage === "never" ? NEVER_FLAG : values.triage === "always" ? ALWAYS_FLAG : undefined;
const ai: TickAiOptions = {
  ...(picker ? { picker } : {}), ...(social ? { social } : {}), pickerCap: maxCalls, ...(values.actors === "all" ? { pickerActors: "all" as const } : {}),
  ...(triageOn && brain ? { triage: { brain, ...(noulStub && !recorded ? { noul: noulStub } : {}) } } : {}),
};

const world = createPrototypeWorld(seed);
const eventsPath = join(output, "events.jsonl");
const pickerPath = join(output, "picker.jsonl");
writeFileSync(eventsPath, ""); writeFileSync(pickerPath, "");
const records: ActionPickerRecord[] = [];
const reads: SocialReadRecord[] = [];
const lastLoyalty = new Map<string, SocialReadRecord["loyalty"]>();
let loyaltyPicks = 0;
const optionKey = (row: { action: string; targetId?: string; resource?: string }) => `${row.action}:${row.targetId ?? "-"}:${row.resource ?? "-"}`;
const triages: Array<{ tick: number; actorId: string; triage: TriageRecord; brain?: BrainRecord; chosen: string }> = [];
let events = 0;
for (let index = 0; index < ticks; index += 1) {
  const result = runTick(world, picker ? { ai } : {});
  const lines: string[] = [];
  const pickLines: string[] = [];
  for (const event of result.events) {
    lines.push(JSON.stringify(event));
    const block = (event.data as { ai?: { picker?: ActionPickerRecord; read?: SocialReadRecord; triage?: TriageRecord; brain?: BrainRecord } } | undefined)?.ai;
    const record = block?.picker;
    const read = block?.read;
    if (block?.triage) triages.push({ tick: event.tick, actorId: event.actorId!, triage: block.triage, brain: block.brain, chosen: optionKey((event.data as { chosen: { action: string; targetId?: string; resource?: string } }).chosen) });
    if (record) {
      records.push(record);
      if (read) {
        reads.push(read);
        if (!read.hit) lastLoyalty.set(event.actorId!, read.outcome === "model" ? read.loyalty ?? null : null);
        const loyalty = read.hit ? lastLoyalty.get(event.actorId!) : (read.outcome === "model" ? read.loyalty : null);
        if (loyaltyDriven(record, loyalty ? { loyalty, grudges: [], readTick: 0, readInputHash: "" } : null)) loyaltyPicks += 1;
      }
      pickLines.push(JSON.stringify({ tick: event.tick, actorId: event.actorId, picker: record, ...(read ? { read } : {}), ...(block?.triage ? { triage: block.triage } : {}), ...(block?.brain ? { brain: block.brain } : {}) }));
    }
  }
  events += result.events.length;
  if (lines.length) appendFileSync(eventsPath, lines.join("\n") + "\n");
  if (pickLines.length) appendFileSync(pickerPath, pickLines.join("\n") + "\n");
}
const finalHash = stateHash(world);
function triageSummary() {
  const escalated = triages.filter((t) => t.triage.escalated);
  const brains = escalated.map((t) => t.brain!).filter(Boolean);
  // Cooldown: no actor escalated twice inside 24 ticks.
  const last = new Map<string, number>(); let cooldownBreaks = 0;
  for (const t of escalated) { const was = last.get(t.actorId); if (was !== undefined && t.tick - was < 24) cooldownBreaks += 1; last.set(t.actorId, t.tick); }
  const flaggedDecisions = triages.filter((t) => t.triage.flagged.length > 0).length;
  return {
    triaged: triages.length, flaggedDecisions, escalations: escalated.length, budget: TRIAGE_BUDGET,
    expectedEscalations: null as number | null,
    skippedCooldown: triages.filter((t) => t.triage.skipped === "cooldown").length, skippedBudget: triages.filter((t) => t.triage.skipped === "budget").length,
    perTest: Object.fromEntries(TRIAGE_TESTS.map((test) => [test, { flagged: triages.filter((t) => t.triage.flagged.includes(test)).length, escalated: escalated.filter((t) => t.triage.flagged.includes(test)).length }])),
    brainModel: brains.filter((b) => b.outcome === "model").length,
    brainFallbacks: Object.fromEntries(["timeout", "error", "illegal", "cap"].map((r) => [r, brains.filter((b) => b.fallbackReason === r).length])),
    brainDiffersFromPicker: brains.filter((b) => b.choice !== b.pickerSampled).length,
    brainDiffersShare: brains.length ? Math.round((brains.filter((b) => b.choice !== b.pickerSampled).length / brains.length) * 1e4) / 1e4 : 0,
    brainRailBreaks: escalated.filter((t) => !t.brain || t.chosen !== t.brain.choice).length,
    cooldownBreaks,
    brainCalls: ai.brainCalls ?? 0, brainSpendUsd: brainLedger.spendUsd, brainCostLines: brainLedger.lines.length,
    pickerCostLinesWithTriage: ledger.lines.filter((l) => l.triageQuestions === 4).length,
  };
}
const count = (fn: (r: ActionPickerRecord) => boolean) => records.filter(fn).length;
const summary = {
  mode: recorded ? "replay" : values.picker, social: socialOn ? values.social : null, seed, ticks, maxCalls, capUsd, actors: values.actors ?? null, stateHash: finalHash, events,
  consults: records.length, calls: ai.pickerCalls ?? 0, offScorer: count((r) => r.sampled !== r.scorerPick),
  fallbacks: count((r) => r.outcome === "fallback"),
  fallbackReasons: Object.fromEntries(["timeout", "error", "illegal", "cap"].map((reason) => [reason, count((r) => r.fallbackReason === reason)])),
  railBreaks: count((r) => !r.legal.includes(r.sampled)), truncated: count((r) => r.truncated),
  spendUsd: ledger.spendUsd, costLines: ledger.lines.length,
  ...(triageOn ? { triage: values.triage, brain: recorded ? "replay" : values.brain, triageSummary: triageSummary() } : {}),
  ...(socialOn ? {
    reads: reads.length, readHits: reads.filter((r) => r.hit).length, readMisses: reads.filter((r) => !r.hit).length,
    readFallbacks: Object.fromEntries(["timeout", "error", "illegal", "cap"].map((reason) => [reason, reads.filter((r) => !r.hit && r.fallbackReason === reason).length])),
    consultsWithoutRead: records.length - reads.length, loyaltyDrivenPicks: loyaltyPicks,
    costLinesByRole: Object.fromEntries(["picker.action", "picker.social"].map((role) => [role, ledger.lines.filter((l) => l.role === role).length])),
  } : {}),
};
if (recorded && picker instanceof ActionPickerReplay) {
  const result = {
    ...summary, replayOf: replayDir, fetchAttempts, recordedStateHash: recorded.summary.stateHash, hashMatches: finalHash === recorded.summary.stateHash,
    providerCalls: picker.calls + (social instanceof SocialReplay ? social.calls : 0) + (brain instanceof TriageReplay ? brain.calls : 0), recordsUsed: picker.used, recordsRecorded: picker.size,
    ...(brain instanceof TriageReplay ? { triageRecordsUsed: brain.used, triageRecordsRecorded: brain.size } : {}),
  };
  writeFileSync(join(output, "replay.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
  const triageOk = !(brain instanceof TriageReplay) || brain.used === brain.size;
  process.exit(result.hashMatches && result.providerCalls === 0 && fetchAttempts === 0 && picker.used === picker.size && triageOk ? 0 : 1);
}
writeFileSync(join(output, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary));
