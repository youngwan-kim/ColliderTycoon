/* The world economy: two big blocs, Europe (where the lab is) and the dollar area, stepped month by month on the
 * lab's calendar (s.date). A coarse sector model, built to be stable and legible rather than to forecast:
 *
 *   households   spend from income and confidence, less when real borrowing costs (felt with a lag) and their
 *                debt are high, more when stocks are up; they borrow more in good times
 *   firms        invest on expected profits, against borrowing costs and tight credit; hire and fire with the
 *                output gap (Okun); set prices as a markup over wages and energy
 *   banks        lend out of their capital; defaults (with unemployment and debt service) eat it, and thin capital
 *                tightens credit: a bust can turn into a banking crisis, and the government recapitalises them
 *   government   spends and taxes (automatic stabilisers), borrows by issuing bonds held by banks, the central
 *                bank and other investors (the holdings always add up to the debt); turns to austerity when debt
 *                or its cost runs high
 *   central bank a Taylor rule, never below zero; at zero it buys bonds instead (QE), and sells them back later
 *   markets      bond yields = the expected path of rates + a term premium + fiscal and banking risk, lowered by
 *                QE; bond prices fall when yields rise. Stocks = profits discounted by the yield and a risk
 *                premium, times a sentiment that overshoots and crashes
 *   the world    oil, priced in dollars, with supply shocks and gluts and demand from both blocs; the exchange
 *                rate (dollars per euro) follows rate and inflation differentials; trade, sentiment and banking
 *                stress spill from one bloc to the other
 * Delayed feedbacks make the cycles: a rate hike reaches demand over a year or two; a credit boom raises debt and
 * the defaults that follow; defaults weaken banks, which lend less. Nothing is tied to a date: every recession,
 * oil shock, crash, banking or debt crisis and stagflation comes out of the dynamics and their shocks, different
 * in every game (its own random stream). Coefficients are in PC.ECON.
 *
 * What it does to the lab (in Europe), bounded (0.85–1.25) and mean-reverting (no compounding price level):
 *   costIndex(kind)  upgrades, hiring and storage follow European inflation and energy (oil in euros); new
 *                    machines also follow bond yields (they are financed over years)
 *   powerMult        the electricity bill takes a share of the budget that grows with the machines
 *   stockMult        alumni in industry give more when markets are high
 * Every quarter is kept as candles (open, high, low, close) for the World window.
 */
var PC = PC || {};

