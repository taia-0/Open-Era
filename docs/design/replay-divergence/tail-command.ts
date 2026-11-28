// A log that ends with a command submitted after the last tick (what a store
// holds right after POST /api/commands). Replay must not run the next morning.
// Usage: SEEDS=... TICKS=... node --experimental-strip-types docs/design/replay-divergence/tail-command.ts
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { stateHash } from "../../../src/sim/state.ts";
import { replayWithSilentStarts } from "../../../src/sim/tick-start.ts";
import { submitCommand } from "../../../src/sim/commands.ts";
import type { SimEvent } from "../../../src/sim/types.ts";
const seeds = (process.env.SEEDS ?? "1847,2718,4096").split(",").map(Number);
const ticksList = (process.env.TICKS ?? "60,600,1200").split(",").map(Number);
for (const seed of seeds) for (const ticks of ticksList) {
  const w = createPrototypeWorld(seed, { playerCharacterId: "character-01" });
  const playerId = Object.keys(w.players)[0];
  const log: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) log.push(...runTick(w, {}).events);
  let submitted = "none";
  for (const carrier of ["character-02", "character-07", "character-12", "character-17"]) {
    const res = submitCommand(w, { playerId, type: "offer-contract", characterId: carrier, quantity: 10, destinationId: "crown-harbor", price: 18, expiresInTicks: 12 } as any);
    if (res.ok) { log.push(structuredClone(res.event)); submitted = carrier; break; }
  }
  const r = createPrototypeWorld(seed, { playerCharacterId: "character-01" });
  replayWithSilentStarts(r, log);
  console.log(JSON.stringify({ seed, ticks, morning: w.tick % w.ticksPerDay === 0, submitted, exact: stateHash(r) === stateHash(w) }));
}
