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

## Addendum: tax and stability (slice 2)

The Lead's later ruling is the slice order this section uses. Slice 1 stays the command, the `tax-rate-set` event, and `taxRateSetTick`. That command is not in this tree: nothing under `src/` writes `taxRate` after `createPrototypeWorld`. Slice 2 is the drift. Slice 3 is the autonomous choice, and it may lower the rate as well as raise it. The drift reads the rate already stored on the faction. A headless run still emits no `tax-rate-set`.

The drift applies to each settlement whose `factionId` is set, on the stability write inside `produceSettlements`. The holder is whoever holds the port on that tick, so a claim starts the new rate on the next peaceful upkeep. A neutral port adds zero. An active battle still skips the settlement, which is the existing cadence: every peaceful upkeep, six in a world day that stays peaceful. The Lead has ruled this drift graded. The flat `0.03` above `0.15` is withdrawn. The threshold stays `0.15`. A rate at or below it subtracts zero. There is no separate recovery for a low rate.

Above the threshold the subtraction is `0.03` per band of `0.05`. The count is integer hundredths: `bands = ceil((rate*100 - 15) / 5)` when `rate > 0.15`, and `0` otherwise, with `rate*100` taken as the nearest integer. `taxDrift` is `bands * 0.03`. Rates `0.16` through `0.20` subtract `0.03`, `0.21` through `0.25` subtract `0.06`, and `0.26` through `0.30` subtract `0.09`.

It sits in the expression the upkeep already rounds, after the same clamp to 0–100, at the same 3 digits:

```text
stability - shortage * 0.35 + (shortage === 0 ? 0.03 : 0) - taxDrift
```

Immediate battles still subtract 12 or 3, and a phase still subtracts 4 or 1, on their own events. The claim floor of 55 is unchanged. One band cancels the fed `+ 0.03`, and at uniform `0.20` Crown Harbor ends at 55 on every seed. Two bands leave a net `−0.03` on a fed tick, and three bands leave a net `−0.06`, so those endings sit below the floor. A shortage still subtracts `shortage * 0.35`.

Measured on `6aec8f6750311a206e3479dd952e583bdcf85c3b`, whose simulation is `c2a812d8c3c3280931069db00f92839c1dd2f6fe`, Node v24.21.0, ICU 78.3, after `npm test` passed 358 tests. The harness was local and was not left in the tree. Seeds 1847 / 2718 / 4096. Production is the stock added on `settlement-produced`, four goods, at 2 decimals. Stability samples are the state after each tick. Crown Harbor's penalized provisions fall under the ration of 5 below stability `69.696`. Ticks at or below 30 are the surrender line while the garrison is still 15 or more. The scenario baseline already spends 788 / 582 / 907 ticks under that production line. No run in this grid emits `settlement-shortage`. Verdant Cay stays neutral, ends at 100, and its production stays `23250.80` (`23250.79` on the graded `0.30` seed 4096 row).

Hash-neutral. Scenario rates `0.14` / `0.08`, uniform `0.15`, and uniform `0.04` sit at or below the threshold, so drift upkeeps are 0. Each graded run matches its unpatched same-rate run on the full state hash and the event count, at 72 ticks and at 1200. The scenario pair is the fixture in the tables above: 72-tick `4ea893a4` / `d376ad02` / `ac780b39` (8413 / 8456 / 8261) and 1200-tick `90dacc2d` / `226bf625` / `30e99943` (160268 / 161850 / 162459). Uniform `0.04` at 1200 ticks is the both-0.04 row above. Uniform `0.15` is its own unpatched world: 72-tick `f87f8b518abae0bb0a0118ab361d3426fc98c825b478669d166fce9212538b96` / `493c36b8a6aa8acec8f9313c48b1c00d98e57134caf7a7e6926dfc4bfae2004b` / `e3b7d0951ee69e6cc2a9ff4f17d13602d1a8c89abccf79c1ff566acc3f67f630` (8429 / 8497 / 8363) and 1200-tick `d39a6d3e0839135f1597168fcf70df040a548527e7797decceb6502a2abb12c6` / `ad8050ed024308232228dd0edd0d37faf628fee0a1cf0574284a8c0eac5e1dc5` / `cdefc6dcf74a51bb8df653dcff38a1abf5c06793cc4e6bb5fba6ff2d260861ff` (161637 / 163916 / 164794).

