# Protection-pact rule fix (amends secession-aftermath.md §2 rule 3)

Status: **Revision 2, build-ready.** Lead ruling 2 on [defaults-on.md](defaults-on.md) (#190), then the Lead's rulings 1–4 on revision 1 (`1745240`): checker scope (1), pair cooldown spelled out (2), a pact never outlives its break condition (3), rare protection accepted (4). This is a
separate amendment file; [secession-aftermath.md](secession-aftermath.md) (#187) is unchanged and this file
overrides its §2 rule 3 (Protection) and adds to §5. Base: main `c47e34e`. On that commit **ATL is not yet
flipped in code** (`ALLIANCES_DEFAULT`, `PORT_TRANSFER_DEFAULT`, `LIFECYCLE_DEFAULT` and
`SECESSION_AFTERMATH_DEFAULT` are all `false`; `src/` is identical to e9ac8b6), so every run below passes all
five layer flags explicitly. Offline, no AI, no RNG change, $0. No constant changed.
Prototype: [protection-pact-fix/fix.patch](protection-pact-fix/fix.patch) (`secession-aftermath.ts` for the rules, `engine.ts` for the second break check).

## 1. The defect (from defaults-on.md §2.3)

A protection pact is an ordinary `Alliance` record (`world.alliances`); the alliance break rules already apply to
it. But it was formed without the alliance formation guards, so on 13 seeds × 1,200 ticks it broke alliance rules:
a portless raider as the enemy, so `enemy-portless` fired next tick (S alone 2, ATLS 2, all five 4); a patron that
was already in a pact (ATLS 1); a pair inside the 240-tick cooldown (ATLS 2); one ally with no living member (all
five 1).

## 2. Rules (ruling 2)

Protection pacts are ordinary Alliance records, so all alliance rules apply, with no exemptions. Protection for
seceded faction S at port P, with age ≥ 67, holding P, no protection yet, in no pact, own surplus ≥ 0:

1. **Threat must hold a port.** The protection threat is the latest hostile raider of S within
   `ALLIANCE_RAID_WINDOW` (152) **that holds at least one port**, else the hostile holder of the nearest port within
   `ALLIANCE_NEAR` (30). A more recent portless raider is skipped, not fatal: an older port-holding raider in the
   window, or a near holder, can still be the threat. (Same order as `threatTo`, filtered.) No port-holding threat
   means no protection.
2. **The protector is in no pact** (one pact per faction), as `allianceForms` requires of both sides.
3. **The 240-tick cooldown applies to the pair** (ruling 2): no protection between S and a patron if any pact
   between those two broke within `ALLIANCE_COOLDOWN` (the `allianceMemory` record, the same pair test
   `allianceForms` uses). **"Both sides" means whichever party starts it**: the test is on the unordered pair, so it
   blocks S seeking the patron exactly as it would block the patron seeking S. It is not a per-faction cooldown;
   either party may form a pact with someone else inside the 240 ticks.
4. **No break condition may hold at formation**, since each would end the pact on the next `allianceBreaks`: both
   sides alive (`ally-gone`), the threat holds a port (rule 1, `enemy-portless`), and no battle in progress between
   S and the patron (`ally-attack`).
5. Patrons are the existing candidates (alive, a port within 43.829, not S, O or the threat, hostile to both,
   surplus ≥ 0), **filtered by rules 2–4**, then ranked as before (surplus, then id). If none is left, there is no
   protection this tick; the check repeats next tick (protection stays "once", recorded on formation only).

The patron's cause now also states "in no pact, no break with S within 240".

**Join is unchanged, explicitly.** Join is not a pact, so the alliance rules do not reach it, and the ruling does not
force a change:
- Join keeps today's threat (any hostile raider within 152, port-holding or not, else the near holder), today's
  unfiltered patron list, and own surplus < 0.
- So the "fall through to join" in the ruling is real only for an insolvent S, and for that S nothing changed:
  join is decided exactly as before. A solvent S whose patrons are all blocked gets **nothing** that tick, because
  join's own condition (surplus < 0) fails. A solvent S never joins.
- Join still requires S in no pact, and a recorded protection still ends the protection/join path, as before.
- A patron that is in a pact or in cooldown with S **can** still take a joining S. That is not a pact, so no alliance
  rule is broken.

Code (fix.patch): `threatTo(world, S, P, { portHolding: true })` for protection; a new exported
`pactBlocked(world, a, b)` returning `ally-gone | in-pact | cooldown | ally-attack | null`; candidates for a solvent
S are filtered by `pactBlocked === null`. Insolvent S takes the unchanged path.

## 2a. Ruling 3: a pact never outlives its break condition

`allianceBreaks` ran once per tick, before `lifecycleStep` and `aftermathStep`. A join moves ports without a battle
inside `aftermathStep`, so a pact whose enemy lost its last port to a join stayed alive one tick (3 pacts in A+S,
seed 4096, revision 1). **Choice: run the break check a second time, after `aftermathStep`** (engine.ts, same
`alliancesOn || aftermathOn` gate), and keep the first one where it is. Why not move the only check to the end:
the aftermath reads `alliancesOf(world)` (S in no pact, patron in no pact, `friendly` for threat and patrons), so it
must see the pacts that are really alive; a pact due to break this tick would otherwise block protection or join
for one tick, and would change outcomes on seeds where nothing is wrong today. The second call is a no-op unless
lifecycle or the aftermath made a break condition true after the first check, so ALLIANCES-only and flag-off runs
are byte-identical. A pact formed by the aftermath step itself is also checked by the second call (rule 4 means it
never breaks there).

## 3. Acceptance (gated), revision 2

Checker: `protection-pact-fix/props-alliances.ts` (a copy of `defaults-on/props-alliances.ts` with these changes).

- **Ruling 1, ordinary pacts only:** per-side cause vocabulary (`raided:` / `near:` / `landless:`, with the
  raid-tape and distance checks) and the 24-tick formation clock.
- **Ruling 1, protection pacts instead:** each carries an aftermath cause naming its secession: a secession record
  for S exists; `causes[S]` starts `protection: ` and contains `<S> has held <S's port>`; `causes[patron]` starts
  `protector: `; the event's port is S's port; the id is `protection-<tick>-<S>-<patron>`. It forms on the aftermath
  step: between it and the tick's `metrics-recorded` only aftermath-step events appear (aftermath, peace, join,
  protection, and the second break check's `alliance-broken`). It forms inside the window rule: age since the
  declaration ≥ 67 (`AFTERMATH_WINDOW`).
- **Both kinds:** one pact per faction, pair cooldown, no raid or claim between allies, joiners, break evidence.
- **Ruling 3 property:** no pact (ordinary or protection) is alive at the end of any tick on which its break
  condition (ally gone, enemy portless, ally attack) held. Checked after every tick on every seed.
- Plus every item in secession-aftermath.md §5 (`defaults-on/props-secession-aftermath.ts`), and the lifecycle and
  port-transfer checkers.

Mutation controls (`props-out/mutation-controls.txt`), to show the new checks bite: changing the protection cause
prefix to `protect:` gives 2 "aftermath cause" hits on 2 pacts (S alone, seeds 4096 and 10000); removing the second
break check gives 3 "enemy portless" break-late hits on seed 4096 (A+S), the revision-1 cases.

## 4. Results (13 seeds × 1,200 ticks)

Flags, all explicit. **S alone** = `{occupation:false, alliances:false, portTransfer:false, lifecycle:false,
secessionAftermath:true}`; with ATL still off on c47e34e this is also "S on top of current main defaults".
**ATLS** = `{occupation:false, alliances:true, portTransfer:true, lifecycle:true, secessionAftermath:true}`.
**A+S** = alliances and secessionAftermath only. "Exile off" adds `exileRecovery:false`. Before = e9ac8b6/c47e34e
`src` (defaults-on raw); rev 1 = `1745240`'s patch; rev 2 = this patch.

| Set | Peaces | Peace breaks | Protections | Joins | Pacts | Pact breaks | Claims | Port chg | Battles | Captures | Secessions (seeds) | Portless t1200 | Low claims / PC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| main (flag-off) | 0 | 0 | 0 | 0 | 0 | 0 | 682 | 713 | 927 | 247 | 31 (12/13) | 25 | 28 / 31 |
| S alone, before | 16 | 0 | 3 | 8 | 3 | 3 | 640 | 677 | 885 | 230 | 29 (12/13) | 24 | 22 / 26 |
| S alone, rev 1 | 16 | 0 | 2 | 8 | 2 | 2 | 638 | 677 | 884 | 226 | 31 (12/13) | 25 | 22 / 26 |
| **S alone, rev 2** | 16 | 0 | 2 | 8 | 2 | 2 | 638 | 677 | 884 | 226 | 31 (12/13) | 25 | 22 / 26 |
| ATLS, before | 22 | 0 | 3 | 1 | 59 | 42 | 497 | 543 | 898 | 214 | 32 (11/13) | 22 | 25 / 28 |
| ATLS, rev 1 | 24 | 0 | 1 | 1 | 59 | 39 | 488 | 539 | 895 | 221 | 37 (11/13) | 27 | 25 / 28 |
| **ATLS, rev 2** | 24 | 0 | 1 | 1 | 59 | 39 | 488 | 539 | 895 | 221 | 37 (11/13) | 27 | 25 / 28 |
| ATLS exile off, before | 24 | 0 | 5 | 1 | 49 | 31 | 365 | 410 | 775 | 155 | 31 (11/13) | 25 | 12 / 14 |
| ATLS exile off, rev 1 | 24 | 0 | 2 | 1 | 50 | 33 | 374 | 421 | 778 | 157 | 33 (11/13) | 27 | 12 / 14 |
| **ATLS exile off, rev 2** | 24 | 0 | 2 | 1 | 50 | 33 | 374 | 421 | 778 | 157 | 33 (11/13) | 27 | 12 / 14 |
| A+S, before | 23 | 0 | 9 | 4 | 106 | 94 | 554 | 594 | 869 | 229 | 36 (12/13) | 35 | 13 / 15 |
| A+S, rev 1 | 20 | 0 | 1 | 4 | 93 | 78 | 528 | 567 | 846 | 214 | 35 (12/13) | 33 | 13 / 15 |
| **A+S, rev 2** | 20 | 0 | 1 | 4 | 93 | 78 | 528 | 567 | 846 | 214 | 35 (12/13) | 33 | 13 / 15 |

Every row: replay exact 13/13 (`measure.ts`), no wipeouts. The second break check changes no total and no seed's
hash in ATLS, ATLS exile off or S alone (in those runs no break condition arose after the first check). In A+S it
changes only seed 4096's final hash: the three pacts break one tick earlier, with the same totals.

### Checkers (revision 2)

| Checker | S alone | ATLS | ATLS exile off | A+S |
|---|---|---|---|---|
| `props-secession-aftermath.ts` (flag-off pins default and exile opt-out, 0 violations, replay, liveness, secessions ≥ 6/13) | **pass** | **pass** | **pass** | — |
| `props-lifecycle.ts` | — | **pass** | **pass** | — |
| `props-port-transfer.ts` | — | **pass** | **pass** | — |
| `protection-pact-fix/props-alliances.ts`: properties (incl. ruling 1 and 3) | **0 violations** | **0** | **0** | **0** |
| `protection-pact-fix/props-alliances.ts`: raw verdict | fail on ALLIANCES liveness only (forms ≥ 7/13, breaks ≥ 5/13: no ordinary pacts exist with alliances off; 2 protection pacts) | **pass** | **pass** | **pass** |
| Pins, replay, liveness, secessions ≥ 6/13, no new wipeouts (`measure.ts`) | pass | pass | pass | pass |
| `npm test` with fix.patch | 682 / 682 | | | |

**ATLS passes every checker, alliances raw verdict included, with exact replay, liveness, secessions on 11/13 and no
new wipeouts.** ATLS exile off and A+S do too. For S alone, the only failing items are the ALLIANCES formation
liveness floors, which do not apply when ALLIANCES is off.

### Pins

| Run | Seed | Before (e9ac8b6 src) | Rev 1 | Rev 2 |
|---|---|---|---|---|
| ATLS default 72 / 1,200 | 1847 / 2718 / 4096 | e5efeeaa / 59e9c76e, 325f0fd2 / e06a3022, eb2f30a8 / 1fe6c58e | same | **same** |
| ATLS exile off | 1847 / 2718 / 4096 | 5088e2a7 / b26323e1, af4ec668 / ea9e1f9a, 0e69b0e3 / 1514b138 | same | **same** |
| S alone default | 1847 / 2718 | 427a7650 / 06c00949, d263dcf7 / b06a3ecc | same | **same** |
| S alone default | 4096 | b83ce14c / b31b41cf | b83ce14c / 3c928bfe | **b83ce14c / 3c928bfe** (rev 1's change only) |
| S alone exile off | 1847 / 2718 / 4096 | — (not measured before) | 2c3f2d2d / af520ae9, bd1473e7 / eb0db5d9, 9a8c815c / ce0e10d2 | **same as rev 1** |
| A+S default | 1847 / 2718 | — | 427a7650 / 571ae2c0, d263dcf7 / b06a3ecc | **same** |
| A+S default | 4096 | — | b83ce14c / a9f615a2 | **b83ce14c / bf0e7bc8** (ruling 3) |
| main (flag-off) | 1847 / 2718 / 4096 | 7f76e474 / 94de9c02, 976c40bd / 7a3741c9, 08943ea5 / af6eeaea | same | **unchanged** |

So the only pin ruling 3 moves is A+S seed 4096 at 1,200 ticks. The flag-off main pins and the exile opt-out pins
(checked inside `props-secession-aftermath.ts`) are unchanged, and the golden fixture passes (`npm test`).

## 5. Open questions for the Lead

None blocking. Resolved: cause vocabulary and clock scoped to ordinary pacts (1); pair cooldown (2); second break
check after the aftermath (3); rare protection accepted (4). For the Engineer: ATLS default-on pins are the
"rev 2" values above (unchanged from defaults-on.md).

## 6. Reproduce

Apply `protection-pact-fix/fix.patch` on c47e34e, then:
```
node --experimental-strip-types docs/design/defaults-on/measure.ts ATLS '{"occupation":false,"alliances":true,"portTransfer":true,"lifecycle":true,"secessionAftermath":true}'
DEFAULTS_ON_BASE='<same JSON>' node --experimental-strip-types docs/design/protection-pact-fix/props-alliances.ts --json out.json
node --experimental-strip-types docs/design/protection-pact-fix/classify-alliances.ts out.json
DEFAULTS_ON_BASE='<same JSON>' node --experimental-strip-types docs/design/defaults-on/props-secession-aftermath.ts   # and props-lifecycle.ts, props-port-transfer.ts
node --experimental-strip-types docs/design/protection-pact-fix/summarize.ts main before-ATLS fix1-ATLS ATLS
```
Raw rows: `raw/` (`before-*` from defaults-on, `fix1-*` revision 1, unprefixed revision 2). Checker output:
`props-out/` (revision 1 in `props-out/fix1/`).

## 7. Post-#192 pins (main e7ec840)

#192 (client-readiness) made purchase and join public news, so every pin with port transfer on moved and the ATLS
values in §4 (pre-#192) are stale. Re-run on `e7ec840` with `fix.patch` applied (it applies cleanly, unchanged).
ATL, S and the other layer defaults are still `false` in code on e7ec840, so all flags are explicit, as in §4.
Output: [protection-pact-fix/post-192/](protection-pact-fix/post-192/).

**Sanity check: ATL default pins reproduce** the Lead's and the Engineer's eb44ae1 values exactly: 1847 e8963d15 / 77d4697d,
2718 a08fbf46 / 2c7809db, 4096 21de6a8b / c61988f4 (72 / 1,200).

| Run (72 / 1,200) | 1847 | 2718 | 4096 | vs pre-#192 |
|---|---|---|---|---|
| main, flag off | 7f76e474 / 94de9c02 | 976c40bd / 7a3741c9 | 08943ea5 / af6eeaea | unchanged |
| main, exile off | 66e8ccb7 / b51aa07a | b4ccedab / 091f7628 | b04c5ac4 / 25bdbf15 | unchanged |
| ATL default | e8963d15 / 77d4697d | a08fbf46 / 2c7809db | 21de6a8b / c61988f4 | matches eb44ae1 |
| ATL exile off | 4283d504 / 33dc6c8d | 6103f94b / 270e722d | 4612e9d4 / 4fc72064 | new (was c87dfb89 / f22ca56a, c410abda / b576e4b3, 11b472f5 / 712c8042 on e9ac8b6) |
| **ATLS default** | **85658e53 / 5367691c** | **aa54ada1 / faf5798a** | **e4361ee1 / 7e93eab2** | moved (was e5efeeaa / 59e9c76e, 325f0fd2 / e06a3022, eb2f30a8 / 1fe6c58e) |
| **ATLS exile off** | **296b11bc / 4c1555e9** | **9f8b2f2b / c897ea88** | **93e6bfeb / 226bad48** | moved (was 5088e2a7 / b26323e1, af4ec668 / ea9e1f9a, 0e69b0e3 / 1514b138) |
| S alone default | 427a7650 / 06c00949 | d263dcf7 / b06a3ecc | b83ce14c / **799161cc** | 4096 t1200 moved (was 3c928bfe) |
| S alone exile off | 2c3f2d2d / af520ae9 | bd1473e7 / eb0db5d9 | 9a8c815c / **4f0da6cd** | 4096 t1200 moved (was ce0e10d2) |
| A+S default | 427a7650 / 571ae2c0 | d263dcf7 / b06a3ecc | b83ce14c / **7eb8be56** | 4096 t1200 moved (was bf0e7bc8) |

S alone and A+S have no port transfer; their seed-4096 move is the join news (that seed has joins); the other pins of
those runs are unchanged.

**13 seeds × 1,200 ticks, totals vs pre-#192 rev 2:** identical on every count and on every seed (peaces,
protections, joins, pacts, purchases, claims, port changes, battles, captures, secessions); the state hash differs on
13 / 13 seeds, so #192 moved state, not behaviour.

| Set | Peaces | Peace breaks | Protections | Joins | Pacts | Pact breaks | Claims | Port chg | Battles | Captures | Secessions (seeds) | Portless t1200 | Low claims / PC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ATLS, pre-#192 rev 2 | 24 | 0 | 1 | 1 | 59 | 39 | 488 | 539 | 895 | 221 | 37 (11/13) | 27 | 25 / 28 |
| **ATLS, e7ec840** | 24 | 0 | 1 | 1 | 59 | 39 | 488 | 539 | 895 | 221 | 37 (11/13) | 27 | 25 / 28 |
| ATLS exile off, pre-#192 | 24 | 0 | 2 | 1 | 50 | 33 | 374 | 421 | 778 | 157 | 33 (11/13) | 27 | 12 / 14 |
| **ATLS exile off, e7ec840** | 24 | 0 | 2 | 1 | 50 | 33 | 374 | 421 | 778 | 157 | 33 (11/13) | 27 | 12 / 14 |

Replay exact 13/13 and no wipeouts in both.

| Checker | ATLS | ATLS exile off |
|---|---|---|
| `defaults-on/props-secession-aftermath.ts` (flag-off pins default and opt-out, properties, replay, liveness, ≥ 6/13) | pass | pass |
| `defaults-on/props-lifecycle.ts` | pass | pass |
| `defaults-on/props-port-transfer.ts` | pass | pass |
| `protection-pact-fix/props-alliances.ts` (rev 2; ruling 1 scope, protection cause/step/window, break-condition property) — properties | 0 violations | 0 violations |
| same — raw verdict | **pass** | **pass** |
| `measure.ts`: replay, claims and port changes > 0 every seed, secessions ≥ 6/13, no new wipeouts | pass (11/13) | pass (11/13) |

`npm test` with the patch: 690 / 690 (main has 690 tests now). Golden fixture unchanged: `npm run golden:update`
rewrites only the `generatedWith.node` field (v24.21.0 → v24.22.1, the box's Node); every hash, event count and the
recovery entry are identical, and I did not commit it.
