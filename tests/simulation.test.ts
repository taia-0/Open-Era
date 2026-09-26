import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { characterCadence, runTick, runTicks } from "../src/sim/engine.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { canonicalJson, stateHash } from "../src/sim/state.ts";

test("the same seed produces byte-for-byte deterministic events and state", () => {
  const first = runTicks(createPrototypeWorld(1847), 24);
  const second = runTicks(createPrototypeWorld(1847), 24);

  assert.equal(stateHash(first.state), stateHash(second.state));
  assert.equal(canonicalJson(first.events), canonicalJson(second.events));
});

test("different seeds create different histories", () => {
  const first = runTicks(createPrototypeWorld(1847), 12);
  const second = runTicks(createPrototypeWorld(9051), 12);

  assert.notEqual(stateHash(first.state), stateHash(second.state));
});

test("recovery from a snapshot plus event replay matches uninterrupted simulation", () => {
  const directory = mkdtempSync(join(tmpdir(), "open-era-recovery-"));
  const databasePath = join(directory, "world.sqlite");
  try {
    const baseline = runTicks(createPrototypeWorld(333), 19).state;
    const interrupted = createPrototypeWorld(333);
    const store = new WorldStore(databasePath);
    store.initialize(interrupted);
    for (let index = 0; index < 13; index += 1) {
      const result = runTick(interrupted);
      store.appendTick(result.events, interrupted);
    }
    const interruptedHash = stateHash(interrupted);
    store.close();

    const reopened = new WorldStore(databasePath);
    const recovered = reopened.recover();
    assert.ok(recovered.replayedEvents > 0, "expected recovery to replay post-snapshot events");
    assert.equal(recovered.state.tick, 13);
    assert.equal(stateHash(recovered.state), interruptedHash);

    for (let index = 0; index < 6; index += 1) {
      const result = runTick(recovered.state);
      reopened.appendTick(result.events, recovered.state);
    }
    assert.equal(stateHash(recovered.state), stateHash(baseline));
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the pressure-test scenario exercises its connected systems", () => {
  const result = runTicks(createPrototypeWorld(1847), 24);
  const types = new Set(result.events.map((event) => event.type));

  for (const expected of [
    "decision-made",
    "settlement-produced",
    "market-trade",
    "travel-started",
    "arrived",
    "worked",
    "recruited",
    "battle-resolved",
    "metrics-recorded",
  ]) {
    assert.ok(types.has(expected), `expected an event of type ${expected}`);
  }

  const sequences = result.events.map((event) => event.sequence);
  assert.deepEqual(sequences, Array.from({ length: sequences.length }, (_, index) => index + 1));
});

test("a character's periodic cadence stays distinct once ids outgrow two digits", () => {
  // This offset used to come from `id.slice(-2)`, which reads character-100 and
  // character-101 as the same "00" and "01" as the first two characters. The
  // zero-padded prototype roster hides that, so the aliasing is asserted
  // directly rather than waited for.
  const cadences = ["character-01", "character-02", "character-100", "character-101"].map(characterCadence);
  assert.deepEqual(cadences, [1, 2, 100, 101]);
  assert.equal(new Set(cadences).size, cadences.length, "two characters must not share one cadence slot");

  // A malformed id must not throw or poison the modular arithmetic with NaN.
  assert.equal(characterCadence("character-"), 0);
  assert.equal(characterCadence("character-abc"), 0);
});

test("every character's relationships are reviewed on one tick per day", () => {
  const world = createPrototypeWorld(1847);
  const ids = Object.keys(world.characters);
  // A stagger is only a stagger if it spreads work out rather than collapsing it
  // onto a single tick, and it must revisit each character exactly once a day.
  for (const id of ids) {
    const offset = characterCadence(id);
    const days = Array.from({ length: world.ticksPerDay }, (_, tick) => (tick + offset) % world.ticksPerDay);
    assert.equal(days.filter((value) => value === 0).length, 1, `${id} must be reviewed once per day`);
  }
});
