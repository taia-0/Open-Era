
### default

| variant | scenario | human offers (13 seeds) | per 100 ticks (per seed, mean) | seeds with ≥1 | accepted | declined | expired | fulfilled | breached | cancelled after accept | open at end | answered/offered |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| last-strict | idle | 9 | 0.058 | 9 | 0 | 0 | 8 | 0 | 0 | 0 | 1 | 0/9 |
| last-strict | attentive | 20 | 0.128 | 9 | 8 | 12 | 0 | 4 | 0 | 4 | 0 | 20/20 |
| last-strict | lazy | 29 | 0.186 | 9 | 29 | 0 | 0 | 0 | 20 | 9 | 0 | 29/29 |
| last-relaxed | idle | 51 | 0.327 | 13 | 0 | 0 | 48 | 0 | 0 | 0 | 3 | 0/51 |
| last-relaxed | attentive | 370 | 2.372 | 13 | 9 | 361 | 0 | 5 | 0 | 4 | 0 | 370/370 |
| last-relaxed | lazy | 316 | 2.026 | 13 | 316 | 0 | 0 | 0 | 279 | 37 | 0 | 316/316 |
| first-strict | idle | 17 | 0.109 | 11 | 0 | 0 | 15 | 0 | 0 | 0 | 2 | 0/17 |
| first-strict | attentive | 27 | 0.173 | 11 | 15 | 12 | 0 | 12 | 0 | 3 | 0 | 27/27 |
| first-strict | lazy | 58 | 0.372 | 11 | 58 | 0 | 0 | 0 | 40 | 18 | 0 | 58/58 |
| first-relaxed | idle | 59 | 0.378 | 13 | 0 | 0 | 55 | 0 | 0 | 0 | 4 | 0/59 |
| first-relaxed | attentive | 403 | 2.583 | 13 | 14 | 389 | 0 | 10 | 0 | 4 | 0 | 403/403 |
| first-relaxed | lazy | 408 | 2.615 | 13 | 408 | 0 | 0 | 0 | 374 | 34 | 0 | 408/408 |

### atls

| variant | scenario | human offers (13 seeds) | per 100 ticks (per seed, mean) | seeds with ≥1 | accepted | declined | expired | fulfilled | breached | cancelled after accept | open at end | answered/offered |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| last-strict | idle | 9 | 0.058 | 7 | 0 | 0 | 9 | 0 | 0 | 0 | 0 | 0/9 |
| last-strict | attentive | 23 | 0.147 | 7 | 10 | 13 | 0 | 5 | 0 | 5 | 0 | 23/23 |
| last-strict | lazy | 37 | 0.237 | 7 | 37 | 0 | 0 | 0 | 29 | 8 | 0 | 37/37 |
| last-relaxed | idle | 58 | 0.372 | 13 | 0 | 0 | 52 | 0 | 0 | 0 | 6 | 0/58 |
| last-relaxed | attentive | 398 | 2.551 | 13 | 11 | 387 | 0 | 5 | 1 | 5 | 0 | 398/398 |
| last-relaxed | lazy | 335 | 2.147 | 13 | 335 | 0 | 0 | 0 | 286 | 48 | 1 | 335/335 |
| first-strict | idle | 13 | 0.083 | 9 | 0 | 0 | 13 | 0 | 0 | 0 | 0 | 0/13 |
| first-strict | attentive | 29 | 0.186 | 9 | 15 | 14 | 0 | 8 | 0 | 7 | 0 | 29/29 |
| first-strict | lazy | 76 | 0.487 | 9 | 76 | 0 | 0 | 0 | 43 | 33 | 0 | 76/76 |
| first-relaxed | idle | 62 | 0.397 | 13 | 0 | 0 | 56 | 0 | 0 | 0 | 6 | 0/62 |
| first-relaxed | attentive | 508 | 3.256 | 13 | 17 | 491 | 0 | 10 | 0 | 7 | 0 | 508/508 |
| first-relaxed | lazy | 404 | 2.590 | 13 | 402 | 2 | 0 | 0 | 332 | 70 | 0 | 404/404 |

### Economy against flag-off (sum over 13 seeds; flag-on minus flag-off, same seed)

