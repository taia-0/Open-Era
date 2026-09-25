# Open Era design record

These documents capture the decisions made during the initial design conversation. They are the current product-direction source of truth; the codebase implements only a deliberately small subset.

- [Game vision](game-vision.md) — pillars, player experience, scale, presentation, and unresolved audience questions
- [World simulation](world-simulation.md) — factions, economy, settlements, troops, combat, progression, aging, captivity, and inheritance
- [Autonomous characters](autonomous-characters.md) — decision architecture, knowledge, memory, relationships, communication, and the bounded role of language models
- [UI and art direction](ui-art-direction.md) — map structure, information hierarchy, character treatment, screen inventory, and mockup status
- [Generated mockups](../assets/mockups/README.md) — all 13 image concepts produced during the conversation
- [Development and playtest pipeline](../development-pipeline.md) — branch roles, automated gates, adaptive player protocol, and promotion rules
- [Playtest template](../playtests/TEMPLATE.md) — evidence record for assistant and human sessions
- [Human commander playtest 001](../playtests/human-commander-001.md) — first adaptive player run and the design gaps it exposed
- [Promotion baseline playtest 001](../playtests/promotion-baseline-001.md) — public-interface conquest, stabilization, recovery, and promotion recommendation
- [Hidden state visibility 001](../playtests/hidden-state-visibility-001.md) — an adaptive session that found the player API leaking foreign motives, and the redaction work it tested
- [Hidden state visibility 002](../playtests/hidden-state-visibility-002.md) — the same objective with the leak closed, confirming no foreign state is reachable

## Decision status

The documents use these terms:

- **Decided** — explicitly selected during design discussion.
- **Prototype choice** — selected to make the current test build evaluable; it may change.
- **Open** — still needs a product decision.
- **Superseded** — retained for history but no longer describes the intended game.

When a generated image conflicts with these documents, the written decision record wins.
