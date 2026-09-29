# Loyalty drift

**Status: Open.** Proposal for the owner to accept, change, or reject. The measurements below were taken on `main` at `e4cce7e7f0ddda9114412ee804ed13c5fc119994` (PR #37 merged), where `npm test` passed 191 tests. The drift was applied in a local harness after each `runTick` and was not left in the tree. This note is not decided until it moves into [world simulation](world-simulation.md). At that SHA, M25 (one open order per issuer and recipient), M26 (the paid haul), M27 (a day closes an unsigned report), M28 (a landless raid at garrison 8), M29 (an outscoring attacker wins a major that ends on the morale test), and M30 (the command seat and its regency) were accepted and not built. M28 regenerates 2718. Every table in this note is that pre-M27 run. It does not issue, amend, confirm, or retarget an order, and it does not change a battle, a tax, or the raid gate.

This branch was then merged with `origin/main` at `932021931bffe4dd4acc0e5b86617e9dae94cce5` (PR #39). That merge includes PR #38 (`9470cb8f3ad08f4992c6c6536066502ce635f2ee`, owner questions 38–42) and builds M27. `npm test` on the merged tree passes, 198 tests, Node v24.21.0, ICU 78.3. The committed 72-tick fixture is no longer the table below. It is `8e081fb09f0a73c29a8ca37581552f31ad8906fe4805dcf855e97f954a` / 8301, `64e843281dcb0733918fa72393a71f25ed36bdc40ae4d56e320c7461fca91538` / 8516, and `b85a681050e4e21c96ea69dab9677565253641dae0bc26ca1b230996076e81d6` / 8031. The drift rules were not re-run on that tree, so the hash-neutrality claim is the pre-M27 one.

Runs are `createPrototypeWorld` plus `runTick`, no player commands, seeds 1847 / 2718 / 4096, 1200 ticks, Node v24.21.0, ICU 78.3. A figure at tick 0 is the world before any `runTick`. A figure at tick 400 or 1200 is the world after that many calls (`world.tick === 400` or `1200`). Tick numbers on events are the `tick` field. The state hash is taken after the tick has advanced, so a write on an event stamped 118 is first visible in the hash at `world.tick === 119`. On the measurement tree the 72-tick hashes matched `tests/fixtures/golden-hashes.json`:

| Seed | State hash | Events |
| ---: | --- | ---: |
| 1847 | `d7eb02eb0e6b835ee923147b855d0a91969a416115d0c3bd5c2650ff0e2b6a3f` | 8275 |
| 2718 | `d0b4b449ce9bc3fc27f0cfa15a5cc8ef04d5a2e6a9cdded2c2b11b6c4ca6583d` | 8489 |
| 4096 | `d5d9da8bb1e9c9bd86c93ccbaa570f04ea9052ea1b5d4b48f3452e2db6f0c0c7` | 8003 |

Unmodified event counts at 1200 ticks are 162302, 166064, and 162558. Those match the counts in [political layer](political-layer.md).

## The problem

[Political layer](political-layer.md) found that `personality.loyalty` is seeded and never written again. Relationships and trust do move. The same note names the issuer as commander and, while that commander is captive, an acting commander: the free faction mate with the highest `leadership + loyalty * 50`, lower id on a tie. That sort is the one later reader this slice allows. Every other loyalty read stays on the seeded number.

Secession stays out of scope, as it did there. The last section says what a moving loyalty would hand it.

## What reads loyalty today

`personality.loyalty` is written in `personalityFor` (`src/sim/scenario.ts`). An officer draws 0.75–0.98. Everyone else draws 0.30–0.85. Nothing writes it after that. The reads are:

| Site | What it does with loyalty | If loyalty moved later |
| --- | --- | --- |
| `goalsFor` (`scenario.ts`) | Stores `0.38 + loyalty * 0.42` on the serve-faction goal's `priority`, once | No. The stored priority is not rewritten |
| `relationshipTo` (`scenario.ts`) | Adds `loyalty * 0.18` to the opening trust toward the issuer, once | No |
| `createPrototypeWorld` (`scenario.ts`) | Picks `reportingOfficerId` by `leadership + loyalty * 50`, once, lower id on a tie | No. `assignReportingOfficer` does not re-sort by loyalty. The eligible list in `view-model.ts` sorts by leadership alone |
| `assessStandingOrder` (`agency.ts`) | Protect alignment is loyalty. The loyalty factor is `loyalty * 0.24`. Pending orders accept or refuse from the score. An order already `active` is complied with regardless of the score | A pending order could accept or refuse differently. The twenty opening orders are judged on tick 0, and none stay pending. An active order's obedience number, stored on a later `plan-reconsidered`, would change. The order would not flip to refused |
| `scoreGoal` (`agency.ts`), serve-faction | Adds `loyalty * 0.46` to the goal score on every plan review, then `rng.between(-0.035, 0.035)` | Yes. A different goal can win, and the plan follows |
| `buildCandidates` (`engine.ts`), the `work` action | Adds `loyalty * 8` to the work score | Yes. A close choice can flip. The refusal sentence in `recordOrderAssessment` contains the word loyalty and does not read the number |
| `projectCharacter` (`visibility.ts`) | Copies `personality` onto the player's own row. A mate's personality is null | The simulation does not branch on it. The player would see their own number if it moved. They would not see a mate's |
| M30 acting-commander sort, specified, not built | `leadership + loyalty * 50`, excluding the holder and anyone captive, lower id on a tie | Yes, for the name on the seat. The political-layer slice does not let that name issue, confirm, or fight |

`assessOrderAction`, which decides deviation and resumption, does not read loyalty. `recordBattleConsequences` and `evolveLocalRelationship` do not read it. `character.factionId` is set in `makeCharacter` and has no later writer.

Hash-neutral, in the sense this slice uses, means those three live reads stay on the seeded value: the obedience factors, the serve-faction situational score, and the work score. The M30 sort is the exception. The reporting-officer sort does not need a freeze, because it does not run again. Putting a new number in the hashed world still changes `stateHash` on the tick it appears, because `stateHash` is the sha256 of the canonical world. The fixture stays only if that tick is after tick 72.

## What "pay" can mean now

There is no wage from the treasury. `taxRate` is 0.14 and 0.08, set in `createPrototypeWorld`, and no command writes it. `workGross` pays the character: `10 + leadership * 0.08 + trade * 0.07`, then `tradeTax` takes `gross * taxRate` for the faction that holds the settlement. A neutral port pays no tax. While a faction holds no port, work on someone else's island pays the holder. Over 1200 ticks the `worked` events are 7888, 8255, and 8300. Of those, faction members worked a home port 2560, 2650, and 2758 times, and another port 2853, 2741, and 3175 times. The rest are unaffiliated, and they have no faction loyalty to move.

A day is 6 ticks. A day with no `worked` is the only "no pay" the world can express. Mara Vane never works. She is the idle human. A rule that treats a quiet day as unpaid hits her on all 200 days.

## Bounds

Every write is `round(clamp(value, 0.05, 0.98), 3)`, the same `round` the sim uses. 0.98 is the top of the officer draw. 0.05 is under the line below, so a later rule can record a crossing without pinning at 0. Unaffiliated characters are not written. The decay variant is the only one that pulls back: on the last tick of each day it moves 0.001 toward the seeded value. The others do not decay.

The line for a crossing is 0.25. Officers are drawn from 0.75 and everyone else from 0.30, so nobody starts under 0.30. The lowest seed in these runs is Niko Wren at 0.307 on 2718. Half of the trait is the wrong line: 7, 8, and 7 characters already start under 0.50. Acceptance sits near 0.54–0.62 and is not a loyalty cutoff. A character under 0.25 has left every number the setup can draw.

Quartiles are linear, index `(n − 1) * p`, then rounded to 3 decimals. For 13 and for 9 that index lands on a person. For the 8 unaffiliated it falls between two.

## Baseline

Loyalty is the same number at tick 0, tick 400, and tick 1200, for all 30 characters, on every seed. Unaffiliated loyalty never moves under any variant below, and it is this row throughout:

| Seed | Unaffiliated (min / q1 / q2 / q3 / max) | Below 0.5 |
| ---: | --- | ---: |
| 1847 | 0.334 / 0.425 / 0.632 / 0.784 / 0.960 | 3 of 8 |
| 2718 | 0.356 / 0.626 / 0.747 / 0.778 / 0.801 | 2 of 8 |
| 4096 | 0.402 / 0.578 / 0.619 / 0.640 / 0.805 | 1 of 8 |

| Seed | World Government | Free Tide |
| ---: | --- | --- |
| 1847 | 0.348 / 0.577 / 0.666 / 0.808 / 0.967, below 0.5: 2 of 13 | 0.322 / 0.554 / 0.708 / 0.786 / 0.971, below 0.5: 2 of 9 |
| 2718 | 0.307 / 0.491 / 0.553 / 0.802 / 0.875, below 0.5: 4 of 13 | 0.383 / 0.533 / 0.824 / 0.831 / 0.978, below 0.5: 2 of 9 |
| 4096 | 0.431 / 0.542 / 0.658 / 0.752 / 0.979, below 0.5: 2 of 13 | 0.311 / 0.384 / 0.623 / 0.745 / 0.825, below 0.5: 4 of 9 |

Nobody is under 0.25. Mara's loyalty is 0.808, 0.875, and 0.792. Pax's is 0.708, 0.533, and 0.745.

## Candidate rules

Each rule was applied on its own, on a shadow copy, while the world ran unmodified. Two combined rules follow.

**Pay per shift.** On `worked`, a faction member at a port their faction holds gains 0.001. A faction member at any other port loses 0.001.

**Pay per day.** On the last tick of a day, a free faction member who worked a home port gains 0.001. One who did not work at all loses 0.001. Work only on another port is 0. Captives are skipped. Mara is not skipped.

**Orders.** Deviation −0.006, resumption +0.006, completion report +0.012. A pair cancels. The opening refusal is not a write: that judgment already read the seeded loyalty.

**Orders, including the refusal.** The same, plus −0.02 on `standing-order-refused`.

**Unpaid ransom.** On `captivity-released`, if `terms.debtValue > 0`, that character loses 0.04. A release the purse covers is 0. This is the release-day shortfall already on the event. It is not the daily installment in [captivity debts](captivity-debts.md), which is accepted and not built, and which adds no mark when a later day is missed.

**Landless.** When a faction's port count hits 0, every member loses 0.02. When a port comes back, every member gains 0.01. While the day started with no port, every member, captive included, loses 0.002. World Government is never landless in these runs. Free Tide's stretches, from the claim that takes the last port to the claim that returns one:

| Seed | Stretches |
| ---: | --- |
| 1847 | 77–231, 561–609, 764–934, 1126 onward |
| 2718 | 35–48, 311–383, 555–782, 1088–1147 |
| 4096 | 51–54, 77–324, 478–499, 932 onward |

M28 will move these. The daily total depends on the length. That is one reason the daily term is not the recommendation.

**Battle.** An active order: victory +0.008, defeat −0.012. The commander, who holds no order: victory +0.01, defeat −0.015. A refused or finished order is not "under orders." A battle that is neither is 0. M29 will turn some of today's defeats into victories, so these counts are today's tree.

**Trust.** On `relationship-changed` whose target is the commander, move loyalty toward that tie's trust by 5% of the gap, capped at ±0.004.

**Combined.** Orders, without the refusal, plus the unpaid ransom, plus the landless one-shot without the daily drain, plus battle.

**Combined, with decay.** The same, plus the 0.001 daily pull toward the seed.

## What each variant does

Crossings of 0.25 are counted on the way down. "Stayed" means still under the line at tick 1200. Distributions are World Government then Free Tide. Tick 0 is the baseline table.

### Pay per shift

| Seed | Tick 400 | Tick 1200 | Under 0.25 |
| ---: | --- | --- | ---: |
| 1847 | 0.325 / 0.591 / 0.667 / 0.824 / 0.953, half 2; 0.315 / 0.559 / 0.693 / 0.794 / 0.963, half 2 | 0.287 / 0.591 / 0.787 / 0.869 / 0.980, half 2; 0.253 / 0.435 / 0.576 / 0.608 / 0.793, half 4 | 0 |
| 2718 | 0.279 / 0.454 / 0.567 / 0.792 / 0.875, half 4; 0.383 / 0.464 / 0.766 / 0.854 / 0.924, half 3 | 0.223 / 0.539 / 0.653 / 0.795 / 0.875, half 3; 0.341 / 0.383 / 0.721 / 0.838 / 0.867, half 3 | Niko Wren at tick 665, stayed, end 0.223 |
| 4096 | 0.489 / 0.609 / 0.729 / 0.785 / 0.980, half 1; 0.132 / 0.384 / 0.499 / 0.610 / 0.678, half 5 | 0.439 / 0.567 / 0.752 / 0.837 / 0.980, half 1; 0.050 / 0.376 / 0.433 / 0.490 / 0.594, half 8 | Mina Vale at 177, end 0.050; Finn Frost at 1115, end 0.233. Both stayed |

Writes: 5009, 5353, 5543. The median faction member is rewritten a few hundred times. Clamp hits: 404, 38, 390. Mina Vale on 4096 ends on the floor, from away-port work. The biggest movers are Ada Sorn +0.283 on 1847 (home +0.336, away −0.053), Ada Sorn +0.236 on 2718, and Pax Ash −0.312 on 4096. The cause is where they stood while working, retallied every shift. That is churn. It also renames a regency: on 4096 the open cover from tick 1121 becomes Bram Tern instead of Corin Hale, by 0.224 of score.

### Pay per day

| Seed | Tick 400 | Tick 1200 | Under 0.25 |
| ---: | --- | --- | ---: |
| 1847 | 0.287 / 0.526 / 0.604 / 0.742 / 0.958, half 2; 0.271 / 0.532 / 0.681 / 0.773 / 0.954, half 2 | 0.165 / 0.420 / 0.546 / 0.630 / 0.875, half 6; 0.174 / 0.464 / 0.605 / 0.673 / 0.874, half 3 | Finn Frost at 539, end 0.174; Vale Drake at 671, end 0.165; Bram Tern at 1145, end 0.240. All stayed |
| 2718 | 0.250 / 0.467 / 0.502 / 0.772 / 0.821, half 6; 0.317 / 0.497 / 0.761 / 0.817 / 0.962, half 3 | 0.161 / 0.356 / 0.411 / 0.662 / 0.774, half 8; 0.183 / 0.403 / 0.641 / 0.701 / 0.852, half 3 | Niko Wren at 401, end 0.161; Bram Quill at 755, end 0.175; Bram Tern at 803, end 0.183. All stayed |
| 4096 | 0.414 / 0.516 / 0.621 / 0.710 / 0.972, half 3; 0.285 / 0.330 / 0.601 / 0.711 / 0.788, half 4 | 0.321 / 0.440 / 0.534 / 0.597 / 0.914, half 6; 0.184 / 0.224 / 0.542 / 0.649 / 0.738, half 4 | Mina Vale at 623, end 0.200; Zara Gale at 809, end 0.184; Finn Frost at 977, end 0.224. All stayed |

Writes: 3788, 3886, 3730. Mara loses 0.200 on every seed, 200 quiet days, and she is the loyalty the player can already see. The same −0.200 hits Bram Quill and Bram Tern on 2718. The cause is "did not work today," which describes the idle commander and anyone at sea. On 4096 the cover from tick 422 becomes Finn Frost instead of Bram Tern. The seeded gap there is 1.096, which is 0.022 of loyalty. Finn's score at the appointment is 84.500 against Bram's seeded 87.974, and Finn leads by 0.050.

### Orders

| Seed | Tick 400 and tick 1200 | Under 0.25 |
| ---: | --- | ---: |
| 1847 | 0.348 / 0.577 / 0.678 / 0.808 / 0.979, half 2; 0.322 / 0.566 / 0.708 / 0.798 / 0.980, half 2 | 0 |
| 2718 | 0.307 / 0.491 / 0.565 / 0.814 / 0.875, half 4; 0.383 / 0.533 / 0.836 / 0.843 / 0.980, half 2 | 0 |
| 4096 | tick 400 is 0.431 / 0.554 / 0.670 / 0.764 / 0.980, half 2; 0.311 / 0.396 / 0.623 / 0.745 / 0.837, half 3. Tick 1200's Free Tide median is 0.617, still half 3 | 0 |

The lasting move is +0.012 on a completion report. Deviation and resumption cancel, so the distribution barely leaves the baseline. They do not cancel in the log: Esme Dusk is rewritten hundreds of times (396, 21, and 447 steps on the three seeds for the busiest character) and ends where the completion left her. One completion on 1847 reaches the 0.98 ceiling (Mara Calder, seeded 0.971). No regency changes. The rule is legible at the completion and noisy at the deviation. It writes on tick 0, so the fixture moves. See the hash section.

### Orders, including the refusal

The completion row above, and the six, six, and four refusers each lose 0.02 at tick 0. Nobody crosses 0.25. The lowest refusal on 4096 is Mina Vale, 0.311 to 0.291. No regency changes. The tick-0 write is inside the fixture.

### Unpaid ransom

| Seed | Tick 400 | Tick 1200 | Under 0.25 |
| ---: | --- | --- | ---: |
| 1847 | 0.348 / 0.539 / 0.666 / 0.808 / 0.967, half 2; 0.322 / 0.554 / 0.708 / 0.765 / 0.971, half 2 | 0.348 / 0.539 / 0.666 / 0.808 / 0.957, half 2; 0.322 / 0.554 / 0.628 / 0.765 / 0.971, half 2 | 0 |
| 2718 | unchanged World Government; Free Tide max 0.938 | same as tick 400 | 0 |
| 4096 | unchanged World Government; 0.311 / 0.384 / 0.583 / 0.705 / 0.825, half 4 | unchanged World Government; 0.271 / 0.384 / 0.543 / 0.665 / 0.796, half 4 | 0 |

Writes: 8, 2, and 6. Median writes among faction members: 0. Maximum: 2. Clamp hits: 0. No decay, so a drop stays, and there is nothing to oscillate. The drops:

| Seed | Who | Releases | End |
| ---: | --- | --- | ---: |
| 1847 | Pax Ash | 635, 921 | 0.628, from 0.708 |
| 1847 | Esme Dusk | 634, 802 | 0.577, from 0.657 |
| 1847 | Sable Morrow, Dax Pike, Niko Wren, Iris Stone | 118, 275, 1107, 1140 | each −0.04 |
| 2718 | Corin Hale, Finn Frost | 202, 840 | 0.938 and 0.619 |
| 4096 | Pax Ash | 394, 506 | 0.665, from 0.745 |
| 4096 | Esme Dusk | 382, 481 | 0.543, from 0.623 |
| 4096 | Corin Hale, Mina Vale | 487, 1004 | 0.785 and 0.271 |

Paid releases write nothing: Finn Frost twice on 1847 (410, 838), Zara Gale on 2718 (480), and Sable, Dax, and Esme's first release on 4096 (96, 102, 123). Pax's capture at 1116 and Mina's at 1178 and Finn's at 1147 are still open at tick 1200, so they have no release write yet. The nearest miss on the line is Mina Vale, 0.311 to 0.271. She would need a second unpaid release.

No regency changes. Corin's score on the open 4096 cover falls from 97.227 to 95.250, and the gap over Bram Tern falls from 9.253 to 7.276. The sensitive appointment is the earlier one: Bram 87.974, Finn Frost 86.878, gap 1.096. Neither of them has an unpaid release before tick 422, so the name stays Bram.

### Landless

World Government does not move. Free Tide moves together, then the lower seeds cross.

| Seed | Tick 400 | Tick 1200 | Under 0.25 |
| ---: | --- | --- | ---: |
| 1847 | 0.262 / 0.494 / 0.648 / 0.726 / 0.911, half 3 | 0.124 / 0.356 / 0.510 / 0.588 / 0.773, half 4 | Finn Frost at 561 on the loss, end 0.124; Bram Tern at 1175 on a landless day, end 0.241. Both stayed |
| 2718 | 0.335 / 0.485 / 0.776 / 0.783 / 0.930, half 3 | 0.219 / 0.369 / 0.660 / 0.667 / 0.814, half 4 | Bram Tern at 749, end 0.219, stayed |
| 4096 | 0.207 / 0.280 / 0.519 / 0.641 / 0.721, half 4 | 0.079 / 0.152 / 0.391 / 0.513 / 0.593, half 6 | Mina at 167, stayed, end 0.079. Finn at 491, back above the line at 499 when the port returned, then under again at 932 on the next loss, end 0.146. Zara Gale at 932, stayed, end 0.152 |

The biggest move is the whole Free Tide roster: −0.198, −0.164, and −0.232, from four losses, the daily −0.002, and the regains. Finn's return at tick 499 is the churn: the line is crossed because a day counter tripped, then uncrossed because a port came back. No regency changes, because the one-shot and the daily hit every member, and the gaps between them stay put. The 2718 and 4096 losses are inside the fixture (ticks 35 and 51). The 1847 loss is tick 77, just outside it.

### Battle

Almost nobody moves. Writes: 9, 5, and 8.

| Seed | Free Tide at tick 1200 | Biggest mover |
| ---: | --- | --- |
| 1847 | 0.322 / 0.554 / 0.703 / 0.786 / 0.971, half 2 | Esme Dusk −0.024, two defeats under orders, ticks 29 and later. Pax −0.005 net, four wins and three losses |
| 2718 | 0.383 / 0.548 / 0.826 / 0.832 / 0.978, half 2 | Pax +0.015, three wins and one loss. Esme +0.008, one victory under orders |
| 4096 | 0.311 / 0.384 / 0.599 / 0.705 / 0.825, half 4 | Pax −0.040, two wins and four losses. Esme −0.024, two defeats under orders |

World Government is the baseline row. No crossings. No regency changes. The first commander battle that writes is inside the fixture on every seed (event ticks 21, 25, and 25). M29 would retitle some of Pax's losses, so this table is not stable.

### Trust

Loyalty walks toward trust in the commander, 0.004 at a time. Writes: 159, 172, and 175. No crossings. The low seeds rise and the high seeds fall, which is the opposite of a defection. Biggest movers: Kessa Calder +0.140 on 1847, Ada Sorn +0.180 on 2718, Vale Drake +0.160 on 4096. On 4096 the Bram–Finn gap shrinks to 0.474 and Bram still leads. The first such tie is inside the fixture (event ticks 13, 10, and 12).

### Combined

| Seed | Tick 1200, Free Tide | Under 0.25 |
| ---: | --- | --- |
| 1847 | 0.272 / 0.503 / 0.573 / 0.727 / 0.930, half 2 | 0. World Government's low end is the baseline; its median is 0.678 from the completions |
| 2718 | 0.343 / 0.508 / 0.798 / 0.804 / 0.900, half 2 | 0 |
| 4096 | 0.221 / 0.346 / 0.463 / 0.590 / 0.758, half 5 | Mina Vale at tick 1004, the unpaid release, end 0.221, stayed. She had already lost 0.05 net from the ports |

Biggest movers: Esme Dusk −0.154 on 1847 (two ransoms, two defeats under orders, and the port swings; her 198 deviation pairs cancel), Corin Hale −0.078 on 2718, Pax Ash −0.170 on 4096. No regency changes. The order term writes on tick 0, so the fixture moves. Esme is still rewritten 458 times on 4096. The crossing is one person, late, and it has a name. The path to it is not one cause.

### Combined, with decay

The daily pull erases the scar. Tick-1200 Free Tide medians are 0.652, 0.824, and 0.618, against seeds 0.708, 0.824, and 0.623. Pax on 1847 ends at 0.652, the largest leftover, and decay has already given back 0.079. Finn Frost on 2718 ends on his seed. No crossings. No regency changes. Writes are 1681, 905, and 1592, mostly the daily pull. The fixture still moves, because the order term writes on tick 0 and the pull starts on tick 5.

## Hash neutrality

The shielded run restores seeded loyalty before every `runTick`, applies the shadow after the tick, and writes that number onto `personality.loyalty` only for the hash. Every shielded event log through tick 72 matches the fixture event for event. The unshielded run leaves the number in place, so the next tick's work score, goal score, and obedience read it.

| Variant | 1847 | 2718 | 4096 | Fixture |
| --- | --- | --- | --- | --- |
| Pay per shift | Hash at world tick 3. Unshielded, Kessa Calder's `decision-made` at tick 3 | Tick 2. Kessa's `decision-made` | Tick 2. Jun Marrow's `decision-made` | Moves |
| Pay per day | Tick 6. Bram Quill's `decision-made` | Tick 6. Iris Stone's `decision-made` | Tick 6. Sable Morrow's `decision-made` | Moves |
| Orders | Tick 1. Toma Reef's `plan-reconsidered` | Tick 1. Toma's `plan-reconsidered` | Tick 1. Bram Quill's `plan-reconsidered` | Moves |
| Orders plus refusal | Tick 1. Sable's `decision-made` on 1847; Toma on 2718; Bram Quill on 4096 | same | same | Moves |
| Unpaid ransom | No write through tick 72. Shielded and unshielded logs match. First hash difference is world tick 119, the release stamped 118 | World tick 203, release stamped 202 | World tick 383, release stamped 382 | Holds |
| Landless | No write through tick 72. The first loss is tick 77 | Tick 36, from the loss stamped 35. Unshielded, Pax's `plan-reconsidered` | Tick 52, from the loss stamped 51. Unshielded, Mina's `decision-made` | Holds on 1847 only |
| Battle | Tick 22. Unshielded, Pax's `decision-made` | Tick 26. Pax's `plan-reconsidered` | Tick 26. Pax's `decision-made` | Moves |
| Trust | Tick 14. Mina's `plan-reconsidered` | Tick 11. Mina's `plan-reconsidered` | Tick 13. Iris's `decision-made` | Moves |
| Combined, either decay | Tick 1, the order term. Same first events as orders | Tick 1 | Tick 1 | Moves |

The ransom's silence is structural. The hold is 84 ticks. The first capture on 4096 is Sable at tick 12, so the first possible release is tick 96, and that release is paid in full. The first unpaid release is Esme at 382. On 1847 the first release is Sable at 118. On 2718 it is Corin at 202.

With the reads left unshielded, the first payload change after those releases is a score, not a new action:

| Seed | Tick | Event | What moved |
| ---: | ---: | --- | --- |
| 1847 | 120 | Sable Morrow `decision-made` | Work score 41.01 to 40.69. The action stays work. 0.04 times 8 is 0.32 |
| 2718 | 206 | Corin Hale `decision-made` | A candidate score 43.24 to 42.92. The action stays rest |
| 4096 | 383 | Esme Dusk `plan-reconsidered` | Serve-faction score 1.273 to 1.255. Obedience 0.677 to 0.667. The loyalty factor 0.149 to 0.140 |

The shield is what keeps those payloads on the seeded numbers. Without it, the event log moves on the next decision after the first unpaid release, even when the chosen action does not.

### The M30 regencies, with drifted loyalty

The harness ranked the seat the way [political layer](political-layer.md) specifies, on the capture, and again only if the acting member was captured. Nobody in that job was captured during a regency, on the seeded loyalty or on any variant. Seeded names and scores:

| Seed | Interval | Acting | Score | Gap to the next |
| ---: | --- | --- | ---: | ---: |
| 1847 | 551–635, 837–921, 1116 onward | Dax Pike | 107.296 | 16.029, then 12.432 once Esme is free |
| 2718 | none | Pax is never captured | | |
| 4096 | 310–394 | Corin Hale | 97.227 | 9.253 over Bram Tern |
| 4096 | 422–506 | Bram Tern | 87.974 | 1.096 over Finn Frost at 86.878 |
| 4096 | 1121 onward | Corin Hale | 97.227 | 9.253 |

Leadership is not written after setup, so those scores are the tick-0 skills and the seeded loyalty, with captives removed. Dax's lead is too wide for any rule measured here. The Bram–Finn gap is 0.022 of loyalty. Pay per day crosses it and names Finn for the 422–506 cover. Pay per shift, by tick 1121, has cut Corin enough that Bram takes the open cover, ahead by 0.224. Ransom, orders, battle, trust, landless, and both combined rules leave Dax, Corin, Bram, and Corin in place.

A forced check, not a headless outcome: on a fresh 4096 world, with Pax and Corin excluded, Bram scores 87.974 and Finn 86.878. Bram's loyalty rounded down by 0.04 is 0.459, and his score is 85.950. Finn then leads by 0.928. The headless ransom never does this, because Bram is not released with a debt before that appointment. The sort is allowed to see the drift. A 0.04 step is large enough to rename that one cover if it ever lands on Bram and not on Finn.

## Recommendation

The smallest rule that is legible, rare, and hash-neutral is the unpaid release, and only that.

On `captivity-released`, when the character has a faction and `terms.debtValue > 0`, subtract 0.04 from their loyalty, pass it through `round` and `clamp` to 0.05–0.98, and store the adjustment. A release the purse covers stores nothing. Do not overwrite `personality.loyalty`. The obedience factors, the serve-faction score, and the work score keep reading the seed, which means those call sites do not change. Store the adjustment as a field that is omitted while it is 0, the same shape [political layer](political-layer.md) uses for `actingCommanderId`. On the measurement tree the first time it appears is the release stamped 118, 202, or 382, so the tick-72 world has no such field and no changed number, and `npm run golden:update` stays unrun. M27 has since rebaselined the committed fixture on its own. This rule was not re-checked against that pin, and M28's regeneration of 2718 is still ahead.

The M30 sort reads `personality.loyalty` plus the adjustment. On these runs the names stay Dax Pike, and Corin Hale, Bram Tern, Corin Hale.

Eight, two, and six writes in 1200 ticks. Each one is a release the chronicle already records, with a debt on the payload. Nobody crosses 0.25. The drops stay, because nothing adds the 0.04 back. That is a scar, not a churn.

It does not fight the opening order judgment, it does not tax a quiet day, and it does not move when M28 lengthens a landless stretch. It does sit next to an accepted default. [Captivity debts](captivity-debts.md) question 25 says a missed daily installment is not a mark. This mark is the release-day shortfall, not that missed day. Question 22 says the treasury does not pay the ransom, so the shortfall is the ordinary case whenever the purse is short. The questions below ask whether that ordinary case should move loyalty anyway.

M29 can remove a capture by turning the loss into a victory. This rule then does not fire for that battle. The spec is the release, not the list of names above.

### What it would hand secession

Secession stays out of scope. The trigger remains the declaration, as [political layer](political-layer.md) has it. `factionId` still has no later writer. What a moving loyalty would hand a follow-or-stay rule is this adjustment, added to the seed. On these runs the lowest result is Mina Vale at 0.271. The rule does not hand secession anyone under 0.25. It hands a short list of people who left prison owing money, and no one else.

### Tests

`npm run golden:update` stays unrun for this rule. On the measurement tree the fixture already matched the pin in the table above. The merged tree pins the M27 hashes, and this rule was not re-checked against them.

- `tests/captivity.test.ts`, beside the fourteen-day release. A release whose debt is above 0 writes the adjustment −0.04, leaves `personality.loyalty` and `rngState` unchanged, and omits the field when the debt is 0. A second unpaid release on the same character subtracts another 0.04. A value that would fall under 0.05 stops at 0.05.
- `tests/agency.test.ts`. After that adjustment, `assessStandingOrder` obedience, the serve-faction score, and the work candidate's score match the seeded loyalty.
- `tests/simulation.test.ts`, beside the regency case from M30. On seed 4096, excluding Pax and Corin, Bram Tern still leads Finn Frost, 87.974 to 86.878. Bram's adjustment of −0.04 makes the scores 85.950 and 86.878, and Finn leads. The headless run does not take that branch.
- `tests/redaction.test.ts`. The commander's own faction rows include the adjusted loyalty. A rival row leaves it null, and still leaves treasury and power null.
- `tests/golden.test.ts`. On the measurement tree, "pinned seeds reproduce their committed state hash and event count" stayed on `d7eb02eb…`, `d0b4b449…`, `d5d9da8b…` (8275, 8489, 8003). The merged tree already pins `8e081fb0…`, `64e84328…`, `b85a6810…` (8301, 8516, 8031). This rule was not re-checked against that pin.

### Playtest

Follow `docs/playtests/TEMPLATE.md`. Dashboard HTTP JSON only. Two reads. No survey, no raid, no other command. Mara Vane starts at Crown Harbor.

**Seed 1847, ticks 0–200.**

**Hypothesis.** Sable Morrow's loyalty is 0.577 at tick 0 and 0.537 after her release at tick 118. It does not move on any earlier tick. Mara's loyalty stays 0.808. The tick-72 hash stays `d7eb02eb…` with 8275 events. No rival row shows a loyalty.

**Ambition.** Stay at Crown Harbor. Read Sable and Mara at the start, once before tick 118, and once after the release.

**Success.** The release is `captivity-released` for Sable at tick 118, `daysHeld` 14, debt 58.18, money paid 13.40. Her row shows 0.537 and Mara's shows 0.808. Pax is not captive, and Free Tide has no acting commander. No new event type appears.

`PROMOTE` if those reads match and the tick-72 hash is unchanged. `REVISE` if a paid release moves a number, or if a rival row shows one, or if Sable's next decision changes action because of it. `ABANDON` if the tick-72 hash moves.

**Seed 4096, ticks 0–450,** same ambition, is the regency check. At tick 320 Free Tide's acting commander is Corin Hale and every loyalty is still the seed, because the first unpaid release on this seed is tick 382. At tick 400 Pax is free and his loyalty is 0.705, from 0.745, after the release at 394. At tick 450 the acting commander is Bram Tern, not Finn Frost. `REVISE` if that name is Finn.

## Questions for Micah

1. **Someone walks out of prison still owing the ransom. Does their loyalty fall?** Default: yes, by 0.04, once, on that release. A release they can pay in full does not change it. The drop stays if they pay the rest later. This is not the missed daily payment. That day still passes with no mark, as the debt note already says. On these runs the drop happens 8, 2, and 6 times, and nobody falls under 0.25.
2. **Can that change make them disobey, or change the work they pick?** Default: no. Orders, plans, and work keep using the loyalty they were given at the start. The only new use is who covers the seat while the commander is in prison. On these runs that person does not change. The one close call is Bram Tern over Finn Frost by a small margin, and neither of them owes a ransom before that cover starts.
3. **Who is allowed to see loyalty?** Default: you see it for your own faction, including the drop. A rival's stays hidden, the way their treasury does. Today you see only your own.
4. **Should captains start giving new orders on their own?** Default: no, not in this change. A separate sketch is below. The version that was measured rewrites the first 72 ticks.

## Autonomous commander orders

A sketch, not a spec. The seat named in M30 does not issue, confirm, or retarget. Giving it orders is a later slice. The smallest version that was measured:

Every 24 ticks, four days, if Pax Ash is free and Free Tide holds a port, he issues one `protect` on the Free Tide port with the highest garrison, lower settlement id on a tie. The recipient is the lowest-id free faction mate with no open order from him. Open is pending, active, or awaiting confirmation, the M25 slot. A mate who already refused `protect` on that same port is skipped. World Government does not do this. Mara is the human, and these runs give her no commands. The acting commander does not issue either. Pax is free at every issue in the 400-tick window. His first capture is tick 310, on 4096.

Acceptance is the existing path. The order is pending, and the next plan review runs `assessStandingOrder`. No new `rng.next` picks the mate or the port. The review draws the goal noise the sim already draws, and a review that would not have happened draws it extra. That is enough to move later rolls.

Every issue in the 400-tick runs was refused. A fresh `protect`, scored at tick 1 against the same factors, is also refused for every opening refuser. The closest call is Vale Drake on 1847, 0.008 under his line on an explore order. Flipping his own order would take about +0.027 of loyalty. This slice only subtracts, and it does not subtract from him. So a reissue does not get a new answer while the obedience read stays on the seed.

The history moves anyway. The first differing event is tick 24 on every seed: Finn Frost's `plan-reconsidered` on 1847 and 4096, Bram Tern's on 2718, in place of whatever the baseline was doing. Tick-72 hashes move. At 400 ticks:

| Seed | Events | Decisions | Claims | Battles | Ports at tick 400, this run against the baseline |
| ---: | --- | ---: | ---: | ---: | --- |
| 1847 | 49265 to 48986 | 8081 to 7889 | 5 to 3 | 16 to 22 | Cinder Key and Glassport are World Government; the baseline still has both as Free Tide |
| 2718 | 50325 to 51797 | 8308 to 8616 | 6 to 5 | 17 to 15 | Glassport is World Government; the baseline has it as Free Tide |
| 4096 | 49091 to 49946 | 8271 to 8469 | 4 to 5 | 18 to 16 | Cinder Key and Glassport are Free Tide; the baseline has Cinder Key as World Government |

The prototype did not emit `standing-order-issued`. A real path would, one event per issue, on top of the review it already causes. The hash moves either way. M25 is respected, because a mate with an open order is not chosen. On the measurement tree M27 was not built. A completion report stayed `awaiting-confirmation` and held the slot, so the only mates who could be issued a new order were the opening refusers. M27 is now in the merged tree: that slot frees a day later, the same mates become eligible again, and this cadence would keep issuing. That interaction was not measured, on either tree. It should be measured before anyone builds the sketch.
