# Contract fulfilment

**Status: Open / design.** On the [batch 2 contracts pin](build-order.md), a carrier who accepts the 56.25 haul is still left to breach. This note is the follow-up: the carrier buys the provisions it is short of, when the purse allows, and sails to deliver before the deadline. A breach names a real cause. Nothing here is in the tree. The harness was local and was restored.

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
