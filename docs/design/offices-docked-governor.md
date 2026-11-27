# Offices amendment: the governor is consulted only while docked at the seat

Status: **Ruled** (Lead, 2026-11-27): the docked-governor rule is adopted as prototyped; rulings below. Offline, $0, no AI. Base: `main` `e7ec840`.

This is a separate amendment note. It amends [offices.md](offices.md) and the [WG Jev picker](wg-jev-picker.md) spec. offices.md is not edited, and the two lines this note changes are quoted under Consistency below. The prototype is [offices-docked-governor/docked.patch](offices-docked-governor/docked.patch). It changes `engine.ts` only and is not committed to `src`.

## Rule

1. **The seat is unchanged.** A governor keeps the seat and the title while sailing. Appointment, removal, the stipend and the levy all stay as in offices.md (`governor.ts` `syncSeats`, `payGovernorStipends`, `governorLevyRate`). Nothing in `governor.ts` changes.
2. **A WG governor is consulted only while docked at a seat it holds.** The new export `wgGovernorDocked(world, c)` defines docked as all of:
   - `c.locationId` is a port whose `governorId` is `c`;
   - `c.travel === null`;
   - `c.captivity === null`.

   This is the presence test the autonomous secession declaration already uses (`engine.ts` `declareAutonomousSecessions`): `locationId === settlement.id`, no travel, no captivity. A governor holding several seats is consulted when docked at any one of them, once per tick, as today.
3. **Away from every seat, there is no consult.** `consultActionPicker` returns `null` for a WG character whose role is `"governor"` and who is not docked. Nothing is recorded or counted, and the call cap is not touched.
4. **The holder path is unchanged.** It is dormant while the holder is the player, as before.

### What "port decisions" and "standing behaviour" mean in code

- **There is no separate port-governing action in the autonomous loop.**
  - A governor makes one decision per tick, as every autonomous character does: `buildCandidates` → `chosen = candidates[0]`, optionally replaced by the picker.
  - The candidates are the character's own actions at the port where they stand: rest, work, buy-provisions, recruit, trade-local and travel, plus raid or claim on a hostile port.
  - The tax is the holder's step. The secession declaration is a separate step that is already docked-only.
- **"Port decisions" are therefore defined as that per-tick decision, made while docked at the governor's own seat.** That is the only decision the governor role currently adds to the picker. Docked at the seat, the consult runs exactly as today, with the same request, eligibility, nudge and cap.
- **"Standing behaviour" is the sim's own pick, `candidates[0]`.** That covers the scorer, plan boosts, standing-order influence and the `rng.between(-3.5, 3.5)` jitter already drawn in `buildCandidates`. It is the same path a non-consulted member takes and the same path the run takes with the picker off. No new draw, no new state and no new event.
- **A governor's own-ship decisions while away are not consulted.** The governor role is the only reason v1 consults anyone (ruling 2: holder and governors, with members added later). A governor away from the seat is decided like a member, so a governor docked at a rival or a non-seat port is not consulted either.

## Consistency check

