# Playtest: human retreat 001

## Session

- **Candidate commit:** `1d4cfac`
- **Date:** `2026-09-25 UTC`
- **Operator:** Codex, acting as the human commander
- **Interface:** Public dashboard HTTP and command API only
- **Seed:** `1847`
- **Starting tick:** `0`
- **Ending tick:** `2`
- **Player character:** Pax Ash

## Hypothesis and ambition

**Milestone hypothesis:** A player can use the pre-battle forecast and one phase report to recognize a deteriorating attack, retreat deliberately, and preserve meaningful combat power.

**Player ambition:** Pressure the World Government at Crown Harbor without sacrificing most of Free Tide's strongest party.

**Success signal:** The information available before and during battle supports a defensible retreat decision, the withdrawal uses the risk shown to the player, and retreat is materially better than blindly continuing.

## Adaptive decision log

| Tick | Player-visible observation | Reasoning | Action | Outcome |
| ---: | --- | --- | --- | --- |
| 0 | Pax had 92 troops, 253.8 party power, 40 strategy, full health, and 80 morale. Crown Harbor's forecast was contested: 30–56% victory, 28–61 attacker casualties, 26–57 defender casualties, 54–85% retreat success, moderate retreat risk, low capture exposure, and significant prepared defenses. | The attack was risky but not hopeless. A healthy veteran party could probe the capital if withdrawal remained viable. The advance condition was set before committing: retreat after a losing first exchange that failed to reduce the garrison meaningfully or sharply increased withdrawal risk. | Commit attack. | A requested 24-tick advance stopped after one tick at phase 1. |
| 1 | Defender advantage. Pax lost 13 troops while the garrison lost 12; 79 attackers still faced 248 defenders. Health fell to 94, morale to 73, and retreat risk rose from moderate to high. | The battle had crossed the precommitted threshold. Continuing offered poor exchange value against a force still more than three times Pax's troop count. | Order retreat. | The next requested 24-tick advance again stopped after one tick and ended combat. |
| 2 | Withdrawal cost 4 pursuit losses. Pax retained 75 troops, 91.5 health, and 66.2 morale. Retreat risk was recorded as high, capture exposure remained low, and no defeat was added. | The party preserved enough power to recover and pursue another objective. | End the experiment and review diagnostics. | Combat closed with no active battle and both player commands durably resolved. |

## Outcome

The player-facing information produced a clear change of mind. The initial forecast supported a calculated probe, but phase 1 showed both an unfavorable exchange and worsening withdrawal conditions. Retreat imposed a real cost—17 total troop losses across fighting and pursuit—but preserved 75 of Pax's original 92 troops and avoided a formal defeat.

A post-session deterministic counterfactual continued the identical battle for diagnostic comparison. Pax lost all three phases, suffered 49 troop losses, finished with 43 troops, 82 health, and 59 morale, and received a defeat. The adaptive retreat therefore preserved 32 additional troops and avoided the defeat state.

## Evidence review

- **World report:** Pax committed to a three-phase attack at Crown Harbor and withdrew after phase 1 with 4 pursuit losses. No battle remained active.
- **Metrics:** At tick 2, World Government power was 2337.82 and Free Tide power was 1107.72. The short experiment was intended to measure party preservation rather than territorial balance.
- **Map:** Spatial state remained valid, but Pax remained located at Crown Harbor after withdrawal; this exposes a representation gap discussed below.
- **Decision/agency traces:** Pax received no autonomous decisions after being assigned to the human controller. Twenty-nine other characters continued acting during the two-tick session.
- **Combat traces:** The trace retained the contested starting forecast, defender-advantage phase, high retreat risk, and high-risk contested withdrawal.
- **Conversation traces:** No messages were sent; conversation behavior was outside this experiment.
- **Recovery and determinism:** Reopening the playtest database replayed 269 post-snapshot events and recovered state hash `44e7fd37fa053f7b618c3a3fb36eb1a406c54c45de830119d1be2900e01cc7ee`. The full gate passed 44 tests, three 72-tick seeds, and split-versus-uninterrupted recovery at hash `00dae05eac91ee2741192a8712981f4d519a6559235216493fdfa5ef9d3e17e2`.

## Findings

### What worked

- The forecast communicated uncertainty instead of presenting a false single-number answer.
- The player could define a retreat threshold before commitment and evaluate it with exact phase results.
- The phase report changed the relevant risk label from moderate to high as the position worsened.
- Accelerated time stopped at both the phase decision and withdrawal result despite each request asking for 24 ticks.
- Retreat had meaningful pursuit costs while remaining substantially better than the deterministic continue-to-defeat counterfactual.
- Retreat did not incorrectly add a victory or defeat.

### Implementation defects

- **Fixed in `1d4cfac`:** the initial discovery run displayed high retreat risk at the phase boundary but recalculated moderate risk during withdrawal. Retreat resolution now preserves the exact phase risk the player saw and uses it to calculate pursuit losses. The verified replay recorded high risk consistently.

### Design risks and opportunities

- Pax remains physically located at the hostile settlement after retreat. Until sea positions or approach routes exist, the game needs a clear post-retreat displacement or temporary offshore state so withdrawal cannot mean “still standing in the enemy capital.”
- The forecast's 54–85% retreat-success range and qualitative risk label are useful but do not yet define what “success” means. Future UI should distinguish clean escape, pursuit losses, wounds, and capture.
- The experiment used a developer-only alternate-commander option. This is useful for repeatable behavioral probes, but it should remain a local test harness rather than a production character-switching feature.
- One deterministic counterfactual strongly supports the decision, but balance confidence requires repeating the retreat test across several seeds and strategy levels.

### Follow-up experiments

- Add a post-retreat location rule and verify that the party cannot immediately attack, trade, or rest inside the hostile settlement.
- Repeat identical battles with low-, medium-, and high-strategy commanders to compare forecast width and retreat timing.
- Exercise a retreat where capture exposure rises to high or severe once the captivity system has a real outcome path.

## Recommendation

`PROMOTE`

The continue-or-retreat loop now demonstrates real player agency: the information changed the decision, the decision materially changed the outcome, and the persisted trace explains why. Promote the informed-combat foundation, retaining post-retreat positioning as the next concrete combat defect to solve.
