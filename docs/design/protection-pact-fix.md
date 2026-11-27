# Protection-pact rule fix (amends secession-aftermath.md §2 rule 3)

Status: **Build-ready proposal**, Lead ruling 2 on [defaults-on.md](defaults-on.md) (#190). This is a
separate amendment file; [secession-aftermath.md](secession-aftermath.md) (#187) is unchanged and this file
overrides its §2 rule 3 (Protection) and adds to §5. Base: main `c47e34e`. On that commit **ATL is not yet
flipped in code** (`ALLIANCES_DEFAULT`, `PORT_TRANSFER_DEFAULT`, `LIFECYCLE_DEFAULT` and
`SECESSION_AFTERMATH_DEFAULT` are all `false`; `src/` is identical to e9ac8b6), so every run below passes all
five layer flags explicitly. Offline, no AI, no RNG change, $0. No constant changed.
Prototype: [protection-pact-fix/fix.patch](protection-pact-fix/fix.patch) (one file, `secession-aftermath.ts`).

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
3. **The 240-tick cooldown applies to the pair, both sides**: no protection between S and a patron if any pact
   between those two broke within `ALLIANCE_COOLDOWN` (the `allianceMemory` record, the same pair test
   `allianceForms` uses). I read "both sides" as the pair test being symmetric (S–patron = patron–S), not a
   per-faction cooldown against any partner; see question 2.
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

## 3. Acceptance additions (gated)

Every `alliance-formed` with `aftermath: "protection"`, checked when it forms: enemy holds ≥ 1 port; neither side is
in another pact; no break between the pair within 240; both sides alive; no battle between them. With
`props-alliances.ts` that is: 0 hits for one pact per faction, pair cooldown, and break condition alive at a tick's
end. Plus everything in secession-aftermath.md §5.

## 4. Results (13 seeds × 1,200 ticks)

Flags, all explicit: **S alone** = `{occupation:false, alliances:false, portTransfer:false, lifecycle:false,
secessionAftermath:true}`. Because ATL is still off on c47e34e, "S on top of current main defaults" is the same
run (same hashes). **ATLS** = `{occupation:false, alliances:true, portTransfer:true, lifecycle:true,
secessionAftermath:true}`. Exile recovery on unless "exile off". A+S is extra, report-only. "Before" is the same
measurement on e9ac8b6 (defaults-on raw, src identical to c47e34e).

| Set | Peaces | Peace breaks | Protections | Joins | Pacts | Pact breaks | Claims | Port chg | Battles | Captures | Secessions (seeds) | Portless t1200 | Low claims / PC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| main (a) | 0 | 0 | 0 | 0 | 0 | 0 | 682 | 713 | 927 | 247 | 31 (12/13) | 25 | 28 / 31 |
| S alone, before | 16 | 0 | 3 | 8 | 3 | 3 | 640 | 677 | 885 | 230 | 29 (12/13) | 24 | 22 / 26 |
| **S alone, fixed** | 16 | 0 | 2 | 8 | 2 | 2 | 638 | 677 | 884 | 226 | 31 (12/13) | 25 | 22 / 26 |
| ATLS, before | 22 | 0 | 3 | 1 | 59 | 42 | 497 | 543 | 898 | 214 | 32 (11/13) | 22 | 25 / 28 |
| **ATLS, fixed** | 24 | 0 | 1 | 1 | 59 | 39 | 488 | 539 | 895 | 221 | 37 (11/13) | 27 | 25 / 28 |
| ATLS exile off, before | 24 | 0 | 5 | 1 | 49 | 31 | 365 | 410 | 775 | 155 | 31 (11/13) | 25 | 12 / 14 |
| ATLS exile off, fixed | 24 | 0 | 2 | 1 | 50 | 33 | 374 | 421 | 778 | 157 | 33 (11/13) | 27 | 12 / 14 |
| A+S, before | 23 | 0 | 9 | 4 | 106 | 94 | 554 | 594 | 869 | 229 | 36 (12/13) | 35 | 13 / 15 |
| A+S, fixed | 20 | 0 | 1 | 4 | 93 | 78 | 528 | 567 | 846 | 214 | 35 (12/13) | 33 | 13 / 15 |

Every row: replay exact 13/13; no wipeouts. "Pacts" includes protection pacts.

The fix changes two seeds in each set. ATLS: 2000 (protection 1 → 0, peaces 1 → 2, secessions 1 → 5) and 9000
(protection 2 → 1, peaces 4 → 5, claims 43 → 34, secessions 5 → 6). S alone: 2000 (protection 1 → 0) and 4096
(a different single protection; claims 50 → 48, secessions 4 → 6).

Which rule binds (`blocked-tally.ts`; start-of-tick approximation, so counts are faction-ticks, not pacts):
S alone, 13 evaluations on 1 seed where the pre-fix rule would form and the fix does not, all "no port-holding
threat". ATLS, 26 on 2 seeds: 19 cooldown (every patron), 6 no port-holding threat, 1 no patron for the
port-holding threat; 1 had its threat moved from a portless raider to a port holder.

### Checkers

| Checker | S alone | ATLS |
|---|---|---|
| `props-secession-aftermath.ts`: flag-off pins (default and exile opt-out), 0 violations, replay, liveness, secessions ≥ 6/13 | **pass** (12/13, low 22 / 26) | **pass** (11/13, low 25 / 28) |
| `props-lifecycle.ts` | n/a | **pass** |
| `props-port-transfer.ts` | n/a | **pass** (13 purchases on 13/13) |
| `props-alliances.ts`, ruled rules (one pact per faction, pair cooldown, break condition alive at tick end, raids or claims between allies, joiners, break evidence) | **0 hits** | **0 hits** |
| `props-alliances.ts`, raw verdict | fail (scope hits below; ALLIANCES liveness n/a with alliances off) | **fail on scope hits only** |
| Pins, replay, liveness, secessions ≥ 6/13, no new wipeouts (`measure.ts`) | pass | pass |
| `npm test` with the patch | 682 / 682 (flag off by default) | — |

Before the fix, ATLS had 2 / 1 / 2 hits on break-late / one-pact / cooldown (defaults-on.md); now 0 / 0 / 0.

**What still trips the raw alliances checker.** One protection pact in ATLS (seed 9000) and two in S alone (4096,
10000) fail two checks that are about how ALLIANCES itself forms pacts: per-side cause text must start
`raided:` / `near:` / `landless:` (protection causes start `protection:` / `protector:`), and formation on the
24-tick clock (protection forms on the tick the aftermath conditions hold). These are not among the ruled rules.
The aftermath checker already validates protection causes. So: **ATLS passes every ruled rule and every other
checker; the raw alliances checker still fails on 1 protection pact through these two formation-path checks.**
Either the Lead rules that they are part of "all alliance rules" (question 1), or the checker scopes them to
ALLIANCES-formed pacts.

**A+S only (report-only, 0 in ATLS):** 3 ALLIANCES pacts (seed 4096: one at t584, two at t1025) are still alive one
tick after their enemy lost its last port. Diagnosed: in each case a `secession-joined` in the same tick moved the
enemy's port (the enemy was the joining breakaway). `aftermathStep` runs after `allianceBreaks`, so the
`enemy-portless` break fires on the next tick. Join can therefore leave a pact one tick past its break condition.
Pre-fix A+S had the same class (2 hits).

### Pins

ATLS pins on 1847 / 2718 / 4096 **do not change** from 9edf0bb (the fix changes only seeds 2000 and 9000):
default 72 / 1,200: e5efeeaa / 59e9c76e, 325f0fd2 / e06a3022, eb2f30a8 / 1fe6c58e; exile off: 5088e2a7 / b26323e1,
af4ec668 / ea9e1f9a, 0e69b0e3 / 1514b138. S alone: 1847 and 2718 unchanged (427a7650 / 06c00949,
d263dcf7 / b06a3ecc); **4096 1,200-tick changes b31b41cf → 3c928bfe** (72-tick b83ce14c unchanged). Flag-off
pins (main) unchanged; `npm test` 682 / 682 with the patch.

## 5. Open questions for the Lead

1. Are the per-side cause vocabulary (`raided` / `near` / `landless`) and the 24-tick formation clock part of "all
   alliance rules"? If yes, protection would form only on the clock and would need an alliance-style cause for the
   patron (a rule change, not prototyped). If no, scope those two checks to ALLIANCES pacts and ATLS passes the
   alliances checker.
2. Cooldown "both sides": I applied the pair cooldown (S–patron), as ALLIANCES does. Did you mean a per-faction
   cooldown (neither side may form any pact within 240 of its own last break)? That would be stricter than
   ALLIANCES itself.
3. Join and pacts: a join can make a pact's enemy portless after `allianceBreaks` (3 one-tick cases in A+S, 0 in
   ATLS). Run the break rules once more after `aftermathStep` (or emit the break with the join)? Small engine change,
   not prototyped.
4. With the fix, ATLS protection is rare (1 in 13 seeds; cooldown is the main blocker). Accept that as the honest
   result for flipping S on?

## 6. Reproduce

Apply `protection-pact-fix/fix.patch` on c47e34e, then use the defaults-on scripts with explicit flags:
```
node --experimental-strip-types docs/design/defaults-on/measure.ts ATLS '{"occupation":false,"alliances":true,"portTransfer":true,"lifecycle":true,"secessionAftermath":true}'
DEFAULTS_ON_BASE='<same JSON>' node --experimental-strip-types docs/design/defaults-on/props-alliances.ts --json out.json
node --experimental-strip-types docs/design/defaults-on/classify-alliances.ts out.json
node --experimental-strip-types docs/design/protection-pact-fix/summarize.ts main before-ATLS ATLS
node --experimental-strip-types docs/design/protection-pact-fix/blocked-tally.ts '<flags JSON>'
```
Raw rows: `protection-pact-fix/raw/` (`before-*` copied from defaults-on raw). Checker output: `props-out/`.
