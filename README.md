# Open Era

Open Era is a persistent maritime political sandbox in which human players and autonomous characters pursue their own ambitions in the same continuously simulated world.

The accumulated product decisions and visual concepts are preserved in the [design record](docs/design/README.md) and [generated mockup catalog](docs/assets/mockups/README.md). Behavioral findings are recorded in the [human commander playtests](docs/playtests/), and future candidates follow the [branch, evaluation, and adaptive-playtest pipeline](docs/development-pipeline.md).

This branch contains the first **headless world prototype**. It is intentionally focused on simulation behavior rather than presentation: we can accelerate days of world activity, inspect why characters made decisions, stop and restart the process, and compare outcomes before committing to the mobile UI or networking stack.

## What the prototype exercises

- 30 persistent named autonomous characters with personality-weighted decisions
- Four islands, including a dominant World Government and a smaller rival faction
- Four abstract resources: provisions, arms, medicine, and ship materials
- Local production, consumption, shortages, supply-and-demand prices, and territorial taxes
- Party provisions, sailors, troop recruitment, morale, and attrition
- Physical travel between islands and merchant arbitrage
- Character-plus-troop combat against settlement garrisons, with quick skirmishes and persistent three-phase major battles
- Strategy-scaled combat forecasts covering outcome, losses, force balance, withdrawal, and capture exposure
- Player retreat decisions at major-battle phase boundaries; accelerated time pauses for each decision
- Surrender thresholds, deliberate settlement claims, and personal conqueror ownership
- Persistent personality-rooted goals and structured multi-tick plans
- Imperfect island knowledge that becomes stale and refreshes through direct observation
- Trust, affinity, respect, fear, grievance, and obligation between characters
- Standing orders with durable acceptance, refusal, deviation, resumption, completion-report, confirmation, and expiry states
- Validated order amendments and cancellations; major objective changes require fresh character acceptance
- Goals and relationships that change after victories, defeats, and shared local experiences
- A human-controlled commander who never receives autonomous decisions
- Server-validated direct actions and durable player-issued standing orders
- A local interactive map for inspection, commands, and accelerated time
- Persistent direct messages and group chats shared by human and autonomous characters
- Deterministic reply windows based on activity, urgency, relationships, and seeded variation
- Server-validated message tags, light throttling, prompt-injection deterrence, and accumulated player conversation tags
- A replaceable dialogue-provider boundary whose output cannot directly mutate simulation state
- Player-safe foreign settlement projections derived from the commander's imperfect knowledge
- Deterministic seeded outcomes with detailed decision traces
- SQLite event persistence, daily snapshots, state hashes, and crash recovery
- Markdown, CSV, JSONL, JSON, and SVG evaluation outputs

The simulation core uses only Node.js APIs. There are no third-party runtime dependencies yet.

## Requirements

- Node.js 24 or newer

## Run it

```bash
npm run simulate -- --ticks 72 --reset
```

The default run advances twelve in-world days and writes:

- `simulation-output/latest/report.md` — readable world chronicle and final balance
- `simulation-output/latest/map.svg` — map of islands, parties, and active routes
- `simulation-output/latest/decision-traces.jsonl` — scored alternatives behind every decision
- `simulation-output/latest/agency-traces.jsonl` — plan reviews, beliefs, evolving goals, and relationships
- `simulation-output/latest/conversation-traces.jsonl` — threads, messages, reply schedules, response tags, and discarded action proposals
- `simulation-output/latest/combat-traces.jsonl` — starting forecasts, phase results, retreats, and final battle outcomes
- `simulation-output/latest/metrics.csv` — faction power, treasury, and resource trends
- `simulation-output/latest/final-state.json` — complete inspectable world state
- `.open-era/world.sqlite` — durable event log and snapshots

Run the command again without `--reset` to recover the stored world and continue it:

```bash
npm run simulate -- --ticks 24
```

## Use the interactive dashboard

```bash
npm run dashboard -- --reset
```

Open `http://127.0.0.1:4317`. The dashboard provides:

- A minimal top-down map with four selectable islands and moving parties
- Exact owned-party condition, cargo, troops, money, and travel progress
- Island resources, prices, stability, garrisons, and parties present
- Character goals, plans, relationships, knowledge, and order responses
- Persistent DMs and group chats with visible autonomous response windows
- Direct player actions such as travel, trade, recruitment, work, and rest
- Standing orders that autonomous faction members may accept, refuse, temporarily deviate from, resume, and report complete
- An exception-first check-in briefing with completion confirmations, deviations, failures, shortages, battles, and stale intelligence
- Persistent briefing acknowledgements and subordinate officers who bundle routine reports without gaining command authority
- Accelerated time controls and a live world-event feed
- Compact pre-battle forecasts and phase-by-phase retreat windows for major battles

Player actions are validated by the simulation server and persisted before execution. The dashboard binds to loopback by default and intentionally has no production authentication; it is a local development observer, not a deployable multiplayer server.

Useful options:

```text
--ticks, -t       ticks to advance (six ticks equal one day)
--seed, -s        deterministic seed for a new world
--database, -d    SQLite world path
--output, -o      report directory
--reset           replace the selected local simulation database
```

## Verify it

```bash
npm test
```

The tests prove seeded determinism, divergent seeded histories, snapshot-plus-event recovery, ordered event sequences, and coverage of the connected economy, movement, decision, and battle systems.

## Architecture

```text
src/sim/scenario.ts      deterministic pressure-test world
src/sim/agency.ts        goals, plans, beliefs, relationships, orders
src/sim/commands.ts      validated and durable human command boundary
src/sim/briefing.ts      persisted acknowledgements and reporting-officer assignment
src/sim/conversations.ts persistent threads, timing, tags, safeguards, dialogue adapter
src/sim/combat.ts        strategy-scaled forecasts and combat risk assessment
src/sim/engine.ts        decisions, economy, travel, and combat resolution
src/sim/state.ts         event reducer, derived values, state hashing
src/sim/persistence.ts   SQLite event log, atomic ticks, snapshots
src/sim/reports.ts       human- and machine-readable evaluation output
src/cli/                 disposable headless runner
src/dashboard/           local browser map, inspector, and command API
tests/                   determinism and recovery checks
```

The simulation files are intended to survive into the production server. The CLI and report generator are diagnostic adapters; a future Expo client can observe this state through an API without moving game rules into the UI.

## Current boundary

This is a behavioral probe, not a complete game. The dialogue adapter currently uses deterministic prototype replies rather than a paid LLM. Deeper personality branching, faction offices, settlement management, debt, captivity, lost technology, inner strength, inheritance, multiplayer authentication, and production networking are still deferred. The current dashboard is deliberately local and the player begins as a World Government commander so command acceptance, refusal, and asynchronous communication can be exercised immediately.
