# Contract refusals

**Status: Open / diagnosis.** The batch 2 pin offers the 56.25 haul and almost nobody takes it. This note records the deciding gate on every refusal, the breaches against the fulfilments, and one measured repair. Nothing here is in the tree. The harness was local and was restored.

Checked on `origin/main` at `dd32e8c` (`dd32e8ca92edcbfe88a274d8b8ebb6a5d0feec76`), the merge of PR #121. Node v24.21.0, ICU 78.3. `npm test` passed, 456 tests, 0 failed. The 72-tick fixture passed, including the golden recovery replay of 600 events on seed 1847 split at tick 47. The fixture hashes are `86507558d49cee305c5f663e1699aacc19d66356ce518d4c32ac1e07085d8687` (8426), `c6268c398c5b8a674a1bef8a675cd74c747392e3fb767a67e1ebd8bc1a4143f6` (8335), and `d62ab7f9c9e840b55c012fb1d8f2fe6929a61359178b4daf7b5eb10cbf7bca95` (8266).

The stack is the pin in [build order](build-order.md), commit `2169bac`. Batch 1 is in the tree. On top of it: offices and the 18 stipend, the 0.05 levy, news slices 2–6 with the 24-tick cap, contracts at 56.25 when `stocks.provisions < 1`, aging as a fixed death at 120, and the landless rate freeze. Seeds 1847, 2718, and 4096, in that order, in one process, 1200 ticks, no player commands. The governor seats sit in a module map and are not cleared between seeds. That is how the pin was run. A headless run reproduced the tick-1200 row: `a8395215c3c71ed5b896c76937861222ed095ec77f05891a512cd366cd5064b1` (164059), `a4ccfe817476ffd2f657917e41fa51447e143a946ec140ba2095b47aae9b9a9e` (158477), and `210a73dc2487f94dc66763af4c891dcd8790966499c28be0fe3c35f1a2202c60` (162522). World Government ends at 16227.45, 8197.81, and 12349.44. Free Tide ends at 16.20, 0.00, and 16.05. Rates are 0.06 / 0.17, 0.04 / 0.18, and 0.09 / 0.07.

A mean is rounded to 3 decimals. A median is the value at linear index `(n − 1) / 2`, interpolated when that index falls between two samples, then rounded to 3 decimals. Seeds below are 1847, 2718, and 4096, in that order. The acceptance function is `assessSupplyContract`. Recomputing its margin and score from the stored factors and the stored cost basis matched every scored decision. Mismatches were 0.

## What the stack offered

Offers are 1253, 896, and 1247. Refusals are 1247, 894, and 1230. Acceptances are 5, 2, and 16. Breaches are 4, 2, and 12. Fulfilments are 1, 0, and 4. One offer is still open at tick 1200 on 1847 and one on 4096. Seed 2718 has none open. The carrier is the lowest id who passes `carrierBlocked`: autonomous, alive, free, docked, and not the attacker. The offer is scored on the next tick. The price is 56.25 for 10 provisions.

| Seed | Offered | Refused | Accepted | Breached | Fulfilled | Open |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1847 | 1253 | 1247 | 5 | 4 | 1 | 1 |
| 2718 | 896 | 894 | 2 | 2 | 0 | 0 |
| 4096 | 1247 | 1230 | 16 | 12 | 4 | 1 |

## The deciding gate

The function decides in this order. A carrier who is traveling, or who has no `locationId`, refuses with gate `travel` and the reason `The carrier is already at sea.` before any score. A docked voyage with `travelTicks > ticksLeft` uses the same gate and `The voyage does not fit the deadline.` The purse gate is next: the hold is short of the quantity, and `money` is below the cost of that shortfall at the provisions price where the carrier stands. The score gate is last. Accept when `score >= threshold`, with `threshold = round(0.54 + ambition * 0.08)`.

Morale, desertion, and office duties are absent from that function. Captivity and an active attack are absent from it too. Those last two are filters on who can be offered, inside `carrierBlocked`, and they are not a later gate.

| Gate | 1847 | 2718 | 4096 |
| --- | ---: | ---: | ---: |
| `score` | 1108 | 690 | 864 |
| `travel`, already at sea | 91 | 143 | 232 |
| `travel`, voyage does not fit | 0 | 0 | 0 |
| `purse` | 48 | 61 | 134 |

Every travel refusal carries the at-sea sentence. The voyage sentence is unused. The offer is made to a docked carrier, and the same tick's decision loop can cast them off before the next morning scores the offer.

## Pay against the required value

Margin is `round(clamp((price − costBasis) / costBasis, −0.25, 0.25))`. The score adds that margin to commerce, trust, respect, grievance, obligation, and perceived risk, then clamps to 0–1. Perceived risk is `round(−caution * risk * 0.16)`. Risk is 0.25 when the carrier already stands at the shelf, or the shelf is neutral, or it is their faction's port. Risk is 0.88 when the haul sails to another faction's port. There is no distance term in the score.

