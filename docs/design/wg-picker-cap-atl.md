# WG picker cap under ATL: recount and diagnosis

Status: proposal for the Lead (offline, $0, no AI). Base: `main` `c47e34e`. Asked in the #190 rulings, item (b): before any live WG picker run with layers on, recount the World Government picker call cap and find out why consults rise under ATL.

## Method

- **ATL defaults are not flipped on `c47e34e`.** `ALLIANCES_DEFAULT`, `PORT_TRANSFER_DEFAULT` and `LIFECYCLE_DEFAULT` are all still `false`. Instead of applying `defaults-on/prototype-flip-ATL.patch`, every run passes the layer options explicitly (`{alliances, portTransfer, lifecycle[, secessionAftermath]}`). This is equivalent because the engine reads `options.x ?? X_DEFAULT`. The end hashes match the `defaults-on/raw` subset files on all 13 seeds for off, A, L, AL, AT, ATL and ATLS.
- **Counting hook.** `wg-picker-cap-atl/hook.patch` is a read-only scratch patch to `engine.ts`. It is not committed to `src`. At the picker gate, for every World Government decision, it hands the harness the character, the candidates, the haul gate, and whether the port the character stands in is pact- or peace-friendly. On 1847 with layers off it reproduces #176's recount exactly: **1,482** eligible, end hash `94de9c02`.
- **Two counts per config** (`count.ts`, `run-all.sh`), each over 13 seeds × 1,200 ticks:
  - **Read-only recount**: no picker. This counts WG decisions that meet the eligibility rule in `wg-jev-picker.md`: holder or governor, at least 2 legal ids, no raid or claim legal, and no active haul that can act. It is the original cap rule's method, and the world is untouched.
  - **Stub records**: `stubUniform`, `pickerFactions: [world-government]`, with the cap lifted (`wgPickerCap` 1e9). It counts the consult records the engine writes, which is the defaults-on.md §5 method. Under the 1,853 cap these runs equal defaults-on's on every seed the cap does not bind. defaults-on's 2,355 on seed 3000 is the capped run; uncapped it is 2,415, because a capped consult keeps the sim's choice and so changes the path. The same applies to 6000: 1,863 capped against 1,865 uncapped.
- **Configs:** off (main defaults), A, T, L, AL, AT, TL, ATL and ATLS. Seeds: 1847, 2718, 4096, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000.
- **Tables** come from `summarize.py` into `wg-picker-cap-atl/raw/summary.txt`. That file also has the per-consulter breakdown (character, origin and seat) for every seed under off, ATL and ATLS. The raw JSONL is in `raw/`.

## Per-seed consults: read-only recount / stub records

| Seed | off | ATL | ATLS |
|---|---|---|---|
| 1847 | 1,482 / 1,013 | 1,686 / 1,722 | 1,839 / 1,722 |
| 2718 | 1,329 / 1,235 | 1,348 / 1,646 | 1,348 / 1,646 |
| 4096 | 1,152 / 1,319 | 1,460 / 1,421 | 1,460 / 1,222 |
| 1000 | 1,400 / 1,274 | 2,008 / 1,646 | 2,008 / 1,653 |
| 2000 | 1,003 / 1,228 | 1,510 / 1,506 | 1,576 / 1,910 |
| 3000 | 1,681 / 945 | 1,591 / 2,415 | 1,242 / 2,415 |
| 4000 | 1,148 / 1,352 | 1,582 / 1,750 | 1,582 / 1,750 |
| 5000 | 1,108 / 1,144 | 1,633 / 1,542 | 1,633 / 1,604 |
| 6000 | 1,367 / 1,089 | 1,686 / 1,865 | 1,376 / 1,865 |
| 7000 | 1,594 / 1,503 | 1,945 / 1,839 | 1,945 / 1,839 |
| 8000 | 1,090 / 1,052 | 1,910 / 1,376 | 1,910 / 1,326 |
| 9000 | 1,276 / 1,078 | 1,046 / 983 | 1,349 / 1,086 |
| 10000 | 1,442 / 1,211 | 873 / 1,695 | 961 / 1,695 |
| **total** | **17,072 / 15,443** | **20,278 / 21,406** | **20,229 / 21,733** |
| max, 3 standard seeds | 1,482 / 1,319 | 1,686 / 1,722 | 1,839 / 1,722 |
| max, 13 seeds | 1,681 / 1,503 | 2,008 / 2,415 | 2,008 / 2,415 |
| seeds above 1,853 | 0 / 0 | 3 / 2 | 3 / 3 |

- **Every consulter is a governor.** The holder count is 0 in every config and mode, because the holder, Mara Vane, is the player.
- **Every governor decision is eligible except one kind.** No governor decision had fewer than 2 legal ids or a duplicate id. The only ineligible governor decisions had a raid or claim legal: 75 off and 121 under ATL.

