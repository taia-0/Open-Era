# Progress log

This is the shared working log for Open Era. It records what changed, why, who or which agent changed it, and what has actually been verified.

Git remains the complete history. This file exists for three things git does not hold:

1. **Attribution.** Every commit is authored by `Micah Heneveld`, so the repository cannot distinguish work by the ChatGPT partner, Codex, or Cursor. Entries name the agent explicitly.
2. **Intent and verification status.** A commit message says what changed; it rarely says what was proven and what was assumed.
3. **Handoff.** The current-state and open-items sections are what a returning agent should read first.

## How to use this file

- Newest entry first. One entry per meaningful change, not per commit.
- Link commits, playtests, and design documents rather than restating them.
- `Verified` must be honest. Write `unverified` when nothing proves the claim yet.
- Promote durable findings into the [design record](docs/design/README.md) or the [pipeline](docs/development-pipeline.md); this log is the running account, not the source of truth.
- Keep `Current state` and `Open items` short and maintained. They are not an archive.

### Entry format

```text
### YYYY-MM-DD — Short title
- Agent / Branch / Commits / Type
- Changed  — what is different now
- Why      — the problem it solves
- Verified — tests, typecheck, gate, playtest, or "unverified"
- Left open — follow-ups, or "None observed"
- Links    — PR, playtest, design doc
```

## Current state

- **Branch in flight:** `feature/phase-0-baseline`, off `main` at `1b020c5`.
- **Last verified commit:** `82c9bfc`. 68 tests pass, typecheck is clean, and the milestone gate passes locally on Node 24. An independent adaptive session at this commit completed the campaign objective with no foreign state reachable.
- **Gate status:** passing. Golden hashes lock pre-redaction behavior and still pass unchanged.
- **Headline risk:** the event feed retains only the most recent 100 events with no pagination, so a player cannot audit its own history mid-campaign. Two sessions independently reported no legitimate way to estimate rival strength before committing.
- **Runtime:** Node 24.21.0, pinned by `.node-version`. Node 24 is installed keg-only at `/opt/homebrew/opt/node@24/bin`; the global `node` remains 22.

## Open items

