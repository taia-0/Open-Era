# Treasury balance

**Status: Open.** Study only. The 18-a-day rule is unchanged.

Free Tide's treasury starts at 2,800 and, on the three standard 200-day runs, is empty or nearly empty from the first month or two through day 200. World Government starts at 18,000 and ends between 9,409.93 and 11,080.89. Mates other than the commander may draw 18 a day; the commander draws with no cap; the purse pays the rest of a bill. Shrinking that 18 when the treasury is already short, cutting it to 6, raising Free Tide's tax, and tying the draw to yesterday's income all still leave Free Tide near empty at day 200, because the commander spends the coins the mates no longer take. The decision in this note: keep 18 as the full daily draw, and shrink it only when the treasury cannot pay 18 to every free mate.

Measured on `deba3185b496526570ef855cceb781b825a111f8` (`origin/main` is that commit), Node v24.21.0, ICU 78.3. `npm test` passed, 324 tests. The 72-tick fixture matched `tests/fixtures/golden-hashes.json`:

| Seed | State hash | Events |
| ---: | --- | ---: |
| 1847 | `4ea893a485b05ce6eab599919765903ade9a0ce45f383437f4698064faa7a297` | 8413 |
| 2718 | `d376ad02c6e7c9b03dd0eb4db1c3c137ac7a00d61a096673e12ae4fdabbdfef2` | 8456 |
| 4096 | `ac780b3999c3da53f38c0cd16301dfa7f60562a35796f5fa0451c969c9ed08de` | 8261 |

The split recovery replayed 600 events. Runs below are `createPrototypeWorld` plus `runTick`, no commands, seeds 1847 / 2718 / 4096, 1200 ticks (200 world days). A tick number on an event is the `tick` field. A balance at 1200 is the world after 1200 `runTick` calls. The harness was local and was not committed. Tick-1200 hashes `0ea6c604f68a9a871a41bb3d3915367e905c24df676e7642bd510408966a7ab5` / `04c55c0b09ce004d847867885498616b2bf80fa112690c4a48578a96caf22268` / `09b04e93142c9f9460ffbd913d6e4e65bc41b8b71392bc0f17a32502050f9f03`, events 164191 / 160835 / 164657.

## What the lead reported

Ending treasuries match. Free Tide 1.23 / 12.98 / 0. World Government 11080.89 / 9409.93 / 10438.69.

Draws match once the cents are kept. Combined `treasuryDrawn` is 46313.42 / 46596.37 / 47645.23. Allowance (a draw that stores `allowanceRemaining`) is 40961.83 / 42011.56 / 43044.28. Holder (a draw that does not) is 5351.59 / 4584.81 / 4600.95. The integers 46313 / 46597 / 47645 round the middle seed the wrong way: 46596.37 is 46596. Purse totals are 198380.38 / 182733.80 / 212269.33. The band "198k–212k" leaves out seed 2718.

The "~44k down to ~10k" path is the comparison with the treasuries from before this spending rule, in the slice 3 addendum (43826 / 41769.12 / 46132.91). Inside these runs World Government opens at 18,000, peaks at 18869.42 / 18103.79 / 18262.22 (event ticks 365 / 94 / 312), and ends near 9,400–11,100. Almost all of the "holder" total is Pax Ash (`character-14`). Mara Vane's holder draws are 21 / 18 / 0.

## Income

The only credits in the code are work tax, sale tax, and ransom. Opening balance plus those credits minus draws equals the ending balance on every faction. The gap is 0.

| Seed | Faction | Work tax | Sale tax | Ransom | Income | Allowance | Holder | Draws |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1847 | World Government | 6594.87 | 17155.82 | 377.85 | 24128.54 | 31026.65 | 21.00 | 31047.65 |
| 1847 | Free Tide | 4435.52 | 7595.59 | 435.89 | 12467.00 | 9935.18 | 5330.59 | 15265.77 |
| 2718 | World Government | 5497.97 | 15274.25 | 1008.26 | 21780.48 | 30352.55 | 18.00 | 30370.55 |
| 2718 | Free Tide | 5735.34 | 7440.10 | 263.36 | 13438.80 | 11659.01 | 4566.81 | 16225.82 |
| 4096 | World Government | 8277.11 | 15790.68 | 60.27 | 24128.06 | 31689.37 | 0.00 | 31689.37 |
| 4096 | Free Tide | 4593.34 | 8529.70 | 32.82 | 13155.86 | 11354.91 | 4600.95 | 15955.86 |

World Government's allowance stays near 2,200–3,200 in every 100-tick block. Free Tide's opening 2,800 is spent in the first blocks, and after that each block of draws tracks that block's income.

Free Tide allowance, then holder, by event-tick block:

