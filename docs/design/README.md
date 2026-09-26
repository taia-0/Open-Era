# Open Era design record

These documents capture the decisions made during the initial design conversation. They are the current product-direction source of truth; the codebase implements only a deliberately small subset. [Roadmap](../roadmap.md) lists the described systems that have no implementation yet, so an absence in the code is never mistaken for a foundation that exists.

- [Game vision](game-vision.md) — pillars, player experience, scale, presentation, and unresolved audience questions
- [World simulation](world-simulation.md) — factions, economy, settlements, troops, combat, progression, aging, captivity, and inheritance
- [Autonomous characters](autonomous-characters.md) — decision architecture, knowledge, memory, relationships, communication, and the bounded role of language models
- [UI and art direction](ui-art-direction.md) — map structure, information hierarchy, character treatment, screen inventory, and mockup status
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
| [Own party 001](../playtests/own-party-001.md) | A party's own provisioning trajectory is legible before it bites, and the push warning precedes the shortage; also the first evidence that trade cannot be pursued |
| [Trade voyage 001](../playtests/trade-voyage-001.md) | Quantity-controlled four-resource trading and a voyage that pays for itself |
| [Captivity negotiation 001](../playtests/captivity-negotiation-001.md) | Persuasion through delayed messages, qualitative captor feedback, structured terms, and negotiated release |

## Decision status

The documents use these terms:

- **Decided** — explicitly selected during design discussion.
- **Prototype choice** — selected to make the current test build evaluable; it may change.
- **Open** — still needs a product decision.
- **Superseded** — retained for history but no longer describes the intended game.

When a generated image conflicts with these documents, the written decision record wins.
