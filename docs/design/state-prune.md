# State size and prune (engine follow-up)

Status: **Proposed**, for the Lead's ruling and then the Engineer. Base: `main` `3c55552` (includes #201, cards v1). Date 2026-11-27. Offline, no AI, $0.

This note answers the cards-v1 follow-up: `world.contracts` is never pruned, and other world arrays may grow the same way. It inventories every unbounded (or potentially unbounded) array and map on the simulated world and in the SQLite store, measures entries and serialized bytes at tick 1,200 and 5,000, traces the readers, and proposes a retention rule per structure. Retention is taken from those readers and from the measured distributions, not from a size target.

A contracts-only prototype is in [state-prune/](state-prune/). It is event-identical to the unpruned run and hash-moving from tick 1,200. Tick-72 flag-off and ATLS pins do not move, because no closed contract is yet 240 ticks old.

## 1. Method

- Commit `3c55552`, Node.js v24.22.1, `createPrototypeWorld` + `runTick`, no dashboard, no AI.
- Two configs: **flag-off** (`{}`, defaults: occupation / alliances / portTransfer / lifecycle / secessionAftermath off; `EXILE_RECOVERY` stays on by default) and **ATLS** (`alliances`, `lifecycle`, `portTransfer`, `secessionAftermath` all true; occupation still off).
- 13 standard seeds (1847, 2718, 4096, 1000–10000 by thousands) × 5,000 ticks. Inventories at ticks 0, 72, 200, 400, 600, 800, 1,000, 1,200, 2,000, 3,000, 4,000, 5,000. Replay via `replayWithSilentStarts` on the recorded events.
- Bytes are UTF-8 length of `canonicalJson` from `src/sim/state.ts:528`, the same encoding as `stateHash`. World JSON (`JSON.stringify`) matched canonical bytes on every inventory in this run. Nested structure bytes are subsets of the parent (and of the world total); they must not be summed with the world total.
- Event-log bytes in the in-memory harness are `JSON.stringify` of the `SimEvent[]`. SQLite sizes come from a real `WorldStore` (`store-size.ts`): 3 pin seeds at 1,200 ticks, both configs, and seed 1847 at 5,000 ticks, both configs. Store hashes at those ticks matched the in-memory pins.
- KB / MB in the tables are 1024-based.

Raw rows and the generated tables: [state-prune/results/](state-prune/results/).

## 2. Pin verification on `3c55552`

Flag-off pins at t72 / t1,200 on 1847 / 2718 / 4096 match the expected values `7f76e474` / `94de9c02`, `976c40bd` / `7a3741c9`, `08943ea5` / `af6eeaea`. The t72 hashes also match `tests/fixtures/golden-hashes.json`, and the t72 event counts match that fixture (8,247 / 8,155 / 8,457).

ATLS pins at t72 / t1,200 match the post-#192 ATLS-with-fix values `85658e53` / `5367691c`, `aa54ada1` / `faf5798a`, `e4361ee1` / `7e93eab2`.

Replay was exact on all 13 flag-off seeds at 5,000 ticks, and on 12 of 13 ATLS seeds. **ATLS seed 10000 was not exact at tick 5,000** (`160f324d` at t1,200, `5091ec34` at t5,000). The three ATLS pin seeds were exact at 5,000. This was not bisected here; it is called out as a follow-up.

## 3. What grows

Fixed-size maps (factions, settlements, characters, knowledge keyed by port, relationships keyed by person, `allianceRaids` keyed by a faction pair, `homeService` keyed by port) grow only when the world itself grows: secession adds factions, lifecycle adds characters, and people meet. Dead characters stay in the world by design (`types.ts:724–726`). Those structures are listed in the tables so the Lead can see their contribution; they are not proposed for a time-window prune.

Already bounded in src:

- `settlement.foodRatios` — last 20 ticks (`state.ts:797`, `occupation.ts:45`). Empty in these runs (occupation off).
- `allianceMemory` — entries older than `ALLIANCE_COOLDOWN` (240) are dropped on a break (`alliances.ts:110–111`).
- `character.debts` — a `closed: true` repayment splices the row (`state.ts:1038`). Remaining unpaid debts stayed in the single digits.
- `pendingCommands` and `activeBattles` were 0 at every inventory (consumed / transient).
- `scheduledReplies` and all conversation fields were 0 on every headless run (no player messages).

