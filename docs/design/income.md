# Income

**Status: Open / design brief.** Nothing in this note is in the tree. The census is a local readout of the baseline tape. Each lever was applied by a local harness, measured alone, and restored.

Checked on `origin/main` at `33e668fb4734c758751ab41c6af19e84e6df408f` (PR #112). Node v24.21.0, ICU 78.3. `npm test` passed, 432 tests. The 72-tick fixture passed, including the golden recovery replay of 600 events on seed 1847 split at tick 47. A headless run reproduced the fixture and the 1200-tick baseline:

| Seed | Tick 72 state hash | Events | Tick 1200 state hash | Events |
| --- | --- | ---: | --- | ---: |
| 1847 | `4ea893a485b05ce6eab599919765903ade9a0ce45f383437f4698064faa7a297` | 8413 | `acf1b2c25f0f55c3b308177ec621180a515897849bf1ee9ba5aa5bca3b0852c9` | 164732 |
| 2718 | `d376ad02c6e7c9b03dd0eb4db1c3c137ac7a00d61a096673e12ae4fdabbdfef2` | 8456 | `47c65e2fd676bfd420a36ee4bf13d871d6b474dfd27b6106a3319724f6e75ec9` | 162127 |
| 4096 | `ac780b3999c3da53f38c0cd16301dfa7f60562a35796f5fa0451c969c9ed08de` | 8261 | `a0ac2cc419d640660cf34c20acb3a0cb42449fef6f13e4eadb4caaaf9d255a1f` | 159900 |

Runs are `createPrototypeWorld` plus `runTick`, no player commands. Seeds 1847, 2718, and 4096. A figure at tick 0 is the world before any `runTick`. A figure at tick 72 or tick 1200 is the world after that many calls. Tick numbers on events are the `tick` field. State samples below are tick 0 through tick 1200, 1201 states. The stipend mornings are tick 0, 6, …, 1194, two hundred of them. The state at tick 1200 is not billed. Seeds below are 1847, 2718, and 4096, in that order. Coins are exact cents.

[Game vision](game-vision.md) says a faction that becomes overwhelmingly powerful may remain dominant. The simulation does not manufacture a rebellion or move one treasury into another to restore balance. [Fleet](fleet.md) leaves hulls, wages, and repair until income can carry them. [Offices](offices.md) pays a governor 18 from headroom, and the roster addendum keeps three posts. [Treasury balance](treasury-balance.md) is the mate cap, `min(18, treasury / free mates)`. The holder is uncapped. [Leader tax](leader-tax.md) is the autonomous step. [Secession](secession.md) is the gate that step can open. [Contracts](contracts.md) are a player order on this tree. A headless run offers none.

## Summary

Free Tide's fleet, offices, and stipends stall because the treasury runs dry. The first short state is tick 113, 377, and 109. The treasury ends at 0, 666.09, and 0. Short mornings are 77, 88, and 113. States at or below 0 are 570, 150, and 713. World Government ends at 5501.03, 6885.06, and 3608.30, and it is never short.

Today the treasury earns work tax, sale tax, and ransom. Passage of 3 a sea tick is sunk. Contract events on this tape are 0. Pax Ash draws Free Tide without a cap, 256, 420, and 206 times, 7015.89, 6899.28, and 5184.07 coins. That draw is passage, buys, and recruits.

The measured repair is a levy of 0.05 on work gross and sale gross, taken from the worker or the seller, and only while a governor is seated at the start of the tick. It is one lever, alone. World Government's short count stays 0, and it ends at 15416.78, 16911.49, and 15642.65. Free Tide collects 3718.63, 7649.02, and 6205.68, which is more than one stipend of 18 across 200 mornings (3600). Headroom covers that 18 on 120, 197, and 118 mornings, and on 57 of 136, 196 of 199, and 109 of 183 mornings while Free Tide holds a port. Pax still draws the new coins. Free Tide ends at 0, 1407.46, and 37.19. Seed 2718 stays at tax 0.08 and declares nobody. Seeds 1847 and 4096 still climb through 0.15, and the wide gate stays open. The 72-tick fixture moves. The seat is not stored.

A sale tariff of 0.05 is the closest other single lever. Port dues, a buy duty, and a credit of passage fatten World Government and leave Free Tide near 0. A contract fee collects 0.

## 1. What the treasury earns today

`tradeTax` is `round(gross * taxRate, 2)` for the faction that holds the settlement. A `worked` event stores that tax. A `market-trade` with direction `sold` stores the same tax. A buy stores tax 0. The opening rates are World Government 0.14 on 18000 and Free Tide 0.08 on 2800. A breakaway is founded at 0 with `SECESSION_FOUNDING_TAX_RATE` 0.08, and it has no command holder, so it does not step the rate.

A `captivity-released` ransom credits `treasuryShare` to `treasuryFactionId`. A faction captor receives the whole ransom.

`PASSAGE_COST_PER_TICK` is 3. The sea tick charges allowance first, then the purse, and the coins leave the world. A supply contract is a player command. This tape emits no `contract-` event.

The autonomous tax step runs when the free holder is in seat, on a cooldown of 24. Pressed, the lowest held-port stability in thousandths at or under 55, steps the rate down by 0.01. Short, and not pressed, steps it up by 0.01. Short means free mates exist and the treasury cannot pay each of them 18. The rate stops at 0 and at 0.30. `taxDrift` is the stability drag once the rate is above 0.15.

`autonomousSecessionReady` wants an autonomous owner who is not the command holder, a holding rate above 0.15, and stability at or below 55. The wide gate in the tables is the weaker count: a held port, rate above 0.15, stability at or below 55. Ready is the walker itself, counted on the state sample.

The books close. For every faction, on every seed, on every lever, `start + work + sale + ransom + due + duty + passage + fee − draw` equals the ending treasury. Refunds are 0. A tariff and a levy sit inside the work tax and the sale tax, so they are not added again.

## 2. The census

World Government opens at 18000. Free Tide opens at 2800.

|  | Work tax | Sale tax | Ransom | Draw | Draws | End | End rate | End ports |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| World Government | 4618.70 / 5142.30 / 5404.61 | 11664.42 / 12314.97 / 10695.35 | 512.78 / 649.19 / 1263.68 | 29294.87 / 29221.40 / 31755.34 | 4118 / 4356 / 4487 | 5501.03 / 6885.06 / 3608.30 | 0.07 / 0.11 / 0.00 | Cinder Key / Glassport / Crown Harbor |
| Free Tide | 3863.77 / 6107.16 / 2845.41 | 4791.37 / 7266.37 / 3636.32 | 0.00 / 297.52 / 0.00 | 11455.14 / 15804.96 / 9281.73 | 1207 / 1609 / 907 | 0.00 / 666.09 / 0.00 | 0.20 / 0.19 / 0.30 | none / none / none |

Free Tide's income, work plus sale plus ransom, is 8655.14, 13671.05, and 6481.73. The draw takes the opening 2800 as well. `tax-rate-set` counts are World Government 7, 3, and 14, and Free Tide 14, 27, and 22.

|  | First short state | Short states | First short morning | Short mornings | First zero | Zero states | Stipend mornings | While holding a port | Minimum |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| World Government | — | 0 | — | 0 | — | 0 | 200 | 186 / 186, 177 / 177, 190 / 190 | 5501.03 / 6866.55 / 3608.30 |
| Free Tide | 113 / 377 / 109 | 484 / 542 / 692 | 114 / 378 / 120 | 77 / 88 / 113 | 117 / 734 / 488 | 570 / 150 / 713 | 37 / 103 / 34 | 34 / 81, 90 / 152, 31 / 68 | 0 |

A short state is free mates above 0 and treasury under `mates × 18`. A stipend morning is a morning whose headroom, treasury minus that obligation, still covers one more 18. That is the one-governor test in this note. The offices bill, which pays only when the day covers every held seat, is a different test. The first short mornings match [fleet](fleet.md). The zero states and the short mornings match the offices addendum.

Draws with no `allowanceRemaining` are the holder's. On this tape those actors are Pax Ash (`character-14`) and Mara Vane (`character-01`).

|  | Draws | Coins | Passage | Buys | Recruit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pax Ash | 256 / 420 / 206 | 7015.89 / 6899.28 / 5184.07 | 438.00 / 936.00 / 396.00 | 1225.89 / 1559.28 / 468.07 | 5352.00 / 4404.00 / 4320.00 |
| Mara Vane | 4 / 4 / 5 | 12.00 / 12.00 / 15.00 | 12.00 / 12.00 / 15.00 | 0 | 0 |
| Free Tide mates | 951 / 1189 / 701 | 4439.25 / 8905.68 / 4097.66 | 1671.17 / 1905.75 / 1188.20 | 1440.57 / 3662.21 / 1730.98 | 1327.51 / 3337.72 / 1178.48 |
| World Government mates | 4114 / 4352 / 4482 | 29282.87 / 29209.40 / 31740.34 | 5613.03 / 6797.89 / 6458.19 | 15385.25 / 13299.88 / 15926.86 | 8284.59 / 9111.63 / 9355.29 |

Pax plus Mara is 260, 424, and 211 draws, 7027.89, 6911.28, and 5199.07 coins, the holder line in the offices addendum. Mara's share is passage. The mate counts are the faction draw counts minus the holder.

Breakaways open at 0 and stay at 0.08. Group sums are work 2715.91 / 1786.70 / 2716.92, sale 6349.23 / 3921.03 / 7392.26, ransom 1044.09 / 253.85 / 236.03, draw 5863.10 / 4010.16 / 7889.74, end 4246.13 / 1951.42 / 2455.47.

| Seed | Faction | Work | Sale | Ransom | Draw | End | End ports |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1847 | Free Glassport | 505.50 | 1637.50 | 562.94 | 1358.13 | 1347.81 | Crown Harbor |
| 1847 | Free Crown Harbor | 1038.67 | 1877.54 | 479.97 | 1689.56 | 1706.62 | Glassport |
| 1847 | Free Crown Harbor III | 150.35 | 647.96 | 0.00 | 798.31 | 0.00 | none |
| 1847 | Free Glassport II | 383.01 | 667.60 | 0.00 | 334.29 | 716.32 | none |
| 1847 | Free Cinder Key | 179.79 | 522.15 | 1.18 | 478.01 | 225.11 | none |
| 1847 | Free Crown Harbor II | 458.59 | 996.48 | 0.00 | 1204.80 | 250.27 | none |
| 2718 | Free Crown Harbor | 340.23 | 1208.03 | 253.85 | 1220.76 | 581.35 | none |
| 2718 | Free Cinder Key | 427.91 | 284.38 | 0.00 | 290.13 | 422.16 | Cinder Key |
| 2718 | Free Cinder Key II | 446.36 | 453.91 | 0.00 | 900.27 | 0.00 | none |
| 2718 | Free Cinder Key III | 188.93 | 234.47 | 0.00 | 324.00 | 99.40 | none |
| 2718 | Free Glassport | 383.27 | 1740.24 | 0.00 | 1275.00 | 848.51 | Crown Harbor |
| 4096 | Free Glassport II | 320.69 | 237.51 | 0.00 | 369.86 | 188.34 | Cinder Key |
| 4096 | Free Glassport | 1438.71 | 3044.94 | 219.21 | 4702.34 | 0.52 | none |
| 4096 | Free Crown Harbor II | 216.33 | 898.26 | 0.00 | 859.58 | 255.01 | Glassport |
| 4096 | Free Crown Harbor | 741.19 | 3211.55 | 16.82 | 1957.96 | 2011.60 | none |

Secessions are 6, 5, and 4, first event ticks 438, 705, and 400. The wide gate is 45, 170, and 5 port-ticks, and ready is 6, 5, and 4, one ready sample for each declaration. Low-stability port-ticks, stability at or below 55, are 337, 314, and 796. Ending stability, Crown Harbor, Verdant Cay, Cinder Key, Glassport: 55.60 / 100 / 58.33 / 56.17, 55.18 / 100 / 56.47 / 55.57, and 55.30 / 100 / 56.82 / 55.60.

## 3. The levers

Each lever runs from the baseline. None is stacked on another. The tax step and the secession walker stay as they are. World Government's short count is 0 on every row below, and its stipend mornings stay 200.

A port due is charged on a morning, `tick % 6 === 0` before the tick, from a character who is docked: a `locationId`, no travel, no captivity. The purse pays `min(rate, purse)`, in cents. The port's faction receives it. A neutral port collects nothing. The rates are 1 and 3.

A sale tariff is 0.02 or 0.05 of the sell gross, taken from the seller and added to the sale tax. Buys are unchanged.

A governor levy is 0.02 or 0.05 of the work gross and of the sell gross, taken from the worker or the seller, while a seat is filled at the start of the tick. The seat is the offices rule, read beside the run and not stored: the free holder appoints, the seat sticks until the faction changes, the governor leaves the faction, or the governor becomes the holder, captivity does not clear it, and a breakaway appoints nobody. The credit follows the settlement's faction at the moment of the work or the sale. Opening seats, read at state tick 1 from the seat filled at tick 0, are the offices table: Crown Harbor, Cinder Key, and Glassport are Jun Marrow, Esme Dusk, and Lio Crow; Ada Sorn, Esme Dusk, and Vale Drake; Orin Rill, Esme Dusk, and Lio Crow. Verdant Cay is empty. Filled seat-states across the 1201 samples are 2250, 3050, and 2055 at 0.02, and 2595, 3336, and 3031 at 0.05. Breakaway seat-states at the start of a tick are 0.

A buy duty is 0.05, or the port's live tax rate. The quantity is capped with the inflated unit price. The duty is added to the treasury after the event, because the event stores the treasury absolute.

A passage share credits 0.5 or 1 of the coins already charged on that sea tick to the destination's faction. The traveler is not charged again.

A contract fee is 0.05 or 0.10 of the contract price, taken from the carrier's payout and credited to the destination's faction when that destination has a faction.

## 4. What each lever does alone

| Lever | World Government end | Free Tide end | First short | Short states | First zero | Zero states | Stipend mornings | While holding | Secessions | Wide gate / ready | End rate, WG / FT |
| --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- |
| Baseline | 5501.03 / 6885.06 / 3608.30 | 0.00 / 666.09 / 0.00 | 113 / 377 / 109 | 484 / 542 / 692 | 117 / 734 / 488 | 570 / 150 / 713 | 37 / 103 / 34 | 34/81, 90/152, 31/68 | 6 / 5 / 4 | 45/6, 170/5, 5/4 | 0.07/0.20, 0.11/0.19, 0.00/0.30 |
| Due 1 | 7051.51 / 11006.78 / 5036.82 | 1.13 / 0.00 / 0.00 | 163 / 624 / 94 | 600 / 545 / 560 | 200 / 773 / 254 | 42 / 214 / 95 | 97 / 107 / 86 | 80/149, 103/142, 81/163 | 4 / 5 / 7 | 253/4, 16/5, 219/7 | 0.09/0.15, 0.13/0.30, 0.13/0.16 |
| Due 3 | 10909.34 / 10510.78 / 13092.75 | 0.12 / 0.00 / 8.09 | 134 / 223 / 110 | 440 / 597 / 632 | 159 / 871 / 488 | 149 / 330 / 48 | 56 / 96 / 77 | 41/90, 73/116, 66/169 | 5 / 5 / 5 | 32/5, 6/5, 121/5 | 0.11/0.22, 0.11/0.30, 0.11/0.18 |
| Tariff 0.02 | 8358.22 / 9060.33 / 7687.86 | 0.00 / 0.00 / 0.00 | 107 / 185 / 94 | 445 / 771 / 471 | 156 / 597 / 118 | 687 / 145 / 248 | 44 / 65 / 68 | 40/73, 51/127, 55/134 | 5 / 5 / 4 | 9/5, 108/5, 76/4 | 0.13/0.27, 0.13/0.25, 0.14/0.16 |
| Tariff 0.05 | 13325.25 / 16142.31 / 5657.81 | 0.00 / 1346.23 / 81.86 | 148 / 245 / 86 | 671 / 318 / 513 | 159 / 1006 / 273 | 142 / 6 / 134 | 88 / 144 / 92 | 70/135, 143/199, 64/129 | 4 / 0 / 5 | 149/4, 0/0, 165/5 | 0.11/0.17, 0.14/0.13, 0.13/0.11 |
| Levy 0.02 | 12876.14 / 15358.36 / 11096.94 | 0.00 / 32.68 / 3.19 | 121 / 358 / 91 | 433 / 491 / 535 | 412 / 599 / 173 | 651 / 26 / 104 | 55 / 113 / 75 | 55/90, 98/176, 49/124 | 5 / 5 / 6 | 6/5, 108/5, 150/7 | 0.11/0.25, 0.14/0.18, 0.12/0.16 |
| Levy 0.05 | 15416.78 / 16911.49 / 15642.65 | 0.00 / 1407.46 / 37.19 | 98 / 177 / 105 | 466 / 21 / 464 | 143 / 183 / 152 | 20 / 2 / 10 | 120 / 197 / 118 | 57/136, 196/199, 109/183 | 6 / 0 / 3 | 71/6, 0/0, 138/3 | 0.10/0.19, 0.11/0.08, 0.12/0.17 |
| Duty 0.05 | 12370.57 / 8123.89 / 8456.94 | 327.01 / 0.00 / 0.00 | 125 / 154 / 146 | 468 / 374 / 565 | 841 / 595 / 213 | 80 / 606 / 50 | 92 / 44 / 98 | 67/134, 44/87, 56/128 | 5 / 6 / 3 | 94/5, 9/6, 267/3 | 0.12/0.15, 0.14/0.20, 0.14/0.18 |
| Duty, live rate | 11754.35 / 18095.45 / 12785.37 | 0.00 / 9.20 / 85.21 | 101 / 255 / 83 | 938 / 653 / 290 | 170 / 696 / 545 | 335 / 84 / 12 | 37 / 86 / 95 | 35/102, 85/149, 62/117 | 4 / 6 / 4 | 156/4, 67/5, 68/4 | 0.14/0.30, 0.13/0.24, 0.13/0.17 |
| Passage 0.5 | 15099.65 / 15469.25 / 12791.47 | 0.00 / 344.09 / 0.00 | 141 / 471 / 148 | 662 / 507 / 669 | 176 / 887 / 635 | 525 / 1 / 231 | 35 / 114 / 85 | 32/84, 104/189, 84/132 | 6 / 2 / 6 | 6/6, 62/2, 57/6 | 0.10/0.30, 0.13/0.15, 0.12/0.26 |
| Passage 1 | 23097.38 / 19285.19 / 14701.23 | 19.67 / 40.74 / 8.09 | 178 / 701 / 172 | 763 / 338 / 528 | 411 / — / 584 | 33 / 0 / 263 | 72 / 141 / 96 | 72/189, 129/187, 80/126 | 3 / 3 / 6 | 79/3, 31/3, 172/6 | 0.12/0.21, 0.10/0.15, 0.13/0.24 |
| Fee 0.05 and 0.10 | 5501.03 / 6885.06 / 3608.30 | 0.00 / 666.09 / 0.00 | 113 / 377 / 109 | 484 / 542 / 692 | 117 / 734 / 488 | 570 / 150 / 713 | 37 / 103 / 34 | 34/81, 90/152, 31/68 | 6 / 5 / 4 | 45/6, 170/5, 5/4 | 0.07/0.20, 0.11/0.19, 0.00/0.30 |

The due of 1 collects 3892.04, 3877.35, and 4202.10 in all, of which World Government receives 1771.09, 1638.71, and 1543.81 and Free Tide receives 1389.89, 1530.76, and 1765.92. The due of 3 collects 11395.05, 11957.41, and 12080.48, and Free Tide receives 1800.68, 4482.21, and 5303.86. Ending stability falls to 51.30 at Crown Harbor on 1847 and to 45.76 at Glassport on 2718.

The tariff of 0.02 credits World Government 2068.78, 1822.01, and 1727.00, and Free Tide 568.25, 992.10, and 980.81. The tariff of 0.05 credits World Government 4729.92, 5884.14, and 3553.58, and Free Tide 3189.46, 4456.59, and 3336.61. Seed 2718 founds no breakaway. Its wide gate is 0. Free Tide ends at 1346.23, short on 318 states and at or below 0 on 6. Stipend mornings are 88, 144, and 92.

The levy of 0.02 credits World Government 2967.92, 3243.97, and 2497.30, Free Tide 1500.24, 2412.34, and 1324.21, and the breakaways 23.73, 2.40, and 8.40. Free Tide ends at 0.00, 32.68, and 3.19. Stipend mornings are 55, 113, and 75.

The levy of 0.05 credits World Government 8293.56, 7505.68, and 7537.00, Free Tide 3718.63, 7649.02, and 6205.68, and the breakaways 44.65, 0.00, and 17.08. Those breakaway coins are a same-tick faction change: the seat was filled for the old holder, and the credit follows the faction that holds the dock when the work or the sale lands. No breakaway is seated at the start of a tick. One stipend across the 200 mornings is 3600. The collected levy is above that on every seed. The headroom test covers 120, 197, and 118 of those mornings. Pax's uncapped draws become 363, 843, and 459, for 9626.72, 6050.46, and 16922.49. World Government's minimum treasury is 15414.23, 16047.87, and 15642.65. `tax-rate-set` counts are World Government 4, 3, and 2, and Free Tide 19, 2, and 27. Low-stability port-ticks are 262, 236, and 305. Ending stability is 62.89 / 100 / 56.53 / 56.11, 55.03 / 100 / 55.42 / 55.36, and 55.75 / 100 / 55.60 / 57.34.

The buy duty of 0.05 credits Free Tide 1271.23, 986.87, and 1556.56. Seed 2718's zero states rise from 150 to 606, and its stipend mornings fall from 103 to 44. The live rate credits World Government 5122.11, 5719.47, and 6398.39, and Free Tide 2418.08, 2580.61, and 3353.63. Seed 1847 is short on 938 states, up from 484, and its stipend mornings stay 37.

The passage share of 0.5 credits World Government 3978.96, 4699.50, and 3513.54, and Free Tide 1927.50, 3573.00, and 2755.50. The whole charge credits World Government 10018.92, 9033.00, and 6720.12, and Free Tide 7725.00, 6882.00, and 4866.00. Seed 2718's Free Tide minimum is 0.90, and it has no zero state. Pax draws 19564.59, 11588.35, and 12550.69. Ending stability falls to 54.97 at Crown Harbor on 1847 and to 51.63 at Crown Harbor on 4096. Tick 72 event counts stay 8413, 8456, and 8261. The hashes move.

Both contract fees collect 0. Contract events stay 0. The world matches the baseline table.

## 5. Hash

`stateHash` is sha256 of the canonical world. A readout writes nothing. The contract fee writes nothing on this tape, because no contract is offered. Both fee rates match the baseline table, hashes and event counts.

A due, a tariff, a levy, and a duty write before tick 72, so the fixture moves and tick 1200 moves. A passage credit writes the treasury after the charge. Tick 72 keeps the fixture's event counts and moves the hash.

Due of 1:

| Seed | Tick 72 | Events | Tick 1200 | Events |
| ---: | --- | ---: | --- | ---: |
| 1847 | `e363424c7b54799f9234378a331c5151eedbbc2301ed9e0e7f8d836d20eb9f52` | 8454 | `34d99f20f6cf2fdec660acd192d2ecd1957f22194a2b8a0c5cc83f4b384f0780` | 158932 |
| 2718 | `cd23bc89b598136cddf6909176cecaca3556dbcc99cd24f775d335d2f878bcc5` | 8423 | `2f3c5b84a34b4a72f8b8db65b44c8d84578daf67deb8c9cfe040c5d7353ca94e` | 160719 |
| 4096 | `1a338302d37f17122c35d075f59455fc12bef02eff78bf3ab92bc70913243bd8` | 8292 | `613acd1ddfd968644d1c0a726546f9e8f3839b5e452d3c14bd716403f82f5707` | 163108 |

Due of 3:

| Seed | Tick 72 | Events | Tick 1200 | Events |
| ---: | --- | ---: | --- | ---: |
| 1847 | `e14aeab90502023df550477469d1c308adeab168d5f8035f5c25b2929d7acd4c` | 8394 | `fc749b99a1d0c6a898cdcb4594522999a073e35d9eaebfee407263c5992544d2` | 161133 |
| 2718 | `721b159d77ccd4aa77ad409c89e07e9fa301ef4955f814e237c7c98293c0df65` | 8454 | `72d7839297b3056300d9e4115b812c32c9b11ef968dbb8f09b3eccdec8a19dc9` | 163525 |
| 4096 | `287c405baea7382b375c7710b50400c88108a74e5ecd26fdf0631cf1878388b3` | 8327 | `90a38a10c82d21cb3b7f4a3606fcadd7280659d47b76ad801a064a7ed817c616` | 164156 |

Tariff of 0.02:

| Seed | Tick 72 | Events | Tick 1200 | Events |
| ---: | --- | ---: | --- | ---: |
| 1847 | `6cb1d85c08b5d6901c26758e60ece088fb13cb4f8272034de702bda4b4714f7c` | 8448 | `ecad792f332ccb55eb467aa233524cffcd1a604e20aefcbeb70868c85b2b2705` | 163680 |
| 2718 | `b72d598c059442732c9b5110b9cc65d9a246484257ed4e2198f26103d9727d7a` | 8450 | `eb4b651ef7b3b719cbbb5d1a93c96f724976fcbd687149d8b2ae63ef068d7fa7` | 166072 |
| 4096 | `bef50424206419681c95aa034a2d9abe708cd19619b03816831f0f533e4bb23f` | 8336 | `0c8d9d4e30ccdf4c68b7e3c067d98de83539b2752467357f27013fd021aeacd2` | 163472 |

Tariff of 0.05:

| Seed | Tick 72 | Events | Tick 1200 | Events |
| ---: | --- | ---: | --- | ---: |
| 1847 | `67fda92109f2b99c840c9af7831b07eec4f9b0c5323319c93fd405aa57e72f31` | 8380 | `f7c409070ab2cb65601bc031114497a0f6b2cbfba2c1fcfc407b2106072b2614` | 164150 |
| 2718 | `c124348118fc8bf06a437b8662c53fe67149bdbe5bf4f0d81b4e33971771e3bf` | 8491 | `6b290d97e4311c9a967f73a53920f94791b2e494161b4da03f1ac3a5b7636e50` | 163373 |
| 4096 | `733532b231283cb8bc46f19ed41ae8fa068490f3a69d387746c58349e7130ab1` | 8331 | `70d6e1f3ccfbf12c676600cb305e04533d53b5dafe73b6f2d9a2e9bd3abe89bd` | 159522 |

Levy of 0.02:

| Seed | Tick 72 | Events | Tick 1200 | Events |
| ---: | --- | ---: | --- | ---: |
| 1847 | `00118e36ff031acf152d29a92ace63447d872a6e69f636da7b4d0493ac114e61` | 8427 | `3a1b3692c54b513d1f951d6f55b805ae97cfbe65903b5d9c3187ad7c38f8fa3a` | 161221 |
| 2718 | `cc393bdd2ea38f1bb25c2d7f0d97103b2b8036bc6d4ba9f930875d3e813d291e` | 8479 | `b732355eebdb78e886a925d36e3381a5bca178da1529698940562b18b805e862` | 164147 |
| 4096 | `7ba35ee0225645963e9a82c120c8be7888e908266800965985bf597aef9b8c37` | 8311 | `16ff5f5161f479b6a094a8cfe56d4e4753c05cef26f7c682e3cdb79a3587faaa` | 160689 |

Levy of 0.05:

| Seed | Tick 72 | Events | Tick 1200 | Events |
| ---: | --- | ---: | --- | ---: |
| 1847 | `bb9a546263fd799a70c91505069f6f7c86c169b6fd3752a01bca09176cc18b4e` | 8382 | `4a03a5339ae3a0043d06fd478da42950d1e47da980875696bf15dbf12480fb96` | 164156 |
| 2718 | `d2c9552adec5b7e9efe844e6167bf01a38078b945568435aa1c0d482c3b4dc1f` | 8315 | `d43690a1b6e3347d779d8e7e201180ccc628942a1d3dce5b58b4875ea1b4e317` | 162605 |
| 4096 | `41587a43d026e5d6ed914426c5e31f3399f2ad8598acd2ca4a460acde993e8dd` | 8408 | `26e120e80645aa30bfb1b9b1b79ee84190de2c1b778c16d5ef9934e0f059492b` | 162137 |

Buy duty of 0.05:

| Seed | Tick 72 | Events | Tick 1200 | Events |
| ---: | --- | ---: | --- | ---: |
| 1847 | `46bff083a2d014aa716f45f207c810ca1383d78c0a737cf1c8a432af771cf0cb` | 8118 | `287fd97993a9b1a19f33bb652f1b0479487be79f908cc7949f279a348293fa7c` | 162325 |
| 2718 | `44d84dd7d02537454b7766928138de9355a706dbf11b92ffbb037e8fffa894db` | 8463 | `8e8784182d6b6f1383693eb26f7629c798d1478d69b29789f11d01883385fcad` | 161241 |
| 4096 | `009ba8a5634ef2065b40856ce58d8ecd74733a29f71aa93833bdb23f74f3fcf8` | 8308 | `2b7ec6379a9bc1ba6ec0f264fdbf845f37762429be22e88065d7b4e7bb83a14d` | 162106 |

Buy duty at the live rate:

| Seed | Tick 72 | Events | Tick 1200 | Events |
| ---: | --- | ---: | --- | ---: |
| 1847 | `93b53e78d558942d2855d364d2361477374db42bc6eefa1b89b1f6e1ef491448` | 8406 | `7f423495abae588897afef51e1fde624d8c925c84805928ea55a454d5c5c5461` | 160813 |
| 2718 | `d1de174148f0a508946ee746d8d18a271ea72517e88e339b0409657815ae6b0f` | 8494 | `04e2e339364ea9fe94777442f5bcd2db1897862434145119cd3c920aaccb8edc` | 163137 |
| 4096 | `145532119cbbfa4e16eb72589edd8374b9f9378e5c23345cf3fde6bd7a5e1d07` | 8439 | `11a00ba45d3a42b71d05e22e14d160706de79d4bb15fdac541e6af53e05aa75f` | 165654 |

Passage share of 0.5:

| Seed | Tick 72 | Events | Tick 1200 | Events |
| ---: | --- | ---: | --- | ---: |
| 1847 | `84555c805afbe0b138b6d42ff6f61fc9cb068b1b364af8fb1538adddd66e6b51` | 8413 | `4c31348883cc94b102117727cbec8768fcf23c3f58f29c82b50152066511c948` | 163734 |
| 2718 | `4b024435953ea065f9a1d7ab3a64039f0c26f51e91f0aa0c59b5574db3afc7e8` | 8456 | `9816155d62412a459865827354c86c8b4e13f3aef0ef2575c6ccb7dfab32d4aa` | 162908 |
| 4096 | `dce4de538c507a0179b759b094b61181f403ee07f13d9420dc1705d92a805ec6` | 8261 | `644b21d0893b617e593297321c2dee44a87e33a236669a2056e7cf05265d35ef` | 162036 |

Passage share of 1:

| Seed | Tick 72 | Events | Tick 1200 | Events |
| ---: | --- | ---: | --- | ---: |
| 1847 | `2c55017dba8fc063478e767bdf35583ded802353d10cb601f4558e57196a6604` | 8413 | `8dfc628a1ee443f0dfb86fbc7704eec646552d83aaf172c3033fc1f5f2d4d30c` | 162698 |
| 2718 | `343e487aecfd13fb85cb616e237341d4731e605ea14523f538598d984fe705bc` | 8456 | `43c68c35b9d3cb5e0f5324a887789a013862d28aa8183dea6d9fc58a9a9d8a45` | 162869 |
| 4096 | `f45c126381e569cc2c4f013ed2272763935ccc282f4a2590306be50df27beb2e` | 8261 | `1dd8f109e7a209ef58d99e4b55d9dee05ad3411d8f3ca13483455756b36d955b` | 161972 |

## 6. Slice plan

The slices are in the order they were measured. Each one starts from the baseline. Slice 4 at 0.05 is the write this brief would land. The other rates of that slice, and slices 2, 3, 5, 6, and 7, stay measured.

| Slice | What lands | Hash on these three seeds |
| --- | --- | --- |
| 1 | A readout. Work tax, sale tax, ransom, and the draws, including Pax's uncapped draw. Not written. | Neutral. The baseline table. |
| 2 | A port due of 1 coin per docked ship per morning, from the purse, to the port faction. The 3-coin rate is the same rule. | The fixture moves. Free Tide ends at 1.13, 0.00, and 0.00 at 1 coin, and at 0.12, 0.00, and 8.09 at 3. |
| 3 | A sale tariff of 0.02 of the sell gross, added to the sale tax. The 0.05 rate is the same rule. | The fixture moves. At 0.05 Free Tide ends at 0.00, 1346.23, and 81.86. Seed 2718 founds no breakaway. |
| 4 | A governor levy of 0.05 of work gross and sell gross while a seat is filled at the start of the tick. The 0.02 rate is the same rule. The seat is not stored. | The fixture moves. Tick 72 is the levy-of-0.05 table, 8382, 8315, and 8408 events. Free Tide ends at 0.00, 1407.46, and 37.19. |
| 5 | A buy duty of 0.05, with quantity capped at the inflated price. The live tax rate is the same rule. | The fixture moves. At the live rate seed 1847 is short on 938 states. |
| 6 | A credit of half the passage already charged, to the destination faction. The whole charge is the same rule. The traveler pays the 3 either way. | Tick 72 keeps 8413, 8456, and 8261 events and moves the hash. At the whole charge Free Tide ends at 19.67, 40.74, and 8.09. |
| 7 | A contract fee of 0.05 of the price, and of 0.10, taken from the carrier and credited to the destination faction. | Neutral. The fee is 0. Contract events are 0. The baseline table. |

## 7. Questions for the Lead

The Lead rules on these against [game vision](game-vision.md). Defaults are what this brief would build.

1. **Which receipt is added?** Default: the governor levy of 0.05, alone. World Government stays never short and ends at 15416.78, 16911.49, and 15642.65, up from 5501.03, 6885.06, and 3608.30. Free Tide collects 3718.63, 7649.02, and 6205.68 on its own seated work and sales. The coins are not taken from World Government's treasury. Stipend mornings become 120, 197, and 118. While Free Tide holds a port the one-stipend headroom covers 57 of 136, 196 of 199, and 109 of 183 mornings. Pax's uncapped draw becomes 9626.72, 6050.46, and 16922.49, and Free Tide ends at 0.00, 1407.46, and 37.19.

2. **When does that levy collect?** Default: a governor is seated at the start of the tick, on work gross and on sell gross, taken from the worker or the seller, credited to the faction that holds the dock. The seat is the offices rule and is not stored. Opening names match the offices table. A breakaway appoints nobody. Breakaway seat-states at the start of a tick are 0. A same-tick faction change leaves 44.65, 0.00, and 17.08 on a breakaway. The 0.02 rate is the smaller measurement: Free Tide ends at 0.00, 32.68, and 3.19, and stipend mornings are 55, 113, and 75.

3. **Does a sale tariff land as well?** Default: no. At 0.05, alone, Free Tide ends at 0.00, 1346.23, and 81.86, stipend mornings are 88, 144, and 92, and seed 2718 closes the wide gate and founds nobody. That is fewer stipend mornings than the levy. The two were not stacked.

4. **Do docked ships pay port dues?** Default: no. One coin ends Free Tide at 1.13, 0.00, and 0.00. Three coins end it at 0.12, 0.00, and 8.09, and ending stability falls to 51.30 at Crown Harbor on 1847 and to 45.76 at Glassport on 2718. World Government's endings rise on both rates.

5. **Do buys pay a duty?** Default: no. A flat 0.05 ends Free Tide at 327.01, 0.00, and 0.00, and seed 2718's zero states rise from 150 to 606. The live tax rate lengthens seed 1847's short run from 484 states to 938, and its stipend mornings stay 37.

6. **Does the destination treasury receive any of the passage?** Default: no. The 3 stays sunk. Half the charge, credited and not billed again, ends Free Tide at 0.00, 344.09, and 0.00. The whole charge ends it at 19.67, 40.74, and 8.09, and World Government ends at 23097.38, 19285.19, and 14701.23. Tick 72 event counts stay on the fixture. The hashes move. Crown Harbor ends at 54.97 on 1847 and at 51.63 on 4096.

7. **Do contracts pay a fee?** Default: no on this tape. Rates 0.05 and 0.10 collect 0. Contract events are 0. The hash is the baseline table. A fee can be reconsidered when a headless run offers a contract.

8. **Do the tax step and the secession gate change?** Default: no. Pressed still steps the rate down. Short still steps it up, on the cooldown of 24, between 0 and 0.30. The walker still wants a rate above 0.15 and stability at or below 55. Under the 0.05 levy the ending rates are World Government 0.10, 0.11, and 0.12, and Free Tide 0.19, 0.08, and 0.17. Declarations are 6, 0, and 3. The wide gate is 71, 0, and 138 port-ticks, with 6, 0, and 3 ready. Low-stability port-ticks fall from 337, 314, and 796 to 262, 236, and 305. Seed 2718 stays at 0.08. Seeds 1847 and 4096 still climb through 0.15.

9. **What moves the hash?** Default: slice 1 and slice 7 stay on the baseline table. Slice 4 re-pins the 72-tick fixture on Node 24.21 / ICU 78.3. Tick 72 hashes are `bb9a546263fd799a70c91505069f6f7c86c169b6fd3752a01bca09176cc18b4e`, `d2c9552adec5b7e9efe844e6167bf01a38078b945568435aa1c0d482c3b4dc1f`, and `41587a43d026e5d6ed914426c5e31f3399f2ad8598acd2ca4a460acde993e8dd`, with 8382, 8315, and 8408 events. The seat is not stored. No new draw. The tick rng stays the wrong stream.
