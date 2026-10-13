# Offices

**Status: Open.** Design brief for the Lead. Nothing in this note is in the tree. The census is a local readout. The slice 3 world below was produced by a local harness and was not left in the tree.

Checked on `origin/main` at `e87ba9173cd26406388dc91d845981545037ffb4` (PR #87). Node v24.21.0, ICU 78.3. `npm test` passed, 368 tests. The 72-tick fixture passed, including the golden recovery replay of 600 events. A separate headless run reproduced the fixture and the 1200-tick baseline:

| Seed | Tick 72 state hash | Events | Tick 1200 state hash | Events |
| --- | --- | ---: | --- | ---: |
| 1847 | `4ea893a485b05ce6eab599919765903ade9a0ce45f383437f4698064faa7a297` | 8413 | `90dacc2dfcd199ab720ade191bd3fdf8742632a36f19216bd53ce0e3a3294fef` | 160268 |
| 2718 | `d376ad02c6e7c9b03dd0eb4db1c3c137ac7a00d61a096673e12ae4fdabbdfef2` | 8456 | `226bf6257a86b233d197bd77747a10fe64b33dd7ac1e94bc27c11ff3ddf50cd8` | 161850 |
| 4096 | `ac780b3999c3da53f38c0cd16301dfa7f60562a35796f5fa0451c969c9ed08de` | 8261 | `30e9994387b2c9a2d8c0e16e27042797599188a105992cb7a9f8d2e924a8b0a6` | 162459 |

Runs are `createPrototypeWorld` plus `runTick`, no player commands. A figure at tick 0 is the world before any `runTick`. A figure at tick 72 or tick 1200 is the world after that many calls. Samples below are every state from tick 0 through tick 1200, 1201 states. Claim ticks in the text are the `tick` on `settlement-claimed`. The owner is first visible on the following state: event 58 is state 59.

[Game vision](game-vision.md) names winning office as the satisfying week, and political office as a success a player can choose. It refuses a rebellion manufactured to restore balance. A faction that becomes dominant may stay dominant. [Roadmap](../roadmap.md) still lists offices, rank, appointments, patronage, and law as untracked: no `office`, `appointment`, `patronage`, `governor`, or `law` token under `src/`. This note is that item.

## Summary

The new office is port governor, one per settlement a faction holds. Command stays the seat that already issues standing orders. The reporting officer stays a briefing job. The free command holder appoints the governor and may remove them. The acting commander does neither, and does not set the tax, issue orders, or declare. The governor's command, in this brief, is the secession declaration. Their income is a stipend of 18 a day, paid only when the treasury still covers 18 for every free mate and 18 for every seat. Their influence on the tax is the gate already written in [secession](secession.md): a holding rate above 0.15 is what opens the declaration. They do not write `taxRate`. Patronage moves the scarred loyalty by 0.04, the step the unpaid-release scar already uses, in the other direction. The resimulation is [Patronage resimulation](#patronage-resimulation).

On today's rates the secession gate stays shut, with or without a governor. Under the [leader tax](leader-tax.md) slice 3 rule, floor 55, the owner-gate spells stay 15, 7, and 9. The ticks inside those spells where the declarer is present, free, and not the command holder fall from 160, 99, and 212 to 137, 50, and 155 if the declarer is the sticky governor. The governor is often away. This slice does not hold them on the dock.

## 1. Which offices exist

Three names already sit next to each other, and only one of them is a new office.

**Command** is `commandHolderId`. It is the single issuer of the faction's standing orders. It is not stored on the faction. Setup makes Mara Vane (`character-01`) the issuer for World Government and Pax Ash (`character-14`) the issuer for Free Tide. On every state of these runs the seat is still one of those two. Choosing a commander, and a permanent change of seat, stay where [world simulation](world-simulation.md) left them.

**Reporting officer** is `reportingOfficerId` on the player. It is a briefing job. On these seeds it is Jun Marrow, Iris Stone, and Rook Tern, the same id at tick 0, tick 72, and tick 1200. This brief does not give that job a stipend, a declaration, or a tax write.

**Port governor** is the office this brief adds. One seat per settlement whose `factionId` is set. Verdant Cay is neutral on every state of these runs, claims 0, and has no governor. A faction with no port has no seat. The eight unaffiliated characters are not eligible.

`ownerId` stays the claimant. `makeSettlement` sets it null. The only writer after that is the claim. The secession note already says there is no governor, and that the declarer is `ownerId`. The read moves. The declarer becomes the governor, so the person that read finds was appointed. The conqueror remains the owner. A later claim still writes the new claimant into `ownerId`. It does not silently renew the office. The free holder appoints again for the new hold.

There is no law, no rank ladder, and no second office in this slice. Archetype `officer` stays a personality draw, not a rank. Six characters are that archetype. An officer can score below a steward. On seed 1847 Mara Calder, officer, loyalty 0.971, leadership 30, scores 78.548, and Dax Pike, steward, scores 107.296.

## 2. Who appoints, and who removes

The free command holder appoints. The free command holder removes. The acting commander does neither.

`spendRole` is `"holder"` only when `commandHolderId` is this character and `captivity` is null. A captive holder is `"captive"`. The acting commander is `"member"`. [World simulation](world-simulation.md) and [political layer](political-layer.md) already keep the cover from issuing, confirming, retargeting, and setting the tax. Appointment is the same kind of act. The cover does not inherit it.

On these runs the holder never changes. Regency is the count of states, tick 0 through tick 1200, where `actingCommanderId` is set:

| Seed | World Government states | Free Tide states |
| ---: | ---: | ---: |
| 1847 | 84 | 84 |
| 2718 | 84 | 252 |
| 4096 | 0 | 84 |

At tick 0, tick 72, and tick 1200 the key is absent on every faction. A vacant governor seat stays vacant through a regency. The cover does not fill it.

**Autonomous appointment.** When a faction holds the port and the seat is empty, and `spendRole` of the holder is `"holder"`, name one governor. No `rng.next`. The eligible list is members of that faction who are anchored on the port (`locationId` set, `travel` null, `captivity` null) and are not the command holder. The sort is the cover sort: `skills.leadership + scarredLoyalty * 50`, lower id on a tie. Scarred loyalty is `personality.loyalty + (loyaltyAdjustment ?? 0)`. If nobody is anchored, the seat stays empty and the next state tries again. Once named, the governor keeps the seat.

**Removal.** The seat clears when the port's `factionId` changes or becomes null, when the governor's `factionId` is no longer that faction, or when the governor becomes the command holder. The free holder may also remove by command. Captivity does not clear the seat. The captive governor cannot declare, which is the same presence rule secession already uses for the owner. The acting commander cannot remove.

The holder is not eligible. An autonomous appointment never names Mara or Pax. A player who holds the seat may appoint themselves, and the player-declaration rule in the secession note still lets a player holder declare. That command is slice 2. These headless runs do not send it.

Opening seats, state tick 0, everyone present:

| Seed | Crown Harbor | Cinder Key | Glassport |
| --- | --- | --- | --- |
| 1847 | Jun Marrow, steward, 0.73, score 97.508 | Esme Dusk, raider, 0.657, score 94.864 | Lio Crow, merchant, 0.666, score 87.315 |
| 2718 | Ada Sorn, explorer, 0.518, score 91.901 | Esme Dusk, raider, 0.824, score 83.18 | Vale Drake, explorer, 0.553, score 91.648 |
| 4096 | Orin Rill, raider, 0.439, score 79.95 | Esme Dusk, raider, 0.623, score 57.133 | Lio Crow, merchant, 0.534, score 91.706 |

Esme Dusk is Free Tide's opening governor of Cinder Key on every seed. She is the top eligible score on that dock at setup.

Seatings over the 1201 states: 26, 27, and 33. Distinct governors: 13, 13, and 13, out of 22 faction members. The seating is the claimant on 11, 10, and 10 of those seatings. The other seatings name someone else who was on the dock. The first difference between governor and `ownerId` is state tick 0, because the opening ports have a governor and a null owner.

## 3. What the office grants

Three grants, each with the limit the existing notes already drew.

**Income.** A stipend of 18 per world day per governor. Eighteen is `ticksPerDay * PASSAGE_COST_PER_TICK`, the mate allowance that is already in the code. It is not a new fitted number. The draw comes from the treasury, after the mates' obligation, and only when the headroom covers 18 for every seat that faction holds that day. Otherwise the stipend that day is 0. The mates' cap stays the balance share. The governor does not become an uncapped spender. The holder stays uncapped. Garrison, wages, and sale proceeds stay on the rules that already credit them.

**Command.** The governor is the person who may declare secession for that port. They do not issue standing orders, do not confirm a report, do not retarget, and do not take the holder's draw. [World simulation](world-simulation.md) separates a reporting job from authority. This slice grants the declaration and leaves the rest with the command holder.

**Tax.** The governor does not write `taxRate`. The free command holder is the only writer, which is the leader-tax rule. The acting commander still does not set it. The governor's influence is the secession gate: a holding rate above 0.15, with stability at or below 55, is what lets an autonomous governor declare. A rate at or under 0.15 leaves the gate shut. Raising the rate is a choice the holder makes, knowing who would then be able to leave. It is not a second hand on the number.

No scripted revolt. A dominant faction keeps its governors for as long as it holds the ports and the holder keeps the seats filled. Nothing in this note removes a governor because the faction is large.

## 4. How patronage moves loyalty

`personality.loyalty` is written in `personalityFor` and is not written again. An officer draws 0.75–0.98. Everyone else draws 0.30–0.85. The unpaid-release scar stores `loyaltyAdjustment`, omitted at 0. The cover sort and the secession follow line read the sum. Work, the serve-faction score, and obedience stay on the seed. The tests already pin that split.

Patronage uses the scar's step in the other direction. On appointment, the scarred reading rises by 0.04. On removal, it falls by 0.04. The write is `round(clamp(value, 0.05, 0.98), 3)`, the same clamp as the scar. The stored field is `patronageAdjustment`, omitted at 0, so a removal does not erase an unpaid-release scar and a scar does not erase a patronage. The cover sort and the secession follow line add both. The other loyalty reads stay on the seed.

The step was applied as a readout at the moment of each governor's first seating. That pass did not write the field. The run that stores it is [Patronage resimulation](#patronage-resimulation).

| Seed | Distinct governors | Already at or above 0.75 | Cross 0.75 | Stay under 0.75 |
| ---: | ---: | ---: | ---: | ---: |
| 1847 | 13 | 5 | 2 | 6 |
| 2718 | 13 | 6 | 0 | 7 |
| 4096 | 13 | 5 | 1 | 7 |

The crossings are Jun Marrow, 0.73 to 0.77, Crown Harbor at state tick 0, and Niko Wren, 0.74 to 0.78, Glassport at state tick 423, both on 1847. On 4096 the crossing is Sable Morrow, 0.739 to 0.779, Cinder Key at state tick 45. Pax Ash on 4096 is 0.745, inside a 0.04 step of 0.75, and the appointment rule does not name the holder, so he is not in that row.

A step of 0.04 adds 2 to the cover score. At state tick 0 the opening governors do not pass the top free mate. Jun Marrow is already World Government's top mate on 1847, at 97.508, and Bram Quill is at 94.184. Esme Dusk's Free Tide score rises from 94.864 to 96.864, and Dax Pike is at 107.296. On 2718 Ada Sorn rises from 91.901 to 93.901, and Iris Stone is at 106.521. Esme Dusk rises from 83.18 to 85.18, and Zara Gale is at 85.28. On 4096 Orin Rill rises from 79.95, and Rook Tern is at 103.929. Esme Dusk rises from 57.133, and Corin Hale is at 97.227. Later seatings were not compared to the live ranking. The cover sort was not re-run.

The declarer's own loyalty is not the secession gate. A governor at 0.77 still declares when the rate and the stability say so. The 0.75 line is who follows someone else's declaration. Patronage can move a person across that line. It does not close their own.

## 5. Treasury, tax, and secession

### Treasury

Headroom is `treasury − freeMateCount × 18`. Free mates are the members who are not captive and are not the holder, which is the set `memberAllowanceCap` already uses. Eighteen times that count is one full day of allowance for every free mate, paid at once. Headroom is what would be left. A negative headroom is a treasury that cannot pay the mates' 18, which is the case the balance share already shrinks.

Opening balances are 18000 and 2800. Twelve World Government mates and eight Free Tide mates make the opening obligation 216 and 144. Opening headroom is 17784 and 2656. Both factions hold a port, so both can pay 18 per seat on that state.

World Government's headroom stays positive on all 1201 states. The minimum is 12889.21 at state tick 1193 (treasury 13105.21, 12 mates), 14647.93 at state tick 1196 (treasury 14863.93, 12 mates), and 12358.01 at state tick 1199 (treasury 12574.01, 12 mates). A faction holds at most the three ports that ever have a `factionId`. Three seats at 18 are 54. The minimum is above that on every seed. On every state where World Government holds a port, 1201, 1195, and 1179 of them, the headroom covers 18 for every seat. The other states are landless, and there is no stipend to pay. Day boundaries, `tick % 6 === 0` from 0 through 1200, are 201 states. The same cover holds on 201, 200, and 197 of them. The misses are the landless boundaries.

Free Tide reaches a headroom of −144 on every seed, which is a treasury of 0 and 8 free mates. Those states are tick 117, tick 597, and tick 211. Headroom is negative on 1047, 804, and 1059 of the 1201 states. States where Free Tide holds at least one port: 1197, 1144, and 1182. Of those, headroom covers 18 for every seat on 129, 340, and 126, and covers a single 18 on 139, 340, and 134. At the 201 day boundaries the full cover is 23, 57, and 24. Tick 1200 headroom is −101.12, −136.09, and −102.24. The stipend that day is 0.

Ending treasuries on the baseline are World Government 13149.10, 14874.12, and 12600.45, and Free Tide 24.88, 7.91, and 41.76. The holder is uncapped. A stipend that pays only from headroom does not stop Pax spending what the mates leave. It also does not create coins when the headroom is negative.

Port tax, the sum of `tax` on `worked` and on sold `market-trade` at that settlement over 1200 ticks:

| Seed | Crown Harbor | Cinder Key | Glassport | Verdant Cay |
| ---: | ---: | ---: | ---: | ---: |
| 1847 | 14671.01 | 9883.50 | 12438.77 | 0 |
| 2718 | 12301.46 | 14916.52 | 9974.12 | 0 |
| 4096 | 12699.54 | 8949.74 | 16385.47 | 0 |

The row sums are 36993.28, 37192.10, and 38034.75. Verdant Cay pays none because a neutral port pays no tax. Ransom is not in that table. It credits the captor's faction: World Government 798.20, 723.53, and 362.94, Free Tide 434.20, 123.37, and 1103.05. Releases with a null captor faction: 0. Rewriting `ownerId` would not retarget a ransom on these runs. This brief does not rewrite it.

The stipend is 18, not a percent of the port tax. A percent was not run. The port tax is the pool such a percent would have been taken from.

### Tax

Scenario rates are 0.14 and 0.08. Both sit at or under 0.15, so the secession gate is shut on the baseline: 0 port-ticks, 0 spells, on every seed, whether the declarer is the owner or the governor. Inside 72 ticks the same count is 0.

The slice 3 rule is the one in the leader-tax addendum, floor 55. The harness subtracted the graded drift on each faction-held peaceful upkeep, then let every free holder step one cent. The acting commander stayed out. The run reproduced that addendum. Tick 72 stays on the fixture, because the first `tax-rate-set` is tick 120, tick 216, and tick 120. Tick 1200 hashes are `28866eb80bd48798c78791dd8f0c4093b9ffecfb8009421db7dd2c109d4f1e47` (161658), `712b60edc75c313f17e774951f43aa84fcd487fbc29c422215cd602b19665be8` (161613), and `b0ac72fe452697010e58570136737e4dd8ed12770a2e86863bfdaa76ee07e114` (162327). Ending rates are World Government 0.08, 0.11, and 0.14, Free Tide 0.16, 0.16, and 0.17. Sets are 6, 3, and 0 for Mara, and 32, 26, and 37 for Pax. Ending treasuries are 8928.22, 10797.01, and 14514.91, and 32.65, 673.57, and 34.02. Two of the three Free Tide endings still sit under the mate obligation.

### Secession

The owner census on the baseline matches the secession note's spell counts. Claims, and spells, are 24, 25, and 30. By port:

| Seed | Crown Harbor | Cinder Key | Glassport | Verdant Cay | Pax Ash, the command holder |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1847 | 9 | 5 | 10 | 0 | 3 |
| 2718 | 9 | 7 | 9 | 0 | 4 |
| 4096 | 12 | 7 | 11 | 0 | 2 |

The first claims are Glassport, Finn Frost, event tick 58; Cinder Key, Kessa Calder, event tick 46; Cinder Key, Jun Marrow, event tick 44. States with at least one owner, out of 1201: 1142, 1154, and 1156. Owned port-ticks: 2869, 2698, and 3087. Of those, the owner is anchored and free on 1457, 1213, and 1304, away on 1300, 1276, and 1782, and captive on 112, 209, and 1. Captive is counted even when the prisoner is still on the dock. The three columns sum to the owned port-ticks.

Membership does not move. `factionId` at tick 1200 matches tick 0 for all 30 characters. `personality.loyalty` matches too. The scars at tick 1200 are the adjustment, not a new seed:

| Seed | Scarred at tick 1200 |
| --- | --- |
| 1847 | Mara Vane −0.04 (0.808 → 0.768), Bram Quill −0.04 (0.844 → 0.804), Mina Vale −0.04 (0.554 → 0.514), Esme Dusk −0.12 (0.657 → 0.537) |
| 2718 | Mara Vane −0.04 (0.875 → 0.835), Vale Drake −0.04 (0.553 → 0.513), Mina Vale −0.08 (0.465 → 0.385), Esme Dusk −0.04 (0.824 → 0.784) |
| 4096 | Sable Morrow −0.04 (0.739 → 0.699), Kessa Calder −0.04 (0.692 → 0.652), Mina Vale −0.04 (0.311 → 0.271) |

The slice 3 gate is the addendum's gate: a port-tick with an owner, a holding rate above 0.15, and stability at or below 55, stability taken as `round(stability * 1000) <= 55000`. This run recounts it as 246, 103, and 333 port-ticks, on 221, 103, and 331 world ticks, in 15, 7, and 9 ownership spells. The full declarer test adds presence, a matching faction, and not the command holder. Those port-ticks are 160, 99, and 212, in 12, 5, and 7 spells.

The sticky governor, appointed by the rule in section 2 and not written onto the world, changes the full test and leaves the spell count of the broad gate where it is:

| Seed | Owner broad | Governor broad | Owner full | Governor full | Both full | Owner only | Governor only | Dock full |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1847 | 246 | 214 | 160 | 137 | 127 | 33 | 10 | 183 |
| 2718 | 103 | 103 | 99 | 50 | 50 | 49 | 0 | 99 |
| 4096 | 333 | 281 | 212 | 155 | 151 | 61 | 4 | 231 |

Broad spells stay 15, 7, and 9. Full spells are 12, 5, and 7 for the owner and 13, 5, and 7 for the governor. The dock column renames the governor on every state from whoever is anchored then, provided the holder is free. That person is present by construction. It is a comparison, not the default. The default is the sticky seat, and the sticky seat is often away, so the full gate shrinks. On 2718 it falls by 49 port-ticks and gains none. Nothing in the readout stations the governor. Travel stays what the planner already does.

The gate ticks were not turned into `secession-declared` events. The hash of a world that emits them was not measured.

## 6. The rosters, and the ports at 72 and 1200

World Government is `character-01` through `character-13`. Free Tide is `character-14` through `character-22`. `character-23` through `character-30` are unaffiliated on every seed. Loyalty below is the seed, `round(..., 3)`, the same number at tick 0 and tick 1200.

| Id | Name | Archetype | 1847 | 2718 | 4096 |
| --- | --- | --- | ---: | ---: | ---: |
| character-01 | Mara Vane | officer | 0.808 | 0.875 | 0.792 |
| character-02 | Bram Quill | merchant | 0.844 | 0.375 | 0.658 |
| character-03 | Niko Wren | explorer | 0.74 | 0.307 | 0.568 |
| character-04 | Sable Morrow | raider | 0.577 | 0.553 | 0.739 |
| character-05 | Jun Marrow | steward | 0.73 | 0.802 | 0.431 |
| character-06 | Iris Stone | officer | 0.967 | 0.79 | 0.766 |
| character-07 | Toma Reef | merchant | 0.591 | 0.566 | 0.752 |
| character-08 | Vale Drake | explorer | 0.348 | 0.553 | 0.542 |
| character-09 | Orin Rill | raider | 0.477 | 0.423 | 0.439 |
| character-10 | Kessa Calder | steward | 0.539 | 0.491 | 0.692 |
| character-11 | Rook Tern | officer | 0.957 | 0.833 | 0.979 |
| character-12 | Lio Crow | merchant | 0.666 | 0.833 | 0.534 |
| character-13 | Ada Sorn | explorer | 0.632 | 0.518 | 0.65 |
| character-14 | Pax Ash | raider | 0.708 | 0.533 | 0.745 |
| character-15 | Mina Vale | steward | 0.554 | 0.465 | 0.311 |
| character-16 | Corin Hale | officer | 0.765 | 0.978 | 0.825 |
| character-17 | Zara Gale | merchant | 0.838 | 0.826 | 0.384 |
| character-18 | Finn Frost | explorer | 0.322 | 0.659 | 0.378 |
| character-19 | Esme Dusk | raider | 0.657 | 0.824 | 0.623 |
| character-20 | Dax Pike | steward | 0.786 | 0.831 | 0.628 |
| character-21 | Mara Calder | officer | 0.971 | 0.833 | 0.796 |
| character-22 | Bram Tern | merchant | 0.439 | 0.383 | 0.499 |

Mara is the human controller. Pax is autonomous. Quartiles, linear index `(n − 1) * p`, then rounded to 3 decimals:

| Seed | World Government | Free Tide | Unaffiliated |
| --- | --- | --- | --- |
| 1847 | 0.348 / 0.577 / 0.666 / 0.808 / 0.967, below 0.5: 2 of 13 | 0.322 / 0.554 / 0.708 / 0.786 / 0.971, below 0.5: 2 of 9 | 0.334 / 0.425 / 0.632 / 0.784 / 0.96, below 0.5: 3 of 8 |
| 2718 | 0.307 / 0.491 / 0.553 / 0.802 / 0.875, below 0.5: 4 of 13 | 0.383 / 0.533 / 0.824 / 0.831 / 0.978, below 0.5: 2 of 9 | 0.356 / 0.626 / 0.747 / 0.778 / 0.801, below 0.5: 2 of 8 |
| 4096 | 0.431 / 0.542 / 0.658 / 0.752 / 0.979, below 0.5: 2 of 13 | 0.311 / 0.384 / 0.623 / 0.745 / 0.825, below 0.5: 4 of 9 | 0.402 / 0.578 / 0.619 / 0.64 / 0.805, below 0.5: 1 of 8 |

At tick 72 the rates are still 0.14 and 0.08, and the governor readout is the sticky rule. Crown Harbor has no owner. Headroom is World Government 17343.72, 17624.40, and 17296.28, and Free Tide 972.46, 1009.70, and 1463.26.

| Seed | Port | Faction | Owner | Owner there | Governor | Governor there | Stability | Garrison |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: |
| 1847 | Crown Harbor | World Government | — | — | Jun Marrow | away | 91.1 | 247 |
| 1847 | Cinder Key | World Government | Jun Marrow | away | Jun Marrow | away | 55.15 | 10 |
| 1847 | Glassport | Free Tide | Finn Frost | present | Dax Pike | away | 55.39 | 11 |
| 2718 | Crown Harbor | World Government | — | — | Ada Sorn | away | 87.01 | 212 |
| 2718 | Cinder Key | World Government | Kessa Calder | away | Jun Marrow | present | 55.75 | 7 |
| 2718 | Glassport | World Government | — | — | Vale Drake | away | 82.01 | 122 |
| 4096 | Crown Harbor | World Government | — | — | Orin Rill | away | 89.04 | 228 |
| 4096 | Cinder Key | Free Tide | Mara Calder | away | Mara Calder | away | 55.72 | 5 |
| 4096 | Glassport | World Government | — | — | Lio Crow | away | 74.89 | 84 |

Free Tide holds no port at tick 72 on seed 2718, so it has no governor and no stipend that day, even though the headroom is 1009.70. World Government holds three ports on that state. The headroom still covers 54.

At tick 1200, baseline rates, three ports owned on every seed. Pax Ash owns Glassport on 2718 and is the command holder there, so the owner-gate would skip him. The governor on that port is Esme Dusk, present. The scenario rate is 0.08, so the gate is shut anyway.

| Seed | Port | Faction | Tax | Owner | There | Governor | There | Stability | Garrison | Provisions |
| --- | --- | --- | ---: | --- | --- | --- | --- | ---: | ---: | ---: |
| 1847 | Crown Harbor | Free Tide | 0.08 | Zara Gale | away | Zara Gale | away | 56.29 | 12 | 0 |
| 1847 | Cinder Key | World Government | 0.14 | Bram Quill | away | Kessa Calder | present | 60.19 | 11 | 0 |
| 1847 | Glassport | World Government | 0.14 | Bram Quill | away | Bram Quill | away | 55.54 | 7 | 0.636 |
| 2718 | Crown Harbor | Free Tide | 0.08 | Corin Hale | present | Corin Hale | present | 56.29 | 16 | 0 |
| 2718 | Cinder Key | World Government | 0.14 | Niko Wren | away | Iris Stone | present | 55.42 | 5 | 0 |
| 2718 | Glassport | Free Tide | 0.08 | Pax Ash | present | Esme Dusk | present | 55.54 | 7 | 0.636 |
| 4096 | Crown Harbor | World Government | 0.14 | Vale Drake | away | Rook Tern | present | 55.96 | 8 | 0 |
| 4096 | Cinder Key | World Government | 0.14 | Bram Quill | present | Iris Stone | present | 56.02 | 6 | 0 |
| 4096 | Glassport | Free Tide | 0.08 | Corin Hale | away | Corin Hale | away | 56.08 | 8 | 0 |

## 7. Slice plan

| Slice | What lands | Hash on these three seeds |
| --- | --- | --- |
| 1 | A readout, computed when the settlement panel is built. The governor the free holder would name, whether that person is on the dock, and the headroom. Not written onto the world and not written onto an event. | Neutral. `stateHash` and the event count stay on the table at the top. |
| 2 | `appoint-governor` and `remove-governor`, the reducer, and `office-appointed`. `governorId` omitted until an appointment. No autonomous caller. A headless run never queues the command. | Neutral, for the same reason a headless run emits no `tax-rate-set`. A session that appoints moves the state hash on that tick. That session was not run. |
| 3 | The autonomous appointment in section 2. The event carries the governor id. The reducer writes `governorId`. | Moves the 72-tick fixture. The opening ports receive a governor at state tick 0, which is inside the window. The new hash was not measured. |
| 4 | The stipend. Eighteen per seat per day, drawn only when headroom covers every seat, else 0. The mates' cap is unchanged. | Moves the 72-tick fixture. Opening headroom is 17784 and 2656, so the first day can pay. The new hash was not measured. |
| 5 | Patronage. `patronageAdjustment` of one 0.04 step on appointment, and the reverse on removal. The cover sort and the secession follow line add it. Work, goals, and obedience stay on the seed. | Moves the 72-tick fixture. The opening governors are named at state tick 0. Event counts stay 8413, 8456, and 8261. The hashes are in [Patronage resimulation](#patronage-resimulation). |
| 6 | The secession declarer is the governor. `ownerId` stays the claimant. No governor means nobody declares. | Neutral on today's rates: the gate is 0 spells with either declarer, so a walker emits nothing. Under slice 3 the full-gate port-ticks change as in section 5. Those declarations were not emitted, and that hash was not measured. |

Slice 3 should not ship as a silent rewrite of the fixture. The Lead can keep slices 1 and 2, which leave the golden file where it is, and take the autonomous appointment in a later change that regenerates the fixture on Node v24.21.0, ICU 78.3.

## 8. Questions for the Lead

The Lead rules on these against [game vision](game-vision.md). Defaults are what this brief would build.

1. **Which offices exist?** Default: one new office, the port governor, one per faction-held settlement. Command stays the derived seat. The reporting officer stays a briefing job. Verdant Cay has none while it is neutral. There is no rank ladder and no law in this slice.

2. **Who appoints, and who removes?** Default: the free command holder. The acting commander does not appoint and does not remove. These runs spend 84 and 84, 84 and 252, and 0 and 84 states in a regency, and a vacant seat stays vacant through them. Autonomous appointment uses the cover sort on the members anchored at the port, excluding the holder. The seat clears when the port changes faction, the governor leaves the faction, or the governor becomes the holder. Captivity keeps the seat and blocks the declaration.

3. **Does secession read the governor or the claimant?** Default: the governor. `ownerId` stays the claimant the claim already writes. A port with no governor has nobody who can declare, including Crown Harbor before its first claim. On the slice 3 world the broad spells stay 15, 7, and 9, and the full-gate port-ticks go from 160, 99, and 212 to 137, 50, and 155.

4. **What income does the office pay?** Default: 18 a day per seat, the allowance unit already in the code, and only when headroom covers 18 for every seat. Otherwise that day pays 0. The mates' cap is unchanged. The holder stays uncapped. World Government can pay on every state where it holds a port. Free Tide can pay every seat on 129, 340, and 126 of the states where it holds one. A percent of the port tax was not run.

5. **What command does the office give?** Default: the secession declaration for that port. The governor does not issue standing orders, confirm, retarget, or draw the treasury without a cap.

6. **How does the office bear on the tax?** Default: it does not write `taxRate`. The free holder remains the only writer. The acting commander still does not set it. The influence is the gate. A rate above 0.15 is what lets this governor declare. A rate at or under it leaves the gate shut, which is the whole of the baseline.

7. **How does patronage move loyalty?** Default: one step of 0.04 on appointment, and the reverse on removal, stored as `patronageAdjustment`, added by the cover sort and the secession follow line. The other loyalty reads stay on the seed. The resimulation kept the step. It crosses 0.75 for Jun Marrow and Niko Wren on 1847, for nobody on 2718, and for Sable Morrow on 4096. Under the slice 3 rule the same step also lifts a scarred Iris Stone on 4096. No governor-full spell loses a follower.

8. **Does a governor who sails get replaced?** Default: no. The seat is sticky, and this slice does not change travel. That is why the full gate shrinks. Renaming the governor every state from whoever is anchored, the dock column, gives 183, 99, and 231 full port-ticks. That rule was measured and is not the default.

9. **Does a captive or absent governor get a deputy?** Default: no. The command seat already has the acting commander, and that cover does not appoint, remove, or declare. The governor's seat waits. [Game vision](game-vision.md) says offices continue through deputies while a human officeholder is away. Mara's command seat is that case. A deputy for the governor waits until the Lead asks for one.

## Patronage resimulation

The 0.04 step was written onto the world and the 1200-tick run was repeated. The harness was local and was not left in the tree. Checked on `1535ad80122467078f370fd5cb4ade0e34ce577a`. Node v24.21.0, ICU 78.3. `npm test` passed, 374 tests. The 72-tick fixture passed, including the golden recovery replay of 600 events. The 1200-tick baseline matched the table at the top of this note.

While a character holds a governor seat, `patronageAdjustment` is `round(clamp(base + 0.04, 0.05, 0.98) − base, 3)`, omitted at 0. `base` is `personality.loyalty + (loyaltyAdjustment ?? 0)`. Clearing the seat deletes the field. That is the full 0.04 in reverse when the ceiling did not bind. When the ceiling binds, the stored step is smaller than 0.04, and deletion drops the reading by that smaller step. The appointment sort still uses `base` only, which is the sort in section 2. The cover sort adds the field. The dock sort, work, goals, and obedience stay on the seed. Secession was not emitted. The follow line was read beside the run.

On today's rates the ordered event identity matches the baseline: type, tick, actor, settlement, and target. The cover sort never names a different mate. Seatings are 26, 27, and 33. Distinct governors are 13, 13, and 13. The first-seating crossings are the ones in section 4: Jun Marrow, 0.73 to 0.77, Crown Harbor at state tick 0, and again on later seatings; Niko Wren, 0.74 to 0.78, Glassport at state tick 423; Sable Morrow, 0.739 to 0.779, Cinder Key at state tick 45. Seed 2718 still crosses nobody.

Faction members are the 22 characters with a faction. Quartiles are the linear index `(n − 1) * p` on the follow reading at state tick 1200, then rounded to 3 decimals. "Below" is a reading under 0.75. Member-states are those 22 on each of the 1201 states, 26422.

| Seed | Without patronage | With patronage | Below at tick 1200 | Member-states below | Lifted, states |
| ---: | --- | --- | --- | --- | --- |
| 1847 | 0.322 / 0.538 / 0.687 / 0.781 / 0.971 | 0.322 / 0.547 / 0.687 / 0.781 / 0.971 | 14 and 14 | 16814 → 15959 | Jun Marrow 808, Niko Wren 47 |
| 2718 | 0.307 / 0.496 / 0.612 / 0.829 / 0.978 | 0.307 / 0.496 / 0.612 / 0.831 / 0.98 | 12 and 12 | 14412 → 14412 | none |
| 4096 | 0.271 / 0.508 / 0.639 / 0.75 / 0.979 | 0.271 / 0.508 / 0.639 / 0.75 / 0.98 | 16 and 16 | 19216 → 19213 | Sable Morrow 3 |

At tick 1200 the headcount under 0.75 does not move: the governors then seated are already outside the band, or the step does not reach 0.75. On 1847 the seated readings are Bram Quill 0.804 → 0.844, Kessa Calder 0.539 → 0.579, and Zara Gale 0.838 → 0.878. On 2718 they are Iris Stone 0.79 → 0.83, Esme Dusk 0.784 → 0.824, and Corin Hale 0.978 → 0.98. On 4096 they are Iris Stone 0.766 → 0.806, Rook Tern 0.979 → 0.98, and Corin Hale 0.825 → 0.865. By faction, the tick-1200 counts under 0.75 are World Government 9, 8, and 9 of 13, and Free Tide 5, 4, and 7 of 9, with or without the step. The distinct members who are under 0.75 on at least one state stay 14, 12, and 16. The step lifts a seated governor for some of those states. It does not remove them from the set, because they are under the line again once the seat is cleared.

The ceiling binds on Mara Calder for 326 states (1847), Corin Hale for 166 states (2718), and Rook Tern for 279 states (4096). At tick 1200 the stored steps on that ceiling are Corin Hale 0.002 and Rook Tern 0.001.

### Slice 3, with the governor reading secession

The same field was stored on the slice 3 world: graded drift, floor 55, both free holders stepping. That world without the field reproduces the addendum hashes: `28866eb80bd48798c78791dd8f0c4093b9ffecfb8009421db7dd2c109d4f1e47` (161658), `712b60edc75c313f17e774951f43aa84fcd487fbc29c422215cd602b19665be8` (161613), and `b0ac72fe452697010e58570136737e4dd8ed12770a2e86863bfdaa76ee07e114` (162327). With the field stored, the ordered event identity still matches that world. Ending rates stay 0.08 / 0.16, 0.11 / 0.16, and 0.14 / 0.17.

The gate is unchanged by the step. Owner broad port-ticks stay 246, 103, and 333, in 15, 7, and 9 spells. Owner full stays 160, 99, and 212, in 12, 5, and 7 spells. Governor broad stays 214, 103, and 281, in 15, 7, and 9 spells. Governor full stays 137, 50, and 155, in 13, 5, and 7 spells. Unowned governor-full port-ticks: 0.

Followers are counted at the first governor-full state of each ownership spell, with the governor as the declarer. The sums are 12, 2, and 12 with the step and 12, 2, and 12 without it. Viable spells, at least one follower, are 8, 2, and 5 either way. No governor-full state loses a follower. The people the step lifts are the declarer, or they are not on that dock. Jun Marrow is lifted for 606 states and Niko Wren for 185, both on 1847. Seed 2718 lifts nobody. On 4096 Sable Morrow is lifted for 297 states and Iris Stone, scarred to 0.726 and seated at Cinder Key at state tick 902, for 85. Iris returns to 0.766 while the seat is held.

Quartiles on that world, without the step and with it:

| Seed | Without | With | Below at tick 1200 | Member-states below |
| ---: | --- | --- | --- | --- |
| 1847 | 0.322 / 0.548 / 0.662 / 0.781 / 0.971 | 0.322 / 0.548 / 0.669 / 0.781 / 0.971 | 15 and 15 | 16851 → 16060 |
| 2718 | 0.307 / 0.497 / 0.592 / 0.829 / 0.978 | 0.347 / 0.497 / 0.592 / 0.829 / 0.98 | 12 and 12 | 14412 → 14412 |
| 4096 | 0.271 / 0.508 / 0.639 / 0.741 / 0.899 | 0.271 / 0.535 / 0.639 / 0.742 / 0.899 | 17 and 17 | 19895 → 19513 |

The 2718 minimum moves because Niko Wren is seated at tick 1200, 0.307 to 0.347, which is still under 0.75. By faction the tick-1200 counts are World Government 10, 8, and 10 of 13, and Free Tide 5, 4, and 7 of 9, either way. Seatings on this world are 33, 26, and 25. Distinct governors are 15, 15, and 12. The ceiling binds on Iris Stone for 234 states (1847) and Corin Hale for 151 states (2718). Seed 4096 does not hit it. At tick 1200 Corin Hale's stored step is 0.002.

The cover sort names a different mate once. On seed 4096, at state tick 818, World Government's cover is Toma Reef (`character-07`) instead of Iris Stone (`character-06`). The event log does not move. Seeds 1847 and 2718 keep the slice 3 cover on every state.

No desertion event and no defection event exist under `src/`. `factionId` at tick 1200 matches tick 0 for all 30 characters, on the baseline, on today's rates with the field stored, and on the slice 3 world with the field stored. Battle defeats stay the battle result. They are not a faction change.

### Hash

Storing the seat, with no patronage field, already moves the hash. Event counts stay on the baseline.

| Seed | Tick 72 | Events | Tick 1200 | Events |
| ---: | --- | ---: | --- | ---: |
| 1847 | `8d91d0072b011a2616cd427165019687d194ea244706bd1cf97bb527d74dd074` | 8413 | `18a43b6fe9072e57efe6b13b3f6dfce5af74622123161adfd897399b8441b02e` | 160268 |
| 2718 | `23d8fb8b703fca6d97afeffc51e009ffa7651242545a8777389e293083a2a98e` | 8456 | `88e629280e6078d88c6301f836fb5ffa3145854f1d8a7fececbf333d620a155c` | 161850 |
| 4096 | `b29cf4d14c33bc0ab66ee99d5c625bc12dfcfbdb78ee25ff4a9625e2fe3b0760` | 8261 | `2ff153dd845d01e590bafaf48ff1aca9aaa59bb82248cced3b60d51ea21c7b63` | 162459 |

Storing the 0.04 field on top of the seat moves the hash again. Event counts still stay on the baseline. Tick 72 is inside the fixture window because the opening seats are named at state tick 0.

| Seed | Tick 72 | Events | Tick 1200 | Events |
| ---: | --- | ---: | --- | ---: |
| 1847 | `8f07459913647d163c54c338e9a8b983435c8f0b4d5a717c023a8e0e9950cb1f` | 8413 | `87c2297dd9b97f3e4e68acffa31882a5f9d464081f0310974dd94f29f26733bd` | 160268 |
| 2718 | `c6782bc81a9702c353a58e2e3fe3eaeac3b40fdd53560774820fb1bc741b3591` | 8456 | `d42121ddcceb7879f90cd8561a4bcfd7a8ae19864daa975adaa98846431ddf67` | 161850 |
| 4096 | `f2b22ad821e01d371354416ad290786879f0040079b46abbbdc6a44b53c4c4c1` | 8261 | `33cdaba3d762b0499404667fc52451028fd3eb5d10763f3df76055ac351ab317` | 162459 |

On the slice 3 world the first `tax-rate-set` is still outside 72 ticks, so tick 72 with the field stored is the same three hashes as the table above. Tick 1200 moves off the addendum hashes. Event counts stay 161658, 161613, and 162327.

| Seed | Tick 1200 with the field | Events |
| ---: | --- | ---: |
| 1847 | `8dd0eede9526ed9e032ae338b32fc0f7f4981ad7bb86436f8266fd9aac937697` | 161658 |
| 2718 | `a640895d448e284601758f8c34bff757852817713b102ec3f4972364512aa886` | 161613 |
| 4096 | `3ce72c067ac47182d868137c79b9228b0a76dc5bed0d5f17c9d30028dd052437` | 162327 |

**The step should stand.** It is the scar's step, in the other direction. On these seeds it lifts seated governors across 0.75 and does not change who follows a declaration, how many spells open, or the event log. The hash moves because the field is stored. A larger step was not run.

## Addendum: the full office roster

**Status: Open.** Design brief for the Lead. The sections above are the port-governor brief. They stay as they were. Nothing in this addendum is in the tree. The census is a local readout of the baseline tape. Two stipend deductions and one field store were applied by a local harness, measured, and restored.

Checked on `origin/main` at `52bb65e9a2023a6e462192798c2c4285f4d0ab06` (PR #110). Node v24.21.0, ICU 78.3. `npm test` passed, 427 tests. The 72-tick fixture passed, including the golden recovery replay of 600 events on seed 1847 split at tick 47. A headless run reproduced the fixture and the 1200-tick baseline:

| Seed | Tick 72 state hash | Events | Tick 1200 state hash | Events |
| --- | --- | ---: | --- | ---: |
| 1847 | `4ea893a485b05ce6eab599919765903ade9a0ce45f383437f4698064faa7a297` | 8413 | `acf1b2c25f0f55c3b308177ec621180a515897849bf1ee9ba5aa5bca3b0852c9` | 164732 |
| 2718 | `d376ad02c6e7c9b03dd0eb4db1c3c137ac7a00d61a096673e12ae4fdabbdfef2` | 8456 | `47c65e2fd676bfd420a36ee4bf13d871d6b474dfd27b6106a3319724f6e75ec9` | 162127 |
| 4096 | `ac780b3999c3da53f38c0cd16301dfa7f60562a35796f5fa0451c969c9ed08de` | 8261 | `a0ac2cc419d640660cf34c20acb3a0cb42449fef6f13e4eadb4caaaf9d255a1f` | 159900 |

Captures are 15, 14, and 13. Releases are 14, 13, and 13. Secessions are 6, 5, and 4. Ending treasuries are World Government 5501.03, 6885.06, and 3608.30, and Free Tide 0, 666.09, and 0. Free Tide is at or below 0 on 570, 150, and 713 of the states from tick 0 through tick 1200.

Runs are `createPrototypeWorld` plus `runTick`, no player commands. Seeds 1847, 2718, and 4096. A figure at tick 0 is the world before any `runTick`. A figure at tick 72 or tick 1200 is the world after that many calls. Tick numbers on events are the `tick` field. State samples below are tick 0 through tick 1200, 1201 states. The stipend mornings are tick 0, 6, …, 1194, two hundred of them. The state at tick 1200 is not billed.

[Game vision](game-vision.md) names winning office as a weekly success, and it keeps a political office going through a deputy while the human holder is away. It does not name a treasurer or an admiral. [Aging](aging.md) is the death rule: a year is 180 ticks, death draws use a side stream, and the other defaults in that brief stand, including vacant succession. [Morale](morale.md) is the desertion rule: 12 short mornings, then one side-stream roll, leaving when the roll is under 0.5. [Treasury balance](treasury-balance.md) is the allowance, `min(18, treasury / free mates)`, holder uncapped. [Secession](secession.md) is what the governor reads. On this tree the declarer is still `ownerId`.

### Summary

The roster stays the command holder, the acting commander, and the port governor. A treasurer and an admiral were seated in the readout and were not given a job the code already has. There is one treasury. The holder draws it without a cap, 260, 424, and 211 times, 7027.89, 6911.28, and 5199.07 coins. Mates draw the balance share, 5696, 5991, and 6401 times. There is no ship record. `sailors` is unchanged across the 1200 ticks. An admiral who issued orders would be a second issuer, and `commandHolderId` then returns null.

A breakaway has no command holder. Port-ticks held by a faction with no holder are 1367, 842, and 1482, and every one of them is a breakaway. The appointment rule does not run. The governor seat stays empty. At tick 1200 those ports have an owner and no governor.

Vacancies below are hits on the sticky seat. The character is not removed, so a death or a desertion is the post they hold on the living tape. Governor deaths are 2, 0, and 0. Governor captures are 0, 1, and 2. Governor desertions are 0. A secession clears a seated governor 3, 5, and 2 times. The declarer is that governor on 2, 4, and 2 of the 6, 5, and 4 declarations.

The governor stipend, 18 from headroom, is the offices rule measured on this tree. On the tape the spot bill is World Government 4518, 4752, and 4626, and Free Tide 774, 1944, and 792. The writing run pays 3510, 5130, and 3726, and 612, 1116, and 756. Free Tide ends at 0, 0, and 0. The middle seed's baseline ending is 666.09. Adding a treasurer and an admiral on the same 18 drains World Government to 52.25, 148.85, and 0.

### 1. Which posts the material conditions support

Three seats are already named. The command holder is the standing-order issuer. The acting commander is the captivity cover. The port governor is one seat per faction-held settlement, appointed by the free holder from the members anchored on that dock. The opening names are the table in section 2. Verdant Cay is neutral on every state. Seatings on this tree are 23, 24, and 20. Distinct governors are 9, 14, and 11.

Regency, states where `actingCommanderId` is set, out of 1201: World Government 84, 84, and 84, Free Tide 84, 190, and 84. At tick 72 the field is absent on both factions. At tick 1200 it is absent except Free Tide on 2718, where Dax Pike covers Pax Ash. The cover does not appoint, does not set the tax, and does not inherit the holder's draw. That is the deputy the vision already has.

A treasurer, scored beside the run, is the free mate with the highest `skills.trade`, lower id on a tie, not the holder and not captive. An admiral is the free mate with the highest `skills.navigation * 1000 + sailors`, same exclusions. Neither field is in the tree. At tick 72 the treasurer is Toma Reef, Toma Reef, and Bram Quill for World Government, and Bram Tern, Bram Tern, and Zara Gale for Free Tide. The admiral is Ada Sorn, Vale Drake, and Niko Wren, and Finn Frost, Finn Frost, and Corin Hale. On 2718 at tick 1200 the Free Tide admiral is Dax Pike, who is also the acting commander. The post is not a second person.

`sailors` does not change. The most hulls underway at once are 11, 11, and 11 for World Government and 9, 8, and 8 for Free Tide. A breakaway's most is 3, 3, and 5. Each character is already the hull. The holder already issues the orders.

### 2. How a post is filled, and what empties it

The free holder appoints. The acting commander does not. A governor is the cover sort on the members anchored at that port. Once named, the seat stays until the port's faction changes, the officer's faction no longer matches, or the officer becomes the command holder. Captivity does not clear it. That is the sticky seat these counts are read from.

A faction with no holder appoints nobody. Secession founds that faction and retargets the old holder's orders onto the cover who stayed, so the new faction has no issuer. The 1367, 842, and 1482 port-ticks are that case. Filled governor states are 2158, 2598, and 2039 of the 3603 faction-port states. The empty remainder is 1445, 1005, and 1564, of which 1367, 842, and 1482 are the breakaway ports. The other 78, 163, and 82 are World Government or Free Tide with nobody seated.

Death is the aging rule, read beside the tape and not written. Span ages are `DeterministicRng(seed).integer(18, 119)` in id order. A year is 180 ticks. The side stream is a `DeterministicRng` forked from `world.rngState` at setup and is not written back. `physical` is the weighted sum already inside `personalPower`, before the health factor. Strength is `(physical / 100 + troops.experience) / 2`. From 81 to 119, on the birthday, the character dies when the roll is under `((age - 80) / 40) * (1 - strength)`, clamped to 0–1. At 120 the death is certain and no roll is drawn. A person already counted is not rolled again. The character stays on the tape.

Deaths are 13, 5, and 8. Two of them are governors, one is the Free Tide admiral, and one is the command holder. Lio Crow and Esme Dusk reach 120 on 2718 and hold no post when they do. The post hits and those two age-120 deaths:

| Seed | Tick | Who | Post |
| --- | ---: | --- | --- |
| 1847 | 180 | Bram Quill (`character-02`) | governor of Glassport, roll 0.556 under 0.565 |
| 1847 | 360 | Jun Marrow (`character-05`) | governor of Crown Harbor, roll 0.388 under 0.390 |
| 1847 | 360 | Finn Frost (`character-18`) | admiral of Free Tide, roll 0.451 under 0.610 |
| 1847 | 1080 | Pax Ash (`character-14`) | command holder, roll 0.082 under 0.192 |
| 2718 | 180 | Lio Crow (`character-12`) | none, age 120 |
| 2718 | 720 | Esme Dusk (`character-19`) | none, age 120 |

Esme Dusk is not governor of Cinder Key at tick 720 on this tape. Mara's ages are 29, 35, and 44. She does not enter the band. Pax's ages are 101, 43, and 98. Only the 1847 birthday kills him. Unaffiliated deaths are 5, 0, and 3. They hold no post.

Desertion is the morale rule, also beside the tape. A free mate, not the holder, whose scarred loyalty is under 0.75, rolls once on the morning the short streak reaches 12. Short means the cap is under 18. The roll is the morale side stream, forked the same way, and a roll under 0.5 leaves. Mates who reach 12 are 8, 6, and 8. The leaves are 2, 0, and 2. Esme Dusk at tick 180, roll 0.245, and Mina Vale at tick 288, roll 0.034, both on 1847, hold no post. Zara Gale at tick 204, roll 0.160, is Free Tide's treasurer. Dax Pike at the same tick, roll 0.238, holds no post. The six mates on 2718 stay. No governor deserts.

Captures that hit a sticky post: Finn Frost, the Free Tide admiral, at tick 333 on 1847 and tick 308 on 2718. Kessa Calder, governor of Crown Harbor, at tick 979 on 2718. Iris Stone, governor of Glassport, at tick 437 on 4096. Rook Tern, governor of Crown Harbor, at tick 1009 on 4096. Holder captures are 2, 4, and 2: Pax at 570 and Mara at 1078; Pax at 119, 266, and 1178, and Mara at 836; Pax at 406 and Mara at 759. No acting commander is captured while covering.

Secession clears a seated governor 3, 5, and 2 times, because the port's faction changes and the seat does not follow the officer into the new hold. The declarer is that governor on 2, 4, and 2 declarations: Corin Hale and Dax Pike on 1847; Mina Vale, Zara Gale, Bram Tern, and Esme Dusk on 2718; Corin Hale and Zara Gale on 4096. Two others declare while a different governor holds the seat: Mina Vale at Glassport on 1847, Dax Pike seated, and Corin Hale at Cinder Key on 2718, Zara Gale seated. The remaining 3, 0, and 2 find the seat empty.

### 3. Allowance, succession, and the declaration

The stipend is 18, the same unit as the allowance. Headroom is `treasury − free mates × 18`. The day pays only when that headroom covers 18 for every seat the faction holds. Otherwise the day pays 0. The holder's draw stays uncapped. The mates' cap stays the balance share. A governor does not become a second holder.

World Government's cap is 18 on all 200 mornings. Free Tide's cap is under 18 on 77, 88, and 113 of them. A breakaway opens at 0, so its headroom does not cover a seat. The spot ledger bills none of them.

Succession is the aging default. A dead holder leaves the faction, the orders are not retargeted, and the seat is vacant. The acting commander is not promoted. On this census that death is Pax Ash at tick 1080 on 1847, and it is not written. A captive holder keeps the issuer id. The cover is seated beside him and does not take the orders. That is the 2, 4, and 2 holder captures.

The declaration on this tree is still the owner's. The offices brief moves it to the governor. On these seeds the owner who declares is the sticky governor 2, 4, and 2 times. Two declarations have a different governor in the seat, and 3, 0, and 2 find it empty. A port with no governor has nobody to declare under that read. Crown Harbor before its first claim, and every breakaway port after the faction change, are in that set.

At tick 1200 the seated governors are Kessa Calder at Cinder Key, Vale Drake at Glassport, and Jun Marrow at Crown Harbor. Jun is also the owner there. The other ports are breakaways and have no governor.

### 4. What the stipends cost

The spot bill uses the baseline treasury. The same captain is not removed, and the treasury is not reduced between mornings. Coins are 18 times the filled seats on a morning the headroom covers every held port. Days are mornings that pay at least one seat.

| Bill | World Government coins | Days | Free Tide coins | Days |
| --- | --- | ---: | --- | ---: |
| Governor | 4518, 4752, 4626 | 174, 164, 177 | 774, 1944, 792 | 30, 79, 31 |
| Governor, treasurer, and admiral | 11214, 11124, 11466 | 186, 177, 190 | 1368, 4788, 1512 | 23, 82, 25 |

The writing runs deduct those coins from the treasury on the same mornings, each run from the baseline. The governor run pays World Government 3510, 5130, and 3726, on 166, 186, and 169 mornings, and Free Tide 612, 1116, and 756, on 25, 56, and 31 mornings. Endings are World Government 1758.59, 4420.26, and 57.26, and Free Tide 0, 0, and 0. States at or below 0, after each of the 1200 ticks, are 841, 456, and 701. The baseline middle-seed ending of 666.09 does not survive the deduction.

The wide run pays World Government 9144, 9774, and 8478, and Free Tide 1476, 1710, and 1458. Endings are World Government 52.25, 148.85, and 0, and Free Tide 0, 6.33, and 0. That bill is the two extra posts. It is not the governor rule.

### 5. Hash

Slices are measured from the baseline, not stacked. A readout writes nothing. The tick rng is not drawn. Death and desertion rolls use their own side streams and are not written back.

Storing `governorId` on the settlement, and `treasurerId` and `admiralId` on the faction, moves the hash. Nothing reads the fields. The ordered event identity matches the baseline through tick 1200. Event counts stay on the baseline table. The fixture moves because the opening seats are named at state tick 0.

| Seed | Tick 72 | Events | Tick 1200 | Events |
| ---: | --- | ---: | --- | ---: |
| 1847 | `fd229411e1758bcd91b9c98cb8f032f3fdc6fe425b7bee328c92fa01d5fc111d` | 8413 | `6fe8646239787fd5ebf7f91510728dc44d9a8deb5f63917d54b39cfdf6f15101` | 164732 |
| 2718 | `52510ca8343fd1664fdd1b38aebea734e194a7805de8ae1fff631a5d7c8009cf` | 8456 | `4d146c1d20fefebcda4e9e37326bf373fb8d18c2bd063cd8f2a67eb8b2a3076f` | 162127 |
| 4096 | `94c185179b9725f82866625494ce2b51010d758563d3622b153ff3ab8774a364` | 8261 | `b0f8525ce480c2ec5a2aa143533d07c1e7c3ad612b5d91ab4c08fa116aaa0479` | 159900 |

The governor stipend writes no new event. The treasury is lower, so the tick-72 hash moves and the event count stays 8413, 8456, and 8261. The ordered event identity matches through the fixture. The first difference is tick 110, tick 216, and tick 96.

| Seed | Tick 72 | Events | Tick 1200 | Events |
| ---: | --- | ---: | --- | ---: |
| 1847 | `866ed2c82aba5ef909aeef4ffbf9b558a842483c7e2b9d253f5c7cce8727ce6f` | 8413 | `5f31c75d4dc2047fd927066c6a9130f0cec81da0e85da4a792284cabc2926397` | 164325 |
| 2718 | `0e8133175488be3b2feae35d8a68d4db80126f38d87348339c3d9b37534ec7bc` | 8456 | `7c27529a33bf0262fc883baee953b2708b63ef662abf38165edafeede34eb26c` | 164680 |
| 4096 | `b8cf5eedd07184d1ef3375191195e99f8a29e24ab21fb11f228da07045fb11f6` | 8261 | `5470e2f2496a5f9f01540b83ac31606230cfdd2822139330cbc282969812c1e1` | 164582 |

The wide stipend is the same shape. The first difference is tick 91, tick 167, and tick 89.

| Seed | Tick 72 | Events | Tick 1200 | Events |
| ---: | --- | ---: | --- | ---: |
| 1847 | `cff92ec13df831dc53ec06d53af39a2f6b82d3a908188171fa1ca2d13c18a164` | 8413 | `e55aae4a97412936222b120f5697b6455e3ddbc68404e2442b6a09a8cfeefa24` | 161426 |
| 2718 | `9b055e1097253c787430ec7ef40a8c89b624f907b971cf8bfaf69195484dc143` | 8456 | `6b426daad61e18813fd2544cc346c0e8ee8790aab3aae170974deb444c0df1b6` | 163527 |
| 4096 | `b78642cbd8a9cff83fe6636f0016335b3bacf8cc78812f1917b9080ea8eafa39` | 8261 | `15ab01b7b0cbc2b3497b0ffb2a4c2ce4e50c1de3ed4392f365c989c4862673b5` | 162572 |

A `character-died` world and a `character-deserted` world were not hashed here. Those events belong to the aging and morale rulings. This readout does not emit them.

### 6. Slice plan

The slices are in the order they would be considered. Each one starts from the baseline.

| Slice | What lands | Hash on these three seeds |
| --- | --- | --- |
| 1 | A readout. The holder, the cover, the governor, the breakaway ports with no holder, and the death, capture, and desertion hits. Not written. | Neutral. The baseline table. |
| 2 | The governor stipend. Eighteen per filled seat on a morning whose headroom covers every held port. No new event. | Tick 72 keeps the event count and moves the hash. The first event difference is tick 110, 216, and 96. Tick 1200 is the governor row. Free Tide ends at 0, 0, and 0. |
| 3 | `governorId`, `treasurerId`, and `admiralId` stored, nothing reading them. | The fixture moves. Event identity matches the baseline. Counts stay 8413, 8456, 8261 and 164732, 162127, 159900. |
| 4 | The stipend of slice 2, plus 18 for a treasurer and 18 for an admiral, with those filled posts added to the cover. | Tick 72 keeps the event count and moves the hash. The first event difference is tick 91, 167, and 89. Tick 1200 is the wide row. World Government ends at 52.25, 148.85, and 0. |

Slice 3 and slice 4 are the measurement of the extra posts. They are not required for slice 2.

### 7. Questions for the Lead

The Lead rules on these against [game vision](game-vision.md). Defaults are what this brief would build.

1. **Which posts exist beyond the holder, the acting commander, and the port governor?** Default: none. A treasurer and an admiral fail the material test. The holder is already the uncapped drawer. The mates are already on `min(18, treasury / free mates)`. There is no second account and no fleet. The vision's deputy is the acting commander, who does not appoint and does not take the holder's draw. The store that wrote the two extra ids is slice 3. It moves the fixture and does not change an event.

2. **Who fills a seat, and what happens when the faction has no holder?** Default: the free command holder appoints, and the acting commander does not. A breakaway has no issuer, so it appoints nobody. Those port-ticks are 1367, 842, and 1482. The seat stays empty until a holder exists. At tick 1200 the breakaway ports have an owner and no governor.

3. **What empties a governor seat?** Default: the port's faction changes, the officer leaves the faction, or the officer becomes the holder, and also capture, death, and desertion. On the sticky seat the hits are governor deaths 2, 0, and 0 (Bram Quill at Glassport, Jun Marrow at Crown Harbor), governor captures 0, 1, and 2 (Kessa Calder, Iris Stone, Rook Tern), and governor desertions 0. Secession clears a seated governor 3, 5, and 2 times. The clear was counted on the tape and was not given its own world.

4. **What happens to the command seat?** Default: the aging rule. A dead holder leaves the faction and the seat is vacant. The cover is not promoted. That death is Pax Ash at tick 1080 on 1847. A captive holder keeps the issuer. The cover is the deputy already in the code. Holder captures are 2, 4, and 2. No acting commander is captured while covering.

5. **What does the stipend cost?** Default: the governor's 18, from headroom, and only when the day covers every held port. The mates' cap is unchanged. The holder stays uncapped. The spot bill for Free Tide is 774, 1944, and 792. The writing run pays 612, 1116, and 756, and Free Tide ends at 0, 0, and 0. The wide bill is rejected. It ends World Government at 52.25, 148.85, and 0, and Free Tide at 0, 6.33, and 0.

6. **Does secession still read the governor?** Default: yes, as the offices brief already has it. `ownerId` stays the claimant. On this tree the walker still declares as the owner. That owner is the sticky governor on 2, 4, and 2 of the declarations. An empty seat declares nobody. This addendum does not give the declaration to a treasurer or an admiral.

7. **What moves the hash?** Default: slice 1 stays on the baseline table. Slice 2 moves the tick-72 hash by the treasury and first differs at event ticks 110, 216, and 96. Slice 3 moves the fixture at state tick 0 and does not change the event log. Slice 4 moves the tick-72 hash and first differs at event ticks 91, 167, and 89. No new draw. The tick rng stays the wrong stream. Death and desertion were not hashed.
