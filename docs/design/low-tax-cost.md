# Low-tax cost: a raise below 0.15 should not be free

Status: **Open / design.** Docs only, plus an offline harness that is kept outside the repo. No live or API call was made. Measured on `origin/main` at `c659a30`, Node v24.22.1 / ICU 78.3.

## 1. What the v3.1 live check showed (verified)

Output: `simulation-output/ai-judgment-v3-1/live-{1847-a,1847-b,4096}-240` on the box, from `feature/ai-judgment-v3` at `4d3ec5c`.

- **Disagreement.** There were 21 brain calls (6 + 6 + 9) with **14 overrides**, so 14 / 21 = **66.7%**. There were 0 fallbacks.
- **The overrides.** 13 of the 14 are `hold → up`. The 14th is 4096 tick 120, `down → hold`, at a pressed port ("safety forbids raise").
- **Rates at the raises.** An offline replay at `4d3ec5c` scripted each run's recorded choices and reached the live end hashes (`21132c65` for both 1847 runs, `ddefa49d` for 4096). Its `tax-rate-set` events put the 13 raises at Free Tide rates **0.08, 0.09, 0.09, 0.10, 0.11** on each 1847 run and **0.08, 0.08, 0.10** on 4096. So the raises are all from 8–11%, as reported.
- **Reasons.** Each of the 13 says some form of "High ambition and aggression favor raising tax for more income". Each names temperament that is in the prompt: Free Tide's holder `character-14` has ambition 0.94, aggression 0.97 and caution 0.08. It is the same ruler on every run.

### Where the rate's costs are computed (`c659a30`)

| Cost | Code | At or below 0.15 |
| --- | --- | --- |
| Stability drift | `taxDrift` in `src/sim/tax-rate.ts` (`TAX_DRIFT_THRESHOLD = 0.15`, `TAX_DRIFT_PER_BAND = 0.03`), used on the upkeep stability write in `src/sim/engine.ts`: `stability - shortage * 0.35 + (shortage === 0 ? 0.03 : 0) - taxDrift(holdingRate)` | **0** |
| Autonomous secession trigger | `declareAutonomousSecessions` in `engine.ts` (`if (!(taxRate > 0.15)) continue`) and `secession.ts` (`holdingTaxRate(...) > TAX_DRIFT_THRESHOLD`) | **No trigger** |
| Purse split | `tradeAmounts` and `tradeTax` in `engine.ts`: a sale pays `gross × rate` to the treasury. Buys are untaxed | Paid, but the leader-tax sweep found that work and sale counts "do not step up or down with the rate" (`leader-tax.md`, line 76) |

So below 0.15 a raise moves coins from the purse to the treasury and has **no** stability, secession or trade-volume consequence. A rational ruler who wants income should raise. The brain did that, and the scorer only fails to because it raises only when `short`.

## 2. Why this is a rules gap

- `game-vision.md` says "The simulation validates every proposed action and applies the consequences" (line 19), and "Resistance must emerge from characters, material conditions, opportunities, and player action" (line 39). The vision has no line that literally says "every choice has a trade-off". The Lead's ruling is a reading of these lines, and this note follows it.
- `leader-tax.md` left a rate-keyed stability term out until the Lead asked (line 72). Its addendum then ruled the graded drift: zero at or below 0.15, and "no separate recovery for a low rate" (lines 287–301).
- `treasury-balance.md` keeps the holder's draw uncapped, so extra income is spent, not saved.

## 3. Options

| Option | Mechanism | Fit | Problem |
| --- | --- | --- | --- |
| Trade or merchant flow | Sale volume falls as the rate rises | Most "material" | Nothing in the tree prices the rate into sale choices (leader-tax line 76). This needs a new trading term and touches every trade path. Large |
| Faction-mate goodwill | A raise lowers mates' trust or loyalty toward the holder | Character-driven | Moves `relationship-changed` and desertion everywhere. The tax-to-desertion link has never been measured. Wide blast radius |
| Gentle standing drift below 0.15 | Extend `taxDrift` under the threshold | One-line change | Reverses the ruled "no drift at or below 0.15", and punishes the scenario's own 0.08 and 0.14 rates every tick |
| **Raise shock (recommended)** | Each raise of `n` points subtracts `n × S` stability from each port the faction holds, once, on the `tax-rate-set` that raises | The cost falls on the choice, at any rate. Holding is unchanged. Small | New, so it needs a ruling |

**Recommendation: the raise shock.** It prices the choice the brain makes, not the rate the scenario starts at. It needs no new event type, and it leaves the graded drift and its 0.15 threshold untouched.

## 4. Size: S = 1.0 stability per point raised

Arithmetic, from the upkeep line:

- A fed peaceful upkeep adds +0.03. `ticksPerDay` is 6, and upkeep runs on every peaceful tick, so a 24-tick cooldown gives at most 24 × 0.03 = **+0.72** of recovery between two clock points.
- With **S = 1.0**, raising at every clock point nets 0.72 − 1.0 = **−0.28** per cycle, so repeated raises wear a port down. A single raise heals in 1.0 / 0.03 ≈ 34 fed upkeeps, about 5.6 days.
- With S = 0.5, a raise heals inside one cooldown (0.5 < 0.72), so repeated raises are free again on a fed port. That is too small.
- The revolt line is 55 (`CLAIM_STABILITY_FLOOR`), and ports sit in the mid-50s to low 60s (`leader-tax.md`, line 78). So one raise can put a port at the line, and then the scorer's own `pressed → down` rule answers it.

**The scorer's holds stay sensible.** The scorer still holds unless `pressed` or `short`, and it raises only when short. That is when paying the shock is worth it, and the rail already forbids a raise at the line. The shock adds no new condition to the scorer.

