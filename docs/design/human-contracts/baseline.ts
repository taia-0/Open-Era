// Baseline on an unpatched tree: pins (h72, h1200) and the event census the human-contracts spec cites.
// Usage: SEEDS=… node --experimental-strip-types docs/design/human-contracts/baseline.ts '<TickOptions JSON>'
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { stateHash } from "../../../src/sim/state.ts";
const opts = JSON.parse(process.argv[2] ?? "{}");
const ticks = Number(process.env.TICKS ?? 1200);
const seeds = (process.env.SEEDS ?? "1847,2718,4096,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000").split(",").map(Number);
for (const seed of seeds) {
  const w = createPrototypeWorld(seed);
  let h72 = "";
  for (let i = 0; i < ticks; i++) { runTick(w, { ...opts }); if (w.tick === 72) h72 = stateHash(w).slice(0, 8); }
  console.log(JSON.stringify({ seed, h72, h1200: stateHash(w).slice(0, 8), tick: w.tick }));
}
