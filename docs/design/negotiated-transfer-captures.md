# Negotiated transfer: the off-port capture drop

**Status:** Note after #197 (`main` `e2508bd`). The Lead accepted the capture drop as emergent and will not tune it; default-on still needs the off-port mechanism in one paragraph (this document). `negotiatedTransferTriggers` stays harness-only.

- **Author and date:** Researcher, 2026-11-27.
- **Base:** `main` `e2508bd` (#197 merged rev 2). Runs are ATLS + [protection-pact-fix](protection-pact-fix.md) (`occupation` off; `alliances`, `portTransfer`, `lifecycle`, `secessionAftermath` on), 1,200 ticks, flag off versus `negotiatedTransfer` on. The 13-seed attribution is [negotiated-transfer.md](negotiated-transfer.md) §6.
- **Spend:** offline, $0, no AI.
- **Trace:** [negotiated-transfer/trace-3000.ts](negotiated-transfer/trace-3000.ts). Captures are `character-captured` events, not port claims. Faction of a captured character is read at the event, not at end of run. The first post-sale snapshot in seed 3000 is t121 (the t120 snapshots are taken before the sale applies).

## Mechanism

Under ATLS plus the protection-pact fix, with exile recovery on, the capture drop is an emergent knock-on of selling a quiet rear port, not a change in the capture-roll math and not a raid avoided on the sold port. In seed 3000 the t120 sale of Verdant Cay (Free Tide → World Government, price 120, garrison 10) leaves that port uncontested — 0 battle starts and 0 captures there after t120 in both flag-off and flag-on — and World Government keeps it while its garrison grows from 10 at t121 to 13 at t200, 16 at t300, 20 at t400, 38 at t900, and 48 at t1199. The same Free Tide ↔ World Government raids still start just after the sale (t124, t134, t242, t244, and t266 line up), then the maps diverge: Free Tide is left with only Cinder Key, is portless by t400 with treasury 0 (it still holds Cinder Key and Glassport at t400 with the flag off), Crown Harbor and Glassport secede (declaration ticks 248 and 325) and make peace with World Government at the 67-tick aftermath window (t315 and t392; those peaces persist through t1199 and block autonomous raids), and the claim-and-raid ping-pong at Cinder Key, Crown Harbor, and Glassport dies at t514 (0 starts and 0 captures after that tick, versus 22 starts and 15 of the 21 flag-off captures). After t120, battle starts fall 38 → 12 and claims 42 → 13, mostly because Free Tide and World Government almost stop the Glassport fight (13 starts → 1) and cut Cinder Key (12 → 4) and Crown Harbor (13 → 7). All 21 flag-off captures are after t120, all at 0 troops and severe risk (chance 0.55), 20 of them outscore-loss and one major-defeat; the single flag-on capture is a breakaway-on-breakaway outscore-loss at Crown Harbor at t484 (Iris Stone of the Crown Harbor secession, taken by the Glassport secession, roll 0.3708). The 120-coin sale price is not the cause: it is a one-tick recruiting bump for Free Tide (t120–121: 14 troops / 168 treasury-drawn versus 4 / 48), after which Free Tide recruits less (t120–240: 117 troops / 1,205.92 drawn versus 249 / 2,048.49), and 120 is negligible against World Government's treasury (16,998.25 at t119, 16,888.90 at t121; World Government's t120–121 recruiting is identical at 10 troops / 54 drawn).

The same mechanic runs the other way when the sold port is already in the fight, which is the typical exile-off case (sold-garrison median 12 versus 7 under ATLS). Seed 2718 under ATLS with exile off sells Glassport (Free Tide → World Government, t408, garrison 9, price 108): starts after the sale rise 27 → 33 and captures 7 → 14 (whole-run 12 → 19), concentrated at the sold port itself (Glassport starts 3 → 8, captures 2 → 6) plus spillover at Cinder Key (captures 1 → 4; Crown Harbor stays 4 → 4). World Government steps into a contested port that keeps flipping; there is no early aftermath peace to shut the loop (the flag-on run forms only one pact, at t792). Seed 3000 with exile off never sells the quiet Verdant Cay at t120; it sells Cinder Key and Glassport five times (garrisons 9, 12, 11, 11, 13) and captures stay flat (12 → 11). Across the 13-seed table in [negotiated-transfer.md](negotiated-transfer.md) §6, captures at transferred ports rise 42 → 55 under exile off, which offsets the modest other-port drop (115 → 104), and starts in the 152 ticks after a sale rise 14 → 24.

## Supporting counts