The required value is the lowest cent price that makes that score clear the stored threshold, with the same clamp. On a score refusal the margin is already 0.25, so no higher price changes the score. The required value does not exist for any of them.

| Score refusals | 1847 | 2718 | 4096 |
| --- | ---: | ---: | ---: |
| Margin at 0.25 | 1108 | 690 | 864 |
| Margin under 0.25 | 0 | 0 | 0 |
| Required price exists | 0 | 0 | 0 |
| Required price absent | 1108 | 690 | 864 |

Cost basis on those rows, min / median / max / mean: 9.90 / 45 / 45 / 43.134, 9.90 / 45 / 45 / 43.146, and 9.90 / 45 / 45 / 39.211. Ten units at the empty-shelf price of 4.50 are a cost basis of 45, and 1.25 times 45 is 56.25, which is the payout. The lowest cost basis is 9.90. The payout sits above 1.25 times that figure as well, and the clamp still holds the margin at 0.25.

Score, threshold, and the gap `threshold − score`, same shape:

| | 1847 | 2718 | 4096 |
| --- | --- | --- | --- |
| Score | 0.416 / 0.589 / 0.595 / 0.576 | 0.285 / 0.497 / 0.581 / 0.475 | 0.404 / 0.517 / 0.605 / 0.507 |
| Threshold | 0.574 / 0.596 / 0.616 / 0.596 | 0.582 / 0.582 / 0.611 / 0.592 | 0.583 / 0.594 / 0.616 / 0.594 |
| Gap | 0.001 / 0.007 / 0.158 / 0.020 | 0.001 / 0.085 / 0.314 / 0.117 | 0.001 / 0.076 / 0.190 / 0.087 |

The gap is at most 0.010 on 760, 28, and 79 of the score refusals, and at most 0.025 on 867, 223, and 221. A gap of 0.001 is still unreachable, because the margin cannot rise.

The earliest score refusal on 1847 with that median gap is tick 192. Bram Quill (`character-02`) stands at Glassport, which is the shelf, with 41.6 provisions aboard. Cost basis is 45. Risk is 0.25. Factors are commerce 0.255, margin 0.25, trust 0.049, respect 0.056, grievance 0, obligation 0, perceived risk −0.021. The score is 0.589 against 0.596. He has the grain, he is already there, and the payout is on the cap.

Risk on the score refusals is 0.25 on 1003, 492, and 708 rows, and 0.88 on 105, 198, and 156. Perceived risk, min / median / max / mean: −0.079 / −0.021 / −0.007 / −0.026, −0.112 / −0.032 / −0.010 / −0.044, and −0.092 / −0.012 / −0.011 / −0.027. The foreign-port term is the smaller set. The usual miss is the capped margin plus the other factors, under a threshold near 0.59.

The twenty-three acceptances do have a required price, and each of them is at or under 56.25. The ranges are 53.71–55.33, 50.19–54.30, and 11.76–56.14.

Distance is where the carrier stands, not a price. Docked refusals have a distance, min / median / max / mean, of 0 / 43.829 / 55.082 / 39.989, 0 / 55.082 / 55.082 / 41.610, and 0 / 43.829 / 55.082 / 35.993. Travel ticks on every refusal are 0 / 4 / 5 / 3.456, 0 / 4 / 5 / 3.050, and 0 / 3 / 5 / 2.820.

## Hold, cargo, busy, morale, desertion, office

The purse gate is the cargo check the function actually runs. Shortfall, money, and the shortfall cost, min / median / max / mean:

| | 1847 (48) | 2718 (61) | 4096 (134) |
| --- | --- | --- | --- |
| Shortfall | 0.366 / 10 / 10 / 8.583 | 3.858 / 9.170 / 10 / 8.774 | 2.371 / 8.956 / 10 / 8.648 |
| Money | 0 / 12.695 / 44.98 / 16.329 | 0 / 18.930 / 40.61 / 18.329 | 0 / 8.635 / 43.96 / 11.253 |
| Shortfall cost | 0.90 / 45 / 45 / 38.559 | 17.36 / 41.270 / 45 / 39.483 | 10.67 / 40.300 / 45 / 38.915 |
| Cargo | 0 / 0 / 9.634 / 1.417 | 0 / 0.830 / 6.142 / 1.226 | 0 / 1.044 / 7.629 / 1.352 |

There is no separate hold-capacity gate. The quantity is 10. Cargo already covers 10 on 1175, 651, and 946 of all refusals, and on 1086, 527, and 732 of the score refusals. Those rows fail the score, or they are at sea.

