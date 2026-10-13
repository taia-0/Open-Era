# Contract fulfilment

**Status: Open / design.** On the [batch 2 contracts pin](build-order.md), a carrier who accepts the 56.25 haul is still left to breach. This note is the follow-up: the carrier buys the provisions it is short of, when the purse allows, and sails to deliver before the deadline. A breach names a real cause. The Lead has ruled the weight and the cancellation, in the section of that name. Nothing here is in the tree. The harness was local and was restored.

Checked after `git fetch origin`. `origin/main` is `b421c70` (`b421c7015227886a5733f19967cf4a9c1fc74083`), the merge of PR #122. Node v24.21.0, ICU 78.3. `npm test` passed, 456 tests, 0 failed. The 72-tick fixture matched: `86507558d49cee305c5f663e1699aacc19d66356ce518d4c32ac1e07085d8687` (8426), `c6268c398c5b8a674a1bef8a675cd74c747392e3fb767a67e1ebd8bc1a4143f6` (8335), `d62ab7f9c9e840b55c012fb1d8f2fe6929a61359178b4daf7b5eb10cbf7bca95` (8266).

The stack is the pin in [build order](build-order.md), commit `2169bac`. Batch 1 is in the tree. On top of it: offices and the 18 stipend, the 0.05 levy, news slices 2–6 with the 24-tick cap, contracts at 56.25 when `stocks.provisions < 1`, aging as a fixed death at 120, and the landless rate freeze. The walk is the batch 2 contracts pin: offer to the lowest id who would already accept, or offer nothing. Seeds 1847, 2718, and 4096, in that order, in one process, 1200 ticks, no player commands. The governor seats sit in a module map and are not cleared between seeds. A headless run of the walk reproduced `acde8d6b66b11d2bc8bbb89e2e92acf0aa5a555d8e9f515b74a5479189b79696` (162137), `633868b09e49911fe1bfe5a86a89d7d45e4093773863df6e683ef1c6b91f0a7e` (159710), and `9d5cfc389cafd273d5d5bb86ac3180870be9ebb086fa32808585d1671a57843e` (163464).

[Game vision](game-vision.md) says the world continues with characters pursuing their own ambitions, and that goods move physically. Autonomous characters plan from their own motives. The simulation validates the action and applies the consequence. The acceptance score stays that motive. This note does not rescore the contract, and it does not change the payout or the threshold.

## Defaults

The payout stays 56.25 for 10 provisions. The threshold stays `round(0.54 + ambition * 0.08)`. The deadline stays `min(720, max(travelTicks + 1, 2))` from the offer tick. The carrier is still chosen by the walk. Flags default off, so a headless run stays on the fixture.

The order is one event on the acceptance tick. The planner keeps the stored score. The haul weight is `round(score * 100, 2)`. A tie goes to the haul, and any other tie stays `localeCompare`. The buy is where the carrier stands. The 16% depth cap does not apply to that buy. There is no detour to another port. The landing is tested before the deadline breach. A hull one tick out, with the grain already aboard, waits for that landing.

The cause order on `contract-breached` is capture, then hazard, then `purse` / `buy`, then `purse` / `passage`, then `choice` / `better-motive`, then `choice` / `hold-full`, then `choice` / `consumed`, then `choice` / `deadline-infeasible`. A hazard is recorded only when one stopped the hull. This tree has no hazard event, so that cause stays unused. An empty shelf is not its own cause. A short carrier standing on it is `choice` / `consumed`. A short carrier who never sailed, and who was not already marked purse, hold, or diverted, is `choice` / `deadline-infeasible`.

The weight of 1000 is the one alternative below. The default leaves it off.

## The order

`assessSupplyContract` still decides the acceptance, on the tick after the offer. When it accepts, the same tick emits `contract-order-issued` after `contract-accepted`. The actor is the carrier. The target is the buyer. The data are `contractId`, the acceptance `score`, the `threshold`, `destinationId`, `quantity`, and `deadlineTick`. The reducer stores `contract.order` as the score, the destination, the quantity, and the deadline. The planner reads that score. It does not call `assessSupplyContract` again.

