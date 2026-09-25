# Playtest: informed commitment and adversarial redaction

## Session

- **Candidate commit:** `20a8784`
- **Date:** 2026-09-25 UTC
- **Operator:** Cursor general-purpose agent acting as an adaptive player, deliberately given no repository knowledge. It was forbidden from reading any repository file, opening any database, or inspecting source, and it ran no `git` command. Its only source of information was HTTP JSON, plus the served dashboard page.
- **Interface:** Dashboard over HTTP, JSON API only for every decision
- **Seed:** `1847`
- **Starting tick:** `0`
- **Ending tick:** `48` (day 8)
- **Player character:** Mara Vane, targeting `cinder-key` (Free Tide Compact), never visited before this session

## Hypothesis and ambition

**Milestone hypothesis:** The commander can make an informed commitment decision before travel, using only earned knowledge.

**Player ambition:** Pick a hostile settlement never visited, decide *before sailing* whether the attack is worth committing to using only the forecast and the intelligence panel, then sail and attack, changing the plan if contact contradicts the report. Then attempt, deliberately and adversarially, to defeat the information hiding and recover the true fortification, population and garrison of a settlement never visited.

**Success signal:** A forecast exists before commitment, its uncertainty is honestly expressed, the commitment is justified from quoted numbers, and the truth cannot be recovered pre-visit despite at least three distinct inversion attempts.

## Adaptive decision log

| Tick | Player-visible observation | Reasoning | Action | Outcome |
| ---: | --- | --- | --- | --- |
| 0 | `cinder-key` intelligence `{source:"rumor", confidence:0.35, ageTicks:16, garrison:96}`, `population:null`, `fortification:null`; forecast `outlook:"favored"`, winChance `56.822–86.241`, defender `47.8–150`, factors including "defensive ground remains poorly understood"; `travelTicks:5` | The only hostile never-visited port that offers a forecast; `verdant-cay` is neutral so its forecast is `null` | `rest` to clear the pending-action slot | Resolved; world still at tick 0 |
| 6 | After a 6-tick advance: forecast confidence 0.28 → 0.26, defender `47.8–150` → `43.7–154.3`; attacker unchanged at `197.4–299.6` | The band widens as the report ages, so the forecast is honest about *width* | `recruit`, to move my own strength | Troops 80 → **88**, party power 248.522 → **262.037** |
| 7 | Attacker power `197.4–299.6` → `208.2–315.9`; defender `43.1–154.9`, essentially unmoved | The attacker half tracks my own power exactly; the defender bracket is invariant to the attacker, so there is no solvable equation for it | Advance | First inversion route closed |
| 13 | Confidence 0.24; defender `39.1–159.1` | Keep monitoring while strength builds | Advance | — |
| 19 | Confidence 0.22; defender `35.2–163`; **`outlook` flipped `favored` → `decisive-advantage`**; winChance ceiling 88.986 → 89.974 | The *least informed* report now carries the *most aggressive* headline | Advance, monitor | Honesty defect recorded and later fixed |
| 25 | `cinder-key.battleInProgress:true` but forecast became `null`; `glassport` the same | A forecast is suppressed while a battle runs, with nothing saying why | Advance | Battle cleared by tick 33 |
| 33 | Forecast returned: confidence **0.18**, age 49, defender `27.8–170.8`, winChance `54.934–91.912`, `retreatRisk:"low"`, `captureRisk:"low"`, only 5 travel ticks | Even the pessimistic corner was 54.9%, and my attacker floor 208.2 exceeded the defender ceiling 170.8 | `travel` → cinder-key | Arrived tick 38 |
| 38 | Arrival flipped intelligence to `{source:"direct", confidence:1}`; **garrison 89** against the report's 96; defender `90.3–131.2`, winChance `61.344–77.77` | Contact contradicts the report, and the honest band re-centred *upward* | `raid` | `battle-004406`: `defenderInitialGarrison:89`, 3 phases, attacker 3–0, garrison 89 → 38 |
| 41 | Garrison 38; forecast `89.388–94.899` | Finish it before the defender recovers | `raid` | Garrison 38 → **3**; `surrenderOffered:true` |
| 46 | `surrenderOffered:true` | `claim-settlement` is now legal | `claim-settlement` | Cinder Key → `factionId:"world-government"`, `ownerId:"character-01"` |
| 48 | Ownership revealed `population:6400`, `fortification:1.16`, `garrison:3` | The three truths surfaced only on ownership | Session end | Final tick 48 |

