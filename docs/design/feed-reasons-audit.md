# Feed reasons audit: hand-graded sample of the live runs

Status: **Done / audit.** Base main `df99aff` (#162). No API calls were made.

## 1. Source

**The reasons.** The 589 live reasons are in the Engineer's run directories on the box, not in the repo:
- `/tmp/fr/live-1847/reasons.jsonl` (152)
- `/tmp/fr/live-2718/reasons.jsonl` (109)
- `/tmp/fr/live-4096/reasons.jsonl` (159)
- `/tmp/fr/livex-2718/reasons.jsonl` (169, EXILE_RECOVERY on)

The totals match `progress.md` (#162). Each row carries `text`, `inputHash` and `check.noul`, but **not the facts**.

**The facts.** I rebuilt them offline by re-running each seed for 1,200 ticks on `df99aff`, with a capturing stub writer: `rebuild-facts.ts`, in this directory. That works because the reasons are hash-neutral and the facts are a pure function of state. Every rebuilt fact packet reproduces its logged `inputHash`: **589 / 589**. So each grade below is against the exact facts the brain saw.

## 2. Sample

- Seed **20261101** (`random.Random`). Each stratum's pool was sorted by (run, sequence) and then drawn without replacement.
- **Strata, sample / population:**
  - weighted up: secession 8 / 8 (all), desertion 10 / 11, home-port raid ("win back" trigger, EXILE on) 10 / 46;
  - other types: plain raid 3 / 146, breach 3 / 107, claim 3 / 154, tax 3 / 117.
- **40 items in total.**
- Data with facts, grade and reason for each: `docs/playtests/feed-reasons-audit-2026-11-01/sample.jsonl`.

## 3. Grades

| # | Run | Seq | Stratum | Reason (verbatim) | Grade | Check noul |
|---|---|---|---|---|---|---|
| 1 | live-1847 | 104074 | secession | Corin Hale seceded from Free Tide Compact after broken supply contracts. | faithful | 0.06 |
| 2 | live-1847 | 103495 | secession | Niko Wren seceded Glassport from the World Government after broken supply contracts. | faithful | 0.05 |
| 3 | live-1847 | 137010 | secession | Mara Calder seceded from Free Tide Compact because the tax rate was above 15%. | faithful | 0.06 |
| 4 | live-4096 | 51569 | secession | Finn Frost seceded from Free Tide Compact after broken promises. | faithful | 0.06 |
| 5 | live-4096 | 43430 | secession | Mara Calder seceded from Free Tide Compact due to broken promises. | faithful | 0.05 |
| 6 | live-4096 | 48303 | secession | Ada Sorn seceded Crown Harbor from the World Government after broken promises. | faithful | 0.06 |
| 7 | live-1847 | 129079 | secession | Dax Pike seceded from Free Tide Compact because the tax rate was above 15%. | faithful | 0.08 |
| 8 | live-4096 | 97617 | secession | Corin Hale seceded from the Free Tide Compact because the tax rate was above 15%. | faithful | 0.05 |
| 9 | live-4096 | 55326 | desertion | Zara Gale deserted the Free Tide Compact after twelve mornings without money for passage. | faithful | 0.07 |
| 10 | live-1847 | 138627 | desertion | Bram Tern deserted the Free Tide Compact after twelve mornings without money for a day of passage. | faithful | 0.06 |
| 11 | livex-2718 | 132549 | desertion | Mina Vale deserted the Free Tide Compact after twelve mornings without money for a day of passage. | faithful | 0.07 |
| 12 | live-4096 | 72117 | desertion | Dax Pike deserted the Free Tide Compact after twelve mornings without money for a day of passage. | faithful | 0.07 |
| 13 | live-2718 | 90685 | desertion | Finn Frost deserted the Free Tide Compact after twelve mornings without money for a day of passage. | faithful | 0.08 |
| 14 | live-2718 | 90684 | desertion | Mina Vale deserted the Free Tide Compact after twelve mornings without money for passage. | faithful | 0.08 |
| 15 | live-1847 | 107490 | desertion | Mina Vale deserted the Free Tide Compact after twelve mornings without money for a day of passage. | faithful | 0.06 |
| 16 | live-1847 | 107491 | desertion | Esme Dusk deserted the Free Tide Compact after twelve mornings without money for passage. | faithful | 0.08 |
| 17 | live-4096 | 72118 | desertion | Bram Tern deserted the Free Tide Compact after twelve mornings without money. | faithful | 0.10 |
| 18 | live-4096 | 72116 | desertion | Esme Dusk deserted the Free Tide Compact after twelve mornings without money. | faithful | 0.11 |
| 19 | livex-2718 | 91204 | raid-home | Mina Vale raided Crown Harbor to win it back from World Government. | faithful | 0.17 |
| 20 | livex-2718 | 39770 | raid-home | Esme Dusk raided Glassport to win back Glassport, lost to World Government. | faithful | 0.20 |
| 21 | livex-2718 | 111958 | raid-home | Jun Marrow raided Glassport to win it back from Free Tide Compact. | faithful | 0.15 |
| 22 | livex-2718 | 96097 | raid-home | Corin Hale raided Glassport to win it back from World Government. | faithful | 0.15 |
| 23 | livex-2718 | 60626 | raid-home | Pax Ash raided Glassport to win it back from World Government. | faithful | 0.19 |
| 24 | livex-2718 | 147632 | raid-home | Corin Hale raided Glassport to win it back from World Government. | faithful | 0.18 |
| 25 | livex-2718 | 33664 | raid-home | Mina Vale raided Crown Harbor to win it back from World Government. | faithful | 0.22 |
| 26 | livex-2718 | 71256 | raid-home | Esme Dusk raided Glassport to win it back from World Government. | faithful | 0.22 |
| 27 | livex-2718 | 142446 | raid-home | Sable Morrow raided Glassport to win it back from Free Tide Compact. | faithful | 0.19 |
| 28 | livex-2718 | 91034 | raid-home | Jun Marrow raided Glassport to win back Glassport, lost to Free Tide Compact. | faithful | 0.12 |
| 29 | live-2718 | 7440 | raid | Pax Ash raided Crown Harbor. | faithful | 0.04 |
| 30 | live-1847 | 128798 | raid | Sable Morrow raided Cinder Key. | faithful | 0.04 |
| 31 | live-2718 | 60486 | raid | Corin Hale raided Cinder Key. | faithful | 0.05 |
| 32 | live-1847 | 129955 | breach | Bram Tern dropped the accepted contract for a better-paying option. | faithful | 0.24 |
| 33 | live-4096 | 148786 | breach | Toma Reef dropped the accepted contract for a better-paying option. | faithful | 0.23 |
| 34 | live-1847 | 51209 | breach | Zara Gale dropped the accepted contract for a better-paying option. | faithful | 0.17 |
| 35 | live-2718 | 111989 | claim | Ada Sorn claimed Crown Harbor after the port surrendered and the claim was accepted. | faithful | 0.04 |
| 36 | live-4096 | 48368 | claim | Finn Frost claimed Glassport after the port surrendered. | faithful | 0.06 |
| 37 | livex-2718 | 54650 | claim | Vale Drake claimed Crown Harbor after the port surrendered. | faithful | 0.05 |
| 38 | live-2718 | 107264 | tax | Pax Ash raised the tax rate because the treasury was short. | faithful | 0.06 |
| 39 | live-2718 | 133927 | tax | Pax Ash raised the tax rate because the treasury was short. | faithful | 0.05 |
| 40 | live-2718 | 83928 | tax | Pax Ash raised taxes because the treasury was short. | faithful | 0.05 |

**Why each stratum is graded faithful** (per row in `sample.jsonl`):
- **Secessions:** the act plus the trigger route ("broken promises" or "tax rate was above 15%"). Factions and port match.
- **Desertions:** restate the passage-money trigger. #9, #14, #16, #17 and #18 shorten it, dropping "for a day of" or "for passage", which loses detail but adds nothing.
- **Home-port raids:** "to win it back from <holder>", which matches the trigger, the port and the defender.
- **Plain raids:** a bare act, as the prompt requires when no cause is recorded.
- **Breaches, claims and tax:** the trigger, verbatim or shortened.

**Invented rate by event type** (95% upper bound by the rule of three, 3/n):

| Stratum | Sampled | Faithful | Invented | Misleading | Invented upper bound |
|---|---|---|---|---|---|
| Secession | 8 (all) | 8 | 0 | 0 | 0 / 8 is the whole population |
| Desertion | 10 | 10 | 0 | 0 | ≤ 30% |
| Home-port raid | 10 | 10 | 0 | 0 | ≤ 30% |
| Plain raid | 3 | 3 | 0 | 0 | — (n too small) |
| Breach | 3 | 3 | 0 | 0 | — |
| Claim | 3 | 3 | 0 | 0 | — |
| Tax | 3 | 3 | 0 | 0 | — |
| **All** | **40** | **40** | **0** | **0** | ≤ 7.5% |

Observation: the reasons are faithful because they are close paraphrases of `trigger`. They add little beyond it, and plain raids add nothing. That is the price of the no-invention rule.

**Fact check of my own earlier work.** The secession trigger reads "in the last **40 days**": `PROMISE_WINDOW_TICKS` is 240 ticks / `ticksPerDay` (`feed-reasons.ts:124`). My re-sample set (`feed-reasons.md` §12–13, `docs/playtests/feed-reasons-resample-2026-10-31/build.ts`) said "240 days", wrongly. The built code is right.

## 4. Checker vs hand grades

The sample has **no positives** (0 invented, 0 misleading). The checker can therefore show only false alarms here, never catches or misses.

| Threshold | Agreement (40) | Catches | Misses | False alarms |
|---|---|---|---|---|
| 0.3 | 40 / 40 | 0 of 0 | 0 | 0 (sample max 0.24) |
| 0.5 | 40 / 40 | 0 of 0 | 0 | 0 |

**Whole population (589), no grading needed for the highest scorers:**
- At **0.3** the checker would flag 22. Twenty-one read "<name> dropped the accepted contract for a better-paying option.", the trigger verbatim. The other is "Toma Reef raided Crown Harbor to win it back from Free Tide Compact." (0.37), which matches its trigger. I read the top six against their facts: all faithful.
- So **at 0.3 all 22 population flags are false alarms**.
- At 0.5 it flags none.

**Catching ability.** The only evidence is §14 of `feed-reasons.md`: 3 of 8 caught at 0.5, on the pre-fix first sample. The live output gives it nothing to catch.

## 5. Recommendation

1. **Keep the checker advisory, and make it opt-in, off by default.**
   - On the live output it never fires at 0.5. At 0.3 it fires only on verbatim restatements.
   - Its proven catch rate is 3 of 8.
   - It costs $0.0102 of $0.1140 on the three plain live runs (`progress.md` #162, about 9%).
   - The validator (names, numbers, pronouns) plus trigger-only causes are what keep the reasons faithful.
2. **Do not run the optional rewording now.** No live reason is wrong, so a reworded check could only be scored on the 8 synthetic first-sample positives. That is too few to tell 6 of 8 from chance, so it is not clearly worth the spend. Revisit if the prompt changes or the event list grows.
3. **Re-audit with this method** (rebuild facts by `inputHash`, stratified seeded sample, hand grade) whenever the prompt, the facts or the event list changes. Cost: $0.
4. **For more legible raids,** record a cause on plain raids (the decision's top scoring term). Without one, 146 of 589 lines are bare acts.