On this measurement every acceptance issued that order: ordered equals accepted, 273, 110, and 250.

## The buy

Upkeep has already eaten this tick's `provisionDemand`, including a tick at sea. A hold of exactly 10 would land short. The buy target is the quantity, plus `provisionDemand * seaTicks` for the voyage still ahead, minus the cargo already aboard. A carrier who is already at the destination has a ration of 0.

The buy runs in the haul, on the decision tick, before the cast-off. It takes the minimum of the shortfall, the stock where the carrier stands, the spare hold (`40 + sailors * 2`, minus the load), and what `spendableAmount` can pay at `marketPrice`. The 16% depth cap is the ordinary `buy-provisions` gate. It does not apply here. The trade is a `market-trade` with direction `bought`, tax 0, and the quoted spend already in the tree. A failed spend marks the purse blocked.

`purse` / `buy` is marked when the shelf has stock, the hold has spare room, and the purse cannot cover the whole shortfall. A shelf at 0 marks the stock blocked, and that mark has no cause of its own. A hold with no spare marks `choice` / `hold-full`.

## The sail and the landing

The same haul casts off when three checks pass. Cargo covers the quantity plus the sea ration. `travelDuration` fits in `deadlineTick - world.tick`. `quotedPassage` is affordable. The event is `travel-started` to the contract destination, reason `deliver the accepted provisions contract`, with the navigation practice the tree already writes on a cast-off. The passage is the quoted passage. There is no second port on the way.

`resolveContractOutcomes` pays a landing before it reads the deadline. A landing is the carrier at `destinationId`, not traveling, with cargo of at least the quantity. The pay is the fulfilment already in the tree: cargo down by the quantity, the shelf up by the quantity, escrow cleared, and the victory relationship. When the deadline tick finds the carrier one tick out, `remainingTicks === 1`, bound for the destination, with the grain aboard, the breach waits. `progressTravel` then lands the hull, and the docked check pays on that same tick.

A haul is a candidate beside the motives `buildCandidates` already scored. Its weight is the stored acceptance score times 100, rounded to 2 decimals. The list sorts by that weight. The haul wins a tie. If another candidate's score is strictly greater, the haul is marked diverted and the carrier does that other action. A tick that can neither buy nor sail leaves the ordinary choice in place and does not mark a diversion.

## Breach reasons

Each cause is fields on `contract-breached`: `cause`, and `detail` when the cause has one.

| Order | `cause` | `detail` | When |
| --- | --- | --- | --- |
| 1 | `capture` | | The carrier is captive |
| 2 | `hazard` | | A hazard stopped the hull. This tree never sets it |
| 3 | `purse` | `buy` | Short of the quantity, and a buy was blocked by the purse while stock and spare hold allowed one |
| 4 | `purse` | `passage` | The passage was unaffordable |
| 5 | `choice` | `better-motive` | Another candidate's score was strictly greater |
| 6 | `choice` | `hold-full` | Short, and the hold had no spare |
| 7 | `choice` | `consumed` | At the destination, short, and none of the earlier marks |
| 8 | `choice` | `deadline-infeasible` | Anything still open at the deadline |

`choice` / `consumed` covers two facts the classifier does not split. The hold can have been eaten by upkeep after the carrier reached the shelf. The shelf can also have had nothing to sell, which is the `stockBlocked` mark, and that mark is filed here when the carrier is standing on the destination. This run did not count those two apart.

## Measured on the walk

The walk, then the same walk with the haul on. Tick 1200. Seeds in order.

| Seed | Hash | Events | Offered | Accepted | Fulfilled | Breached | WG | FT |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1847 | `926490c5c67d3296e3ad17e24199740ee411972efec960519075d18f55456f09` | 162372 | 338 | 273 | 63 | 210 | 8308.59 at 0.07 | 101.29 at 0.20 |
| 2718 | `f1bcc842902d2f34f89ffdf5037ded3249fa23a0b1492f05510e88e1f76143dc` | 160654 | 143 | 110 | 16 | 94 | 11281.75 at 0.10 | 97.47 at 0.09 |
| 4096 | `0709ed3f6f6cf10da67af79646ee89a079f39d8375373ebc3f4f48f28a3f4b85` | 163183 | 328 | 250 | 87 | 163 | 12120.63 at 0.11 | 0.00 at 0.18 |

