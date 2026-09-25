# Development and playtest pipeline

Open Era should advance through small, testable hypotheses rather than accumulating systems that are only reviewed at the end. Every milestone must produce both machine evidence and a readable account of how the game felt when approached as a player.

## Branch roles

| Branch | Purpose | Rule |
| --- | --- | --- |
| `main` | Stable, reviewed project history | Updated only after explicit owner approval |
| `feature/<topic>` or `prototype/<topic>` | One coherent gameplay or technical hypothesis | May be revised or abandoned freely |
| `promotion/main-vN` | Candidate assembled from work worth keeping | Must pass the complete gate before approval |

Keep commits intact when they explain meaningful milestones. Cherry-pick self-contained records such as design documents or assets when they can stand alone. Merge a dependent prototype as a complete branch when its later behavior relies on the earlier commits. Do not transplant isolated code commits merely to make the graph look smaller.

## Milestone loop

1. **Frame the hypothesis.** Record the player-facing behavior, the uncertainty being tested, and a short success condition.
2. **Implement on a branch.** Preserve the validated command boundary and event history; simulation internals must not become a back door for player actions.
3. **Run automated checks.** All tests must pass, three deterministic seeds must complete, and a split stop/restart run must equal an uninterrupted run.
4. **Inspect evidence.** Review the chronicle, final state, metrics, map, decision traces, agency traces, and conversation traces. Look for both correctness failures and uninteresting behavior.
5. **Play adaptively.** Codex takes a plausible player ambition, observes only player-visible information, and issues actions through the same public interface a player uses. Its next action responds to what actually happened rather than following a prewritten command list.
6. **Write the playtest record.** Capture the build, seed, objective, observations, decisions, results, defects, design insights, and recommendation using the template in `docs/playtests/TEMPLATE.md`.
7. **Update the progress log.** Record the change, its verification, what was left open, and which agent did the work in `progress.md`, so the branch can be handed to another agent or the owner without reconstruction.
8. **Decide deliberately.** Mark the milestone `promote`, `revise`, or `abandon`. Interesting output alone is not sufficient evidence to promote it.
9. **Assemble a promotion branch.** Bring in only accepted work, rerun the complete gate on the assembled history, and summarize its difference from `main`.
10. **Pause for approval.** Push the promotion branch for review. Update `main` only after the project owner explicitly approves that exact candidate.

## Automated milestone gate

From the repository root, run:

```bash
./scripts/evaluate-milestone.sh <label>
```

The gate performs:

- the complete Node test suite;
- 72-tick simulations with seeds `1847`, `2718`, and `4096`;
- a 72-tick uninterrupted recovery reference;
- an equivalent 47-tick run followed by a recovered 25-tick run, with the split placed between snapshot boundaries so recovery must replay events rather than merely restore a snapshot;
- a final-state-hash comparison between uninterrupted and recovered worlds.

Outputs are written beneath `simulation-output/evaluations/<label>/`; SQLite databases are isolated beneath `.open-era/evaluations/<label>/`. These generated artifacts stay outside Git. The playtest record, selected evidence, and conclusions belong in Git.

## Codex player protocol

The assistant is useful as a repeatable exploratory player only if it is denied omniscience.

- Start with a named ambition, such as gaining political leverage, stabilizing a party, or taking a settlement.
- Use the dashboard or its public HTTP/command interface. Never edit state, append events directly, or invoke private simulation functions to help the player.
- Base decisions only on information the current player can inspect. Hidden truth may be examined afterward for diagnosis, not during play.
- Respect real constraints: travel time, response delay, uncertain intelligence, cooldowns, resources, relationships, and rejected orders.
- Explain each decision briefly before issuing it so the record distinguishes intent from outcome.
- Allow the strategy to change when events invalidate the original plan.
- Record confusing affordances, degenerate optimal play, missing feedback, exploits, stalled states, and surprisingly compelling stories.
- Separate implementation defects from design findings.

A human session can supplement the assistant run whenever desired. It is not required for each small branch, but remains the stronger gate before a public release or an irreversible design commitment.

## Review evidence

| Evidence | Question |
| --- | --- |
| Tests | Did established invariants remain true? |
| Seed matrix | Does the feature behave coherently across different worlds? |
| Recovery comparison | Can the persistent world stop and resume without changing history? |
| `report.md` | Is the resulting story understandable and interesting? |
| `metrics.csv` | Did power, stability, resources, or activity enter pathological trends? |
| `map.svg` | Are movement and territorial outcomes spatially legible? |
| Decision and agency traces | Did characters act for inspectable reasons rather than noise? |
| Conversation traces | Did messages respect timing, relevance, boundaries, and state validation? |
| Adaptive playtest | Could a player form an intention, act, read the response, and revise? |

## Promotion criteria

A candidate may be proposed for `main` when:

- the automated gate passes from a clean checkout;
- no generated runtime state is staged;
- the adaptive playtest has a written record;
- known defects and deferred questions are explicit;
- the branch contains only work selected for promotion;
- the exact candidate commit has been pushed for review.

Stop the promotion when recovery diverges, a player action bypasses validation, reports expose hidden information, a migration cannot load existing state, tests are flaky, or the branch contains unrelated changes. Fix the candidate branch and rerun the gate; do not waive a failure silently.