| config | variant | scenario | NPC offers | contracts fulfilled | contracts breached | treasury total | claims | port changes | captures | shortage ticks |
|---|---|---|---|---|---|---|---|---|---|---|
| default | last-strict | idle | 1865 → 1823 (-42) | 849 → 799 (-50) | 449 → 467 (+18) | 169633.42 → 169054.39 (-579.03) | 682 → 630 (-52) | 711 → 660 (-51) | 247 → 220 (-27) | 14745 → 14741 (-4) |
| default | last-strict | attentive | 1865 → 1748 (-117) | 849 → 764 (-85) | 449 → 441 (-8) | 169633.42 → 179469.69 (+9836.27) | 682 → 659 (-23) | 711 → 694 (-17) | 247 → 232 (-15) | 14745 → 14732 (-13) |
| default | last-strict | lazy | 1865 → 1892 (+27) | 849 → 842 (-7) | 449 → 471 (+22) | 169633.42 → 155012.23 (-14621.19) | 682 → 692 (+10) | 711 → 717 (+6) | 247 → 233 (-14) | 14745 → 14741 (-4) |
| default | last-relaxed | idle | 1865 → 1993 (+128) | 849 → 860 (+11) | 449 → 480 (+31) | 169633.42 → 172279.97 (+2646.55) | 682 → 650 (-32) | 711 → 674 (-37) | 247 → 241 (-6) | 14745 → 14741 (-4) |
| default | last-relaxed | attentive | 1865 → 2079 (+214) | 849 → 791 (-58) | 449 → 368 (-81) | 169633.42 → 170779.05 (+1145.63) | 682 → 560 (-122) | 711 → 597 (-114) | 247 → 186 (-61) | 14745 → 14732 (-13) |
| default | last-relaxed | lazy | 1865 → 1912 (+47) | 849 → 755 (-94) | 449 → 629 (+180) | 169633.42 → 207801.4 (+38167.98) | 682 → 711 (+29) | 711 → 753 (+42) | 247 → 244 (-3) | 14745 → 14741 (-4) |
| default | first-strict | idle | 1865 → 1724 (-141) | 849 → 780 (-69) | 449 → 392 (-57) | 169633.42 → 161144.6 (-8488.82) | 682 → 613 (-69) | 711 → 639 (-72) | 247 → 212 (-35) | 14745 → 14727 (-18) |
| default | first-strict | attentive | 1865 → 1684 (-181) | 849 → 736 (-113) | 449 → 415 (-34) | 169633.42 → 181435.55 (+11802.13) | 682 → 667 (-15) | 711 → 698 (-13) | 247 → 211 (-36) | 14745 → 14708 (-37) |
| default | first-strict | lazy | 1865 → 1875 (+10) | 849 → 800 (-49) | 449 → 481 (+32) | 169633.42 → 170160.56 (+527.14) | 682 → 584 (-98) | 711 → 612 (-99) | 247 → 209 (-38) | 14745 → 14731 (-14) |
| default | first-relaxed | idle | 1865 → 1757 (-108) | 849 → 788 (-61) | 449 → 371 (-78) | 169633.42 → 168702.54 (-930.88) | 682 → 581 (-101) | 711 → 604 (-107) | 247 → 213 (-34) | 14745 → 14730 (-15) |
| default | first-relaxed | attentive | 1865 → 2014 (+149) | 849 → 747 (-102) | 449 → 409 (-40) | 169633.42 → 182361.95 (+12728.53) | 682 → 614 (-68) | 711 → 631 (-80) | 247 → 217 (-30) | 14745 → 14710 (-35) |
| default | first-relaxed | lazy | 1865 → 1906 (+41) | 849 → 724 (-125) | 449 → 695 (+246) | 169633.42 → 196654.87 (+27021.45) | 682 → 544 (-138) | 711 → 586 (-125) | 247 → 182 (-65) | 14745 → 14732 (-13) |
| atls | last-strict | idle | 1893 → 1730 (-163) | 817 → 761 (-56) | 466 → 413 (-53) | 105834.7 → 108129.93 (+2295.23) | 497 → 521 (+24) | 537 → 561 (+24) | 214 → 209 (-5) | 14584 → 14620 (+36) |
| atls | last-strict | attentive | 1893 → 1630 (-263) | 817 → 708 (-109) | 466 → 395 (-71) | 105834.7 → 108639.04 (+2804.34) | 497 → 489 (-8) | 537 → 536 (-1) | 214 → 190 (-24) | 14584 → 14629 (+45) |
| atls | last-strict | lazy | 1893 → 1674 (-219) | 817 → 704 (-113) | 466 → 434 (-32) | 105834.7 → 108421.41 (+2586.71) | 497 → 474 (-23) | 537 → 520 (-17) | 214 → 189 (-25) | 14584 → 14630 (+46) |
| atls | last-relaxed | idle | 1893 → 1630 (-263) | 817 → 720 (-97) | 466 → 355 (-111) | 105834.7 → 110526.6 (+4691.9) | 497 → 488 (-9) | 537 → 536 (-1) | 214 → 185 (-29) | 14584 → 14623 (+39) |
| atls | last-relaxed | attentive | 1893 → 2201 (+308) | 817 → 798 (-19) | 466 → 447 (-19) | 105834.7 → 113023.42 (+7188.72) | 497 → 508 (+11) | 537 → 554 (+17) | 214 → 187 (-27) | 14584 → 14631 (+47) |
| atls | last-relaxed | lazy | 1893 → 1888 (-5) | 817 → 676 (-141) | 466 → 661 (+195) | 105834.7 → 132180.47 (+26345.77) | 497 → 428 (-69) | 537 → 482 (-55) | 214 → 156 (-58) | 14584 → 14625 (+41) |
| atls | first-strict | idle | 1893 → 1754 (-139) | 817 → 742 (-75) | 466 → 444 (-22) | 105834.7 → 92981.22 (-12853.48) | 497 → 513 (+16) | 537 → 547 (+10) | 214 → 192 (-22) | 14584 → 14575 (-9) |
| atls | first-strict | attentive | 1893 → 1584 (-309) | 817 → 656 (-161) | 466 → 423 (-43) | 105834.7 → 107651.72 (+1817.02) | 497 → 491 (-6) | 537 → 538 (+1) | 214 → 186 (-28) | 14584 → 14640 (+56) |
| atls | first-strict | lazy | 1893 → 1681 (-212) | 817 → 681 (-136) | 466 → 461 (-5) | 105834.7 → 120823.18 (+14988.48) | 497 → 450 (-47) | 537 → 496 (-41) | 214 → 165 (-49) | 14584 → 14645 (+61) |
| atls | first-relaxed | idle | 1893 → 1824 (-69) | 817 → 723 (-94) | 466 → 473 (+7) | 105834.7 → 104969.06 (-865.64) | 497 → 525 (+28) | 537 → 562 (+25) | 214 → 215 (+1) | 14584 → 14566 (-18) |
| atls | first-relaxed | attentive | 1893 → 2050 (+157) | 817 → 701 (-116) | 466 → 379 (-87) | 105834.7 → 107363.51 (+1528.81) | 497 → 453 (-44) | 537 → 500 (-37) | 214 → 143 (-71) | 14584 → 14614 (+30) |
| atls | first-relaxed | lazy | 1893 → 1727 (-166) | 817 → 610 (-207) | 466 → 665 (+199) | 105834.7 → 123446.59 (+17611.89) | 497 → 473 (-24) | 537 → 540 (+3) | 214 → 164 (-50) | 14584 → 14662 (+78) |

