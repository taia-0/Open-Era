import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { capsCheck, escalationCheck, flagOffCheck, loadRun, probeCheck, readoutCheck, replayCheck, testsCheck } from "../tools/triage-gate.ts";

/**
 * Slice 5 gate (jev-triage.md §4.7; src/tools/triage-gate.ts). Each --seed names the run directories
 * written by `npm run action-picker` (events.jsonl, summary.json, cost.jsonl; the replay under <dir>/replay):
 *   npm run triage-gate -- --probe docs/playtests/jev-triage-set \
 *     --seed 1847:<triage run>:<picker-only run>:<never-flag run>:<always-flag run>[:<stub picker-only run>] ... --tests-log tests.log [--json out.json]
 * The triage run is the stub or live run under test, read against its picker-only run (checks 5–7).
 * Checks 3 and 4 always use the offline stubs; for a live run give the stub picker-only run as the 6th part.
 * Exits 1 when any check fails.
 */
const { values } = parseArgs({ options: { probe: { type: "string" }, seed: { type: "string", multiple: true }, "tests-log": { type: "string" }, json: { type: "string" }, "skip-flag-off": { type: "boolean" } } });
const seeds = (values.seed ?? []).map((spec) => {
  const [seed, run, picker, never, always, stubPicker] = spec.split(":");
  const r = loadRun(run); const p = loadRun(picker); const n = loadRun(never); const a = loadRun(always);
  // Check 3 compares the never-flag stub with picker-only under the same stub picks (the 6th part; default the picker-only run).
  const sp = stubPicker ? loadRun(stubPicker) : p;
  return {
    seed: Number(seed),
    neverEqualsPickerOnly: { never: n.summary.stateHash.slice(0, 8), pickerOnly: sp.summary.stateHash.slice(0, 8), ok: n.summary.stateHash === sp.summary.stateHash },
    alwaysFlag: (() => { const e = escalationCheck(a.events); return { ...e, ok: e.escalations === e.expected && e.cooldownBreaks === 0 && e.brainNotLegalOrFallback === 0 && e.railBreaks === 0 }; })(),
    run: { mode: r.summary.mode, stateHash: r.summary.stateHash.slice(0, 8), escalation: escalationCheck(r.events), triageSummary: r.summary.triageSummary },
    replay: { run: replayCheck(r), always: replayCheck(a) },
    readout: readoutCheck(r.events, p.events),
    caps: capsCheck(r),
  };
});
if (!seeds.length) throw new Error("give at least one --seed seed:run:pickerOnly:never:always");
const probe = values.probe ? probeCheck(values.probe) : null;
const flagOff = values["skip-flag-off"] ? null : flagOffCheck(seeds.map((s) => s.seed));
const tests = testsCheck(values["tests-log"]);
const checks: Record<string, boolean> = {
  "1_probe": !!probe?.pass,
  "2_flagOffPins": !!flagOff?.pass,
  "3_neverFlagEqualsPickerOnly": seeds.every((s) => s.neverEqualsPickerOnly.ok),
  "4_alwaysFlagEscalations": seeds.every((s) => s.alwaysFlag.ok),
  "5_replayExactZeroCalls": seeds.every((s) => s.replay.run.ok && s.replay.always.ok),
  "6_divergenceWhenChanged": seeds.every((s) => s.readout.divergenceOk),
  "6_holderEntropyNotBelowPickerOnly": seeds.every((s) => s.readout.holderEntropy.notBelow),
  "7_caps": seeds.every((s) => s.caps.ok),
  "7_npmTest": tests.ok,
};
const gate = { probe, flagOff, seeds, tests, checks, pass: Object.values(checks).every(Boolean) };
if (values.json) writeFileSync(values.json, `${JSON.stringify(gate, null, 2)}\n`);
console.log(JSON.stringify(gate, null, 2));
process.exit(gate.pass ? 0 : 1);