The structures that accumulate without a retention rule, plus the SQLite log, are the ones below.

## 4. World and event-log size

### Flag-off, 13 seeds

| tick | world | events | event bytes (in-memory JSON) |
| ---: | --- | --- | --- |
| 72 | 168.5–212.6 KB | 8,110–8,654 | 3.47–3.76 MB |
| 1,200 | 402.9–713.4 KB | 157,701–168,445 (med 161,439) | 73.26–78.16 MB |
| 5,000 | 928.4 KB–1.74 MB | 600,274–684,255 (med 625,997) | 278.53–317.34 MB |

### ATLS, 13 seeds

| tick | world | events | event bytes (in-memory JSON) |
| ---: | --- | --- | --- |
| 72 | 169.7–231.7 KB | 8,157–8,657 | 3.51–3.76 MB |
| 1,200 | 377.1–685.1 KB | 145,283–161,889 (med 157,896) | 66.38–75.09 MB |
| 5,000 | 695.1 KB–3.05 MB | 634,065–973,215 (med 691,587) | 291.79–459.11 MB |

ATLS at 5,000 is wider because lifecycle adds characters (32–66, including the dead) and relationships follow (853–3,240 entries, 132.0–496.3 KB). Seed 4096 reached 2.21 MB of world state and 779,670 events.

The comment on `persistence.ts:13–14` and `:234–236` that “a month of this campaign is about 20–28 thousand events (measured at tick 1200)” is stale on this commit: the in-memory log is 157,701–168,445 events at tick 1,200, flag-off.

World size is not monotonic. `carriedNews` is a full copy of a port ledger onto each traveler and is deleted on arrival (`state.ts:881`). A mid-run SQLite snapshot was as large as 803,659 bytes at flag-off seed 4096 before tick 1,200, against a 512.0 KB ending world, and 1,958,318 bytes mid-run on ATLS seed 1847 before tick 5,000, against a 1.54 MB ending world.

### Structure ranges (entries / canonical bytes)

Flag-off at t1,200 / t5,000:

| structure | t1,200 entries | t1,200 bytes | t5,000 entries | t5,000 bytes |
| --- | --- | --- | --- | --- |
| `world.contracts` | 43–229 | 17.6–95.6 KB | 212–607 | 89.2–254.8 KB |
| `settlement.news` | 453–975 | 88.9–192.4 KB | 1,800–3,510 | 356.5–700.7 KB |
| `character.carriedNews` | 0–1,071 | 0–211.1 KB | 0–3,489 | 0–717.6 KB |
| `character.standingOrders` | 20 | 7.6–7.8 KB | 20 | 7.6–7.8 KB |
| `conversationMessages` / threads / replies | 0 | 0 B | 0 | 0 B |
| `character.relationships` | 721–774 | 111.3–119.3 KB | 768–835 | 118.5–128.5 KB |
| `character.knowledge` | 120 | 37.2–38.0 KB | 120 | 37.3–38.7 KB |
| `character.goals` | 92–100 | 20.5–22.4 KB | 95–103 | 21.4–23.3 KB |
| `character.debts` | 0–12 | 0–1.9 KB | 1–13 | 266 B–2.0 KB |
| `character.partySightings` | 0 | 0 B | 0 | 0 B |
| `character.scars` | 0 | 0 B | 0 | 0 B |
| `characters` (dead) | 30 (0–3) | 243.9–444.3 KB | 30 (3–10) | 252.6–963.5 KB |
| `factions` | 2–7 | 276 B–1.3 KB | 3–10 | 495 B–2.0 KB |

Almost every contract at these ticks is already closed: flag-off t1,200 had 0–1 open and 37–204 closed older than 240 ticks (76.3–100% of the list, median 87.0%). At t5,000 that share is 85.9–99.5%, median 94.9%. News is the same shape: at t1,200, 384–840 of 453–975 items are older than 180 ticks, and nearly all are older than the engine's 24-tick read window.

ATLS at t1,200 / t5,000, same columns, plus layer fields:

