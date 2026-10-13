# Contracts

**Status: Open.** Proposal for the owner to accept, change, or reject. Current code is `main` at `75704de`, which includes the slope-10 surrender slide (M19), fast garrison regrowth (M20), and party sightings (M21). The runs below are that unmodified tree. One local guard on `issue-order` was applied to measure the fixture and then reverted. This note is not decided until it moves into [world simulation](world-simulation.md) or [autonomous characters](autonomous-characters.md).

Runs are `createPrototypeWorld` plus `runTick`, no player commands, seeds 1847 / 2718 / 4096, Node v24.21.0, ICU 78.3. Tick numbers on events are the `tick` field. The 72-tick hashes match `tests/fixtures/golden-hashes.json` (`d3b79fce…`, `03d6d4bc…`, `a7cbf2a8…`; 8338, 8411, 8298 events). Long runs are 1200 ticks.

## What already behaves like a contract

Nothing in `src/` is a contract. The [roadmap](../roadmap.md) still lists structured negotiation as untracked. Five mechanisms already bind people, or look as if they do.

**Standing orders.** `StandingOrder` is what the sim enforces. `orderFor` (`src/sim/scenario.ts`) writes one at creation for every faction member except the two leaders: id `${issuerId}:order:${character.id}`, status `pending`, no event. World Government orders come from `character-01`, Free Tide from `character-14`. Merchants get `trade-supplies`, explorers `explore`, the one Free Tide raider `pressure` on `world-government`, and the rest `protect` on the faction port. Twenty orders on every seed (5, 4, 10, 1). The leaders and `character-23`–`character-30` hold none.

`assessStandingOrder` (`src/sim/agency.ts`) scores priority, loyalty, trust, respect, alignment, obligation, grievance, and caution times a fixed risk: 0.38, 0.88, 0.25, 0.34 for protect, pressure, trade-supplies, explore. Threshold `0.54 + ambition * 0.08`. `activeStandingOrder` keeps pending and active orders, highest priority, then id. `recordOrderAssessment` accepts or refuses once, while pending. `updateOrderAdherence` emits deviation and resumption. `judgeOrderCompletion` asks the issuer to close it: protect after a day on the target, pressure after a victory against that faction or a claim that takes it, trade-supplies after one `market-trade`, explore after a direct look. The judgment draws `rng.between(-0.04, 0.04)`. Only the player command `confirm-order` closes it. `amend-order` and `cancel-order` address an id. A change of directive or target returns the order to pending.

**Debts.** `DebtObligation` is a creditor faction, two values, a tick, and reason `prisoner-release`. `processCaptivityDeadlines` is the only writer. Fourteen days after capture (14 × 6 ticks) cash on hand is paid and the remainder is pushed from `captivity-released`. Escape writes none. Nothing reads `remainingValue` again. No repayment event, no default event, and no write to `relationship.obligation`. The design text wants a broken debt to scar reputation. There is no reputation stat.

**Relationships.** Trust, affinity, respect, fear, grievance, obligation. The order score reads four of them. Writes are the seed, `evolveLocalRelationship`, and `recordBattleConsequences` when the fighter already has a tie to an order's issuer. Victory under orders: trust `+0.012`, respect `+0.028`, fear `−0.005`, grievance `−0.006`, obligation `−0.01`. Defeat: trust `−0.025`, respect `−0.008`, fear `+0.018`, grievance `+0.035`, obligation `+0.015`. Accept, refuse, and deviate do not emit `relationship-changed`.

**Messages.** `createConversationThread` and `sendConversationMessage` back `POST /api/threads` and `POST /api/messages`. `classifyMessage` can tag `trade` or `request`. The reply stores `discardedActionCount` and does not submit `proposedActions`. Asking for a delivery in prose creates no obligation.

**Trade.** `buy-resource` and `sell-resource` store `unitPrice`, and `resolveDecision` charges that quote. `buy-provisions` and `trade-local` (`resolveTrade`) emit `market-trade` the same tick. Sales pay `tradeTax`; buys do not. `trade-supplies` completes on any one of those events, with no good, quantity, or destination shelf. [Port provisions](port-provisions.md) is the gap: Crown Harbor's fields fall behind the ration, Verdant Cay never empties, and no order carries grain across.

## One command, two orders

[hidden-state-visibility-001](../playtests/hidden-state-visibility-001.md) recorded two standing orders from one `issue-order`: `character-01:order:character-13` and `command-00001:standing-order`. [progress.md](../progress.md) leaves it open until the identity is decided. Reproduced on seed 1847.

Ada Sorn (`character-13`, explorer) starts at Crown Harbor with `character-01:order:character-13`, explore, no target, priority 0.78, pending. Mara issues explore, target `cinder-key`. `validateStandingOrder` checks faction, directive, target, priority, and duration. It does not read `standingOrders`. `processPlayerCommands` always builds id `${command.id}:standing-order` and emits `standing-order-issued`. `applyEvent` pushes.

`activeStandingOrder` keeps both and sorts by priority, then `localeCompare`. At the default 0.78 the seeded id sorts first (`h` before `o` in the second character).

| Tick | What the log shows |
| ---: | --- |
| 0 | `command-00001:standing-order` is issued. The seeded order is accepted. She sails for Glassport under that id. |
| 4 | She reports the Glassport survey complete. That order is `awaiting-confirmation`. |
| 5 | The command order is accepted. She sails for Cinder Key. |
| 8 | She reports the Cinder Key survey complete. |

