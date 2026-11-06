import { appendFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { EXILE_FLAG_OPTIONS, maybeHelp, resolveExileRecovery } from "./exile-flag.ts";
import { ALLIANCES_FLAG_HELP, ALLIANCES_FLAG_OPTIONS, resolveAlliances } from "./alliances-flag.ts";
import { PORT_TRANSFER_FLAG_HELP, PORT_TRANSFER_FLAG_OPTIONS, resolvePortTransfer } from "./port-transfer-flag.ts";
import { LIFECYCLE_FLAG_HELP, LIFECYCLE_FLAG_OPTIONS, resolveLifecycle } from "./lifecycle-flag.ts";
import { FEED_REASONS_FLAG_HELP, FEED_REASONS_FLAG_OPTIONS, resolveFeedReasons } from "./feed-reasons-flag.ts";
import { parseArgs } from "node:util";
import { CostLedger } from "../sim/ai-vendor/cost.ts";
import { workerTransport } from "../sim/ai-vendor/sync-http.ts";
import { runTick } from "../sim/engine.ts";
import { DeterministicDialogueProvider, resolveDueReplies } from "../sim/conversations.ts";
import {
  deepSeekFeedReasonWriter, feedReasonCallCap, FEED_REASON_CAP_USD, type FeedReasonOptions,
} from "../sim/feed-reasons.ts";
import { WorldStore } from "../sim/persistence.ts";
import { writeReports } from "../sim/reports.ts";
import { createPrototypeWorld } from "../sim/scenario.ts";
import { stateHash } from "../sim/state.ts";

const { values } = parseArgs({
  options: {
    ticks: { type: "string", short: "t", default: "72" },
    seed: { type: "string", short: "s", default: "1847" },
    database: { type: "string", short: "d", default: ".open-era/world.sqlite" },
    output: { type: "string", short: "o", default: "simulation-output/latest" },
    reset: { type: "boolean", default: false },
    // EXILE_RECOVERY (after-triage.md (b)): on by default; --no-exile-recovery or EXILE_RECOVERY=0 opts out.
    ...EXILE_FLAG_OPTIONS,
    ...ALLIANCES_FLAG_OPTIONS,
    ...PORT_TRANSFER_FLAG_OPTIONS,
    ...LIFECYCLE_FLAG_OPTIONS,
    // feedReasons: on by default (Micah 2026-11-06); --no-feed-reasons or FEED_REASONS=0 opts out.
    ...FEED_REASONS_FLAG_OPTIONS,
  },
});
maybeHelp(
  values,
  "npm run simulate -- [--ticks N] [--seed N] [--database path] [--output dir] [--reset] [--alliances] [--port-transfer] [--lifecycle]",
  [ALLIANCES_FLAG_HELP, PORT_TRANSFER_FLAG_HELP, LIFECYCLE_FLAG_HELP, FEED_REASONS_FLAG_HELP],
);
const exileRecovery = resolveExileRecovery(values);
const alliances = resolveAlliances(values);
const portTransfer = resolvePortTransfer(values);
const lifecycle = resolveLifecycle(values);
const feedReasonsOn = resolveFeedReasons(values);

const ticks = Number.parseInt(values.ticks!, 10);
const seed = Number.parseInt(values.seed!, 10);
if (!Number.isSafeInteger(ticks) || ticks < 0) throw new Error("--ticks must be a non-negative integer");
if (!Number.isSafeInteger(seed)) throw new Error("--seed must be an integer");

const databasePath = resolve(values.database!);
const outputPath = resolve(values.output!);
if (values.reset && existsSync(databasePath)) rmSync(databasePath);
if (values.reset && existsSync(`${databasePath}-shm`)) rmSync(`${databasePath}-shm`);
if (values.reset && existsSync(`${databasePath}-wal`)) rmSync(`${databasePath}-wal`);

const store = new WorldStore(databasePath);
let world;
let replayedEvents = 0;
let resumed = false;

try {
  if (store.hasWorld()) {
    const recovery = store.recover();
    world = recovery.state;
    replayedEvents = recovery.replayedEvents;
    resumed = true;
  } else {
    world = createPrototypeWorld(seed);
    store.initialize(world);
  }

  let feedReasons: FeedReasonOptions | false = false;
  if (feedReasonsOn) {
    mkdirSync(outputPath, { recursive: true });
    const costPath = join(outputPath, "cost.jsonl");
    rmSync(costPath, { force: true });
    const ledger = new CostLedger(FEED_REASON_CAP_USD, (line) => appendFileSync(costPath, `${JSON.stringify(line)}\n`));
    feedReasons = {
      writer: deepSeekFeedReasonWriter({ transport: workerTransport(), ledger }),
      callCap: feedReasonCallCap(exileRecovery),
      exileRecovery,
    };
  }

  const dialogueProvider = new DeterministicDialogueProvider();
  for (let index = 0; index < ticks; index += 1) {
    const result = runTick(world, {
      exileRecovery,
      ...(alliances ? { alliances } : {}),
      ...(portTransfer ? { portTransfer } : {}),
      ...(lifecycle ? { lifecycle } : {}),
      ai: { feedReasons },
    });
    const conversationEvents = await resolveDueReplies(world, dialogueProvider);
    store.appendTick([...result.events, ...conversationEvents], world);
  }

  const events = store.allEvents();
  writeReports(outputPath, world, events, store.snapshotCount());

  console.log(`Open Era ${resumed ? "resumed" : "created"}: ${world.scenario}`);
  console.log(`Advanced ${ticks} ticks to tick ${world.tick} (${(world.tick / world.ticksPerDay).toFixed(1)} days)`);
  console.log(`Persisted ${store.eventCount()} events across ${store.snapshotCount()} snapshots`);
  if (resumed) console.log(`Recovery replayed ${replayedEvents} events after the latest snapshot`);
  console.log(`State hash: ${stateHash(world)}`);
  console.log(`Reports: ${outputPath}`);
  if (feedReasonsOn && feedReasons) {
    console.log(`Feed reasons: on (calls ${feedReasons.calls ?? 0}, cap ${feedReasons.callCap})`);
  } else {
    console.log("Feed reasons: off");
  }
} finally {
  store.close();
}
