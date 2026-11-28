// Pin check: t72 / t1200 stateHash (first 8 hex) for flag-off {} and ATLS on seeds 1847, 2718, 4096, plus whole-log replay exactness.
// Usage: node --experimental-strip-types docs/design/engine-hygiene/pins.ts [label]
// Env: SEEDS=1847,2718,4096 TICKS=1200
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { stateHash } from "../../../src/sim/state.ts";
import { replayWithSilentStarts } from "../../../src/sim/tick-start.ts";
import type { SimEvent } from "../../../src/sim/types.ts";

export const CONFIGS: Record<string, Record<string, unknown>> = {
  "flag-off": {},
  atls: { alliances: true, portTransfer: true, lifecycle: true, secessionAftermath: true },
};
const label = process.argv[2] ?? "";
const seeds = (process.env.SEEDS ?? "1847,2718,4096").split(",").map(Number);
const ticks = Number(process.env.TICKS ?? 1200);
for (const [cfg, opts] of Object.entries(CONFIGS)) for (const seed of seeds) {
  const w = createPrototypeWorld(seed);
  const log: SimEvent[] = [];
  let h72 = "";
  for (let i = 1; i <= ticks; i++) {
    log.push(...runTick(w, { ...opts }).events);
    if (i === 72) h72 = stateHash(w).slice(0, 8);
  }
  const rep = createPrototypeWorld(seed);
  replayWithSilentStarts(rep, log);
  console.log(JSON.stringify({ label, cfg, seed, h72, h1200: stateHash(w).slice(0, 8), events: log.length, replayExact: stateHash(rep) === stateHash(w) }));
}