Both end `awaiting-confirmation`. At priority 0.95 the command order is accepted at tick 0 and reports at tick 5; the seeded order is accepted at tick 6 and reports at tick 9. The completion report drops the winner out of `activeStandingOrder`, and the next review takes the one that was waiting.

`tests/commands.test.ts` ("a delivered standing order immediately enters autonomous plan review") tells Sable Morrow (`character-04`) to protect Glassport at 0.97. She already holds protect Crown Harbor at 0.78. The new id becomes active; the seeded order is still pending at tick 12 and refused at tick 24. Headless, that protect score is 0.595 against 0.616 and refuses at tick 0. The test never checks that she holds one order.

## What makes two orders the same order

The id is the identity, and each writer mints its own, so the scenario id and the command id never compare equal. `orderMutationPending` refuses a second queued mutation of one id and has no rule for two ids. Standing orders need the same rule the contract will use.

An open order is one issuer and one recipient, in `pending`, `active`, or `awaiting-confirmation`. A further `issue-order` amends that id. Directive or target is the major change `validateOrderAmendment` already computes: status returns to pending and the plan is cleared. Priority or deadline alone keeps acceptance, the revision-3 case in [human-commander-004](../playtests/human-commander-004.md). Identical terms are the existing `no-change` rejection. Cancel and confirm keep that id. A new id is minted only after the previous order is `refused`, `completed`, `expired`, or `cancelled`.

## The first contract: a paid supply run

One type: pay a carrier to land provisions on a named shelf by a deadline. `trade-supplies` never names that delivery. The port-provisions fields stay as they are.

**Terms.** Buyer, carrier, good (`provisions` only), quantity from 1 to 200 (`tradeQuantity`), destination settlement, deadline from 1 to 720 ticks (the order-duration bound), and a price. One open contract per buyer and carrier. The id is minted once from the command.

**The offer.** `offer-contract` sits beside `issue-order`: known identity, carrier autonomous, not captive, not in battle, not traveling. Faction is not required. A second offer while `offered` amends the id and asks for a new score. After `accepted` the terms are frozen. Cancel addresses the id.

No autonomous proposer here. Replies drop `proposedActions`, and these runs open no thread. A proposer keyed on an empty shelf would fire inside the fixture: Crown Harbor is empty from tick 64 on seed 4096. That version rides with the re-baseline.

**The score.** Deterministic. No new RNG draw. Hard gates on the carrier's tick. A carrier already at sea, or with no `locationId`, refuses with gate `travel` and the reason `The carrier is already at sea.` before any score. `travelDuration` returns 1 when `locationId` is null, and that 1 is not the voyage; there is no provisions price at sea, so that path must not reach the margin. A docked carrier whose haul does not fit the ticks left refuses with the same gate and `The voyage does not fit the deadline.` Already standing at the shelf is 0 ticks, not `travelDuration`'s floor of 2. If the hold is short and the purse cannot buy the shortfall at `marketPrice` where they stand, refuse with gate `purse`. Those emit `contract-refused` with the gate and do not touch a relationship. Scoring is reached only while they are standing. `resourcePrice` clamps scarcity to at least 0.55 against a provisions base of 1.8, so that price is at least 0.99 and `costBasis` is positive for every quantity of at least 1.

Past the gates the weights match `assessStandingOrder`, including its missing-relationship defaults (trust 0.35, respect 0.35, grievance 0, obligation 0). Risk is 0.25 when they already stand at the destination or it is neutral or theirs, and 0.88 when the haul sails to another faction's port. Those are the trade-supplies and pressure risks. Margin is new: `costBasis = quantity * marketPrice` where they stand, clamped to −0.25..0.25. Commerce weighs 0.30 because a contract has no order priority.

```
commerce      = round(commerce * 0.30)
margin        = round(clamp((price - costBasis) / costBasis, -0.25, 0.25))
trust         = round(trust * 0.14)
respect       = round(respect * 0.16)
grievance     = round(-grievance * 0.18)
obligation    = round(obligation * 0.08)
perceivedRisk = round(-caution * risk * 0.16)
score         = round(clamp(sum, 0, 1))
threshold     = round(0.54 + ambition * 0.08)
```

`round` is the three-digit helper in `src/sim/state.ts`. Accept when `score >= threshold`.

Applied to tick 0 of seed 1847, this is arithmetic on the opening state, not an event the sim emitted. Zara Gale (`character-17`, Free Tide merchant) stands at Crown Harbor with 32 provisions, money 93, commerce 0.894, ambition 0.265, caution 0.496, and a seeded tie to Mara (trust 0.665, respect 0.693, grievance 0.123, obligation 0.210). Provisions are 1.47. Ten units at price 18 have cost basis 14.7 and margin 0.224. Factors 0.268, 0.224, 0.093, 0.111, −0.022, 0.017, −0.020. Score 0.671 against 0.561: accept. Price 8 clamps the margin at −0.25 and scores 0.197: refuse.

**Escrow.** The price leaves the offerer's purse when the offer is applied, not when the command is queued and not again when it is accepted. Debiting only on accept, then returning nothing on a refusal, would destroy the coins sitting in escrow, so refusal, cancel, and breach each return that escrow once. It sits on the contract, in neither purse and not in a treasury. The event carries both purses the way `market-trade` carries `characterMoney`. Fulfilment pays the carrier from that escrow, once. Refusal, cancel while offered, cancel after accept, and carrier breach return it to the buyer, once. A score refusal and a cancel while offered write no relationship. A `DebtObligation` would not collect it: the runs below never reduce `remainingValue`.