| Ticks | 1847 allowance | 1847 holder | 2718 allowance | 2718 holder | 4096 allowance | 4096 holder |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0–99 | 1908.00 | 1144.87 | 1909.84 | 612.96 | 1851.00 | 1613.13 |
| 100–199 | 827.98 | 647.62 | 1319.89 | 24.00 | 1198.90 | 613.11 |
| 200–299 | 645.09 | 203.83 | 1532.28 | 719.25 | 453.47 | 175.96 |
| 300–399 | 931.24 | 359.96 | 1059.78 | 443.44 | 800.49 | 379.39 |
| 400–499 | 959.45 | 439.63 | 756.70 | 104.57 | 1240.94 | 168.00 |
| 500–599 | 512.33 | 248.97 | 958.18 | 284.97 | 983.19 | 108.00 |
| 600–699 | 407.74 | 309.71 | 874.91 | 256.56 | 816.34 | 102.00 |
| 700–799 | 796.73 | 421.04 | 688.31 | 317.80 | 835.33 | 347.16 |
| 800–899 | 812.49 | 336.00 | 740.45 | 463.77 | 582.83 | 250.25 |
| 900–999 | 703.18 | 140.19 | 522.88 | 328.62 | 1025.66 | 335.24 |
| 1000–1099 | 592.26 | 339.66 | 790.42 | 593.86 | 772.94 | 263.06 |
| 1100–1199 | 838.69 | 739.11 | 505.37 | 417.01 | 793.82 | 245.65 |

Treasury at each 100 world ticks:

| World tick | WG 1847 | FT 1847 | WG 2718 | FT 2718 | WG 4096 | FT 4096 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 18000.00 | 2800.00 | 18000.00 | 2800.00 | 18000.00 | 2800.00 |
| 100 | 17445.91 | 567.49 | 17916.85 | 661.50 | 17206.12 | 197.93 |
| 200 | 18141.96 | 0.00 | 17028.28 | 940.48 | 17435.10 | 1.22 |
| 300 | 18748.76 | 14.81 | 16313.47 | 404.38 | 18236.67 | 0.00 |
| 400 | 18377.57 | 34.35 | 15407.58 | 2.49 | 17090.21 | 5.93 |
| 500 | 17464.56 | 1.36 | 15013.70 | 6.66 | 16148.46 | 2.48 |
| 600 | 16872.13 | 1.34 | 14035.19 | 0.00 | 15292.16 | 13.94 |
| 700 | 16283.93 | 1.35 | 13635.20 | 1.23 | 14800.89 | 26.00 |
| 800 | 14794.70 | 17.93 | 12477.94 | 2.38 | 13449.12 | 1.50 |
| 900 | 13967.67 | 1.17 | 11892.88 | 18.83 | 13218.51 | 1.23 |
| 1000 | 13140.66 | 2.29 | 11003.52 | 5.28 | 11958.92 | 0.00 |
| 1100 | 12280.61 | 2.38 | 9909.13 | 1.23 | 11286.97 | 6.12 |
| 1200 | 11080.89 | 1.23 | 9409.93 | 12.98 | 10438.69 | 0.00 |

Free Tide still holds a port at tick 1200 (Glassport; Cinder Key and Crown Harbor; Cinder Key). Pax remains the holder on every snapshot. Mara remains World Government's holder.

## When Free Tide first hits zero

| Seed | Event tick | Who | What | Next credit |
| ---: | ---: | --- | --- | --- |
| 1847 | 114 | Dax Pike | a buy draws 15.72 and leaves 0 | work tax 1.42 at tick 115 |
| 2718 | 382 | Dax Pike | a recruit draws 16.96 and leaves 0 | work tax 1.26 on the same tick |
| 4096 | 115 | Zara Gale | a buy draws 8.67 and leaves 0 | work tax 1.22 on the same tick |

The treasury reaches 0, then a coin or two of tax arrives and is spent. Ticks that end at or below 0: 256 / 92 / 256 out of 1200.

Counts below are per 100 event ticks, Free Tide only, before the zero tick and after it. A money refusal is a candidate scored −1000 because the quote was short of coins. A voyage refusal counts once per destination.

| Seed | Span (ticks) | Recruits | Voyages | Buys | Passage charges | Recruit refusals | Voyage refusals |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1847 before | 114 | 39.5 | 143.0 | 73.7 | 414.9 | 62.3 | 79.8 |
| 1847 after | 1085 | 56.7 | 44.5 | 51.2 | 152.6 | 299.5 | 378.9 |
| 2718 before | 382 | 45.8 | 67.5 | 61.8 | 199.2 | 55.2 | 60.2 |
| 2718 after | 817 | 51.5 | 44.4 | 66.6 | 135.1 | 231.3 | 280.5 |
| 4096 before | 115 | 52.2 | 111.3 | 74.8 | 353.0 | 97.4 | 89.6 |
| 4096 after | 1084 | 31.5 | 63.8 | 80.5 | 197.0 | 233.8 | 281.7 |

