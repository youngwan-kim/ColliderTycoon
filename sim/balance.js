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
    print(hrs(s.t) + '  ' + E.year(s) + ' (' + E.milestoneYear(s) + ')  ' + txt + '   [data/s ' + fmt(d.dataRate) + ', $/s ' + fmt(d.fundsRate) +
      ', rep ' + fmt(s.rep) + ', bn ' + d.bottleneck + ']');
  }
  var lsTime = 0;
  var bot = PC.Bot(box, {
    onBuy: function (it) { if (VERBOSE) mark('buy ' + it.name + ' (' + fmt(it.cost) + ')'); },
    onShutdown: function (ls) { lsTime += ls.total; if (VERBOSE) mark('LS' + ls.n + ' ' + Math.round(ls.total) + 's'); }
  });
  var econSum = { ci: 0, pw: 0, n: 0, lo: 9, hi: 0, bm: 0, blo: 9, bhi: 0, lb: 0, lt: 0, lp: 0, vlo: 9, vhi: 0, vlow: [] };
  for (var t = 0; t < H * 3600; t++) {
    if (t % 60 === 0) { var ci = PC.Economy.costIndex(box.st, 'fac'); econSum.ci += ci; econSum.pw += PC.Economy.powerMult(box.st); econSum.n++; econSum.lo = Math.min(econSum.lo, ci); econSum.hi = Math.max(econSum.hi, ci); var bm = PC.Council.budgetMult(box.st); econSum.lb += PC.Parliament.budgetMult(box.st); econSum.lt += PC.Parliament.costMult(box.st, 'tech') * PC.Parliament.costMult(box.st, 'fac'); econSum.lp += PC.Parliament.powerTax(box.st); if (box.st.audit && box.st.date >= 1960) { var av = box.st.audit.V; econSum.vlo = Math.min(econSum.vlo, av); econSum.vhi = Math.max(econSum.vhi, av); if (av < econSum.vlo + 1e-9) econSum.vlow = [Math.floor(box.st.date), (box.st.t / 3600).toFixed(1) + 'h']; } econSum.bm += bm; econSum.blo = Math.min(econSum.blo, bm); econSum.bhi = Math.max(econSum.bhi, bm); }
    bot.step().forEach(function (e) {
      if (e.type === 'discovery') mark('*** ' + PC.DISCMAP[e.id].name);
      if (e.type === 'built') mark('built ' + PC.FAC[e.id].name);
    });
    if (box.st.disc.hh && box.st.disc.hh.done) break;
    if (box.st.audit && box.st.audit.stage === 'closed') { print('CLOSED by the council at ' + hrs(box.st.t) + ' in ' + Math.floor(box.st.date)); break; }
  }
  var s = box.st;
  print('--- ' + hrs(s.t) + ' simulated; ' + s.lsCount + ' shutdowns totalling ' + hrs(lsTime) + '; staff ' + JSON.stringify(s.staff));
  (function () {                                         // the world economy: its episodes, and what it did to costs and the budget
    var e = s.econ, h = e.hist, ci = 0, pw = 0;
    var eps = {}; e.ep.forEach(function (x) { var k = (x.where ? x.where + ' ' : '') + x.kind; eps[k] = (eps[k] || 0) + 1; });
    print('economy: ' + JSON.stringify(eps) + ' · oil now $' + PC.Economy.oil(e).toFixed(0) + ' · Europe: infl ' + e.eu.pi.toFixed(1) + '%, yield ' + e.eu.y.toFixed(1) + '%, unemployment ' + e.eu.u.toFixed(1) + '%, debt ' + e.eu.gov.toFixed(0) + '% · mean cost index ' + (econSum.ci / econSum.n).toFixed(3) + ' (' + econSum.lo.toFixed(2) + '–' + econSum.hi.toFixed(2) + '), mean power ×' + (econSum.pw / econSum.n).toFixed(3));
    var c = s.council, ev = {}; c.log.forEach(function (l) { ev[l.what] = (ev[l.what] || 0) + 1; });
    print('council: founders ' + PC.COUNTRIES.filter(function (k) { return c.st[k.id].founder; }).map(function (k) { return k.id; }).join(' ') + ' · now ' + PC.Council.count(s, 'member') + ' members, ' + PC.Council.count(s, 'associate') + ' associates · ' + JSON.stringify(ev) + ' · budget ×' + (econSum.bm / econSum.n).toFixed(3) + ' (' + econSum.blo.toFixed(2) + '–' + econSum.bhi.toFixed(2) + ')');
    var pa = s.parl, passed = pa.votes.filter(function (v) { return v.pass; }), good = pa.votes.filter(function (v) { return v.pass === (v.want > 0); });
    var acts = {}; pa.log.forEach(function (l) { if (/lobby|testify|outreach|diplomacy|scandal/.test(l.what)) acts[l.what] = (acts[l.what] || 0) + 1; });
    print('politics: ' + JSON.stringify(acts));
    print('parliament: ' + pa.elections.length + ' elections · ' + pa.votes.length + ' votes, ' + passed.length + ' passed, ' + good.length + ' went the lab\'s way · laws: budget ×' + (econSum.lb / econSum.n).toFixed(3) + ', construction×upgrades ×' + (econSum.lt / econSum.n).toFixed(3) + ', power tax ×' + (econSum.lp / econSum.n).toFixed(3) + ' · last seats ' + JSON.stringify(Object.keys(pa.seats || {}).reduce(function (o, k) { o[k] = Math.round(pa.seats[k] * 100); return o; }, {})));
    var au = s.audit, ah = {}; au.hist.forEach(function (h) { ah[h.what] = (ah[h.what] || 0) + 1; });
    print('audits: value ' + econSum.vlo.toFixed(3) + '–' + econSum.vhi.toFixed(3) + ' (lowest in ' + econSum.vlow.join(' at ') + ') · stage now ' + au.stage + ' · ' + JSON.stringify(ah));
    print('episodes: ' + e.ep.map(function (x) { return Math.floor(x.from) + ' ' + (x.where ? x.where + ' ' : '') + x.kind; }).join(', '));
  })();
  (function () {                                         // the people: who is here, who left, retired, died, and at what age
    var p = s.people, al = p.alumni, by = {}, dead = al.filter(function (x) { return x.died !== null && x.died !== undefined; });
    al.forEach(function (x) { by[x.dest] = (by[x.dest] || 0) + 1; });
    var ages = dead.map(function (x) { return x.died - x.born; }).sort(function (a, b) { return a - b; });
    var here = p.list.map(function (x) { return s.date - x.born; }).sort(function (a, b) { return a - b; });
    function med(a) { return a.length ? a[Math.floor(a.length / 2)].toFixed(0) : '-'; }
    print('save: people ' + (JSON.stringify(p).length / 1024).toFixed(0) + ' kB, whole state ' + (JSON.stringify(s).length / 1024).toFixed(0) + ' kB');
    print('people: ' + p.list.length + ' here (median age ' + med(here) + ', oldest ' + (here.length ? here[here.length - 1].toFixed(0) : '-') + '), ' + p.wait.length +
      ' waiting; alumni (last ' + al.length + ') ' + JSON.stringify(by) + '; died ' + dead.length + ' (median age ' + med(ages) + ', youngest ' + (ages.length ? ages[0].toFixed(0) : '-') + ')');
  })();
  PC.DISCOVERIES.forEach(function (d) {
    var i = E.discoveryInfo(s, d);
    if (!i.done) print('not done: ' + d.name + '  σ=' + i.sigma.toFixed(2) + ' miss=' + i.missCaps.join(','));
  });
  print('legacy gain if prestige now: ' + E.prestigeGain(s));
})();
