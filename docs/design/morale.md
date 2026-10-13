# Morale

**Status: Open / design brief.** Nothing in this note is in the tree. The census is a local readout of the baseline tape. The resims were produced by a local harness and were not left in the tree.

Checked on `origin/main` at `4753d32944d08decd99c451706b771ef8b529e97` (PR #100). Node v24.21.0, ICU 78.3. `npm test` passed, 405 tests. The 72-tick fixture passed, including the golden recovery replay of 600 events on seed 1847 split at tick 47. A headless run reproduced the fixture and the 1200-tick baseline:

| Seed | Tick 72 state hash | Events | Tick 1200 state hash | Events |
| --- | --- | ---: | --- | ---: |
| 1847 | `4ea893a485b05ce6eab599919765903ade9a0ce45f383437f4698064faa7a297` | 8413 | `28866eb80bd48798c78791dd8f0c4093b9ffecfb8009421db7dd2c109d4f1e47` | 161658 |
| 2718 | `d376ad02c6e7c9b03dd0eb4db1c3c137ac7a00d61a096673e12ae4fdabbdfef2` | 8456 | `712b60edc75c313f17e774951f43aa84fcd487fbc29c422215cd602b19665be8` | 161613 |
| 4096 | `ac780b3999c3da53f38c0cd16301dfa7f60562a35796f5fa0451c969c9ed08de` | 8261 | `b0ac72fe452697010e58570136737e4dd8ed12770a2e86863bfdaa76ee07e114` | 162327 |

Runs are `createPrototypeWorld` plus `runTick`, no player commands. Seeds 1847, 2718, and 4096. A figure at tick 72 or tick 1200 is the world after that many calls. Tick numbers on events are the `tick` field. A mate-day is six member-ticks, `ticksPerDay` is 6, and a fractional mate-day is that count divided by 6, rounded to 3 decimals.

[Game vision](game-vision.md) says resistance comes from characters and material conditions, and the simulation does not manufacture a rebellion to restore balance. Named characters are not silently deleted. Defeat changes a story. [Treasury spending](treasury-spending.md) is the draw: allowance first, then the purse, and the free holder is uncapped. [Treasury balance](treasury-balance.md) is the share, `min(18, treasury / free mates)` in whole cents. Eighteen is one day of passage. The holder is not a mate. [Offices](offices.md) would pay a governor 18 from headroom and move scarred loyalty by 0.04. That office is not in this tree. [Secession](secession.md) follows a declared break when scarred loyalty is under 0.75. [Progression](progression.md) keeps troop experience on the stack the character already has. [Aging](aging.md) puts a chance roll on a side stream and writes the death only through `applyEvent`. [News](news.md) leaves loyalty off the public item. [Negotiation](negotiation.md) does not pay a wage.

## Summary

The morale number already on a character is hunger, travel, work, rest, and battle. It is not pay. On this tape every Free Tide mate's morale reaches 0, and so does the upkeep median, which sits at 14.172, 21.743, and 16.326. A threshold on that number would not pick out unpaid people.

The balance share is short only for Free Tide. World Government's cap stays 18 for every member-tick. Free Tide is short for 6242, 4310, and 6507 member-ticks, which is 1040.333, 718.333, and 1084.5 mate-days. The eight mates are the people affected. Pax Ash, the holder, is not. The first short morning is tick 114, 378, and 120.

A free mate whose scarred loyalty is under 0.75, after 12 consecutive short mornings, leaves the faction and stays where they are, troops included. On the resim that is 4, 3, and 6 desertions. The 72-tick fixture stays. Free Tide's ending treasury becomes 4.76, 54, and 0, against the baseline 32.65, 673.57, and 34.02. Leaving does not put a standing fund back. The holder is still uncapped.

## 1. The morale model

`character.morale` is clamped to 0–100. Setup draws an integer from 70 to 100. Nothing in the tree stores a separate troop morale. The stack has count, experience, and discipline. Recruiting adds bodies to that stack. The morale the decisions read is the character's.

Upkeep, every character who is walked:

`clamp(morale − shortage × 2.4 − (traveling ? 0.03 : 0) + (shortage === 0 ? 0.04 : 0), 0, 100)`

`shortage` is the provisions demand the cargo did not cover. A fed tick adds 0.04. A hungry tick subtracts 2.4 per missing unit. A sea tick subtracts 0.03 either way. Upkeep rows on this tape are 34613, 34796, and 35207. Hungry rows are 19717, 17914, and 17277. The morale on those rows has median 14.172, 21.743, and 16.326, mean 28.976, 33.566, and 29.419, and minimum 0 on every seed.

The other writes, all clamped to 0–100:

| Cause | Change |
| --- | --- |
| Work | −0.35 |
| Rest | +3 |
| Immediate battle, attacker victory | +10 |
| Immediate battle, attacker defeat | −18 |
| Battle phase, attacker advantage | +3 |
| Battle phase, otherwise | −7 |
| Retreat | −(6 + pursuit losses × 0.2) |
| Escape | −4 |

Pay does not appear in any of those lines. A passage that the allowance does not cover still sails. The ship is not turned around.

## 2. What unpaid allowance is, on this tape

A free mate is a faction member who is not captive and is not the command holder. The cap is `min(18, floor(treasury cents / mates) / 100)`. It is short when that cap is under 18. The holder does not use the cap.

Sampled after each tick. World Government short ticks are 0, 0, and 0, across 2302, 2360.833, and 2344 mate-days. Free Tide short ticks are 6242, 4310, and 6507, across 1516, 1488, and 1572 mate-days. Ticks where the cap is 0 are 0 for World Government and 67, 22, and 16 for Free Tide (11.167, 3.667, and 2.667 mate-days). The first morning the cap is already short, `tick % 6 === 0` before the tick runs, is 114, 378, and 120.

Ending treasuries on the baseline are World Government 8928.22, 10797.01, and 14514.91, and Free Tide 32.65, 673.57, and 34.02. States with Free Tide at or below 0 are 9, 3, and 2. Allowance drawn, a member `treasuryDrawn` that stores `allowanceRemaining`, is World Government 31398.24, 29470.65, and 31486.58, and Free Tide 8699.94, 10718.77, and 8500.84. Holder draws are 0, 0, and 0 for World Government, and 13260.05, 9070.71, and 16210.95 for Free Tide. Pax is the holder on these runs. Mara Vane does not draw the treasury as holder.

The eight Free Tide mates, and nobody else, have a short tick. Loyalty is the secession reading at tick 1200, `personality.loyalty + (loyaltyAdjustment ?? 0)`. Short days are that character's short ticks divided by 6.

| Character | Loyalty | Short days, 1847 / 2718 / 4096 |
| --- | ---: | --- |
| Mina Vale (`character-15`) | 0.514 / 0.385 / 0.271 | 124.167 / 84.333 / 125.5 |
| Corin Hale (`character-16`) | 0.765 / 0.978 / 0.825 | 138.167 / 96.167 / 137 |
| Zara Gale (`character-17`) | 0.838 / 0.826 / 0.384 | 126.5 / 84.333 / 137 |
| Finn Frost (`character-18`) | 0.322 / 0.619 / 0.378 | 128.333 / 79.5 / 137 |
| Esme Dusk (`character-19`) | 0.657 / 0.784 / 0.623 | 138.167 / 93.833 / 137 |
| Dax Pike (`character-20`) | 0.786 / 0.831 / 0.628 | 138.167 / 96.167 / 137 |
| Mara Calder (`character-21`) | 0.971 / 0.833 / 0.796 | 114.667 / 96.167 / 137 |
| Bram Tern (`character-22`) | 0.439 / 0.383 / 0.499 | 132.167 / 87.833 / 137 |

A sea tick is a separate shortfall. Passage is 3. A member upkeep that draws less than 3 from the treasury is 1062, 941, and 1112 for World Government, and 1103, 633, and 1612 for Free Tide. World Government's cap never drops under 18, so those 1062, 941, and 1112 ticks are a day whose 18 was already spent, with the purse paying the rest. Ticks where treasury and purse together pay less than 3 are 2, 0, and 0 for World Government, and 6, 4, and 7 for Free Tide.

On the unchanged tape, the first morning a streak of short days reaches 4, 8, or 12 is the same eight mates, and the mates under 0.75 are the same set at all three lengths: Mina Vale, Finn Frost, Esme Dusk, and Bram Tern on 1847; Mina Vale, Finn Frost, and Bram Tern on 2718; Mina Vale, Zara Gale, Finn Frost, Esme Dusk, Dax Pike, and Bram Tern on 4096. Length 24 drops Mina Vale and Mara Calder on 1847 and keeps the other six; on 2718 and 4096 all eight still reach it. The under-0.75 subset at 24 drops Mina Vale on 1847 only. She reaches 12 mornings there and not 24.

## 3. What the slices would change

Slices are measured from the baseline, not stacked. A slice that does not write keeps the hash.

The penalty slice subtracts 0.5 morale on a free mate's upkeep when that faction's cap is under 18. It is the same upkeep event. It draws nothing. The 72-tick fixture stays, because the first short morning is tick 114, 378, and 120. Tick 1200 hashes `4cedfe2e1d81ede82df1dc0af888a20b78b6f34e95a6921ececcec34fbfe5475` (157570), `316eeccc9c6c4bbee51b363e2ba17206684af7925e778bf974eacc1c52657ec8` (162418), and `a75891309c84a293cd810679fec3a5028143f91139b50c34336672fdd8defd09` (165932). Free Tide ends at 2370.67, 1229.02, and 51.67. States at or below 0 are 6, 5, and 6. No one leaves. The higher ending balance is the campaign after the morale write, not a coin moved by hand.

The desertion slice fires on a short morning, `tick % 6 === 0` before the tick, when the consecutive short mornings reach the length and scarred loyalty is under 0.75. The holder never qualifies. A mate at or above 0.75 never qualifies. The character's `factionId` becomes null. Location, travel, and the troop stack stay. They do not join the other faction. `applyEvent` writes that null and does not re-test the streak. The 72-tick fixture stays on every row below.

Twelve mornings, certain, no roll. Desertions are 4, 3, and 6.

| Seed | Who leaves | Tick |
| --- | --- | --- |
| 1847 | Finn Frost, Esme Dusk, Bram Tern | 180 |
| 1847 | Mina Vale | 426 |
| 2718 | Bram Tern | 444 |
| 2718 | Mina Vale, Finn Frost | 540 |
| 4096 | Zara Gale, Finn Frost, Esme Dusk, Dax Pike, Bram Tern | 204 |
| 4096 | Mina Vale | 1014 |

Mina Vale's tick is later than the unchanged-tape crossing on 1847 and 4096, and earlier on 2718. The earlier departures change the share, so the streak is not the census streak. Tick 1200 hashes `2890f97db6622b8ab3165d722af5f3aa5da3a3760538db46ec86413dc516e74f` (165512), `dc855fba4c6cb4d3e83911c70b8af4ff33e3bcab62a8249e029c40199521ec70` (161711), and `9b859fcf42c624703f74e74156dc7fc31ade0347e76a5935ec60374ccca8c191` (166247). Free Tide ends at 4.76, 54, and 0. States at or below 0 are 34, 13, and 1. Free Tide members left, including the holder, are 5, 6, and 3.

Twenty-four mornings, certain. Desertions are 3, 3, and 6. Finn Frost, Esme Dusk, and Bram Tern at tick 252 on 1847. Mina Vale, Finn Frost, and Bram Tern at tick 834 on 2718. Zara Gale at tick 276 on 4096, then Mina Vale, Finn Frost, Esme Dusk, Dax Pike, and Bram Tern at tick 534. Tick 1200 hashes `ce40b5d431f3f1471d29a6a85b45839cebef6cb1d9de8d1b8e4449890d9e5ded` (165823), `b9d52d440d57d53993c293da096df5ce94dcd17ba222555378dce1914821091a` (163864), and `f8a606ec28436d3f9693f597d08621f231f8f1832d334144b8420731ec04a454` (165375). Free Tide ends at 782.64, 267.47, and 29.97. States at or below 0 are 7, 6, and 37.

Twelve mornings, one side-stream roll, leave if the roll is under 0.5. The stream is a `DeterministicRng` forked from `world.rngState` at setup. It is not written back. The roll is stored on the event. `applyEvent` does not draw. Desertions are 2, 1, and 2: Esme Dusk at tick 180 (roll 0.245) and Mina Vale at tick 480 (roll 0.034) on 1847; Mina Vale at tick 762 (roll 0.244) on 2718; Zara Gale and Dax Pike at tick 204 (rolls 0.160 and 0.238) on 4096. Rolls are rounded to 3 decimals. Tick 1200 hashes `38d7d649d049749ec8fafee13c2602b51ceffcb6f839660ab22bd92d55ffca4d` (163317), `354667b05c6ca9ea10a405897525e44f32e7500ac5d422910e9672d9e3f80b45` (162327), and `c7be18196dafc94b9ccf952913f5788167862bb4c122a184718970480a0da707` (161094). Free Tide ends at 62.54, 1030.01, and 188.70. States at or below 0 are 6, 0, and 9.

Patronage is not in this tree. [Offices](offices.md) already measured a +0.04 scarred-loyalty step while a governor seat is held. That step is the same 0.04 as the unpaid-release scar, in the other direction, and it is what can lift a mate across 0.75. It does not write morale. This brief does not resim it.

Secession does not read morale. `wouldFollow` reads scarred loyalty under 0.75, the press, and an empty cargo. A deserter is not a follower and does not found a faction. The follow line stays the loyalty line. The desertion gate uses that same line so a mate who would not follow a break also does not walk away from a short share.

## 4. Determinism

`stateHash` is sha256 of the canonical world. `applyEvent` throws on an unknown type. `character-deserted` has to be a reducer case. A streak kept only beside the tick is gone when recovery starts from an earlier snapshot, unless the event carries the result and the reducer writes the null faction.

The penalty slice draws nothing. The certain desertion draws nothing. The chance slice draws one `next()` from the side stream on the morning the streak reaches the length, stores it on the event, and does not draw inside `applyEvent`. The tick rng is the wrong stream. One discarded draw on it moves the first decision of tick 0, which is the result the aging note already measured.

The 72-tick fixture stays for the penalty and for every desertion row above. Tick 1200 moves on each of them.

## 5. Slice plan

| Slice | What lands | Hash on these three seeds |
| --- | --- | --- |
| 1 | A readout. Short mate-days, the eight mates, the passage ticks the treasury did not cover, the morale the code already writes. Not written. | Neutral. The baseline table at the top. |
| 2 | Upkeep subtracts 0.5 morale when the mate's cap is under 18. Same `character-upkeep` event. No reader besides the morale field the decisions already use. | The 72-tick fixture stays. Tick 1200 moves. Free Tide ends at 2370.67, 1229.02, and 51.67. |
| 3 | `character-deserted` through `applyEvent` after 12 short mornings, loyalty under 0.75. `factionId` becomes null. Place and troops stay. No roll. | The 72-tick fixture stays. Tick 1200 moves. Desertions are 4, 3, and 6. Free Tide ends at 4.76, 54, and 0. |
| 4 | The same gate, one side-stream roll, leave when the roll is under 0.5. The roll is on the event. | The 72-tick fixture stays. Tick 1200 moves. Desertions are 2, 1, and 2. Free Tide ends at 62.54, 1030.01, and 188.70. |

Slice 4 is the measured chance. It is not required for slice 3. Twenty-four mornings was measured beside slice 3 and is question 5. It is not a separate landing.

## 6. Questions for the Lead

The Lead rules on these against [game vision](game-vision.md). Defaults are what this brief would build.

1. **Does pay write morale?** Default: yes, one term. A free mate whose cap is under 18 loses 0.5 morale on that upkeep, on top of the hunger and travel terms. World Government never takes the term on this tape. The 72-tick fixture stays. Tick 1200 moves. Free Tide ends at 2370.67, 1229.02, and 51.67. Hunger, travel, work, rest, and battle stay the formulas in section 1.

2. **Who can desert?** Default: a free mate, not the holder, whose scarred loyalty is under 0.75. That is the secession follow line. On the unchanged tape the mates under the line who reach 12 short mornings are 4, 3, and 6, named in section 2. A mate at or above 0.75 stays, including Corin Hale, Dax Pike, Zara Gale, and Mara Calder where their reading is over the line. The holder stays. A captive is not a mate.

3. **Where do they go?** Default: `factionId` becomes null. They stay on their current location or their current voyage. The troop stack stays with them. They spend the purse, the factionless rule already in the code. They do not join the other faction, and they do not found one. Named characters are not removed.

4. **How long is the unpaid streak?** Default: 12 consecutive short mornings. A morning is `tick % 6 === 0` before the tick, and short means the cap is under 18. The resim leaves 4, 3, and 6 people and Free Tide ends at 4.76, 54, and 0. The fixture stays.

5. **Is 24 mornings the gate instead?** The resim leaves 3, 3, and 6 people and Free Tide ends at 782.64, 267.47, and 29.97. States at or below 0 are 7, 6, and 37. The fixture stays. Default stays 12. Twenty-four keeps Mina Vale on 1847, on both the tape and the resim, and it is the row that leaves Free Tide the larger ending balance on 1847 and 2718.

6. **Does desertion roll?** Default: no. The streak and the loyalty line are the test. The certain slice draws nothing. The measured alternative rolls once, on the side stream, and leaves when the roll is under 0.5. That slice deserts 2, 1, and 2, and Free Tide ends at 62.54, 1030.01, and 188.70. The tick rng is not the stream.

7. **Does patronage raise morale?** Default: no. Patronage stays the +0.04 scarred-loyalty step in [offices](offices.md), which is the line question 2 reads. It is not in this tree and was not resimmed here. A morale bonus on top of that step was not measured.

8. **Does secession read morale?** Default: no. The follow line stays loyalty, the press, and cargo. Desertion is the unpaid exit. It uses the loyalty line and does not declare a break. A walker that opened the follow line from morale was not run.
