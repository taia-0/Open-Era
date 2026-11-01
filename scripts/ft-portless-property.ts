// Property check for the port-balance change (home starts, Cinder Key fortification 1.5).
// Runs 13 seeds for 1,200 ticks with AI off and records the first tick on which Free Tide holds no port
// (world tick after the tick that took its last port; 1201 means never portless).
// Passes when the median first FT-portless tick is later than main's median (50) AND
// it is later than main's per-seed value on at least 9 of 13 seeds.
// Main's values were measured on origin/main 7515445 with the same definition.
import { runTick } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";

const TICKS = 1200;
const MAIN: Record<number, number> = {
  1847: 64, 2718: 49, 4096: 49, 1000: 37, 2000: 78, 3000: 34, 4000: 41,
  5000: 335, 6000: 81, 7000: 609, 8000: 452, 9000: 43, 10000: 50,
};
const MAIN_MEDIAN = 50;
const REQUIRED_LATER = 9;

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const rows: Array<{ seed: number; main: number; now: number; later: boolean }> = [];
for (const seed of Object.keys(MAIN).map(Number)) {
  const world = createPrototypeWorld(seed);
  const ftPorts = () => Object.values(world.settlements).filter((s) => s.factionId === "free-tide").length;
  let first = TICKS + 1;
  for (let i = 0; i < TICKS; i += 1) {
    runTick(world);
    if (ftPorts() === 0) { first = world.tick; break; }
  }
  rows.push({ seed, main: MAIN[seed], now: first, later: first > MAIN[seed] });
}
for (const row of rows) console.log(`seed ${row.seed}: main ${row.main}, now ${row.now > TICKS ? "never" : row.now}${row.later ? " (later)" : ""}`);
const med = median(rows.map((row) => row.now));
const later = rows.filter((row) => row.later).length;
console.log(`FT first portless: median ${med} (main ${MAIN_MEDIAN}), later on ${later}/${rows.length} seeds`);
if (!(med > MAIN_MEDIAN && later >= REQUIRED_LATER)) {
  console.error(`FT-portless property failed: need median > ${MAIN_MEDIAN} and later on >= ${REQUIRED_LATER} seeds`);
  process.exit(1);
}
console.log("FT-portless property passed");
