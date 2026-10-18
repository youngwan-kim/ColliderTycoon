#!/bin/sh
# UI smoke tests in headless Chrome (sim/ui_tests.js), in a throwaway profile: your saves are not touched.
# Usage: sim/ui-test.sh        Chrome is found on the usual paths, or set CHROME=/path/to/chrome
cd "$(dirname "$0")/.."
ROOT=$(pwd)
CHROME=${CHROME:-}
if [ -z "$CHROME" ]; then
  for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
           "/Applications/Chromium.app/Contents/MacOS/Chromium" google-chrome chromium chromium-browser; do
    if [ -x "$c" ] || command -v "$c" >/dev/null 2>&1; then CHROME=$c; break; fi
  done
fi
[ -n "$CHROME" ] || { echo "Chrome not found: set CHROME=/path/to/chrome"; exit 2; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/pc-uitest.XXXXXX")
trap 'rm -rf "$TMP"' EXIT
# the real page, its files referenced where they are, with the tests appended
sed -e "s#href=\"css/#href=\"file://$ROOT/css/#" -e "s#src=\"js/#src=\"file://$ROOT/js/#g" \
    -e "s#</body>#  <script src=\"file://$ROOT/sim/ui_tests.js\"></script>\n</body>#" index.html > "$TMP/test.html"

"$CHROME" --headless=new --disable-gpu --no-first-run --user-data-dir="$TMP/profile" --allow-file-access-from-files \
  --window-size=1600,1000 --virtual-time-budget=60000 --dump-dom "file://$TMP/test.html#debug" 2>/dev/null > "$TMP/dom.html"

RES=$(sed -n '/<pre id="UITEST">/,/<\/pre>/p' "$TMP/dom.html" | sed -e 's/<pre id="UITEST">//' -e 's#</pre>.*##' \
  -e 's/&amp;/\&/g' -e 's/&lt;/</g' -e 's/&gt;/>/g' -e 's/&quot;/"/g')
if [ -z "$RES" ]; then echo "no results: the tests did not finish (page error or timeout)"; exit 1; fi
echo "$RES"
echo "$RES" | grep -q '^FAIL' && exit 1
exit 0
