# Roadmap: documented but not built

The [design record](design/README.md) describes the intended game. The codebase implements a deliberately small subset, which is correct for a project of this size. The problem this document solves is narrower: several described systems have **no deferral recorded anywhere**. The root [README](../README.md#current-boundary) names its own boundary, and the [design record](design/README.md) names some deferrals inline, but the rest were only discoverable by reading all 490 lines of design documentation and cross-checking the source.

This file collects them so absence is visible in one place.

## How to read this

| Status | Meaning |
| --- | --- |
| **Untracked** | The design describes this as current or intended direction, but no boundary entry or open item records that it is absent. A reader of the design record would reasonably expect it to exist. |
| **Tracked deferred** | The deferral is already stated explicitly, either in [README#current-boundary](../README.md#current-boundary) or in the design text itself. Listed here only for completeness. |

Absence is not a defect. An untracked absence is a documentation gap, not a missing feature — it becomes a problem only when someone plans work from the design record and assumes a foundation that is not there.

## Systems with no implementation

### Politics and ownership

| System | Source | Status | Note |
| --- | --- | --- | --- |
| Settlement secession and independence | [world-simulation.md:55-68](design/world-simulation.md) | Untracked | The only occurrence of "secede" in `src/` is a message tag keyword. Separation, the resulting war, and population decisions are all unmodelled. |
| Faction creation, alliance-breaking, enabling rebellion | [game-vision.md:13](design/game-vision.md) | Untracked | Named as primary ways to change political power. "Alliance" exists only as a message tag. |
| Offices, rank, appointments, patronage, law | [world-simulation.md:18-26](design/world-simulation.md) | Untracked | No `office`, `appointment`, `patronage`, `governor`, or `law` token in `src/`. |
| Deputy authorization guardrails | [world-simulation.md:26](design/world-simulation.md) | Untracked | The design itself says this "needs explicit authorization guardrails before production". Currently no deputy can perform high-impact acts at all. |
| Ownership by founding, colonizing, purchasing, negotiated transfer, or faction grant | [world-simulation.md:57](design/world-simulation.md) | Untracked | Five legal routes are listed; only conquest plus claim exists. |
| Leader-set tax rate | [world-simulation.md:51](design/world-simulation.md) | Untracked | `taxRate` is a static scenario constant read during production. No command sets it. |
| Occupation, negotiated transfer, population response after conquest | [world-simulation.md:69](design/world-simulation.md) | Tracked deferred | Stated inline as remaining deferred. |

### Characters

| System | Source | Status | Note |
| --- | --- | --- | --- |
| Three memory layers (working, episodic, identity) | [autonomous-characters.md:80-88](design/autonomous-characters.md) | Untracked | No `episodic`, `identityMemory`, or `workingContext` token in `src/`. Characters currently retrieve from the event log and their knowledge map. |
| Aging, age penalties, death by old age, inheritance | [world-simulation.md:143-145](design/world-simulation.md), [game-vision.md:63](design/game-vision.md) | Untracked | No character age exists. The design says death enters *only* through old age, so in the current build effectively nothing kills a named character. |
| Attribute and skill progression | [world-simulation.md:113](design/world-simulation.md), [:133](design/world-simulation.md) | Untracked | Attributes and skills are only ever read in formulas. No increment site exists in `src/sim`. |
| Named-character lifecycle | [autonomous-characters.md:96-100](design/autonomous-characters.md) | Untracked | Ordinary-to-named promotion, retirement, and return are unmodelled. |
| Lost-technology powers | [world-simulation.md:117-119](design/world-simulation.md) | Tracked deferred | Named in the root README boundary as "lost technology". |
| Inner strength and schools | [world-simulation.md:122-131](design/world-simulation.md) | Tracked deferred | Named in the root README boundary as "inner strength". |
| Full negotiation, debt enforcement, rescue missions | [world-simulation.md:139](design/world-simulation.md) | Tracked deferred | Stated inline as later milestones; also in the root README boundary. |

### Troops

| System | Source | Status | Note |
| --- | --- | --- | --- |
| Player-chosen troop promotion | [world-simulation.md:78](design/world-simulation.md) | Untracked | Troops carry a static `experience` scalar. No promotion decision exists. |
| Recruit rarity (common, rare, epic) | [world-simulation.md:79-81](design/world-simulation.md) | Untracked | No `rarity` token in `src/`. |
| Troop officers running detached parties | [world-simulation.md:81](design/world-simulation.md) | Untracked | No detached-party concept. |
| Elemental or ability-matchup counters | [world-simulation.md:101](design/world-simulation.md) | Tracked deferred | Stated inline as excluded from the core design. |

### Information and communication

| System | Source | Status | Note |
| --- | --- | --- | --- |
| Searchable daily news database | [autonomous-characters.md:92-94](design/autonomous-characters.md), [game-vision.md:43](design/game-vision.md) | Untracked | No `news` token anywhere in `src/`. The design is explicit that news must not become a free global intelligence feed, so this is a mechanic with its own safety requirement. |
| Player-directed exploration or investigation | [game-vision.md:27](design/game-vision.md) | Untracked | Listed as a core check-in choice. The player action set has no exploration verb; only a delegated `explore` order directive exists. |
| Rival strength estimation through investigation | [game-vision.md:43](design/game-vision.md) | Tracked open | Recorded in [progress.md](../progress.md) open items. Knowledge is settlement-scoped only, so no channel exists for characters, parties, or factions. |
| Structured negotiation outcomes (proposals, agreements, contracts) | [ui-art-direction.md:84](design/ui-art-direction.md), [autonomous-characters.md:133](design/autonomous-characters.md) | Untracked | No `agreement`, `proposal`, or `contract` object. Messages are text plus tags. The design reserves a separate authorized command workflow for language-model-proposed actions; that workflow does not exist. |
| Currency politics | [world-simulation.md:47](design/world-simulation.md) | Tracked deferred | Stated inline as absent from the first design. |

## Relationship to the open-items table

[progress.md](../progress.md) tracks defects and gaps that a session has **raised**, with an owner and a status. This document is different: it tracks systems the design **promises**, whether or not anyone has looked for them yet. An item can appear in both, and the estimation channel currently does.

When work lands on any item here, update this table and record the milestone in [progress.md](../progress.md). When a new system is deliberately deferred, record it either in [README#current-boundary](../README.md#current-boundary) or here.
