import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { raidCause } from "../src/sim/feed-reasons.ts";
import type { SimEvent } from "../src/sim/types.ts";

const env = { ...process.env, DEEPSEEK_API_KEY: "", JEV_API_KEY: "", EXILE_RECOVERY: "" };
const cli = (script: string, args: string[]) => execFileSync(process.execPath, ["--experimental-strip-types", script, ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const hashOf = (script: string, extra: string[]) => {
  const dir = mkdtempSync(join(tmpdir(), "open-era-exile-cli-"));
  try { cli(script, ["--seed", "1847", "--ticks", "72", "--output", dir, ...extra]); return String(JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")).stateHash).slice(0, 8); }
  finally { rmSync(dir, { recursive: true, force: true }); }
};

test("exile CLI polish: --no-exile-recovery on run-action-picker and run-ai-pilot reproduces the opt-out pin; --exile-recovery is a no-op", () => {
  for (const [script, extra] of [["src/cli/run-action-picker.ts", ["--picker", "argmax"]], ["src/cli/run-ai-pilot.ts", ["--choice-mode", "argmax"]]] as const) {
    assert.equal(hashOf(script, [...extra]), "7f76e474", script);
    assert.equal(hashOf(script, [...extra, "--exile-recovery"]), "7f76e474", script);
    assert.equal(hashOf(script, [...extra, "--no-exile-recovery"]), "66e8ccb7", script);
  }
});

test("exile CLI polish: --help lists the opt-out and marks --exile-recovery deprecated", () => {
  for (const script of ["src/cli/run-action-picker.ts", "src/cli/run-ai-pilot.ts", "src/cli/run-simulation.ts", "src/cli/run-feed-reasons.ts"]) {
    const help = cli(script, ["--help"]);
    assert.match(help, /--no-exile-recovery/);
    assert.match(help, /--exile-recovery\s+deprecated no-op/);
  }
});

test("feed reasons: the plan trigger carries the plan's own words", () => {
  const raid = { sequence: 2, tick: 9, type: "battle-started", actorId: "character-15", settlementId: "glassport", data: {} } as unknown as SimEvent;
  const decision = { sequence: 1, tick: 9, type: "decision-made", actorId: "character-15", data: { goal: "raid", chosen: { reason: "challenge Glassport's estimated garrison (155, 100% confidence) and seize supplies; supports plan: Build a capable and respected party" } } } as unknown as SimEvent;
  assert.deepEqual(raidCause(raid, [decision, raid]), { cause: "plan", trigger: "as part of the plan to build a capable and respected party" });
});
