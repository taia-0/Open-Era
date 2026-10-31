import { noteMorningDesertion, type DesertionNotice } from "./desertion.ts";
import { payGovernorStipends, syncGovernorSeats } from "./governor.ts";
import { applyEvent } from "./state.ts";
import type { SimEvent, WorldState } from "./types.ts";

/**
 * Silent start of a tick: desertion, then the governor seat, then the stipend.
 *
 * None of the three is fully described by the log. Desertion emits only when
 * someone leaves. The seat is not a field. The stipend emits nothing. A
 * replay applies this before the tick's events so the later absolutes land
 * on the same coins.
 */
export function applySilentTickStart(world: WorldState): DesertionNotice[] {
  const notices = noteMorningDesertion(world);
  syncGovernorSeats(world);
  payGovernorStipends(world);
  return notices;
}

/**
 * Replay a log, reapplying the silent start before each tick's events.
 *
 * Does not run the start after the final `tick-advanced`. The next `runTick`
 * applies that morning.
 */
export function replayWithSilentStarts(state: WorldState, events: readonly SimEvent[]): void {
  let index = 0;
  let atStart = events.length > 0;
  while (index < events.length) {
    if (atStart) {
      // A death is the first event of its tick. Desertion, the seat, and the
      // stipend read the world after it, and the log already contains it, so
      // replay must not emit a second one.
      while (index < events.length && events[index].type === "character-died") {
        applyEvent(state, events[index]);
        index += 1;
      }
      applySilentTickStart(state);
      atStart = false;
      continue;
    }
    const event = events[index];
    applyEvent(state, event);
    index += 1;
    if (event.type === "tick-advanced") atStart = true;
  }
}
