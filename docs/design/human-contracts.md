# Human contracts: a contract offer to a human carrier

**Status:** Spec + prototype, off `main` `37804a7` (#205 engine-hygiene merged; npc-threads #203 is in). Branch `docs/human-contracts`. This is the slice the Lead ordered as next in npc-threads ruling 7 ("contract offer to a human, then debt demand"). Part 1 is the contract offer; Part 2 (debt demand) is sketched and sized, not specified, because it is not small (section 11).

Everything below is measured on a **throwaway tree** with [human-contracts/fix.patch](human-contracts/fix.patch) applied (3 files under `src/sim/`, +231 −7). Nothing under `src/` is changed by this branch. Harness and results: [human-contracts/](human-contracts/) (`measure.ts`, `thread-hook.ts`, `card-states.ts`, `summarize.ts`, `noise.ts`, `debt-census.ts`, `run.sh`, `results/`). Offline, $0, no AI calls. 13 seeds (1847, 2718, 4096, 1000 to 10000) × 1,200 ticks, flag-off default config and ATLS (`alliances + portTransfer + lifecycle + secessionAftermath`).

## 1. Summary and recommendation

- **A human is never a carrier today** because `carrierBlocked` (`src/sim/engine.ts:2068`) requires `controller.kind === "autonomous"`, and the same predicate gates the NPC offer walk (`:4388`) and the player-offer path (`:2278`). There is also no accept or decline command (`COMMAND_TYPES`, `src/sim/commands.ts:209`). The commander has been offered 0 contracts on every seed.
- **Do not change `carrierBlocked`.** Add a parallel candidate rule for humans, behind a new default-off flag `HUMAN_CONTRACTS`. Relaxing `carrierBlocked` would put the commander (`character-01`, the lowest id) first in the id-ordered walk for every shortage, which is the "human first" variant below, with no eligibility guard.
- **Eligibility** (recommended): the existing NPC buyer at a shortage port (`offerAutonomousSupply`, `:4369`), a human who is docked, free, knows the buyer, has no open contract with that buyer and no other open offer, has not declined, ignored or breached that buyer's offer in the last 180 ticks, and passes the **same own-port skip the NPC walk applies** (the port they stand in can stock the voyage). The two hard gates of `assessSupplyContract` bind; its score never does. The human is offered **only when no NPC carrier would take the contract** ("last resort"), so no NPC is displaced.
- **Volume is low for a commander who stays in port.** Recommended rule, offers per 100 ticks per seed: idle 0.058 (both configs), attentive 0.128 (default) / 0.147 (ATLS). That is 9 to 23 offers over 13 seeds × 1,200 ticks, on 7 to 9 of 13 seeds, against 1,865 / 1,893 NPC offers. The eligibility rule is the lever; the "relaxed" variant (drop the own-port skip) gives 2.4 to 3.3 per 100 ticks and 96 % of those offers are declined for lack of stock at the commander's port.
- **Answer window = the app's own check-in window, 180 ticks** (`CHECK_IN_TICKS`, `src/dashboard/view-model.ts:87`). NPC acceptance latency is **exactly 1 tick** (n = 2,721, min = p50 = p90 = max = 1) by construction, so it cannot be the human deadline. Delivery deadline is the NPC formula applied **at the moment of acceptance**; measured, a human who loads cargo first and then accepts delivers in p50 4, max 5 ticks, inside it.
- **Accept and decline** are two new commands on `/api/commands` (`{playerId, type, contractId}`), emitting the existing `contract-accepted` / `contract-refused` events. Ignoring lapses the offer to `contract-cancelled` (`offer-expired`), escrow returned, no relationship written.
- **Breach reuses the NPC path unchanged** (`resolveContractOutcomes`, `:2477`): escrow returns, `relationship-changed` DEFEAT both ways (`:2117`, `contractRelationship` `src/sim/contracts.ts:199`). There is no debt or reputation on breach for anyone; a human who breaches loses nothing but the relationship (section 6).
- **Flag off is byte-identical:** all six pins hold on the unpatched `37804a7` and in 72 of 72 flag-off runs on the patched tree; `npm test` 690/690 on the patched tree.
- **Debt demand is not small** (section 11). The commander was released with debt 16 times over 13 default seeds and repaid 0, because repayment is auto-collected from wages and the commander never works. A demand needs a trigger, two verbs, and a consequence the engine does not have.

## 2. What exists today

| Piece | Where (`37804a7`) | Fact |
|---|---|---|
| Carrier block | `engine.ts:2068-2073` | `controller.kind !== "autonomous"` or captive, travelling, or an attacker in an active battle. Used at `:2278` (player-offer path) and `:4388` (NPC offer walk). |
| Who offers | `engine.ts:4369-4380` | A shortage port (`stocks.provisions < 1`, owned by a faction); the lowest-id autonomous character of that faction standing in it who can pay `SUPPLY_PRICE` 56.25 (`:4365-4367`, quantity 10, deadline cap 720). |
| Carrier pick | `engine.ts:4388-4440` | Lowest-id unblocked carrier with no open contract with that buyer that `assessSupplyContract` would accept, after two walk skips (standing on the destination without the quantity; own port cannot stock the voyage). Deadline `now + min(720, max(travel + 1, 2))`. |
| NPC answer | `engine.ts:2421` (`resolveOfferedContracts`) | Scored the tick **after** issue (`observedTick < tick`), so latency is 1 tick. `assessSupplyContract` (`contracts.ts:114`): hard gates `travel` and `purse`, then `score` against `0.54 + ambition × 0.08` (`:120`). A refusal writes no relationship. |
| Outcome | `engine.ts:2477-2529` (`resolveContractOutcomes`) | Fulfil when landed with the quantity (`:2501-2528`); `no-longer-needed` cancel when the destination shelf holds the quantity (`:2488-2490`); breach at `tick >= deadlineTick` (`:2493-2498`). |
| Player commands | `commands.ts:209` (`COMMAND_TYPES`), `:932` (`carrierUnavailable`), `:1044` (`contractMutationPending`); route `src/dashboard/server.ts:206-208` | The player can offer or cancel; no verb answers a contract. A human carrier is rejected for player offers. |
| Hash | `state.ts:528-533` | `stateHash` is SHA-256 of `canonicalJson(world)`. Contract events apply generically through `event.data.contract` (`state.ts` ~1156-1180). |

Flag convention followed: `TickOptions` field + `*_DEFAULT` constant + module-level `let` set in `runTick` (`engine.ts:4553-4560` for the neighbours). Precedent for an env-only measurement toggle: `OPEN_ERA_SUPPLY_WALK` (`:4392`).

## 3. (a) The human-carrier path

### 3.1 What changes in `carrierBlocked`

**Nothing.** It stays byte-for-byte, so the NPC walk, the player-offer path and `resolveOfferedContracts` keep their meaning. A new function `humanCarrierCandidates(world, buyer, settlement)` carries the human's rules, and `offerAutonomousSupply` calls it only when `humanContractsOn`. The patch is `fix.patch`, `engine.ts` hunk "HUMAN_CONTRACTS eligibility".

A human is a candidate when **all** hold (id order; every player in `world.players`, one in the prototype):

1. alive, `controller.kind === "human"`, not the buyer;
2. not captive, not travelling, docked (`locationId`), not the attacker in an active battle: the same three tests as `carrierBlocked`, minus `controller`;
3. the buyer is in the player's `knownCharacterIds` (npc-threads drops a sender the player does not know, so an offer from an unknown buyer would have no thread; an earlier iteration that also allowed unknown faction mates produced such an offer: sender-unknown, no thread, card `threadId` null);
4. no open contract (`offered` or `accepted`) between this buyer and this human (`openSupplyContract`, `contracts.ts:184`);
5. **no other open offer to this human** (one at a time);
6. **no `declined`, `expired` or `breached` contract with this buyer inside the last 180 ticks** (`observedTick`), the cooldown that keeps a refusal or a miss from being re-offered the next tick;
7. the NPC walk's two skips, unchanged: not standing on the destination without the quantity aboard, and the port they stand in can stock `10 + provisionDemand × voyage − cargo` (stock ≥ shortfall).

Then `assessSupplyContract` is run with the NPC deadline formula and **only the hard gates bind**: `gate === "travel"` or `"purse"` rejects, `gate === "score"` does not. The score is an NPC's willingness; the human decides for themselves. The harness never shows the score to the human.

### 3.2 Who offers, how often

- **Who:** the same NPC buyer `offerAutonomousSupply` already selects (shortage port, owning faction). No new offerer, no new trigger event. The event is the existing `contract-offered` (actor = buyer, target = human).
- **When:** the human is considered **after the NPC walk finds no carrier** ("last resort", recommended). The alternative, "first" (human considered before the walk), is measured below.
- **How often:** bounded by the shortage rate, by rules 5 and 6, and by the own-port skip. Nothing else throttles it. Measured volumes are in section 10.

Why not simply drop `controller.kind` from `carrierBlocked`: `character-01` has the lowest id, the walk is lowest-id first, so the human would be offered every contract the NPC buyer issues at a shortage they are eligible for, ahead of NPCs, and the player-offer path at `:2278` would start accepting a human carrier. The harness's "first" variants show what that costs (section 10.3).

## 4. (b) Thread opener through the npc-threads hook

`contract-offered` is already an npc-threads trigger (`npc-threads/triggers.ts`, topic `contract`: sender = actor = the buyer, receiver = target = the carrier, text "I have a delivery for you." plus the receiver's own projected feed sentence). With a human carrier the receiver is now human, so the hook opens a thread with **no change to the trigger table**. Additions (reference in [human-contracts/thread-hook.ts](human-contracts/thread-hook.ts), a copy of `npc-threads/hook.ts` with four small edits):

1. **Origin** `{trigger: "contract-offered", sequence: <event sequence>, contractId}`. `contractId` is one new optional field on the same mark; the existing optional `orderId` is the precedent.
2. **Request tab.** A contract thread is in `request` while `world.contracts[origin.contractId].status === "offered"`, and leaves it once the human answers (status `accepted`, `declined`, or later `fulfilled`/`breached`). A lapse (`expired`) does **not** answer it, mirroring the Lead's ruling-5 narrowing for orders (a silent auto-close does not answer). See question 4.
3. **Pair rule.** npc-threads allows one unanswered opener per (sender, receiver, trigger) per window and counts "answered" as the receiver writing. A human answers a contract by command, not by message, so a contract opener is also answered once its contract has left `offered`. Without this, 195 of 3,724 offers over all runs had no opener (the first full run); with it, 3,710 openers for 3,719 offers in the final run. The other 9 are the existing npc-threads per-pair cap (3 openers per 100 ticks, drop reason `cap-pair`), all in non-recommended variants but one.

**Card `threadId`** is the existing derived value: the direct thread between buyer and carrier (`ui-cards-v1/cards.ts`, `threadFor`). It is present for the carrier role and `null` for a faction mate. The card, not the thread, is the action surface: a thread body cannot carry buttons, and the number the thread shows (the price) is already in the carrier's own feed row, so no number appears in a thread that the human could not already read (checked: 3,710 openers, 0 numbers outside the receiver's feed row).

The offer window is **not** put in the thread text: the opener text is a template over the receiver's own feed row, and adding a number that is not in that row would break the npc-threads number rule. The window is a card field (section 7).

## 5. (c) Accept and decline

### 5.1 Commands

Both go to `POST /api/commands` and `submitCommand` (`commands.ts`), like every other verb:

```json
{ "playerId": "prototype-player", "type": "accept-contract",  "contractId": "supply-glassport-67" }
{ "playerId": "prototype-player", "type": "decline-contract", "contractId": "supply-glassport-67" }
```

Accepted response: `{ ok: true, command: {id, playerId, issuedTick, type, contractId}, event }` where `event` is the existing `player-command-accepted` (`acceptedEvent`, `commands.ts:387`) with `targetId` = the buyer. Rejections (existing shape `{ok:false, code, message}`):

| code | when |
|---|---|
| `unknown-contract` | no such id |
| `not-carrier` | the contract's carrier is not this player's character, **or** it has no `offerExpiresTick` (every contract on a flag-off world) |
| `contract-not-open` | status is not `offered`, or settled |
| `offer-expired` | `tick >= offerExpiresTick` |
| `contract-already-queued` | another accept, decline, offer or cancel on this contract is already pending (`contractMutationPending`, extended) |
| `carrier-traveling` | accept only: at sea or not docked |
| `voyage-too-long` | accept only: `assessSupplyContract` `gate === "travel"` at the acceptance-time deadline |
| `insufficient-money` | accept only: `gate === "purse"` |

At the tick the command is processed (`processPlayerCommands`, dispatch at `:2852` extended), the state is re-checked; a stale offer or a lost gate emits the existing `player-command-failed` with a reason string, as the other contract commands do.

Because a flag-off world has no contract with `offerExpiresTick`, both verbs refuse with `not-carrier` there and need no flag check. **The capabilities list (`COMMAND_TYPES`) does change flag-off** (two more names); question 7.

### 5.2 Events and state

| Case | Events (all existing types) | Stored |
|---|---|---|
| accept | `contract-accepted` (`data.contract` status `accepted`, `acceptedTick`, `deadlineTick` **recomputed now**, plus `commandId`, `travelTicks`, `ticksLeft`, `costBasis`) then `player-command-resolved` outcome `contract-accepted` | the contract record only |
| decline | `contract-refused` (`status: "declined"`, `data.gate: "declined"`, `reason: "The carrier declined."`, escrow refunded through `refundEscrow`, `:2203`) then `player-command-resolved` outcome `contract-declined` | status `declined`, `settled` |
| ignored | `contract-cancelled` (`status: "expired"`, `reason: "offer-expired"`, escrow refunded, actor = buyer) at `tick >= offerExpiresTick`, from a new `expireHumanOffers` after `resolveContractOutcomes` and before `offerAutonomousSupply` in `runTickBody` (`:4589-4591`) | status `expired`, `settled` |

Types (`src/sim/types.ts`): `SupplyContractStatus` gains `"declined"` and `"expired"`; `SupplyContract.offerExpiresTick?: number` (absent on every non-human contract, so flag-off JSON is unchanged); `PlayerCommand` gains the two verbs. Neither new status is reachable flag-off.

`resolveOfferedContracts` (`:2421`) **skips a human carrier** when the flag is on: the engine never scores a human.

### 5.3 The deadline, derived not tuned

- **Answer window = 180 ticks** (`HUMAN_OFFER_WINDOW_TICKS = CHECK_IN_TICKS`, with a test pinning them equal). It is the app's own "what happened while you were away" window, so a player who checks in once per window cannot miss an offer. The NPC value is 1 tick (measured n = 2,721, all values 1, `results/summary.md`, "NPC baselines"), which is by construction (`observedTick < tick`) and is unusable for a player who steps the clock in batches.
- **Stored offer deadline** at issue: `now + 180 + min(720, max(travel + 1, 2))`, a placeholder that is replaced on accept.
- **Delivery deadline at accept:** `now + min(SUPPLY_DEADLINE_CAP, max(travel + 1, 2))`, the NPC formula, unchanged (`humanAcceptTerms`). Measured NPC offsets over 3,758 offers: min 2, p50 3, p90 5, max 6. Measured human accept → fulfil (attentive, recommended rule): p50 4, max 5 ticks.
- **Consequence the Lead should see:** this formula assumes cargo is already aboard (an NPC carrier's own walk guarantees stock). A human who accepts first and buys after cannot make it. A first attempt of the attentive script (accept, then buy, then sail) fulfilled none of its accepts; the final script **buys the cargo and ration while the offer is open, then accepts and sails in the same tick**, which fulfils. The 180-tick window is what makes buy-first possible. No slack constant was added (question 9).

### 5.4 What happens if the human never answers

Idle commander, recommended rule: 18 offers over 26 runs (13 seeds × 2 configs), 17 expired at the window, 1 still inside its window at tick 1,200. Each expiry refunds the buyer exactly (escrow from treasury or purse, as at issue), writes nothing to relationships, and starts the 180-tick same-buyer cooldown. Liveness checks over every run: 3,719 / 3,719 offers not stuck past their window, 3,719 / 3,719 human accepts not stuck past `deadlineTick + 1`, 0 settled contracts holding escrow.

## 6. (d) Breach consequences: the existing NPC path, file:line

A human-accepted contract goes through the same function an NPC's does, `resolveContractOutcomes` (`engine.ts:2477`):

- **Fulfil** (`:2501-2528`): carrier landed with the quantity; shelf +10, carrier cargo −10, escrow to the carrier's purse, `writeContractRelationships(..., victory=true)`.
- **No longer needed** (`:2488-2490`): the destination shelf already holds the quantity when the carrier has not landed: `refundEscrow(..., "cancelled", "contract-cancelled", ..., {reason: "no-longer-needed"})`. No relationship.
- **Breach** (`:2493-2498`): `tick >= deadlineTick` and not one tick out loaded: `refundEscrow(..., "breached", "contract-breached", ..., breachCause(...))` (`breachCause` `:4534`) and `writeContractRelationships(..., victory=false)` (`:2117`), i.e. `relationship-changed` for **both** sides with the `DEFEAT` delta of `contractRelationship` (`contracts.ts:199`).

So breach costs the carrier **nothing in money**: the escrow returns to the buyer (it was never the carrier's), and the only effect is trust/respect down and grievance up in both directions. There is no debt, no reputation and no standing in this engine for breach, for NPCs or humans. I did not add one: a penalty is a new rule, not a reuse (question 5).

Measured (lazy script = say yes to everything the engine allows, then do nothing): the recommended rule gives 66 accepts over 26 runs, 49 breached (all cause `choice/deadline-infeasible`), 17 cancelled `no-longer-needed`. The same-buyer cooldown includes `breached`; without it, the relaxed variant's first full run had 1,451 breaches from one commander over 13 seeds (a re-offer every few ticks while the shortage stood).

**Race with NPCs (new fact):** of the attentive script's accepts under the recommended rule, 18 were made and 9 were `cancelled no-longer-needed` (default 4 of 8, ATLS 5 of 10): an NPC refilled the shelf while the human was loading or sailing. The human keeps the cargo and loses the voyage. Same rule as for NPCs (`:2488-2490`), not changed; question 3.

## 7. (e) Card states, mapped to ui-cards-v1 fields

The card is `SupplyContractCard` (`ui-cards-v1/cards.ts`; spec `ui-cards-v1.md`). The stored `status` is passed through; "active" is a **label derived for a party**, not a stored status (no new stored value, nothing new in the hash).

| UI state | Stored `status` | `open` | `actionRequired` | Rule |
|---|---|---|---|---|
| offered | `offered` | true | **true** for the carrier role while `tick < offerExpiresTick` | v1 said "NT offers will set it later"; this is that case |
| accepted | `accepted` | true | false | accepted, carrier not yet underway |
| active | `accepted` | true | false | derived for a party: carrier cargo ≥ quantity, or travelling to the destination (`card-states.ts`) |
| fulfilled | `fulfilled` | false | false | |
| breached | `breached` | false | false | `contract-breached` cause on the card detail |
| declined | `declined` | false | false | new stored value |
| expired | `expired` | false | false | new stored value |
| (also) refused / cancelled | `refused` / `cancelled` | false | false | NPC refusal; `no-longer-needed` and player cancel; unchanged |

Field changes to the card (all additive):

- `status` type widens by `declined`, `expired`; `open` stays "offered or accepted"; the 180-tick closed-card window is unchanged.
- `actionRequired` as above.
- `detail.answerByTick: number | null`: `offerExpiresTick` for the carrier role (so the card shows the window); `null` for the buyer role if it is not human, for a mate, and for any contract without one.
- `threadId`: the derived direct thread, carrier and buyer roles only (unchanged).
- `ProjectedContract` (`src/dashboard/visibility.ts:615-630`) gains `offerExpiresTick: number | null`, set only where `source === "own-character"` (the two parties); `projectOneContract` for a mate row must leave it `null`.

Mapping check (hook run, 13 seeds, state of each human contract at tick 1,200, recommended rule; `results/summary.md` "UI state"): default attentive 12 declined, 4 fulfilled, 4 cancelled; default lazy 20 breached, 9 cancelled; ATLS attentive 13 declined, 5 fulfilled, 5 cancelled; ATLS lazy 29 breached, 8 cancelled. Idle offers read `expired` (17) or `offered` (1, inside its window). Every offer produced a carrier card with `role: "carrier"`, a price, a non-null `threadId`, and `open === (offered or accepted)`: 3,719 of 3,719. The derived label `active` is not observed at tick 1,200 in any cell (one contract in the whole matrix was still in flight then, and read `accepted`), so it is tested as a function (`card-states.ts`, section 12 item 9), not by volume.

## 8. (f) Visibility and privacy, as checkable properties

Checked in `measure.ts` against the real `projectFor` / `buildCards` / `projectEventFeed`, for **every living character** as viewer of **every human offer**, all runs:

| # | Property | Checks | Violations |
|---|---|---|---|
| H1 | An offer is a real stored offer to the human: `carrierId` = the human, `offerExpiresTick − issuedTick = 180`, `deadlineTick > offerExpiresTick` | 3,719 | 0 |
| H2 | A faction mate of either party gets a contract card with `price`, `quantity`, `escrow` and `threadId` all `null` (ui-cards P3), and never `answerByTick` | 33,897 | 0 |
| H3 | A bystander gets no card (ui-cards P2) | 66,479 | 0 |
| H4 | A bystander's feed row for the offer carries no `price`, `escrow`, `offerExpiresTick`, and not the price figure; `data` is `null`, `payloadWithheld: true` | 66,479 | 0 |
| H5 | A bystander is in no thread containing the opener | 100,376 | 0 |
| H6 | The carrier's card has `role: "carrier"`, the price, and `open` equal to offered-or-accepted; `threadId` non-null when an opener was written | 3,719 | 0 |
| H7 | Every opener's sender is in the player's `knownCharacterIds`, is feed-visible, every number in the text appears in the receiver's own feed row, and `origin.contractId` resolves to a stored contract | 3,710 | 0 |
| H8 | No answered offer remains in the request tab (accepted, declined, fulfilled, breached) | 3,117 | 0 |
| H9 | Liveness: no offer outlives its window; no accepted human contract outlives `deadlineTick + 1`; no settled contract holds escrow | 3,719 + 3,719 | 0 |
| H10 | Replay every 100 ticks (936 runs); hook run economy identical to the no-hook run (312 of 312) | | 0 |

**One existing leak, not caused by this slice (question 6).** A buyer-faction mate's feed row for a treasury-funded offer reads "<buyer> drew 56.25 from the treasury.", which is the price (escrow equals price). It is the same sentence on every NPC offer on `main`; 407 of 33,897 mate rows (1.2 %). It is counted separately in the harness (`mate-feed-treasury-draw(existing)`) so P3 is stated honestly: a mate's *card* hides the terms, a mate's *feed* can still show the draw.

**What is public today, unchanged:** a bystander reads "<buyer> offered <carrier> a contract to carry 10 provisions to <port>." on the public feed (names, quantity, destination), with the payload withheld. Decline, accept and expiry sentences are the existing ones; the accept/decline reason text reaches parties only.

## 9. Hash and flag

- **Flag:** `TickOptions.humanContracts`, `HUMAN_CONTRACTS_DEFAULT = false`, module flag `humanContractsOn` set in `runTick` (`engine.ts:4553-4560` pattern). Every branch is under it: the human candidate rule, `expireHumanOffers`, the `resolveOfferedContracts` skip, `offerExpiresTick` on the offer.
- **Flag off:** no new field is written, no new status is reachable, the NPC walk is untouched. Pins on **`37804a7` (unpatched)**: 1847 `7f76e474/94de9c02`, 2718 `976c40bd/7a3741c9`, 4096 `08943ea5/af6eeaea`; ATLS 1847 `85658e53/5367691c`, 2718 `aa54ada1/faf5798a`, 4096 `e4361ee1/7e93eab2`: all six match (`results/pins-37804a7-*.txt`). On the **patched tree, flag off**, the same six match in 72 of 72 runs (the flag-off run in every cell of the matrix). `npm test`: 690 / 690 on the patched tree.
- **Flag on:** hashes diverge from the first offer (an offer is a state change). On the commander's idle runs 16 of 104 flag-on runs equal the flag-off `h1200`, exactly the seeds with no offer. Flag-on pins, recommended rule:

  | seed | config | scenario | flag-off h72 / h1200 | flag-on h72 / h1200 | first human offer |
  |---|---|---|---|---|---|
  | 1847 | default | idle, attentive | `7f76e474` / `94de9c02` | same (no offer) | none |
  | 2718 | default | idle | `976c40bd` / `7a3741c9` | `4bc2f441` / `e3e7a16f` | tick 47 |
  | 2718 | default | attentive | same | `d5210214` / `aa3e1abc` | tick 47 |
  | 4096 | default | idle, attentive | `08943ea5` / `af6eeaea` | same (no offer) | none |
  | 1847 | ATLS | idle, attentive | `85658e53` / `5367691c` | same (no offer) | none |
  | 2718 | ATLS | idle | `aa54ada1` / `faf5798a` | `9300b5c6` / `d6a70f9a` | tick 54 |
  | 2718 | ATLS | attentive | same | `f4dd9eed` / `49d8d01d` | tick 54 |
  | 4096 | ATLS | idle | `e4361ee1` / `7e93eab2` | `4653bf56` / `bd358a72` | tick 62 |
  | 4096 | ATLS | attentive | same | `71dd7de5` / `bbabeb1a` | tick 62 |

- **Replay:** `replayWithSilentStarts` (`tick-start.ts:27`) in the harness, incremental, compared at ticks 100, 200, …, 1,200 on the flag-off, flag-on and flag-on + hook run of each cell: **0 mismatches in 936 runs**, including commanded runs. A per-tick check (1,200 comparisons × 3 runs) on seed 4000 ATLS lazy also found 0. Two earlier iterations showed mismatches that were traced and are not this slice: (1) the hook's post-tick events are stamped with the *next* tick (`world.tick` has already advanced), so a replay stopped right after them has run that tick's silent start and the live world has not; checking before the hook removes it, and the live and replayed worlds agreed on every tick checked; (2) `characters.<id>.shortMorningStreak`, the commanded-run item the Lead assigned to the replay bisect (npc-threads ruling 8), appeared in 4 of the first run's 936 and in 0 of the final 936.

## 10. (h) Measurement

Harness: `measure.ts` runs, per seed, one flag-off run and per scenario a flag-on run and a flag-on + npc-threads-hook run. `run.sh` fans the 13 seeds across 8 workers: 4 offer variants × 2 configs × 13 seeds × (1 + 3 × 2) runs = 728 runs of 1,200 ticks, about 6 minutes. Scenarios (the commander `character-01`, parked at `crown-harbor`, never travels except where the script sails):

- **idle**: never answers.
- **attentive**: declines at once an offer it cannot carry (stock or purse at its port short of `10 + ration − cargo`), otherwise buys the cargo and ration while the offer is open, then accepts and sails in the same tick. Every decline in every variant was for `stock`.
- **lazy**: tries to accept every offer, lets the engine's hard gates decide, then does nothing (the breach path).

Variants (env toggles `OPEN_ERA_HUMAN_OFFER` = `last` | `first`, `OPEN_ERA_HUMAN_SKIP` = `strict` | `relaxed`; harness only, delete before merge): **last-strict is the recommendation**; "first" considers the human before the NPC walk; "relaxed" drops the own-port-stock skip.

### 10.1 Offers per 100 ticks per seed to the commander (13 seeds × 1,200 ticks = 156 seed-blocks; offers in brackets)

| variant | idle default | idle ATLS | attentive default | attentive ATLS | lazy default | lazy ATLS | seeds with ≥ 1 (def / ATLS) |
|---|---|---|---|---|---|---|---|
| **last-strict** | 0.058 (9) | 0.058 (9) | **0.128 (20)** | **0.147 (23)** | 0.186 (29) | 0.237 (37) | 9 / 7 |
| first-strict | 0.109 (17) | 0.083 (13) | 0.173 (27) | 0.186 (29) | 0.372 (58) | 0.487 (76) | 11 / 9 |
| last-relaxed | 0.327 (51) | 0.372 (58) | 2.372 (370) | 2.551 (398) | 2.026 (316) | 2.147 (335) | 13 / 13 |
| first-relaxed | 0.378 (59) | 0.397 (62) | 2.583 (403) | 3.256 (508) | 2.615 (408) | 2.590 (404) | 13 / 13 |

For scale: NPC offers on the flag-off runs are 1,865 (default) and 1,893 (ATLS), 11.96 and 12.13 per 100 ticks per seed. The recommended rule's human offers are 0.5 % of that. Attentive and lazy see more offers than idle. Rule 5 holds an idle commander's one offer open for the whole 180 ticks; an answered offer frees the slot (reason not isolated).

### 10.2 What the human did with them (count over 13 seeds)

| variant, config | scenario | offers | accepted | declined | expired | fulfilled | breached | cancelled after accept | still open at t1,200 |
|---|---|---|---|---|---|---|---|---|---|
| last-strict, default | idle | 9 | 0 | 0 | 8 | 0 | 0 | 0 | 1 |
| last-strict, default | attentive | 20 | 8 | 12 | 0 | 4 | 0 | 4 | 0 |
| last-strict, default | lazy | 29 | 29 | 0 | 0 | 0 | 20 | 9 | 0 |
| last-strict, ATLS | idle | 9 | 0 | 0 | 9 | 0 | 0 | 0 | 0 |
| last-strict, ATLS | attentive | 23 | 10 | 13 | 0 | 5 | 0 | 5 | 0 |
| last-strict, ATLS | lazy | 37 | 37 | 0 | 0 | 0 | 29 | 8 | 0 |
| first-strict, default | attentive | 27 | 15 | 12 | 0 | 12 | 0 | 3 | 0 |
| first-strict, ATLS | attentive | 29 | 15 | 14 | 0 | 8 | 0 | 7 | 0 |
| last-relaxed, default | attentive | 370 | 9 | 361 | 0 | 5 | 0 | 4 | 0 |
| last-relaxed, ATLS | attentive | 398 | 11 | 387 | 0 | 5 | 1 | 5 | 0 |

Every other cell is in `results/summary.md`. Times, attentive, recommended rule: offer → accepted p50 2, max 4 ticks (the time to buy the cargo); accepted → fulfilled p50 4, max 5.

### 10.3 Economy against flag-off, and the noise floor

Same seeds, same ticks, flag-on minus flag-off, summed over 13 seeds. Any rule change makes a run byte-different from the first offer, and the engine is chaotic, so the table needs a floor. `noise.ts` re-runs **flag-off** with the commander's purse nudged by 1, 2 and 3 coins (no rule changes):

| config | run | NPC offers | fulfilled | breached | treasury total | claims | port changes | captures |
|---|---|---|---|---|---|---|---|---|
| default | flag-off | 1,865 | 849 | 449 | 169,633 | 682 | 711 | 247 |
| default | nudge +1 / +2 / +3 | 1,900 / 1,846 / 1,897 | 864 / 835 / 854 | 458 / 450 / 459 | 169,032 / 172,452 / 163,999 | 673 / 702 / 693 | 699 / 729 / 721 | 248 / 257 / 248 |
| ATLS | flag-off | 1,893 | 817 | 466 | 105,835 | 497 | 537 | 214 |
| ATLS | nudge +1 / +2 / +3 | 1,885 / 1,807 / 1,773 | 817 / 782 / 763 | 460 / 449 / 434 | 103,446 / 99,638 / 108,199 | 512 / 500 / 491 | 552 / 540 / 531 | 204 / 211 / 206 |

Three nudges are a small sample, so the floor is indicative: default, fulfilled −1.6 % to +1.8 %, claims −1.3 % to +2.9 %, captures 0 to +4 %, treasury −3.3 % to +1.7 %; ATLS, fulfilled −6.6 % to 0, treasury −5.9 % to +2.2 %, captures −4.7 % to −1.4 %.

Recommended rule against flag-off (full table, all variants and scenarios, in `results/summary.md`):

| config | scenario | NPC offers | fulfilled | breached | treasury total | claims | port changes | captures |
|---|---|---|---|---|---|---|---|---|
| default | idle | 1,865 → 1,823 | 849 → 799 | 449 → 467 | 169,633 → 169,054 | 682 → 630 | 711 → 660 | 247 → 220 |
| default | attentive | → 1,748 | → 764 | → 441 | → 179,470 | → 659 | → 694 | → 232 |
| default | lazy | → 1,892 | → 842 | → 471 | → 155,012 | → 692 | → 717 | → 233 |
| ATLS | idle | 1,893 → 1,730 | 817 → 761 | 466 → 413 | 105,835 → 108,130 | 497 → 521 | 537 → 561 | 214 → 209 |
| ATLS | attentive | → 1,630 | → 708 | → 395 | → 108,639 | → 489 | → 536 | → 190 |
| ATLS | lazy | → 1,674 | → 704 | → 434 | → 108,421 | → 474 | → 520 | → 189 |

Reading it without tuning anything. ATLS, idle: at the edge of the floor (fulfilled −6.9 %, NPC offers −8.6 %, captures −2.3 %). ATLS, attentive and lazy: **outside** it on fulfilled (−13 %, −14 %) and captures (−11 %, −12 %); claims and port changes inside. Default, idle: fulfilled −5.9 %, claims −7.6 %, captures −10.9 %, outside the three-sample floor, with only 9 human offers in the whole run; default attentive fulfilled −10 % and captures −6 %, outside; default lazy inside on fulfilled (−0.8 %). So the direction is consistent (fewer NPC contracts fulfilled) but the cause is not isolated. The first thing a human offer does to the NPC world is hold 56.25 of the buyer's money for up to 180 ticks (escrow from treasury or purse), which can take that buyer out of the next shortage; I did not run the leave-one-out that would show whether that is the whole story. "Shortage ticks" is not informative (14,745 → 14,741 default, and identical to the unit across all four noise runs), so it is not reported as an effect. Treat these as emergent unless the Lead wants a leave-one-out (as was done for negotiated transfer).

"First" variants displace NPCs (first-strict attentive: NPC offers −181 default, −309 ATLS, against −117 and −263 for last-strict; fulfilled −113 and −161 against −85 and −109) but the gaps between first and last (28 and 52 fulfilled contracts) are inside the floor's width, so these sums do not separate them; the claim "last does not displace NPCs" holds by construction (the human is offered only when no NPC would take the contract), not by these sums.

### 10.4 Liveness and the rest

- Seeds that finish all 1,200 ticks with the hook and the commander commands: 728 of 728 runs.
- Threads: 3,710 openers for 3,719 human offers in the final run. For an idle commander (recommended rule) the request tab at t1,200 holds 12 to 17 threads per seed, almost all from the other npc-threads topics; the 18 contract openers over the 26 idle runs are 0 to 2 per seed.
- Hook-run economy equals no-hook-run economy in 312 of 312 pairs (the hook is projection-only).

## 11. Part 2: debt demand, sketch only

**It is not small.** What exists:

- State: `DebtObligation {id, creditorFactionId, originalValue, remainingValue, incurredTick, reason: "prisoner-release"}` (`types.ts:150-157`), created only when a release leaves a remainder (`engine.ts:1873-1895`, `captivity-released` with `data.debt`, applied at `state.ts:983`). There is **no due date, no overdue state, no demand**.
- Collection: `collectCaptivityDebts` (`engine.ts:1938-1975`), once per day (`ticksPerDay` 6), takes `min(money, remaining, workGross)` of an NPC or human character who is not captive and **worked**. Repayment emits `debt-repaid` (`state.ts:1035-1039`). A human who does not work pays nothing.
- Consequence for non-payment: only `loyaltyAdjustment` (`types.ts:~708`), which feeds NPC cover sorting; nothing a human feels.

Census (`debt-census.ts`, flag-off, 13 seeds × 1,200 ticks, `results/debt-census-*.json`):

| | default | ATLS |
|---|---|---|
| `captivity-released` | 218 | 190 |
| ... of which left a debt | 139 | 106 |
| `debt-repaid` events | 2,026 | 1,322 |
| debts closed | 71 | 51 |
| debts open at t1,200 | 68 | 56 |
| debt created → first repayment (ticks) | p50 10, p90 74, max 383 (n = 108) | p50 9, p90 32, max 334 (n = 82) |
| debt created → closed | p50 202, p90 328, max 553 (n = 71) | p50 144, p90 301, max 533 (n = 51) |
| original value | p50 351.72, max 590.02 | p50 326.02, max 579.99 |
| **commander** released with debt | **16** | **16** |
| **commander** `debt-repaid` | **0** | **0** |
| debts whose creditor is the commander's faction | 53 | 36 |

So a demand would reach the commander about 1.2 times per seed per 1,200 ticks (16 / 13), and the commander is the debtor, not the creditor, in all of it.

**What the smallest version needs** (each item is a decision, not code):

1. **Trigger.** There is no overdue concept. Candidates from existing state: "debt open and the debtor has not had a `debt-repaid` in N days" (N from the measured first-repayment lag, p90 74 / 32 ticks, would be a number I would be choosing from a distribution, so I did not), or "demanded once per debt, one day after `incurredTick`" (no number to choose but no meaning of "overdue"). Needs a Lead ruling.
2. **Event.** A new `debt-demanded` (actor = creditor faction's representative, target = the debtor), state-neutral like the other notices; one new key on `DebtObligation` (`lastDemandTick`) if it must not repeat, which is a hashed field.
3. **Who gets the thread.** The faction representative via npc-threads `factionRep` (the captivity topic already routes `captivity.released-with-debt` the same way, `npc-threads/triggers.ts`), to the debtor; origin `{trigger: "debt-demanded", sequence, debtId}`; `request` tab until paid or refused.
4. **Verbs.** `pay-debt {debtId, amount}` can **reuse the existing `debt-repaid` event** (same `paid`, `remainingValue`, `characterMoney`, `factionTreasury`, `closed` payload, `state.ts:1035`), so it adds no new state shape. `refuse` is an answer with **no engine consequence today**, which is the problem: refusing and ignoring would be the same.
5. **Consequences.** The only existing levers are relationships (as breach), `loyaltyAdjustment` (NPC-facing), and the daily wage collection that already runs. Anything that bites a human (a port refuses docking, a bounty, a captor re-seizes) is a new rule and a measurement of its own.

Sizing: demand + pay verb + thread/card is **one slice of about the same size as this one** (a flag, 1 event, 2 verbs, 1 stored key) once the consequence is ruled. The ruling is the blocker. I would not build it before the Lead decides what refusal costs.

## 12. Engineer test plan

Tests to write (all new, none change an existing expectation):

1. **Flag off is identical.** The six pins above; `npm test` unchanged (690 on the patched tree); `JSON.stringify(world)` has no `offerExpiresTick` anywhere on a flag-off run to tick 1,200; both verbs return `not-carrier` on a flag-off world.
2. **`humanCarrierCandidates`**, one test per clause of section 3.1 (docked, free, known buyer, no open pair contract, one open offer at a time, 180-tick cooldown after `declined`, `expired` and `breached`, the two skips); human considered only after the NPC walk finds nobody; `carrierBlocked` unchanged (a human is still blocked by it).
3. **Offer shape.** `offerExpiresTick === issuedTick + HUMAN_OFFER_WINDOW_TICKS`, and `HUMAN_OFFER_WINDOW_TICKS === CHECK_IN_TICKS` (pin test so the two cannot drift); `resolveOfferedContracts` never scores a human carrier.
4. **Commands.** Every code in 5.1 from a constructed world; `contract-already-queued` for accept-then-decline in one tick; stale re-check at processing (`player-command-failed`).
5. **Decline and expiry.** Escrow refunded exactly to the funding source (treasury vs purse, `refundEscrow`), faction treasury restored, **no `relationship-changed`**, status `declined` / `expired`, settled, cooldown applied.
6. **Accept.** Deadline equals the NPC formula at the acceptance tick (not the issue tick); hard gates `travel` and `purse` reject; the score does not (a constructed human with a score below threshold is accepted).
7. **Outcome parity.** A human-accepted contract fulfils, `no-longer-needed`-cancels and breaches through the same code as an NPC's (assert event types and `relationship-changed` pair on breach).
8. **Replay.** Flag-on commanded run, 13 seeds, `replayWithSilentStarts` every 100 ticks, equal hash; decline and expiry replay restores escrow state.
9. **Projection and states.** `uiState` unit cases: `offered`, `accepted` (cargo short, not travelling), `active` (cargo ≥ quantity, or travelling to the destination), and each closed status. Carrier card has `answerByTick`, `actionRequired` true while open and in window and false after; mate card: `price`/`quantity`/`escrow`/`threadId`/`answerByTick` all `null`; bystander: no card, no thread; feed row for a bystander has no price or window. ui-cards P2/P3 re-run on human contracts.
10. **Hook.** Opener `origin.contractId` set; request tab: in while `offered`, out on `accepted`/`declined`, stays on `expired`; pair rule closes on contract status; numbers in text ⊆ receiver's feed row.
11. **Acceptance run.** `measure.ts` on the Engineer's build reproduces section 10.1 (recommended rule) within the seeds' own determinism: same offers, same outcomes, flag-off pins unchanged. Remove the two env toggles before merge.

## 13. Non-goals

- No counter-offer, price or quantity negotiation; `contract-amended` (a revision) stays NPC-or-player-offer only.
- No NPC-initiated offer outside the existing shortage trigger; no new event that makes a human a buyer.
- No penalty for breach, decline or expiry beyond the existing relationship effect; no reputation or credit system.
- No score shown to the human, no "would an NPC take this" hint.
- No more than one human in the measured runs (the candidate loop is in id order and would extend, but is untested).
- No mobile commander measured: the commander does not roam to find offers (10.1 is a floor for a stationary player).
- No UI beyond the card and thread fields named here; no change to the public feed sentence.
- No debt demand implementation (section 11).
- No tuning: no constant was chosen to improve a number. 180 is `CHECK_IN_TICKS`; the deadline is the NPC formula; the cooldown reuses 180.

## 14. Questions for the Lead

1. **Volume.** Recommended rule gives a stationary commander 0.13 to 0.15 offers per 100 ticks when attentive (about 1.5 per seed per 1,200 ticks, on 7 to 9 of 13 seeds). Is that enough, or do you want a wider pool (only the own-port skip is relaxable; dropping it gives 2.4 to 3.3 per 100 and 96 % declines for stock)?
2. **Order.** "Last resort" (no NPC displaced, 0.128 / 0.147) or "first" (0.173 / 0.186, displaces NPC carriers)? Recommendation: last.
3. **The race.** About half of an attentive human's accepts (9 of 18) end `cancelled: no-longer-needed` because an NPC refilled the shelf; the human keeps the cargo and has paid market price for it. Keep the NPC rule, or protect an accepted human contract from `no-longer-needed`?
4. **Expired in the request tab.** I mirrored ruling 5: a lapse does not answer the thread, so an expired offer stays in `request`. Is that wanted, or should expiry clear it?
5. **Breach has no teeth** (escrow back, relationship only). Accept for v1, or rule a consequence (a new rule with its own measurement)?
6. **Mate feed.** "drew 56.25 from the treasury" shows buyer-faction mates the price on every treasury-funded offer, NPC or human, today (1.2 % of mate rows). Fix in the view-model as a separate small change?
7. **Capabilities.** `COMMAND_TYPES` gains two names on flag-off worlds (`{commandTypes}` at `commands.ts:336`). Acceptable, or make the list flag-conditional?
8. **Debt demand.** What does refusing cost? (Section 11.) Until that is ruled it cannot be specified.
9. **Deadline.** Keep the NPC formula (human must buy first, then accept) or add a derived allowance for the buy-and-sail commands? I added none.

## 15. Reproduce

```
git worktree add ../wt docs/human-contracts && cd ../wt && git apply docs/design/human-contracts/fix.patch   # throwaway tree
./docs/design/human-contracts/run.sh docs/design/human-contracts/results                                      # ~6 min on 8 cores
node --experimental-strip-types docs/design/human-contracts/summarize.ts docs/design/human-contracts/results  # tables
node --experimental-strip-types docs/design/human-contracts/noise.ts '{}'                                     # noise floor
node --experimental-strip-types docs/design/human-contracts/debt-census.ts '{}'                               # part 2
```
