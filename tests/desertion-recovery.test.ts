import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runTick } from "../src/sim/engine.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";

/**
 * Seed 1847's Free Tide mates go short on the morning of tick 108 and stay
 * short. Tick 139 is the morning their streak is 6, before the roll at 12.
 */
const SPLIT_AT = 139;
const RESUME_TO = 180;

test("a restart in the middle of a short streak matches a continuous run", () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-desertion-recovery-"));
  try {
    const continuous = createPrototypeWorld(1847);
    for (let index = 0; index < RESUME_TO; index += 1) runTick(continuous);

    const databasePath = join(directory, "world.sqlite");
    const store = new WorldStore(databasePath);
    const split = createPrototypeWorld(1847);
    store.initialize(split);
    for (let index = 0; index < SPLIT_AT; index += 1) {
      const result = runTick(split);
      store.appendTick(result.events, split);
    }
    store.close();

    const streaking = Object.values(split.characters).filter((character) => (character.shortMorningStreak ?? 0) > 0);
    assert.ok(streaking.length > 0);
    assert.ok(streaking.every((character) => (character.shortMorningStreak ?? 0) < 12));

    const reopened = new WorldStore(databasePath);
    const recovered = reopened.recover();
    assert.ok(recovered.replayedEvents > 0);
    assert.equal(recovered.state.tick, split.tick);
    for (const character of streaking) {
      assert.equal(recovered.state.characters[character.id].shortMorningStreak, character.shortMorningStreak);
    }
    assert.equal(recovered.state.desertionRngState, split.desertionRngState);
    assert.equal(stateHash(recovered.state), stateHash(split));

    for (let index = SPLIT_AT; index < RESUME_TO; index += 1) {
      const result = runTick(recovered.state);
      reopened.appendTick(result.events, recovered.state);
    }
    reopened.close();

    const deserted = Object.values(continuous.characters).filter((character) =>
      character.factionId === null && character.name === "Finn Frost",
    );
    assert.equal(deserted.length, 1);
    assert.equal(stateHash(recovered.state), stateHash(continuous));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
