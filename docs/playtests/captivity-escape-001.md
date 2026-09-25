# Playtest: dangerous escape and troop recovery

## Session

- **Candidate commit:** `1fbb8fd`
- **Date:** `2026-09-25`
- **Operator:** Codex
- **Interface:** Public dashboard HTTP API
- **Seed:** `16`
- **Starting tick:** `0`
- **Ending tick:** `9`
- **Player character:** `Pax Ash`

## Hypothesis and ambition

**Milestone hypothesis:** Capture, guaranteed escape, and gradual troop recovery form a legible defeat story without trapping the player or bypassing the public command boundary.

**Player ambition:** Pressure Crown Harbor, preserve the party if the first phase turns badly, and recover operational freedom after any defeat.

**Success signal:** The player can understand why capture occurred, communicate while captive, choose escape with informed consequences, reach safety, and see surviving troops begin to return.

## Adaptive decision log

| Tick | Player-visible observation | Reasoning | Action | Outcome |
| ---: | --- | --- | --- | --- |
| 0 | Crown Harbor forecast was contested: 31–58% victory, 26–58 expected casualties, moderate retreat risk, and low capture risk. | The target was dangerous but plausibly winnable, matching the ambition to test a consequential attack. | Commit attack. | The first major-battle phase began. |
| 1 | Defender advantage; 14 troops lost versus 11 defenders. Retreat risk rose to high while capture remained low. | Continuing after losing the opening phase risked the remaining force. | Retreat toward Cinder Key. | The low-probability capture roll occurred; 69 surviving troops scattered and Pax was imprisoned at Crown Harbor. |
| 2 | Dashboard showed party power 0, the exact holding location, 69 scattered survivors, guaranteed dangerous escape, and 13.8 days until forced terms. | Escape preserved initiative; messaging could warn an ally before leaving. | DM Mina Vale, then issue `escape-captivity`. | Message scheduled a delayed reply. Escape caused 21.2 health damage, no scar on the 8% roll, and five ticks of travel toward Cinder Key. |
| 3–9 | Recovery showed 69 troops outstanding and the first return due while Pax traveled. | Wait for arrival, the ally's response, and evidence that troop return is gradual rather than instant. | Advance six ticks. | Pax reached Cinder Key, Mina replied at tick 8, and 10 troops returned; 59 remained scattered. |

## Outcome

The full loop was understandable from public information. A nominally low capture exposure produced a rare but credible reversal. The escape decision was immediate and explicit, the wound was substantial without ending the character, and recovery created a continuing consequence after physical freedom. Messaging remained available throughout captivity.

## Evidence review

- **World report:** Captured characters contribute zero active party power and resume movement only after release or escape.
- **Metrics:** Removing the party during captivity changed faction power without corrupting settlement or market activity.
- **Map:** Escape routed Pax from Crown Harbor toward the nearest friendly harbor, Cinder Key.
- **Decision/agency traces:** The capture trace preserved displayed risk, a 4% probability, and the deterministic roll; the escape trace preserved injury and scar rolls.
- **Conversation traces:** The captive could create a DM and send a message. The delayed reply worked, although its prototype text did not acknowledge the captivity context.
- **Recovery and determinism:** Focused recovery tests passed, and the milestone gate's split run matched its uninterrupted hash.

## Findings

### What worked

- Capture used the exact risk category shown at the retreat window.
- The captive state removed ordinary actions but left communication open.
- Escape always succeeded while still imposing a meaningful wound and rare permanent-scar risk.
- Troop recovery was visible, gradual, and retained group experience and discipline.

### Implementation defects

- The advance response initially reported no noteworthy update after capture or escape. Fixed in `1fbb8fd` by adding player-attention transitions and pausing accelerated time.

### Design risks and opportunities

- Deterministic prototype dialogue recognizes a message request but does not yet receive captivity context, so Mina's answer was generic.
- A 4% capture result is appropriately surprising, but future UI should preserve the distinction between retreat danger and capture exposure as clearly as this prototype does.

### Follow-up experiments

- Give dialogue context a safe, read-only summary of captivity and troop recovery.
- Test negotiated rescue or ransom against immediate escape once social release actions exist.

## Recommendation

`PROMOTE`

The escape path is coherent, persistent, and strategically meaningful. The observed API feedback defect was fixed and covered by regression tests.
