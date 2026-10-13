# Alliances

**Status: Open.** Design brief for the Lead. Nothing in this note is in the tree. The census is a local readout. The no-raid world below was produced by a local harness and was not left in the tree.

Checked on `origin/main` at `1535ad80122467078f370fd5cb4ade0e34ce577a` (PR #90). Node v24.21.0, ICU 78.3. `npm test` passed, 374 tests. The 72-tick fixture passed, including the golden recovery replay of 600 events. A separate headless run reproduced the fixture and the 1200-tick baseline:

| Seed | Tick 72 state hash | Events | Tick 1200 state hash | Events |
| --- | --- | ---: | --- | ---: |
| 1847 | `4ea893a485b05ce6eab599919765903ade9a0ce45f383437f4698064faa7a297` | 8413 | `90dacc2dfcd199ab720ade191bd3fdf8742632a36f19216bd53ce0e3a3294fef` | 160268 |
| 2718 | `d376ad02c6e7c9b03dd0eb4db1c3c137ac7a00d61a096673e12ae4fdabbdfef2` | 8456 | `226bf6257a86b233d197bd77747a10fe64b33dd7ac1e94bc27c11ff3ddf50cd8` | 161850 |
| 4096 | `ac780b3999c3da53f38c0cd16301dfa7f60562a35796f5fa0451c969c9ed08de` | 8261 | `30e9994387b2c9a2d8c0e16e27042797599188a105992cb7a9f8d2e924a8b0a6` | 162459 |

Runs are `createPrototypeWorld` plus `runTick`, no player commands. Seeds 1847, 2718, and 4096. A figure at tick 0 is the world before any `runTick`. A figure at tick 72 or tick 1200 is the world after that many calls.

[Game vision](game-vision.md) names breaking an alliance as one of the satisfying weekly outcomes, beside winning office, founding a faction, and enabling a rebellion. It refuses a rebellion, or any other device, manufactured to restore balance. A faction that becomes dominant may stay dominant. [Roadmap](../roadmap.md) still lists faction creation, alliance-breaking, and enabling rebellion as untracked. Under `src/`, the word `alliance` occurs as a conversation tag. There is no pact, no treaty, and no shared enemy. This note is that item. It does not add a pact in order to prop the smaller treasury back up.

The neighbouring notes are the ground. [Secession](secession.md) founds a faction in the declaration, treasury 0, tax 0.08, seat unnamed, and leaves retake to the raid that already exists. [Offices](offices.md) makes the governor the declarer. [Leader tax](leader-tax.md) is the slice 3 rule used below: graded drift, floor 55, both free holders stepping one cent. [Treasury spending](treasury-spending.md) and [treasury balance](treasury-balance.md) leave the free holder uncapped and the mates on an 18-a-day share. Eighteen times the free mates is 216 for World Government and 144 for Free Tide.

## Summary

Two factions ally when each free command holder accepts, or when a newly seceded founder accepts before that faction has a seat. The alliance refuses raids between the allies. It does not add a second attacker to a battle in this slice, and it does not publish motives. It breaks when a holder breaks it, when one ally raids the other, or when the shared enemy no longer holds a port. The break stores a 0.04 loyalty step on the breaker, a grievance between the two holders, and a treaty memory that blocks the autonomous rule from allying that pair while the betrayed faction still holds a port. None of that fires on these runs. The runs have two factions for all 1201 states.

The shared-enemy opportunities are the governor-full secession spells under slice 3: 13, 5, and 7, all of them Free Tide. World Government's rate never clears 0.15. A no-raid pact between the two factions that exist today would refuse every raid on the tape. That refusal was resimulated from tick 0. The autonomous rule would not put the pact in force, because there is no third faction until a declaration is emitted, and these runs do not emit one.

## 1. How two factions ally

`Faction` has no ally list. Membership is `character.factionId`, written in `makeCharacter` and not written again. On these runs it is unchanged for all 30 characters. World Government is `character-01` through `character-13`. Free Tide is `character-14` through `character-22`. The other eight stay unaffiliated. Unaffiliated characters do not raid: the raid candidate requires a faction. Verdant Cay stays neutral, and a neutral port is not hostile, so it is not a raid target and not an ally.

The free command holder accepts or refuses. That is the same writer as the tax and the governor: `spendRole` is `"holder"` only when `commandHolderId` is this character and `captivity` is null. The acting commander is `"member"` and does not ally, does not break, and does not inherit the holder's yes. A captive holder stays out. Both sides must accept. One acceptance stores nothing.

A newly seceded faction is the case the seat rule does not cover. [Secession](secession.md) founds the faction in the declaration and does not mint a standing order, so `commandHolderId` is null until an `issue-order`. A null seat cannot pass the holder test. **Default: until that seat is named, the founder accepts and breaks.** The founder is the governor who declared, which is the declarer in the offices note. Once the seat is named, the free holder is the only writer again. The parent does not become an ally by the act of being left. The other original faction is the candidate.

The player command sits beside `declare-secession`:

```json
{ "playerId": "…", "type": "propose-alliance", "factionId": "free-tide" }
```

`break-alliance` uses the same shape. The boundary refuses when the player is not the free holder, or not the founder while the new seat is unnamed, and when the target is the player's own faction, a missing faction, or a faction already allied. A repeat stores nothing. No draw.

There is no chain. An ally of an ally is not an ally. A seceded faction that allies with World Government is not thereby allied with anyone else World Government later accepts.

## 2. What an alliance changes

Three changes, and only the first one is in this slice's default.

**No raids between allies.** The raid candidate in `buildCandidates` requires a hostile port: `factionId` set, and different from the attacker's faction. An ally fails that test the way a home port already does. The claim candidate is separate. A claim still needs a surrender, and a surrender comes from a battle, so a pact that stops the raid also stops the claim that would have followed it. The player raid is the same gate: an order to raid an ally is refused. A raid already in progress when the pact is accepted finishes. This slice does not rewind a battle.

**Shared sightings, not motives.** Each character already stores `knowledge`, `partySightings`, and, after a release, `releaseSighting`. A survey and a targeted explore are how a ground record is earned. The alliance copies those records to the ally's members as a faction report, dated at the tick of the copy, and does not copy plans, goals, purse, or treasury. A rival who is not in the pact still gets nothing. This copy was not run. The default keeps it behind the no-raid rule.

**Joint battle stays out.** Every battle on these runs is one attacker against a garrison. `battle-started` has one `attackerId`. There is no second attacker and no allied wing. Putting a second character into the score would be a new combat rule. It waits.

On the baseline every raid is cross-faction at the moment it starts. Raid decisions, major battles (`battle-started`), and immediate battles (a `battle-resolved` with no `battleId`) sum in pairs:

| Seed | Raid decisions | Free Tide → World Government | World Government → Free Tide | Major | Immediate | Resolved | Retreated |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1847 | 70 | 50 | 20 | 53 | 17 | 50 | 15 |
| 2718 | 61 | 43 | 18 | 47 | 14 | 43 | 14 |
| 4096 | 65 | 41 | 24 | 48 | 17 | 51 | 12 |

The first raid decision is event tick 0 on every seed. Resolved battles, attacker victories then defender victories:

| Seed | Free Tide on World Government | World Government on Free Tide | Resolved after the port matched the attacker |
| ---: | --- | --- | --- |
| 1847 | 18 / 14 | 13 / 4 | 1, Free Tide |
| 2718 | 18 / 9 | 14 / 2 | 0 |
| 4096 | 25 / 5 | 18 / 2 | 1, Free Tide |

That last column is a battle that started against the other faction and resolved after the port's faction was already the attacker's. It is not a raid on an ally. Five major battles on 1847 are still open at tick 1200: 53 started, 33 resolved as majors, 15 retreated.

Under the slice 3 rule the same split is 70, 62, and 64 raid decisions: Free Tide on World Government 42, 43, and 44, and World Government on Free Tide 28, 19, and 20. Major battles 54, 51, and 48. Immediate battles 16, 11, and 16. Resolved 57, 42, and 46. Retreated 12, 15, and 15. One resolved battle on 1847 and one on 2718 finish after the port matches the attacker.

A pact between these two factions, in force from tick 0, refuses all of those raid decisions. The resimulated world is below. It is not the autonomous default. The default has no pact, because there is no third faction.

## 3. How an alliance breaks, and what it costs

The free holder breaks it, and the founder breaks it while the new seat is unnamed. The acting commander does not. It also breaks, with no command, on the first tick either of these holds:

- one ally's character starts a raid on the other's port
- the shared enemy no longer holds a port

A raid that is already underway does not break the pact by itself. Starting one does. The second line is the material end of the reason they allied. It is not a timer, and it is not a correction aimed at the larger treasury.

The cost is three stores, each omitted at rest so a world with no break hashes as before.

**Loyalty.** The breaker takes the scar's step in the same direction as an unpaid release. On the breaker's command holder, or on the founder while the seat is unnamed, the scarred reading falls by 0.04. The write is `round(clamp(value − 0.04, 0.05, 0.98), 3)`. The field is `breakAdjustment`, omitted at 0, added by the cover sort and the secession follow line, and not added by work, goals, or obedience. It does not erase `loyaltyAdjustment` or `patronageAdjustment`. The [patronage resimulation](offices.md#patronage-resimulation) is why the step stays 0.04: that step lifts seated governors and does not change a follower set or an event count. The break cost was not applied. These runs never break a pact.

**Reputation.** No faction reputation field exists. Character `relationships` store trust, affinity, respect, fear, grievance, and obligation, and the writers clamp trust and grievance to 0–1. A defeat already moves trust by −0.025 and grievance by 0.035. **Default: the two holders, if each already has a relationship with the other, add 0.04 to grievance and subtract 0.04 from trust, clamped to 0–1.** The 0.04 matches the loyalty step. A missing relationship is not created by the break. The deltas were not run. There is no separate reputation score to move.

**Treaty memory.** `treatyMemory` on the world, a list of `{ factionId, otherFactionId, brokenTick }`, omitted while empty. While an entry exists, the autonomous rule will not ally that pair. The entry is removed when the betrayed faction holds no port. It is not removed because the breaker has become large. A player may still propose. The autonomous holders may not, until the memory clears.

## 4. How autonomous holders decide

The decision runs on the same clock as the tax step: tick `t > 0` and `t % 24 === 0`, after player commands, factions in id order. No draw. The holder who is captive, or covered, skips the tick. A missing ally list means they are not allied.

They ally only when a third faction holds a port. That faction is the common enemy. Each side accepts or refuses on its own. Both must accept. The parent of a secession is not the ally of the faction that just left it. The candidate is the other faction.

Acceptance uses the conditions these runs can already see:

- the enemy has raided this faction at least once since the enemy was founded
- this treasury is under the mate obligation, 216 or 144
- this faction holds no port
- the enemy holds a port within 23.345 of a port this faction holds

23.345 is the distance from Cinder Key to Glassport, the closest pair. The other distances are Crown Harbor to Glassport 43.829, Crown Harbor to Verdant Cay 47.508, Cinder Key to Verdant Cay 49.041, and Crown Harbor to Cinder Key 55.082. One of the four is enough. A faction that fails all four refuses. World Government's treasury on the spells below never fails the 216 test, so its yes has to come from being landless, from a raid by the new faction, or from a port inside 23.345. Free Tide's yes often comes from the 144 test.

They break on the rule in section 3. They do not break because one treasury is larger. [Game vision](game-vision.md) allows the dominant faction to remain dominant. A rich holder who still shares an enemy, and who has not been raided out of the pact, stays in it.

The third faction is not on this tape. Secession was not emitted. The opportunities are the governor-full spells of the slice 3 world, the offices gate: a governor present and free, matching the port's faction, not the command holder, holding rate above 0.15, stability at or below 55 in thousandths. Port-ticks 137, 50, and 155. World ticks with at least one such port: 129, 50, and 155. Spells 13, 5, and 7. All 25 are Free Tide. World Government ends at 0.08, 0.11, and 0.14, so its ports never open the gate. Founding those factions would make World Government the candidate ally and Free Tide the parent, which is the side the new faction does not ally.

At the first governor-full state of each spell, Free Tide's treasury, World Government's treasury, whether World Government holds a port, and the raid decisions so far:

| Seed | State | Port | Governor | Rate | Free Tide | World Government | World Government ports | Nearest | Raids so far |
| ---: | ---: | --- | --- | ---: | ---: | ---: | --- | ---: | --- |
| 1847 | 438 | Glassport | Dax Pike | 0.17 | 466.40 | 17388.96 | none | — | 37 (26 / 11) |
| 1847 | 438 | Crown Harbor | Corin Hale | 0.17 | 466.40 | 17388.96 | none | — | 37 (26 / 11) |
| 1847 | 523 | Crown Harbor | Finn Frost | 0.17 | 334.11 | 18324.12 | Cinder Key, Glassport | 43.829 | 43 (27 / 16) |
| 1847 | 608 | Glassport | Dax Pike | 0.17 | 39.84 | 17209.68 | Crown Harbor, Cinder Key | 23.345 | 46 (29 / 17) |
| 1847 | 757 | Cinder Key | Finn Frost | 0.16 | 4.26 | 14395.00 | Crown Harbor, Glassport | 23.345 | 50 (31 / 19) |
| 1847 | 759 | Crown Harbor | Zara Gale | 0.16 | 22.97 | 14298.81 | Glassport | 43.829 | 51 (32 / 19) |
| 1847 | 860 | Crown Harbor | Finn Frost | 0.17 | 19.95 | 12471.85 | Glassport | 43.829 | 53 (33 / 20) |
| 1847 | 926 | Crown Harbor | Finn Frost | 0.16 | 142.57 | 11152.14 | none | — | 56 (35 / 21) |
| 1847 | 927 | Glassport | Dax Pike | 0.16 | 172.20 | 11134.14 | none | — | 59 (35 / 24) |
| 1847 | 981 | Crown Harbor | Finn Frost | 0.16 | 15.54 | 11105.09 | Cinder Key, Glassport | 43.829 | 61 (36 / 25) |
| 1847 | 1081 | Crown Harbor | Zara Gale | 0.17 | 15.92 | 10063.16 | none | — | 67 (41 / 26) |
| 1847 | 1081 | Glassport | Dax Pike | 0.17 | 15.92 | 10063.16 | none | — | 67 (41 / 26) |
| 1847 | 1081 | Cinder Key | Bram Tern | 0.17 | 15.92 | 10063.16 | none | — | 67 (41 / 26) |
| 2718 | 705 | Crown Harbor | Mina Vale | 0.16 | 119.58 | 14049.06 | Cinder Key | 55.082 | 45 (34 / 11) |
| 2718 | 725 | Cinder Key | Zara Gale | 0.17 | 88.51 | 14138.80 | Crown Harbor, Glassport | 23.345 | 48 (36 / 12) |
| 2718 | 1003 | Crown Harbor | Mina Vale | 0.16 | 8.22 | 11836.51 | Cinder Key | 55.082 | 55 (40 / 15) |
| 2718 | 1050 | Crown Harbor | Mina Vale | 0.16 | 70.25 | 11332.01 | Glassport | 43.829 | 59 (42 / 17) |
| 2718 | 1135 | Crown Harbor | Corin Hale | 0.17 | 199.15 | 11166.00 | Glassport | 43.829 | 61 (43 / 18) |
| 4096 | 400 | Glassport | Corin Hale | 0.18 | 217.76 | 17696.13 | Crown Harbor, Cinder Key | 23.345 | 35 (25 / 10) |
| 4096 | 491 | Glassport | Corin Hale | 0.18 | 554.67 | 18465.32 | Crown Harbor, Cinder Key | 23.345 | 37 (27 / 10) |
| 4096 | 789 | Crown Harbor | Mina Vale | 0.20 | 266.63 | 17579.43 | Glassport | 43.829 | 48 (36 / 12) |
| 4096 | 875 | Glassport | Corin Hale | 0.18 | 27.81 | 16722.13 | Crown Harbor, Cinder Key | 23.345 | 52 (37 / 15) |
| 4096 | 879 | Crown Harbor | Bram Tern | 0.18 | 44.91 | 16701.24 | Cinder Key, Glassport | 43.829 | 54 (39 / 15) |
| 4096 | 1083 | Crown Harbor | Mara Calder | 0.19 | 41.75 | 15060.12 | none | — | 60 (44 / 16) |
| 4096 | 1084 | Glassport | Corin Hale | 0.19 | 131.59 | 15057.04 | none | — | 61 (44 / 17) |

Raid counts in the last column are Free Tide, then World Government. Free Tide's treasury is under 144 on 8, 4, and 4 of these 25 spells. World Government's treasury is above 10,000 on every one of them. World Government holds no port on 7, 0, and 2 of the spells. The nearest held port is 23.345 on 2, 1, and 3 of them.

A declaration was not emitted, so the raids after that moment are still Free Tide against World Government. On the slice 3 tape, raid decisions after the first spell's state are 33, 17, and 29 (70 − 37, 62 − 45, 64 − 35). That is the count a pact formed at the first opening would have refused if the later raids had stayed on this tape. They were not resimulated. Raid decisions whose resulting state is already inside a governor-full tick are 14, 3, and 7. Those are the overlap, not a second campaign.

## 5. Slice plan

The slices are in the order they would land. A slice that does not write keeps the hash of the world it is read from. The no-raid row is the one that was resimulated, and only as a pact forced from tick 0 between the two factions that exist. That is not the autonomous default. The default writes nothing on these seeds.

| Slice | What lands | Hash on these three seeds |
| --- | --- | --- |
| 1 | A readout. Who would be asked, whether a third faction holds a port, the raid split, the treasury, and the nearest port. Not written onto the world. | Neutral. The baseline table at the top. |
| 2 | `propose-alliance` and `break-alliance`, the reducer, and `alliance-proposed` / `alliance-broken`. No autonomous caller. A headless run never queues the command. | Neutral, for the same reason a headless run emits no `tax-rate-set`. The command was not compiled. The measured headless hashes are the baseline table. |
| 3 | The autonomous accept and break in section 4. The record is omitted until both sides accept. | Neutral on these seeds. Faction count stays 2 for 1201 states, so the common-enemy test is false and the writer would not fire. The slice 3 tax world, still with two factions, stays on `28866eb80bd48798c78791dd8f0c4093b9ffecfb8009421db7dd2c109d4f1e47` (161658), `712b60edc75c313f17e774951f43aa84fcd487fbc29c422215cd602b19665be8` (161613), and `b0ac72fe452697010e58570136737e4dd8ed12770a2e86863bfdaa76ee07e114` (162327). |
| 4 | No raids between allies. A battle already in progress finishes. | Neutral under the default, because slice 3 never stores an ally. A pact forced from tick 0 refuses every raid. The first raid is event tick 0, so the 72-tick fixture moves. Hashes below. |
| 5 | Copy earned sightings to allied members as a dated faction report. Plans, goals, purse, and treasury stay uncopied. | Neutral under the default. Nothing was copied. The copy was not run. |
| 6 | A second attacker in a battle. | Out of this slice. Not run. The baseline battles stay one attacker. |
| 7 | Break costs: `breakAdjustment` of 0.04, the holder grievance and trust step, and `treatyMemory` omitted while empty. | Neutral under the default. No break is stored. A world with the fields omitted hashes as the baseline. |

The forced pact, slice 4 with the two factions allied from tick 0 and every raid candidate removed:

| Seed | Tick 72 state hash | Events | Tick 1200 state hash | Events |
| ---: | --- | ---: | --- | ---: |
| 1847 | `7c7463e18c92045cd98b055fc83dcb60205ba31c57fabd8435ba7da2cf397071` | 8378 | `49f04031dff2a85fe2e7ec31df78608fd22d56a6eb105cc6966d7b8cfc323148` | 164091 |
| 2718 | `374306d309db2ccd051a502b7d60a745aae3329b34457d7474fba135522c40fc` | 8541 | `4c5aad393832aa8e4ecb6dd7b5239841695e15979753dd4ba40b4cd9339f51a5` | 166672 |
| 4096 | `0145e163c2698e0df555096b077ed51a34360ce9027e3e43a24f57e8e5ec431b` | 8643 | `f47f12db156fba022d0f8f8b5d1d9e25461d99cded8dcb6b42eda220195b6cb3` | 166037 |

Raid decisions, major battles, immediate battles, and resolved battles on that world are 0. Rates stay 0.14 and 0.08. Ending treasuries are World Government 20230.12, 15771.22, and 24245.18, and Free Tide 21.12, 16.82, and 0. The minimum World Government treasury on that run is 17570.76, 15710.08, and 17722.23. Free Tide still reaches 0 on every seed. Stopping the raids does not fund the holder who spends the treasury. `factionId` is unchanged for all 30 characters. No desertion event and no defection event exist under `src/`.

## 6. Questions for the Lead

The Lead rules on these against [game vision](game-vision.md). Defaults are what this brief would build. A yes that exists only to shrink the larger faction is not a default.

1. **Who accepts, and who speaks for a faction that just seceded?** Default: both free command holders. The acting commander does not accept and does not break. Until a seceded faction has a seat, the founder does. After an `issue-order`, the free holder does. One acceptance stores nothing.

2. **Does an ally of an ally count?** Default: no. The pact is the pair that accepted. A seceded faction allied with World Government is not allied with a later ally of World Government.

3. **What does the pact change first?** Default: no raids between the allies, including a player order. A battle already in progress finishes. Shared sightings are the earned records only, copied as a dated faction report, and they wait behind the raid rule. A second attacker in the battle waits. These runs have one attacker on every battle.

4. **What would a no-raid pact remove?** Default, on these seeds: nothing, because the autonomous rule never stores an ally. A pact forced between the two factions from tick 0 would refuse 70, 61, and 65 baseline raid decisions (50 / 20, 43 / 18, and 41 / 24), and 70, 62, and 64 under slice 3. The forced world hashes as the table in section 5 and resolves 0 battles. On the slice 3 tape, without resimulating the later raids, 33, 17, and 29 raid decisions sit after the first governor-full state, and 14, 3, and 7 sit on a state where the gate is already open.

5. **When do autonomous holders ally?** Default: only when a third faction holds a port, and only with the faction that is not that enemy and not the parent just left. Each side accepts on a raid by that enemy, a treasury under 216 or 144, holding no port, or an enemy port within 23.345. Both must accept. The 25 governor-full spells are the opportunities. All of them are Free Tide. World Government's treasury stays above 10,000 on every one. Free Tide is under 144 on 8, 4, and 4. World Government is landless on 7, 0, and 2. The acceptance was not stored, so slice 3 keeps the addendum hashes.

6. **When does it break?** Default: the free holder, or the founder while the seat is unnamed, or the first raid by one ally on the other, or the tick the shared enemy holds no port. It does not break because one treasury is larger. The acting commander does not break it.

7. **What does breaking cost?** Default: 0.04 off the breaker's scarred loyalty, stored as `breakAdjustment`, the same step as the patronage resimulation and read by the same two lines. The two holders' existing relationship, if any, adds 0.04 grievance and subtracts 0.04 trust. `treatyMemory` blocks the autonomous pair while the betrayed faction still holds a port, and a player may still propose. No faction reputation field exists, and none is added. The cost was not applied. No break occurs on these runs, so the hash stays the baseline.