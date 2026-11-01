# Secession routes beyond the tax line

Status: **Open / design.** Offline only; no live call. Base `origin/main` `e24adc9` (#146; `feature/ai-tax-weighted` merged as #145). Every figure is from a harness outside the repo (`/workspace/secession-routes-harness/`, with `routes-harness.patch`, an uncommitted engine patch that is inert unless the harness sets `globalThis.SR`). Node v24.22.1, 1,200 ticks, seeds 1847 / 2718 / 4096. Readouts are `npm run dynamism -- --events <run> --baseline <flag-off> --json`.

## 1. The claim, verified

**Claim (Engineer's trace).** On 1847 and 4096 the only route to secession is Free Tide's rate crossing 15%, which depends on Free Tide's solvency because the scorer raises every 24 ticks while the treasury is short.

**Code.** The autonomous walker `declareAutonomousSecessions` (`src/sim/engine.ts:3497–3531`, called at `:4040` right after the tax step at `:4039`) requires, per port in id order, a seated autonomous governor anchored on the port, same faction, not the command holder, **`taxRate > 0.15`** (`engine.ts:3510`) and the governor's news stability figure ≤ 55 (`:3511–3512`; `CLAIM_STABILITY_FLOOR`, `src/sim/state.ts:26`), once per spell. The readout twin `autonomousSecessionReady` (`src/sim/secession.ts:418–433`) has the same tax test (`:429`). There is no other autonomous writer of `secession-declared`; the only other one is the player command (`engine.ts:2525–2565`), absent headless. The scorer (`taxStepOptions`, `src/sim/tax-rate.ts:227–275`) steps **down** when pressed (lowest held stability ≤ 55), **up** when not pressed and `short` (free mates > 0 and treasury < mates × one day of passage, `:262`), else holds (`:264–265`), on the 24-tick clock (`TAX_RATE_COOLDOWN_TICKS`, `:15`). A faction with no port is frozen at hold (`:241–246`, the landless/portless freeze).

**Events** (flag-off, hashes `f80c529f/165833`, `2b5060c0/157639`, `e8ae4443/162123`, unchanged since `0bed4c5`):

| Seed | Secessions | All from | Rate when declared | Free Tide max rate | World Government max rate | Port-ticks rate > 0.15 / stability ≤ 55 / both |
| ---: | --- | --- | --- | ---: | ---: | --- |
| 1847 | 4: t768 Crown Harbor, t794 Crown Harbor, t809 Cinder Key, t871 Crown Harbor | Free Tide | 0.16–0.17 (the t768 raise 0.15 → 0.16 fires the same tick) | 0.17 | ≤ 0.15 | 49 / 178 / 11 |
| 2718 | 0 | — | — | 0.11 | ≤ 0.15 | 0 / 63 / 0 |
| 4096 | 4: t409 Crown Harbor, t422 Glassport, t438 Cinder Key, t488 Crown Harbor | Free Tide | 0.16 (raise at t408) | 0.16 | ≤ 0.15 | 105 / 299 / 7 |

Free Tide's raises before crossing come with small treasuries: 1847 treasury before each raise t288–t456 was 15, 15, 20, 49, 6, 0, 11, 79 and t696–t792 26, 20, 15, 8, 8; 4096 t96–t408 29, 8, 25, 75, 104, 9, 6, 91, 16, 25 (rounded, read before the tick). **Verified**: every secession on these runs is Free Tide above 0.15, reached by "short → up" steps; 2718's treasury recovers (3,160 at t1104) and the rate peaks at 0.11, so it has none. The stability side is not the bottleneck: 178 / 63 / 299 port-ticks sit at or under 55.

**Every current unrest and secession trigger:**

| Trigger | Effect | Where |
| --- | --- | --- |
| Rate > 0.15 and stability ≤ 55 (governor) | autonomous `secession-declared` | `engine.ts:3510–3512`; `secession.ts:429–430` |
| Player `declare-secession` | secession without the tax or stability gate | `engine.ts:2525–2565`; `secession.ts:20–72`; `commands.ts:264` |
| Pressed port (rate > 0.15, stability ≤ 55, or provisions under the ration) | garrison and low-loyalty locals follow a declaration | `secession.ts:133–138`, `wouldFollow` `:173–190` (loyalty < 0.75, `SECESSION_LOYALTY_LINE` `:81`) |
| Tax drift above 0.15 | −0.03 stability per 0.05 band per upkeep | `tax-rate.ts:74–79`, applied `engine.ts:355–356` |
| Raise shock | −1.0 stability per point raised, once, every held port | `tax-rate.ts:31`, `:39–51`; reducer `state.ts` `tax-rate-set` case |
| Provisions shortage | −0.35 stability per unit short, +0.03 when fed, garrison loss | `engine.ts:355–358` |
| Battles | −12 / −3 stability on assault result, −4 / −1 on a phase | `engine.ts:1152`, `:1359` |
| Short-pay desertion | 12 short mornings, loyalty < 0.75, side-stream roll < 0.5 → `factionId` null | `src/sim/desertion.ts:46–87` |
| Unpaid-release scar | −0.04 loyalty on a release with debt | `state.ts:419–431` (`LOYALTY_SCAR_STEP` `:326`) |
| Lost battle under an order | issuer relationship: grievance +0.035, trust −0.025 | `engine.ts:1086–1095` |
| Missed governor stipend | no pay when treasury < (mates + seats) × 18; no event | `src/sim/governor.ts:140–165` |

Breakaways never seat a governor (`governor.ts:81`), so a seceded faction cannot itself secede autonomously.

## 2. Candidate routes

Each route **replaces only the tax term** of `engine.ts:3510` with "tax **or** route"; every other gate stays: seated autonomous governor, anchored, same faction, not the holder, news stability ≤ 55, once per spell. That keeps [secession](secession.md) §1's cut — the declaration is the trigger and material conditions are the governor's reason — and [game vision](game-vision.md)'s "resistance must emerge from characters, material conditions, opportunities" (`game-vision.md:37–39`): nothing rolls a revolt, every route reads a condition the world already produced. Governor-eligible port-ticks at stability ≤ 55 (the space each route acts in): 209 / 249 / 298, of which World Government 100 / 146 / 215 (probe harness). The routes therefore open World Government ports too, which the tax line never does.

**A. Unpaid governor (the "long unpaid garrison").** Garrisons are not paid in the sim (`engine.ts:355–372` feeds them provisions only); the paid post is the governor's stipend (`governor.ts:140–165`) inside the member allowance. Trigger: `governor.shortMorningStreak ≥ 12` (existing field, `src/sim/types.ts:688`, written at `desertion.ts:68–70`). 12 is the desertion line already (`desertion.ts:71`): two days at `ticksPerDay` 6 (`scenario.ts:416`). Measured under the stability gate: streak p90 3 / 0 / 0, max 31 / 0 / 18. Solvency-driven like the tax route, but not through the rate.

**B. Broken promises.** Trigger: at least **10** contracts in `world.contracts` with `status: "breached"` and `destinationId` = the port, `observedTick` within the last **240** ticks (40 days). Existing state: contracts are kept on the world by the contract reducers (`state.ts:1118–1127`, `types.ts:774`). This counts every breach cause; the cause is on the event only (`breachCause`, `engine.ts:3877–3886`), so counting `better-motive` alone needs a new stored field (measured as a variant). Under the stability gate the better-motive count per port in 240 ticks was p50 2 / 1 / 5, p90 9 / 7 / 12, max 13 / 8 / 13; 10 sits at about p90.

**C. Hated commander.** Trigger: the governor's `relationships[holder].grievance` or `relationships[actingCommander].grievance` ≥ **0.12** (existing, `types.ts:267–276`). Grievance rises +0.035 per battle lost under that commander's standing order (`engine.ts:1094`) and decays −0.003 / −0.006 on friendly contacts (`:1705`, `:2932`). Seeds start nonzero. Measured over all governor ticks: p50 0.044 / 0.096 / 0.096, p90 0.086 / 0.131 / 0.149, max 0.170 / 0.172 / 0.149. From a typical 0.044, 0.12 needs ⌈(0.12 − 0.044) / 0.035⌉ = 3 net lost battles.

**D. Lost trade.** Trigger: the port's sale tax (`market-trade` `data.tax`, from `tradeTax`, `engine.ts:965–972`) over the last 120 ticks < **0.6** × the 120 ticks before, with the prior window ≥ 20 and tick ≥ 240. Under the gate the ratio's p10 was 0.68 / 0.76 / 0.49. Needs a **new** per-port ledger (no existing field holds trade history), which moves the 72-tick fixture whenever it is stored from tick 0.

**Interaction with the raise shock and the portless freeze.** None of A–D reads the rate, so a faction that never crosses 0.15 can still lose a port. The raise shock (`tax-rate.ts:31`) still lowers stability, and every route needs stability ≤ 55, so raises still bring secession closer on every route; a pressed faction steps down (`tax-rate.ts:264`), which no longer removes the risk. The portless freeze (`tax-rate.ts:241–246`) stops the tax route for a faction with no port; the new routes need a held port with a governor anyway, so they cannot fire for a portless faction either, and nothing is added for it. A secession strips the port from its parent; if that leaves the parent portless, its rate freezes, as today.

**Hash impact.** The patch with no route set gives the flag-off hashes exactly (control row below). A, B and C read only existing state and add no field, so the world is identical until the first route-only declaration: the 72-tick fixture stays `6efa334f/8496`, `e8f9cfab/8566`, `8ac8529b/8486` with the recommended set on (checked; first route firing is t185). The 1,200-tick pins move with any route on. D, and B restricted to `better-motive`, need new stored state and would move the fixture (first better-motive breach is t165 / t53 / t66, before 72 on 2718 and 4096). The build should write the routes onto `secession-declared.data.routes` (event only; the reducer ignores it).

## 3. Measurements

Each route alone is "tax or route". "By route" lists the routes true at each declaration. Baseline flag-off: secessions 4 / 0 / 4, port changes 37 / 24 / 44, desertions 4 / 0 / 5 (`dynamism-readout.md`).

| Run | Seed | Secessions (Δ vs off) | By route | WG / FT | Port changes (Δ) | Desertions (Δ) | First tick per route | First divergent tick | End hash |
| --- | ---: | --- | --- | --- | --- | --- | --- | ---: | --- |
| Control: tax only (patch present, no route on) | 1847 | 4 (+0) | tax 4 | 0 / 4 | 37 (+0) | 4 (+0) | tax 768 | — | `f80c529f/165833` |
|  | 2718 | 0 (+0) | — | 0 / 0 | 24 (+0) | 0 (+0) | — | — | `2b5060c0/157639` |
|  | 4096 | 4 (+0) | tax 4 | 0 / 4 | 44 (+0) | 5 (+0) | tax 409 | — | `e8ae4443/162123` |
| Unpaid governor, streak ≥ 12 | 1847 | 4 (+0) | unpaid 4 | 0 / 4 | 35 (-2) | 3 (-1) | unpaid 455 | 455 | `b04a4df5/162541` |
|  | 2718 | 0 (+0) | — | 0 / 0 | 24 (+0) | 0 (+0) | — | — | `2b5060c0/157639` |
|  | 4096 | 2 (-2) | tax 1, unpaid 1 | 0 / 2 | 33 (-11) | 5 (+0) | unpaid 200, tax 1123 | 200 | `1dc0184e/164304` |
| Broken promises, ≥ 10 breached contracts to the port in 240 ticks | 1847 | 4 (+0) | promise 3, tax 1 | 1 / 3 | 48 (+11) | 5 (+1) | promise 455, tax 891 | 455 | `47808e67/162964` |
|  | 2718 | 0 (+0) | — | 0 / 0 | 24 (+0) | 0 (+0) | — | — | `2b5060c0/157639` |
|  | 4096 | 4 (+0) | promise 3, tax 1 | 3 / 1 | 47 (+3) | 6 (+1) | promise 185, tax 1142 | 185 | `251a94ad/163200` |
| Broken promises, ≥ 8 | 1847 | 3 (-1) | promise 3 | 3 / 0 | 47 (+10) | 4 (+0) | promise 325 | 325 | `3acb61ff/163283` |
|  | 2718 | 2 (+2) | promise 2 | 2 / 0 | 29 (+5) | 0 (+0) | promise 1135 | 1135 | `29fc3720/157765` |
|  | 4096 | 5 (+1) | promise 4, tax 1 | 4 / 1 | 45 (+1) | 7 (+2) | promise 185, tax 785 | 185 | `72015dfe/162477` |
| Hated commander, grievance ≥ 0.12 | 1847 | 4 (+0) | hated 2, tax 2 | 1 / 3 | 44 (+7) | 3 (-1) | hated 324, tax 807 | 324 | `fc3668f8/164829` |
|  | 2718 | 1 (+1) | hated 1 | 1 / 0 | 26 (+2) | 3 (+3) | hated 192 | 192 | `a828316d/159042` |
|  | 4096 | 3 (-1) | hated 3 | 2 / 1 | 46 (+2) | 10 (+5) | hated 185 | 185 | `24b05a6b/163493` |
| Hated commander, ≥ 0.10 | 1847 | 7 (+3) | hated 4, tax 2, tax+hated 1 | 2 / 5 | 52 (+15) | 4 (+0) | hated 317, tax 807 | 317 | `37de86d4/164054` |
|  | 2718 | 5 (+5) | hated 5 | 2 / 3 | 40 (+16) | 1 (+1) | hated 192 | 192 | `dd6cae3a/160329` |
|  | 4096 | 2 (-2) | hated 2 | 2 / 0 | 32 (-12) | 8 (+3) | hated 49 | 49 | `e060a22a/162117` |
| Hated commander, ≥ 0.14 | 1847 | 4 (+0) | hated 1, tax 2, tax+hated 1 | 1 / 3 | 36 (-1) | 4 (+0) | hated 324, tax 805 | 324 | `62bbcf5f/167620` |
|  | 2718 | 1 (+1) | hated 1 | 1 / 0 | 26 (+2) | 3 (+3) | hated 192 | 192 | `a828316d/159042` |
|  | 4096 | 5 (+1) | hated 1, tax 4 | 1 / 4 | 49 (+5) | 6 (+1) | tax 409, hated 497 | 497 | `16ad567b/163530` |
| Lost trade, sale tax < 0.6 × prior | 1847 | 6 (+2) | tax 2, trade 4 | 3 / 3 | 43 (+6) | 5 (+1) | trade 478, tax 808 | 478 | `0ba53b1d/163979` |
|  | 2718 | 0 (+0) | — | 0 / 0 | 24 (+0) | 0 (+0) | — | — | `2b5060c0/157639` |
|  | 4096 | 8 (+4) | tax 4, trade 4 | 4 / 4 | 57 (+13) | 11 (+6) | tax 409, trade 497 | 497 | `53199ea3/166067` |
| Lost trade, < 0.5 × prior | 1847 | 4 (+0) | tax 4 | 0 / 4 | 37 (+0) | 4 (+0) | tax 768 | — | `f80c529f/165833` |
|  | 2718 | 0 (+0) | — | 0 / 0 | 24 (+0) | 0 (+0) | — | — | `2b5060c0/157639` |
|  | 4096 | 8 (+4) | tax 4, trade 4 | 4 / 4 | 56 (+12) | 11 (+6) | tax 409, trade 497 | 497 | `1c6ab631/165835` |
| **Recommended set: promises ≥ 10 + hated ≥ 0.12** | 1847 | 4 (+0) | hated 1, promise 1, tax 1, tax+hated 1 | 2 / 2 | 43 (+6) | 5 (+1) | hated 324, promise 439, tax 805 | 324 | `71d95ec7/164573` |
|  | 2718 | 1 (+1) | hated 1 | 1 / 0 | 26 (+2) | 3 (+3) | hated 192 | 192 | `a828316d/159042` |
|  | 4096 | 4 (+0) | hated 1, promise 1, promise+hated 1, tax 1 | 3 / 1 | 47 (+3) | 9 (+4) | promise 185, hated 185, tax 1095 | 185 | `d1b586e2/162144` |
| Promises ≥ 8 + hated ≥ 0.12 | 1847 | 3 (-1) | hated 1, promise 2 | 3 / 0 | 41 (+4) | 4 (+0) | hated 324, promise 325 | 324 | `87c177a0/165748` |
|  | 2718 | 1 (+1) | hated 1 | 1 / 0 | 26 (+2) | 3 (+3) | hated 192 | 192 | `a828316d/159042` |
|  | 4096 | 7 (+3) | hated 2, promise 3, promise+hated 1, tax 1 | 6 / 1 | 54 (+10) | 10 (+5) | promise 185, hated 185, tax 1148 | 185 | `d3aa9e08/162665` |
| Unpaid + promises (better-motive ≥ 8) + hated | 1847 | 7 (+3) | hated 1, promise 1, tax 1, tax+unpaid 1, tax+unpaid+hated 1, unpaid+hated 2 | 2 / 5 | 51 (+14) | 3 (-1) | hated 324, promise 390, unpaid 534, tax 807 | 324 | `fc7a7393/164185` |
|  | 2718 | 2 (+2) | hated 1, unpaid 1 | 1 / 1 | 21 (-3) | 1 (+1) | hated 192, unpaid 576 | 192 | `722c021f/158290` |
|  | 4096 | 6 (+2) | hated 1, promise 2, promise+hated 1, unpaid 2 | 4 / 2 | 43 (-1) | 11 (+6) | promise 185, hated 185, unpaid 277 | 185 | `ccfdf111/164554` |
| Promises (better-motive ≥ 8) + hated + trade 0.5 | 1847 | 6 (+2) | hated 3, hated+trade 1, promise 1, trade 1 | 2 / 4 | 50 (+13) | 5 (+1) | hated 324, promise 390, trade 541 | 324 | `d17ff703/165327` |
|  | 2718 | 4 (+4) | hated 1, trade 3 | 1 / 3 | 27 (+3) | 1 (+1) | hated 192, trade 249 | 192 | `65d0eafb/159145` |
|  | 4096 | 6 (+2) | hated 1, promise 1, promise+hated 1, trade 3 | 5 / 1 | 55 (+11) | 9 (+4) | promise 185, hated 185, trade 446 | 185 | `35cd7b24/164036` |
| All four (better-motive ≥ 8, trade 0.6) | 1847 | 7 (+3) | hated 2, promise 1, trade 1, unpaid 1, unpaid+hated 1, unpaid+hated+trade 1 | 2 / 5 | 51 (+14) | 5 (+1) | hated 324, promise 390, unpaid 534, trade 541 | 324 | `0fd08b63/165347` |
|  | 2718 | 6 (+6) | hated 1, trade 2, unpaid 2, unpaid+trade 1 | 2 / 4 | 29 (+5) | 1 (+1) | hated 192, trade 249, unpaid 467 | 192 | `7819995d/161536` |
|  | 4096 | 8 (+4) | hated 1, promise 1, promise+hated 1, promise+trade 1, trade 2, unpaid 2 | 6 / 2 | 52 (+8) | 9 (+4) | promise 185, hated 185, unpaid 277, trade 305 | 185 | `d9ac779c/163670` |
| Promises, better-motive only ≥ 8 (needs new state) | 1847 | 4 (+0) | promise 4 | 2 / 2 | 47 (+10) | 5 (+1) | promise 455 | 455 | `f0311d0a/163269` |
|  | 2718 | 2 (+2) | promise 2 | 2 / 0 | 29 (+5) | 0 (+0) | promise 1135 | 1135 | `29fc3720/157765` |
|  | 4096 | 4 (+0) | promise 3, tax 1 | 3 / 1 | 47 (+3) | 6 (+1) | promise 185, tax 1142 | 185 | `251a94ad/163200` |
| Promises, better-motive only ≥ 6 | 1847 | 4 (+0) | promise 4 | 3 / 1 | 47 (+10) | 6 (+2) | promise 315 | 315 | `30d4b83a/166215` |
|  | 2718 | 3 (+3) | promise 3 | 2 / 1 | 30 (+6) | 0 (+0) | promise 1109 | 1109 | `f66887c0/157974` |
|  | 4096 | 4 (+0) | promise 3, tax 1 | 3 / 1 | 47 (+3) | 6 (+1) | promise 185, tax 1142 | 185 | `251a94ad/163200` |
| Promises, better-motive only ≥ 10 | 1847 | 4 (+0) | promise 3, tax 1 | 1 / 3 | 48 (+11) | 5 (+1) | promise 455, tax 891 | 455 | `47808e67/162964` |
|  | 2718 | 0 (+0) | — | 0 / 0 | 24 (+0) | 0 (+0) | — | — | `2b5060c0/157639` |
|  | 4096 | 2 (-2) | promise 2 | 2 / 0 | 41 (-3) | 7 (+2) | promise 213 | 213 | `e9fbbd1e/162867` |

**Reading.**
- A (unpaid) never fires on 2718 (no governor reaches the streak under the gate) and *cuts* 4096 to 2 by diverting the timeline. Solvency again; not recommended alone.
- B (promises, any cause, ≥ 10) is the first non-tax route on 1847 and 4096; at ≥ 8 it adds 2718 too but lifts 4096 to 5. The better-motive-only variant behaves similarly but needs new state.
- C (hated, ≥ 0.12) is the only route that fires on all three seeds alone (4 / 1 / 3); 0.10 runs away on 2718 (5) and 1847 (7), 0.14 is mostly tax again on 4096.
- D (trade) is nothing on 2718, doubles 4096 to 8 with 11 desertions, and needs new state. Not recommended.
- Mixed sets with A or D reach 6–8 secessions on 4096; that is the runaway edge.

## 4. Recommendation

**Default set: B (≥ 10 breached contracts to the port in 240 ticks, any cause) + C (governor grievance ≥ 0.12 at the holder or acting commander), keeping the tax line.**

| Seed | Secessions (off → set) | Non-tax declarations | Port changes | Desertions | First route tick |
| ---: | --- | --- | --- | --- | --- |
| 1847 | 4 → 4 | 2 (hated t324 Crown Harbor, promise t439 Glassport; a third at t805 is tax + hated) | 37 → 43 | 4 → 5 | 324 |
| 2718 | 0 → 1 | 1 (hated t192 Glassport) | 24 → 26 | 0 → 3 | 192 |
| 4096 | 4 → 4 | 3 (promise + hated t185, promise t189 Crown Harbor; hated t232 Glassport) | 44 → 47 | 5 → 9 | 185 |

Every seed has a secession that is not tax-triggered; none exceeds baseline + 1; both routes use existing state only, so the fixture holds and flag off is byte-identical. World Government now loses ports too (2 / 1 / 3), which is the "dominant faction need not stay dominant by default, but is not reset either" reading of `game-vision.md:37–39`: it falls only after lost battles or a run of broken supply. Three seeds support no causal claims about later treasuries or secession timing; any rule change moves the timeline (first divergent tick 324 / 192 / 185).

**Not default:** A (solvency again, misses 2718); D (new state, runaway on 4096, nothing on 2718). Both stay as measured options.

**Build notes.** One predicate `secessionRoutes(world, settlement, governor)` returning the true routes in fixed order `tax, promise, hated`, used by the walker (`engine.ts:3510`) and the readout (`secession.ts:429`); constants `PROMISE_BREACH_COUNT = 10`, `PROMISE_WINDOW_TICKS = 240`, `HATED_GRIEVANCE = 0.12`; `data.routes` on the event; no draw. Tests: each route alone on a fixture world; once per spell; holder and breakaway exempt; flag-off fixture and pins; a recorded set run replays to its hash through `applyEvent`.

**Gate.** Fixture `6efa334f` / `e8f9cfab` / `8ac8529b` unchanged; 1,200-tick pins re-recorded as `71d95ec7/164573`, `a828316d/159042`, `d1b586e2/162144`; `npm run dynamism` against flag-off shows ≥ 1 non-tax secession per seed and secessions ≤ baseline + 1 per seed; `npm test` passes.

## 5. Ten more seeds (after #148)

Offline, at `origin/main` `0bc5c76` (#148 is docs only, so the sim is the same as §3). The harness is the same one (`/workspace/secession-routes-harness/`), with `routes-harness.patch` applied in a scratch worktree. `run2.ts` adds port counts and zero-port ticks, `seeds.sh` runs each seed, and `seeds-tab.py` builds the tables. Each seed ran 1,200 ticks twice: flag off, then B + C at the §4 defaults (promises ≥ 10 breached contracts to the port in 240 ticks, any cause; governor grievance ≥ 0.12). Readouts are `npm run dynamism -- --events <B+C> --baseline <off> --json`.

**Seeds.** 1000 × k for k = 1…10, so 1000, 2000, … 10000. This is a fixed rule, not a search. Results for the original three seeds are shown again for the 13-seed summary; their hashes match §3 (`71d95ec7`, `a828316d`, `d1b586e2`).

**Runaway was defined before the runs** and is coded in `seeds-tab.py`. A seed is a runaway if either:
- (a) B + C secessions > flag-off secessions + 2; or
- (b) World Government or Free Tide holds **no port at tick 1200** under B + C while it held at least one at tick 1200 with the flag off.

"Zero-port ticks" counts ticks on which the faction held no port. It is reported for context and is not part of the rule.

| Seed | Secessions off → B+C | Non-tax (route: port, tick) | WG / FT (B+C) | Port changes off → B+C | Desertions off → B+C | First route tick | Ports at 1200 off → B+C (WG, FT) | Zero-port ticks B+C (WG, FT) | Runaway | Hash off / B+C |
| ---: | --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- |
| 1847 | 4 → 4 | 2: hated: crown-harbor t324; promise: glassport t439 | 2 / 2 | 37 → 43 | 4 → 5 | 324 | (1, 0) → (0, 0) | 769, 656 | lost every port: WG | `f80c529f` / `71d95ec7` |
| 2718 | 0 → 1 | 1: hated: glassport t192 | 1 / 0 | 24 → 26 | 0 → 3 | 192 | (2, 1) → (2, 1) | 9, 190 | no | `2b5060c0` / `a828316d` |
| 4096 | 4 → 4 | 3: promise+hated: crown-harbor t185; promise: crown-harbor t189; hated: glassport t232 | 3 / 1 | 44 → 47 | 5 → 9 | 185 | (2, 0) → (1, 0) | 256, 480 | no | `e8ae4443` / `d1b586e2` |
| 1000 | 4 → 1 | 1: hated: cinder-key t29 | 0 / 1 | 34 → 28 | 4 → 4 | 29 | (1, 0) → (2, 1) | 5, 393 | no | `41999e3f` / `48c20c12` |
| 2000 | 3 → 3 | 3: hated: glassport t37; promise: glassport t135; hated: cinder-key t219 | 0 / 3 | 40 → 23 | 3 → 2 | 37 | (2, 0) → (2, 1) | 0, 1088 | no | `57a04899` / `9529a670` |
| 3000 | 3 → 5 | 3: hated: cinder-key t30; hated: cinder-key t34; hated: crown-harbor t618 | 1 / 4 | 45 → 43 | 3 → 4 | 30 | (2, 0) → (0, 0) | 91, 628 | lost every port: WG | `245041c6` / `a3d6ed37` |
| 4000 | 3 → 5 | 1: hated: cinder-key t469 | 1 / 4 | 28 → 33 | 3 → 4 | 469 | (1, 0) → (1, 0) | 82, 770 | no | `c0861f7d` / `e4613321` |
| 5000 | 2 → 5 | 5: hated: cinder-key t39; hated: cinder-key t240; promise: crown-harbor t320; promise: crown-harbor t332; promise: crown-harbor t387 | 4 / 1 | 33 → 54 | 6 → 6 | 39 | (1, 0) → (0, 1) | 293, 521 | secessions > off+2; lost every port: WG | `7b3744b1` / `466e338a` |
| 6000 | 4 → 3 | 3: hated: cinder-key t114; promise: crown-harbor t277; promise: crown-harbor t278 | 1 / 2 | 39 → 45 | 5 → 4 | 114 | (1, 0) → (1, 0) | 52, 874 | no | `865f6820` / `863ebc79` |
| 7000 | 0 → 8 | 4: hated: cinder-key t135; hated: crown-harbor t141; hated: glassport t169; hated: cinder-key t250 | 1 / 7 | 34 → 49 | 3 → 5 | 135 | (2, 1) → (1, 0) | 291, 560 | secessions > off+2; lost every port: FT | `b9510dcc` / `976e8c61` |
| 8000 | 3 → 3 | 3: hated: glassport t62; hated: glassport t86; hated: cinder-key t480 | 1 / 2 | 47 → 37 | 2 → 4 | 62 | (1, 0) → (1, 0) | 20, 613 | no | `a1f5148e` / `6f0726d1` |
| 9000 | 0 → 4 | 4: hated: cinder-key t110; hated: glassport t154; hated: glassport t783; hated: cinder-key t1031 | 3 / 1 | 28 → 48 | 3 → 5 | 110 | (0, 3) → (1, 0) | 99, 670 | secessions > off+2; lost every port: FT | `0a38f570` / `8652061c` |
| 10000 | 3 → 4 | 4: promise: glassport t307; promise+hated: glassport t308; promise: glassport t439; hated: cinder-key t717 | 1 / 3 | 21 → 33 | 5 → 6 | 307 | (1, 0) → (2, 0) | 19, 491 | no | `4ae1d1d6` / `ede501b9` |

| Metric (13 seeds) | Min | Median | Max |
| --- | ---: | ---: | ---: |
| Secessions, flag off | 0 | 3 | 4 |
| Secessions, B + C | 1 | 4 | 8 |
| Non-tax secessions | 1 | 3 | 5 |
| World Government secessions (B + C) | 0 | 1 | 4 |
| Free Tide secessions (B + C) | 0 | 2 | 7 |
| Port changes, flag off | 21 | 34 | 47 |
| Port changes, B + C | 23 | 43 | 54 |
| Desertions, flag off | 0 | 3 | 6 |
| Desertions, B + C | 2 | 4 | 9 |
| First route tick (seeds where one fired) | 29 | 114 | 469 |

Seeds with ≥ 1 non-tax secession: **13 of 13**. Seeds with a secession at all: flag off 10, B + C 13. Runaway seeds: **5**.

**Reading.**
- **Coverage.** Every one of the 13 seeds has at least one non-tax secession. With the flag off, 3 of the 13 seeds have none at all (2718, 7000, 9000).
- **The hated-commander route does most of the work.** It is one of the routes in 27 of the 37 non-tax declarations; the promises route alone accounts for the other 10. On 1000, 2000, 3000 and 8000 the first route declaration comes early (t29–t62). Why those seeds fire so early was not investigated.
- **Runaway seeds: 5 of 13.**
  - Rule (a), too many secessions: 5000 (2 → 5), 7000 (0 → 8) and 9000 (0 → 4). On 7000 only 4 of the 8 are non-tax; the others are tax declarations made after the timeline moved.
  - Rule (b), a faction losing every port: World Government on 1847, 3000 and 5000; Free Tide on 7000 and 9000.
- **Losing every port is common with the flag off as well.** With the flag off, Free Tide ends at 0 ports on 10 of 13 seeds and World Government on 1 (9000). Rule (b) counts only the cases B + C newly causes.
- **No conclusions about cause.** Each rule change moves the whole timeline, so these are distributions, not causal claims.

**What this means for the defaults** (for the Lead). B + C reaches the coverage goal on every seed, but trips the predeclared runaway rule on 5 of 13 seeds. Three of those are World Government being stripped to 0 ports, which the Lead accepted in principle (#148). Two are Free Tide's count rising by 3–8. If that is too much:
- The measured lever is C's threshold. §3 has 0.14 cutting non-tax declarations on 4096 to 1.
- A once-per-faction cooldown on route declarations is an option, but it is **not measured here**.

### 5.1 Why some route secessions fire early (t29–t62)

The trace script is `trace-early.ts` in the harness. It reads the first non-tax declaration on each of the four seeds:

| Seed | Tick | Port | Governor | Route | Grievance at the holder (`character-14`) at t0 → at the declaration | Relationship changes in between |
| ---: | ---: | --- | --- | --- | --- | ---: |
| 1000 | 29 | Cinder Key | character-15 | hated | 0.152 → 0.146 | 1 |
| 2000 | 37 | Glassport | character-22 | hated | 0.145 → 0.139 | 1 |
| 3000 | 30 | Cinder Key | character-19 | hated | 0.122 → 0.122 | 0 |
| 8000 | 62 | Glassport | character-16 | hated | 0.106 → 0.170 | 3 |

**Cause: grievance carried over from setup.** On 1000, 2000 and 3000 it is a setup artifact.
- Each Free Tide member's relationship to the issuer of their standing order (Pax, `character-14`) is created at setup by `relationshipTo` (`src/sim/scenario.ts:372–379`). Its grievance is drawn uniformly from `rng.between(0, 0.16)` (`scenario.ts:205`). The loyalty bias moves only trust and respect (`:201`, `:203`).
- So about (0.16 − 0.12) / 0.16 = 25% of these starting relationships are already over C's 0.12 line before anything happens.
- On 1000 and 2000 the grievance only *fell* before the declaration (the −0.003 / −0.006 decays at `engine.ts:1705` and `:2932`). On 3000 it never changed. Those governors were "hated" from tick 0.
- The early ticks themselves are the stability gate opening. The governor's news figure reaches 55 or below early on these seeds (41.72 and 38.75 at the declaration on 1000 and 3000).
- **8000 is earned, not an artifact.** Grievance rose from 0.106 to 0.170 through three changes. That matches lost battles under Pax's order at +0.035 each (`engine.ts:1094`).
- No contract or initial governor seat is involved. All four are the hated route, with no promise or tax term true.

**The early-fire fix that was tested:** C ≥ 0.17. The seeded maximum is 0.16 (exclusive), so any grievance at 0.17 must have been earned. The other option, storing each relationship's seeded grievance and testing the rise above it, adds state and was not measured.

### 5.2 Target, and a correction

The Lead's target was written down here before the sweep:
- at least one non-tax secession on **10 or more** of 13 seeds;
- a wipeout of World Government or Free Tide **newly caused by the routes** on **at most 1** of 13 seeds;
- median B + C secessions **≤ flag-off median + 1**. The flag-off median is 3 (per seed: 1847 4, 2718 0, 4096 4, 1000 4, 2000 3, 3000 3, 4000 3, 5000 2, 6000 4, 7000 0, 8000 3, 9000 0, 10000 3), so the limit is 4.

**Correction, made after the first pass of the sweep.** "Newly caused by the routes" was first scored with §5's end-state proxy: the faction holds no port at tick 1200 under B + C but held one with the flag off. That proxy counts wipeouts the routes did not cause.
- On 7000 and 9000, under the last-port exemption below, Free Tide's last port goes to a **tax** secession at t1179 (7000) and to a **surrender claim** (9000). No route was involved.
- Flag off already ends Free Tide with no port on 10 of 13 seeds, so the end state mostly reflects a different timeline.
- The table therefore reports both readings:
  - **end-state:** §5's rule, unchanged;
  - **route-caused:** a non-tax declaration took a port that was its faction's last one (`heldBefore ≤ 1` at the declaration). This counts every time a route took a last port, including when the faction later won a port back.

The last-port exemption and the grace-60 variants were added after the first pass, because the first pass met neither reading.

### 5.3 Sweep: 13 seeds, 1,200 ticks, offline

The engine patch is `routes-harness-v2.patch`, applied in a scratch worktree at `0bc5c76`. It adds three options, each applying only to declarations where the tax term is false:
- **cooldown:** no route declaration within 240 ticks of the last one by the same faction;
- **grace:** no route declaration within N ticks of the port's last `settlement-claimed` or `secession-declared` (tick 0 counts as the start);
- **last-port exemption:** no route declaration on a port that is its faction's only held port.

Promises stay at ≥ 10 breached contracts in 240 ticks (any cause). Runs use `sweep3.sh` and `run3.ts`, and the tables come from `sweep3-tab.py`. Readouts are `npm run dynamism -- --events <variant> --baseline <flag off> --json`. The accepted B + C row reproduces §5's hashes (for example 1847 `71d95ec7`, 1000 `48c20c12`, 7000 `976e8c61`).

| Variant | Secessions min / median / max | Non-tax min / median / max | Seeds with ≥ 1 non-tax | End-state wipeouts vs flag off (seeds) | Route took a faction's last port (seeds) | Seeds > off + 2 | Port changes median | Desertions median | First route tick min / median | Target, end-state reading | Target, route-caused reading |
| --- | --- | --- | ---: | --- | --- | --- | ---: | ---: | --- | --- | --- |
| B + C as accepted (C ≥ 0.12) | 1 / 4 / 8 | 1 / 3 / 5 | 13 of 13 | 5: 1847 WG, 3000 WG, 5000 WG, 7000 FT, 9000 FT | 9: 1847 WG, 1000 FT, 2000 FT, 3000 FT, 5000 WG, 7000 WG, 8000 FT, 9000 FT+WG, 10000 FT | 3: 5000, 7000, 9000 | 43 | 4 | 29 / 114 | no | no |
| C ≥ 0.14 | 1 / 4 / 7 | 1 / 3 / 5 | 13 of 13 | 5: 1847 WG, 2000 WG, 5000 WG, 7000 FT, 9000 FT | 6: 1847 WG, 1000 FT, 2000 WG, 5000 WG, 7000 FT, 9000 WG | 4: 2000, 5000, 7000, 9000 | 39 | 4 | 29 / 185 | no | no |
| C ≥ 0.17 (early-fire fix: above the 0.16 seed ceiling) | 0 / 3 / 6 | 0 / 3 / 4 | 11 of 13 | 4: 1847 WG, 2000 WG, 7000 FT, 9000 FT | 6: 1847 FT, 4096 WG, 2000 FT, 3000 WG, 5000 WG, 9000 WG | 2: 7000, 9000 | 41 | 4 | 62 / 213 | no | no |
| Cooldown 240 per faction | 1 / 3 / 5 | 1 / 2 / 4 | 13 of 13 | 3: 3000 WG, 7000 FT, 9000 FT | 7: 1847 FT, 4096 FT, 1000 FT, 3000 FT, 5000 WG, 6000 FT, 9000 FT+WG | 2: 7000, 9000 | 40 | 4 | 29 / 114 | no | no |
| Grace 120 after ownership begins | 1 / 2 / 5 | 0 / 1 / 2 | 10 of 13 | 2: 2718 FT, 9000 FT | 2: 7000 FT, 10000 FT | 1: 2718 | 34 | 4 | 185 / 377.0 | no | no |
| C 0.14 + cooldown | 1 / 3 / 6 | 1 / 2 / 4 | 13 of 13 | 2: 7000 FT, 9000 FT | 5: 4096 FT, 1000 FT, 2000 WG, 5000 WG, 6000 FT | 3: 2000, 7000, 9000 | 36 | 4 | 29 / 185 | no | no |
| C 0.14 + grace | 0 / 2 / 5 | 0 / 1 / 2 | 8 of 13 | 1: 2718 FT | 2: 7000 FT, 10000 FT | 1: 2718 | 34 | 3 | 185 / 344.0 | no | no |
| Cooldown + grace | 1 / 2 / 5 | 0 / 1 / 2 | 10 of 13 | 2: 2718 FT, 9000 FT | 2: 7000 FT, 10000 FT | 1: 2718 | 34 | 4 | 185 / 377.0 | no | no |
| C 0.14 + cooldown + grace | 0 / 2 / 5 | 0 / 1 / 2 | 8 of 13 | 1: 2718 FT | 2: 7000 FT, 10000 FT | 1: 2718 | 34 | 3 | 185 / 344.0 | no | no |
| C 0.17 + cooldown | 0 / 3 / 6 | 0 / 2 / 3 | 11 of 13 | 3: 1847 WG, 7000 FT, 9000 FT | 4: 4096 FT, 3000 WG, 5000 WG, 6000 FT | 3: 3000, 7000, 9000 | 38 | 5 | 62 / 213 | no | no |
| C 0.17 + grace | 0 / 2 / 5 | 0 / 0 / 2 | 6 of 13 | 0 | 0 | 0 | 34 | 3 | 185 / 294.0 | no | no |
| C 0.17 + cooldown + grace | 0 / 2 / 5 | 0 / 0 / 2 | 6 of 13 | 0 | 0 | 0 | 34 | 3 | 185 / 294.0 | no | no |
| Grace 60 | 1 / 3 / 6 | 0 / 2 / 3 | 12 of 13 | 6: 1847 WG, 2718 FT, 2000 WG, 4000 WG, 7000 FT, 9000 FT | 3: 2000 WG, 8000 WG, 10000 FT | 3: 2718, 7000, 9000 | 36 | 4 | 185 / 368.5 | no | no |
| Cooldown + grace 60 | 1 / 2 / 6 | 0 / 2 / 2 | 12 of 13 | 5: 1847 WG, 2718 FT, 2000 WG, 4000 WG, 7000 FT | 3: 2000 WG, 8000 WG, 10000 FT | 2: 2718, 7000 | 36 | 4 | 185 / 368.5 | no | no |
| Last-port exemption | 1 / 4 / 8 | 1 / 3 / 5 | 13 of 13 | 2: 7000 FT, 9000 FT | 0 | 2: 7000, 9000 | 42 | 4 | 34 / 135 | no | **yes** |
| Last-port exemption + cooldown | 1 / 3 / 5 | 1 / 2 / 3 | 13 of 13 | 3: 6000 WG, 7000 FT, 9000 FT | 0 | 2: 7000, 9000 | 40 | 4 | 34 / 135 | no | **yes** |
| Last-port exemption + grace 60 | 1 / 3 / 6 | 0 / 2 / 3 | 12 of 13 | 5: 1847 WG, 2718 FT, 4000 WG, 7000 FT, 9000 FT | 0 | 3: 2718, 7000, 9000 | 36 | 4 | 185 / 368.5 | no | **yes** |
| Last-port exemption + C 0.14 | 1 / 3 / 7 | 1 / 2 / 3 | 13 of 13 | 2: 7000 WG+FT, 9000 FT | 0 | 2: 7000, 9000 | 36 | 4 | 34 / 185 | no | **yes** |

Per-seed secessions (non-tax in brackets):

| Variant | 1847 | 2718 | 4096 | 1000 | 2000 | 3000 | 4000 | 5000 | 6000 | 7000 | 8000 | 9000 | 10000 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Flag off | 4 | 0 | 4 | 4 | 3 | 3 | 3 | 2 | 4 | 0 | 3 | 0 | 3 |
| B + C as accepted (C ≥ 0.12) | 4 (2) | 1 (1) | 4 (3) | 1 (1) | 3 (3) | 5 (3) | 5 (1) | 5 (5) | 3 (3) | 8 (4) | 3 (3) | 4 (4) | 4 (4) |
| C ≥ 0.14 | 4 (2) | 1 (1) | 4 (3) | 1 (1) | 6 (4) | 2 (2) | 5 (1) | 5 (5) | 3 (3) | 7 (3) | 1 (1) | 6 (3) | 3 (3) |
| C ≥ 0.17 (early-fire fix: above the 0.16 seed ceiling) | 4 (3) | 0 (0) | 5 (4) | 1 (1) | 5 (3) | 5 (3) | 3 (0) | 3 (3) | 3 (3) | 4 (1) | 1 (1) | 6 (3) | 3 (3) |
| Cooldown 240 per faction | 4 (2) | 1 (1) | 3 (2) | 1 (1) | 1 (1) | 5 (3) | 5 (1) | 3 (3) | 3 (3) | 4 (2) | 1 (1) | 4 (4) | 3 (3) |
| Grace 120 after ownership begins | 5 (1) | 5 (1) | 2 (2) | 1 (1) | 3 (1) | 3 (0) | 3 (0) | 2 (0) | 2 (2) | 1 (1) | 2 (2) | 1 (1) | 2 (2) |
| C 0.14 + cooldown | 4 (1) | 1 (1) | 2 (2) | 1 (1) | 6 (4) | 2 (2) | 5 (1) | 3 (3) | 3 (3) | 4 (1) | 1 (1) | 5 (2) | 3 (3) |
| C 0.14 + grace | 5 (1) | 5 (1) | 3 (1) | 1 (1) | 3 (0) | 3 (0) | 3 (0) | 2 (0) | 2 (2) | 1 (1) | 2 (2) | 0 (0) | 2 (2) |
| Cooldown + grace | 5 (1) | 5 (1) | 2 (2) | 1 (1) | 3 (1) | 3 (0) | 3 (0) | 2 (0) | 2 (2) | 1 (1) | 2 (2) | 1 (1) | 2 (2) |
| C 0.14 + cooldown + grace | 5 (1) | 5 (1) | 3 (1) | 1 (1) | 3 (0) | 3 (0) | 3 (0) | 2 (0) | 2 (2) | 1 (1) | 2 (2) | 0 (0) | 2 (2) |
| C 0.17 + cooldown | 5 (2) | 0 (0) | 2 (2) | 1 (1) | 5 (2) | 6 (2) | 3 (0) | 2 (2) | 3 (3) | 4 (1) | 1 (1) | 5 (2) | 2 (2) |
| C 0.17 + grace | 5 (1) | 0 (0) | 3 (1) | 1 (1) | 3 (0) | 3 (0) | 3 (0) | 2 (0) | 2 (2) | 0 (0) | 2 (2) | 0 (0) | 1 (1) |
| C 0.17 + cooldown + grace | 5 (1) | 0 (0) | 3 (1) | 1 (1) | 3 (0) | 3 (0) | 3 (0) | 2 (0) | 2 (2) | 0 (0) | 2 (2) | 0 (0) | 1 (1) |
| Grace 60 | 6 (2) | 5 (1) | 2 (2) | 1 (1) | 4 (2) | 3 (0) | 5 (1) | 1 (1) | 2 (2) | 3 (2) | 2 (2) | 5 (3) | 2 (2) |
| Cooldown + grace 60 | 6 (2) | 5 (1) | 2 (2) | 1 (1) | 4 (2) | 3 (0) | 5 (1) | 1 (1) | 2 (2) | 4 (1) | 2 (2) | 2 (2) | 2 (2) |
| Last-port exemption | 4 (2) | 1 (1) | 4 (3) | 4 (3) | 1 (1) | 4 (3) | 5 (1) | 3 (2) | 3 (3) | 8 (4) | 5 (5) | 3 (3) | 3 (3) |
| Last-port exemption + cooldown | 4 (2) | 1 (1) | 3 (3) | 4 (3) | 1 (1) | 4 (3) | 5 (1) | 3 (2) | 5 (3) | 4 (2) | 1 (1) | 3 (3) | 3 (3) |
| Last-port exemption + grace 60 | 6 (2) | 5 (1) | 2 (2) | 1 (1) | 4 (2) | 3 (0) | 5 (1) | 1 (1) | 2 (2) | 3 (2) | 2 (2) | 5 (3) | 1 (1) |
| Last-port exemption + C 0.14 | 4 (1) | 1 (1) | 4 (3) | 2 (2) | 5 (3) | 2 (2) | 5 (1) | 3 (2) | 3 (3) | 7 (3) | 1 (1) | 5 (2) | 3 (3) |

**Reading.**
- **No variant meets the end-state reading.** Every variant that keeps at least 10 seeds with a non-tax secession still ends Free Tide or World Government with no port, compared with the flag off, on 2 or more seeds. The variants that get this down to 0 or 1 (C 0.17 + grace, C 0.14 + grace) cut the coverage to 6–8 seeds.
- **C 0.14, C 0.17, the cooldown and the grace periods do not stop routes taking a last port.** It still happens on 2–9 seeds. Grace 120 also leaves 3 seeds with no non-tax secession.
- **The last-port exemption is the only option that makes route-caused wipeouts 0 by construction.** On its own it keeps 13 of 13 seeds with a non-tax secession and a median of 4 secessions.
- **The exemption's two end-state wipeouts are not route-caused** (§5.2): on 7000 the last port went to a tax secession at t1179, and on 9000 to a surrender claim.
- **Seeds above flag off + 2 remain on 7000 and 9000** (8 and 3 secessions under the exemption). Both have 0 secessions with the flag off.

### 5.4 Recommendation

**Default: B + C as accepted, plus the last-port exemption.** A route (promise or hated) never declares on a port that is its faction's only held port. Under the route-caused reading this is the simplest variant that meets the target: 13 of 13 seeds have a non-tax secession, route-caused wipeouts are 0, and the median is 4 against a limit of 4.
- **Collapse stays possible but rare.** The tax route, raids and surrender claims can still take a last port. The routes alone cannot.
- **Hash:** it reads only existing state. On the fixture seeds the first route declaration is at t185 or later, so the fixture is unchanged.
- **The early fires stay.** The exemption does not remove the seeded-grievance early fires on 1000, 2000 and 3000 (first route tick median 135, min 34). Removing them would need C ≥ 0.17 (which costs coverage: 11 of 13, and on its own still leaves 6 route-caused wipeouts) or a stored seed grievance (not measured). This is the Lead's call.
- **If the Lead keeps the end-state reading, nothing measured meets the target.** The nearest variants are C 0.14 + grace (8 of 13 seeds covered, 1 wipeout) and grace 120 or cooldown + grace (10 of 13 covered, 2 wipeouts).
