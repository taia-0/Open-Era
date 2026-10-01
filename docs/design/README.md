# Open Era design record

These documents capture the decisions made during the initial design conversation. They are the current product-direction source of truth; the codebase implements only a deliberately small subset. [Roadmap](../roadmap.md) lists the described systems that have no implementation yet, so an absence in the code is never mistaken for a foundation that exists.

- [Game vision](game-vision.md) — pillars, player experience, scale, presentation, and unresolved audience questions
- [World simulation](world-simulation.md) — factions, economy, settlements, troops, combat, progression, aging, captivity, and inheritance
- [Autonomous characters](autonomous-characters.md) — decision architecture, knowledge, memory, relationships, communication, and the bounded role of language models
- [UI and art direction](ui-art-direction.md) — map structure, information hierarchy, character treatment, screen inventory, and mockup status
- [Reconnaissance](reconnaissance.md) — Open / investigation, except the survey slice, which M18 built and M18.1 made readable: earned, dated knowledge of rival strength, with provenance
- [Party sightings](party-sightings.md) — Built in M21: a dated troop count and party power for parties anchored at a surveyed port, or delivered by a targeted explore
- [Sea sightings](sea-sightings.md) — Open / proposal: what a captain learns from a ship met on a voyage, derived when the state is read and left out of the hash
- [Captive intelligence](captive-intelligence.md) — Built in M33: a captor reads leadership, the captured troop count, and the port beliefs the prisoner already carries. The prison is stored once, at release. The planner does not read either record. The note itself is still marked Open
- [M33 release record](m33-release-record.md) — Open / design note: a field on `captivity-released`, or a derivation inside its reducer, so replay from a pre-release snapshot keeps the prison record
- [Raid floor](raid-floor.md) — Open / proposal: the slope-10 surrender slide, accepted as M19, so a battered port can change hands once
- [Garrison recovery](garrison-recovery.md) — Built in M20: a fed settlement under its population ceiling regains one soldier on a world-tick interval
- [Landless faction](landless-faction.md) — M23 built the protect predicate: a protect order completes only while the officer's faction holds the port. A faction with no ports remains. Playtest pending. The rest of the note is still a proposal
- [Port provisions](port-provisions.md) — Open / proposal: Crown Harbor's ration outruns its fields once stability slips, and the claim leaves a port that cannot regrow
- [Portless recovery](portless-recovery.md) — Open / proposal: a landless faction may raid a hostile port once it has 8 soldiers, and the claim keeps the garrison the fight left
- [Battle morale](battle-morale.md) — Built in M29: a finished major with a higher attacker score is the attacker's victory, including when morale ended it at 12 or under. Surrender and the immediate-battle rule stay
- [Port churn and captures](port-churn-and-captures.md) — Open / diagnosis: a claim leaves the garrison the fight left, Crown Harbor on 1847 changes hands again within two ticks, and captures fall once M28 and M29 are both on
- [Captures under M29](captures-under-m29.md) — Open / proposal: an outscore win keeps the attacker's victory and spends the capture roll it already draws on the losing faction's officer standing on the port
- [Capture wording](capture-wording.md) — Open / proposal: name the captor, say a dock prisoner was taken after the other side won on a higher score, and say who covers a captive commander's seat
- [Autonomous provisioning](autonomous-provisioning.md) — Open / proposal: the 16% depth cap does not stop captains emptying a small port, and a reserve that they cannot buy below makes the crews hungrier
- [Contracts](contracts.md) — Open / proposal: a paid provisions delivery the sim would enforce, once a standing order is one job rather than two
- [Order confirmation](order-confirmation.md) — Open / proposal: a completion report closes when its issuer signs it, or after a day when nobody can
- [Captivity debts](captivity-debts.md) — Open / proposal: the unpaid ransom comes out of the prisoner's purse, up to one day's wages, on each world day
- [Ransom split](ransom-split.md) — Built: a faction captor's treasury receives the whole ransom. A factionless leader still receives all of it. The 2026-10-01 addendum supersedes the 50/50 split
- [Treasury spending](treasury-spending.md) — Open / proposal: a faction ransom goes entirely to the treasury, and the command holder spends it while other members spend a daily allowance
- [Political layer](political-layer.md) — Built in M30: the person who already issues a faction's orders is named in command, and a captive commander's seat is covered until release
- [Loyalty drift](loyalty-drift.md) — Open / proposal: loyalty falls by 0.04 when a release leaves the ransom unpaid, and nothing else reads that change except who covers the seat
- [Loyalty scar remeasure](loyalty-scar-remeasure.md) — Open / remeasure: with the dock rule patched on and M30's cover sort live, a −0.04 unpaid-release scar does not rename a cover or move the 72-tick fixture
- [Autonomous orders](autonomous-orders.md) — Open / proposal: Free Tide does not mint protect orders after tick 0; once a report has closed, the four-day sketch accepts the next one and rewrites the first 72 ticks
- [Autonomous orders after M29](autonomous-orders-after-m29.md) — Open / proposal: remeasured with the landless raid and the outscore rule both on; the four-day sketch still rewrites the first 72 ticks, and a protect order does not settle Crown Harbor
- [Owner questions](owner-questions.md) — Open: the decisions still waiting on Micah, each with the default the game runs on or is planned to run on
- [Generated mockups](../assets/mockups/README.md) — all 13 image concepts produced during the conversation
- [Development and playtest pipeline](../development-pipeline.md) — branch roles, automated gates, adaptive player protocol, and promotion rules
- [Roadmap](../roadmap.md) — documented systems that are not built, and whether their deferral is recorded anywhere