### Pins, replay, privacy (all variants, scenarios, seeds)

- flag-off pins on the 3 pinned seeds per config, every run: 72 match, 0 mismatch
- idle runs where flag-on h1200 equals flag-off h1200: 16; differs: 88
- replay (every 100 ticks): 936 runs, 0 with a mismatch
- hook run economy equals no-hook run economy: 312/312
- checks passed: {"offer-not-stuck":3719,"accepted-not-stuck":3719,"offer-shape":3719,"mate-card":33897,"mate-feed-terms":33490,"bystander-thread":100376,"bystander-card":66479,"bystander-feed-terms":66479,"carrier-card":3719,"card-open":3719,"card-threadid":3719,"sender-known":3710,"opener-feed-visible":3710,"number-scan":3710,"origin":3710,"request-rule":3117}
- violations: {"mate-feed-treasury-draw(existing)":407}

### NPC baselines (flag-off, 13 seeds, default + ATLS)

- offer → accepted latency: n=2721, min 1, p50 1, p90 1, max 1 (ticks)
- delivery deadline − issue tick: n=3758, min 2, p50 3, p90 5, max 6
- accepted → fulfilled: n=1666, min 0, p50 0, p90 5, max 6
- attentive default-last-strict: accepted → fulfilled n=4 (p50 4, max 5); offer → accepted n=8 (p50 2, max 4); declines by reason {"stock":12}
- attentive atls-last-strict: accepted → fulfilled n=5 (p50 4, max 5); offer → accepted n=10 (p50 2, max 4); declines by reason {"stock":13}
- attentive default-last-relaxed: accepted → fulfilled n=5 (p50 4, max 5); offer → accepted n=9 (p50 2, max 4); declines by reason {"stock":361}
- attentive atls-last-relaxed: accepted → fulfilled n=5 (p50 3, max 5); offer → accepted n=11 (p50 2, max 89); declines by reason {"stock":387}
- attentive default-first-strict: accepted → fulfilled n=12 (p50 4, max 5); offer → accepted n=15 (p50 2, max 4); declines by reason {"stock":12}
- attentive atls-first-strict: accepted → fulfilled n=8 (p50 2, max 4); offer → accepted n=15 (p50 2, max 4); declines by reason {"stock":14}
- attentive default-first-relaxed: accepted → fulfilled n=10 (p50 4, max 5); offer → accepted n=14 (p50 2, max 4); declines by reason {"stock":389}
- attentive atls-first-relaxed: accepted → fulfilled n=10 (p50 3, max 4); offer → accepted n=17 (p50 2, max 4); declines by reason {"stock":491}

