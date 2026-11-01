#!/usr/bin/env bash
set -euo pipefail

evaluation_label="${1:-}"
if [[ -z "${evaluation_label}" || ! "${evaluation_label}" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Usage: $0 <label containing only letters, numbers, dot, underscore, or hyphen>" >&2
  exit 2
fi

repository_root="$(git rev-parse --show-toplevel)"
cd "${repository_root}"

evaluation_output="simulation-output/evaluations/${evaluation_label}"
evaluation_databases=".open-era/evaluations/${evaluation_label}"
mkdir -p "${evaluation_output}" "${evaluation_databases}"

echo "Running automated tests"
npm test 2>&1 | tee "${evaluation_output}/tests.log"

echo "Running the 13-seed FT-portless property"
node --experimental-strip-types scripts/ft-portless-property.ts 2>&1 | tee "${evaluation_output}/ft-portless-property.log"

# after-triage.md (b): EXILE_RECOVERY is on by default; the 13-seed sweep (off = opt-out, on = default) is the property gate.
echo "Running the 13-seed exile sweep"
node --experimental-strip-types scripts/exile-sweep.ts 2>&1 | tee "${evaluation_output}/exile-sweep.log"
grep -q "EXILE ACCEPTANCE PASSED" "${evaluation_output}/exile-sweep.log"

# occupation.md §5–§6: OCCUPATION off (exile-on baseline) vs on, 13 seeds; exits 1 on any acceptance item, including the churn guard.
echo "Running the 13-seed occupation sweep"
node --experimental-strip-types scripts/occupation-sweep.ts --json "${evaluation_output}/occupation-sweep.json" 2>&1 | tee "${evaluation_output}/occupation-sweep.log"
grep -q "OCCUPATION ACCEPTANCE PASSED" "${evaluation_output}/occupation-sweep.log"

# wg-jev-picker.md acceptance 1–3: flag-off pins, default byte-identical, replay exact with 0 calls, 13-seed stub
# run (secessions on ≥ 6 seeds, liveness, no new wipeouts) and the dormant holder path. Offline; no vendor call.
echo "Running the WG picker acceptance"
node --experimental-strip-types scripts/wg-picker-sweep.ts --json "${evaluation_output}/wg-picker-sweep.json" 2>&1 | tee "${evaluation_output}/wg-picker-sweep.log"
grep -q "WG PICKER ACCEPTANCE PASSED" "${evaluation_output}/wg-picker-sweep.log"

# Slice B feed reasons (feed-reasons.md section 10): stub brain on, 1,200 ticks,
# stateHash equal to the default pins (EXILE_RECOVERY on); then an offline replay with zero writer
# calls and byte-identical feed text.
declare -A feed_reason_pins=([1847]=94de9c02 [2718]=7a3741c9 [4096]=af6eeaea)
for evaluation_seed in 1847 2718 4096; do
  feed_dir="${evaluation_output}/feed-reasons-${evaluation_seed}"
  echo "Running feed reasons (stub) for seed ${evaluation_seed}"
  node --experimental-strip-types src/cli/run-feed-reasons.ts --seed "${evaluation_seed}" --ticks 1200 --output "${feed_dir}" | tee "${feed_dir}.log"
  feed_hash="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).stateHash.slice(0,8))' "${feed_dir}/summary.json")"
  if [[ "${feed_hash}" != "${feed_reason_pins[${evaluation_seed}]}" ]]; then
    echo "Feed reasons changed the state hash on seed ${evaluation_seed}: ${feed_hash}" >&2
    exit 1
  fi
  node --experimental-strip-types src/cli/run-feed-reasons.ts --replay "${feed_dir}" | tee "${feed_dir}-replay.log"
done
echo "Feed reasons check passed"

for evaluation_seed in 1847 2718 4096; do
  seed_name="seed-${evaluation_seed}"
  echo "Running ${seed_name} for 72 ticks"
  node --experimental-strip-types src/cli/run-simulation.ts \
    --ticks 72 \
    --seed "${evaluation_seed}" \
    --database "${evaluation_databases}/${seed_name}.sqlite" \
    --output "${evaluation_output}/${seed_name}" \
    --reset \
    2>&1 | tee "${evaluation_output}/${seed_name}.log"
done

continuous_database="${evaluation_databases}/recovery-continuous.sqlite"
split_database="${evaluation_databases}/recovery-split.sqlite"

echo "Running uninterrupted recovery reference"
node --experimental-strip-types src/cli/run-simulation.ts \
  --ticks 72 \
  --seed 1847 \
  --database "${continuous_database}" \
  --output "${evaluation_output}/recovery-continuous" \
  --reset \
  2>&1 | tee "${evaluation_output}/recovery-continuous.log"

echo "Running first half of split recovery check"
# The split deliberately lands between snapshot boundaries. Snapshotting happens
# when tick % ticksPerDay == 0, so splitting on a multiple would leave nothing to
# replay and the check would only prove snapshot restore, never event replay.
node --experimental-strip-types src/cli/run-simulation.ts \
  --ticks 47 \
  --seed 1847 \
  --database "${split_database}" \
  --output "${evaluation_output}/recovery-split" \
  --reset \
  2>&1 | tee "${evaluation_output}/recovery-split-first.log"

echo "Resuming split recovery check"
node --experimental-strip-types src/cli/run-simulation.ts \
  --ticks 25 \
  --seed 1847 \
  --database "${split_database}" \
  --output "${evaluation_output}/recovery-split" \
  2>&1 | tee "${evaluation_output}/recovery-split-resume.log"

continuous_hash="$(sed -n 's/^State hash: //p' "${evaluation_output}/recovery-continuous.log" | tail -n 1)"
recovered_hash="$(sed -n 's/^State hash: //p' "${evaluation_output}/recovery-split-resume.log" | tail -n 1)"

if [[ -z "${continuous_hash}" || -z "${recovered_hash}" ]]; then
  echo "Recovery check failed: a state hash was not reported" >&2
  exit 1
fi

if [[ "${continuous_hash}" != "${recovered_hash}" ]]; then
  echo "Recovery check failed: ${continuous_hash} != ${recovered_hash}" >&2
  exit 1
fi

echo "Recovery check passed: ${continuous_hash}"
echo "Evaluation artifacts: ${evaluation_output}"