The walk without the haul, same process, for the comparison. Hashes `acde8d6b66b11d2bc8bbb89e2e92acf0aa5a555d8e9f515b74a5479189b79696` (162137), `633868b09e49911fe1bfe5a86a89d7d45e4093773863df6e683ef1c6b91f0a7e` (159710), `9d5cfc389cafd273d5d5bb86ac3180870be9ebb086fa32808585d1671a57843e` (163464). Accepted, fulfilled, and breached are 208 / 36 / 172, 119 / 13 / 105, and 235 / 60 / 175. World Government ends at 13543.34, 5158.06, and 12436.65. Free Tide ends at 0.00, 18.91, and 0.00. Rates are 0.07 / 0.17, 0.09 / 0.17, and 0.09 / 0.16.

Every acceptance on the haul is closed: 210 + 63 = 273, 94 + 16 = 110, and 163 + 87 = 250. Refusals are 65, 33, and 78. Offers answered are the whole of 338, 143, and 328. The maximum Free Tide rate during the run is 0.20, 0.09, and 0.19. News events are 640, 447, and 364. On the walk they are 607, 484, and 416.

### Breaches by cause

| Cause | 1847 | 2718 | 4096 |
| --- | ---: | ---: | ---: |
| `capture` | 0 | 0 | 0 |
| `hazard` | 0 | 0 | 0 |
| `purse` / `buy` | 0 | 0 | 0 |
| `purse` / `passage` | 3 | 0 | 0 |
| `choice` / `better-motive` | 47 | 30 | 56 |
| `choice` / `hold-full` | 0 | 0 | 0 |
| `choice` / `consumed` | 105 | 39 | 58 |
| `choice` / `deadline-infeasible` | 55 | 25 | 49 |

The rows sum to the breaches: 210, 94, and 163.

### Secessions and deaths

Deaths match the walk and the stack pin. 1847, tick 1080: Lio Crow (`character-12`), World Government. 2718, tick 180: Lio Crow, World Government; tick 720: Esme Dusk (`character-19`), Free Tide. 4096, tick 540: Kessa Dusk (`character-30`), unaffiliated.

Secessions move. 1847, four, where the walk had five: Mara Calder (`character-21`) at glassport, tick 801, Free Glassport; Bram Tern (`character-22`) at crown-harbor, tick 815, Free Crown Harbor; Dax Pike (`character-20`) at cinder-key, tick 933, Free Cinder Key; Zara Gale (`character-17`) at crown-harbor, tick 1168, Free Crown Harbor II. 2718, none, where the walk had four. 4096, four, where the walk had one: Bram Tern at glassport, tick 289, Free Glassport; Corin Hale (`character-16`) at cinder-key, tick 375, Free Cinder Key; Mara Calder at glassport, tick 384, Free Glassport II; Zara Gale at crown-harbor, tick 409, Free Crown Harbor.

### Prices, shelves, and offers

The board price is `resourcePrice`. Provisions use base 1.8, target stock 180, and the scarcity clamp from 0.55 to 2.5, so the clamps are 4.50 and 0.99. Every measured price is one of those two.

Ending provisions stock, then price. Ports are cinder-key, crown-harbor, glassport, verdant-cay.

| Seed | Walk stock | Walk price | Haul stock | Haul price |
| --- | --- | --- | --- | --- |
| 1847 | 0, 0, 0.629, 1232.566 | 4.50, 4.50, 4.50, 0.99 | 0, 0, 0, 1297.626 | 4.50, 4.50, 4.50, 0.99 |
| 2718 | 0, 0.406, 0, 7240.573 | 4.50, 4.50, 4.50, 0.99 | 0, 0, 0.643, 8547.824 | 4.50, 4.50, 4.50, 0.99 |
| 4096 | 0, 0, 0.813, 10.24 | 4.50, 4.50, 4.50, 4.50 | 0, 0, 0, 526.942 | 4.50, 4.50, 4.50, 0.99 |

