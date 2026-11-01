// WG picker acceptance (docs/design/wg-jev-picker.md "Acceptance" 1–3), offline, no vendor call:
//  1. flag off and the default reproduce the default pins (72 and 1,200 ticks), and `pickerFactions: ["free-tide"]`
//     equals an unset run with the same stub picker;
//  2. a stubUniform WG run replays exactly from its records with 0 provider calls;
//  3. a 13-seed stubUniform WG run (world-government only): secessions on ≥ 6 of 13 seeds; claims > 0 and port
//     changes > 0 on every seed; no wipeout that the flag-off run on the same seed does not have.
// Also: the holder path stays dormant (0 holder consults while the WG holder is the player).
// Item 4 (the capped live run) is run by hand; see progress.md.
//   node --experimental-strip-types scripts/wg-picker-sweep.ts [--seeds ...] [--ticks 1200] [--json out.json]
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { ActionPickerReplay, stubArgmaxPicker, stubUniformPicker, type ActionPicker, type ActionPickerRecord } from "../src/sim/ai-action-picker.ts";
import { WG_FACTION_ID, type WgNudge } from "../src/sim/ai-wg-picker.ts";
import { runTick, type TickAiOptions } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";
import { dynamismReadout } from "../src/tools/dynamism.ts";
import type { SimEvent, WorldState } from "../src/sim/types.ts";

const { values } = parseArgs({ options: { seeds: { type: "string", default: "1847,2718,4096,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000" }, ticks: { type: "string", default: "1200" }, json: { type: "string" } } });
const seeds = values.seeds!.split(",").map(Number);
const ticks = Number(values.ticks);
export const DEFAULT_PINS: Record<number, [string, string]> = { 1847: ["7f76e474", "94de9c02"], 2718: ["976c40bd", "7a3741c9"], 4096: ["08943ea5", "af6eeaea"] };
export const SECESSION_SEEDS_MIN = 6;

type Rec = { tick: number; actorId: string; picker: ActionPickerRecord & { wg?: WgNudge } };
function run(seed: number, n: number, ai?: TickAiOptions) {
  const world = createPrototypeWorld(seed);
  const events: SimEvent[] = []; const records: Rec[] = [];
  for (let i = 0; i < n; i++) for (const e of runTick(world, ai ? { ai } : {}).events) {
    events.push(e);
    const picker = (e.data as { ai?: { picker?: Rec["picker"] } } | undefined)?.ai?.picker;
    if (picker) records.push({ tick: e.tick, actorId: e.actorId!, picker });
  }
  return { world, events, records, hash: stateHash(world).slice(0, 8) };
}
const wipeouts = (world: WorldState) => ["world-government", "free-tide"].filter((f) => !Object.values(world.settlements).some((s) => s.factionId === f) && !Object.values(world.characters).some((c) => !c.dead && c.factionId === f));
const wg = (picker: ActionPicker): TickAiOptions => ({ picker, pickerFactions: [WG_FACTION_ID] });

// 1. Pins.
const pins: Record<string, { short: string; long: string; ok: boolean }> = {};
for (const [s, [p72, p1200]] of Object.entries(DEFAULT_PINS)) {
  const short = run(Number(s), 72).hash; const long = run(Number(s), 1200).hash;
  pins[s] = { short, long, ok: short === p72 && long === p1200 };
}
const ftUnset = run(1847, 300, { picker: stubArgmaxPicker() }).hash;
const ftExplicit = run(1847, 300, { picker: stubArgmaxPicker(), pickerFactions: ["free-tide"] }).hash;

// 2. Replay.
const recorded = run(1847, 600, wg(stubUniformPicker()));
const replayPicker = new ActionPickerReplay(recorded.records);
const replayed = run(1847, 600, wg(replayPicker));
const replay = { consults: recorded.records.length, hash: recorded.hash, replayHash: replayed.hash, providerCalls: replayPicker.calls, used: replayPicker.used, ok: replayed.hash === recorded.hash && replayPicker.calls === 0 && replayPicker.used === replayPicker.size };

// 3. 13-seed stub sweep.
const rows = seeds.map((seed) => {
  const off = run(seed, ticks); const on = run(seed, ticks, wg(stubUniformPicker()));
  const t0 = dynamismReadout(off.events).totals; const t1 = dynamismReadout(on.events).totals;
  const nudges = on.records.map((r) => r.picker.wg).filter((w): w is WgNudge => !!w);
  const row = { seed, offHash: off.hash, onHash: on.hash, claims: [off.events.filter((e) => e.type === "settlement-claimed").length, on.events.filter((e) => e.type === "settlement-claimed").length], portChanges: [t0.portOwnershipChanges, t1.portOwnershipChanges], secessions: [t0.secessions, t1.secessions],
    wipeouts: [wipeouts(off.world), wipeouts(on.world)], consults: nudges.length, holderConsults: nudges.filter((w) => w.role === "holder").length, overrides: nudges.filter((w) => !w.kept).length,
    nonWgConsults: on.records.filter((r) => !r.picker.wg).length };
  console.log(JSON.stringify(row));
  return row;
});
const checks = {
  "1_flagOffPins": Object.values(pins).every((p) => p.ok),
  "1_defaultFactionsByteIdentical": ftUnset === ftExplicit,
  "2_replayExactZeroCalls": replay.ok,
  "3_secessionSeeds_ge_6": rows.filter((r) => r.secessions[1] >= 1).length >= SECESSION_SEEDS_MIN,
  "3_livenessEverySeed": rows.every((r) => r.claims[1] > 0 && r.portChanges[1] > 0),
  "3_noNewWipeouts": rows.every((r) => r.wipeouts[1].every((f) => r.wipeouts[0].includes(f))),
  "v1_holderDormant": rows.every((r) => r.holderConsults === 0),
  "v1_onlyWgConsulted": rows.every((r) => r.nonWgConsults === 0),
};
const sum = (k: "claims" | "portChanges" | "secessions", i: 0 | 1) => rows.reduce((a, r) => a + r[k][i], 0);
console.log("pins:", JSON.stringify(pins), `default factions ${ftUnset} / ${ftExplicit}`);
console.log("replay:", JSON.stringify(replay));
console.log("| Seed | Claims off/on | Port changes off/on | Secessions off/on | WG consults | Overrides | Wipeouts off/on |");
console.log("|---|---|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.seed} | ${r.claims[0]} / ${r.claims[1]} | ${r.portChanges[0]} / ${r.portChanges[1]} | ${r.secessions[0]} / ${r.secessions[1]} | ${r.consults} | ${r.overrides} | ${JSON.stringify(r.wipeouts[0])} / ${JSON.stringify(r.wipeouts[1])} |`);
console.log(`| total | ${sum("claims", 0)} / ${sum("claims", 1)} | ${sum("portChanges", 0)} / ${sum("portChanges", 1)} | ${sum("secessions", 0)} / ${sum("secessions", 1)} (seeds with ≥ 1: ${rows.filter((r) => r.secessions[0] >= 1).length} / ${rows.filter((r) => r.secessions[1] >= 1).length}) | ${rows.reduce((a, r) => a + r.consults, 0)} | ${rows.reduce((a, r) => a + r.overrides, 0)} | |`);
console.log(JSON.stringify(checks));
const pass = Object.values(checks).every(Boolean);
if (values.json) writeFileSync(values.json, JSON.stringify({ pins, ftUnset, ftExplicit, replay, rows, checks, pass }, null, 2));
if (!pass) { console.log("WG PICKER ACCEPTANCE FAILED"); process.exitCode = 1; } else console.log("WG PICKER ACCEPTANCE PASSED");