## Evidence record

Every playtest below is evidence for a capability the project claims. Several are the *only* evidence for the feature they cover, so this index is the map from claim to proof.

| Record | Evidence for |
| --- | --- |
| [Playtest template](../playtests/TEMPLATE.md) | The required shape of an evidence record |
| [Human commander 001](../playtests/human-commander-001.md) | First adaptive player run, and the design gaps it exposed |
| [Human commander 002](../playtests/human-commander-002.md) | Sandbox conquest: four raids through surrender to a personal claim |
| [Human commander 003](../playtests/human-commander-003.md) | The durable delegated-order lifecycle |
| [Human commander 004](../playtests/human-commander-004.md) | Order amendment, and a busy check-in routed through a reporting officer |
| [Promotion baseline 001](../playtests/promotion-baseline-001.md) | Public-interface conquest, stabilization, recovery, and a promotion recommendation |
| [Informed combat 001](../playtests/informed-combat-001.md) | Strategy-scaled forecast and phased battle supporting an informed commit or retreat |
| [Human retreat 001](../playtests/human-retreat-001.md) | Recognising a deteriorating attack and withdrawing deliberately |
| [Post-retreat route 001](../playtests/post-retreat-route-001.md) | Retreat as physical withdrawal with a disclosed destination and forced travel |
| [Captivity escape 001](../playtests/captivity-escape-001.md) | Guaranteed-but-dangerous escape and the gradual return of scattered troops |
| [Captivity release 001](../playtests/captivity-release-001.md) | Refusing escape cannot soft-lock the player; bounded mandatory release |
| [Hidden state visibility 001](../playtests/hidden-state-visibility-001.md) | An adaptive session that found the player API leaking foreign motives |
| [Hidden state visibility 002](../playtests/hidden-state-visibility-002.md) | The same objective with the leak closed, confirming no foreign state is reachable |
| [Paged history 001](../playtests/paged-history-001.md) | Full-history auditability: 20,457 events with no gaps or duplicates, and 93.4% withheld with no payload leaked |
| [Informed commitment 001](../playtests/informed-commitment-001.md) | Deciding before travel from earned knowledge, and four failed attempts to invert the forecast into ground truth |
| [Informed commitment 002](../playtests/informed-commitment-002.md) | The same ambition decided from an officer's survey of a never-visited port, then the same inversion protocol |
| [Survey polish 001](../playtests/survey-polish-001.md) | A remote garrison labelled with its age, one beach fortification, an officer already there, and a refused short-purse voyage |
| [Raid floor 001](../playtests/raid-floor-001.md) | Glassport and Cinder Key each change hands once under the slope-10 surrender line, and the offer is not readable offshore |
| [Garrison regrowth 001](../playtests/garrison-regrowth-001.md) | Cinder Key is claimed a second time after its garrison climbs through 15, and at tick 150 the remote garrison is still not live |
| [Party sightings 001](../playtests/party-sightings-001.md) | A targeted explore of Cinder Key delivers anchored troop counts that stay put after a party sails |
| [Autonomous short purse 001](../playtests/autonomous-short-purse-001.md) | Jun Ash, holding 4.77 against passages of 12 and 15, works instead of sailing, then sails once the purse covers the quote |
| [Own party 001](../playtests/own-party-001.md) | A party's own provisioning trajectory is legible before it bites, and the push warning precedes the shortage; also the first evidence that trade cannot be pursued |
| [Economy pacing 001](../playtests/economy-pacing-001.md) | A round trip in arms and medicine beats the same ticks of work, with tax, passage, depth, and price expiry visible before they bind |
| [Economy pacing 002](../playtests/economy-pacing-002.md) | Confirmation on `405ad6b`: the same route still beats work, and the hold, the sales tax, the whole-unit cap, the drift, and the rumor age were checked in play |

## Decision status

The documents use these terms:

- **Decided** — explicitly selected during design discussion.
- **Prototype choice** — selected to make the current test build evaluable; it may change.
- **Open** — still needs a product decision.
- **Superseded** — retained for history but no longer describes the intended game.

When a generated image conflicts with these documents, the written decision record wins.
