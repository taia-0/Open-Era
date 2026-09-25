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