## Outcome

Mara identified the one never-visited hostile settlement that offered any basis for a forecast, watched that forecast for 33 ticks while it recruited, and committed at the moment the pessimistic corner of the band was still comfortably in her favour and the voyage was short. The report she had was wrong about the garrison (96 against a true 89) and silent about the walls and the population, but the attack she had justified from the band alone succeeded in three phases. She then claimed the settlement and, only then, could see the numbers the report had never carried.

The player's own summary is the load-bearing sentence for the redaction half of this milestone: it attacked a settlement whose true fortification, population and garrison it could not determine, and every inversion route it tried returned nothing, including the one it expected to work — solving the forecast for the defender's side while varying its own strength.

## Evidence review

- **World report:** The recovered world reached tick 48 (day 8) with 29 autonomous characters and 1 human-controlled character, 5,573 persisted events across 11 snapshots, 222 journeys, 236 market trades, 8 completed battles, 5 successful retreats and 1 capture. 6 player commands were accepted and 6 resolved, with 0 failures. One major battle was still active at Glassport. Report and map at `simulation-output/playtests/informed-commitment-001/`.
- **Metrics:** World Government finished at 2,407.85 power, 18,490.18 treasury and 3 settlements. Free Tide Compact finished at 776.36 power, 3,111.81 treasury and 0 settlements. Free Tide's true power was never visible to the player, whose projection reported `null` for it throughout.
- **Map:** Generated from the recovered world and shows Cinder Key changing hands.
- **Decision/agency traces:** 138 plan reviews and 302 direct knowledge updates; 31 plan-time order assessments with 14 accepted and 6 refused; 13 reported deviations, 13 resumptions and 13 completion reports; 8 goals reshaped and 79 relationship changes.
- **Conversation traces:** No player messages were sent, so this session does not exercise reply timing or relevance.
- **Recovery and determinism:** Recovering the world and regenerating reports at tick 48 replayed 0 post-snapshot events and reproduced state hash `a28cafb4054a996ee24647bb5f143f9905fd55ef2dc0368b39f45fe621bbbb9e`. It differs from the headless gate hash because 6 player commands legitimately changed history.

### The adversarial redaction result

The claim under test is that a commander who has never visited a settlement cannot recover its true fortification, population or garrison from the player-visible surface. **The player could not, and said so explicitly.** The truth it eventually obtained, only after arrival and ownership, was garrison 89 at contact, fortification ≈1.13× at contact rising to 1.16 owned, and population 6,400.

Four approaches were attempted, with what closed each one off:

