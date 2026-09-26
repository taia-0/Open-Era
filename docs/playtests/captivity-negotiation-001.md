# Playtest: persuade the captor

## Session

- **Candidate commit:** `87ee1e9`
- **Date:** `2026-09-26` UTC
- **Operator:** Codex acting as the human commander
- **Interface:** public dashboard HTTP API only
- **Seed:** `1847`
- **Starting tick:** `0`
- **Ending tick:** `38`
- **Player character:** Mina Vale

## Hypothesis and ambition

**Milestone hypothesis:** Captivity can make persistent messaging consequential without allowing dialogue output to mutate the simulation: a prisoner persuades one autonomous local authority through delayed direct messages, receives only qualitative signals, and answers structured money/debt terms through the validated command boundary.

**Player ambition:** Survive a reckless attack on World Government territory, avoid the damaging guaranteed escape, persuade the captor to negotiate, and secure release for less than the first demand.

**Success signal:** A naturally captured player can identify and message the responsible character, read movement in that character's stance without seeing a score, cause that character to open bounded terms, and complete a release that persists and begins troop recovery.

## Adaptive decision log

| Tick | Player-visible observation | Reasoning | Action | Outcome |
| ---: | --- | --- | --- | --- |
| 0 | Mina has 47 low-discipline troops. Crown Harbor is reported as `grave-danger`, but the report is only 24% confident. | A bad but informed political gamble is a plausible route into the system under test. | Sail from Cinder Key to Crown Harbor. | Arrival at tick 6 replaces the rumor with direct observation. |
| 6 | The direct forecast is 14–34% to win, with severe retreat risk and high capture exposure. | Commit knowing that withdrawal may be the only rational phase decision. | Raid Crown Harbor. | Phase 1 favors the defenders; Mina loses 12 troops. |
| 7 | Retreat risk is severe and capture exposure high. | Continuing is worse than accepting the disclosed withdrawal risk. | Retreat. | Mina escapes and returns to Cinder Key. |
| 13–19 | Mina still has enough troops to raid, and Crown Harbor remains overwhelmingly stronger. | Repeat the same public gamble to obtain a real captivity transition rather than editing state. | Return and raid again. | Phase 1 again favors the defenders; 11 more troops are lost. |
| 20–21 | Retreat remains severe with high capture exposure. | Withdraw before the final phases destroy the party. | Retreat. | The withdrawal fails; Mina is captured, 19 surviving troops scatter, and Mara Vane is named as the authority. |
| 21 | Mara's stance is `unreceptive`; escape is guaranteed but damaging, and mandatory bounded terms are 13.8 days away. | Begin respectfully and acknowledge Mara's responsibility rather than demand release. | Open a DM and ask for release terms without further bloodshed. | Reply due at tick 27. |
| 27 | Mara replies, “I am listening,” and the visible stance becomes `listening`. | The first request moved the conversation, but Mara asks for a better reason. | Promise immediate payment and formal debt for any remainder. | Reply due at tick 31. |
| 31 | The stance becomes `considering`; Mara asks for the value of an agreement to be clearer. | Frame release as politically useful to both sides rather than merely personally desirable. | Offer payment, recognition of authority, and avoidance of a rescue attempt. | Reply due at tick 37. |
| 37 | Accelerated time pauses when Mara opens an 81.78-money offer. | The offer is affordable, but one counter is explicitly permitted. A 60-money counter is credible without simply echoing the demand. | Counter at 60. | Mara accepts on the next tick. |
| 38 | Mina is released, pays 60, owes no debt, sails toward Cinder Key, and begins recovery of 19 scattered troops. | The objective is complete. | End the session and recover the persisted world for evidence. | Recovery replays 262 events to the same state hash. |

## Outcome

From the player's perspective, captivity became a short social campaign rather than a timer or an escape button. Mara's response cadence felt like another player being intermittently available: six ticks for the first reply, four for the second, and six for the third. The qualitative progression made the messages feel effective without revealing how many keyword points remained. When terms opened, accelerated time stopped, the briefing named the demand and all four choices, and the structured counter resolved through the same queued command lifecycle as travel or retreat.

