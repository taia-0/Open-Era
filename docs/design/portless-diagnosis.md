# Why World Government and Free Tide go portless early (flag off)

Status: **Diagnosis, report only.** No sim change. Base `origin/main` `02a799d` (#152); pins are 6efa334f / e8f9cfab / 8ac8529b at 72 ticks and 5641b4c4 / a6ff3924 / b19aa02e at 1,200 ticks (verified). Seeds 1847 / 2718 / 4096, 1,200 ticks, flag off. The scripts are outside the repo in `/workspace/portless/`: `trace.mts` (claims), `garrison.mts` (garrison over time), `who.mts` (attackers), `setup.mts` (starting positions) and `variant.mts` (the variants, run on an uncommitted scratch patch that does nothing unless `globalThis.PLV` is set).

## 1. Who claims, and under which rule

Every port that changes faction does so through `settlement-claimed` with `basis: "accepted-surrender"` (`src/sim/engine.ts:1565–1586`). There is one claim rule, and it has three steps:
1. **A won battle offers surrender** when the defenders left are ≤ 15 (`SURRENDER_GARRISON_THRESHOLD`, `src/sim/state.ts:20`) and stability after the blow is ≤ `surrenderStabilityLimit(garrison)` (`state.ts:37–43`): 30 + 10 per soldier under 15, capped at 80. At a garrison of 10 or less the limit is 80. See the immediate battle at `engine.ts:1155–1164` and the major battle at `:1250–1259`. A win also costs −12 stability (`:1154`).
2. **Only the winner may claim**: `settlementClaimAvailableTo` (`state.ts:78–80`). `claim-settlement` scores 175 + ambition×38 + … (`engine.ts:904–916`), so it outranks every other option the next tick.
3. **The reducer** (`state.ts:1044–1050`) changes the owner and faction and sets stability to max(55, stability) (`engine.ts:1582`, `CLAIM_STABILITY_FLOOR` `state.ts:26`). **It does not touch the garrison**, so the claimed port keeps the 3–15 defenders the battle left.

**First losses of a faction's last port** (`trace.mts`):

| Seed | Faction loses last port | Tick | Claimant (archetype, faction, troops) | The battle before |
| ---: | --- | ---: | --- | --- |
| 1847 | Free Tide, Glassport (just claimed at t48) | 63 | character-11 (officer, WG, 32) | t62: garrison 15 → 7, stability 55.4 → 43.4 |
| 1847 | (Free Tide's Cinder Key, first) | 58 | character-03 (explorer, WG, 24) | t57: garrison 21 → 11, stability 38.5 → 26.5 |
| 1847 | World Government | 530 | character-21 (officer, secession faction) | garrison 7 → 6, stability 55.6 → 51.7 |
| 2718 | Free Tide, Cinder Key | 49 | WG | garrison 6 at t48, stability 27 |
| 2718 | World Government | 1012 | claim on Crown Harbor | — |
| 4096 | Free Tide, Cinder Key | 49 | WG | garrison 6 at t48, stability 25 |
| 4096 | World Government | 268 | claim on Glassport | — |

Claims over 1,200 ticks: 39 / 27 / 42. After the first round, almost every claim is a re-claim of a port that was itself claimed shortly before, at garrison 3–15 and stability 43–57.

## 2. Why by about t50

Cinder Key is **Free Tide's only port** (`src/sim/scenario.ts:324–336`, garrison 115). World Government has 13 members to Free Tide's 9 (`scenario.ts:96`), plus two ports and an 18,000 treasury against 2,800 (`:276–291`).

1. **World Government captains start inside Cinder Key, and Free Tide captains inside Glassport.** Locations are dealt round-robin over the four ports (`scenario.ts:95`, `settlementIds[index % 4]`). On every seed, 3 World Government captains start at Cinder Key (1847: 27, 42 and 26 troops) and 2 Free Tide captains at Glassport (`setup.mts`).
2. **They raid from tick 0.** The raid gate (`engine.ts:922–928`) needs only:
   - hostile territory;
   - troops ≥ 25;
   - garrison ≥ 15;
   - 18 ticks since the captain's last battle;
   - no open battle at the port.

   No minimum strength ratio. Each captain can strike every 18 ticks, and others arrive by sea. Battles at Cinder Key by t48: 7 / 14 / 14. At Glassport: 19 / 11 / 9 (`garrison.mts`; immediate and major battles counted).
3. **Garrisons hardly regrow.** +1 every max(6, 200,000 / population) ticks (`engine.ts:328–335`). That is every 31 ticks at Cinder Key (population 6,400) and every 19 at Glassport. Cinder Key goes 115 → 89 → 6 (2718: t48, stability 27; 4096: t48, stability 25). 1847 holds out longer: 89 at t48 and 11 by t57.
4. **Once garrison ≤ 15 the next won battle offers surrender**, because the stability limit has climbed to 80 (step 1). Claimed the tick after.

**Why it repeats (the ping-pong).** A claimed port starts at garrison 3–15 and stability 55. It regrows to 15 (needed for a raid, `engine.ts:926`, or 8 if the raider's faction is landless). One won battle then takes it to ≤ 14 and stability 55 − 12 = 43, under any limit ≥ 40. So a freshly claimed port can be surrendered after a single win, indefinitely. Most of the 39 / 27 / 42 claims are this cycle, and every "zero ports at some tick" in the re-judge comes from it.

## 3. Setup artifact or claim-rule artifact?

**Both. The early loss is mostly setup asymmetry (one Free Tide port, a bigger World Government). The repeated loss is a claim-rule artifact.** The positions alone are not the cause.

| Variant (scratch patch, not committed) | 1847 | 2718 | 4096 | Claims (1847 / 2718 / 4096) |
| --- | --- | --- | --- | --- |
| Flag off (main) | FT first 0 t64, WG t530 | FT t49, WG t1012 | FT t49, WG t268 | 39 / 27 / 42 |
| **home**: members start at their faction's ports, not round-robin | FT t52, WG t673 | FT t36, WG t876 | FT t343, WG t137 | 28 / 28 / 49 |
| **grace**: no surrender offer within 120 ticks of the port's last claim | FT t213, WG t479 | FT t49, WG never | FT t49, WG t225 | 17 / 12 / 20 |
| home + grace | FT t52, WG t914 | FT t36, WG t537 | FT t461, WG t439 | 14 / 18 / 21 |
| **ratio**: no raid below perceived ratio 0.5 | FT t35, WG t471 | FT t39, WG t629 | FT t173, WG t284 | 38 / 30 / 42 |
| ratio + grace | FT t35, WG never | FT t39, WG t616 | FT t173, WG t798 | 13 / 14 / 18 |

Zero-port ticks, as (Free Tide, World Government):

| Seed | Flag off | grace | home + grace |
| ---: | --- | --- | --- |
| 1847 | (591, 150) | (396, 92) | (40, 42) |
| 2718 | (18, 10) | (355, 0) | (31, 102) |
| 4096 | (662, 366) | (705, 220) | (564, 172) |

Reading:
- **Starting positions are not the driver.** With "home", Free Tide still loses Cinder Key by t36–52 on 2 of 3 seeds: World Government captains sail there within a few ticks and raid on the same gate.
- **The ratio gate makes it earlier**, t35–39 on two seeds: it removes weak raids, but the strong raids still grind the garrison and then win.
- **The 120-tick grace roughly halves claims** (39 / 27 / 42 → 17 / 12 / 20) and stops most ping-pong. It does not stop Free Tide's first loss on 2718 and 4096 (t49).
- **No measured variant keeps Free Tide's only port past t50 on every seed.** That loss follows from one port, a 115 garrison regrowing 1 per 31 ticks, and roughly 6–14 battles against it in the first 48 ticks.

## 4. Proposed fix (Lead's call; not built)

1. **Claim rule (recommended first): a claimed port keeps the claimant's grip.**
   - Either no surrender offer within 120 ticks of the port's last claim (measured as "grace": claims about halved, ping-pong mostly gone, same 72-tick fixture, which has no claim before t48);
   - or, unmeasured, the claimant leaves part of their party as the new garrison, so a claimed port does not start at 3–15.

   Expected effect: far fewer zero-port spells after the first exchange. World Government is never portless on 2718 with grace, and its first zero moves to t225–t914. It moves the 1,200-tick pins. It reads only an event tick, but needs one new stored field (the port's last-claim tick), so `applyEvent` must copy it.
2. **Setup (balance): give Free Tide a defensible start.** This is unmeasured; the options are:
   - a higher Cinder Key garrison or regrowth (`scenario.ts:333`, `engine.ts:332`);
   - members starting at their faction's ports (`scenario.ts:95`, measured as "home": helps 4096, not 2718);
   - a second Free Tide port.

   Any of these moves the 72-tick fixture.
3. **Not recommended:** a minimum raid ratio (measured; makes the first loss earlier).

Three seeds support distributions, not causal claims; every variant moves the whole timeline.
