#!/bin/sh
# Recalibrate costs and discovery thresholds, writing them into js/content.js.
# Usage: sim/calibrate.sh [higgs-target-hours] [passes]
cd "$(dirname "$0")/.."
node sim/load.js sim/calibrate.js HIGGS_H=${1:-18} CAL_PASSES=${2:-10} | python3 sim/apply_calibration.py