| Item | Type | Owner | Status |
| --- | --- | --- | --- |
| Event feed leaked foreign character payloads; capturing ground widened it | Defect | Cursor | Fixed in `82c9bfc`; validated by an independent session with 0 foreign payloads visible |
| Event feed is a rolling 100-event window with no pagination, so a player cannot audit its own history | Defect | Unassigned | Open; raised independently by session 002 |
| `combat.active` is `null` while `settlement.battleInProgress` is true, with no stated authority | Defect | Unassigned | Open; raised by session 002 |
| No legitimate channel exists for learning a rival's strength, so "estimates learned through investigation" has no machinery | Design gap | ChatGPT partner | Open; raised independently by both sessions |
| Combat forecasts and travel ETAs are unavailable at the moment the commitment decision is made | Design gap | Unassigned | Open; raised by session 002 |
| `POST /api/advance` returns no diff or event stream, so every step is advance-then-refetch | Ergonomic | Unassigned | Open; named the largest cost of playing |
| Undocumented targeting and parameter rules: a pressure order needs a faction target, `briefing/officer` needs `characterId` | Wording | Unassigned | Open; raised by session 002 |
| Surrender has no explicit command; it resolves implicitly through `claim-settlement` | Design gap | ChatGPT partner | Open |
| One `issue-order` can produce two standing orders | Defect | Unassigned | Open, needs a decided intended identity |
| `captureRisk` reads `low` through won battles, then capture arrives by claiming | Wording | Unassigned | Open |
| `character.id.slice(-2)` parses a numeric cadence, which breaks past two-digit ids | Latent defect | Unassigned | Confirmed at `src/sim/engine.ts:972`; harmless below 100 characters |
| `localeCompare` sorts precede RNG draws, so ICU changes between Node builds could alter history | Latent risk | Unassigned | Dormant; identical hashes on Node 22.23.2 and 24.21.0 because both ship ICU 78.3 |
| `engine.ts` decomposition, scenario data-loading, per-tick indexing | Refactor | Unassigned | Deferred until golden hashes and CI existed; both now do |
| Deeper personality branching, faction offices, settlement management, debt enforcement, rescue, inheritance, multiplayer auth | Deferred scope | ChatGPT partner | Tracked in [README](README.md#current-boundary) |

## Milestones

Backfilled from the commit graph on 2026-09-25. **Attribution caveat:** commits do not record which agent authored them. Milestones M1–M11 are attributed to the ChatGPT partner from session context, not from the repository, and should not be read as verified provenance.

### 2026-09-23 to 2026-09-25 — M1: Headless world prototype
- **Agent:** ChatGPT partner (see caveat) | **Commits:** `cf697c8`, `bb629c0`
- Deterministic headless world: 30 autonomous characters, four islands, four resources, production, prices, travel, combat, and SQLite persistence with snapshots and state hashing.

### 2026-09-24 — M2: Autonomous character agency
- **Agent:** ChatGPT partner | **Commits:** `b1f6395`
- Personality-rooted goals, multi-tick plans, beliefs, relationships, and decision traces.

### 2026-09-24 — M3: Player command dashboard
- **Agent:** ChatGPT partner | **Commits:** `db8f377`
- Validated command boundary, local map and inspector, accelerated time, and a player-safe settlement projection built from imperfect knowledge.

### 2026-09-24 — M4: Persistent conversations
- **Agent:** ChatGPT partner | **Commits:** `ea28998`
- Threads, messages, delayed deterministic replies, tag validation, throttling, and a replaceable dialogue adapter isolated from simulation state.

### 2026-09-24 — M5: Design record archived
- **Agent:** ChatGPT partner | **Commits:** `3279411`, `0830095`
- 20 design documents and 13 generated mockups committed as the product-direction source of truth.

### 2026-09-24 — M6: Surrender and conquest
- **Agent:** ChatGPT partner | **Commits:** `a1329a3`
- Surrender thresholds, deliberate claims, and personal conqueror ownership.

### 2026-09-24 — M7: Delegated order lifecycle
- **Agent:** ChatGPT partner | **Commits:** `7d280c6`, `787213f`
- Durable standing orders with acceptance, refusal, deviation, resumption, completion reports, confirmation, expiry, amendment, and cancellation.

### 2026-09-24 — M8: Promotion pipeline defined
- **Agent:** ChatGPT partner | **Commits:** `9007850`, `46b819b`, `4daf7bb`
- Branch roles, the milestone loop, the automated gate, the Codex player protocol, promotion criteria, and the baseline conquest playtest.

### 2026-09-24 — M9: Informed multi-phase combat
- **Agent:** ChatGPT partner | **Commits:** `cb01402`, `7925db8`, `73a3d39`, `777a4b8`
- Strategy-scaled forecasts, phase-by-phase retreat decisions, and refreshed local intelligence on arrival.

### 2026-09-25 — M10: Retreat routing
- **Agent:** ChatGPT partner | **Commits:** `502ca95`, `1d4cfac`, `3fff695`, `c403f42`, `62cf505`, `4f2d459`
- Retreat destinations chosen for safety, display risk preserved through resolution, travel events made immutable when persisted.

### 2026-09-25 — M11: Captivity lifecycle
- **Agent:** ChatGPT partner | **Commits:** `6d5097e`, `84aac08`, `a608636`, `1fbb8fd`, `1b020c5`
- Persistent captivity, guaranteed-but-dangerous escape, bounded release terms, gradual troop return, and accelerated time that pauses at captivity transitions.

## Entries

### 2026-09-25 — Redaction fix independently validated
- **Agent:** Cursor | **Branch:** `feature/phase-0-baseline` | **Commits:** none (verification only)
- **Type:** Verification
- **Changed:** Nothing functional. A second adaptive session at `82c9bfc`, with no repository knowledge, repeated the Cinder Key ambition against the fixed build.
- **Why:** The first session defeated the previous redaction rule, and the submitter's own tests had passed while that leak was live. Independent verification was the only credible evidence available.
- **Verified:** Checked directly against that world at tick 25 rather than taken on trust. 97 of 100 payloads withheld, **0** visible with a foreign actor, and no foreign motive field name present in any visible payload. All three visible payloads were standing-order events for orders the commander had issued. Session 001 recorded 47 withheld with 24 foreign payloads exposed. The objective was completed at tick 14 and held to tick 25 without any leaked information.
- **Left open:** One allowance, unattributed settlement events for owned territory, is still covered by unit tests only and has not been observed in a live session.
- **Links:** [playtest 002](docs/playtests/hidden-state-visibility-002.md)

### 2026-09-25 — Event feed redaction defeated by ground ownership, then fixed
- **Agent:** Cursor | **Branch:** `feature/phase-0-baseline` | **Commits:** `82c9bfc`
- **Type:** Fix
- **Changed:** `eventPayloadVisible` in [visibility.ts](src/dashboard/visibility.ts) now denies any character-attributed event unless the actor is the commander. Control of the ground is consulted only for unattributed settlement events. Regression tests cover owned ground, faction peers, and unattributed settlement events.
- **Why:** The previous rule granted payload visibility when the commander's faction owned the settlement an event occurred in. Since characters stand *at* settlements, this exposed the private decisions of every visitor to captured territory. Capturing a settlement granted omniscience over it.
- **Verified:** An adaptive session found the leak (`hidden-state-visibility-001`). Measured on the unfixed build against that world at tick 25: 47 of 100 payloads withheld, with 24 payloads visible from actors outside the commander and their faction, including 12 `decision-made` events carrying goal ids, plan intent, scored alternatives, and private target beliefs. The same world under the fix reports 100 of 100 withheld. 68 tests pass, up from 65. Typecheck clean.
- **Left open:** Closed by `hidden-state-visibility-002`, which found no foreign payload reachable.
- **Links:** [playtest 001](docs/playtests/hidden-state-visibility-001.md), [playtest 002](docs/playtests/hidden-state-visibility-002.md), [development-pipeline.md](docs/development-pipeline.md)

### 2026-09-25 — Tiered redaction of foreign state from the player API
- **Agent:** Cursor | **Branch:** `feature/phase-0-baseline` | **Commits:** `95fcba8`
- **Type:** Change
- **Changed:** [visibility.ts](src/dashboard/visibility.ts) resolves each character to a tier (`self`, `co-located`, `faction`, `distant`). Proximity reveals observable condition but never motive. Foreign faction power is withheld; only orders the commander issued are projected; conversation payloads require thread participation. Withheld fields are `null`, never a plausible number. The client renders an explicit unknown rather than a zero.
- **Why:** The character map shipped every rival's goals, plan intent, personality, beliefs, exact troops, and exact health. The faction list shipped exact power aggregated from hidden garrisons. The event feed shipped raw payloads. The design record requires foreign plans and motives to be learned through observation, reports, behaviour, dialogue, and investigation, and unknown data to display as unknown rather than zero.
- **Verified:** Golden hashes from `f7ae56b` pass unchanged, which is the evidence that this is a read-only projection and altered no simulation semantics. 65 tests at the time.
- **Left open:** No legitimate estimation channel exists for rival strength. Also fixed a latent crash: the inspector read `item.troops.count` unguarded.
- **Links:** [game-vision.md](docs/design/game-vision.md), [ui-art-direction.md](docs/design/ui-art-direction.md)

### 2026-09-25 — CI gate that runs the documented evaluation
- **Agent:** Cursor | **Branch:** `feature/phase-0-baseline` | **Commits:** `aecaa6b`
- **Type:** Change
- **Changed:** `.github/workflows/gate.yml` installs with `npm ci` against `.node-version`, runs the typecheck, then calls `scripts/evaluate-milestone.sh` rather than re-listing its steps, and uploads artifacts even on failure.
- **Why:** The repository had no continuous integration, so the milestone gate was a manual step and nothing enforced the suite on a change. Calling the script instead of duplicating it prevents the documented gate and the executed gate from drifting apart.
- **Verified:** Gate passes locally on Node 24; `npm ci` installs cleanly with no lockfile drift.
- **Left open:** None observed.
- **Links:** [development-pipeline.md](docs/development-pipeline.md)

### 2026-09-25 — Typecheck added; declared runtime reconciled
- **Agent:** Cursor | **Branch:** `feature/phase-0-baseline` | **Commits:** `991db5e`
- **Type:** Change
- **Changed:** Added `typescript` and `@types/node` as the only dev dependencies, leaving the runtime dependency-free, plus a `tsconfig` matching what `--experimental-strip-types` accepts (`nodenext`, `allowImportingTsExtensions`, `verbatimModuleSyntax`, `erasableSyntaxOnly`). `npm run check` now typechecks before testing. Runtime pinned to Node 24 via `.node-version`.
- **Why:** The `engines` field declared Node 24 but the machine ran 22, and the project had never been typechecked.
- **Verified:** Typecheck clean. The first run found no errors in `src/` and 15 in `tests/conversations.test.ts`, all the same shape: in current `@types/node`, `assert.equal` carries an `asserts` signature, so each following `if (!x.ok) throw` was unreachable and `x.error` resolved against `never`. The guards were redundant and removed.
- **Left open:** Node 24 is installed keg-only, so project commands need an explicit PATH prefix.
- **Links:** None

### 2026-09-25 — Golden hashes committed; recovery gate fixed
- **Agent:** Cursor | **Branch:** `feature/phase-0-baseline` | **Commits:** `f7ae56b`
- **Type:** Fix
- **Changed:** `scripts/update-golden-hashes.ts` and `tests/fixtures/golden-hashes.json` lock the state hash and event count for seeds 1847, 2718, and 4096 at 72 ticks, plus a split-recovery hash. `tests/golden.test.ts` enforces them; `npm run golden:update` re-baselines deliberately. The gate's recovery split moved from 48 to 47 ticks.
- **Why:** The existing determinism tests compared each build against itself, so a change altering world outcomes consistently still passed. Separately, the gate split recovery at 48 ticks, and because snapshots are written when `tick % ticksPerDay == 0` with `ticksPerDay` at 6, recovery found a snapshot at the final sequence and replayed nothing. That promotion criterion had always passed vacuously.
- **Verified:** Recovery now replays 584 events. Gate passes and reports the replay. Identical hashes were produced on Node 22.23.2 and 24.21.0.
- **Left open:** ICU differences between CI runner builds remain a latent risk for the fixture.
- **Links:** [development-pipeline.md](docs/development-pipeline.md)

### 2026-09-25 — Reproduction confirmed across the redaction work

- **Agent:** Cursor | **Branch:** `feature/phase-0-baseline`
- **Type:** Note
- **Changed:** Nothing functional.
- **Why:** To record a finding that mattered more than any individual fix on this branch: the redaction suite passed while the event feed leaked foreign motives, and an agent with no repository knowledge found it in a single session. Verification built only from the author's understanding of their own rule is not adversarial, and this branch is the evidence.
- **Verified:** See `hidden-state-visibility-001`.
- **Left open:** Treat the adaptive playtest as the gate, not as confirmation.
- **Links:** [hidden-state-visibility-001.md](docs/playtests/hidden-state-visibility-001.md), [development-pipeline.md](docs/development-pipeline.md)
