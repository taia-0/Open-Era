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
  let atStart = events.length > 0;
  for (const event of events) {
    if (atStart) {
      applySilentTickStart(state);
      atStart = false;
    }
    applyEvent(state, event);
    if (event.type === "tick-advanced") atStart = true;
  }
}
