# After triage — what comes next

Status: Open / proposal. Measured offline on `main` `5e06c4c`; no paid calls.

**Evidence**
- **13-seed sweep:** `node --experimental-strip-types scripts/exile-sweep.ts` (13 seeds × 1,200 ticks, EXILE_RECOVERY off / on). Rerun on `5e06c4c`, it prints "EXILE ACCEPTANCE PASSED" and matches the `progress.md` exile entry.
- **Picker-eligible counts:** `/tmp/h/wg.ts` on a scratch copy of `5e06c4c`. The copy's only change is logging: `decision-made` records the full candidate list. A decision is eligible when it has ≥ 2 legal rows and no legal raid or claim, which is the rule `consultActionPicker` uses (`engine.ts:3854–3865`; `ESCALATION_ACTIONS` is defined in `ai-action-picker.ts:23`).

## Candidates

### (a) Jev picker for World Government

Picker-eligible decisions per 1,200-tick run, flag off:

| Seed | World Government | Free Tide |
|---|---|---|
| 1847 | 9,647 | 5,404 |
| 2718 | 9,826 | 6,193 |
| 4096 | 9,625 | 3,884 |

**Cost (estimate).** Slice 4's live price works out to about $0.000054 per call ($0.2375 / 4,368 on 1847; `progress.md:374`). At that price, World Government picks alone come to about $0.52 a run (9,647 × 0.0000544), before social reads.

**Costs and risks**
- It breaks slice 4's caps of 8,000 calls and $0.35.
- The slice-3 live run lost secessions on all three seeds (`progress.md:406`).
- Slice 5 triage, which handles raid and claim decisions, is not built yet.

**Hash:** neutral with the flag off.

**Size:** M.

### (b) Default-on for EXILE_RECOVERY and feedReasons

**EXILE_RECOVERY.** Sweep totals, off → on:

| Metric | Off | On |
|---|---|---|
| Claims | 437 | 682 |
| Port changes | 479 | 713 |
| Portless raids | 245 | 360 |
| Desertions | 58 | 66 |
| Secessions (total) | 42 | 31 |
| Secession median | 3 | 2 |

- Acceptance passes under the Lead's rulings (`progress.md:193–196`): the median is within ±1, and 12 of 13 seeds have at least one secession.
- With the flag on, World Government ends with 0 ports on 1847 and 9000. That was accepted under ruling 1.
- **Cost:** $0 per run.
- **Still needed:** a re-pin, a fixture plan, and the Lead's sign-off.

**feedReasons.** It is hash-neutral. Live runs measured $0.029–0.044 per run (`progress.md:166–171`). On by default would mean live DeepSeek spend on every run, so **it needs Micah's go-ahead before it is turned on by default**. Until then it stays opt-in.

### (c) Vision gap: occupation and the population's response after conquest

- **What the vision says:** `game-vision.md:69` leaves it undecided how a claimed port is occupied and how its population responds. `roadmap.md:28` lists this as tracked deferred.
- **Why it matters more now:** EXILE_RECOVERY on raises claims by 56% (437 → 682), and nothing in the world reacts to a change of owner. A response grounded in the port's conditions fits `game-vision.md:39`: "Resistance must emerge from characters, material conditions, opportunities, and player action".
- **Hash:** changes the hash.
- **Cost:** $0.
- **Size:** M–L. It needs a design pass first.

## Recommendation: (b), EXILE_RECOVERY default-on only; then (c)

**Why**
- It costs $0 and already passes its acceptance on current main.
- It is the biggest measured dynamism gain available: claims +245 and port changes +234 over 13 seeds.
- Re-pinning now is cheaper than re-pinning after more slices build on the flag-off pins.

**Scope**
1. Flip the `exileRecovery` default to on, in `runTick` options and the CLIs. Keep `--no-exile-recovery` / `EXILE_RECOVERY=0` as an opt-out.
2. Re-pin the 72-tick and 1,200-tick hashes and event counts on 1847, 2718 and 4096. The old pins remain reachable with the opt-out.
3. Update the tests that assert the old timeline. Prefer the opt-out in rule tests, the way `tests/helpers/old-starts.ts` handled port balance.
4. `scripts/exile-sweep.ts` stays in `evaluate-milestone.sh` as the property gate.
5. feedReasons is not changed.

**Acceptance**
- `exile-sweep.ts` passes on the branch: secession median within ±1 of the opt-out, and at least 7 of 13 seeds with at least one secession.
- `npm test` is green, and no assertion is loosened without a note.
- The opt-out reproduces today's pins exactly:
  - 72 ticks: `66e8ccb7` / `b4ccedab` / `b04c5ac4`;
  - 1,200 ticks: `b51aa07a` / `091f7628` / `25bdbf15`.
- The new default pins are recorded in `progress.md` Current state.
- The feed-reasons stub gate is rerun on the new default. The stub event counts with exile on, 188 / 169 / 194 (`progress.md:162`), are restated as the new baseline.

**Measurement plan**
- For 1847, 2718 and 4096, write opt-out and default 1,200-tick event logs.
- Run `npm run dynamism -- --events default.jsonl --baseline optout.jsonl --json out-<seed>.json`. The deltas should match the sweep rows for those seeds:
  - claims 26 → 51 / 25 → 64 / 39 → 56;
  - port changes 30 → 52 / 25 → 64 / 43 → 59.
- Rerun the 13-seed sweep.
- Make no paid calls.

**Next:** (c), a design pass on occupation and population response. (a) waits until slice 5 triage is built and new caps are agreed.
