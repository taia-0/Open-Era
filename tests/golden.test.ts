import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runTicks } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";
import {
  GOLDEN_SEEDS,
  GOLDEN_TICKS,
  type GoldenHashes,
} from "../scripts/update-golden-hashes.ts";

/**
 * Behavioral regression guard.
 *
 * The determinism tests elsewhere in this suite compare one build against
 * itself, so they cannot detect a change that alters world outcomes
 * consistently. These tests compare against hashes committed ahead of time,
 * which means an unintended behavioral change fails here instead of passing
 * silently. Regenerate deliberately with: npm run golden:update
 */
const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, "fixtures/golden-hashes.json");
const golden = JSON.parse(readFileSync(fixturePath, "utf8")) as GoldenHashes;

test("the committed golden hashes describe the configured seeds and tick count", () => {
  assert.equal(golden.ticks, GOLDEN_TICKS);
  assert.deepEqual(
    golden.seeds.map((entry) => entry.seed),
    [...GOLDEN_SEEDS],
  );
});

test("pinned seeds reproduce their committed state hash and event count", () => {
  for (const seed of GOLDEN_SEEDS) {
    const recorded = golden.seeds.find((entry) => entry.seed === seed);
    assert.ok(recorded, `fixture is missing seed ${seed}`);

    const result = runTicks(createPrototypeWorld(seed), GOLDEN_TICKS);
    assert.equal(
      stateHash(result.state),
      recorded.stateHash,
      `seed ${seed} state hash drifted from the committed fixture`,
    );
    assert.equal(
      result.events.length,
      recorded.eventCount,
      `seed ${seed} event count drifted from the committed fixture`,
    );
  }
});

test("the committed recovery record is internally consistent", () => {
  const baseline = golden.seeds.find((entry) => entry.seed === golden.recovery.seed);
  assert.ok(baseline, "the recovery seed must also appear in the seed list");

  assert.equal(
    golden.recovery.continuousStateHash,
    baseline.stateHash,
    "the uninterrupted recovery reference must equal the seed's own hash",
  );
  assert.equal(
    golden.recovery.splitStateHash,
    golden.recovery.continuousStateHash,
    "a stop and restart must not change world history",
  );
  assert.ok(
    golden.recovery.splitAtTick > 0 && golden.recovery.splitAtTick < golden.ticks,
    "the split must occur mid-run for the comparison to mean anything",
  );
  assert.ok(
    golden.recovery.replayedEvents > 0,
    "the split run must actually replay post-snapshot events",
  );
});
