# Next slices after the AI tax pilot

Status: **Open / proposal for the Lead.** Docs only. No live call was made. One offline count was taken on `origin/main` `c659a30` (Node v24.22.1) with a harness kept outside the repo; it is marked where used.

## Where we are

- **Tax pilot.** The tax step asks a brain at Free Tide's clock points: 33 / 27 / 30 calls per 1,200-tick run (`ai-pilot-a.md` lines 33–39). A read-only Jev reader briefs it (`ai-pilot-b.md`). Real providers, keys, cost logs and caps are specified in `ai-providers.md`.
- **Brain judgment.** Prompt v2 made the brain a rubber stamp (22 of 22 agreed). The v3 rail-plus-temperament design (`ai-brain-judgment.md` line 38) then produced 67% overrides, mostly free raises. The raise shock answers that (`low-tax-cost.md` line 39), and it is built on `origin/feature/raise-shock` (`fbecad7`: "each point raised costs 1.0 stability once at every held port … 72-tick fixture unchanged").
- **The nervous system is not built.** `ai-brain.md` designs an action picker, triage and a context reader on Jev (lines 158–160), with triage that only adds escalations (lines 166–172). It also specifies model-only sampling on a side RNG stream keyed by seed, tick and actor (lines 92 and 258). The only side stream in the tree is desertion's (`src/sim/types.ts` lines 746–751, `desertionRngState`).
- **Jev probe findings** (`jev-capabilities.md`, on `docs/jev-capabilities`):
  - Identical requests return different probabilities with the same argmax: firm 0.58–0.62 (line 160; table line 97). Replay must use the recorded probabilities, never a fresh call.
  - A 10-action Choice returned a usable distribution at 807 input tokens (line 161; token count in the section 9 table).
  - Triage Nouls on a tax event scored `faction_number` 0.09, a miss, so the wording needs work (line 162).
  - The weighted-sampling sketch is at lines 70–81.

**The goal.** Micah wants "a dynamic environment, not a static story" (his brief, relayed by the Lead). `game-vision.md` gives the same aim: "Characters pursue their own ambitions … relationships change" (line 11). "Autonomous characters plan freely from their motives and knowledge" (line 19). "Resistance must emerge from characters, material conditions, opportunities, and player action" (line 39). Today, outside the tax step, every autonomous action is `candidates[0]` from `buildCandidates` (`src/sim/engine.ts` line 851). The same state gives the same act. The slices below put weighted, character-driven choice there, under the M33 replay rule (`ai-brain.md` line 85).

**Precondition (not a slice).** Merge the raise shock, so the AI acts against rules with a price. Its 1,200-tick re-pin becomes the baseline that every "flag off at 1,200" below refers to.

## Slice 1: Picker seam, side stream, recorded probabilities (stubs only)

- **Scope.** One provider seam for routine decisions. It returns probabilities over the legal rows of `buildCandidates`, and the engine samples from them as `jev-capabilities.md` lines 70–81 describe:
  - Options are sorted by id, illegal rows dropped, and the rest renormalised.
  - The draw `u` comes from a new `pickerRngState` side stream keyed by seed, tick and actor (`ai-brain.md` line 92). It never comes from the main `rngState` or from `Math.random`.
  - The probabilities, chosen index, `u`, model and `inputHash` are recorded in `data.ai.picker` on the existing `decision-made` event (record shape at `ai-brain.md` line 208).
  - Replay redraws from the recorded probabilities. The scorer still runs and draws as now (`ai-brain.md` line 89).
  - Stubs: `stubArgmax` (all mass on `candidates[0]`), `stubUniform` and `stubScripted`.
- **Dependencies.** The raise shock merged. No vendor.
- **Gate.**
  1. Flag off is byte-identical at 72 and 1,200 ticks.
  2. With `stubArgmax` the 1,200-tick hash equals flag off (proving the side stream does not touch `rngState`).
  3. A `stubUniform` run replayed from its own records reaches its live hash with zero provider calls.
  4. `WorldStore.recover` mid-run matches.
  5. The tests run offline.
- **Hash impact.** Fixture unchanged. Flag off at 1,200 unchanged. AI on: unchanged with `stubArgmax`; changes with any other stub, by design.
- **Live cost.** None.

## Slice 2: Jev action picker for one character, Free Tide's holder

- **Scope.** A Jev Choice over the legal rows, for `character-14` only. The state carries traits, purse, provisions, plan and believed prices (`ai-brain.md` line 158). Answers are sampled through slice 1. The full returned probabilities are recorded, since repeats differ (`jev-capabilities.md` line 160). Call cap per run and spend cap per run; cost line per call as in `ai-providers.md`. On timeout (2,000 ms, `ai-brain.md` line 158), error, cap or an off-list answer, the fallback is `candidates[0]`.
- **Dependencies.** Slice 1, and Micah's go-ahead for spend.
- **Gate.**
  1. Slice 1's flag-off checks.
  2. Every vendor run replays to its live hash with no call.
  3. The recorded distributions are not degenerate: at least some decisions have a second option at or above a stated share, which the Lead sets before the run.
  4. Pax's mix of actions differs from flag off on at least one seed.
  5. No fallback storm (fallbacks reported per run).