At uniform `0.20` the subtraction is one band, `0.03`. The 72-tick hashes are `d769fad93ec13e6d8433c4dbd9312d823f2dc587d8d9e59ad18de6e0fa32fe8c` / `3eadce5cb55c4219307c84696e870dfd0896c77e67cc5a4bb4f3af2f8d60c168` / `9944405fed3c7775dcb0912278fdcf1e197820a7f38cfed79cf9d7a960f2998d` (8410 / 8520 / 8419; deltas 0 / 0 / −41) and the 1200-tick hashes are `b673a14b4f778ed274f49bf07d28155450da002fc190dc587b0acfa408640383` / `59b64c2c2f1b5688864e271999460927ee9bb74c38f92b07ae8dda1d61791097` / `32a33d81903c304c2ad88f9e84fdbef0d40ac5a6fbf4c405c5b9cdfc36ecc7ea` (159357 / 162646 / 161975; deltas −3028 / −3652 / +310).

At uniform `0.25` the subtraction is two bands, `0.06`. The 72-tick hashes are `a8d6e0ff75778d9fe75f02c431bb1caf2b1eaa6b425d5e6776a65fc631d7fa60` / `a8547302d4f090be869ce6dc51e4130d73b4aec1f38dc2c8ea0bb3a19093e159` / `42f276f8ebab118f7ad723f182ed773d67f56f9adf92a77a5a2f25fd2e625014` (8145 / 8460 / 8424; deltas +3 / −45 / −7) and the 1200-tick hashes are `bf9beaff143b1597f0eeffe18a313f7a11591819f5d52afbb1ee6afe871776ce` / `f41237b9d09bfa43d700582608a0ce226af792202ef18a3043dd8619a0b450a9` / `12312cc5076146cb645a4a83393684c1cc8e5d445e973c9aa59ad00622ae8cca` (156588 / 161537 / 161793; deltas −5237 / −1510 / −1446).

At uniform `0.30` the subtraction is three bands, `0.09`. The 72-tick hashes are `91348423ece8820956dfc7fd15e339114517d42ee26beb132bd61391b0ee031f` / `c1fc6d7f051b2bd8de2d007709360330954c9a2a3aea8843e82e94a736c508b4` / `34cf73cefc7c0d5189c31bb2ccee9881a49d70fea34aecb170669a9201b534e8` (8260 / 8269 / 8242; deltas −2 / +11 / −77) and the 1200-tick hashes are `158ed308d86962f5debe8c4899f0f6a08283642eca2fb577ad612fe499668403` / `57a5c8f08054ffab72f10f0aca8fd5473eca8d36a6435d7e1153f628ac7fcd1a` / `3868ddf29139794ee6bba628224246ee8b17316610496c7e18159338b16f50f8` (163978 / 162059 / 163912; deltas +907 / +1293 / −1537). Crown Harbor's production against the unpatched same-rate run changes by −25.07 / −117.97 / −13.04 at `0.20`, −197.56 / −609.54 / −235.69 at `0.25`, and −712.89 / −705.39 / −2199.04 at `0.30`. The `0.30` seed 4096 case is the outlier on the unpatched side: that port stays at 100 (minimum 80.61, production 22130.23) until the three-band drift pulls it down.

Slice 3 weighs a cost the flat rule did not grade. Work tax plus sale tax, each graded band against the graded band below it:

From `0.15` to `0.20`, World Government gains 8402.14 / 8372.15 / 10651.49 and Free Tide gains 9456.34 / 9956.63 / 5229.43. Crown Harbor's minimum goes 36.72 → 10, 87.06 → 28, 32.32 → 33. Ticks under `69.696` change by +149 / +952 / +25, from 732 / 0 / 1069. Ticks at or below 30 change by +12 / +1 / 0. Production changes by −289.83 / −2369.05 / −59.73. Seed 2718 spends a healthy port: ending stability 99.09 falls to 55, and the production line goes from 0 ticks under it to 952.

From `0.20` to `0.25`, World Government gains 9971.86 / 9424.66 / 10629.35 and Free Tide gains 5604.64 / 3652.60 / 6316.64. Minimums go 10 → 8.75, 28 → 0, 33 → 29.24. Ticks under the production line change by +10 / −6 / +23. Ticks at or below 30 change by +27 / +59 / +1. Production changes by −24.50 / +199.57 / −188.87. On 2718 that production rise comes with a minimum of 0 and 60 ticks at or below 30. Free Tide's gain on that seed is 3652.60.

From `0.25` to `0.30`, World Government gains 7380.11 / 2909.53 / 11089.71 and Free Tide gains 9230.81 / 12843.92 / 9814.37. Minimums go 8.75 → 0, 0 → 1.84, 29.24 → 22. Ticks under the production line change by +128 / +99 / −23. Ticks at or below 30 change by +221 / −45 / +2. Production changes by −508.53 / −422.03 / −42.48. World Government on 2718 gains 2909.53, the smallest step in the grid, against 99 more ticks under the ration line and 422.03 less production, with the minimum already on the floor. Seed 1847 spends 260 ticks at or below 30, up from 39.

Lowering is sometimes worth it. Every step in this grid still raises work-plus-sale tax on both factions, so a holder who is pricing the treasury keeps the higher band. A holder who is pricing the port sometimes prefers the lower one. Staying at `0.15` leaves seed 2718's Crown Harbor at an ending 99.09. At `0.20` that port ends at 55 with a minimum of 28, and at `0.25` the minimum is 0. Stopping at `0.25` leaves World Government's thinnest step, 2909.53 on 2718, untaken, and leaves seed 1847 at 39 ticks at or below 30. The campaign moves with the rate, so these are measured differences between uniform rates. They are the comparisons a one-step autonomous rule would be choosing among.

Crown Harbor under the graded drift, threshold `0.15`. Tax is work plus sale. Prod Δ is against the unpatched same-rate run.

| Rate | Seed | End | Min | Ticks <69.696 | Ticks ≤30 | Prod Δ | WG treasury | WG tax | FT treasury | FT tax |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.20 | 1847 | 55 | 10 | 881 | 12 | −25.07 | 25523.78 | 35455.69 | 64.17 | 31278.88 |
| 0.20 | 2718 | 55 | 28 | 952 | 1 | −117.97 | 24698.14 | 36052.40 | 658.64 | 29770.25 |
| 0.20 | 4096 | 55 | 33 | 1094 | 0 | −13.04 | 25650.68 | 35871.40 | 161.82 | 26554.02 |
| 0.25 | 1847 | 54.76 | 8.75 | 891 | 39 | −197.56 | 34563.69 | 45427.55 | 5001.01 | 36883.52 |
| 0.25 | 2718 | 53.29 | 0 | 946 | 60 | −609.54 | 34286.73 | 45477.06 | 821.76 | 33422.85 |
| 0.25 | 4096 | 53.08 | 29.24 | 1117 | 1 | −235.69 | 33548.05 | 46500.75 | 1544.52 | 32870.66 |
| 0.30 | 1847 | 51.82 | 0 | 1019 | 260 | −712.89 | 43102.34 | 52807.66 | 13315.36 | 46114.33 |
| 0.30 | 2718 | 53.74 | 1.84 | 1045 | 15 | −705.39 | 35978.44 | 48386.59 | 6904.04 | 46266.77 |
| 0.30 | 4096 | 51.82 | 22 | 1094 | 3 | −2199.04 | 46737.85 | 57590.46 | 5818.10 | 42685.03 |

