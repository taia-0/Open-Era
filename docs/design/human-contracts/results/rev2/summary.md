### Volume: human offers (13 seeds x 1,200 ticks; per 100 ticks is per seed)

| config | arm | scenario | human offers | per 100 ticks per seed | seeds with >=1 | accepted | declined | expired | fulfilled | breached | cancelled after accept | open at end |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| default | last | idle | 9 | 0.058 | 9 | 0 | 0 | 8 | 0 | 0 | 0 | 1 |
| default | last | attentive | 20 | 0.128 | 9 | 8 | 12 | 0 | 4 | 0 | 4 | 0 |
| default | last | afirst | 19 | 0.122 | 9 | 9 | 10 | 0 | 4 | 1 | 4 | 0 |
| default | last | lazy | 30 | 0.192 | 9 | 30 | 0 | 0 | 0 | 20 | 10 | 0 |
| default | peer-walk | idle | 9 | 0.058 | 9 | 0 | 0 | 8 | 0 | 0 | 0 | 1 |
| default | peer-walk | attentive | 20 | 0.128 | 9 | 8 | 12 | 0 | 4 | 0 | 4 | 0 |
| default | peer-argmax | idle | 7 | 0.045 | 7 | 0 | 0 | 7 | 0 | 0 | 0 | 0 |
| default | peer-argmax | attentive | 18 | 0.115 | 7 | 8 | 10 | 0 | 4 | 0 | 4 | 0 |
| default | last-noescrow | idle | 11 | 0.071 | 9 | 0 | 0 | 10 | 0 | 0 | 0 | 1 |
| default | last-noescrow | attentive | 17 | 0.109 | 9 | 7 | 10 | 0 | 4 | 0 | 3 | 0 |
| default | last-noallow | afirst | 19 | 0.122 | 9 | 9 | 10 | 0 | 4 | 1 | 4 | 0 |
| atls | last | idle | 9 | 0.058 | 7 | 0 | 0 | 9 | 0 | 0 | 0 | 0 |
| atls | last | attentive | 23 | 0.147 | 7 | 10 | 13 | 0 | 5 | 0 | 5 | 0 |
| atls | last | afirst | 28 | 0.179 | 7 | 15 | 13 | 0 | 5 | 2 | 8 | 0 |
| atls | last | lazy | 37 | 0.237 | 7 | 37 | 0 | 0 | 0 | 29 | 8 | 0 |
| atls | peer-walk | idle | 9 | 0.058 | 7 | 0 | 0 | 9 | 0 | 0 | 0 | 0 |
| atls | peer-walk | attentive | 23 | 0.147 | 7 | 10 | 13 | 0 | 5 | 0 | 5 | 0 |
| atls | peer-argmax | idle | 10 | 0.064 | 8 | 0 | 0 | 10 | 0 | 0 | 0 | 0 |
| atls | peer-argmax | attentive | 25 | 0.160 | 8 | 12 | 13 | 0 | 7 | 0 | 5 | 0 |
| atls | last-noescrow | idle | 7 | 0.045 | 7 | 0 | 0 | 7 | 0 | 0 | 0 | 0 |
| atls | last-noescrow | attentive | 28 | 0.179 | 7 | 14 | 14 | 0 | 9 | 0 | 5 | 0 |
| atls | last-noallow | afirst | 28 | 0.179 | 7 | 15 | 13 | 0 | 5 | 2 | 8 | 0 |

### Peer displacement (idle and attentive; NPC contracts the human took, and what happened to NPC fulfilment)