**Fulfilment and breach.** `contract-fulfilled` requires `accepted`, the carrier at the destination and not traveling, the tick before the deadline, and a hold that covers the quantity. The grain moves onto `settlement.stocks.provisions`. No `market-trade`, no `tradeTax`. Nine against ten does not count, and there is no remainder. At `world.tick >= deadlineTick`, the same test `expireStandingOrders` uses, the contract is `breached`, the grain stays aboard, and the escrow returns. No RNG on either judgment.

**Relationships.** Fulfilment writes the victory deltas on both sides. Breach, and a buyer cancel after accept, write the defeat deltas. A missing side starts from the `evolveLocalRelationship` defaults. A score refusal writes nothing.

## Measured on main

Twenty orders at tick 0, then none issued, confirmed, expired, amended, or cancelled through tick 1200. Every acceptance and refusal is tick 0. Nothing confirms them: the World Government issuer is the idle human, and Free Tide has no confirm path. Every accepted order ends `awaiting-confirmation`, except one.

| Seed | Accepted | Refused | Reported complete | Deviated / resumed at 1200 |
| ---: | ---: | ---: | ---: | --- |
| 1847 | 14 | 6 | 14 | 26 / 26 |
| 2718 | 14 | 6 | 14 | 34 / 34 |
| 4096 | 16 | 4 | 15 | 164 / 164 |

Accepted then refused, by directive. Trade-supplies 4/1, 4/1, 5/0. Explore 2/2, 3/1, 3/1. Protect 7/3, 6/4, 7/3. Pressure 1/0 on every seed: Esme Dusk, `character-19`, from Pax Ash, target `world-government`. Explore and trade-supplies never deviate. Protect deviations are 17, 13, and 6, and those counts have stopped by tick 400. Pressure deviations at 1200 are 9, 21, and 158. She reports complete at 93 and 155 on the first two seeds, after attacker victories. On 4096 she has no attacker victory and no claim, and the order is still `active`.

The 72-tick fixture holds 13, 12, and 14 of those completion reports. Later ones are Esme on 1847 and 2718, and one protect each on 2718 (tick 96) and 4096 (tick 103). Refusals sit close to the line: Vale Drake's explore is 0.583 against 0.591; Mina Vale's protect on 2718 is 0.471 against 0.591.

| Seed | Captures, 72 / 400 / 1200 | Releases at 1200 | Created a debt | Paid in full | Still held |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1847 | 0 / 3 / 5 | 5 | 3 | 2 | 0 |
| 2718 | 1 / 5 / 10 | 8 | 3 | 5 | 2 |
| 4096 | 2 / 7 / 13 | 12 | 11 | 1 | 1 |

No release falls inside 72 ticks. First debt ticks are 225, 185, and 145. Originals run from 3.80 (Pax Ash, seed 2718, after 114.35 of a 118.15 demand) to 513.08 (`character-09`, seed 4096). On all 17 rows, `remainingValue` equals `originalValue`. Repayments: 0. Defaults: 0. Escapes: 0. Threads, messages, scheduled replies, and `conversation-*` events: 0 at 72, 400, and 1200.

`market-trade` over those 1200 ticks: 4964, 4704, 5503, all spot fills. The offer has to be a command: nothing opens a thread, and a debt row would keep `remainingValue` equal to `originalValue`, as these 17 do.

## Who can see it

Tiers are the reconnaissance set: self, co-located, faction, distant. Unknowns are null. The record carries `observedTick` of the last status change, and a source.

The parties see quantity, price, escrow, destination, deadline, status, and revision (`own-character`, age `tick - observedTick`).

A faction mate of either party sees the two ids, the destination, the deadline, and the status. Price, quantity, and escrow are null. Source `faction-report`. `visibleStandingOrders` shows an order only to its holder and its issuer, which is why Mara sees her seeded orders and not Pax Ash's order on Zara.

A bystander gets no contract row. Co-located money stays exact, so the purse drop is visible the way any purse is. Distant characters get no row. `eventPayloadVisible` uses the standing-order rule with the two parties in the issuer's place. Holding the destination does not open the payload.

**Anti-leak test.** `tests/redaction.test.ts`, beside "only the commander's own orders are projected". A distant commander has no row. A faction mate sees status and destination, with price, quantity, and escrow null, and editing the price does not change that JSON. A co-located rival has no row even when the character projection shows live money. The event payload stays withheld from anyone who is neither party, including the faction that holds the destination.

## Hash impact

The fixture already contains the tick-0 acceptances and refusals, the deviations, and those 13 / 12 / 14 completion reports. It contains no debt and no message. Changing `assessStandingOrder` or `judgeOrderCompletion` would move those events. This slice does not.

An autonomous offer would. Seed 4096's Crown Harbor shelf is empty from tick 64, inside the window. That proposer rides with M22, the autonomous short purse, which is the re-baseline already queued.

The player verb and the identity rule do not. A reverted guard in `validateStandingOrder` returned `order-already-open`, left Ada on the seeded id, and kept the hashes at `d3b79fce…`, `03d6d4bc…`, `a7cbf2a8…` (8338 / 8411 / 8298). Amend is that same command path. It stays out of the M22 diff, and it does not call `npm run golden:update`.

## Tests

