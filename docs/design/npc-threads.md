# NPC-initiated threads (spec)

Spec on `main` `3c55552` (cards v1 merged as #201), merged with `main` `7cc34b3` (#202). It follows [ui-cards-v1.md](ui-cards-v1.md), the Lead's five rulings on its section 14, and the Lead's eight rulings of 2026-11-27 (section below). It covers the slice after cards: **non-player characters open conversation threads with the human commander** so the inbox is not dead. Everything is measured offline with a harness in [npc-threads/](npc-threads/) (13 standard seeds × 1,200 ticks, $0, no AI calls, no change to `src/`).

## 1. Rulings this spec follows

1. `allyFactionId` is renamed `againstFactionId` now, no alias (cards doc; the Engineer builds from the ruling).
2. 180 ticks is the check-in window (`CHECK_IN_TICKS`, `src/dashboard/view-model.ts:87`).
3. `request` = incoming threads awaiting the viewer's reply. Once answered, the thread moves to `direct` or `group`. Written here as: `createdById !== viewer`, the viewer has sent no message in the thread, and (Lead 2026-11-27, ruling 5) a completion-report thread is also answered when its order is confirmed or resolved. See §5.
4. The troop readout is label-only. No count, no cuts.
5. A still-open order's latest report always shows.
6. From the cards round: `DeterministicDialogueProvider` stays; `ai.speech` is a later opt-in; the thread link is derived, never stored.


## Rulings (Lead, 2026-11-27)

Recorded from the Lead's answers to §12. Affected body text is updated in place.

1. **Add** the optional `origin?: { trigger: string; sequence: number }` on `ConversationMessage`. (An `orderId` on order openers is specified in §5 so ruling 5 can be projected without the event log.)
2. **No receiver cap.** Ship the pair rule, sender cap 9, pair cap 3.
3. **Stored hook** (option B): the inbox is real persistent state, seen the same way across sessions. Flag `npcThreads` (default off) lives on the callers, not in `TickOptions`.
4. Keep `standing-order-accepted` and `debt-repaid` **off**.
5. **Confirming or resolving the order answers its thread.** Projection-only request-tab rule; no stored "answered" flag. See §5.
6. **No archive in v1**, but add **read state** for unread badges: a per-participant `lastReadTick` set through `POST /api/threads/:id/read`. Keep it out of the hashed state if possible. Specified in §5.1: it can be hash-neutral, in a `WorldStore` side table, not on `WorldState`.
7. **Next sim slice** (recorded, not specified here): a contract offer to a human first (human-carrier path through `carrierBlocked` `engine.ts:2068`, plus an accept/decline command), then debt demand.
8. `shortMorningStreak` is covered by the separate replay bisect (N4 stands).

## 2. Findings that shaped the spec

1. **Most of the triggers named in the brief are not events today.** I counted every event type over 13 seeds × 1,200 ticks (`results/census-default.txt`, `census-atls.txt`) and the commander's involvement as actor, target, or named in the payload:

   | Named trigger | Event today | Commander involved (13 × 1,200) |
   |---|---|---|
   | Contract offer | `contract-offered` 1,865 (default) / 1,893 (ATLS) | 0. Human carriers are blocked from NPC offers (`carrierBlocked`, `src/sim/engine.ts:2068`, used at 2278 and 4388), and there is no accept-contract command. |
   | Debt demand | none. Only `debt-repaid` (2,026 default / 1,322 ATLS) | 0 as actor or target. The commander is a *creditor-faction member*, not named. |
   | Peace overture | `faction-peace` 22 (ATLS only), payload has `factionIds` only | the event is a concluded peace, not an overture. |
   | Pact proposal | none. `alliance-formed` 59, `alliance-broken` 42 (ATLS), after the fact | factions only. |
   | Ransom offer | none. Terms appear on `captivity-released` (`terms.demandedValue`, `moneyPaid`, `debtValue`); `character-captured` carries `captivity` | `character-captured` 16 of 247, `captivity-released` 16 of 218 (default) |
   | Cession / sale offer | none. `settlement-purchased` 13 (ATLS), and NT is not in src | 0 |
   | Order reports | `standing-order-completion-reported` 177, `-refused` 82, `-deviated` 728, `-accepted` 178 (default) | in the payload: 112, 44, 96, 112 (the commander is the issuer) |
   | Secession | `secession-declared` 31 (default) / 32 (ATLS) | former-faction members, incl. the commander |

   So the live idle inbox of the commander can be fed by **order reports, captures and releases, secessions, and (ATLS) alliance and peace notices**. Contract threads exist only when the *player* is a party (the player offers, the NPC carrier refuses/accepts/fulfils). Debt demands, pact proposals, ransom offers and cession offers need a new sim event first; that is a separate slice and is *not* specified here (non-goal N1). The Lead has ordered the next sim slice: a contract offer to a human first, then debt demand (ruling 7); this document only records that order.
2. **Order reports are the volume.** The commander is the issuer of the standing order held by each `world-government` character (`src/sim/scenario.ts:251`: issuer `character-01` for `world-government`, `character-14` otherwise), so all reports arrive at one receiver. At t72 the request tab holds **12 threads in all 13 seeds**; after t100 the commander gets 0–2 openers per 100 ticks (default) (table 6.1).
3. **Conversation state is already stored and hashed** (`canonicalJson(world)`, `src/sim/state.ts:532`; events applied in `applyEvent`, `state.ts:588-614`). Conversation events are produced *outside* `runTick`: `resolveDueReplies` runs after it (`src/dashboard/server.ts:168-170`, `src/cli/run-simulation.ts:93-95`). A hook placed beside it cannot move any runTick-only pin or `tests/fixtures/golden-hashes.json`.
4. **The existing feed already limits what a character may know about an event** (`projectEventFeed(world, viewerId, events)`, `view-model.ts:909`). A thread must not tell its receiver more than the receiver's own feed row for the same event. Visibility is therefore defined *relative to that row* (P3, P4), not re-derived.

## 3. Which events open a thread, who sends, who receives

Reference rules: [npc-threads/triggers.ts](npc-threads/triggers.ts). Pure read of an existing event plus the world after the tick. No RNG, no write.

| Topic | Source event | Sender (role) | Receiver | `awaitsReply` | Live | Commander openers, 13 seeds idle default | ATLS |
|---|---|---|---|---|---|---|---|
| order | `standing-order-completion-reported` | the order holder (officer) | the issuer | **yes**: the `confirm-order` verb answers it | on | 112 | 112 |
| order | `standing-order-refused` | the holder | the issuer | no | on | 44 | 44 |
| order | `standing-order-deviated` | the holder | the issuer | no | on | 44 | 45 |
| order | `standing-order-accepted` | the holder | the issuer | no | **off** (trivial ack, +112 openers) | (112 extra) | |
| contract | `contract-offered/-accepted/-refused/-breached/-fulfilled/-cancelled` | the event actor | the event target | no | on | 0 (commander is never a party) | 0 |
| captivity | `character-captured`, `captivity-released` | the captor faction's representative; if the captor has no faction, `ransom.leaderId` | the captive | no | on | 10 + 10 | 9 + 10 |
| secession | `secession-declared` | the port owner who seceded | the former-faction members | no | on | 12 | 9 |
| diplomacy | `faction-peace`, `faction-peace-broken`, `alliance-formed`, `alliance-broken` | the *other* faction's representative | every member of each side | no | on | 0 (flag off) | 26 (7 peace, 9 formed, 10 broken) |
| debt | `debt-repaid` | the debtor | the creditor faction's members | no | **off** (+56 openers) | (56 extra) | |

Notes:

- **Faction representative** = the living, uncaptured, non-human owner of the faction's lowest-id port (`Settlement.ownerId`, `types.ts` ~74). There is no faction-leader concept; this is a read-only stand-in. If none exists the candidate is dropped (`sender-unknown`).
- Only the **human characters** receive threads. NPC-to-NPC threads are not stored (they would add state nobody reads). They are measured in the proxy stream (6.3) only to derive the throttles.
- The sender must be **in the player's `knownCharacterIds`**, else dropped (2 candidates over 13 ATLS seeds). So a thread never introduces a character the player does not know.
- Contract threads are *replies*: when the player offers a contract, the carrier's `contract-refused` etc. arrive as a thread from the carrier (attentive run: 115 refusals over 13 seeds, default).
- Order **`accepted`** is off because "Order received." carries no information and adds 112 openers (232 → 344 at default, bin 0 from 13–17 to 20–28). **`debt-repaid`** is off because it is a payment notice to creditors, not a demand: 726 candidates, 56 pass the pair rule (232 → 288).

## 4. Text: deterministic templates

`DeterministicDialogueProvider` (`src/sim/conversations.ts:303-332`) is an if/else over message tags that returns one fixed sentence, with one trust branch (`trust > 0.62`, line 324). Openers follow the same style: **one fixed lead per template id, one optional trust variant, then the receiver's own feed sentence** (`summary`, the text of `projectEventFeed` for the receiver). No generated text.

| Template id | Text |
|---|---|
| `order.completion-reported` | `trust(holder→issuer) > 0.62`: "Commander, it is done." else "The order is complete." + ` {summary}` + " Confirm it when you are satisfied." |
| `order.refused` | "I cannot take this order." + ` {summary}` |
| `order.deviated` | "I have had to change course." + ` {summary}` |
| `contract.{offered,accepted,refused,breached,fulfilled,cancelled}` | "I have a delivery for you." / "I will carry it." / "I am turning the contract down." / "I could not deliver." / "The delivery is made." / "The contract is off." + ` {summary}` |
| `captivity.captured` | "You are held at {port}." + ` {summary}` |
| `captivity.released` | "You are free to go. The price was {demandedValue}, and you paid it." + ` {summary}` |
| `captivity.released-with-debt` | "You are free to go. The price was {demandedValue}; you paid {moneyPaid}, and {debtValue} stays on your account." + ` {summary}` |
| `secession.declared` | "I am taking {port} out of {faction}." + ` {summary}` |
| `peace` / `peace-broken` / `pact.formed` / `pact.broken` | "{A} and {B} are at peace." / "The peace between {A} and {B} is over." / "{A} and {B} have joined against {C}." / "The pact between {A} and {B} has ended." |

The message is stored with `source: "autonomous"` (the existing source tag), `tags = classifyMessage(text)`, body ≤ 800 chars (the existing cap). `ai.speech` stays a later opt-in: it would replace only the lead sentence, behind its own flag, and would not change which thread opens, who it is from or to, or its throttles (all of which are decided before text). Not specified here.

## 5. The thread: ids, storage, request tab, card link

- **Thread**: `kind: "direct"`, `participantIds` = sorted [sender, receiver], `createdById` = sender, `title` = the sender's name (the existing 60-char cap). `createConversationThread` allows one direct thread per pair (`conversations.ts:139-145`), so a later opener from the same sender reuses the thread (when the player already made one, the NPC writes into it).
- **Ids** are the existing counters (`thread-00001`, `message-000001`). No new id scheme.
- **Request tab** (cards ruling 3, updated by Lead 2026-11-27 ruling 5). A thread is in `request` iff all of: the viewer is a participant; `createdById !== viewer`; the viewer has sent no message in the thread; and the thread is not answered by a confirmed or resolved order. **Answered by order** (projection only): the thread has an opener whose `origin.trigger` is `standing-order-completion-reported` and whose `origin.orderId` names a `StandingOrder` whose `status` is no longer `awaiting-confirmation` (or the order is gone). That covers a player's `confirm-order` (`engine.ts:2755-2776`, applied as `standing-order-completed` with `lastReport.kind` `confirmed`, `state.ts:764-775`) and any other resolution that leaves that status, including `cancel-order` and the one-day `issuer-silent` close (`confirmUnansweredOrders`, `engine.ts:2986-3020`; a day is `ticksPerDay` = 6, `scenario.ts:426`). Refused and deviated threads are not answered this way (their orders are not awaiting confirmation). Reference: `requestThreads` in [hook.ts](npc-threads/hook.ts). Once answered, the thread leaves `request` and sits in `direct`. The measured request-tab sizes in §6.1 used the pre-ruling (message-only) rule and were not re-run.
- **Card link**: cards already derive `threadId` as the viewer's direct thread whose participants are exactly the card's two parties (`ui-cards-v1.md` section 3.1). An NPC opener creates exactly such a thread, so an order-report card links to its report thread **with no change to the card derivation** (seed 1847: 12 order cards carried a `threadId`, `orderCardsWithThread` 12). Faction-level cards (peace/pact) have no two-character parties and keep `threadId: null`.
- **Storage addition (ruled)**: an optional `origin?: { trigger: string; sequence: number; orderId?: string }` on a `ConversationMessage` written by the hook, absent on every human message and every reply. `trigger` and `sequence` are the source event (the pair rule, 6.2, and the audit key). `orderId` is set only on order-topic openers, from `event.data.orderId` (e.g. `engine.ts:4720`), so the request-tab rule can find the standing order from the world alone. It is not needed for other topics.
- **Flag (ruled)**: `npcThreads` (default off), read by the *callers* of the hook (dashboard server and CLI), **not** by `TickOptions`, so `runTick` is untouched and runTick-only pins cannot move. The hook runs once per tick, after `runTick` and beside `resolveDueReplies`, in event order then receiver id. Threads are stored world state, so the inbox is the same after recover and across sessions (ruling 3).


### 5.1 Read state and unread badges (v1)

No archive in v1 (ruling 6). Unread badges need a per-participant last-read marker, set through a small POST. The Lead asked to keep it out of the hashed state if possible.

**How the hash is computed.** `stateHash(world)` is SHA-256 of `canonicalJson(world)` (`src/sim/state.ts:528-533`). `canonicalJson` is a key-sorted `JSON.stringify` of the value it is given, with **no field allow-list or denylist**. Every field of `WorldState` (`types.ts:777-818`) is in the hash, including `players` (`:805`), `conversationThreads` (`:808`), `conversationMessages` (`:809`), and `scheduledReplies` (`:810`). The thread interface is `:502-509`; the message interface is `:517-531`. There is no existing hook to omit a field.

**How conversations are stored and persisted.** Threads and messages live only on `WorldState`. They are written exclusively through `applyEvent` (`state.ts:588-614`: `conversation-thread-created`, `conversation-message-sent`, and the reply events). The dashboard and CLI persist the world in `WorldStore` (`src/sim/persistence.ts`): a SQLite file with `events`, `snapshots`, and `metadata` (`persistence.ts:57-80`). A snapshot row is `JSON.stringify(world)` plus `stateHash(world)` (`:90-97`, `:115-144`). Recover loads the latest snapshot, checks that hash, then replays later events (`:154-181`). `appendTick` writes events and, on a day boundary or every 5,000 sequences, a new snapshot of the whole world (`:109-152`). The existing similar UI marker — `Player.briefingAcknowledgements` (`types.ts:482-484`) — **is in the hash**: `POST /api/briefing/acknowledge` (`server.ts:231-240`) calls `acknowledgeBriefingItem`, which emits `briefing-item-acknowledged`; `applyEvent` writes `player.briefingAcknowledgements[itemId] = world.tick` (`state.ts:624-627`) and `store.appendTick` persists it. Putting `lastReadTick` on `ConversationThread` or on `Player` would do the same and **could not be hash-neutral**.

**Where read state lives (hash-neutral).** A new table on `WorldStore`, not a field of `WorldState`, not a sim event, not a snapshot column:

```sql
CREATE TABLE IF NOT EXISTS thread_reads (
  thread_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  last_read_tick INTEGER NOT NULL,
  PRIMARY KEY (thread_id, player_id)
);
```

Methods on `WorldStore` (names are suggestions): `setThreadRead(playerId, threadId, lastReadTick)` and `threadReads(playerId): ReadonlyMap<string, number>`. `POST /api/threads/:id/read` writes this table only. It must not call `applyEvent`, must not append to `events`, and must not call `appendTick`. Then `stateHash` cannot move, golden hashes and the flag-off pins stay still, and a headless CLI run that never opens the table is unchanged. Reads survive dashboard restart because they sit in the same SQLite file as the snapshots; they do not survive a `--reset`, a recover from `state_json` alone, or a tool that copies only the world blob. That is the trade-off of staying off the hash.

`lastReadTick` (not a last-read message id) is the v1 marker. The POST sets it to `world.tick` at the moment of the request. Several messages in one thread can share a `createdTick` (a hook opener and a scheduled reply in the same tick); they become read together. A last-read message id would be hash-neutral the same way if the Lead later wants per-message precision.

**Endpoint.**

- Path: `POST /api/threads/:id/read` (add next to the existing conversation routes, `server.ts:249-273`; catalog it in `requestContract`, `commands.ts:309-318`).
- Body: `{ playerId: string }` (required; the id from `state.player.id`, same as `POST /api/threads` and `POST /api/messages`).
- Success: `200 { ok: true, threadId, lastReadTick }`. Idempotent: a later POST overwrites with the then-current `world.tick`.
- Failures (HTTP 400, stable `code`): `unknown-player`; `unknown-thread`; `not-participant` (the player's character is not in `thread.participantIds`). An unknown thread is a 400, not a 404, to match the other conversation routes.
- Auth/session is whatever the other `/api/*` routes already use (today, the body `playerId` against `world.players`).

**Visibility.** Each player sees only their own read marker. `lastReadTick` is keyed by `playerId`, not by character id (unread is a player-UI concern; the prototype has one human character per player). A participant who is not this player — including the NPC sender — never receives this player's marker, and this player never receives anyone else's. The projection is viewer-scoped, like `conversations.threads` today (`view-model.ts:1686-1699`): a bystander still does not see the thread (P7), and no payload field lists another player's `lastReadTick`.

**`/api/state` derivation.** The server already reads the store to build the event page before calling `dashboardState` (`server.ts:131-136`; `dashboardState` itself, `view-model.ts:1397-1411`, does not take the store). Pass this viewer's map as a new argument, e.g. `threadReads?: ReadonlyMap<string, number>`, from `store.threadReads(player.id)`, the same way `feedCounts` is passed today. On the viewer-scoped `conversations` block (`view-model.ts:1686-1699`):

- `threads[]` gains `lastReadTick: number | null` (null if this player has never POSTed a read for that thread) and `unreadCount: number`.
- `unreadCount` for a thread = the number of that thread's messages (already filtered to threads the viewer is in) with `createdTick > lastReadTick`. If `lastReadTick` is null, every message in the thread is unread.
- `conversations.unreadCount: number` = the sum of per-thread `unreadCount`, for a nav badge. Tab arrays stay id lists; the client derives a per-tab unread sum from the thread fields.
- These fields are projection-only. They are not on `ConversationThread` in `types.ts`.

**Properties (add to §8 as P13–P15).** A POST /read does not change `stateHash`. A viewer payload never includes another player's marker. `unreadCount` is exactly the messages with `createdTick > lastReadTick` (or all messages when the marker is null).

## 6. Throttles, from measured distributions

### 6.1 Volume the commander sees

Measured with the recommended rules (pair rule, sender cap 9, pair cap 3, no receiver cap; section 6.4). `per100` = openers received in each 100-tick bin. "Threads" = threads created by an NPC. Inbox sizes are the tab lengths the app would show from `view-model.ts`' `conversations` block (the same function the harness calls). **These request-tab counts used the pre-ruling message-only rule.** Under ruling 5, a completion-report thread leaves `request` once its order is no longer `awaiting-confirmation`, including the one-day `issuer-silent` close (6 ticks). The harness was not re-run; live idle request tabs will be smaller than the t72 / t1200 figures below once that rule is applied.

| Run (13 seeds × 1,200) | Openers | Per seed | Openers per 100 ticks | Threads created (per 100 ticks) | bin 0 (t0–99) | bins 1–11 mean / p95 / max | Request tab at t72 | Request tab at t1200 | All tab at t1200 |
|---|---|---|---|---|---|---|---|---|---|
| idle, default `{}` | 232 | 15–21 | 1.49 | 172 (1.10) | 13–17 | 0.24 / 1 / 2 | 12 in all 13 | 12–17 | 12–17 |
| idle, ATLS | 255 | 15–26 | 1.63 | 174 (1.12) | 13–16 | 0.40 / 2 / 3 | 12 in all 13 | 12–15 | 12–15 |
| attentive, default | 357 | 23–33 | 2.29 | 181 (1.16) | 15–19 | 1.01 / 2 / 3 | 0 | 0 | 13–17 |
| attentive, ATLS | 394 | 24–35 | 2.53 | 186 (1.19) | 14–19 | 1.25 / 3 / 4 | 0 | 0 | 13–16 |

- *idle* = the player never acts; the inbox only grows (nothing answers a thread).
- *attentive* = a scripted player: confirms every awaiting order, offers a contract every 60 ticks to a rotating carrier, replies to a request thread when its opener is ≥ 3 ticks old. It is a stress script, not a model of a player. Stored messages: 719 (default) and 766 (ATLS) over 13 seeds, i.e. ≈55–59 per seed, including replies.
- **The shape is a startup burst, then a trickle.** 12–17 openers land in the first 100 ticks (12 request threads exist at t72 in every seed: the first reports on the issuer's seeded standing orders), then 0–2 per 100 ticks (idle default).
- Other human seats (idle, default): `character-02` 19 openers total (0.12 per 100 ticks), `character-03` 21 (0.13), `character-04` 5 (0.03), `character-05` 17 (0.11), all captures, releases and secessions; `character-14`, the other issuer, 180 (1.15) with bin 0 of 10–11. A non-issuer seat sees a near-empty inbox, which is what the data says.
- Options measured and left off: `standing-order-accepted` (+112, 344 total, bin 0 20–28) and `debt-repaid` (+56, 288 total, request tab up to 20).

### 6.2 The pair rule (structural, not a tuned number)

**One unanswered opener per (sender, receiver, trigger type) within 180 ticks** (the check-in window, ruling 2). "Answered" = the receiver sent a message in the thread at or after the opener. It reads `origin.trigger` from stored messages, so it needs no extra state. Measured: it drops 52 of 284 order candidates at idle default (18 %) and 43 of 400 at attentive; in the proxy stream (every character as a receiver, 6.3) it takes 6,340 feed-visible candidates to 3,556 (−44 %). Without it, one receiver sees up to 52 candidates in a 100-tick bin (raw per-receiver p99 25, max 52); with it, the max is 17.

### 6.3 Rate caps: how they were derived

Proxy stream: every character is treated as a receiver for the order, contract and captivity triggers (read-only, nobody ever answers), after the pair rule. Counts are per entity per 100-tick bin, pooled over 13 seeds, nonzero cells only. Policy parameter, declared: the percentile (p95). The values are read off, not tuned to a target. From `results/summary.md` (`quantiles.ts`), default `{}`:

| Cells (after pair rule) | n | p50 | p90 | p95 | p99 | max |
|---|---|---|---|---|---|---|
| per receiver | 1,214 | 2 | 6 | **8** | 14 | 17 |
| per (sender, receiver) pair | 2,442 | 1 | 2 | **3** | 4 | 5 |
| per sender | 1,272 | 2 | 6 | **9** | 13 | 20 |
| *(raw per receiver, before the pair rule)* | 1,288 | 3 | 12 | 16 | 25 | 52 |
| *(raw per pair)* | 2,778 | 2 | 4 | 6 | 13 | 30 |

ATLS: receiver p95 8 (p99 15, max 17), pair p95 3 (max 5), sender p95 8 (p99 13, max 20). Caps apply to stored openers over the **trailing** 100 ticks (the proxy bins are tumbling 100-tick bins; this is a declared approximation).

### 6.4 What the caps do to the commander, and the recommendation

| Caps (receiver / pair / sender per 100 ticks) | Idle default openers | Dropped by cap | Idle ATLS | Attentive default | Attentive ATLS |
|---|---|---|---|---|---|
| none (pair rule only) | 232 | 0 | 256 | 357 | 395 |
| p99: 14 / 4 / 13 | 216 | 16 (all order) | | 327 | |
| **p95: 8 / 3 / 9** | **140** | **115 (all order)** | 161 | 251 | 285 |
| p90: 6 / 2 / 6 | 115 | 157 (all order) | | 224 | |
| **Recommended: ∞ / 3 / 9** | 232 | 0 | 255 (1 pair-cap drop) | 357 | 394 |

**Finding.** After t100 the commander never gets more than 2 openers per 100 ticks at idle default (3 ATLS, 4 attentive ATLS), so a p90 receiver cap of 6 never binds there either. The **only** thing a receiver cap removes is the startup burst of order reports, i.e. the reports the player is meant to confirm: at p95, 115 dropped candidates in default idle, all `order`, and 40 % fewer openers (232 → 140). The commander is a structural outlier because they are an issuer (`scenario.ts:251`); `character-14`, the other issuer, sees the same burst (bin 0 of 10–11, max receiver cell 17 overall). A population percentile would silently starve the one seat the inbox is for.

**Ruled (v1):** ship the pair rule, a **sender cap of 9** and a **pair cap of 3** (the measured p95s; neither binds for the commander in the idle default run, and the pair cap binds once in 13 ATLS seeds on a capture), and **no receiver cap**. Revisit the receiver cap when a real session distribution exists; the harness reproduces the table with `CAPS=r,p,s`.

## 7. Hash impact: stored (B, recommended) or projection-derived (A)

| | **A. Projection-derived, materialized on first reply** | **B. Stored, post-`runTick` hook, flag-gated (recommended)** |
|---|---|---|
| What is stored | nothing until the player writes in a pending thread | thread and opener events at open time |
| Flag-off hashes | unchanged | unchanged by construction: nothing runs. Verified on `3c55552` (below) |
| Flag-on hashes | unchanged until the player replies | change (re-pin) for every seed |
| Needs | virtual thread ids; a materialize step inside the send path; throttle state derived from a window of events | no new machinery. Reuses `createConversationThread` shape, `resolveDueReplies`, replay, `conversations` projection |
| Window risk | openers older than the events the dashboard reads vanish. `dashboardState` reads `CHECK_IN_READ_CAP = 40_000` events (`persistence.ts:15`, `server.ts:131-136`); the busiest 180-tick window I measured holds 26,606–26,975 events (66–67 % of the cap), so a longer absence truncates | none: threads persist |
| Throttle | cannot see "answered" across windows without stored state | `origin` on the opener makes it a pure function of the world |
| Replay | n/a until a reply | measured, below |
| Recover | derived, always consistent | consistent; the hook must be idempotent on `(origin.sequence, receiver)` (Engineer test T6) |

**Measured for B** (13 seeds × 1,200, hook-on vs hook-off):

- The flag-off pins on `3c55552` are unchanged: **1847 `7f76e474`/`94de9c02`; 2718 `976c40bd`/`7a3741c9`; 4096 `08943ea5`/`af6eeaea`** (h72/h1200), and all 13 seeds are in `results/summary.md`.
- Flag-on, idle default (h72/h1200): 1847 `d63b1a54`/`3cf45f2c`; 2718 `b07f42e8`/`f9273eea`; 4096 `ad94041d`/`be4fa4a8`. All 13 seeds change at h72 and h1200. ATLS: 1847 `3872087f`/`17adf887`; 2718 `d301edfe`/`4cc9c420`; 4096 `7267b7c5`/`79329101` (flag-off ATLS `85658e53`/`5367691c`, `aa54ada1`/`faf5798a`, `e4361ee1`/`7e93eab2`).
- **The hook writes nothing but conversation state, except that it consumes `nextEventSequence`.** That shifts ids minted from it (`news-N`, `battle-N`, `debt-N`, `"sequence"`, "seq N"). With those normalised, the sim event stream is identical to hook-off in 13/13 seeds in every configuration (`simStreamEqual`), and the world with all conversation fields blanked is identical in 13/13 (`blankedEqual`). The hook draws no RNG. This is why B re-pins but does not change sim behaviour. If the Lead wants B to be byte-neutral for the sim, the hook must mint events without `nextEventSequence`, which the event store does not support; I did not try it.
- Replay: idle runs replay exactly in 13/13 (default and ATLS). Conversation state replays exactly in 13/13 in every run. Commanded (attentive) runs replay exactly in 11/13 (default) and 12/13 (ATLS); the hook-off run is 12/13 in both. The only differing field is `characters.<id>.shortMorningStreak`. It also differs with the hook off (seed 8000), so it is not caused by the hook; I did not find why seed 2000 differs only with the hook on (default). Likely cause: a between-tick command applied after the silent start in replay but before it live. Reported, not fixed (non-goal N4).

**Ruled: B.** The inbox is real persistent state, seen the same way across sessions. A is attractive because it moves no pin, but it needs a materialize path inside the send command, virtual ids the rest of the app must handle, and loses openers beyond the read window. B costs one re-pin behind a default-off flag and nothing else.

## 8. Visibility and privacy (every statement is a check)

Checks run in `measure.ts` on every opener (counts in `results/*.jsonl` `checks`; 0 violations in all 23 runs).

| # | Property | Harness check |
|---|---|---|
| P1 | The receiver of every opener is a human character. | `receiver-human` |
| P2 | The sender is in the player's `knownCharacterIds`. | `sender-known` |
| P3 | The triggering event projects a non-empty feed row for the receiver (`projectEventFeed(world, receiver, [event])`), and `summary` is that row's sentence. A thread is never visible to a receiver who could not see the event. | `opener-feed-visible` |
| P4 | Every number in the text appears in the receiver's own projected feed row for the event (summary and payload). | `number-scan` (`numbers-checked` 14 in the first seed alone; 0 violations) |
| P5 | The thread is `direct`, its participants are exactly {sender, receiver}, `createdById` = sender. | `thread-participants` |
| P6 | The opener has `source: "autonomous"`, an `origin`, `senderId` in the participants, body ≤ 800. | `opener-shape` |
| P7 | A character who is neither sender nor receiver never has the thread in their projected `conversations.threads` or tabs. | `bystander-no-thread` |
| P8 | `tabs.request` is exactly the threads with `createdById !== viewer`, no viewer message, and (for a completion-report opener) an order that is still `awaiting-confirmation`. | `request-rule` |
| P9 | A card's `threadId` is in the viewer's own threads and both parties are participants (cards P9). | `card-threadid-participant`, `card-threadid-viewer-scoped` |
| P10 | Same seed and script give the same hash twice. | `replayExact`, `conversationReplayExact` |
| P11 | Flag off: the world is byte-identical to `3c55552`. | pins (section 7) |
| P12 | The hook draws no RNG and writes only conversation events. | `simStreamEqual`, `blankedEqual` |

| P13 | `POST /api/threads/:id/read` does not change `stateHash(world)` and writes no sim event. | Engineer test T9 |
| P14 | A viewer's `conversations` payload never includes another player's `lastReadTick`. | T9 |
| P15 | Per-thread `unreadCount` equals the messages on that thread with `createdTick > lastReadTick`, or every message when the marker is null. | T9 |

Contract-buyer note: the existing feed shows the buyer a refusal's score against the threshold, so a refusal thread repeats numbers the buyer's feed already shows. P4 is defined against that row on purpose; it neither widens nor narrows what the buyer knows.

## 9. Acceptance

Properties (all must hold, checked over the 13 seeds):

1. P1–P12 above, 0 violations.
2. **Liveness**: in idle default, every one of the 13 seeds has ≥ 12 threads open by t72 and ≥ 1 thread at t200 (measured: 12 request threads at t72 in all, under the message-only rule). In idle ATLS ≥ 1 diplomacy thread appears in a seed (26 openers over 13 seeds).
3. **Boundedness**: no 100-tick bin after t100 exceeds 4 openers for the commander (measured max 2 default idle, 3 ATLS idle, 3 attentive default, 4 attentive ATLS); the request tab never exceeds 20 (measured max 17; 20 with `debt`).
4. **Answered threads leave `request`**: after the player writes, or after the named order leaves `awaiting-confirmation`, the thread is in `direct` and not in `request` (measured for the write path: 0 request threads at the end of the attentive runs; the confirm/resolve path is Engineer test T5).
5. **Throttle law**: no stored (sender, receiver, trigger) has two unanswered openers closer than 180 ticks (`pair-open` drops 52 at idle default).
6. Flag-off pins unchanged on the three pinned seeds and all 13.

## 10. Test plan for the Engineer

1. T1 `npc-threads/triggers`: one fixture world per row of section 3: asserts sender, receiver, template id and text for each source event, including the trust branch and `awaitsReply` only on completion-reported.
2. T2 pair rule: two same-trigger events within 180 ticks give one opener; after the receiver writes, the next opens; a different trigger type opens independently.
3. T3 caps: with `perSender 9`, `perPair 3` set, the 10th/4th opener in 100 ticks is dropped; with no receiver cap nothing is dropped for the order burst.
4. T4 visibility P1–P7 on a constructed three-party world (bystander never sees the thread; a receiver for whom `projectEventFeed` is empty gets none).
5. T5 request tab: NPC-created thread in `request`; after the viewer's message it is in `direct`; a player-created thread is never in `request`; a completion-report thread leaves `request` after `confirm-order` (and after `issuer-silent` / cancel) with no viewer message, and a refused-order thread does not.
6. T6 hook idempotence and recover: re-running the hook for a tick that already opened a thread adds nothing (dedupe on `(origin.sequence, receiver)`); not covered by the harness.
7. T7 hash: flag off, `golden-hashes.json` and the three pins unchanged; flag on, replay of a recorded run reproduces conversation state exactly.
8. T8 card link: an order card for a reported order carries the `threadId` of its report thread.
9. T9 read state: `POST /api/threads/:id/read` by a participant returns 200 and leaves `stateHash` unchanged; a non-participant or unknown thread is 400; a second player (constructed) does not see the first player's `lastReadTick`; `unreadCount` matches P15; after a dashboard recover from the same store file the marker is still there.
10. Run `npc-threads/measure.ts` and `summarize.ts` in CI-less review; compare to `results/summary.md`.

## 11. Non-goals

- N1 New sim behaviour or events in *this* slice: no debt demand, pact proposal, ransom offer, cession/sale offer, contract offer to a human, or NT. The next sim slice (Lead ruling 7) is a contract offer to a human first, then debt demand; it is recorded, not specified here. Where those exist as events later, they add a row to section 3 and nothing else.
- N2 NPC-to-NPC stored threads.
- N3 `ai.speech` or any generated text.
- N4 Fixing the `shortMorningStreak` replay difference (Lead: covered by the separate replay bisect).
- N5 Push notifications or auto-archive. Read state for unread badges is in scope (§5.1). No archive in v1.
- N6 NPCs answering beyond the existing scheduled-reply machinery.

## 12. Open questions for the Lead

Items 1–8 of the previous §12 were ruled on 2026-11-27 (see **Rulings (Lead, 2026-11-27)**). Remaining:

1. Ruling 5 is written to treat any departure from `awaiting-confirmation` as resolving, including the one-day `issuer-silent` close (`engine.ts:2986-3020`, 6 ticks). Confirm that an idle commander who never confirms still has those completion-report threads leave `request`. If not, the rule should name only a player's `confirm-order` and `cancel-order`.
2. Approve adding optional `orderId` to `origin` on order openers? The ruled `{ trigger, sequence }` is not enough to find the standing order from the world alone (events live in the store, not on `WorldState`).
3. Confirm `lastReadTick` (set to `world.tick` on POST) over a last-read message id. Same-tick messages become read together.

## 13. Reproduce

```
node --experimental-strip-types docs/design/npc-threads/measure.ts default '{}'            # idle, flag-off vs flag-on, 13 seeds × 1,200
SCENARIO=attentive CAPS=Infinity,3,9 node --experimental-strip-types docs/design/npc-threads/measure.ts atls '{"alliances":true,"portTransfer":true,"lifecycle":true,"secessionAftermath":true}'
ROLE=character-14 …  CAPS=r,p,s …  INCLUDE=…,debt …  INCLUDE_ACCEPTED=1 …
node --experimental-strip-types docs/design/npc-threads/summarize.ts rec-idle-default.jsonl   # reads results/
```

Files: `triggers.ts` (rules), `hook.ts` (the reference hook and `requestThreads`), `measure.ts`, `census.ts`, `summarize.ts`, `pins.ts`, `quantiles.ts`, `results/` (raw JSONL, census, `summary.md`). None is imported by `src/`.