| config | arm | scenario | human offers | of which displaced an NPC that would have been chosen | NPC offers re-ranked (argmax only) | NPC offers flag-off -> on | NPC fulfilled flag-off -> on | NPC breached flag-off -> on |
|---|---|---|---|---|---|---|---|---|
| default | last | idle | 9 | 0 | 0 | 1865 -> 1814 (-51) | 849 -> 799 (-50) | 449 -> 467 (+18) |
| default | last | attentive | 20 | 0 | 0 | 1865 -> 1728 (-137) | 849 -> 760 (-89) | 449 -> 441 (-8) |
| default | peer-walk | idle | 9 | 0 | 0 | 1865 -> 1814 (-51) | 849 -> 799 (-50) | 449 -> 467 (+18) |
| default | peer-walk | attentive | 20 | 0 | 0 | 1865 -> 1728 (-137) | 849 -> 760 (-89) | 449 -> 441 (-8) |
| default | peer-argmax | idle | 7 | 0 | 4 | 1865 -> 1754 (-111) | 849 -> 781 (-68) | 449 -> 439 (-10) |
| default | peer-argmax | attentive | 18 | 0 | 5 | 1865 -> 1709 (-156) | 849 -> 768 (-81) | 449 -> 421 (-28) |
| atls | last | idle | 9 | 0 | 0 | 1893 -> 1721 (-172) | 817 -> 761 (-56) | 466 -> 413 (-53) |
| atls | last | attentive | 23 | 0 | 0 | 1893 -> 1607 (-286) | 817 -> 703 (-114) | 466 -> 395 (-71) |
| atls | peer-walk | idle | 9 | 0 | 0 | 1893 -> 1721 (-172) | 817 -> 761 (-56) | 466 -> 413 (-53) |
| atls | peer-walk | attentive | 23 | 0 | 0 | 1893 -> 1607 (-286) | 817 -> 703 (-114) | 466 -> 395 (-71) |
| atls | peer-argmax | idle | 10 | 0 | 3 | 1893 -> 1667 (-226) | 817 -> 753 (-64) | 466 -> 393 (-73) |
| atls | peer-argmax | attentive | 25 | 0 | 8 | 1893 -> 1635 (-258) | 817 -> 714 (-103) | 466 -> 407 (-59) |

### Peer scoring: where a human candidate existed, how the human's `assessSupplyContract` score compared with the NPC walk's pick

margin = human score - score of the NPC the walk would pick (lowest id that accepts). Positive = the human outranks it.

| config | arm | scenario | decisions with a human candidate and an accepting NPC (contested) | human outranked the walk pick | decisions with a human candidate and no accepting NPC | margin min | margin p50 | margin max |
|---|---|---|---|---|---|---|---|---|
| default | peer-walk | idle | 27 | 0 | 9 | -0.335 | -0.22 | -0.029 |
| default | peer-walk | attentive | 34 | 0 | 20 | -0.335 | -0.193 | -0.029 |
| default | peer-argmax | idle | 21 | 0 | 7 | -0.335 | -0.155 | -0.029 |
| default | peer-argmax | attentive | 29 | 0 | 18 | -0.335 | -0.169 | -0.029 |
| atls | peer-walk | idle | 19 | 0 | 9 | -0.289 | -0.179 | -0.077 |
| atls | peer-walk | attentive | 38 | 0 | 23 | -0.299 | -0.164 | -0.071 |
| atls | peer-argmax | idle | 10 | 0 | 10 | -0.277 | -0.193 | -0.106 |
| atls | peer-argmax | attentive | 34 | 0 | 25 | -0.277 | -0.173 | -0.071 |

### Economy against flag-off (sum over 13 seeds) with the noise floor (nine flag-off runs with the commander purse +0..+8, min..max)

