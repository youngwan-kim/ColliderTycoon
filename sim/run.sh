#!/bin/sh
# Headless balance run.  Usage: sim/run.sh [hours] [verbose]
cd "$(dirname "$0")/.."
node sim/load.js sim/balance.js SIM_HOURS=${1:-30} SIM_VERBOSE=${2:-0}
