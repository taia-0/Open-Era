import assert from "node:assert/strict";
import test from "node:test";
import { runTick } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";
import { autonomousTaxStep, taxChoiceCents, taxStepOptions } from "../src/sim/tax-rate.ts";

// Slice A0: taxStepOptions is pure, and autonomousTaxStep is its thin wrapper.
test("taxStepOptions gives the legal set and the scorer's choice; the wrapper steps only off hold", () => {
  for (const seed of [1847, 2718, 4096]) {
    const world = createPrototypeWorld(seed);
    let open = 0;
    while (world.tick < 480) {
      for (const factionId of Object.keys(world.factions)) {
        const before = stateHash(world);
        const options = taxStepOptions(world, factionId);
        const step = autonomousTaxStep(world, factionId);
        assert.equal(stateHash(world), before);
        if (!options) { assert.equal(step, null); continue; }
        open += 1;
        assert.equal(world.tick % 24, 0);
        const expected = options.landless ? ["hold"] : [
          ...(options.rateCents > 0 ? ["down"] : []), "hold", ...(options.rateCents < 30 ? ["up"] : []),
        ];
        assert.deepEqual(options.options, expected);
        assert.ok(options.options.includes(options.scorerChoice));
        if (options.scorerChoice === "hold") assert.equal(step, null);
        else assert.equal(Math.round(step!.taxRate * 100), taxChoiceCents(options.rateCents, options.scorerChoice));
      }
      runTick(world);
    }
    assert.ok(open > 0, `seed ${seed} reached an open clock point`);
  }
});