Mina spent 2.83 world days captive. She reduced the demand from 81.78 to 60, paid from 213 held money, incurred no debt, and began a five-tick return voyage with all 19 surviving troops scheduled to return gradually.

## Evidence review

- **World report:** Tick 38 (day 6.3), 4,429 persisted events across 9 snapshots, 186 journeys, 199 trades, 7 completed battles, 6 successful retreats, 1 capture and 1 negotiated release. Seven player commands were accepted and resolved; three player messages received three replies.
- **Metrics:** World Government remained dominant at 2,219.81 power and 18,431.09 treasury; Free Tide Compact held 966.89 power and 3,008.37 treasury. The negotiation did not disturb faction balance.
- **Map:** The generated SVG shows Mina's physical route from Cinder Key to Crown Harbor and her release voyage back; negotiation did not teleport the party.
- **Decision/agency traces:** 117 plan reviews, 232 direct knowledge updates, 26 order assessments, 7 reshaped goals, and 63 relationship changes occurred around the player session. The player remained excluded from autonomous decision selection.
- **Conversation traces:** Ten trace rows cover one thread, three human messages, three scheduled replies, and three autonomous replies. Player text was tagged cooperative/political where applicable; no action proposal was executed from dialogue output.
- **Recovery and determinism:** Recovering the session replayed 262 events after the latest snapshot to state hash `ed7a9199869433d95a73a7921b813d22dab0accf9379f5e6b7fd5b414a903995`.

## Findings

### What worked

- The system made the message thread mechanically consequential while keeping all asset changes behind events and validated commands.
- The captive saw `unreceptive`, `listening`, `considering`, and `open`, but neither the persuasion score nor the acceptance threshold appeared in state, character projections, or the event feed.
- Only messages to Mara affected the case. Tests confirm equally persuasive text sent to another known character changes nothing.
- Reply delay mattered. The world continued for sixteen ticks while the player argued for terms, making captivity part of the persistent simulation rather than a modal dialogue scene.
- Opening terms interrupted accelerated time and raised an action-required briefing item.
- Accept, reject, and a single counter are documented capabilities. A rejected low counter cannot be spammed repeatedly against one offer.
- Escape and the fourteen-day mandatory release remain intact, so social failure cannot soft-lock a character.

### Implementation defects

- **Fixed after evidence review:** the report called every release “mandatory” even when the event recorded `negotiated-counter`. It now distinguishes a negotiated counter, accepted negotiated terms, and mandatory bounded terms; the run-health total says releases rather than mandatory releases.

### Design risks and opportunities

- Persuasion uses a deliberately small lexical classifier. This is sufficient to prove authority and persistence, but players will eventually learn its vocabulary. A future dialogue model may classify richer intent; it must still return evidence to the simulation rather than execute release itself.
- If no captor-faction character remains at the settlement, the strongest available faction authority becomes the case owner. The rule is safe, but the fiction should eventually explain remote jurisdiction or assign explicit settlement offices.
- Counter decisions resolve one tick after submission rather than through another human-like message delay. This keeps the command lifecycle simple, but a later playtest should compare immediate adjudication with delayed counter replies.
- This is money/debt release negotiation only. Resource transfers, services, political favors, allegiance, contract enforcement, and rescue remain deferred.

### Follow-up experiments

- Run a low-money prisoner through accepted terms and verify that the remainder becomes visible, enforceable debt.
- Reject an offer, continue messaging, and test whether reopening feels meaningfully different rather than like repeating the same keywords.
- Send threats, spam, and prompt-injection attempts to authorities with different personalities and verify that qualitative feedback remains legible without exposing the formula.
- Capture several characters under one authority and test whether simultaneous cases need workload or delegation rules.

## Recommendation

`PROMOTE`

The milestone proves its narrow hypothesis. Captivity now connects combat, persistent messaging, autonomous personality, structured player decisions, money, debt, travel, and troop recovery in one replay-safe loop. The post-session reporting defect was fixed; the remaining findings are explicit expansions rather than blockers.
