/* The world economy's statistics over many seeds: episodes per century, the spread of every variable per bloc,
 * and the mean of the cost index and the power bill (which should sit near 1). Usage: node sim/load.js sim/econstats.js */
(function () {
  var Ec = PC.Economy, runs = 150, years = 80, cnt = {}, S = { eu: {}, us: {} }, oils = [], fxs = [], ci = [], pw = [];
  PC.Engine._log = function () {};
  var keys = ['pi', 'y', 'i', 'u', 'x', 'gov', 'hh', 'firm', 'cap', 'def', 'gy', 'stress', 'sent', 'cbB', 'aus'];
  ['eu', 'us'].forEach(function (b) { keys.forEach(function (k) { S[b][k] = []; }); S[b].rec = 0; });
  PC.Engine.has = function () { return true; };
  for (var k = 0; k < runs; k++) {
    var s = { date: 1950, econ: Ec.fresh(k * 7919 + 13, 1950) }, ev = [];
    for (var m = 0; m < years * 12; m++) {
      s.date += 1 / 12; Ec.tick(s, ev);
      if (m % 3 === 0 && m > 60) {
        ['eu', 'us'].forEach(function (b) { var x = s.econ[b]; keys.forEach(function (kk) { S[b][kk].push(kk === 'gy' ? x.gyNow || 0 : x[kk]); }); if (x.rec) S[b].rec += 0.25; });
        oils.push(Ec.oil(s.econ)); fxs.push(1.15 * Math.exp(s.econ.fx)); ci.push(Ec.costIndex(s, 'fac')); (S.oe = S.oe || []).push(Math.exp(s.econ.oil - s.econ.fx)); pw.push(Ec.powerMult(s));
      }
    }
    s.econ.ep.forEach(function (x) { var key = (x.where || 'world') + ' ' + x.kind; cnt[key] = (cnt[key] || 0) + 1; });
  }
  function q(a, p) { a = a.slice().sort(function (x, y) { return x - y; }); return a[Math.floor(p * (a.length - 1))]; }
  function row(a) { return [q(a, .05), q(a, .5), q(a, .95)].map(function (v) { return v.toFixed(1); }).join('/'); }
  var per = {}; Object.keys(cnt).sort().forEach(function (k) { per[k] = +(cnt[k] / runs / years * 100).toFixed(1); });
  print('episodes per century: ' + JSON.stringify(per));
  ['eu', 'us'].forEach(function (b) {
    print(b + ': ' + keys.map(function (k) { return k + ' ' + row(S[b][k]); }).join(' · ') + ' · recession ' + (S[b].rec / runs / (years - 5) * 100).toFixed(0) + '% of time');
  });
  var mean = function (a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; };
  print('oil ' + row(oils) + ' max ' + q(oils, 1).toFixed(0) + ' · fx ' + q(fxs, .05).toFixed(2) + '/' + q(fxs, .5).toFixed(2) + '/' + q(fxs, .95).toFixed(2) +
    ' · cost index mean ' + mean(ci).toFixed(3) + ' (' + q(ci, .05).toFixed(2) + '–' + q(ci, .95).toFixed(2) + ') · power mean ' + mean(pw).toFixed(3));
})();