- `tests/commands.test.ts`, beside "a delivered standing order immediately enters autonomous plan review". After the Glassport issue, Sable holds one open order: the seeded id, revision 2, target `glassport`. No `command-00001:standing-order`. An issue that changes nothing is `no-change`.
- `tests/agency.test.ts`, beside "accepted orders report temporary deviations, resumptions, and completion judgments". Zara accepts price 18 and refuses price 8 at the factors above, and the second call does not advance the rng. Fulfilment of 10 adds 10 to Crown Harbor, pays her from escrow, and emits no `market-trade`. A hold of 9 does not fulfil. A passed deadline returns the escrow and writes the defeat deltas.
- `tests/redaction.test.ts`. The anti-leak test above.
- `tests/conversations.test.ts`. A message that asks for a delivery leaves `proposedActions` unsubmitted and creates no contract.
- `tests/economy.test.ts`. The shortage cases stay. Fulfilment is not production, and a headless Crown Harbor run still has no contract event.
- `tests/golden.test.ts`. "pinned seeds reproduce their committed state hash and event count" stays green.

## Playtest

The operator plan is [offer-contract-001](../playtests/offer-contract-001.md). It has not been run. The order-identity playtest (Ada, one order, no escrow) is a different session and is not this run.

Measured on this branch against the dashboard HTTP API, seed 1847, Node v24.21.0, before a blind operator plays it. The note's older table (Glassport then Cinder Key by tick 8, Zara still on 93 when the grain moves) is not this world. Scoring waits one tick, so a new offer is still `offered` after the first advance. Zara trades on her own during that tick, and she sails on the tick she delivers, so her purse after fulfilment is on the event, not on her character row.

**Hypothesis.** Paying for a delivery takes the price into escrow when the offer is applied. A price Zara accepts lands 10 provisions on Crown Harbor and pays her from that escrow, once. A price Orin refuses returns his escrow, once, and does not pay him.

**Start.** `npm run dashboard -- --reset --seed 1847`. The server listens on `http://127.0.0.1:4317`. `playerId` is `prototype-player`. Advance with `POST /api/advance` and `{"ticks":1}` (never more than 144). Read contract events from that response. Page older history with `GET /api/state?limit=200&beforeSequence=<eventPage.cursor>`.

Send Orin's offer first, then Zara's. A second Zara offer before the tick is HTTP 400 `contract-already-queued`, error `An offer to this carrier is already queued`. After the first advance, repeating Zara's terms with `expiresInTicks` 11 is HTTP 400 `no-change`, error `The offer does not change the contract`. State tick 1: Mara's money is 82, both contracts are `offered`, escrows 8 and 18. State tick 2: Orin is `refused` and the 8 is back, Zara is `fulfilled`, Mara's money is 90, Crown Harbor provisions are 236.008, and that advance contains no `market-trade`.

`PROMOTE` if those purses, escrows, the shelf, and the two contract ids match. `REVISE` if Zara is paid before the grain moves, if Orin's 8 stays out of Mara's purse, if the shelf does not gain 10, or if a `market-trade` is the delivery. `ABANDON` if `offer-contract` is `unknown-type`, or if the offer never leaves the purse and never changes the shelf. The exact bodies and readings are in the playtest file.

## Questions for Micah

1. **You give an officer a new job while they still have your old one. What happens?** Default: the new job changes the old one. Two jobs from you at once do not stick.
2. **Can you pay someone from another faction to haul grain?** Default: yes, if you know them. Orders stay inside your faction. Buying at a market already crosses it.
3. **They deliver some of the grain, not all of it. Does that count?** Default: no. The whole amount by the deadline, or the money comes back.
4. **You cancel after they agreed. Do they keep any money?** Default: no. It comes back, and trust falls by the amount a lost fight already costs.
5. **Should captains offer these hauls on their own?** Default: no. They offer when you ask. Offers on their own would change the test world's recorded history, and that belongs with the purse work already queued.
6. **Does the port tax a delivery between two people?** Default: no. Tax stays on market sales.
7. **Who sees the price?** Default: the two people see the price and the amount. Their factions see that a job exists, where it goes, and whether it was kept. Someone beside them sees purses, as today. Everyone else sees nothing.

## Addendum: captains offering on their own

**Status: Ruled.** The Lead's answers are in [Ruling](#ruling). The sections above are the note merged as PR #25. They stay as they were. Question 5 up there defaults to no. This addendum is the measurement that default put off. Nothing here is in the tree. The census is a local readout of the baseline tape. Two offer rules were patched into `runTick`, measured, and restored. With the patch idle, the same three runs reproduced the baseline table.