The three short ports stay on the scarce clamp. Glassport on 1847 goes from 0.629 to 0. Crown Harbor on 2718 goes from 0.406 to 0. Glassport on 2718 goes from 0 to 0.643. Glassport on 4096 goes from 0.813 to 0. Verdant Cay, the port that already held the surplus, ends higher on every seed: 1232.566 to 1297.626, 7240.573 to 8547.824, and 10.24 to 526.942. That last move is what takes 4096's Verdant Cay price from 4.50 to 0.99.

Shelves under 1 are 1577, 1590, and 1658 on the walk, and 1591, 1499, and 1736 with the haul. Shelves with a carrier in reach and nobody who would accept are 871, 990, and 889 on the walk, and 783, 1177, and 878 with the haul. Offers are 268, 145, and 316 on the walk, and 338, 143, and 328 with the haul. The haul offers more on 1847 and 4096, and two fewer on 2718.

## The alternative

One alternative was measured. The haul is the same buy, the same sail, and the same landing. The planner weight is 1000, so the haul outranks every other motive. The acceptance score is still the carrier's own, and it is still what `assessSupplyContract` required. Only the weight changes.

| Seed | Hash | Events | Offered | Accepted | Fulfilled | Breached | WG | FT |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1847 | `af393e310c9a6f67c16c98eccc4888cdc5e07ced2b24d0ebcb0cab913ba733a5` | 165928 | 334 | 266 | 91 | 175 | 7707.25 at 0.06 | 0.00 at 0.18 |
| 2718 | `ff2e2a312b626ede8187a412927ebf2b350b1fe71deaeeed122747e7b96992e3` | 158523 | 227 | 171 | 55 | 116 | 11334.19 at 0.09 | 80.43 at 0.18 |
| 4096 | `8700ec677c4c2176aa2b612991d4777e27dcbbad9b92d63415dbe68ab7b6cda4` | 163101 | 406 | 323 | 96 | 227 | 4094.70 at 0.02 | 4.62 at 0.17 |

Every acceptance is closed: 175 + 91 = 266, 116 + 55 = 171, and 227 + 96 = 323. Refusals are 68, 56, and 83. The maximum Free Tide rate is 0.18, 0.18, and 0.17. News events are 604, 638, and 624.

| Cause | 1847 | 2718 | 4096 |
| --- | ---: | ---: | ---: |
| `capture` | 0 | 0 | 3 |
| `hazard` | 0 | 0 | 0 |
| `purse` / `buy` | 1 | 0 | 0 |
| `purse` / `passage` | 2 | 0 | 1 |
| `choice` / `better-motive` | 0 | 0 | 0 |
| `choice` / `hold-full` | 0 | 0 | 0 |
| `choice` / `consumed` | 98 | 59 | 104 |
| `choice` / `deadline-infeasible` | 74 | 57 | 119 |

The better-motive row is 0. Consumed and deadline-infeasible are the breaches that remain. `purse` / `buy` is 1, on 1847. Capture is 3, on 4096.

Deaths are the same names and ticks as the haul and the walk. Secessions are four on every seed. 1847: Zara Gale at crown-harbor, tick 442, Free Crown Harbor; Dax Pike at glassport, tick 460, Free Glassport; Corin Hale at crown-harbor, tick 574, Free Crown Harbor II; Mina Vale (`character-15`) at crown-harbor, tick 618, Free Crown Harbor III. 2718: Mina Vale at crown-harbor, tick 915, Free Crown Harbor; Zara Gale at crown-harbor, tick 989, Free Crown Harbor II; Dax Pike at cinder-key, tick 1004, Free Cinder Key; Corin Hale at glassport, tick 1084, Free Glassport. 4096: Corin Hale at glassport, tick 801, Free Glassport; Zara Gale at cinder-key, tick 906, Free Cinder Key; Finn Frost (`character-18`) at glassport, tick 910, Free Glassport II; Bram Tern at glassport, tick 1029, Free Glassport III.

