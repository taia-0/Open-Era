# Playtest: hidden state visibility 002

## Session

- **Candidate commit:** `82c9bfc`
- **Date:** 2026-09-25 UTC
- **Operator:** Cursor general-purpose agent acting as an adaptive player, deliberately given no repository knowledge. It was forbidden from reading any repository file, opening any database, or inspecting source, so its decisions could only come from the player-facing API.
- **Interface:** Public dashboard HTTP API only
- **Seed:** `1847`
- **Starting tick:** `0`
- **Ending tick:** `25` (day 4.17)
- **Player character:** Mara Vane

## Hypothesis and ambition

**Milestone hypothesis:** After `82c9bfc` denies character-attributed event payloads by default, the player-facing API no longer exposes any foreign private state, and the same political objective remains reachable from legitimately observable information alone. This is a rerun of `hidden-state-visibility-001` on the fixed build.

**Player ambition:** Take Cinder Key from the Free Tide Compact and leave the new holding under autonomous protection.

**Success signal:** Cinder Key changes faction and owner through combat plus an explicit surrender acceptance, and an autonomous officer accepts a defense assignment and reaches the settlement.

## Adaptive decision log

| Tick | Player-visible observation | Reasoning | Action | Outcome |
| ---: | --- | --- | --- | --- |
| 0 | Cinder Key showed a garrison estimate of 96 as a rumor at 0.35 confidence, 16 ticks old. Own party power was the largest figure on the board. | Force was the only route to ownership, and it required presence. | Sailed to Cinder Key. | Accepted; five-tick voyage. |
| 0 | A friendly officer was already at the target. | Start pressure without waiting for arrival. | Ordered a pressure order against the settlement. | Rejected; a pressure order requires a faction target, not a map node. |
| 0 | The error revealed the required target type. | Re-target the faction. | Ordered pressure against the faction. | Queued, then refused by the character after weighing loyalty and risk. |
| 0 | Another officer showed an obedience margin above their threshold. | Pre-position a defender before the assault. | Ordered protection of Cinder Key. | Queued; later active but deviating. |
| 2 | A subordinate's supply order reached awaiting confirmation. | Confirming completions appeared to be the only available lever on trust. | Confirmed the completion. | Order completed. |
| 3 | Five rival-aligned characters were all travelling toward Cinder Key, and the rival faction exposed no numbers at all. | Rival strength was unreadable, but their movement was legible, so the window might close. | Ordered three more pressure orders to free an attack slot. | Only one raider accepted; two refused. |
| 5 | Arrival converted the rumor into exact direct intelligence. A subordinate's battle was already running, and the combat slot was blocked. | Probe the capture verbs while blocked. | Attempted a claim and a raid. | Both rejected; learned the real sequence is raid, then surrender offer, then claim. |
| 6 | A forecast appeared with a favorable outlook, a win-chance band, and low capture risk. | First hard numbers on the enemy; favorable enough to commit. | Raided. | Three-phase battle won; garrison fell from 111 to 49. |
| 9-12 | A follow-up forecast showed a decisive advantage. | Grind the garrison to force terms. | Raided again. | Won; garrison fell to 20. |
| 13 | The forecast improved further and the defender's power estimate had collapsed. | One more push should break the will to resist. | Raided. | Surrender offered; garrison at 4. |
| 14 | A settlement with a spent garrison was offering surrender. | Explicit acceptance is exactly what the objective names; take it before it lapses. | Claimed the settlement. | Cinder Key passed to World Government, owned by the player; money rose from 108 to 292.5 from plunder. |
| 14 | Five subordinates were awaiting confirmation, and the holding had a garrison of 4 and stability of 55. | Obedience is the bottleneck on every order, and the second half of the objective needs an autonomous officer. | Confirmed five reports and issued protection orders to eight officers. | Six accepted, one resumed, one deviated to trade, one refused. |
| 16-21 | Officers reported the holding secure and asked for their orders to be closed. | Closing an order might end the defense assignment. | Deliberately issued no command. | Orders stayed open and active. |
| 21 | The briefing was empty and one briefing endpoint rejected an obvious parameter name. | Probe the undocumented affordances. | Attempted a reporting-officer assignment and an acknowledgement. | One rejected on the wrong key, one rejected as an invalid item. |
| 21-25 | Defenders dispersed, but one officer remained co-located with an accepted, following protection order. | The success signal needs only one officer on station. | Advanced and verified. | Cinder Key still held at tick 25. |

