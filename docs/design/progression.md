# Progression

**Status: Ruled.** The Lead's answers are in [Ruling](#ruling). Nothing in this note is in the tree. The census is a local readout of the baseline tape. The resims were produced by a local harness and were not left in the tree.

Checked on `origin/main` at `c4969af8477e2ec16ca7c135d610cf1c03a33fb9` (PR #93). Node v24.21.0, ICU 78.3. `npm test` passed, 379 tests. The 72-tick fixture passed, including the golden recovery replay of 600 events on seed 1847 split at tick 47. A separate headless run reproduced the fixture and the 1200-tick baseline:

| Seed | Tick 72 state hash | Events | Tick 1200 state hash | Events |
| --- | --- | ---: | --- | ---: |
| 1847 | `4ea893a485b05ce6eab599919765903ade9a0ce45f383437f4698064faa7a297` | 8413 | `90dacc2dfcd199ab720ade191bd3fdf8742632a36f19216bd53ce0e3a3294fef` | 160268 |
| 2718 | `d376ad02c6e7c9b03dd0eb4db1c3c137ac7a00d61a096673e12ae4fdabbdfef2` | 8456 | `226bf6257a86b233d197bd77747a10fe64b33dd7ac1e94bc27c11ff3ddf50cd8` | 161850 |
| 4096 | `ac780b3999c3da53f38c0cd16301dfa7f60562a35796f5fa0451c969c9ed08de` | 8261 | `30e9994387b2c9a2d8c0e16e27042797599188a105992cb7a9f8d2e924a8b0a6` | 162459 |

Runs are `createPrototypeWorld` plus `runTick`, no player commands. Seeds 1847, 2718, and 4096. A figure at tick 0 is the world before any `runTick`. A figure at tick 72 or tick 1200 is the world after that many calls. Tick numbers on events are the `tick` field. Tick 0 hashes are `f4411b174c7da0bd4b4c8a2e2dc6cc58b3caed7592f1854af04c28acb2ca5698`, `2a041b435821447be7426b5db5f51bf9985bf88638e07b9d0981f03f95b39142`, and `bb73f7fbb6dc3410458e9ce21128e227510d2f4d1e3331ca673aff8d8d150412`.

[Game vision](game-vision.md) says a dominant faction may stay dominant, and that defeat wounds, scatters, imprisons, and debts a named character. Death enters through old age. [World simulation](world-simulation.md) says noncombat skills grow through repeated use, mentorship, difficult successes, and assignable experience, and that each tier of raw strength asks for more experience. Troop stacks earn experience. The player chooses which eligible soldiers are promoted. Rarity belongs to individual recruits: common, rare, or epic. Rarer recruits have greater growth potential. This note does not add a multiplier whose job is to pull a faction back.

The neighbouring notes are the ground. [Aging](aging.md) is the age model this interaction uses. The year in section 5 is that note's check-in scale, 180 ticks, thirty world days. [Offices](offices.md) is the stipend. [Treasury spending](treasury-spending.md) and [treasury balance](treasury-balance.md) are the 18-a-day mate allowance and the uncapped holder. Recruiting and battle are the code: `recruited` in `src/sim/engine.ts`, and `partyPower` plus `resolveImmediateBattle` / `resolveBattlePhase`.

## Summary

Four skills exist. Four attributes exist. A troop stack has a count, an experience, and a discipline. Nothing in the 1200 ticks writes a skill, an experience, or a discipline. Recruiting adds bodies to the same stack. Two of the thirty characters are veterans because setup uses a second range for index 0 and index 13. There is no rarity field.

Work, travel, and battle are the feeds. On these runs the counts are 7222 / 7604 / 7138 works, 2440 / 2466 / 2484 voyages, and 50 / 43 / 51 finished battles. A probe that closes 0.1% of the gap to 100, per use, moves the 72-tick hash on every seed. The same probe on troop experience moves the hash inside 72 ticks as well. On 1847 and 2718 the first changed decision is tick 606. On 4096 the event list matches the baseline through tick 1200 and the wins stay 44 and 7. A promotion label at the setup bands crosses 0.35 for 2, 4, and 2 characters and never reaches the veteran band. A side-stream rarity tag changes no battle and does change the hash. The 180-tick deaths take work and travel off the feed and take no battles.

## 1. What skills and stats exist today

`CharacterSkills` is strategy, leadership, navigation, and trade. Medicine and cooking are named in the world-simulation note and have no field. `CharacterAttributes` is power, speed, endurance, and resilience. `TroopGroup` is count, experience, and discipline. There is no tier and no rarity.

The reads that already exist:

| Field | Where it is read |
| --- | --- |
| Leadership, trade | `workGross`: `10 + leadership * 0.08 + trade * 0.07` |
| Leadership | Recruit score, `partyPower` (`1 + leadership / 220`), the cover sort, the dock sort |
| Trade | Local buy and sell quantities |
| Navigation | `travelDuration`: `1 - navigation / 220` |
| Strategy | Battle uncertainty: `0.38 * (1 - strategy / 125)` |
| Experience, discipline | `partyPower`: `count * (0.65 + experience * 0.8) * (0.6 + discipline * 0.6)` |
| The four attributes | `personalPower`, then `partyPower` |

Setup draws them once. A veteran is `index === 0 || index === 13`, Mara Vane and Pax Ash, on every seed. Veteran experience is `between(0.55, 0.8)`. Everyone else is `between(0.05, 0.35)`. Veteran attributes are the high bands. Officers draw discipline `between(0.7, 0.92)` and strategy `integer(58, 86)`. The other archetypes draw discipline `between(0.35, 0.78)`. Explorers draw navigation `integer(60, 88)`. Merchants draw trade `integer(64, 90)`. Six characters are each archetype.

Measured at tick 0, the same on the way out to tick 1200. No skill, experience, or discipline changed. The event log has no `captivity-escaped`, so the escape scar, which is the one attribute write in the tree, does not fire.

| Seed | Strategy | Leadership | Navigation | Trade |
| --- | --- | --- | --- | --- |
| 1847 | 18–86 | 25–77 | 20–86 | 18–90 |
| 2718 | 20–85 | 21–81 | 21–86 | 17–89 |
| 4096 | 18–86 | 21–82 | 20–78 | 15–88 |

Experience at tick 0, all three seeds: 28 characters under 0.35, none from 0.35 up to 0.55, the two veterans from 0.55 up to 0.8, none at 0.8 or over. The measured veteran experience is 0.668490 and 0.667760 on 1847, 0.742403 and 0.654080 on 2718, 0.705577 and 0.749533 on 4096. Officer discipline on 1847 runs from 0.709566 to 0.905655. Other archetypes on that seed run from 0.358197 to 0.764937, so a non-officer can sit inside the officer draw. Veteran power is drawn from 68–82, speed from 60–78, and endurance and resilience from 65–82. Everyone else draws power and speed from 20–55 and endurance and resilience from 25–58. The measured non-veteran attributes top out at 58 on all three seeds.

Troop counts at tick 0 run from 12 to 92, 14 to 86, and 12 to 96. At tick 1200 the maxima are 685, 703, and 535. The stack got larger. The experience on it did not move.

## 2. How skills grow from use

The world-simulation note grows a skill by using it, and makes the next point of the same skill cost more. The probe used here is that shape and is not a chosen power target. On a feeding action the skill becomes `round(min(100, skill + (100 - skill) * rate), 3)`. The rate in the default resim is 0.001. The rate 0.01 is a sensitivity. A miss writes the new absolute on the event that already happened. `applyEvent` copies that absolute and does not draw.

The feeds, and why each one:

| Action | Skill | Why this action |
| --- | --- | --- |
| `worked` | Leadership and trade | `workGross` reads both |
| `travel-started` | Navigation | `travelDuration` is fixed when the voyage starts |
| `battle-resolved` | Strategy and leadership | Uncertainty and `partyPower` read them on the next fight |

`travel-progressed` and `battle-phase-resolved` are the larger pools. They are counted below and were not the write. A retreated battle does not resolve, so it does not practice.

Baseline counts over 1200 ticks:

| Seed | Worked | Voyages | Sea ticks | Battles finished | Phases | Retreats | Raids decided |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1847 | 7222 | 2440 | 7509 | 50 | 101 | 15 | 70 |
| 2718 | 7604 | 2466 | 7409 | 43 | 85 | 14 | 61 |
| 4096 | 7138 | 2484 | 7528 | 51 | 90 | 12 | 65 |

Every raid becomes a battle: 53, 47, and 48 are `battle-started`, and 17, 14, and 17 of the finished battles are immediate, with no `battle-started`. 53 + 17, 47 + 14, and 48 + 17 are the raid decisions.

Work per character, minimum / lower quartile / median / upper quartile / maximum: 0 / 43 / 284 / 354 / 741, 0 / 79 / 221 / 331 / 834, and 0 / 40 / 223 / 317 / 788. Voyages: 0 / 18 / 40 / 151 / 263, 0 / 9 / 46 / 148 / 221, and 0 / 8 / 73 / 139 / 242. Finished battles: 0 / 0 / 1 / 2 / 10, 0 / 0 / 0 / 1 / 8, and 0 / 0 / 1 / 3 / 8. Characters with no finished battle: 13, 15, and 14.

Mara Vane works 0, starts 0 voyages, and finishes 0 battles on every seed. Her sea ticks are 4, 4, and 0, from a voyage she did not start. The other characters with 0 work are Toma Reef, Bram Tern, and Toma Hale on 1847; Bram Quill, Bram Tern, and Toma Hale on 2718; Toma Reef, Lio Crow, Zara Gale, and Bram Tern on 4096. Pax Ash works 118, 107, and 177, starts 82, 138, and 145 voyages, and finishes 6 battles on every seed.

The open-loop curve applies the formula to each character's own baseline counts and writes nothing. Leadership is work plus finished battles. Trade is work. Navigation is voyages. Strategy is finished battles. Minimum / median / maximum at tick 1200 under rate 0.001:

| Seed | Leadership | Trade | Navigation | Strategy |
| --- | --- | --- | --- | --- |
| 1847 | 32.058 / 60.394 / 78.523 | 28.908 / 56.7475 / 90 | 20.400 / 48.7355 / 87.297 | 18 / 43.5 / 86.014 |
| 2718 | 29.071 / 61.5005 / 83.030 | 23 / 56.9105 / 89 | 21 / 54.061 / 87.154 | 20.080 / 47.578 / 85 |
| 4096 | 22.546 / 65.0525 / 85.010 | 33.870 / 58.5345 / 88.036 | 21.553 / 47.799 / 80.856 | 18.246 / 45.528 / 86.028 |

Strategy barely moves, because most characters finish one battle or none. The same curve on sea ticks instead of voyages, navigation only, reaches medians 56.6195, 61.6905, and 60.387. That pool was not written.

A single skill, from the formula alone, rate 0.001 then rate 0.01:

| Start | After 40 | After 200 | After 700 | Rate |
| ---: | ---: | ---: | ---: | ---: |
| 25 | 27.942 | 38.603 | 62.768 | 0.001 |
| 77 | 77.902 | 81.170 | 88.585 | 0.001 |
| 25 | 49.827 | 89.953 | 99.934 | 0.01 |
| 77 | 84.614 | 96.916 | 99.951 | 0.01 |

The closed loop writes the 0.001 step. The world then chooses different actions, so the ending skills are not the open-loop row. Minimum / median / maximum:

| Seed | Leadership | Trade | Navigation | Strategy |
| --- | --- | --- | --- | --- |
| 1847 | 31.990 / 60.735 / 78.291 | 30.107 / 56.244 / 90 | 20.400 / 48.7475 / 88.600 | 18.082 / 43.5 / 86.028 |
| 2718 | 29.284 / 57.484 / 83.370 | 23 / 54.4155 / 89 | 21 / 54.2185 / 87.089 | 20.160 / 47.578 / 85.015 |
| 4096 | 21 / 64.7355 / 83.827 | 33.540 / 56.392 / 88.096 | 21.034 / 47.7855 / 80.761 | 18.328 / 45.556 / 86.028 |

Replay of each log through `applyEvent` matched the live state hash. The 0.01 resim pushes leadership medians to 93.7385, 92.7325, and 93.846, with maxima 99.520, 99.140, and 99.141. That is the sensitivity. It is not the default step.

## 3. Troop tiers, promotion, and rarity

A finished battle is the troop feed. The probe closes 2% of the gap from experience up to 1, `round(..., 6)`, and on an attacker victory closes 1% of the gap from discipline up to 1. Both are capped at 1. The battle that earns them still uses the old stack. The next battle reads the new one, because `partyPower` already uses experience and discipline. Recruit does not change either number. A new soldier joins the stack he joined.

The bands are the setup ranges, not a new ladder. Under 0.35 is the ordinary draw. From 0.35 up to 0.55 is the gap between the two draws. From 0.55 up to 0.8 is the veteran draw. At 0.8 the veteran generator stops, because `between(0.55, 0.8)` never reaches 0.8. The label is stored only when a battle crosses into a higher band. `partyPower` does not read the label. There is no second multiplier.

Crossings in the troop resim, all of them into the gap under 0.55:

| Seed | Tick | Character | Experience after |
| --- | ---: | --- | ---: |
| 1847 | 616 | Esme Dusk, raider | 0.351622 |
| 1847 | 1025 | Jun Marrow, steward | 0.359439 |
| 2718 | 23 | Iris Stone, officer | 0.357060 |
| 2718 | 445 | Finn Frost, explorer | 0.350622 |
| 2718 | 1123 | Ada Sorn, explorer | 0.357611 |
| 2718 | 1147 | Corin Hale, officer | 0.356779 |
| 4096 | 394 | Iris Stone, officer | 0.354565 |
| 4096 | 914 | Finn Frost, explorer | 0.351308 |

Eight crossings. None reach 0.55. None reach 0.8. Ending experience minima and maxima are 0.057359 and 0.693553, 0.050612 and 0.742403, 0.070069 and 0.778126. The 2718 maximum is the baseline maximum. That veteran did not finish a battle. Discipline maxima move from 0.905655, 0.909883, and 0.863411 to 0.907532, 0.912559, and 0.867468.

Rarity is a separate fact from the tier. The rare stacks on this tape are the two veterans. They are rare because `makeCharacter` uses a second range for two indexes, not because a recruit rolled. Officers are 6 of 30 because the archetype cycles every fifth character. Their discipline draw is higher, and section 1 already shows the overlap. No `recruited` event rolls. The measured recruit counts are 1835, 1598, and 1464, for 10159, 9296, and 8360 soldiers. The cost is 12 each, so the sums are 121908, 111552, and 100320. Arms leave the shelf at 0.35 a soldier.

A side-stream tag was measured and is not the default. The stream is a `DeterministicRng` forked from `world.rngState` at setup. It is not written back. Each `recruited` event draws once and stores the roll. At or above 0.95 the stack is marked epic. At or above 0.70 it is marked rare. Under 0.70 the field is omitted. The cuts are a probe. They are not a share the design is aiming at. Counts are 1293 ordinary, 447 rare, and 95 epic on 1847; 1115, 399, and 84 on 2718; 1034, 356, and 74 on 4096. Those sums are the recruit counts. `partyPower` does not read the mark.

## 4. The costs

The costs that already exist stay the costs. This note does not add a price to slow a skill down.

A soldier costs 12 coins and 0.35 arms. The recruit gate is 30 coins and 2 arms on the shelf. The measured spend is the 12-coin sums in section 3.

Passage is `PASSAGE_COST_PER_TICK`, 3, on each sea tick, allowance first and then the purse. A short purse pays what it has. Sea ticks and the coins actually paid: 7509 and 22490.48, 7409 and 22225.73, 7528 and 22575.02. The per-tick figures are 2.995, 3.000, and 2.999.

Provisions burn whether the party sails or stands: `0.12 + sailors * 0.008 + troops * 0.004` each upkeep. Upkeep rows are 34774, 35030, and 35279.

`workGross` is the pay for one `worked`, before the port tax. Measured gross and tax: 118304.60 and 12072.23, 121588.39 and 12677.37, 116569.04 and 12890.85.

The mate allowance is `ticksPerDay * PASSAGE_COST_PER_TICK`, 18 a day, and it shrinks when the treasury cannot pay 18 to every free mate. The holder is uncapped. Measured `treasuryDrawn` over 1200 ticks is 27398.22, 29100.42, and 31756.51. Allowance draws are 24815.81, 25970.02, and 28792.07. Holder draws are 2582.41, 3130.40, and 2964.44.

The governor stipend is the offices brief: 18 a day, paid when headroom still covers 18 for every free mate and 18 for every seat. It is not in the tree. This note does not refit it. A skill that raises `workGross` raises pay and can raise the tax. That is the treasury move in section 7. It is not a reason to cut the 18.

## 5. Aging on a 180-tick year

The year is the check-in scale in [aging](aging.md): 180 ticks, thirty world days. The run stays 1200 ticks. Ages are the span draw, `DeterministicRng(seed).integer(18, 119)` in id order. A character dies when `start + tick / 180` reaches 120. The death is fixed, so it draws nothing. Succession is vacant. The same four deaths the check-in resim counted:

| Seed | Deaths | Each death |
| --- | ---: | --- |
| 1847 | 1 | Tick 1080, Lio Crow (`character-12`), merchant. |
| 2718 | 2 | Tick 180, Lio Crow (`character-12`), merchant. Tick 720, Esme Dusk (`character-19`), raider. |
| 4096 | 1 | Tick 540, Kessa Dusk (`character-30`), steward, unaffiliated. |

No death has an event tick under 72.

On the baseline tape, the actions those characters still take at or after the death tick are the feeds a death removes. Lio on 1847: 8 work, 15 voyages, 58 sea ticks, 0 battles, out of 39 work and 148 voyages. Lio on 2718: 59 work, 134 voyages, 517 sea ticks, 0 battles, out of 70 work and 159 voyages. Esme on 2718: 118 work, 0 voyages, 2 sea ticks, 0 battles, out of 344 work and 6 voyages. Kessa Dusk on 4096: 214 work, 0 voyages, 0 sea ticks, 0 battles, out of 468 work and 21 voyages. None of the four has a finished battle on either side of the tick. Aging on this year takes work and travel off the growth pool. It takes no battle practice from these four.

The combined resim, the 0.001 skill step plus these deaths, matches the skill-only hash at tick 72, because the first death is tick 180. Tick 1200 moves. Hashes and the battle counts are in section 7.

## 6. Determinism

The skill step and the troop step draw nothing. They are a function of the stat and the rate. The rarity probe draws from a side `DeterministicRng` forked from `world.rngState` at setup. The fork is not written back. The roll is stored on the `recruited` event. `applyEvent` copies the mark and does not draw again. A fixed death draws nothing. A chance death, which the aging note already measured, stays on its own side stream.

Every slice below was replayed by cloning the world after setup and reapplying every event through `applyEvent`. Every replay matched the live state hash.

## 7. Slice plan

The slices are in the order they would land. Slices 2, 3, and 5 are each measured from the baseline. Slice 4 is measured on top of slice 3, because a label cannot cross a band the experience never leaves. Slice 6 is the skill step plus the deaths in section 5. The 0.01 skill rate is not a slice.

| Slice | What lands | Hash on these three seeds |
| --- | --- | --- |
| 1 | A readout. Skills, troop quality, the feed counts, the battle totals. Nothing is written. | Neutral. The baseline table at the top. Attacker wins and defender wins are 32 and 18, 32 and 11, 44 and 7. Claims are 24, 25, and 30. |
| 2 | `worked`, `travel-started`, and `battle-resolved` carry the new skill absolutes. Rate 0.001. `applyEvent` writes them. | The 72-tick hash moves. Tick 72 hashes `86507558d49cee305c5f663e1699aacc19d66356ce518d4c32ac1e07085d8687` (8426), `c6268c398c5b8a674a1bef8a675cd74c747392e3fb767a67e1ebd8bc1a4143f6` (8335), `d62ab7f9c9e840b55c012fb1d8f2fe6929a61359178b4daf7b5eb10cbf7bca95` (8266). Tick 1200 hashes `3d08cca13c1ddf963d369db24c8a73eb875882a6ac148263335d14fe0787941a` (161673), `59d46d43f0c109b5525de4dc69b75e4c43f828041cf24a0c4d25bd8361837f60` (164332), `323cbb1f4f07a40f8fab184fc5562033e84c5ece9065e37f6df5c637e6125b75` (161202). |
| 3 | Finished battles write experience and, on an attacker victory, discipline. | The 72-tick hash moves, because a battle inside the window stores the new experience. Event counts at tick 72 stay 8413, 8456, and 8261. Tick 72 hashes `cff8b2a6500c6dcad0d51391b455202ae680e95b1a3ef33c533761068815b092`, `bd3969cac749464ea74082cb086533f4357d7ffcc385a04932491d57a20a2de6`, `ce154bfda535032a3eab5e2f5428ce1e1e6588718bd8f61a529af03b1929dc67`. Tick 1200 hashes `95460e4d79d88eb6e4aa4622203cd7a20ef088dcf21fbb129cbfdce4a77dc5ef` (158910), `8e30edb12e3ee76bde8d947884d35445416fa740f747ebce0bb09d7b0bcb75f7` (161287), `b529b2840205a782a1e6c2d5db06061f68676e5b851b6b3c5ac79f89fac56eee` (162459). |
| 4 | The promotion label, on top of slice 3, when experience crosses 0.35, 0.55, or 0.8. | Event counts match slice 3 at tick 72 and at tick 1200. Tick 72 matches slice 3 on 1847 and 4096. On 2718 it moves, because Iris Stone crosses at tick 23: `246327dc58d20fee3d5cd1412e6fdca5fb6d002b48b046e2c996c216de145d89`. Tick 1200 hashes `23a4b271443e232b6c68270d71028c4104936c81eafedf1e72ce9bee408d9f57`, `dde17506a1e3712b8e679a5ae90ba15024648c6ebd776ed5a084781787abb439`, `3c282df7f608067fed2398f3e8f5ebae98dbb50ad9bfffa63707a60d4cba74be`. Wins match slice 3. |
| 5 | The rarity mark on `recruited`, side stream, unread by `partyPower`. | Event signatures match the baseline through tick 1200. Wins, losses, claims, and both treasuries match the baseline. The hash moves. Tick 72 hashes `c16dabbef0351fe4dfd52c8b5d0aef53f94df3a515bfe6517ab2345055f33987`, `845895eaec72534b2048b5c61cc894e0f30b1a4f8c77236c81fc7c5e24261edb`, `522825d68a428d6aa7b403b42213668625310b9ae26ebfac94078fb9082d1f99`. Tick 1200 hashes `3de83ffadaf62d83b0a8d56ec760271ade9ae2f8be03bc034524000c30f0ca91`, `1cbd5f85a074f287bf76829ece1672096d4017bef241a389f88b3645850db757`, `f41ce85af215772e6aba9af7453b0d60e913d46442c967b9727bc36432d82ef3`. The first rare or epic mark is event tick 0, 0, and 0. |
| 6 | Slice 2, and the fixed deaths in section 5. | Tick 72 matches slice 2, hash and event count. Tick 1200 hashes `8dddd8d54cd57b1e2abd3c0ed11bdf4597e03f05c16d721f229c4f92824646fb` (160807), `655cb5583bf4c81539fccd8e9f42d9fa87ac072eab0dd0769283786babde34df` (158867), `8c1a806a5323f340e3903f71b3b2662fb1e0a6f58c5a7a5977d0a3f1b1f23bd7` (158343). |

The first signature diff is the first event whose tick, type, actor, settlement, or target disagrees with the baseline.

Slice 2. 1847: index 5475, tick 47, `decision-made` for Kessa Calder at Verdant Cay, target empty against `cinder-key`. 2718: index 3170, tick 26, Kessa Dusk at Glassport, `worked` against `recruited`. 4096: index 5630, tick 48, Kessa Dusk at Verdant Cay, `worked` against `recruited`. Attacker wins and defender wins become 36 and 13, 43 and 9, 53 and 11. Finished battles are 49, 52, and 64. Claims are 30, 28, and 32. Ending treasuries are World Government 9276.44, 12049.47, and 11749.29, and Free Tide 16.46, 123.68, and 59.06. The baseline ends are 13149.1, 14874.12, and 12600.45, and 24.88, 7.91, and 41.76.

Slice 3. 1847: index 76931, tick 606, Esme Dusk `decision-made` at Crown Harbor, target `crown-harbor` against empty. 2718: index 76770, tick 606, Finn Frost at Cinder Key, `recruited` against `rested`. 4096: no signature diff through tick 1200. Wins become 38 and 18, 34 and 11, and stay 44 and 7. Claims become 28, 26, and 30. Treasuries become 15396.69 and 55.43, 14553.51 and 20.65, and stay 12600.45 and 41.76. The 4096 event list matches the baseline while the state hash does not, because the experience is stored and no later decision reads it into a different action.

Slice 4 changes no win count relative to slice 3. The eight crossings are the table in section 3.

Slice 5 changes no win, no claim, and no treasury. The hash is the stored mark.

Slice 6 wins are 37 and 13, 43 and 12, 44 and 11. Finished battles are 50, 55, and 55. Claims are 30, 31, and 27. Treasuries are 9651.87 and 40, 12677.4 and 92.23, 9098.88 and 29.78.

The 0.01 sensitivity moves the fixture earlier. First diffs are tick 16, Jun Ash at Cinder Key, a `decision-made` whose target drops `glassport`; tick 12, Kessa Calder at Verdant Cay, `worked` against `recruited`; tick 7, Jun Ash at Crown Harbor, `worked` against `recruited`. Wins become 42 and 9, 41 and 9, 49 and 10. Treasuries become 8264.39 and 36, 11153.02 and 48.13, 7742.99 and 123.17.

## 8. Questions for the Lead

The Lead rules on these against [game vision](game-vision.md). Defaults are what this brief would build. None of the rates below is a balance target. A step whose purpose is to keep the factions level is not a default.

1. **Which skills grow, and from which actions?** Default: the four fields that exist. Medicine and cooking stay out until they are fields. `worked` practices leadership and trade. `travel-started` practices navigation. `battle-resolved` practices strategy and leadership. Sea ticks and battle phases are the larger pools and are not the default feed. On this tape those feeds are 7222 / 7604 / 7138 works, 2440 / 2466 / 2484 voyages, and 50 / 43 / 51 finished battles.

2. **How large is the step?** Default: close 0.1% of the gap to 100, rounded to 3 decimals, capped at 100. The open-loop medians for leadership are 60.394, 61.5005, and 65.0525. The 1% step is the sensitivity in section 2. It puts leadership medians in the 90s and moves the first decision to tick 16, 12, and 7. The size stays the Lead's. The 0.1% resim is slice 2.

3. **Where is the new skill stored?** Default: the absolute on the feeding event, written only in `applyEvent`. The event does not draw. Replay of every measured log matched the live hash. A side write that skips the log does not.

4. **Do troops improve, and who promotes them?** Default: a finished battle closes 2% of the experience gap to 1, and an attacker victory closes 1% of the discipline gap to 1. Recruit adds bodies at the stack's current experience and does not roll. The world-simulation note leaves the promotion choice with the player. A headless run does not mint that choice. It stores a label when experience crosses 0.35, 0.55, or 0.8, and `partyPower` keeps reading the number. On these runs the crossings are the eight rows in section 3, all of them under 0.55.

5. **What is rare, and why?** Default: the two veterans, because setup draws their experience, attributes, and leadership from the high range and draws everyone else from the low range. Officers are six of thirty because the archetype cycles. Their discipline draw overlaps the other archetypes, as section 1 measured. A side-stream rare/epic mark at 0.70 and 0.95 was measured in slice 5. It changed no battle. It is not the default, and it is not a share picked to balance the pool.

6. **What do the costs stay?** Default: 12 coins and 0.35 arms a soldier, 3 coins a sea tick, provisions by the formula in section 4, 18 a day for a mate, the holder uncapped. The offices stipend stays 18, from headroom, and this note does not refit it. Slice 2 already moves the treasuries. That move is not a reason to cut the 18.

7. **How does this meet aging?** Default: a dead character practices nothing further. The year is 180 ticks. The run stays 1200. The deaths are the four in section 5. None fall inside the first 72 ticks. They remove the work and the voyages counted there, and they remove no finished battle. Slice 6 matches slice 2 through tick 72 and leaves it by tick 1200.

8. **Which RNG?** Default: the skill step and the troop step draw nothing. A rarity roll, if a later slice adds one, uses a side stream forked from `world.rngState` at setup, stores the roll on the event, and does not draw inside `applyEvent`. The tick rng is the wrong stream. One discarded draw on it moves the first decision of tick 0, which is the result the aging note already measured for a death roll.

## Ruling

The Lead has ruled.

Every default in section 8 is accepted. The skill step ships first. That is slice 2: `worked`, `travel-started`, and `battle-resolved` store the new skill absolutes at rate 0.001, and `applyEvent` writes them. The 72-tick hash moves on every seed, so the fixture is re-pinned when that slice lands. Troop experience, the promotion label, and the rarity mark stay behind it.
