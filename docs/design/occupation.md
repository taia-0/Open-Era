# Occupation and the population's response after conquest

Status: Open / proposal (spec c from [after triage](after-triage.md)).

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
| Tax burden | 0.35 | clamp((holder rate − `fromRate`) / 0.10, 0, 1) | A new holder taxing harder than the old one is the most common change (23 / 28 / 27 claims) |
| Food | 0.25 | 1 if the port had a provisions shortage in the last 24 ticks, else 0 (`consumedStocks` shortage, `engine.ts:354`) | Material condition. 0 today, but live when supply breaks |
| Conduct | 0.20 | min(1, contracts to the port breached in the last 240 ticks / 10), the route-B count (`secession.ts:466–471`) | Broken promises by whoever now runs the port |
| Residents' grievance | 0.20 | 0.5 · min(1, previous-faction members docked / 3) + 0.5 · min(1, their mean earned grievance at the owner / 0.12) (route C's earned-grievance rule, `secession.ts:476–478`) | Named characters at the port who were loyal to the old faction and resent the new owner |

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
| Tax scale | 0.10 | Two tax-drift bands (`TAX_DRIFT_PER_BAND` 0.03 per 0.05, `tax-rate.ts:21–23`) |
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
2. **Harsh vs benign.** Bucket occupations by mean H over their first 60 ticks: harsh ≥ 0.5, benign < 0.25. Over the 13-seed sweep, harsh occupations show more local resistance than benign ones:
   - a larger median stability loss over 60 ticks;
   - more defectors per retake attempt;
   - a higher flip-back-within-120 rate.
   The benign bucket's flip-back rate is not required to fall.
3. **No new wipeouts** compared with the exile-on sweep.
4. **Secessions:**
   - the 13-seed median is within ±1 of exile-on (2);
   - at least 7 / 13 seeds have at least one secession.
5. **Integration happens:** at least one `occupation-integrated` on at least half the seeds. Permanent churn on the rest is allowed.
6. **No resistance without a cause:** no defector and no unrest drift at any occupation with H = 0. A test asserts it.

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