The busy check inside the acceptance function is the at-sea gate above. Captive refusals are 0. Attacker refusals are 0. A carrier who is captive or attacking is not offered.

Every refused carrier's spend role is `member`. A null faction, which is what desertion writes, is 0. A governor seat is held on 37, 50, and 138 refusals. The gate on those rows is still score, travel, or purse: 27 / 8 / 2, 33 / 17 / 0, and 109 / 28 / 1. Morale on all refusals, min / median / max / mean, is 0 / 88.770 / 100 / 81.151, 0 / 93.620 / 100 / 81.197, and 0 / 80.645 / 100 / 72.721. Morale at 0 is 25, 33, and 78. The function does not read it.

The same lowest id is offered whenever he is docked. Score refusals are Bram Quill (`character-02`) on 989, then Niko Wren, Sable Morrow, and Jun Marrow, on 1847. Across every refusal the carriers are Bram Quill 1055, Niko Wren 141, Sable Morrow 45, Jun Marrow 5, and Vale Drake 1 on 1847; Bram Quill 430, Niko Wren 315, Sable Morrow 116, and Jun Marrow 33 on 2718; Niko Wren 501, Bram Quill 454, Sable Morrow 248, Jun Marrow 18, and Iris Stone 9 on 4096. All five acceptances on 1847 are Bram. Both on 2718 are Bram. On 4096 the acceptances are Bram 14, Iris Stone 1, and Toma Reef 1.

## Breaches against the fulfilments

`resolveContractOutcomes` breaches when `world.tick >= deadlineTick`, and it does that before it tests the landing. A landing is the carrier at the destination, not traveling, with cargo of at least the quantity. The carrier is not given an order to sail, and the shortfall is not bought for them. The deadline is `max(travelTicks + 1, 2)` from the offer tick. Scoring spends the next tick. A carrier who is already on the shelf is fulfilled on the scoring tick, while the deadline is still ahead. A carrier who is anywhere else reaches the deadline without a landing.

Every acceptance with `travelTicks` 0 and cargo of at least 10 is fulfilled. Every other acceptance is breached. That split is 1 and 4, 0 and 2, and 4 and 12.

The five fulfilments. Each is the scoring tick, and the deadline is the next tick.

| Seed | Tick | Carrier | Shelf | Cargo |
| ---: | ---: | --- | --- | ---: |
| 1847 | 1047 | Bram Quill | Glassport | 56.088 |
| 4096 | 273 | Bram Quill | Crown Harbor | 33.004 |
| 4096 | 276 | Bram Quill | Crown Harbor | 21.756 |
| 4096 | 311 | Toma Reef | Glassport | 16.480 |
| 4096 | 519 | Bram Quill | Glassport | 22.488 |

The eighteen breaches. "Elsewhere, grain aboard" is still docked at another port with cargo of at least 10. "At sea" is traveling, with remaining ticks still above 0, so the morning breach runs before the landing. "Elsewhere, short" is still docked at another port with cargo under 10.

| | 1847 | 2718 | 4096 |
| --- | ---: | ---: | ---: |
| Elsewhere, grain aboard | 4 | 0 | 5 |
| At sea | 0 | 1 | 7 |
| Elsewhere, short | 0 | 1 | 0 |

The four on 1847 are Bram at Cinder Key, offered Crown Harbor, `travelTicks` 5, cargo still above 10, not traveling, when the deadline fires. He accepted and stayed. The at-sea row on 2718 is the Cinder Key offer accepted at tick 51 from Glassport. At the deadline, tick 53, he is traveling with 2 ticks remaining and 20.448 provisions aboard. The short row is the later Cinder Key offer: he is still at Glassport, cargo 6.845.

## The repair

[Game vision](game-vision.md) says autonomous characters plan from their own motives, and that goods move physically. The score is that motive. The margin cap is what keeps a larger purse from overriding it. The Lead's payout, 56.25, is already on that cap for every score refusal in this stack, so a payout scaled by distance or by the 0.88 risk does not flip those rows. That scaled payout was not given its own world. The required-price count above is the measurement: 1108, 690, and 864 refusals have no price that accepts.

Lowering the threshold would accept a motive the function rejects. The ambition term is part of that motive. It stays.

The smallest change that leaves the price, the threshold, the deadline, and the quantity where they are: offer the lowest id who passes `carrierBlocked` and whom `assessSupplyContract` would accept at 56.25 on the offer tick. If nobody passes, offer nothing. One offer per short shelf, same buyer rule, same deadline. A captain who sails away between the offer and the score can still refuse. The preview uses the same function the next morning uses.

Measured on the same stack, seeds in order, one process.

