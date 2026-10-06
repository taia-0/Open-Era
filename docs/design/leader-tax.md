# Leader tax

**Status: Open.** Design brief for the Lead. No rule is in the tree. The harness was local and was not committed.

A faction's tax rate is the first political lever: the person in command sets what work and sales pay into the treasury. Only the free command holder may set it. During a regency the rate stays where the holder left it. The rate is already stored and already public. The first slice adds the command and the event, emits nothing in a headless run, and is expected to leave the golden fixture where it is. Autonomous leaders come later, and only then do the 1200-tick hashes move.

High tax makes each wage and each sale pay more to the treasury and less to the purse. It does not start a revolt, and it does not refill Free Tide. Pax Ash spends what the mates leave. On these runs a higher Free Tide rate raises his draw with the income. One seed at 0.20 keeps about 1,258. The other Free Tide endings in the holder-only sweep finish under 450, most of them under 50.

Measured on `d21822e50da6e94c2a068499a73197685754828f` (`origin/main` at this writing), Node v24.21.0, ICU 78.3. `npm test` passed, 350 tests, 0 failed. The 72-tick fixture matched `tests/fixtures/golden-hashes.json`, and a separate headless run reproduced those hashes. The golden test also passed its split recovery, which the fixture pins at 600 replayed events on seed 1847, split at tick 47.

| Seed | 72-tick state hash | Events |
| ---: | --- | ---: |
| 1847 | `4ea893a485b05ce6eab599919765903ade9a0ce45f383437f4698064faa7a297` | 8413 |
| 2718 | `d376ad02c6e7c9b03dd0eb4db1c3c137ac7a00d61a096673e12ae4fdabbdfef2` | 8456 |
| 4096 | `ac780b3999c3da53f38c0cd16301dfa7f60562a35796f5fa0451c969c9ed08de` | 8261 |

The 1200-tick baseline, scenario rates 0.14 and 0.08, no commands:

| Seed | State hash | Events |
| ---: | --- | ---: |
| 1847 | `90dacc2dfcd199ab720ade191bd3fdf8742632a36f19216bd53ce0e3a3294fef` | 160268 |
| 2718 | `226bf6257a86b233d197bd77747a10fe64b33dd7ac1e94bc27c11ff3ddf50cd8` | 161850 |
| 4096 | `30e9994387b2c9a2d8c0e16e27042797599188a105992cb7a9f8d2e924a8b0a6` | 162459 |

Those hashes start `90dacc2d` / `226bf625` / `30e99943`. Ending treasuries are World Government 13149.10 / 14874.12 / 12600.45 and Free Tide 24.88 / 7.91 / 41.76. Opening balance plus work tax, sale tax, and ransom, minus allowance and holder draws, equals the ending balance on every faction in every run below. The gap is 0.

## Who may set it

The holder only, and only while free. The acting commander leaves the rate alone.

`commandHolderId` (`src/sim/state.ts`) is the single issuer of that faction's standing orders. Two issuers, or none, leave the seat unnamed. The id is derived. It is not a field on `Faction`. Setup (`src/sim/scenario.ts`) makes `character-01` (Mara Vane) the issuer for World Government and `character-14` (Pax Ash) the issuer for Free Tide. On every run in this sweep, every uncapped treasury draw belonged to one of those two ids.

`spendRole` (`src/sim/allowance.ts`) returns `"holder"` only when that id is this character and `captivity` is null. A captive returns `"captive"`. The acting commander returns `"member"`: the comment and the function keep the balance share and do not inherit the holder's draw. `submitCommand` (`src/sim/commands.ts`) already refuses every command except escape while the player is captive, and every command except retreat while a battle is in progress.

The written rule is the same. [World simulation](world-simulation.md) says the cover does not set the tax. [Political layer](political-layer.md) says the acting member does not set the tax, does not receive the orders, and is not read by `reviewPlan` or `buildCandidates`. `actingCommanderId` is written on `character-captured` and removed on the holder's `captivity-released`. Nothing in `src/` assigns `taxRate` after `createPrototypeWorld`.

