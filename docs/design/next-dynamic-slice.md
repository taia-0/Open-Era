# Next dynamic slice — candidates and recommendation

Status: Open / proposal. Measured offline on `main` at `c9ce9b7` (no API calls). Flag-off hashes reproduce the pins in `progress.md`: 1847 `b51aa07a`, 2718 `091f7628`, 4096 `25bdbf15` (1,200 ticks). Scripts: `/tmp/h/nx.ts` and `/tmp/h/nx2.ts` on the box (they read engine state only).

## What the measurements show (1,200 ticks, Free Tide = FT)

| Seed | FT portless ticks | Spells (lost → regained) | FT decisions while portless | Rest share while portless | Raid in top-6 while portless | At a hostile port | Median troops | FT members at end | Secessions |
|---|---|---|---|---|---|---|---|---|---|
| 1847 | 201 | 816→819, 838→839, 1003→1057, 1058→end | 545 | 219 (40%) | 3 | 430 | 253 | 3 | 4 |
| 2718 | 71 | 40→49, 439→461, 963→1003 | 375 | 193 (51%) | 33 | 324 | 227 | 6 | 0 |
| 4096 | 575 | 365→382, 484→524, 563→622, 742→end | 852 | 662 (78%) | 4 | 380 | 372 | 1 | 4 |

Readings:
- The 2718 caveat on current main is a 9-tick spell (t40→t49), not a dead faction. The run's longest dead stretch is 4096: FT is portless from t742 to the end (458 ticks).
- While portless, FT captains mostly sit **at a hostile port with hundreds of troops** and rest. The landless raid gate (`src/sim/engine.ts:917–926`: troops ≥ 25, garrison ≥ 8 when landless, 18-tick cooldown, no open battle) should be open for many of them, yet a raid shows in the recorded top-6 only 3 / 33 / 4 times. Why it fails or loses (gate, cooldown, belief, or score) is **not yet traced**. That trace is step 1 of the recommended slice.
- The tax step freezes while portless (`src/sim/tax-rate.ts:241–246`), so the pilot-A brain gets no calls in these stretches either.

## Candidates

### A. Exile recovery — landless captains try to win a port back (recommended)
- **Payoff:** turns the longest dead stretches (201 / 71 / 575 portless ticks, 40–78% rest) into raids, claims and counter-claims. It also answers "resistance must emerge from… material conditions" (`game-vision.md:37–39`).
- **Depends on:** the built landless raid gate (`engine.ts:917`) and the `portless-recovery.md` / `portless-diagnosis.md` notes. Needs no AI.
- **Hash:** changes the hash on any seed with a portless spell, including 2718 at t40, so the 72-tick fixture for 2718 may move. Put it behind a flag defaulting off, with the flag-off hash byte-identical.
- **Cost per run:** $0.
- **Size:** S–M, about 1–2 days: a trace, then one scoring term and one travel pull.

### B. Brain-written reasons in the feed
- **Payoff:** legibility. Today the feed reasons are fixed strings: "treasury short", unrest, and "ruler's choice" when `finalChoice ≠ scorerChoice` (`src/dashboard/wording.ts:1233–1255`, line 1250). Brain reasons exist only in `ai-weighted.ts` (`templateReason`, lines 12/148/164) and never reach the feed.
- **Depends on:** pilot A plus slices 3–5. Reasons are kept on `data.ai`.
- **Hash:** neutral (`stateHash` covers world state only, per the M33 rule). It changes the event JSON only when the flag is on.
- **Cost per run (estimate):** with headline events only (tax steps 33 / 27 / 30 per `docs/design/README.md:59`, plus secessions 4 / 0 / 4), that is at most 37 calls. At the assumed $0.002893 per call (2,000 tokens in / 64 out) this is ≈ $0.11 per run (37 × 0.002893). The estimate has not been checked live.
- **Size:** S. Note that it does not change what happens, only how it reads.

### C. Jev picker for World Government members
- **Payoff:** symmetry. Both sides' captains get personality-driven picks, so it is no longer only FT.
- **Depends on:** slices 3–5 being accepted.
- **Hash:** neutral when the flag is off. When on, it changes the replay.
- **Cost per run:** same order as slice 4 per pick. The WG pick count is not measured here.
- **Size:** M. It adds spend before slice 5 has proven the FT picker live.

### D. Claim grace
- **Payoff:** stops the re-offer churn. Every loss is an accepted-surrender claim (`engine.ts:1565`), and a 120-tick grace halves claims (39/27/42 → 17/12/20, `portless-diagnosis.md`).
- **Hash:** changes the hash.
- **Cost per run:** $0.
- **Size:** S.
- **Risk:** fewer claims means *less* churn, which is the opposite of the goal here. Keep it as a balance knob, not as the slice.

## Recommendation: A, exile recovery

**Scope**
1. **Trace (offline, no behaviour change).** For each FT decision while portless at a hostile port, record which raid-gate clause fails (troops, garrison < 8, cooldown, open battle) and, when the raid is legal, its rank and score gap to the winner.
2. **Fix what the trace shows, behind `EXILE_RECOVERY` (default off).** Defaults to try:
   - a landless raid score bonus of **+40**, applied only to a port FT held at some point;
   - a travel pull toward the hostile port with the weakest *believed* garrison.
   - If the cooldown is what binds, change nothing else. Report it instead.
3. Leave tax, the claim rule and secession untouched.

**Acceptance**
- Flag off: hashes and event counts are byte-identical to the pins (1847 `b51aa07a`/156382, 2718 `091f7628`/157208, 4096 `25bdbf15`/160697, and the 72-tick pins).
- Flag on: FT portless ticks fall by ≥ 30% on 4096 (575 → ≤ 402) and do not rise on 1847 or 2718.
- Raids while portless rise above 3 / 5 / 3.
- No faction wipeout that is not already in the baseline. Secessions stay within ±1 of 4 / 0 / 4.
- WG still holds at least one port at t1200 on all three seeds.

**Measurement plan**
- For each seed, run flag-off and flag-on 1,200-tick logs, then `npm run dynamism -- --events on.jsonl --baseline off.jsonl --json out-<seed>.json`. Report the readout deltas: battles, ownership changes, claims and secessions.
- Rerun `/tmp/h/nx.ts` and `nx2.ts` for the columns in the table above.
- Commit the tables to this doc. Make no paid calls.

**After A:** B is the cheap follow-up. It is hash-neutral and costs about $0.11 a run, but it needs Micah's go-ahead for live spend.
