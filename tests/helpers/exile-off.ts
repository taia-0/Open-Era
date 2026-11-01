import { runTick as engineRunTick, runTicks as engineRunTicks, type TickOptions } from "../../src/sim/engine.ts";
import type { WorldState } from "../../src/sim/types.ts";

// after-triage.md (b): EXILE_RECOVERY is on by default. Rule and timeline tests that were
// written against the pre-default timeline (named ticks, captains, offers, pins) run with
// the opt-out, so each rule is still checked at the same setup. Pass `exileRecovery` to override.
export function runTick(world: WorldState, options: TickOptions = {}) {
  return engineRunTick(world, { exileRecovery: false, ...options });
}
export function runTicks(world: WorldState, count: number, options: TickOptions = {}) {
  return engineRunTicks(world, count, { exileRecovery: false, ...options });
}