| structure | t1,200 entries | t1,200 bytes | t5,000 entries | t5,000 bytes |
| --- | --- | --- | --- | --- |
| `world.contracts` | 62–214 | 25.9–88.4 KB | 109–528 | 46.3–225.5 KB |
| `settlement.news` | 448–941 | 88.6–187.5 KB | 1,456–4,221 | 290.3–867.7 KB |
| `character.carriedNews` | 0–941 | 0–187.6 KB | 0–6,330 | 0–1.27 MB |
| `character.standingOrders` | 20–23 | 7.7–9.0 KB | 21–46 | 8.1–17.7 KB |
| `character.relationships` | 616–829 | 95.9–127.9 KB | 853–3,240 | 132.0–496.3 KB |
| `characters` (dead) | 30–34 (0–3) | 255.5–455.1 KB | 32–66 (3–10 dead) | 283.3 KB–2.05 MB |
| `secessionAftermath.records` (peace) | 0–5 (0–4 peace) | 0–883 B | 1–13 (0–9 peace) | 160 B–2.3 KB |
| `alliances` (memory, raids) | 0–3 (memory 0–5, raids 2–16) | 0–1.8 KB | 0–5 (memory 1–8, raids 14–34) | 0–3.1 KB |

ATLS closed-contract share: 74.2–100% older than 240 at t1,200 (median 93.2%), 95.4–100% at t5,000 (median 97.8%). Standing orders grow only as lifecycle adds captains; by t1,200 they are all closed and older than 180 ticks. `partySightings` was 0 on all 26 runs (no survey or delivered explore wrote a row). `conversationMessages` was 0 on all 26 (headless). `character.scars` was 0 on all 26.

### Growth per 1,000 ticks

Flag-off (13 seeds, median in parentheses):

| interval | world / 1k ticks | events / 1k | event bytes / 1k | news entries / 1k | contracts / 1k |
| --- | --- | --- | --- | --- | --- |
| t0–t1,000 | 325.4–519.1 KB (439.1 KB) | 131,472–139,363 (133,827) | 60.86–64.45 MB | 381–813 | 38–208 |
| t1,000–t2,000 | 119.4–380.6 KB (236.4 KB) | 126,598–142,515 (133,772) | 59.20–66.55 MB | 400–897 | 14–123 |
| t2,000–t3,000 | −49.5 KB–603.9 KB (192.0 KB) | 119,930–139,165 (126,062) | 55.22–64.92 MB | 220–856 | 10–153 |
| t3,000–t4,000 | −195.1 KB–572.7 KB (184.2 KB) | 107,987–136,685 (118,869) | 49.79–63.55 MB | 144–773 | 8–134 |
| t4,000–t5,000 | −232.1 KB–517.9 KB (180.2 KB) | 101,520–134,901 (112,197) | 46.80–63.00 MB | 163–687 | 10–145 |
| t0–t1,200 | 249.3–508.1 KB (373.4 KB) | 131,418–140,371 (134,532) | 61.05–65.13 MB | 378–812 | 36–191 |
| t1,200–t5,000 | 85.1–320.0 KB (200.5 KB) | 114,960–136,565 (122,542) | 53.27–63.47 MB | 247–718 | 31–99 |

ATLS world / 1k ticks is similar at the median (418.6 KB over t0–t1,000, 306.1 KB over t1,200–t5,000) but the top of the range is higher, and event growth accelerates on some seeds (up to 259,298 events per 1,000 ticks in t4,000–t5,000). Negative world intervals are carried-news bags clearing on arrival, not a shrink of the news or contract ledgers.

A long-running persistent server at the flag-off median therefore adds about 120–135 thousand events and about 180–200 KB of world state every 1,000 ticks after the first 1,200, while the SQLite file grows much faster than the world (next section).

Top event types at t5,000, flag-off seed 1847: `character-upkeep` 122,885, `decision-made` 102,124, `goal-progressed` 102,095, `plan-reconsidered` 79,772, `rested` 54,250, `knowledge-updated` 21,533, `settlement-produced` / `settlement-upkeep` 19,922 each. Those eight already dominate the log. The player feed omits some bookkeeping types (`view-model.ts:99–103`) but the store keeps them all.

