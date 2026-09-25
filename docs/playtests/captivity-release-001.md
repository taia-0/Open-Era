# Playtest: bounded mandatory release

## Session

- **Candidate commit:** `1fbb8fd`
- **Date:** `2026-09-25`
- **Operator:** Codex
- **Interface:** Public dashboard HTTP API
- **Seed:** `16`
- **Starting tick:** `0`
- **Ending tick:** `86`
- **Player character:** `Pax Ash`

## Hypothesis and ambition

**Milestone hypothesis:** Refusing the dangerous escape cannot create indefinite imprisonment; the world must force a bounded release and begin recovery.

**Player ambition:** Preserve physical condition by waiting rather than escaping, then evaluate the economic and military cost of mandatory release.

**Success signal:** Captivity ends at the advertised limit, terms stay within the calculated maximum, unresolved value becomes explicit debt, and troops begin returning afterward.

## Adaptive decision log

| Tick | Player-visible observation | Reasoning | Action | Outcome |
| ---: | --- | --- | --- | --- |
| 0 | Crown Harbor offered a contested battle with low capture exposure. | Use the same opening as the escape session so the recovery choices remain comparable. | Commit attack. | Defender won phase one. |
| 1 | Defender advantage, high retreat risk, low capture exposure. | Preserve the force rather than compound the loss. | Retreat. | Pax was captured; 69 surviving troops scattered. |
| 2 | Guaranteed escape was available, but it promised a serious wound and possible permanent scar. Mandatory terms were due in 13.8 days. | This session tests the non-escape guarantee, so preserving health outweighed lost time and uncertain cost. | Wait in captivity. | Pax remained captive while the rest of the world continued. |
| 85 | Dashboard showed exactly 14 days held and 0 days until mandatory terms. Pax still had 156 money and no active party power. | Advance one tick to let the deadline resolve through normal simulation. | Advance four world-hours. | Release triggered at tick 85 and the world reached tick 86. |
| 86 | Pax was traveling to Cinder Key with 69 troops in recovery, no physical escape wound, 0 money, and a 50.03 World Government debt. | Verify that release restored agency and preserved the remaining obligation. | Inspect public state and briefing. | Mandatory release was complete; troop recovery was scheduled and the debt was persisted. |

## Outcome

The system prevented indefinite imprisonment exactly as intended. The captor's demand consumed 156 available money and converted the remaining 50.03 into a formal debt, then routed Pax to safety and scheduled troop return. Waiting protected health but imposed a severe time and economic cost.

## Evidence review

- **World report:** Captivity lasted fourteen world days and ended automatically without a human or autonomous captor action.
- **Metrics:** The captive party remained absent from faction power for the full imprisonment while the persistent world continued.
- **Map:** Release created travel from Crown Harbor to Cinder Key rather than leaving the freed character inside hostile territory.
- **Decision/agency traces:** Captivity suppressed autonomous activity for the controlled character without stopping other characters.
- **Conversation traces:** Messaging remained available, though this run intentionally tested passive deadline resolution.
- **Recovery and determinism:** Release terms and debt were emitted as event data and persisted through the schema-5 recovery model.

## Findings

### What worked

- The fourteen-day guarantee was exact and could not be extended by the captor.
- The demanded value was bounded, available money was applied first, and the remainder became explicit debt.
- Release immediately restored movement and started gradual troop recovery.
- Waiting and escaping produced meaningfully different costs rather than one dominant presentation of the same result.

### Implementation defects

- The first playtest build allowed a long advance to pass a release transition and could bury its terms below older action items. Fixed in `1fbb8fd`: accelerated time now pauses for capture, escape, or release, and release is a warning that states money paid and debt recorded.

### Design risks and opportunities

- Waiting is intentionally passive until negotiation, ransom, and rescue actions are implemented; direct messages are currently its only interactive layer.
- Taking all available cash before recording debt is harsh. Later economic playtests should determine whether captors should be constrained to a liquid-payment fraction.

### Follow-up experiments

- Add voluntary ransom offers and rescue coordination before the mandatory deadline.
- Exercise debt enforcement only after debt terms and reputation consequences have their own milestone.

## Recommendation

`PROMOTE`

The deadline provides a hard anti-soft-lock guarantee, and the resulting economic and military consequences are both visible and persistent. The two presentation defects found during the run were corrected and tested.