Voyages and passage charges fall. Recruiting and buying continue, because the purse pays them: Free Tide purses pay 57869.93 / 56398.61 / 61740.23 over the whole run, against treasury draws of 15265.77 / 16225.82 / 15955.86. Recruit refusals rise to a few per tick. Captures and releases sit mostly after the zero tick because that is most of the run (Free Tide members captured 4 / 11 / 2, releases of those members 4 / 9 / 2). The short stretch before the first zero is too small to pin those counts on the empty treasury.

## Three changes, measured at tick 1200

The holder stays uncapped in every row. Mates are the free faction members who are not the holder.

1. **Balance share.** The mate's cap is `min(18, treasury / mates)`, checked on each quote. **18 stays intact:** it is the ceiling, and it shrinks only when the treasury cannot pay 18 to every free mate.
2. **Flat 6.** Every mate's cap is 6. **18 does not stay.**
3. **Tax.** Free Tide's rate goes from 0.08 to 0.14, the rate World Government already uses. **18 stays intact.** The cap is not scaled.
4. **Yesterday's income.** After day 0, the cap is `min(18, that faction's treasury income yesterday / mates)`. Day 0 stays 18. **18 stays the ceiling,** and it scales from income, so a full treasury can still pay less than 18.

| Option | 18 intact | Seed | WG treasury | FT treasury | Draws | Allowance | Holder | Purse | First zero | Ticks ending at 0 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Balance share | yes | 1847 | 16020.77 | 24.48 | 43211.07 | 34717.34 | 8493.73 | 188260.96 | 116 | 10 |
| Balance share | yes | 2718 | 12787.62 | 6.65 | 45057.45 | 38142.41 | 6915.04 | 187919.91 | 385 | 31 |
| Balance share | yes | 4096 | 13187.71 | 3.21 | 46147.02 | 38215.67 | 7931.35 | 227729.05 | 165 | 41 |
| Flat 6 | no | 1847 | 31391.02 | 20.29 | 27287.64 | 16374.97 | 10912.67 | 204287.53 | 180 | 42 |
| Flat 6 | no | 2718 | 31090.54 | 47.99 | 25849.39 | 16164.88 | 9684.51 | 188915.29 | 559 | 81 |
| Flat 6 | no | 4096 | 35348.55 | 14.63 | 23766.79 | 15000.50 | 8766.29 | 189679.52 | 144 | 131 |
| Tax 0.14 | yes | 1847 | 13969.22 | 9.70 | 52741.01 | 43704.13 | 9036.88 | 187023.72 | 116 | 162 |
| Tax 0.14 | yes | 2718 | 10672.00 | 11.01 | 56105.45 | 44356.06 | 11749.39 | 194301.82 | 218 | 85 |
| Tax 0.14 | yes | 4096 | 7289.88 | 543.04 | 58199.76 | 45516.43 | 12683.33 | 208944.67 | 93 | 122 |
| Yesterday's income | ceiling | 1847 | 25210.88 | 52.68 | 32422.09 | 25606.98 | 6815.11 | 196625.42 | 376 | 156 |
| Yesterday's income | ceiling | 2718 | 24640.24 | 14.36 | 32338.12 | 23665.76 | 8672.36 | 175116.46 | 693 | 3 |
| Yesterday's income | ceiling | 4096 | 23988.10 | 74.82 | 34821.64 | 25731.82 | 9089.82 | 235174.31 | 151 | 78 |

Holder column is both factions. On these rows the rise is Pax. Baseline Free Tide holder draws are 5330.59 / 4566.81 / 4600.95. Under the balance share they are 8466.73 / 6915.04 / 7898.35. Under the flat 6 they are 10897.67 / 9666.51 / 8766.29. Under the tax they are 9015.88 / 11731.39 / 12659.33. Under yesterday's income they are 6815.11 / 8660.36 / 9068.82.

World Government's own allowance barely moves under the balance share (28591.96 / 30368.81 / 31274.08, against 31026.65 / 30352.55 / 31689.37 now). The flat 6 cuts it to about 10,400–10,700 and the treasury ends above 31,000. Yesterday's income cuts it to 18708.14 / 16814.13 / 18096.04 and the treasury grows past 24,000. The tax leaves World Government's ending balance at 13969.22 / 10672.00 / 7289.88.

Free Tide's 543.04 on the tax run is a late jump: that seed is at 0 at tick 1100. Yesterday's income keeps Free Tide near 2,000 through tick 500 on seed 2718, then the commander spends it down (14.36 at tick 1200, and that faction holds no port at the end).

## Recommendation

Use the balance share. Eighteen remains the draw whenever the treasury can pay it, which is the whole run for World Government and the opening weeks for Free Tide. The flat 6 piles coins in the government's treasury and still leaves Free Tide under 50. The tax increase is spent as it arrives. Tying the cap to yesterday's income does keep 18 as a ceiling, and it also pays a solvent faction less than 18, so the government's treasury grows while Free Tide still finishes under 75. None of the four puts a standing fund back in Free Tide's treasury while the commander can spend what the mates leave.
