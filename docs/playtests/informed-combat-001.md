# Playtest: informed combat 001

## Session

- **Candidate commit:** `cb01402` (post-session fixes verified at `73a3d39`)
- **Date:** `2026-09-25 UTC`
- **Operator:** Codex, acting as the human commander
- **Interface:** Public dashboard HTTP and command API only
- **Seed:** `1847`
- **Starting tick:** `0`
- **Ending tick:** `32`
- **Player character:** Mara Vane

## Hypothesis and ambition

**Milestone hypothesis:** A compact strategy-scaled forecast and phased battle report let the player make an informed commitment and meaningful retreat decisions without direct tactical control.

**Player ambition:** Weaken Free Tide power by leading Mara's party against Cinder Key without accepting reckless losses.

**Success signal:** Forecast ranges support a rational commit-or-abort choice, accelerated time stops at every player decision, and the final losses broadly agree with the forecast.

## Adaptive decision log

| Tick | Player-visible observation | Reasoning | Action | Outcome |
| ---: | --- | --- | --- | --- |
| 0 | Mara had 80 troops, 248.5 party power, 72 strategy, full health, and 93 morale at Crown Harbor. Cinder intelligence was an old 35%-confidence rumor. | A local assessment was necessary before risking the party. | Sail to Cinder Key. | Mara arrived after five ticks with the party intact. |
| 5 | Local forecast: favored; 55–73% win chance; 7–13 attacker casualties; 47–83 defender casualties; low retreat and capture risk; three phases. | The forecast justified an attack, but another battle was already active at the settlement. | Attempt attack, then wait for the existing battle to resolve. | The server rejected the unavailable attack. The UI had still displayed the action and forecast, exposing an availability defect. |
| 29 | The active battle had cleared. The updated forecast retained the same favored outlook and low withdrawal risks. | Expected losses were acceptable for the political objective. | Commit attack. | The requested 24-tick advance stopped after one tick at phase 1. |
| 30 | Attacker advantage; Mara lost 3 troops while the garrison lost 18. Health 98, morale 97, 77 troops; retreat and capture risk remained low. | The first exchange improved Mara's position and did not approach the forecast's loss ceiling. | Continue. | Time again stopped after exactly one phase. |
| 31 | Second attacker advantage; another 3 attackers and 20 defenders lost. Health 96, morale 100, 74 troops; both risks still low. | With two phase wins and almost even remaining troop counts, retreat had no strategic justification. | Continue. | Phase 3 resolved the battle as an attacker victory. |
| 32 | Mara finished at 94 health, 100 morale, and 71 troops with one victory and no defeats. | The objective was achieved without exceeding the stated risk envelope. | End the session and review diagnostics. | Total losses were 9 attackers and 61 defenders. |

## Outcome

The forecast was materially useful. It encouraged a commit when Mara held a visible advantage, and its loss bands contained the final result: 9 actual attacker casualties against a 7.3–12.9 estimate, and 61 actual defender casualties against a 46.9–83.1 estimate. Both phase boundaries interrupted a requested 24-tick advance after one tick, making “continue” a deliberate choice rather than an automatic battle animation.

The military victory did not immediately transfer Cinder Key, but it contributed to a broader decline in Free Tide power while the surrounding simulation continued. The session also exposed two player-facing consistency defects, both fixed after play: arrival intelligence did not refresh until the next tick, and an existing battle did not suppress a second attack prompt.

## Evidence review

- **World report:** Mara won a three-phase battle at Cinder Key with 9 attacker and 61 defender losses. Four other completed battles and four autonomous retreats occurred during the 5.3-day run.
- **Metrics:** World Government power moved from 2347.21 at tick 0 to 2360.63 at tick 32; Free Tide fell from 1109.57 to 969.56. This is correlated world evidence, not solely Mara's contribution.
- **Map:** The final SVG preserved the four-island world, active routes, and party positions at day 5.3; combat did not corrupt spatial state.
- **Decision/agency traces:** Autonomous parties continued trading, traveling, following orders, and making independent attack/retreat decisions during Mara's journey and battle. Mara received no autonomous decision events.
- **Combat traces:** The trace retained the starting forecast, every phase result, risk labels, and final outcome. Autonomous examples also exercised underdog forecasts and high/severe retreat risk.
- **Conversation traces:** No messages were sent; conversation behavior was outside this milestone.
- **Recovery and determinism:** Reopening the playtest database replayed 248 post-snapshot events and recovered state hash `1eb7123b270269cf1fe6a6779306c1283ad2e354792caaab81609d26d4c0cd0c`. The final evaluation gate passed 43 tests, three 72-tick seeds, and an uninterrupted-versus-split recovery comparison at hash `fab2c60ca56bcc1804d3ffe3447708de9138617beb5424095d6596173de09169`.

## Findings

### What worked

- One summary covered likely outcome, losses, force balance, withdrawal, and capture exposure without requiring a separate combat screen.
- Strategy 72 produced narrower ranges and disclosed the estimated defensive-ground multiplier and variance constraint.
- Forecast casualty ranges were credible in this battle rather than cosmetic.
- Major combat remained persistent across ticks and database recovery.
- Accelerated time stopped reliably at each player decision boundary.
- Continuing required an explicit new advance; retreat remained the only alternate command during battle.

### Implementation defects

- **Fixed in `7925db8`:** arrival and forecast could claim direct local awareness while the island inspector still showed stale rumor intelligence. Arrival now emits a direct observation immediately.
- **Fixed in `73a3d39`:** another party's active battle did not suppress the attack forecast or button. The settlement now shows “Battle underway” and withholds unavailable attack controls.

### Design risks and opportunities

- Risk labels worked in a favorable battle, but the player-operated path still needs an adaptive losing battle to assess whether the retreat choice feels difficult rather than obvious.
- Several allied autonomous parties attacked Cinder immediately after Mara's battle ended. This is legal, but same-tick follow-on attacks may feel like uncontrolled dog-piling and can obscure who earned a surrender claim.
- Capture exposure is currently advisory; the future captivity system must make the label correspond to an actual resolution path.
- The pre-battle casualty estimate describes the whole battle. A future phase panel could add a revised estimate for the remaining phases without replacing the original forecast.

### Follow-up experiments

- Play an underdog battle through the public interface and retreat after a bad first phase; compare withdrawal losses with the displayed risk.
- Test low-, medium-, and high-strategy commanders against the same saved combat setup to evaluate range width and revealed information.
- Decide whether allied parties should reserve a settlement battle for a short cooldown after a named commander finishes an assault.

## Recommendation

`PROMOTE`

The milestone proves that combat commitment and continuation can be informed without adding tactical micromanagement. The two concrete interface defects found in play were fixed and the final multi-seed/recovery gate passed. The next combat milestone should focus on a human retreat playtest and follow-on-attack coordination rather than reworking this foundation.