Mara, free and the holder, sets World Government's rate. She does not set Free Tide's. Pax sets Free Tide's when he is free. While either is captive, that faction's rate stays.

## Bounds, step, and cooldown

Prototype guard, against the design line that the leader sets the rate freely:

- Legal rates are `0.00` through `0.30` inclusive.
- The step is `0.01`. A command names an absolute on that grid. `0.14` and `0.20` are both one command apart from a cooldown, not six separate nudges.
- Cooldown is 24 ticks, four world days (`ticksPerDay` is 6). The same clock gates Mara and the autonomous step.
- A command that repeats the current rate is refused, so it does not burn the cooldown or emit an event.

`tradeTax` stores `round(gross * taxRate, 2)`. A step of 0.01 changes a 10-coin wage by 0.10. The scenario rates, 0.14 and 0.08, sit inside the band. The sweep measured 0.04, 0.08, 0.14, and 0.20.

The faction stores `taxRateSetTick` only after the first set. Until then the field is absent, which is how `actingCommanderId` stays off a free holder's faction. The cooldown reads that tick. A missing tick means the rate has never been changed and the command is open.

## How the world responds

### What exists

`taxRate` lives on the faction. A settlement reads the rate of whoever holds it, at the moment of the wage or the sale. A neutral port pays no tax. A buy pays no tax.

`workGross` is `10 + leadership * 0.08 + trade * 0.07`. The `worked` event credits the character `gross - tax` and the port faction `round(gross * taxRate, 2)`. A sale does the same split. The character's purse is that net. The treasury is the tax.

`buildCandidates` does not read `taxRate`. The work score is `22 + max(0, 120 - money) * 0.16 + loyalty * 8`, so a purse under 120 makes work more attractive after the tax has already shrunk it. The trade score is commerce, trade skill, cargo room, and a goal bonus. `travelCandidates` and `bestTradeResource` score price spreads and do not subtract the destination rate. The player's quote does: `tradeAmounts` takes the sell-side tax, and the panel prints it. Autonomous captains feel the tax in the purse after the choice, and in the coin gates (`spendableAmount` under 30 refuses a recruit, an unaffordable passage scores −1000, provisions under 2 coins score −1000).

Stability does not read the rate. `produceSettlements` moves it by provision shortage only: `stability - shortage * 0.35`, or `+ 0.03` when the ration is met, clamped to 0–100. Battles subtract their own amounts. Production's worker condition is `0.7 + stability / 100 * 0.3`, times the scenario `production` and the focus multiplier. The base `production` figures are constants. Garrison regrowth reads population, shortage, and garrison. No rebellion, unrest, or desertion event exists under `src/`.

So the material condition that exists today is the purse. A higher rate leaves less in the hand from the same gross, which can push a poor character toward work and can shut a voyage or a recruit when the coins run out. It does not, by itself, lower stability or cut the fields.

### What would be new

No scripted revolt. [Game vision](game-vision.md) says resistance comes from characters, material conditions, opportunities, and player action, and that the simulation does not manufacture rebellions to restore balance.

The later slice that matches systems already in the code is to subtract the destination rate inside `travelCandidates` and `bestTradeResource`, using the net `tradeAmounts` already uses for the player. Captains would then prefer a cheaper port. Sale volume at a high-rate port would fall because the choice changed, which is a material response, and the golden hashes would move. That slice is not the first one.

A stability term keyed off the rate would be new. It would feed the worker condition and the surrender line that already exist, and it would still not be a revolt. It is a worse first hook, because the measured stability and production below do not track the rate, and adding a term would invent a political crisis the shortage path does not have. Leave it out until the Lead asks for it.

### What the sweep showed

Work counts, sale counts, recruits, and captures move with the campaign. They do not step up or down with the rate. Free Tide work events at its ports were 3924 / 4012 / 2865 at the scenario 0.08, and 3018 / 4653 / 3443 when only its rate was 0.20. Sale counts on those same rows were 696 / 609 / 699 and 630 / 625 / 799. Recruits rose with Pax's draw on the high-rate rows (3972 / 3344 / 2429 at 0.08, against 4802 / 4886 / 3961 at 0.20), which fits a holder who spends the extra tax on soldiers. It is one sweep, not a law.

