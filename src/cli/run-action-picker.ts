import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { EXILE_FLAG_OPTIONS, maybeHelp, resolveExileRecovery } from "./exile-flag.ts";
import { ALLIANCES_FLAG_HELP, ALLIANCES_FLAG_OPTIONS, resolveAlliances } from "./alliances-flag.ts";
import { parseArgs } from "node:util";
import { ActionPickerReplay, PICKER_DEFAULT_CAP, stubArgmaxPicker, stubFittedPicker, stubUniformPicker, type ActionPicker, type ActionPickerRecord } from "../sim/ai-action-picker.ts";
import { CostLedger } from "../sim/ai-vendor/cost.ts";
import { jevActionPicker, jevSocialReader, jevTriageScorer } from "../sim/ai-vendor/jev.ts";
import { loyaltyDriven, SOCIAL_DEFAULT_CALL_CAP, SOCIAL_DEFAULT_SPEND_CAP_USD, SOCIAL_FACTION_ID, SocialReplay, stubSocialFromTraits, type SocialReader, type SocialReadRecord } from "../sim/ai-social.ts";
import { workerTransport } from "../sim/ai-vendor/sync-http.ts";
import { deepSeekEscalationBrain } from "../sim/ai-vendor/deepseek.ts";
import { alwaysScorer, kindScorer, neverScorer, stubBrainLast, stubBrainLiveLike, stubBrainOther, TRIAGE_BUDGET, TRIAGE_DEFAULT_SCORE_CAP, TRIAGE_KINDS, TRIAGE_TESTS, TriageReplay, type EscalationBrain, type TriageEntry, type TriageScorer } from "../sim/ai-triage.ts";
import { sha256 } from "../sim/ai-provider.ts";
import { canonicalJson } from "../sim/state.ts";
import { runTick, type TickAiOptions } from "../sim/engine.ts";
import { parsePickerFactions, WG_FACTION_ID, WG_PICKER_DEFAULT_CAP, WG_PICKER_DEFAULT_SPEND_CAP_USD, type WgNudge } from "../sim/ai-wg-picker.ts";
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
 * Slice 5 (jev-triage.md, Lead rework): `--triage never|always|kind|jev` scores tax steps, desertions, secessions,
 * surrender/claim decisions and contract breaks for every actor with a SEPARATE request (stubs, or Jev `triage.score`),
 * own ledger `--triage-cap-usd` (default $0.05) and `--triage-max-calls` (default 4,000). `--brain stub|other|deepseek`
 * (stub: the last legal id; other: always a non-default id), own ledger `--brain-cap-usd` (default $0.25).
 * `--cache <picker-only run dir>`: the picker answers from that run's recorded answers by inputHash (cached reads)
 * and calls the live picker only on a miss, so at 0 escalations the run equals the picker-only run exactly.
 * `--triage-budget 0` scores live and never escalates (check 6 at 0 escalations).
 * Triage records go to triage.jsonl; all cost lines to cost.jsonl.
 * wg-jev-picker.md: `--picker-factions free-tide,world-government` (default free-tide) adds World Government's
 * governors (and an autonomous holder) as nudge-only consults, own cap `--wg-max-calls` (default 1,853).
 * With world-government and no free-tide, `--cap-usd` defaults to $0.11.
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
    "triage-cap-usd": { type: "string", default: "0.05" },
    "triage-max-calls": { type: "string", default: String(TRIAGE_DEFAULT_SCORE_CAP) },
    cache: { type: "string" },
    "triage-budget": { type: "string" },
    "triage-cache": { type: "string" },
    "brain-prior": { type: "string" },
    "brain-weight": { type: "string" },
    "brain-default-kinds": { type: "string" },
    "picker-factions": { type: "string" },
    "wg-max-calls": { type: "string", default: String(WG_PICKER_DEFAULT_CAP) },
    ...EXILE_FLAG_OPTIONS,
    ...ALLIANCES_FLAG_OPTIONS,
  },
});
maybeHelp(values, "npm run action-picker -- [--picker uniform|argmax|jev|fitted] [--seed N] [--ticks N] [--triage ...] [--replay <dir>] [--alliances]", [ALLIANCES_FLAG_HELP]);
let fetchAttempts = 0;
const replayDir = values.replay === undefined ? null : resolve(values.replay);
let recorded: { summary: any; records: Array<{ tick: number; actorId: string; picker: ActionPickerRecord; read?: SocialReadRecord }>; triage: TriageEntry[] } | null = null;
if (replayDir) {
  globalThis.fetch = (() => { fetchAttempts += 1; throw new Error("network is disabled during --replay"); }) as typeof fetch;
  const summary = JSON.parse(readFileSync(join(replayDir, "summary.json"), "utf8"));
  const records = readFileSync(join(replayDir, "picker.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  let triageLines: TriageEntry[] = [];
  try { triageLines = readFileSync(join(replayDir, "triage.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)); } catch { triageLines = []; }
  recorded = { summary, records, triage: triageLines };
  if (summary.triageMaxCalls) values["triage-max-calls"] = String(summary.triageMaxCalls);
  if (summary.triageBudget !== undefined && summary.triageBudget !== null) values["triage-budget"] = String(summary.triageBudget);
  values.seed = String(summary.seed); values.ticks = String(summary.ticks); values["max-calls"] = String(summary.maxCalls);
  if (summary.actors) values.actors = summary.actors;
  if (summary.social) values.social = summary.social;
  if (summary.triage) values.triage = summary.triage;
  if (summary.pickerFactions) values["picker-factions"] = summary.pickerFactions.join(",");
  if (summary.wgMaxCalls) values["wg-max-calls"] = String(summary.wgMaxCalls);
  if (summary.alliances === true) values.alliances = true;
  if (summary.exileRecovery === false) values["no-exile-recovery"] = true;
}
const exileRecovery = resolveExileRecovery(values);
const alliances = resolveAlliances(values);
const seed = Number.parseInt(values.seed!, 10);
const ticks = Number.parseInt(values.ticks!, 10);
const socialOn = values.social !== "off";
const argv = process.argv.join(" ");
if (socialOn && !replayDir && !argv.includes("--max-calls")) values["max-calls"] = String(SOCIAL_DEFAULT_CALL_CAP);
if (socialOn && !argv.includes("--cap-usd")) values["cap-usd"] = String(SOCIAL_DEFAULT_SPEND_CAP_USD);
const pickerFactions = parsePickerFactions(values["picker-factions"]);
const wgOn = pickerFactions?.includes(WG_FACTION_ID) === true;
const wgMaxCalls = Number.parseInt(values["wg-max-calls"]!, 10);
if (wgOn && !pickerFactions!.includes("free-tide") && !argv.includes("--cap-usd") && !replayDir) values["cap-usd"] = String(WG_PICKER_DEFAULT_SPEND_CAP_USD);
if (replayDir && recorded!.summary.capUsd !== undefined) values["cap-usd"] = String(recorded!.summary.capUsd);
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
// Cached reads (Lead ruling 3): the picker-only run's answers by inputHash; a miss calls the live picker.
let cacheHits = 0; let cacheMisses = 0;
if (values.cache && picker && !recorded) {
  const live = picker;
  const cache = new Map<string, ActionPickerRecord>();
  // Comma-separated run dirs; the first record for an inputHash wins.
  for (const dir of values.cache.split(",")) for (const line of readFileSync(join(resolve(dir), "picker.jsonl"), "utf8").split("\n").filter(Boolean)) { const r = JSON.parse(line).picker as ActionPickerRecord; if (!cache.has(r.inputHash)) cache.set(r.inputHash, r); }
  picker = { name: live.name, model: live.model, choose(request) {
    const was = cache.get(sha256(canonicalJson(request)));
    if (!was) { cacheMisses += 1; return live.choose(request); }
    cacheHits += 1;
    return was.fallbackReason && was.fallbackReason !== "illegal"
      ? { probabilities: null, latencyMs: was.latencyMs, error: was.fallbackReason }
      : { probabilities: was.probabilities, confidence: was.confidence, responseModel: was.responseModel, latencyMs: was.latencyMs, exact: was.exact === true };
  } };
}
let social: SocialReader | undefined;
if (!socialOn || !picker) social = undefined;
else if (recorded) social = new SocialReplay(recorded.records.filter((r) => r.read).map((r) => ({ tick: r.tick, actorId: r.actorId, read: r.read! })));
else if (values.social === "stub") social = stubSocialFromTraits();
else if (values.social === "jev") social = jevSocialReader({ transport: workerTransport(), ledger });
else throw new Error("--social must be off, stub or jev");
const triageOn = values.triage !== "off";
const brainLedger = new CostLedger(Number(values["brain-cap-usd"]), (line) => appendFileSync(costPath, `${JSON.stringify(line)}\n`));
const triageLedger = new CostLedger(Number(values["triage-cap-usd"]), (line) => appendFileSync(costPath, `${JSON.stringify(line)}\n`));
const triageMaxCalls = Number.parseInt(values["triage-max-calls"]!, 10);
/** `--triage-budget 0`: score live, never escalate (check 6 at 0 escalations on cached reads). Default 50. */
const triageBudget = values["triage-budget"] === undefined ? undefined : Number.parseInt(values["triage-budget"], 10);
let brain: (EscalationBrain & { calls?: number }) | null = null;
let scorer: (TriageScorer & { calls?: number }) | null = null;
const triageReplay = recorded && triageOn ? new TriageReplay(recorded.triage) : null;
if (triageOn) {
  if (triageReplay) { brain = triageReplay; scorer = triageReplay; }
  else {
    if (values.brain === "stub") brain = stubBrainLast();
    else if (values.brain === "other") brain = stubBrainOther();
    else if (values.brain === "livelike") brain = stubBrainLiveLike();
    else if (values.brain === "deepseek") brain = deepSeekEscalationBrain({ transport: workerTransport(), ledger: brainLedger });
    else throw new Error("--brain must be stub, other or deepseek");
    if (values.triage === "never") scorer = neverScorer();
    else if (values.triage === "always") scorer = alwaysScorer();
    else if (values.triage === "kind") scorer = kindScorer();
    else if (values.triage === "gated") scorer = null;
    // Lead ruling 1 (v3): the Jev scorer stays in the code (jevTriageScorer) but is not hooked up for the gated kinds.
    else if (values.triage === "jev") throw new Error("--triage jev is unhooked (jev-triage.md §7): the gated set equals the probe's positives; use --triage gated");
    else throw new Error("--triage must be off, gated, never, always or kind");
    void jevTriageScorer;
  }
}
// Ablation support (v2): reuse a recorded triage run's scores and brain answers by inputHash; a miss calls live.
let triageCacheHits = 0; let brainCacheHits = 0;
if (values["triage-cache"] && brain && !triageReplay) {
  const rows: TriageEntry[] = readFileSync(join(resolve(values["triage-cache"]), "triage.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const scores = new Map(rows.filter((r) => r.triage.scoreOutcome === "model").map((r) => [r.triage.inputHash, r.triage.noul]));
  const answers = new Map(rows.filter((r) => r.brain && (r.brain.fallbackReason === null || r.brain.fallbackReason === "illegal")).map((r) => [r.brain!.inputHash, r.brain!.raw]));
  const liveScorer = scorer; const liveBrain = brain;
  if (liveScorer) scorer = { name: liveScorer.name, model: liveScorer.model, score(q) { const hit = scores.get(sha256(canonicalJson(q))); if (hit !== undefined) { triageCacheHits++; return { noul: hit, latencyMs: 0 }; } return liveScorer.score(q); } };
  brain = { name: liveBrain.name, model: liveBrain.model, escalate(q) { const hit = answers.get(sha256(canonicalJson(q))); if (hit !== undefined) { brainCacheHits++; return { raw: hit, latencyMs: 0 }; } return liveBrain.escalate(q); } };
}
// Ablation: these kinds escalate as usual but the brain keeps the default (no call).
const defaultKinds = new Set((values["brain-default-kinds"] ?? "").split(",").filter(Boolean));
if (defaultKinds.size && brain && !triageReplay) {
  const inner = brain;
  brain = { name: inner.name, model: inner.model, escalate(q) { return defaultKinds.has(q.kind) ? { raw: JSON.stringify({ choice: q.defaultChoice }), latencyMs: 0 } : inner.escalate(q); } };
}
const ai: TickAiOptions = {
  ...(picker ? { picker } : {}), ...(social ? { social } : {}), pickerCap: maxCalls, ...(pickerFactions ? { pickerFactions, wgPickerCap: wgMaxCalls } : {}), ...(values.actors === "all" ? { pickerActors: "all" as const } : {}),
  ...(triageOn && brain ? { triage: { brain, ...(scorer ? { scorer } : {}), ...(values["brain-prior"] ? { prior: Number(values["brain-prior"]) } : {}), ...(values["brain-weight"] ? { weight: Number(values["brain-weight"]) } : {}), scoreCap: triageMaxCalls, ...(triageBudget !== undefined ? { budget: triageBudget } : {}) } } : {}),
};

const world = createPrototypeWorld(seed);
const eventsPath = join(output, "events.jsonl");
const pickerPath = join(output, "picker.jsonl");
writeFileSync(eventsPath, ""); writeFileSync(pickerPath, "");
const records: ActionPickerRecord[] = [];
const reads: SocialReadRecord[] = [];
const lastLoyalty = new Map<string, SocialReadRecord["loyalty"]>();
let loyaltyPicks = 0;
const triagePath = join(output, "triage.jsonl");
writeFileSync(triagePath, "");
const triages: TriageEntry[] = [];
let events = 0;
for (let index = 0; index < ticks; index += 1) {
  const result = runTick(world, { ...(picker || triageOn ? { exileRecovery, ai } : { exileRecovery }), ...(alliances ? { alliances } : {}) });
  if (ai.triageLog?.length) { const drained = ai.triageLog.splice(0); triages.push(...drained); appendFileSync(triagePath, drained.map((t) => JSON.stringify(t)).join("\n") + "\n"); }
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
function triageSummary() {
  const escalated = triages.filter((t) => t.triage.escalated);
  const brains = escalated.map((t) => t.brain!).filter(Boolean);
  const last = new Map<string, number>(); let cooldownBreaks = 0;
  for (const t of escalated) { const was = last.get(t.actorId); if (was !== undefined && t.tick - was < 24) cooldownBreaks += 1; last.set(t.actorId, t.tick); }
  const tally = (rows: TriageEntry[], key: (t: TriageEntry) => string) => rows.reduce<Record<string, number>>((acc, t) => { acc[key(t)] = (acc[key(t)] ?? 0) + 1; return acc; }, {});
  return {
    triaged: triages.length, scoreCalls: ai.triageCalls ?? 0, scoreFallbacks: tally(triages.filter((t) => t.triage.scoreOutcome !== "model"), (t) => t.triage.scoreOutcome),
    flaggedDecisions: triages.filter((t) => t.triage.flagged.length > 0).length, escalations: escalated.length, budget: TRIAGE_BUDGET,
    skippedCooldown: triages.filter((t) => t.triage.skipped === "cooldown").length, skippedBudget: triages.filter((t) => t.triage.skipped === "budget").length,
    perKind: Object.fromEntries(TRIAGE_KINDS.map((kind) => { const rows = triages.filter((t) => t.triage.kind === kind); return [kind, { triaged: rows.length, flagged: rows.filter((t) => t.triage.flagged.length).length, escalated: rows.filter((t) => t.triage.escalated).length }]; })),
    escalationsByKindRole: tally(escalated, (t) => `${t.triage.kind}/${t.triage.actorRole}`),
    triagedByKindRole: tally(triages, (t) => `${t.triage.kind}/${t.triage.actorRole}`),
    perTest: Object.fromEntries(TRIAGE_TESTS.map((test) => [test, { flagged: triages.filter((t) => t.triage.flagged.includes(test)).length, escalated: escalated.filter((t) => t.triage.flagged.includes(test)).length }])),
    brainModel: brains.filter((b) => b.outcome === "model").length,
    brainFallbacks: Object.fromEntries(["timeout", "error", "illegal", "cap"].map((r) => [r, brains.filter((b) => b.fallbackReason === r).length])),
    brainAgrees: brains.filter((b) => b.choice === b.pickerSampled).length,
    brainOverrides: brains.filter((b) => b.choice !== b.pickerSampled).length,
    brainOverridesByKind: tally(escalated.filter((t) => t.brain && t.brain.choice !== t.brain.pickerSampled), (t) => `${t.triage.kind}: ${t.triage.defaultChoice} -> ${t.brain!.choice}`),
    brainDiffersShare: brains.length ? Math.round((brains.filter((b) => b.choice !== b.pickerSampled).length / brains.length) * 1e4) / 1e4 : 0,
    brainRailBreaks: escalated.filter((t) => !t.brain || t.applied !== t.brain.choice || !t.triage.legal.includes(t.applied)).length,
    defaultBreaks: triages.filter((t) => !t.triage.escalated && t.applied !== t.triage.defaultChoice).length,
    cooldownBreaks,
    brainCalls: ai.brainCalls ?? 0, brainSpendUsd: brainLedger.spendUsd, brainCostLines: brainLedger.lines.length,
    triageSpendUsd: triageLedger.spendUsd, triageCostLines: triageLedger.lines.length,
    cacheHits, cacheMisses, triageCacheHits, brainCacheHits, brainDefaultKinds: [...defaultKinds],
    brainProceedMean: brains.filter((b) => b.p !== null).length ? Math.round(brains.filter((b) => b.p !== null).reduce((a, b) => a + b.p!, 0) / brains.filter((b) => b.p !== null).length * 1e4) / 1e4 : null,
    brainBlendMean: brains.filter((b) => b.blend !== null).length ? Math.round(brains.filter((b) => b.blend !== null).reduce((a, b) => a + b.blend!, 0) / brains.filter((b) => b.blend !== null).length * 1e4) / 1e4 : null,
    overrideRate: brains.length ? Math.round(brains.filter((b) => b.choice !== b.pickerSampled).length / brains.length * 1e4) / 1e4 : null,
    flagRatePerKind: Object.fromEntries(TRIAGE_KINDS.map((kind) => { const rows = triages.filter((t) => t.triage.kind === kind); return [kind, rows.length ? Math.round(rows.filter((t) => t.triage.flagged.length).length / rows.length * 1e4) / 1e4 : null]; })),
    escalationsByKind: Object.fromEntries(TRIAGE_KINDS.map((kind) => [kind, escalated.filter((t) => t.triage.kind === kind).length])),
  };
}
const count = (fn: (r: ActionPickerRecord) => boolean) => records.filter(fn).length;
const summary = {
  exileRecovery,
  ...(alliances ? { alliances } : {}),
  mode: recorded ? "replay" : values.picker, social: socialOn ? values.social : null, seed, ticks, maxCalls, capUsd, actors: values.actors ?? null, stateHash: finalHash, events,
  consults: records.length, calls: ai.pickerCalls ?? 0, offScorer: count((r) => r.sampled !== r.scorerPick),
  fallbacks: count((r) => r.outcome === "fallback"),
  fallbackReasons: Object.fromEntries(["timeout", "error", "illegal", "cap"].map((reason) => [reason, count((r) => r.fallbackReason === reason)])),
  railBreaks: count((r) => !r.legal.includes(r.sampled)), truncated: count((r) => r.truncated),
  spendUsd: ledger.spendUsd, costLines: ledger.lines.length,
  ...(pickerFactions ? { pickerFactions, wgMaxCalls } : {}),
  ...(wgOn ? (() => { const wg = records.map((r) => (r as ActionPickerRecord & { wg?: WgNudge }).wg).filter((w): w is WgNudge => !!w); return {
    wgConsults: wg.length, wgCalls: ai.wgPickerCalls ?? 0, wgByRole: { holder: wg.filter((w) => w.role === "holder").length, governor: wg.filter((w) => w.role === "governor").length },
    wgModel: wg.filter((w) => w.p !== null).length, wgOverrides: wg.filter((w) => !w.kept).length,
    wgMeanP: wg.some((w) => w.p !== null) ? Math.round(wg.filter((w) => w.p !== null).reduce((a, w) => a + w.p!, 0) / wg.filter((w) => w.p !== null).length * 1e4) / 1e4 : null,
  }; })() : {}),
  ...(triageOn ? { triage: values.triage, brain: recorded ? "replay" : values.brain, triageMaxCalls, triageBudget: triageBudget ?? null, cache: values.cache ?? null, totalSpendUsd: ledger.spendUsd + brainLedger.spendUsd + triageLedger.spendUsd, triageSummary: triageSummary() } : {}),
  ...(socialOn ? {
    reads: reads.length, readHits: reads.filter((r) => r.hit).length, readMisses: reads.filter((r) => !r.hit).length,
    readFallbacks: Object.fromEntries(["timeout", "error", "illegal", "cap"].map((reason) => [reason, reads.filter((r) => !r.hit && r.fallbackReason === reason).length])),
    consultsWithoutRead: records.length - reads.length, loyaltyDrivenPicks: loyaltyPicks,
    costLinesByRole: Object.fromEntries(["picker.action", "picker.social"].map((role) => [role, ledger.lines.filter((l) => l.role === role).length])),
  } : {}),
};
if (recorded) {
  const result = {
    ...summary, replayOf: replayDir, fetchAttempts, recordedStateHash: recorded.summary.stateHash, hashMatches: finalHash === recorded.summary.stateHash,
    providerCalls: (picker as ActionPickerReplay).calls + (social instanceof SocialReplay ? social.calls : 0) + (triageReplay ? triageReplay.calls : 0), recordsUsed: (picker as ActionPickerReplay).used, recordsRecorded: (picker as ActionPickerReplay).size,
    ...(triageReplay ? { triageRecordsUsed: triageReplay.used, triageRecordsRecorded: triageReplay.size } : {}),
  };
  writeFileSync(join(output, "replay.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
  const triageOk = !triageReplay || triageReplay.used === triageReplay.size;
  const pickerOk = !(picker instanceof ActionPickerReplay) || picker.used === picker.size;
  process.exit(result.hashMatches && result.providerCalls === 0 && fetchAttempts === 0 && pickerOk && triageOk ? 0 : 1);
}
writeFileSync(join(output, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary));