Checked on `origin/main` at `d7a816fd8f9c3cd371e9fa746b306958475427eb` (PR #108). Node v24.21.0, ICU 78.3. `npm test` passed, 424 tests. The 72-tick fixture passed, including the golden recovery replay of 600 events on seed 1847 split at tick 47. A headless run reproduced the fixture and the 1200-tick baseline:

| Seed | Tick 72 state hash | Events | Tick 1200 state hash | Events |
| --- | --- | ---: | --- | ---: |
| 1847 | `4ea893a485b05ce6eab599919765903ade9a0ce45f383437f4698064faa7a297` | 8413 | `b302e1af1cdd4dfe7ba2ea3371bf35dd64d770c1a7c8692a0a0ed6fac20e07e9` | 164732 |
| 2718 | `d376ad02c6e7c9b03dd0eb4db1c3c137ac7a00d61a096673e12ae4fdabbdfef2` | 8456 | `e81f5ba4a3036f40f94ca02e48d856b3cf6572709277a303a718f4c273237056` | 162127 |
| 4096 | `ac780b3999c3da53f38c0cd16301dfa7f60562a35796f5fa0451c969c9ed08de` | 8261 | `f6b6aea414d205bebd264d8d2c8efba66c6287448414df7359e7a90c910c31db` | 159900 |

Runs are `createPrototypeWorld` plus `runTick`, no player commands. Seeds 1847, 2718, and 4096. A figure at tick 0 is the world before any `runTick`. A figure at tick 72 or tick 1200 is the world after that many calls. Tick numbers on events are the `tick` field. Counts below, unless they say tick 0, are snapshots at `world.tick` 1 through 1200. An offer the writer emits is stamped with the tick field at the end of the tick, before `tick-advanced`, so that event tick is one less than the snapshot the shelf was read on.

A mean is rounded to 3 decimals. A median is the value at linear index `(n − 1) / 2`, interpolated when that index falls between two samples, then rounded to 3 decimals. Seeds below are 1847, 2718, and 4096, in that order.

[Negotiation](negotiation.md) is the shortlist: a scorer builds the legal rows, and `candidates[0]` is the pick when the model is off. Its contract row is the gate in `assessSupplyContract`. [News](news.md) is the ledger. The world still has no `news` field, and a public item still leaves stocks and prices off. The live shelf is the one under a character's feet. [Treasury balance](treasury-balance.md) and [treasury spending](treasury-spending.md) are the quoted spend: the free holder draws the treasury or the quote fails, and a member draws the allowance, then the purse. [Fleet](fleet.md) is why that treasury is thin. [Morale](morale.md) is the short share, which this note does not rewrite.

## Summary

A headless run still offers nothing. `offer-contract` is a player command, the buyer is that player's character, and these runs queue no command. Contract events are 0. Mara Vane (`character-01`) is the human. She is standing on an empty shelf for 693, 267, and 665 snapshots and the autonomous path skips her.

An empty shelf is `stocks.provisions <= 0`. Those port-ticks are 2168, 1918, and 2166. Verdant Cay is never one of them. The first empty snapshots are Glassport 97, Cinder Key 43, and Crown Harbor 74. Stock under 1, the `buy-provisions` gate, is 3219, 2872, and 3274 port-ticks, and each port's first under-1 snapshot is the same tick as its first empty snapshot. The extra rows, 1051, 954, and 1108, sit strictly between 0 and 1. A writer on `< 1` was not run.

The candidate buyer is an autonomous member of the faction that holds the shelf, standing on it, not captive, and not the attacker in a battle. One offer per shelf per tick, the lowest id who can pay the price. The carrier is the lowest id who passes `carrierBlocked`: autonomous, docked, not captive, not the attacker. Quantity is 10, the worked example above, inside 1..200. The deadline is `max(travelTicks + 1, 2)`, capped at 720. The extra tick is the wait before a new offer is scored.

The live provisions price on an empty shelf is 4.50, base 1.8 times the scarcity clamp of 2.5. Ten units are 45.00 on every empty snapshot. The premium is 1.25 times that board, 56.25, which is the margin cap computed from the shelf under the buyer's feet. The carrier's own margin cap, 1.25 times the price where the carrier is standing, was scored and was not offered. It runs from 12.38 to 56.25.

On the tape, a faction captain is standing on 1895, 1607, and 1377 of the empty shelves. The other 273, 311, and 789 have no such captain. The holder of that shelf's faction is standing on it for 451, 215, and 185 snapshots, and is elsewhere for 1717, 1703, and 1981, of which 72, 204, and 85 are at sea.

Spot rows score the snapshot and do not write. The same pair is counted on every snapshot, so a spot accept is not a second contract. The writer emits `contract-offered` and then uses the resolver already in the tree. A pair that is still open is not offered again. Accepted contracts on the 45 writer are 6, 4, and 7, and every one of them breaches. On the 56.25 writer they are 7, 6, and 20, and 4 of the 20 are fulfilled, all on 4096. The escrow comes back except for an offer still open at tick 1200 and those four payments. Free Tide's ending balance still moves, because the offers change later decisions. Baseline endings are World Government 5501.03, 6885.06, and 3608.30, and Free Tide 0, 666.09, and 0.

## 1. Who can offer

`validateOfferContract` buys from the player character. The carrier has to be autonomous, known to that player, not captive, not travelling, and not the attacker in a battle. One open contract per buyer and carrier. `resolveQuotedSpend` takes the escrow when the offer is applied. `resolveOfferedContracts` scores it on a later tick, because a new offer waits. `resolveContractOutcomes` fulfils a landing or breaches at `world.tick >= deadlineTick`. `assessSupplyContract` draws nothing.

The news item does not carry stocks. A captain who is not standing on the shelf does not see that it is empty. The candidate rule therefore requires `locationId` to be that settlement and `travel` to be null. Faction is required here, which the player command does not require, so a World Government captain does not hire a haul for a Free Tide shelf merely by having the lower id. The id-order alternative, any autonomous captain on the shelf, was scored. It offers 2135, 1912, and 2107 times and accepts 46, 6, and 17, and Free Tide is the buyer on only 54, 52, and 83 of them. That rule was not written.

Letting every eligible captain offer, still at 45, was scored and not written. Those rows are 9042, 12831, and 9217, and the accepts are 55, 13, and 57. On 1847 and 2718 every accept is World Government. On 4096 the accepts are World Government 24, unaffiliated 14, one breakaway 14, and Free Tide 5.

A carrier the buyer already has a relationship with, lowest id, same 45 price, same id-order buyer, was scored and not written. Offers are 2135, 1911, and 2105. Accepts are 46, 10, and 14.

## 2. What the haul pays

The board price is `round(10 * marketPrice(destination, provisions), 2)`. On this census the min and the max are both 45. The foot premium is `round(that * 1.25, 2)`, min and max both 56.25. The carrier margin cap uses the carrier's port instead of the destination. Its mean is 49.664, 52.189, and 50.353, its median is 56.25, and its min and max are 12.38 and 56.25.

Past the gates the margin term clamps at 0.25. A price at or above 1.25 times the carrier's cost basis scores the same as any higher price. Ten units at 45 already sit on that clamp when the carrier's cost basis is 36 or less. The first 4096 row is that case: Sable Morrow (`character-04`) is at Verdant Cay, cost basis 9.90, and 45 and 56.25 both score 0.564 against 0.616. The premium changes the score when the carrier is on a scarce board. Standing on the empty shelf, cost basis is 45, margin at 45 is 0, and margin at 56.25 is 0.25.

Spot accepts, faction buyer, one per shelf. "Already" means the carrier is on the destination. A spot accept counts the snapshot, including repeats.

| Price | Offers | Accept | Already | Voyage | Score refuses | Purse refuses | No price accepts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 45 | 1357, 1427, 1137 | 12, 6, 7 | 0, 0, 0 | 12, 6, 7 | 1168, 1139, 973 | 177, 282, 157 | 1261, 1399, 1025 |
| 56.25 | 1326, 1392, 1101 | 80, 30, 114 | 0, 0, 16 | 80, 30, 98 | 1074, 1090, 831 | 172, 272, 156 | 1246, 1362, 987 |
| Carrier cap | 1962, 1823, 2019 | 175, 28, 156 | 0, 0, 1 | 175, 28, 155 | 1473, 1302, 1454 | 314, 493, 409 | 1787, 1795, 1863 |

The carrier-cap row is the id-order buyer, not the faction buyer, because that is the pair whose remote board was priced. Where some price would accept, the minimum such price has means 48.284, 44.894, and 52.214 at the 45 rule, and 48.302, 44.09, and 51.817 at the 56.25 rule. Those minima were not offered.

The spot bill is `resolveQuotedSpend` on that snapshot. The treasury is not reduced between rows, and the same captain is billed again on the next snapshot. World Government, then Free Tide, then every other faction:

| Price | Treasury | Purse |
| --- | --- | --- |
| 45 | 8439.11, 6494.36, 6075.34 / 5176.45, 8202.58, 982.99 / 5865.26, 3782.52, 6631.54 | 20855.89, 19020.64, 18404.66 / 9538.55, 18167.42, 3292.01 / 11189.74, 8547.48, 15778.46 |
| 56.25 | 8270.11, 6465.46, 5602.43 / 5605.79, 8609.01, 1007.74 / 5757.26, 3387.56, 6571.54 | 27504.89, 25090.79, 23253.82 / 12281.71, 24184.74, 4167.26 / 15167.74, 10562.44, 21328.46 |

Free Tide's offers at 45 are 327, 586, and 95. At 56.25 they are 318, 583, and 92. Its spot accepts at 45 are 0. At 56.25 they are 0, 0, and 11. The other 56.25 accepts are World Government 80, 30, and 98, and one breakaway 5 on 4096. Holders are 68, 45, and 7 of the 45 offers, and 62, 44, and 7 of the 56.25 offers. Everyone else who offers is a member. Buyers the price skips, faction rule, are 1050, 683, and 636 at 45, and 1139, 763, and 727 at 56.25.

## 3. Accept, refuse, and what they know

The shortlist is the one [negotiation](negotiation.md) already describes, and it is the gate the resolver already runs. A hard gate, or a score under `0.54 + ambition * 0.08`, leaves only `refuse`. A score on or over the line puts `accept` first and `refuse` second. `candidates[0]` is that row. The model flag stays off. `assessSupplyContract` does not draw. `applyEvent` stores the contract on the event and does not score it again. The writer did not add `offer-made`, and it did not put a `shortlist` array on the payload. The choice is the existing event: `contract-accepted` or `contract-refused`, with `gate` on the refusal.

The buyer is allowed the live price of the shelf under their feet, which is the 45 and the 56.25. They are not allowed the carrier's remote board, which is the carrier-cap row. The carrier, standing on their own port, scores with that port's price. Motives, the other treasury, and a remote shelf stay off the news item and off this offer.

The first faction offer on the tape, which is also the writer's first offer:

| Seed | Event tick | Buyer | Shelf | Carrier | Where the carrier is | Travel | 45 draw | 56.25 draw | Spot score at 45 | Spot score at 56.25 |
| --- | ---: | --- | --- | --- | ---: | ---: | --- | --- | --- | --- |
| 1847 | 99 | Zara Gale (`character-17`), Free Tide, member | Glassport | Niko Wren (`character-03`) | Glassport | 0 | purse 45 | purse 56.25 | 0.302 vs 0.595 | 0.552 vs 0.595 |
| 2718 | 42 | Dax Pike (`character-20`), Free Tide, member | Cinder Key | Sable Morrow (`character-04`) | Cinder Key | 0 | treasury 18, purse 27 | treasury 18, purse 38.25 | 0.199 vs 0.611 | 0.449 vs 0.611 |
| 4096 | 73 | Toma Reef (`character-07`), World Government, member | Crown Harbor | Sable Morrow (`character-04`) | Verdant Cay | 4 | purse 45 | purse 56.25 | 0.564 vs 0.616 | 0.564 vs 0.616 |

Zara's Free Tide treasury on that snapshot is 567.49. Dax's is 1888.91. Toma is a member, and both of his bills are paid from the purse. All three spot scores refuse. Cost basis is 45, 45, and 9.90.

## 4. Deadline and breach

`expiresInTicks` is still 1..720. A new offer is scored on the next tick, and `resolveContractOutcomes` breaches when `world.tick >= deadlineTick` before it checks the landing. Duration 1 would breach on the tick it is accepted. Duration `travelTicks` would make `ticksLeft` one short of the voyage after the wait. `max(travelTicks + 1, 2)` is the smallest duration that survives both. Nothing in these runs needed more than 720.

Fulfilment is unchanged: accepted, at the destination, not travelling, before the deadline, hold covers the quantity. The grain moves onto the shelf. There is no `market-trade` and no `tradeTax`. A short hold stays short. The carrier is not given an order to sail. Breach and a cancel after accept write the defeat relationship deltas. Refusal and cancel while offered write none. The escrow returns to treasury and purse by the shares that were drawn.

The writer, faction buyer, one offer per shelf:

| | 45 | 56.25 |
| --- | --- | --- |
| Offered | 1453, 1763, 1097 | 1560, 1379, 1541 |
| Refused | 1447, 1758, 1089 | 1553, 1371, 1519 |
| Accepted | 6, 4, 7 | 7, 6, 20 |
| Breached | 6, 4, 7 | 7, 6, 16 |
| Fulfilled | 0, 0, 0 | 0, 0, 4 |
| Refusal gates | score 1226, 1467, 966; purse 221, 291, 123 | score 1369, 1234, 1378; purse 184, 137, 141 |

At tick 1200 the 45 writer still has one offer open on 2718 and one on 4096, each a purse of 45. The 56.25 writer has two open on 2718, 112.50, and two open on 4096. The four fulfilments pay 225.00, which is 4 times 56.25: treasury 7.68 and purse 217.32. The rest of the 4096 purse net is the two open escrows.

## 5. The treasury

Free Tide opens at 2800 and ends the baseline at 0, 666.09, and 0. Snapshots with that treasury at or below 0 are 570, 150, and 713. A holder offer fails unless the treasury covers the whole price. A member offer draws at most the day's allowance, which is `min(18, treasury / free mates)`, and the purse pays the rest. Dax's first bill is the shape: 18 from the treasury and the rest from the purse.

Coins the writer actually drew, then got back. World Government, Free Tide, then every other faction. These sums are the events, so a refunded coin is in the drawn column and in the refund.

| | 45 treasury drawn | 45 purse drawn | 56.25 treasury drawn | 56.25 purse drawn |
| --- | --- | --- | --- | --- |
| World Government | 3115.88, 3672.55, 3017.25 | 28564.12, 28322.45, 26187.75 | 3125.03, 2675.96, 3182.56 | 46262.47, 34449.04, 33942.44 |
| Free Tide | 2585.84, 3894.83, 3305.58 | 6909.16, 33095.17, 5694.42 | 1371.98, 4922.29, 5111.72 | 7853.02, 25171.46, 17894.53 |
| Other | 2595.25, 823.32, 1218.00 | 21614.75, 9526.68, 9942.00 | 2387.60, 854.12, 1896.03 | 26749.90, 9495.88, 24653.97 |
| Refunded | 8296.97, 8390.70, 7540.83 | 57088.03, 70899.30, 41779.17 | 6884.61, 8452.37, 10182.63 | 80865.39, 69003.88, 76161.12 |
| Net still out | 0, 0, 0 | 0, 45, 45 | 0, 0, 7.68 | 0, 112.50, 329.82 |

Offers by faction on the writer are World Government 704, 711, and 649 at 45, and 878, 660, and 660 at 56.25. Free Tide is 211, 822, and 200 at 45, and 164, 535, and 409 at 56.25. Holders are 49, 26, and 67 at 45, and 19, 61, and 77 at 56.25.

Ending treasuries are not that net. The offers change who sails and who trades. World Government ends the 45 writer at 7137.43, 9638.93, and 10284.93, and Free Tide at 0, 0, and 0. The 56.25 writer ends World Government at 7298.87, 10854.75, and 5565.84, and Free Tide at 0, 990.33, and 0. The middle seed's baseline Free Tide ending is 666.09. The 45 writer spends that down to 0. The 56.25 writer leaves 990.33. Neither figure is a contract coin left in the treasury. The contract coins came back, apart from the open escrows and the 7.68.

## 6. Hash

`stateHash` is sha256 of the canonical world. `applyEvent` already has the contract cases. The writer adds no event type, no world key, and no draw. The tick rng is untouched. A spot score calls `assessSupplyContract` and `resolveQuotedSpend` and writes nothing. The run that scored them is the baseline table.

The 45 writer and the 56.25 writer are separate runs, each from the baseline, not stacked.

Seed 2718's first offer is event tick 42, inside the fixture. The 45 writer puts 10 offers and 10 refusals in that window, and the tick-72 hash is `c15fa032988616ed51cc32b21be852b267f3162c9c5f91549d1190f41cf1a528` (8476). The 56.25 writer puts 9 offers and 9 refusals there, and the tick-72 hash is `2f295c23dd35677d3dd9b8ba922badf97b323fb4fcf229591636d732e267bb50` (8474). Seeds 1847 and 4096 first offer at event ticks 99 and 73. Their tick-72 hashes and event counts stay the fixture.

Tick 1200:

| Rule | 1847 | 2718 | 4096 |
| --- | --- | --- | --- |
| 45 | `557f3adc34c4190fa3dacfb5ef2063d7db1e40d7a0d3041bc0f5b8417045fb5c` (164838) | `f35874223215d83a45791c2f5a511eabd81c1c76ba7fd9f3dfcc7667049115ea` (163656) | `526fe2d49132cfff5039800bc4d4a90196efa0762d36e359eefa096134e3e6d4` (166898) |
| 56.25 | `c95d8d5eeaba4caa9dc19016a43e389bc103d292e8684b6092f68e844bb5ca43` (165296) | `f91f6002fb5b4cbb08a4117b53d236d4e478b4e2d668898e3d5e24cfa334120f` (168060) | `07a9b106f5f0beb9612d8f2a0066b44327dd45d0b3910f85502bba2ec3dc4492` (168152) |

## 7. Slice plan

The slices are in the order they would land. A spot slice writes nothing. The two writers are not stacked.

| Slice | What lands | Hash on these three seeds |
| --- | --- | --- |
| 1 | A readout. Empty shelves, who is standing on them, contract events on the tape. Not written. | Neutral. The baseline table. Contract events are 0. |
| 2 | Spot scores. Faction buyer at 45 and at 56.25, the carrier's margin cap, the any-captain id order, the relationship carrier, and every captain on the shelf. Not written. | Neutral. The same run as slice 1. The baseline table. |
| 3 | The faction buyer offers 10 at 45, one shelf per tick, through `contract-offered` and the resolver already in the tree. | 1847 and 4096 stay on the fixture. 2718 moves at tick 72, hash above, 8476 events. Tick 1200 is the 45 row. |
| 4 | The same buyer offers 10 at 56.25. | 1847 and 4096 stay on the fixture. 2718 moves at tick 72, hash above, 8474 events. Tick 1200 is the 56.25 row. |

Slice 4 is the premium. It is not required for slice 3. The carrier-cap price, the relationship filter, and the every-captain rule were not given a second world.

## 8. Questions for the Lead

The Lead rules on these against [game vision](game-vision.md). Defaults are what this brief would build. Question 5 in the note above defaulted to no. These defaults replace that deferral for this haul only.

1. **Who offers when nobody asked?** Default: one autonomous captain of the faction that holds the shelf, standing on it, not captive, not the attacker, the lowest id who can pay. One offer per shelf per tick. Mara stays on the player command. A captain who only has the news ledger does not offer. Empty shelves are 2168, 1918, and 2166. A faction captain is there on 1895, 1607, and 1377. The holder is there on 451, 215, and 185, and elsewhere on 1717, 1703, and 1981.

2. **What do they pay?** Default: 10 provisions at the live price under their feet. On these empty shelves that is 45. The 56.25 premium is slice 4. It accepts more snapshots, 80, 30, and 114 against 12, 6, and 7, and on the writer it fulfils 4 hauls, all on 4096. The carrier's own margin cap was scored and not offered. Its prices run from 12.38 to 56.25, mean 49.664, 52.189, and 50.353.

3. **Who is hired, and how do they answer?** Default: the lowest id who passes `carrierBlocked`. The shortlist is the gate. `candidates[0]` accepts when the score clears and refuses otherwise. No draw, and no `shortlist` field. The relationship filter was scored at 45 on the id-order buyer and accepts 46, 10, and 14. It was not written. Letting every captain on the shelf offer was scored, 9042, 12831, and 9217 rows, accepts 55, 13, and 57, and was not written.

4. **What is the deadline, and what is a breach?** Default: `max(travelTicks + 1, 2)`, and never past 720. Breach is the existing `contract-breached`. The escrow returns by source. Both sides take the defeat deltas. The carrier is not ordered to sail. On the 45 writer every acceptance breaches: 6, 4, and 7. On the 56.25 writer the acceptances are 7, 6, and 20, the breaches are 7, 6, and 16, and the fulfilments are 0, 0, and 4.

5. **What does Free Tide pay?** Default: the quoted spend already in the tree. The holder offers only when the treasury covers the price. A member draws the allowance, then the purse. Free Tide's baseline endings are 0, 666.09, and 0, and the treasury is at or below 0 on 570, 150, and 713 snapshots. The spot sums in section 2 repeat the same bill on later snapshots. On the writers the escrow returns. Net still out is 0, 45, and 45 at the 45 price, and 0, 112.50, and 329.82 from the purse at 56.25, plus 7.68 of treasury on 4096. Ending Free Tide is 0, 0, and 0 at 45, and 0, 990.33, and 0 at 56.25. Those endings are the later campaign.

6. **Does the hash move, and does anything draw?** Default: the offer moves the hash from its first event tick. Seed 2718 is tick 42, so the fixture moves. Seeds 1847 and 4096 are ticks 99 and 73, so the fixture stays and tick 1200 moves. No new event type. No side stream. The tick rng stays the wrong stream. A writer on stock under 1 was not run. Its first tick on each port matches the empty tick, so it would move the same fixture and was not hashed.

## Ruling

The Lead has ruled.

The payout is 56.25, the premium priced from the empty shelf. Ten units at the live price, 45, is rejected. Every contract that price accepted was breached, 6, 4, and 7, so the haul is dead content. The other numbered defaults stand. One autonomous captain of the faction that holds the shelf offers, the lowest id who can pay, one offer per shelf per tick. The carrier is the lowest id who passes `carrierBlocked`, and `candidates[0]` answers. The deadline is `max(travelTicks + 1, 2)`, never past 720. Free Tide pays by the quoted spend already in the tree. The offer moves the hash from its first event tick. Seed 2718 moves inside the 72-tick fixture, and that move is accepted. Slice 4 is the slice that explains it.
