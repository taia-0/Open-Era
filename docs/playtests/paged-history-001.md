# Playtest: paged history and discoverable constraints

## Session

- **Candidate commit:** `8bf60c8`
- **Date:** 2026-09-25 UTC
- **Operator:** Cursor general-purpose agent acting as an adaptive player, deliberately given no repository knowledge. It was forbidden from reading any repository file, opening any database, or inspecting source. Its only repository-adjacent action was fetching the **served** dashboard page (`GET /`) to learn the request body shape, which is itself a player-facing surface.
- **Interface:** Dashboard over HTTP, both the served page and the JSON API
- **Seed:** `1847`
- **Starting tick:** `0`
- **Ending tick:** `187` (day 31.2)
- **Player character:** Mara Vane

## Hypothesis and ambition

**Milestone hypothesis:** A player can audit what happened and learn the rules without leaving the interface or discovering constraints by failure.

**Player ambition:** Take a settlement from a rival faction, then go back over the whole campaign and answer specific questions about it — "what happened between tick 20 and 40?" — from the interface alone, and quantify how much of the world the projection actually withholds.

**Success signal:** The entire history is retrievable page by page with no gaps and no duplicates, every withheld event is withheld in full, and the capability block is sufficient to issue a valid command without a rejection.

## Adaptive decision log

| Tick | Player-visible observation | Reasoning | Action | Outcome |
| ---: | --- | --- | --- | --- |
| 0 | `tick=0`, money 108, troops 80, at Crown Harbor, `eventFeed.total=0` | An empty feed is a clean baseline for the audit | Reconnaissance `GET /api/state` | 4 settlements, 30 characters, factions `world-government` (mine) and `free-tide` |
| 0 | `capabilities.actions` lists `recruit` requiring ≥30 money and ≥2 arms; Crown Harbor holds 155 arms | Recruiting is the cheapest strength available | `character-action: recruit` | `202` accepted; feed `total` rose 0 → 1 |
| 0 | One advance tick returned 134 events, all `payloadWithheld: true` | Redaction is per-event, not per-page | `POST /api/advance {"ticks":6}` | Tick 6, **703** events; `recruited` exposed `{quantity:8, cost:96, troopCount:88}` |
| 6 | `briefing.attentionCount=11`, 5 items reading "Completion needs confirmation" | Free officer capacity by closing completed orders | 5 order confirmations | All accepted; five of them failed a tick later (see Findings) |
| 7 | My own character id satisfies `data.issuerId` for orders I issued | Enlisted officers can soften the target while I build | 2 × `issue-order {directive:"pressure", targetId:"free-tide"}` | Issued to characters 06 and 11; both expired unfulfilled at tick 79 |
| 7–12 | `worked` exposed `{gross:20.15, tax:2.82, characterMoney:46.66, factionTreasury:18035.51}` | Need 96 money for the next recruit | 4 × `work` plus advances | Money 12 → 98.65; second recruit → **96 troops** |
| 12 | `travel-started` exposed `{totalTicks:5, remainingTicks:5}` | Cinder Key is the only hostile port reachable | `character-action: travel targetId=cinder-key` | Arrived tick 16; provisions draining 0.508/tick |
| 18 | `combatForecast`: outlook `favored`, winChance `57.666–75.023`, defender `110.6–160.7` against my `218.9–332.2`, 3 phases, factors including "defensive ground estimated near 1.13×" | Forecast favours a raid; garrison 111 against my 96 troops | `raid` | `battle-002170`; `advance` replied `pausedForBattle:true` |
| 20 | Phase log: attacker advantage in phases 1 and 2 (my −4 each, theirs −19 and −21) | Push to a conclusion | 3 × `advance` | Victory; garrison 111 → 49; goal evolved to `expand-influence` |
| 21–25 | Garrison 49 → 19 → 7 → 3; `surrenderOffered` flipped to `true`; money 255.45 | Surrender is the gate to claiming | 3 × `raid` | Surrender offered at garrison 3 |
| 26 | `surrenderOffered:true` but the `surrender` payload was `null` | Do not wait for detail; claim | `claim-settlement` | `settlement-claimed`: Cinder Key `ownerId:character-01`, population 6400, focus `shipMaterials` |
| 27 | `capabilities` never mentions `playerId` or any body field name | Probe the contract for gaps | 12 rejection probes | Documented below. One probe, `ticks:144`, was **accepted** and advanced the world 27 → 171 |
| 72 | `character-upkeep` shows provisions 0 and a first `shortage` of 0.084 | The cargo ran dry after 45 ticks of upkeep | Nothing (noticed only in the audit) | Starvation began: health −0.406/tick, morale −1.219/tick |
| 154 | `morale:0`, and it never rises again | Morale appears clamped | 3 × `rest` | Health 36.1 → 55.3 (+1.6/tick); morale stayed 0 |
| 183 | Cinder Key's local provisions stock is 0.063 | A `shipMaterials` port cannot resupply me | `trade-local` | Money +10.66 → 266.11; provisions still 0; `buy-provisions` rejected |
| 183–187 | Full-history sweep: 205 pages, 20,457 events, sequences 1 → 20457 | The audit question the milestone names | Paged the entire feed and diffed adjacent pages | Zero gaps, zero overlaps; `hasMore` flipped `false` at the last page |

