# Build order

**Status: Open / scheduling note.** No slice below is in the tree. The Lead's rulings stand. This note only orders the ones that are still unbuilt. Batch 1 is with the Engineer. The harness was local and was restored.

Checked after merging `origin/main` at `28928f6` (PR #117) into this branch. The merge commit is `1bc65e7`. Node v24.21.0, ICU 78.3. `npm test` passed, 447 tests. The 72-tick fixture passed, including the golden recovery replay of 600 events on seed 1847 split at tick 47. A headless run reproduced the fixture and the 1200-tick baseline below. `src/` and `tests/` are that merge. The progression readout is in. It does not move these hashes.

| Seed | Tick 72 state hash | Events | Tick 1200 state hash | Events |
| --- | --- | ---: | --- | ---: |
| 1847 | `86507558d49cee305c5f663e1699aacc19d66356ce518d4c32ac1e07085d8687` | 8426 | `9c22f0fe85a923526bc94f2f840a722d7d758509f35dd8422b9247e1c03750ac` | 164969 |
| 2718 | `c6268c398c5b8a674a1bef8a675cd74c747392e3fb767a67e1ebd8bc1a4143f6` | 8335 | `5169b16f45f28edfde3b6e8f230652ba40651b5e336d9225992ea1606e901688` | 164659 |
| 4096 | `d62ab7f9c9e840b55c012fb1d8f2fe6929a61359178b4daf7b5eb10cbf7bca95` | 8266 | `ec5ec0af8d0adb1586b1022f8acdc2ce85f948348e069f67ca4847e9510ce4da` | 164118 |

Runs are `createPrototypeWorld` plus `runTick`, no player commands. Seeds 1847, 2718, and 4096, in that order. Ending treasuries on that baseline are World Government 4035.27, 6029.16, and 10851.38, and Free Tide 0.00, 0.00, and 0.00. Secessions are 7, 5, and 5. The first `secession-declared` is event tick 477 (Finn Frost), 574 (Mina Vale), and 609 (Esme Dusk).

## Already built

Checked against [progress](../../progress.md) and the code. These are not in the order.

The progression skill step is in. `practicedSkill` is `src/sim/state.ts`, and `worked`, `travel-started`, and `battle-resolved` store the new absolutes. The fixture and the 1200-tick baseline above are that step's pin. Troop experience, the promotion label, and the rarity mark stay behind it, as the ruling said.

The hazards projection is in. `isDirectlyObserved` keeps the shared settlement and does not treat another held port as co-located. `projectCharacter` copies `travel` onto the viewer's own card and a faction mate's card, and leaves a rival's course null. That mate exception is the later ruling recorded in the progress log. [Hazards 4 and 5](hazards-2.md) still says a mate's course is null. The code is the later ruling. Nothing in that note is left to build.

## Not scheduled

These were ruled, and they stay out of the batches.

[Fleet](fleet.md) slices 3–7 stay parked. They wait until income can carry them. The levy does not start them. Slice 2 is the one-voyage limit already in the code.

[Income](income.md) lands the 0.05 governor levy only. Port dues, the sale tariff, the buy duty, the passage credit, the contract fee, the pay-first order, and the reserve floor do not land.

[Morale](morale.md) slice 3, certain desertion, does not land. [Contracts](contracts.md) at 45 does not land. [Money at sea](money-at-sea.md) slices 2 and 3 do not land. [Offices](offices.md) does not add a treasurer or an admiral. [Aging](aging.md) does not store ages at setup and does not inherit to the cover.

## Slices

A readout that writes nothing is not a slice here. "Doc" means the hash in that note, measured on an older baseline, not remeasured on this tip. "Measured" means this tip, the harness below, then restored.

### Contracts, slice 4

[Contracts](contracts.md) ruling. One autonomous captain of the faction that holds an empty shelf offers 10 provisions at 56.25. The carrier is the lowest id who passes `carrierBlocked`. The deadline is `max(travelTicks + 1, 2)`, never past 720. Free Tide pays by the quoted spend already in the tree.

Depends on the contract resolver, which is in the tree. It does not depend on negotiation. Negotiation's default was that nobody offers a contract unprompted. This ruling replaces that default for this haul.

Moves the 72-tick fixture on 2718 only. Seeds 1847 and 4096 stay on the fixture, and tick 1200 moves on all three. Taken from the doc. The 2718 tick-72 hash there is `2f295c23dd35677d3dd9b8ba922badf97b323fb4fcf229591636d732e267bb50`, 8474 events, on the pre-skill-step fixture. Not remeasured here.

Writes purses, escrow, treasuries, and the contract events. The same coins as the levy, the stipend, the wage collector, and a death's debt payment.

### News, slices 2–6, with the 24-tick cap

[News](news.md) ruling. Slice 1 is a readout and does not land as code.

Slice 2 stores `news-posted` on the origin port. Slice 3 copies the item on arrival, `observedTick` unchanged. Neither has a reader. Slice 4 points `factionInterest` and the landless test at `knowledge.factionId`. Garrison, stocks, and the claim offer stay live. Slice 5 is the tax step's pressed test, as ruled: a port the holder is standing in stays live, and ledger news of an away port counts only while the tax tick minus `observedTick` is at most 24. Slice 6 points the secession read at a news item instead of live stability and live loyalty.

Slices 2 and 3 come before 4, 5, and 6. Slice 6 also needs the walker, which is now in `runTick`. The news note said the walker was absent and the baseline stood. That sentence does not transfer. Secessions on this tip are the counts above.

Hash, taken from the doc, not remeasured. Slices 2, 3, and 4 move the fixture. Slice 5 as the 24-tick cap keeps seeds 1847 and 2718 on that note's fixture and moves 4096 to `f780c3abc599f2d6011990e601fa2aab950dcb484e90ea16914938f58024c105`, 8262 events. Tick 1200 moves on all three. Slice 6 was not given a hash.

Writes the ledger on the settlement, then travel targets (slice 4), `taxRate` (slice 5), and `secession-declared` (slice 6). The levy and the tax step both write `taxRate`. The offices ruling and slice 6 both touch who declares: the governor is the declarer, and the stability he reads is the ledger figure. Those are one declaration, not two.

### Negotiation

[Negotiation](negotiation.md), PR #100. The Lead accepted the defaults.

Slices 2, 4, and 7 are reducer cases with no autonomous caller. A headless run emits none of those types. Hash-neutral. They fit in the commit that first emits the type. They are not a re-pin.

Slice 3, the ransom reply, pays `min(purse, demand)`, the coins the release already writes. The offer key stays omitted, which is the row the note says keeps the baseline. A key stored at capture was not measured and does not land.

Slice 5 does not land. The default is that nobody offers a contract unprompted. The contracts ruling already has that haul, at 56.25, in batch 2. Slice 8 does not land. The default is that nobody offers a tribute unprompted. Slice 6, the pact shortlist, does not offer on its own. The default is that nobody offers a pact unprompted. The alliances writer is the one that accepts.

### Morale

[Morale](morale.md) ruling. The −0.5 term is slice 2. Desertion is slice 4: 12 short mornings, then one side-stream roll, leaving when the roll is under 0.5. Certain desertion does not land.

The term depends on the mate cap already in `memberAllowanceCap`. Desertion depends on that cap and on `personality.loyalty + loyaltyAdjustment`, the line secession already uses. Neither waits on an unbuilt slice. Patronage would move who sits under 0.75. Patronage is not ruled, so desertion does not wait for it.

The term writes `morale` on `character-upkeep`. Desertion writes `factionId` null on `character-deserted`. Place, travel, and troops stay. The same `factionId` as a death. The same cap as the stipend's headroom. The morale field is what decisions already read, so the term moves later actions without a new event type.

On the morale note's older baseline both slices keep the fixture and move tick 1200. Remeasured on this tip. The fixture still stays. The 1200 hashes are in the measurement section. They are not the hashes in that note.

### Alliances

[Alliances](alliances.md), PR #92. The Lead accepted the defaults. Nothing is forced at tick 0. The forced two-faction pact in that note is not the build.

Slice 2, the propose and break commands with no autonomous caller, is hash-neutral on a headless run. It fits with the negotiation reducers, in the commit that first emits the type. Not a re-pin.

Slice 6, a second attacker, stays out of the brief.

The autonomous accept (slice 3), the no-raid rule (slice 4), the sighting copy (slice 5), and the break cost (slice 7) wait for a third faction that holds a port, and then only with the faction that is not that enemy and not the parent just left. Both sides accept. The founder speaks until the seat is named. This tip does found third factions, after the fixture, so tick 1200 would move and the fixture would stay. That hash was not measured. They are batch 3. They need the governor seat from batch 2, because the founder is the governor who declared, and they need the batch 2 pin first: the news ledger and the deaths change who secedes. The break cost writes `breakAdjustment` of 0.04 on the same loyalty sum as `loyaltyAdjustment`. Patronage's 0.04 stays unbuilt and is not added. The no-raid rule writes battles and claims.

### Wage collector

[Money at sea](money-at-sea.md) ruling, the rule in [captivity debts](captivity-debts.md). On a world day, after the deadlines, a free character pays `min(purse, remaining, workGross)` toward the oldest open debt, into the creditor's treasury. A day that pays 0 emits nothing. No new draw.

Depends on debts, purses, and treasuries already in the tree. No unbuilt dependency.

The fixture stays. Tick 1200 moves. Measured on this tip, and the result matches the wage table in that note: `d9fdc3775fe7ebfb803247b71b52d8e99aa3044e016a00c26908c4b484b19416` (165201), `af357b111a50e0fa9368647f411a551fa2a4c122f59da1b1449dda20e91b1abb` (161424), and `068c480bbacd9de345afb329a3425334678b9a3a403650adb937ba8f00049997` (164730). World Government ends at 5009.67, 6647.14, and 12360.24. Free Tide ends at 0.00. Payments are 73, 79, and 34.

Writes `character.money`, `remainingValue`, and `faction.treasury`. The same coins as the levy, the stipend, the contract escrow, and a death's debt payment.

### Governor levy

[Income](income.md) ruling. While a governor is seated at the start of the tick, work gross and sell gross each pay 0.05, taken from the worker or the seller and credited to the faction that holds the dock. The seat is the offices rule and is not stored. No pay-first order. No reserve floor.

Depends on the offices appointment rule for who is seated. The income ruling measured the seat without storing it, so the levy can land before `governorId` is a field. Once the stipend lands, both write the treasury, and the seat has to be the same captain.

Moves the fixture and tick 1200. Taken from the doc. Tick 72 there is `bb9a546263fd799a70c91505069f6f7c86c169b6fd3752a01bca09176cc18b4e`, `d2c9552adec5b7e9efe844e6167bf01a38078b945568435aa1c0d482c3b4dc1f`, and `41587a43d026e5d6ed914426c5e31f3399f2ad8598acd2ca4a460acde993e8dd`, with 8382, 8315, and 8408 events, on the pre-skill-step fixture. Not remeasured here.

Writes purses and treasuries, and the tax step then writes `taxRate` off the new treasury. The same treasury as the stipend, the wage collector, and the contract escrow. The same `taxRate` as news slice 5.

### Aging

[Aging](aging.md) ruling. A year is 180 ticks. The run stays 1200. Death draws use a side stream. The other defaults stand. The calendar of 2190 ticks does not land. Ages are not stored at setup. The heir is not the cover.

The slices that do land are `character-aged` when the integer year increases, the read-time penalty inside `personalPower` once an age is stored, certain death at 120, and the chance from 80 to 120 on the side stream, roll stored only on the killing event. Succession is vacant. Debts pay the creditor treasury from the purse. Sailors and troops stay on the body. Ports' `ownerId` becomes null.

No unbuilt dependency. The first death in the remeasure is tick 180, 180, and 540, all after the fixture. The chance was accepted and was not remeasured. The remeasure that was run is span ages, a fixed death at 120, vacant succession, and a year of 180, on an older baseline. The fixture stayed. Tick 1200 event counts were 159664, 156271, and 159974. World Government ended at 13652.48, 14355.47, and 13799.49. Free Tide ended at 12.3, 45.66, and 150.72. Taken from the doc. Not remeasured here. The personal-power penalty was not part of that resim.

Writes `factionId`, the purse, the creditor treasury, and `ownerId`. The same `factionId` as desertion. The same purse and treasury as the wage collector. A dead governor is an empty seat, which is the offices clear.

### Offices and patronage

The roster addendum is ruled. The posts stay the command holder, the acting commander, and the port governor. A breakaway appoints nobody. The stipend is 18 from headroom, and only when the treasury covers 18 for every free mate and every seat. The seat clears when the port's faction changes, the governor leaves the faction, or the governor becomes the holder. Captivity does not clear the seat. Death and desertion clear it because `factionId` changes. Secession reads the governor. `ownerId` stays the claimant.

The questions in section 8 of the port-governor brief, including patronage, were left as a separate decision. Patronage stays unbuilt. The step is 0.04, and it is not in either re-pin. There is no `patronageAdjustment` under `src/`.

The appointment and the stipend depend on the holder and the mate cap already in the tree. The clear depends on desertion and on death if those have landed. The levy reads the same seat.

Taken from the doc, not remeasured. Storing the extra post ids moves the fixture at state tick 0 and does not change the event count. That store included a treasurer and an admiral, which the ruling rejected, so those hashes are not the governor-only store. The governor stipend keeps the event count and moves the tick-72 hash. The first event difference in that note is tick 110, 216, and 96. Tick 1200 is the governor row. Free Tide ends at 0, 0, and 0. Patronage, in the main brief, moves the fixture because the opening governors are named at state tick 0. That hash was not remeasured, and the slice is not ruled.

Writes `governorId`, the treasury (the stipend), and, if patronage is later ruled, `patronageAdjustment` on the same loyalty sum desertion and the cover sort read.

## Same state

| State | Slices that write it |
| --- | --- |
| Purse and treasury | Wage collector, levy, governor stipend, contracts slice 4, aging's debt payment |
| `taxRate` | News slice 5 (24-tick cap), and the tax step after the levy changes the treasury |
| `factionId` | Desertion, aging's death |
| `morale` | The −0.5 pay term. Decisions already read it |
| Loyalty sum | The scar already in the tree. Alliance `breakAdjustment` of 0.04 is batch 3. Patronage's 0.04 stays unbuilt |
| Governor seat | Offices appointment, the levy's read, the secession declarer, desertion and death as the clear |
| Ledger | News slices 2 and 3 store it. Slices 4, 5, and 6 read it |
| Contract | Contracts slice 4. Negotiation slice 5 would write the same offer and does not land beside it |
| Battles and claims | Alliances' no-raid rule, batch 3. News slice 4 moves travel targets, which moves who fights |

## Order

Three batches. Batch 1 is with the Engineer. Batch 2 is the golden re-pin measured below, applied on top of batch 1. Batch 3 is the hash-moving alliance slices. That pin was not measured.

The hash-neutral slices are not a batch. Negotiation slices 2, 4, and 7, and alliance slice 2, fit in the commit that first emits the type. A headless run emits none of them. Negotiation's accepted defaults add no hash-moving slice.

### Batch 1 — with the Engineer

The wage collector, the −0.5 pay term, and the desertion roll, in one commit, on today's baseline. No unbuilt dependency. The 72-tick fixture stays, so the golden file is not regenerated. Tick 1200 is the batch 1 row in the measurement section. Free Tide ends at 0.00 on every seed. This batch is with the Engineer.

### Batch 2 — one golden re-pin

After batch 1. One commit, one `golden:update`, one new 1200-tick record. The pin is the stack in the measurement section. Inside the commit, this order:

1. Offices appointment, the 18 stipend from headroom, breakaway appoints nobody, and the governor is the secession declarer. No treasurer, no admiral. Patronage stays unbuilt at 0.04. Captivity does not clear the seat.
2. The 0.05 levy, reading that seat.
3. News slices 2 and 3, then slice 4, then slice 5 at the 24-tick cap, then slice 6. The declarer is the governor from step 1. The stability and the followers he reads are the ledger, under the cap. A port the holder is standing in stays live for the tax step. That live exception stays off the secession read.
4. Contracts slice 4, the 56.25 offer.
5. Aging: the 180-tick year, `character-aged`, the personal-power penalty once an age is stored, certain death at 120, the side-stream chance from 80 to 120, vacant succession.

Desertion and death are already the seat-clear by the time the stipend is in this commit. The levy, the stipend, the wage collector, and the contract writer share the treasury, so they are not given separate re-pins. The fixture moves. Aging by itself does not move tick 72.

### Batch 3 — alliances

After batch 2. Alliance slices 3, 4, 5, and 7: the autonomous accept, the no-raid rule, the sighting copy, and the break cost. Nothing is forced at tick 0. Slice 6, a second attacker, stays out. The break cost is `breakAdjustment` of 0.04. Patronage's 0.04 is not added.

These wait on the governor seat, and on who secedes after the news ledger and the deaths. Batch 2 is already the large re-pin. Stacking the four alliance slices on it is not a small harness, so this run did not measure them. Fleet slices 3–7 stay parked. The levy does not start them.

## Measurement

The harness edited `src/sim/engine.ts` and `src/sim/state.ts`, ran, and was restored. Flags defaulted off. A world day is `tick % 6 === 0`.

The wage collector runs after `processCaptivityDeadlines`. A character who is not captive pays the oldest open debt, `incurredTick` then id, and only when the tick is after `incurredTick` and the creditor faction exists. The pay is `round(min(purse, remaining, workGross), 2)`. Zero emits nothing. `debt-repaid` stores the new purse, the new remainder, and the creditor treasury. A remainder of 0 drops the row. No draw.

The −0.5 term is on `character-upkeep`, after the hunger and travel terms already in the code. A member whose live `memberAllowanceCap` is under 18 loses 0.5, clamped to 0–100. The holder is not a member.

Desertion is read at the start of the morning, before production. A member whose cap is under 18 adds one to a short streak. Any other morning resets it. On the morning the streak becomes 12, if `personality.loyalty + (loyaltyAdjustment ?? 0)` is under 0.75, one `next()` is drawn from a `DeterministicRng` forked from `world.rngState` at the start of tick 0. The fork is not written back. A roll under 0.5 sets `factionId` null. The stored roll is `round(roll, 3)`. Place, travel, and troops stay.

Every row below kept the fixture. Tick 72 hashes and event counts are the baseline table. Free Tide ended at 0.00 on every row. The doc hashes for the morale term and for desertion are an older baseline and are not these.

| Run | Seed | Tick 1200 | Events | World Government |
| --- | ---: | --- | ---: | ---: |
| Wages | 1847 | `d9fdc3775fe7ebfb803247b71b52d8e99aa3044e016a00c26908c4b484b19416` | 165201 | 5009.67 |
| Wages | 2718 | `af357b111a50e0fa9368647f411a551fa2a4c122f59da1b1449dda20e91b1abb` | 161424 | 6647.14 |
| Wages | 4096 | `068c480bbacd9de345afb329a3425334678b9a3a403650adb937ba8f00049997` | 164730 | 12360.24 |
| Morale term | 1847 | `ff10e06cfdda7fe075015d7fd2aa4056fec78e52804c2dcd645c13016f8483c9` | 161455 | 6385.13 |
| Morale term | 2718 | `8367b953d7e26a575eb15242d862ea7b9bf6119063f3ad7a6ade6dade1336c46` | 163866 | 4680.72 |
| Morale term | 4096 | `0b51acf49de0e939067a77125e0d9c528fa20dd5ba07a50508938aab1d06c1fb` | 163772 | 8694.47 |
| Desertion | 1847 | `1275f053fc1e289442573c1da2039fffcaa72d9b7072f2c4f4b1691218c7daf1` | 166264 | 4892.97 |
| Desertion | 2718 | `421ae77c454caef2c66739caf11fadc2cd64dc8ec2c8b5f40a5c25bce9ec9519` | 166947 | 5664.19 |
| Desertion | 4096 | `80b55522ebbcfd4b6fcf7bf51c972055f7493c4995e6a811d016c2bb8177d021` | 168890 | 7933.37 |
| Wages + morale | 1847 | `92656733a6993db42a85eb02ed45c08575f92ff582292240e28a45d576e76c2e` | 162013 | 5437.93 |
| Wages + morale | 2718 | `145b0c802d90807ec4c72abde7686ee738a1f2bffebe43e4226bd215900ae9af` | 164480 | 5363.17 |
| Wages + morale | 4096 | `5125d4fca74a3e1237196472b5459d20431571fa131c4d76b028f71bf279b0a6` | 163587 | 8593.33 |
| Morale + desertion | 1847 | `29d4d4cb680af946b542a11239b505caa5b99bb0deb1c22f337057bacd6c46c1` | 163532 | 3759.53 |
| Morale + desertion | 2718 | `ddae73677423f61ab0483c9f36a551498ea9ff649e4da7abddef842f989a17f0` | 165157 | 3874.30 |
| Morale + desertion | 4096 | `3a76c8d54f66bf9ae672e30e6dfbb7fee33dc5bdaeb3316f7cb8125ae8ae833b` | 167462 | 13086.73 |
| Batch 1 | 1847 | `7314d632250b133a87b114668d8d972d65733734a17503fa02496747dc496fb7` | 163059 | 3756.08 |
| Batch 1 | 2718 | `b7015fced2f2b04e86e0877142aad82ae4f0b4ea5c54e66e2651edea33581d3e` | 165135 | 3897.32 |
| Batch 1 | 4096 | `7f0f865b7686a6e479e45b65406b1adc3b49326e0dd354f199b62bcd60bac214` | 168755 | 11953.82 |

Batch 1 is the three together. That row is the re-pin, and it is with the Engineer. The batch 2 pin is the stack below.

Desertion alone leaves Esme Dusk at tick 546 (0.245) and Bram Tern at tick 930 (0.034) on 1847, Finn Frost at tick 282 (0.244) and Bram Tern at tick 882 (0.085) on 2718, and Mina Vale (0.160) and Esme Dusk (0.238) at tick 312 on 4096.

Batch 1 leaves Finn Frost (0.245) and Bram Tern (0.034) at tick 174 and Esme Dusk (0.407) at tick 390 on 1847. Finn Frost (0.244) at tick 282 on 2718. On 4096: Zara Gale (0.160) and Dax Pike (0.238) at tick 312, Bram Tern (0.449) at tick 438, Mina Vale (0.483) at tick 456, and Finn Frost (0.245) and Esme Dusk (0.179) at tick 672.

`debt-repaid` on the batch 1 row is 121, 19, and 54. Open debts at tick 1200 are 6, 3, and 1. The wage-only open counts, 5, 4, and 3, are the money-at-sea row and were matched by this harness.

### Batch 2 stack

The same harness, with batch 1 still on, then offices, the levy, news slices 2–6, contracts at 56.25, and aging. Flags defaulted off. The run was local and was restored. Node v24.21.0, ICU 78.3. Seeds 1847, 2718, and 4096. A second run of the stack reproduced the hashes below.

Appointment runs at the start of the tick, after aging and the morning desertion check. The cover sort names one anchored member who is not the holder, and only while `spendRole` is `"holder"`. A breakaway appoints nobody. `governorId` is omitted while the seat is empty. Captivity does not clear it. The stipend is silent: `seats × 18` from the treasury into the governors' purses, and only when the treasury covers 18 for every free mate and every seat. A morning that cannot pay emits nothing.

The levy is `round(gross × 0.05, 2)` inside the work tax and the sale tax. It applies when the dock was seated at the start of the tick and the dock still has a faction. The credit follows that faction.

News posts the public item on the port: id, type, `observedTick`, `factionId`, and `taxRate` on a tax item only. Stability and the scarred-follower list sit beside the item. A holder ashore reads the ledger of the port he stands in. A holder at sea reads the bag copied on departure. The tax step keeps the live stability of a port the holder is standing in. An away port counts only while the tax tick minus `observedTick` is at most 24. Secession does not use that live exception. The governor declares when he is anchored, autonomous, and not the holder, the rate is above 0.15, and the beside figure for that port is at or under 55 thousandths. No governor means nobody declares. The event's stability field is the live port stability, so the reducer does not overwrite the port with the news figure. The payload `ownerId` is the governor, so the reducer founds the faction with that captain. Followers are the item's scarred list, still anchored, and not the governor, the holder, or the acting commander.

The contract offer is the contracts ruling: one autonomous captain of the faction that holds an empty shelf, 10 provisions at 56.25, the lowest id who can pay, the carrier the lowest id who passes `carrierBlocked`, deadline `max(travelTicks + 1, 2)` and never past 720. A new offer waits until the next tick.

Aging uses span ages from `DeterministicRng(seed).integer(18, 119)`, in id order `character-01` through `character-30`, not from `world.rngState`. Ages are omitted until the integer year increases. A year is 180 ticks. Once an age is stored, `personalPower` loses 1 over 60 and 3 over 80. Death draws use a second `DeterministicRng` forked from `world.rngState` at setup and not written back. At 80 or under, the chance is 0. At 120 the death is certain and draws nothing. Between those, the birthday kills when the roll is under `((age − 80) / 40) × (1 − strength)`. Succession is vacant. Debts pay the creditor treasury from the purse, in id order. Sailors, troops, and the remainder stay. Ports' `ownerId` becomes null. A holder death clears the acting commander. An acting-commander death writes the next cover or clears the seat.

The 72-tick fixture moves on every seed. The first death is tick 180, so aging is not what moves tick 72.

| Seed | Tick 72 state hash | Events | Tick 1200 state hash | Events | WG | WG rate | FT | FT rate | Secessions | Deaths |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1847 | `f277b5586d18f3a81814f8827eec26e027f7289d541cc58e259690c3d007a682` | 8497 | `924694eb7631d6a8496c6f4df6721793c71f26030179d6310145761a0b88498a` | 112112 | 12021.06 | 0.10 | 1988.92 | 0.14 | 0 | 13 |
| 2718 | `10acbabbd427a909fb86828aadde45ea79b3a51cc31d0cb9177ec4f8af80db02` | 8548 | `3f682e91b7c9f41b18c3192d740f1bbf7a9f61eee88c17c97947e462f85f8a4f` | 149519 | 10474.79 | 0.08 | 0.00 | 0.23 | 5 | 5 |
| 4096 | `a8e6794dcddb18dbe67cef4c6038e4016096c073d978160ddcc3c851abbc4c7f` | 8467 | `52c2de69c97c9cbb73deec708a5fbb9b7ab16208647f39e2ac519b7450b699c2` | 138648 | 12758.79 | 0.08 | 0.00 | 0.30 | 2 | 8 |

`news-posted` on that row is 441, 604, and 535. Contract events are 2, 31, and 778.

Deaths, with age. The same list appears when news is removed and when aging sits on batch 1 alone. Offices, the levy, the ledger, and the contract writer do not change who dies.

1847, tick 180: Bram Quill 110, Sable Morrow 108, Iris Stone 95, Lio Crow 115, Dax Pike 91, Vale Gale 97. Tick 360: Finn Frost 114, Niko Crow 96, Sable Sorn 92, Toma Hale 107. Tick 540: Jun Marrow 105. Tick 720: Pax Ash 105, Orin Frost 92.

2718, tick 180: Rook Tern 108, Lio Crow 120, Mara Calder 114. Tick 720: Esme Dusk 120. Tick 900: Orin Rill 101.

4096, tick 180: Toma Reef 111, Sable Sorn 113, Kessa Dusk 118. Tick 540: Rook Tern 104, Mina Vale 99, Esme Dusk 98, Iris Vale 97. Tick 1080: Orin Rill 87.

Lio Crow at 120 on 2718, and Esme Dusk at 120 on 2718, are the certain deaths. The rest are the side-stream chance. The older fixed-only remeasure, deaths 1, 2, and 1, is not this pin.

Secessions on the stack. 1847: none. 2718: Dax Pike at cinder-key, tick 529; Bram Tern at glassport, tick 554; Esme Dusk at cinder-key, tick 591; Corin Hale at cinder-key, tick 715; Zara Gale at glassport, tick 958. 4096: Finn Frost at glassport, tick 698; Corin Hale at cinder-key, tick 965.

Desertions move against the batch 1 row. 1847: Finn Frost 0.245 and Bram Tern 0.034 at tick 264, and Corin Hale 0.407 at tick 450. The 0.407 roll was Esme Dusk at tick 390 on batch 1. 2718: Finn Frost 0.244 at tick 342, where batch 1 had him at tick 282, and Mina Vale 0.085 at tick 1026. 4096: Mina Vale 0.160 and Dax Pike 0.238 at tick 174, where batch 1 had Zara Gale 0.160 and Dax Pike 0.238 at tick 312, and Bram Tern 0.449 at tick 312, where batch 1 had him at tick 438.

The comparisons below used the same harness with one group turned off. They are not a second pin. Tick 72 with aging off matches the stack hashes and the counts 8497, 8548, and 8467. Tick 72 with aging on batch 1 alone stays on the fixture. Tick 72 with news off does not match the stack. Those three hashes were not copied out.

| Run | Seed | Events | WG | WG rate | FT | FT rate | Secessions | Deaths |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| News off | 1847 | 118110 | 13251.98 | 0.13 | 410.72 | 0.11 | 0 | 13 |
| News off | 2718 | 146611 | 16620.20 | 0.11 | 419.45 | 0.18 | 0 | 5 |
| News off | 4096 | 136598 | 17799.36 | 0.12 | 60.6 | 0.18 | 0 | 8 |
| Aging off | 1847 | 164933 | 15818.88 | 0.08 | 0.00 | 0.30 | 2 | 0 |
| Aging off | 2718 | 164314 | 11480.65 | 0.09 | 0.00 | 0.22 | 3 | 0 |
| Aging off | 4096 | 165367 | 15554.31 | 0.12 | 0.00 | 0.22 | 1 | 0 |
| Aging on batch 1 | 1847 | 113194 | 11104.18 | 0.08 | 4.39 | 0.23 | 5 | 13 |
| Aging on batch 1 | 2718 | 146635 | 11153.57 | 0.13 | 0.00 | 0.15 | 4 | 5 |
| Aging on batch 1 | 4096 | 138308 | 12804.94 | 0.14 | 0.00 | 0.18 | 4 | 8 |

Aging on batch 1 alone keeps the fixture. Its tick-1200 hashes are `5db84281c7a13bb11c9edfc687e111ecce84a6b7922877dd87fa81b11b861590`, `50c29d5209f00e665aae4e01a0d34922c270a993da37ba3273025c8f41e9c578`, and `23bf6a892f7a57567cbed8799015d08b97a4f41cd75a1c655c6f0960d5cd3bb3`. The news-off and aging-off tick-1200 hashes were not copied out.

Contract events are 350, 660, and 812 with news off, and 839, 344, and 785 with aging off. News events with aging off are 608, 581, and 496. With news off the count is 0.

Free Tide ends at 1988.92 only on 1847 in the stack, the seed where Pax Ash dies at tick 720. Aging on batch 1 alone leaves 4.39 on that seed and 0.00 on the other two. The levy is what the vacant seat then stops spending. On 2718 and 4096 Pax lives, and Free Tide still ends at 0.00 in the stack. The same deaths with the ledger removed leave Free Tide at 410.72, 419.45, and 60.6, so the ledger also decides whether that treasury is spent down.

Secessions are 0, 5, and 2 on the stack, and 5, 4, and 4 when aging sits on batch 1 alone. With the ledger removed the governor declares nobody on any seed. With aging off, 1847 still declares: Zara Gale at crown-harbor, tick 728, and Esme Dusk at glassport, tick 783. Those two do not happen once the deaths are in. 2718 goes from 3 declarations without aging to 5 with the deaths. The three without aging are Corin Hale at crown-harbor, tick 1047; Dax Pike at cinder-key, tick 1181; and Zara Gale at glassport, tick 1199. 4096 goes from 1 to 2. The one without aging is Corin Hale at glassport, tick 1084. Deaths do not only suppress declarations.

Free Tide's ending rate on 4096 is 0.30 only in the full stack. Aging on batch 1 alone ends that rate at 0.18. News removed ends it at 0.18. The cap and the deaths together are what reach 0.30.

Seed 1847's contract events fall to 2 in the stack. Aging off leaves 839. News off leaves 350. Seed 4096 still has 778.

Batch 3 was not measured.

## Questions

Settled with this note.

1. **Where do the neutral reducers sit?** In the commit that first emits the type. Negotiation slices 2, 4, and 7, and the alliance propose and break commands. A headless run emits none of them. They are not a re-pin.

2. **Does patronage join a batch?** It stays unbuilt. The step is 0.04. It is not in batch 2 or batch 3. There is no `patronageAdjustment` under `src/`.

3. **Do negotiation and alliances join the order?** Yes, on the accepted defaults. [Negotiation](negotiation.md) is PR #100. [Alliances](alliances.md) is PR #92. Nothing is forced at tick 0. Negotiation adds no hash-moving slice. The hash-moving alliance slices are batch 3.

4. **Does batch 1 fold into batch 2?** No. Batch 1 is with the Engineer. Its tick-1200 pin is the batch 1 row, and the golden file stays. Batch 2 was measured on top of it, and that pin is the stack.

5. **Does the aging chance from 80 to 120 land with the fixed death?** Yes. Both are in the batch 2 pin. The older fixed-only remeasure, deaths 1, 2, and 1, is a different run.

6. **Who declares, and what does he read?** The governor declares. The stability and the followers he reads are the news ledger under the 24-tick cap. A port the holder is standing in stays live for the tax step. That live exception stays off the secession read. No governor means nobody declares.

7. **Do fleet slices 3–7 start once the levy is in?** They stay parked. The fleet ruling still says they wait until income can carry them. The levy does not by itself carry a hull price, a crew bill, a repair, or the per-ship wage.