## Diagnosis: port transfer drives the rise, through a fourth governor seat at Verdant Cay

Read-only recount, 13-seed totals:

| Config | Eligible | Δ vs off | WG port-ticks | Seated port-ticks | Eligible at a pact or peace port | Eligible by promoted governors |
|---|---|---|---|---|---|---|
| off | 17,072 | 0 | 22,800 | 21,423 | 0 | 0 |
| A | 16,464 | −608 (−3.6 %) | 22,083 | 20,419 | 34 | 0 |
| T | 20,171 | +3,099 (+18.2 %) | 31,235 | 29,900 | 0 | 0 |
| L | 17,606 | +534 (+3.1 %) | 22,907 | 21,851 | 0 | 361 |
| AL (ATL − T) | 17,640 | +568 | 23,137 | 22,191 | 56 | 220 |
| AT (ATL − L) | 20,838 | +3,766 | 31,542 | 30,739 | 182 | 0 |
| TL (ATL − A) | 20,071 | +2,999 | 30,524 | 29,148 | 0 | 600 |
| **ATL** | **20,278** | **+3,206 (+18.8 %)** | **30,563** | **29,263** | **127** | **524** |
| ATLS | 20,229 | +3,157 (+18.5 %) | 30,840 | 29,599 | 1,072 | 332 |

**Leave-one-out from ATL:**
- Dropping T removes **2,638** of the 3,206 rise (20,278 → 17,640).
- Dropping A changes it by −207 (A adds 207 in combination).
- Dropping L changes it by +560 (L takes 560 away in combination).
- Stub records show the same thing. They rise from 15,443 off to 21,406 under ATL (+5,963). Single layers give T 21,563, A 15,491 and L 15,162. Leave-one-out gives AL 14,708, so dropping T removes 6,698.

### Mechanism, per candidate cause

1. **An extra governor seat (port transfer): this is the cause.**
   - WG buys Verdant Cay on every seed in the read-only runs: tick 24 on 12 seeds, tick 48 on 9000, at prices of 840 to 852. Under stub nudging it buys on 12 of 13.
   - WG port-ticks go from 22,800 to 30,563 (+7,763, +34 %), and Verdant Cay supplies 8,879 of them.
   - Seated governor port-ticks go up by 7,840.
   - The Verdant Cay seat alone accounts for 5,045 eligible decisions under ATL, plus 376 more where one governor also holds another seat.
   - Across all 234 config × seed × mode runs, eligible consults track seated port-ticks with r = 0.81.
   - The rise is not one-for-one: eligible per seated port-tick falls from 0.797 to 0.693. One character can hold two or three seats but decides once a tick, and a governor makes no decision while at sea.
   - The rise is largest late in the run (13-seed totals per 200-tick bin):

     | Ticks | 0–199 | 200–399 | 400–599 | 600–799 | 800–999 | 1000–1199 |
     |---|---|---|---|---|---|---|
     | off | 2,419 | 2,791 | 2,820 | 2,923 | 3,076 | 3,043 |
     | ATL | 2,593 | 3,094 | 3,304 | 3,368 | 3,651 | 4,268 |

     The last bin is +1,225, or +40 %.
   - **The Verdant Cay governor is mostly not at Verdant Cay.** Of the 5,045 Verdant Cay-seat consults, 4,664 (92 %) are made docked at another port. A seat is cleared only when the port changes faction, the governor leaves the faction, becomes holder or retires (`governor.ts` `syncSeats`). So the governor is appointed from whoever is anchored there and then sails off. Governors decide away from their seat in 49 % of eligible ATL consults (10,037), against 29 % off (4,881).
   - The stub peak follows the same driver. Stub ATL seed 3000 makes 2,415 consults, with 3,090 WG seated port-ticks (Verdant Cay 1,068, Glassport 1,049). The read-only run on the same seed has 2,041 seated port-ticks and 1,591 consults. The uniform stub overrides about 28 % of governor choices, and that changes which ports WG keeps.
2. **Raids and claims blocked by pacts: not the cause.**
   - Only a decision made at a pact- or peace-friendly port can have had its raid or claim removed. Under ATL that bounds this cause at **127** eligible decisions (0.6 %), and in fact governor decisions with a raid or claim legal rise, from 75 to 121.
   - A alone lowers the count by 608, through fewer WG port-ticks (−717).
   - Under ATLS the bound grows to 1,072, from peace and protection, but the ATLS total is still 20,229.
