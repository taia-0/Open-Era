// WorldStore recovery across the diverging morning: run SEED under OPTS for
// each STOP tick through a fresh SQLite store (appendTick per tick, as the
// dashboard does), then recover() and compare with the live world.
// Usage: SEED=10000 STOPS=1621,1622 node --experimental-strip-types docs/design/replay-divergence/store-recover.ts '<TickOptions JSON>'
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { stateHash } from "../../../src/sim/state.ts";
import { WorldStore } from "../../../src/sim/persistence.ts";
const opts = JSON.parse(process.argv[2] ?? "{}");
const seed = Number(process.env.SEED ?? 10000);
const stops = (process.env.STOPS ?? "1621").split(",").map(Number);
const dir = mkdtempSync(join(tmpdir(), "rd-store-"));
const world = createPrototypeWorld(seed);
const store = new WorldStore(join(dir, "w.sqlite"));
store.initialize(world);
const max = Math.max(...stops);
for (let i = 0; i < max; i++) {
  store.appendTick(runTick(world, { ...opts }).events, world);
  if (stops.includes(world.tick)) {
    const r = store.recover();
    const diff = Object.entries(world.characters).filter(([id, c]) => c.shortMorningStreak !== r.state.characters[id]?.shortMorningStreak).map(([id, c]) => `${id}.shortMorningStreak live=${c.shortMorningStreak} recovered=${r.state.characters[id]?.shortMorningStreak}`);
    console.log(JSON.stringify({ seed, tick: world.tick, snapshotSequence: r.snapshotSequence, replayedEvents: r.replayedEvents, exact: stateHash(r.state) === stateHash(world), diff }));
  }
}
rmSync(dir, { recursive: true, force: true });