## Outcome

Mara recruited, worked the local market, sailed a five-tick run to Cinder Key, ground a 111-strong garrison to 3 through four raids, and took the settlement when it offered terms. She then spent the remaining session doing what the milestone actually asked: auditing. She pulled the entire event history back out of the interface one page at a time — 205 requests covering 20,457 events — and cross-checked how much of it was redacted, which constraints she could have learned without failing, and what the advance call told her after each step.

Her own summary is the load-bearing sentence for this milestone: the capability block told her the game's rules before she tried anything, but nothing told her the *host contract*, so she recovered the request body shape by reading the served dashboard page. She also ran the world to tick 187 almost by accident, because a bound probe of `ticks:144` was legitimately accepted; that overshoot is what made the audit long enough to be worth doing.

## Evidence review

- **World report:** The recovered world reached tick 187 (day 31.2) with 29 autonomous characters and 1 human-controlled character, 22,391 persisted events across 48 snapshots, 657 journeys, 1,020 market trades, 10 completed battles, 3 successful retreats, 2 captures, 0 dangerous escapes and 1 mandatory release. 31 player commands were accepted and 26 resolved. Report and map at `simulation-output/playtests/paged-history-001/`.
- **Metrics:** World Government finished at 2,708.36 power, 23,129.79 treasury and 3 settlements. Free Tide Compact finished at 1,215.5 power, 2,933.85 treasury and 0 settlements. Free Tide's true power was never visible to the player, whose projection reported `null` for it all session.
- **Map:** Generated from the recovered world and shows the change in island ownership.
- **Decision/agency traces:** 475 plan reviews and 1,033 direct knowledge updates; 43 plan-time order assessments with 16 accepted and 7 refused; 28 reported deviations, 26 resumptions, 14 completion reports and 6 issuer confirmations; 10 goals reshaped and 444 relationship changes.
- **Conversation traces:** No player messages were sent, so this session again does not exercise reply timing or relevance.
- **Recovery and determinism:** Recovering the world and regenerating reports at tick 187 replayed 118 post-snapshot events and reproduced state hash `7df72938b78e44f3894bdea94403d581bb656274546ae871b770d0dd3e9af580`. It differs from the headless gate hash because 31 player commands legitimately changed history.

### Independent verification of the paging and redaction claims

The player's audit was re-checked directly against this session's event store, not taken on trust.

| Measure | Result |
| --- | ---: |
| Pages fetched | 205 |
| Events retrieved | 20,457 |
| Sequence gaps across `1..20458` | 0 |
| Duplicates across adjacent pages | 0 |
| Events withheld (`payloadWithheld`) | 19,108 of 20,457 (93.4%) |
| Withheld events carrying a payload | 0 |
| Exposed events with `data == null` | 0 |
| Distinct key-sets across all 20,457 events | 6 |

The apparent contradiction the player reported — the same event type appearing both withheld and exposed — resolves into one rule keyed on ownership and issuance, not on type. `settlement-produced` split exactly by faction ownership (exposed for Crown Harbor and Glassport, withheld for Cinder Key and Verdant Cay). `character-upkeep` was exposed for `character-01` and withheld for the other 29 characters. All 19 exposed `standing-order-*` events carried `data.issuerId:"character-01"`.

**One allowance was exercised and is now covered by observation, not only by unit tests.** Distant battles no longer raise a per-settlement flag; that is a later revision, not this session's build.

## Findings

### What worked

- **Paged history is production-grade.** Zero gaps and zero overlaps across 20,457 events, a `cursor` that is always the oldest sequence in the page, and `hasMore` that flips to `false` exactly at the start of the log. The player answered "what happened between tick 20 and 40?" with 2,428 events and no reconstruction. This is the milestone's hypothesis, demonstrated rather than asserted.
- **Redaction held under a full-log audit.** Withholding is complete (no withheld event leaked a payload) and consistent (the ownership rule explains every divergence between same-type events). That is a much stronger result than spot-checking the newest page, and it is the first time the rule has been verified across an entire history.
- **The capability block does carry the game's rules.** Nine actions with per-action `requires`, declared limits, four directives, three order preconditions and seven command types. The declared default for `priority` (0.78) was accurate: an `issue-order` with no priority was accepted and stored `0.78`.
- **Advance diffs are sufficient for the player's own chain.** `pausedForBattle` fired exactly on commanded battles mid-flight, and single-tick diffs carried full payloads for the player's own effects, so no follow-up fetch was needed for money, troops or health.