| config | arm | scenario | all offers | all fulfilled | NPC fulfilled | treasury total | claims | port changes | captures | shortage ticks |
|---|---|---|---|---|---|---|---|---|---|---|
| default | NOISE FLOOR (min..max of 9) | - | 1846..1916 | 835..869 | (same as all fulfilled) | 163998.92..172452.31 | 671..702 | 699..729 | 247..257 | 14745..14745 |
| default | last | idle | 1865 -> 1823 (-42) | 849 -> 799 (-50) | 849 -> 799 (-50) | 169633.42 -> 169054.39 (-579.03) | 682 -> 630 (-52) | 711 -> 660 (-51) | 247 -> 220 (-27) | 14745 -> 14741 (-4) |
| default | last | attentive | 1865 -> 1748 (-117) | 849 -> 764 (-85) | 849 -> 760 (-89) | 169633.42 -> 179469.69 (+9836.27) | 682 -> 659 (-23) | 711 -> 694 (-17) | 247 -> 232 (-15) | 14745 -> 14732 (-13) |
| default | last | afirst | 1865 -> 1905 (+40) | 849 -> 868 (+19) | 849 -> 864 (+15) | 169633.42 -> 163495.93 (-6137.49) | 682 -> 678 (-4) | 711 -> 712 (+1) | 247 -> 231 (-16) | 14745 -> 14737 (-8) |
| default | last | lazy | 1865 -> 1906 (+41) | 849 -> 847 (-2) | 849 -> 847 (-2) | 169633.42 -> 151678.83 (-17954.59) | 682 -> 687 (+5) | 711 -> 709 (-2) | 247 -> 233 (-14) | 14745 -> 14741 (-4) |
| default | peer-walk | idle | 1865 -> 1823 (-42) | 849 -> 799 (-50) | 849 -> 799 (-50) | 169633.42 -> 169054.39 (-579.03) | 682 -> 630 (-52) | 711 -> 660 (-51) | 247 -> 220 (-27) | 14745 -> 14741 (-4) |
| default | peer-walk | attentive | 1865 -> 1748 (-117) | 849 -> 764 (-85) | 849 -> 760 (-89) | 169633.42 -> 179469.69 (+9836.27) | 682 -> 659 (-23) | 711 -> 694 (-17) | 247 -> 232 (-15) | 14745 -> 14732 (-13) |
| default | peer-argmax | idle | 1865 -> 1761 (-104) | 849 -> 781 (-68) | 849 -> 781 (-68) | 169633.42 -> 172543.87 (+2910.45) | 682 -> 583 (-99) | 711 -> 616 (-95) | 247 -> 212 (-35) | 14745 -> 14738 (-7) |
| default | peer-argmax | attentive | 1865 -> 1727 (-138) | 849 -> 772 (-77) | 849 -> 768 (-81) | 169633.42 -> 177446.91 (+7813.49) | 682 -> 577 (-105) | 711 -> 610 (-101) | 247 -> 213 (-34) | 14745 -> 14729 (-16) |
| default | last-noescrow | idle | 1865 -> 1876 (+11) | 849 -> 849 (+0) | 849 -> 849 (+0) | 169633.42 -> 169633.42 (+0) | 682 -> 682 (+0) | 711 -> 711 (+0) | 247 -> 247 (+0) | 14745 -> 14745 (+0) |
| default | last-noescrow | attentive | 1865 -> 1905 (+40) | 849 -> 829 (-20) | 849 -> 825 (-24) | 169633.42 -> 161618.1 (-8015.32) | 682 -> 668 (-14) | 711 -> 697 (-14) | 247 -> 226 (-21) | 14745 -> 14737 (-8) |
| default | last-noallow | afirst | 1865 -> 1905 (+40) | 849 -> 868 (+19) | 849 -> 864 (+15) | 169633.42 -> 163495.93 (-6137.49) | 682 -> 678 (-4) | 711 -> 712 (+1) | 247 -> 231 (-16) | 14745 -> 14737 (-8) |
| atls | NOISE FLOOR (min..max of 9) | - | 1773..2002 | 763..900 | (same as all fulfilled) | 94153.83..108198.52 | 491..526 | 531..571 | 194..214 | 14584..14584 |
| atls | last | idle | 1893 -> 1730 (-163) | 817 -> 761 (-56) | 817 -> 761 (-56) | 105834.7 -> 108129.93 (+2295.23) | 497 -> 521 (+24) | 537 -> 561 (+24) | 214 -> 209 (-5) | 14584 -> 14620 (+36) |
| atls | last | attentive | 1893 -> 1630 (-263) | 817 -> 708 (-109) | 817 -> 703 (-114) | 105834.7 -> 108639.04 (+2804.34) | 497 -> 489 (-8) | 537 -> 536 (-1) | 214 -> 190 (-24) | 14584 -> 14629 (+45) |
| atls | last | afirst | 1893 -> 1728 (-165) | 817 -> 725 (-92) | 817 -> 720 (-97) | 105834.7 -> 110433.46 (+4598.76) | 497 -> 521 (+24) | 537 -> 564 (+27) | 214 -> 207 (-7) | 14584 -> 14632 (+48) |
| atls | last | lazy | 1893 -> 1679 (-214) | 817 -> 727 (-90) | 817 -> 727 (-90) | 105834.7 -> 106741.15 (+906.45) | 497 -> 451 (-46) | 537 -> 498 (-39) | 214 -> 189 (-25) | 14584 -> 14630 (+46) |
| atls | peer-walk | idle | 1893 -> 1730 (-163) | 817 -> 761 (-56) | 817 -> 761 (-56) | 105834.7 -> 108129.93 (+2295.23) | 497 -> 521 (+24) | 537 -> 561 (+24) | 214 -> 209 (-5) | 14584 -> 14620 (+36) |
| atls | peer-walk | attentive | 1893 -> 1630 (-263) | 817 -> 708 (-109) | 817 -> 703 (-114) | 105834.7 -> 108639.04 (+2804.34) | 497 -> 489 (-8) | 537 -> 536 (-1) | 214 -> 190 (-24) | 14584 -> 14629 (+45) |
| atls | peer-argmax | idle | 1893 -> 1677 (-216) | 817 -> 753 (-64) | 817 -> 753 (-64) | 105834.7 -> 102011.53 (-3823.17) | 497 -> 514 (+17) | 537 -> 556 (+19) | 214 -> 205 (-9) | 14584 -> 14620 (+36) |
| atls | peer-argmax | attentive | 1893 -> 1660 (-233) | 817 -> 721 (-96) | 817 -> 714 (-103) | 105834.7 -> 92079.65 (-13755.05) | 497 -> 475 (-22) | 537 -> 520 (-17) | 214 -> 180 (-34) | 14584 -> 14640 (+56) |
| atls | last-noescrow | idle | 1893 -> 1900 (+7) | 817 -> 817 (+0) | 817 -> 817 (+0) | 105834.7 -> 105834.7 (+0) | 497 -> 497 (+0) | 537 -> 537 (+0) | 214 -> 214 (+0) | 14584 -> 14584 (+0) |
| atls | last-noescrow | attentive | 1893 -> 1601 (-292) | 817 -> 686 (-131) | 817 -> 677 (-140) | 105834.7 -> 102236.46 (-3598.24) | 497 -> 493 (-4) | 537 -> 535 (-2) | 214 -> 203 (-11) | 14584 -> 14616 (+32) |
| atls | last-noallow | afirst | 1893 -> 1728 (-165) | 817 -> 725 (-92) | 817 -> 720 (-97) | 105834.7 -> 110433.46 (+4598.76) | 497 -> 521 (+24) | 537 -> 564 (+27) | 214 -> 207 (-7) | 14584 -> 14632 (+48) |