### Human breach causes (lazy, all variants)

- default-last-strict: {"choice/deadline-infeasible":20}
- default-last-relaxed: {"choice/deadline-infeasible":270,"capture/":9}
- default-first-strict: {"choice/deadline-infeasible":39,"capture/":1}
- default-first-relaxed: {"choice/deadline-infeasible":373,"capture/":1}
- atls-last-strict: {"choice/deadline-infeasible":29}
- atls-last-relaxed: {"choice/deadline-infeasible":284,"capture/":2}
- atls-first-strict: {"choice/deadline-infeasible":43}
- atls-first-relaxed: {"choice/deadline-infeasible":327,"capture/":5}

### UI state of the human's contracts at the last tick (hook run, summed)

- default-last-strict attentive: {"declined":12,"cancelled":4,"fulfilled":4}
- default-last-strict lazy: {"breached":20,"cancelled":9}
- default-last-relaxed attentive: {"declined":361,"cancelled":4,"fulfilled":5}
- default-last-relaxed lazy: {"breached":279,"cancelled":37}
- default-first-strict attentive: {"declined":12,"fulfilled":12,"cancelled":3}
- default-first-strict lazy: {"breached":40,"cancelled":18}
- default-first-relaxed attentive: {"declined":389,"fulfilled":10,"cancelled":4}
- default-first-relaxed lazy: {"breached":374,"cancelled":34}
- atls-last-strict attentive: {"fulfilled":5,"declined":13,"cancelled":5}
- atls-last-strict lazy: {"breached":29,"cancelled":8}
- atls-last-relaxed attentive: {"declined":387,"fulfilled":5,"cancelled":5,"breached":1}
- atls-last-relaxed lazy: {"breached":286,"cancelled":48,"accepted":1}
- atls-first-strict attentive: {"declined":14,"fulfilled":8,"cancelled":7}
- atls-first-strict lazy: {"breached":43,"cancelled":33}
- atls-first-relaxed attentive: {"declined":491,"fulfilled":10,"cancelled":7}
- atls-first-relaxed lazy: {"breached":332,"cancelled":70,"declined":2}

### Request tab after human offers (hook run; request count at each offer, then at t=1200)

- default-last-strict idle: request tab at t=1200 per seed [14,12,14,15,12,14,13,13,13,12,14,12,13]; openers 9, contract drops 0
- atls-last-strict idle: request tab at t=1200 per seed [12,13,13,13,12,15,15,14,14,12,13,15,17]; openers 9, contract drops 0