Ending stability on the three faction ports stays in the mid-50s to the low-60s at every rate. Verdant Cay, neutral, ends at 100 on every seed and every rate. Minimum stability is a battle figure: Crown Harbor's minimum on the scenario run is 18.37 / 43.03 / 33.01, and the other rates sit between about 23 and 42, with no line that follows the tax. Summed production (the stock added on `settlement-produced`, all four goods) on the scenario run is Crown Harbor 20213.47 / 20759.31 / 20170.91 and Verdant Cay 23253.53 / 23253.57 / 23253.56. Across every other rate in this note, Crown Harbor stays between 19918.89 and 20854.74, and Verdant Cay stays between 23253.33 and 23253.57. The fields are not answering the tax.

## How an autonomous holder chooses

Pax is the case. The rule is the same for any autonomous holder, including a later one. Mara is human. She is not given this rule. The player command is hers.

Once every 24 ticks, when `world.tick > 0` and `world.tick % 24 === 0`, walk factions by id. If `spendRole` of `commandHolderId` is `"holder"`, and `treasury < freeMateCount * 18`, emit a set to `min(0.30, round(taxRate + 0.01, 2))`. Eighteen is `ticksPerDay * PASSAGE_COST_PER_TICK`, the full daily allowance. The comparison is the same test `memberAllowanceCap` uses for "the treasury cannot pay 18 to every free mate." No `rng.next`. No step down. The acting commander is skipped because `spendRole` is `"member"`.

On the scenario-rate runs, Free Tide first falls below that line at state tick 113 / 377 / 109. World Government never does (minimum treasury 13094.09 / 14843.60 / 12557.73). A rule that only steps on that test therefore has nothing to emit inside the 72-tick window on these three seeds. That is an inference from this baseline. The rule was not implemented, and the fixture was not re-run with it.

Checked in faction-id order, after player commands for that tick, the player's set lands first and the autonomous step sees `taxRateSetTick`.

## Command and event

New command, not a character action. Standing in port, cargo, and the direct-action queue do not apply. Captivity and a battle still refuse it, through the gates `submitCommand` already runs.

```json
{ "playerId": "…", "type": "set-tax-rate", "taxRate": 0.2 }
```

The faction is the player's. A character who is not the free holder is refused `not-command-holder`. A rate off the grid, outside 0.00–0.30, or still inside the 24-tick cooldown, is refused with a stable code. The accepted command emits a new event. It does not queue a pending character action.

New event `tax-rate-set`, rather than a field on `player-command-accepted` or on `worked`. No existing event means "the holder set the rate." `player-command-accepted` only pushes a pending command. A wage event is the wrong carrier for a political write.

```json
{
  "factionId": "world-government",
  "taxRate": 0.2,
  "previousTaxRate": 0.14,
  "taxRateSetTick": 48
}
```

`taxRate` is the absolute the reducer assigns. `previousTaxRate` is the chronicle. The reducer does not add a step to whatever the live rate happens to be. `taxRateSetTick` is `event.tick`, and the reducer stores that number on the faction. The M33 lesson, written up on the ransom allowance and the release record: `WorldStore.recover` replays through `applyEvent` only. A rate written beside `emit` and left off the event is on the next snapshot and gone when recovery starts from an earlier one. Both the rate and the cooldown tick have to be on this event, or derivable from it at apply time. They are on it.

Headless logs never contain the event until a holder sets a rate. Old logs replay as they do today.

`projectFactions` already publishes `taxRate` for every faction, own and rival. The first slice leaves that field. It may also publish `taxRateSetTick` as null while the key is absent. The dashboard projection is not part of `stateHash`.

## Visibility

A rival's rate stays public. Keep it that way.

`projectFactions` sets `taxRate: faction.taxRate` for every row, with the comment that a merchant has to know the rate before sailing. Treasury and power stay null on a rival. The settlement panel's `taxRate` is `settlementTaxRate` of the live holder when the commander is standing there or has no report, and of `knowledge.factionId` otherwise. It reads the faction's current rate. It does not copy a rate onto the knowledge record. A change of rate is visible at once on the faction row, and on any settlement whose displayed faction id is that faction. A stale report still names the old holder, and then shows that holder's current rate. That pairing is the M21 rule. Do not start storing `taxRate` inside knowledge. Writing it from observation would move the hashes, which is why the projection reads the faction instead.