## Outcome

Mara sailed a five-tick run to Cinder Key, and while still en route a rival raider that had been prodded into action opened the first battle, which revealed that the assault machinery worked and that the target was worth hitting. On arrival the intelligence record snapped from a sixteen-tick-old rumor to exact observation, the forecast showed a favorable engagement, and three raids ground a 115-strong garrison to 4 until terms were offered, which she accepted outright. Cinder Key passed to World Government under her personal ownership. She left several accepted protection orders open rather than closing them, and by tick 25 an autonomous officer who had accepted the defense assignment was standing at the walls with her.

The player's own summary is the load-bearing sentence for this milestone: the only thing that made it nervous was that it could never see a single rival's troops, power, or goal, so it committed on its own numbers and on reading rival sailing directions.

## Evidence review

- **World report:** The recovered world reached tick 25 (day 4.2) with 29 autonomous characters, 2,990 persisted events across 10 snapshots, 134 journeys, 112 market trades, 7 completed battles, 3 successful retreats, and 1 capture. 24 player commands were accepted and 24 resolved.
- **Metrics:** World Government finished at 2302.02 power, 18,312.65 treasury, and 3 settlements. Free Tide finished at 774.04 power, 2,830.72 treasury, and 0 settlements. Free Tide's true power was **not** visible to the player, whose projection correctly reported `null` for the whole session; the player captured a faction without ever seeing its strength.
- **Map:** Generated from the recovered world and reflects the change in island ownership.
- **Decision/agency traces:** 88 plan reviews, 43 plan-time order assessments with 23 accepted and 10 refused, 20 deviations, 18 resumptions, 13 completion reports, 6 issuer confirmations, and 30 relationship changes. In both sessions the player's read of order acceptance and refusal matched these aggregates.
- **Conversation traces:** No player messages were sent, so this session again does not exercise reply timing or relevance.
- **Recovery and determinism:** Recovering the world and regenerating reports at tick 25 replayed 114 post-snapshot events and reproduced state hash `8b8e280bdb33c687a7501155a12a37708b018b39e988873ac7c60cf0f1eb9fa6`. It differs from the headless gate hash because player commands legitimately changed history, and it differs from session 001 because a different 24 commands were issued.

### Independent verification of the leak fix

The claim under test is that no foreign private state is reachable. It was checked directly against this session's world at tick 25, not inferred from the playtest alone.

| Measure | Session 001 (unfixed) | Session 002 (fixed) |
| --- | ---: | ---: |
| Events in feed | 100 | 100 |
| Payloads withheld | 47 | 97 |
| Payloads visible with a foreign actor | 24 | 0 |
| Foreign motive field names in any visible payload | present | none |

All three visible payloads at tick 25 were standing-order events for orders the commander had issued, which the rule deliberately allows because they are the commander's own chain of command. Quoted exactly:

```json
{"type":"standing-order-completion-reported","actorId":"character-06","payloadWithheld":false,
 "data":{"orderId":"command-00017:standing-order","issuerId":"character-01","score":0.809,"threshold":0.762}}
```

The player reported that every rival-side event it saw (`goal-progressed`, `decision-made`, `plan-reconsidered`, `knowledge-updated`, `recruited`, `battle-started`, `battle-phase-resolved`, `battle-retreated`, `relationship-changed`, `market-trade`) carried `data: null` with `payloadWithheld: true`, and that the only rival information it could obtain was a generic event title naming an actor, an action, and sometimes a destination.

**One allowance was not exercised.** The rule permits unattributed settlement events for territory the commander's faction controls, which is what makes owned-settlement production visible. `settlement-produced` is genuinely emitted without an `actorId`. No such event fell inside the rolling 100-event window at tick 25 in either session, so that branch is covered by unit tests only and has not been observed in a live session.