## 5. The SQLite store (hash-safe to prune)

Events and snapshots are not on `WorldState` and are not in `stateHash`. Pruning the store does not move a pin. It is also the dominant cost of a persistent server.

A snapshot is written at initialize, then whenever `world.tick % ticksPerDay === 0` (every 6 ticks) or 5,000 events have landed since the last snapshot (`persistence.ts:130–131`). The daily trigger fires first, so a 5,000-tick run has 834 snapshots (1 + 5,000/6) and a 1,200-tick run has 201. Old snapshots are never deleted. `restoreGovernorSeats` (`persistence.ts:188–204`) replays **every event from sequence 0 through the latest snapshot** onto a clone of the opening snapshot, because governor seats are not stored on the world. `recover()` then replays only the events after the latest snapshot. `allEvents()` (`persistence.ts:214`, used by `run-simulation.ts:98`) and the paged feed (`eventsPage`, `dashboard/server.ts:134`) walk the full table. Check-in reads the last 180 ticks, capped at 40,000 rows (`view-model.ts:87`, `persistence.ts:237`, `dashboard/server.ts:136`).

Measured `WorldStore` files:

| config | seed | tick | db file | snapshots | events | `data_json` sum | `state_json` sum | snapshot min–max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| flag-off | 1847 | 1,200 | 162.43 MB | 201 | 160,337 | 58.56 MB | 83.00 MB | 106,130–735,667 B |
| flag-off | 2718 | 1,200 | 154.43 MB | 201 | 157,701 | 58.10 MB | 75.84 MB | 106,147–717,749 B |
| flag-off | 4096 | 1,200 | 169.71 MB | 201 | 162,679 | 59.90 MB | 88.73 MB | 106,168–803,659 B |
| ATLS | 1847 | 1,200 | 157.96 MB | 201 | 159,450 | 58.37 MB | 78.84 MB | 106,130–733,269 B |
| ATLS | 2718 | 1,200 | 145.65 MB | 201 | 145,283 | 52.36 MB | 74.30 MB | 106,147–673,982 B |
| ATLS | 4096 | 1,200 | 162.08 MB | 201 | 157,896 | 58.05 MB | 83.45 MB | 106,168–780,092 B |
| flag-off | 1847 | 5,000 | 1029.98 MB | 834 | 625,997 | 228.19 MB | 721.16 MB | 106,130–1,685,378 B |
| ATLS | 1847 | 5,000 | 1012.56 MB | 834 | 666,157 | 245.23 MB | 680.97 MB | 106,130–1,958,318 B |

Store hashes matched the in-memory pins (including t5,000 `ae926b5a` / `7759020e` for seed 1847). At 5,000 ticks the file is already about one gigabyte, and most of that is 834 full world snapshots, not the event log. Linearly, a flag-off server at this snapshot policy would add on the order of 200 MB of database per 1,000 ticks after t1,200 (seed 1847: (1029.98 − 162.43) / 3.8 ≈ 228 MB per 1,000 ticks).

**Proposed store retention (hash-safe, pins unchanged):**

1. Persist governor seats on the snapshot (or a side table) so `restoreGovernorSeats` no longer replays the whole log. Until that lands, the opening snapshot and the events that rebuild seats cannot be dropped.
2. Keep the latest snapshot (enough for `recover()`), and events after it.
3. Keep events in the last 180 ticks for check-in (about 24,000 events at the measured rate, under the 40,000 cap).
4. Historical `eventsPage` currently claims a client can reconstruct the whole feed without gaps (`persistence.ts:247–252`). If the Lead wants a bounded feed, set a feed window (180, or longer) and document that older pages end. If the Lead wants an unbounded feed, the event table cannot be pruned, but old **snapshots** can still go once seats are persisted.

With seats persisted and old snapshots dropped, seed 1847 flag-off at t5,000 would keep on the order of one world (about 1 MB) plus a 180-tick event window (on the order of 10 MB of `data_json`), against the measured 1.03 GB file. That is the largest safe win in this note, and it does not touch a pin.

## 6. Proposed world prunes

Each row is: what later readers still need, a retention rule taken from those readers, and whether the prune is hash-safe. Checkers and tests read the same fields the engine and projection do; they do not keep a private copy of the ledgers.