### Implementation defects

- **`capabilities` was silent about the entire host contract.** It documented what a command *means* but not what to *send*: `playerId`, every body field name (`type`, `action`, `targetId`, `characterId`, `directive`, `priority`, `expiresInTicks`, `orderId`, `battleId`), and the feed's `limit` and `beforeSequence` ranges. The player recovered them by reading the served dashboard page. **Fixed** on this branch: state now publishes `capabilities.requests`, naming every field, and the page bounds it publishes are the bounds the server enforces, asserted by test.
- **`/api/state` and `/api/advance` rejections carried prose but no `code`**, while `/api/commands` rejections carried both, so a client could branch on one endpoint's failures and not the other's. **Fixed** on this branch.
- **A non-uniform settlement schema.** `verdant-cay` was missing the `surrender` key that owned settlements inherit, which crashed the player's client with `KeyError: 'surrender'`. The foreign projection is a hand-built literal; it now projects the same key set as the owned branch, asserted by test rather than trusted.
- **An unrecognised command `type` reported `unknown-character` / "The order recipient is unknown"**, because such a request also carries no `characterId` and fell through to order cancellation. **Fixed** on this branch: it reports `unknown-type` and names the types that exist.
- **`cannot-buy` and `cannot-recruit` merged "cannot afford it" with "it is not available"**, leaving the player unable to tell which. **Fixed** on this branch: they are now `insufficient-money` and `no-arms` / `no-provisions`.

### Design risks and opportunities

- **A silent starvation spiral with an unrecoverable morale floor.** Provisions drain 0.508/tick, and when they reach zero health decays −0.406/tick and morale −1.219/tick, but the briefing never raised a provisioning item for it. Morale reached 0 at tick 154 and did not respond to `rest` at all, which reads as a soft-lock rather than a penalty. This is a pre-existing simulation-design defect that this branch neither introduced nor addresses; it is recorded here because it is the most consequential thing the session found, and it blocks a long campaign from being a fair test of anything else.
- **Duplicate pending commands are accepted and resolved as a race.** The player issued ten `confirm-order` commands covering five orders, in pairs. Both members of each pair were accepted, and the second reported `player-command-failed` with the reason "the completion report is no longer awaiting this issuer". The reason is clear, so this is not a discoverability defect, but the redundant command was preventable at submission: two pending commands targeting the same `orderId` are knowably contradictory. Verified in the event store at sequences 704–713 (accepted) and 724–737 (resolved/failed).
- **`briefing.attentionCount` did not match the number of items returned** (11 against 10), and seven near-identical "standing order deviated" entries for one character were listed separately rather than aggregated. Attention count is the player's only signal that something needs a decision, so a mismatch there is a decision-making hazard, not cosmetic.
- **Withheld events still expose `actorId`, `targetId`, `settlementId` and `tick`.** That is arguably a deliberate middle ground and it is what keeps the world legible — the player could read "Pax Ash: battle started at Crown Harbor" without any numbers. It should be written down as a decision rather than left as an accident.
- **The feed has no tick-range or type filter.** Answering "what happened between tick 20 and 40" required paging and filtering client-side. With 200-event pages and a 22,391-event history that is 205 requests for a question a range parameter would answer in one.

### Follow-up experiments

- Add a tick-range or event-type filter to the feed, then repeat an audit question and compare the number of requests taken.
- Decide whether the starvation and morale floors are intended; if morale can be pinned at zero permanently, either give it a recovery path or make the collapse terminal and explicit.
- Write down the metadata-disclosure rule (`actorId`/`targetId`/`settlementId` visible, payload withheld) as an explicit decision with a test, since it now behaves consistently but is not documented anywhere a player can read.
- Reproduce the duplicate-confirmation race deliberately and decide whether the validator should reject a second pending command for the same `orderId`.

## Recommendation

`PROMOTE` **on the revision**, `REVISE` as run.

The session as recorded returned `REVISE`, for two reasons: the capability block did not document the host contract, and the starvation/morale behaviour blocks a long campaign. The first was an unambiguous defect in this branch and is fixed here, with tests asserting that the published limits are the enforced limits and that the settlement schema is uniform. The second is a pre-existing simulation defect that this branch does not touch, and it is recorded as a roadmap item rather than fixed under a milestone about observability.

With the host contract published, the hypothesis holds and is demonstrated at a scale previous sessions could not reach: a player with no repository knowledge retrieved and verified its own complete 20,457-event history, with zero gaps, zero duplicates and zero payload leaks, using only the interface.

Promotion is for this branch's hypothesis only. Assembling a `promotion/main-vN` candidate remains a separate step and requires the owner's explicit approval of that exact commit per the pipeline.