## Free Tide

The lever does not fix the drain. A higher rate gives Pax more to spend, and he spends it. A lower rate reaches 0 sooner.

Holder draws below are Pax's (`character-14`). They equal the whole uncapped column on every Free Tide row. World Government's holder draws are Mara's, and they stay at 0, 12, or at most 27. She is not the drain.

Free Tide, World Government held at 0.14, Free Tide's rate varied. "Zero event" is the `tick` on the first event whose stored treasury is at or below 0. "Zero state" is `world.tick` after the first `runTick` that ended at or below 0. A tick can touch 0 and take tax before it ends, so the event can lead the state tick, and a run can have an event tick with no state tick.

| Rate | Seed | End | Work tax | Sale tax | Ransom | Income | Allowance | Holder | Zero event | Zero state | Ticks at 0 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.04 | 1847 | 0.00 | 2363.68 | 3497.80 | 0.14 | 5861.62 | 3826.29 | 4835.33 | 104 | 116 | 149 |
| 0.04 | 2718 | 62.24 | 2849.77 | 3458.03 | 258.38 | 6566.18 | 5361.62 | 3942.32 | 314 | 519 | 38 |
| 0.04 | 4096 | 11.84 | 2505.65 | 3737.82 | 474.99 | 6718.46 | 3547.26 | 5959.36 | 103 | 301 | 11 |
| 0.08 | 1847 | 24.88 | 5149.45 | 8245.76 | 434.20 | 13829.41 | 7062.12 | 9542.41 | 116 | 117 | 5 |
| 0.08 | 2718 | 7.91 | 5102.45 | 6678.45 | 123.37 | 11904.27 | 8229.96 | 6466.40 | 385 | 597 | 28 |
| 0.08 | 4096 | 41.76 | 3767.55 | 8216.18 | 1103.05 | 13086.78 | 6364.58 | 9480.44 | 165 | 188 | 10 |
| 0.14 | 1847 | 196.13 | 8544.63 | 13471.22 | 257.96 | 22273.81 | 11348.24 | 13529.44 | 141 | 490 | 8 |
| 0.14 | 2718 | 31.25 | 8869.30 | 15799.07 | 704.20 | 25372.57 | 12420.66 | 15720.66 | 219 | 220 | 6 |
| 0.14 | 4096 | 7.48 | 6864.15 | 15234.16 | 216.65 | 22314.96 | 8931.96 | 16175.52 | 93 | 96 | 4 |
| 0.20 | 1847 | 5.17 | 10020.79 | 18028.60 | 122.49 | 28171.88 | 11798.12 | 19168.59 | 326 | — | 0 |
| 0.20 | 2718 | 1257.69 | 14834.20 | 18512.03 | 1080.29 | 34426.52 | 16073.85 | 19894.98 | — | — | 0 |
| 0.20 | 4096 | 423.15 | 11114.70 | 21130.61 | 686.54 | 32931.85 | 12163.97 | 23144.73 | 998 | 999 | 1 |

The 0.08 row is the baseline. The 0.14 row is the same world as "both factions at 0.14", because World Government already uses 0.14. A second run of that pair reproduced the hashes.

At 0.04 the first zero is earlier and the endings are 0.00 / 62.24 / 11.84. At 0.14 the income is about 22,000–25,000 and Pax's draw rises into the same range. Endings stay under 200. At 0.20, seed 2718 never touches 0 and ends at 1257.69, against an opening 2,800, with Pax drawing 19894.98. Seed 1847 touches 0 mid-tick and ends at 5.17. Seed 4096 ends at 423.15 and is at 0 on the last state tick. None of these is the opening fund. The rate changes how much arrives. The uncapped holder decides how much remains.

