# Directed relationships (v1 prototype: harm ledger R + personal grievance R-char)

Status: **prototype / patches only** (not committed to `src`). Base: main `993bbc6`. Two flags, both default off.
Scope: [`directed-relationships-scope.md`](https://github.com/taia-0/Open-Era/blob/docs/directed-relationships-scope/docs/design/directed-relationships-scope.md)
(branch `docs/directed-relationships-scope`, `98e7ab3`). This doc implements the Lead's rulings on that scope sketch, listed below.
Every number here comes from the runs in [`directed-relationships/`](directed-relationships/). No constant was tuned toward a target.

## Rulings (Lead, on the scope sketch)

1. Build the faction → faction **harm ledger** (flag `relationships`, "R") as sketched. Also add **R-char** (flag `relationshipsChar`), which writes personal grievance into `Character.relationships` from the events where people wrong each other:
   - the raid commander → the defending holder and the defending commander;
   - captive → captor;
   - ransomed → ransomer;
   - the seller's governor → the buyer, when the seat is lost in a negotiated transfer (NT is a patch, so this is measured on the NT patch).

   Derive the step from the existing scale, thresholds and distributions, with no tuning. Emergent secession and unrest shifts are the desired dynamism. Gates are property checks only.
2. Harm only, no goodwill.
3. Two readers: alliance partner order (ascending mutual harm), and NT receiver ranking, with harm(receiver > seller) before docked troops.
4. Keep `allianceRaids` and the peace gate unchanged in v1.
5. No UI. The victim knows who harmed it: harm received, by faction, with counts and last tick, goes into the own-faction projection. Harm dealt and third-party harm stay hidden. Add projection-privacy property checks.

## Artifacts

| File | What |
| --- | --- |
| `directed-relationships/relationships.patch` | Applies on `993bbc6` + `protection-pact-fix/fix.patch` (verified with `git apply --check` and a byte comparison). |
| `directed-relationships/relationships-nt.patch` | Applies on `993bbc6` + `fix.patch` + `negotiated-transfer/negotiated-transfer.patch`. It is the same code plus reader 2 and the seat-lost writer in `negotiated-transfer.ts`. |
| `measure.ts`, `run-all.sh`, `summarize.py`, `summary.md`/`.json`, `raw/` | 17 sets × 13 seeds × 1,200 ticks, with every flag explicit (`raw/sets-json.txt`). |
| `run-props.sh`, `props-out/` | The existing checkers (alliances rev-2 with the break property, aftermath, lifecycle, port transfer) with R / R+R-char in `DEFAULTS_ON_BASE`, plus the NT checker `negotiated-transfer/measure-nt.ts` on the NT sets. |
| `pins-crosscheck.sh`, `raw/pins-crosscheck-*.txt` | Flag-off pins and ATLS+R(+Rc) pins on both trees (fix+R and fix+NT+R-nt). |
| `npm-test-*.txt` | `npm test` on each patch stack. |
| `diag/` | Diagnosis only, **not in either patch**. A leave-one-writer-in env filter (`diag-only-src.diff`), `diag-measure.ts` (adds contract counts and reader-2 shape counters), and `run-diag.sh`. |

Runs: `run-all.sh` and `run-props.sh` run on a tree with fix + NT + relationships-nt applied. NT off is byte-identical (negotiated-transfer.md §5), and the ATLS+R / ATLS+R+Rc pins match on the fix + relationships tree (`raw/pins-crosscheck-fix+R.txt` = `raw/pins-crosscheck-fix+NT+R.txt`).

## Spec

Line numbers below are in the patched tree, `src/sim/relationships.ts` (new), unless they name another file.

**Flags.** `TickOptions.relationships` and `TickOptions.relationshipsChar` default to `RELATIONSHIPS_DEFAULT` / `RELATIONSHIPS_CHAR_DEFAULT` = false (`:12–13`). The engine reads them each tick (`engine.ts:4574–4575`). R-char works without R: the two are independent.

**Flag-off neutrality.** World fields stay absent until an opener event, following the `alliance-ledger-opened` precedent:
- The engine emits `harm-ledger-opened` / `grudge-ledger-opened` once at the start of the tick body (`engine.ts:4594–4595`).
- `applyEvent` handles both early (`state.ts:565`), creating `world.harm = {}` / `world.grudges = true` (`types.ts:783/785`).
- Both are added to `PLAYER_FEED_BOOKKEEPING` (`client-readiness.ts:26–27`).

With both flags off nothing is emitted, and every flag-off pin is unchanged (below).

**Harm ledger (R).** `world.harm["by>on"] = { recent: {tick, kind}[], total, lastTick }`.
- `noteHarm` (`:72–109`) is a reducer hook that runs in `applyEvent` before the event's own case (`state.ts:586`, just before `noteRaid`). It is derived from existing events and adds no new event:
  - **raid:** `battle-started`, or `battle-resolved` without `battleId` (the same test `alliances.ts` `noteRaid` uses). Records attacker faction > `targetId`.
  - **capture:** `character-captured`. Records captor faction > prisoner faction.
  - **claim:** `settlement-claimed`. Records `factionId` > `previousFactionId`.
- Unit weight, no severity numbers.
- Window `HARM_WINDOW` = 152 (`:15`), equal to `ALLIANCE_RAID_WINDOW` (`alliances.ts:11`), which the scope measured as the p90 inter-raid gap. It is a literal because the two modules import each other, and `measure.ts` asserts the two are equal.
- Entries are pruned on write (`:51`) and filtered on read (`harmCount`, `:33–35`). `mutualHarm(a, b)` = harm(a>b) + harm(b>a) (`:37`).

**Personal grievance (R-char).**
- `grudge(from, to)` (`:63–69`) adds `GRUDGE_STEP` to `from.relationships[to].grievance`, clamped to [0, 1].
- A missing tie starts from `RELATIONSHIP_BASE` (`contracts.ts:13–20`: trust .28, affinity .25, respect .28, fear .08, grievance 0, obligation 0).
- Only grievance moves. Harm only: no other field changes and there is no goodwill (ruling 2).

The writers:
- **Raid** (same events as the ledger raid): attacker → the raided port's `ownerId`, and attacker → `commandHolderId(defender)`, deduplicated (`:80–86`).
- **Capture:** prisoner → `data.captorId`.
  - `attemptCapture` adds `captorId` only when R-char is on (`engine.ts:785`): the explicit captor (the out-scored character, `engine.ts:1411`), else the port owner, else the captor faction's command holder.
  - With R-char off the event payload is unchanged.
- **Ransom:** `captivity-released` with `moneyPaid + debtValue > 0`: released → `ransom.leaderId`, falling back to the command holder of `targetId` (`:97–103`).
- **Seat lost (NT patch only)** (`negotiated-transfer.ts:133–145` in the NT-stacked tree):
  - The seat holder is read with `governorId` (`governor.ts:131`) before `settlement-transferred`.
  - After the transfer and its news line, the engine emits one `relationship-changed` (actor = governor, data = `grudgeRelationship(...)`) per buyer: the receiver's command holder and the agent, deduplicated, never the governor.
  - It is emitted after the transfer so the NT checker's "transfer immediately after its offer" property still holds. The first version emitted between offer and transfer, and the checker caught it: 34 / 25 violations.
- The raid, capture and ransom writers are reducer-derived (no event). The seat writer is the existing event type, so replay and the feed treat it like any other relationship write.

**Step: 0.035, derived, not tuned.**
- It is the one existing per-wrong grievance shift: `DEFEAT.grievance` +0.035 (`contracts.ts:24`), the same value the order-defeat write uses (`engine.ts:1131`).
- Against the readers' thresholds (`HATED_GRIEVANCE` 0.12, `secession.ts:450`; `PEACE_GRIEVANCE` 0.12, `secession-aftermath.ts:33`), a tie needs 4 wrongs inside a lifetime with no offsetting victories to cross either line (0.035 × 4 = 0.14).
- This fits the base distribution: the flag-off grievance p90 is 0.02–0.032 per seed (table 3), so 0.035 is "one notable wrong", about one p90 tie. No reader threshold was changed.

**Reader 1: alliance partner order** (`alliances.ts:102–120`).
- With no ledger, the original loop runs untouched (`:102`).
- With a ledger, each round builds the same `valid()` candidate list in the original id order, picks the minimum (`mutualHarm`, original index), and forms that pact.
- `allianceRaids` and the break conditions are unchanged (ruling 4).

**Reader 2: NT receiver ranking** (`negotiated-transfer.ts:54–60` in the NT-stacked tree). The sort is pact → peace → **harm(receiver > seller) ascending** → docked troops → id. The peace gate is unchanged.

**Projection (ruling 5).** `projectFactions` adds `harmReceived` only when `world.harm` exists (`visibility.ts:1001`):
- the viewer's own faction row gets `harmReceivedRows` (`:112–117`): `{factionId, recent (window count), total, lastTick}` per harming faction;
- every other row gets `null`.

Harm dealt, and harm between third parties, appear nowhere in any projection. The R-char raid, capture and ransom grievances live in `Character.relationships`, which keeps its existing visibility (the commander's own view).

**Diagnostic hook.** `reportReader` (`:121`) calls `globalThis.__relHook` when set. It is not state and not an event, and is used by `measure.ts` only.

## Property checks (`measure.ts`, every seed and set)

- **Ledger:** `world.harm` equals an independent fold of the event log under the rules above (window, kinds, total, lastTick). It is absent when R is off. The two windows are equal.
- **Grudges:** every reducer-derived grudge raises exactly one tie by `GRUDGE_STEP` (clamped). The seat-lost write comes after its `settlement-transferred` (`x.sequence < e.sequence`). No capture-with-R-char lacks `captorId`. With R-char off, no `captorId` appears and `world.grudges` is absent.
- **Privacy (every 100 ticks, one living member per faction as viewer):**
  - the own row equals `harmReceivedRows` with no self row;
  - rival rows are `null`;
  - the key is absent without a ledger.
  - In `projectEventFeed`, a seat-lost `relationship-changed` payload is visible only to its actor.
- **Replay:** exact (`replayWithSilentStarts`, `tick-start.ts:27`), both hashes.

## Results (13 seeds × 1,200 ticks; `summary.md`)

Pressed port-ticks (Σ ports with stability ≤ 55 per tick) is the unrest proxy, since occupation is off in every set.

### Totals

| Set | Claims | Port changes | Battles | Captures | Secessions (seeds) | tax / promise / hated | Pressed port-ticks | Peaces | Pacts (ally-attack breaks) | Purchases | Transfers (offers / declines) |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | --- | ---: | --- |
| main | 682 | 713 | 927 | 247 | 31 (12/13) | 10 / 17 / 4 | 5102 | 0 | 0 (0) | 0 | 0 (0 / 0) |
| R | 682 | 713 | 927 | 247 | 31 (12/13) | 10 / 17 / 4 | 5102 | 0 | 0 (0) | 0 | 0 (0 / 0) |
| R+Rc | 615 | 631 | 864 | 197 | 16 (7/13) | 4 / 12 / 0 | 4868 | 0 | 0 (0) | 0 | 0 (0 / 0) |
| main-exile-off | 437 | 479 | 694 | 132 | 42 (11/13) | 22 / 19 / 2 | 3868 | 0 | 0 (0) | 0 | 0 (0 / 0) |
| R-exile-off | 437 | 479 | 694 | 132 | 42 (11/13) | 22 / 19 / 2 | 3868 | 0 | 0 (0) | 0 | 0 (0 / 0) |
| R+Rc-exile-off | 434 | 474 | 689 | 131 | 40 (11/13) | 19 / 19 / 3 | 3871 | 0 | 0 (0) | 0 | 0 (0 / 0) |
| ATLS | 488 | 539 | 895 | 221 | 37 (11/13) | 17 / 15 / 5 | 7504 | 24 | 59 (0) | 13 | 0 (0 / 0) |
| ATLS+R | 488 | 538 | 924 | 219 | 36 (11/13) | 16 / 16 / 4 | 8490 | 23 | 60 (0) | 14 | 0 (0 / 0) |
| ATLS+R+Rc | 467 | 522 | 855 | 161 | 40 (9/13) | 18 / 19 / 3 | 7846 | 26 | 73 (0) | 14 | 0 (0 / 0) |
| ATLS-exile-off | 374 | 421 | 778 | 157 | 33 (11/13) | 23 / 9 / 3 | 7102 | 24 | 50 (0) | 13 | 0 (0 / 0) |
| ATLS+R-exile-off | 369 | 418 | 737 | 159 | 34 (11/13) | 24 / 9 / 3 | 5509 | 24 | 53 (0) | 13 | 0 (0 / 0) |
| ATLS+R+Rc-exile-off | 357 | 407 | 731 | 155 | 35 (12/13) | 24 / 10 / 3 | 5750 | 23 | 59 (0) | 13 | 0 (0 / 0) |
| ATLS-NT | 464 | 551 | 840 | 156 | 32 (11/13) | 18 / 15 / 1 | 7031 | 20 | 55 (1) | 13 | 42 (48 / 6) |
| ATLS-NT+R | 478 | 569 | 851 | 163 | 33 (11/13) | 18 / 16 / 1 | 7565 | 21 | 53 (0) | 13 | 45 (52 / 7) |
| ATLS-NT+R+Rc | 523 | 606 | 924 | 200 | 27 (8/13) | 12 / 12 / 4 | 7783 | 19 | 53 (0) | 13 | 41 (54 / 13) |
| ATLS-NT-exile-off | 377 | 459 | 800 | 159 | 34 (13/13) | 23 / 12 / 2 | 6396 | 21 | 61 (0) | 14 | 33 (47 / 14) |
| ATLS-NT+R+Rc-exile-off | 359 | 436 | 796 | 166 | 34 (13/13) | 23 / 12 / 2 | 6300 | 19 | 55 (0) | 14 | 29 (40 / 11) |

R alone has no reader on the flags-off base, so its totals equal main's: only the hashes move, because `world.harm` is part of state.

### Readers, writes, ledger size

| Set | Reader 1: alliance decisions / changed | Reader 2: receiver lists / order changed / first changed | Grudge writes (raid / capture / ransom / seat-lost) | Ledger pairs (max per seed) | Ledger total events | Max live entries / bytes per seed |
| --- | --- | --- | --- | --- | ---: | --- |
| R | 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 / 0 | 123 (17) | 2007 | 57 / 3298 |
| R+Rc | 0 / 0 | 0 / 0 / 0 | 1441 / 197 / 156 / 0 | 78 (15) | 1826 | 45 / 2732 |
| R-exile-off | 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 / 0 | 143 (21) | 1422 | 60 / 3804 |
| R+Rc-exile-off | 0 / 0 | 0 / 0 / 0 | 1113 / 131 / 87 / 0 | 139 (20) | 1419 | 53 / 3496 |
| ATLS+R | 59 / 10 | 0 / 0 / 0 | 0 / 0 / 0 / 0 | 121 (26) | 1816 | 71 / 4744 |
| ATLS+R+Rc | 71 / 8 | 0 / 0 / 0 | 1414 / 161 / 112 / 0 | 128 (26) | 1648 | 69 / 4686 |
| ATLS+R-exile-off | 50 / 7 | 0 / 0 / 0 | 0 / 0 / 0 / 0 | 109 (17) | 1430 | 47 / 2889 |
| ATLS+R+Rc-exile-off | 56 / 9 | 0 / 0 / 0 | 1181 / 155 / 111 / 0 | 110 (17) | 1407 | 47 / 2862 |
| ATLS-NT+R | 51 / 6 | 57 / 0 / 0 | 0 / 0 / 0 / 0 | 104 (16) | 1658 | 52 / 2965 |
| ATLS-NT+R+Rc | 52 / 8 | 94 / 0 / 0 | 1538 / 200 / 143 / 63 | 102 (20) | 1805 | 71 / 3992 |
| ATLS-NT+R+Rc-exile-off | 54 / 12 | 66 / 0 / 0 | 1244 / 166 / 105 / 47 | 122 (23) | 1481 | 62 / 4030 |

Reader 2 changed no order in any set. The diag counters (`diag/ATLS-NT+R.jsonl`) explain why:
- only 4 of 57 receiver lists had more than one receiver (1 of 94 under R+Rc);
- no list had two receivers in the same pact/peace group with different harm;
- 34 lists (39 under R+Rc) had some harm > 0, but always on a lone receiver or one already separated by pact or peace.

### Grievance distribution (all `Character.relationships` at tick 1,200, per-seed maxima)

| Set | Relationship entries | Grievance p90 (max seed) | p99 (max seed) | Max | Entries ≥ 0.12 | Earned ≠ 0 | Earned ≥ 0.12 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| main | 9725 | 0.02 | 0.212 | 0.405 | 168 | 1013 | 44 |
| R+Rc | 9756 | 0.052 | 0.245 | 1 | 275 | 1623 | 152 |
| main-exile-off | 9345 | 0.029 | 0.169 | 0.496 | 171 | 1004 | 54 |
| R+Rc-exile-off | 9471 | 0.035 | 0.239 | 0.919 | 254 | 1485 | 129 |
| ATLS | 9627 | 0.029 | 0.213 | 0.585 | 200 | 980 | 59 |
| ATLS+R+Rc | 9635 | 0.061 | 0.294 | 0.951 | 301 | 1559 | 166 |
| ATLS-exile-off | 9768 | 0.032 | 0.175 | 0.51 | 188 | 949 | 57 |
| ATLS+R+Rc-exile-off | 9691 | 0.061 | 0.25 | 1 | 292 | 1498 | 151 |
| ATLS-NT | 9423 | 0.029 | 0.212 | 0.619 | 190 | 983 | 59 |
| ATLS-NT+R+Rc | 9949 | 0.061 | 0.294 | 0.928 | 326 | 1669 | 188 |
| ATLS-NT-exile-off | 9587 | 0.029 | 0.191 | 0.51 | 187 | 946 | 48 |
| ATLS-NT+R+Rc-exile-off | 9610 | 0.061 | 0.371 | 0.846 | 307 | 1516 | 159 |

"Earned" is grievance minus `startingGrievance`, the quantity the hated route and the peace gate read. R alone leaves the distribution unchanged; ATLS+R moves only through changed histories (full rows in `summary.md`). Under R-char, ties with earned grievance ≥ 0.12 roughly triple, and the max reaches the clamp at 1.

### Where the secession shift comes from (diag, leave-one-writer-in; not in the patch)

| Base | All three writers | raid only | capture only | ransom only | flag off |
| --- | --- | --- | --- | --- | --- |
| main (R on) | 16 (7/13), t/p/h 4/12/0 | 20 (6/13), 8/11/1 | 28 (10/13), 10/17/1 | 27 (10/13), 9/17/1 | 31 (12/13), 10/17/4 |
| ATLS (R on) | 40 (9/13), 18/19/3 | 49 (11/13), 32/14/6 | 34 (9/13), 14/18/3 | 24 (9/13), 8/13/4 | 37 (11/13), 17/15/5 |

- The raid writer dominates, and its sign depends on the base: −11 on main, +12 on ATLS (tax route 17 → 32).
- It is emergent, not a direct threshold crossing: the hated route itself *falls* on main (4 → 0 or 1).
- Contracts also move. With raid only on main, contracts offered fell 1,865 → 1,713 and breached 449 → 374 (`diag/main.jsonl` vs `R+Rc-only-raid.jsonl`).
- Raid writes create new ties at base trust .28 / respect .28, where the contract score's missing-tie default is 0.35 (`contracts.ts:143–150`, `SCORE_TRUST` / `SCORE_RESPECT`). That is a side channel through which a grudge write lowers contract scores even before grievance matters. The full causal chain was not traced.

## Gates

| Set | Base | Secessions ≥ 6/13 | Liveness (min claims / port changes) | New wipeouts | Replay exact | R / R-char property + privacy violations (checks) |
| --- | --- | --- | --- | --- | --- | --- |
| R | main | pass (12) | pass (28 / 31) | none | pass | 0 (508 privacy, 0 grudge) |
| R+Rc | main | pass (7) | pass (18 / 18) | none | pass | 0 (419 privacy, 1794 grudge) |
| R-exile-off | main-exile-off | pass (11) | pass (24 / 25) | none | pass | 0 (569 privacy, 0 grudge) |
| R+Rc-exile-off | main-exile-off | pass (11) | pass (23 / 23) | none | pass | 0 (553 privacy, 1331 grudge) |
| ATLS+R | ATLS | pass (11) | pass (25 / 28) | none | pass | 0 (499 privacy, 0 grudge) |
| ATLS+R+Rc | ATLS | pass (9) | pass (14 / 17) | none | pass | 0 (525 privacy, 1687 grudge) |
| ATLS+R-exile-off | ATLS-exile-off | pass (11) | pass (13 / 14) | none | pass | 0 (490 privacy, 0 grudge) |
| ATLS+R+Rc-exile-off | ATLS-exile-off | pass (12) | pass (13 / 14) | none | pass | 0 (492 privacy, 1447 grudge) |
| ATLS-NT+R | ATLS-NT | pass (11) | pass (18 / 22) | none | pass | 0 (518 privacy, 0 grudge) |
| ATLS-NT+R+Rc | ATLS-NT | pass (8) | pass (14 / 17) | none | pass | 0 (486 privacy, 1944 grudge) |
| ATLS-NT+R+Rc-exile-off | ATLS-NT-exile-off | pass (13) | pass (11 / 17) | none | pass | 0 (500 privacy, 1562 grudge) |

Existing checkers (`props-out/`): **ALLIANCES** (rev-2, with the break-condition property), **SECESSION AFTERMATH**, **LIFECYCLE** and **PORT TRANSFER** ACCEPTANCE PASSED on all 7 sets:
- ATLS+R
- ATLS+R+Rc
- both of their exile-off variants
- ATLS-NT+R
- ATLS-NT+R+Rc
- ATLS-NT+R+Rc-exile-off

That is 28 / 28 runs at exit 0. The NT checker (`measure-nt.ts`) found 0 violations and exact replay on ATLS-NT+R (45 accepts), ATLS-NT+R+Rc (41) and its exile-off variant (29).

`npm test`: 690 / 690 pass on fix + relationships (`npm-test-fix+R.txt`) and on fix + NT + relationships-nt (`npm-test-fix+NT+R-nt.txt`).

## Pins (72 / 1,200 hashes; seeds 1847 / 2718 / 4096)

New flag sets:
- R: e240eee9/5df01726; 3010cea0/a1a5d939; 5e99e237/183e53f8
- R-exile-off: e24b7b33/74848b51; 62cea69c/d4ec4552; 6f21b6f5/3f913c7b
- R+Rc: 3d783cc3/e93b2028; 29d7533f/3eafd324; 654aeccf/c67fe04e
- R+Rc-exile-off: a8c2d05f/94449aac; 585585fb/a0119b84; b6f50325/3bd7cf62
- ATLS+R: 3ff0b147/60da6fe0; 32dae13b/99b20a65; 188e9040/e4c3acc8 (identical on both trees)
- ATLS+R-exile-off: 0db3d80d/71218820; 3a943bbf/992a4a6d; b0e81d11/2ef82408
- ATLS+R+Rc: 8de0f3a3/ffe2a64e; 38d884f1/2eec9489; 9a186a06/9e2b421a (identical on both trees)
- ATLS+R+Rc-exile-off: 09c60659/2e6887f1; d729a656/af1e3bae; 4abd409a/651fe979
- ATLS-NT+R: cbef31f7/f813e2ce; bd4e7c81/da4b7bc8; c94bddbe/03613ef8
- ATLS-NT+R+Rc: c6f249bd/8d725890; 8a19deb7/5a535f5d; df0dae90/963044e5
- ATLS-NT+R+Rc-exile-off: f9addf08/c811c7a9; fd5c0422/54079067; daff9f59/0beeb189

Flag-off pins are **unchanged** on both patch trees and equal `protection-pact-fix/post-192/pins.txt`:
- main 7f76e474/94de9c02, 976c40bd/7a3741c9, 08943ea5/af6eeaea, and exile-off 66e8ccb7/b51aa07a, b4ccedab/091f7628, b04c5ac4/25bdbf15;
- ATL e8963d15/77d4697d, a08fbf46/2c7809db, 21de6a8b/c61988f4, and exile-off 4283d504/33dc6c8d, 6103f94b/270e722d, 4612e9d4/4fc72064;
- ATLS + fix 85658e53/5367691c, aa54ada1/faf5798a, e4361ee1/7e93eab2, and exile-off 296b11bc/4c1555e9, 9f8b2f2b/c897ea88, 93e6bfeb/226bad48;
- ATLS-NT fd8d2637/80767d69, a21c1263/90d9f435, 0402aeab/8a2448fb, and exile-off bf9b8852/66ddc056, c4f1516f/21175258, c09a2fc3/0af2f809, both equal to negotiated-transfer.md.

## Risks and open questions for the Lead

1. **Raid-writer direction.** Per the ruling, the *raider* gains grievance against the defender, and it is the dominant writer (1,113–1,538 of the 1,331–1,944 grudge writes per R-char set). Should the raided holder also (or instead) grudge the raider? It isn't in v1, because the ruling named the direction.
2. **Base-trust side channel.** A first grudge creates a tie at `RELATIONSHIP_BASE` trust/respect .28, below the contract score's missing-tie defaults of 0.35. This lowers contract scores between strangers as a side effect: contracts offered fell 1,865 → 1,713 with raid only on main. The options are to (a) accept it, (b) create grudge ties at the score defaults, or (c) write grievance only onto existing ties. Any of these changes the R-char numbers above.
3. **Reader 2 is inert at this scale:** 0 changed orders in 217 lists across three NT sets. Keep it as a hook for when multi-receiver lists become common, or drop it from v1?
4. **Seat-lost feed row.** It reuses `relationship-changed`, so non-parties see a withheld row whose `actorId` / `targetId` and summary ("X's relationship changed") reveal *that* the ex-governor's view of the buyer changed. The payload is withheld, matching every existing relationship write. Is that acceptable for ruling 5, or should it be reducer-derived like the other three writers?
5. **Secessions on main + R + R-char:** 31 (12/13) → 16 (7/13), close to the 6/13 gate. On ATLS they go 37 → 40, and on ATLS-NT 32 → 27 (8/13). This is emergent by the ruling, but the main-base margin is one seed.
6. **The unrest proxy** is pressed port-ticks, since occupation (the grievance-weighted unrest reader, `occupation.ts:72`) is off in every measured set. Measure an occupation-on set?
7. Ransom → ransomer when `ransom.leaderId` is missing falls back to the payee faction's commander. Confirm.