PC.Economy = (function () {
  var M = 1 / 12, V = 2;                                 // a month; the model's version (older saves start afresh)
  var P = PC.ECON = {
    // per bloc: natural unemployment, potential growth, inflation target, neutral real rate, what is normal
    bloc: {
      eu: { name: 'Europe', u0: 7, gpot: [1.2, 3.4], tgt: 2, rr0: 1.5, gov0: 55, hh0: 50, firm0: 70 },
      us: { name: 'Dollar area', u0: 5, gpot: [1.5, 3.6], tgt: 2, rr0: 1.8, gov0: 55, hh0: 60, firm0: 60 }
    },
    lagRate: 0.07,          // how fast borrowing costs reach demand (a month's share): about a year and a half
    gapSpeed: 0.18,         // how fast output follows demand
    okun: 0.45,             // unemployment points per point of output gap
    phillips: 0.32,         // core inflation per point of output gap (a year)
    oilPass: 0.05,          // the energy share in prices
    anchor: 0.012,          // how firmly a credible central bank anchors expectations
    doveEvery: 480, doveLen: [60, 120],      // years of soft central banks: about once in 40 years, for 5–10
    oilEvery: 150, oilSize: [0.35, 0.85], glutEvery: 200, shockFade: 0.965,
    oil0: 25,               // dollars a barrel at log price 0
    capTarget: 10, crisisCap: 5.5, recap: 3, // bank capital ratio (%): normal, crisis, what a rescue restores
    histMax: 160            // quarters kept: forty years
  };

  /* ───── its own random stream ───── */
  function rnd(e) {
    var t = (e.seed = (e.seed + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function gauss(e) { var u = Math.max(1e-9, rnd(e)), v = rnd(e); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); }
  function range(e, a) { return a[0] + (a[1] - a[0]) * rnd(e); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  function bloc(e, id) {
    var c = P.bloc[id];
    return { id: id, gpot: range(e, c.gpot), x: 0, u: c.u0, pic: 2.5, pi: 2.5, pe: 2.5, i: 3.5, rr: c.rr0, y: 4.5, conf: 0, sent: 0,
      gov: c.gov0 - 15, hh: c.hh0 - 25, firm: c.firm0 - 20, cap: P.capTarget, def: 0.8, stress: 0, aus: 0, dove: 0, eff: 4,
      bankB: 0, cbB: 0, prof: 0, S: 0, bond: 0, Y: 0, gy: [], rec: false, rec0: 0, stag: 0, crisis: 0, deficit: 2 };
  }
  function fresh(seed, date) {
    var e = { v: V, seed: seed >>> 0, at: date || 1950, n: 0, es: 0, en: 0, oil: 0, fx: 0, ep: [], hist: [], q: null };
    e.eu = bloc(e, 'eu'); e.us = bloc(e, 'us');
    return e;
  }

  /* ───── episodes ───── */
  function begin(s, e, kind, where, text, ev) {
    var x = { kind: kind, where: where, from: e.at, to: null, text: text };
    e.ep.push(x); if (e.ep.length > 80) e.ep.shift();
    var w = where ? P.bloc[where].name + ': ' : '';
    PC.Engine._log(s, w + kind + ' — ' + text, 'econ');
    ev.push({ type: 'econ', kind: kind, where: where ? P.bloc[where].name : null, text: text });
  }
  function isOpen(e, kind, where) { return e.ep.some(function (x) { return x.kind === kind && x.where === where && x.to === null; }); }
  function end(e, kind, where) { e.ep.forEach(function (x) { if (x.kind === kind && x.where === where && x.to === null) x.to = e.at; }); }

  /* ───── a month of one bloc ───── */
  function blocMonth(s, e, b, o, ev) {
    var c = P.bloc[b.id], x0 = b.x, y0 = b.y, oilLocal = e.oil - (b.id === 'eu' ? e.fx : 0), oilD = oilLocal - (b.oilPrev === undefined ? oilLocal : b.oilPrev);
    b.oilPrev = oilLocal;
    b.oil12 = b.oil12 || []; b.oil12.push(oilLocal); if (b.oil12.length > 13) b.oil12.shift();
    var oilYoY = oilLocal - b.oil12[0];                                       // energy prices over the year (log)
    // borrowing: the policy rate and the long yield, plus what banks charge when they are stretched; felt with a lag
    var lend = 0.5 * b.i + 0.5 * b.y + 1.5 + 3 * b.stress;
    b.rr += P.lagRate * ((lend - b.pe) - b.rr);
    var tight = clamp((P.capTarget - 1.5 - b.cap) / 3, 0, 2) + b.stress;
    // demand, as an output gap it would settle at (% of potential)
    var dconf = b.conf - (b.confPrev === undefined ? b.conf : b.confPrev); b.confPrev = b.conf;
    var xd = 1.8 * b.conf + 14 * dconf - 0.6 * (b.rr - c.rr0 - 2) - 1.5 * tight - 0.05 * (b.hh - c.hh0) - 0.04 * (b.firm - c.firm0)
      - 2.2 * b.aus + 3 * b.sent + 0.25 * (o.x - b.x) - 6 * Math.max(-0.2, oilLocal) * 0.25 + (b.id === 'eu' ? -1.5 : 1.5) * e.fx;
    b.x += P.gapSpeed * (xd - b.x) + 0.22 * gauss(e) - 0.9 * Math.max(0, oilD) * 3;
    b.x = clamp(b.x, -12, 6);
    // jobs, wages and prices
    b.u += 0.2 * (c.u0 - P.okun * b.x + 0.5 * b.stress - b.u);
    // core inflation: expectations, the gap, and energy costs working through (second-round effects)
    b.pic = clamp(0.97 * b.pic + 0.03 * (b.pe + P.phillips * b.x + 3 * oilYoY) + (b.dove > 0 ? 0.03 : 0) + 0.1 * gauss(e), -3, 25);
    b.pi = clamp(b.pic + P.oilPass * 100 * oilYoY, -4, 28);                  // headline: core plus energy over the year
    if (!b.dove && rnd(e) < 1 / P.doveEvery) b.dove = Math.round(range(e, P.doveLen)); else if (b.dove > 0) b.dove--;
    var anc = b.dove > 0 ? 0 : P.anchor;
    b.pe = (0.975 - anc) * b.pe + 0.025 * b.pi + anc * c.tgt;
    // the central bank: a Taylor rule; at zero, bond buying
    var istar = c.rr0 + b.pi + (b.dove > 0 ? -0.5 : 0.5) * (b.pi - c.tgt) + 0.5 * b.x - (b.crisis > 0 ? 2 : 0);
    b.i = Math.max(0, 0.9 * b.i + 0.1 * istar);
    var qe = istar < -0.5 ? Math.min(0.25, -istar * 0.08) : istar > 1.5 && b.cbB > 0 ? -Math.min(b.cbB, 0.2) : 0;
    // the government: stabilisers, interest on the debt (rolled over slowly at the going yield), austerity
    b.eff += 0.015 * (b.y - b.eff);
    var primary = 1 - 0.05 * (b.gov - c.gov0) + 0.5 * -b.x - 2.5 * b.aus;      // a fiscal rule: surpluses when debt is high
    b.deficit = primary + b.gov * b.eff / 100;
    var gnom = (b.gyNow === undefined ? b.gpot : b.gyNow) + b.pi;            // nominal growth over the last year
    b.gov = Math.max(0, b.gov + M * (b.deficit - b.gov * gnom / 100));
    var austerityWanted = b.gov > 85 || b.y - gnom > 2.5 ? 1 : 0;
    b.aus += (austerityWanted ? 0.03 : -0.02); b.aus = clamp(b.aus, 0, 1);
    // who holds the bonds: the central bank buys or sells, banks keep a share, investors the rest
    b.cbB = clamp(b.cbB + qe, 0, b.gov);
    b.bankB = clamp(b.bankB + 0.02 * (0.25 * (b.gov - b.cbB) - b.bankB), 0, b.gov - b.cbB);
    // yields: expected rates, a term premium, fiscal and banking risk, lowered by QE
    var expect = 0.4 * b.i + 0.6 * (c.rr0 + b.pe);
    var risk = 0.8 + Math.min(5, Math.max(0, (b.gov - 90) / 20) + 2 * b.stress) - 0.02 * b.cbB;
    b.y = clamp(0.92 * b.y + 0.08 * (expect + risk) + 0.04 * gauss(e), 0.05, 25);
    // a run on the debt: the central bank buys to cap it ("whatever it takes"); past 150% of GDP, a restructuring
    if (b.y - gnom > 4 && b.gov > 80) b.cbB = Math.min(b.gov, b.cbB + 1);
    if (b.gov > 150) {
      b.gov *= 0.7; b.cap -= 2; b.conf -= 0.8; b.bankB *= 0.7; b.cbB = Math.min(b.cbB, b.gov);
      begin(s, e, 'Debt restructuring', b.id, 'creditors take a 30% loss', ev);
    }
    b.bond += -8 * (b.y - y0) / 100 + b.y / 100 * M;                       // a 10-year bond's total return (log)
    // private credit: booms when confident and money is cheap, squeezed by tight banks
    var credit = 0.5 + 0.9 * b.conf - 0.25 * (b.rr - c.rr0 - 2) - 2 * tight;
    b.hh = Math.max(5, b.hh + M * (credit * 3 - b.hh * gnom / 100 + 1.2));
    b.firm = Math.max(10, b.firm + M * (credit * 3 - b.firm * gnom / 100 + 1.3));
    // defaults: unemployment and debt service; they eat bank capital
    var service = (b.hh + b.firm) * lend / 100;
    b.def = 0.6 + 0.35 * Math.max(0, b.u - c.u0) + 0.3 * Math.max(0, service - 5) + 0.6 * b.stress;
    var loss = b.def / 100 * (b.hh + b.firm) / Math.max(30, b.hh + b.firm) * 100;    // % of loans a year
    b.cap += M * (1.1 - loss * 0.9) - 8 * (b.y - y0) * b.bankB / Math.max(30, b.hh + b.firm) + 0.006 * (P.capTarget - b.cap);   // profits, losses, the bonds' value
    b.stress = clamp(0.92 * b.stress + 0.08 * clamp((P.capTarget - 1.5 - b.cap) / 3 + Math.max(0, b.def - 2.5) / 3, 0, 1) + 0.25 * o.stress * 0.08, 0, 1);
    if (b.cap < P.crisisCap && b.crisis <= 0) {                             // a banking crisis: the government steps in
      b.crisis = 24; b.cap += P.recap; b.gov += 6; b.conf -= 1.2; b.sent -= 0.25;
      begin(s, e, 'Banking crisis', b.id, 'banks fail; the government recapitalises them', ev);
    } else if (b.crisis > 0 && --b.crisis <= 0) end(e, 'Banking crisis', b.id);
    // confidence: momentum, jobs, a little noise
    b.conf = clamp(0.95 * b.conf + 0.05 * (b.x / 2) - 0.5 * Math.max(0, b.u - (b.uPrev || b.u)) + 0.1 * gauss(e), -3, 2);
    b.uPrev = b.u;
    // markets: profits follow the economy; a price = profits ÷ (yield + risk premium − growth), times sentiment
    b.prof += M * (b.gpot + b.pi) / 100 + 0.012 * (b.x - x0);
    var erp = 4 + 3 * b.stress + 0.3 * Math.max(0, b.pi - 4);
    var fund = b.prof - Math.log(Math.max(1.5, b.y + erp - b.gpot - b.pe * 0.5) / 5);
    var mom = b.S - (b.S6 === undefined ? b.S : b.S6);
    b.sent = clamp(0.975 * b.sent + 0.03 * mom + 0.035 * gauss(e) + 0.004, -0.9, 1.2);
    b.S6 = b.S6 === undefined ? b.S : b.S6 + (b.S - b.S6) / 6;
    if (rnd(e) < 1 / 220 + 0.04 * Math.max(0, b.sent - 0.3)) {             // a crash: likelier in a bubble
      var drop = 0.2 + 0.25 * rnd(e);
      b.sent -= drop * 1.4; b.conf -= 0.8; o.sent -= drop * 0.6; o.conf -= 0.3;
      begin(s, e, 'Market crash', b.id, 'stocks fall ' + Math.round((1 - Math.exp(-drop)) * 100) + '%', ev);
      end(e, 'Market crash', b.id);
    }
    b.S = fund + b.sent;
    // GDP: potential (its growth drifts in long regimes) times the gap; growth over the year
    if (rnd(e) < 1 / 300) b.gpot = range(e, c.gpot);
    b.Y += M * b.gpot / 100 + (b.x - x0) / 100;
    b.gy.push(b.Y); if (b.gy.length > 13) b.gy.shift();
    var gy = (b.Y - b.gy[0]) * 100;
    b.gyNow = gy;
    // recession: output below a year ago; stagflation: high inflation in a slump
    if (!b.rec && gy < -0.2 && e.n > 12) { b.rec = true; begin(s, e, 'Recession', b.id, 'output falls; unemployment ' + b.u.toFixed(1) + '%', ev); }
    else if (b.rec && gy > 0.6) { b.rec = false; end(e, 'Recession', b.id); }
    b.stag = b.pi > 7 && b.x < -1 ? b.stag + 1 : 0;
    if (b.stag === 4 && !isOpen(e, 'Stagflation', b.id)) begin(s, e, 'Stagflation', b.id, 'inflation ' + b.pi.toFixed(0) + '% in a slump', ev);
    if (isOpen(e, 'Stagflation', b.id) && (b.pi < 5 || b.x > 0)) end(e, 'Stagflation', b.id);
    // a debt crisis: the yield runs away from growth on a big debt
    if (b.gov > 90 && b.y - gnom > 3 && !isOpen(e, 'Debt crisis', b.id)) begin(s, e, 'Debt crisis', b.id, 'public debt ' + b.gov.toFixed(0) + '% of GDP; yields ' + b.y.toFixed(1) + '%', ev);
    if (isOpen(e, 'Debt crisis', b.id) && (b.y - gnom < 1 || b.gov < 80)) end(e, 'Debt crisis', b.id);
  }

  /* ───── a month of the world ───── */
  function month(s, e, ev) {
    e.at += M; e.n++;
    // oil: supply shocks and gluts, fading; noise; demand from both blocs
    if (rnd(e) < 1 / P.oilEvery) {
      var before = P.oil0 * Math.exp(e.oil);
      e.es += range(e, P.oilSize) * (1 + 0.8 * rnd(e) * rnd(e));
      e.oil = e.es + e.en + 0.02 * (e.eu.x + e.us.x);
      if (!isOpen(e, 'Oil shock', null)) begin(s, e, 'Oil shock', null, 'oil from $' + Math.round(before) + ' to $' + Math.round(P.oil0 * Math.exp(e.oil)) + ' a barrel', ev);
    } else if (rnd(e) < 1 / P.glutEvery) e.es -= 0.2 + 0.25 * rnd(e);
    e.es *= P.shockFade;
    e.en = 0.94 * e.en + 0.05 * gauss(e);
    e.oil = e.es + e.en + 0.02 * (e.eu.x + e.us.x);
    if (e.es < 0.12) end(e, 'Oil shock', null);
    // the exchange rate (log dollars per euro, 0 = normal): rate and inflation differentials, noise, mean reversion
    e.fx = clamp(0.985 * e.fx + 0.003 * (e.eu.i - e.us.i) - 0.002 * (e.eu.pi - e.us.pi) + 0.012 * gauss(e), -0.6, 0.6);
    blocMonth(s, e, e.eu, e.us, ev);
    blocMonth(s, e, e.us, e.eu, ev);
    record(e);
  }

  /* ───── the quarter's candles ───── */
  function vals(e) {
    function b(x) { return { s: 100 * Math.exp(x.S), y: x.y, p: x.pi, i: x.i, g: x.gyNow || 0, u: x.u, d: x.gov, st: x.stress, r: x.rec ? 1 : 0, q: x.cbB }; }
    return { oil: P.oil0 * Math.exp(e.oil), fx: 1.15 * Math.exp(e.fx), eu: b(e.eu), us: b(e.us) };
  }
  function r2(v) { return Math.round(v * 100) / 100; }
  function ohlc(c, v) { return c ? [c[0], Math.max(c[1], v), Math.min(c[2], v), v] : [v, v, v, v]; }
  function record(e) {
    var v = vals(e), q = e.q || (e.q = { t: Math.floor((e.at - M) * 4) / 4 });
    q.oil = ohlc(q.oil, v.oil); q.fx = ohlc(q.fx, v.fx);
    ['eu', 'us'].forEach(function (k) {
      var a = q[k] || (q[k] = {}), x = v[k];
      a.s = ohlc(a.s, x.s); a.y = ohlc(a.y, x.y); a.p = ohlc(a.p, x.p);
      a.i = x.i; a.g = x.g; a.u = x.u; a.d = x.d; a.st = x.st; a.r = Math.max(a.r || 0, x.r); a.q = x.q;
    });
    if (e.n % 3 === 0) {                                                       // the quarter closes
      var out = { t: r2(q.t), oil: q.oil.map(r2), fx: q.fx.map(function (z) { return Math.round(z * 1000) / 1000; }) };
      ['eu', 'us'].forEach(function (k) {
        var a = q[k], o = {};
        Object.keys(a).forEach(function (f) { o[f] = Array.isArray(a[f]) ? a[f].map(r2) : r2(a[f]); });
        out[k] = o;
      });
      e.hist.push(out); if (e.hist.length > P.histMax) e.hist.shift();
      e.q = null;
    }
  }

  function tick(s, ev) {
    var e = s.econ;
    if (!e || e.v !== V) e = s.econ = fresh(s.seed ^ 0x5bd1e995, s.date);    // none yet, or the old one-bloc model
    var d = s.date !== undefined ? s.date : e.at, k = 0;
    while (e.at + M <= d && k++ < 600) month(s, e, ev);
    if (k >= 600) e.at = d;                              // a very long jump: catch the calendar up, not every month
  }

  /* ───── what it does to the lab (in Europe) ───── */
  var EW = { fac: 0.5, tech: 0.3, staff: 0.05, store: 0.2 };
  function oilEU(e) { return Math.exp(e.oil - e.fx); }   // oil in euros, against normal
  function costIndex(s, kind) {
    var e = s.econ;
    if (!e || e.v !== V) return 1;
    var b = e.eu, w = EW[kind] === undefined ? 0.2 : EW[kind];
    return clamp(1 + 0.015 * (b.pi - P.mid.pi) + 0.12 * w * (oilEU(e) - P.mid.oil) + (kind === 'fac' ? 0.025 : 0.008) * (b.y - P.mid.y), 0.85, 1.25);
  }
  P.mid = { pi: 3.3, oil: 1.25, y: 5.7 };                  // the model's typical values: costs are ×1 there (sim/econstats)
  function powerShare(s) {
    var E = PC.Engine;
    return 0.02 + (E.has(s, 'ps') ? 0.03 : 0) + (E.has(s, 'sps') ? 0.03 : 0) + (E.has(s, 'lhc') ? 0.08 : 0);
  }
  function powerMult(s) {
    var e = s.econ;
    return e && e.v === V ? clamp(1 - powerShare(s) * (oilEU(e) - P.mid.oil), 0.75, 1.1) : 1;
  }
  function stockMult(s) {
    var e = s.econ;
    return e && e.v === V ? clamp(Math.exp((e.eu.sent + e.us.sent) / 2), 0.5, 1.6) : 1;
  }
  function current(s) { return s.econ && s.econ.v === V ? s.econ.ep.filter(function (x) { return x.to === null; }) : []; }
  function where(x) { return x.where ? P.bloc[x.where].name + ': ' : ''; }
  function mood(s) {
    var e = s.econ;
    if (!e || e.v !== V) return '';
    var c = current(s).filter(function (x) { return !x.where || x.where === 'eu'; }).map(function (x) { return x.kind.toLowerCase(); });
    return c.length ? c.join(' · ') : e.eu.x > 1.5 ? 'boom' : e.eu.x < -1.5 ? 'slowdown' : 'steady growth';
  }
  function oil(e) { return P.oil0 * Math.exp(e.oil); }

  return { fresh: fresh, tick: tick, costIndex: costIndex, powerMult: powerMult, powerShare: powerShare, stockMult: stockMult,
    current: current, mood: mood, where: where, oil: oil, P: P, V: V };
})();