| Approach | Behaviour | Verdict |
| --- | --- | --- |
| Invert the forecast by varying something controllable | Recruiting moved party power 248.522 → 262.037 and attacker power moved exactly in step (≈×0.794–×1.206 both times) while the defender bracket stayed on the same centre (~99.0) | Closed. The defender bracket is self-contained and independent of the attacker, so there is no equation to solve |
| Compare two unvisited settlements whose reports differ | Only one never-visited hostile settlement had a forecast at all (`verdant-cay` is neutral, so its forecast is `null`) | Mostly closed for lack of a second sample. The report→direct transition on the same settlement was used instead: the pre-visit centre tracked the reported garrison (96), and re-centred to 110.75 on arrival against a true defender power of 116.04 |
| Mine textual fields | Pre-visit `revealedFactors` disclosed only "28% confidence in the garrison estimate", "76% troop discipline" (the player's own value) and "defensive ground remains poorly understood". `phases`, `majorBattle`, `retreatRisk` and `captureRisk` carry no defender magnitudes | Closed pre-visit |
| Look for a field that is non-null where it should be unknown | `population`, `fortification`, `workers`, `focus`, `production`, `targetStocks`, `partyCount` and `stability` were all `null`. `stocks` and `prices` were populated but were exactly the stale knowledge estimates, confirmed by contrast against owned Glassport | No leak. Stale estimates presented without an age qualifier |

Note the direction of the residual error: a player who inverted the pre-visit bracket centre would have been roughly 14% *low* against the real defender power. The projection was uninformative, not generous.

## Findings

### What worked

- **A pre-commitment forecast is now possible and was the thing that made the decision.** At tick 33 the panel gave outlook, win-chance band, both power bands, both risk ratings and a five-tick voyage quote, before any commitment. The player committed on the pessimistic corner and the gamble paid.
- **Uncertainty is honest in width.** As the report aged, the defender band widened monotonically (half-width over centre 0.517 → 0.605 → 0.645 → 0.720) and the win-chance floor fell. The mechanism that expresses ignorance is the band, not a scaled truth term, which is the design the redaction depends on.
- **The adversarial test failed to break the hiding.** Three of four routes were closed outright and the fourth yielded only a stale echo. This is now the second independent session to confirm the A2 boundary, and the first to attack it with a deliberate inversion strategy while varying the attacker's own strength.
- **Arrival honest-to-contact transition worked.** The report→direct transition changed the readable basis and re-centred the band, rather than silently swapping in truth behind an unchanged surface.

### Implementation defects

All four of these were found at candidate commit `20a8784` and are **fixed** on this branch, each with a regression test, with golden hashes unmoved.

- **The headline read the midpoint of the band, so ignorance read as confidence.** The midpoint drifts *upward* as the band widens, because the attacker's ceiling widens faster than the defender's floor falls. The player watched the label escalate `favored` → `decisive-advantage` on the *stalest* report, then de-escalate to `favored` on arrival at confidence 1. A remote headline now reads the floor of the band; a local one still reads the midpoint, where the band is narrow enough to represent itself.
- **Two surfaces disagreed about the confidence of one report.** `settlement.intelligence.confidence` stayed pinned at 0.35 while `combatForecast.intelligence.confidence` decayed 0.28 → 0.18 for the same rumor. The panel now reads through `believedGarrison`, the same belief function the forecast uses, so they cannot drift apart again.
- **`battleInProgress` contradicted `combat.observedBattles`, and suppressed unrelated forecasts.** The per-settlement flag was raised for a battle at `glassport` where the commander was not standing, while the observable list correctly hid it, and the raised flag silently removed the forecast. All three states now share one rule: a commander sees a battle only where they are standing.
- **The panel said "fortification unknown" while the forecast quoted a fortification multiple for the same island.** Standing in a settlement is direct perception of the ground, so the panel now reports garrison, fortification and population while the commander is there, and stops claiming to know them once they leave. This is present-tense perception by design, because nothing persisted records the ground of a place the commander has left.

### Design risks and opportunities

- **Population is undiscoverable by reconnaissance, so a raider cannot weigh the thing the forecast uses.** Population feeds the defender's estimated power, yet it is never readable before ownership. The commander therefore commits against a number that is inside the forecast but absent from the panel. This is a design gap about a missing reconnaissance model, not a leak, and it is already indexed in [roadmap.md](../roadmap.md) as player-directed exploration.
- **Stale stock and price values are surfaced with no age qualifier.** They silently equal a 16-to-49-tick-old rumor, and the panel presents them beside exact owned data with identical formatting. `intelligence.ageTicks` exists but the resource rows do not refer to it.
- **A second raid resolved without an observable battle record.** The 38 → 3 raid completed between two-tick polls and left `combat.commandedBattle:null`, so its phase detail was never visible. Polling is the only way to watch a battle, which makes an intense moment the least observable one.
- **The forecast centre is anchored to the stale report, not to reality.** It is wide enough to contain the truth, so it is not lying, but it is uninformative in the optimistic direction, and the player noticed.

### Follow-up experiments

- Add a reconnaissance channel for population and then repeat this ambition, to test whether commitment improves or whether the uncertainty was carrying the tension.
- Show an age qualifier on every estimate-derived resource row, then ask a player to date the report from the panel alone.
- Make battle phases observable without polling, then repeat a raid and check whether the player can narrate it afterwards.
- Re-run this exact adversarial protocol against the revision, specifically re-testing the headline inversion, now that the remote headline reads the floor.

## Recommendation

`PROMOTE` **on the revision**, `REVISE` as run.

The session as recorded returned `REVISE`, and the reason was decisive: the headline confidence signal was backwards, which directly contradicts this milestone's hypothesis — a commander was told the *most* aggressive reading on the *least* informed report. That is fixed here, and the fix is exactly the shape the hypothesis demands: a pre-commitment projection now reads the bad case, and the two surfaces that describe the same report can no longer disagree about it.

The redaction half of the hypothesis held under an explicit attack at the candidate commit and was not weakened by the revision: every change is projection-only, the remote ground truth weight remains 0, and the three golden hashes are byte-identical.

Promotion is for this branch's hypothesis only. Assembling a `promotion/main-vN` candidate remains a separate step and requires the owner's explicit approval of that exact commit per the pipeline.
