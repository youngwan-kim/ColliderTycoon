#!/bin/sh
# Balance over many seeds: N games of the bot in parallel (sim/balance.js), then the spread of the milestone times,
# the budget, the votes, the bot's politics, the audits, and any lab the council closed.
# Usage: sim/seeds.sh [games=8] [hours=36]
cd "$(dirname "$0")/.."
N=${1:-8}; H=${2:-36}
TMP=$(mktemp -d "${TMPDIR:-/tmp}/pc-seeds.XXXXXX")
trap 'rm -rf "$TMP"' EXIT
i=1
while [ $i -le $N ]; do node sim/load.js sim/balance.js SIM_HOURS=$H SIM_VERBOSE=0 > "$TMP/r$i.txt" 2>&1 & i=$((i + 1)); done
wait
node sim/seeds-summary.js "$TMP"
