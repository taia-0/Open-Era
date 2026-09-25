# Playtest: hidden state visibility 001

## Session

- **Candidate commit:** `aecaa6b`
- **Date:** 2026-09-25 UTC
- **Operator:** Cursor general-purpose agent acting as an adaptive player, deliberately given no repository knowledge. It was forbidden from reading any repository file, opening any database, or inspecting source, so that its decisions could only come from the player-facing API.
- **Interface:** Public dashboard HTTP API only
- **Seed:** `1847`
- **Starting tick:** `0`
- **Ending tick:** `25` (day 4.17)
- **Player character:** Mara Vane

## Hypothesis and ambition

**Milestone hypothesis:** The player-facing API can deny a player hidden state while still supporting a coherent political objective, so that a campaign can be planned, fought, and stabilized from legitimately observable information alone. This branch redacts foreign characters, foreign faction strength, and event payloads by a visibility tier.

**Player ambition:** Take Cinder Key from the Free Tide Compact and leave the new holding under autonomous protection.

**Success signal:** Cinder Key changes faction and owner through combat plus an explicit surrender acceptance, and an autonomous officer accepts a defense assignment and reaches the settlement.

## Adaptive decision log

| Tick | Player-visible observation | Reasoning | Action | Outcome |
| ---: | --- | --- | --- | --- |
| 0 | Cinder Key showed garrison 96 but the record was a rumor at 0.35 confidence, 16 ticks old. A rival party stood in the same port. | Commit a scout rather than trust stale intelligence. | Ordered an explorer to survey Cinder Key. | Rejected for an out-of-range priority, then accepted at 0.9. |
| 1 | Provisions were 1.47 at home against 3.94 at the target. | Buy supplies where they are cheap before a long voyage. | Bought provisions. | Provisions 36 -> 47.4; money 108 -> 90.4. |
| 1 | A second action was refused. | Distance dominates the schedule. | Queued travel to Cinder Key. | Five-tick voyage; immediate follow-up was rejected as already queued. |
| 4 | The feed showed a rival party also sailing toward Cinder Key, and an existing order protecting it. | The forecast could not model a third party, so the window might close. | Continued the voyage. | Arrived tick 6. |
| 6 | Direct observation replaced the rumor: garrison 111, fortification 1.13x, forecast favorable, capture risk low. | A favorable forecast with acceptable losses justified an attack. | Raided. | Won all three phases; garrison 111 -> 54; own troops 80 -> 70. |
| 7-20 | Successive victories with no surrender offer. | The mechanism appeared to be attrition until a threshold was crossed. | Raided three more times. | Garrison 54 -> 21 -> 8 -> 3; surrender appeared at 3. |
| 20 | A surrender offer was flagged on the settlement. | The offer was the gate; claiming was the only plausible vehicle. | Claimed the settlement. | Cinder Key moved to World Government, owned by the player; money rose 90 -> 335. |
| 22 | The new holding had no defending officer. | Redundancy reduces the chance a single refusal leaves it bare. | Ordered two officers to protect Cinder Key. | Accepted by both. |
| 23 | One officer accepted and arrived; the other deviated into travel. | The objective's second half was satisfied by an officer on station. | Advanced to verify. | Officer present, order active and following. |
| 25 | Cinder Key belonged to World Government and the guard was on station with no counter-attack. | Holding stable. | Stopped. | **Objective secured.** |

## Outcome

Mara arrived at Cinder Key with a favorable forecast and ground its garrison from 111 down to 3 across four raids while rival parties left or looked elsewhere, ending at 53 troops. When the settlement offered surrender she claimed it, and the key passed to World Government under her personal ownership with a treasury jump from plunder. She had already sent officers ahead, and one reached the walls and took the protection order. She stopped at tick 25 with the holding under autonomous guard and no immediate counter-attack.

The player's own account is the important part: the settlement half of the ambition was supported cleanly by legitimate information, because arrival converted a stale rumor into an exact forecast. The rival half was **not**. The player reported that it could not assess a rival party's strength through any intended channel, and instead learned rival intentions from the event feed.

## Evidence review

Evidence below was read after the session, as post-session diagnosis, which the player protocol permits.

- **World report:** The recovered world reached tick 25 (day 4.2) with 29 autonomous characters, 2,942 persisted events, 132 journeys, 120 market trades, 6 completed battles, and 3 successful retreats. 10 player commands were accepted and 10 resolved.
- **Metrics:** World Government finished at 2317.55 power, 18,200.55 treasury, and 3 settlements. Free Tide finished at 882.13 power, 2,902.35 treasury, and 0 settlements, having held one until the claim at tick 20. Note that the true Free Tide power of 882.13 was **not** visible to the player, whose projection correctly reported `null`; the player decided without it.
- **Map:** Generated from the recovered world and reflects the territorial change in island ownership.
- **Decision/agency traces:** 368 decision traces and 347 agency traces. Autonomous decision-making is traced per character; player-issued commands are recorded as acceptances and resolutions rather than as autonomous decisions. The actor central to the leak below appears with 16 traced decisions.
- **Conversation traces:** No player messages were sent, so this session does not exercise timing, relevance, or reply quality.
- **Recovery and determinism:** Recovering the world and regenerating reports at tick 25 replayed 124 post-snapshot events and reproduced state hash `b3ac3564e786396c3bb173010009cda1c11cb900b32bd94464307552d8c69657`. The hash differs from the headless gate run's `183e7f0a...` because player commands legitimately changed history.
- **Rival ambition confirmed against hidden truth:** The player reported reading a rival's plan intent as "Win recognition through daring victories". The post-session report independently lists that rival, Pax Ash, with that exact active ambition, which confirms the leak was real and was described accurately rather than inferred.

