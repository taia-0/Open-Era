# Engine hygiene: store window, news guard and prune, stored command holder, sighting freshness

Spec on `main` `90433a8` (#203 npc-threads merged). Offline, no AI calls, $0, Node v24.22.1. Raw rows, harnesses and the prototype patches are in [engine-hygiene/](engine-hygiene/). **No patch is committed to `src`.** The Lead's rulings this answers: (1) the store is a window, with seats persisted; (2) the contracts prune is not in this note (it lands later, after the defaults flips); (3) a news guard first, then the news prune; (4) the command holder is stored on the faction; (5) combat sightings get a freshness window, measured as its own slice. A ride-along edit narrows npc-threads ruling 5 (section 7).

## 0. Summary

| # | Item | Hash | Event log | Replay / recovery | Landing |
|---|---|---|---|---|---|
| 1 | Store as a window, seats on the snapshot, opt-in archive | **neutral** (store layer only) | unchanged (rows are dropped from the store, none are emitted) | 220/220 recoveries equal live with the replay fix, plus 84/84 with all five patches (section 1.5); needs the replay fix | second |
| 3a | News **guard** (arrival does not post what the port would drop) | **neutral**, 26/26 runs at t72 and t1200 | **identical** to main, 26/26 runs at t1200 (digest includes `sequence`) | exact 26/26 | with the replay fix |
| 3b | News **prune** (180 ticks plus the latest ownership and occupation item per port) | t72 **unchanged**, t1200 **moves** on 26/26 runs: **re-pin** | identical to main at t1200 (26/26). **Not identical past about t2,100** (section 3.4) | exact 26/26 and at t5000 on 1847 | with item 4a (one re-pin) |
| 4a | Stored holder (`Faction.commandHolderId`) replaces the derivation | **moves every pin from t0** (a new hashed field): **re-pin** | **identical** to main, 26/26 | exact 26/26 | with item 3b (one re-pin) |
| 4c | The `engine.ts:1123` read uses the stored holder, not the first order | moves pins (behavior) | **changes** in 23/26 runs | exact 26/26 | last, own slice |
| 5 | Sighting freshness window: 72 ticks (`GARRISON_FRESHNESS_TICKS`) | **neutral** | identical, 26/26 (sim stream, scripted run) | n/a | any time |

Landing order (section 8): replay fix, 3a, 1, 5, then one re-pin slice with 4a and 3b, then 4c. Six numbers worth reading first:

- **Store, seed 1847:** t1200 162.4 MB to 14.7 MB (flag-off), 158.0 to 15.3 MB (ATLS). t5000 1,030.0 MB to 15.0 MB, 1,012.6 to 16.7 MB.
- **Sightings never reach a fight.** `combatForecast` reads `partySightings` only when `observedLocally` is false, and the one stored forecast (a battle's start, `engine.ts:1556`) and the in-battle one (`combat.ts:242`) pass `observedLocally: true`. A stale sighting skews the commander's *forecast*, not the battle. The window changes 2,690 of 3,904 forecasts (flag-off) and no battle, capture, claim, port change, wipeout or secession.
- **News prune is event-identical only while no sailor brings a stale item to a port that never held it.** That never happens in 26 runs of 1,200 ticks. At t5000 on 1847 it starts at t2,121 (flag-off) and t2,716 (ATLS).
- **The holder move is a pure state move** (event log identical, 26/26) but it moves all six pins at t72, because the field is hashed from t0. Replacing the `engine.ts:1123` read is a behavior change.
- **Replay dependency:** without `replay-leading-block.patch`, a restart on ATLS 10000 between t1,621 and t1,625 recovers a different world (3 of 10 crash points equal). With it, 10/10.
- **Tests:** item 1 breaks 4 tests that delete newer snapshots to force an old one (they need `archive: true`). Item 5 breaks none (690/690). Items 3b and 4 move pinned hashes.

## Pin baseline (verified first, on `90433a8`)

`pins.ts`, 1,200 ticks, headless, `createPrototypeWorld(seed)`. All six match the pins in the brief, with and without the replay patch; whole-log replay is exact in all six (`results/pins-main.jsonl`, `pins-patched.jsonl`).

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

The store keeps: the **latest snapshot**, **every event after it**, and **the events of the last 180 ticks** (`EVENT_WINDOW_TICKS`, the check-in window `CHECK_IN_TICKS`, `view-model.ts:87`, a literal in `persistence.ts` because the sim does not import the dashboard). `eventsPage` ends at the oldest row kept, so `hasMore` is false there. Everything older is deleted in the same transaction that writes a new snapshot. `WorldStore` takes `{ archive: true }` to keep every snapshot and event, as before. It is off by default.

Three things the window breaks, and what replaces each:

1. **Governor seats.** `restoreGovernorSeats` rebuilds the seat map by replaying from the opening snapshot (sequence 0) through the snapshot's last event (`persistence.ts:188-201`). With the opening snapshot and old events gone, the seats are stored beside each snapshot: a `snapshot_seats(sequence, seats_json)` table holding `[settlementId, characterId, factionId]` rows sorted by port, written from the live seat memory (`governor.ts` `exportGovernorSeats`), restored with `importGovernorSeats`. Off the hash, as before. A store written before the change has no seat row, so `recover()` falls back to the old shadow replay while sequence 0 still exists, and the first new snapshot writes the row.
2. **Lifetime feeding counts.** `feedingCounts()` (`persistence.ts:288`, read at `server.ts:143`) counts `worked`, `travel-started` and `battle-resolved` over the whole log. In a window that would silently become a 180-tick count. It becomes a running `feeding_counts` table updated in the same transaction, backfilled once from the events a legacy store still has.
3. **Whole-log readers.** `run-simulation.ts:98` (`allEvents()`, reports) needs the archive: the CLI passes `archive: true`. The dashboard reads `OPEN_ERA_ARCHIVE=1`. `eventCount()` (`server.ts:140`, `:147`) now counts the window; the health line should read `world.nextEventSequence` if it means the lifetime total.

### 1.2 Touch points (`90433a8`)

| File:line | Change |
|---|---|
| `persistence.ts:50` constructor | `options.archive`, `options.windowTicks`; create `snapshot_seats` and `feeding_counts`; one-time `feeding_counts` backfill (metadata key `feeding-counts`) |
| `persistence.ts:108-151` `appendTick` | upsert feeding counts per event; on a snapshot also write the seat row and, unless archive, delete `snapshots`/`snapshot_seats` rows older than it and `events` with `sequence <= snapshot` and `tick < world.tick - 180` |
| `persistence.ts:153-181` `recover` | seats from `snapshot_seats`; else the old `restoreGovernorSeats` (`:188`) |
| `persistence.ts:210-211` `replayEvents` | unchanged; depends on the replay fix (section 1.6) |
| `persistence.ts:288` `feedingCounts` | read the table |
| `governor.ts:172` | add `exportGovernorSeats`, `importGovernorSeats` beside `transplantGovernorSeats` |
| `cli/run-simulation.ts:61` | `archive: true` |
| `dashboard/server.ts:94` | `archive` from `OPEN_ERA_ARCHIVE` |

Patch: [item1-store-window.patch](engine-hygiene/item1-store-window.patch) (`persistence.ts`, `governor.ts`, `run-simulation.ts`, `server.ts`).

### 1.3 Store size (seed 1847, `store.ts size`, a real SQLite file after `wal_checkpoint(TRUNCATE)`)

| Config | Tick | Main: file | Main: snapshots / events | Window: file | Window: snapshots / events | Window + news prune (3b) |
|---|---|---|---|---|---|---|
| flag-off | 1,200 | 162.4 MB | 201 / 160,337 | **14.7 MB** | 1 / 25,361 | not run at t1200 |
| ATLS | 1,200 | 158.0 MB | 201 / 159,450 | **15.3 MB** | 1 / 26,361 | not run at t1200 |
| flag-off | 5,000 | 1,030.0 MB | 834 / 625,997 | **15.0 MB** | 1 / 18,635 | 14.3 MB |
| ATLS | 5,000 | 1,012.6 MB | 834 / 666,157 | **16.7 MB** | 1 / 25,839 | 14.7 MB |

- At t5000 on main, snapshot JSON is 721.2 MB of 1,030.0 MB (flag-off) and 681.0 of 1,012.6 (ATLS). The window deletes the 833 older snapshots, which is nearly all of it. The remaining file is mostly the window's events (6.6 to 10.0 MB of JSON) plus one snapshot (0.6 to 1.9 MB).
- The window is steady from t1200 to t5000: 15.0 and 16.7 MB at t5000 against 14.7 and 15.3 at t1200. Freed pages are reused, so the file does not grow back.
- Other seeds at t1200 (`results/size-*-1200-*.jsonl`), main to window: flag-off 2718 154.4 to 14.1 MB, 4096 169.7 to 14.6 MB; ATLS 2718 145.6 to 13.3 MB, 4096 162.1 to 14.8 MB.
- The archive flag at t1200 is the old size: 162.5 MB (flag-off), 158.0 MB (ATLS), 201 snapshots (`results/size-archive-*.jsonl`).
- Window event rows are 18.6k to 26.4k, consistent with the 20 to 28 thousand a month noted at `persistence.ts:14`; the 40,000 check-in cap does not bind.

### 1.4 Hash and replay

Hash-neutral: no sim path changes. The recovery harness (1.5) compares `stateHash` of a recovered world to a live twin.

### 1.5 Recovery exactness (`store.ts recover`)

A twin run: `L` has no store; `S` writes every tick and every between-tick command (`confirm-order`, `offer-contract`, as `POST /api/commands` does at `server.ts:223`) to a window store and, at each crash tick, closes the store, reopens, recovers, and continues. Crash ticks 5, 6, 7, 23-25, 71-73, 96, 150, 299-301, 500, 719-721, 899, 1000, 1199 (21 per run).

| Run | Replay patch | Crashes | Recovered hash equals live | Stored seats equal live seats | Final hash equal |
|---|---|---|---|---|---|
| flag-off and ATLS, seeds 1847, 2718, 4096, 8000, 2000 (10 runs) | applied | 210 | **210** | **210** | 10/10 |
| ATLS 10000, 1,700 ticks, crashes at 300, 1619-1626, 1699 | applied | 10 | **10** | 10 | yes |
| same 10 runs | not applied | 210 | 210 | 210 | 10/10 |
| ATLS 10000, same crashes | **not applied** | 10 | **3** | 10 | **no** (first miss t1,621, 162 replayed events) |
| all five patches, flag-off and ATLS, 1847 and 8000 (4 runs) | applied | 84 | 84 | 84 | 4/4 |

- **Seats stored beside the snapshot equal the old shadow replay's seats**, checked in archive mode at 10 snapshots on ATLS 1847 (`SHADOW=60`, `ARCHIVE=1`, 600 ticks): 10/10.
- **Migration** (`migrate-write` on main, `migrate-read` on the patch, seed 1847, 400 ticks): the legacy store had 67 snapshots, 48,276 events and no seat rows. It recovered equal to live through the old shadow path, ran 30 more ticks, and after the first new snapshot held 1 snapshot, 1 seat row, 23,425 events (oldest tick 246 = 426 - 180), and recovered equal again. 29 feeding rows before and after.
- **Feeding counts** in window mode equal the in-memory whole-log counts on flag-off and ATLS, seeds 1847 and 2718 (4/4), with 23,343 to 26,361 stored events of 145,284 to 160,338 lifetime.

### 1.6 Dependency on the replay fix

`recover()` still replays the events after the snapshot with `replayWithSilentStarts` (`persistence.ts:211`). A snapshot is written when the clock lands on a morning, so the replayed events begin with the next tick's leading block, which is where `replay-leading-block.patch` ([copy](engine-hygiene/replay-leading-block.patch), `tick-start.ts` only, from `docs/replay-divergence` @ `0108951`) applies. Seat persistence removes the *second* replay path (`:199`, from sequence 0) but not this one. Item 1 is exact only with the patch on a restart in the failing window (table above). The patch was applied, uncommitted, for every measurement in this note.

### 1.7 Acceptance (property and liveness)

1. After any snapshot in window mode: `snapshots = 1`; `snapshot_seats` has one row, equal to `exportGovernorSeats(world)` at that snapshot; every `events.sequence > snapshot.sequence` is present; `MIN(events.tick) >= world.tick - 180` unless an event after the snapshot is older (a command appended long before a tick).
2. Recovery equals live: for crash ticks across a run including between-tick commands, `stateHash(recover()) == stateHash(live)` and the continued run's final hash is equal.
3. Seats: `exportGovernorSeats(recovered) == exportGovernorSeats(live)`; in archive mode equal to the old shadow replay's seats.
4. `eventsPage` walks back to the window floor and then reports `hasMore = false`; no page overlaps.
5. `feedingCounts()` equals the whole-log counts after any number of pruned snapshots.
6. Archive mode: row counts equal main's (201 snapshots, 160,337 events at t1200 on 1847 flag-off).
7. Size: after t1200 the file stays under 20 MB on all measured seeds (14.1 to 16.7 MB measured); no growth between t1200 and t5000 beyond one snapshot's growth.
8. Pins unchanged on all six; event log unchanged.

### 1.8 Engineer test plan

- T1 window: run 400 ticks into a store; assert acceptance 1 and the oldest-tick bound.
- T2 recover: crash at a morning, a non-morning and between ticks; assert hash equality with a twin, including after a `confirm-order` appended between ticks.
- T3 seats: a world with a seated governor; recover; assert `governorId` and `governorLevyRate` equal the twin's, and that the levy and stipend of the next tick match.
- T4 legacy store: build a store with the old code path (or a fixture), open with the new, assert the fallback and that the first snapshot writes a seat row and prunes.
- T5 feeding counts across a prune; T6 `archive: true` keeps all rows.
- T7 `eventsPage` ends at the floor.
- Fixtures: `tests/captive-intelligence.test.ts:477`, `tests/ransom-split.test.ts:319` delete newer snapshots to force recovery from an older one. They fail on the window (4 tests: `captive-intelligence` "the first headless release…", "Mina Vale's release…", "seed 2718 replays through tick 160…"; `ransom-split` "a ransom release recovers from the snapshot before it"). Open those stores with `archive: true`. Full suite with item 1: 686/690 (`results/item1-test-failures.txt`).

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

`news.ts:30` (new constant after `NEWS_AGE_CAP`), `news.ts:61` (`pruneNews`, `newsRetained` after `ledgerHas`), `engine.ts:48` (import), `engine.ts:3500` (guard), `state.ts:1149` (`tick-advanced`: prune), `state.ts:3` (import). Readers checked: `news.ts:111`, `:141-160`, `:198-215`; `client-readiness.ts:109`, `:153`, `:177` (`portNewsFor` lists the whole ledger, so the port-news panel now shows 180 ticks and the latest ownership items; a visible change).

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

The difference is exactly main's old posts minus those the retention keeps (60 - 3 = 57; 76 - 1 = 75). These are a sailor reaching a port that never held a batch of items (isolated for over 300 ticks). Main posts them. The guard does not, because the port would drop them, and from then on `nextEventSequence` and the later `news-${sequence}` ids differ from main. Making this exact needs the port to remember what it once held (a tombstone per port, or an id range), which is unbounded again but much smaller than the ledger (ids, not records). I did not build it. See question 1.

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

- **Written:** at the scenario start (`scenario.ts:287-301`: `character-01` for `world-government`, `character-14` for `free-tide`, matching `orderFor`, `scenario.ts:251`), and when a secession names a successor (`state.ts:1135`: `if (previous.commandHolderId === ownerId) previous.commandHolderId = successorId`). The order retarget stays, so the issuer on each order still matches the seat. A breakaway starts with none, as today.
- **Read:** `commandHolderId(world, factionId)` returns the stored id only while that character is a member (`world.characters[id].factionId === factionId`), else null. That keeps the old "dead, deserted or exiled holder leaves the seat unnamed" with no new writes at the sites that change `factionId` (`state.ts:995`, `:1010`, `desertion.ts:79`, `engine.ts:4337`, `secession-aftermath.ts:348`), and the withheld-desertion event (`state.ts:1001`) restores the seat for free.
- **Deliberate change:** a non-holder member issuing an order no longer unseats the faction.
- **Migration:** `normalizeWorldState` (`state.ts:61`) fills an absent field from the orders once (the old derivation, kept private as `seatFromOrders`), so old snapshots load.
- **4c, the `engine.ts:1123` read:** `seatId = commandHolderId(world, character.factionId)`; update the relationship toward it if the character has one and is not the seat. No order is read. The event strings ("victory under standing orders") are unchanged.

Patches: [item4-stored-holder-state.patch](engine-hygiene/item4-stored-holder-state.patch) (4a: `types.ts`, `scenario.ts`, `state.ts`) and [item4-battle-read-seat.patch](engine-hygiene/item4-battle-read-seat.patch) (4c: `engine.ts`).

### 4.3 Does it move pins?

**4a: yes, all six, from t0.** `factions` is hashed, so a new field on two factions changes the hash at tick 0, not only later (table above: every t72 and t1200 differs). The **event log does not change**: digests including `sequence` are identical to main on 26/26 runs, outcomes equal, replay exact 26/26. An oracle compared the stored seat to the legacy derivation for every faction on every tick of all 26 runs: **0 mismatching ticks**. The oracle saw no seat change at all (0 holder changes), because no headless run reaches a secession by the holder or a non-holder order, so the transfer path is covered only by the fixtures below.

A hash-neutral variant exists only if the field is left out of the hash, which defeats its purpose (it would be off-world state like the governor seats). I do not recommend it.

**4c: yes, and the events change.** Event log identical to main on 3 of 26 runs (1 flag-off, 2 ATLS):

| Totals, 13 seeds × 1,200 | Main | 4a | 4a + 4c |
|---|---|---|---|
| flag-off: claims / port changes / battles / captures / secessions | 682 / 713 / 927 / 247 / 31 | same | 688 / 718 / 933 / 244 / 30 |
| flag-off: events | 2,105,611 | 2,105,611 | 2,107,747 (+2,136) |
| ATLS: same five | 497 / 543 / 898 / 214 / 32 | same | 497 / 543 / 898 / 214 / 32 |
| ATLS: events | 2,015,488 | 2,015,488 | 2,015,400 (-88) |
| Min claims / min port changes (flag-off, ATLS) | 28 / 31, 25 / 28 | same | 28 / 31, 25 / 28 |
| Wipeouts; secession seeds | 0; 12 and 11 | same | 0; 12 and 11 |
| Replay exact | | 26/26 | 26/26 |

Cause, from a one-off diagnostic on 1847 flag-off (not committed): of 74 calls to the read, 64 agree and 10 differ. In all 10 the first order on file is **closed** (6 refused, 4 completed) and its issuer is **not** the character's faction seat; the old code updated the relationship toward that former issuer, the new code updates none. I did not measure the alternative "first *open* order" read. By construction it matches 4c on those 10 cases.

### 4.4 Touch points

`types.ts:26`; `scenario.ts:293`, `:300`; `state.ts:61-84` (normalize), `:307-319` (`commandHolderId`), `:1135-1141` (secession); `engine.ts:1123-1145`. Readers of `commandHolderId` that change only by going through the stored field: `news.ts:44`, `governor.ts:56,79,86`, `tax-rate.ts:183,259`, `secession.ts:17,55,164,204,338,377,388,428,476`, `secession-aftermath.ts:114`, `dashboard/allowance.ts:48`, `allowance.ts:84,99`, `aging.ts:119`, `exile.ts:36`, `dashboard/visibility.ts:961`, `dashboard/wording.ts:317,734,926`, `engine.ts:3694,3986,4121,4122`, `state.ts:280,485,499`.

### 4.5 Acceptance

1. 4a: event digests identical to main on 13 seeds × 1,200, both configs; oracle equals the legacy derivation on every tick; replay exact; new pins as in the table.
2. Seat transfer: after a secession with a successor, `commandHolderId(previous)` is the successor, the new faction has none, and replay agrees.
3. A holder who dies, deserts or is exiled leaves the seat unnamed (null) and a withheld desertion restores it.
4. A non-holder issuing an order does not change `commandHolderId`.
5. 4c: liveness as before (claims and port changes > 0 on every seed, no new wipeouts, secessions on ≥ 6 of 13: measured 28 / 31 minimums and 12 and 11 seeds); no relationship update toward a character who is not the faction seat.

### 4.6 Engineer test plan

- T1 scenario: both factions carry the seat from tick 0.
- T2 secession: holder owns a port and secedes with a successor (fixture exists: `tests/secession-command.test.ts`).
- T3 leaving: kill, desert, exile the holder; seat unnamed; `desertion-withheld` restores.
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

Left as is, deliberately: the stored sightings (nothing deleted, so no hash change) and `projectCharacter`'s `storedSighting` (`visibility.ts:724`).

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
| 4c battle read | **t1200 and the event log** | own slice; re-pin; liveness gate |

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

1. **Replay fix** (`docs/replay-divergence` @ `0108951`, `tick-start.ts` only, hash-neutral). Item 1 and every restore depend on it.
2. **3a, the news guard** (hash-neutral, event-identical). Safe alone; it is what makes 3b safe.
3. **1, the store window** (hash-neutral). Fixtures to `archive: true`. The largest practical win: 1,030 MB to 15 MB at t5000.
4. **5, sighting freshness** (hash-neutral, projection only). Independent; can land any time.
5. **One re-pin slice: 4a + 3b.** Both leave the event log identical to main (through t1,200 for 3b), so one re-pin covers them and the diff is state only. Do it after the defaults flips the Lead mentioned, or the pins will move again.
6. **4c, the `engine.ts:1123` read.** Behavior change, own slice, liveness-gated.
7. Contracts prune: later, as ruled, as its own slice.

## 9. Questions for the Lead

1. **News prune identity.** Is "identical through about t2,000, then minus a handful of stale never-held posts" acceptable? On 1847 that is 57 and 75 events of 626k and 666k by t5000, first at t2,121 and t2,716. The exact alternative is a per-port tombstone of held ids (small, but unbounded).
2. **Snapshots kept.** The window keeps one. A hash mismatch at recovery (`persistence.ts:166`) then throws with nothing older to fall back to. Keep the latest two (about +0.6 to 1.9 MB)?
3. **Archive default for tools.** `run-simulation` passes `archive: true` because its reports read the whole log; the dashboard reads `OPEN_ERA_ARCHIVE=1`. Is that the intended split? And should the health line report `world.nextEventSequence` (lifetime) rather than the window row count?
4. **Stored holder.** OK that (a) the seat stays null while the holder is not a member, (b) a non-holder member issuing an order no longer unseats the faction, and (c) a seat changes only on secession with a successor (no other event writes it)?
5. **4c.** OK to stop updating relationships toward a former issuer after a refused or completed order (10 of 74 calls on 1847 flag-off, +6 claims and -3 captures over 13 seeds as a butterfly effect)? I measured the stored-seat read, not the "first open order" read.
6. **Sightings.** 72 and a hard cutoff, or the belief-style decay? And should the card projection (`visibility.ts:724`) also stop showing a sighting older than 72, or keep it with its age?
7. **Port-news panel.** 3b cuts `portNewsFor` to 180 ticks plus the latest ownership items. Fine for the UI?

## 10. Reproduce

All under `docs/design/engine-hygiene/`; run from the repository root with `node --experimental-strip-types`. The replay patch is applied to the working tree, not committed.

```
git apply docs/design/engine-hygiene/replay-leading-block.patch
pins.ts <label>                                  # six pins + whole-log replay
store.ts size|recover|feeding|migrate-write|migrate-read <label> <flag-off|atls>   # item 1 (SEEDS, TICKS, CRASH, ARCHIVE, SHADOW, DB)
news.ts <label> <flag-off|atls>; cmp.ts news base prune                              # item 3
holder.ts <label> <flag-off|atls>; cmp.ts holder base v4c                            # item 4
sight.ts <label> <flag-off|atls>; sight-compare.ts base win72                        # item 5
npc-summary.ts npc-idle-default.jsonl ...                                            # section 7
```

Apply a patch with `git apply docs/design/engine-hygiene/<patch>`; the five apply together on `90433a8`. Each harness is run once without and once with its patch (`git stash` or `git apply -R`). Full-suite results: `results/item1-test-failures.txt` (4 fail), `item4-test-failures.txt` (37 fail with 4a + 4c), `item5-test-failures.txt` (0 fail), `item1+3-test-failures.txt`.