World Government at its own 0.14 never goes short. Drop both factions to 0.04 and World Government ends at 19.52 / 22.74 / 5.85, first short at state tick 882 / 883 / 932, minimum 11.70 / 5.92 / 4.59. Put both at 0.20 and World Government ends at 22131.96 / 22051.48 / 24751.85, above its opening 18,000. The lever is real for the faction whose holder does not spend the treasury. It is a weak fund for the faction whose holder does.

## Measurement

Headless. `createPrototypeWorld`, then the two `taxRate` fields set before any tick, then 1200 `runTick` calls. No commands. The rate at tick 1200 was the rate that was set. Income is the tax on `worked` and on sold `market-trade`, credited to the faction that held the port, plus `ransom.treasuryShare`. Port holding follows `settlement-claimed`. Draws are `treasuryDrawn`: with `allowanceRemaining` the draw is allowance, without it the draw is the holder's. Purse drawn is the sum of `purseDrawn`. Ending purse is the sum of `character.money`.

### Both factions on one rate

World Government, then Free Tide. End, income, allowance, holder, purse drawn, ending purse, work events, sales, recruits, captures.

| Rate | Seed | WG end | WG income | WG allowance | WG holder | FT end | FT income | FT allowance | FT holder | FT zero event |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.04 | 1847 | 19.52 | 7986.88 | 25949.36 | 18.00 | 43.57 | 5847.17 | 4514.95 | 4088.65 | 106 |
| 0.04 | 2718 | 22.74 | 6445.47 | 24410.73 | 12.00 | 18.34 | 8409.21 | 5158.31 | 6032.56 | 174 |
| 0.04 | 4096 | 5.85 | 7490.56 | 25484.71 | 0.00 | 15.52 | 6145.87 | 3258.30 | 5672.05 | 90 |
| 0.08 | 1847 | 2035.33 | 15056.99 | 31009.66 | 12.00 | 500.57 | 12188.40 | 9038.22 | 5449.61 | 199 |
| 0.08 | 2718 | 3513.32 | 18098.09 | 32584.77 | 0.00 | 836.71 | 10360.11 | 7174.55 | 5148.85 | 152 |
| 0.08 | 4096 | 2743.44 | 14901.30 | 30130.86 | 27.00 | 19.35 | 11164.35 | 5197.62 | 8747.38 | 86 |
| 0.14 | 1847 | 11555.44 | 22659.75 | 29092.31 | 12.00 | 196.13 | 22273.81 | 11348.24 | 13529.44 | 141 |
| 0.14 | 2718 | 8408.80 | 19425.61 | 28995.81 | 21.00 | 31.25 | 25372.57 | 12420.66 | 15720.66 | 219 |
| 0.14 | 4096 | 12196.53 | 24351.44 | 30133.91 | 21.00 | 7.48 | 22314.96 | 8931.96 | 16175.52 | 93 |
| 0.20 | 1847 | 22131.96 | 35812.18 | 31665.22 | 15.00 | 4878.53 | 31351.93 | 12664.08 | 16609.32 | 150 |
| 0.20 | 2718 | 22051.48 | 32406.53 | 28340.05 | 15.00 | 29.69 | 32645.12 | 12889.91 | 22525.52 | 620 |
| 0.20 | 4096 | 24751.85 | 37328.24 | 30555.39 | 21.00 | 83.32 | 27656.18 | 9753.89 | 20618.97 | 194 |

Income in that table is work tax plus sale tax plus ransom. The split:

