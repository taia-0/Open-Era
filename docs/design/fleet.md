# Fleet

**Status: Ruled.** The Lead's answers are in [Ruling](#ruling). Nothing in this note is in the tree. The census is a local readout of the baseline tape. The resims were produced by a local harness and were not left in the tree.

Checked on `origin/main` at `16bd8e4366316e834b6100741666caaf39af14a5` (PR #102). Node v24.21.0, ICU 78.3. `npm test` passed, 415 tests. The 72-tick fixture passed, including the golden recovery replay of 600 events on seed 1847 split at tick 47. A headless run reproduced the fixture. The 1200-tick baseline below is this tree. It is not the 1200-tick table in [morale](morale.md). That table was measured on `4753d32` (PR #100), before the secession walker in PR #101. The walker is in this tree. The 72-tick hashes are the same. Tick 1200 is not.

| Seed | Tick 72 state hash | Events | Tick 1200 state hash | Events |
| --- | --- | ---: | --- | ---: |
| 1847 | `4ea893a485b05ce6eab599919765903ade9a0ce45f383437f4698064faa7a297` | 8413 | `b302e1af1cdd4dfe7ba2ea3371bf35dd64d770c1a7c8692a0a0ed6fac20e07e9` | 164732 |
| 2718 | `d376ad02c6e7c9b03dd0eb4db1c3c137ac7a00d61a096673e12ae4fdabbdfef2` | 8456 | `e81f5ba4a3036f40f94ca02e48d856b3cf6572709277a303a718f4c273237056` | 162127 |
| 4096 | `ac780b3999c3da53f38c0cd16301dfa7f60562a35796f5fa0451c969c9ed08de` | 8261 | `f6b6aea414d205bebd264d8d2c8efba66c6287448414df7359e7a90c910c31db` | 159900 |

Runs are `createPrototypeWorld` plus `runTick`, no player commands. Seeds 1847, 2718, and 4096. A figure at tick 0 is the world before any `runTick`. A figure at tick 72 or tick 1200 is the world after that many calls. Tick numbers on events are the `tick` field. Tick 0 hashes are `f4411b174c7da0bd4b4c8a2e2dc6cc58b3caed7592f1854af04c28acb2ca5698`, `2a041b435821447be7426b5db5f51bf9985bf88638e07b9d0981f03f95b39142`, and `bb73f7fbb6dc3410458e9ce21128e227510d2f4d1e3331ca673aff8d8d150412`.

[Game vision](game-vision.md) says the player manages a crew and ships, and that a legendary crew is one ambition. [World simulation](world-simulation.md) says dedicated sailors operate ships while troops travel aboard, and that one character may command several parties. [Treasury spending](treasury-spending.md) and [treasury balance](treasury-balance.md) are the 18-a-day mate allowance. Eighteen is one day of passage. The holder is uncapped. [Progression](progression.md) keeps that 18, and the recruit price of 12 coins and 0.35 arms a soldier. [Morale](morale.md) is the short share, not a wage. [Negotiation](negotiation.md) does not pay a wage. [News](news.md) is how a ship carries a ledger. This note does not add a second hull entity.

A mean is rounded to 3 decimals. A median is the value at linear index `(n − 1) / 2`, interpolated when that index falls between two samples, then rounded to 3 decimals. Seeds below are 1847, 2718, and 4096, in that order.

## Summary

There is no ship record. A character is the hull. `sailors` is the crew, drawn once from 8 to 22, and nothing in the 1200 ticks writes it. Thirty hulls start: World Government 13, Free Tide 9, unaffiliated 8. Crews are 195 / 201 / 209, 144 / 129 / 151, and 122 / 151 / 128. Mara Vane's ship is the human controller and does not sail, raid, or trade. The other twenty-nine do.

A voyage is one character underway. The most hulls underway at once are 11, 11, and 11 for World Government, 9, 8, and 8 for Free Tide, and 6, 6, and 6 for the unaffiliated. That never exceeds the ships those factions still have, so a cap of underway voyages at the ship count does not fire. The hash stays the baseline table. Raids are not capped by ships. The gate is 25 troops. Unaffiliated ships trade and do not raid. Finished battles lose troops and garrison. They do not lose sailors.

Passage is already 3 coins a tick, flat, allowance first and then the purse. It is not a crew wage. Free Tide's treasury is already short. The first short morning is tick 114, 378, and 120. Free Tide ends at 0, 666.09, and 0. World Government ends at 5501.03, 6885.06, and 3608.30, and its cap stays 18.

A wage of 18 per ship per morning, the officer's coin once per hull, empties both treasuries. Both end at 0 on every seed. The fixture moves. Pricing one new hull at 12 times the median crew, or the crews they already have at 12 per sailor, also moves the fixture. A repair of the base timber price, 4.5, on each defeat moves it too. Zeroing the crew on a defeat sinks 10, 9, and 5 hulls and moves it. None of those charges are in this tree.

## 1. What the code models

`Character` stores `sailors`. Setup draws `rng.integer(8, 22)`. No event assigns it after that. There is no hull, no damage, and no ship id. Cargo capacity is `40 + sailors * 2`. Provision demand is `0.12 + sailors * 0.008 + troops.count * 0.004`. Both read the crew. Neither spends it.

`PASSAGE_COST_PER_TICK` is 3. The comment in `src/sim/engine.ts` says the rate is flat on purpose, so a formula that depended on crew size would hide whether the trip was worth it. A sea tick charges up to 3, allowance first, then the purse, and does not turn the ship around. `quotedPassage` is that 3 times the length of the leg, and an autonomous voyage that cannot cover the quote is scored at −1000.

`shipMaterials` is the fourth good. The base price in `src/sim/state.ts` is 4.5. The board clamps scarcity to 0.55–2.5, so a price sits from 2.48 to 11.25. Settlements consume it. Characters buy and sell it. Nothing spends it on a hull. Opening boards, the same on every seed, are Crown Harbor 4.29, Verdant Cay 6.82, Cinder Key 2.48, and Glassport 4.95. Cinder Key's focus is ship materials.

Recruiting spends 12 coins and 0.35 arms a soldier and adds bodies to the troop stack. It does not hire sailors.

The raid gate is a hostile port, a faction, at least 25 troops, a garrison of at least 15, or 8 when the faction is landless, 18 ticks since the last battle, and no battle already open on that port. Ship count is not in it. Trade is a character standing in port. One character has one `travel`. A second voyage waits until that one ends.

Battle writes troops, health, morale, and garrison. `battle-resolved` stores `attackerLosses`. A major stores the opening troop count minus the count at the end. A retreat stores `pursuitLosses`. Sailors are not in those payloads.

## 2. The census

Tick 0 is thirty hulls. The sailor field on each hull is the same at tick 1200. `sailorsUnchanged` is true on every seed.

|  | World Government | Free Tide | Unaffiliated |
| --- | --- | --- | --- |
| Ships | 13 | 9 | 8 |
| Sailors | 195 / 201 / 209 | 144 / 129 / 151 | 122 / 151 / 128 |
| Min–max | 8–22 / 8–22 / 8–22 | 9–20 / 8–22 / 8–22 | 12–20 / 15–22 / 9–22 |
| Mean | 15 / 15.462 / 16.077 | 16 / 14.333 / 16.778 | 15.25 / 18.875 / 16 |
| Median | 17 / 16 / 18 | 18 / 11 / 16 | 14.5 / 19 / 17 |

Mara Vane (`character-01`) is the human ship, World Government, sailors 17 / 9 / 21. Voyages, raids, and trades are 0. Pax Ash (`character-14`) stays the Free Tide holder, sailors 19 / 8 / 22. The per-ship rows below follow the thirty hulls for the whole run, grouped by the faction they start in. A hull that secedes keeps its later voyages in that row.

|  | Voyages | Per ship | Raids | Per ship | Trades | Per ship |
| --- | --- | --- | --- | --- | --- | --- |
| World Government | 876 / 1025 / 1038 | 67.385 / 78.846 / 79.846 | 26 / 19 / 19 | 2 / 1.462 / 1.462 | 2881 / 2582 / 2999 | 221.615 / 198.615 / 230.692 |
| Free Tide | 595 / 584 / 812 | 66.111 / 64.889 / 90.222 | 56 / 56 / 62 | 6.222 / 6.222 / 6.889 | 865 / 1028 / 1260 | 96.111 / 114.222 / 140 |
| Unaffiliated | 687 / 682 / 656 | 85.875 / 85.25 / 82 | 0 / 0 / 0 | 0 | 901 / 1161 / 1140 | 112.625 / 145.125 / 142.5 |

World Government's twelve autonomous hulls, Mara left out, sail 73, 85.417, and 86.5 voyages each. The most hulls underway at once are 11, 11, and 11 for World Government, 9, 8, and 8 for Free Tide, and 6, 6, and 6 for the unaffiliated. The most battles open at once are 2, 1, and 1 for World Government and 1, 1, and 1 for Free Tide. The unaffiliated have none.

Every raid decision is followed, later in the same tick, by `battle-started` or `battle-resolved` for that actor. Raid decisions are 82, 75, and 81. `battle-resolved` is 68, 55, and 55. Retreats are 13, 15, and 20. A major that retreats does not emit `battle-resolved`.

Attacker losses on `battle-resolved` sum to 996, 640, and 498. Of the starting rosters, World Government takes 358, 163, and 183, Free Tide 638, 477, and 315, and the unaffiliated 0. Garrison losses sum to 622, 594, and 554. Pursuit losses sum to 46, 47, and 129. Attacker victories are 55, 46, and 47. Attacker defeats are 13, 9, and 8. One row inside the 640 is negative. Tick 1149, Corin Hale (`character-16`), an attacker victory after 3 phases, stores `attackerLosses` of −16 because the stack at resolution is 328, above the count the battle opened with. Sailors do not move on that row or on any other.

Ship-material trades are 435, 598, and 503, quantities 6072.712, 8996.212, and 7303.25, gross 40246.65, 55912.76, and 42975.51. Paid prices have means 6.572, 6.219, and 5.79, medians 5.86, 4.815, and 3.78, and the same min and max on every seed, 2.48 and 11.25, which is the clamp on the 4.5 base.

Passage ticks are 6649, 6943, and 7694. Coins charged are 19922.86, 20829.00, and 23025.67, of which the treasury pays 8663.76, 10332.64, and 10347.36 and the purse pays 11259.10, 10496.36, and 12678.31. Ticks charged under 3 are 10, 0, and 21. On 4096, 10 of those 21 are breakaways. On the three starting groups the sea ticks, the treasury, and the purse are:

|  | World Government | Free Tide | Unaffiliated |
| --- | --- | --- | --- |
| Sea ticks | 2842 / 3174 / 3187 | 1275 / 1344 / 1259 | 1923 / 2049 / 1905 |
| Treasury | 5625.03 / 6809.89 / 6473.19 | 2109.17 / 2841.75 / 1584.20 | 0 / 0 / 0 |
| Purse | 2896.89 / 2712.11 / 3087.81 | 1695.77 / 1190.25 / 2165.44 | 5769 / 6147 / 5715 |
| Under 3 | 2 / 0 / 0 | 8 / 0 / 11 | 0 / 0 / 0 |

The unaffiliated have no treasury, so the purse pays the whole 3. Breakaway factions pay the rest of the grand total.

Treasuries open at 18000 and 2800. World Government's cap stays 18. Short member-ticks are 0. Free Tide's first short morning, `tick % 6 === 0` before the tick and the cap already under 18, is 114, 378, and 120. Short member-ticks are 2411, 2457, and 2269, which is 401.833, 409.5, and 378.167 mate-days. Ticks where the cap is 0, counted per mate, are 220, 435, and 467. States at or below 0 are 570, 150, and 713 for Free Tide and 0 for World Government. Endings are World Government 5501.03, 6885.06, and 3608.30, and Free Tide 0, 666.09, and 0.

Ship count changes only when a member leaves and takes the hull. Secessions are 6, 5, and 4. The first are ticks 438, 705, and 400. At tick 1200 World Government still has 13 hulls and the same crews. The unaffiliated still have 8. Free Tide has 1, 3, and 1 hulls, crews 19, 52, and 22. Pax is still one of them. The others are on the breakaway factions, sailors unchanged.

On the unchanged tape, 18 coins per ship-day would bill World Government `15600 / 6 * 18` = 46800 on every seed, and Free Tide 16305, 24714, and 15183. Eighteen per sailor-day would bill World Government 702000, 723600, and 752400, and Free Tide 266208, 363177, and 270810. Those bills were not charged. The slices below are the charges that were.

## 3. What the slices would change

Slices are measured from the baseline, not stacked. A slice that does not write keeps the hash. Each charge goes through `applyEvent`. None of them draw. The tick rng is not used.

The voyage cap scores `travel` at −1000 when a faction already has as many voyages underway as it has ships with `sailors > 0`. The deciding character is one of those ships and is not underway, so the count of voyages is at most one under the ship count. The gate does not fire. Tick 72 and tick 1200 match the baseline table on every seed, hashes and event counts.

One new hull is `12 * median sailors` of that faction, the recruit price times the median crew, charged once from the treasury at tick 0. It does not add a character. World Government pays 204, 192, and 216. Free Tide pays 216, 132, and 192. Medians are the table in section 2. Tick 72 hashes `d8177a09ad4147fd2e6e39d25d58d8eabbc5dc1cab1b94168d16f9f3d8502c7c` (8415), `2c55d159afb5be1a450ae23454e577f328620d2cfe16d0420a510fb79c5befc8` (8458), and `5d59f86c3677a302773a569ce580866c90805f4d4835bfa511924cca49f5d3fe` (8263). The slice emits one purchase for each treasury at tick 0. Tick 72 event counts are two above the fixture. Tick 1200 hashes `bd676bdc679593d9d5d523b702ec41d1412eee7876aa1d5a904f53fe830629dc` (162732), `7d6811274571d66c1146fb269831f9a2055a028b2ca55200b9aad8e5aac4283f` (161624), and `e0b128dd14140a4d32fac80cad84d7c9da6b893d64fc022267697913283aeb81` (163103). World Government ends at 8159.08, 7305.82, and 5868.31. Free Tide ends at 12.66, 0, and 1.22.

The roster is 12 per sailor already aboard, one charge at tick 0, and it does not add a hull. World Government pays 2340, 2412, and 2508. Free Tide pays 1728, 1548, and 1812. Tick 72 hashes `25eee9b8860cf85d3bbdc11c414b4959c4092aef4d1c87cd714d3c73e8816ca1` (8487), `e82762483de23d840f651ef9b5deea7cf5a5f080f16fff42b18bf58452c31fe8` (8458), and `c307ba6746cfdd6c41051dbd35a9630a6290f58c9d438d46e9e6dda088ada3ce` (8257). Tick 1200 hashes `52758ca94b83cfc410801c5771d6ac51734b36f3345992e42b4cda9954e819b2` (162613), `da2ee504858aec38c2feffc56c0463bdf847efc0d1574c13350d3ea6cabcbe72` (165439), and `85c3886872f2df89fd321f1f05d54dd4e0d36ec67d3a100a14cf3e21650b90c3` (162019). World Government ends at 25.92, 6213.29, and 78.84. Free Tide ends at 0, 725.13, and 0.

Repair bills 4.5, the base ship-materials price, from the attacker's faction treasury on a defender victory. It does not read the board, and it does not change sailors. The resim pays 4.5 every time: 10, 10, and 8 bills, 45, 45, and 36 coins. Tick 72 hashes `81d59f489d97a1b5c4d5ba79d598720c13eb500d25a12a3d313120b30b926a31` (8421), `44ed1a98ea6ef8012d61681fe0a3960d1bd50af63298199f843482f4cd7d2309` (8460), and `ada1215f9a1c082b4ad8ab39c31d125d96367bafb20f438f635980d330f3852e` (8267). Tick 1200 hashes `a793fc1fbab912c8bcac36951bc0c80bfb91d486c3b51733165d1fbece6192fa` (161040), `de36c7a5683826cc83c6779a71e3a22300d7b8c0916b1b62a7f33a16b4f8773b` (163345), and `b08d5a1485930ef8fee9e148d2dda28f4783501887e3b5a1d05f9925c82309bf` (163744). World Government ends at 9380.36, 6656.25, and 5537.35. Free Tide ends at 0, 0, and 0. The middle seed's baseline ending is 666.09.

A loss sets `sailors` to 0 on a defender victory. The character stays, faction and place included. While `sailors` is 0, `travel`, `trade-local`, and `raid` score at −1000. The forced retreat from a major defeat still sails. The resim sinks 10, 9, and 5 hulls, and those crews are still 0 at tick 1200. Raid decisions become 45, 50, and 78. Voyages become 2232, 2043, and 1642. Trades become 5081, 5171, and 4745. Tick 72 hashes `bc1fee69463379c54b558882f0a6a5815424917747efe61d66be64f824eb807b` (8579), `cf12686e58e11d904172a3e8c5bb4fda05c296503b05c235e901ad64ff31b2f0` (8519), and `34e425d28a5b89799863201c9f662a1b9ff6455d8504120bf29473ad2ea1b614` (8412). Tick 1200 hashes `45d25323221df45003275febbb164e2e99db618bb4814929ae1412ef7a25fc60` (167557), `3c90c4e4a3c7138ab84bf013e87646e4b28395ff27f238c07463b8ef464c09bd` (164852), and `033f1f60eea67f781d59b1f3cf04c5b1d7d1e56a33689f210d985b4c04722ec2` (166055). World Government ends at 9791.79, 8382.93, and 7296.10. Free Tide ends at 0.01, 0.31, and 0.

The wage is 18 per ship per morning, `tick % 6 === 0` before the tick. A ship is a faction member with `sailors > 0`, holder and captive included. The treasury pays what it can, in whole cents, and a morning it cannot pay emits nothing. Breakaway factions pay the same rule once they exist. World Government pays 19950.88, 28083.42, and 25908.95. Free Tide pays 5588.19, 6632.30, and 8725.72. Both end at 0 on every seed. Tick 72 hashes `53d392ea16ca0979df8c1884c2eb2fd1914b21be17e84370f702c0892496bddd` (8431), `b1edf0c2c04f0969e6cd35c8b5f7bc30b280a4d73b7c4b8dda782ee52b4818cc` (8477), and `51fb54821d610fba763b38269427f8c6b0e0ff1b8b7e14b296c7a5ba6945ae1b` (8287). Tick 1200 hashes `0e5955143e1b716575f85a64fd83b125658932f115bc2a246bbb572824a07164` (161764), `06caf7d77ccac10bf6f016dc290d2e7dca5a7a2059d8d0839357bc82543e7da8` (162378), and `aa32853800fcca6c979739d6f6dfa525da270af8a43b100388d807386134eb05` (162414). Eighteen per sailor was not resimmed. The unchanged-tape bill is the sailor-day figure in section 2.

## 4. Determinism

`stateHash` is sha256 of the canonical world. `applyEvent` throws on an unknown type. `ship-purchased`, `ship-repaired`, `ship-lost`, and `crew-wages-paid` have to be reducer cases. The purchase, the repair, and the wage write the treasury absolute on the event. The loss writes `sailors` on the event. The reducer does not draw and does not re-price.

The voyage cap writes nothing. Its hash is the baseline. Every other slice writes before tick 72, so the fixture moves and tick 1200 moves. `WorldState.version` stays 5. A roll for sinking or for a wage was not added. The tick rng remains the wrong stream for one.

## 5. Slice plan

The slices are in the order they would land. Each one is measured from the baseline, not stacked.

| Slice | What lands | Hash on these three seeds |
| --- | --- | --- |
| 1 | A readout. Ships, crews, voyages, raids, trades, battle losses, passage, the timber good, the treasuries. Not written. | Neutral. The baseline table at the top. |
| 2 | A faction may not start a voyage when underway voyages already equal ships with sailors above 0. | The hash stays. Tick 72 and tick 1200 are the baseline table. The gate does not fire. |
| 3 | One hull, priced at 12 times the faction's median crew, charged once from the treasury at tick 0. No new character. | The fixture moves. Event counts are two above the fixture. Free Tide ends at 12.66, 0, and 1.22. |
| 4 | The crews already aboard, priced at 12 per sailor, one treasury charge at tick 0. No new character. | The fixture moves. World Government ends at 25.92, 6213.29, and 78.84. Free Tide ends at 0, 725.13, and 0. |
| 5 | A defeat bills 4.5, the base timber price, from the attacker's treasury. Sailors stay. | The fixture moves. The bills are 45, 45, and 36. Free Tide ends at 0, 0, and 0. |
| 6 | A defeat sets `sailors` to 0. Later travel, trade, and raid score at −1000. The character stays. The forced retreat still sails. | The fixture moves. Hulls sunk are 10, 9, and 5. Free Tide ends at 0.01, 0.31, and 0. |
| 7 | Eighteen per ship per morning from the treasury, the officer's coin once per hull. | The fixture moves. World Government and Free Tide both end at 0. |

Slice 7 is the measured wage. It is not required for slice 3. Eighteen per sailor was not a slice.

## 6. Questions for the Lead

The Lead rules on these against [game vision](game-vision.md). Defaults are what this brief would build.

1. **Is the character the ship?** Default: yes. One hull, and `sailors` is the crew. No second entity, and no write. Capacity and provision demand keep the formulas in section 1. The thirty hulls and the crews in section 2 are the fleet.

2. **Does ship count limit raids and trade?** Default: the limit already in the code. One character, one voyage. Slice 2, a faction cap at the number of ships, does not fire, and the hash is the baseline table. Unaffiliated hulls trade and do not raid, because the raid gate wants a faction. The troop floor stays 25. A pool of hulls smaller than the member count was not measured.

3. **What does a new hull cost?** Default: nothing on a headless run. No one buys. The measured price is the recruit price times the median crew, 204, 192, and 216 for World Government and 216, 132, and 192 for Free Tide, charged once at tick 0. That is slice 3. The fixture moves. Free Tide ends at 12.66, 0, and 1.22, against 0, 666.09, and 0. The charge does not add a ship.

4. **Do they pay again for the crews they have?** Default: no. Slice 4 prices every sailor already aboard at 12. World Government pays 2340, 2412, and 2508. Free Tide pays 1728, 1548, and 1812, out of an opening 2800. The fixture moves. World Government ends at 25.92, 6213.29, and 78.84. Free Tide ends at 0, 725.13, and 0.

5. **Does a defeat pay for repair?** Default: no. There is no hull damage. `shipMaterials` stays a traded good, 435, 598, and 503 trades on this tape. Slice 5 bills the base price, 4.5, not the board. The resim pays 45, 45, and 36. The fixture moves. Free Tide ends at 0, 0, and 0. The middle seed's baseline ending is 666.09.

6. **Does a defeat sink the ship?** Default: no. Sailors stay, which is the tape. Slice 6 sets the crew to 0, refuses later travel, trade, and raid, and leaves the character in place. It sinks 10, 9, and 5 hulls. The forced retreat still sails. The fixture moves. Free Tide ends at 0.01, 0.31, and 0. Named characters are not removed.

7. **Do sailors draw a wage?** Default: no. The 18 stays the officer's allowance, one day of passage, and the holder stays uncapped. Passage stays 3 a tick, flat. Slice 7 charges that 18 once per hull per morning. The treasuries pay World Government 19950.88, 28083.42, and 25908.95, and Free Tide 5588.19, 6632.30, and 8725.72, which is what they had, not the unpaid remainder. Both end at 0. The fixture moves. Eighteen per sailor was not run. On the unchanged tape that bill is 702000, 723600, and 752400 for World Government and 266208, 363177, and 270810 for Free Tide.

## Ruling

The Lead has ruled.

The defaults stand. The character stays the ship, and the one-voyage limit stays. Slice 1, the readout, is OK to build later. Slices 3–7 wait until income can carry them.
