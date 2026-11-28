// Item 1 harness: the WorldStore as a window. Offline, no AI, $0.
// Usage:
//   node --experimental-strip-types docs/design/engine-hygiene/store.ts size <label> <flag-off|atls>     (env SEEDS, TICKS, ARCHIVE=1)
//   node --experimental-strip-types docs/design/engine-hygiene/store.ts recover <label> <flag-off|atls>  (env SEEDS, TICKS, CRASH=comma list of ticks)
// `size`: runs the world into a real SQLite WorldStore (appendTick every tick), closes it (WAL checkpointed), prints file bytes and row counts.
// `recover`: a twin run. L has no store. S writes every tick and every between-tick command to a store and, at each CRASH tick, closes
//   the store, reopens it and recovers. Both then continue under the same script. Prints, per crash, recovered hash == live hash and
//   whether the stored governor seats equal L's live seats and equal the seats the old shadow replay from sequence 0 derives.
import { mkdtempSync, rmSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTick } from "../../../src/sim/engine.ts";
import { WorldStore } from "../../../src/sim/persistence.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { stateHash } from "../../../src/sim/state.ts";
import { submitCommand } from "../../../src/sim/commands.ts";
import type { SimEvent, WorldState } from "../../../src/sim/types.ts";
import * as governor from "../../../src/sim/governor.ts";
const exportGovernorSeats = (w: WorldState): unknown => ((governor as any).exportGovernorSeats ? (governor as any).exportGovernorSeats(w) : null);

import { CONFIGS, SEEDS13 } from "./common.ts";

const [mode, label, cfg] = process.argv.slice(2);
const opts = CONFIGS[cfg];
const ticks = Number(process.env.TICKS ?? 1200);
const seeds = (process.env.SEEDS ?? "1847").split(",").map(Number);
const archive = process.env.ARCHIVE === "1";
const shadowEvery = Number(process.env.SHADOW ?? 0);
const mk = (path: string) => { try { return new WorldStore(path, { archive }); } catch { return new WorldStore(path); } };
void SEEDS13;

function fileBytes(path: string): { db: number; wal: number; shm: number } {
  const s = (p: string) => (existsSync(p) ? statSync(p).size : 0);
  return { db: s(path), wal: s(path + "-wal"), shm: s(path + "-shm") };
}