Ending stock, then price, same port order. 1847: 0, 0, 0, 4267.806 at 4.50, 4.50, 4.50, 0.99. 2718: 0, 0, 0, 6535.623 at 4.50, 4.50, 4.50, 0.99. 4096: 0, 0, 0, 721.015 at 4.50, 4.50, 4.50, 0.99. The short ports are empty. Verdant Cay stays on the abundant clamp. Shelves under 1 are 1563, 1608, and 1776. Nobody who would accept: 684, 812, and 785. Offers are 334, 227, and 406, above the walk on every seed.

## Recommendation

Build the haul on the batch 2 contracts pin. Keep 56.25, keep `round(0.54 + ambition * 0.08)`, and keep the walk's choice of carrier. When the carrier accepts, issue `contract-order-issued` with that carrier's own score, buy the shortfall where they stand without the depth cap, and sail on the same tick when the grain, the deadline, and the passage allow it. Pay the landing before the deadline breach. Write the cause in the order above.

Fulfilments rise from 36, 13, and 60 to 63, 16, and 87. The breaches that remain are the carrier's choice and the two purse rows on 1847: 47, 30, and 56 took a better motive, 105, 39, and 58 are the consumed row, and 55, 25, and 49 missed the deadline. A purse too short to buy is 0. Capture is 0. Hazard is 0. The short ports stay at 4.50. The offer count moves with the voyages: 338, 143, and 328, against 268, 145, and 316 on the walk.

Leave the weight at `round(score * 100, 2)`. The 1000 weight does raise fulfilments to 91, 55, and 96, and it clears the better-motive row. Consumed and deadline-infeasible still make up the breaches, and the world moves with the override: World Government on 4096 ends at 4094.70 with the rate at 0.02, and offers rise to 334, 227, and 406. [Game vision](game-vision.md) keeps the plan on the carrier's own motive. The score that accepted the haul is that motive.

The Lead's ruling is the next section. It keeps this weight. A shelf that has been refilled cancels the haul, and `choice` / `consumed` is not the cause on that build.

## Lead's ruling

Checked after `git fetch origin`. `origin/main` is `57bbb54` (`57bbb54f8b6ad253399b4e60a1d891b586643063`), the merge of PR #124. Node v24.21.0, ICU 78.3. `npm test` passed, 459 tests, 0 failed. The 72-tick fixture matched: `86507558d49cee305c5f663e1699aacc19d66356ce518d4c32ac1e07085d8687` (8426), `c6268c398c5b8a674a1bef8a675cd74c747392e3fb767a67e1ebd8bc1a4143f6` (8335), `d62ab7f9c9e840b55c012fb1d8f2fe6929a61359178b4daf7b5eb10cbf7bca95` (8266). The harness was local and was restored. Seeds 1847, 2718, and 4096, in that order, in one process, 1200 ticks, no player commands. The governor seats sit in a module map and are not cleared between seeds.

Three rulings.

The haul builds with weight = score, as `round(score * 100, 2)`. A tie goes to the haul. The 1000 weight stays the alternative measured above. It does not build.

`choice` / `consumed` becomes a cancellation. If the destination shelf is refilled before landing, `stocks.provisions >= 1`, the contract is cancelled. That test is the inverse of the offer gate. There is no breach, no loyalty hit, and no reputation hit. There is no payout. The carrier keeps any cargo it bought. The event is `contract-cancelled` with reason `no-longer-needed`. The escrow returns to the buyer. A shelf that is still empty does not cancel. A short carrier standing on it, once this cause is gone, is `choice` / `deadline-infeasible`.

`choice` / `deadline-infeasible` stays a breach.

[Game vision](game-vision.md) keeps the plan on the carrier's own motive, and goods move physically. The score that accepted the haul is that motive. The cancellation is the shelf the buyer no longer needs, applied before the landing pay.