## Addendum: autonomous rate choice (slice 3)

The free command holder chooses the faction's next rate. Slice 1 is already in this tree: `set-tax-rate`, the `tax-rate-set` reducer, and `taxRateSetTick`. Slice 2 is not. `produceSettlements` still has no tax term. The harness subtracted the graded drift above on each faction-held peaceful upkeep, then let the holder step the rate. The harness was local and was not left in the tree.

Measured on `778f1e86251dfdefaec0e5f7706b5c04c4701a5c`, Node v24.21.0, ICU 78.3, after `npm test` passed 368 tests. Seeds 1847 / 2718 / 4096, 1200 ticks, no player commands. A drift-only control, choice off, reproduced the scenario hashes at 72 and at 1200, and Crown Harbor's 788 / 582 / 907 ticks under the ration line, minimum 18.37 / 43.03 / 33.01.

The check is the slice 1 clock. On tick `t > 0` with `t % 24 === 0`, after player commands, walk factions by id. The writer is the free command holder: `spendRole` is `"holder"`. The acting commander is `"member"` and stays out. A captive holder stays out. A missing `taxRateSetTick` means the rate has never changed. A tick still inside `taxRateSetTick + 24` waits. The same-rate case emits nothing.

The step is one cent. Rates are integer hundredths, clamped to `0` through `30`. A step of `0.05` would leave `0.14` for `0.19` and `0.16` for `0.11`, so the holder could not stop on `0.15`, the last rate with zero drift and a closed secession gate. Free Tide's floor-55 path sits on `0.15`, `0.16`, and `0.17`. The band step was not run.

The press is the live lowest stability among ports the faction holds, in thousandths. The ration count is a result, kept off the rule. It is not a field on the world, and the drift-only control already spends 788 / 582 / 907 ticks under Crown Harbor's line, so a window of those ticks would press most checks. Treasury pressure is the allowance test in whole cents: `mates > 0` and `round(treasury * 100) < mates * 1800`. Eighteen is one day of passage. When the port is pressed and the treasury is short, the rate goes down. The other order was not run.

```text
cents = round(taxRate * 100)
lowest = minimum of round(stability * 1000) over held ports
pressed = a port is held and lowest <= floor * 1000
short = mates > 0 and round(treasury * 100) < mates * 1800
next = cents - 1    when pressed and cents > 0
       cents + 1    when not pressed and short and cents < 30
       cents        otherwise
```

Emit `tax-rate-set` only when `next !== cents`. The rate on the event is `next / 100`. The reducer writes that absolute. These runs let every free holder choose, including Mara Vane. Every event in the grid is hers (`character-01`) or Pax Ash's (`character-14`).

The three floors are 55, 65, and 75. End is the rate at tick 1200. Range is the minimum and maximum end-of-tick rate. Mean is that rate averaged over the 1200 ticks. Sets is the number of `tax-rate-set` events. Low is the lowest stability among ports that faction holds at tick 1200. Crown min is Crown Harbor's lowest stability after any of those ticks. Under is how many of the 1200 ticks Crown Harbor's penalized provisions fall below its ration. Gate is port-ticks with an owner, a holding rate above 0.15, and stability at or below 55. Spells are ownership spells that contain at least one such tick.

