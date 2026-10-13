# Aging

**Status: Ruled.** The Lead's answers are in [Ruling](#ruling). Nothing in this note is in the tree. The census is a local readout of the baseline tape. The resims were produced by a local harness and were not left in the tree.

Checked on `origin/main` at `97fbbd4afbc3009537fc40af4a8e45cac18ea1bf` (PR #92). Node v24.21.0, ICU 78.3. `npm test` passed, 379 tests. The 72-tick fixture passed, including the golden recovery replay of 600 events on seed 1847 split at tick 47. A separate headless run reproduced the fixture and the 1200-tick baseline:

| Seed | Tick 72 state hash | Events | Tick 1200 state hash | Events |
| --- | --- | ---: | --- | ---: |
| 1847 | `4ea893a485b05ce6eab599919765903ade9a0ce45f383437f4698064faa7a297` | 8413 | `90dacc2dfcd199ab720ade191bd3fdf8742632a36f19216bd53ce0e3a3294fef` | 160268 |
| 2718 | `d376ad02c6e7c9b03dd0eb4db1c3c137ac7a00d61a096673e12ae4fdabbdfef2` | 8456 | `226bf6257a86b233d197bd77747a10fe64b33dd7ac1e94bc27c11ff3ddf50cd8` | 161850 |
| 4096 | `ac780b3999c3da53f38c0cd16301dfa7f60562a35796f5fa0451c969c9ed08de` | 8261 | `30e9994387b2c9a2d8c0e16e27042797599188a105992cb7a9f8d2e924a8b0a6` | 162459 |

Runs are `createPrototypeWorld` plus `runTick`, no player commands. Seeds 1847, 2718, and 4096. A figure at tick 0 is the world before any `runTick`. A figure at tick 72 or tick 1200 is the world after that many calls. Tick 0 hashes are `f4411b174c7da0bd4b4c8a2e2dc6cc58b3caed7592f1854af04c28acb2ca5698`, `2a041b435821447be7426b5db5f51bf9985bf88638e07b9d0981f03f95b39142`, and `bb73f7fbb6dc3410458e9ce21128e227510d2f4d1e3331ca673aff8d8d150412`.

[Game vision](game-vision.md) says defeat wounds, scatters, imprisons, and debts a named character, and death enters through old age. It also says one real month equals one world year, and a dominant faction may stay dominant. [World simulation](world-simulation.md) says age is cosmetic until 60, a modest physical penalty follows, a large one follows after 80 and is applied to accumulated power rather than through a hard cap, characters over 80 face a death chance weighted against the weaker and the less experienced, and everyone dies by 120. After the player's character dies, the player creates a new young heir who did not exist. Debts and contracts settle first. A will controls ordinary assets. Unclaimed property is contested or returns to the settlement. [Roadmap](../roadmap.md) lists aging, age penalties, death by old age, and inheritance as untracked, and records that no character age exists.

The neighbouring notes are the ground. [Secession](secession.md) is declared by the owner, and the offices brief moves that declaration to the governor. The full gate needs a rate above 0.15 and stability at or below 55. [Offices](offices.md) seats a governor from the free command holder; the acting commander does not appoint. [Leader tax](leader-tax.md) lets the free holder set the rate; the acting commander does not. [Treasury spending](treasury-spending.md) and [treasury balance](treasury-balance.md) leave the holder uncapped and the mates on an 18-a-day share. [M33](m33-release-record.md) recovers by replaying later events through `applyEvent` only. `applyEvent` throws on an unknown type. The event log is counted. `stateHash` is the world.

## Summary

Characters have no age. Health on these runs never falls below 1, and nothing in the tree emits a death. Thirty characters stay. Contracts on the baseline are 0. The command holders at tick 1200 are still Mara Vane (`character-01`) and Pax Ash (`character-14`). Acting commanders at tick 1200 are null. The runs spend 84 and 84, 84 and 252, and 0 and 84 states in a regency.

A world year on the clock already in the sim is 365 world days. `ticksPerDay` is 6, and one tick is four world hours, so that year is 2190 ticks. These 1200 ticks are 200 world days, which is 1200/2190 of that year. The 72-tick fixture is 12 world days. "One real month equals one world year" is the server's pacing. It is not a tick count, and it is not a reason to compress a year until someone dies inside this run.

On that calendar, every starting age measured here produces 0 deaths in 1200 ticks, fixed or by chance. Storing an age at setup moves the hash before the first tick. Writing the age only when an integer year arrives, through `applyEvent`, writes nothing on the calendar and leaves both hashes on the baseline. A death is the same shape: one `character-died` event, cause `old-age`, carrying the absolutes, applied only in the reducer. A certain death at 120 draws nothing. A chance between 80 and 120 draws from a side stream and stores the roll on the killing event. Drawing it from the tick rng moves the first decision of tick 0 even when nobody dies.

The seat does not pass to the acting commander. That cover is for captivity. A dead holder leaves the faction, the orders stay issued by them, and `commandHolderId` no longer sees them, so the seat is vacant. The player's heir is a new character and is not minted by a headless run. Giving the purse, the crew, and the ports to the next cover, and retargeting the orders, was measured. It makes that cover the uncapped holder. On the calendar none of this fires. The compressed years below are sensitivities. They are how many deaths a shorter year would manufacture. They are not a balance pass.

## 1. The age model

`Character` has no `ageYears`. The thirty names are the same on every seed. Archetypes cycle officer, merchant, explorer, raider, steward. World Government is `character-01` through `character-13`. Free Tide is `character-14` through `character-22`. `character-23` through `character-30` are unaffiliated. Mara Vane is the human player and the World Government issuer. Pax Ash is the Free Tide issuer. The reporting officers are Jun Marrow (`character-05`), Iris Stone (`character-06`), and Rook Tern (`character-11`).

Four starting ages were read at tick 0. None of them is stored in the tree. Experience is `round(troops.experience * 100, 3)`. Attribute is the mean of power, speed, endurance, and resilience, rounded to 3 decimals. Cosmetic and span are `DeterministicRng(seed).integer` in id order, from `character-01` through `character-30`. That stream is not `world.rngState`. Cosmetic is `integer(18, 59)`. Span is `integer(18, 119)`.

| Seed | Experience | Attribute | Cosmetic | Span |
| --- | --- | --- | --- | --- |
| 1847 | 5.07–66.849, over 60: 2, over 80: 0 | 30.25–76, over 60: 2, over 80: 0 | 22–57, over 60: 0 | 29–114, over 60: 22, over 80: 14 |
| 2718 | 5.061–74.24, over 60: 2, over 80: 0 | 32–76.5, over 60: 2, over 80: 0 | 19–59, over 60: 0 | 20–119, over 60: 13, over 80: 6 |
| 4096 | 5.109–74.953, over 60: 2, over 80: 0 | 28.75–75.75, over 60: 2, over 80: 0 | 19–59, over 60: 0 | 21–117, over 60: 16, over 80: 10 |

Nobody starts at 120 or over. The two people over 60 on the experience map and on the attribute map are Mara and Pax, on every seed. Nobody else on those two maps is over 60, and nobody on them is over 80. Cosmetic stays under 60. Span is the only map with anyone over 80. The death resims use span. On that map the "over 60" count above includes the people over 80. The store-age run, which writes the same span ages and does not read them, counts 8 and 14, 7 and 6, and 6 and 10 once the people over 80 are split out.

Age during a run is `start + tick / ticksPerYear`. Four year lengths were read.

| Scale | Ticks in the year | What that year is | Years inside 1200 ticks |
| --- | ---: | --- | --- |
| Calendar | 2190 | 365 world days, the day clock times 365 | 1200/2190 |
| Check-in | 180 | `CHECK_IN_TICKS`, thirty world days | 1200/180 |
| Fixture | 72 | the golden window, twelve world days | 1200/72 |
| Day | 6 | one world day | 200 |

365 is not a constant under `src/`. The clock that is in the tree is the day: six ticks, four hours each. The check-in, the fixture, and the day are shorter years used as a sensitivity. A birthday is the tick where `floor(age)` increases. On the calendar, span ages are integers at tick 0 and the next integer is 2190 ticks later, which these runs never reach. No birthday is crossed. That is why a calendar chance never rolls.

## 2. What aging does before a death

Until an age is stored, nothing reads one. The probe that was run subtracts from the four physical attributes inside `personalPower` only, and only when `ageYears` is already set. Over 60 it subtracts 1. Over 80 it subtracts 3. The attributes on the character are not written down. There is no hard cap. One and three are the probe. They are not a magnitude chosen by the design. The design says modest, then large, on accumulated power.

The probe was applied to span ages, stored at tick 0. At that instant the power deltas are 22, 13, and 16 characters, sums 50, 25, and 36, each delta 1 or 3. Fourteen, six, and ten of those deltas are 3, which is the over-80 group, and the sums match `14×3 + 8×1`, `6×3 + 7×1`, and `10×3 + 6×1`. Mara is not in the 1847 list. Pax is: 76.36 to 73.36 on 1847, and 69.52 to 66.52 on 4096. The probe kills nobody.

It does move the world. The 72-tick state hash moves on all three seeds. On 1847 the event count at tick 72 stays 8413, and the first signature diff is later, index 11117, event tick 94, `worked` against `recruited` for Dax Pike at Glassport. On 2718 the first signature diff is index 4532, event tick 38, `market-trade` against `worked` for Orin Rill at Verdant Cay, and the tick-72 count is 8337. On 4096 it is index 4185, event tick 36, `decision-made` against `plan-reconsidered` for Orin Rill, and the tick-72 count is 8279.

| Seed | Tick 72 state hash | Events | Tick 1200 state hash | Events |
| --- | --- | ---: | --- | ---: |
| 1847 | `ad2feade9fa06a036abebe5e254afd2b341726c07ff59f74b56f11bb1445e48f` | 8413 | `4e03c870b28728a033813e5091862cc90af69dd1aa7d7eee9dd61c0efdaac59b` | 161995 |
| 2718 | `7d0a7552d12f025e5282de4ba57b38e4086ec244160c8cd7bbe6d61e9dafc846` | 8337 | `8738013edaf93173b599e6293ae0a800b6a2343fb74c698154cbc38cffb10beb` | 164046 |
| 4096 | `040a30193ae319a5fc45ef65e28d7e126a9fcb242c9b1cb4f822c50663705560` | 8279 | `89be9346eb65b694f1aa0c5caad85d4efdf4d169dc56d83ae3a5fcd2491bbaba` | 163508 |

Ending treasuries on that probe are World Government 11289.67, 10842.5, and 11624.69, and Free Tide 45.99, 17.7, and 46.8. Free Tide reaches 0 on 1847 and 4096, for 11 and 4 ticks. On 2718 the minimum is 0.29 and the ticks at 0 are 0. The full secession gate stays 0. The open-tax readout moves, to 50 / 30, 70 / 24, and 308 / 27 port-ticks and spells. That probe is what a stored span age would do. It was not run on the experience, attribute, or cosmetic maps. Those maps were not given a penalty resim. Experience and attribute would touch Mara and Pax at tick 0, because those two are already over 60. Cosmetic would touch nobody at tick 0, because every cosmetic age is under 60.

Health is a different floor. The minimum health on the baseline is 1. [Political layer](political-layer.md) already records that floor, and there is still no death event.

## 3. How a death is chosen

Two rules were measured. Both are deterministic.

**Fixed.** When `start + tick / ticksPerYear` reaches 120, the character dies. No roll.

**Chance.** Under 80, or at 80, the chance is 0. At 120 or over, the character dies and no roll is drawn. Between those, on the tick an integer year arrives, the character dies when a roll is below `((age - 80) / 40) * (1 - strength)`. Strength is `(physical / 100 + troops.experience) / 2`. The product is clamped to 0–1. A weaker, less experienced character fails the roll more often. The roll is stored on the event only when it kills. A miss emits nothing.

The side stream is a `DeterministicRng` forked from `world.rngState` at setup. It is not written back. The world stream is the tick rng `runTick` builds from `world.rngState`. The tick event stores that rng's state. One discarded `next()` per living character per tick, with no death and no other write, moves the 72-tick hash. The first signature diff is tick 0: index 12, index 12, and index 19, all `decision-made`.

| Seed | Tick 72 state hash | Events | Tick 1200 state hash | Events |
| --- | --- | ---: | --- | ---: |
| 1847 | `df7c9fe0ab885de90f2e9bf94e32b4e31d689963a8fe3036363d0373bf75ba0b` | 8492 | `830f14752bfdd7d5c8c6d5a135e75931d2c1990fae04cba7d5b13c9949d5c37f` | 162562 |
| 2718 | `9ab37834f5a54c0ee9cd9e795896c4eb954af2c07b4ae7fcfb6468a5992173d5` | 8434 | `640891d3033fb932f9fc6a393cd7864fc32dd9f6dfa8c985f13e5b59fa4b2bab` | 162406 |
| 4096 | `def60c2d2308fe99cce70273dd113958b689216343961da5b6eb1044e37047d9` | 8057 | `c6d7121a6f5f0072369caf80c811d0115078c4e967da7eaf0ed6e545797d2e94` | 161137 |

The event is `character-died`. `actorId` is the character. `applyEvent` writes the payload and does not roll again. A log that contains the type cannot recover until the reducer knows it. The measured logs were replayed by cloning the world after setup and reapplying every event through `applyEvent`. Every birthday run and every death run matched the live state hash.

A fixed death of Lio Crow on 1847, day scale, tick 36, vacant:

```json
{
  "type": "character-died",
  "actorId": "character-12",
  "tick": 36,
  "data": {
    "cause": "old-age",
    "ageYears": 120,
    "policy": "vacant",
    "characterMoney": 117.66,
    "sailors": 11,
    "troops": { "count": 18, "experience": 0.13262711998540908, "discipline": 0.5624122578161769 },
    "debts": [],
    "factionId": null,
    "clearCaptivity": false,
    "clearRecovery": false,
    "ports": [],
    "treasuries": [],
    "endBattleIds": []
  }
}
```

A chance death of Bram Quill on 1847, fixture year, tick 72, side rng, vacant. The roll is on the event because this one killed:

```json
{
  "type": "character-died",
  "actorId": "character-02",
  "tick": 72,
  "data": {
    "cause": "old-age",
    "ageYears": 110,
    "policy": "vacant",
    "characterMoney": 265.05,
    "sailors": 11,
    "troops": { "count": 32, "experience": 0.14849378322251142, "discipline": 0.5425489434669726 },
    "debts": [],
    "factionId": null,
    "clearCaptivity": false,
    "clearRecovery": false,
    "ports": [],
    "treasuries": [],
    "endBattleIds": [],
    "roll": 0.5561024576891214
  }
}
```

The same Lio Crow death under inherit, fixture year, tick 432, names the successor and moves the purse and the crew. The body's counts go to 0. The heir's troop experience and discipline stay the successor's. This successor is Mara, because she was the cover, not because a new heir was created:

```json
{
  "type": "character-died",
  "actorId": "character-12",
  "tick": 432,
  "data": {
    "cause": "old-age",
    "ageYears": 120,
    "policy": "inherit",
    "characterMoney": 0,
    "sailors": 0,
    "troops": { "count": 0, "experience": 0.13262711998540908, "discipline": 0.5624122578161769 },
    "debts": [],
    "factionId": null,
    "clearCaptivity": false,
    "clearRecovery": false,
    "ports": [],
    "treasuries": [],
    "endBattleIds": [],
    "successorId": "character-01",
    "heirMoney": 4804.4,
    "heirSailors": 28,
    "heirTroops": { "count": 122, "experience": 0.6684899525833317, "discipline": 0.7603784184996039 }
  }
}
```

Characters are not removed. A deceased character stays in the world, skips decisions, upkeep, captivity draws, troop recovery, dock capture, party sightings, and order confirmation, and `partyPower` reads 0. An active battle in which they are the attacker is deleted by `endBattleIds`. It is not resolved.

## 4. Succession

`commandHolderId` is the standing-order issuer whose faction still matches. It is not a stored field. Two issuers, or none, leave the seat unnamed. The acting commander is the captivity cover: leadership plus scarred loyalty times 50, lower id wins. That cover does not issue, confirm, set the tax, or spend without the mate cap.

**Vacant**, the default that was measured against inherit. The dead character's `factionId` becomes null. Orders are not retargeted. A dead holder therefore stops being the issuer `commandHolderId` can see, and the seat is vacant. If the dead character was the holder, `actingCommanderId` is cleared. If the dead character was the acting commander, the next cover is written, or the field is cleared when the cover sort is empty. The acting commander is not promoted. A captive holder who dies is not released. `clearCaptivity` is true when they were captive, and the scattered troops do not start the return.

**Inherit**, measured and not the default. The same leave-faction write. Purse, sailors, and troops, plus the scattered count, move onto the successor. Ports' `ownerId` becomes the successor. A holder death retargets `issuerId` on standing orders, so the successor becomes the holder and the acting commander is cleared. The successor is the current acting commander when that person is alive, free, and in the faction. Otherwise it is the cover sort. An acting commander's death names the next cover and, under inherit, that cover receives the assets. A holder death is what retargets orders.

The offices readout used beside these runs is the sticky dock rule from [offices](offices.md): the seat clears when the governor is dead, has left the faction, or has become the holder, and a free living holder may seat a member anchored at the port. The acting commander does not appoint. Baseline seatings are 26, 27, and 33. Distinct port-and-governor keys are 18, 18, and 16. That key count is not the offices note's count of distinct people.

No new character is created. The player heir in the world-simulation note does not appear. When Mara dies, the player id is still `character-01`, and the character count stays 30.

## 5. Purse, crew, and ports

Debts already on the character are paid in id order, `min(purse, remaining)`, into the creditor faction's treasury. The unpaid remainder stays on the body. The samples above have an empty debt list. The death tallies below count debt records present at death, not a sum of money.

Under vacant, the remainder of the purse stays on the body, and so do the sailors and the troops. `partyPower` is 0, so the crew does not fight and is not added to a garrison. Ports the character owned get `ownerId` null. They are not left pointing at the corpse. The owner-dead pointer stayed 0 on every resim. Unowned port-ticks rise when a port is cleared.

Under inherit, those same quantities move, as in Lio's event. A port's new owner is the successor. The successor who was also made the holder spends the faction treasury without the mate cap. That is the treasury effect in the tables. It is not a correction aimed at the larger treasury.

## 6. What the scales produce

Two readings are kept apart. The census walks the baseline tape and does not remove anyone, so a later death is still the person they were on the living run. Purse sums on the census are those living purses added up. They are not a treasury. The resim emits the event and continues. Roles, gates, and treasuries below are the resim unless the row says census.

Experience, attribute, and cosmetic, census only. Calendar and check-in, fixed and chance: 0 deaths on every seed. Fixture, fixed: 0. Fixture, chance: 0, except attribute on 1847 kills Pax at tick 810, and experience on 4096 kills Pax at tick 1156. Day, fixed and chance: 30 on every seed and every one of those three maps. Six of each archetype. Both holders, the player, the reporting officer, and all 8 unaffiliated.

Span census, fixed then chance, seeds 1847, 2718, 4096:

| Scale | Fixed | Chance |
| --- | --- | --- |
| Calendar | 0, 0, 0 | 0, 0, 0 |
| Check-in | 1, 2, 1 | 13, 5, 8 |
| Fixture | 5, 4, 3 | 16, 8, 10 |
| Day | 30, 30, 30 | 30, 30, 30 |

The span resims match those fixed counts. Chance was resimmed on the fixture year and the day year only. The side stream matches the census counts 16, 8, and 10. The world stream on the fixture year kills 16, 8, and 11. The extra death is on 4096.

The calendar resim, fixed and vacant, is the baseline table. Zero deaths. Replay matched. Check-in, fixture, and day are the compressed years.

**Check-in, fixed, vacant.** The 72-tick hash stays on the fixture. Tick 1200 moves.

| Seed | Tick 1200 state hash | Events | Deaths | First death |
| --- | --- | ---: | ---: | --- |
| 1847 | `2e6e958f7ed3d1c6bccf610d0e54817a417afbea705c32c1b87bdc1acd1b4fea` | 159664 | 1 | tick 1080, Lio Crow, merchant |
| 2718 | `a221a11d68ada950d397084028daa734fe5bf9e5d23801e1d4eab516833ecc2f` | 156271 | 2 | tick 180, Lio Crow, merchant |
| 4096 | `50c1370143a658121e1c4beada773e60c05f0cc981b57af1b919305bcc5788b6` | 159974 | 1 | tick 540, Kessa Dusk, steward, unaffiliated |

No holder, no player, no reporting officer. On 2718 one of the two is Esme Dusk, governor of Cinder Key at tick 720, raider. Purses at death sum to 14186.45, 1944.6, and 349.57. Sailors 11, 28, and 13. Troops 98, 345, and 266. No ports. Ending treasuries are World Government 13652.48, 14355.47, and 13799.49, and Free Tide 12.3, 45.66, and 150.72. Free Tide's ticks at 0 are 6, 32, and 11. The full gate stays 0. Open-tax port-ticks and spells are 193 / 20, 23 / 19, and 47 / 28. Owner port-ticks stay 2869 on 1847 and 4096 and fall to 2596 on 2718. Unowned port-ticks stay 1935 and 1717 on 1847 and 4096 and rise to 2208 on 2718. The owner-dead pointer is 0.

**Fixture year, fixed.** The 72-tick hash stays, because the first death is event tick 72 or later and the fixture window ends at tick 72. Vacant tick-1200 hashes are `4bc27e4598a35e5047539aaafe020657c330ea9d713fa642cf2a854c5215b31a` (151756), `3809e4a6887710466e3584c42de8a7121c0f42437d590190a7b148f35c22a4d7` (148555), and `c8f2ca069768870c9a247eef240d55d3b639255afefefcbd1380554d97efd91e` (153281). Inherit is `6c9954b641c794aed0ac142958cbd43d7fbab5e2fd236365cb7881db0d903a6e` (150593), `95c146371eb0f0c5cb3fe0d5c947ba5a96e98739f50a532007317870f66fac6e` (147474), and `079eaf61eaaa294bfd3431c6283f45100f8cb652f98c56c03241f918ca1b02ae` (153281). Deaths are 5, 4, and 3 under both policies. First deaths are Lio at 432, Lio at 72, and Kessa Dusk at 216.

Vacant roles. 1847: merchant 3, explorer 1, raider 1. One unaffiliated, one captive. Bram Quill dies at 792 as governor and owner of Glassport. Sable Morrow dies at 936 owning Glassport. No holder. 2718: merchant 1, raider 1, officer 2. Esme Dusk dies at 288 as the acting commander and as governor of Cinder Key. No holder, no port. 4096: steward 1, raider 1, merchant 1. Two unaffiliated. No holder, no governor, no port.

Under inherit on 1847 the owner death is Bram at Glassport only. Sable is still one of the five deaths and owns nothing at her death. On 2718 the acting-commander death is still Esme at 288. On 4096 the role list matches vacant. Holders at tick 1200 are still Mara and Pax under both policies. Nobody in this window is old enough, on these span ages, to be either of them.

| Seed | Policy | World Government | Free Tide | Free Tide ticks at 0 | Open port-ticks / spells | Governor-open | Owned port-ticks | Unowned |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: | ---: |
| 1847 | vacant | 16295.19 | 49.78 | 8 | 176 / 29 | 172 / 25 | 2665 | 2139 |
| 1847 | inherit | 18719.82 | 22.38 | 54 | 103 / 23 | 106 / 25 | 2771 | 2033 |
| 2718 | vacant | 11305.97 | 16.69 | 20 | 32 / 20 | 41 / 22 | 2822 | 1982 |
| 2718 | inherit | 12552.05 | 76.88 | 13 | 157 / 29 | 154 / 24 | 3091 | 1713 |
| 4096 | vacant | 17253.54 | 5.57 | 28 | 28 / 23 | 35 / 25 | 2755 | 2049 |
| 4096 | inherit | 17253.54 | 5.57 | 28 | 28 / 23 | 35 / 25 | 2755 | 2049 |

The baseline ends are World Government 13149.1, 14874.12, and 12600.45, and Free Tide 24.88, 7.91, and 41.76, with Free Tide at 0 for 5, 28, and 10 ticks. The full gate stays 0 under both policies. On 4096 the vacant and inherit treasuries and gates match. The hashes do not, because the event payload carries the heir fields. Regency states on 1847 go from 84 and 84 to 44 and 378 under vacant, and to 0 and 168 under inherit. On 2718 they go from 84 and 252 to 0 and 252 under vacant, and to 84 and 336 under inherit. On 4096 they stay 0 and 84.

**Fixture year, chance, vacant.** The 72-tick hash stays. The first death is event tick 72, which is outside that window. Side-stream tick-1200 hashes are `b1fab6f9f10891b1ce2f7e40eb51b63b555be78352ce38457f08215f7faa3cb1` (97890), `98e58796b985200a3991fe5809ac918fe6d822dd16c33d3e3e196d321c7065d7` (136108), and `0e42bfbe60507f1447ac07a16a9cca4a8c8994105bdef1720f0f3350b4233615` (121071). World-stream hashes are `4a68574190ddf558323e9f14fd42c8dcae2065858bad9882ea8e45706a627e2a` (106532), `f6e70555768f5464dbd4ae057aae9f4d98a1f385bd9c6127d61d6c015c58003f` (128885), and `9086da3cf1a7f36ebaf17c4d2c5dfa303dbaaa9dbf58a4a44a932fd516f66009` (113894). Deaths 16, 8, 10 on the side stream and 16, 8, 11 on the world stream.

Side stream, who it hits. 1847: Pax at 288, and an acting commander was already seated (`actingAlready` 1). Jun Marrow, the reporting officer, at 216. Governors: Dax Pike at Glassport on tick 72, Jun at Crown Harbor on 216, Toma Reef at Crown Harbor on 648. Five unaffiliated. One captive. Archetypes merchant 4, raider 4, officer 2, steward 2, explorer 4. Mara lives. 2718: no holder. Mina Vale owns Glassport at her death on 504. Two unaffiliated. Archetypes officer 2, merchant 2, raider 2, steward 2. 4096: Pax at 792, owning Glassport. Rook Tern, the reporting officer, at 216. Three unaffiliated. No governor. Archetypes merchant 1, raider 4, steward 2, officer 2, explorer 1.

The world stream kills Pax earlier on 1847 and 4096, at 144 and 144, and the 4096 count is 11 rather than 10. Jun dies at 72 on 1847, as governor of Cinder Key and Crown Harbor and as owner of Cinder Key. Rook dies at 144 on 4096. The full gate stays 0. Ending treasuries, side then world: World Government 14355.39 / 15180.86, 14897.44 / 15272.71, and 15029.81 / 17861.51. Free Tide 7.19 / 303.93, 48.21 / 27.18, and 31.67 / 34.16. Free Tide's ticks at 0 are 11, 65, and 9 on the side stream. On the world stream 1847 and 4096 never reach 0, and the minima are 0.72 and 1.17. That is Pax dying at 144 with the seat left vacant, so the uncapped draw stops while the treasury still has money. It is not a transfer into Free Tide from anywhere else that this note measured.

**Day year.** A year of 6 ticks kills all 30 under both rules and both policies. The 72-tick fixture moves. Fixed vacant first deaths are Lio at 36, Lio at 6, and Kessa at 18. Tick-72 counts are 8211, 7886, and 7981. Tick-1200 hashes, vacant, are `d99085266546058d146870a4d9d58bb249811ef01138bf1f768272b8fd83ac79` (39578), `4531dd6980bf9885fe7833b8159d589dec2d3f5cc15575b32a9cf53dacd63cde` (54356), and `aede30279e293ea15ed3f1046c2c7ef6620816ade58246f072655f3340d66d84` (48979). Inherit is `149757bf44dfbb38d3aed891fb1a9916952c516f17991ea273e20725c7292a65` (40173), `ffef5704c78f08a6e957e4946a2e6ccc5b3d3ab45517a1a3c26a2b77dbd39884` (55975), and `21e9ad70e179cd8668bc17964593dc1765aa7bf92ed623c90b7be43012de868a` (48696). Chance moves the fixture earlier, at event tick 6. Side-stream tick-72 hashes are `d922deef24233b687ac1fb38ae5305ea685e355f1138a86e63b2abeb325efb73` (5385), `e35ee368937b5e781edf2a1e9b52a1424546e49812b053362dca52882b337849` (7332), and `4f959edc7bc16f91ba5bc235ce8159e900d96802701f1cfcb3a9de52e9dd884b` (6689).

Both holders die. The player dies, because the player is Mara. The reporting officer dies. All 8 unaffiliated die. Six of each archetype. Vacant does not chain the seat. The holder deaths are Pax then Mara: 114 and 546, 462 and 510, 132 and 456. Inherit chains the cover into the seat and then kills the successor too. 1847: Pax 114, Dax Pike 180, Esme Dusk 318, Corin Hale 402, Mara 546. 2718: Pax 462, Mara 510, Iris Stone 528, Vale Drake 600, Zara Gale 600. 4096: Pax 132, Corin Hale 414, Mara 456, Niko Wren 456, Zara Gale 456, Mara Calder 570, Vale Drake 594. Both seats are empty at tick 1200 under either policy, because everyone is dead. Cover named against cover empty, on holder deaths, is 1/1, 2/0, and 2/0 under vacant, and 3/2, 3/2, and 5/2 under inherit.

Ending treasuries, vacant day: World Government 16298.68, 16666.24, and 16535.53, Free Tide 385.47, 175.08, and 474.81. Free Tide's minima are 6.82, 0, and 4.5. The 1847 and 4096 runs never sit at 0. Inherit day: World Government 15451.71, 17002.37, and 17026.24, Free Tide 0.72, 75.65, and 2.38, with 24, 7, and 87 ticks at 0. The vacant seat stops Pax's uncapped draw. The inherited seat gives the next holder that same draw. World Government never reaches 0 on any measured run. The full gate stays 0. Open-tax port-ticks fall to 6, 6, and 6 under vacant and 7, 5, and 6 under inherit. Unowned port-ticks rise to 4264, 3786, and 4040 under vacant. The owner-dead pointer stays 0.

Chance on the day year also kills all 30. Pax dies at 24, 348, and 66 on the side stream, and at 24, 258, and 36 on the world stream. Mara dies later in each of those runs. One battle is closed by a death on the 2718 world stream. The other day runs close none. The full gate stays 0.

## 7. Slice plan

The slices are in the order they would land. A slice that does not write keeps the hash of the world it is read from. The calendar year is the clock in the defaults. The shorter years are the sensitivities in section 6.

| Slice | What lands | Hash on these three seeds |
| --- | --- | --- |
| 1 | A readout. Starting age, year length, who would be over 60, who would die. Not written onto the world. | Neutral. The baseline table at the top. |
| 2 | `ageYears` stored at setup, span ages, and nothing reads it. | The tick-0 hash moves. Event identity matches the baseline through tick 1200. Counts stay 8413 / 8456 / 8261 and 160268 / 161850 / 162459. Treasuries stay on the baseline. Tick-0 hashes `b43d54ca02776635bd1fc1d1a996da5e1a9d21c89374e033bd121853020c61a4`, `1c94ef2992988080884cb21ff0ae7cc1650a9fa459fd0a8951178d515e7b4b0d`, `0135c2609b45b235a105d4fecd2e7f44825842aeddd6f590ce0af31811d92c45`. Tick 72 `9d7863d5abe81cd2a1d31eee2634e9b34bf31d750918efb615c39daa9fb924e4`, `7284f036039f48bf3b6151efd16053da476072606c86a32b517f5415f8cd16a4`, `4bfd5bfda7cdb1fbe0b9d9c2aa4f4158c4e714d5e3caa797bd5492c54e6c9602`. Tick 1200 `fde5e31e6b3bfcb52c9b7f8a3baba80b7e56f2f29ed18138313651839c1d3458`, `ad15fb04419c0cf09c5879c1a47a5c62f89c897a435424265e542f13d0a079cd`, `6f6ae41a4cea3047ac2216a0c123cd069f5d8dbb597ad4b230da5079a80a351e`. This slice is the one the default does not land. Age stays off the world until a birthday event. |
| 3 | `character-aged` through `applyEvent` when the integer year increases. The field is omitted until then. | Neutral on the calendar. Zero events, and both hashes match the baseline. Replay matched. A 72-tick year keeps the fixture hash, because the first birthday is event tick 72, and moves tick 1200 to `f339240c53ef0a9539a04dd6784639921230cad5ee82b7e169bf36563898bd14` (160748), `357d52642b9f1107b65c8ec2721dacb22dddc24b391f3831768010ec3f3718c6` (162330), and `655f3e3af746ee7c07d8a58233e6255bbd592f9c8283dda6aad48de170274d75` (162939). The first diff is `character-aged` for Mara at that tick. A 6-tick year moves the fixture at event tick 6. Tick-72 hashes `5a215195de8f5454c4b4168fd6f10b1d464b08682ba0bff184b1d8ded201e6ae` (8743), `c7ccc60d43e98258a98a69c8be4da6b502fe5e3859d33c60af197e9f792d7788` (8786), `27f0645868ca78776c942456ab0eece5888e36de163785889edafc5fb5373914` (8591). |
| 4 | The read-time penalty inside `personalPower`, once `ageYears` is set. Attributes are not stored down. | Neutral on the calendar, because slice 3 has stored no age by tick 1200. The span probe in section 2, with ages stored at tick 0, moves the 72-tick hash and kills 0. |
| 5 | Fixed death at 120. `character-died`, no roll, vacant succession, debts paid, crew left on the body, ports cleared. | Neutral on the calendar. Zero deaths. Replay matched. The check-in year keeps the fixture hash and kills 1, 2, and 1 by tick 1200. The fixture year keeps the fixture hash and kills 5, 4, and 3. The day year moves the fixture and kills all 30. Hashes are in section 6. |
| 6 | The chance, on the side stream, roll stored only on the killing event. Still vacant. | Neutral on the calendar. No integer year is crossed, so the stream is not drawn. On the fixture year the 72-tick hash stays and tick 1200 moves, with 16, 8, and 10 deaths. The world stream is not this slice. One discarded draw per living character per tick moves tick 0 with zero deaths. The hashes are the table in section 3. |
| 7 | Inherit-to-cover: purse, crew, scattered troops, and ports move, and a holder death retargets orders. | Out of the default. On the calendar it does not fire. On the fixture year it changes the 1200 hash on every seed, and on 4096 the treasury and the gate still match vacant. On the day year it chains the seat through the cover until that cover dies too. |

## 8. Questions for the Lead

The Lead rules on these against [game vision](game-vision.md). Defaults are what this brief would build. A shorter year whose purpose is to put a death inside 200 world days is not a default.

1. **Where does a starting age come from?** Default: characters have none today, and the world rng is not the source. A side `DeterministicRng(seed)` in id order, or a pure function of fields already on the character. Experience and attribute put only Mara and Pax over 60, and nobody over 80. Cosmetic `integer(18, 59)` puts nobody over 60. Span `integer(18, 119)` is the map the death resims used. It puts 22, 13, and 16 people over 60, of whom 14, 6, and 10 are over 80.

2. **How long is a year?** Default: 365 world days, 2190 ticks, on the day clock already in the sim. These 1200 ticks are 200 world days, 1200/2190 of that year. The 72-tick fixture is 12 world days. One real month as one world year stays the server's pacing. The check-in year, the fixture year, and the day year are sensitivities. They are not the clock.

3. **When is the age stored?** Default: not at setup. `character-aged` through `applyEvent` when the integer year increases, and the field stays omitted until then. On the calendar that event does not fire in 1200 ticks, and both hashes stay on the baseline. Storing span ages at tick 0 moves the hash before any tick and does not change an event count.

4. **What does aging do short of death?** Default: nothing until an age is stored. After that, a read-time penalty inside `personalPower`, on the accumulated figure, not a write to the four attributes and not a hard cap. The probe of 1 after 60 and 3 after 80 killed nobody and moved the 72-tick hash when span ages were stored at tick 0. The size is still the Lead's. Health already stops at 1, and that floor does not kill.

5. **How is a death chosen?** Default: certain at 120, with no roll. From 80 to 120, on the integer-year birthday, a side-stream roll against `((age - 80) / 40) * (1 - strength)`, with strength `(physical / 100 + experience) / 2`. The roll is stored on the killing event. A miss writes nothing. `applyEvent` does not roll again. On the calendar both rules kill 0 people in 1200 ticks, on every map that was read. The tick rng is the wrong stream. A discarded draw per living character per tick moves the first `decision-made` of tick 0.

6. **What is the event?** Default: `character-died`, cause `old-age`, actor the character, applied only through `applyEvent`. The payload carries the age, the purse after debts, the sailors, the troops, the remaining debts, `factionId` null, whether captivity and recovery clear, the ports, the treasuries, and the battles ended. Heir fields are present only when a successor is named. Replay of every measured birthday log and death log matched the live hash.

7. **Who succeeds a command holder?** Default: no one who already exists. The holder leaves the faction, the orders are not retargeted, and the seat is vacant. The acting commander is cleared and is not promoted. Captivity cover is not succession. The player heir is a new young character who did not exist, and a headless run does not mint one. Inherit-to-cover was measured. On the day year it hands the seat to Dax Pike, Esme Dusk, Corin Hale, and the others in section 6, and each of them dies in turn. At tick 1200 both seats are empty under either policy, because all 30 are dead.

8. **Who succeeds a governor?** Default: the offices rule. A dead governor has left the faction, so the seat clears. The acting commander does not appoint. A free living holder may seat someone later. No deputy is added for the governor. On the fixture-year vacant resim the governor deaths are Bram Quill at Glassport on 1847 and Esme Dusk at Cinder Key on 2718. The three deaths on 4096 are not governors.

9. **What happens to the purse, the crew, and the ports?** Default: debts pay the creditor treasury first, in id order, up to the purse. The remainder stays on the body. Sailors and troops stay on the body. `partyPower` of a deceased character is 0. Scattered troops do not return. A captive is not released. Ports' `ownerId` becomes null. The owner-dead pointer stayed 0, and unowned port-ticks rose when a port was cleared. The crew is not added to a garrison. Inherit-to-cover moves the purse, the sailors, the troops, and the scattered count onto the successor and writes that successor as owner. On the day year that leaves Free Tide at 0.72, 75.65, and 2.38, against 385.47, 175.08, and 474.81 when the seat is left vacant. The full secession gate stays 0 on every resim. The open-tax readout is what moves.

## Ruling

The Lead has ruled.

A year is 180 ticks. That is 30 world days, the check-in scale in section 1. The run length stays 1200 ticks. Death draws use a side RNG stream. Every other default in section 8 is accepted. The 2190-tick calendar is not the clock.

Remeasured on `origin/main` at `c4969af8477e2ec16ca7c135d610cf1c03a33fb9` (PR #93), Node v24.21.0, ICU 78.3. `npm test` passed, 379 tests, including the 72-tick fixture and the golden recovery replay of 600 events on seed 1847 split at tick 47. A headless run reproduced the 1200-tick baseline in the table above. The resim is span ages, a fixed death at 120, vacant succession, and a year of 180. It draws nothing. The harness was local and was not left in the tree.

The 72-tick state hash stayed on the fixture for every seed. No death has an event tick under 72.

| Seed | Deaths | Each death |
| --- | ---: | --- |
| 1847 | 1 | Tick 1080, Lio Crow (`character-12`), merchant, World Government. |
| 2718 | 2 | Tick 180, Lio Crow (`character-12`), merchant, World Government. Tick 720, Esme Dusk (`character-19`), raider, Free Tide. |
| 4096 | 1 | Tick 540, Kessa Dusk (`character-30`), steward, unaffiliated. |

Tick 1200 event counts are 159664, 156271, and 159974. Ending treasuries are World Government 13652.48, 14355.47, and 13799.49, and Free Tide 12.3, 45.66, and 150.72. Those match the check-in row in section 6. Replay of each log through `applyEvent` matched the live state hash.

The chance from 80 to 120 is the accepted rule and was not remeasured here. Its roll stays on the side stream, stored only on the killing event. The tick rng stays the wrong stream.

## Ruling, fixed death only

The Lead has ruled again. Aging is a fixed death at age 120 only, with no per-tick chance. The chance from 80 to 120 does not land. `character-aged` does not land. The personal-power penalty does not land.

This is the 1–2 deaths that ruling promised, at a year of 180 ticks: 1, 2, and 1. The names are the check-in row above. Tick 1080, Lio Crow (`character-12`), World Government, on 1847. Tick 180, Lio Crow (`character-12`), World Government, and tick 720, Esme Dusk (`character-19`), Free Tide, on 2718. Tick 540, Kessa Dusk (`character-30`), unaffiliated, on 4096. Each stored age is 120. The run draws nothing.

The batch 2 stack that killed 13, 5, and 8 used a side-stream per-tick chance on top of the certain death at 120. That stack is superseded. The remeasure is in [build order](build-order.md).