| Seed | Hash | Events | Offered | Refused | Accepted | Breached | Fulfilled | WG | FT |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1847 | `acde8d6b66b11d2bc8bbb89e2e92acf0aa5a555d8e9f515b74a5479189b79696` | 162137 | 268 | 59 | 208 | 172 | 36 | 13543.34 at 0.07 | 0.00 at 0.17 |
| 2718 | `633868b09e49911fe1bfe5a86a89d7d45e4093773863df6e683ef1c6b91f0a7e` | 159710 | 145 | 26 | 119 | 105 | 13 | 5158.06 at 0.09 | 18.91 at 0.17 |
| 4096 | `9d5cfc389cafd273d5d5bb86ac3180870be9ebb086fa32808585d1671a57843e` | 163464 | 316 | 81 | 235 | 175 | 60 | 12436.65 at 0.09 | 0.00 at 0.16 |

Shelves with a carrier in reach and nobody who would accept are 871, 990, and 889. One offer is still unanswered on 1847. On 2718 every offer has been answered. One of the 119 acceptances is still open at tick 1200. The other 118 are 105 breaches and 13 fulfilments. The refusals that remain are travel 57, 23, and 79, score 1, 3, and 1, and purse 1, 0, and 1. Fulfilments rise from 1, 0, and 4 to 36, 13, and 60. Breaches rise with them. Of the breaches, 77, 47, and 64 are standing on the shelf with cargo under 10: the purse gate let them accept on the strength of a purchase, and nothing buys the grain. At sea are 74, 36, and 81. Elsewhere with the grain are 10, 7, and 19. Elsewhere short are 9, 15, and 10. Standing on the shelf with the grain when the deadline fires, which the morning breach takes before the landing, are 2, 0, and 1.

On 1847 the acceptances are Toma Reef 46, Bram Tern 42, Zara Gale 40, Toma Hale 32, Lio Crow 22, Mina Vale 19, Bram Quill 4, Iris Stone 2, and Sable Morrow 1.

## The alternative

One alternative was measured. The carrier stays the lowest id who passes `carrierBlocked`. The threshold becomes 0.54, and the ambition term is left off. Hard gates stay. A score that was already an acceptance stays one.

| Seed | Hash | Events | Offered | Refused | Accepted | Breached | Fulfilled | WG | FT |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1847 | `bef847975184eaff4840df9a731021a442d53df7ef522a6eac2cf5aea83928e6` | 163726 | 1000 | 938 | 61 | 48 | 13 | 12704.16 at 0.11 | 0.00 at 0.16 |
| 2718 | `f07e9df65797ca3296e4ca7bedb32e4e387d3fe0813d409414324aed0324ee5a` | 158801 | 1019 | 958 | 60 | 45 | 15 | 13002.46 at 0.07 | 2.77 at 0.16 |
| 4096 | `107d721ee2f64588b6655a03f22f82bd46853fbc9ab4b3d437b1c5a86e9d936a` | 163367 | 1354 | 1217 | 136 | 88 | 48 | 10945.10 at 0.06 | 0.00 at 0.17 |

Score refusals that remain unreachable at the cap are 774, 650, and 867. One offer is still open on each seed. Fulfilments are 13, 15, and 48, above the pin and below the eligible walk. The line has dropped a motive, and the offer still spends itself on the lowest id.

## Recommendation

Keep 56.25, keep `round(0.54 + ambition * 0.08)`, and offer the lowest id who would accept. That is the walk measured above. It is the change that asks a captain whose score already clears, which is what [game vision](game-vision.md) requires of a motive, and it is the change that lands 36, 13, and 60 hauls on this pin. A higher payout has no required price on a row whose margin is already 0.25. The flat threshold of 0.54 accepts 61, 60, and 136, fewer than the walk, and it does so by setting ambition aside.

## Lead's ruling: walk skip

The offer walk skips any carrier that cannot do the job from where it stands. A carrier standing on the destination port with less than the quantity aboard (`cargo.provisions < 10`) is not offered the job, and the walk moves on to the next carrier who would accept. Taking a job you cannot possibly do is not a choice the motive rule protects. Sailing elsewhere to buy is deferred. Measured in [contract fulfilment](contract-fulfilment.md#walk-skip) on `feature/batch2` `e2e3d53` / `b7895c0`, not comparable to `d8a222fb`.

## Lead's ruling: own-port extension

The Lead accepted the walk skip and the three harness choices above as recorded (the haul replaces the ordinary action only on a tick when it can buy or sail; no extra landing pass after the character loop; block marks kept per world, not on the contract), and ruled the own-port extension in. The walk additionally skips a carrier whose current port cannot supply its shortfall: the port's `stocks.provisions` below `quantity + provisionDemand × voyage − cargo.provisions`, with the voyage `travelDuration` from that port to the destination. The deadline stays `offerTick + voyage + 1`, with no slack. Measured as (c) in [contract fulfilment](contract-fulfilment.md#own-port-extension).
