# Playtest: post-retreat route 001

## Session

- **Candidate commit:** `62cf505`
- **Date:** `2026-09-25 UTC`
- **Operator:** Codex, acting as the human commander
- **Interface:** Public dashboard HTTP and command API only
- **Seed:** `1847`
- **Starting tick:** `0`
- **Ending tick:** `5`
- **Player character:** Pax Ash

## Hypothesis and ambition

**Milestone hypothesis:** Retreat should remove a party from hostile local space, disclose a predictable withdrawal destination, enforce ordinary sea travel, and restore local actions only after arrival at safety.

**Player ambition:** Probe Crown Harbor, withdraw after an unfavorable first phase, and bring Pax's surviving party home to Cinder Key.

**Success signal:** The retreat decision names its destination in advance; Pax becomes physically in transit rather than remaining at Crown Harbor; local commands fail during withdrawal; and normal arrival and intelligence systems resume at Cinder Key.

## Adaptive decision log

| Tick | Player-visible observation | Reasoning | Action | Outcome |
| ---: | --- | --- | --- | --- |
| 0 | Pax's forecast showed a contested attack against Crown Harbor with 30–56% victory odds, moderate retreat risk, and prepared defenses. | Repeat the prior human retreat scenario so the positioning change can be compared directly. | Commit attack. | The requested 24-tick advance stopped at phase 1. |
| 1 | Defender advantage: 13 attackers lost against 12 defenders; 79 attackers faced 248 defenders; retreat risk was high. The briefing explicitly offered withdrawal toward Cinder Key. | The same unfavorable exchange justified retreat, and the destination was known before issuing it. | Retreat toward Cinder Key. | Pax lost 4 troops in pursuit and immediately entered a four-tick sea route from Crown Harbor to Cinder Key. |
| 2 | Pax had no settlement location and three travel ticks remaining. | Verify that withdrawal is a real travel state rather than a visual label. | Attempt to rest. | The server rejected the command with `character-traveling`. |
| 2–5 | The map and footer reported travel toward Cinder Key. | Allow the forced withdrawal to complete without issuing local actions. | Advance three ticks. | Pax arrived at Cinder Key with 75 troops and direct, current local intelligence. |

## Outcome

The exploit is closed. Retreat no longer leaves Pax standing in hostile Crown Harbor. The party immediately moved to sea, followed an ordinary four-tick route to its nearest faction-controlled settlement, consumed the normal travel interval, and could not rest or perform other settlement actions en route. Arrival reused the existing travel and direct-observation systems rather than introducing a parallel recovery mechanism.

The persisted retreat event retained the original four-tick route while the live party state advanced to three remaining ticks during the same simulation interval. This confirms that later travel progress no longer mutates earlier event data.

## Evidence review

- **World report:** Pax retreated from Crown Harbor toward Cinder Key on day 0.2 and arrived on day 0.7. An autonomous Free Tide character independently used the same routing rule after retreating from Glassport.
- **Metrics:** World Government power was 2343.20 and Free Tide power was 1104.46 at tick 5; faction balance was secondary to spatial correctness.
- **Map:** Pax appeared on an active Crown Harbor-to-Cinder Key sea route during withdrawal and was located at Cinder Key after arrival.
- **Decision/agency traces:** Pax remained fully human-controlled while the other 29 named characters continued acting.
- **Combat traces:** The retreat event recorded destination `cinder-key`, a four-tick travel plan, high retreat risk, and 4 pursuit losses.
- **Conversation traces:** No messages were sent; conversation behavior was outside this experiment.
- **Recovery and determinism:** Reopening the playtest database replayed 602 post-snapshot events and recovered state hash `9b1ada159ca44c19e9720458c0ec4070afbe1a88fcef42100c5af8427f78b686`. The full gate passed 45 tests, three 72-tick seeds, and split-versus-uninterrupted recovery at hash `55565b30b1f57869c5dd61664bb21d3bb667609808bbc7d5cf3a5e1fea1ef35d`.

## Findings

### What worked

- The retreat destination was visible before the decision.
- Faction-controlled settlements took priority over slightly closer neutral ports.
- Retreat used the existing map route, travel duration, provisions, arrival, and observation systems.
- Local actions were unavailable while the party was at sea.
- Human and autonomous retreats followed the same rule.
- The event log preserved the original route independently of mutable live travel progress.

### Implementation defects

- **Fixed in `c403f42`:** retreating parties remained logically present at hostile settlements. They now leave immediately and begin forced travel toward a disclosed safe haven.
- **Fixed in `62cf505`:** live travel progress shared an object with earlier event data and could rewrite the recorded route. Reducers now clone travel state before mutating it.

### Design risks and opportunities

- The current destination priority is deterministic: nearest faction settlement, then neutral, then any alternate island. Future blockades, known danger, provisions, ship condition, and explicit pre-battle fallback orders should eventually influence the route.
- A world containing only the contested settlement would leave a retreating party in abstract open waters with no route. Production world generation should guarantee reachable fallback space or provide a rescue/drift state.
- Forced withdrawal currently begins immediately; pursuit is represented through losses rather than a chase visible on the map.

### Follow-up experiments

- Add a pre-battle fallback choice once fleets can select approach routes and offshore rally points.
- Verify retreat routing when the nearest friendly island is blockaded or becomes hostile during battle.
- Test provisions exhaustion during a long forced withdrawal.

## Recommendation

`PROMOTE`

Post-retreat positioning now has coherent spatial, command, persistence, and UI behavior. The next iteration can build richer route choice and pursuit on this foundation without leaving parties inside the settlements they just fled.
