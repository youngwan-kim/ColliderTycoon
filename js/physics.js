/* Physics for the visuals: event generation and analysis histograms.
 *
 * Events are lists of particles {type, pt, phi, q, E} drawn from the processes
 * the current √s can produce. The display propagates them through the detector
 * you have built (helix radius r = pT / (0.3 B) metres).
 *
 * Histograms are tied to the engine's significance: at significance Z the
 * signal S and background B in the peak window satisfy S/√B = Z, and the
 * statistical scatter of each bin is √N, so peaks emerge as data accumulate
 * and sharpen as the tracker's mass resolution improves.
 */
var PC = PC || {};

PC.Physics = (function () {
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function expo(mean) { return -Math.log(1 - Math.random()) * mean; }
  function gauss() { var u = 1 - Math.random(), v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); }
  function sign() { return Math.random() < 0.5 ? -1 : 1; }

  /* Dimuon resonances: mass, natural width (GeV), relative height, √s needed to see it. */
  var RES = [
    { n: 'ω', m: 0.782, g: 0.0085, a: 3.0, s: 2 },
    { n: 'ρ', m: 0.775, g: 0.149, a: 1.2, s: 2 },
    { n: 'φ', m: 1.019, g: 0.0043, a: 2.0, s: 2.5 },
    { n: 'J/ψ', m: 3.097, g: 0.0001, a: 6.0, s: 6 },
    { n: 'ψ′', m: 3.686, g: 0.0003, a: 0.5, s: 6 },
    { n: 'Υ', m: 9.460, g: 0.0001, a: 1.2, s: 15 },
    { n: 'Υ′', m: 10.023, g: 0.0001, a: 0.45, s: 15 },
    { n: 'Υ″', m: 10.355, g: 0.0001, a: 0.3, s: 15 },
    { n: 'Z', m: 91.19, g: 2.5, a: 2.5, s: 150 }
  ];

  /* ───────── event generation ───────── */
  function soft(n, scale) {
    var out = [];
    for (var i = 0; i < n; i++) {
      var r = Math.random();
      var type = r < 0.6 ? 'h' : r < 0.85 ? 'g' : 'n';  // charged hadron, photon (π⁰), neutral hadron
      // ⟨pT⟩ of soft hadrons is ~0.5 GeV at any √s; only the multiplicity grows
      out.push({ type: type, pt: 0.15 + expo(0.4), phi: rnd(0, 6.2832), q: type === 'h' ? sign() : 0 });
    }
    return out;
  }
  function jet(pt, phi) {
    var n = 4 + Math.floor(rnd(0, 8)), out = [], left = pt;
    for (var i = 0; i < n; i++) {
      var f = i === n - 1 ? left : left * rnd(0.15, 0.45);
      left -= f;
      var r = Math.random(), type = r < 0.62 ? 'h' : r < 0.9 ? 'g' : 'n';
      out.push({ type: type, pt: Math.max(0.5, f), phi: phi + gauss() * 0.06, q: type === 'h' ? sign() : 0, jet: true, axis: phi });
    }
    return out;
  }
  function pair(type, m, phi) {
    // two-body decay seen in the transverse plane, with some recoil
    var pt = m / 2 * rnd(0.75, 1.05), dphi = Math.PI + gauss() * 0.25, q = sign();
    return [{ type: type, pt: pt, phi: phi, q: q }, { type: type, pt: pt * rnd(0.8, 1.1), phi: phi + dphi, q: -q }];
  }

  // Which processes the current lab can show, with weights.
  function menu(ctx) {
    var s = ctx.sqrtS, list = [];
    if (!ctx.beam) return [{ k: 'cosmic', w: 1 }];
    list.push({ k: 'minbias', w: 6 });
    if (s > 2) list.push({ k: 'dimuon', w: 1 });
    if (ctx.collider && s > 50) list.push({ k: 'dijet', w: 3 });
    if (ctx.collider && s > 300) { list.push({ k: 'W', w: 0.6 }, { k: 'Z', w: 0.4 }); }
    if (ctx.collider && s > 1500) list.push({ k: 'ttbar', w: 0.3 });
    if (ctx.collider && s > 5000) list.push({ k: 'Hgg', w: 0.15 }, { k: 'H4l', w: 0.15 });
    return list;
  }
  var SIGNAL_OF = { cosmicMu: 'cosmic', rho: 'dimuonLow', jpsi: 'jpsi', upsilon: 'upsilon', jets: 'dijet',
    w: 'W', z: 'Z', top: 'ttbar', hgg: 'Hgg', h4l: 'H4l', tth: 'ttH', hh: 'HH' };

  function generate(ctx) {
    // ctx: { beam, collider, sqrtS, active: [analysis ids], pileup }
    var k = null, signal = null;
    var act = (ctx.active || []).filter(function (id) { return ctx.beam || SIGNAL_OF[id] === 'cosmic'; });   // no beam, no beam physics
    if (act.length && Math.random() < 0.3) {
      signal = act[Math.floor(Math.random() * act.length)];
      k = SIGNAL_OF[signal];
    }
    if (!k) {
      var m = menu(ctx), tot = 0, r;
      m.forEach(function (x) { tot += x.w; });
      r = Math.random() * tot;
      for (var i = 0; i < m.length; i++) { r -= m[i].w; if (r <= 0) { k = m[i].k; break; } }
    }
    var scale = ctx.collider ? 1 + Math.log10(ctx.sqrtS / 100 + 1) : 0.6;
    var nsoft = ctx.collider ? Math.floor(rnd(8, 18) * scale * (ctx.pileup || 1)) : Math.floor(rnd(2, 6));
    var ev = { k: k, signal: signal, parts: [], met: null, label: '', mass: null };
    var phi = rnd(0, 6.2832), p, mm;
    switch (k) {
      case 'cosmic':
        ev.parts = [{ type: 'mu', pt: 2 + expo(15), phi: rnd(-0.5, 0.5) - Math.PI / 2, q: Math.random() < 0.56 ? 1 : -1, cosmic: true }];
        ev.label = 'cosmic μ' + (ev.parts[0].q > 0 ? '⁺' : '⁻') + ' · p ≈ ' + ev.parts[0].pt.toFixed(1) + ' GeV';
        return ev;
      case 'minbias':
        ev.parts = soft(nsoft + 6, scale); ev.label = (ctx.collider ? ctx.beamLabel : 'p + target') + ' → hadrons (minimum bias)'; break;
      case 'dijet':
        p = rnd(20, 60) * scale;
        ev.parts = jet(p, phi).concat(jet(p * rnd(0.8, 1), phi + Math.PI + gauss() * 0.1), soft(nsoft, scale));
        ev.label = 'two jets · E_T ≈ ' + Math.round(p) + ' GeV each'; break;
      case 'dimuon': case 'dimuonLow': case 'jpsi': case 'upsilon':
        mm = k === 'jpsi' ? 3.097 : k === 'upsilon' ? 9.46 : k === 'dimuonLow' ? 0.78 : pickRes(ctx.sqrtS);
        ev.parts = pair('mu', Math.max(mm, 2.5), phi).concat(soft(nsoft, scale));
        ev.mass = mm; ev.label = 'μ⁺μ⁻ · m = ' + fmtM(mm * (1 + gauss() * (ctx.res || 0.02))); break;
      case 'W':
        p = rnd(32, 42);
        ev.parts = [{ type: 'e', pt: p, phi: phi, q: sign() }].concat(soft(nsoft, scale));
        ev.met = { pt: p * rnd(0.85, 1.1), phi: phi + Math.PI + gauss() * 0.15 };
        ev.label = 'W → eν · electron ' + Math.round(p) + ' GeV + missing E_T'; break;
      case 'Z':
        ev.parts = pair('mu', 91.19, phi).concat(soft(nsoft, scale)); ev.mass = 91.19;
        ev.label = 'Z → μ⁺μ⁻ · m = ' + fmtM(91.19 * (1 + gauss() * (ctx.res || 0.02))); break;
      case 'ttbar': case 'ttH':
        ev.parts = jet(rnd(50, 90), phi).concat(jet(rnd(40, 80), phi + 2.3), jet(rnd(30, 60), phi + 3.6), jet(rnd(40, 80), phi + 4.6),
          [{ type: Math.random() < 0.5 ? 'mu' : 'e', pt: rnd(30, 60), phi: phi + 1.2, q: sign() }], soft(nsoft, scale));
        ev.parts.forEach(function (x, i) { if (x.jet && i < 8) x.b = true; });
        ev.met = { pt: rnd(30, 70), phi: phi - 0.8 };
        if (k === 'ttH') ev.parts = ev.parts.concat(jet(rnd(40, 70), phi - 2), jet(rnd(40, 70), phi - 2.6));
        ev.label = k === 'ttH' ? 'tt̄H → lepton + 6 jets (4 b-tagged)' : 'tt̄ → lepton + 4 jets + missing E_T'; break;
      case 'Hgg':
        ev.parts = [{ type: 'g', pt: rnd(55, 75), phi: phi, q: 0, hard: true }, { type: 'g', pt: rnd(40, 60), phi: phi + Math.PI + gauss() * 0.3, q: 0, hard: true }].concat(soft(nsoft, scale));
        ev.mass = 125; ev.label = 'H → γγ · m = ' + fmtM(125 * (1 + gauss() * 0.01)); break;
      case 'H4l':
        ev.parts = [{ type: 'mu', pt: rnd(25, 50), phi: phi, q: 1 }, { type: 'mu', pt: rnd(15, 35), phi: phi + 2.2, q: -1 },
          { type: 'e', pt: rnd(20, 40), phi: phi + 3.5, q: 1 }, { type: 'e', pt: rnd(10, 25), phi: phi + 4.8, q: -1 }].concat(soft(nsoft, scale));
        ev.mass = 125; ev.label = 'H → ZZ* → 2μ2e · m = ' + fmtM(125 * (1 + gauss() * 0.012)); break;
      case 'HH':
        ev.parts = jet(rnd(50, 90), phi).concat(jet(rnd(50, 90), phi + 1.4), [{ type: 'g', pt: rnd(50, 80), phi: phi + 3, q: 0, hard: true },
          { type: 'g', pt: rnd(40, 70), phi: phi + 4.4, q: 0, hard: true }], soft(nsoft, scale));
        ev.label = 'HH → bb̄γγ'; break;
      default:
        ev.parts = soft(nsoft, scale); ev.label = 'minimum bias';
    }
    if (signal) ev.label = ev.label.replace(/^/, '');
    return ev;
  }
  function pickRes(sqrtS) {
    var ok = RES.filter(function (r) { return sqrtS >= r.s; });
    return ok.length ? ok[Math.floor(Math.random() * ok.length)].m : 1;
  }
  function fmtM(m) { return m < 10 ? m.toFixed(2) + ' GeV' : m.toFixed(1) + ' GeV'; }

  /* ───────── histograms ───────── */
  // fixed pseudo-random normal per bin, so the scatter is stable between frames
  var zcache = {};
  function zbin(key, i) {
    var a = zcache[key] || (zcache[key] = []);
    if (a[i] === undefined) a[i] = gauss();
    return a[i];
  }

  // The shared dimuon spectrum: log-spaced bins from 0.3 GeV to min(200, √s/3).
  function dimuon(o) {
    // o: { sqrtS, res, exposure (≥0), highlight: mass, sigma }
    var lo = 0.3, hi = Math.max(5, Math.min(200, o.sqrtS / 2.5)), nb = 160;
    var bins = [], N = 60 * Math.pow(1 + o.exposure, 2.2);
    var l0 = Math.log(lo), l1 = Math.log(hi);
    for (var i = 0; i < nb; i++) {
      var a = Math.exp(l0 + (l1 - l0) * i / nb), b = Math.exp(l0 + (l1 - l0) * (i + 1) / nb), m = Math.sqrt(a * b), w = b - a;
      var cont = Math.pow(m, -2.6) * (1 - Math.exp(-m / 0.5)) * Math.min(1, o.sqrtS / (8 * m) );  // Drell–Yan-like continuum
      var mu = cont * w * 4;
      RES.forEach(function (r) {
        if (o.sqrtS < r.s || r.m > hi) return;
        var sg = Math.max(r.g / 2.35, r.m * o.res);
        var hl = o.highlight && Math.abs(o.highlight - r.m) / r.m < 0.02 ? Math.min(1, 0.2 + o.sigma / 5) : 1;
        mu += r.a * hl * Math.pow(r.m, -1.6) * w * Math.exp(-0.5 * Math.pow((m - r.m) / sg, 2)) / (sg * 2.5066);
      });
      mu *= N;
      bins.push({ x0: a, x1: b, x: m, mu: mu, n: Math.max(0, mu + zbin('dimuon', i) * Math.sqrt(mu)) });
    }
    return { log: true, lo: lo, hi: hi, bins: bins, xlabel: 'm(μμ) (GeV)', ylabel: 'Events / bin', peaks: RES.filter(function (r) { return o.sqrtS >= r.s && r.m < hi; }) };
  }

  // A mass window with one peak, normalised so that S/√B in ±2σ equals the analysis significance.
  function peak(d, o) {
    var p = d.plot, nb = 40, bins = [];
    var f = Math.max(0, Math.min(1.5, o.frac));               // fraction of the 5σ dataset collected
    var sg = Math.max(p.w / 2.35, p.m * o.res * 0.8);
    var B0 = p.type === 'mt' ? 900 : d.id === 'h4l' ? 40 : 600; // background in the window at 5σ
    var Bwin = B0 * f, S = 5 * Math.sqrt(B0) * f;
    var winLo = p.m - 2 * sg, winHi = p.m + 2 * sg;
    function bgShape(x) { return p.type === 'mt' ? Math.exp(-(x - p.lo) / 18) : Math.exp(-(x - p.lo) / ((p.hi - p.lo) / 2.2)); }
    function sigShape(x) {
      if (p.type === 'mt') return x < p.m ? Math.pow(x / p.m, 3) / Math.sqrt(Math.max(0.02, 1 - Math.pow(x / p.m, 2))) * 0.25 : Math.exp(-(x - p.m) / 4) * 4;
      return Math.exp(-0.5 * Math.pow((x - p.m) / sg, 2));
    }
    // normalise shapes numerically
    var bgWin = 0, sigTot = 0, step = (p.hi - p.lo) / 400;
    for (var x = p.lo; x < p.hi; x += step) {
      if (x >= winLo && x <= winHi) bgWin += bgShape(x) * step;
      sigTot += sigShape(x) * step;
    }
    var bw = (p.hi - p.lo) / nb;
    for (var i = 0; i < nb; i++) {
      var a = p.lo + i * bw, c = a + bw / 2;
      var b = Bwin * bgShape(c) * bw / bgWin, s = S * sigShape(c) * bw / sigTot;
      if (p.z) b += Bwin * 0.9 * Math.exp(-0.5 * Math.pow((c - 91.19) / 3, 2)) * bw / (3 * 2.5066) * 2.5;  // ZZ→4ℓ also shows the Z
      var mu = b + s;
      bins.push({ x0: a, x1: a + bw, x: c, mu: mu, bg: b, n: Math.max(0, Math.round(mu + zbin(d.id, i) * Math.sqrt(mu))) });
    }
    return { log: false, lo: p.lo, hi: p.hi, bins: bins, xlabel: (p.type === 'mt' ? 'm_T' : 'm') + ' (GeV)', ylabel: 'Events / ' + (bw < 10 ? bw.toFixed(1) : Math.round(bw)) + ' GeV', fit: true };
  }

  function spectrum(d, o) {
    var p = d.plot, nb = 30, bins = [], N = 50 + 4000 * Math.min(1.5, o.frac);
    var l0 = Math.log(p.lo), l1 = Math.log(p.hi);
    for (var i = 0; i < nb; i++) {
      var a = Math.exp(l0 + (l1 - l0) * i / nb), b = Math.exp(l0 + (l1 - l0) * (i + 1) / nb), x = Math.sqrt(a * b);
      var mu = N * Math.pow(x / p.lo, -2.7) * (b - a) / p.lo * 0.6;
      bins.push({ x0: a, x1: b, x: x, mu: mu, n: Math.max(0, mu + zbin(d.id, i) * Math.sqrt(mu)) });
    }
    return { log: true, lo: p.lo, hi: p.hi, bins: bins, xlabel: p.x, ylabel: 'Events / bin', fit: true };
  }

  function histogram(d, o) {
    if (!d) return dimuon(o);
    if (d.plot.type === 'dimuon') return dimuon({ sqrtS: o.sqrtS, res: o.res, exposure: o.exposure, highlight: d.plot.m, sigma: o.sigma });
    if (d.plot.type === 'spectrum') return spectrum(d, o);
    return peak(d, o);
  }

  return { generate: generate, histogram: histogram, RES: RES };
})();
