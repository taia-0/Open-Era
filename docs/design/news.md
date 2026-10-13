# News

**Status: Open.** Design brief for the Lead. Nothing in this note is in the tree. The census is a local readout of the baseline tape. The resims were produced by a local harness and were not left in the tree.

Checked on `origin/main` at `7fb6721bdc4080e8bf636ba3767d263f06df9aed` (PR #97). That tip is the progression ruling, four docs commits after `1a8e399` (PR #96). `src/` and `tests/` are identical between those two commits. Node v24.21.0, ICU 78.3. `npm test` passed, 397 tests. The 72-tick fixture passed, including the golden recovery replay of 600 events on seed 1847 split at tick 47. A separate headless run reproduced the fixture and the 1200-tick baseline:

| Seed | Tick 72 state hash | Events | Tick 1200 state hash | Events |
| --- | --- | ---: | --- | ---: |
| 1847 | `4ea893a485b05ce6eab599919765903ade9a0ce45f383437f4698064faa7a297` | 8413 | `28866eb80bd48798c78791dd8f0c4093b9ffecfb8009421db7dd2c109d4f1e47` | 161658 |
| 2718 | `d376ad02c6e7c9b03dd0eb4db1c3c137ac7a00d61a096673e12ae4fdabbdfef2` | 8456 | `712b60edc75c313f17e774951f43aa84fcd487fbc29c422215cd602b19665be8` | 161613 |
| 4096 | `ac780b3999c3da53f38c0cd16301dfa7f60562a35796f5fa0451c969c9ed08de` | 8261 | `b0ac72fe452697010e58570136737e4dd8ed12770a2e86863bfdaa76ee07e114` | 162327 |

Runs are `createPrototypeWorld` plus `runTick`, no player commands. Seeds 1847, 2718, and 4096. A figure at tick 0 is the world before any `runTick`. A figure at tick 72 or tick 1200 is the world after that many calls. Tick numbers on events are the `tick` field. Tick 0 hashes are `f4411b174c7da0bd4b4c8a2e2dc6cc58b3caed7592f1854af04c28acb2ca5698`, `2a041b435821447be7426b5db5f51bf9985bf88638e07b9d0981f03f95b39142`, and `bb73f7fbb6dc3410458e9ce21128e227510d2f4d1e3331ca673aff8d8d150412`.

[Game vision](game-vision.md) says foreign resources, defense, plans, and motives are estimates, and public news is searchable and incomplete. [Autonomous characters](autonomous-characters.md) says knowledge spreads by messages, reports, and a daily news database, and that news fails by omission rather than by invented detail. [Reconnaissance](reconnaissance.md) says a report copies an observation, a relay keeps the original `observedTick`, and the news database is not a passive global feed. [Sea sightings](sea-sightings.md) is a derived row for a ship met on a leg, left off the hash. [Party sightings](party-sightings.md) records who was anchored. [Captive intelligence](captive-intelligence.md) copies the prisoner's existing port beliefs and leaves rumors out. [Capture wording](capture-wording.md) is the public sentence for a capture, a release, a battle, and a claim. [Offices](offices.md) and [secession](secession.md) are the declaration read. [Leader tax](leader-tax.md) is the rate the free holder steps. [Alliances](alliances.md) would copy earned sightings to an ally as a dated faction report. [Aging](aging.md) is ruled and not in this tree; this tape has no death event.

Median below is the value at linear index `(n − 1) / 2`, interpolated when that index falls between two samples. A mean is rounded to 3 decimals.

## Summary

The log over 1200 ticks holds 161658, 161613, and 162327 events. Of those, 171, 137, and 138 are the public set in section 1. A witness is in port for 168, 134, and 137 of them. The other 3, 3, and 1 are a tax step taken while the holder is at sea.

A voyage on this tape lasts 2 to 5 ticks. The median is 3 on every seed (means 3.016, 2.973, and 3.061), across 2368, 2298, and 2445 voyages. Glassport and Cinder Key, 23.345 apart, take 2 ticks on every sailing. Crown Harbor and Cinder Key, 55.082 apart, take 4 or 5.

If a ship copies the port ledger and posts it on arrival, keeping the original tick, the first other port hears an item at median 4 ticks (means 4.229, 4.38, and 4.804). By tick 1200 every item has reached every port, except one item on 1847 that stays at Crown Harbor.

Each character already holds four settlement entries. At tick 0 none of them name the wrong faction. At tick 1200 the wrong-faction counts are 17, 19, and 10, all of them on entries whose source is still `direct`. Visits replace rumors. Nothing rewrites a direct entry after the character leaves, so a port that changes hands stays wrong in that entry until the character stands there again.

`buildCandidates` scores every other port's live faction on every decision. That live faction differs from the character's entry on 15231 of 26347 decisions, 15005 of 26760, and 12825 of 26618. The tax rule reads a remote port's stability on 70, 79, and 71 of the 87 evaluations that reach the stability read. Secession emits nothing. The owner-gate readout is true on 1400, 1473, and 1056 port-ticks, and the full gate, rate above 0.15 and stability at or below 55, is open on 160, 99, and 212. The first such states are ticks 438, 705, and 400.

Storing the ledger moves the 72-tick fixture, because the first post is event tick 1. Reading knowledge instead of the live remote faction moves the first decision at ticks 60, 51, and 46. Limiting the tax read to the port the holder is standing in keeps the 72-tick hash and moves tick 1200.

## 1. What becomes news

`eventPayloadVisible` keeps a character's payload private. The feed still has a short public sentence. The set below is the events whose public sentence is the political fact, with the numbers, the motive, and the cargo left off. Upkeep, production, work, trade, rest, recruiting, decisions, plans, relationships, knowledge updates, orders, conversations, contracts, travel progress, metrics, and the tick marker stay out. A phase of a battle stays out. The resolved battle, or the retreat, is the item.

| Event | 1847 | 2718 | 4096 |
| --- | ---: | ---: | ---: |
| `battle-resolved` | 57 | 42 | 46 |
| `battle-retreated` | 12 | 15 | 15 |
| `settlement-claimed` | 32 | 24 | 22 |
| `character-captured` | 16 | 14 | 9 |
| `captivity-released` | 16 | 13 | 9 |
| `tax-rate-set` | 38 | 29 | 37 |
| `captivity-escaped` | 0 | 0 | 0 |
| `settlement-surrender-declined` | 0 | 0 | 0 |
| Total | 171 | 137 | 138 |

There is no `character-died` on this tape. Aging would add that type when it lands. It is not in this count.

An item stores `id`, `type`, `observedTick`, and `factionId`. A tax item also stores `taxRate`. It does not store garrison, fortification, stability, stocks, prices, loyalty, cargo, health, or the battle score. Fortification on these runs is constant: Cinder Key 1.16, Crown Harbor 1.35, Glassport 1.22, Verdant Cay 1.08, the same at tick 0 and at tick 1200. Walls stay a survey. [Reconnaissance](reconnaissance.md) already says standing in a port is not a survey, and every raid below has no `ground` record.

A witness is a character at that port at the end of the event's tick: still ashore, just cast off and not yet stepped, or captured at that port on that tick. The actor of a port event counts as present. A tax step is witnessed at the holder's port. If the holder is at sea, the item is not posted at a port they have left. They carry it, and the next landfall is its first port. `observedTick` stays the tick of the step. Those sea steps are the 3, 3, and 1 unwitnessed rows. Their landfall lags are 1, 1, and 1 on 1847 (median 1), 1, 2, and 2 on 2718 (median 2), and 3 on 4096.

The ledger counts at tick 1200, origin port only, are Crown Harbor 71, 63, and 44; Glassport 65, 42, and 45; Cinder Key 31, 26, and 46; Verdant Cay 1, 3, and 2. Those sums are the witnessed totals, 168, 134, and 137.

## 2. How it travels

`travelDuration` is `max(2, ceil((distance / 11) * (1 − navigation / 220)))`, or 1 when the character is already at sea. The distances are Cinder Key to Glassport 23.345, Glassport to Verdant Cay 25.807, Crown Harbor to Glassport 43.829, Crown Harbor to Verdant Cay 47.508, Cinder Key to Verdant Cay 49.041, and Crown Harbor to Cinder Key 55.082.

An autonomous ship does not step on the tick it casts off. It arrives `totalTicks` later. The cells below are count, median, mean, and the min–max, for seeds 1847, 2718, and 4096.

| Leg | 1847 | 2718 | 4096 |
| --- | --- | --- | --- |
| Cinder Key → Glassport | 338, 2, 2, 2–2 | 334, 2, 2, 2–2 | 285, 2, 2, 2–2 |
| Glassport → Cinder Key | 330, 2, 2, 2–2 | 339, 2, 2, 2–2 | 272, 2, 2, 2–2 |
| Glassport → Verdant Cay | 149, 2, 2.262, 2–3 | 196, 2, 2.163, 2–3 | 191, 2, 2.157, 2–3 |
| Verdant Cay → Glassport | 166, 2, 2.241, 2–3 | 215, 2, 2.177, 2–3 | 257, 2, 2.195, 2–3 |
| Cinder Key → Verdant Cay | 148, 4, 3.588, 3–4 | 137, 4, 4.073, 3–5 | 128, 4, 3.852, 3–5 |
| Verdant Cay → Cinder Key | 147, 4, 3.612, 3–4 | 133, 4, 4.09, 3–5 | 138, 4, 3.812, 3–5 |
| Crown Harbor → Glassport | 338, 4, 3.651, 3–4 | 285, 4, 3.516, 3–4 | 303, 4, 3.587, 3–4 |
| Glassport → Crown Harbor | 364, 4, 3.632, 3–4 | 300, 4, 3.513, 3–4 | 385, 4, 3.616, 3–4 |
| Crown Harbor → Verdant Cay | 143, 4, 3.559, 3–4 | 111, 4, 3.811, 3–4 | 221, 4, 3.71, 3–4 |
| Verdant Cay → Crown Harbor | 134, 4, 3.575, 3–4 | 108, 4, 3.833, 3–4 | 153, 4, 3.66, 3–4 |
| Cinder Key → Crown Harbor | 53, 4, 4.434, 4–5 | 74, 4, 4.27, 4–5 | 53, 5, 4.547, 4–5 |
| Crown Harbor → Cinder Key | 58, 4, 4.414, 4–5 | 66, 4, 4.288, 4–5 | 59, 5, 4.678, 4–5 |

The carriage rule that was timed copies the whole ledger of the port a character is leaving, including items other ships have already delivered there. On arrival, each item the destination does not yet hold is posted with the same `observedTick`. A relay does not make the item younger.

| | 1847 | 2718 | 4096 |
| --- | --- | --- | --- |
| Items that reach another port | 170 | 137 | 138 |
| Items that never leave the origin | 1 | 0 | 0 |
| First other port, lag | n 170, median 4, mean 4.229, max 15 | n 137, median 4, mean 4.38, max 13 | n 138, median 4, mean 4.804, max 34 |
| Every later port, lag | n 510, median 7, mean 7.62, max 28 | n 411, median 7, mean 7.691, max 27 | n 414, median 7, mean 7.72, max 41 |

The lag splits into a wait for a ship and the voyage itself on the deliveries whose arrival tick is the departure tick plus `totalTicks`. That is 491, 392, and 397 deliveries. Wait median 3, 4, and 4 (means 4.764, 4.98, and 4.889; max 24, 23, and 38). Sail median 3 on every seed (means 3.02, 2.934, and 3.033; min 2; max 5). The other deliveries are in the lag row and not in this split.

At tick 1200 under that rule, Crown Harbor holds 171 items on 1847 and the other three ports hold 170. On 2718 every port holds 137. On 4096 every port holds 138. The coarse fact of a claim, a battle, a capture, or a rate has become common knowledge. The numbers that were omitted have not.

## 3. What a character already knows

`knowledgeFor` seeds every character with every settlement. The port they stand in is `direct` at confidence 1 and `observedTick` 0. Another port of their faction is a `faction-report` at confidence 0.76, perturbed. Anything else is a `rumor` at confidence 0.22–0.42, perturbed. Both are backdated 3 to 30 ticks. `directObservation` rewrites the port they are standing in, at most once a day (`ticksPerDay` is 6), and it copies faction, garrison, stocks, and prices. It does not copy stability, population, or fortification. Knowledge does not pass from one character to another. There is no `news` field on the world.

`freshness` is `confidence × exp(−age / 72)`, clamped to 0.08–1, with age `max(0, tick − observedTick)`. Prices use 18 ticks instead of 72. `believedGarrison` ignores the entry when the character is standing in that port and returns the live garrison.

Thirty characters and four ports are 120 entries. Entry-ticks from tick 0 through tick 1200 are 144120. Faction mismatches across those entry-ticks are 26231, 24115, and 20337. By source, direct is 127667, 130193, and 127394 entries with 23780, 21510, and 18300 mismatches; rumor is 12252, 9244, and 12972 with 1389, 1232, and 1448 mismatches; faction-report is 4201, 4683, and 3754 with 1062, 1373, and 589 mismatches.

| Tick | 1847 entries by source | Mismatch | 2718 | Mismatch | 4096 | Mismatch |
| ---: | --- | ---: | --- | ---: | --- | ---: |
| 0 | direct 30, rumor 64, report 26 | 0 | 30, 64, 26 | 0 | 30, 64, 26 | 0 |
| 72 | 98, 11, 11 | 34 | 103, 12, 5 | 14 | 96, 19, 5 | 1 |
| 400 | 107, 9, 4 | 7 | 110, 6, 4 | 6 | 107, 9, 4 | 21 |
| 1200 | 111, 8, 1 | 17 | 112, 5, 3 | 19 | 111, 9, 0 | 10 |

At tick 0 the rumor ages are median 15, 19, and 16 (means 16.297, 18.922, and 16.125; max 30). At tick 1200 the direct ages are median 125, 154.5, and 115 (means 352.973, 378.786, and 341.541; max 1200). The rumors that were never replaced are median 1210.5, 1215, and 1215. The direct mismatches at tick 1200 are the whole of the mismatch column: 17, 19, and 10. A visit is fresh on the day it happens and then sits, still labelled direct, through later claims.

## 4. What the decisions read

The character is ashore for every row of `buildCandidates`. Rest, work, and the local shelf are in front of them. The remote read is the other ports' live `factionId`, used as `factionInterest` on every travel candidate, and the same live factions again in the landless test. `believedPrice` already uses the entry. The raid gate uses the live garrison of the port they are standing in, and the score multiplies `believedGarrison` by the live fortification. While they are standing there, `believedGarrison` is the live garrison, not the entry.

| Action | Decisions | Remote faction differs from the entry | Own figure |
| --- | --- | ---: | --- |
| `rest` | 10281 / 9943 / 10009 | 7067 / 6961 / 5996 | 0 |
| `work` | 6631 / 7841 / 6947 | 3871 / 4169 / 3114 | 0 |
| `trade-local` | 3003 / 2954 / 3334 | 1164 / 1071 / 1070 | shelf differs on 2947 / 2901 / 3292 |
| `travel` | 2368 / 2298 / 2445 | 918 / 799 / 807 | chosen port differs on 193 / 165 / 170 |
| `buy-provisions` | 2051 / 1962 / 2088 | 1074 / 998 / 910 | provisions differ on 1460 / 1470 / 1593 |
| `recruit` | 1911 / 1676 / 1709 | 1084 / 971 / 890 | arms differ on 1617 / 1446 / 1473 |
| `raid` | 70 / 62 / 64 | 32 / 25 / 29 | no `ground` on 70 / 62 / 64 |
| `claim-settlement` | 32 / 24 / 22 | 21 / 11 / 9 | offer mismatch 0 |

The three seeds are in that order in every cell. The remote-faction column is the decision count in which at least one other port's live faction differs from the entry. Summed, that is 15231, 15005, and 12825 decisions. Rest and work have no settlement fact of their own; the candidate list still scores the remote factions. The shelf cells are the live stock against the stored estimate while the character is standing on it. The code reads the live shelf. The estimate is what a news item would have to replace if the decision stopped reading the port under their feet. A claim's `offeredToId` is the decider on all 32, 24, and 22 claims.

Raids also disagree with the stored garrison on 28, 21, and 24 decisions, and the landless flag computed from knowledge disagrees with the live flag on 22, 16, and 17. The fortification read has no stored ground on any raid.

The tax clock fires on 98 evaluations, two factions on each of the 49 ticks from 24 through 1176. On 11 of those the free holder is missing or the 24-tick cooldown has not cleared, so stability is not read. The other 87 read it. The holder is standing on the only port they hold for 16, 6, and 16 of those reads. They hold no port for 1, 2, and 0. The rest, 70, 79, and 71, read a port they are not standing in. Steps that emit `tax-rate-set` are 38, 29, and 37, of which 29, 27, and 31 read a remote port, 8, 2, and 6 are the single port they are standing on, and 1, 0, and 0 fire with no port held. Stability is not a field on `SettlementKnowledge`, so the remote reads are live truth. Ending rates on the baseline are World Government 0.08, 0.11, and 0.14, and Free Tide 0.16, 0.16, and 0.17, from the scenario starts of 0.14 and 0.08.

Secession is not called from `runTick`. Emitted declarations are 0. `secessionReadout` on each of the 1201 states, for each port, passes the owner gate on 1400, 1473, and 1056 port-ticks. Another anchored member of that faction is present on 1117, 1253, and 969 of those, and the readout reads that member's loyalty. Loyalty is not on the knowledge entry, and section 1 does not put it on a news item. The full gate used by the autonomous rule in the secession note, owner gate plus a holding rate above 0.15 plus stability at or below 55, is open on 160, 99, and 212 port-ticks. The first states are 438, 705, and 400. Those are the same counts the offices note reported for the owner on the tax-autonomy world. This readout was taken again on this tip.

## 5. Determinism

`stateHash` is sha256 of the canonical world. The event log is counted, not hashed. `applyEvent` throws on an unknown type. A stored item has to be the body of an event the reducer applies, the same way [M33](m33-release-record.md) recovers a release. A list computed beside the tick and written onto the settlement without an event is on the next snapshot and gone when recovery starts from an earlier one.

The posts in slices 2 and 3 draw nothing. They do not touch `world.rngState`. Replay of each of those logs through `applyEvent` matched the live hash on all three seeds. `WorldState.version` stays 5. The `news` key is absent until the first post, and the first post is event tick 1, so tick 0 is still the baseline hash.

A roll that chose which detail to drop would be a side stream, forked and not written back, with the roll stored on the event. The default does not roll. Omission is the fixed field list in section 1. The tick rng is the wrong stream. One discarded draw on it moves the first decision of tick 0, which is the result the aging note already measured.

The live faction read and the live stability read are deterministic. They are also ahead of the entry. Replacing them is what moves the hashes in slices 4 and 5. Leaving them in place keeps this baseline.

## 6. Slice plan

The slices are in the order they would land. A slice that does not write keeps the hash of the world it is read from. Slices 2 and 3 store items and do not let any decision read them. Slices 4 and 5 change a read and do not store news. They are each measured from the baseline, not stacked.

| Slice | What lands | Hash on these three seeds |
| --- | --- | --- |
| 1 | A readout. Which events are public, the voyage lengths, the ledger lags, the knowledge ages, the remote reads. Not written. | Neutral. The baseline table at the top. |
| 2 | `news-posted` through `applyEvent`, one item on the origin port, omitted until the first post. No reader. | Moves the 72-tick fixture. The first extra event is tick 1, `news-posted` at Crown Harbor, signature index 268, 269, and 264. Decision signatures match the baseline. Replay matched. |
| 3 | The same items, plus a copy on each later port when a ship arrives, original `observedTick` kept. No reader. | Moves the fixture further. Decision signatures still match. Replay matched. |
| 4 | `factionInterest` and the landless test use `knowledge.factionId` instead of the live faction. Garrison, stocks, and the claim offer stay live. | Moves the fixture. First signature diffs are tick 60, tick 51, and tick 46. |
| 5 | The tax step's pressed test reads stability only for a held port the holder is standing in. A remote port does not press the rate. | The 72-tick hash and event count stay on the fixture. Tick 1200 moves. |
| 6 | Secession reads a news item instead of live stability and live loyalty. | Not run. The walker is not in `runTick`, so this tree emits no declaration and the baseline hash stands. The full gate is already open at states 438, 705, and 400. A walker that declared there would leave the 72-tick window and move tick 1200. That hash was not measured. |

Slice 2. Tick 72 hashes `8b7d065a4ea3aec6c9879162929ba7005a5dce4c35afc3e97c1d28429b03b41c` (8434), `9b2c4d8a0d18588caa7423ac6a9f45a7f32a1d298e7ccf410a395e8ebb0ce0d9` (8472), and `f49e6c26c2f1fff4dc3b664ead4ccda7bddc0f6e77904ca5f2f04d7dd46f7f28` (8279). Tick 1200 hashes `636d8dc3119f103682d5d832e18719f162cb0cefab3de4f9a83438f29d2848dd` (161826), `166a13d4baae35b820fd55806580dd8572ae4b8fbe12d8d2656c9baa67d4fd96` (161747), and `a159479a5c5ec2fb5afd3aca7d9dd0fd16d1bb265d230d72af37d183c03ed4a5` (162464). The extra events are the witnessed posts: 168, 134, and 137 at tick 1200, and 21, 16, and 18 inside the fixture window.

Slice 3. Tick 72 hashes `730850ef4efb1f7e2363259375158f1e5ab4cc80b67c1584f35f28b87214ddf9` (8493), `6a801e1ea81b35c38ea9eb4a5141a1afba9c3b9dcd84f8cf3da7b589f8f91ac8` (8520), and `47a963bbed8aef09ec90751572e30201265c7a79d20cd30362bed04e4997e86f` (8333). Tick 1200 hashes `4e230ac18bae1dcea318576b300366416d1edf9f561cdea8e7bd53cdc371bdb6` (162339), `6b04d746e9e5b041c1d0c6c2eae4a09479a5a6801d7f8287f05609287c9b9054` (162161), and `2255948ec1e96d9953f92d323451a33bb98da4aa0ab560788ab611a22e8368ac` (162879). Deliveries added on top of the witnessed posts are 513, 414, and 415. That is the port-to-port count plus the sea landfalls.

Slice 4. Tick 72 hashes `c3b8290076aa38f276375a5dfa3e1789652edfc9e5023ff3639626cb050c3fb8` (8368), `ed0a9c079e0834903c8a69848cf2c30dd4b4c334a9d4ae293a6ff61d83bfd07a` (8453), and `78f38eebebdcc0d8b89bde282c3172a592ef6cd8917936fc65514cff562a4cfc` (8263). Tick 1200 hashes `414ff16b2c615e351ab825057fbabae6df191e6f645822709cd640868953d7eb` (160073), `1687d7e1f3ceafd64b652458aefb53f1614657fb5f413e47e3c1479121ae953a` (165975), and `acd97e08e7e9cc9f6e6ceab66df8d90abfda04be80f1ec9fd4a5626ef395aef7` (165782). The first diffs are Sable Morrow (`character-04`) at Cinder Key on 1847, target `glassport` against `verdant-cay`, signature index 7007; Niko Wren (`character-03`) at Verdant Cay on 2718, an empty target against `cinder-key`, index 5982; and Niko Wren at Verdant Cay on 4096, the same shape, index 5308.

Slice 5. The 72-tick hashes and event counts are the baseline table. Tick 1200 hashes `c3ed8e8c91a07baf0e100ce59a175ac06b5eaadcb761cbb254be3f138f553d7f` (163279), `5673f7007b9e473e0ea4a87bae6042398a37098b6ff7a156f85ad0a779a22f47` (163212), and `c17cce561b88e5ba13a42f13d602f5702b99f7f4210995e4dc5e40db6094b482` (162696). The first diffs are a `tax-rate-set` the slice does not emit: tick 456, Mara Vane (`character-01`), World Government, index 57014; tick 216, Mara Vane, World Government, index 25811; tick 504, Pax Ash (`character-14`), Free Tide, index 64339. Tax events become 25, 26, and 34. Ending rates become World Government 0.13, 0.12, and 0.14, and Free Tide 0.30, 0.22, and 0.18.

Slice 2 should not ship as a silent rewrite of the fixture. The readout can land first. The ledger re-pins the golden file on Node v24.21.0, ICU 78.3, on the same commit that adds `news-posted`.

## 7. Questions for the Lead

The Lead rules on these against [game vision](game-vision.md). Defaults are what this brief would build.

1. **Which events become an item?** Default: `battle-resolved`, `battle-retreated`, `settlement-claimed`, `character-captured`, `captivity-released`, `captivity-escaped`, `settlement-surrender-declined`, and `tax-rate-set`. On this tape that is 171, 137, and 138 events. Escapes and declined surrenders are in the set and occurred 0 times. Phases, upkeep, production, trades, work, decisions, plans, and orders stay out. A death joins the set when `character-died` exists. This tape has none.

2. **What does the item keep?** Default: `type`, `observedTick`, `factionId`, and `taxRate` on a tax item only. Garrison, fortification, stability, stocks, prices, loyalty, cargo, and the battle score stay off. Fortification is 1.16, 1.35, 1.22, and 1.08 and never moves. Every raid reads it live, and none of those raids have `ground`. Walls stay a survey.

3. **Who witnesses a post?** Default: someone at the port, including the actor and a character captured there on that tick. A holder at sea carries their own tax step and posts it at the next landfall, with the original tick. That is 3, 3, and 1 steps, landing 1, 2, and 3 ticks later at the median. A faction member who was not there does not receive it by being in the faction.

4. **How does a ship carry it?** Default: the whole ledger of the port they are leaving, posted on arrival where the destination lacks that `id`, `observedTick` unchanged. First other port is median 4 ticks. The voyage itself is median 3, and the wait for a matched sailing is median 3, 4, and 4. By tick 1200 the coarse items are on every port, except one Crown Harbor item on 1847. A witness-only bag, which does not pick up what other ships have already delivered, was not timed.

5. **Does the ledger feed the decisions in the same slice?** Default: no. Slices 2 and 3 store the items and leave every decision on today's reads. Decision signatures match the baseline. The hash still moves, because the items are on the settlements. The 72-tick counts become 8434, 8472, and 8279 for the origin ledger, and 8493, 8520, and 8333 once copies travel.

6. **When does travel stop reading a live remote faction?** Default: after the ledger exists, and then `factionInterest` and the landless test use the entry, not the live faction. Doing it on today's entries, with no ledger, is slice 4. It moves the fixture. The first changed decisions are tick 60, 51, and 46, Sable Morrow and Niko Wren, as in section 6. The remote-faction column this would retire is 15231, 15005, and 12825 decisions, of which the chosen travel port itself differs on 193, 165, and 170.

7. **What may a character use at the port under their feet?** Default: the live garrison, the live shelf, and the live prices. They are standing there. The stored estimate already disagrees with that shelf on 2947, 2901, and 3292 trade decisions, 1617, 1446, and 1473 recruits, and 1460, 1470, and 1593 provision buys. Those stay live. The raid gate stays the live garrison. The claim stays the offer, which matched the decider on all 32, 24, and 22 claims. The raid score keeps the live wall. Taking that factor off until `ground` exists was not measured. Slice 4 left the factor live.

8. **What does the tax step get to see?** Default: the stability of a held port the holder is standing in, and the treasury, which they already spend. A remote port's stability waits for an item that does not carry the number, so it does not press the rate. That is slice 5. The 72-tick hash stays. Tick 1200 moves, the missing steps are tick 456, 216, and 504, and Free Tide's ending rates become 0.30, 0.22, and 0.18 against the baseline 0.16, 0.16, and 0.17. The 70, 79, and 71 remote stability reads are the ones this retires. Putting the stability number on the news item was not the measured store. Section 1 leaves it off.

9. **What does secession get to see?** Default: nothing new in this slice. The walker is absent, so declarations stay 0 and the hash stays the baseline. The owner-gate readout already reads live stability on 1400, 1473, and 1056 port-ticks, and another member's loyalty on 1117, 1253, and 969 of them. Loyalty stays off the item. The full gate is open on 160, 99, and 212 port-ticks, first at 438, 705, and 400. A walker that declared from news was not run. [Offices](offices.md) still names the governor as the declarer when that seat exists. This count is the owner gate in the code today.