All figures below are from the trace unless marked as the already-reported 13-seed table. Nothing was tuned.

### Seed 3000, ATLS, exile on, flag off → on

The two runs match through t119: 0 captures, 14 battle starts (Free Tide at Crown Harbor 5, Glassport 4, Verdant Cay 1; World Government at Cinder Key 4). At t119 Free Tide holds Cinder Key (garrison 7) and Verdant Cay (10), treasury 53.30, 603 troops; World Government holds Crown Harbor (52) and Glassport (7), treasury 16,998.25, 749 troops; no pacts and no peace. The only negotiated transfer is the t120 sale; both runs also have the t24 purchase of Verdant Cay by World Government, later claimed by Free Tide at t55.

| After t120 | Flag off | Flag on |
|---|---:|---:|
| Battle starts | 38 | 12 |
| Claims | 42 | 13 |
| Captures | 21 | 1 |
| Battle-resolved | 45 | 27 |
| Attacker- / defender-victories | 44 / 1 | 14 / 13 |
| Whole-run starts / resolved / claims / captures | 52 / 65 / 47 / 21 | 26 / 47 / 18 / 1 |

Starts after t120 by attacker: World Government 16 → 5, Free Tide 14 → 4, breakaway 8 → 3. Claims after t120 by the taking faction: World Government 17 → 5, Free Tide 15 → 4, breakaway 10 → 4.

Starts after t120 by port and pairing:

| Port | Starts off → on | Who stopped or cut |
|---|---:|---|
| Glassport | 13 → 1 | Free Tide vs World Government 5 → 1; World Government vs Free Tide 5 → 0; breakaway vs Free Tide 2 → 0; World Government vs breakaway 1 → 0 |
| Cinder Key | 12 → 4 | World Government vs Free Tide 7 → 3; Free Tide vs World Government 5 → 1 |
| Crown Harbor | 13 → 7 | Breakaway vs breakaway 6 → 3; Free Tide vs World Government 4 → 2; World Government vs Free Tide 3 → 2 |
| Verdant Cay | 0 → 0 | No starts after t120 in either run |

The leftover Crown Harbor activity in the flag-on run is mostly breakaway vs breakaway, and that is the one remaining capture. Early post-sale starts still line up (t124 Pax Ash / Free Tide at Crown Harbor, t134 Iris Stone / World Government at Crown Harbor, t242, t244, t266 Corin Hale / Free Tide at Glassport), then diverge (flag-off Sable Morrow at Cinder Key t275; flag-on Orin Rill t273 and Kessa Calder t274 at Cinder Key). Flag-on has no starts after t514 (last start is t514, Kessa Calder / World Government at Cinder Key). Flag-off continues through t1160 (22 starts and 15 captures after t514). Captures t120–514: 6 off, 1 on. Captures before t120: 0 and 0.

Flag-off captures, all severe (chance 0.55), all at 0 troops (20 outscore-loss, 1 major-defeat of Sable Morrow at Cinder Key t961):

| Victim faction | Captor | Port | Count |
|---|---|---|---:|
| World Government | Free Tide | Cinder Key | 5 |
| Free Tide | World Government | Glassport | 5 |
| Breakaway | Breakaway | Crown Harbor | 3 |
| World Government | Free Tide | Glassport | 3 |
| Free Tide | World Government | Cinder Key | 2 |
| World Government | Free Tide | Crown Harbor | 1 |
| Free Tide | World Government | Crown Harbor | 1 |
| Breakaway | World Government | Glassport | 1 |

Repeat victims: Mara Vane 6 times, Mara Calder 3, Dax Pike 3, Pax Ash 2, Corin Hale 2. Ports: Cinder Key 7 → 0, Crown Harbor 5 → 1, Glassport 9 → 0, Verdant Cay 0 → 0.

Diplomacy and holders, flag-on: peace at t315 (World Government with `secession-character-06-crown-harbor-248`) and t392 (World Government with `secession-character-11-glassport-325`); pact at t336 (Free Tide and the Glassport secession vs World Government) and t360 (the Crown Harbor secession and World Government vs the Glassport secession). Those peaces remain through t1199. Verdant Cay is never claimed after the sale. End holders: Cinder Key World Government garrison 7, Crown Harbor Glassport-secession 75, Glassport Crown Harbor-secession 31, Verdant Cay World Government 48. World Government end troops 4,192 versus 2,118 flag-off.

