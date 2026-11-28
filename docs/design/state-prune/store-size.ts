// Measure a real WorldStore (SQLite) at TICKS. Offline, $0.
// Usage: node --experimental-strip-types docs/design/state-prune/store-size.ts <label> '<TickOptions JSON>'
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTick } from "../../../src/sim/engine.ts";
import { WorldStore } from "../../../src/sim/persistence.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { stateHash } from "../../../src/sim/state.ts";

const [label, optsJson] = process.argv.slice(2);
const opts = JSON.parse(optsJson ?? "{}");
const ticks = Number(process.env.TICKS ?? 1200);
const seeds = (process.env.SEEDS ?? "1847,2718,4096").split(",").map(Number);

for (const seed of seeds) {
  const dir = mkdtempSync(join(tmpdir(), "oe-store-"));
  const path = join(dir, "world.sqlite");
  const store = new WorldStore(path);
  const world = createPrototypeWorld(seed);
  store.initialize(world);
  const started = Date.now();
  for (let i = 0; i < ticks; i++) {
    const result = runTick(world, { ...opts });
    store.appendTick(result.events, world);
  }
  store.close();
  const st = statSync(path);
  // page counts via sqlite pragma through a fresh store
  const reopened = new WorldStore(path);
  const snapCount = reopened.snapshotCount();
  const evCount = (reopened.database.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number }).n;
  const evPages = (reopened.database.prepare("SELECT SUM(LENGTH(data_json)) AS n FROM events").get() as { n: number }).n;
  const snapPages = (reopened.database.prepare("SELECT SUM(LENGTH(state_json)) AS n FROM snapshots").get() as { n: number }).n;
  const snapMin = (reopened.database.prepare("SELECT MIN(LENGTH(state_json)) AS n FROM snapshots").get() as { n: number }).n;
  const snapMax = (reopened.database.prepare("SELECT MAX(LENGTH(state_json)) AS n FROM snapshots").get() as { n: number }).n;
  reopened.close();
  console.log(JSON.stringify({
    label, seed, ticks, hash8: stateHash(world).slice(0, 8),
    dbBytes: st.size, snapshots: snapCount, events: evCount,
    eventDataBytes: evPages, snapshotStateBytes: snapPages,
    snapshotStateMin: snapMin, snapshotStateMax: snapMax,
    elapsedMs: Date.now() - started,
  }));
  rmSync(dir, { recursive: true, force: true });
}