The same harness remeasured the batch 2 stack, the walk, and the haul without cancellation, and each matched the table already in this note and in [build order](build-order.md). The stack at tick 1200 is `a8395215c3c71ed5b896c76937861222ed095ec77f05891a512cd366cd5064b1` (164059, World Government 16227.45 at 0.06, Free Tide 16.20 at 0.17), `a4ccfe817476ffd2f657917e41fa51447e143a946ec140ba2095b47aae9b9a9e` (158477, 8197.81 at 0.04, Free Tide 0.00 at 0.18), and `210a73dc2487f94dc66763af4c891dcd8790966499c28be0fe3c35f1a2202c60` (162522, 12349.44 at 0.09, Free Tide 16.05 at 0.07). The walk is `acde8d6b`, `633868b0`, and `9d5cfc38`. The haul without cancellation is `926490c5`, `f1bcc842`, and `0709ed3f`. The run below is that haul with the cancellation on.

### Tick 1200, haul with cancellation

| Seed | Hash | Events | Offered | Accepted | Fulfilled | Breached | Cancelled | WG | FT |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1847 | `f92a0d8b315d6d81164610e002ad7946d9c84a4aa5c0d8a96740e178e32d7cb1` | 162785 | 487 | 379 | 36 | 101 | 242 | 13673.38 at 0.06 | 462.70 at 0.10 |
| 2718 | `bb69fdfaab4172fdd5ba7bfed1735c41a417c999c506b72427fa6a59a57d3adf` | 157325 | 272 | 219 | 28 | 53 | 138 | 6045.56 at 0.08 | 0.00 at 0.19 |
| 4096 | `f6adf11f72518d4af49c645fb46513af24f5e0d98875a4702b6843d879db8965` | 165672 | 633 | 477 | 86 | 113 | 278 | 6195.28 at 0.08 | 0.00 at 0.17 |

Every acceptance issued an order: ordered equals accepted, 379, 219, and 477. Every acceptance is closed: 36 + 101 + 242 = 379, 28 + 53 + 138 = 219, and 86 + 113 + 278 = 477. Refusals are 108, 53, and 155. Offers answered are the whole of 487 and 272. On 4096, 155 + 477 = 632, and one of the 633 offers is still unanswered. The maximum Free Tide rate is 0.15, 0.19, and 0.17. News events are 601, 552, and 503.

Against the haul without cancellation, World Government on 1847 rises from 8308.59 to 13673.38. On 2718 it falls from 11281.75 to 6045.56. On 4096 it falls from 12120.63 to 6195.28. Against the walk, 1847 ends 130.04 higher (13543.34 to 13673.38), 2718 ends 887.50 higher (5158.06 to 6045.56), and 4096 ends 6241.37 lower (12436.65 to 6195.28). Fulfilments are 36, 28, and 86, against 63, 16, and 87 on the haul and 36, 13, and 60 on the walk. The consumed row is gone.

#### Breaches by cause

| Cause | 1847 | 2718 | 4096 |
| --- | ---: | ---: | ---: |
| `capture` | 0 | 0 | 0 |
| `hazard` | 0 | 0 | 0 |
| `purse` / `buy` | 0 | 0 | 0 |
| `purse` / `passage` | 0 | 1 | 0 |
| `choice` / `better-motive` | 22 | 11 | 39 |
| `choice` / `hold-full` | 0 | 0 | 0 |
| `choice` / `consumed` | 0 | 0 | 0 |
| `choice` / `deadline-infeasible` | 79 | 41 | 74 |

The rows sum to the breaches: 101, 53, and 113. On the haul without cancellation the consumed row was 105, 39, and 58, and deadline-infeasible was 55, 25, and 49. The 242, 138, and 278 cancellations are not those consumed rows replayed. The world forks at the first cancellation, on 1847 at tick 164, so the later breaches are the new campaign. An empty shelf still breaches, and that breach is now deadline-infeasible.

#### Secessions and deaths

Deaths match the walk, the haul, and the stack pin. 1847, tick 1080: Lio Crow (`character-12`), World Government. 2718, tick 180: Lio Crow, World Government; tick 720: Esme Dusk (`character-19`), Free Tide. 4096, tick 540: Kessa Dusk (`character-30`), unaffiliated.

