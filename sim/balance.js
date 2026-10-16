/* Headless balance run with the shared bot. Prints a timeline of milestones. */
(function () {
  var E = PC.Engine;
  var H = (typeof SIM_HOURS !== 'undefined') ? SIM_HOURS : 30;
  var VERBOSE = typeof SIM_VERBOSE !== 'undefined' && SIM_VERBOSE;
  var box = { st: E.newState() };
  function hrs(t) { var h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60); return h + 'h' + (m < 10 ? '0' : '') + m; }
  function fmt(x) { return x < 1e3 ? x.toFixed(1) : x.toExponential(2); }
  function mark(txt) {
    var s = box.st, d = E.derive(s);
    print(hrs(s.t) + '  ' + E.year(s) + '  ' + txt + '   [data/s ' + fmt(d.dataRate) + ', $/s ' + fmt(d.fundsRate) +
      ', rep ' + fmt(s.rep) + ', bn ' + d.bottleneck + ']');
  }
  var lsTime = 0;
  var bot = PC.Bot(box, {
    onBuy: function (it) { if (VERBOSE) mark('buy ' + it.name + ' (' + fmt(it.cost) + ')'); },
    onShutdown: function (ls) { lsTime += ls.total; if (VERBOSE) mark('LS' + ls.n + ' ' + Math.round(ls.total) + 's'); }
  });
  for (var t = 0; t < H * 3600; t++) {
    bot.step().forEach(function (e) {
      if (e.type === 'discovery') mark('*** ' + PC.DISCMAP[e.id].name);
      if (e.type === 'built') mark('built ' + PC.FAC[e.id].name);
    });
    if (box.st.disc.hh && box.st.disc.hh.done) break;
  }
  var s = box.st;
  print('--- ' + hrs(s.t) + ' simulated; ' + s.lsCount + ' shutdowns totalling ' + hrs(lsTime) + '; staff ' + JSON.stringify(s.staff));
  PC.DISCOVERIES.forEach(function (d) {
    var i = E.discoveryInfo(s, d);
    if (!i.done) print('not done: ' + d.name + '  σ=' + i.sigma.toFixed(2) + ' miss=' + i.missCaps.join(','));
  });
  print('legacy gain if prestige now: ' + E.prestigeGain(s));
})();
