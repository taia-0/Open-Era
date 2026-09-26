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

- **Baseline:** `main` at `6d3b98f` records the owner-approved M16 merge from [pull request 10](https://github.com/taia-0/Open-Era/pull/10). The retained `feature/player-trade-verbs` branch remains at `55d930c`.
- **In review:** `feature/captivity-negotiation-v1` is the M17 candidate; no pull request is open yet. Its code commit is `87ee1e9`, and this record plus the one reporting fix found in playtest complete the candidate tree. It has not been merged into `main` pending owner approval.
- **Last verified candidate:** `feature/captivity-negotiation-v1` with **125 tests** and [captivity-negotiation-001](docs/playtests/captivity-negotiation-001.md), which returns `PROMOTE`. The public-interface session naturally captured Mina Vale, advanced Mara Vane from `unreceptive` to `open` through three delayed messages, countered an 81.78-money demand at 60, and recovered the persisted release to an identical state hash.
- **Gate status:** passing on the M17 candidate with **125 tests**, three 72-tick seed runs, and split recovery replaying 584 events to the uninterrupted hash. Seeds 1847 and 2718 intentionally moved to `d052b38e…` and `1df5dcff…` because negotiation authority and state are now persistent simulation data; seed 4096 remains `b1fe59d0…`. The only runner risk still tracked is the Ubuntu 26 migration on 2026-10-19 and its possible ICU effect.
- **Headline risk:** no channel exists for a commander to learn a rival's strength other than a settlement-scoped forecast. The maritime economy is solvent but not competitive with `work`. Captivity negotiation now proves messages can drive a replay-safe gameplay process, but richer intent classification, non-money terms, general contracts, debt enforcement, and rescue remain explicit expansions rather than hidden claims.
- **Runtime:** Node 24.19.0 for the M17 local gate, with Node 24 pinned by `.node-version`.

## Open items

| Item | Type | Owner | Status |
| --- | --- | --- | --- |
| Event feed leaked foreign character payloads; capturing ground widened it | Defect | Cursor | Fixed in `82c9bfc`; validated by an independent session with 0 foreign payloads visible |
| Event feed is a rolling 100-event window with no pagination, so a player cannot audit its own history | Defect | Cursor | **Fixed** in [PR 4](https://github.com/taia-0/Open-Era/pull/4); a playtest then retrieved all 20,457 events with zero gaps and zero duplicates |
| `combat.active` is `null` while `settlement.battleInProgress` is true, with no stated authority | Defect | Cursor | **Fixed** in `8bf60c8` and refined in [PR 5](https://github.com/taia-0/Open-Era/pull/5); one shared rule now governs the flag, the observable list and the forecast gate |
| No legitimate channel exists for learning a rival's strength, so "estimates learned through investigation" has no machinery | Design gap | ChatGPT partner | Open; raised independently by two sessions. A settlement-scoped forecast from earned knowledge now exists, but nothing yet covers characters, parties, or factions |
| Combat forecasts and travel ETAs are unavailable at the moment the commitment decision is made | Design gap | Cursor | **Fixed** in [PR 5](https://github.com/taia-0/Open-Era/pull/5); a playtest committed on a quoted voyage and a pre-commitment band |
| `POST /api/advance` returns no diff or event stream, so every step is advance-then-refetch | Ergonomic | Cursor | **Fixed** in [PR 4](https://github.com/taia-0/Open-Era/pull/4); advance returns a projected event diff and a sequence watermark |
| Undocumented targeting and parameter rules: a pressure order needs a faction target, `briefing/officer` needs `characterId` | Wording | Cursor | **Fixed** in [PR 4](https://github.com/taia-0/Open-Era/pull/4) and [PR 5](https://github.com/taia-0/Open-Era/pull/5); `capabilities.requests` publishes the whole contract |
| Surrender has no explicit command; it resolves implicitly through `claim-settlement` | Design gap | Cursor | **Fixed** in [PR 5](https://github.com/taia-0/Open-Era/pull/5); `decline-surrender` makes the offer an explicit decision |
| Starving pins morale at zero permanently while health keeps decaying, and the briefing never raises a provisioning item | Defect | Cursor | **Closed** as misdiagnosed. `rest` does restore morale; the same-tick upkeep takes it straight back, so a feeding party cannot recover in place. The real defect was that nothing told the player: a party could not see when its hold would empty, and the briefing raised no provisioning item. Both fixed in this milestone, all hashes unchanged |
| Two pending commands targeting the same `orderId` are both accepted, and the second fails after the first resolves | Defect | Cursor | **Fixed** in this sweep. `orderMutationPending` refuses a second command naming an order another queued command will consume, as `order-already-queued`; two *different* orders can still be changed in one tick |
| `briefing.attentionCount` did not match the number of `items` returned, and near-identical items were not aggregated | Defect | Cursor | **Fixed** in this milestone. The count was taken before the display slice, so an action-required decision could be counted and never shown. The budget now applies to background only, the count describes the list it is attached to, and repeated reports for one subject collapse into one counted item |
| `capabilities.requests` omits four endpoints: `/api/threads`, `/api/messages`, `/api/briefing/acknowledge` and `/api/briefing/officer` | Defect | Cursor | **Fixed** in this sweep. All four are now published with their bodies and failure codes, and a test calls each published path to prove the contract describes a route that is really served. The same entry also mis-stated the acknowledgement refusal as 409-style; every rejection is HTTP 400 with a stable `code` |
| `POST /api/briefing/acknowledge` accepts an `itemId` that names no current item and answers `{ ok: true }` | Behavior | Owner | **Decided: keep lenient.** Acknowledging a nonexistent or already-superseded id stays a documented no-op, because the alternative rejects a legitimate stale click after the tick advances. The contract now states this rather than leaving it to be discovered |
| `trade-local` takes no parameters, returns only `{ok, command}`, and silently liquidates whatever it chooses | Defect | Cursor | **Fixed** in [PR 10](https://github.com/taia-0/Open-Era/pull/10). `trade-local` is no longer a published player action: `buy-resource` and `sell-resource` name the good and the quantity and quote the price before it is paid. It remains the autonomous path's own verb and is untouched there, which is why the golden hashes did not move |
| `buy-provisions` has no quantity or cost preview and can spend an entire treasury in one command, and its `insufficient-money` prose conflates the 2-money minimum balance with the price | Defect | Cursor | **Partly fixed** in [PR 10](https://github.com/taia-0/Open-Era/pull/10). A player can now buy provisions by quantity with a quoted cost through `buy-resource`, which bounds every purchase. The one-click `buy-provisions` top-up survives unchanged, still without a cost preview and still quoting the 2-money minimum as though it were the price |
| A merchant cannot learn what a remote market pays, so every profitable route must be discovered by sailing it | Design gap | Cursor | Open by design choice, raised by the trade-loop session. Quoting a price where the commander is not standing would present a rumor as a price, so the panel shows only estimates there. Whether trade should have a reconnaissance channel at all, or whether discovery-by-voyage is the intended tension, is undecided |
| A price is labelled `exact` with `confidence: 1` but is only good for one tick, and prices drift every tick while a voyage takes four | Design gap | Unassigned | Open; raised by the trade-loop session. Honest about knowledge, silent about expiry. The commander was quoted 6.63 for arms and paid 6.06 on arrival, an 8.6% miss, with nothing in the panel able to price that risk |
| A destination's `taxRate` is invisible until arrival, because it lives under `market`, which is `null` remotely | Design gap | Unassigned | Open; raised by the trade-loop session, which had to compare gross spreads while a hidden 14% took 35.46 of its 253.28 gross sales. A settlement's tax is public in a way its price is not, and is the natural remote field to publish |
| A player order has no depth limit, while the autonomous path caps itself at 16% of local stock, so dumping a whole market at the pre-trade price is dominant | Balance gap | Unassigned | Open; raised by the trade-loop session, which moved 34 arms against 83 of stock (+41%) with the price only collapsing afterwards. An asymmetry in the player's favour, so it inflates rather than rescues the solvency result. Fixing it is a balance decision |
| Travel costs nothing but time, since provisions are eaten at the same rate sailing or standing, so every positive spread is worth chasing | Design gap | Unassigned | Open; raised by the trade-loop session. Removes the "is this trip worth it" decision. Any fix moves the golden hashes |
| The trade road runs one way: no good flowed homeward profitably, and the one candidate inverted within five ticks, so a rational merchant never sails home | Design gap | Unassigned | Open; raised by the trade-loop session, whose return trip was pure roleplay. A round trip has no design reason to exist yet |
| The `market` block carries the player's own `money`, `load`, `free` and `capacity`, so it reads as the market's cash and hold | Defect | Cursor | **Fixed** in this sweep. The market block now carries market facts only — `settlementId`, `taxRate` and its board of `resources` — and the purse and hold move to the commander's own `party.hold`, where `load + free == capacity` is asserted |
| `capabilities.requests.commands.body` omits `resource` and `quantity`, which both trade verbs require | Defect | Cursor | **Fixed** in this sweep. Both fields are published, derived from `RESOURCE_KEYS` and `COMMAND_LIMITS.tradeQuantity` so the documented bounds cannot drift from the enforced ones, and a test asserts each trade verb is a published action |
| `characters[].knowledge[].observedTick` leaks negative ticks for reports seeded before the world began | Defect | Cursor | **Fixed** in this sweep. The projected knowledge floors `observedTick` at 0 while leaving the simulation's own copy untouched, so no player is shown a tick that never happened; the same `Math.max(0, …)` the briefing sweep applied to item ids now covers this raw field |
| `eventFeed` is a metadata envelope that contains no events; the events are under a sibling `events` key | Ergonomic | Cursor | **Fixed** in this sweep. The envelope is renamed `eventPage`, which describes what it is — a paging descriptor over `events` — and the contract's `state.response` now names both keys so a client is told where the events live |
| Only provisions can be bought, so the advertised trade ambition cannot be pursued, and one `work` tick out-earns the whole voyage | Design gap | Cursor | **Verbs fixed, pacing open** in [PR 10](https://github.com/taia-0/Open-Era/pull/10). All four resources can now be bought and sold by a player, so the spreads are reachable and a voyage pays for itself (+122.71 against 108 starting money in test). The pacing half is now a scoped economy milestone rather than a missing verb: one `work` tick still out-earns a voyage per tick elapsed, deliberately deferred so this branch stayed hash-neutral |
| Nothing resupplies at anchor, even while the briefing names the market alongside | Design gap | Unassigned | Open; found by the own-party session. The starving item says a settlement "is alongside and sells provisions" with `resupply.reachable: true` and offers no lever to act on it |
| `intel:*` briefing ids carry negative `observedTick` values, so stale-intelligence warnings fire on day one and report an age older than the world | Defect | Cursor | **Fixed** in this sweep. Staleness is measured from `Math.max(0, observedTick)`, a backdated report is described as predating the commander's arrival rather than as an age, the two least trustworthy reports are reported first, and no id can carry a negative number |
| Estimated resource rows are shown with no age qualifier, beside exact owned data in identical formatting | Wording | Cursor | **Fixed** in this sweep. An estimated market labels its rows `estimated, N ticks old`, prefixes each figure with `~`, and marks an estimated garrison the same way. A market with no report at all now says so instead of drawing zeros as fact. A render test executes the shipped inline script so this cannot silently regress |
| Population feeds the defender estimate but is unreadable before ownership, so a raider cannot weigh it | Design gap | Unassigned | Open; raised by the informed-commitment session. Indexed in [roadmap.md](docs/roadmap.md) as the missing reconnaissance channel |
| One `issue-order` can produce two standing orders | Defect | Unassigned | Open, needs a decided intended identity |
| `captureRisk` reads `low` through won battles, then capture arrives by claiming | Wording | Unassigned | Open |
| `character.id.slice(-2)` parses a numeric cadence, which breaks past two-digit ids | Latent defect | Cursor | **Fixed** in this sweep. `characterCadence` reads the full numeric suffix, so `character-100` and `character-101` no longer collapse onto the same slot; asserted directly rather than waited for |
| `localeCompare` sorts precede RNG draws, so ICU changes between Node builds could alter history | Latent risk | Unassigned | Dormant; identical hashes on Node 22.23.2, Node 24.21.0, and GitHub's `ubuntu-latest` runner. Recheck after 2026-10-19, when `ubuntu-latest` migrates to Ubuntu 26 and its ICU may change |
| Pinned GitHub Actions target Node 20 and are forced onto Node 24, with a deprecation warning on every run | Hygiene | Cursor | **Fixed** in this sweep. `actions/checkout`, `actions/setup-node` and `actions/upload-artifact` move from `v4` to `v7`, which are the current published majors and run on Node 24 natively |
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

### 2026-09-25 — M12: Read the record without guessing (Milestone A, part 1)
- **Agent:** Cursor | **PR:** [#4](https://github.com/taia-0/Open-Era/pull/4) | **Playtest:** [paged-history-001](docs/playtests/paged-history-001.md)
- Paged event history behind a `beforeSequence` cursor on the same projection path as the feed, an advance diff with a sequence watermark, a machine-readable command capability block with self-describing rejections, and explicit battle authority. Plus `docs/roadmap.md` and the playtest index in the design record.

### 2026-09-25 — M13: Decide before committing (Milestone A, part 2)
- **Agent:** Cursor | **PR:** [#5](https://github.com/taia-0/Open-Era/pull/5) | **Playtest:** [informed-commitment-001](docs/playtests/informed-commitment-001.md)
- Travel ETAs, a pre-commitment forecast whose remote ground-truth weight is 0 so ignorance is expressed as band width rather than a scaled truth term, and `decline-surrender` as an explicit decision.

### 2026-09-25 — M14: Know your own party (Milestone B)
- **Agent:** Cursor | **Playtest:** [own-party-001](docs/playtests/own-party-001.md)
- A per-tick provision runway on the commander's own party, a provisioning warning that precedes the shortage rather than following it, an explicit "the party is starving" decision that cannot be dismissed, a briefing whose attention count matches the list it describes and which can no longer drop an action-required decision, and aggregation of repeated reports about one subject.

### 2026-09-25 — M15: Defect sweep from the own-party playtest
- **Agent:** Cursor | **PR:** [#8](https://github.com/taia-0/Open-Era/pull/8)
- Six defects closed without touching simulation behavior: duplicate order mutations, four unpublished endpoints, backdated staleness, unqualified estimates, a fragile cadence parse, and Node 20 actions. The first dashboard render test executes the shipped inline script against a real projection.

### 2026-09-25 — M16: Player trade verbs (solvent voyage, hash-neutral)
- **Agent:** Cursor | **Branch:** `feature/player-trade-verbs` | **Playtest:** [trade-voyage-001](docs/playtests/trade-voyage-001.md)
- A player can name a good and a quantity and see the price before paying, on any of the four resources, with every limit quoted before it is hit. A voyage pays for itself (+113.27 on 108 starting money in playtest). Whether it out-earns working the same ticks is a separate, deferred milestone.

### 2026-09-26 — M17: Message-driven captivity negotiation
- **Agent:** Codex | **Branch:** `feature/captivity-negotiation-v1` | **Playtest:** [captivity-negotiation-001](docs/playtests/captivity-negotiation-001.md)
- Capture assigns a local autonomous authority. Delayed direct messages can move only a qualitative visible stance toward bounded money/debt terms, while accept, one counter, and reject remain validated player commands. Escape and fourteen-day mandatory release remain available, and all outcomes replay through events.

## Entries

### 2026-09-26 — Captivity persuasion connects conversation to a validated release
- **Agent:** Codex | **Branch:** `feature/captivity-negotiation-v1` | **Code commit:** `87ee1e9` | **Type:** Feature, adaptive playtest, and records
- **Changed** — capture now assigns a local captor-faction authority, with a strongest-authority fallback when no one is local. The case persists a deterministic persuasion state built from message tags, personality, relationship, circumstances, and time held. The captive sees the authority and only `unreceptive`, `listening`, `considering`, or `open`; scores, thresholds, attempts, and the system maximum remain private. Once the authority opens bounded money/debt terms, accept, one counter, and reject execute through the queued command boundary. Dialogue providers can shape prose and return tags, but cannot release a captive or mutate assets. The dashboard exposes the stance, demand and choices, and accelerated time pauses when an offer needs a decision. Older saves normalize the new state and recovery assigns missing authorities.
- **Why** — the design requires prisoners to persuade a captor through messages until that character chooses to negotiate. The earlier lifecycle allowed messages during captivity but made them mechanically irrelevant: only dangerous escape or a fourteen-day automatic release could end the state. This milestone makes persistent conversation consequential without handing a language model authority over simulation transitions.
- **Verified** — the full milestone gate passes: typecheck clean, **125/125 tests**, seeds 1847/2718/4096 at 72 ticks, and split recovery replaying 584 events to the uninterrupted `d052b38e…` hash. An adaptive session used only the public dashboard API: Mina Vale was captured naturally at tick 21, sent three messages to Mara Vane over sixteen simulation ticks, saw the stance progress without hidden numbers, countered 81.78 at 60, and was released at tick 38 with 19 troops scheduled to return. Recovering that session replayed 262 events to the identical `ed7a9199…` state hash. The session found one reporting defect — every release was labelled mandatory — which is fixed and regression-tested before promotion.
- **Left open** — richer intent classification; resource, service, political and allegiance terms; debt enforcement; rescue; rejected-offer reopening; delayed counter adjudication; explicit jurisdiction when the authority fallback is remote; and workload behavior when one authority owns several cases. These are expansions, not blockers for the money/debt persuasion hypothesis.
- **Links** — [playtest](docs/playtests/captivity-negotiation-001.md) | [world simulation design](docs/design/world-simulation.md) | [roadmap](docs/roadmap.md)

### 2026-09-25 — Trade typography: four projection defects the voyage playtest found
- **Agent:** Cursor | **Branch:** `feature/player-trade-verbs` | **Type:** Defect fixes and records
- **Changed** — four defects, none of which alters a simulation transition. The settlement `market` block now carries market facts only — `settlementId`, `taxRate` and the board of `resources` — because its `money`, `load`, `free` and `capacity` were the commander's own purse and hold wearing a market's name; those figures move to the commander's own `party.hold`, where `load + free == capacity`. `capabilities.requests.commands.body` publishes `resource` and `quantity`, derived from `RESOURCE_KEYS` and `COMMAND_LIMITS.tradeQuantity` so the documented bounds cannot drift from the enforced ones, and `capabilities.requests.state.response` now names both `events` and the paging descriptor. Projected `character.knowledge` floors `observedTick` at 0 without touching the simulation's own copy, so a report seeded before tick 0 no longer shows a tick that never happened. The metadata envelope `eventFeed` — which contained no events — is renamed `eventPage`, and the inline dashboard reads it there.
- **Why** — these are the four small defects the [trade-voyage-001](docs/playtests/trade-voyage-001.md) playtest found and left recorded as open items. Each is legibility or ergonomics rather than behaviour: a player read `market.money: 108` as a counterparty credit limit that does not exist, had to guess both trade body field names, saw `observedTick: -11` at tick 0, and paged `eventFeed` for events and got an empty result. Fixed before the branch's pull request so the review is not carrying known misdirections.
- **Verified** — `npm run typecheck` clean; **122 tests** pass, up from 120; the gate passes and **all three golden hashes remain byte-identical** (`183e7f0a…`, `672be404…`, `b1fe59d0…`) with split recovery replaying to the same hash, because nothing here is a simulation transition. Three added tests lock the changes: the market block may carry only market keys, the commander's hold accounts for the whole hold and matches the real cargo, and no projected report carries a negative age. The published-contract test now asserts both trade fields are documented, that both trade verbs are published actions, and that the state payload carries `eventPage` and no `eventFeed`. The four fixes were also confirmed against a live world over HTTP before commit.
- **Left open** — the playtest's remaining findings are the economy milestone's brief, not defects: a price with no expiry, a destination `taxRate` invisible until arrival, travel that costs only time, a one-way road with no reason to sail home, a player order with no depth limit while the autonomous path self-caps at 16% of local stock, and the pacing deferral. The one-click `buy-provisions` top-up still has no cost preview.
- **Links** — [playtest](docs/playtests/trade-voyage-001.md) | [open items](#open-items)

### 2026-09-25 — Player trade verbs: a voyage that pays for itself
- **Agent:** Cursor | **Branch:** `feature/player-trade-verbs` | **Commits:** `1dc0bfe`, `4ff6512` | **Type:** Feature plus records
- **Changed** — `buy-resource` and `sell-resource` are now the player's trade surface, and `trade-local` is no longer published to players. Both verbs name a `resource` and a whole-unit `quantity` between 1 and 200, and both execute through `resolveDecision` on the existing autonomous trade path rather than beside it. `tradeQuote` in `engine.ts` is one pure function that the boundary validates against, the simulation charges from and the settlement panel quotes from, so a quoted total is the charged total; money moves in whole cents through `tradeAmounts`, which the panel mirrors. Every refusal names the ceiling that actually bound — the smallest of the board, the hold and the purse — and quotes it. A market is quoted only where the commander is standing, and standing there is now direct observation rather than a decaying report, so the stock and price rows of a settlement the commander occupies are present truth.
- **Why** — the own-party session found that the advertised trade ambition was unreachable: only provisions could be bought, `trade-local` liquidated whichever good it chose with no parameters and no returned price, and the panel offered no way to see a cost before paying one. The design record described no player trade loop at all. This closes the verb half of that gap and leaves the pacing half explicit.
- **Verified** — `npm run typecheck` clean; **120 tests** pass, up from 118, of which 14 are the new `tests/trade.test.ts`. The gate passes and **all three golden hashes are byte-identical** (`183e7f0a…`, `672be404…`, `b1fe59d0…`) with split recovery replaying to the same hash, because every change is confined to the player path. Two defects were found by driving the verbs over HTTP rather than through unit tests, both contradicting the panel's promise: the fill re-quoted at the live price, so an order accepted at 3.25 arms per unit was charged 3.09 after autonomous traders moved the board inside the same tick; and a purchase refusal named whichever ceiling it tested first, telling a commander with 105.99 money that the island "holds 17.206 of medicine" when the island held 84.141 and the purse was the limit. Both are fixed with a regression test each. A voyage bought cheap and sold dear nets **+122.71 against 108 starting money**.
- **Left open** — the fresh-context voyage playtest is **done** and recorded at [trade-voyage-001](docs/playtests/trade-voyage-001.md), which returns `PROMOTE` for the solvent-voyage hypothesis: the commander took 108 to 221.27 over 13 ticks with no `work`, and an outside reconstruction of the events reconciled every trade to the cent. Its findings are the economy milestone's brief: a price with no expiry, a destination tax invisible until arrival, travel that costs nothing but time, a one-way road with no reason to sail home, and a player order with no depth limit while the autonomous path caps itself at 16% of local stock. The smaller defects it found — a `market` block carrying the player's own purse and hold, `resource`/`quantity` missing from the published trade body, a negative `observedTick` in `character.knowledge`, and an `eventFeed` envelope that contains no events — were closed in the trade-typography sweep that follows this entry; all four were projection, documentation and ergonomics only. The one-click `buy-provisions` top-up still has no cost preview. Pacing remains the deliberate deferral: one `work` tick still out-earns a voyage per tick elapsed, and rebalancing that would move the golden hashes, so it is scoped as the next economy milestone rather than folded in here.
- **Links** — [design record](docs/design/world-simulation.md#player-trade) | [playtest](docs/playtests/trade-voyage-001.md) | [open items](#open-items)

### 2026-09-25 — Defect sweep: six small defects, three of them found by playtests
- **Agent:** Cursor | **PR:** [#8](https://github.com/taia-0/Open-Era/pull/8) | **Type:** Defect fixes plus records
- **Changed** — six defects, none of which alter a simulation transition. A second command naming a standing order another queued command will consume is refused as `order-already-queued` instead of being accepted and failing later. `capabilities.requests` publishes `/api/threads`, `/api/messages`, `/api/briefing/acknowledge` and `/api/briefing/officer` with their bodies and failure codes, and corrects its claim that acknowledgement refusals are 409-style when every rejection is HTTP 400 with a stable `code`. Staleness is measured from `Math.max(0, observedTick)`, so a report backdated to before the commander's arrival is described that way and can no longer fire a day-one warning or put a negative number in an item id. An estimated market labels its rows `estimated, N ticks old` and prefixes each figure with `~`; a market with no report says so rather than drawing zeros as fact. `characterCadence` reads the whole numeric suffix instead of `slice(-2)`, which aliased `character-100` and `character-101`. The GitHub Actions pins move to the current `v7` majors, which run on Node 24 rather than being forced there from Node 20.
- **Why** — these were the small defects left standing after Milestone B, kept deliberately separate from it so the milestone's diff stayed derivation-only. Three came from the own-party playtest's own findings rather than from the milestone: the playtest concluded the conversation system did not exist because nothing published it, read an estimated market as present-tense fact, and was warned about intelligence that was never fresh.
- **Verified** — `npm run typecheck` clean; **105 tests** pass, up from 98; the gate passes and **all three golden hashes remain byte-identical**: `183e7f0a…`, `672be404…`, `b1fe59d0…`, with split recovery replaying to the same hash. The seven added tests are the first to execute the dashboard's inline render script, to call each published route to prove it is really served, and to assert the cadence aliasing directly rather than waiting for a roster to grow past 99 characters.
- **Left open** — acknowledging an `itemId` that names no current item answers `{ ok: true }`. It is a benign no-op for the simulation and tolerant of a stale click after the tick advances, so it is now documented as deliberate rather than tightened, which would reject those clicks; the decision to leave it lenient is logged above.
- **Links** — [open items](#open-items)

### 2026-09-25 — Milestone B: the party can see its own trajectory
- **Agent:** Cursor | **Branch:** `feature/own-party-observability` | **Type:** Feature plus records
- **Changed** — the commander's own party now answers "how long can we keep going". `provisionDemand()` and `provisionResupplyTarget()` are exported pure functions so a quoted figure and the real charge cannot drift; the party block carries `provisions`, `demand`, `runwayTicks`, `runwayDays`, `shortage`, the three `shortage*PerTick` costs and `resupplyTarget`, plus a `resupply` sub-object naming the nearest market, its provenance and whether the voyage fits. The briefing raises `provision:low` before the hold empties and an unacknowledgeable `provision:critical` once it has. `attentionCount` now describes the list it is attached to, action-required items can no longer be dropped by the display budget, and repeated reports about one subject aggregate into one counted item.
- **Why** — a prior session held morale at 0 for 33 ticks and recorded it as a soft-lock. It is not one: `rest` restores morale and the same-tick upkeep takes it back, so the trap is that nothing warned the player in time to prevent it. The autonomous planner already weighs a supply need before it commits, so the simulation was not failing to handle starvation, it was failing to mention it. The reframed defect is the one this milestone closes.
- **Verified** — `npm run typecheck` clean; **98 tests** pass; the gate passes and **all three golden hashes remain byte-identical** to Milestone A: `183e7f0a…`, `672be404…`, `b1fe59d0…`, with split recovery replaying 584 events to the same hash. This was a derivation-only change by design, so a moved hash would have been an error rather than a regeneration. One fresh-context playtest with no repository knowledge played 228 ticks through the public HTTP API and wrote [own-party-001](docs/playtests/own-party-001.md).
- **Playtest result** — the milestone hypothesis held. The party block answered "how long can we keep going" from the very first request at tick 0 (`runwayTicks 62` against a 5-tick voyage), and the critical item named the exact per-tick cost, the settlement that could fix it, and why morale would not self-recover. Three defects in the new surface were found and fixed in response: `moralePerTick`/`healthPerTick` were starvation terms misleadingly named as net rates, the push warning fired at one day of food, and the resupply ceiling was invisible. The record also corrects one of its own findings: the hold does not cap at 47.424, that is 48 minus one tick of upkeep.
- **Left open** — the playtest's ambition was trade, and discovered that only provisions can be bought, so the advertised trade loop cannot be pursued while one `work` tick out-earns the whole voyage. That, the parameterless `trade-local` auto-liquidation, the quantity-less `buy-provisions`, four undocumented endpoints in `capabilities.requests`, and the backdated-knowledge staleness warnings are all logged in open items above.
- **Links** — [playtest record](docs/playtests/own-party-001.md)

### 2026-09-25 — Milestone A merged, with two playtests and four defects fixed
- **Agent:** Cursor | **Branch:** `docs/milestone-a-progress` | **Commits:** `8bf60c8`, `2d10173`, `eb06f74`, `a3d99b9` | **Type:** Feature plus records
- **Changed** — the player-observable surface named by two prior sessions is closed. The event feed pages backwards from a cursor through the exact `projectEvent` path the feed uses; `POST /api/advance` returns its projected event diff and a watermark; `capabilities` publishes both the command rules and the HTTP request contract; battle authority is split into `commandedBattle` and `observedBattles` under one visibility rule; destinations carry `travelTicks`/`travelDays`; a forecast is available before commitment and derives its ground inputs with a ground-truth weight of **0** when the commander is not co-located; and `decline-surrender` makes a surrender offer an explicit accept-or-decline decision.
- **Why** — two independent sessions said the same six gaps stopped them: they could not audit their own history, could not learn the rules without failing, could not tell which of two contradictory battle signals gated an action, could not weigh a commitment before making it, and could not answer a surrender offer with anything but acceptance.
- **Verified** — `npm run typecheck` clean; the gate passes locally and on GitHub Actions for both pull requests, **86 tests**, and **all three golden hashes are byte-identical** before and after: `183e7f0a…`, `672be404…`, `b1fe59d0…`, with split recovery replaying 584 events to the same hash. Two fresh-context playtests were run by agents with no repository knowledge, one per part, each recorded in `docs/playtests/`.
  - [paged-history-001](docs/playtests/paged-history-001.md) reached tick 187 and retrieved the **entire** 20,457-event history in 205 page requests: **zero gaps, zero duplicates**, 93.4% of events withheld, and **zero withheld payloads leaked**. It recommended `REVISE`; the host-contract half of that is fixed.
  - [informed-commitment-001](docs/playtests/informed-commitment-001.md) committed to an attack on a settlement it had never visited, using only a 49-tick-old rumor, then attacked the redaction with four distinct inversion strategies. It recovered **no** true fortification, population or garrison before ownership.
- **Left open** — four defects the playtests found and this milestone fixed are listed above in open items as closed. Still open and unowned: the starvation/morale soft-lock, duplicate pending commands for one `orderId`, briefing attention-count drift, unqualified estimate ages, and the missing reconnaissance channel for population.
- **Links** — [pull request 4](https://github.com/taia-0/Open-Era/pull/4), [pull request 5](https://github.com/taia-0/Open-Era/pull/5), [roadmap](docs/roadmap.md)

### 2026-09-25 — Phase 0 baseline merged into main
- **Agent:** Cursor | **Branch:** `main` | **Commits:** `1386e00`
- **Type:** Release
- **Changed:** [Pull request 1](https://github.com/taia-0/Open-Era/pull/1) merged into `main` as a merge commit, keeping the eight milestone commits intact rather than squashing them. `main` now carries tiered redaction, golden hashes, the first typecheck, the Node 24 pin, the CI gate, and this log.
- **Why:** The branch's hypothesis was validated by an independent session, the gate passed on a clean checkout at the exact candidate, and the owner explicitly approved that candidate.
- **Verified:** Before merging, the pull request head matched both the local commit and the CI-validated SHA, merge state was clean, the diff carried no generated state, and the 22 changed files were source, tests, and documentation only. After merging, 68 tests and a clean typecheck pass on `main`, and the gate passes on the runner for `main` itself.
- **Left open:** Two runner annotations: the pinned actions target Node 20 and are forced onto Node 24, and `ubuntu-latest` migrates to Ubuntu 26 from 2026-10-19, which could shift ICU and therefore the golden hashes.
- **Links:** [pull request 1](https://github.com/taia-0/Open-Era/pull/1), [playtest 002](docs/playtests/hidden-state-visibility-002.md)

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
- **Verified:** Gate passes locally on Node 24 and on GitHub Actions, golden hashes included, which is the first time the gate has run anywhere but a developer machine. `npm ci` installs cleanly with no lockfile drift.
- **Left open:** None observed.
- **Links:** [development-pipeline.md](docs/development-pipeline.md), [pull request 1](https://github.com/taia-0/Open-Era/pull/1)

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
