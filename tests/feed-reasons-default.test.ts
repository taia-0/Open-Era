import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FEED_REASONS_DEFAULT } from "../src/sim/feed-reasons.ts";
import { resolveFeedReasons } from "../src/cli/feed-reasons-flag.ts";
import { runTick } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";
import { stubFeedReasonWriter, type FeedReasonOptions } from "../src/sim/feed-reasons.ts";

const env = { ...process.env, DEEPSEEK_API_KEY: "", JEV_API_KEY: "", FEED_REASONS: "", EXILE_RECOVERY: "" };
const cli = (script: string, args: string[]) =>
  execFileSync(process.execPath, ["--experimental-strip-types", script, ...args], {
    env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });

test("FEED_REASONS_DEFAULT is on; resolveFeedReasons honours --no-feed-reasons and FEED_REASONS=0", () => {
  assert.equal(FEED_REASONS_DEFAULT, true);
  assert.equal(resolveFeedReasons({}), true);
  assert.equal(resolveFeedReasons({ "no-feed-reasons": true }), false);
  assert.equal(resolveFeedReasons({}, { FEED_REASONS: "0" }), false);
  assert.equal(resolveFeedReasons({ "no-feed-reasons": true }, { FEED_REASONS: "1" }), false);
});

test("opt-out (feedReasons: false) and default-on stub keep the default 72-tick pins (hash-neutral)", () => {
  const pins: Record<number, string> = { 1847: "7f76e474", 2718: "976c40bd", 4096: "08943ea5" };
  for (const seed of [1847, 2718, 4096]) {
    const offWorld = createPrototypeWorld(seed);
    for (let i = 0; i < 72; i++) runTick(offWorld, { ai: { feedReasons: false } });
    const onWorld = createPrototypeWorld(seed);
    const feedReasons: FeedReasonOptions = { writer: stubFeedReasonWriter(), exileRecovery: true };
    for (let i = 0; i < 72; i++) runTick(onWorld, { ai: { feedReasons } });
    assert.equal(stateHash(offWorld).slice(0, 8), pins[seed], `opt-out seed ${seed}`);
    assert.equal(stateHash(onWorld).slice(0, 8), pins[seed], `default-on stub seed ${seed}`);
    assert.equal(stateHash(onWorld), stateHash(offWorld));
  }
});

test("CLI help lists --no-feed-reasons; opt-out on run-feed-reasons keeps the default pin", () => {
  for (const script of [
    "src/cli/run-simulation.ts",
    "src/cli/run-feed-reasons.ts",
    "src/cli/run-action-picker.ts",
    "src/cli/run-ai-pilot.ts",
  ]) {
    assert.match(cli(script, ["--help"]), /--no-feed-reasons/);
  }
  const dir = mkdtempSync(join(tmpdir(), "open-era-fr-default-"));
  try {
    const out = cli("src/cli/run-feed-reasons.ts", ["--seed", "1847", "--ticks", "72", "--output", dir, "--no-feed-reasons"]);
    const summary = JSON.parse(out);
    assert.equal(summary.feedReasons, false);
    assert.equal(String(summary.stateHash).slice(0, 8), "7f76e474");
    assert.equal(summary.writerCalls, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("run-feed-reasons default (stub, reasons on) matches the default 72-tick pin", () => {
  const dir = mkdtempSync(join(tmpdir(), "open-era-fr-on-"));
  try {
    const summary = JSON.parse(cli("src/cli/run-feed-reasons.ts", ["--seed", "1847", "--ticks", "72", "--output", dir]));
    assert.equal(summary.feedReasons, true);
    assert.equal(String(summary.stateHash).slice(0, 8), "7f76e474");
    assert.ok(summary.events > 0);
    assert.ok(summary.writerCalls > 0 || summary.model + summary.fallback + summary.cached > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