if (mode === "size") {
  for (const seed of seeds) {
    const dir = mkdtempSync(join(tmpdir(), "oe-eh-"));
    const path = join(dir, "world.sqlite");
    let store = mk(path);
    const world = createPrototypeWorld(seed);
    store.initialize(world);
    const marks: Record<string, unknown>[] = [];
    const mark = (t: number) => {
      const q = (sql: string) => (store.database.prepare(sql).get() as { n: number }).n;
      marks.push({ tick: t, snapshots: q("SELECT COUNT(*) AS n FROM snapshots"), events: q("SELECT COUNT(*) AS n FROM events"), eventDataBytes: q("SELECT COALESCE(SUM(LENGTH(data_json)),0) AS n FROM events"), snapshotStateBytes: q("SELECT COALESCE(SUM(LENGTH(state_json)),0) AS n FROM snapshots"), lifetimeEvents: world.nextEventSequence });
    };
    for (let i = 1; i <= ticks; i++) {
      const result = runTick(world, { ...opts }); store.appendTick(result.events, world, { leadingCount: result.leadingCount });
      if (i === 1200 || i === 2500 || i === 5000) mark(i);
    }
    store.database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    const beforeClose = fileBytes(path);
    mark(ticks);
    store.close();
    const after = fileBytes(path);
    console.log(JSON.stringify({ label, cfg, seed, ticks, archive, hash8: stateHash(world).slice(0, 8), dbBytes: after.db, walBytes: after.wal, dbBytesBeforeClose: beforeClose.db, marks }));
    rmSync(dir, { recursive: true, force: true });
  }
} else if (mode === "recover") {
  const crash = new Set((process.env.CRASH ?? "5,6,7,23,24,25,71,72,73,96,150,299,300,301,500,719,720,721,899,1000,1199").split(",").map(Number));
  for (const seed of seeds) {
    const dir = mkdtempSync(join(tmpdir(), "oe-eh-"));
    const path = join(dir, "world.sqlite");
    const L = createPrototypeWorld(seed, { playerCharacterId: "character-01" });
    let S = createPrototypeWorld(seed, { playerCharacterId: "character-01" });
    let store = mk(path);
    store.initialize(S);
    const cmdIdOf = (w: WorldState) => Object.keys(w.players)[0];
    // Same script on both worlds. Commands land between ticks, as POST /api/commands does, and are appended on their own.
    const script = (w: WorldState, sink: ((ev: SimEvent) => void) | null) => {
      const playerId = cmdIdOf(w);
      for (const r of Object.values(w.characters)) for (const o of r.standingOrders) {
        if (o.issuerId === "character-01" && o.status === "awaiting-confirmation") {
          const res = submitCommand(w, { playerId, type: "confirm-order", characterId: r.id, orderId: o.id });
          if (res.ok && sink) sink(res.event);
        }
      }
      if (w.tick > 0 && w.tick % 60 === 0) {
        const carriers = ["character-02", "character-07", "character-12", "character-17"];
        const res = submitCommand(w, { playerId, type: "offer-contract", characterId: carriers[(w.tick / 60) % carriers.length], quantity: 10, destinationId: "crown-harbor", price: 18, expiresInTicks: 12 });
        if (res.ok && sink) sink(res.event);
      }
    };
    let crashes = 0, exactHash = 0, exactSeats = 0, exactShadowSeats = 0, shadowChecked = 0, firstBad: unknown = null, lastReplayed = 0;
    let every100 = 0, every100Exact = 0, every100FirstBad: unknown = null;
    const seatsJson = (w: WorldState) => JSON.stringify(exportGovernorSeats(w));
    for (let i = 1; i <= ticks; i++) {
      script(L, null);
      script(S, (ev) => store.appendTick([ev], S, { betweenTicks: true }));
      runTick(L, { ...opts });
      const stepped = runTick(S, { ...opts }); store.appendTick(stepped.events, S, { leadingCount: stepped.leadingCount });
      // ARCHIVE=1 only (the opening snapshot must still be stored): the seats the old path derives by replaying from
      // sequence 0 must equal the live seats that are now stored beside the snapshot.
      if (archive && shadowEvery > 0 && i % shadowEvery === 0 && S.tick % 6 === 0) {
        const snap = (store.database.prepare("SELECT MAX(sequence) AS n FROM snapshots").get() as { n: number }).n;
        const probe = JSON.parse(JSON.stringify(S)) as WorldState;
        (store as any).restoreGovernorSeats(probe, snap);
        shadowChecked++; if (seatsJson(probe) === seatsJson(S)) exactShadowSeats++;
      }
      if (crash.has(i)) {
        store.close();
        store = mk(path);
        const rec = store.recover();
        crashes++;
        lastReplayed = rec.replayedEvents;
        const hashOk = stateHash(rec.state) === stateHash(L);
        const seatsOk = seatsJson(rec.state) === seatsJson(L);
        if (hashOk) exactHash++; else if (!firstBad) firstBad = { tick: i, replayed: rec.replayedEvents, snapshotSequence: rec.snapshotSequence };
        if (seatsOk) exactSeats++;
        S = rec.state;
      }
      if (i % 100 === 0) {
        store.close();
        store = mk(path);
        const rec100 = store.recover();
        every100++;
        if (stateHash(rec100.state) === stateHash(L)) every100Exact++;
        else if (!every100FirstBad) every100FirstBad = { tick: i, replayed: rec100.replayedEvents, snapshotSequence: rec100.snapshotSequence };
        S = rec100.state;
      }
    }
    store.close();
    const finalOk = stateHash(S) === stateHash(L);
    console.log(JSON.stringify({ label, cfg, seed, ticks, archive, crashes, recoveredHashEqualsLive: exactHash, seatsEqualLive: exactSeats, shadowChecked, seatsEqualShadowReplay: exactShadowSeats, finalHashEqual: finalOk, firstBad, lastReplayed, every100, every100Exact, every100FirstBad, hash8: stateHash(L).slice(0, 8) }));
    rmSync(dir, { recursive: true, force: true });
  }
}

