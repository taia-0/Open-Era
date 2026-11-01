# Dynamism readout

Status: **Built** on `feature/dynamism-readout`, cut from `origin/main` `5c57c6d` (the raise shock, #140). This is slice 2 in the build order of [next slices](next-slices.md); that doc calls it "Slice 5". It is offline tooling only. It reads an event log and runs nothing. It turns Micah's "a dynamic environment, not a static story" into counts that every AI slice is compared on, against flag off.

## Files

- `src/tools/dynamism.ts`: the pure readout. It imports only the `SimEvent` type. A test asserts that it imports no engine, state, scenario or RNG module.
- `src/cli/dynamism-readout.ts`: the CLI. It reads JSONL or a `WorldStore` SQLite file (opened read-only).
- `tests/dynamism-readout.test.ts`: 6 tests.
- `package.json`: the script `npm run dynamism`.

No file under `src/sim` changed.

## Metrics

Everything is computed from events only. An event's tick is `event.tick`, the tick stamped on it (0–1199 in a 1,200-tick run). Events are taken in `sequence` order.

| Metric | Definition |
| --- | --- |
| `portOwnershipChanges` | `settlement-claimed` whose `data.factionId` differs from `data.previousFactionId`, plus every `secession-declared` (the port moves to the new faction) |
| `portsChangedHands` | Distinct `settlementId` among the events counted in `portOwnershipChanges` |
| `secessions` | `secession-declared` |
| `desertions` | `character-deserted` |
| `captures` | `character-captured` |
| `releases` | `captivity-released` |
| `deaths` | `character-died` (an extra the readout adds; not named in next-slices) |
| `rateChanges` | `tax-rate-set` where `round(taxRate × 100)` ≠ `round(previousTaxRate × 100)`. Split into `rateRaises` and `rateCuts`, and reported per faction in `rateChangesByFaction` |
| `decisions` | `decision-made` |
| Action variety | For each actor with at least `minDecisions` (default 20) `decision-made` events, the Shannon entropy in bits of their action-kind counts: `H = −Σ pₖ log₂ pₖ`, where `pₖ` is the share of their decisions of kind `k`. The kind is `data.goal`, the chosen action, or `haul` on the haul path. `normalized = H / log₂(kinds)`, which is 0 for one kind. Reported per actor, as the mean, the min and max, and as the global entropy over all decisions |

Next-slices also names repeat-run divergence. That is the comparison below, not a single-run metric.

## Windows

The whole run, plus fixed windows of `W` ticks (default 240, `--window`). Window `i` holds event ticks in `(i·W, (i+1)·W]`, except the first window, which also takes tick 0, so it is `[0, W]`. The window rows sum to the totals, except `portsChangedHands`, which is a distinct count per window.

## Output

- **JSON** (`--json out.json`): `{ readout }`, or `{ readout, baseline, comparison }` when a baseline is given.
  - `readout` holds `version`, `events`, `firstTick`, `lastTick`, `windowTicks`, `minDecisions`, `totals`, `rateChangesByFaction`, `actionVariety` (with per-actor rows) and `windows`.
  - Values are deterministic, and entropies are rounded to 4 decimals.
- **Table** (stdout): one row per window plus `all`, then an action-variety line.

## CLI

```
npm run dynamism -- --events run.jsonl [--window 240] [--min-decisions 20] [--json out.json]
npm run dynamism -- --database .open-era/world.sqlite
npm run dynamism -- --events ai.jsonl --baseline off.jsonl --json cmp.json
npm run dynamism -- --database ai.sqlite --baseline-database off.sqlite
```

`--events` takes one `SimEvent` JSON object per line. `--database` reads the `events` table of a `WorldStore` file, so it works on a `npm run simulate` output. Note that the simulate CLI also resolves conversation replies, so its log is not the bare `runTick` log measured below.

## Comparing a run against flag off

Use the same seed and tick count, and pass the flag-off log as `--baseline`.

- `comparison.totals.<metric>` gives `{ run, baseline, delta }`, and the same for mean and global entropy.
- `firstDivergentTick` is the first tick whose ordered list of `(type, actorId, targetId, settlementId)` differs. It is `null` when the logs match. Data is left out of the key, so a run that differs only in recorded `data.ai` reads as identical.

A slice "moves the world" when `firstDivergentTick` is not null and the metric deltas are reported per seed. With three seeds no delta is claimed as a cause, because any change sends the campaign down another path (see `low-tax-cost.md` section 6).

## Baseline: flag off, 1,200 ticks, `origin/main` `5c57c6d`

Node v24.22.1 / ICU 78.3. These logs come from `runTick` only, written to JSONL by a script outside the repo.

**Hashes**, unchanged against main (this branch touches no sim file):

| Seed | 72 ticks (fixture) | 1,200 ticks |
| --- | --- | --- |
| 1847 | `6efa334f` / 8496 | `f80c529f` / 165833 |
| 2718 | `e8f9cfab` / 8566 | `2b5060c0` / 157639 |
| 4096 | `8ac8529b` / 8486 | `e8ae4443` / 162123 |

**Totals:**

| Seed | Port changes | Ports | Secessions | Desertions | Captures | Releases | Deaths | Rate changes (raises / cuts) | Decisions | Mean entropy (normalized) | Range | Global |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- | --- | --- |
| 1847 | 37 | 3 | 4 | 4 | 7 | 6 | 1 | 25 (14 / 11) | 27008 | 1.9026 (0.6878) | 1.3982–2.2978 | 2.3126 bits, 9 kinds |
| 2718 | 24 | 3 | 0 | 0 | 18 | 16 | 2 | 11 (5 / 6) | 25530 | 1.8065 (0.6614) | 1.365–2.4106 | 2.2788 bits, 9 kinds |
| 4096 | 44 | 3 | 4 | 5 | 10 | 10 | 1 | 29 (11 / 18) | 26541 | 1.8611 (0.6694) | 1.1922–2.4407 | 2.3422 bits, 9 kinds |

29 actors have at least 20 decisions on every seed.

**Rate changes by faction:**
- 1847: Free Tide 20, World Government 3, one breakaway 2.
- 2718: Free Tide 7, World Government 4.
- 4096: Free Tide 12, World Government 6, four breakaways 4 / 1 / 3 / 3.

**Per window** (port changes / secessions / desertions / captures / rate changes):

| Seed | 0–240 | 241–480 | 481–720 | 721–960 | 961–1200 |
| ---: | --- | --- | --- | --- | --- |
| 1847 | 5 / 0 / 0 / 2 / 4 | 6 / 0 / 2 / 0 / 10 | 5 / 0 / 0 / 2 / 5 | 15 / 4 / 2 / 2 / 5 | 6 / 0 / 0 / 1 / 1 |
| 2718 | 4 / 0 / 0 / 3 / 2 | 2 / 0 / 0 / 1 / 5 | 5 / 0 / 0 / 6 / 0 | 6 / 0 / 0 / 5 / 1 | 7 / 0 / 0 / 3 / 3 |
| 4096 | 5 / 0 / 2 / 1 / 11 | 13 / 3 / 0 / 1 / 7 | 14 / 1 / 0 / 2 / 7 | 10 / 0 / 2 / 5 / 4 | 2 / 0 / 1 / 1 / 0 |

**Cross-checks:**
- The secessions match the raise-shock harness (4 / 0 / 4, `low-tax-cost.md` section 6), and the 1,200-tick hashes match that harness's S = 1.0 rows.
- A run compared against itself gives `firstDivergentTick: none` and every delta 0.