- **Hash impact.** Fixture unchanged. Flag off unchanged. AI on: changes (new history).
- **Live cost per run.** An estimate. Offline count at `c659a30`: Pax makes 745 / 634 / 1,027 `decision-made` per 1,200 ticks. At the probe's 807 input tokens: 1,027 × 807 × $0.042 / M = **$0.035** per run at most (output free). The probe's action list was hand-written (line 161), so real state size may differ. Proposed caps: 1,100 calls and $0.06 per run.

## Slice 3: Social reading in the picker, for all of Free Tide

- **Scope.**
  - Widen slice 2 to every Free Tide member.
  - Put the context reader's social reads (loyalty read, grudge weights; `ai-brain.md` line 160) into the picker's state, as recorded Choice distributions, not just the argmax. The live tax run kept only "firm" and hid a 60/40 split (`jev-capabilities.md`, P1 finding).
  - Read-only: relationship numbers stay rule-written (`ai-brain.md` line 148).
  - This is where "relationships change" (`game-vision.md` line 11) starts to drive choices.
- **Dependencies.** Slice 2 passed.
- **Gate.**
  1. Slice 2's gates.
  2. A recorded read changes the sampled distribution in the expected direction: a "breaking" loyalty read raises the share of leave-type rows over flag-off frequency on the same seed. The Lead sets the direction table before the run.
  3. Desertions, captures and secessions are reported against flag off, with no claim of cause from three seeds.
- **Hash impact.** Fixture unchanged. Flag off unchanged. AI on: changes.
- **Live cost per run.** An estimate. Offline count at `c659a30`: Free Tide members make 4,125 / 7,116 / 5,070 decisions. 7,116 × 807 × $0.042 / M = **$0.24** at most, before a second social read per call. Proposed caps: 7,500 calls and $0.35 per run.

## Slice 4: Triage, reworded, escalating to the brain

- **Scope.**
  - Rewrite the four hard-test Nouls (port holding, faction-wide number, allegiance or freedom, broken promise) so a known positive scores high. The probe's tax event scored `faction_number` 0.09 (`jev-capabilities.md` line 162).
  - Ride them on the picker request (`ai-brain.md` line 159).
  - Draw the escalation by seeded uniform against the Noul (`jev-capabilities.md` lines 70–81, item 5), or by the 0.8 threshold. The Lead picks one.
  - The budget is 50 escalations per run and one per actor per 24 ticks. Triage only adds escalations (`ai-brain.md` lines 166–172).
  - The brain uses the v3 rail and fallback.
- **Dependencies.** Slice 2 (the picker request). The raise shock and v3 for the brain.
- **Gate.**
  1. An offline labelled set of recorded states (taken from slice 2 runs) where the Lead marks the correct test. Jev's reworded Nouls must reach a hit rate the Lead sets before it ships. That costs one small labelled batch, capped.
  2. Live: escalations stay within budget, every escalation's reason names its test, and a hard-test decision still goes to the brain without triage.
- **Hash impact.** Fixture unchanged. Flag off unchanged. AI on: changes.
- **Live cost per run.** An estimate.
  - Triage questions ride on picker calls. The extra tokens per question are not documented. If billed as a second request at P4's 684 tokens: 7,116 × 684 × $0.042 / M = **$0.20** at most.
  - Brain: at most 50 × $0.000897 (the v3 peak per-call estimate, `ai-brain-judgment.md` section 6) = **$0.045**.
  - Proposed cap: $0.30 per run on top of slice 3.

## Slice 5: Dynamism readout (offline, alongside slice 1)

- **Scope.** A measurement script outside the engine (it reads events only, so it is not a world change). Per 1,200-tick run it reports:
  - port ownership changes, secessions, desertions, captures and rate changes;
  - the spread of each named character's action mix;
  - repeat-run divergence across seeds.

  It turns "a dynamic environment, not a static story" into numbers each AI slice is compared on, against flag off.
- **Dependencies.** None; it can be built first.
- **Gate.** It reproduces the counts already pinned in `progress.md` and the design notes for the baseline seeds. It is deterministic.
- **Hash impact.** None (projection-only, nothing written).
- **Live cost.** None.

## Order and rationale

1. **Slice 1, picker seam:** every Jev role needs the side stream and recorded-probability replay first. It is free and proves flag off is byte-identical.
2. **Slice 5, dynamism readout:** cheap, and it gives every later slice a measure of "dynamic, not static" to pass. Build it beside slice 1.
3. **Slice 2, one-character Jev picker:** the smallest live use of weighted Choice, about $0.035 per run, on the character the tax pilot already knows.
4. **Slice 3, social reading for Free Tide:** the reads have to change choices before they make the world move, and this is where relationships start to drive action.
5. **Slice 4, triage to the brain:** needs the picker request and reworded Nouls, and it spends brain calls, so it comes last.

## Who decides

Every live run, key and spend needs Micah's go-ahead. Caps and cost logs stay on every vendor run.
