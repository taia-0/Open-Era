// Shared helpers for the engine-hygiene harnesses. Not imported by src/.
import { createHash } from "node:crypto";
import { dynamismReadout } from "../../../src/tools/dynamism.ts";
import type { SimEvent, WorldState } from "../../../src/sim/types.ts";

export const CONFIGS: Record<string, Record<string, unknown>> = {
  "flag-off": {},
  atls: { alliances: true, portTransfer: true, lifecycle: true, secessionAftermath: true },
};
export const SEEDS13 = "1847,2718,4096,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000";

/** Streamed digest of every event (type, tick, actor, target, settlement, data), sequence included. No giant string. */
export class EventDigest {
  private h = createHash("sha256");
  count = 0;
  types = createHash("sha256");
  add(e: SimEvent, includeSequence = true): void {
    this.count++;
    this.types.update(e.type + "\n");
    this.h.update(JSON.stringify([includeSequence ? e.sequence : 0, e.tick, e.type, e.actorId ?? null, e.targetId ?? null, e.settlementId ?? null, e.data]) + "\n");
  }
  hex(): string { return this.h.copy().digest("hex").slice(0, 12); }
  typesHex(): string { return this.types.copy().digest("hex").slice(0, 12); }
}

export function outcomes(w: WorldState, events: SimEvent[]) {
  const t = dynamismReadout(events).totals as Record<string, number>;
  const n = (type: string) => events.filter((e) => e.type === type).length;
  const portsOf = (f: string) => Object.values(w.settlements).filter((s) => s.factionId === f).length;
  const members = (f: string) => Object.values(w.characters).filter((c) => !c.dead && c.factionId === f).length;
  return {
    claims: n("settlement-claimed"), portChanges: t.portOwnershipChanges, battles: n("battle-resolved"), captures: t.captures, secessions: t.secessions,
    wipeouts: ["world-government", "free-tide"].filter((f) => portsOf(f) === 0 && members(f) === 0),
  };
}