## Findings

### What worked

- **The leak is closed, and the objective survived it.** The previous session used the leak to decide when to attack. This session had no leak and still captured the settlement, which is the evidence that the campaign never depended on the leaked information.
- Withholding foreign faction power was not merely tolerated but visibly engaged with. The player stated plainly that it captured a faction whose strength it never saw, and treated the absence as intended fog of war rather than as a bug.
- The uncertainty-to-certainty path worked as designed and was describe, not just tolerated: a 0.35-confidence rumor became exact observation on arrival, and the forecast then drove the decision.
- Order acceptance and refusal stayed legible and consequential. The player inferred that obedience was its bottleneck and used completion confirmations as its one visible lever on trust, which matches the agency aggregates.
- Leaving accepted orders open, rather than closing them, was a genuine strategic inference about the mechanism. That is the kind of decision this project wants a player to be able to make.

### Implementation defects

- **The event feed is a rolling 100-item window with no pagination.** By tick 25 the entire array covered only the most recent few ticks, so the player was structurally unable to re-read its own early history mid-campaign. This matters more, not less, now that payloads are withheld, because the summary strings are the only remaining narrative. A `since` sequence cursor or a paged history endpoint would fix it.
- **`combat` and `battleInProgress` contradict each other.** `settlement.battleInProgress` was true while `combat.active` was `null`, with nothing explaining which one gates which action. The player burned commands discovering that a battle it was not part of blocked its own raid.
- **The single combat forecast that genuinely informs a decision is unavailable when the decision is made.** Forecasts appear only once the player is co-located and no other battle is running, so they can justify continuing an assault but never starting one. There is also no travel ETA before committing; the player learned the voyage was five ticks only after queuing it.
- **`POST /api/advance` returns no diff or event stream.** Every step is advance, re-fetch, and diff by hand, which the player named as the single largest ergonomic cost of playing.
- **Undocumented parameter and target requirements.** A pressure order needs a faction target rather than a map node. `briefing/officer` needs `characterId`, not `officerId`, and its error is `unknown-character`, which reads like a bad player id. `briefing/acknowledge` requires an item id while `attentionCount` was 0 and `items` was empty for the entire session, making it un-callable.

### Design risks and opportunities

- **The "estimates learned through investigation" pillar still has no machinery.** Two sessions have now independently reported that rival strength cannot be assessed through any intended channel before committing. Scouting, informants, interrogating captives, or bought intelligence would give the pillar an actual implementable form.
- **The forecast is drawn from the player's own observation of the garrison, not from the enemy's mind.** That is the correct boundary and it should stay that way when estimation channels are added; estimates must be modelled as earned knowledge, not as blurred truth.
- Rival movement being visible while rival capability is hidden is a good combination: it produced the player's most interesting inference, that a massing was under way, without giving away whether the massing could win.
- Order duplicates were not reproduced this session, unlike session 001, so that defect remains open and uncharacterised.

### Follow-up experiments

- Add a sequence cursor or paged history to the event feed, then repeat a longer campaign to test whether the player can still audit its own decisions.
- Design and test one legitimate estimation channel, then repeat this ambition to see whether commitment improves or whether uncertainty was carrying the tension.
- Reconcile `combat.active` with `battleInProgress` and decide which is authoritative.
- Reproduce the duplicate standing-order issuance and decide the intended identity for a player-issued order.
- Exercise the unattributed settlement allowance in a live session by inspecting a window that contains owned-settlement production.

## Recommendation

`PROMOTE`

The hypothesis holds on the fixed build. Foreign private state is unreachable through the player API, verified directly against this world rather than taken on trust, and the same political objective was completed without it by a player that had no repository knowledge. The gap between session 001 and 002, 24 exposed foreign payloads against none, is the evidence that the fix closed the path rather than narrowing it.

Promotion is for this branch's hypothesis only. The defects above are real but none of them reopens hidden state, and the strongest of them, the event feed's missing history, is worth fixing before a longer campaign is attempted. Assembling a `promotion/main-vN` candidate remains a separate step and requires the owner's explicit approval of that exact commit per the pipeline.
