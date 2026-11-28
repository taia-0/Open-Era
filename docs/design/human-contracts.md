# Human contracts: a contract offer to a human carrier

**Status: rev 2.** Spec + prototype, off `main` `4f5c1f7` (#206, rev 1 merged; `src/` is identical to `37804a7`, #206 changed docs only). Branch `docs/human-contracts`. Rev 2 applies the Lead's nine rulings of 2026-11-27 (section 1.1), measures the peer variant, derives a buy-and-sail allowance, removes the two env toggles from the patch, and re-runs the noise floor with isolating arms. Part 2 (debt demand) is **not specified here**: it is the next slice and only its ruling is recorded (section 11).

Everything below is measured on a **throwaway tree** with [human-contracts/fix.patch](human-contracts/fix.patch) applied (9 files, +292 −18, no env toggle) and, for the measurement arms only, [human-contracts/variants.patch](human-contracts/variants.patch) on top (one file, `engine.ts`, env-gated, **never to be merged**). Nothing under `src/` is changed by this branch. Harness and results: [human-contracts/](human-contracts/) (`measure.ts`, `thread-hook.ts`, `card-states.ts`, `summarize.ts`, `noise.ts`, `flag-conditional.ts`, `debt-census.ts`, `run.sh`, `results/rev2/`; rev-1 results are kept in `results/rev1/`). Offline, $0, no AI calls. 13 seeds (1847, 2718, 4096, 1000 to 10000) × 1,200 ticks, flag-off default config and ATLS (`alliances + portTransfer + lifecycle + secessionAftermath`).

## 1. Summary and recommendation

- **Recommendation: keep "last resort". Do not build peer.** Peer scoring needs **no invented constant** (every input of `assessSupplyContract` is a field any `Character` has, section 3.3), so it was measured, not skipped. Across 13 seeds × 1,200 ticks, default and ATLS, idle and attentive, the human's score **never outranked the NPC the walk would pick**: 0 of 27, 34 (default idle, attentive) and 0 of 19, 38 (ATLS) contested decisions, margins −0.335 to −0.029. So peer-in-walk-order produces **exactly the same offers, outcomes and economy as last resort** (identical counts in every cell), and peer-by-best-score (argmax) gives the human **no more offers** (0.045 and 0.115 per 100 ticks default; 0.064 and 0.160 ATLS, against 0.058 / 0.128 and 0.058 / 0.147) while it **re-orders 3 to 8 NPC offers per cell** and moves NPC fulfilled by −68 / −81 (default) and −64 / −103 (ATLS), against −50 / −89 and −56 / −114 for last: inside the same spread, no better. Peer adds a ranking pass and a behaviour change for no inbox gain (section 10.2).
- **Volume is unchanged and still low:** idle 0.058 offers per 100 ticks per seed (9 offers in 156 seed-blocks, both configs); attentive 0.128 (20) default and 0.147 (23) ATLS; 7 to 9 of 13 seeds see any. The lever for volume is not the order, it is eligibility (the own-port skip, which the Lead kept). Where a human candidate and an accepting NPC both existed, the NPC took it in 10 to 38 decisions per cell; those are the contracts a "first" rule would have moved to the human (rev 1 measured that: attentive 27 / 29 offers, fulfilled −113 / −161, `results/rev1/summary.md`).
- **Noise floor, isolated:** nine flag-off purse nudges give a fulfilled range of 835 to 869 (default) and 763 to 900 (ATLS). An idle commander with an offer made and **no escrow held** reproduces the flag-off economy **exactly** (849 → 849 and 817 → 817 fulfilled, treasury, claims, ports, captures all identical). The same offer **with** the escrow locked gives 849 → 799 (default, below the floor's 835) and 817 → 761 (ATLS, at the floor's edge 763). So the idle economy effect is the **escrow lock** (the buyer's 56.25 is out of play until the offer lapses, up to 180 ticks), not the offer, the thread or the cooldown (section 10.4).
- **Buy-and-sail allowance:** derived, no constant: `max(0, buys − 1)` where `buys = ceil(need / tradeQuote(...).maxQuantity)`, with file:line in section 5.3. In this world it is **0 for all 24 accepts** measured (a port's per-trade ceiling `marketDepth` is 28.8 and the largest need is 12.88), so it changes nothing today (the allowance-off arm is byte-identical). Accept-then-buy fulfils 4 of 9 (default) and 5 of 15 (ATLS) accepts against 4 of 8 and 5 of 10 for buy-then-accept; the difference is the NPC refilling the shelf first (cancel on refill: 4 of 9 and 8 of 15). Breaches were 1 and 2; the allowance-off arm is identical, so the allowance neither caused nor prevented them.
- **Same rules for everyone:** a refill cancel stays (ruling 3), but a human carrier's thread and card now say plainly that the buyer no longer needs it and there is no penalty (section 7.2, texts and fields). Expired offers clear from `request` and stay unread (section 4). Breach = relationship hit plus no offer from that buyer for 180 ticks from the breach (section 6). Commands exist only with the flag on (section 5.1).
- **Flag off is byte-identical:** the six pins hold on `4f5c1f7` and on the fix tree; all 66 flag-off runs of the matrix match; `COMMAND_TYPES` and the flag-off capabilities list are unchanged (the only flag-off difference is the rejection code for the two verbs: `unknown-type` becomes `contracts-not-enabled`); `npm test` 690 / 690 on the fix tree.

### 1.1 Rulings (Lead, 2026-11-27)

| # | Ruling | Where applied |
|---|---|---|
| 1+2 | 1.5 offers a seed makes the inbox feel dead, but "first" displaces NPCs. Measure a **peer** variant (human ranked among NPC candidates by the same `assessSupplyContract` score, neutral or derived input where NPC-only fields are needed). Report volume, NPC displacement and fulfilment and economy deltas. If it cannot be scored without inventing constants, say which inputs block it and keep last resort. Keep the own-port skip. Recommend peer or last from the data. | 3.2, 3.3, 10.1, 10.2: peer scored with no invented input; data say last |
| 3 | Same rules for everyone: keep cancelling on refill, but the thread and card say clearly that the buyer no longer needs it and there is no penalty. | 7.2 (text, fields), 4 (thread rule) |
| 4 | An expired offer clears from `request` but stays unread so the player sees what they missed (builds on `thread_reads`). | 4, 7.2 |
| 5 | Breach in v1 = the relationship hit, plus that buyer will not offer to that human again for the 180-tick cooldown counted from the breach. A real reputation system comes later. | 3.1 rule 6, 6 |
| 6 | The mate-feed leak is fixed separately and hash-neutral; the Lead is queueing it with the cards slice. | 8 (reference only) |
| 7 | Commands are flag-conditional with a clear "contracts not enabled" error when the flag is off. Verify `COMMAND_TYPES` and the flag-off pins are unchanged. | 5.1, 9 |
| 8 | Debt demand is the NEXT slice; not specced now. Recorded: refusing gives the creditor grievance toward the debtor, and the creditor's faction will not offer the debtor contracts until it is paid, both through existing gates. | 11 |
| 9 | Add a derived buy-and-sail allowance from existing travel and market timings, no new constant; show the derivation with file:line; measure attentive accept-then-buy fulfilment with it. | 5.3, 10.3 |
| also | Remove `OPEN_ERA_HUMAN_OFFER` and `OPEN_ERA_HUMAN_SKIP` from the patch (variants live in the harness layer); re-run the noise floor to isolate the economy effect. | `fix.patch` has no `process.env`; 10.4 |

### 1.2 What changed from rev 1

- Fixed a rev-1 claim: "a human who accepts first and buys after cannot make it" was an artifact of an early harness script. Accept → buy → sail does meet the NPC deadline when one purchase suffices (section 5.3).
- `fix.patch` is now 9 files (rev 1: 3): adds the flag-conditional commands, the CLI flag, the `closeReason` field, the allowance, one view-model sentence.
- A human carrier's no-longer-needed cancel has actor = the human and target = the buyer, so rev 1's hook opened no thread to the human on a refill cancel. Rev 2 adds that thread (section 4).


## 2. What exists today

| Piece | Where (`4f5c1f7`; `src/` identical to `37804a7`) | Fact |
|---|---|---|
| Carrier block | `engine.ts:2068-2073` | `controller.kind !== "autonomous"` or captive, travelling, or an attacker in an active battle. Used at `:2278` (player-offer path) and `:4388` (NPC offer walk). |
| Who offers | `engine.ts:4369-4380` | A shortage port (`stocks.provisions < 1`, owned by a faction); the lowest-id autonomous character of that faction standing in it who can pay `SUPPLY_PRICE` 56.25 (`:4365-4367`, quantity 10, deadline cap 720). |
| Carrier pick | `engine.ts:4388-4440` | Lowest-id unblocked carrier with no open contract with that buyer that `assessSupplyContract` would accept, after two walk skips (standing on the destination without the quantity; own port cannot stock the voyage). Deadline `now + min(720, max(travel + 1, 2))`. |
| NPC answer | `engine.ts:2421` (`resolveOfferedContracts`) | Scored the tick **after** issue (`observedTick < tick`), so latency is 1 tick. `assessSupplyContract` (`contracts.ts:114`): hard gates `travel` and `purse`, then `score` against `0.54 + ambition × 0.08` (`:120`). A refusal writes no relationship. |
| Outcome | `engine.ts:2477-2529` (`resolveContractOutcomes`) | Fulfil when landed with the quantity (`:2501-2528`); `no-longer-needed` cancel when the destination shelf holds the quantity (`:2488-2490`); breach at `tick >= deadlineTick` (`:2493-2498`). |
| Player commands | `commands.ts:209` (`COMMAND_TYPES`), `:932` (`carrierUnavailable`), `:1044` (`contractMutationPending`); route `src/dashboard/server.ts:206-208` | The player can offer or cancel; no verb answers a contract. A human carrier is rejected for player offers. |
| Hash | `state.ts:528-533` | `stateHash` is SHA-256 of `canonicalJson(world)`. Contract events apply generically through `event.data.contract` (`state.ts` ~1156-1180). |

Flag convention followed: `TickOptions` field + `*_DEFAULT` constant + module-level `let` set in `runTick` (`engine.ts:4553-4560` for the neighbours). The patch adds no env toggle (rev 2). `OPEN_ERA_SUPPLY_WALK` (`:4392`) is untouched.

## 3. (a) The human-carrier path

### 3.1 What changes in `carrierBlocked`

**Nothing.** It stays byte-for-byte, so the NPC walk, the player-offer path and `resolveOfferedContracts` keep their meaning. A new function `humanCarrierCandidates(world, buyer, settlement)` carries the human's rules, and `offerAutonomousSupply` calls it only when `humanContractsOn`. The patch is `fix.patch`, `engine.ts` hunk "HUMAN_CONTRACTS eligibility".

A human is a candidate when **all** hold (id order; every player in `world.players`, one in the prototype):

1. alive, `controller.kind === "human"`, not the buyer;
2. not captive, not travelling, docked (`locationId`), not the attacker in an active battle: the same three tests as `carrierBlocked`, minus `controller`;
3. the buyer is in the player's `knownCharacterIds` (npc-threads drops a sender the player does not know, so an offer from an unknown buyer would have no thread; an earlier iteration that also allowed unknown faction mates produced such an offer: sender-unknown, no thread, card `threadId` null);
4. no open contract (`offered` or `accepted`) between this buyer and this human (`openSupplyContract`, `contracts.ts:184`);
5. **no other open offer to this human** (one at a time);
6. **no `declined`, `expired` or `breached` contract with this buyer inside the last 180 ticks** (`observedTick`, which is the tick the contract closed). This is ruling 5: after a breach that buyer does not offer to that human again for 180 ticks counted from the breach, and it is the same cooldown that keeps a decline or a lapse from being re-offered the next tick;
7. the NPC walk's two skips, unchanged: not standing on the destination without the quantity aboard, and the port they stand in can stock `10 + provisionDemand × voyage − cargo` (stock ≥ shortfall).

Then `assessSupplyContract` is run with the NPC deadline formula and **only the hard gates bind**: `gate === "travel"` or `"purse"` rejects, `gate === "score"` does not. The score is an NPC's willingness; the human decides for themselves. The harness never shows the score to the human.


### 3.2 Who offers, how often

- **Who:** the same NPC buyer `offerAutonomousSupply` already selects (shortage port, owning faction). No new offerer, no new trigger event. The event is the existing `contract-offered` (actor = buyer, target = human).
- **When (recommended, unchanged): last resort.** The human is considered **after the NPC walk finds no carrier**. Rev 2 removes the `first` variant and both env toggles from the patch. The own-port skip (rule 7) stays.
- **How often:** bounded by the shortage rate, by rules 5 and 6, and by the own-port skip. Measured volumes are in section 10.1.
- **Peer** (ruling 1+2) is measured, not recommended (sections 3.3 and 10.2).

Why not simply drop `controller.kind` from `carrierBlocked`: `character-01` has the lowest id, the walk is lowest-id first, so the human would be offered every contract the NPC buyer issues at a shortage they are eligible for, ahead of NPCs, and the player-offer path at `:2278` would start accepting a human carrier.

### 3.3 The peer variant: can the human be scored without inventing a constant? Yes.

`assessSupplyContract` (`src/sim/contracts.ts:114-175`) scores `commerce × 0.30 + margin (clamped ±0.25) + trust × 0.14 + respect × 0.16 − grievance × 0.18 + obligation × 0.08 − caution × risk × 0.16` against `0.54 + ambition × 0.08`, with `risk` 0.25 if the carrier is already at the destination, neutral, or the destination is its own faction's, else 0.88. Every input is a field any `Character` has (its personality, its `relationships` toward the buyer, the market price at its location and at the destination) or a term of the contract. **No input is NPC-only, so nothing needed a neutral or derived stand-in and no constant was invented.** `pickHumanCarrier` already computes the human's assessment at offer time with the NPC deadline formula (to apply the two hard gates); the peer variants read its `score`.

Two peer variants, in `variants.patch` (env `OPEN_ERA_HC_VARIANT`, measurement only):

- **peer-walk:** the walk is unchanged (lowest id that accepts); the human replaces that pick only if the human's score is **strictly greater** than the pick's. Ties keep the NPC.
- **peer-argmax:** every NPC that the walk would accept is scored, and the contract goes to the highest score among them **and** the human (ties: lowest id, NPC before human). This also re-ranks NPCs among themselves, which is a behaviour change even when the human loses; the harness counts it (`reranked`).

The human must still satisfy the same hard gates (travel, purse) and the same eligibility rules 1 to 7. A human whose score is below the threshold would be refused by an NPC; it can never outrank an NPC that accepts, because an accepting NPC's score is at least the threshold.

## 4. (b) Thread through the npc-threads hook

`contract-offered` is already an npc-threads trigger (`npc-threads/triggers.ts`, topic `contract`: sender = actor = the buyer, receiver = target = the carrier, text "I have a delivery for you." plus the receiver's own projected feed sentence). With a human carrier the receiver is human, so the hook opens a thread with **no change to the trigger table**. Reference in [human-contracts/thread-hook.ts](human-contracts/thread-hook.ts), a copy of `npc-threads/hook.ts` with these edits:

1. **Origin** `{trigger, sequence, contractId}`. `contractId` is one new optional field on the same mark; the existing optional `orderId` is the precedent.
2. **Request tab (ruling 4, rev 2).** A contract thread is in `request` only while `world.contracts[origin.contractId].status === "offered"`. It **leaves `request` on every other status, expiry included**: an expired offer has nothing left to act on. (Rev 1 kept an expired offer in `request`; that is reversed.) The contract's `contractAnswered` rule is `status !== "offered"`.
3. **Expired stays unread.** The lapse writes the buyer's message into the same thread (below). The read state is the npc-threads `thread_reads` side table (`unreadCount` = messages with `createdTick > lastReadTick`, every message if the marker is null; hash-neutral, npc-threads 5.1). A player who opened the offer thread when it arrived has a marker at the opener's tick, so the lapse message is **unread**; one who never opened it has both messages unread. The thread stays in the player's list, unread, until read; it is not in `request`. Checked: 68 of 68 expired offers (section 8, R1 to R3).
4. **Pair rule.** npc-threads allows one unanswered opener per (sender, receiver, trigger) per window and counts "answered" as the receiver writing. A human answers a contract by command, so a contract opener is also answered once its contract has left `offered`. (Rev-1 measurement: without it 195 of 3,724 offers had no opener.)
5. **Refill cancel thread (ruling 3, new).** When the buyer's contract is cancelled because the destination shelf holds the quantity (`resolveContractOutcomes`, `engine.ts:2488-2490`), the event's actor is the **carrier** and its target is the **buyer**, so the generic rule finds no human receiver and rev 1 opened nothing. Rev 2 adds one rule: for a `contract-cancelled` with `reason: "no-longer-needed"` whose carrier is a human, the thread message is **from the buyer to the human carrier**. Same sender-known and feed-visibility rules as every opener; origin `{trigger: "contract-cancelled", sequence, contractId}`; `awaitsReply` false.
6. **Texts (fixed, no number in either).**

   | Case | Template | Sender → receiver | Text |
   |---|---|---|---|
   | refill cancel | `contract.cancelled-no-longer-needed` | buyer → human carrier | `I no longer need that delivery: <destination port> is stocked again. You are not penalised, and anything you bought is yours.` |
   | offer lapsed | `contract.offer-expired` | buyer → human carrier | `My offer lapsed before you answered. You lose nothing.` |

   The port name is the destination's own name from the receiver's feed row. The expiry text replaces the generic "The contract is off." lead for that case.

**Card `threadId`** is the existing derived value: the direct thread between buyer and carrier (`ui-cards-v1/cards.ts`, `threadFor`); present for the carrier role, `null` for a faction mate. The card, not the thread, is the action surface. The offer window is **not** in the thread text (the opener is a template over the receiver's feed row; a number outside that row would break the npc-threads number rule). The window is a card field (section 7).

Measured (rev-2 matrix): of 77 refill cancels of human contracts, 67 opened a thread to the human and 10 did not (the hook's existing drop rules; the drop reason is not broken out in this run). All 67 have the buyer as sender, exactly the text above, and are not in `request`.


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
| `contracts-not-enabled` | **new in rev 2:** the world is not running `HUMAN_CONTRACTS`. Checked first, before every other code and before `unknown-type`. Message: `Contract offers to a player are not enabled in this world.` |
| `unknown-contract` | no such id |
| `not-carrier` | the contract's carrier is not this player's character, or it has no `offerExpiresTick` |
| `contract-not-open` | status is not `offered`, or settled |
| `offer-expired` | `tick >= offerExpiresTick` |
| `contract-already-queued` | another accept, decline, offer or cancel on this contract is already pending (`contractMutationPending`, extended) |
| `carrier-traveling` | accept only: at sea or not docked |
| `voyage-too-long` | accept only: `assessSupplyContract` `gate === "travel"` at the acceptance-time deadline |
| `insufficient-money` | accept only: `gate === "purse"` |

At the tick the command is processed (`processPlayerCommands`, dispatch at `:2852` extended), the state is re-checked; a stale offer or a lost gate emits the existing `player-command-failed` with a reason string, as the other contract commands do.


**Flag-conditional commands (ruling 7).** The two verbs exist only in a world that runs the flag:

- `COMMAND_TYPES` (`commands.ts:209`) is **unchanged**. The two names live in a separate `HUMAN_CONTRACT_COMMAND_TYPES`.
- `submitCommand(world, request, options?)` (`commands.ts:1120` on main) takes `options.humanContracts` (absent = off). Right after the player lookup, an `accept-contract` or `decline-contract` without it is rejected `{ok: false, code: "contracts-not-enabled", error: "Contract offers to a player are not enabled in this world."}`.
- `commandCapabilities(transport, options?)` (`commands.ts:329`, `commandTypes` at `:336`) appends the two names only with the flag, so the flag-off `commandTypes` list is the same array.
- Plumbing: `src/dashboard/server.ts:208` passes `{humanContracts: tickOptions.humanContracts === true}`; `dashboardState` (`view-model.ts:1397`) gets a trailing `humanContracts = false` parameter used at its `commandCapabilities` call (`:1480`); the CLI flag `--human-contracts` / `HUMAN_CONTRACTS=1` is `src/cli/human-contracts-flag.ts`, wired in `tick-options.ts`, `run-dashboard.ts` and `run-simulation.ts` (the same shape as `--secession-aftermath`).
- Verified with `flag-conditional.ts` (`results/rev2/flag-conditional-*.txt`): on `4f5c1f7` and on the fix tree, `COMMAND_TYPES` and the flag-off `commandTypes` are the same array; the flag-on list has the two extra names; the only flag-off difference is the rejection of the two verbs, `unknown-type` on main and `contracts-not-enabled` on the fix tree.

At the tick the command is processed (`processPlayerCommands`, dispatch at `:2852` extended), the state is re-checked; a stale offer or a lost gate emits the existing `player-command-failed` with a reason string, as the other contract commands do.

### 5.2 Events and state

| Case | Events (all existing types) | Stored |
|---|---|---|
| accept | `contract-accepted` (`data.contract` status `accepted`, `acceptedTick`, `deadlineTick` **recomputed now**, plus `commandId`, `travelTicks`, `ticksLeft`, `costBasis`) then `player-command-resolved` outcome `contract-accepted` | the contract record only |
| decline | `contract-refused` (`status: "declined"`, `data.gate: "declined"`, `reason: "The carrier declined."`, escrow refunded through `refundEscrow`, `:2203`) then `player-command-resolved` outcome `contract-declined` | status `declined`, `closeReason: "declined"`, `settled` |
| ignored | `contract-cancelled` (`status: "expired"`, `reason: "offer-expired"`, escrow refunded, actor = buyer) at `tick >= offerExpiresTick`, from a new `expireHumanOffers` after `resolveContractOutcomes` and before `offerAutonomousSupply` in `runTickBody` (`:4589-4591`) | status `expired`, `closeReason: "offer-expired"`, `settled` |

Types (`src/sim/types.ts`): `SupplyContractStatus` gains `"declined"` and `"expired"`; `SupplyContract.offerExpiresTick?: number` (absent on every non-human contract, so flag-off JSON is unchanged); `SupplyContract.closeReason?: "declined" | "offer-expired" | "no-longer-needed"` (rev 2; written only when the carrier is human and the flag is on, so flag-off JSON is unchanged; it rides in `event.data.contract`, so replay needs nothing else); `PlayerCommand` gains the two verbs. Neither new status nor `closeReason` is reachable flag-off. The refill cancel keeps its stored status `cancelled` and `data.reason: "no-longer-needed"`; a human-carried one also gets `closeReason: "no-longer-needed"`.

`resolveOfferedContracts` (`:2421`) **skips a human carrier** when the flag is on: the engine never scores a human.

### 5.3 The deadline, derived not tuned, and the buy-and-sail allowance (ruling 9)

- **Answer window = 180 ticks** (`HUMAN_OFFER_WINDOW_TICKS = CHECK_IN_TICKS`, `view-model.ts:87`, with a test pinning them equal). NPC acceptance latency is exactly 1 tick (n = 2,721, min = p50 = p90 = max = 1), by construction (`observedTick < tick`), so it cannot be the human's.
- **Stored offer deadline** at issue: `now + 180 + min(720, max(travel + 1, 2))`, a placeholder replaced on accept.
- **Delivery deadline at accept:** `now + min(SUPPLY_DEADLINE_CAP, max(travel + 1 + allowance, 2))`: the NPC formula (`offerAutonomousSupply`, `engine.ts:4409`, applied at the moment of acceptance) plus the allowance below.

**Derivation of the allowance, every term an existing quantity:**

1. The NPC deadline is `travel + 1`. The `+1` is one command tick: a command queued before `runTick` N resolves in `runTick` N, so a carrier that holds the cargo can queue `travel` in the tick it accepts and still land by `deadline`. A human who already holds the cargo therefore needs **no allowance** (that is buy-then-accept, which meets the NPC deadline).
2. A human who must still buy spends **one direct-action tick per purchase**: only one `character-action` may be queued at a time (`commands.ts:435`, `action-already-queued`).
3. One purchase moves at most `tradeQuote(...).maxQuantity` (`engine.ts:570`), the smallest of shelf stock, `marketDepth` (`:154`, `targetStocks × MARKET_DEPTH_FRACTION`, `:106`, 0.16), free hold and spendable purse. `buys = ceil(need / maxQuantity)`, where `need = quantity + provisionDemand × voyage − cargo` is the same shortfall the NPC walk's own-port skip already uses.
4. Sequential play (accept, then each buy the tick after the last, then `travel`) lands `buys + 1 + travel` ticks after the accept; the NPC deadline allows `travel + 1`. The engine already tolerates **one** tick: a loaded carrier one tick out at the deadline lands next tick instead of breaching (`engine.ts:2493-2494`). So the allowance is `buys − 1` ticks, floored at 0. Queuing the accept and the first buy in one tick would save one more tick, so the allowance is an upper bound by one for that play; it is never short for the sequential play.
5. Code: `humanBuyAllowance` (fix tree `engine.ts:2439`), used in `humanAcceptTerms` (`:2453`). No constant.

**Effect, measured (13 seeds × 1,200, accept-first script "afirst": accept at once, buy one purchase per tick, then sail):**

| config | script | accepts | fulfilled | breached | cancelled on refill | buys per accept | allowance at accept |
|---|---|---|---|---|---|---|---|
| default | buy first, then accept (attentive) | 8 | 4 | 0 | 4 | n/a | n/a |
| default | accept first (afirst), allowance on | 9 | 4 | 1 | 4 | 0: 3, 1: 6 | 0: 9 |
| default | accept first, allowance forced to 0 | 9 | 4 | 1 | 4 | 0: 3, 1: 6 | 0: 9 |
| ATLS | buy first, then accept (attentive) | 10 | 5 | 0 | 5 | n/a | n/a |
| ATLS | accept first, allowance on | 15 | 5 | 2 | 8 | 0: 6, 1: 8, 2: 1 | 0: 15 |
| ATLS | accept first, allowance forced to 0 | 15 | 5 | 2 | 8 | 0: 6, 1: 8, 2: 1 | 0: 15 |

- **The allowance is 0 for all 24 accepts**, and the allowance-on and allowance-off arms are identical in every count. The reason is arithmetic: every port's `marketDepth` is 28.8 (seed 1847; four ports) and the commander's largest need from an empty hold is 12.88, so one purchase always suffices (`buys` = 1, allowance 0). The allowance is non-zero only where a ceiling (a thin shelf, a small hold, a short purse) makes one purchase insufficient at accept time. It is specified and unit-testable (section 12), but it **does not change any measured outcome in this world**.
- **Accept-first vs buy-first fulfilment:** 4 of 9 vs 4 of 8 (default), 5 of 15 vs 5 of 10 (ATLS). What separates them is cancel on refill (4 of 9, 8 of 15 vs 4 of 8, 5 of 10): sailing later gives an NPC more time to refill the shelf. Of the 3 breaches, 2 were accepts that needed no purchase after the accept (buys 0; cause not traced) and 1 (ATLS) needed 2 purchases, which an accept-time allowance did not predict (`need` fitted one purchase at accept).
- Correction to rev 1: accept-first is **not** impossible. A same-tick accept and buy followed by a `travel` meets the NPC deadline exactly, and the one-tick landing grace covers the sequential play. Rev 1's statement came from a buggy early harness script.

### 5.4 What happens if the human never answers

Idle commander: 9 offers per config; default 8 expired and 1 still inside its window at tick 1,200; ATLS 9 expired. Each expiry refunds the buyer exactly (escrow from treasury or purse, as at issue), writes nothing to relationships, starts the 180-tick same-buyer cooldown, and (rev 2) leaves an unread lapse message and clears the offer from `request`. Liveness over the rev-2 matrix: 406 of 406 offers not stuck past their window, 406 of 406 human accepts not stuck past `deadlineTick + 1`, 0 settled contracts holding escrow.


## 6. (d) Breach consequences: the existing NPC path, file:line

A human-accepted contract goes through the same function an NPC's does, `resolveContractOutcomes` (`engine.ts:2477`):

- **Fulfil** (`:2501-2528`): carrier landed with the quantity; shelf +10, carrier cargo −10, escrow to the carrier's purse, `writeContractRelationships(..., victory=true)`.
- **No longer needed** (`:2488-2490`): the destination shelf already holds the quantity when the carrier has not landed: `refundEscrow(..., "cancelled", "contract-cancelled", ..., {reason: "no-longer-needed"})`. No relationship.
- **Breach** (`:2493-2498`): `tick >= deadlineTick` and not one tick out loaded: `refundEscrow(..., "breached", "contract-breached", ..., breachCause(...))` (`breachCause` `:4534`) and `writeContractRelationships(..., victory=false)` (`:2117`), i.e. `relationship-changed` for **both** sides with the `DEFEAT` delta of `contractRelationship` (`contracts.ts:199`).


So breach costs the carrier **nothing in money**: the escrow returns to the buyer (it was never the carrier's).

**Ruling 5, v1 breach consequence = the relationship hit, plus a 180-tick cooldown from the breach.** The relationship hit is the existing DEFEAT write above (both directions). The cooldown is rule 6 of section 3.1: that buyer makes no offer to that human until 180 ticks after the contract closed (`observedTick` of the breached contract). It needs no new state: the breached contract itself is the record. It applies per buyer, so another buyer can still offer; "a real reputation system comes later" is not built. The card says it (section 7.2). Checked: 0 offers from the same buyer within 180 ticks after 55 breaches, 143 declines and 68 expiries (section 8, R6).

Measured (lazy script = say yes to everything the engine allows, then do nothing): 67 accepts over 26 runs, 49 breached (all cause `choice/deadline-infeasible`), 18 cancelled `no-longer-needed`.

**Race with NPCs:** of the attentive script's accepts, 18 were made and 9 were `cancelled no-longer-needed` (default 4 of 8, ATLS 5 of 10): an NPC refilled the shelf while the human was loading or sailing. The human keeps the cargo and loses the voyage. **Ruling 3: the rule is unchanged for everyone**; what changes is that the human's thread and card say so plainly (sections 4 and 7.2).


## 7. (e) Card states, mapped to ui-cards-v1 fields

### 7.1 States and card fields

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


### 7.2 Closed-card text and fields (rulings 3, 4, 5)

The closed carrier card gets three additive fields. `closeReason` is stored on the contract (section 5.2) for the three no-penalty cases and **derived from `status`** for the other two; `closeText` and `penalty` are derived from stored fields only (`card-states.ts` `closeNote`). All three are `null`/`false` for an open card, a mate and a bystander; `ProjectedContract` carries `closeReason` only where `source === "own-character"`.

| `closeReason` | Stored `status` | `closeText` (carrier's own card) | `penalty` |
|---|---|---|---|
| `declined` | `declined` | `You declined. No penalty.` | false |
| `offer-expired` | `expired` | `You did not answer in time. The offer lapsed. No penalty.` | false |
| `no-longer-needed` | `cancelled` | `<buyer> no longer needs this delivery: <destination port> is stocked again. No penalty. Anything you bought is yours.` | false |
| `breached` | `breached` | `You missed the deadline. <buyer> trusts you less and will not offer you another contract for 180 ticks.` | true |
| `fulfilled` | `fulfilled` | `Delivered to <destination port>. You were paid <price>.` | false |

Notes. (a) `no-longer-needed` is the **same rule for NPC carriers**; only a human carrier's contract gets the field and the text (the stored `closeReason` is written only for a human carrier with the flag on). (b) The feed sentence for a refill cancel is unchanged (`<carrier>'s provisions contract for <buyer> was cancelled: <port> already holds the quantity. The escrow returned.`); the new feed sentence is only for the lapse (`view-model.ts`, `contract-cancelled`, `reason: "offer-expired"`): `<buyer>'s offer lapsed unanswered. Nothing was lost. The escrow returned.` (c) The thread texts of section 4 say the same thing in the buyer's voice. (d) The card's `unread` is not a card field; unread is the thread's (`thread_reads`).

Mapping check (rev-2 matrix, hook run, 13 seeds, state of each human contract at tick 1,200, arm last): `results/rev2/summary.md` ("Volume") lists each outcome per scenario. Every offer produced a carrier card with `role: "carrier"`, a price, a non-null `threadId` where an opener was written, and `open === (offered or accepted)`: 406 of 406. Every closed human contract got a non-null `closeReason` and a `closeText`: the three no-penalty reasons say "No penalty" in 288 of 288 closed cards; a breached card says "180 ticks" and "trusts you less" in 55 of 55.


## 8. (f) Visibility and privacy, as checkable properties

Checked in `measure.ts` against the real `projectFor` / `buildCards` / `projectEventFeed`, for **every living character** as viewer of **every human offer**, over the rev-2 matrix (286 cells; arms last, peer-walk, peer-argmax, last-noescrow, last-noallow):

| # | Property | Checks | Violations |
|---|---|---|---|
| H1 | An offer is a real stored offer to the human: `carrierId` = the human, `offerExpiresTick − issuedTick = 180`, `deadlineTick > offerExpiresTick` | 406 | 0 |
| H2 | A faction mate of either party gets a contract card with `price`, `quantity`, `escrow` and `threadId` all `null` (ui-cards P3), and never `answerByTick` | 4,267 | 0 |
| H3 | A bystander gets no card (ui-cards P2) | 6,827 | 0 |
| H4 | A bystander's feed row for the offer carries no `price`, `escrow`, `offerExpiresTick`, and not the price figure | 6,827 | 0 |
| H5 | A bystander is in no thread containing the opener | 11,094 | 0 |
| H6 | The carrier's card has `role: "carrier"`, the price, `open` equal to offered-or-accepted, a non-null `threadId` | 406 | 0 |
| H7 | Every opener's sender is in the player's `knownCharacterIds`, is feed-visible, every number in the text appears in the receiver's own feed row, and `origin.contractId` resolves | 405 | 0 |
| H8 | No answered offer remains in the request tab (accepted, declined, expired, fulfilled, breached) | 3,600 | 0 |
| H9 | Liveness: no offer outlives its window; no accepted human contract outlives `deadlineTick + 1`; no settled contract holds escrow | 406 + 406 | 0 |
| H10 | Replay every 100 ticks; hook run economy identical to the no-hook run | 858 run-checks; 286 of 286 | 2 (variant only, section 9) |
| R1 | An expired offer is not in `request` | 68 | 0 |
| R2 | The expiry message text equals the section-4 text | 68 | 0 |
| R3 | The expiry message is unread after the opener's tick, and (never read) both messages are unread | 68 + 68 | 0 |
| R4 | A refill-cancel thread has the buyer as sender, the exact section-4 text (no digit), and is not in `request`; no `relationship-changed` for the pair at that tick | 67 + 67 + 67; 77 | 0 |
| R5 | Closed card text: "No penalty" for declined, expired, refill; "180 ticks" and "trusts you less" for breach | 288; 55 | 0 |
| R6 | Cooldown: no offer from the same buyer within 180 ticks after a breach, decline or expiry | 55, 143, 68 | 0 |

**Ruling 6: one existing leak, fixed separately.** A buyer-faction mate's feed row for a treasury-funded offer reads "<buyer> drew 56.25 from the treasury.", which is the price. It is the same sentence on every NPC offer on `main` and is not caused by this slice. The Lead is queueing the hash-neutral fix with the cards slice; this doc only references it. The harness still counts it apart (`mate-feed-treasury-draw(existing)`: 7 of 4,267 mate rows in this matrix), so H2 stays honest: a mate's *card* hides the terms.

**What is public today, unchanged:** a bystander reads "<buyer> offered <carrier> a contract to carry 10 provisions to <port>." on the public feed (names, quantity, destination), payload withheld. The lapse sentence of 7.2 reads the same to a bystander (no number).


## 9. Hash and flag

- **Flag:** `TickOptions.humanContracts`, `HUMAN_CONTRACTS_DEFAULT = false`, module flag `humanContractsOn` set in `runTick`. Every branch is under it: the human candidate rule, `expireHumanOffers`, the `resolveOfferedContracts` skip, `offerExpiresTick`, `closeReason`, the allowance. The commands are additionally gated by `options.humanContracts` (section 5.1). **The patch contains no `process.env` read.**
- **Flag off:** no new field is written, no new status is reachable, the NPC walk is untouched. Pins, flag off: 1847 `7f76e474/94de9c02`, 2718 `976c40bd/7a3741c9`, 4096 `08943ea5/af6eeaea`; ATLS 1847 `85658e53/5367691c`, 2718 `aa54ada1/faf5798a`, 4096 `e4361ee1/7e93eab2`. All six are **identical on `4f5c1f7` and on the fix tree** (`results/rev2/pins-*.txt`), and in all **66 of 66** flag-off runs of the rev-2 matrix. `COMMAND_TYPES` and the flag-off capabilities list are unchanged (section 5.1). `npm test`: **690 / 690** on the fix tree (`results/rev2/npm-test.txt`). `tsc` is not installed on the box, so `npm run typecheck` was **not** run.
- **Flag on, pins re-listed (arm last):**

  | seed | config | scenario | flag-off h72 / h1200 | flag-on h72 / h1200 | first human offer |
  |---|---|---|---|---|---|
  | 1847 | default | idle, attentive | `7f76e474` / `94de9c02` | same (no offer) | none |
  | 2718 | default | idle | `976c40bd` / `7a3741c9` | `4bc2f441` / `3cf415c9` | tick 47 |
  | 2718 | default | attentive | same | `e3cd94ea` / `96a30a8a` | tick 47 |
  | 4096 | default | idle, attentive | `08943ea5` / `af6eeaea` | same (no offer) | none |
  | 1847 | ATLS | idle, attentive | `85658e53` / `5367691c` | same (no offer) | none |
  | 2718 | ATLS | idle | `aa54ada1` / `faf5798a` | `9300b5c6` / `48b929f0` | tick 54 |
  | 2718 | ATLS | attentive | same | `deb264b9` / `3f750b8b` | tick 54 |
  | 4096 | ATLS | idle | `e4361ee1` / `7e93eab2` | `4653bf56` / `425c9412` | tick 62 |
  | 4096 | ATLS | attentive | same | `71dd7de5` / `6e75b3fc` | tick 62 |

  The h72 values equal rev 1's. The idle h1200 values differ from rev 1 because the expired contract now stores `closeReason`; the attentive values also moved with the changed script and the allowance. Flag-on pins are therefore **re-listed, not carried over**.
- **Replay:** `replayWithSilentStarts` (`tick-start.ts:27`), incremental, at ticks 100 to 1,200 on the flag-off, flag-on and flag-on + hook run of each cell: **858 run-checks, 2 mismatches, both in a measurement variant**: `last-noescrow`, default, seed 5000, attentive, first at t1,100, `characters.character-18.shortMorningStreak` live 89 vs replay 90. That is the same field as the commanded-run replay item the Lead assigned to the replay bisect (npc-threads ruling 8) and appeared in rev 1's first run only. It does not occur in any run of the arms the patch ships (last, peer-walk, peer-argmax) or in the allowance arm; the no-escrow arm is the one that writes an offer with zero escrow, which production never does. Not investigated further here. The post-tick hook events are stamped with the next tick, so the check runs right after `runTick`, before the hook (a harness artifact found in rev 1).


## 10. (h) Measurement

Harness: `run.sh` fans 130 jobs (2 configs × 5 arms × 13 seeds) across 8 workers, about 30 minutes on 8 cores; each job runs one flag-off run and, per scenario, a flag-on run and a flag-on + hook run. Scenarios (the commander `character-01`, parked at `crown-harbor`):

- **idle**: never answers. **attentive**: declines at once what it cannot carry (every decline in every arm was for `stock`), otherwise buys the cargo and ration while the offer is open, then accepts and sails in the same tick. **afirst**: accepts at once, buys one purchase per tick (the need plus one tick of ration), sails when loaded. **lazy**: accepts everything the engine allows, then does nothing.
- Arms: `last` (the patch), `peer-walk`, `peer-argmax` (variants.patch), `last-noescrow` (an offer to the human is made but holds no escrow: isolates the escrow lock), `last-noallow` (allowance forced to 0).

### 10.1 Volume: offers to the commander per 100 ticks per seed (156 seed-blocks per config; offers in brackets; seeds with at least one)

| arm | idle default | idle ATLS | attentive default | attentive ATLS | seeds (default / ATLS, attentive) |
|---|---|---|---|---|---|
| **last (patch)** | 0.058 (9) | 0.058 (9) | **0.128 (20)** | **0.147 (23)** | 9 / 7 |
| peer-walk | 0.058 (9) | 0.058 (9) | 0.128 (20) | 0.147 (23) | 9 / 7 |
| peer-argmax | 0.045 (7) | 0.064 (10) | 0.115 (18) | 0.160 (25) | 7 / 8 |

Other cells (`results/rev2/summary.md`): last, accept-first 0.122 (19) default and 0.179 (28) ATLS; lazy 0.192 (30) and 0.237 (37). For scale, NPC offers flag-off are 1,865 (default) and 1,893 (ATLS), about 12 per 100 ticks per seed: the human's attentive volume is about 1 % of that (1.1 % default, 1.2 % ATLS). **The inbox is dead for a stationary player and peer does not change it.** Rev 1: dropping the own-port skip gave 2.4 to 3.3 per 100 ticks, 96 % of them declined for stock (`results/rev1/summary.md`).

### 10.2 Peer against last: displacement and NPC fulfilment

Where a human candidate existed, the human's `assessSupplyContract` score against the NPC walk's pick (lowest id that accepts):

| config | arm | scenario | contested decisions (human candidate and an accepting NPC) | human outranked the pick | human candidate, no accepting NPC | margin min / p50 / max |
|---|---|---|---|---|---|---|
| default | peer-walk | idle | 27 | **0** | 9 | −0.335 / −0.220 / −0.029 |
| default | peer-walk | attentive | 34 | **0** | 20 | −0.335 / −0.193 / −0.029 |
| ATLS | peer-walk | idle | 19 | **0** | 9 | −0.289 / −0.179 / −0.077 |
| ATLS | peer-walk | attentive | 38 | **0** | 23 | −0.299 / −0.164 / −0.071 |
| default | peer-argmax | idle | 21 | 0 | 7 | −0.335 / −0.155 / −0.029 |
| default | peer-argmax | attentive | 29 | 0 | 18 | −0.335 / −0.169 / −0.029 |
| ATLS | peer-argmax | idle | 10 | 0 | 10 | −0.277 / −0.193 / −0.106 |
| ATLS | peer-argmax | attentive | 34 | 0 | 25 | −0.277 / −0.173 / −0.071 |

**NPC contracts that went to the human: 0 in every cell**, so peer-walk is **byte-identical in every count to last** (same offers, outcomes, economy). The margin is negative in all 212 contested decisions (118 for peer-walk, 94 for peer-argmax); why the commander's score is always lower was not isolated (it reads the commander's own personality and relationships, no constant).

Peer-argmax adds a re-ranking of NPCs among themselves, which changes NPC behaviour even though the human never wins: NPC offers re-ranked 4 and 5 (default idle, attentive), 3 and 8 (ATLS). NPC effects, sum over 13 seeds, flag-off → flag-on (the floor for fulfilled is in 10.4):

| config | scenario | arm | NPC offers | NPC fulfilled | NPC breached | treasury total |
|---|---|---|---|---|---|---|
| default | idle | last = peer-walk | 1,865 → 1,814 | 849 → 799 (−50) | 449 → 467 | 169,633 → 169,054 |
| default | idle | peer-argmax | → 1,754 | → 781 (−68) | → 439 | → 172,544 |
| default | attentive | last = peer-walk | → 1,728 | → 760 (−89) | → 441 | → 179,470 |
| default | attentive | peer-argmax | → 1,709 | → 768 (−81) | → 421 | → 177,447 |
| ATLS | idle | last = peer-walk | 1,893 → 1,721 | 817 → 761 (−56) | 466 → 413 | 105,835 → 108,130 |
| ATLS | idle | peer-argmax | → 1,667 | → 753 (−64) | → 393 | → 102,012 |
| ATLS | attentive | last = peer-walk | → 1,607 | → 703 (−114) | → 395 | → 108,639 |
| ATLS | attentive | peer-argmax | → 1,635 | → 714 (−103) | → 407 | → 92,080 |

**Recommendation: last.** Peer-walk is equal to last by the data and adds code; peer-argmax gives no more offers and re-ranks NPC choices (3 to 8 per cell) with NPC fulfilled inside the same spread as last. If the Lead wants more inbox volume, the data say the order is not the lever; the human's score is below every accepting NPC's, so a "first" rule is the only ordering that would add offers (rev 1: attentive 27 and 29 offers, fulfilled −113 and −161) and it displaces NPCs by construction.

### 10.3 The human's outcomes (arm last, count over 13 seeds)

| config | scenario | offers | accepted | declined | expired | fulfilled | breached | cancelled on refill | open at end |
|---|---|---|---|---|---|---|---|---|---|
| default | idle | 9 | 0 | 0 | 8 | 0 | 0 | 0 | 1 |
| default | attentive | 20 | 8 | 12 | 0 | 4 | 0 | 4 | 0 |
| default | accept-first | 19 | 9 | 10 | 0 | 4 | 1 | 4 | 0 |
| default | lazy | 30 | 30 | 0 | 0 | 0 | 20 | 10 | 0 |
| ATLS | idle | 9 | 0 | 0 | 9 | 0 | 0 | 0 | 0 |
| ATLS | attentive | 23 | 10 | 13 | 0 | 5 | 0 | 5 | 0 |
| ATLS | accept-first | 28 | 15 | 13 | 0 | 5 | 2 | 8 | 0 |
| ATLS | lazy | 37 | 37 | 0 | 0 | 0 | 29 | 8 | 0 |

Attentive, offer → accepted p50 2, max 4 ticks (the time to buy); accepted → fulfilled p50 4, max 5. The allowance (section 5.3) is 0 in all accept-first accepts.

### 10.4 Noise floor, isolated

Nine **flag-off** runs per config with the commander's purse nudged by 0 to 8 coins (no rule changes; rev 1 had three): any spread is chaos from a byte-different run, not an effect (`noise.ts`, `results/rev2/noise-*.jsonl`; per-seed totals included for matched-seed comparison).

| config | | NPC offers (all offers) | fulfilled | treasury total | claims | port changes | captures |
|---|---|---|---|---|---|---|---|
| default | flag-off | 1,865 | 849 | 169,633 | 682 | 711 | 247 |
| default | noise min..max of 9 | 1,846..1,916 | **835..869** | 163,999..172,452 | 671..702 | 699..729 | 247..257 |
| ATLS | flag-off | 1,893 | 817 | 105,835 | 497 | 537 | 214 |
| ATLS | noise min..max of 9 | 1,773..2,002 | **763..900** | 94,154..108,199 | 491..526 | 531..571 | 194..214 |

The isolating arm for the economy effect: an idle commander, offer made, **never accepted**, with and without the escrow held (sum of 13 seeds, flag-off → arm):

| config | arm | all offers (incl. human) | fulfilled | treasury total | claims | port changes | captures | seeds outside their own noise range (fulfilled) |
|---|---|---|---|---|---|---|---|---|
| default | **last** (escrow locked) | 1,865 → 1,823 | 849 → **799** (−50; floor 835) | 169,633 → 169,054 | 682 → 630 | 711 → 660 | 247 → 220 | 6 of 13 |
| default | **last-noescrow** | 1,865 → 1,876 (+11 = the human offers) | 849 → **849** | 169,633 → 169,633 | 682 → 682 | 711 → 711 | 247 → 247 | **0 of 13** |
| ATLS | **last** | 1,893 → 1,730 | 817 → **761** (−56; floor 763) | 105,835 → 108,130 | 497 → 521 | 537 → 561 | 214 → 209 | 4 of 13 |
| ATLS | **last-noescrow** | 1,893 → 1,900 (+7) | 817 → **817** | 105,835 → 105,835 | 497 → 497 | 537 → 537 | 214 → 214 | **0 of 13** |

**Result:** an offer that holds no escrow changes nothing (every count identical to flag-off, on all 13 seeds). The same offer with the buyer's 56.25 locked until the offer lapses (up to 180 ticks) moves the economy: default fulfilled is below the nine-run floor; ATLS is at its edge (761 vs 763) with a wide floor; the other columns sit inside the floor (treasury, claims, ports, captures are not separable from noise in these sums). So the idle effect comes from the **locked escrow** (the only difference between the two arms), not from the offer, the thread or the cooldown. The mechanism (the Lead's hypothesis: shelf refill timing while the buyer's purse is out of play) was not traced. It is a real but small effect of a 180-tick window and is the price of the offer; it is the NPC-side cost of putting a human at the end of the walk.

**What this does not isolate.** With a commander who acts (attentive), the no-escrow arm still moves (default 849 → 829, ATLS 817 → 686; 6 of 13 seeds outside the floor in each config): the commander's own purchases from the port shelf, sailing and deliveries change the world, which is the player acting, not the contract rule. **Skipped:** an arm where the commander makes the same trades with no offer at all (it needs a new scripted arm; the cheapest arm that separated the rule was the no-escrow one above). Treasury totals have a floor of about ±3 % to ±7 %, so treasury differences below that are not claimed.

### 10.5 Liveness and the rest

- 286 cells (arm × scenario × seed × config) completed all 1,200 ticks with the hook and the commander commands.
- Hook-run economy equals no-hook-run economy in 286 of 286 pairs (the hook is projection-only).
- Request tab: an expired offer is gone from it (R1) and an answered offer never stays (H8: 3,600 of 3,600).


## 11. Part 2: debt demand: ruling recorded, not specified

Debt demand is the **next slice**. It is not specced here. **Ruling (Lead, 2026-11-27, recorded as given):** refusing a demand gives the **creditor grievance toward the debtor**, and **the creditor's faction will not offer the debtor contracts until the debt is paid**, both **through existing gates**. I did not trace which existing gates carry each effect in this rev; that belongs to the next slice's spec. Open for that spec, from rev 1 and unchanged: the trigger (the engine has no overdue concept), the event shape, the pay verb, and where the refusal answer is stored.

Background facts kept from rev 1 (`results/rev1/debt-census-*.json`, flag-off, 13 seeds × 1,200 ticks):


Census (`debt-census.ts`, flag-off, 13 seeds × 1,200 ticks, `results/rev1/debt-census-*.json`):

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


## 12. Engineer test plan

Tests to write (all new, none change an existing expectation):

1. **Flag off is identical.** The six pins above; `npm test` unchanged (690 on the fix tree); `JSON.stringify(world)` has no `offerExpiresTick` or `closeReason` anywhere on a flag-off run to tick 1,200; `COMMAND_TYPES` deep-equals its `4f5c1f7` value; `commandCapabilities()` flag-off `commandTypes` is that same list; the engine diff contains no `process.env`.
2. **Commands are flag-conditional.** `submitCommand(world, accept|decline)` without `options.humanContracts` returns `{ok: false, code: "contracts-not-enabled"}` with the message of 5.1, before `unknown-type`; with it, the codes of 5.1; `commandCapabilities(undefined, {humanContracts: true}).commandTypes` has exactly the two extra names; server route passes the flag; `--human-contracts` and `HUMAN_CONTRACTS=1` turn it on, default off.
3. **`humanCarrierCandidates`**, one test per clause of section 3.1 (docked, free, known buyer, no open pair contract, one open offer at a time, 180-tick cooldown after `declined`, `expired` and **`breached`**, the two skips); human considered only after the NPC walk finds nobody; `carrierBlocked` unchanged (a human is still blocked by it).
4. **Offer shape.** `offerExpiresTick === issuedTick + HUMAN_OFFER_WINDOW_TICKS`, and `HUMAN_OFFER_WINDOW_TICKS === CHECK_IN_TICKS` (pin test); `resolveOfferedContracts` never scores a human carrier.
5. **Decline and expiry.** Escrow refunded exactly to the funding source (`refundEscrow`), faction treasury restored, **no `relationship-changed`**, status `declined` / `expired`, `closeReason` set, settled, cooldown applied.
6. **Accept and the allowance.** Deadline equals the NPC formula at the acceptance tick **plus `humanBuyAllowance`**; the allowance is 0 when the cargo is aboard or one purchase suffices; with a constructed port whose `maxQuantity` (thin shelf, small hold, or low purse) makes `need` need 3 purchases it returns 2; hard gates `travel` and `purse` reject; the score does not.
7. **Outcome parity.** A human-accepted contract fulfils, `no-longer-needed`-cancels and breaches through the same code as an NPC's (assert event types and the `relationship-changed` pair on breach; the refill cancel writes **no** relationship); a human refill cancel stores `closeReason: "no-longer-needed"`, an NPC's does not.
8. **Breach cooldown (ruling 5).** After a breach at tick t, the same buyer makes no offer to the human until t + 180, another buyer can.
9. **Replay.** Flag-on commanded run, 13 seeds, `replayWithSilentStarts` every 100 ticks, equal hash; decline and expiry replay restores escrow state; `closeReason` survives replay from `event.data.contract`.
10. **Projection and states.** `uiState` cases and `closeNote` text for every row of 7.2 (exact strings); carrier card has `answerByTick`, `actionRequired` true while open and in window; mate card: `price`/`quantity`/`escrow`/`threadId`/`answerByTick`/`closeReason` all `null`; bystander: no card, no thread; bystander feed row has no price or window; ui-cards P2/P3 re-run on human contracts.
11. **Hook and read state.** Opener `origin.contractId`; request tab: in while `offered`, out on `accepted`/`declined`/`expired`; the expiry message is unread after a marker at the opener tick (`thread_reads`); the refill-cancel message is from the buyer to the human with the exact text and no digit; pair rule closes on contract status; numbers in text ⊆ receiver's feed row.
12. **Acceptance run.** `measure.ts` on the Engineer's build (no `variants.patch`) reproduces section 10.1 and 10.3 arm `last`: same offers, same outcomes, flag-off pins unchanged. Run `npm run typecheck` (not run here: `tsc` is not on the box).

## 13. Non-goals

- No peer ordering (measured, equal or worse); no `first` ordering.
- No counter-offer, price or quantity negotiation; `contract-amended` stays NPC-or-player-offer only.
- No NPC-initiated offer outside the existing shortage trigger; no new event that makes a human a buyer.
- No reputation or credit system: v1 breach is the relationship hit plus the 180-tick same-buyer cooldown (ruling 5).
- No change to the refill-cancel rule, no protection for an accepted human contract (ruling 3); no score or "would an NPC take this" hint shown to the human.
- No more than one human in the measured runs; no mobile commander measured (10.1 is a floor for a stationary player).
- No debt demand (section 11); no fix for the mate-feed leak here (ruling 6, queued with the cards slice).
- No UI beyond the card and thread fields named here.
- No tuning: no constant was chosen to improve a number. 180 is `CHECK_IN_TICKS`; the deadline is the NPC formula plus a derived allowance; the cooldown reuses 180.

## 14. Questions for the Lead

1. **Volume.** Peer does not help: the human's score is below every accepting NPC's (0 of 212 contested decisions outranked), so last = peer-walk and argmax adds nothing. The stationary commander still gets about 1.5 offers per seed. Options left: accept it, widen eligibility (rev 1: dropping the own-port skip gives 2.4 to 3.3 per 100 ticks, 96 % declined for stock), or a "first" rule (displaces NPCs). Which, if any?
2. **Escrow lock.** The only measured economy cost of an unanswered offer is the buyer's 56.25 locked for up to 180 ticks (default fulfilled 849 → 799, below the floor). Accept, or shorten the window for a buyer whose shelf is still empty? (A shorter window is a number I did not choose.)
3. **Refill cancels** hit half of buy-first accepts (4 of 8, 5 of 10) and more of accept-first (4 of 9, 8 of 15). The text now says so plainly (ruling 3). Is that enough, given the human has paid shelf price for the cargo?
4. **10 of 77 refill-cancel threads were dropped** by the hook's existing rules (reason not broken out). The card still shows the close text. Acceptable, or should this rule bypass the pair rule?
5. **Allowance** is 0 everywhere in this world and an upper bound by one if the human queues accept and the first buy together. Keep as derived, or drop it until a world has a thin port?
6. **Replay.** `shortMorningStreak` reappeared once, in the no-escrow variant only, seed 5000. It is the item already on the replay bisect; no shipped arm shows it.
7. **Typecheck** was not run (no `tsc` on the box); `npm test` 690 of 690 only.

## 15. Reproduce

```
git worktree add ../wt docs/human-contracts && cd ../wt
git apply docs/design/human-contracts/fix.patch             # the proposed change (9 files)
node --experimental-strip-types docs/design/human-contracts/flag-conditional.ts   # ruling 7 check; run on main and on the fix tree
git apply docs/design/human-contracts/variants.patch        # measurement arms only, never merge
./docs/design/human-contracts/run.sh /tmp/out               # ~30 min on 8 cores
node --experimental-strip-types docs/design/human-contracts/noise.ts '{}'       # nine-nudge floor (also with the ATLS JSON)
node --experimental-strip-types docs/design/human-contracts/summarize.ts /tmp/out   # tables (copy noise-*.jsonl in first)
```
