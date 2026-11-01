# Occupation and the population's response after conquest

Status: Re-spec (§9) after the [diagnosis](../../progress.md) on `feature/occupation` `562ffc1`; Lead rulings applied. Acceptance does **not** yet pass under the re-spec (claims bound and 2c; §9.6). Earlier: Accepted (#168).

**Sources**
- `game-vision.md:69`: occupation and the population's response are undecided.
- `roadmap.md:28`: occupation is tracked deferred.
- `game-vision.md:39`: "no … artificial rebellions solely to restore balance. Resistance must emerge from characters, material conditions, opportunities, and player action."

Deterministic, no AI calls, behind the `OCCUPATION` flag (default off).

**Measured offline** on `main` `ad75d50`, with `exileRecovery: true`, 1,200 ticks. No paid calls. The script `/tmp/h/oc.ts` is on the box and reads engine state only. Exile-on end hashes: 1847 `94de9c02…`, 2718 `7a3741c9…`, 4096 `af6eeaea…`.

## 1. What a claim does today

| | 1847 | 2718 | 4096 |
|---|---|---|---|
| Claims per run | 51 | 64 | 56 |
| Hold after a claim, ticks (median / p10 / p90) | 38 / 7 / 165 | 38 / 22 / 89 | 37 / 8 / 93 |
| Still held at t1200 | 3 | 3 | 3 |
| Ended holds that flip back to the previous faction | 43 / 48 | 61 / 61 | 32 / 53 |
| …of which within 120 ticks | 37 | 55 | 29 |
| Garrison at the claim (median, p10–p90) | 6 (3–9) | 6 (3–7) | 6 (3–7) |
| Stability before → after the claim (median) | 51.27 → 55 | 51.63 → 55 | 51.62 → 55 |
| Stability change over the next 60 ticks (median) | +1.8 | +1.8 | +1.8 |
| Garrison change over the next 60 ticks (median) | +2 | +1 | +2 |
| Holding tax rate differs from the previous faction's | 42 | 53 | 50 |
| …and is higher | 23 | 28 | 27 |
| Provision shortage within 60 ticks | 0 | 0 | 0 |
| Battle started at the port within 60 ticks | 26 | 34 | 26 |
| Previous-faction members docked there at t+60 (median, p10–p90) | 2 (1–5) | 3 (1–6) | 2 (1–4) |
| Population changed within 60 ticks | 0 | 0 | 0 |

Claim counts equal the exile-on sweep rows for these seeds (`progress.md` exile entry: 51 / 64 / 56).

**Readings**
- **A conquest calms a port.** `settlement-claimed` lifts stability to `max(55, stability)` (`CLAIM_STABILITY_FLOOR`, `state.ts:26`, `engine.ts:1629`). After that it drifts +0.03 per peaceful upkeep (`engine.ts:360–361`), which is +1.8 over 60 ticks.
- **Nothing reacts to the new holder.** Population, food and residents don't respond. The holder's tax applies at once (higher in about half of claims), but it moves stability only above 0.15 (`taxDrift`, `tax-rate.ts:74–79`).
- **Churn is ping-pong.** Most holds end within days and flip back to the previous faction: 43 / 48, 61 / 61 and 32 / 53 of ended holds. How the occupier behaves has no bearing on it.
- **Stability does not gate re-surrender at these garrisons.** `surrenderStabilityLimit` is 30 + 10 × (15 − garrison), capped at 80 (`state.ts:20–43`). At garrison 6 the limit is 80, so stability never decides a retake there. Resistance has to act through the garrison, output and characters, not through stability alone.

## 2. Mechanism

**Occupation record.** With the flag on, `settlement-claimed` carries `occupation: { tick, fromFactionId, byFactionId, fromRate }`. `applyEvent` stores it as `Settlement.occupation`, which is absent with the flag off. It is cleared by the next claim, by a secession of the port, or by integration (below).

**Harshness H ∈ [0, 1]**, recomputed on each upkeep from existing state only:

| Term | Weight | Input (existing state) | Why |
|---|---|---|---|
| Tax burden | 0.35 | clamp((holder rate − `fromRate`) / 0.10, 0, 1). `fromRate` is the previous holder's rate at the capture; only rises count, a cut reads 0 (§9.1) | A new holder taxing harder than the old one is the most common change (23 / 28 / 27 claims) |
| Food | 0.25 | Low stocks after upkeep: clamp(1 − provisions left after this upkeep's consumption / demand, 0, 1), from the upkeep's own `stocks.provisions` and `demand`. Replaces the shortage-in-24-ticks test, which can never fire (§9.2). No behaviour change to production; the subsistence floor is untouched | Material condition: how far short of one tick's ration the port is after eating |
| Conduct | 0.20 | min(1, contracts to the port breached in the last 240 ticks / **4**), the route-B count (`secession.ts:466–471`) (§9.4) | Broken promises by whoever now runs the port |
| Residents' grievance | 0.20 | 0.5 · min(1, previous-faction members docked / 3) + 0.5 · min(1, their mean earned grievance at the owner / **0.075**) (§9.3) | Named characters at the port who were loyal to the old faction and resent the new owner |

**Effects.** All are on existing fields, with no new roll and no new RNG draw:
1. **Unrest drift.** Each upkeep subtracts `0.10 · H` from stability, on top of today's drift. A benign occupation (H = 0) recovers as today. A fully harsh one (H = 1) nets −0.07 per tick, about −4.2 over 60 ticks. Lower stability already lowers worker output (`workerCondition`, `engine.ts:260`) and opens the secession gate at ≤ 55 (`secession.ts:430`).
2. **Withheld recruits.** No garrison regrowth while H ≥ 0.5. The people do not sign up for the occupier.
3. **Defection at the gate.** When a battle starts at an occupied port and the attacker's faction is `fromFactionId`, floor(garrison · H / 2) soldiers leave the garrison before the fight. They are recorded on `battle-started` as `occupationDefectors`. This is the "resistance from characters" channel: the retake the exile captains already attempt (exile recovery) gets easier when the occupier is harsh, and no easier when it is benign. Nothing starts a fight on its own.
4. **Integration.** After 240 ticks of occupation with H < 0.25 on the latest upkeep, the record clears with `occupation-integrated` (flag on only). From then on the port is ordinary. The 240 is the promise window and the exile half-life.

**Not included:**
- no spawned rebels;
- no forced secession;
- no population loss;
- no AI.

## 3. Defaults and why

| Default | Value | Why |
|---|---|---|
| Weights | 0.35 / 0.25 / 0.20 / 0.20 | Tax first because it is the measured common change; the weights sum to 1 |
| Tax scale | 0.10, rises only vs the previous holder's rate at capture | Two tax-drift bands (`TAX_DRIFT_PER_BAND` 0.03 per 0.05, `tax-rate.ts:21–23`) |
| Food | 1 − provisions after upkeep / demand | §9.2 |
| Conduct scale | 4 breaches | §9.4 |
| Grievance scale | 0.075 earned grievance | p90 of the measured non-zero range (§9.3) |
| Drift | 0.10 · H | At H = 1 it outweighs the +0.03 peaceful drift; at H ≤ 0.3 it nets ≥ 0 |
| Regrowth stop | H ≥ 0.5 | Half-harsh; the median claim garrison is 6, so the stop matters |
| Defection | garrison · H / 2 | At most half; at garrison 6 and H = 1, that is 3 soldiers |
| Integration | 240 ticks, H < 0.25 | Reuses `PROMISE_WINDOW_TICKS` and the exile decay |

## 4. Hash and fixture impact

- **Flag off:** byte-identical. There is no new field on any event or settlement, and no draw. The current pins hold:
  - 72 ticks `66e8ccb7` / `b4ccedab` / `b04c5ac4`;
  - 1,200 ticks `b51aa07a` / `091f7628` / `25bdbf15`.
  Once the Engineer's exile default-on lands, the exile-on pins hold the same way.
- **Flag on:** every seed moves from the first claim. That lands at t48 inside the 72-tick fixture (`progress.md` port-balance entry), so the 72-tick fixture moves on any seed with an early claim. Re-pin only when the flag is turned on by default. That is a later, separate ruling.

## 5. Acceptance (property-based, against the exile-on baseline)

1. **Flag off** reproduces the current pins and event counts exactly.
2. **Harsh vs benign** (re-spec, §9.5). Bucket occupations by mean H over their first 60 ticks into **tertiles** of the pooled flag-on distribution over the 13 seeds: benign = bottom third, harsh = top third. Harsh occupations show more local resistance than benign ones:
   - **2a (gated):** a larger median stability loss over 60 ticks from **upkeeps only** (battle-free: battle losses at the port are excluded). The raw 2a, with battles, is reported but not gated;
   - **2b:** more defectors per retake attempt;
   - **2c:** a higher flip-back-within-120 rate.
   The benign bucket's flip-back rate is not required to fall.
3. **No new wipeouts** compared with the exile-on sweep.
4. **Secessions:**
   - the 13-seed median is within ±1 of exile-on (2);
   - at least 7 / 13 seeds have at least one secession.
5. **Integration happens:** at least one `occupation-integrated` on at least half the seeds. Permanent churn on the rest is allowed.
6. **No resistance without a cause:** no defector and no unrest drift at any occupation with H = 0. A test asserts it.
7. **Churn guard** (Lead, after #168; flag on vs the exile-on baseline). Resistance should make holds differ by harshness, not make ports change hands faster.
   - **Port changes:** the 13-seed total stays at or below 1.5 × the exile-on total. The baseline total is 713 (13-seed sweep on `5e06c4c`, `after-triage.md`), so the limit is 1,069 (1.5 × 713 = 1,069.5, rounded down).
   - **Hold length:** on each of 1847, 2718 and 4096, the median hold after a claim is not below the exile-on baseline from §1: 38 / 38 / 37 ticks.
   - **Claims (re-spec):** the 13-seed **aggregate** claims with the flag on are at least 0.75 × the exile-on aggregate (682 → ≥ 512). Not per seed: the drift effect is a trajectory switch, and per-seed differences in dynamism are acceptable (Lead ruling).
   - The sweep (§6) reports all three and exits 1 on failure.

## 6. Measurement plan

- **13-seed sweep:** extend `scripts/exile-sweep.ts` with `--occupation`. Add rows for:
  - claims;
  - hold median;
  - flip-back within 120;
  - defectors;
  - integrations;
  - harsh / benign counts;
  - secessions;
  - wipeouts.
  Run off / on with exile on in both. Exit 1 on failure of §5.
- **Dynamism:** for 1847, 2718 and 4096, run `npm run dynamism -- --events occ.jsonl --baseline exile.jsonl --json out-<seed>.json`. Report the deltas for battles, ownership changes, claims and secessions.
- **Rerun** `/tmp/h/oc.ts` with the flag on for §1's table.
- Make no paid calls.

## 7. Open questions (recommended default in bold)

1. **Keep the 55 claim floor?** **Keep it.** It stops an instant re-surrender spiral. Occupation drift then works from 55.
2. **Do unaffiliated residents count in the grievance term?** **No in v1.** Only previous-faction members have a measured presence (median 2–3 at t+60).
3. **Does defection help any attacker, or only the previous faction?** **Previous faction only.** That ties resistance to loyalty, not to opportunism.
4. **Does a harsh occupation lose population, or do people flee?** **Defer.** Population never changes today, and migration is a separate system.
5. **Is harshness news?** **Defer.** The port's stability is already posted with news items (`types.ts` `news`); a "harsh occupation" item can come later.
6. **Does a successful retake of a harsh occupation earn the retaker grievance relief or loyalty?** **Defer**, to keep the slice to one event type.

## 8. Lead rulings (after #168)

The Lead accepted all six §7 defaults:
1. Keep the 55 claim floor.
2. Unaffiliated residents do not count in v1.
3. Defection helps only the previous faction.
4. Population loss and flight are deferred.
5. Harshness news is deferred.
6. Retake rewards are deferred.

The Lead added the churn guard, now acceptance item 7 in §5.

## 9. Re-spec after the diagnosis (Lead rulings, 2026-11-01)

The diagnosis is the `progress.md` entry "Occupation diagnosis" on `feature/occupation` `562ffc1`. It found that under the #168 terms H almost never reaches 0.5 (mean-H max 0.502), that food can never fire, that the grievance half of the residents term never fires, and that conduct is mis-scaled. The Lead ruled the changes below.

**How these were measured.** Offline, no AI calls, $0 spent. I ran the `562ffc1` engine in a scratch worktree, with exile on, 1,200 ticks, on the 13 seeds 1847, 2718, 4096, 1000, 2000, …, 10000. The prototype of the re-spec terms is `occupation-respec/prototype.patch`, with each change behind an env var. The scripts are in [occupation-respec/](occupation-respec/). Check: with the #168 settings, the prototype reproduces the diagnosis exactly (claims 682 → 513, port changes 713 → 526, 1 harsh occupation at ≥ 0.5, mean-H max 0.5023).

### 9.1 Tax: rises only, against the previous holder's rate at the capture

- **Spec:** `fromRate` is the previous holder's rate at the capture. The term is clamp((holder rate − `fromRate`) / 0.10, 0, 1), so a cut reads 0.
- **No code change:** this is already the #168 formula (`occupation.ts:37`). The spec now states it.
- **Data (diagnosis):** rate − `fromRate` has median 0, p90 0.057 and max 0.114. There are 250 negative, 13 zero and 250 positive.
- **Consequence:** the term stays 0 on about half of occupations. The reason is ping-pong holds, which swap the raiser and the cutter. This is accepted as ruled.

### 9.2 Food: low stocks after upkeep

- **Spec:** food = clamp(1 − p / d, 0, 1), where p is provisions left after this upkeep's consumption and d is this upkeep's demand. Both come from the upkeep event's `stocks.provisions` and `demand`.
- **Same as before:** state, RNG and production are unchanged. The subsistence floor (`engine.ts:267–268`) is not touched. The term only reads the stock.
- **Why graded rather than a threshold:** in the occupations' first 60 ticks, p / d has median 0.43, p25 0, p75 0.56 and p90 1.12 (n = 21,765 upkeeps). The share of upkeeps below a cut k:

  | k | Share of upkeeps below k |
  |---|---|
  | 0.25 | 46 % |
  | 0.5 | 65 % |
  | 1 | 83 % |
  | 2 | 96 % |

  A threshold of 1 or more would be on almost everywhere.
- **Caveat: the term is mostly a property of the port, not of the occupier.** Median p / d by port:

  | Port | Median p / d | p10–p90 |
  |---|---|---|
  | Crown Harbor | 0 | 0–0 |
  | Glassport | 0.41 | 0.22–0.44 |
  | Cinder Key | 0.56 | 0.56–1.12 |

  Market purchases empty the shelf every tick. Food therefore adds a near-constant per port: about 1.0 × 0.25 at Crown Harbor, about 0.6 × 0.25 at Glassport and about 0.4 × 0.25 at Cinder Key. It does not separate harsh holders from benign ones on the same port.
- **Option for the Lead (not built):** measure food against the port's own level before the claim.

### 9.3 Residents: grievance rescaled to its measured range

- **Measured** (#168 settings, all occupied upkeeps with at least one previous-faction member docked, 13 seeds):
  - The per-upkeep mean earned grievance at the owner is non-zero on 1,207 of 29,402 upkeeps (4.1 %).
  - Non-zero values: p10 0.0068, p25 0.0102, median 0.0145, p75 0.0313, p90 0.0755, max 0.1068.
  - Per member-tick, the non-zero values reach a max of 0.1601 (p90 0.1541, n = 943 of 49,894). Averaging over the docked members dilutes them.
- **New scale: 0.075** (p90 of the non-zero per-upkeep means, 0.0755, rounded).
  - At the old 0.12 (`HATED_GRIEVANCE`), no upkeep ever saturates the term: the max is 0.107.
  - At 0.075, the top tenth of non-zero readings saturates, and the median non-zero reading gives 0.19 of the half-term.
  - The term stays 0 whenever no grievance has been earned, which is about 96 % of upkeeps.

### 9.4 Conduct: a scale of 4 breaches

- **Spec:** min(1, breaches / 4).
- **Data (diagnosis):** breaches in 240 ticks have median 1.97, p90 6.25 and max 15.
  - The median occupation now reads about 0.49 of the term, against 0.20 at the old scale of 10.
  - The p90 saturates.

### 9.5 Acceptance: tertiles, battle-free 2a, aggregate claims

The spec text is §5 items 2 and 7. Tertile cut points come from the pooled flag-on run under the full re-spec (n = 307 occupations): **t1 = 0.2596, t2 = 0.3919**. Mean H has min 0.0524, median 0.3131 and max 0.8000. For comparison, the tertiles at the #168 settings were 0.1200 / 0.2235 (n = 513).

### 9.6 Result under the full re-spec (drift 0.10 · H as specced)

| Item | Result | Pass? |
|---|---|---|
| 2a, upkeeps only (gated) | median loss: harsh 1.125 vs benign −0.490 | yes |
| 2a, raw (reported) | harsh 1.750 vs benign −0.332 | — |
| 2b | defectors per retake: harsh 1.412 (72 / 51) vs benign 0.475 (29 / 61) | yes |
| 2c | flip-back ≤ 120: harsh 35 / 93 (0.38) vs benign 48 / 86 (0.56) | **no** |
| 3 | no new wipeouts | yes |
| 4 | secessions 31 → 20, median 2 → 1; 7 / 13 seeds with ≥ 1 | yes |
| 5 | integrations on 10 / 13 seeds (20 total) | yes |
| 7a | port changes 327 ≤ 1,069 | yes |
| 7b | hold median 61 / 95 / 68 on 1847 / 2718 / 4096, against 38 / 38 / 37 | yes |
| **Claims** | **307 vs ≥ 511.5** (0.45 ×) | **no** |

Claims by seed, off → on:

| 1847 | 2718 | 4096 | 1000 | 2000 | 3000 | 4000 | 5000 | 6000 | 7000 | 8000 | 9000 | 10000 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 51→26 | 64→17 | 56→25 | 42→19 | 50→30 | 42→20 | 63→37 | 55→34 | 50→12 | 61→30 | 62→22 | 58→28 | 28→7 |

**Sensitivity:** each row below is one variant. Claims are 13-seed totals; the bound is ≥ 511.5.

| Variant | Claims | 2c | Other failures |
|---|---|---|---|
| #168 settings | 513 | pass | — |
| Ruled conduct and grievance, old food | 490 | pass | claims only |
| Full re-spec, food against 0.25 · demand | 404 | fail | — |
| Full re-spec, grievance scale 0.12, conduct scale 10 | 384 | — | 4a/4b |
| Full re-spec, no defection | 385 | — | — |
| Full re-spec, no defection and no drift | 416 | — | — |

**Reading:** every variant that raises H lowers the aggregate below 0.75 ×.
- **Hold length:** holds lengthen in every variant, so fewer claims fit into 1,200 ticks. This is the effect item 7b asks for. Item 7b and the 0.75 × bound pull against each other.
- **2c:** under the re-spec, the harsh tertile flips back *less* often. The harsh ports are the ones the occupier keeps longest, and its H is still high when the retake comes.

### 9.7 Drift: keep as specced (no delay)

**Verdict: the early nudge is not unphysical, and it does not cause the re-spec's claims shortfall. Keep 0.10 · H from the first upkeep.**

- **Size of the nudge:** the first flag-on upkeep after a claim moves stability by −0.01 to −0.02 on a 0–100 scale (diagnosis: 55.02 vs 55.03 and 55.009 vs 55.03). That is the specced 0.10 · H at H 0.03–0.21. It is a real, small effect, and no rule is bypassed.
- **Why it matters:** the downstream divergence is the simulation's sensitivity to small differences, not a defect in the nudge. The diagnosis showed that doubling the drift restores claims (615 vs 544), which is not monotone.
- **Under the re-spec, drift strength does not track claims.** Totals by drift strength, everything else ruled:

  | Drift | Claims |
  |---|---|
  | 0 | 346 |
  | 0.05 · H | 343 |
  | 0.10 · H | 307 |
  | 0.20 · H | 340 |
  | 0.40 · H | 316 |

  Removing the drift entirely still leaves claims at 0.51 ×. A delay would not reach the bound.
- **What else costs claims:** removing defection gives 385. Removing both drift and defection gives 416, so the regrowth stop at H ≥ 0.5 also costs claims. That stop is now reached: 49 occupations have mean H ≥ 0.5.

### 9.8 Decisions needed from the Lead

1. **Claims bound.** Under the ruled terms, the bound fails at 0.45 ×, and no tested variant reaches 0.75 ×. Options:
   - (a) lower it;
   - (b) replace it with a bound on occupied-port-ticks or port changes. Item 7a already bounds churn from above;
   - (c) keep it and look for a weaker H.
2. **2c.** It fails under the re-spec. Keep 2c, drop it, or measure it only over retakes while H is still high.
3. **Food.** Accept a port-structural food term, or measure it against the port's level before the claim (§9.2).

Spend: $0. No live or paid calls were made.