// Migration check. `migrate-write <label> <cfg>` (run on main) writes a store at $DB for $TICKS ticks and stops.
// `migrate-read <label> <cfg>` (run on the patched tree) opens that store, recovers (seats come from the old shadow replay, no stored row),
// compares with a live twin, continues $MORE ticks with appendTick, and prints the table sizes before and after the first new snapshot.
if (mode === "migrate-write") {
  const seed = seeds[0]; const path = process.env.DB!;
  const store = mk(path); const w = createPrototypeWorld(seed); store.initialize(w);
  for (let i = 1; i <= ticks; i++) { const r = runTick(w, { ...opts }); store.appendTick(r.events, w, { leadingCount: r.leadingCount }); }
  store.close(); console.log(JSON.stringify({ label, mode, seed, ticks, hash8: stateHash(w).slice(0, 8) }));
} else if (mode === "migrate-read") {
  const seed = seeds[0]; const path = process.env.DB!; const more = Number(process.env.MORE ?? 30);
  const live = createPrototypeWorld(seed);
  for (let i = 1; i <= ticks; i++) runTick(live, { ...opts });
  const store = mk(path);
  const q = (sql: string) => (store.database.prepare(sql).get() as { n: number }).n;
  const rows = () => ({ snapshots: q("SELECT COUNT(*) AS n FROM snapshots"), seatRows: q("SELECT COUNT(*) AS n FROM snapshot_seats"), events: q("SELECT COUNT(*) AS n FROM events"), oldestEventTick: q("SELECT MIN(tick) AS n FROM events"), feedingRows: q("SELECT COUNT(*) AS n FROM feeding_counts") });
  const before = rows();
  const rec = store.recover(); const recOk = stateHash(rec.state) === stateHash(live);
  for (let i = 0; i < more; i++) { runTick(live, { ...opts }); const r = runTick(rec.state, { ...opts }); store.appendTick(r.events, rec.state, { leadingCount: r.leadingCount }); }
  const after = rows();
  const rec2 = store.recover();
  console.log(JSON.stringify({ label, mode, seed, ticks, more, recoveredLegacyEqualsLive: recOk, continuedEqualsLive: stateHash(rec.state) === stateHash(live), recoveredAfterPruneEqualsLive: stateHash(rec2.state) === stateHash(live), before, after, feedingCountsLifetime: Object.keys(store.feedingCounts()).length }));
  store.close();
}

// Lifetime feeding counts in window mode must equal the counts of the whole log (counted here in memory).
if (mode === "feeding") {
  for (const seed of seeds) {
    const dir = mkdtempSync(join(tmpdir(), "oe-eh-")); const path = join(dir, "world.sqlite");
    const store = mk(path); const w = createPrototypeWorld(seed); store.initialize(w);
    const want: Record<string, { worked: number; voyages: number; battles: number }> = {};
    for (let i = 1; i <= ticks; i++) {
      const stepped = runTick(w, { ...opts }); const evs = stepped.events;
      for (const e of evs) if (e.actorId && (e.type === "worked" || e.type === "travel-started" || e.type === "battle-resolved")) {
        const c = (want[e.actorId] ??= { worked: 0, voyages: 0, battles: 0 });
        if (e.type === "worked") c.worked++; else if (e.type === "travel-started") c.voyages++; else c.battles++;
      }
      store.appendTick(evs, w, { leadingCount: stepped.leadingCount });
    }
    const got = store.feedingCounts();
    const rows = (store.database.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number }).n;
    console.log(JSON.stringify({ label, cfg, seed, ticks, archive, equal: JSON.stringify(Object.entries(got).sort()) === JSON.stringify(Object.entries(want).sort()), actors: Object.keys(got).length, storedEvents: rows, lifetimeEvents: w.nextEventSequence }));
    store.close(); rmSync(dir, { recursive: true, force: true });
  }
}
