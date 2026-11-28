// Pins at t72 / t1200 on 1847, 2718, 4096, flag-off and ATLS, plus a
// whole-log replay check (state-prune method) at t1200.
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { stateHash } from "../../../src/sim/state.ts";
import { replayWithSilentStarts } from "../../../src/sim/tick-start.ts";
import type { SimEvent } from "../../../src/sim/types.ts";
const configs: Record<string, object> = { "flag-off": {}, ATLS: { alliances: true, lifecycle: true, portTransfer: true, secessionAftermath: true } };
for (const [label, opts] of Object.entries(configs)) for (const seed of [1847, 2718, 4096]) {
  const w = createPrototypeWorld(seed); const log: SimEvent[] = []; let h72 = "";
  for (let i = 0; i < 1200; i++) { log.push(...runTick(w, { ...opts }).events); if (w.tick === 72) h72 = stateHash(w).slice(0, 8); }
  const r = createPrototypeWorld(seed); replayWithSilentStarts(r, log);
  console.log(JSON.stringify({ label, seed, t72: h72, t1200: stateHash(w).slice(0, 8), replayExact: stateHash(r) === stateHash(w) }));
}