| Run | Seed | WG work | WG sale | WG ransom | FT work | FT sale | FT ransom |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| scenario 0.14/0.08 | 1847 | 6922.78 | 16675.29 | 798.20 | 5149.45 | 8245.76 | 434.20 |
| scenario 0.14/0.08 | 2718 | 7574.92 | 17836.28 | 723.53 | 5102.45 | 6678.45 | 123.37 |
| scenario 0.14/0.08 | 4096 | 9123.30 | 16927.72 | 362.94 | 3767.55 | 8216.18 | 1103.05 |
| both 0.04 | 1847 | 1942.32 | 5125.10 | 919.46 | 1987.14 | 3332.67 | 527.36 |
| both 0.04 | 2718 | 1665.94 | 3689.59 | 1089.94 | 2784.14 | 4430.78 | 1194.29 |
| both 0.04 | 4096 | 2072.95 | 5224.51 | 193.10 | 2066.44 | 3672.84 | 406.59 |
| both 0.08 | 1847 | 3666.11 | 9439.56 | 1951.32 | 4230.63 | 7739.34 | 218.43 |
| both 0.08 | 2718 | 4232.99 | 12254.04 | 1611.06 | 3731.22 | 6085.51 | 543.38 |
| both 0.08 | 4096 | 4661.85 | 9706.59 | 532.86 | 3901.41 | 6745.93 | 517.01 |
| both 0.14 | 1847 | 6832.39 | 15566.36 | 261.00 | 8544.63 | 13471.22 | 257.96 |
| both 0.14 | 2718 | 4876.69 | 14281.79 | 267.13 | 8869.30 | 15799.07 | 704.20 |
| both 0.14 | 4096 | 7479.26 | 15827.07 | 1045.11 | 6864.15 | 15234.16 | 216.65 |
| both 0.20 | 1847 | 9137.53 | 26451.52 | 223.13 | 10958.30 | 20280.80 | 112.83 |
| both 0.20 | 2718 | 8971.41 | 22608.84 | 826.28 | 13097.11 | 18693.13 | 854.88 |
| both 0.20 | 4096 | 12399.07 | 23920.58 | 1008.59 | 9842.89 | 17423.41 | 389.88 |

Draws are the allowance column plus the holder column. Free Tide at 0.20 on seed 1847 ends at 4878.53 because that campaign left Free Tide holding Crown Harbor. The same rate on 2718 and 4096 ends at 29.69 and 83.32. A high rate plus the big port can leave a balance. It is not what the other two seeds do.

Work, sales, recruits, captures, and the purse, both factions. Work and sales are events at that faction's ports. Recruits and captures are that faction's members.

| Rate | Seed | WG work | WG sales | WG recruits | WG captures | WG purse | FT work | FT sales | FT recruits | FT captures | FT purse |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.04 | 1847 | 2929 | 849 | 3636 | 4 | 60656.65 | 2996 | 612 | 2827 | 12 | 34068.98 |
| 0.04 | 2718 | 2601 | 618 | 4774 | 6 | 43782.02 | 4384 | 816 | 3800 | 5 | 30094.80 |
| 0.04 | 4096 | 3152 | 850 | 4604 | 3 | 48294.19 | 3156 | 658 | 2344 | 3 | 56898.58 |
| 0.08 | 1847 | 2749 | 736 | 4336 | 4 | 61214.29 | 3192 | 686 | 3734 | 15 | 24132.48 |
| 0.08 | 2718 | 3330 | 956 | 3649 | 3 | 63828.15 | 2988 | 555 | 3013 | 14 | 35207.71 |
| 0.08 | 4096 | 3551 | 786 | 4798 | 6 | 37767.71 | 3007 | 625 | 2886 | 7 | 47461.56 |
| 0.14 | 1847 | 2968 | 747 | 4865 | 3 | 39881.23 | 3701 | 701 | 4268 | 3 | 24396.45 |
| 0.14 | 2718 | 2214 | 677 | 4774 | 8 | 37850.96 | 3962 | 796 | 3862 | 4 | 35576.38 |
| 0.14 | 4096 | 3257 | 750 | 4420 | 8 | 24143.28 | 3005 | 792 | 3179 | 9 | 35524.84 |
| 0.20 | 1847 | 2774 | 839 | 3328 | 2 | 53749.75 | 3332 | 702 | 4562 | 3 | 22426.39 |
| 0.20 | 2718 | 2806 | 719 | 4470 | 7 | 40457.10 | 4152 | 614 | 4662 | 5 | 25655.27 |
| 0.20 | 4096 | 3799 | 762 | 4533 | 10 | 29485.49 | 3029 | 655 | 3632 | 8 | 32018.80 |

Purse here is the ending sum of member money. Purse drawn, which is what left purses during the run, is larger. On the baseline it is World Government 77818.91 / 79728.22 / 81100.40, Free Tide 65400.58 / 57188.73 / 58930.46, and unaffiliated 54601.60 / 50462.75 / 60621.11. Those three columns sum to 197821.09 / 187379.70 / 200651.97.