Secessions. 1847, none, where the walk had five and the haul had four. 2718, four, where the haul had none: Zara Gale (`character-17`) at crown-harbor, tick 671, Free Crown Harbor; Corin Hale (`character-16`) at glassport, tick 691, Free Glassport; Dax Pike (`character-20`) at cinder-key, tick 753, Free Cinder Key; Mara Calder (`character-21`) at crown-harbor, tick 761, Free Crown Harbor II. 4096, two, where the haul had four and the walk had one: Corin Hale at cinder-key, tick 1024, Free Cinder Key; Zara Gale at crown-harbor, tick 1038, Free Crown Harbor.

#### Shelves and offers

Ending provisions stock, then price. Ports are cinder-key, crown-harbor, glassport, verdant-cay. 1847: 0, 0, 0, 1656.958 at 4.50, 4.50, 4.50, 0.99. 2718: 0, 0, 0.687, 1956.293 at 4.50, 4.50, 4.50, 0.99. 4096: 0, 0, 0.704, 848.616 at 4.50, 4.50, 4.50, 0.99. The three short ports stay on the scarce clamp. Verdant Cay stays on 0.99, and it ends higher than the haul on 1847 and 4096 (1297.626 to 1656.958, and 526.942 to 848.616) and lower on 2718 (8547.824 to 1956.293).

Shelves under 1 are 1559, 1739, and 1731. Shelves with a carrier in reach and nobody who would accept are 629, 946, and 471. Offers are 487, 272, and 633, above both the walk (268, 145, 316) and the haul (338, 143, 328) on every seed.

### World Government on 1847

The walk ends at 13543.34. The haul without cancellation ends at 8308.59. The drop is 5234.75. The haul with cancellation ends at 13673.38, which is 130.04 above the walk and 5364.79 above the haul. Cancellation changes the picture. The drop does not survive. The books close on every run: opening treasury 18000 plus the lines below equals the ending treasury. The levy line is the 0.05 slice inside the work tax and the sale tax. It is already inside those two credits.

| Line | Walk | Haul | Cancel |
| --- | ---: | ---: | ---: |
| Work tax in | 10388.24 | 8088.12 | 9214.76 |
| Sale tax in | 21929.62 | 18257.96 | 19981.30 |
| Purchases out | −15874.35 | −15956.03 | −14264.05 |
| Levy inside the two taxes | 10563.48 | 8261.91 | 9352.42 |
| Stipends out | −6552.00 | −5580.00 | −6714.00 |
| Recruitment out | −8960.96 | −7938.73 | −7812.00 |
| Passage out | −6481.49 | −7229.80 | −6207.34 |
| Contract escrow out | −2032.40 | −1921.44 | −3141.15 |
| Breach refund in | 1357.80 | 1068.24 | 722.88 |
| Refusal refund in | 451.90 | 344.61 | 799.88 |
| Cancellation refund in | 0.00 | 0.00 | 1363.39 |
| Ransom in | 761.76 | 788.99 | 234.67 |
| Wage collector in | 555.22 | 386.67 | 1495.04 |
| Ending treasury | 13543.34 | 8308.59 | 13673.38 |

Work tax is `worked`. Sale tax is `market-trade` credited to the treasury. Purchases are `market-trade` drawn from it. Passage is `character-upkeep`: allowance first, then the purse, and the free holder draws the treasury. Recruitment is the same draw on `recruited`. The stipend is silent in the event log. The wage collector is `debt-repaid`. A fulfilment pays the carrier's purse from escrow and does not move this treasury: `contract-fulfilled` is absent from the lines, on all three runs. Desertion sets `factionId` null and is absent from the lines. A capture reaches the treasury when the ransom is credited, which is `captivity-released`.

