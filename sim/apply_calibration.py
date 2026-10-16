"""Write calibrated costs/needs (JSON on stdin) back into js/content.js, rounded to 2 significant figures."""
import json, re, sys

def nice(x):
    if x < 100:
        return str(int(round(x)))
    e = len(str(int(x))) - 1
    m = round(x / 10 ** e, 1)
    if m >= 10:
        m, e = m / 10, e + 1
    ms = ('%g' % m)
    return '%se%d' % (ms, e)

cal = json.load(sys.stdin)
path = 'js/content.js'
src = open(path).read()
for key, field in (('cost', 'cost'), ('need', 'need')):
    for id_, val in cal[key].items():
        pat = re.compile(r"(\{ id: '%s',[^\n]*?\b%s: )([0-9.e+]+)" % (re.escape(id_), field))
        src, n = pat.subn(lambda m: m.group(1) + nice(val), src, count=1)
        if n != 1:
            print('WARN: could not patch %s.%s' % (id_, field), file=sys.stderr)
open(path, 'w').write(src)
print('calibrated: %d costs, %d needs; calibration run %.1f h; unset %s' % (len(cal['cost']), len(cal['need']), cal['hours'], cal['unset']))