Flag-off holders: Free Tide still has Cinder Key and Verdant Cay at t200, only Glassport at t300, Cinder Key and Glassport at t400, and is portless by t900. Verdant Cay is claimed by World Government at t253 and by breakaways at t432 and t570. Pacts form and break on `enemy-portless` / ally-gone; peaces appear (t408, t463, t496) but the Free Tide ↔ World Government war at Cinder Key and Glassport continues. End holders: Cinder Key and Glassport World Government (garrisons 5 and 8), Crown Harbor `secession-character-06-crown-harbor-365` 56, Verdant Cay `secession-character-13-crown-harbor-342` 25.

Recruiting and tax (treasury-drawn on `recruited` events). t0–119 is identical: Free Tide 469 troops, 2,332.64 drawn. At t120–121, the sale lets Pax Ash draw 96 + 72 (qty 8 + 6) on versus 48 (qty 4) off; World Government t120–121 is identical (qty 10, drawn 54). Then Free Tide recruits less, not more:

| Window | Free Tide off (qty / drawn) | Free Tide on | World Government off | World Government on |
|---|---|---|---|---|
| t0–119 | 469 / 2,332.64 | same | 368 / 850.19 | same |
| t120–121 | 4 / 48 | 14 / 168 | 10 / 54 | same |
| t120–240 | 249 / 2,048.49 | 117 / 1,205.92 | 338 / 966.85 | 333 / 753.27 |
| Whole run drawn | 13,307.76 | 5,315.84 | 6,997.00 | 11,500.73 |
| Whole run tax | 14,130.19 | 5,024.26 | 21,267.31 | 19,658.15 |

Failed capture rolls emit no event, so attempt counts above the successful captures were not measured. The roll that did fire did not change (severe 0.55 at 0 troops); the flag-on run almost has no such fights.

### Seed 2718, ATLS, exile off (the opposite knock-on)

Both runs match through the sale: 5 captures and 22 starts before t408. The flag-on transfer is Glassport, Free Tide → World Government, t408, kind sale, price 108, garrison 9, agent Bram Quill. Both runs also have the t24 purchase of Verdant Cay by World Government.

| After t408 | Flag off | Flag on |
|---|---:|---:|
| Starts | 27 | 33 |
| Captures | 7 | 14 |
| Claims | 27 | 29 |
| Battle-resolved | 36 | 42 |
| Whole-run captures / starts | 12 / 49 | 19 / 55 |

By port after t408: Glassport starts 3 → 8 and captures 2 → 6; Cinder Key starts 6 → 6 and captures 1 → 4; Crown Harbor starts 18 → 16 and captures 4 → 4; Verdant Cay starts 0 → 3 and captures 0 → 0. Flag-on Glassport starts after the sale are World Government 7 and breakaway 1 (versus World Government 2 and Free Tide 1 off). Capture causes, whole run: flag-off 5 outscore-loss severe, 4 failed-retreat high, plus three others; flag-on 11 outscore-loss severe, 4 major-defeat severe, plus three others. Diplomacy: flag-off forms and later breaks several late pacts and peaces (first pact t816); flag-on has a single alliance at t792 (Free Tide and `secession-character-21-crown-harbor-772` vs World Government).

### Seed 3000, ATLS, exile off (no quiet-rear-port sale)

Flag-off has only the t24 Verdant Cay purchase. Flag-on adds five sales, all of contested ports, all Free Tide → World Government: Glassport t312 garrison 9, Cinder Key t336 garrison 12, Cinder Key t552 garrison 11, Glassport t744 garrison 11, Cinder Key t888 garrison 13. Captures 12 → 11 (all after t120; 0 before). Starts 42 → 43 (after t120, 29 → 30). By port after t120: Cinder Key starts 4 → 6, captures 1 → 2; Crown Harbor 16 → 18 and 6 → 5; Glassport 9 → 6 and 5 → 4; Verdant Cay 0 → 0. The war does not die.

### 13-seed context (from rev 2, not re-run here)

Under ATLS, captures 221 → 156 and battles 895 → 840; sale-only 158 / 847, cession-only 203 / 912. The drop is a sale knock-on, concentrated at ports that were never transferred (150 → 99 versus 71 → 57 at transferred ports). Seed 3000 alone is 21 → 1. Exile off: captures 157 → 159, battles 778 → 800; captures at transferred ports 42 → 55; sale-only 158 against a 157 baseline; sold-garrison median 12 versus 7, with one sale at garrison 15; starts in the 152 ticks after an exile-off sale 14 → 24.

## Hook

`TickOptions.negotiatedTransferTriggers` remains a diagnosis hook for leave-one-trigger-out runs. It is not a product flag and stays harness-only.
