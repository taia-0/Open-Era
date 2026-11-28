# Directed relationships (prototype rev 2: harm ledger R + personal grievance R-char)

Status: **prototype / patches only** (not committed to `src`). Base: main `993bbc6`. Two sim flags, both default off, plus one unconditional feed-visibility fix (rev 2 ruling 4).
Scope: [`directed-relationships-scope.md`](https://github.com/taia-0/Open-Era/blob/docs/directed-relationships-scope/docs/design/directed-relationships-scope.md) (branch `docs/directed-relationships-scope`, `98e7ab3`).
Rev 1 of this prototype is commit `4b5ae4f` on this branch (its raw runs, checker output and the leave-one-writer-in `diag/` are there; `rev1/summary.json` keeps its totals for the comparison below).
Every number here comes from the runs in [`directed-relationships/`](directed-relationships/). No constant was tuned toward a target.

## Rulings

**Rev 1** (Lead, on the scope sketch):
1. Build the faction → faction **harm ledger** (flag `relationships`, "R"). Add **R-char** (flag `relationshipsChar`): personal grievance in `Character.relationships` from raid, capture, ransom and (NT patch) a seat lost in a negotiated transfer. Derive the step from existing scale, thresholds and distributions; no tuning; emergent shifts are wanted; gates are property checks only (secessions ≥ 6/13, liveness, no new wipeouts, exact replay, all existing checkers).
2. Harm only, no goodwill.
3. Readers: alliance partner order (ascending mutual harm); NT receiver ranking.
4. Keep `allianceRaids` and the peace gate.
5. No UI; the victim knows who harmed it (own-faction projection, harm received by faction with counts and last tick); harm dealt and third-party harm hidden; projection-privacy property checks.

**Rev 2** (Lead, on `4b5ae4f`):
1. **Raid writer flipped** (the rev-1 direction was the Lead's error): the defending holder and the defending commander each gain grievance against the raid commander; the raider gains nothing for raiding. Captive → captor, ransomed → ransomer and ex-governor → buyer are unchanged.
2. **No double penalty:** a first grudge creates the tie at the contract score's missing-tie trust and respect, and writes only grievance.
3. **Reader 2 (NT receiver ranking) dropped** from v1. The ledger stays. `relationships-nt.patch` keeps only the seat-loss writer.
4. **Relationship rows are visible only to the character's own faction**: the seat-loss row and every existing `relationship-changed` row. The fix is in the patch, with a privacy property that no non-party sees any relationship row.
5. The thin secession margin is acceptable while the gate holds.
6. Add ATLS + R + R-char with occupation on (report-only), exile on and off.
7. The ransom fallback (payee faction's commander) is confirmed.

## Artifacts

| File | What |
| --- | --- |
| `directed-relationships/relationships.patch` | On `993bbc6` + `protection-pact-fix/fix.patch`. Verified with `git apply --check` and a byte comparison against the measured tree. |
| `directed-relationships/relationships-nt.patch` | On `993bbc6` + `fix.patch` + `negotiated-transfer/negotiated-transfer.patch`: the same code plus the seat-loss writer in `negotiated-transfer.ts` (no reader). |
| `measure.ts`, `run-all.sh`, `summarize.py`, `summary.md`/`.json`, `raw/` | 21 sets × 13 seeds × 1,200 ticks, every flag explicit (`raw/sets-json.txt`). |
| `run-props.sh`, `props-out/` | Existing checkers (alliances rev-2 with the break property, aftermath, lifecycle, port transfer) with R / R + R-char in `DEFAULTS_ON_BASE` on 9 sets, plus `negotiated-transfer/measure-nt.ts` on the 3 NT sets. |
| `pins-crosscheck.sh`, `raw/pins-crosscheck-*.txt` | Flag-off pins and ATLS + R(+Rc) pins on both patch trees. |
| `npm-test-*.txt` | `npm test` on each patch stack. |
| `rev1/` | Rev-1 `summary.json` / `summary.md` (input to the rev 1 → rev 2 table). |
| `diag/` | **Rev-1** leave-one-writer-in diagnosis (raid writer in the rev-1 direction), not in either patch; kept for the record. |

The runs use the fix + NT + relationships-nt tree. NT off is byte-identical (negotiated-transfer.md §5), and the ATLS + R / ATLS + R + R-char pins are identical on the fix + relationships tree (`raw/pins-crosscheck-fix+R.txt` = `raw/pins-crosscheck-fix+NT+R.txt`).

## Spec (rev 2)

Line numbers are in the patched tree; `src/sim/relationships.ts` (new) unless another file is named.

**Flags.** `TickOptions.relationships` / `relationshipsChar`, default `RELATIONSHIPS_DEFAULT` / `RELATIONSHIPS_CHAR_DEFAULT` = false (`:12–13`), read each tick (`engine.ts:4574–4575`). Independent of each other.

**Flag-off neutrality.** `harm-ledger-opened` / `grudge-ledger-opened` are emitted once at the start of the tick body when a flag is on (`engine.ts:4594–4595`), applied early in `applyEvent` (`state.ts:565`), and are `PLAYER_FEED_BOOKKEEPING` (`client-readiness.ts`). With both flags off nothing is emitted and every flag-off pin is unchanged.

**Harm ledger (R)**, unchanged from rev 1. `world.harm["by>on"] = { recent: {tick, kind}[], total, lastTick }`, written by the reducer hook `noteHarm` (`:79`; called before the event's case, `state.ts:586`) from raid (`battle-started`, or `battle-resolved` without `battleId`, the `noteRaid` test), capture (`character-captured`) and claim (`settlement-claimed`). Unit weight; window `HARM_WINDOW` = 152 (`:16`) = `ALLIANCE_RAID_WINDOW` (`alliances.ts:11`, asserted equal by the harness). Pruned on write, filtered on read.

**Personal grievance (R-char).** `grudge(from, to)` (`:72`) applies `grudgeRelationship` (`:66`): +`GRUDGE_STEP` (`:21`) to grievance, clamped to [0, 1]; **no other field moves**. Writers:
- **Raided → raider (rev 2):** the raided port's `ownerId` and `commandHolderId(defender)`, deduplicated, each grudge the raid commander (`:89–94`). The raider's ties are not touched by this writer (property-checked).
- **Captive → captor:** `data.captorId`, added to `character-captured` only when R-char is on (`engine.ts:785`): the out-scoring character (`engine.ts:1411`), else the port owner, else the captor faction's command holder.
- **Ransomed → ransomer:** `captivity-released` with `moneyPaid + debtValue > 0`, toward `ransom.leaderId`, else the payee faction's command holder (`:105–110`; fallback confirmed by rev 2 ruling 7).
- **Ex-governor → buyer (NT patch only):** the seat holder by `governorId` (`governor.ts:131`), read before `settlement-transferred`; after the transfer and its news line, one `relationship-changed` per buyer (receiver's command holder and agent, deduplicated, never the governor) carrying `grudgeRelationship(...)` (`negotiated-transfer.ts:122–135` in the NT tree).

**New tie (rev 2 ruling 2).** A grudge toward someone with no tie creates `newTie` (`:28–31`): trust `NEW_TIE_TRUST` = 0.35 and respect `NEW_TIE_RESPECT` = 0.35, the contract score's missing-tie defaults `SCORE_TRUST` / `SCORE_RESPECT` (`contracts.ts:6–7`, read at `contracts.ts:147–148`; the same 0.35 as `agency.ts:187–188`); obligation 0 (the score's and `agency.ts:190`'s missing default); affinity 0.25 and fear 0.08 from `RELATIONSHIP_BASE` (`contracts.ts:13–20`; no reader has a missing-tie default for them). So creating a tie moves no contract or order score by itself; only grievance does. The values are literals because importing `contracts.ts` from `relationships.ts` reorders module initialisation (it broke nine AI / picker test files with a TDZ `ReferenceError` in a first attempt); `contracts.ts` now exports the two constants and the harness asserts equality.

**Step: 0.035, derived, not tuned** (unchanged): the existing per-wrong delta `DEFEAT.grievance` (`contracts.ts:24`, also `engine.ts:1131`). Four wrongs cross `HATED_GRIEVANCE` 0.12 (`secession.ts:450`) or `PEACE_GRIEVANCE` 0.12 (`secession-aftermath.ts:33`); the flag-off per-seed grievance p90 is 0.02–0.032, so one step ≈ one p90 tie.

**Reader 1, alliance partner order** (`alliances.ts:102–120`), unchanged: without a ledger the original loop; with one, each round picks the `valid()` candidate with least `mutualHarm`, ties by the original order. `allianceRaids` and the break conditions unchanged.

**Reader 2: dropped** (rev 2 ruling 3). `negotiated-transfer.ts` keeps its NT-patch receiver order (pact → peace → troops → id). Rev 1 measured it changing 0 of 217 receiver lists, and `ATLS-NT+R` pins and totals are identical in rev 1 and rev 2.

**Harm projection** (rev 1 ruling 5), unchanged: `projectFactions` adds `harmReceived` when `world.harm` exists (`visibility.ts:1001`): `harmReceivedRows` (`:120`) on the viewer's own faction row, `null` on every other row.

**Relationship-row visibility (rev 2 ruling 4).** `relationshipParty` (`client-readiness.ts:296`): the row's actor (whose relationship changed), or a viewer in the actor's current faction. `showInPlayerFeed` (`client-readiness.ts:303–305`) now takes `world` and drops a `relationship-changed` row for everyone else, so a non-party gets **no row** (not a withheld one). Its only call site is `projectEventFeed` (`view-model.ts:926`), which every player feed path uses (check-in feed, a command's own events, the stopping row).
- **Unconditional, not flagged.** It is a visibility fix to existing rows; the projection is not part of `stateHash`, and it applies with every flag off. Measured: every flag-off pin (main, ATL, ATLS + fix, ATLS-NT; exile on and off) is unchanged, and `R`, `ATLS+R`, `ATLS+R-exile-off`, `ATLS-NT+R` pins are identical to rev 1.
- No existing test needed changing (690 / 690 passed with the fix before the new test was added). The client-readiness withheld-keys scrub needs no entry: a non-party never gets the row, and a party's payload visibility is still `eventPayloadVisible`'s.
- New test `tests/relationship-feed-privacy.test.ts` (in both patches): the actor sees every relationship row of its own faction; an outsider sees only its own faction's rows.

**Diagnostic hook.** `reportReader` (`:129`): `globalThis.__relHook` when set; not state, not an event; used by `measure.ts` only (grudge writes now also report `created`).

## Property checks (`measure.ts`, every seed and set)

- Ledger equals an independent fold of the event log; absent when R is off; windows equal.
- Every grudge raises exactly one tie by `GRUDGE_STEP`; **no other field moves** on an existing tie; a created tie has trust / respect = the score defaults and affinity / fear / obligation = 0.25 / 0.08 / 0 (rev 2). The raider's ties do not change on a raid event (rev 2). Seat-loss writes: same step and field checks, and after their `settlement-transferred`. No capture with R-char lacks `captorId`; no `captorId` and no `world.grudges` with R-char off.
- Harm projection privacy every 100 ticks (one living member per faction): own row = `harmReceivedRows`, no self row, rival rows `null`, key absent without a ledger.
- **Relationship-row privacy (rev 2), every set including flag-off:** every 100 ticks, the last 100 ticks' `relationship-changed` events (up to 300) are projected through `projectEventFeed` for one member of every faction plus up to three of the events' actors; any relationship row whose actor is neither the viewer nor in the viewer's faction is a violation, and the number of rows must equal the party count.
- Replay exact (`replayWithSilentStarts`, `tick-start.ts:27`).

## Results, rev 2 (13 seeds × 1,200 ticks; `summary.md`)

Pressed port-ticks (Σ ports with stability ≤ 55 per tick) is the unrest proxy in the occupation-off sets; the `ATLS-occ` sets have occupation on (report-only; their pressed counts are not comparable with the occupation-off sets).

### Totals

| Set | Claims | Port changes | Battles | Captures | Secessions (seeds) | tax / promise / hated | Pressed port-ticks | Peaces | Pacts (ally-attack breaks) | Purchases | Transfers (offers / declines) |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | --- | ---: | --- |
| main | 682 | 713 | 927 | 247 | 31 (12/13) | 10 / 17 / 4 | 5102 | 0 | 0 (0) | 0 | 0 (0 / 0) |
| R | 682 | 713 | 927 | 247 | 31 (12/13) | 10 / 17 / 4 | 5102 | 0 | 0 (0) | 0 | 0 (0 / 0) |
| R+Rc | 661 | 687 | 910 | 235 | 26 (8/13) | 8 / 18 / 0 | 4289 | 0 | 0 (0) | 0 | 0 (0 / 0) |
| main-exile-off | 437 | 479 | 694 | 132 | 42 (11/13) | 22 / 19 / 2 | 3868 | 0 | 0 (0) | 0 | 0 (0 / 0) |
| R-exile-off | 437 | 479 | 694 | 132 | 42 (11/13) | 22 / 19 / 2 | 3868 | 0 | 0 (0) | 0 | 0 (0 / 0) |
| R+Rc-exile-off | 440 | 479 | 694 | 129 | 39 (12/13) | 20 / 18 / 2 | 3720 | 0 | 0 (0) | 0 | 0 (0 / 0) |
| ATLS | 488 | 539 | 895 | 221 | 37 (11/13) | 17 / 15 / 5 | 7504 | 24 | 59 (0) | 13 | 0 (0 / 0) |
| ATLS+R | 488 | 538 | 924 | 219 | 36 (11/13) | 16 / 16 / 4 | 8490 | 23 | 60 (0) | 14 | 0 (0 / 0) |
| ATLS+R+Rc | 450 | 491 | 846 | 192 | 28 (9/13) | 19 / 8 / 2 | 8562 | 17 | 47 (0) | 13 | 0 (0 / 0) |
| ATLS-exile-off | 374 | 421 | 778 | 157 | 33 (11/13) | 23 / 9 / 3 | 7102 | 24 | 50 (0) | 13 | 0 (0 / 0) |
| ATLS+R-exile-off | 369 | 418 | 737 | 159 | 34 (11/13) | 24 / 9 / 3 | 5509 | 24 | 53 (0) | 13 | 0 (0 / 0) |
| ATLS+R+Rc-exile-off | 369 | 419 | 740 | 162 | 35 (12/13) | 25 / 9 / 3 | 5537 | 22 | 48 (0) | 13 | 0 (0 / 0) |
| ATLS-NT | 464 | 551 | 840 | 156 | 32 (11/13) | 18 / 15 / 1 | 7031 | 20 | 55 (1) | 13 | 42 (48 / 6) |
| ATLS-NT+R | 478 | 569 | 851 | 163 | 33 (11/13) | 18 / 16 / 1 | 7565 | 21 | 53 (0) | 13 | 45 (52 / 7) |
| ATLS-NT+R+Rc | 441 | 522 | 872 | 177 | 29 (12/13) | 14 / 12 / 3 | 9271 | 18 | 45 (0) | 13 | 39 (44 / 5) |
| ATLS-NT-exile-off | 377 | 459 | 800 | 159 | 34 (13/13) | 23 / 12 / 2 | 6396 | 21 | 61 (0) | 14 | 33 (47 / 14) |
| ATLS-NT+R+Rc-exile-off | 359 | 438 | 808 | 168 | 34 (13/13) | 25 / 10 / 2 | 6392 | 20 | 46 (0) | 14 | 31 (41 / 10) |
| ATLS-occ | 416 | 459 | 764 | 175 | 28 (7/13) | 16 / 11 / 2 | 25031 | 16 | 44 (0) | 13 | 0 (0 / 0) |
| ATLS-occ+R+Rc | 389 | 426 | 681 | 141 | 23 (7/13) | 14 / 7 / 2 | 24456 | 13 | 22 (0) | 13 | 0 (0 / 0) |
| ATLS-occ-exile-off | 291 | 323 | 630 | 130 | 19 (10/13) | 11 / 5 / 4 | 23480 | 15 | 36 (0) | 13 | 0 (0 / 0) |
| ATLS-occ+R+Rc-exile-off | 282 | 320 | 653 | 120 | 24 (9/13) | 11 / 13 / 3 | 23921 | 18 | 44 (0) | 13 | 0 (0 / 0) |

### Reader 1, grudge writes, contracts, ledger

| Set | Reader 1: alliance decisions / changed | Grudge writes raid / capture / ransom / seat-lost (of which new ties) | Contracts offered / breached | Ledger pairs (max per seed) | Ledger total events | Max live entries / bytes per seed |
| --- | --- | --- | --- | --- | ---: | --- |
| main | 0 / 0 | 0 (0) / 0 (0) / 0 (0) / 0 (0) | 1865 / 449 | 0 (0) | 0 | 0 / 0 |
| R | 0 / 0 | 0 (0) / 0 (0) / 0 (0) / 0 (0) | 1865 / 449 | 123 (17) | 2007 | 57 / 3298 |
| R+Rc | 0 / 0 | 1485 (275) / 235 (24) / 184 (23) / 0 (0) | 1782 / 405 | 113 (20) | 1941 | 60 / 3623 |
| main-exile-off | 0 / 0 | 0 (0) / 0 (0) / 0 (0) / 0 (0) | 2102 / 475 | 0 (0) | 0 | 0 / 0 |
| R-exile-off | 0 / 0 | 0 (0) / 0 (0) / 0 (0) / 0 (0) | 2102 / 475 | 143 (21) | 1422 | 60 / 3804 |
| R+Rc-exile-off | 0 / 0 | 1117 (246) / 129 (20) / 90 (5) / 0 (0) | 2078 / 477 | 130 (16) | 1419 | 47 / 2567 |
| ATLS | 0 / 0 | 0 (0) / 0 (0) / 0 (0) / 0 (0) | 1820 / 473 | 0 (0) | 0 | 0 / 0 |
| ATLS+R | 59 / 10 | 0 (0) / 0 (0) / 0 (0) / 0 (0) | 1809 / 469 | 121 (26) | 1816 | 71 / 4744 |
| ATLS+R+Rc | 45 / 6 | 1434 (307) / 192 (29) / 128 (13) / 0 (0) | 1729 / 430 | 89 (18) | 1665 | 62 / 3506 |
| ATLS-exile-off | 0 / 0 | 0 (0) / 0 (0) / 0 (0) / 0 (0) | 1799 / 447 | 0 (0) | 0 | 0 / 0 |
| ATLS+R-exile-off | 50 / 7 | 0 (0) / 0 (0) / 0 (0) / 0 (0) | 1745 / 448 | 109 (17) | 1430 | 47 / 2889 |
| ATLS+R+Rc-exile-off | 47 / 7 | 1205 (285) / 162 (25) / 117 (9) / 0 (0) | 1715 / 445 | 109 (18) | 1435 | 47 / 2973 |
| ATLS-NT | 0 / 0 | 0 (0) / 0 (0) / 0 (0) / 0 (0) | 1869 / 473 | 0 (0) | 0 | 0 / 0 |
| ATLS-NT+R | 51 / 6 | 0 (0) / 0 (0) / 0 (0) / 0 (0) | 1821 / 458 | 104 (16) | 1658 | 52 / 2965 |
| ATLS-NT+R+Rc | 45 / 9 | 1459 (311) / 177 (32) / 132 (18) / 57 (16) | 1749 / 448 | 97 (16) | 1658 | 50 / 2904 |
| ATLS-NT-exile-off | 0 / 0 | 0 (0) / 0 (0) / 0 (0) / 0 (0) | 1792 / 427 | 0 (0) | 0 | 0 / 0 |
| ATLS-NT+R+Rc-exile-off | 46 / 10 | 1260 (281) / 168 (34) / 111 (5) / 48 (18) | 1760 / 413 | 118 (23) | 1495 | 62 / 4030 |
| ATLS-occ | 0 / 0 | 0 (0) / 0 (0) / 0 (0) / 0 (0) | 2135 / 478 | 0 (0) | 0 | 0 / 0 |
| ATLS-occ+R+Rc | 22 / 3 | 1190 (272) / 141 (22) / 116 (14) / 0 (0) | 1921 / 425 | 69 (13) | 1392 | 50 / 2680 |
| ATLS-occ-exile-off | 0 / 0 | 0 (0) / 0 (0) / 0 (0) / 0 (0) | 1931 / 490 | 0 (0) | 0 | 0 / 0 |
| ATLS-occ+R+Rc-exile-off | 43 / 8 | 1033 (261) / 120 (24) / 90 (7) / 0 (0) | 1912 / 476 | 97 (20) | 1204 | 51 / 3389 |

### Grievance distribution (tick 1,200, all `Character.relationships`, per-seed maxima)

| Set | Relationship entries | Grievance p90 (max seed) | p99 (max seed) | Max | Entries ≥ 0.12 | Earned ≠ 0 | Earned ≥ 0.12 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| main | 9725 | 0.02 | 0.212 | 0.405 | 168 | 1013 | 44 |
| R | 9725 | 0.02 | 0.212 | 0.405 | 168 | 1013 | 44 |
| R+Rc | 9870 | 0.058 | 0.21 | 0.77 | 280 | 1731 | 159 |
| main-exile-off | 9345 | 0.029 | 0.169 | 0.496 | 171 | 1004 | 54 |
| R-exile-off | 9345 | 0.029 | 0.169 | 0.496 | 171 | 1004 | 54 |
| R+Rc-exile-off | 9490 | 0.046 | 0.315 | 0.7 | 253 | 1534 | 131 |
| ATLS | 9627 | 0.029 | 0.213 | 0.585 | 200 | 980 | 59 |
| ATLS+R | 9654 | 0.029 | 0.213 | 0.482 | 194 | 983 | 62 |
| ATLS+R+Rc | 9894 | 0.052 | 0.224 | 0.7 | 309 | 1676 | 174 |
| ATLS-exile-off | 9768 | 0.032 | 0.175 | 0.51 | 188 | 949 | 57 |
| ATLS+R-exile-off | 9650 | 0.032 | 0.175 | 0.43 | 188 | 941 | 55 |
| ATLS+R+Rc-exile-off | 9812 | 0.061 | 0.248 | 0.84 | 277 | 1576 | 141 |
| ATLS-NT | 9423 | 0.029 | 0.212 | 0.619 | 190 | 983 | 59 |
| ATLS-NT+R | 9500 | 0.029 | 0.212 | 0.619 | 186 | 987 | 57 |
| ATLS-NT+R+Rc | 9670 | 0.063 | 0.285 | 0.665 | 328 | 1723 | 183 |
| ATLS-NT-exile-off | 9587 | 0.029 | 0.191 | 0.51 | 187 | 946 | 48 |
| ATLS-NT+R+Rc-exile-off | 9778 | 0.064 | 0.315 | 0.735 | 298 | 1577 | 154 |
| ATLS-occ | 9509 | 0.032 | 0.201 | 0.459 | 173 | 984 | 43 |
| ATLS-occ+R+Rc | 9615 | 0.037 | 0.21 | 0.91 | 269 | 1533 | 137 |
| ATLS-occ-exile-off | 9544 | 0.032 | 0.177 | 0.419 | 197 | 1010 | 48 |
| ATLS-occ+R+Rc-exile-off | 9473 | 0.052 | 0.22 | 0.945 | 271 | 1524 | 129 |

### Rev 1 → rev 2

| Set | Secessions (seeds) | tax / promise / hated | Captures | Claims | Pressed port-ticks | Pacts | Reader 1 changed | Grudge writes raid | Contracts offered |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| main | 31 (12) → 31 (12) | 10/17/4 → 10/17/4 | 247 → 247 | 682 → 682 | 5102 → 5102 | 0 → 0 | 0/0 → 0/0 | 0 → 0 | 1865 → 1865 |
| R | 31 (12) → 31 (12) | 10/17/4 → 10/17/4 | 247 → 247 | 682 → 682 | 5102 → 5102 | 0 → 0 | 0/0 → 0/0 | 0 → 0 | — → 1865 |
| R+Rc | 16 (7) → 26 (8) | 4/12/0 → 8/18/0 | 197 → 235 | 615 → 661 | 4868 → 4289 | 0 → 0 | 0/0 → 0/0 | 1441 → 1485 | 1696 → 1782 |
| main-exile-off | 42 (11) → 42 (11) | 22/19/2 → 22/19/2 | 132 → 132 | 437 → 437 | 3868 → 3868 | 0 → 0 | 0/0 → 0/0 | 0 → 0 | — → 2102 |
| R-exile-off | 42 (11) → 42 (11) | 22/19/2 → 22/19/2 | 132 → 132 | 437 → 437 | 3868 → 3868 | 0 → 0 | 0/0 → 0/0 | 0 → 0 | — → 2102 |
| R+Rc-exile-off | 40 (11) → 39 (12) | 19/19/3 → 20/18/2 | 131 → 129 | 434 → 440 | 3871 → 3720 | 0 → 0 | 0/0 → 0/0 | 1113 → 1117 | — → 2078 |
| ATLS | 37 (11) → 37 (11) | 17/15/5 → 17/15/5 | 221 → 221 | 488 → 488 | 7504 → 7504 | 59 → 59 | 0/0 → 0/0 | 0 → 0 | 1820 → 1820 |
| ATLS+R | 36 (11) → 36 (11) | 16/16/4 → 16/16/4 | 219 → 219 | 488 → 488 | 8490 → 8490 | 60 → 60 | 10/59 → 10/59 | 0 → 0 | — → 1809 |
| ATLS+R+Rc | 40 (9) → 28 (9) | 18/19/3 → 19/8/2 | 161 → 192 | 467 → 450 | 7846 → 8562 | 73 → 47 | 8/71 → 6/45 | 1414 → 1434 | 1601 → 1729 |
| ATLS-exile-off | 33 (11) → 33 (11) | 23/9/3 → 23/9/3 | 157 → 157 | 374 → 374 | 7102 → 7102 | 50 → 50 | 0/0 → 0/0 | 0 → 0 | — → 1799 |
| ATLS+R-exile-off | 34 (11) → 34 (11) | 24/9/3 → 24/9/3 | 159 → 159 | 369 → 369 | 5509 → 5509 | 53 → 53 | 7/50 → 7/50 | 0 → 0 | — → 1745 |
| ATLS+R+Rc-exile-off | 35 (12) → 35 (12) | 24/10/3 → 25/9/3 | 155 → 162 | 357 → 369 | 5750 → 5537 | 59 → 48 | 9/56 → 7/47 | 1181 → 1205 | — → 1715 |
| ATLS-NT | 32 (11) → 32 (11) | 18/15/1 → 18/15/1 | 156 → 156 | 464 → 464 | 7031 → 7031 | 55 → 55 | 0/0 → 0/0 | 0 → 0 | — → 1869 |
| ATLS-NT+R | 33 (11) → 33 (11) | 18/16/1 → 18/16/1 | 163 → 163 | 478 → 478 | 7565 → 7565 | 53 → 53 | 6/51 → 6/51 | 0 → 0 | 1821 → 1821 |
| ATLS-NT+R+Rc | 27 (8) → 29 (12) | 12/12/4 → 14/12/3 | 200 → 177 | 523 → 441 | 7783 → 9271 | 53 → 45 | 8/52 → 9/45 | 1538 → 1459 | 1639 → 1749 |
| ATLS-NT-exile-off | 34 (13) → 34 (13) | 23/12/2 → 23/12/2 | 159 → 159 | 377 → 377 | 6396 → 6396 | 61 → 61 | 0/0 → 0/0 | 0 → 0 | — → 1792 |
| ATLS-NT+R+Rc-exile-off | 34 (13) → 34 (13) | 23/12/2 → 25/10/2 | 166 → 168 | 359 → 359 | 6300 → 6392 | 55 → 46 | 12/54 → 10/46 | 1244 → 1260 | — → 1760 |
| ATLS-occ | new: 28 (7/13) | 16 / 11 / 2 | 175 | 416 | 25031 | 44 | 0 | 0 | 2135 |
| ATLS-occ+R+Rc | new: 23 (7/13) | 14 / 7 / 2 | 141 | 389 | 24456 | 22 | 3 | 1190 | 1921 |
| ATLS-occ-exile-off | new: 19 (10/13) | 11 / 5 / 4 | 130 | 291 | 23480 | 36 | 0 | 0 | 1931 |
| ATLS-occ+R+Rc-exile-off | new: 24 (9/13) | 11 / 13 / 3 | 120 | 282 | 23921 | 44 | 8 | 1033 | 1912 |

Rev-1 contracts-offered figures exist only where the rev-1 `diag/` ran the same set (main, R + R-char, ATLS, ATLS + R + R-char, ATLS-NT + R, ATLS-NT + R + R-char); "—" elsewhere.

Grievance, rev 1 → rev 2 (p90 max seed / p99 max seed / max / earned ≥ 0.12):

- main: 0.02 / 0.212 / 0.405 / 44 → 0.02 / 0.212 / 0.405 / 44
- R: 0.02 / 0.212 / 0.405 / 44 → 0.02 / 0.212 / 0.405 / 44
- R+Rc: 0.052 / 0.245 / 1 / 152 → 0.058 / 0.21 / 0.77 / 159
- main-exile-off: 0.029 / 0.169 / 0.496 / 54 → 0.029 / 0.169 / 0.496 / 54
- R-exile-off: 0.029 / 0.169 / 0.496 / 54 → 0.029 / 0.169 / 0.496 / 54
- R+Rc-exile-off: 0.035 / 0.239 / 0.919 / 129 → 0.046 / 0.315 / 0.7 / 131
- ATLS: 0.029 / 0.213 / 0.585 / 59 → 0.029 / 0.213 / 0.585 / 59
- ATLS+R: 0.029 / 0.213 / 0.482 / 62 → 0.029 / 0.213 / 0.482 / 62
- ATLS+R+Rc: 0.061 / 0.294 / 0.951 / 166 → 0.052 / 0.224 / 0.7 / 174
- ATLS-exile-off: 0.032 / 0.175 / 0.51 / 57 → 0.032 / 0.175 / 0.51 / 57
- ATLS+R-exile-off: 0.032 / 0.175 / 0.43 / 55 → 0.032 / 0.175 / 0.43 / 55
- ATLS+R+Rc-exile-off: 0.061 / 0.25 / 1 / 151 → 0.061 / 0.248 / 0.84 / 141
- ATLS-NT: 0.029 / 0.212 / 0.619 / 59 → 0.029 / 0.212 / 0.619 / 59
- ATLS-NT+R: 0.029 / 0.212 / 0.619 / 57 → 0.029 / 0.212 / 0.619 / 57
- ATLS-NT+R+Rc: 0.061 / 0.294 / 0.928 / 188 → 0.063 / 0.285 / 0.665 / 183
- ATLS-NT-exile-off: 0.029 / 0.191 / 0.51 / 48 → 0.029 / 0.191 / 0.51 / 48
- ATLS-NT+R+Rc-exile-off: 0.061 / 0.371 / 0.846 / 159 → 0.064 / 0.315 / 0.735 / 154
- ATLS-occ: — → 0.032 / 0.201 / 0.459 / 43
- ATLS-occ+R+Rc: — → 0.037 / 0.21 / 0.91 / 137
- ATLS-occ-exile-off: — → 0.032 / 0.177 / 0.419 / 48
- ATLS-occ+R+Rc-exile-off: — → 0.052 / 0.22 / 0.945 / 129

Readout:
- **Sets without R-char are identical to rev 1** (totals and pins): R, R-exile-off, ATLS + R, ATLS + R-exile-off, and ATLS-NT + R (dropping reader 2 changed nothing because it never reordered a list).
- **Secessions after the flip:** main + R + R-char 16 (7/13) → **26 (8/13)**; ATLS + R + R-char 40 (9/13) → **28 (9/13)**; ATLS-NT + R + R-char 27 (8/13) → **29 (12/13)**; exile-off sets 39 (12/13), 35 (12/13), 34 (13/13). Gate ≥ 6/13 holds everywhere; the lowest is 7/13, in `ATLS-occ` (flag-off base) and `ATLS-occ+R+Rc`.
- **Routes:** hated stays low (0–3 per R-char set); on ATLS the promise route falls 19 → 8 (base 15) and pacts fall 73 → 47 (base 59), pressed port-ticks rise 7,846 → 8,562 (base 7,504).
- **Contracts offered** still fall against each flag-off base with R-char (main 1,865 → 1,782; ATLS 1,820 → 1,729; ATLS-NT 1,869 → 1,749; exile-off 2,102 → 2,078, 1,799 → 1,715, 1,792 → 1,760), but less than rev 1 on the comparable sets (main + R + R-char 1,696 → 1,782; ATLS + R + R-char 1,601 → 1,729). With trust / respect at the score defaults, the remaining drop is grievance itself (the score's `−grievance × 0.18`, `contracts.ts:149`) plus changed histories; not traced further.
- **Writer counts** (e.g. ATLS + R + R-char): raid 1,434 (307 new ties), capture 192 (29), ransom 128 (13); ATLS-NT + R + R-char adds 57 seat-loss writes (16 new ties).
- **Grievance:** R-char still roughly triples ties with earned grievance ≥ 0.12 (main 44 → 159, ATLS 59 → 174, ATLS-NT 59 → 183); the per-set maximum is 0.665–0.945 (rev 1: 0.846–1, reaching the clamp).
- **Occupation on (report-only):** ATLS-occ 28 (7/13) → ATLS-occ + R + R-char 23 (7/13); exile-off 19 (10/13) → 24 (9/13). Pressed port-ticks 25,031 → 24,456 and 23,480 → 23,921. Pacts 44 → 22 (exile on) and 36 → 44 (exile off).

## Gates (rev 2)

| Set | Base | Secessions ≥ 6/13 | Liveness (min claims / port changes) | New wipeouts | Replay exact | R / R-char property + privacy violations (checks) |
| --- | --- | --- | --- | --- | --- | --- |
| main | — | pass (12) | pass (28 / 31) | none | pass | 0  (508 harm-projection, 974 relationship-row feeds / 54391 rows, 0 grudge) |
| R | main | pass (12) | pass (28 / 31) | none | pass | 0  (508 harm-projection, 974 relationship-row feeds / 54391 rows, 0 grudge) |
| R+Rc | main | pass (8) | pass (19 / 19) | none | pass | 0  (469 harm-projection, 933 relationship-row feeds / 56712 rows, 1904 grudge) |
| main-exile-off | — | pass (11) | pass (24 / 25) | none | pass | 0  (569 harm-projection, 1034 relationship-row feeds / 53976 rows, 0 grudge) |
| R-exile-off | main-exile-off | pass (11) | pass (24 / 25) | none | pass | 0  (569 harm-projection, 1034 relationship-row feeds / 53976 rows, 0 grudge) |
| R+Rc-exile-off | main-exile-off | pass (12) | pass (24 / 25) | none | pass | 0  (544 harm-projection, 1009 relationship-row feeds / 54517 rows, 1336 grudge) |
| ATLS | — | pass (11) | pass (25 / 28) | none | pass | 0  (505 harm-projection, 971 relationship-row feeds / 58686 rows, 0 grudge) |
| ATLS+R | ATLS | pass (11) | pass (25 / 28) | none | pass | 0  (499 harm-projection, 964 relationship-row feeds / 59331 rows, 0 grudge) |
| ATLS+R+Rc | ATLS | pass (9) | pass (9 / 11) | none | pass | 0  (456 harm-projection, 920 relationship-row feeds / 58417 rows, 1754 grudge) |
| ATLS-exile-off | — | pass (11) | pass (12 / 14) | none | pass | 0  (481 harm-projection, 947 relationship-row feeds / 60980 rows, 0 grudge) |
| ATLS+R-exile-off | ATLS-exile-off | pass (11) | pass (13 / 14) | none | pass | 0  (490 harm-projection, 957 relationship-row feeds / 61231 rows, 0 grudge) |
| ATLS+R+Rc-exile-off | ATLS-exile-off | pass (12) | pass (13 / 14) | none | pass | 0  (488 harm-projection, 955 relationship-row feeds / 61056 rows, 1484 grudge) |
| ATLS-NT | — | pass (11) | pass (18 / 22) | none | pass | 0  (507 harm-projection, 972 relationship-row feeds / 57362 rows, 0 grudge) |
| ATLS-NT+R | ATLS-NT | pass (11) | pass (18 / 22) | none | pass | 0  (518 harm-projection, 983 relationship-row feeds / 57200 rows, 0 grudge) |
| ATLS-NT+R+Rc | ATLS-NT | pass (12) | pass (18 / 22) | none | pass | 0  (491 harm-projection, 957 relationship-row feeds / 57903 rows, 1825 grudge) |
| ATLS-NT-exile-off | — | pass (13) | pass (11 / 15) | none | pass | 0  (496 harm-projection, 961 relationship-row feeds / 58320 rows, 0 grudge) |
| ATLS-NT+R+Rc-exile-off | ATLS-NT-exile-off | pass (13) | pass (11 / 17) | none | pass | 0  (487 harm-projection, 953 relationship-row feeds / 60290 rows, 1587 grudge) |
| ATLS-occ | — | pass (7) | pass (13 / 15) | none | pass | 0  (438 harm-projection, 906 relationship-row feeds / 58303 rows, 0 grudge) |
| ATLS-occ+R+Rc | ATLS-occ | pass (7) | pass (18 / 19) | none | pass | 0  (422 harm-projection, 890 relationship-row feeds / 58790 rows, 1447 grudge) |
| ATLS-occ-exile-off | — | pass (10) | pass (8 / 10) | none | pass | 0  (429 harm-projection, 893 relationship-row feeds / 59501 rows, 0 grudge) |
| ATLS-occ+R+Rc-exile-off | ATLS-occ-exile-off | pass (9) | pass (9 / 11) | none | pass | 0  (448 harm-projection, 916 relationship-row feeds / 56980 rows, 1243 grudge) |

Existing checkers (`props-out/`): ALLIANCES (rev-2, with the break-condition property), SECESSION AFTERMATH, LIFECYCLE and PORT TRANSFER **ACCEPTANCE PASSED** on all 9 checker sets (ATLS + R, ATLS + R + R-char, both exile-off; ATLS-NT + R, ATLS-NT + R + R-char, its exile-off; ATLS-occ + R + R-char, its exile-off): 36 / 36 runs, exit 0. NT checker (`measure-nt.ts`): 0 violations, replay exact, on ATLS-NT + R (45 accepts), ATLS-NT + R + R-char (39) and its exile-off (31).

`npm test`: 691 / 691 (690 existing + the new feed-privacy test) on fix + relationships (`npm-test-fix+R.txt`) and on fix + NT + relationships-nt (`npm-test-fix+NT+R-nt.txt`).

## Pins (72 / 1,200; seeds 1847 / 2718 / 4096), rev 2 vs rev 1

- main: 1847 7f76e474/94de9c02; 2718 976c40bd/7a3741c9; 4096 08943ea5/af6eeaea (unchanged)
- R: 1847 e240eee9/5df01726; 2718 3010cea0/a1a5d939; 4096 5e99e237/183e53f8 (unchanged)
- R+Rc: 1847 c2201b9e/ecf9fe41; 2718 b05d0a4c/7bec8793; 4096 a837384a/cfddb209 (MOVED)
- main-exile-off: 1847 66e8ccb7/b51aa07a; 2718 b4ccedab/091f7628; 4096 b04c5ac4/25bdbf15 (unchanged)
- R-exile-off: 1847 e24b7b33/74848b51; 2718 62cea69c/d4ec4552; 4096 6f21b6f5/3f913c7b (unchanged)
- R+Rc-exile-off: 1847 d15e9f34/f62d0f39; 2718 6490b592/91ff461a; 4096 3a671ae0/22c0f1ab (MOVED)
- ATLS: 1847 85658e53/5367691c; 2718 aa54ada1/faf5798a; 4096 e4361ee1/7e93eab2 (unchanged)
- ATLS+R: 1847 3ff0b147/60da6fe0; 2718 32dae13b/99b20a65; 4096 188e9040/e4c3acc8 (unchanged)
- ATLS+R+Rc: 1847 8c72d57c/024453b8; 2718 ab061e6f/7e5ec351; 4096 afb586fb/3a5dbdf9 (MOVED)
- ATLS-exile-off: 1847 296b11bc/4c1555e9; 2718 9f8b2f2b/c897ea88; 4096 93e6bfeb/226bad48 (unchanged)
- ATLS+R-exile-off: 1847 0db3d80d/71218820; 2718 3a943bbf/992a4a6d; 4096 b0e81d11/2ef82408 (unchanged)
- ATLS+R+Rc-exile-off: 1847 85cd1557/4fecaa62; 2718 bc8db6c8/7a2d858f; 4096 58aaf98b/4a1c65a5 (MOVED)
- ATLS-NT: 1847 fd8d2637/80767d69; 2718 a21c1263/90d9f435; 4096 0402aeab/8a2448fb (unchanged)
- ATLS-NT+R: 1847 cbef31f7/f813e2ce; 2718 bd4e7c81/da4b7bc8; 4096 c94bddbe/03613ef8 (unchanged)
- ATLS-NT+R+Rc: 1847 0464d3a9/18618f65; 2718 7fb4cd89/32c2db68; 4096 9bbec103/34b46e6b (MOVED)
- ATLS-NT-exile-off: 1847 bf9b8852/66ddc056; 2718 c4f1516f/21175258; 4096 c09a2fc3/0af2f809 (unchanged)
- ATLS-NT+R+Rc-exile-off: 1847 96b136fc/c08b1722; 2718 610a68b3/d2d93a0c; 4096 288399a1/435c6509 (MOVED)
- ATLS-occ: 1847 1a6ca46d/8f24dbc1; 2718 6e420f40/291baf95; 4096 8ff3aa5c/db910f20 (new set)
- ATLS-occ+R+Rc: 1847 f7e25d4e/8763a454; 2718 42261e9b/55277651; 4096 b242c8dd/52c74ca2 (new set)
- ATLS-occ-exile-off: 1847 b7c77e70/841597a0; 2718 4ce73957/6735aabb; 4096 ac3340cd/95a3ef66 (new set)
- ATLS-occ+R+Rc-exile-off: 1847 e479875f/ba56de7f; 2718 6dca7355/fafc893c; 4096 e3fd40ae/b4d1497a (new set)

**Moved** (expected, R-char behaviour changed): R + R-char, ATLS + R + R-char, ATLS-NT + R + R-char, each exile on and off. **Unchanged:** every flag-off set (main, ATLS + fix, ATLS-NT, exile on and off, plus ATL and ATL-exile-off in `raw/pins-crosscheck-*.txt`, all equal to `protection-pact-fix/post-192/pins.txt` and `negotiated-transfer.md`) despite the unconditional feed fix; and R, R-exile-off, ATLS + R, ATLS + R-exile-off, ATLS-NT + R. **New:** the four `ATLS-occ` sets.

## Risks and open questions for the Lead

1. **"Own faction" is the actor's faction at view time.** A character who later changes faction moves its old relationship rows with it (the new faction sees them, the old one stops seeing them). The alternative is the faction recorded at event time, which would need a field on the event (a sim change). Acceptable?
2. **Same-faction viewers see the row; payload rules unchanged.** A faction-mate who is not the actor now gets the row, and whether its payload is shown is still decided by `eventPayloadVisible` (not changed here; the existing redaction test checks the actor sees it). If faction-mates should always see the payload, that is a further change.
3. **Contracts still fall with R-char** (1–6 % fewer offers against each flag-off base), now through grievance itself; this is the grievance reader working as designed, not a side channel. Flagging only because rev 1 asked.
4. **ATLS + R + R-char pacts 59 → 47 and promise secessions 15 → 8** against the ATLS base after the flip (rev 1 had 73 and 19). Emergent; the chain was not traced; reported, not acted on.
5. **Occupation on, exile on** sits at 7/13 seeds both flag-off and with R + R-char (exile off: 10/13 → 9/13); report-only, as ruled.
