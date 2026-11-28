# Engine hygiene: store window, news guard and prune, stored command holder, sighting freshness

Spec on `main` `90433a8` (#203 npc-threads merged), then a plain merge of `origin/main` `b797463` (#204 replay-divergence; src identical to that commit). This revision records the Lead's 2026-11-27 rulings and remeasures the store window with two snapshots and a tick-boundary column. Offline, no AI calls, $0, Node v24.22.1. Raw rows, harnesses and the prototype patches are in [engine-hygiene/](engine-hygiene/). **No patch is committed to `src`.** The Lead's earlier rulings this answers: (1) the store is a window, with seats persisted; (2) the contracts prune is not in this note (it lands later, after the defaults flips); (3) a news guard first, then the news prune; (4) the command holder is stored on the faction; (5) combat sightings get a freshness window, measured as its own slice. A ride-along edit narrows npc-threads ruling 5 (section 7).

## 0. Summary

| # | Item | Hash | Event log | Replay / recovery | Landing |
|---|---|---|---|---|---|
| 1 | Store as a window, latest two snapshots, `pre_start` column, opt-in archive | **neutral** (store layer only; the column is a WeakMap mark, not on the world) | unchanged (rows are dropped from the store, none are emitted) | 220/220 recoveries equal live using the column, plus every-100-tick checks 137/137 (section 1.5); needs the replay fix | second |
| 3a | News **guard** (arrival does not post what the port would drop) | **neutral**, 26/26 runs at t72 and t1200 | **identical** to main, 26/26 runs at t1200 (digest includes `sequence`) | exact 26/26 | with the replay fix |
| 3b | News **prune** (180 ticks plus the latest ownership and occupation item per port) | t72 **unchanged**, t1200 **moves** on 26/26 runs: **re-pin** | identical to main at t1200 (26/26). **Not identical past about t2,100** (section 3.4) | exact 26/26 and at t5000 on 1847 | with item 4a (one re-pin) |
| 4a | Stored holder (`Faction.commandHolderId`) replaces the derivation | **moves every pin from t0** (a new hashed field): **re-pin** | **identical** to main, 26/26 | exact 26/26 | with item 3b (one re-pin) |
| 4c | The `engine.ts:1123` read: stored-seat variant, or first-open-order / just-resolved variant | moves pins (behavior) | seat changes 23/26; open/plan change 26/26 (section 4.3) | exact 26/26 | **not accepted yet**; waits on section 4.3 |
| 5 | Sighting freshness: 72-tick hard cutoff on the forecast only; the card projection keeps older sightings with `observedTick` | **neutral** | identical, 26/26 (sim stream, scripted run) | n/a | any time |

Landing order (section 8) is approved: replay fix, 3a, 1, 5, then one re-pin slice with 4a and 3b; 4c waits on the variant measurement in section 4.3. Six numbers worth reading first:

- **Store, seed 1847, two snapshots:** t1200 162.4 MB to 15.3 MB (flag-off), 158.0 to 15.9 MB (ATLS). t5000 1,030.0 MB to 15.9 MB, 1,012.6 to 18.4 MB. One snapshot was 14.7 / 15.3 at t1200 and 15.0 / 16.7 at t5000; the second snapshot adds 0.6 MB at t1200 and 0.9 / 1.7 MB at t5000. Event rows stay the same (the 180-tick window is wider than the gap to the previous snapshot).
- **Sightings never reach a fight.** `combatForecast` reads `partySightings` only when `observedLocally` is false, and the one stored forecast (a battle's start, `engine.ts:1556`) and the in-battle one (`combat.ts:242`) pass `observedLocally: true`. A stale sighting skews the commander's *forecast*, not the battle. The window changes 2,690 of 3,904 forecasts (flag-off) and no battle, capture, claim, port change, wipeout or secession.
- **News prune is event-identical only while no sailor brings a stale item to a port that never held it.** That never happens in 26 runs of 1,200 ticks. At t5000 on 1847 it starts at t2,121 (flag-off) and t2,716 (ATLS). The Lead accepted dropping those never-held re-posts as a deliberate bug fix; no tombstone.
- **The holder move is a pure state move** (event log identical, 26/26) but it moves all six pins at t72, because the field is hashed from t0. Replacing the `engine.ts:1123` read is a behavior change.
- **Replay dependency:** without `replay-leading-block.patch`, a restart on ATLS 10000 between t1,621 and t1,625 recovers a different world (3 of 10 crash points equal). With it, 10/10.
- **Tests:** item 1 breaks 4 tests that delete newer snapshots to force an old one (they need `archive: true`). Item 5 breaks none (690/690). Items 3b and 4 move pinned hashes.

## Rulings (Lead, 2026-11-27)

Recorded here and folded into the sections they change.

1. **News prune is OK as is.** Dropping re-posts of items a port never held is a deliberate bug fix. No tombstone. Section 3.4.
2. **Keep two snapshots** (latest and previous) so recovery has a fallback. The store-window patch and the size and recovery numbers on 1847 are updated in section 1.
3. **`run-simulation` defaults to `archive: true`.** The dashboard and server default to the window, with `OPEN_ERA_ARCHIVE=1` to opt in. The health line shows both lifetime events and window rows. Section 1.1.
4. **Stored-holder rule approved:** the seat is null while the named holder is not a member, and a non-holder order never unseats. Holder death, retirement or exile must follow main's current succession. Section 4.2 confirms each, with file:line and measured evidence. The first 4a prototype left a dead holder's id stored and did not refill a vacancy; that was fixed, and the fixed prototype matches main.
5. **4c is not accepted yet.** Measure the alternative where the relationship update goes toward the issuer of the order that just resolved (the same as, or close to, the first open order), and bring back both the current 4c (stored seat) and this variant. Measured in section 4.3: 13 seeds × 1,200 ticks, flag-off and ATLS, event-log deltas, claims, port changes, captures, liveness, and relationship-call counts.
6. **The forecast uses a 72-tick hard cutoff.** The card projection (`visibility.ts:724`) keeps showing older sightings with their `observedTick`: dated knowledge stays visible as long as it is labeled. Do not hide them in the projection. Section 5.2.
7. **`portNewsFor` at 180 ticks plus the latest ownership items is OK.** Section 3.3.

## Pin baseline (verified first, on `90433a8`)

`pins.ts`, 1,200 ticks, headless, `createPrototypeWorld(seed)`. All six match the pins in the brief, with and without the replay patch, and again with the item 1 window patch (two snapshots and the `pre_start` column; `results/pins-item1-window.jsonl`); whole-log replay is exact in all six (`results/pins-main.jsonl`, `pins-patched.jsonl`).

| Config | Seed | t72 | t1200 | Events |
|---|---|---|---|---|
| flag-off `{}` | 1847 | `7f76e474` | `94de9c02` | 160,337 |
| flag-off | 2718 | `976c40bd` | `7a3741c9` | 157,701 |
| flag-off | 4096 | `08943ea5` | `af6eeaea` | 162,679 |
| ATLS | 1847 | `85658e53` | `5367691c` | 159,450 |
| ATLS | 2718 | `aa54ada1` | `faf5798a` | 145,283 |
| ATLS | 4096 | `e4361ee1` | `7e93eab2` | 157,896 |

ATLS = `{alliances, portTransfer, lifecycle, secessionAftermath}` all true. Seeds for the 13-seed runs: 1847, 2718, 4096, 1000 to 10000 by thousands. The event digest in every comparison is a streamed sha256 of each event's `[sequence, tick, type, actorId, targetId, settlementId, data]`, so it includes `sequence` and therefore `nextEventSequence`.

### Pins after each patch (t72 / t1200, first 8 hex)

| Config, seed | main | 1, 3a, 5 (neutral) | 3b prune | 4a stored holder | 4a + 4c | all five |
|---|---|---|---|---|---|---|
| flag-off 1847 | `7f76e474` / `94de9c02` | same | `7f76e474` / `b0568a84` | `83cdbc79` / `c5ebda78` | `83cdbc79` / `46013976` | `83cdbc79` / `786f1252` |
| flag-off 2718 | `976c40bd` / `7a3741c9` | same | `976c40bd` / `f0c2f82b` | `1697947f` / `ec195538` | `1697947f` / `ec195538` | `1697947f` / `ff8e67c7` |
| flag-off 4096 | `08943ea5` / `af6eeaea` | same | `08943ea5` / `56b6a081` | `0166182c` / `49d7d068` | `0166182c` / `9ca8ba00` | `0166182c` / `b80af3f6` |
| ATLS 1847 | `85658e53` / `5367691c` | same | `85658e53` / `bde109bf` | `e0036f31` / `ce233ab6` | `e0036f31` / `2205675a` | `e0036f31` / `fdee3c79` |
| ATLS 2718 | `aa54ada1` / `faf5798a` | same | `aa54ada1` / `58f4ff35` | `ef822822` / `e9e8ac6b` | `ef822822` / `c7e6b61a` | `ef822822` / `b6ab2b48` |
| ATLS 4096 | `e4361ee1` / `7e93eab2` | same | `e4361ee1` / `8ecbe142` | `33279bfb` / `d4ef5b86` | `33279bfb` / `ade009ba` | `33279bfb` / `4e31e460` |

"Same" for items 1, 3a and 5 is measured for 3a (`results/news-guard-*.jsonl`, 26/26) and argued for 1 and 5: item 1 touches only the store, and item 5 only `combatForecast`, which no sim path calls with `observedLocally` false (section 5). 4a + 4c is `results/holder-v4c-*.jsonl`; "all five" is `results/pins-all-five.jsonl` (events 160,327, 157,701, 163,171, 159,441, 145,278, 157,892).

## 1. The store as a window (ruling 1)

### 1.1 Design

The store keeps: the **latest snapshot and the previous one** (`SNAPSHOTS_KEPT = 2`), **every event after the older kept snapshot**, and **the events of the last 180 ticks** (`EVENT_WINDOW_TICKS`, the check-in window `CHECK_IN_TICKS`, `view-model.ts:87`, a literal in `persistence.ts` because the sim does not import the dashboard). A hash-mismatch at recover tries the latest snapshot, then the previous (`persistence.ts` `recover()`, the loop over `ORDER BY sequence DESC LIMIT 2`). `eventsPage` ends at the oldest row kept, so `hasMore` is false there. Everything older than the older kept snapshot *and* older than the 180-tick floor is deleted in the same transaction that writes a new snapshot (`DELETE FROM events WHERE sequence <= oldestKept AND tick < world.tick - 180`). `WorldStore` takes `{ archive: true }` to keep every snapshot and event, as before.

`run-simulation` passes `archive: true` (its reports read the whole log). The dashboard and server default to the window, with `OPEN_ERA_ARCHIVE=1` to opt in. The health line (`GET /api/health`, `server.ts:151-152`) reports both `lifetimeEvents` (`world.nextEventSequence - 1`) and `windowEvents` (`store.eventCount()`). `events` on that payload is the lifetime total.

**Tick-boundary column.** Replay needs to know which events in a tick's batch precede the silent start, so it can redo desertion, seats and stipends at the same point the live run did. Item 1 adds a hash-neutral `events.pre_start` INTEGER column: `1` = before silent start, `0` = body, `NULL` = a legacy row, fall back to the type list. The mark lives in a `WeakMap` (`tick-start.ts` `preStartMarks`); it is not on the event object and is not hashed. `runTick` returns `leadingCount` (`types.ts` `TickResult.leadingCount`, set in `engine.ts:4565` from `leading.length` and attached at `:4571`). `appendTick` writes `pre_start` from that count, and from `{ betweenTicks: true }` for command, briefing and conversation appends (`server.ts:229-277`). An unlisted type appended with `betweenTicks: true` throws (`unexpectedBetweenTickType`). The fixed `OUT_OF_TICK_TYPES` list stays as the legacy fallback, plus a guard test (`between-tick-guard.ts`), until every store has the column.

Three things the window already broke, and what replaces each:

1. **Governor seats.** `restoreGovernorSeats` rebuilds the seat map by replaying from the opening snapshot (sequence 0) through the snapshot's last event. With the opening snapshot and old events gone, the seats are stored beside each snapshot: a `snapshot_seats(sequence, seats_json)` table holding `[settlementId, characterId, factionId]` rows sorted by port, written from the live seat memory (`governor.ts` `exportGovernorSeats`), restored with `importGovernorSeats`. Off the hash, as before. A store written before the change has no seat row, so `recover()` falls back to the old shadow replay while sequence 0 still exists, and the first new snapshot writes the row.
2. **Lifetime feeding counts.** `feedingCounts()` (read at `server.ts:143`) counts `worked`, `travel-started` and `battle-resolved` over the whole log. In a window that would silently become a 180-tick count. It becomes a running `feeding_counts` table updated in the same transaction, backfilled once from the events a legacy store still has.
3. **Whole-log readers.** `run-simulation.ts:62` (`allEvents()`, reports) needs the archive: the CLI passes `archive: true`. The dashboard reads `OPEN_ERA_ARCHIVE=1`.

### 1.2 Touch points (src as on `b797463`, plus this patch; original citations were `90433a8`, whose src is the same)

| File:line | Change |
|---|---|
| `persistence.ts:27` | `SNAPSHOTS_KEPT = 2`; `AppendTickOptions` (`leadingCount`, `betweenTicks`) |
| `persistence.ts:96`, `:126-127` | `pre_start INTEGER` on `CREATE TABLE`, and `ALTER TABLE` when a legacy store lacks the column |
| `persistence.ts` `appendTick` | upsert feeding counts; write `pre_start`; throw on an unlisted between-tick type; on a snapshot also write the seat row and, unless archive, keep two snapshots and delete events with `sequence <= oldestKept` and `tick < world.tick - 180` |
| `persistence.ts` `recover()` | load up to two snapshots, latest first; on a hash mismatch try the previous; seats from `snapshot_seats`, else the old `restoreGovernorSeats` |
| `persistence.ts` `rowToEvent` | `markEventPreStart` when `pre_start` is 0 or 1 (`:435-436`) |
| `tick-start.ts:27-35`, `:71-112` | `preStartMarks` WeakMap; exported `OUT_OF_TICK_TYPES`, `unexpectedBetweenTickType`, `isLeadingEvent` (column if marked, else the type list; `USE_COLUMN_ONLY=1` ignores the list, a proof hook) |
| `types.ts:861` | `TickResult.leadingCount?: number` |
| `engine.ts:4565`, `:4571` | set `leadingCount` from `leading.length` and attach it on the result after unshift |
| `governor.ts` | `exportGovernorSeats`, `importGovernorSeats` beside `transplantGovernorSeats` |
| `cli/run-simulation.ts:62`, `:96` | `archive: true`; `appendTick` passes `{ leadingCount }` |
| `dashboard/server.ts:94` | `archive` from `OPEN_ERA_ARCHIVE` |
| `dashboard/server.ts:148-152` | health: `events` and `lifetimeEvents` = `nextEventSequence - 1`, `windowEvents` = `store.eventCount()` |
| `dashboard/server.ts:177`, `:229-277` | tick append `{ leadingCount }`; command / briefing / thread appends `{ betweenTicks: true }` |

Patch: [item1-store-window.patch](engine-hygiene/item1-store-window.patch) (applies on top of [replay-leading-block.patch](engine-hygiene/replay-leading-block.patch); `persistence.ts`, `tick-start.ts`, `governor.ts`, `types.ts`, `engine.ts`, `run-simulation.ts`, `server.ts`). The between-tick guard is [between-tick-guard.ts](engine-hygiene/between-tick-guard.ts).

### 1.3 Store size (seed 1847, `store.ts size`, a real SQLite file after `wal_checkpoint(TRUNCATE)`)

Two-snapshot window (`results/size-window2-*.jsonl`, `size-window2-1200-1847-*.jsonl`). The one-snapshot numbers from the previous revision are kept for the delta.

| Config | Tick | Main: file | Main: snapshots / events | Window (2 snaps): file | Window: snapshots / events | One snapshot (previous) | Window + news prune (3b, 1 snap) |
|---|---|---|---|---|---|---|---|
| flag-off | 1,200 | 162.4 MB | 201 / 160,337 | **15.3 MB** (16,093,184 bytes) | 2 / 25,361 | 14.7 MB (15,437,824), 1 / 25,361 | not run at t1200 |
| ATLS | 1,200 | 158.0 MB | 201 / 159,450 | **15.9 MB** (16,637,952 bytes) | 2 / 26,361 | 15.3 MB (15,994,880), 1 / 26,361 | not run at t1200 |
| flag-off | 5,000 | 1,030.0 MB | 834 / 625,997 | **15.9 MB** (16,646,144 bytes) | 2 / 18,635 | 15.0 MB (15,720,448), 1 / 18,635 | 14.3 MB |
| ATLS | 5,000 | 1,012.6 MB | 834 / 666,157 | **18.4 MB** (19,304,448 bytes) | 2 / 25,839 | 16.7 MB (17,551,360), 1 / 25,839 | 14.7 MB |

- Event JSON is unchanged between one and two snapshots (9.4 MB flag-off / 10.0 MB ATLS at t1200; 6.6 / 9.5 MB at t5000). The extra snapshot JSON is +0.64 MB at t1200 flag-off (1,337,308 vs 670,738), +0.66 MB ATLS (1,261,498 vs 570,900), +1.12 MB at t5000 flag-off (2,351,156 vs 1,175,590), +1.19 MB ATLS (3,208,631 vs 1,958,318). The closed-file delta is 0.6 MB at t1200 and 0.9 / 1.7 MB at t5000.
- At t5000 on main, snapshot JSON is 721.2 MB of 1,030.0 MB (flag-off) and 681.0 of 1,012.6 (ATLS). The window deletes the 832 older snapshots, which is nearly all of it. The remaining file is mostly the window's events plus two snapshots.
- The two-snapshot window is still steady from t1200 to t5000: 15.9 and 18.4 MB at t5000 against 15.3 and 15.9 at t1200. Freed pages are reused.
- Other seeds at t1200 were measured only with one snapshot (`results/size-*-1200-*.jsonl`): flag-off 2718 154.4 to 14.1 MB, 4096 169.7 to 14.6 MB; ATLS 2718 145.6 to 13.3 MB, 4096 162.1 to 14.8 MB. Not remeasured with two snapshots. On 1847 the second snapshot added 0.6 MB at t1200.
- The archive flag at t1200 is the old size (not re-run with `pre_start`): 162.5 MB (flag-off), 158.0 MB (ATLS), 201 snapshots (`results/size-archive-*.jsonl`).
- Window event rows are 18.6k to 26.4k, consistent with the 20 to 28 thousand a month noted at `persistence.ts:14`; the 40,000 check-in cap does not bind.

### 1.4 Hash and replay

Hash-neutral: no sim path changes (`leadingCount` is a store hint; `pre_start` is a WeakMap mark). All six pins unchanged with the item 1 patch applied on the replay-patched tree (`results/pins-item1-window.jsonl`): flag-off 1847 `7f76e474` / `94de9c02`, 2718 `976c40bd` / `7a3741c9`, 4096 `08943ea5` / `af6eeaea`; ATLS 1847 `85658e53` / `5367691c`, 2718 `aa54ada1` / `faf5798a`, 4096 `e4361ee1` / `7e93eab2`. Whole-log replay exact in all six. The recovery harness (1.5) compares `stateHash` of a recovered world to a live twin.

### 1.5 Recovery exactness (`store.ts recover`)

A twin run: `L` has no store; `S` writes every tick and every between-tick command (`confirm-order`, `offer-contract`, as `POST /api/commands` does at `server.ts:223`) to a window store and, at each crash tick, closes the store, reopens, recovers, and continues. Crash ticks 5, 6, 7, 23-25, 71-73, 96, 150, 299-301, 500, 719-721, 899, 1000, 1199 (21 per 1,200-tick run). The harness also recovers at every multiple of 100 ticks and compares the hash to the live twin.

| Run | Replay patch + item 1 (column, two snaps) | Crashes | Recovered hash equals live | Stored seats equal live seats | Final hash equal | Every 100 ticks exact |
|---|---|---|---|---|---|---|
| flag-off and ATLS, seeds 1847, 2718, 4096, 8000, 2000 (10 runs, 1,200 ticks) | applied | 210 | **210** | **210** | 10/10 | **120/120** (12 per run) |
| ATLS 10000, 1,700 ticks, crashes at 300, 1619-1626, 1699 | applied | 10 | **10** | 10 | yes | **17/17** |
| **Total** | | **220** | **220** | **220** | | **137/137** |

On seed 1847 alone (the remeasure the Lead asked for): 21/21 flag-off and 21/21 ATLS, every-100 12/12 each, final hash equal.

**The recoveries used the column, not the type list.** `USE_COLUMN_ONLY=1` makes `isLeadingEvent` ignore `OUT_OF_TICK_TYPES` for unmarked events, so a pass means `pre_start` is what replay read. Same crash points: 1847 flag-off 21/21 and 12/12, 1847 ATLS 21/21 and 12/12, ATLS 10000 10/10 and 17/17 (`results/recover-column-only.jsonl`).

Previously measured, not re-run in this revision: without the replay patch, ATLS 10000 was 3/10 (first miss t1,621); the same 10 runs without the replay patch were 210/210 (those seeds do not hit the leading-block bug); all five patches, flag-off and ATLS, 1847 and 8000, were 84/84; seats stored beside the snapshot equalled the old shadow replay's seats at 10 snapshots on ATLS 1847 (`SHADOW=60`, `ARCHIVE=1`, 600 ticks); the 400-tick legacy migrate on 1847 (67 snapshots, 48,276 events, no seat rows) recovered equal through the old shadow path, continued 30 ticks, and after the first new snapshot held 1 snapshot, 1 seat row, 23,425 events. The new recover path still falls back to the type list when `pre_start` is NULL, and a legacy store still gets the `ALTER TABLE` and the seat-row backfill. I did not re-run that migrate against two snapshots.

**Feeding counts** in the two-snapshot window equal the in-memory whole-log counts on flag-off and ATLS, seeds 1847 and 2718 (4/4): 25,361 of 160,338; 23,568 of 157,702; 26,361 of 159,451; 23,343 of 145,284 (`results/feeding-window2.jsonl`).

**Between-tick guard** (`between-tick-guard.ts`, `results/between-tick-guard.jsonl`): the listed types match `OUT_OF_TICK_TYPES`; a 120-tick scripted confirm-order run writes 120 tick appends and 9 between-tick appends, all of listed types; appending `battle-resolved` with `{ betweenTicks: true }` throws.

### 1.6 Dependency on the replay fix

`recover()` still replays the events after the snapshot with `replayWithSilentStarts`. A snapshot is written when the clock lands on a morning, so the replayed events begin with the next tick's leading block, which is where `replay-leading-block.patch` ([copy](engine-hygiene/replay-leading-block.patch), `tick-start.ts` only, from `docs/replay-divergence` @ `0108951`, now on `main` as #204) applies. With the column present, `isLeadingEvent` uses `pre_start` and does not consult the type list (section 1.5, column-only proof). The list remains the fallback for unmarked legacy rows. Seat persistence removes the *second* replay path (from sequence 0) but not this one. Item 1 is exact only with the patch on a restart in the failing window. The patch was applied, uncommitted, for every measurement in this note; the item 1 patch is written to apply on top of it.

### 1.7 Acceptance (property and liveness)

1. After any snapshot in window mode, once two snapshots exist: `snapshots = 2`; each has a `snapshot_seats` row equal to `exportGovernorSeats(world)` at that snapshot; every `events.sequence` after the older kept snapshot is present, and events in the last 180 ticks are present even if they precede it; `MIN(events.tick) >= world.tick - 180` unless an event after the older snapshot is older (a command appended long before a tick).
2. Recovery equals live: for crash ticks across a run including between-tick commands, `stateHash(recover()) == stateHash(live)` and the continued run's final hash is equal. Recover uses the `pre_start` column when it is 0 or 1. A hash mismatch on the latest snapshot falls back to the previous.
3. Standard sweeps check replay every 100 ticks. The recovery harness did: 137/137 exact on the 220-crash runs.
4. Seats: `exportGovernorSeats(recovered) == exportGovernorSeats(live)`; in archive mode equal to the old shadow replay's seats.
5. `eventsPage` walks back to the window floor and then reports `hasMore = false`; no page overlaps.
6. `feedingCounts()` equals the whole-log counts after any number of pruned snapshots.
7. Archive mode: row counts equal main's (201 snapshots, 160,337 events at t1200 on 1847 flag-off).
8. Size: after t1200 the file stays under 20 MB on the measured 1847 runs (15.3 to 18.4 MB); no growth between t1200 and t5000 beyond the two snapshots' growth.
9. Pins unchanged on all six; event log unchanged.
10. An unlisted event type appended between ticks throws; the listed types are exactly `OUT_OF_TICK_TYPES`.
11. Health reports both `lifetimeEvents` and `windowEvents`.

### 1.8 Engineer test plan

- T1 window: run 400 ticks into a store; assert acceptance 1 and the oldest-tick bound; two snapshots once a second morning has been written.
- T2 recover: crash at a morning, a non-morning and between ticks; assert hash equality with a twin, including after a `confirm-order` appended between ticks. Include a hash-mismatch on the latest snapshot that still recovers from the previous.
- T3 seats: a world with a seated governor; recover; assert `governorId` and `governorLevyRate` equal the twin's, and that the levy and stipend of the next tick match.
- T4 legacy store: build a store with the old code path (or a fixture, `pre_start` NULL, no seat rows), open with the new, assert the type-list fallback and that the first snapshot writes a seat row, the column, and prunes down to two snapshots.
- T5 feeding counts across a prune; T6 `archive: true` keeps all rows.
- T7 `eventsPage` ends at the floor.
- T8 between-tick guard: every listed type is accepted; an unlisted type with `{ betweenTicks: true }` throws (`between-tick-guard.ts`).
- T9 sweeps check replay every 100 ticks.
- Fixtures: `tests/captive-intelligence.test.ts:477`, `tests/ransom-split.test.ts:319` delete newer snapshots to force recovery from an older one. They still fail with two snapshots when they want a snapshot older than the previous (the same four tests: `captive-intelligence` "the first headless release…", "Mina Vale's release…", "seed 2718 replays through tick 160…"; `ransom-split` "a ransom release recovers from the snapshot before it"). Open those stores with `archive: true`. Full suite with the earlier one-snapshot item 1: 686/690 (`results/item1-test-failures.txt`). I did not re-run the full 690 with two snapshots; the same four still fail.

## 2. (Contracts)

Not in this note, per ruling 2.

## 3. News guard, then news prune (ruling 3)

### 3.1 Why a guard

Arrival posts every bag item the port lacks (`engine.ts:3500-3506`, in `progressTravel`, `:3474`). A pruned port lacks items it once held, so a plain prune makes arrival re-post them and shifts `nextEventSequence`: the state-prune note measured the log changing for exactly this reason. The bag is a copy of the origin port's ledger taken at departure (`state.ts:860-870`, `news.ts:163`) and is deleted on arrival (`state.ts:880`), so it is short-lived.

### 3.2 Design

- **Retention** (`news.ts` `pruneNews`): an item stays while `tick - observedTick <= 180` (`NEWS_RETENTION_TICKS`, the check-in window, a literal like `occupation.ts:22`). An older item stays only if it is the latest, by `observedTick` then `sequence`, of its kind about a port: the latest `settlement-claimed`, `settlement-purchased` and `secession-joined` (read by `ownLossCouriers`, `news.ts:198`, and `learnedHolder`, `client-readiness.ts:153`) and the latest item carrying an `occupation` (`snapFromNews`, `client-readiness.ts:109`). Engine readers use only items at most `NEWS_AGE_CAP` = 24 old (`news.ts:30`), so nothing the sim decides on moves.
- **Where it runs:** the `tick-advanced` reducer (`state.ts:1149`), on mornings (`tick % ticksPerDay === 0`, the line that already clears `allowanceRemaining`). That is in `applyEvent`, so live and replay prune identically with no replay hook.
- **The guard** (`news.ts` `newsRetained`, used at `engine.ts:3500`): at arrival, skip a bag item the port lacks when appending it would be pruned straight away. It is a pure function of the ledger and the tick.
- **Not pruned:** `carriedNews` (bounded by one origin ledger and cleared on arrival), the `news-posted` events (they are the log).

Patch: [item3-news-guard-prune.patch](engine-hygiene/item3-news-guard-prune.patch) (`news.ts`, `engine.ts`, `state.ts`). The guard alone is the same patch with the `tick-advanced` hunk left out.

### 3.3 Touch points

`news.ts:30` (new constant after `NEWS_AGE_CAP`), `news.ts:61` (`pruneNews`, `newsRetained` after `ledgerHas`), `engine.ts:48` (import), `engine.ts:3500` (guard), `state.ts:1149` (`tick-advanced`: prune), `state.ts:3` (import). Readers checked: `news.ts:111`, `:141-160`, `:198-215`; `client-readiness.ts:109`, `:153`, `:177` (`portNewsFor` lists the whole ledger, so the port-news panel now shows 180 ticks and the latest ownership items; a visible change). The Lead accepted that panel as OK.

### 3.4 Measured (13 seeds × 1,200 ticks, flag-off and ATLS; `news.ts`, `cmp.ts`)

| Compare to main | Guard only | Guard + prune |
|---|---|---|
| Event log identical (digest incl. `sequence`) | **26/26** | **26/26** |
| Event count | 2,105,611 and 2,015,488, equal | equal |
| t72 pin | unchanged 26/26 | unchanged 26/26 |
| t1200 pin | unchanged 26/26 | **moves 26/26** |
| Claims, port changes, battles, captures, secessions, wipeouts | equal | equal (flag-off 682 / 713 / 927 / 247 / 31 / 0; ATLS 497 / 543 / 898 / 214 / 32 / 0) |
| Replay exact | 26/26 | 26/26 |

Why it is identical: on main, arrival posts that are old are rare. Of 7,798 (flag-off) and 7,316 (ATLS) arrival posts, 390 and 272 were older than 24 ticks and **0 were older than 180** (and 0 older than 240). So the guard never fires on a real post in 1,200 ticks, and the prune only removes items nobody posts again.

Ledger and state size at t1200 (13 seeds): items 10,396 to 1,503 (flag-off, max port 246 to 43), 9,708 to 1,418 (ATLS, max 237 to 39); ledger JSON 2.12 MB to 0.31 MB; whole-state JSON 7.39 to 4.50 MB (-39 %) and 7.36 to 4.65 MB (-37 %). Seed 1847 at t5000: items 3,024 to 56 (max port 758 to 16, flag-off) and 3,268 to 175 (819 to 46, ATLS); state JSON 1.02 to 0.41 MB (-60 %) and 1.61 to 0.58 MB (-64 %).

**Where identity ends** (seed 1847, 5,000 ticks, `results/news-compare-5000.txt`, `news-old-arrivals-t5000.txt`):

| | Flag-off | ATLS |
|---|---|---|
| Main arrival posts older than 180 | 60 (ages 181 to 327), first at **t2,121** | 76 (183 to 335), first at **t2,716** |
| Event count, main vs guard + prune | 625,997 vs 625,940 (-57) | 666,157 vs 666,082 (-75) |
| Still posted by the pruned run (latest ownership kept) | 3 | 1 |
| Outcome counts | equal | equal |
| Replay exact | yes | yes |

The difference is exactly main's old posts minus those the retention keeps (60 - 3 = 57; 76 - 1 = 75). These are a sailor reaching a port that never held a batch of items (isolated for over 300 ticks). Main posts them. The guard does not, because the port would drop them, and from then on `nextEventSequence` and the later `news-${sequence}` ids differ from main. The Lead accepted this: dropping re-posts of items a port never held is a deliberate bug fix. No tombstone.

### 3.5 Acceptance

1. Guard alone: all six pins unchanged and event log identical to main on 13 seeds × 1,200, both configs.
2. Prune: t72 unchanged; event log identical to main through t1,200 on 13 seeds, both configs; replay exact.
3. After any morning, every ledger holds no item older than 180 ticks except the latest of each kept kind per port; `ownLossCouriers` and `learnedHolder` return the same value as on an unpruned control for every port and viewer (property check against a control twin).
4. Liveness unchanged: claims and port changes > 0 on every seed; no new wipeouts; secessions on ≥ 6 of 13 seeds (measured 12 and 11).
5. Beyond t1,200: the pruned log equals the control log minus main's old never-held arrival posts (count check, as above), outcomes equal, replay exact.

### 3.6 Engineer test plan

- T1 `pruneNews`: items at ages 0, 180, 181; the latest claim kept at 400; two claims about one port keep only the newer; an occupation item kept while newest.
- T2 guard: a sailor with a bag containing a 200-old non-latest item arrives; no `news-posted`; a 200-old latest-claim item the port lacks is posted.
- T3 reducer: a `tick-advanced` onto a morning prunes; onto a non-morning does not; replay of the same events gives the same ledger.
- T4 control twin: run 1,200 ticks with and without the patch, compare event digests (this harness).
- Re-pin: with items 1 and 3b applied together 22 tests fail (`results/item1+3-test-failures.txt`): the 4 of item 1 and 18 more. I did not triage the 18; they are expected to be t1200 hash pins.

## 4. Command holder stored on the faction (ruling 4)

### 4.1 What the derivation does now

`commandHolderId` (`state.ts:307`) scans every character's stored orders and returns the one issuer who is a member of the faction now; two issuers, or none, give null. Consequences:

- A secession hands the seat over by *retargeting the orders* (`state.ts:1135-1141`), so `commandHolderId` resolves to the cover.
- A holder who dies, deserts or is exiled has `factionId` null, so the seat is unnamed, with no event.
- A second member who issues an order makes it two issuers and **unnames the seat**. Measured on main (`nonholder.ts`, seed 1847, player `character-02`): after `character-02` issues three orders, `commandHolderId(world-government)` goes from `character-01` to null (`results/nonholder-main.txt`); with 4a it stays `character-01` (`results/nonholder-4a.txt`). `validateStandingOrder` (`commands.ts`) only requires the recipient to share the issuer's faction. Headless runs never do this.
- `recordBattleConsequences` (`engine.ts:1123`) takes `character.standingOrders.find(order => order.issuerId in character.relationships)`, the first order on file **whatever its status**, and so keeps updating a relationship toward a former issuer after the order is refused or completed.

### 4.2 Design

`Faction.commandHolderId?: string` (`types.ts`, beside `actingCommanderId` at `:26`).

- **Written:** at the scenario start (`scenario.ts:287-301`: `character-01` for `world-government`, `character-14` for `free-tide`, matching `orderFor`, `scenario.ts:251`), and when a secession names a successor (`state.ts:1135`: `if (previous.commandHolderId === ownerId) previous.commandHolderId = successorId`). The order retarget stays, so the issuer on each order still matches the seat. A breakaway starts with none, as today. The fixed prototype also calls `syncStoredCommandHolder` on `character-died`, `character-deserted`, `desertion-withheld`, and `standing-order-issued`. That write will not overwrite a living stored holder, so a non-holder issue still does not unseat.
- **Read:** `commandHolderId(world, factionId)` returns the stored id only while that character is a member (`world.characters[id].factionId === factionId`). If the stored holder is missing or not a member, it falls back to `seatFromOrders` (the old derivation). That is what lets a unique new issuer refill a vacancy, matching main. The first 4a prototype returned null and left the stored field pointing at the dead holder, so a later issue did not become the seat; that was fixed in [item4-stored-holder-state.patch](engine-hygiene/item4-stored-holder-state.patch).
- **Deliberate change:** a non-holder member issuing an order no longer unseats the faction. Re-measured after the fix (`results/nonholder-4a-fixed.txt`, seed 1847, player `character-01`): after `character-03` and `character-04` each receive an order from the player, the seat is still `character-01`.
- **Migration:** `normalizeWorldState` (`state.ts:61`) fills an absent field from the orders once (the old derivation, kept private as `seatFromOrders`), so old snapshots load.
- **4c, the `engine.ts:1123` read:** not accepted yet. The current 4c prototype (`item4-battle-read-seat.patch`) uses `seatId = commandHolderId(world, character.factionId)` and updates the relationship toward it if the character has one and is not the seat. The alternative (section 4.3) uses the issuer of the order that just resolved (`plan.orderId` if present, else the first open order). The event strings ("victory under standing orders") are unchanged.

Patches: [item4-stored-holder-state.patch](engine-hygiene/item4-stored-holder-state.patch) (4a, including the vacancy-refill fix: `types.ts`, `scenario.ts`, `state.ts`), [item4-battle-read-seat.patch](engine-hygiene/item4-battle-read-seat.patch) (4c-seat: `engine.ts`), and [item4-battle-read-policy.patch](engine-hygiene/item4-battle-read-policy.patch) (measurement instrumentation, `ORDER_REL=main|open|plan|seat`).

#### Succession on death, retirement and exile (ruling 4)

Main's current succession, then the prototype. Evidence: `succession.ts`, `results/succession-main.json`, `succession-v4a.json` (before the fix), `succession-v4a-fixed.json` (after), seed 1847, holder `character-01` unless noted. File:line citations are on `b797463` src (the 4a field is not in src).

- **Death vacates.** Main: `aging.ts` uses `policy: "vacant"` (`:42`, `:94`); when the dead character is the holder, the death data sets `commandFactionId` and `actingCommanderId = null` (`:119-123`). The `character-died` reducer (`state.ts:1003-1030`) sets `factionId = null` and only updates `actingCommanderId`; it does not retarget orders. Both main and fixed 4a: `commandHolderId` goes to null; acting stays null; `dead` is true. Fixed 4a also deletes the stored field (`storedAfter: null`). The first prototype left `storedAfter: character-01`, and the read still returned null because the dead holder was not a member.
- **Retirement keeps the seat.** `lifecycle.ts` `character-retired` (`:75`) only sets `lifecycle.retired`; faction membership is unchanged. `isRetired` skips autonomous decisions (`engine.ts:4625` on main) and vacates governor seats (`governor.ts:81`), not the command seat. Both arms: holder remains `character-01`, `retired: true`, `factionId` still `world-government`. Fixed 4a keeps `storedAfter: character-01`.
- **Exile.** There is no `character-exiled` event and no path that clears a holder's `factionId` for "exile." `EXILE_RECOVERY` (`exile.ts`) is home-claim motivation only; `commandHolderId` is read at `exile.ts:36` as the believed holding faction's holder, not written. Closest analogues, measured: **desertion** vacates (both arms; `state.ts:993` `character-deserted` clears `factionId`; fixed 4a deletes the stored field). **Capture** keeps the seat and sets `actingCommanderId` to `character-05` (both arms; `assignActingCommander` from the `character-captured` reducer, `state.ts:951-962`, `:481-485`).
- **Vacancy refill, required to follow main.** After holder death, a `standing-order-issued` by `character-02` to `character-03` makes `commandHolderId` = `character-02` on main (`issue-after-death-vacancy.afterIssue`). The first 4a prototype stayed `null` with `storedAfter: character-01`. The fix falls back to `seatFromOrders` when the stored holder is not a member, and `syncStoredCommandHolder` writes `character-02`. Re-measured: v4a-fixed matches main on all five cases.

### 4.3 Does it move pins?

**4a: yes, all six, from t0.** `factions` is hashed, so a new field on two factions changes the hash at tick 0, not only later (table above: every t72 and t1200 differs). The **event log does not change**: digests including `sequence` are identical to main on 26/26 runs, outcomes equal, replay exact 26/26. An oracle compared the stored seat to the legacy derivation for every faction on every tick of all 26 runs: **0 mismatching ticks**. The oracle saw no seat change at all (0 holder changes), because no headless run reaches a secession by the holder or a non-holder order, so the transfer path is covered only by the fixtures and the succession probe above.

A hash-neutral variant exists only if the field is left out of the hash, which defeats its purpose (it would be off-world state like the governor seats). I do not recommend it.

**4c is not accepted yet.** The Lead asked for both the current 4c (update toward the stored / derived faction seat) and the alternative where the update goes toward the issuer of the order that just resolved (likely the same as, or close to, the first open order). Measured with `ORDER_REL` (`item4-battle-read-policy.patch`) on otherwise-unpatched main (derived `commandHolderId`, no 4a field), 13 seeds × 1,200 ticks, flag-off and ATLS (`results/rel-*-*.jsonl`, `rel-compare-*.txt`). Policies: `main` = first order of any status whose issuer is in `relationships` (including closed); `open` = first open order (`pending` / `active` / `awaiting-confirmation`); `plan` = issuer of `plan.orderId` if present, else first open order; `seat` = `commandHolderId`. The main-arm pins match the six baseline pins. Call counts below are from the main-arm worlds (the fair oracle: same battles).

**open vs plan are byte-identical, 26/26.** Event digest, counts, pins and outcomes match. `planUsed` is 19 flag-off / 15 ATLS on main, and `openEqPlan` equals the call count in every arm (927 flag-off / 898 ATLS on main). So "issuer of the order that just resolved" equals the first open order in these runs.

Relationship-call counts on the main-arm worlds:

| | Flag-off | ATLS |
|---|---|---|
| Calls (`recordBattleConsequences`) | 927 | 898 |
| Main would fire (first order, any status) | 805 | 804 |
| Open / plan would fire | 19 / 19 | 15 / 15 |
| Seat would fire | 650 | 716 |
| First order exists but is not open (`mainClosed`) | 786 | 789 |
| `mainEqSeat` | 772 | 810 |
| Applied under the main policy | 805 | 804 |

**open (and plan) vs main.** Event log differs 13/13 both configs. Replay exact 13/13. Liveness holds (claims and port changes > 0 on every seed, no wipeouts, secessions on 10 of 13 seeds, above the ≥ 6 gate).

| Totals, 13 seeds × 1,200 | Main | open / plan |
|---|---|---|
| flag-off: claims / port changes / battles / captures / secessions | 682 / 713 / 927 / 247 / 31 | 644 / 679 / 893 / 246 / 35 |
| flag-off: events | 2,105,611 | 2,103,162 (−2,449) |
| flag-off: secession seeds; min claims / min port changes | 12; 28 / 31 | 10; 28 / 31 |
| flag-off: rel updates applied / calls | 805 / 927 | 16 / 893 |
| ATLS: claims / port changes / battles / captures / secessions | 497 / 543 / 898 / 214 / 32 | 527 / 570 / 904 / 211 / 29 |
| ATLS: events | 2,015,488 | 2,023,480 (+7,992) |
| ATLS: secession seeds; min claims / min port changes | 11; 25 / 28 | 10; 25 / 29 |
| ATLS: rel updates applied / calls | 804 / 898 | 15 / 904 |
| Wipeouts | 0 | 0 |
| t72 / t1200 pins unchanged | — | **0/13** and **0/13** both configs |

Open pins (t72 / t1200): flag-off 1847 `c171b5a1` / `8af7c4ba`, 2718 `f18fafbc` / `58ad2981`, 4096 `9babfc34` / `e5ce4c0e`; ATLS 1847 `d9931da2` / `51584692`, 2718 `bed88bea` / `fd16def6`, 4096 `ad04b6d8` / `76868b64`.

**seat (current 4c) vs main.** Event log identical 1/13 flag-off, 2/13 ATLS (the same identity counts as the earlier 4a+4c table). Replay exact 13/13. Liveness holds. These pins are without 4a (no hashed field), so t72 can stay; the earlier 4a+4c t72 pins had already moved.

| Totals, 13 seeds × 1,200 | Main | seat (4c) |
|---|---|---|
| flag-off: claims / port changes / battles / captures / secessions | 682 / 713 / 927 / 247 / 31 | 688 / 718 / 933 / 244 / 30 |
| flag-off: events | 2,105,611 | 2,107,747 (+2,136) |
| flag-off: secession seeds; min claims / min port changes | 12; 28 / 31 | 12; 28 / 31 |
| flag-off: rel updates applied / calls | 805 / 927 | 654 / 933 |
| ATLS: claims / port changes / battles / captures / secessions | 497 / 543 / 898 / 214 / 32 | 497 / 543 / 898 / 214 / 32 (identical totals) |
| ATLS: events | 2,015,488 | 2,015,400 (−88) |
| ATLS: secession seeds; min claims / min port changes | 11; 25 / 28 | 11; 25 / 28 |
| ATLS: rel updates applied / calls | 804 / 898 | 716 / 898 |
| Wipeouts | 0 | 0 |
| t72 pins unchanged | — | **13/13** both configs |
| t1200 pins unchanged | — | **1/13** flag-off, **2/13** ATLS |

Seat pins (t72 / t1200): flag-off 1847 `7f76e474` / `dc0ab365` (t72 stays, t1200 moves), 2718 `976c40bd` / `7a3741c9` (both stay), 4096 `08943ea5` / `1e80b2c9`; ATLS 1847 `85658e53` / `7313f220`, 2718 `aa54ada1` / `a832ce13`, 4096 `e4361ee1` / `5b2a5d2e`.

The earlier 4a+4c table (with the hashed field, `results/holder-v4c-*.jsonl`) is unchanged as a 4a+4c reference: event-log identity 3/26, flag-off totals 688 / 718 / 933 / 244 / 30 and 2,107,747 events, ATLS totals identical to main and 2,015,400 events, t72 already moved by 4a, liveness 28 / 31 and 25 / 28 minimums, 12 and 11 secession seeds.

### 4.4 Touch points

`types.ts:26`; `scenario.ts:293`, `:300`; `state.ts:61-84` (normalize), `:307-319` (`commandHolderId`), `:1135-1141` (secession); `engine.ts:1123-1145`. Readers of `commandHolderId` that change only by going through the stored field: `news.ts:44`, `governor.ts:56,79,86`, `tax-rate.ts:183,259`, `secession.ts:17,55,164,204,338,377,388,428,476`, `secession-aftermath.ts:114`, `dashboard/allowance.ts:48`, `allowance.ts:84,99`, `aging.ts:119`, `exile.ts:36`, `dashboard/visibility.ts:961`, `dashboard/wording.ts:317,734,926`, `engine.ts:3694,3986,4121,4122`, `state.ts:280,485,499`.

### 4.5 Acceptance

1. 4a: event digests identical to main on 13 seeds × 1,200, both configs; oracle equals the legacy derivation on every tick; replay exact; new pins as in the table.
2. Seat transfer: after a secession with a successor, `commandHolderId(previous)` is the successor, the new faction has none, and replay agrees.
3. A holder who dies or deserts leaves the seat unnamed (null) and a withheld desertion restores it. Retirement does not leave the faction and does not vacate the command seat. There is no exile seat path; capture keeps the seat and sets `actingCommanderId`. After a vacant death, a unique new issuer becomes the holder (the vacancy-refill fix).
4. A non-holder issuing an order does not change `commandHolderId`.
5. 4c is not accepted yet. When it lands, liveness as before (claims and port changes > 0 on every seed, no new wipeouts, secessions on ≥ 6 of 13). Measured for both variants in 4.3: seat 28 / 31 and 25 / 28 minimums, 12 and 11 secession seeds; open 28 / 31 and 25 / 29, 10 and 10 secession seeds.

### 4.6 Engineer test plan

- T1 scenario: both factions carry the seat from tick 0.
- T2 secession: holder owns a port and secedes with a successor (fixture exists: `tests/secession-command.test.ts`).
- T3 leaving: kill or desert the holder; seat unnamed; `desertion-withheld` restores. Retire the holder; seat and membership unchanged. After a vacant death, a unique new issuer becomes the holder. There is no exile event to fixture.
- T4 two issuers: a second member issues an order; seat unchanged.
- T5 legacy snapshot: a world without the field loads and gets the seat from its orders.
- T6 4c: a character with a refused order from a non-seat issuer gets no relationship update after a battle.
- Fixtures: `tests/wg-picker.test.ts:83` and `tests/secession-command.test.ts:357` move the seat by editing `order.issuerId`. They must set `faction.commandHolderId` instead (3 tests fail otherwise: "dormant holder path…", "a declaration by someone who does not hold the seat…", "the owner gate is presence, membership, and the holder split"). With 4a + 4c, 37 tests fail in all (`results/item4-test-failures.txt`); I did not triage each, but the rest assert pinned hashes.

## 5. Combat-sighting freshness (ruling 5)

### 5.1 What a sighting does

`combatForecast` (`combat.ts:93`) adds `sighting.partyPower` for every stored sighting at the target, whatever its age (`combat.ts:133-147`; the comment names 72). `mergePartySightings` never deletes (`state.ts:112`), so the commander's map grows to 27 to 33 sightings by t1200 in the scripted run below.

**It does not affect any fight.** Callers: `view-model.ts:1550` (the forecast shown to the commander), `engine.ts:1556` and `combat.ts:242` (a battle's own forecast), and the last two pass `observedLocally: true`, which skips the sighting sum (`combat.ts:139`). So a stale sighting skews the *forecast the commander reads*. This answers "stale sightings shouldn't win fights": they cannot, but they do make a port look more heavily defended than it is.

### 5.2 Design

Count a sighting only if `world.tick - observedTick <= GARRISON_FRESHNESS_TICKS` (**72**, `agency.ts:59`). It fits: it is the horizon of a garrison report (the belief weight falls as `exp(-age/72)`, `agency.ts:82-90`), a sighting is a garrison report about parties, and the existing comment at `combat.ts:136` already names 72. Add a revealed-factor line when some were left out: "N older sighted parties at this port not counted (over 72 ticks)". Hard cutoff, not a decay; a decay (`exp(-age/72)`, floor 0.08, as `beliefWeight`) is the alternative, not measured.

Left as is, deliberately: the stored sightings (nothing deleted, so no hash change) and `projectCharacter`'s `storedSighting` (`visibility.ts:724`). The Lead confirmed this split: the forecast is a 72-tick hard cutoff; the card projection keeps showing older sightings, labeled with their `observedTick` (and `ageTicks` via `projectPartySighting`, `:197`, attached at `:798`). Dated knowledge stays visible as long as it is labeled. The projection does not hide them.

Patch: [item5-sighting-freshness.patch](engine-hygiene/item5-sighting-freshness.patch) (`combat.ts` only).

### 5.3 Measurement

Headless runs never store a sighting (nobody surveys), so the baseline would show nothing. `sight.ts` scripts the commander (`character-01`): confirm every awaiting order and, every 24 ticks, send two officers of its faction to `explore` a rotating port it does not hold. The reports store sightings on the commander. Every 12 ticks it reads `combatForecast` for every other port. Two arms, on a tree without and with the patch, 13 seeds × 1,200 ticks, flag-off and ATLS (`sight-compare.ts`, `results/sight-compare-72.txt`). The scripted run is a different world from the headless pins (it issues orders), so its totals differ from the headless totals.

| 13 seeds × 1,200 | Flag-off | ATLS |
|---|---|---|
| Sim stream identical (event digest, h72, h1200, count) | **13/13** | **13/13** |
| Claims / port changes / battles / captures / secessions, both arms | 617 / 637 / 846 / 199 / 20 | 515 / 568 / 878 / 193 / 36 |
| Wipeouts; secession seeds; min claims / min port changes | 0; 8/13; 23 / 25 | 0; 11/13; 30 / 34 |
| Explore orders accepted / failed | 1,141 / 133 | 1,150 / 104 |
| Forecasts read | 3,904 | 3,902 |
| …with a stored sighting at that port | 3,237 | 3,209 |
| …with a sighting older than 72 (first at t108) | 2,849 | 2,791 |
| Win chance (low) changed | 2,690 | 2,716 |
| Defender power changed | 2,842 | 2,791 |
| Headline outlook band changed | 1,300 | 1,352 |
| Revealed-factor count changed | 1,247 | 1,289 |
| Win chance low, windowed minus main: median / p90 / max | +11.6 / +38.1 / +75.0 | +12.8 / +37.9 / +67.7 |
| Defender power low, median change (largest) | -260.9 (-2,498.1) | -258.5 (-3,069.7) |

So the behavior deltas the Lead asked for (battles, captures, claims, port changes, wipeouts, secessions) are **zero**, by construction and by measurement. The delta is in what the commander reads: in about 70 % of forecasts (2,849 of 3,904; 2,791 of 3,902) a stored sighting older than 72 ticks was in the defense sum, and the window raises the shown win chance by a median of 11.6 to 12.8 points.

Sensitivity (same harness; `results/sight-compare-24.txt`, `-180.txt`): window 24 (`NEWS_AGE_CAP`) changes 3,036 / 3,049 win chances, flips the outlook band 2,025 / 2,114 times, median +29.6 / +30.0. Window 180 (`CHECK_IN_TICKS`) changes 1,943 / 1,993, flips the band 588 / 648 times, median +1.1 / +1.1. Sim identical 13/13 in both. 72 sits between them; 24 is the news-reading cap, a rumor's age, not a garrison's.

### 5.4 Acceptance and tests

- Sim streams identical with and without the patch (this harness): a property, not a balance target.
- A sighting aged 72 counts; 73 does not; the line names the count left out; `locallyObserved` forecasts are unchanged; a forecast with no sightings is unchanged.
- Engineer tests: T1 forecast with one fresh and one stale sighting; T2 the revealed-factor line; T3 `startingForecast` of a battle is byte-identical (hash neutral). Full suite with item 5: 690/690.

## 6. Hash-neutral vs re-pin

| Slice | Pins | What the Engineer does |
|---|---|---|
| Replay fix | none | land `tick-start.ts` |
| 3a guard | none | none |
| 1 store window | none | `archive: true` in 4 fixtures; add T1 to T7 |
| 5 freshness | none | add 3 tests |
| 4a stored holder | **all six, at t72 and t1200** | re-pin; fix 3 seat-moving fixtures |
| 3b news prune | **t1200 only** (t72 holds) | re-pin the 18 failing tests (not triaged); the port-news panel shows 180 ticks |
| 4c battle read | **t1200 and the event log** (both variants) | **not accepted yet**; waits on the section 4.3 measurement; then own slice; re-pin; liveness gate |

## 7. Ride-along: npc-threads ruling 5 narrowed

The Lead narrowed ruling 5: only the player's own `confirm-order` or `cancel-order` answers an order thread; an `issuer-silent` auto-close does not. [npc-threads.md](npc-threads.md) sections 1, 5, 6.1, the liveness and acceptance lists, T5 and the open question are updated. `requestThreads` in [npc-threads/hook.ts](npc-threads/hook.ts) now returns false for "answered by order" unless the order is `cancelled`, or `completed` with `lastReport.kind === "confirmed"` (the player's confirm; the silent close writes `closed-unanswered`, `state.ts:764-775`). A missing order is not an answer.

Re-run, 13 seeds × 1,200 ticks, recommended caps (`CAPS=Infinity,3,9`), replay patch applied (`results/npc-*.jsonl`, `npc-summary.ts`):

| Run | Openers | Per seed | Per 100 ticks | Threads created | Bin 0 | Bins 1 to 11 mean / p95 / max | Request tab t72 | Request tab t1200 | Max request sampled | All tab t1200 |
|---|---|---|---|---|---|---|---|---|---|---|
| idle, default | 232 | 15–21 | 1.49 | 172 | 13–17 | 0.24 / 1 / 2 | 12 in all 13 | 12–17 | 17 | 12–17 |
| idle, ATLS | 255 | 15–26 | 1.63 | 174 | 13–16 | 0.40 / 2 / 3 | 12 in all 13 | 12–15 | 15 | 12–15 |
| attentive, default | 357 | 23–33 | 2.29 | 181 | 15–19 | 1.01 / 2 / 3 | 0 in all 13 | 0 in all 13 | 1 | 13–17 |
| attentive, ATLS | 394 | 24–35 | 2.53 | 186 | 14–19 | 1.25 / 3 / 4 | 0 in all 13 | 0 in all 13 | 1 | 13–16 |

- **Identical to the message-only run, cell for cell.** In idle runs nothing is ever confirmed or cancelled, so the 12 report threads stay in `request` (the silent close does not remove them), which is what the old rule gave. In attentive runs the player confirms (112 confirms in each, unchanged), and that now answers the thread.
- **The attentive request tab is non-zero twice in all samples:** 1 thread, seed 2000 at t900 (default) and seed 9000 at t100 (ATLS).
- **Stored messages fell** from 719 / 766 to **583 / 630**: the script's replies fell from 181 / 186 to 113 / 118, because a confirmed thread leaves `request` without a reply and the script only replies to what is still in it.
- Replay exact 13/13 in every run, including the commanded runs and the hook-off twin (they were 11/13 and 12/13 before the replay fix). Sim stream equal hook on vs off, 13/13; conversation replay exact 13/13.
- Idle pins with the hook off equal the flag-off and ATLS pins above.

## 8. Landing order

The Lead approved this order, with 4c waiting on the variant measurement (now in section 4.3).

1. **Replay fix** (`docs/replay-divergence` @ `0108951`, now `main` #204 `b797463`, `tick-start.ts` only, hash-neutral). Item 1 and every restore depend on it.
2. **3a, the news guard** (hash-neutral, event-identical). Safe alone; it is what makes 3b safe.
3. **1, the store window** (hash-neutral; two snapshots, `pre_start` column). Fixtures to `archive: true` when they need a snapshot older than the previous one. The largest practical win: 1,030 MB to 15.9 MB flag-off / 18.4 MB ATLS at t5000 on 1847.
4. **5, sighting freshness** (hash-neutral; 72-tick forecast cutoff; card projection keeps older sightings labeled). Independent; can land any time.
5. **One re-pin slice: 4a + 3b.** Both leave the event log identical to main (through t1,200 for 3b), so one re-pin covers them and the diff is state only. Do it after the defaults flips the Lead mentioned, or the pins will move again. 4a includes the vacancy-refill fix in section 4.2.
6. **4c, the `engine.ts:1123` read.** Not accepted yet. Behavior change, own slice, liveness-gated, waiting on the Lead's choice between the stored-seat read and the first-open / just-resolved read (section 4.3).
7. Contracts prune: later, as ruled, as its own slice.

## 9. Questions for the Lead

All seven questions from the previous revision were answered on 2026-11-27. See **Rulings (Lead, 2026-11-27)** above. Short pointers: (1) news prune accepted, no tombstone; (2) two snapshots; (3) CLI archives, dashboard windows, health shows both counts; (4) stored-holder rule approved, succession must match main (confirmed and fixed in 4.2); (5) 4c not accepted yet, both variants measured in 4.3; (6) 72-tick hard cutoff on the forecast, projection keeps labeled stale sightings; (7) `portNewsFor` OK.

## 10. Reproduce

All under `docs/design/engine-hygiene/`; run from the repository root with `node --experimental-strip-types`. The replay patch and the item 1 / 3 / 4 / 5 patches are applied to the working tree, not committed. Item 1 applies on top of the replay patch.

```
git apply docs/design/engine-hygiene/replay-leading-block.patch
git apply docs/design/engine-hygiene/item1-store-window.patch
pins.ts <label>                                  # six pins + whole-log replay
store.ts size|recover|feeding|migrate-write|migrate-read <label> <flag-off|atls>   # item 1 (SEEDS, TICKS, CRASH, ARCHIVE, SHADOW, DB); recover also checks every 100 ticks
USE_COLUMN_ONLY=1 store.ts recover <label> <flag-off|atls>                         # prove recover used pre_start, not the type list
between-tick-guard.ts
news.ts <label> <flag-off|atls>; cmp.ts news base prune                              # item 3
holder.ts <label> <flag-off|atls>; cmp.ts holder base v4c                            # item 4 (4a)
ORDER_REL=main|open|plan|seat holder.ts <label> <cfg>                                # 4c variants (item4-battle-read-policy.patch)
succession.ts ; nonholder.ts
sight.ts <label> <flag-off|atls>; sight-compare.ts base win72                        # item 5
npc-summary.ts npc-idle-default.jsonl ...                                            # section 7
```

Apply a patch with `git apply docs/design/engine-hygiene/<patch>`; the five apply together on `90433a8`. Each harness is run once without and once with its patch (`git stash` or `git apply -R`). Full-suite results: `results/item1-test-failures.txt` (4 fail), `item4-test-failures.txt` (37 fail with 4a + 4c), `item5-test-failures.txt` (0 fail), `item1+3-test-failures.txt`.
