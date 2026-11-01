# Next dynamic slice — candidates and recommendation

Status: Accepted (A, #157); Lead ruling below. Gate trace done on `806248f`. Measured offline on `main` at `c9ce9b7` (no API calls). Flag-off hashes reproduce the pins in `progress.md`: 1847 `b51aa07a`, 2718 `091f7628`, 4096 `25bdbf15` (1,200 ticks). Scripts: `/tmp/h/nx.ts` and `/tmp/h/nx2.ts` on the box (they read engine state only).

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

## Lead ruling (after #157)

**Vision check.** `docs/design/game-vision.md:39` reads: "The simulation does not manufacture periodic resets or artificial rebellions solely to restore balance. Resistance must emerge from characters, material conditions, opportunities, and player action." This is verified on `806248f`; the heading is at line 37. A flat raid bonus for a losing faction would be exactly such a balance device, so the rulings below replace it.

1. **The gate trace comes first.** If a gate rule turns out to be a bug, fixing it is plain correctness, not balance. Done below.
2. **Motivation, not a bonus.** The "+40" becomes a per-captain **home-port claim**:
   - Each captain holds the claim on a port their faction lost, if they served there.
   - Its weight scales with the captain's traits and their grievance toward the current holder.
   - It decays over time.
3. **Acceptance is property-based.** The 30% portless-tick target is dropped. Permanent exile is a legitimate outcome.
4. **B (brain-written feed reasons) comes next, after A.**

## Gate trace (step 1, done)

**Method.** Offline only, no paid calls. Script `/tmp/h/gt.ts`, run on a scratch copy of `806248f`. The copy makes one logging-only change: `decision-made` also records the full, unsliced candidate list (`engine.ts:4312` keeps the top 6 only).
- **Sample:** every FT decision made while FT holds no port in true state, by a captain standing at a hostile port, over 1,200 ticks.
- **Gate clauses** (`src/sim/engine.ts:919–926`) are evaluated on the state at the start of the tick:
  - troops ≥ 25;
  - garrison ≥ 15, or ≥ 8 if `landless`;
  - `tick − lastBattleTick ≥ 18`;
  - no open battle at the port.
- `landless` is computed as the code does (`engine.ts:919–921`): from the captain's *knowledge* of who holds each port, not from true state.

| Seed | Decisions | Raid legal | Raid chosen | Blocked: garrison < 15 because the captain believes FT still holds a port | …of which garrison 8–14 (would pass the landless floor) | Blocked: garrison < 8 (truly landless) | Blocked: troops < 25 | Cooldown / open battle | Unexplained |
|---|---|---|---|---|---|---|---|---|---|
| 1847 | 465 | 2 | 2 | 304 | 156 | 101 | 97 | 6 | 0 |
| 2718 | 356 | 47 | 5 | 118 | 16 | 183 | 6 | 11 | 3 |
| 4096 | 389 | 4 | 3 | 180 | 24 | 205 | 9 | 7 | 0 |

The blocked columns count every clause that fails, so a decision can appear in more than one. The 3 unexplained cases on 2718 are a raid that was legal at the start of the tick but missing at decision time, because state changed within the tick.

**Where a raid is legal: its rank and the gap to the winner** (full list, after noise):

| Seed | Rank 1 | Rank 2 | Rank 3 | Rank 4 | Rank 5 | Rank 7 | Rank 8 | Gap to winner when not chosen (median / min / max) | Winners over a legal raid |
|---|---|---|---|---|---|---|---|---|---|
| 1847 | 2 | – | – | – | – | – | – | n/a (always chosen) | – |
| 2718 | 5 | 4 | 19 | 3 | 1 | 1 | 14 | 17.9 / 5.0 / 183.4 | rest 22, trade-local 8, travel 5, recruit 4, buy-provisions 3 |
| 4096 | 3 | 1 | – | – | – | – | – | 13.6 (n = 1) | trade-local 1 |

**Stale belief.** On the decisions where a captain believes FT still holds a port, that belief is old. Its age (`tick − observedTick`, script `/tmp/h/age.ts`) is:

| Seed | Median age (ticks) | p90 age (ticks) | Max age (ticks) |
|---|---|---|---|
| 1847 | 359 | 527 | 1,002 |
| 2718 | 155 | 519 | 750 |
| 4096 | 318 | 417 | 557 |

**Readings**
- **Raids are rare mainly because the gate never opens.** Score is rarely the blocker: legal raids number 2 / 47 / 4, out of 465 / 356 / 389 decisions.
- **Biggest blocker: the landless floor is switched off by stale belief.** Most captains still think FT holds a port (305 / 173 / 180 decisions), so the garrison-15 rule applies. Garrisons are mostly under 15, because claimed ports keep 3–15 (`portless-diagnosis.md`).
- **Second blocker: truly weak ports.** Garrisons under 8 block 101 / 183 / 205 decisions. That is a material condition, not a defect.
- **Score matters only on 2718,** where raids are legal 47 times but lose 42 of them, mostly to rest.

**Bug verdict.** No clause is a typo-level bug. Thresholds, the cooldown and the battle check match the M28 rule (`portless-recovery.md:65`, option E/B). The `landless` test is **knowledge-based by deliberate change**: commit `147978e` ("Post public news…") replaced `held.factionId` with `character.knowledge[held.id]?.factionId`. That makes it a belief rule, consistent with acting on news.

It does diverge from the built spec text, which says "that faction holds no settlement" (`portless-recovery.md:65`). Its inputs are also stale by hundreds of ticks: a median of 155–359 ticks of believing their own faction holds a port it lost.

I classify it as a **correctness gap in news propagation, not a gate bug**: the loss of one's own faction's port should reach members far sooner than ~300 ticks. Fixing that is plain correctness under ruling (1). It needs a short Lead confirmation before it is built, since it is belief plumbing (`src/sim/news.ts`) and moves hashes.

## Revised slice A: exile recovery

**Scope**
1. **Correctness (own-faction loss news).** When a faction loses a port, every member learns its new holder by the existing news path, with at most normal relay delay.
   - Measure the belief-age columns above before and after.
   - The gate itself is unchanged: troops ≥ 25, the floor of 8, cooldown 18, the battle check.
   - Behind `EXILE_RECOVERY`, default off.
2. **Home-port claim (motivation).**
   - **Who holds it:** a captain holds a claim on port P when P was held by their faction during the captain's service and is now held by another faction. "Served there" means the captain was at P while their faction held it; the trace records the last tick of that.
   - **Weight:** `w = (0.5·loyalty + 0.3·aggression + 0.2·ambition − 0.3·caution) × (1 + grievance(captain → current holder's faction))`. Trait weights are defaults to tune; grievance is the existing relationship value used by secession route C (`secession.ts:450`).
   - **Decay:** a half-life of 240 ticks since the captain last served at P. The value is a default, roughly two tax intervals × 2; mark it as tunable.
   - **What it moves:**
     - a raid at P scores `+ 40·w`;
     - travel toward P scores `+ 20·w`.
     - Both are bounded: zero when w ≤ 0, and a captain with no service at P gets nothing.
   - The weighted reason is appended to the decision reason ("…to win back <P>, lost to <holder>").
3. **Out of scope:** tax, the claim rule, secession, the AI pickers. Feed reasons are slice B.

**Acceptance (property-based)**
- **Flag off:** byte-identical to the pins. 1,200 ticks: 1847 `b51aa07a`/156382, 2718 `091f7628`/157208, 4096 `25bdbf15`/160697. The 72-tick pins hold too.
- **Flag on:**
  - At least one exiled captain raids a port they once held, on every seed where FT is portless while it holds a raid-legal home-port claim.
  - Raids while portless rise above 2 / 5 / 3 (the trace and `nx.ts` baselines).
  - No faction wipeout beyond the baseline.
  - Secessions within ±1 of 4 / 0 / 4.
  - World Government holds at least one port at t1200 on all three seeds.
  - Belief age for one's own faction's ports drops (step 1).
- **Not required:** fewer portless ticks. Permanent exile is allowed.

**Measurement plan**
- For each seed (1847, 2718, 4096), produce flag-off and flag-on 1,200-tick logs.
- Run `npm run dynamism -- --events on.jsonl --baseline off.jsonl --json out-<seed>.json`. Report the deltas for battles, ownership changes, claims and secessions.
- Rerun `/tmp/h/gt.ts`, `nx.ts`, `nx2.ts` and `age.ts` for the tables above.
- Make no paid calls.

**After A:** slice B, brain-written feed reasons. It is hash-neutral and estimated at ≈ $0.11 a run. Live spend needs Micah's go-ahead.