Ports at tick 1200. Verdant Cay is neutral on every row.

| Run | Seed | Crown Harbor | Cinder Key | Glassport |
| --- | ---: | --- | --- | --- |
| scenario 0.14/0.08 | 1847 | Free Tide | World Government | World Government |
| scenario 0.14/0.08 | 2718 | Free Tide | World Government | Free Tide |
| scenario 0.14/0.08 | 4096 | World Government | World Government | Free Tide |
| both 0.04 | 1847 | Free Tide | Free Tide | World Government |
| both 0.04 | 2718 | Free Tide | Free Tide | World Government |
| both 0.04 | 4096 | Free Tide | World Government | Free Tide |
| both 0.08 | 1847 | World Government | Free Tide | Free Tide |
| both 0.08 | 2718 | Free Tide | World Government | Free Tide |
| both 0.08 | 4096 | World Government | Free Tide | World Government |
| both 0.14 | 1847 | Free Tide | Free Tide | World Government |
| both 0.14 | 2718 | Free Tide | Free Tide | World Government |
| both 0.14 | 4096 | Free Tide | Free Tide | World Government |
| both 0.20 | 1847 | Free Tide | World Government | World Government |
| both 0.20 | 2718 | World Government | World Government | Free Tide |
| both 0.20 | 4096 | Free Tide | World Government | Free Tide |
| Free Tide 0.04 | 1847 | Free Tide | World Government | World Government |
| Free Tide 0.04 | 2718 | Free Tide | Free Tide | World Government |
| Free Tide 0.04 | 4096 | World Government | Free Tide | Free Tide |
| Free Tide 0.20 | 1847 | Free Tide | World Government | World Government |
| Free Tide 0.20 | 2718 | World Government | World Government | Free Tide |
| Free Tide 0.20 | 4096 | World Government | Free Tide | Free Tide |

Scenario behavior, for the row the both-factions table does not repeat. World Government work 3029 / 3370 / 4005, sales 771 / 843 / 768, recruits 4475 / 4851 / 4009, captures 4 / 2 / 5, ending purse 52623.89 / 43804.34 / 43762.63. Free Tide work 3924 / 4012 / 2865, sales 696 / 609 / 699, recruits 3972 / 3344 / 2429, captures 10 / 9 / 3, ending purse 26090.23 / 35693.66 / 52780.61.

Ending garrison on the scenario run is Crown Harbor 12 / 16 / 8, Verdant Cay 103 / 103 / 103, Cinder Key 11 / 5 / 6, Glassport 7 / 7 / 8. Garrison is a battle-and-regrowth figure. It was recorded and does not track the tax. The other rates' garrisons were recorded in the same harness and were not copied into this table.

1200-tick hashes for the sweep:

| Run | 1847 | 2718 | 4096 |
| --- | --- | --- | --- |
| both 0.04 | `324f5a17ad6f583a4f2047adcaea6dcef3d7c7e07bda9bf2cf3d5f5c5dbfe6be` (156832) | `de54b60df869f0b8d402cb5d3badf086bd410861abf88ac93ac85937c4df9f62` (162385) | `9bf8b8ef905ad596de77d4e9e5c9bb2b43487dc0af4f751e237e12609eb1a8f4` (163620) |
| both 0.08 | `75d67af2a86bbcf318cb0c07b799d891fc16666b42eec9bda47a06c72b7559c7` (158164) | `99196aa9a3d45948a202b364c9e855eaa8cc8804baebeedb6f78f9ebf45b9ea5` (157593) | `59c7fac93e78858604f05c222e50fbd650348f646b8cad099ff3fc1f940f283d` (163186) |
| both 0.14 | `2f86f46c37477f03796441ad5f07bf8bebf7ba7c3c0241f92eeaccd2e33448a7` (166006) | `7207f0f00b1d0be2cb778210508e4f03a1a726f4999c0bcac1c2b01e98ed98ee` (161285) | `ba8ad08aeb7ae1dde0b25478edf86ec23a6fccde1f8128dc51677cf5984af7c2` (159410) |
| both 0.20 | `421d7a04c1345cba8a55ee7bee3e3330d6368e6c8905d4cb00cd29e3289e54de` (162385) | `abb8386726a123d3c3118539046da221111eb02ccf6c20154cd5f3d5101dfd82` (166298) | `62fb1b3ff37dcc70b0e635b8a7525803d9e9f05b02bd562a65cfa04367451c40` (161665) |
| Free Tide 0.04 | `62ff3afabc5dd78aea318cec3b869bfaaf6bf8786e321fa40f32b76518319df9` (161814) | `5b5f8b6f2542f47cd08433096fca4fafa02ae410b88fc650cbcb0dde15a84ae5` (167027) | `95ccde3697b39975ef4dc41807fbf602faf2021584126f6aefd5f0cba65152e7` (161317) |
| Free Tide 0.20 | `ee842e43ee3faad645b8856a998033ffdc1cb5da457548f519e9a97e404f064d` (163921) | `4f43aee2e7e691ccbd9f5182ce4bf0107fe8b2c2e31f5a4f7ab582b200a3fc66` (165017) | `cdb3901d70732dc0036d18a57f2c94eb59937ae54a32227d1980afeeafc31459` (160030) |