| Floor | Seed | WG end | WG range | WG mean | WG sets | WG treasury | WG low | FT end | FT range | FT mean | FT sets | FT treasury | FT low | Crown min | Under | Gate | Spells |
| ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 55 | 1847 | 0.08 | 0.08–0.14 | 0.1046 | 6 | 8928.22 | 54.45 | 0.16 | 0.08–0.17 | 0.1464 | 32 | 32.65 | 55.72 | 41.39 | 816 | 246 | 15 |
| 55 | 2718 | 0.11 | 0.11–0.14 | 0.1216 | 3 | 10797.01 | 55.78 | 0.16 | 0.08–0.17 | 0.1222 | 26 | 673.57 | 56.64 | 34.52 | 660 | 103 | 7 |
| 55 | 4096 | 0.14 | 0.14–0.14 | 0.1400 | 0 | 14514.91 | 55.99 | 0.17 | 0.08–0.20 | 0.1552 | 37 | 34.02 | 55.66 | 33.07 | 865 | 333 | 9 |
| 65 | 1847 | 0.00 | 0.00–0.14 | 0.0266 | 14 | 0.09 | 55.99 | 0.00 | 0.00–0.08 | 0.0160 | 8 | 0.00 | 56.08 | 39.59 | 370 | 0 | 0 |
| 65 | 2718 | 0.03 | 0.00–0.14 | 0.0528 | 19 | 50.98 | 51.72 | 0.00 | 0.00–0.08 | 0.0210 | 12 | 0.00 | 55.81 | 49.53 | 45 | 0 | 0 |
| 65 | 4096 | 0.00 | 0.00–0.14 | 0.0464 | 16 | 0.11 | 57.46 | 0.00 | 0.00–0.08 | 0.0096 | 12 | 0.00 | 57.25 | 75.08 | 0 | 0 | 0 |
| 75 | 1847 | 0.00 | 0.00–0.14 | 0.0264 | 16 | 0.00 | 56.29 | 0.00 | 0.00–0.08 | 0.0080 | 12 | 0.00 | 56.68 | 41.71 | 687 | 0 | 0 |
| 75 | 2718 | 0.00 | 0.00–0.14 | 0.0402 | 14 | 0.00 | 55.03 | 0.00 | 0.00–0.08 | 0.0100 | 8 | 0.00 | 55.27 | 31.54 | 403 | 0 | 0 |
| 75 | 4096 | 0.00 | 0.00–0.14 | 0.0320 | 14 | 0.00 | 56.68 | 0.00 | 0.00–0.08 | 0.0072 | 8 | 0.00 | 56.47 | 24.13 | 1053 | 0 | 0 |

**Recommend floor 55.** It is `CLAIM_STABILITY_FLOOR`, and it is the secession line. World Government only lowers, 6 / 3 / 0 times, and ends at 0.08 / 0.11 / 0.14 with the treasury still funded. On 4096 she never sets. Free Tide raises and lowers, 20 and 12, 17 and 9, 23 and 14, and ends at 0.16 / 0.16 / 0.17. Floors 65 and 75 end at 0.00, except World Government on 2718 at floor 65, which ends at 0.03. Those rates stay at or below the opening 0.14 and 0.08, so the gate count is 0. Free Tide's treasury on those six rows is 0.00. World Government ends at 0.09 / 50.98 / 0.11 on floor 65 and at 0.00 on floor 75. Floor 75 on seed 4096 spends 1053 ticks under the ration line, above the drift-only 907.

Floor 55 does reach the gate, on every seed. Port-ticks 246 / 103 / 333, world ticks 221 / 103 / 331, spells 15 / 7 / 9. Owners on 1847: Bram Tern, Corin Hale, Finn Frost, Mina Vale, Pax Ash, Zara Gale. On 2718: Corin Hale, Mina Vale, Pax Ash, Zara Gale. On 4096: Corin Hale, Esme Dusk, Mara Calder, Mina Vale. Pax Ash accounts for one tick on each of the first two seeds. Of the gate port-ticks, 160 / 99 / 212 also have the owner present, free, in the holding faction, and not the command holder.

