/* Summarises the runs of sim/seeds.sh: one line per game, then the median and range of each milestone. */
var fs = require('fs'), dir = process.argv[2], files = fs.readdirSync(dir).filter(function (f) { return /^r\d+\.txt$/.test(f); });
var MILES = [['Z', /\*\*\* The Z boson/], ['LHC', /built Large Hadron Collider/], ['Higgs', /\*\*\* Higgs → γγ/], ['HH', /\*\*\* Higgs self-coupling/]];
function hours(line) { var m = /^(\d+)h(\d+)/.exec(line); return m ? +m[1] + m[2] / 60 : null; }
function hm(h) { if (h === null || h === undefined) return '  —  '; var m = Math.round(h * 60); return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0'); }
var cols = {}, closed = 0, errors = 0;
MILES.forEach(function (m) { cols[m[0]] = []; });
console.log('game   ' + MILES.map(function (m) { return m[0].padEnd(6); }).join(' ') + ' budget  votes  politics / audits');
files.forEach(function (f, i) {
  var t = fs.readFileSync(dir + '/' + f, 'utf8'), lines = t.split('\n'), row = [];
  if (/Error/.test(t)) errors++;
  if (/^CLOSED/m.test(t)) closed++;
  MILES.forEach(function (m) { var l = lines.filter(function (x) { return m[1].test(x); })[0], h = l ? hours(l) : null; row.push(hm(h)); if (h !== null) cols[m[0]].push(h); });
  var bud = (/budget ×([0-9.]+) \(/.exec(t) || [])[1] || '?', votes = (/went the lab's way/.test(t) ? /(\d+) votes, (\d+) passed, (\d+) went/.exec(t) : null);
  var pol = (/^politics: (.*)$/m.exec(t) || [])[1] || '', aud = (/^audits: .*· (\{.*\})$/m.exec(t) || [])[1] || '';
  console.log(('#' + (i + 1)).padEnd(6) + ' ' + row.map(function (x) { return x.padEnd(6); }).join(' ') + ' ×' + bud.padEnd(6) + ' ' + (votes ? votes[3] + '/' + votes[1] : '?').padEnd(6) + ' ' + pol + ' ' + aud + (/^CLOSED/m.test(t) ? '  CLOSED' : ''));
});
console.log('');
MILES.forEach(function (m) {
  var a = cols[m[0]].slice().sort(function (x, y) { return x - y; });
  if (!a.length) return;
  console.log(m[0].padEnd(6) + ' median ' + hm(a[Math.floor(a.length / 2)]) + '  range ' + hm(a[0]) + '–' + hm(a[a.length - 1]) + '  (' + a.length + ' of ' + files.length + ' games)');
});
console.log((closed ? closed + ' game(s) closed by the council' : 'no game closed by the council') + (errors ? ' · ' + errors + ' with errors' : ''));