Parentheses are event counts. Free Tide at 0.14 reproduced the both-0.14 hashes and counts.

## Slices

**Slice 1, hash-neutral.** `taxRate` is already on `Faction`, set in `createPrototypeWorld` to 0.14 and 0.08, and `projectFactions` already publishes it. This slice adds `set-tax-rate`, the `tax-rate-set` reducer, and `taxRateSetTick` omitted until a set. No autonomous writer. A headless run emits no new event and adds no field, so the 72-tick fixture and the 1200-tick baseline are expected to stay on the hashes above. That expectation was not re-measured with the slice compiled in.

**Slice 2, the autonomous step.** The 24-tick rule above. Expected to leave the 72-tick fixture unchanged on these seeds, because the first shortfall is state tick 113 / 377 / 109 and World Government never qualifies. Expected to move the 1200-tick hashes once Free Tide steps. Not measured. A step-down rule would be a different slice and would be able to fire while the treasury is rich, including inside 72 ticks.

**Slice 3, merchants read the rate.** Subtract the destination rate in `travelCandidates` and `bestTradeResource`. Expected to move the 72-tick hashes, because those scores run from the first ticks. Not measured. This is the resistance hook that uses a calculation the player already has. It is still not a revolt.

Out of these slices: a stability penalty, a rebellion event, and a cap on the holder's draw. The last one is the treasury-balance decision, which kept the holder uncapped.

## Questions for the Lead

The Lead rules on these against [game vision](game-vision.md). Defaults are what this brief would build.

1. **During a regency, who sets the rate?** Default: nobody. The free holder is the only writer. The acting commander leaves the rate where the holder set it. The cover already has that limit in the world-simulation note and the political-layer note.

2. **What may the number be?** Default: `0.00` through `0.30` in steps of `0.01`. Mara names an absolute, so one command can move 0.14 to 0.20. The autonomous rule moves a single step. The ceiling is a prototype guard on "sets the rate freely."

3. **How often?** Default: 24 ticks, four days, shared by the player and the autonomous step. A repeat of the current rate is refused.

4. **Does Pax move his own rate?** Default: yes, in slice 2, and only upward, and only when the treasury cannot pay 18 to every free mate. No random draw. No step down. He does not run the rule while captive, and the person covering the seat does not run it either.

5. **Does a high rate stir the port?** Default: the purse takes `gross - tax`, which it already does. Slice 3 lets autonomous captains price that in, the way the player's quote already does. Stability, production, and the garrison stay on the shortage and battle rules. There is no rebellion event.

6. **Can a rival read the rate?** Default: yes. It is already on the faction row and on the settlement panel. Treasury and power stay hidden. The rate is not copied onto the knowledge record.

7. **Does Free Tide's empty treasury block the lever?** Default: no. The lever says who is paid. It does not leave a standing fund while the holder is uncapped. A fund would be a spending rule. The treasury-balance note kept that holder uncapped, and this sweep agrees with that result.