3. **Lifecycle: small, and mixed in sign.**
   - Under ATL, WG has 12 promotions and 28 retirements. Promoted characters hold 689 seated port-ticks and make 524 eligible consults (2.6 %).
   - Retirements do not vacate seats for long: vacant WG port-ticks fall from 1,377 to 1,300 because seats refill.
   - L alone adds 534. In combination, leave-one-out shows L takes away 560.
4. **Anything else:** the holder makes 0 consults in every config. The haul gate removes 0.4 % of WG decisions in every config.

**Conclusion: port transfer drives the rise.** WG buys Verdant Cay at about tick 24 and so gains a fourth seated governor. The new seat is held for about 680 ticks per seed, and its governor mostly consults while docked elsewhere. Alliances and lifecycle each move the total by less than ±4 %.

## Recount and recommended caps

The original rule is the read-only recount max over 1847, 2718 and 4096, × 1.25. The cost basis is #167's $0.0000544 per call, and the spend cap is rounded up to the cent.

| Set | Max over 3 standard seeds | Cap (calls) | Spend cap | 13-seed max | 13-seed cap | 13-seed spend |
|---|---|---|---|---|---|---|
| off (check) | 1,482 (1847) | 1,853 | $0.11 | 1,681 (3000) | 2,102 | $0.12 |
| **ATL** | 1,686 (1847) | **2,108** | **$0.12** ($0.1147) | 2,008 (1000) | 2,510 | $0.14 ($0.1365) |
| **ATLS** (pre-fix S) | 1,839 (1847) | **2,299** | **$0.13** ($0.1251) | 2,008 (1000) | 2,510 | $0.14 |

- **Recommendation: an ATL cap of 2,108 calls and $0.12 per run**, for the 3-seed live run (wg-jev-picker.md acceptance item 4).
  - The uncapped stub peak on those three seeds is 1,722, inside the cap.
  - Previous live WG runs on main show live counts can sit above that seed's read-only count. 4096 reached 1,446 against 1,152, a ratio of 1.255; 2718 reached 1,417 against 1,329. Neither exceeded the max-based cap. Those runs cost $0.0000485–0.0000492 per call (`docs/playtests/wg-picker-noise-2026-11-01/*.summary.json`), below the $0.0000544 basis.
- **ATLS: 2,299 calls and $0.13**, but recount it after the protection-pact fix lands. These ATLS figures are on `c47e34e`, with the unfixed S.
- **A live run on more than the 3 standard seeds** would need the 13-seed basis: 2,510 calls and $0.14 for both ATL and ATLS. Uncapped stub max is 2,415, inside that.
- All of these are far under the ruled ceiling of about 20,000 calls and $0.60.

## Does the "holder + governors" scope still hold?

**Yes. No scope change is needed.**
- The role is read live from the seats (`wgPickerRole`: `commandHolderId`, then `governorId`), not from a roster. Promoted characters who win a seat are already governors, with 524 eligible consults under ATL. Promoted characters without a seat are members and are not consulted.
- Retired characters take no actions and vacate their seat, so they are never consulted.
- The holder is still dormant: 0 consults everywhere.
- Two existing behaviours, which these layers did not create, grow under ATL. The Lead may want to rule on them, without changing game constants:
  - **Consults while away from the seat.** These are 49 % of ATL consults, against 29 % off.
  - **One character holding several seats.** For example `crown-harbor+glassport`: 354 consults under ATL. Consults count per character, not per seat.

## Open questions for the Lead

1. Adopt **2,108 calls / $0.12** as `WG_PICKER_DEFAULT_CAP` / `WG_PICKER_DEFAULT_SPEND_CAP_USD` when ATL flips? Or adopt **2,299 / $0.13** now, so the ATLS flip needs no second change, with a recount after the protection-pact fix either way?
2. Should a live run beyond the 3 standard seeds use the 13-seed basis (2,510 / $0.14)?
3. Should a governor consult only while docked at its own seat? That is 92 % of the Verdant Cay seat's consults. Or should seats clear when the governor sails away? This is an offices rule question, not a picker constant. Today's behaviour is unchanged here.
4. The Engineer's re-baselining: the WG picker stub test's "1_flagOffPins" item will read ATL pins once the defaults flip, as defaults-on.md §5 already notes.

## Files

- `wg-picker-cap-atl/hook.patch` is the scratch, read-only counting hook for `src/sim/engine.ts`. Apply it with `git apply` and do not commit it to `src`.
- `wg-picker-cap-atl/count.ts` is the harness. Usage is `count.ts <label> '<TickOptions JSON>' [--stub]`.
- `wg-picker-cap-atl/run-all.sh` runs every config in both modes, and `wg-picker-cap-atl/summarize.py` builds the tables.
- `wg-picker-cap-atl/raw/{readonly,stub}-<config>.jsonl` hold one row per seed. `raw/summary.txt` has every table plus the per-consulter and per-seed breakdowns.