### `world.contracts` — recommend, and prototyped

Never deleted today. The types comment that “a headless world never writes it” (`types.ts:815–817`) is stale: flag-off t1,200 already holds 43–229 contracts, which is the 47–193 unwindowed commander list from [ui-cards-v1.md](ui-cards-v1.md).

Readers:

- Open / unsettled only: `contracts.ts:189–196` (`openSupplyContract`), `engine.ts:2422` (offered), `engine.ts:2478` (accepted, unmet), `engine.ts:4487` (`activeHaul`), `engine.ts:2252` / `:2289` and `commands.ts:1099` (by id, live commands).
- Closed breaches inside 240 ticks: `secession.ts:470–475` (`PROMISE_WINDOW_TICKS` = 240, `PROMISE_BREACH_COUNT` = 10), `occupation.ts:58–61` (same 240, `OCCUPATION_INTEGRATION_TICKS`), `feed-reasons.ts:157–158` (same window, wording only).
- Projection: `visibility.ts:640` `projectSupplyContracts` (every contract, unwindowed); cards v1 then serves a closed card only while `ageTicks ≤ 180` (`CHECK_IN_TICKS`, `view-model.ts:87`).
- Reducer: `state.ts:1161–1174` looks up by id when applying contract events. A prune that runs at the end of the tick, after those events have been applied, does not need the dropped row on the next tick.

**Retention:** keep every contract that is `offered` or `accepted`, or not yet `settled`, or has `tick - observedTick ≤ 240`. 240 covers the secession, occupation, and feed-reason windows and is longer than the cards window.

**Hash impact:** hash-moving. The field is in `canonicalJson(world)`. Tick-72 pins do not move, because no closed contract is 240 ticks old yet. Tick 1,200 and later pins move and need a deliberate re-pin.

**Prototype** (`state-prune/prune.ts`, hooked after every `runTick` and after every replayed `tick-advanced` in `measure-pruned.ts`):

| config | seed | t72 pruned / control | t1,200 pruned / control | t1,200 world saved | contracts kept / was | t5,000 pruned / control | t5,000 world saved | contracts kept / was |
| --- | ---: | --- | --- | --- | --- | --- | --- | --- |
| flag-off | 1847 | `7f76e474` / same | `f8b68123` / `94de9c02` | 58.9 KB (9.0%) | 26 / 169 | `11df3216` / `ae926b5a` | 118.0 KB (11.8%) | 23 / 305 |
| flag-off | 2718 | `976c40bd` / same | `3d5dff91` / `7a3741c9` | 15.0 KB (2.7%) | 6 / 43 | `980138c5` / `78f51f99` | 147.9 KB (8.4%) | 38 / 388 |
| flag-off | 4096 | `08943ea5` / same | `d66d2e50` / `af6eeaea` | 77.5 KB (15.1%) | 14 / 200 | `5853e007` / `592c5093` | 157.7 KB (9.8%) | 18 / 392 |
| ATLS | 1847 | `85658e53` / same | `52023970` / `5367691c` | 61.3 KB (11.0%) | 4 / 151 | `d6768f37` / `7759020e` | 77.5 KB (4.9%) | 0 / 185 |
| ATLS | 2718 | `aa54ada1` / same | `479e71c1` / `faf5798a` | 39.8 KB (7.3%) | 7 / 105 | `f14fa824` / `e1e6eaab` | 107.2 KB (6.3%) | 6 / 266 |
| ATLS | 4096 | `e4361ee1` / same | `d5494fa6` / `7e93eab2` | 72.8 KB (11.9%) | 16 / 189 | `d4e48beb` / `14b4ff53` | 140.7 KB (6.2%) | 16 / 348 |

On every completed prototype run, replay was exact, and the pruned event log matched the unpruned twin on event count, type sequence, and canonical event payloads (`eventDataSigMatch`). This is a storage prune, not a behavior change. Across the 13-seed inventories, the same 240-tick rule would drop 76.3–100% of contracts at t1,200 and 85.9–100% at t5,000.