### Matched seeds: per-seed change in the run against the same seed flag-off, and the per-seed noise range

Noise range per seed = min..max over the nine purse nudges of that seed's own total. 'outside' = the arm's value falls outside that range. Fulfilled is all contracts; treasury is the sum of faction treasuries at t=1200.

| config | arm | scenario | seeds outside noise: fulfilled | seeds outside noise: treasury | mean per-seed fulfilled change | mean per-seed treasury change | noise mean absolute per-seed fulfilled spread (max-min) |
|---|---|---|---|---|---|---|---|
| default | last | idle | 6/13 | 5/13 | -3.85 | -44.54 | 8.46 |
| default | last | attentive | 6/13 | 6/13 | -6.54 | +756.64 | 8.46 |
| default | last | afirst | 5/13 | 6/13 | +1.46 | -472.11 | 8.46 |
| default | last | lazy | 4/13 | 5/13 | -0.15 | -1381.12 | 8.46 |
| default | peer-walk | idle | 6/13 | 5/13 | -3.85 | -44.54 | 8.46 |
| default | peer-walk | attentive | 6/13 | 6/13 | -6.54 | +756.64 | 8.46 |
| default | peer-argmax | idle | 7/13 | 6/13 | -5.23 | +223.88 | 8.46 |
| default | peer-argmax | attentive | 9/13 | 9/13 | -5.92 | +601.04 | 8.46 |
| default | last-noescrow | idle | 0/13 | 0/13 | +0 | +0 | 8.46 |
| default | last-noescrow | attentive | 6/13 | 6/13 | -1.54 | -616.56 | 8.46 |
| default | last-noallow | afirst | 5/13 | 6/13 | +1.46 | -472.11 | 8.46 |
| atls | last | idle | 4/13 | 4/13 | -4.31 | +176.56 | 14.38 |
| atls | last | attentive | 5/13 | 6/13 | -8.38 | +215.72 | 14.38 |
| atls | last | afirst | 3/13 | 6/13 | -7.08 | +353.75 | 14.38 |
| atls | last | lazy | 4/13 | 5/13 | -6.92 | +69.73 | 14.38 |
| atls | peer-walk | idle | 4/13 | 4/13 | -4.31 | +176.56 | 14.38 |
| atls | peer-walk | attentive | 5/13 | 6/13 | -8.38 | +215.72 | 14.38 |
| atls | peer-argmax | idle | 5/13 | 5/13 | -4.92 | -294.09 | 14.38 |
| atls | peer-argmax | attentive | 5/13 | 7/13 | -7.38 | -1058.08 | 14.38 |
| atls | last-noescrow | idle | 0/13 | 0/13 | +0 | +0 | 14.38 |
| atls | last-noescrow | attentive | 6/13 | 6/13 | -10.08 | -276.79 | 14.38 |
| atls | last-noallow | afirst | 3/13 | 6/13 | -7.08 | +353.75 | 14.38 |

### Accept-then-buy (afirst) against buy-then-accept (attentive), and the derived allowance