| Reader of governor seats | What it does today | With this amendment |
|---|---|---|
| offices.md §2 "Once named, the governor keeps the seat"; §8 q8 "a governor who sails is not replaced"; summary "This slice does not hold them on the dock" | Sticky seat | **Consistent.** The seat stays sticky and nobody is held on the dock. |
| offices.md, secession presence ("the captive governor cannot declare"), `declareAutonomousSecessions` | Declares only when anchored at that port, not travelling, not captive | **Consistent.** This rule copies that test. |
| wg-jev-picker.md, line 23 and ruling 2: "consults only World Government's command holder and governors" | Any seated governor, anywhere | **Amended** to "...and governors while docked at a seat they hold". The eligibility rule (≥ 2 legal, no raid or claim) and the nudge are unchanged. The recount table at wg-jev-picker.md:48 counts the old scope; this note's tables replace it for cap purposes. |
| wg-picker-cap-atl.md (#191) | Cap 2,108 for ATL, from the seat rule | **Superseded if this rule is adopted.** See the caps below. |
| `governor.ts` levy (`governorLevyRate`) and stipend | Paid on the seat, docked or not | Unchanged. A sailing governor still draws the 18 and the port still levies 0.05. This is not a conflict, because both were ruled on the sticky seat. The Lead may want to confirm it. |
| `lifecycle.ts:53`, `character-retired` `data.office` | `governorId(world, c.locationId) === c.id ? c.locationId : null` | **Pre-existing inconsistency, unchanged by this rule.** A governor who retires while away still vacates (`syncSeats` clears retired governors), but the event records `office: null`. The docked-only reading matches the event's check. Retirement under `syncSeats` does not. The Engineer could record the seat itself. That is not done here. |
| `triageActorRole` (`engine.ts`, slice 5) | Labels a seated character "governor" anywhere | Unchanged. It is a report label, and triage eligibility does not depend on it. |
| `news.ts` `scarredFollowerIds` | Excludes the seated governor from the dock list | Unchanged. Dock presence is checked per character. |
| `client-readiness.ts` `governorSeats` / `governorOnPort` (#192), dashboard `levyRate` | Show the seat holder by name | Unchanged. The title stays, which is the point of the ruling. |
| `persistence.ts` seat transplant, `scenario.ts` and `tick-start.ts` sync | Seat memory | Unchanged. |

**No conflicts found other than the lifecycle `office` field.** That one predates this rule.

## Measurement (13 seeds × 1,200 ticks; off, ATL, ATLS)

### Method

- **Same harness as #191.** [count.ts](offices-docked-governor/count.ts) uses the read-only [hook](wg-picker-cap-atl/hook.patch) and adds docked-only counters.
  - **Read-only:** no picker, and the original rule. Docked eligible is counted on the same run, which is valid because the patch changes nothing without a picker. End hashes are identical with and without `docked.patch` on all 13 seeds in every configuration, and the docked tree's own count equals the counter.
  - **Stub:** stubUniform, WG only, cap lifted. It counts engine records, with and without `docked.patch`.
- **Trees.** Scratch worktrees of `e7ec840` are listed in [run-all.sh](offices-docked-governor/run-all.sh). Tables come from [summarize.py](offices-docked-governor/summarize.py) into `raw/summary.txt`, which also has the per-consulter, per-port and per-bin breakdowns.
- **ATL and ATLS** are passed as run options. Defaults are still off on `e7ec840`.
- **Part B** applies `docs/design/protection-pact-fix/fix.patch` from `e7ec840`, identical to `ee0d85d`. It touches `secession-aftermath.ts` and also `engine.ts` (the second `allianceBreaks`), not only `secession-aftermath.ts`.
- **Counts are unchanged since bd6ab03.** Every count on `e7ec840` equals the bd6ab03 run I took before the rebase, on every seed and configuration, although the ATL and ATLS hashes moved. #192 adds news state, not decisions.

### Per seed

Each cell is current seat rule, read-only / stub → docked rule, read-only / stub.

| Seed | off | ATL | ATLS (pre-fix) | ATLS + fix |
|---|---|---|---|---|
| 1847 | 1,482 / 1,013 → 909 / 426 | 1,686 / 1,722 → 844 / 452 | 1,839 / 1,722 → 1,034 / 452 | 1,839 / 1,722 → 1,034 / 452 |
| 2718 | 1,329 / 1,235 → 989 / 375 | 1,348 / 1,646 → 895 / 485 | 1,348 / 1,646 → 895 / 485 | 1,348 / 1,646 → 895 / 485 |
| 4096 | 1,152 / 1,319 → 505 / 509 | 1,460 / 1,421 → 801 / 25 | 1,460 / 1,222 → 801 / 30 | 1,460 / 1,222 → 801 / 30 |
| 1000 | 1,400 / 1,274 → 1,266 / 272 | 2,008 / 1,646 → 775 / 89 | 2,008 / 1,653 → 775 / 157 | 2,008 / 1,646 → 775 / 151 |
| 2000 | 1,003 / 1,228 → 682 / 120 | 1,510 / 1,506 → 496 / 196 | 1,576 / 1,910 → 434 / 196 | 1,510 / 1,910 → 496 / 196 |
| 3000 | 1,681 / 945 → 1,193 / 387 | 1,591 / 2,415 → 861 / 697 | 1,242 / 2,415 → 917 / 471 | 1,242 / 2,415 → 917 / 471 |
| 4000 | 1,148 / 1,352 → 898 / 489 | 1,582 / 1,750 → 908 / 262 | 1,582 / 1,750 → 908 / 490 | 1,582 / 1,750 → 908 / 490 |
| 5000 | 1,108 / 1,144 → 864 / 467 | 1,633 / 1,542 → 978 / 427 | 1,633 / 1,604 → 978 / 444 | 1,633 / 1,482 → 978 / 444 |
| 6000 | 1,367 / 1,089 → 950 / 454 | 1,686 / 1,865 → 976 / 300 | 1,376 / 1,865 → 283 / 300 | 1,376 / 1,865 → 283 / 300 |
| 7000 | 1,594 / 1,503 → 1,173 / 793 | 1,945 / 1,839 → 1,058 / 461 | 1,945 / 1,839 → 1,058 / 461 | 1,945 / 1,839 → 1,058 / 461 |
| 8000 | 1,090 / 1,052 → 831 / 751 | 1,910 / 1,376 → 850 / 108 | 1,910 / 1,326 → 850 / 133 | 1,910 / 1,326 → 850 / 133 |
| 9000 | 1,276 / 1,078 → 926 / 593 | 1,046 / 983 → 436 / 384 | 1,349 / 1,086 → 721 / 305 | 1,142 / 1,226 → 292 / 305 |
| 10000 | 1,442 / 1,211 → 1,005 / 338 | 873 / 1,695 → 363 / 507 | 961 / 1,695 → 365 / 518 | 961 / 1,695 → 365 / 518 |
| **total** | **17,072 / 15,443 → 12,191 / 5,974** | **20,278 / 21,406 → 10,241 / 4,393** | 20,229 / 21,733 → 10,019 / 4,442 | **19,956 / 21,744 → 9,652 / 4,436** |

The fix leaves ATL byte-identical on all 13 seeds (ATL + fix equals ATL). In ATLS it changes only seeds 2000 and 9000.

**Under the docked rule, ATL makes fewer consults than off: 10,241 against 12,191 read-only.**
- The Verdant Cay seat, which drove #191's rise, falls from 5,045 consults to 416 docked consults under ATL, because its governor is away 92 % of the time.
- Docked consults by port under ATL: Cinder Key 3,547, Crown Harbor 4,198, Glassport 2,080 and Verdant Cay 416. Promoted governors account for 203.

**The stub falls further than the read-only count, through feedback.**
- The uniform stub overrides about 28 % of choices, which often sends a docked governor sailing. With no consults away, the sim's own path then keeps them away.
- Under the docked stub for ATL, 14,346 of 18,739 governor decisions are away.
- Even in the current-rule stub for ATL, only 6,881 of 21,406 consults (32 %) were docked.
- For seed 4096 under ATL that leaves 25 consults.
- The stub is a trajectory artefact, not a forecast. The cap therefore uses the read-only recount, as the original rule does.

### Caps (original rule: read-only max × 1.25, rounded up; $0.0000544 per call, rounded up to the cent)

**Reference only (Lead ruling 1):** the cap in force stays 2,108 calls for standard runs and 2,510 for anything else, until it is re-derived from the first live docked run.

| Set | Rule | 3-seed max | Cap | $ | 13-seed max | 13-seed cap | $ | Stub max (uncapped), 3 seeds / 13 |
|---|---|---|---|---|---|---|---|---|
| ATL | current seat (#191, ruled) | 1,686 (1847) | 2,108 | $0.12 | 2,008 (1000) | 2,510 | $0.14 | 1,722 / 2,415 |
| **ATL** | **docked** | 895 (2718) | **1,119** | **$0.07** | 1,058 (7000) | **1,323** | **$0.08** | 485 / 697 |
| ATLS + fix | current seat | 1,839 (1847) | 2,299 | $0.13 | 2,008 (1000) | 2,510 | $0.14 | 1,722 / 2,415 |
| **ATLS + fix** | **docked** | 1,034 (1847) | **1,293** | **$0.08** | 1,058 (7000) | **1,323** | **$0.08** | 485 / 518 |
| ATLS pre-fix | current / docked | 1,839 / 1,034 | 2,299 / 1,293 | $0.13 / $0.08 | 2,008 / 1,058 | 2,510 / 1,323 | $0.14 / $0.08 | 1,722 / 485 |
| off (check) | current / docked | 1,482 / 989 | 1,853 / 1,237 | $0.11 / $0.07 | 1,681 / 1,266 | 2,102 / 1,583 | $0.12 / $0.09 | 1,319 / 509 |

The unrounded dollar figures are in `raw/summary.txt`. ATL docked is $0.0609 (3-seed) and $0.0720 (13-seed). ATLS docked is $0.0703 and $0.0720. **The fix does not move any cap.** The ATLS maxima sit on seeds 1847 and 7000, and the fix leaves both unchanged.

### Pins (`pins.ts`, `raw/pins-*.txt`)

**Flag-off main pins: unchanged with `docked.patch`.** At 72 / 1,200 ticks: `7f76e474` / `94de9c02`, `976c40bd` / `7a3741c9`, `08943ea5` / `af6eeaea`.

**ATL default pins** (ATL passed as options): with and without `docked.patch`, the values are:
- 1847: `e8963d15` / `77d4697d`
- 2718: `a08fbf46` / `2c7809db`
- 4096: `21de6a8b` / `c61988f4`

These **match the post-#192 pins the Lead and Engineer confirmed.**

**ATLS pre-fix pins** (recorded here, not re-derived as pins): `85658e53` / `5367691c`, `aa54ada1` / `faf5798a`, `e4361ee1` / `7e93eab2`. They are the same with `docked.patch`.

**`npm test` with `docked.patch`** (`raw/npm-test-docked.txt`): 690 / 690 pass, 0 fail, exit 0. The golden fixture is part of the suite.

**Picker-on stub.** No test pins a hash for a picker-on run. `wg-picker.test.ts` checks roles, rails, replay and cap behaviour, not hashes. Picker-on stub hashes do change, by design. At 400 ticks, stubUniform, WG:

| Config | Seed | Current | Docked |
|---|---|---|---|
| off | 1847 | `b7bd81d1` (347 consults) | `c39d1b1a` (297) |
| off | 2718 | `b91546be` (285) | `9a61968a` (237) |
| off | 4096 | `2b46c330` (374) | `b2aa7172` (186) |
| ATL | 1847 | `010a794b` (392) | `6da3f993` (88) |
| ATL | 2718 | `1a9419f2` (564) | `42186ea8` (266) |
| ATL | 4096 | `aedea1ca` (422) | `438d50c3` (25) |

`seatToNpc` in `wg-picker.test.ts` calls `wgPickerRole`, which still returns `"governor"` for an away governor, so the fixture keeps excluding every seat holder.

## Lead rulings (2026-11-27)

1. **Caps are unchanged, as headroom:** 2,108 calls for standard runs and 2,510 for anything else. The cap is a safety stop, and live counts have reached 1.255× the read-only recount (4096 on main, #191). Re-derive the cap from the first live docked run. The docked caps (1,119 / 1,293 / 1,323) are recorded above for reference only.
2. **Docked-share readout: a report, not a gate.** Specified and measured below.
3. **No member or own-ship consults in v1.** Those are a separate, later decision. [wg-jev-picker.md](wg-jev-picker.md) now records its scope and ruling 2 as "governors while docked at a seat they hold", with a pointer to this note.
4. **The lifecycle `office` field records the seat held at retirement.** The Engineer will build it. The prototype and its pin impact are below.
5. **Levy and stipend keep paying while the governor is away.** No change.

## Docked-share readout (ruling 2)

**Readout.**
- **When it is read:** between ticks, after each `runTick`, for every port with `governorId(world, port) !== null`. That covers every faction; WG is the one the picker uses.
- **What it counts:** one *seat-tick* for the pair (port, governor). The tick is also *docked* when that governor has `locationId === port`, `travel === null` and `captivity === null`. That is the same test as `wgGovernorDocked`, applied per seat.
- **What it reports:**
  - For each governor and seat, seat-ticks, docked ticks and docked share.
  - For each seat, the same totals summed over its governors.
- **Flag:** a seat is flagged only if it was held for at least 1 tick in the run and had 0 docked ticks. A single governor with 0 docked ticks is reported, not flagged.
- **Cost:** no gate and no world write. It reads state only; end hashes are unchanged.

It is added to [count.ts](offices-docked-governor/count.ts) as `dockRead` (plus `retiredOffices`). [readout.py](offices-docked-governor/readout.py) prints it, and the full per-governor listing for ATL is in `raw/readout-ATL.txt`.

**ATL, docked rule, 13 seeds × 1,200** (read-only = no picker; stub = stubUniform with `docked.patch`)

| Seed | WG docked share (read-only) | Lowest WG seat (read-only) | WG docked share (stub) | Lowest WG seat (stub) |
|---|---|---|---|---|
| 1847 | 843 / 2,126 (39.7 %) | Cinder Key 8/132 (6 %); Verdant Cay 44/725 (6 %) | 452 / 2,288 (19.8 %) | Verdant Cay 13/743 (2 %) |
| 2718 | 896 / 2,185 (41.0 %) | Verdant Cay 31/527 (6 %) | 484 / 2,271 (21.3 %) | Verdant Cay 12/472 (3 %) |
| 4096 | 807 / 2,296 (35.1 %) | Verdant Cay 53/1,006 (5 %) | 25 / 1,100 (2.3 %) | Crown Harbor 4/574 (1 %) |
| 1000 | 780 / 2,785 (28.0 %) | Verdant Cay 62/670 (9 %) | 88 / 1,936 (4.5 %) | Crown Harbor 15/1,200 (1 %) |
| 2000 | 496 / 2,065 (24.0 %) | Verdant Cay 20/530 (4 %) | 194 / 2,736 (7.1 %) | Crown Harbor 27/984 (3 %) |
| 3000 | 862 / 2,041 (42.2 %) | Verdant Cay 28/383 (7 %) | 696 / 2,040 (34.1 %) | Verdant Cay 18/483 (4 %) |
| 4000 | 907 / 2,329 (38.9 %) | Verdant Cay 16/548 (3 %) | 261 / 2,010 (13.0 %) | Glassport 27/348 (8 %) |
| 5000 | 984 / 2,645 (37.2 %) | Verdant Cay 65/1,048 (6 %) | 433 / 2,696 (16.1 %) | Verdant Cay 47/749 (6 %) |
| 6000 | 976 / 2,313 (42.2 %) | Verdant Cay 23/966 (2 %) | 301 / 1,559 (19.3 %) | Verdant Cay 9/533 (2 %) |
| 7000 | 1,060 / 2,639 (40.2 %) | Verdant Cay 15/848 (2 %) | 460 / 2,574 (17.9 %) | Verdant Cay 33/997 (3 %) |
| 8000 | 852 / 2,887 (29.5 %) | Verdant Cay 39/515 (8 %) | 106 / 2,446 (4.3 %) | Crown Harbor 3/1,200 (0.25 %) |
| 9000 | 438 / 1,556 (28.1 %) | Verdant Cay 9/278 (3 %) | 385 / 2,407 (16.0 %) | Verdant Cay 25/655 (4 %) |
| 10000 | 364 / 1,396 (26.1 %) | Glassport 61/387 (16 %), Cinder Key 1/6 | 511 / 2,085 (24.5 %) | Verdant Cay 27/574 (5 %) |
| **13 seeds** | **10,265 / 29,263 (35.1 %)** | | **4,396 / 28,148 (15.6 %)** | |

**No seat is flagged** in any of the 26 runs, for any faction.

**13-seed WG totals by seat:**

| Seat | Read-only | Stub |
|---|---|---|
| Cinder Key | 77.6 % | 38.4 % |
| Crown Harbor | 42.8 % | 14.3 % |
| Glassport | 32.9 % | 21.5 % |
| Verdant Cay | 5.1 % | 3.4 % |

**Governors with 0 docked ticks** (reported, not flagged): one per mode.
- Read-only: Niko Wren, Crown Harbor, seed 9000, 216 seat-ticks. He retired at tick 216 while docked at Verdant Cay; see the office fix below.
- Stub: Iris Stone, Glassport, seed 1000, 85 seat-ticks.

## Lifecycle office fix (ruling 4)

**Prototype.** [office-fix.patch](offices-docked-governor/office-fix.patch) is a separate patch: `lifecycle.ts` only, not folded into `docked.patch`, because it is the Engineer's change and independent of the picker.
- `character-retired.data.office` becomes the seat the retiring captain holds, docked or away (`heldSeat`, which reads `governorId` over the settlements).
- The old value was the port where they stand if they govern it, else null.
- A captain holding several seats records the lowest settlement id. The field stays a string or null. `client-readiness.ts` withholds `office` by key name, so adding a new key would also need adding to that list.

**Effect (ATL and ATLS, 13 seeds, with `docked.patch`).**

| | ATL | ATLS |
|---|---|---|
| Retirements | 81 | 76 |
| Retirements with `office` set (old → new) | 5 → 10 | 4 → 8 |
| Records changed from null to the held seat | 5 | 4 |

The changed records:

| Seed | Tick | Captain | Docked at | Seat recorded now | In |
|---|---|---|---|---|---|
| 1847 | 217 | character-22 | Crown Harbor | Verdant Cay | ATL, ATLS |
| 5000 | 217 | character-11 | Glassport | Crown Harbor | ATL, ATLS |
| 9000 | 216 | character-03 | Verdant Cay | Crown Harbor | ATL, ATLS |
| 10000 | 217 | character-19 | Glassport | Verdant Cay | ATL, ATLS |
| 10000 | 833 | character-12 | Verdant Cay | Crown Harbor | ATL only |

Two retirees held two seats each, in both ATL and ATLS. Only the lowest id is recorded for them:
- seed 5000, tick 217, character-11: Crown Harbor + Verdant Cay;
- seed 8000, tick 441, character-18: Glassport + Verdant Cay.

**Pin impact: none.** `stateHash` does not cover event payloads.

| Check | Patches | Result |
|---|---|---|
| Flag-off main 72 / 1,200 (1847 / 2718 / 4096) | docked + office | `7f76e474` / `94de9c02`, `976c40bd` / `7a3741c9`, `08943ea5` / `af6eeaea`: unchanged |
| Post-#192 ATL pins | docked + office | `e8963d15` / `77d4697d`, `a08fbf46` / `2c7809db`, `21de6a8b` / `c61988f4`: match |
| ATLS with `fix.patch` | docked + fix | `85658e53` / `5367691c`, `aa54ada1` / `faf5798a`, `e4361ee1` / `7e93eab2` |
| ATLS with `fix.patch` | docked + fix + office | identical to the row above |
| ATL and ATLS end hashes, 13 seeds | docked vs docked + office | identical on 13 / 13 |
| `npm test` (includes the golden fixture) | docked + office | 690 / 690 pass, exit 0 |
| `npm test` | docked + fix + office | 690 / 690 pass, exit 0 |

`fix.patch` leaves the three standard ATLS pins where they were before the fix. It changes only seeds 2000 and 9000, which are not pinned. Raw output is in `raw/pins-pins{fix,office,officefix}.txt` and `raw/npm-test-docked-office{,-fix}.txt`.

## Open questions for the Lead

All five questions from the proposal are ruled above. What remains:

1. **Multi-seat retirees.** For a retiree holding several seats, `office` records the lowest settlement id: 2 of 81 ATL retirements, and the same 2 in ATLS. Should it record every seat, as a new key that `client-readiness` also withholds? This is the Engineer's call.
2. **Verdant Cay's docked share is 5.1 %** (read-only, ATL), and it is never zero, so it is never flagged. Under the docked rule its picker consults are about 416 over 13 seeds. Report only, as ruled.