On the t5,000 prototype, flag-off seed 4096 was rerun separately after the first pass exited 137 while building a single canonical JSON of the event payload; the rerun used a streamed payload hash and was event-identical as well. All six t5,000 pin-seed runs (3 seeds × 2 configs) replayed exactly and matched the unpruned event log.

### `settlement.news` and `character.carriedNews` — follow-up, not in the prototype

Append-only, unique id `news-${event.sequence}` (`news.ts:81`). Travelers copy the **entire** port ledger on departure (`news.ts:162–170`, `state.ts:864–870`) and post any item the destination does not already hold (`engine.ts:3490–3506`). Arrival then deletes the bag (`state.ts:881`). This is the largest growing pair on the world itself (up to 1.27 MB of carried news at ATLS t5,000).

Engine readers of the ledger:

- `newsStabilityThousandths` / `newsFollowerIds` (`news.ts:123–158`) keep only items with `tick - observedTick ≤ NEWS_AGE_CAP` (24), except a holder standing in the port reads live stability.
- `ownLossCouriers` (`news.ts:196–206`) needs the latest `settlement-claimed` (any age) on that port's own ledger; a later `secessionLoss` field can replace it.

Projection readers have **no** age cap: `learnedOccupation` / `snapFromNews` (`client-readiness.ts:111–125`), `learnedHolder` (`:165–171`, latest of `settlement-claimed` / `settlement-purchased` / `secession-joined`), and `portNewsFor` (`:179–187`, the full readable history).

A 180-tick window (check-in) plus “keep the latest ownership item per `aboutSettlementId`” was tried at end-of-tick. It is **not** event-identical: a traveler can re-post an item the destination just pruned (`news-posted` count moved by 1 at flag-off seed 1847, t400), which advances `nextEventSequence` and can cascade. A behavior-neutral news prune needs a small engine guard: do not emit `news-posted` for an item that the retention rule would drop. That guard is not in this prototype. Until it lands, leave the ledgers as they are, or accept a behavior-changing / log-changing prune and re-pin.

### `character.standingOrders` — do not prune under the current holder rule

Flag-off stays at the 20 scenario orders (all closed and older than 180 by t1,200, 7.6–7.8 KB). ATLS grows them as captains are added (21–46 at t5,000). Cards v1 would be happy with “open always, closed ≤ 180.” Agency and expiry already filter to open orders (`agency.ts:159–179`, `engine.ts:2955–2972`, `:2992`).

Two readers do **not** filter by status:

- `commandHolderId` (`state.ts:310–322`) walks **every** stored order to decide who issues that faction's orders. Two different issuers in the list make the seat unnamed. The 20 starting orders are what keeps the holder named after they have all expired. Dropping them at 180 ticks changed tax-rate-set, battles, contracts, and decisions in a flag-off seed-1847 t400 subset run (33 event types differed; the combined prune's movement was this effect).
- Post-battle “under standing orders” (`engine.ts:1123`) takes the first order whose issuer is in `relationships`, including a closed one.
- A secession also retargets `issuerId` on every stored order (`state.ts:1139`) so the successor still resolves as holder.

**Retention until the seat is stored on the faction:** do not prune standing orders. Once `commandHolderId` (and the battle-relationship path) stop depending on closed history, a closed-order window of 180 would be safe for cards and commands-by-id, and would be hash-moving.

### Conversation threads, messages, `scheduledReplies` — no data in these runs

0 on all 26 headless runs. When the NPC-threads slice lands they will grow without a cap. Readers today: send throttle and last-5 bodies (`conversations.ts:241–247`), last 12 messages of a thread when a reply is due (`:353`), pending replies (`:344`), and the projection (`view-model.ts:1687–1697`). A later prune can keep all threads, the last 12 messages per thread for the reply writer, a longer player-visible window if wanted, and only `pending` scheduled replies. Hash-moving once any messages exist; no effect on current flag-off pins.

### `character.partySightings` — do not prune without a combat change

0 on these runs, but the type comment is explicit: “nothing deletes an entry” (`types.ts:757`, `state.ts:108`). Combat still **adds** a sighting older than 72 ticks into the defender sum; it only names the age (`combat.ts:139–147`). Projection: `visibility.ts:724`, `:868`. A time-window prune would change forecasts and therefore the sim. Bounded by observers × subjects, not by time.

