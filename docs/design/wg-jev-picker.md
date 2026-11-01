# Next slice after occupation: Jev picker for World Government

Status: Open / proposal (Researcher, 2026-11-01, off `main` `555597a`). No new measurements: every figure below is quoted from the file it cites.

## Why this one

[After triage](after-triage.md) (#167) ranked the candidates in this order:
1. **(b):** "Recommendation: (b), EXILE_RECOVERY default-on only; then (c)".
2. **(c):** "Next: (c), a design pass on occupation and population response."
3. **(a):** "(a) waits until slice 5 triage is built and new caps are agreed."

(b) is done: EXILE_RECOVERY is on by default (`progress.md`, "EXILE_RECOVERY on by default"). (c) is done: occupation was re-specced in #173 and is being built.

What is left on the list:
- **(a), the World Government picker.** Its first precondition has since been met. Slice 5 triage is built (`progress.md`, "Slice 5 v3: no scoring call, the brain only nudges", 2026-10-31).
- **feedReasons default-on.** #167 kept it out of (b) ("feedReasons is not changed"). It says the change "needs Micah's go-ahead before it is turned on by default". No agent can rule on it, so it stays parked.

So (a) is next. Its remaining precondition, "new caps are agreed", is decision 1 below.

## Proposal

**Scope**
- Extend the Jev action picker, which today consults `free-tide` members only, to `world-government` members.
- It uses the same eligibility rule: at least 2 legal rows and no legal raid or claim (`engine.ts` `consultActionPicker`; `after-triage.md` Evidence).
- Raid and claim decisions stay with slice 5 triage.
- Social reads for World Government are out of scope for v1.

**Flag and defaults**
- A run option `ai.picker.factions` (or `--picker-factions free-tide,world-government`), defaulting to `free-tide` only.
- The flag-off and default runs are hash-neutral against the current default pins: 72 ticks `7f76e474` / `976c40bd` / `08943ea5` and 1,200 ticks `94de9c02` / `7a3741c9` / `af6eeaea`.
- Live runs keep the per-call cost lines and the caps, as Micah's standing approval requires.

**Size of the change, as measured on `5e06c4c` with the flag off** (`after-triage.md` (a)):
- World Government has 9,647 / 9,826 / 9,625 picker-eligible decisions per 1,200-tick run on 1847 / 2718 / 4096. Free Tide has 5,404 / 6,193 / 3,884.
- Estimated cost is about $0.52 a run for World Government picks alone, at about $0.000054 a call.
- That exceeds slice 4's caps of 8,000 calls and $0.35.
- **Re-measure first:** these counts predate exile-on by default and occupation, so they need to be counted again offline on the build branch.

**Acceptance (proposed)**
1. Flag off and the default reproduce the pins above exactly.
2. Replay is exact with the cache, and makes 0 calls.
3. A stub picker run on 13 seeds keeps liveness: claims > 0 and port changes > 0 on every seed, and no new wipeouts.
4. The secession median is within ±1 of the default.
   The slice-3 live run lost secessions on all three seeds (`progress.md:406` as cited in #167). This check is there to guard against that.
5. One capped live run on 1847 / 2718 / 4096, with a cost line for every call and spend under the agreed cap. It reports World Government holder entropy against the picker-only noise range, as in slice 5 v3.

## Open decisions for the Lead

1. **Caps.** Choose one:
   - (a) raise them to about 20,000 calls and about $0.60 a run, from the cost estimate;
   - (b) keep $0.35 and sample World Government decisions, for example one in two, or only on its command holder and governors;
   - (c) a World Government call budget with a cooldown, like triage's per-kind budgets.
2. **Who is consulted.** All World Government members, or the command holder and governors only.
3. **Gating.** Should the brain only nudge (v3's prior 0.95 / weight 0.3) for World Government, rather than pick outright? That would protect secessions.
4. **feedReasons default-on** stays parked until Micah himself says go.
