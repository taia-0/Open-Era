import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { EXILE_FLAG_OPTIONS, maybeHelp, resolveExileRecovery } from "./exile-flag.ts";
import { parseArgs } from "node:util";
import { publicFeedSentence } from "../dashboard/wording.ts";
import { CostLedger } from "../sim/ai-vendor/cost.ts";
import { workerTransport } from "../sim/ai-vendor/sync-http.ts";
import { runTick } from "../sim/engine.ts";
import {
  deepSeekFeedReasonWriter, feedReasonCallCap, FEED_REASON_CAP_USD, feedReasonKind, jevFeedReasonChecker,
  stubFeedReasonWriter, withFeedReason, type FeedReasonOptions, type FeedReasonRecord, type FeedReasonWriter,
} from "../sim/feed-reasons.ts";
import { createPrototypeWorld } from "../sim/scenario.ts";
import { stateHash } from "../sim/state.ts";
import type { SimEvent } from "../sim/types.ts";

/**
 * Slice B runner (feed-reasons.md). Stub writer by default, offline. `--ai-vendor`
 * uses DeepSeek (plus the advisory Jev check with `--check`, off by default) (Micah's standing approval; caps
 * $0.10, and 200 brain calls or 300 with EXILE_RECOVERY on (the default); the Jev check stays at 200). `--replay <dir>` reuses the recorded text with the
 * network disabled and checks the feed text and hash are byte-identical.
 * Keys come from the environment only and are never printed.
 */
const { values } = parseArgs({
  options: {
    seed: { type: "string", default: "1847" },
    ticks: { type: "string", default: "1200" },
    "ai-vendor": { type: "boolean", default: false },
    check: { type: "boolean", default: false },
    "cap-usd": { type: "string", default: String(FEED_REASON_CAP_USD) },
    "max-calls": { type: "string" },
    ...EXILE_FLAG_OPTIONS,
    output: { type: "string" },
    replay: { type: "string" },
  },
});
maybeHelp(values, "npm run feed-reasons -- [--seed N] [--ticks N] [--ai-vendor] [--check] [--max-calls N] [--output dir] [--replay <dir>]");
const replayDir = values.replay === undefined ? null : resolve(values.replay);
let recorded: { seed: number; ticks: number; stateHash: string; exileRecovery: boolean } | null = null;
let replayMap: Map<number, FeedReasonRecord> | undefined;
if (replayDir) {
  if (values["ai-vendor"]) throw new Error("--replay runs offline");
  globalThis.fetch = (() => { throw new Error("network is disabled during --replay"); }) as typeof fetch;
  recorded = JSON.parse(readFileSync(join(replayDir, "summary.json"), "utf8"));
  values.seed = String(recorded!.seed); values.ticks = String(recorded!.ticks); values["no-exile-recovery"] = recorded!.exileRecovery === false;
  replayMap = new Map(readFileSync(join(replayDir, "reasons.jsonl"), "utf8").trim().split("\n").filter(Boolean)
    .map((line) => JSON.parse(line) as { sequence: number; reason: FeedReasonRecord }).map((row) => [row.sequence, row.reason]));
}
const seed = Number.parseInt(values.seed!, 10);
const ticks = Number.parseInt(values.ticks!, 10);
const vendor = values["ai-vendor"] === true;
// after-triage.md (b): on by default; --no-exile-recovery or EXILE_RECOVERY=0 opts out.
const exileRecovery = resolveExileRecovery(values);
const output = resolve(values.output ?? (replayDir ? join(replayDir, "replay") : join("simulation-output", "feed-reasons", `${vendor ? "vendor" : "stub"}-${seed}-${ticks}`)));
mkdirSync(output, { recursive: true });
const costPath = join(output, "cost.jsonl");
rmSync(costPath, { force: true });
const ledger = new CostLedger(Number(values["cap-usd"]), (line) => appendFileSync(costPath, `${JSON.stringify(line)}\n`));

let vendorCalls = 0;
const blocked: FeedReasonWriter = { model: "replay", write() { vendorCalls += 1; throw new Error("replay must not call a writer"); } };
const transport = vendor ? workerTransport() : null;
const feedReasons: FeedReasonOptions = {
  writer: replayDir ? blocked : vendor ? deepSeekFeedReasonWriter({ transport: transport!, ledger }) : stubFeedReasonWriter(),
  ...(vendor && values.check ? { check: true, checker: jevFeedReasonChecker({ transport: transport!, ledger }) } : {}),
  callCap: values["max-calls"] ? Number.parseInt(values["max-calls"], 10) : feedReasonCallCap(exileRecovery),
  exileRecovery,
  ...(replayMap ? { replay: replayMap } : {}),
};

const world = createPrototypeWorld(seed);
const headline: SimEvent[] = [];
for (let index = 0; index < ticks; index += 1) {
  const result = runTick(world, { exileRecovery, ai: { feedReasons } });
  for (const event of result.events) if (feedReasonKind(event)) headline.push(event);
}
const finalHash = stateHash(world);
const reasons = headline.map((event) => ({ sequence: event.sequence, tick: event.tick, type: event.type, reason: (event.data.ai as { reason: FeedReasonRecord }).reason }));
writeFileSync(join(output, "reasons.jsonl"), reasons.map((row) => JSON.stringify(row)).join("\n") + "\n");
const feed = headline.map((event) => `t${event.tick} ${withFeedReason(publicFeedSentence(world, event), event)}`).join("\n") + "\n";
writeFileSync(join(output, "feed.txt"), feed);

const count = (pred: (r: FeedReasonRecord) => boolean) => reasons.filter((row) => pred(row.reason)).length;
const byFallback: Record<string, number> = {};
for (const row of reasons) if (row.reason.fallbackReason) byFallback[row.reason.fallbackReason] = (byFallback[row.reason.fallbackReason] ?? 0) + 1;
const byKind: Record<string, number> = {};
for (const event of headline) { const k = feedReasonKind(event)!; byKind[k] = (byKind[k] ?? 0) + 1; }
const checked = reasons.filter((row) => row.reason.check?.outcome === "model");
const summary = {
  mode: replayDir ? "replay" : vendor ? "vendor" : "stub", seed, ticks, exileRecovery, stateHash: finalHash,
  events: headline.length, byKind, model: count((r) => r.outcome === "model"), cached: count((r) => r.outcome === "cached"),
  fallback: count((r) => r.outcome === "fallback"), byFallback,
  writerCalls: replayDir ? vendorCalls : feedReasons.calls ?? 0, checks: feedReasons.checks ?? 0,
  checkFlagged: checked.filter((row) => row.reason.check!.flagged).length,
  checkMaxNoul: checked.reduce((m, row) => Math.max(m, row.reason.check!.noul ?? 0), 0),
  spendUsd: Number(ledger.spendUsd.toFixed(6)), costLines: ledger.lines.length,
  homeRaidTriggers: headline.filter((event) => feedReasonKind(event) === "raid" && reasons.find((r) => r.sequence === event.sequence)?.reason.text?.includes("win back")).length,
};
if (replayDir && recorded) {
  const recordedFeed = readFileSync(join(replayDir, "feed.txt"), "utf8");
  const result = { ...summary, recordedStateHash: recorded.stateHash, hashMatches: finalHash === recorded.stateHash, feedMatches: feed === recordedFeed, vendorCalls };
  writeFileSync(join(output, "replay.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
  process.exit(result.hashMatches && result.feedMatches && vendorCalls === 0 ? 0 : 1);
}
writeFileSync(join(output, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary));