Floor 55 leaves the 72-tick fixture where it is: `4ea893a4` / `d376ad02` / `ac780b39` (8413 / 8456 / 8261). The first `tax-rate-set` is tick 120 (Free Tide) on 1847, tick 216 (World Government) on 2718, and tick 120 (Free Tide) on 4096. The 1200-tick hashes move. Floor 65 fires inside the window, at tick 48, and the 72-tick counts become 8414 / 8457 / 8262. Floor 75 fires at tick 24, and those counts become 8416 / 8472 / 8242.

| Floor | 72 ticks, 1847 | 2718 | 4096 |
| --- | --- | --- | --- |
| 55 | fixture, 8413 | fixture, 8456 | fixture, 8261 |
| 65 | `ad1422af1cc77d3c250f5402c0b0e1749bdbe3f26575da0a76995b4f8bbef2d5` (8414) | `0793e263f93b9faf175292d76c6562d4b63da305fa4d3bc62593a127d46b74bf` (8457) | `f780c3abc599f2d6011990e601fa2aab950dcb484e90ea16914938f58024c105` (8262) |
| 75 | `092a4a5d86df1653124681fa72b814c1d9ef785c4cd9b209ca2750a5ab94348c` (8416) | `424ae33687303b2dd16f3846c15cc56a6503f7efa4364c8306f723c4d87566ca` (8472) | `cb9efaa9d9742202da43faaa1336ae7f58a3f499da3d2e55f526c992d8313133` (8242) |

| Floor | 1200 ticks, 1847 | 2718 | 4096 |
| --- | --- | --- | --- |
| 55 | `28866eb80bd48798c78791dd8f0c4093b9ffecfb8009421db7dd2c109d4f1e47` (161658) | `712b60edc75c313f17e774951f43aa84fcd487fbc29c422215cd602b19665be8` (161613) | `b0ac72fe452697010e58570136737e4dd8ed12770a2e86863bfdaa76ee07e114` (162327) |
| 65 | `3fb634e902951dee7d30ffd16b1d4adf375c22e6f1480d9ec1036af5e03125bd` (158814) | `cf2ba73c9be2c11450b8fa6313f0153f2055b1dcde26e3dc80d621a86432696e` (164292) | `e894fa0e1d7bd35cb4ed9c95de1a0379c5c17ea451272c407b597baf09ad3fa4` (166045) |
| 75 | `bf7107a2ad806ed491a462dca90114d2e480659e0a9ab99cd461edc38656f9d2` (161544) | `6703b74cd0ad65c1808480c2f800fed7dcd3f3d1a6c3c12d2b62bf0244571622` (165261) | `cc0288e235d37d31317291eb53a8636d674d1cb64a8725c304d639c14dbdd32c` (164493) |

## Questions for the Lead

The Lead rules on these against [game vision](game-vision.md). Defaults are what this brief would build. The table above is the headless reading, both seats choosing.

1. **What is the step?** Default: one cent, `0.01`, clamped to `0.00`–`0.30`. The holder can stop on `0.15`. A band of `0.05` was not run.

2. **Which floor presses the rate down?** Default: `55`. It is the claim floor and the secession line. Floors `65` and `75` drain the treasury on these seeds: Free Tide ends at 0.00, and World Government ends at 50.98 or below. The rate still rises when every held port is above the floor and the treasury cannot pay 18 to every free mate.

3. **When the port is pressed and the treasury is short, which way does the cent go?** Default: down. The measured rule does that. Raising in that case was not run.

4. **Does the ration line in the last 24 ticks press the rate too?** Default: no. The rule reads the live lowest stability. The drift-only control already has Crown Harbor under its line for 788 / 582 / 907 ticks.

5. **Does Mara's seat run it?** Default: a live session skips a holder whose `controller.kind` is `"human"`. She uses `set-tax-rate`. A headless run lets every free holder choose, including her, and the hashes above are that run. The live exclusion was not given its own 1200-tick hashes. On floor 55 the first set is outside the 72-tick window on every seed, so that fixture stays either way. The acting commander runs it in neither case.