## Findings

### What worked

- The conquest objective remained fully reachable with foreign state withheld. The player never needed a rival's numbers to plan, fight, claim, and stabilize the settlement.
- The visibility tier for settlements behaves exactly as designed. Arrival converted a 0.35-confidence rumor into an exact 111-garrison forecast, and the forecast alone drove the attack decision, which is the intended path from uncertainty to action.
- Withholding foreign faction power was legible rather than confusing. The player noticed the absence, understood it as fog of war, and proceeded.
- The player reported that missing information did **not** block the objective. The intended substitute, the combat forecast, carried the load.

### Implementation defects

- **The event feed leaked foreign hidden state, and capturing a settlement made the leak worse.** `/api/state` returned raw payloads for events where the commander's faction owned the settlement the event occurred in. Because a character is "at" a settlement, this granted visibility into the private decisions of every visitor to captured ground. Measured on the unfixed build against this exact world at tick 25: 100 events in the feed, 47 withheld, and **24 payloads visible from actors outside the commander and their faction**, including 12 `decision-made` events carrying `activeLongTermGoalId`, `planIntent`, `chosen` with its score and reason, and full `candidates` lists, plus 3 `knowledge-updated` events exposing a character's private beliefs. The same world recovered under the fix reports **100 withheld of 100**. The player used this leak deliberately: it saw the rival's goal, plan intent, and confidence-tagged target knowledge, and it chose to attack immediately instead of scouting because of what it learned there. The root cause is a design error rather than a coding slip: event location was used as a proxy for event ownership. Ground ownership legitimately governs settlement-level events, but a character's decision belongs to the character.
- **The submitter's own tests passed while the leak was live.** The redaction suite asserted the rule as understood by its author instead of probing the boundary adversarially. An agent with no knowledge of the implementation found the hole within one session. This is direct evidence for treating the adaptive playtest as the gate rather than as confirmation.
- **The surrender mechanic is invisible.** No `accept-surrender` command exists, and an attempt was coerced into an order schema and rejected as an unknown recipient. Surrender resolves implicitly through `claim-settlement`. The design intent is that conquest is an explicit political decision, but the interface does not name it.
- **Undocumented constraints rejected valid intentions.** Order priority must be between 0.1 and 1, and only one direct character action may be queued at a time. Both were discovered by failure.
- **`captureRisk` remained `low` across three won battles**, yet capture eventually arrived through claiming. The field never explained itself.
- **One `issue-order` produced two standing orders** (`character-01:order:character-13` and `command-00001:standing-order`). The player found the duplication confusing.
- **Third parties standing at a settlement did not appear in its defense.** A rival was present at Cinder Key and absent from `defenderPower`, so it could not be modelled either way.

### Design risks and opportunities

- Ground ownership must not imply insight. Any future "your territory tells you things" feature inherits this trap unless it distinguishes events *about the place* from events *about a person at the place*.
- The faction-peer tier withholds motive but reveals capability. That is defensible, but it means the feed needs to be at least as strict as the character projection, since a feed that is more permissive silently undoes the projection.
- The player's complaint that it could not assess rival strength through any intended channel is worth weighing against the design record, which intends estimates to be *learned*. There is currently no legitimate channel for that besides combat itself, so the "investigation" pillar has no machinery yet.
- Four sequential raids again felt repetitive, matching the observation in `promotion-baseline-001`.

### Follow-up experiments

- Re-run this exact ambition on the fixed build and confirm no foreign payload is visible before or after a capture. Recorded separately as session 002.
- Design and test a legitimate channel for learning rival strength, such as scouting, informants, or interrogation of captives, so "estimates learned through investigation" stops being aspirational.
- Reproduce the duplicate standing-order issuance and decide the intended identity for a player-issued order.
- Test whether the surrender offer should be an explicit command rather than an implicit consequence of claiming.

## Recommendation

`REVISE`

The core hypothesis survives: the objective was reachable while foreign state was withheld, and the settlement projection worked as intended. The branch cannot be promoted yet, because the event feed defeated the redaction on the same session that was supposed to demonstrate it, and the leak widened precisely when the player gained territory. Land the default-deny fix for character-attributed events, keep foreign faction power withheld, and rerun this ambition before reconsidering promotion.