| config | arm | scenario | accepted | fulfilled | breached | cancelled | buys per accepted contract (histogram) | allowance at accept (histogram) | outcome by buys |
|---|---|---|---|---|---|---|---|---|---|
| default | last | attentive | 8 | 4 | 0 | 4 | {} | {} | {} |
| default | last | afirst | 9 | 4 | 1 | 4 | {"0":3,"1":6} | {"0":9} | {"0":{"cancelled":1,"breached":1,"fulfilled":1},"1":{"fulfilled":3,"cancelled":3}} |
| default | last-noallow | afirst | 9 | 4 | 1 | 4 | {"0":3,"1":6} | {"0":9} | {"0":{"cancelled":1,"breached":1,"fulfilled":1},"1":{"fulfilled":3,"cancelled":3}} |
| atls | last | attentive | 10 | 5 | 0 | 5 | {} | {} | {} |
| atls | last | afirst | 15 | 5 | 2 | 8 | {"0":6,"1":8,"2":1} | {"0":15} | {"0":{"cancelled":4,"fulfilled":1,"breached":1},"1":{"fulfilled":4,"cancelled":4},"2":{"breached":1}} |
| atls | last-noallow | afirst | 15 | 5 | 2 | 8 | {"0":6,"1":8,"2":1} | {"0":15} | {"0":{"cancelled":4,"fulfilled":1,"breached":1},"1":{"fulfilled":4,"cancelled":4},"2":{"breached":1}} |

### Pins, replay, privacy, rev-2 checks (all arms, scenarios, seeds)

- flag-off pins on the 3 pinned seeds per config, every run: 66 match, 0 mismatch
- arm last, idle runs where flag-on h1200 equals flag-off h1200: 10; differs: 16
- replay (every 100 ticks, three runs per row): 858 runs, 2 with a mismatch; first few: default-last-noescrow 5000 attentive on t1100 world.characters.character-18.shortMorningStreak live=89 replay=90 | default-last-noescrow 5000 attentive hook t1100 world.characters.character-18.shortMorningStreak live=89 replay=90
- hook run economy equals no-hook run economy: 286/286
- checks passed: {"offer-not-stuck":406,"accepted-not-stuck":406,"offer-shape":406,"mate-card":4267,"mate-feed-terms":4260,"bystander-thread":11094,"bystander-card":6827,"bystander-feed-terms":6827,"carrier-card":406,"card-open":406,"card-threadid":406,"sender-known":405,"opener-feed-visible":405,"number-scan":405,"origin":405,"request-rule":3600}
- rev-2 checks (ok/bad): {"expired-leaves-request:ok":68,"expired-text:ok":68,"expired-unread-after-opener-read:ok":68,"expired-unread-if-never-read:ok":68,"card-close-note-no-penalty:ok":288,"cooldown-expired:ok":68,"cooldown-declined:ok":143,"card-close-note-breach-says-180:ok":55,"cooldown-breached:ok":55,"nln-sender-is-buyer:ok":67,"nln-text:ok":67,"nln-leaves-request:ok":67,"nln-no-relationship-write:ok":77,"nln-thread-dropped:ok":10}
- violations: {"mate-feed-treasury-draw(existing)":7}

### NPC baselines (flag-off, 13 seeds, default + ATLS)

- offer -> accepted latency: n=2721, min 1, p50 1, p90 1, max 1 (ticks)
- delivery deadline - issue tick: n=3758, min 2, p50 3, p90 5, max 6
- accepted -> fulfilled: n=1666, min 0, p50 0, p90 5, max 6

### Human breach causes (lazy, arm last)

- default: {"choice/deadline-infeasible":20}
- atls: {"choice/deadline-infeasible":29}

### Attentive decline reasons and answer latency

- default-last: accepted -> fulfilled n=4 (p50 4, max 5); offer -> accepted n=8 (p50 2, max 4); declines by reason {"stock":12}
- default-peer-walk: accepted -> fulfilled n=4 (p50 4, max 5); offer -> accepted n=8 (p50 2, max 4); declines by reason {"stock":12}
- default-peer-argmax: accepted -> fulfilled n=4 (p50 4, max 5); offer -> accepted n=8 (p50 2, max 4); declines by reason {"stock":10}
- atls-last: accepted -> fulfilled n=5 (p50 4, max 5); offer -> accepted n=10 (p50 2, max 4); declines by reason {"stock":13}
- atls-peer-walk: accepted -> fulfilled n=5 (p50 4, max 5); offer -> accepted n=10 (p50 2, max 4); declines by reason {"stock":13}
- atls-peer-argmax: accepted -> fulfilled n=7 (p50 4, max 5); offer -> accepted n=12 (p50 2, max 4); declines by reason {"stock":13}