### Alliances, aftermath, harm ledger

- `alliances` holds current pacts only (a break removes the row, `alliances.ts:108`).
- `allianceMemory` already prunes at 240.
- `allianceRaids` stores the latest tick per `atk>def`. Readers only look back 152 ticks (`alliances.ts:27–28`, `secession-aftermath.ts:131–132`, `:233–234`). Dropping older keys at flag-off does nothing (the map is absent). On ATLS seed 1847 t400, dropping keys older than 152 left the hash and the event log unchanged (a no-op or only keys still inside the window). Optional tidy, hash-moving if any old key exists, not needed at current size (2–34 keys).
- `secessionAftermath.records` and `.peace` grow with secessions (1–13 records, 0–9 peaces at ATLS t5,000, a few kilobytes). Peace rows are removed on a break (`secession-aftermath.ts:340`). Records are not. Leave them until they matter.
- The faction **harm ledger** (`world.harm`) is not on `main`. It lives in the directed-relationships prototype ([directed-relationships.md](directed-relationships.md)), as a `by>on` map of `{ recent, total, lastTick }` with a 152-tick window already specified. When R lands, that `recent` array should be pruned in the reducer to the same window so it does not become a fourth unbounded ledger.

### Relationships, knowledge, goals, scars, debts, dead characters

- Relationships and knowledge are keyed maps, 111–128 KB flag-off, larger under ATLS as the population grows. No time-window prune without forgetting a person or a port.
- Goals grow slowly (92–326). Not urgent.
- Scars were 0; they only append on escape.
- Debts already splice when closed.
- Dead characters stay. At flag-off t5,000 there are 3–10 dead of 30; under ATLS the living population also grows. Archiving a dead character would be its own design slice (inheritance already ran).

## 7. Recommendation

1. **Store hygiene first** (hash-safe, no re-pin): persist governor seats, drop old snapshots, keep events for recover + the 180-tick check-in, and decide whether the historical feed may end. This is the difference between a 1 GB file at t5,000 and a file measured in tens of megabytes.
2. **Land the contracts prune** from `state-prune/prune.ts` (240-tick closed-and-settled retention, end of tick, same hook on replay). Re-pin t1,200 (and any later pins in use). t72 flag-off and ATLS pins stay. The new t1,200 pins are in the table in §6. Behavior and the event log are unchanged on the measured seeds.
3. **Park news, standing orders, and sightings** until the holder is stored, the arrival poster will not re-post a dropped item, and the Lead rules on stale sightings in the forecast.
4. When NPC threads or the harm ledger land, put a retention rule in the same slice, do not grow a new uncapped array.

## 8. Open questions for the Lead

1. Store: persist seats and drop old snapshots now? How far back must `eventsPage` go (180 ticks, longer, or forever)?
2. Land the contracts prune and re-pin t1,200 (values in §6), or wait and bundle it with a later hash-moving slice?
3. News: add the “do not re-post a dropped item” guard and then prune to 180 + latest ownership, or keep the full traveler-copied history for `portNewsFor`?
4. Standing orders: store the command holder on the faction so closed orders can age out, or keep the derived-from-all-orders rule and never prune?
5. `partySightings`: should a sighting older than 72 drop out of the combat sum (behavior change + re-pin), or stay forever?
6. ATLS seed 10000 was not replay-exact at t5,000 on unpruned `3c55552`. Investigate now, or leave it as a long-horizon follow-up?
7. When R lands, confirm the harm ledger's `recent` array is capped at 152 in the reducer.

## 9. Files

- [state-prune/measure.ts](state-prune/measure.ts) — 13-seed inventory harness.
- [state-prune/store-size.ts](state-prune/store-size.ts) — real `WorldStore` file sizes.
- [state-prune/prune.ts](state-prune/prune.ts) — contracts-only prototype.
- [state-prune/measure-pruned.ts](state-prune/measure-pruned.ts) — pruned pins, replay, and event-identity check against an unpruned twin.
- [state-prune/diff-events.ts](state-prune/diff-events.ts) — subset event-type diffs (orders vs contracts vs news).
- [state-prune/results/](state-prune/results/) — JSONL rows and [summary.md](state-prune/results/summary.md).
