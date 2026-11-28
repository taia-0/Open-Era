# UI gap audit

**Status:** Audit. No `src/` change. Base is `main` `5448fc5` (#199). Spend $0, no AI calls.

The [UI and art direction](ui-art-direction.md) screen inventory still asks the mobile client for four surfaces the sim either does not make, or already makes in a shape the app agents would have to invent. This note checks each against `GET /api/state` (`src/dashboard/server.ts:119-144` → `dashboardState` in `src/dashboard/view-model.ts:1397-1700`), the projection in `src/dashboard/visibility.ts`, and the #192 withheld-key path (`stripPlayerEventData`, `src/dashboard/client-readiness.ts:348-421`). The only live model caller is the World Government picker; caps stay 2,108 standard / 2,510 otherwise as headroom ([offices-docked-governor.md](offices-docked-governor.md):137), at about $0.0000544 a call ([wg-jev-picker.md](wg-jev-picker.md):56). None of these four items spends that budget today.

## 1. Troop promotion and rarity

**Expects.** The party screen lists "Troop groups, counts, experience, discipline, rarity distribution, and promotion readiness" ([ui-art-direction.md](ui-art-direction.md):69). "Troop promotion opens a separate focused panel rather than expanding every tree inline" (line 72). The inventory names a "Troop training" surface for "Promotion and branch choices" (line 99). Troops should "communicate branch and tier" (line 61). [World simulation](world-simulation.md):105-108 is the same model: a Mount & Blade-like tree, the player chooses which eligible soldiers are promoted, and rarity is common / rare / epic on individual recruits.

**Exists.** Each named character has one `TroopGroup`: `count`, `experience`, `discipline` (`src/sim/types.ts:136-140`). Setup draws those once (`src/sim/scenario.ts:122`). `recruited` writes only `troops.count` (`src/sim/state.ts:910`). Nothing in a run writes experience or discipline. `projectCharacter` exposes exact troops on the viewer and on a co-located card, otherwise `null` (`visibility.ts:784`), plus a hash-neutral `progression.troopQuality` band — ordinary / gap / veteran / past — "not a stored promotion label" (`visibility.ts:686-698`, `882-890`). Sailors are a separate count (`visibility.ts:783`). Lifecycle `character-promoted` is a new captain, not a soldier promotion; `stripPlayerEventData` drops the cloned `character` (`client-readiness.ts:356`).

**Missing.** Multiple troop groups, a tree, branch choices, rarity, a promotion-readiness figure, and any promote command (`PlayerAction` in `types.ts:536-548` has `recruit` and no promote). [Progression](progression.md) is already ruled: the skill step ships first; "Troop experience, the promotion label, and the rarity mark stay behind it" (progression.md:226). That ruled v1 is still thinner than the training panel: a battle-fed experience step, a band label at 0.35 / 0.55 / 0.8, and an unread side-stream rare/epic mark (progression.md:112-135, 212-214).

**`/api/state`.** App agents read `characters[].troops` and `characters[].progression.troopQuality` on the commander's card (and a co-located card). `state.party` has hold, runway, and passage, not troops (`view-model.ts:1440-1478`). Foreign troops stay unknown (`null`), not zero, matching ui-art-direction.md:49. A training panel would also need a promote verb on `POST /api/commands` and, for rarity, a per-recruit breakdown the stack does not store.

**Cost: L.** New state, hash moves (progression slices 3-5 all move the 72-tick hash), command + tests. No AI. Privacy work is the existing self / co-located / withheld split.

## 2. Proposal and contract cards

**Expects.** Persistent communications include "Compact cards for proposals, agreements, debts, reports, and other structured attachments" (ui-art-direction.md:84) on a "Direct-message thread" used for "Free-form negotiation and attachments" (line 101).

**Exists, but not as cards.** The world stores `SupplyContract` (`types.ts:405-456`, `world.contracts` at 817): provisions only, statuses offered / accepted / refused / fulfilled / breached / cancelled, escrow, deadline. Player commands are `offer-contract` and `cancel-contract` (`src/sim/commands.ts:217-218`). `GET /api/state` already returns `contracts: projectSupplyContracts(...)` (`view-model.ts:1684`). Parties see quantity, price, and escrow; a faction mate of either party sees that the job exists, the destination, and status, with those three figures `null`; a bystander gets no row (`visibility.ts:632-675`). Contract event payloads are the two parties only (`eventPayloadVisible`, `visibility.ts:1048-1056`); a non-party may still get a public sentence (`visibility.ts:1111-1115`). Debts are `DebtObligation` with reason `prisoner-release` (`types.ts:150-157`): on the debtor's own card (`visibility.ts:819`) and, for the creditor faction, as `factions[].debts` (`visibility.ts:981-986`). Peace and pacts are `factions[].diplomacy` for a party (`visibility.ts:987-992`). Standing-order reports already sit on the officer's card. Conversation messages are `body`, `tags`, and optional `replyToId` (`types.ts:512-523`) — there is no attachment field, and threads do not point at a contract, debt, or pact.

**Missing.** A card shape the inbox can hang on a thread: type, parties, terms, status, age, and who may see the figures. No general proposal or agreement object. Negotiated port transfer is still a default-off prototype, not in `src/`. [contracts.md](contracts.md) and the [roadmap](../roadmap.md) structured-negotiation row are stale: they predate `SupplyContract`.

**`/api/state`.** Today the client already has `contracts[]`, `characters[].debts` (self), `factions[].debts` (own faction), `factions[].diplomacy` (party), `characters[].standingOrders` / `lastReport`, and contract rows in the feed. What it does not have is `conversations.messages[].attachments` (or a parallel `cards[]`) joining those records to a thread, with the same party / mate / bystander split the contract projection already uses.

**Cost: S** for a projection-only card view over the records above (hash-neutral, tests for visibility). **M** if cards must be attached to threads as stored state, or if v1 adds a new proposal type.

## 3. Sea sightings

**Expects.** The UI note never names "sea sightings". It does say "The sea's meaningful objects are islands and ships" (ui-art-direction.md:20), that selecting a ship emphasizes "condition, crew, troop groups, supplies, destination, and active orders" (line 51), and that foreign assets show source, age, confidence, and estimates, with unknown shown as unknown (line 49). [Sea sightings](sea-sightings.md) is the channel for a ship met on a voyage.

**Exists.** The derivation is already in the tree (landed `493136e`), computed at read time, and left out of the hash (`visibility.ts:221-245`, `438-453`). `seaSightingsFor` is null in port. A meeting is `passing` / `sharing` / `overtaking` / `arriving`, with sailors, troop count, party power, `source: "direct"`, `confidence: 1`, and a briefing sentence. Cargo and money stay off the row. The row vanishes when the ships separate; storing it was measured and rejected because it moved the fixture (sea-sightings.md:204, 256-258). On `/api/state`, the viewer's own card carries `seaSightings` and `outOfStretch`; a met ship carries `seaSighting` beside live `troops`, which stay `null` at sea (`visibility.ts:798-803`, `868-872`). `briefing.items` also lists each row (`view-model.ts:806-820`). Rival `travel` stays `null` except for self and a faction mate (`visibility.ts:755-761`). Party sightings remain the in-port record. The design README still calls this "Open / proposal"; that line is stale relative to the code.

**Missing.** No map coordinate: a voyage is `fromId` / `toId` / remaining ticks, so a foreign ship is not a placed map object unless the client interpolates the leg. No history after the ships part. The planner does not read the row. The playtest plan ([sea-sightings-001](../playtests/sea-sightings-001.md)) was written; this audit did not re-run it.

**`/api/state`.** App agents can already draw the list from `characters[<self>].seaSightings`, the per-ship `seaSighting`, and `briefing.items` with title "A ship was sighted at sea." Visibility: only the observer at sea, and only while the stretches overlap. `outOfStretch` names same-leg ships that are not alongside, with no troop count (`visibility.ts:413-416`).

**Cost: already built**, hash-neutral. A map marker from the current leg would be a small projection-only add. Persistence is a new-state, hash-moving change the proposal already rejected.

## 4. Live dialogue

**Expects.** Local choice-list / choice-grid conversation is superseded (ui-art-direction.md:102-103). The current direction is persistent communications: inbox tabs for all, direct, group, and request threads; a free-form composer; delivery time and pending-reply indication; participant identity and thread context (lines 78-83). [Autonomous characters](autonomous-characters.md):102-137 matches that: anyone may message anyone whose identity is known; reply timing is deterministic, not a model; proposed actions are discarded unless they later pass a separate authorized command workflow. The sandbox "uses a deterministic dialogue provider."

**Exists.** Threads, messages, and scheduled replies are world state (`types.ts:489-534`), starting empty (`src/sim/scenario.ts:449-451`). `POST /api/threads` and `POST /api/messages` are on `capabilities` (`src/sim/commands.ts:308-318`; `server.ts:253-273`). Kind is `"direct"` or `"group"` only (`types.ts:489`). A send is capped at 600 characters and 4 messages per tick; the other party must be in `player.knownCharacterIds` (`conversations.ts:14-16`, `128-136`). Replies are scheduled 1-12 ticks later from activity, urgency, relationship, and jitter (`conversations.ts:191-207`). `DialogueProvider.respond` stores the text on `conversation-reply-created`. The dashboard and headless runner use `DeterministicDialogueProvider` (`server.ts:95`, `conversations.ts:303-330`); `proposedActions` are counted and discarded (`conversations.ts:373-384`). `GET /api/state` already returns `conversations.threads` (with participant names), `messages`, and pending `scheduledReplies` for threads the commander is in (`view-model.ts:1686-1698`). Event payloads are participant-only (`visibility.ts:1029-1032`). Headless runs send no messages, so speech is 0 calls and $0 ([ai-brain.md](ai-brain.md):149-162, 254). `ai.speech` stays off; a model reply would be world state and would move the hash.

**Missing.** No inbox tab grouping in the projection (`request` is a message tag, not a thread kind). No expected-response-window field beyond `scheduledReplies[].dueTick`. No composer other than `POST /api/messages` `{ body }`. Autonomous characters never open a thread; only the player API does. Replies are canned, not live model speech. No attachment cards (see §2).

**`/api/state`.** `conversations.{threads,messages,scheduledReplies}` is enough to draw an inbox and a thread, including pending reply and `createdTick` / `lastMessageTick`. Tabs are a client or thin-projection filter. A live model voice is not a `/api/state` field; it is a provider swap behind `ai.speech`, hash-moving, and only spends money when a player actually sends.

**Cost: S** to package the inbox (projection, hash-neutral). **M** for model speech: hash impact, privacy already mostly in place, tests for replay of stored replies, AI spend only on player-started threads (0 headless, not the 2,108 picker cap).

## Ranking and recommendation

| Rank | Item | Value to app agents now | Cost |
| ---: | --- | --- | --- |
| 1 | Proposal and contract cards | High: the communications mockups need a card they can hang on a thread, and the records already exist | S (projection) / M (stored attachments or a new proposal type) |
| 2 | Live dialogue (inbox packaging) | High: the thread payload is already on `/api/state`; tabs and pending-reply are a thin layer | S; model speech is a later M |
| 3 | Sea sightings | Already drawable; the remaining gap is a map position, not a new channel | Already built; map marker is a projection-only S |
| 4 | Troop promotion and rarity | The party screen can already show one stack and a quality band; the training panel has no sim behind it | L, and ruled to wait on the skill step |

**Spec first: proposal and contract cards.** It is the only one of the four where the UI's current-direction surface (the inbox and DM thread) cannot be drawn without inventing a shape, and almost all of the work can stay projection-only and hash-neutral: one card type over `state.contracts`, own-faction debts, party diplomacy, and standing-order reports, with the party / mate / bystander visibility the contract projection already enforces. Sea sightings and the conversation list do not need a new system spec; they need a close-out (mark sea sightings built; tell the app agents which keys to read) and, optionally, inbox tab grouping in the same communications pass. Troop training should not jump the ruled skill-step queue, and even then the ruled v1 is a label and a rarity mark, not the full tree the mockups show.

**Projection-only, hash-neutral quick wins.** (1) Read `characters[].seaSightings` / `seaSighting` and the briefing sea items; optionally derive a along-leg fraction for a map pin. (2) Shape existing contracts, debts, pacts, and order reports as cards without writing the world. (3) Group `conversations.threads` into all / direct / group / request in the projection or the client. (4) Keep using `progression.troopQuality.band` as a readout, and do not treat it as promotion or rarity.

## Questions for the Lead

1. Sea sightings: accept the in-tree derivation and mark [sea-sightings.md](sea-sightings.md) and the design README **Built**, or is a map coordinate or a kept history still required?
2. Contract cards, v1: which records become cards — supply contracts only, or also debts, peace/pacts, and standing-order reports? Negotiated-transfer offers are still default-off and out of `src/`.
3. Do those cards need a stored link on a conversation thread, or is a top-level `cards` (or the lists that already exist) enough for the mobile client?
4. Troop training: confirm it stays behind the ruled skill step, and that v1 is the progression note's band label and rarity mark, not the full tree in ui-art-direction.md.
5. Speech: keep `DeterministicDialogueProvider` for v1, with model speech a later `ai.speech` opt-in that moves the hash?
6. Do autonomous characters ever open threads, or is the inbox player-initiated only in v1?
