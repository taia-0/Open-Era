import assert from "node:assert/strict";
import test from "node:test";
import { advancePauseNote } from "../src/dashboard/view-model.ts";
import { runTick } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import type { SimEvent } from "../src/sim/types.ts";

const ATTENTION = new Set(["character-captured", "captivity-escaped", "captivity-released"]);

function attentionStop(events: SimEvent[], playerId: string): SimEvent | undefined {
  return events.find((event) => event.actorId === playerId && ATTENTION.has(event.type));
}

test("seed 1847 stops on Mara's capture and her release, and the response says why", () => {
  const world = createPrototypeWorld(1847);
  const playerId = world.players["prototype-player"].characterId;
  const notes: Array<{ tick: number; type: string; sequence: number; eventTick: number; note: string | null }> = [];

  while (notes.length < 2 && world.tick < 900) {
    const produced: SimEvent[] = [];
    let stopping: SimEvent | undefined;
    for (let index = 0; index < 144 && !stopping; index += 1) {
      const result = runTick(world, { liveSession: true });
      produced.push(...result.events);
      stopping = attentionStop(result.events, playerId);
    }
    if (!stopping) continue;
    notes.push({
      tick: world.tick,
      type: stopping.type,
      sequence: stopping.sequence,
      eventTick: stopping.tick,
      note: advancePauseNote(world, playerId, produced, stopping),
    });
  }

  assert.deepEqual(notes, [
    {
      tick: 317,
      type: "character-captured",
      sequence: 39449,
      eventTick: 316,
      note: "Time stopped. Free Tide Compact took Mara Vane on the dock at Crown Harbor after Pax Ash won there on a higher score.",
    },
    {
      tick: 401,
      type: "captivity-released",
      sequence: 50454,
      eventTick: 400,
      note: "Time stopped. Mara Vane was released from Crown Harbor.",
    },
  ]);
});
