# Defaults-on: which built layers stop being opt-in

Status: **Open / proposal** for the Lead. Off `main` e9ac8b6 (#188). Offline, no AI, $0. 13 seeds × 1,200 ticks
(1847, 2718, 4096, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000). No constant was tuned.
Scripts and raw output: [defaults-on/](defaults-on/).

Purpose: Micah wants the sim ready for mobile UI work, so the built layers should run by default, each with an
opt-out like `EXILE_RECOVERY` and feedReasons.

## 1. The layers and how they are wired today

| Layer | Engine option (`TickOptions`) | Engine default | CLI today |
|---|---|---|---|
| Occupation | `occupation` | `OCCUPATION_DEFAULT = false` (occupation.ts) | **none**: no run CLI can turn it on |
| Alliances | `alliances` | `ALLIANCES_DEFAULT = false` | `--alliances` / `ALLIANCES=1` |
| Port transfer (purchase) | `portTransfer` | `PORT_TRANSFER_DEFAULT = false` | `--port-transfer` / `PORT_TRANSFER=1` |
| Lifecycle | `lifecycle` | `LIFECYCLE_DEFAULT = false` | `--lifecycle` / `LIFECYCLE=1` |
| Secession aftermath | `secessionAftermath` | `SECESSION_AFTERMATH_DEFAULT = false` | `--secession-aftermath` / `SECESSION_AFTERMATH=1` |
| Exile recovery (pattern) | `exileRecovery` | `EXILE_RECOVERY_DEFAULT = true` (engine.ts) | `--no-exile-recovery` / `EXILE_RECOVERY=0`; `--exile-recovery` is a deprecated no-op |
| feedReasons (pattern) | `ai.feedReasons` | CLI-level `FEED_REASONS_DEFAULT = true` | `--no-feed-reasons` / `FEED_REASONS=0` |

The layer flags are taken by `run-simulation` and `run-action-picker` only; `run-ai-pilot` and `run-feed-reasons`
take only the exile and feedReasons flags. The dashboard server calls `runTick(world, { liveSession: true })`, so a
live (mobile) session sees **engine defaults only**. That decides the wiring: flip the engine default, as exile does.

## 2. Results

Sets: (a) main defaults; (b) all five on; (c) subsets. All 32 subsets were measured (`run-subsets.sh`); the
leave-one-out and single-layer rows are subsets of those. Letters: O occupation, A alliances, T portTransfer,
L lifecycle, S secessionAftermath. EXILE_RECOVERY on throughout unless marked.

### 2.1 Totals (13 seeds)

| Set | Claims | Port changes | Battles | Captures | Secessions (seeds) | Peaces | Peace breaks | Joins | Pacts (protection) | Purchases | Promotions | Retire / return | Portless at t1200 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| (a) main | 682 | 713 | 927 | 247 | 31 (12/13) | 0 | 0 | 0 | 0 | 0 | 0 | 0 / 0 | 25 |
| (b) OATLS | 432 | 474 | 777 | 174 | 28 (7/13) | 15 | 0 | 1 | 53 (5) | 13 | 18 | 71 / 39 | 25 |
| (c1) ATLS | 497 | 543 | 898 | 214 | 32 (11/13) | 22 | 0 | 1 | 59 (3) | 13 | 21 | 76 / 45 | 22 |
| (c2) ATL | 527 | 577 | 939 | 237 | 37 (11/13) | 0 | 0 | 0 | 78 (0) | 13 | 19 | 81 / 50 | 26 |
| TLS | 597 | 648 | 895 | 212 | 34 (11/13) | 24 | 0 | 4 | 9 (9) | 13 | 25 | 78 / 50 | 26 |

Exile opt-out variants (report-only; compared with the main opt-out, 437 claims, 42 secessions on 11/13):
(b) 292 claims, 19 secessions on 10/13; ATLS 365, 31 on 11/13; ATL 400, 36 on 11/13. All pass the numeric gates.

### 2.2 Per seed (claims / port changes / secessions / portless at t1200)

| Seed | (a) main | (b) OATLS | (c1) ATLS | (c2) ATL |
|---|---|---|---|---|
| 1847 | 51 / 52 / 1 / 1 | 15 / 21 / 5 / 4 | 32 / 37 / 4 / 3 | 30 / 32 / 1 / 0 |
| 2718 | 64 / 64 / 0 / 0 | 37 / 38 / 0 / 0 | 42 / 47 / 4 / 3 | 42 / 47 / 4 / 3 |
| 4096 | 56 / 59 / 3 / 2 | 29 / 38 / 7 / 7 | 31 / 34 / 2 / 1 | 31 / 34 / 2 / 1 |
| 1000 | 42 / 44 / 2 / 1 | 40 / 41 / 0 / 0 | 26 / 28 / 1 / 1 | 26 / 28 / 1 / 1 |
| 2000 | 50 / 52 / 2 / 2 | 20 / 21 / 0 / 0 | 38 / 40 / 1 / 0 | 38 / 44 / 5 / 3 |
| 3000 | 42 / 44 / 2 / 2 | 29 / 30 / 0 / 0 | 47 / 51 / 3 / 2 | 48 / 52 / 3 / 3 |
| 4000 | 63 / 64 / 1 / 1 | 37 / 43 / 5 / 5 | 60 / 61 / 0 / 0 | 60 / 61 / 0 / 0 |
| 5000 | 55 / 57 / 2 / 1 | 13 / 15 / 1 / 0 | 29 / 31 / 1 / 0 | 29 / 31 / 1 / 0 |
| 6000 | 50 / 55 / 5 / 5 | 50 / 54 / 3 / 2 | 29 / 33 / 3 / 3 | 57 / 64 / 6 / 4 |
| 7000 | 61 / 65 / 4 / 3 | 48 / 49 / 0 / 0 | 54 / 55 / 0 / 0 | 54 / 55 / 0 / 0 |
| 8000 | 62 / 66 / 4 / 3 | 41 / 42 / 0 / 0 | 25 / 29 / 3 / 3 | 25 / 29 / 3 / 3 |
| 9000 | 58 / 60 / 2 / 1 | 34 / 40 / 5 / 5 | 43 / 49 / 5 / 3 | 50 / 58 / 7 / 6 |
| 10000 | 28 / 31 / 3 / 3 | 39 / 42 / 2 / 2 | 41 / 48 / 5 / 3 | 37 / 42 / 4 / 2 |
| **low** | claims 28 (10000), PC 31 (10000) | claims 13 (5000), PC 15 (5000) | claims 25 (8000), PC 28 (1000) | claims 25 (8000), PC 28 (1000) |

No set has a wipeout on any seed, so no set has a new wipeout vs (a).

### 2.3 Gates

| Gate | (b) OATLS | (c1) ATLS | (c2) ATL |
|---|---|---|---|
| Replay exact (13/13, `replayWithSilentStarts`) | pass | pass | pass |
| Claims and port changes > 0 every seed | pass (low 13 / 15) | pass (25 / 28) | pass (25 / 28) |
| No new wipeouts vs (a) | pass | pass | pass |
| Secessions on ≥ 6/13 | pass, **7/13** | pass, 11/13 | pass, 11/13 |
| Per-layer property checks together | **fail**: alliances (protection pacts), occupation 2c | **fail**: alliances (protection pacts) | **pass** |

Property checks run: each layer's own acceptance sweep (`scripts/*-sweep.ts`), copied to `defaults-on/props-*.ts`
with one change: the flag-on run also turns on the other layers of the set (`DEFAULTS_ON_BASE`). The flag-off run
stays main, so each sweep's flag-off pin check still runs against e9ac8b6 and passed every time.

| Checker | alone (merged state) | in (b) | in (c1) ATLS | in (c2) ATL |
|---|---|---|---|---|
| `props-secession-aftermath.ts` (cause, age ≥ 67, bilateral peace, break evidence, patron rules, join moved, replay) | pass | pass | pass | n/a |
| `props-lifecycle.ts` (causes, retire/return/promotion rules, roster names, seat vacated, replay) | pass | pass | pass | pass |
| `props-port-transfer.ts` (§4 properties 1–7, buyer and agent recomputed) | pass | pass | pass | pass |
| `props-alliances.ts` (cause per side, one pact per faction, cooldown, no raid or claim between allies, joiners, break conditions) | pass | **fail** | **fail** | pass |
| `props-occupation.ts` (acceptance items 2a–7b) | pass | **fail on 2c** | n/a | n/a |

**Alliances checker failures are all on protection pacts** (the aftermath's `alliance-formed` with
`aftermath: "protection"`); ALLIANCES pacts have 0 violations in (b), (c1) and (c2). (In A + S alone, 2 ALLIANCES pacts also outlive a break condition by one tick; not diagnosed.) `classify-alliances.ts` splits them:

| Violation on protection pacts | S alone (A off) | A + S | TLS (A off) | (c1) ATLS | (b) OATLS |
|---|---|---|---|---|---|
| Break condition holds at the tick's end (enemy portless / ally gone), broken next tick | 2 | 7 (+2 on ALLIANCES pacts) | 3 | 2 | 5 (4 portless, 1 ally gone) |
| Patron already in a pact (one pact per faction) | 0 | 2 | 0 | 1 | 1 |
| Formed inside the 240-tick pair cooldown | 0 | 5 | 0 | 2 | 2 |
| Checker scope only (cause text format, 24-tick clock): not violations; the aftermath checker validates protection causes | yes | yes | yes | yes | yes |

Causes, read from the code: `threatTo` (secession-aftermath.ts) can name a **raider that holds no port**, while
`allianceForms` only picks enemies that hold ports; the protection pact then fails `enemy-portless` on the next
`allianceBreaks`. `aftermathStep` runs after `allianceBreaks` in the tick, so a pact formed while a break condition
already holds lives one tick. `patronCandidates` does not exclude a patron already in a pact, and protection does
not consult `allianceMemory` (the pair cooldown). The first exists with SECESSION_AFTERMATH alone on main (2 pacts);
the other two only appear when ALLIANCES is also on. The spec says the three break rules "apply unchanged" to
protection pacts (secession-aftermath.md §3), so these are real cross-layer defects, not checker noise. They are
rule fixes (who may be a threat or a patron), not constants; I did not change them.

**Occupation 2c** ("harsh occupations flip back more than benign ones, at the flip", gated when n ≥ 10) is a
statistical effect check, not a per-event property. Alone it passes (harsh 0.745 vs benign 0.597). It fails with
lifecycle or portTransfer: O+L 0.649 vs 0.700, O+T 0.523 vs 0.570, (b) 0.500 vs 0.528; it passes with O+A and O+S.
All other occupation items pass in (b), including liveness, churn and hold median.

### 2.4 Which layer drives the quieting and the gate margin

Single layers vs (a): claims 682 → O 445 (−35 %), L 559, A 595, S 640, T 641. Secession seeds 12 → O 8, L 8, T 9,
A 12, S 12. Lowest-seed claims 28 → O 11, others 19–24.

Leave-one-out from (b) (claims, secession seeds): −O 497 (11/13), −A 494 (7/13), −L 379 (10/13), −S 421 (7/13),
**−T 375 (5/13, fails)**.

The secession gate fails exactly when **occupation and lifecycle are both on without port transfer**: OL, OAL, OLS
and OALS are all 5/13. Port transfer lifts these to 7/13 (OTL, OATL, OTLS, OATLS). So (b) passes the secession
gate only through the purchase layer, with one seed of margin. Every set without occupation is at 8–12/13. Three
sets reach 5 claims on one seed (OA, OS and OAS, all on 2718); they still pass liveness.

## 3. Recommendation

1. **Flip now: alliances, portTransfer, lifecycle (c2, ATL).** It is the largest set where every gate passes,
   including every layer's property checker together. Claims 682 → 527, secessions on 11/13, 78 pacts (124 with alliances alone),
   13 purchases, 19 promotions, 81 retirements and 50 returns.
2. **Flip secessionAftermath after a protection-pact fix** (then ATLS: numeric gates already pass at 11/13, low
   claims 25). The fix needs a Lead ruling on three rules: a protection threat must hold a port (as
   `allianceForms` requires of an enemy); a patron must be in no pact; protection honours the pair cooldown.
   The alternative is ruling protection pacts exempt from the last two, but the first is a defect on main today.
   Re-run `props-alliances.ts` and `props-secession-aftermath.ts` with ATLS after the fix.
3. **Keep occupation opt-in for now**, and give it a CLI flag (it has none). It is the main source of the quieting
   (−35 % claims alone), it is half of the occupation × lifecycle interaction that breaks the secession gate when
   port transfer is off, and its own 2c effect check fails with lifecycle or port transfer. If the Lead wants all
   five on, (b) passes the four numeric gates (at 7/13) but not the property gate, until both item 2's fix lands
   and the Lead rules on 2c.

Opt-outs, by the exile pattern (engine default `true`, `false` on `TickOptions` is the opt-out, byte-identical to
today's pins; verified: with ATL flipped in a scratch tree, passing `alliances: false, portTransfer: false,
lifecycle: false` gives 7f76e474 / 976c40bd / 08943ea5 at 72 ticks, and with `exileRecovery: false` too,
66e8ccb7 / b4ccedab / b04c5ac4):

| Layer | Engine | CLI opt-out | Env | Old flag |
|---|---|---|---|---|
| Alliances | `ALLIANCES_DEFAULT = true` | `--no-alliances` | `ALLIANCES=0` | `--alliances` kept as a deprecated no-op |
| Port transfer | `PORT_TRANSFER_DEFAULT = true` | `--no-port-transfer` | `PORT_TRANSFER=0` | `--port-transfer` no-op |
| Lifecycle | `LIFECYCLE_DEFAULT = true` | `--no-lifecycle` | `LIFECYCLE=0` | `--lifecycle` no-op |
| Secession aftermath (step 2) | `SECESSION_AFTERMATH_DEFAULT = true` | `--no-secession-aftermath` | `SECESSION_AFTERMATH=0` | `--secession-aftermath` no-op |
| Occupation (opt-in for now) | stays `false` | new `--occupation` | `OCCUPATION=1` | — |

Engineer notes for the wiring:
- `run-simulation` and `run-action-picker` pass `...(alliances ? { alliances } : {})`. With a `true` default that
  makes the opt-out a no-op; they must pass the resolved boolean every time (as they do `exileRecovery`).
- `run-ai-pilot` and `run-feed-reasons` take no layer flags; add them with the exile flags so every run CLI agrees.
- The dashboard needs nothing beyond the engine default; its sessions then run the layers.
- Flags are run options, not on `WorldState`. A world saved under one set and resumed under another diverges.

## 4. Pins to re-baseline

Confirmed on e9ac8b6 (a): default 72 / 1,200 ticks: 1847 7f76e474 / 94de9c02, 2718 976c40bd / 7a3741c9,
4096 08943ea5 / af6eeaea. Exile opt-out: 66e8ccb7 / b51aa07a, b4ccedab / 091f7628, b04c5ac4 / 25bdbf15.

| Seed | Default (ATL, recommended now) | Exile opt-out (ATL) | Default (ATLS, step 2) | Exile opt-out (ATLS) | Default (all five, if chosen) | Exile opt-out (all five) |
|---|---|---|---|---|---|---|
| 1847 | 8b099eb5 / fe90964e | c87dfb89 / f22ca56a | e5efeeaa / 59e9c76e | 5088e2a7 / b26323e1 | 01d713e0 / c6e6d155 | 6f8a055e / afd4593a |
| 2718 | fd4536b6 / d7242b8e | c410abda / b576e4b3 | 325f0fd2 / e06a3022 | af4ec668 / ea9e1f9a | 413e7de2 / ece56d57 | 204baf38 / 26877ea2 |
| 4096 | 0c87683c / de5930a9 | 11b472f5 / 712c8042 | eb2f30a8 / 1fe6c58e | 0e69b0e3 / 1514b138 | b6364a66 / 3f0d2473 | e09de17a / 4a6c3cb9 |

Golden fixture (`tests/fixtures/golden-hashes.json`, 72 ticks, regenerated with `npm run golden:update` in a scratch
tree): event counts 8247 / 8155 / 8457 → ATL 8350 / 8152 / 8525 (ATLS and all five: 8351 / 8153 / 8526); the
recovery split at t47 replays 559 → 568 events and still matches the continuous hash.

Tests: `npm test` on e9ac8b6 is 682 / 682. With only the engine defaults flipped (no test edits;
`prototype-flip-ATL.patch`), **75 tests in 37 files fail for ATL**, 76 for ATLS, 79 for all five. Lists:
`props-out/engine-flip-failing-tests-*.txt` and `-files-*.txt`. They fall into:
- default-pin tests that run `runTick` with no layer options: golden.test, exile-cli, exile-recovery,
  feed-reasons(-default), secession-routes, batch2-polish, jev-action-picker / social-picker / triage / full-choice,
  ai-picker, ai-pilot-a / b, ai-providers, raise-shock, leader-tax(-autonomy), economy;
- each layer's "off by default" test and its CLI flag test: alliances, port-transfer, lifecycle,
  secession-aftermath, occupation (the occupation test compares off with the default and opt-out pins);
- scenario-narrative tests that read a named event at a seed and tick (contract-feed-polish, readability-polish-2/3,
  capture-wording, breakaway-polish-feed, captive-intelligence, survey, ransom-split, treasury-allowance,
  desertion-recovery, contract-haul, feed-polish-2, secession). These either move to the opt-out options or get
  re-pinned; that is the Engineer's call per test.
The occupation sweep's hard-coded baselines (`CHURN_BASELINE_PORT_CHANGES = 713`, `HOLD_BASELINE`) and every sweep's
`DEFAULT_PINS` are main-default values; under new defaults they must be read as "all layers off" pins.

## 5. WG picker (outside this decision)

Nothing here calls AI: with `ai.picker` unset the action picker keeps `candidates[0]`, and `PICKER_FACTIONS_DEFAULT`
is `["free-tide"]`. The stub check (`props-wg-picker-stub.ts`, stubUniform, world-government only, layers on in
both runs) passes replay exactly with 0 provider calls, keeps the holder dormant and consults only WG, with
secessions on 7/13 (ATL), 7/13 (ATLS) and 10/13 (all five). Its pin item fails only because the base is no longer
main. One thing for the Lead: WG consults per run rise with the layers on. Main: 15,443 over 13 seeds, max 1,503 on
a seed. ATL: 21,344, max 2,355, 2 seeds above the ruled 1,853 cap. ATLS: 21,675, 3 seeds above. All five: 19,019,
max 2,047, 2 seeds above. The cap (recount + 25 %) would bind under the new defaults, so it needs a recount before a
live WG run. I did not diagnose why consults rise.

## 6. Open questions for the Lead

1. Accept ATL now, with secession aftermath after the protection-pact fix? Or all five now, accepting the
   protection-pact and 2c failures until fixed?
2. Protection pacts: rule that a threat must hold a port, that a patron must be in no pact, and that the pair
   cooldown applies? Or exempt protection from the last two?
3. Occupation 2c: is it a gated property under combination, or an effect check that may fail when other layers
   change who retakes ports? It is the only occupation item that fails.
4. Occupation × lifecycle: hold occupation opt-in until that interaction is understood, or accept a default set
   whose secession gate depends on port transfer?
5. Tests: re-pin the scenario-narrative tests under the new defaults, or have them pass the opt-out options so they
   keep their current pins?
6. A single "legacy" opt-out (every layer off) for reproducing pre-defaults runs, in addition to the per-layer flags?

## 7. Reproduce

```
docs/design/defaults-on/run-all.sh        # (a), (b), exile opt-outs, singles, leave-one-out → raw/*.jsonl
docs/design/defaults-on/run-subsets.sh    # all 32 subsets → raw/subset-*.jsonl
node --experimental-strip-types docs/design/defaults-on/summarize.ts [labels]
node --experimental-strip-types docs/design/defaults-on/perseed.ts subset-none subset-OATLS subset-ATLS subset-ATL
DEFAULTS_ON_BASE='{"alliances":true,"portTransfer":true,"lifecycle":true}' node --experimental-strip-types docs/design/defaults-on/props-lifecycle.ts
node --experimental-strip-types docs/design/defaults-on/classify-alliances.ts <props-alliances --json output>
```
