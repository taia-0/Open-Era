import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { runTick } from "../sim/engine.ts";
import { DeterministicDialogueProvider, resolveDueReplies } from "../sim/conversations.ts";
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
    // EXILE_RECOVERY (next-dynamic-slice.md slice A): off unless this flag or EXILE_RECOVERY=1 is set.
    "exile-recovery": { type: "boolean", default: false },
  },
});
const exileRecovery = values["exile-recovery"] === true || process.env.EXILE_RECOVERY === "1";

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

  const dialogueProvider = new DeterministicDialogueProvider();
  for (let index = 0; index < ticks; index += 1) {
    const result = runTick(world, exileRecovery ? { exileRecovery: true } : {});
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
} finally {
  store.close();
}
