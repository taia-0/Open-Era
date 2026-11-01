# Next slice after occupation: Jev picker for World Government

Status: Lead rulings applied (2026-11-01). The recount is offline on `main` `555597a`. Every other figure is quoted from the file it cites.

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

**Scope (ruling 2)**
- v1 consults only World Government's **command holder and governors**. The eligibility rule is unchanged: at least 2 legal rows and no legal raid or claim (`engine.ts` `consultActionPicker`).
- Other members come later, and only if the entropy readout shows value.
- Raid and claim decisions stay with slice 5 triage. There are no WG social reads in v1.

**Mode (ruling 3): the brain nudges and never picks.**
- Each nudge is blended as in triage v3: q = 0.7 · prior + 0.3 · p, with prior 0.95 and weight 0.3. The draw is u from `pickerDraw`, and the sim's choice is kept when u < q (`progress.md`, "Slice 5 v3").
- p, reason, prior, weight, blend and u are recorded and replay-checked.

**Flag and defaults**
- A run option `ai.picker.factions` (`--picker-factions free-tide,world-government`). The default is `free-tide` only.
- The flag-off and default runs are hash-neutral against the default pins: 72 ticks `7f76e474` / `976c40bd` / `08943ea5`, and 1,200 ticks `94de9c02` / `7a3741c9` / `af6eeaea`.
- Live runs keep the per-call cost lines.

**Recount (ruling 1)**
- **Build and flags:** offline, on `main` `555597a`, using the defaults. That is EXILE_RECOVERY on. OCCUPATION is not on main: #173 is docs only, and the Engineer is building it. No AI and no picker were used. The run was 1,200 ticks.
- **Instrumentation:** a scratch copy counted World Government decisions that meet the eligibility rule and have no active haul that can act. The count only reads state: the end hashes equal the default pins, `94de9c02` / `7a3741c9` / `af6eeaea`.

| Seed | Command holder | Governors | Holder + governors | All WG members (reference) |
|---|---|---|---|---|
| 1847 | 0 | 1,482 | **1,482** | 9,890 |
| 2718 | 0 | 1,329 | **1,329** | 9,873 |
| 4096 | 0 | 1,152 | **1,152** | 7,302 |

- **The holder is always 0.** WG's command holder is `character-01` Mara Vane, the player commander, so it never reaches the autonomous decision loop. v1 is therefore governors only. A headless holder would only count after a seat change, and none occurred in these runs.
- **Caps:** recount max 1,482 × 1.25 = 1,852.5, so the call cap is **1,853 calls per run**.
  - Cost basis: #167's about $0.0000544 per call ($0.2375 / 4,368 on 1847, `progress.md:374`, as cited in `after-triage.md` (a)). That gives 1,853 × 0.0000544 = $0.1008, so the spend cap is **$0.11 per run**, rounded up to the cent.
  - Both caps are under the ruled ceiling of about 20,000 calls and $0.60. No sampling.

**Acceptance**
1. Flag off and the default reproduce the pins above exactly.
2. Replay is exact with the cache and makes 0 calls.
3. In a 13-seed stub run:
   - **secessions still occur on most seeds**, at least 6 of 13;
   - **liveness holds**: claims > 0 and port changes > 0 on every seed, and no new wipeouts.
4. One capped live run on 1847, 2718 and 4096, within 1,853 calls and $0.11 each, with a cost line for every call. It reports governor entropy against the picker-only noise range, which decides whether members are added later.

## Lead rulings (2026-11-01)

1. **Caps** are the recount max plus 25 % headroom: 1,853 calls and $0.11 per run. No sampling.
2. **v1 consults the command holder and governors only.** Members are added later, if entropy shows value.
3. **Nudge-only**, blended like triage v3.

The acceptance check "secession median within ±1" is replaced with "secessions on at least 6 of 13 seeds, and liveness holds".

**Still parked:** feedReasons default-on, until Micah himself says go.