The haul's contract coins are a small part of the drop. Escrow out, breach refunds, and refusal refunds net to −222.70 on the walk, −508.59 on the haul, and −255.00 with cancellation. The haul is 285.89 worse than the walk on those coins. Purchases are 81.68 worse (−15956.03 against −15874.35). The drop is the tax. Sale tax falls by 3671.66 (21929.62 to 18257.96). Work tax falls by 2300.12 (10388.24 to 8088.12). Together that is 5971.78. The levy inside them falls by 2301.57 (10563.48 to 8261.91), which is 2301.57 of that 5971.78 and is not a second loss. Offsets on the haul are less recruitment (1022.23), less stipend (972.00), and a slightly smaller escrow posting (110.96). Passage is 748.31 heavier. The wage collector is 168.55 lighter. Those lines, with the tax, sum to the 5234.75 drop.

Port-ticks World Government holds, out of 1200. Verdant Cay is neutral for all 1200 ticks on every run.

| Port | Walk | Haul | Cancel |
| --- | ---: | ---: | ---: |
| crown-harbor | 1139 | 1043 | 878 |
| cinder-key | 208 | 579 | 731 |
| glassport | 838 | 307 | 653 |
| All three | 127 | 62 | 171 |
| None | 9 | 55 | 0 |

Glassport is the dock the haul loses: 838 ticks against 307. The haul also spends 55 ticks holding none of the three, where the walk spends 9 and the cancellation spends 0. With cancellation, 1847 has no secession, and the faction holds all three ports on 171 ticks.

Treasury samples, World Government, seed 1847.

| Tick | Walk | Haul | Cancel |
| ---: | ---: | ---: | ---: |
| 120 | 17994.46 | 17994.46 | 17994.46 |
| 240 | 16494.66 | 16460.62 | 16395.64 |
| 360 | 17438.38 | 17457.10 | 17745.95 |
| 480 | 18781.59 | 17324.85 | 19707.63 |
| 600 | 19511.26 | 16026.55 | 18791.12 |
| 720 | 18996.37 | 15845.85 | 18374.32 |
| 840 | 17919.76 | 14645.60 | 16798.84 |
| 960 | 16547.63 | 12348.97 | 15265.91 |
| 1080 | 14710.30 | 9883.90 | 14204.36 |
| 1200 | 13543.34 | 8308.59 | 13673.38 |

The streams match at tick 120. At tick 240 the haul is 34.04 behind. At tick 360 the haul is 18.72 ahead. The gap opens from 360 to 480: the walk rises to 18781.59 and the haul falls to 17324.85. It keeps widening. Both runs end at rate 0.07. The cancellation ends at 0.06, stepped at ticks 73, 313, 481, 577, 673, 793, 865, and 961.

The first event difference between the walk and the haul is sequence 19089, tick 161. The streams are identical through sequence 19088, which is `contract-accepted`, actor Iris Stone (`character-06`), target Bram Quill (`character-02`). The walk's next event is `character-upkeep` for `character-01`. The haul inserts `contract-order-issued` for the same pair. Port holdings still match through the snapshot taken after tick 307. The haul's secessions start at tick 801, after the treasury gap is already open. The early loss of the dock is a claim: Finn Frost (`character-18`) takes glassport from World Government at tick 476 (`settlement-claimed`). The walk has no claim on that tick, and it keeps glassport until the secession at tick 591. Toma Reef (`character-07`) takes glassport back from Free Tide at tick 600. From 476 to 600 the haul is collecting Free Tide's sale tax and work tax on that dock, and the sample gap is the same window.

The first event difference between the haul and the cancellation is sequence 19448, tick 164. The streams are identical through sequence 19447. The haul's next event is `character-upkeep` for `character-01`. The cancellation emits `contract-cancelled`, actor Iris Stone, target Bram Quill, reason `no-longer-needed`. That is the order from tick 161. Three ticks later the destination shelf is already at or above 1, so the first delivery is cancelled and the campaigns fork. The 105 consumed breaches on the haul are not a map onto the 242 cancellations.

Nothing in the 1847 drop is an accounting bug. The fulfilment payout never touches the World Government treasury, and the escrow, the refunds, the levy, and the taxes each land on the line the tree already writes. The haul earns less because the carriers sail and the ports change hands. Cancellation takes the loyalty hit and the payout off a shelf that has been refilled, and on this seed World Government ends at 13673.38 with no secession.
