import { runTick } from "../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../src/sim/scenario.ts";
import type { SimEvent, WorldState } from "../../src/sim/types.ts";

/**
 * Shared 1200-tick runs for the story property tests (tests/story-properties.test.ts).
 * Each run is computed once per test file and cached. A live run also keeps
 * clones of the world at the ticks a player-hold story needs: two ticks into
 * each hold, the first day boundary inside it, and the tick after the release.
 */
export const STORY_SEEDS = [1847, 2718, 4096] as const;
export const STORY_TICKS = 1200;

export interface PlayerHold {
  captured: SimEvent;
  released: SimEvent | null;
  twoIn: WorldState | null;
  dayBoundary: WorldState | null;
  afterRelease: WorldState | null;
  /** Events up to and including each clone's tick, for feed and briefing reads. */
  eventsAt: Map<WorldState, SimEvent[]>;
}

export interface StoryRun {
  seed: number;
  live: boolean;
  world: WorldState;
  events: SimEvent[];
  holds: PlayerHold[];
  /** Every attention stop for the player, as the advance loop sees it: the stopping event and that tick's events. */
  stops: Array<{ event: SimEvent; tickEvents: SimEvent[]; world: WorldState }>;
}

const cache = new Map<string, StoryRun>();

export function storyRun(seed: number, live: boolean): StoryRun {
  const key = `${seed}:${live}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const world = createPrototypeWorld(seed);
  const playerId = world.players["prototype-player"].characterId;
  const events: SimEvent[] = [];
  const holds: PlayerHold[] = [];
  const stops: StoryRun["stops"] = [];
  let open: PlayerHold | null = null;
  const snap = (hold: PlayerHold): WorldState => {
    const copy = structuredClone(world);
    hold.eventsAt.set(copy, events.slice());
    return copy;
  };
  while (world.tick < STORY_TICKS) {
    const tickEvents = runTick(world, { liveSession: live }).events;
    events.push(...tickEvents);
    for (const event of tickEvents) {
      if (event.actorId !== playerId) continue;
      if (event.type === "character-captured" || event.type === "captivity-released" || event.type === "captivity-escaped") {
        stops.push({ event, tickEvents, world: structuredClone(world) });
      }
      if (event.type === "character-captured") {
        open = { captured: event, released: null, twoIn: null, dayBoundary: null, afterRelease: null, eventsAt: new Map() };
        holds.push(open);
      }
      if (event.type === "captivity-released" && open) {
        open.released = event;
        open.afterRelease = snap(open);
        open = null;
      }
    }
    if (open && world.characters[playerId].captivity) {
      if (!open.twoIn && world.tick === open.captured.tick + 2) open.twoIn = snap(open);
      if (!open.dayBoundary && world.tick > open.captured.tick && world.tick % 6 === 0) open.dayBoundary = snap(open);
    }
  }
  const run = { seed, live, world, events, holds, stops };
  cache.set(key, run);
  return run;
}

export function allRuns(live: boolean): StoryRun[] {
  return STORY_SEEDS.map((seed) => storyRun(seed, live));
}
