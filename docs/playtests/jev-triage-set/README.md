# Jev triage labelled set (slice 5)

`set.jsonl`: 29 situations, one per line. Each has `id`, `source` (seed, tick, event type, event `sequence`, log), `case`, the exact `state` the probe sends, `labels` for the four hard tests, a one-line `rationale`, and `labelledBy`.

**Labels are proposed by the Researcher, for the Lead to confirm.**

- **Sources.** Items 1–28 come from offline flag-off runs at 1,200 ticks on seeds 1847, 2718 and 4096. The runs were made at `5c57c6d`; the sim is identical on main `56bde48` (`git diff --stat 0bed4c5 56bde48 -- src` is empty), and the end hashes are `f80c529f` / `2b5060c0` / `e8ae4443`. Item 29 is the tick-168 tax-step hold from the recorded probe P4 (`docs/playtests/jev-probes-2026-10-31/probes.jsonl` line 6, branch `docs/jev-capabilities` `6071c7a`).
- **Decision items.** For a `decision`, `legalOptions` are the top six candidates recorded on the `decision-made` event (`engine.ts:3999` `candidates.slice(0, 6)`), filtered to score > −1000.
- **Rebuilding.** The set was built by `build.py` next to the probe (not committed). It picks the first matching event per rule in log order.

| Test | Positives | Negatives | Positive items |
| --- | ---: | ---: | --- |
| port_holding | 8 | 21 | 01, 02, 07, 10, 17, 18, 19, 26 |
| faction_number | 4 | 25 | 03, 11, 20, 29 |
| allegiance_freedom | 8 | 21 | 02, 04, 05, 12, 13, 18, 21, 22 |
| broken_promise | 4 | 25 | 06, 14, 15, 23 |
| all four negative | 7 | — | 08, 09, 16, 24, 25, 27, 28 |

Per-item detail is in `docs/design/jev-triage.md` §2.
