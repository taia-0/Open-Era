// Pins under the docked rule (apply docked.patch, optionally the protection-pact fix). Offline, $0.
// Prints 72/1200 hashes (first 8 hex) on 1847/2718/4096 for off, ATL, ATLS, plus a picker-on stub hash (WG, stubUniform) at 400 ticks.
import { stubUniformPicker } from "../../../src/sim/ai-action-picker.ts";
import { WG_FACTION_ID } from "../../../src/sim/ai-wg-picker.ts";
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { stateHash } from "../../../src/sim/state.ts";
const C: Record<string, object> = { off: {}, ATL: { alliances: true, portTransfer: true, lifecycle: true }, ATLS: { alliances: true, portTransfer: true, lifecycle: true, secessionAftermath: true } };
for (const [k, o] of Object.entries(C)) for (const seed of [1847, 2718, 4096]) {
  const w = createPrototypeWorld(seed); let h72 = "";
  for (let i = 0; i < 1200; i++) { runTick(w, { ...o }); if (i === 71) h72 = stateHash(w).slice(0, 8); }
  const s = createPrototypeWorld(seed); let recs = 0;
  for (let i = 0; i < 400; i++) for (const e of runTick(s, { ...o, ai: { picker: stubUniformPicker(), pickerFactions: [WG_FACTION_ID] } }).events) if ((e.data as { ai?: { picker?: { wg?: unknown } } })?.ai?.picker?.wg) recs++;
  console.log(JSON.stringify({ config: k, seed, h72, h1200: stateHash(w).slice(0, 8), stub400: stateHash(s).slice(0, 8), stub400Consults: recs }));
}
