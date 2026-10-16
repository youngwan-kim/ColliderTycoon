/* Iterative cost/need calibration (fixed point).
 *
 * Each pass plays the game with the shared bot and measures the real time
 * between consecutive purchases, and each discovery's time from first
 * eligibility to 5σ. Costs and thresholds are nudged toward a geometric
 * schedule scaled so the Higgs lands near HIGGS_H hours.
 * Prints JSON consumed by sim/apply_calibration.py.
 */
(function () {
  var E = PC.Engine;
  var PASSES = typeof CAL_PASSES !== 'undefined' ? CAL_PASSES : 10;
  var TARGET = (typeof HIGGS_H !== 'undefined' ? HIGGS_H : 18) * 3600;
  var items = PC.FACILITIES.filter(function (f) { return f.cost > 0 && !f.speculative; })
    .concat(PC.TECH.filter(function (t) { return !t.speculative && PC.START.tech.indexOf(t.id) < 0; }));
  var discs = PC.DISCOVERIES.filter(function (d) { return !d.speculative; });
  var SPREAD = 150;     // last purchase gap / first purchase gap
  function shape(i, n) { return Math.pow(SPREAD, i / (n - 1)); }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  var last;
  for (var pass = 0; pass < PASSES; pass++) {
    var box = { st: E.newState() };
    var buys = [], elig = {}, done = {};
    var bot = PC.Bot(box, {
      onBuy: function (it) { buys.push({ it: it, t: box.st.t }); },
      beforeTick: function () {
        var s = box.st, ls = s.ls; s.ls = null;
        var dv = E.derive(s);
        discs.forEach(function (d) {
          if (elig[d.id] !== undefined) return;
          var info = E.discoveryInfo(s, d, dv);
          if (info.eligible && info.rate > 0) elig[d.id] = s.t;
        });
        s.ls = ls;
      }
    });
    for (var t = 0; t < 45 * 3600; t++) {
      bot.step().forEach(function (e) { if (e.type === 'discovery') done[e.id] = box.st.t; });
      if (done.hgg && done.h4l && buys.length >= items.length && done.tth) break;
    }
    var H = Math.max(done.hgg || 0, done.h4l || 0) || undefined;
    // purchases before the Higgs share ~70% of the target time; discoveries/shutdowns the rest
    var preH = buys.filter(function (b) { return H === undefined || b.t <= H; }).length || buys.length;
    var sumShape = 0;
    for (var i = 0; i < preH; i++) sumShape += shape(i, items.length);
    var k = 0.7 * TARGET / sumShape;
    buys.forEach(function (b, i) {
      var gap = Math.max(1, b.t - (i ? buys[i - 1].t : 0));
      var want = k * shape(i, items.length);
      b.it.cost = Math.max(10, b.it.cost * clamp(Math.pow(want / gap, 0.7), 0.1, 10));
    });
    items.forEach(function (it) {   // never bought: too expensive
      if (!buys.some(function (b) { return b.it === it; })) it.cost *= 0.3;
    });
    var order = discs.filter(function (d) { return elig[d.id] !== undefined; })
      .sort(function (a, b) { return elig[a.id] - elig[b.id]; });
    var dk = 0.15 * TARGET / order.length;
    order.forEach(function (d, i) {
      var want = dk * 2 * (i + 1) / order.length;       // later discoveries take longer
      var took = done[d.id] !== undefined ? Math.max(1, done[d.id] - elig[d.id]) : want * 4;
      d.need = d.need * clamp(Math.pow(want / took, 0.7), 0.2, 5);
    });
    debug('pass ' + pass + ': higgs ' + (H !== undefined ? (H / 3600).toFixed(2) + 'h' : 'n/a') +
      ', ttH ' + (done.tth !== undefined ? (done.tth / 3600).toFixed(1) + 'h' : 'n/a') +
      ', bought ' + buys.length + '/' + items.length + ', end ' + (box.st.t / 3600).toFixed(1) + 'h');
    last = box.st.t;
  }
  var cost = {}, need = {};
  items.forEach(function (it) { cost[it.id] = it.cost; });
  discs.forEach(function (d) { need[d.id] = d.need; });
  print(JSON.stringify({ cost: cost, need: need, hours: last / 3600, unset: [] }));
})();