**Build note.** The harness subtracted the shock inside the reducer. The build should follow the codebase pattern instead: write the resulting stabilities onto the raising `tax-rate-set` event (for example `data.raiseShock: [{ settlementId, stability }]`) and have `applyEvent` set them, so replay reads the event.

## 5. Hash impact

- **72-tick golden fixture: unchanged.** No raise happens in the first 72 ticks on the three seeds. Offline with S = 1.0, flag off: `6efa334f` / 8496, `e8f9cfab` / 8566, `8ac8529b` / 8486, the same as without the shock.
- **1,200-tick flag-off hashes: change** wherever the scorer raises. Free Tide raises 12 / 13 / 14 times on 1847 / 2718 / 4096, so every 1,200-tick pin moves. The events that change are the raising `tax-rate-set` (new data) and every later settlement stability write. After that, everything diverges by butterfly: battles, secessions, deaths.
- **AI flag-off byte-identical** still holds relative to the new flag-off baseline.

## 6. Offline measurement (harness outside the repo, restored)

Patch: `/workspace/low-tax-cost-harness.patch` on the box (env `RAISE_SHOCK`), applied to a scratch worktree of `c659a30` and then removed. 1,200 ticks. "Off" is the scorer with no AI. "Always-up" is a stub brain on Free Tide that picks `up` whenever it is legal: the v3.1 ruler with no rail, as a worst case.

| Seed | Mode | S | 1,200 hash / events | FT rate / treasury | WG rate / treasury | FT raises | Secessions | FT port-ticks ≤ 55 |
| ---: | --- | ---: | --- | --- | --- | ---: | ---: | ---: |
| 1847 | off | 0 | `c4d99822` / 163679 | 0.14 / 909 | 0.03 / 5487 | 12 | 4 | 51 |
| 1847 | off | 1.0 | `f80c529f` / 165833 | 0.16 / 3 | 0.11 / 11496 | 14 | 4 | 72 |
| 2718 | off | 0 | `738181c0` / 159177 | 0.18 / 0 | 0.06 / 8835 | 13 | 2 | 18 |
| 2718 | off | 1.0 | `2b5060c0` / 157639 | 0.11 / 149 | 0.10 / 9473 | 5 | 0 | 26 |
| 4096 | off | 0 | `cbd66565` / 161386 | 0.15 / 27 | 0.02 / 5259 | 14 | 2 | 98 |
| 4096 | off | 1.0 | `e8ae4443` / 162123 | 0.16 / 0 | 0.08 / 8205 | 10 | 4 | 206 |
| 1847 | always-up | 0 | `498bb25d` / 160920 | 0.23 / 2 | 0.03 / 6446 | 15 | 5 | 22 |
| 1847 | always-up | 1.0 | `21f8534b` / 166140 | 0.22 / 8 | 0.09 / 8461 | 14 | 4 | **265** |
| 2718 | always-up | 0 | `f0358d86` / 159578 | 0.27 / 0 | 0.09 / 3622 | 19 | 6 | 93 |
| 2718 | always-up | 1.0 | `9361acc1` / 158311 | 0.23 / 0 | 0.07 / 7705 | 15 | 5 | **494** |
| 4096 | always-up | 0 | `a9f3998e` / 162114 | 0.27 / 0 | 0.08 / 166 | 19 | 4 | 44 |
| 4096 | always-up | 1.0 | `6b58f9f6` / 162939 | 0.26 / 0 | 0.07 / 551 | 18 | 5 | **442** |

"FT port-ticks ≤ 55" counts the ticks × ports where Free Tide held a port at or below the revolt line. There is no revolt event in the tree, so this and secessions are the unrest measures. S = 0.5 was also run; its rows are in the harness log and are mixed.

What the numbers support:

- **The cost bites the always-raise ruler.** Free Tide's port-ticks at the revolt line rise from 22 / 93 / 44 to 265 / 494 / 442. That is the trade-off the ruling asks for. Here it is shown with no rail; under v3 the rail then blocks further raises at the line, so the ruler pays in pressed ports and forced holds.
- **Flag off, the effect is smaller and noisy.** Line-ticks go 51 → 72, 18 → 26 and 98 → 206. Secessions and end treasuries move both ways, because any change diverges the campaign. Three seeds cannot separate the shock from that divergence for secessions, rates or treasuries. No claim is made for them.

## 7. The 10–40% target

**Keep it, but as a band to watch, not a pass line, and re-measure after the cost lands.** The 67% was not noise. All 13 raises name the ruler's real temperament, and the same request gave the same answer across the two 1847 runs. But they are one ruler, Pax Ash (ambition 0.94, aggression 0.97, caution 0.08), facing a free option. High agreement from that is consistency, not variety of judgment. Under a priced raise, a sound override rate should fall. If it stays above 40% with reasons tied to state and no safety breach, the Lead can widen the band. If the overrides then cost Free Tide its ports, that is the trade-off working.

## 8. Offline plan for the build

1. Build the shock with S = 1.0 on the raising `tax-rate-set` event, as in the build note in section 4.
2. Re-pin the 1,200-tick flag-off hashes. Confirm the 72-tick fixture is unchanged.
3. Re-run the section 6 table on the built code, plus the v3.1 scripted choices replayed under the shock.
4. Only then, and only with Micah's go-ahead, re-run the v3.1 live check. No live run is planned or costed here.

## 9. Defaults

1. Raise shock: each point raised subtracts 1.0 stability, once, from each port the faction holds, at any rate.
2. Graded drift and the 0.15 threshold unchanged. No drift and no recovery change below it.
3. Merchant-flow and goodwill costs deferred.
4. 72-tick fixture unchanged. The 1,200-tick pins move and are re-pinned.
5. Disagreement band 10–40% kept as a watch band, re-measured after the cost.
