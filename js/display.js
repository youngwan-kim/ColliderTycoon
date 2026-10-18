/* Detector & event display.
 *
 * Three geometries, chosen by what the lab has built:
 *   stand    — cosmic test stand (vertical): scintillator paddles, chambers, magnet
 *   fixed    — fixed-target spectrometer (side view, beam left→right)
 *   collider — general-purpose collider detector, end view (r–φ), drawn in metres
 * Each subsystem is drawn only once installed; ordered upgrades are dashed outlines,
 * and during a Long Shutdown they fill in as the installation progresses.
 * Charged tracks follow helices of radius r = pT / (0.3 B) m. In the collider the
 * return yoke carries ≈2 T the other way, so muons bend back (the CMS "S").
 * Subsystems are drawn as built: tracker modules in tilted rings, PbWO₄ crystals in
 * 18 supermodules, HCAL wedges with their sampling layers, the coil in its cryostat,
 * the 12-sided yoke with drift-tube chambers. A Long Shutdown installs them piece by
 * piece. Hits fire modules, crystals, towers (deeper for bigger showers) and chamber
 * segments; jets get a cone.
 */
var PC = PC || {};

PC.Display = (function () {
  var cv, ctx, W = 0, H = 0, dpr = 1;
  var colors = {}, view = {}, events = [], last = 0, geomKey = '', geom = null;
  var techs = PC.People.crowd(), engs = PC.People.crowd();

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    ['--track', '--fg', '--dim', '--faint', '--rule', '--b1', '--b2', '--ok', '--warn', '--screen', '--mono'].forEach(function (k) {
      colors[k.slice(2)] = cs.getPropertyValue(k).trim();
    });
    geomKey = '';
  }
  function resize() {
    var r = cv.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    geomKey = '';
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* ───────── subsystem state: installed / installing(progress) / pending ───────── */
  function state(id) {
    if (view.installed[id]) return { on: true, p: 1 };
    if (view.installing[id] !== undefined) return { on: false, p: view.installing[id], work: true };
    if (view.pending[id]) return { on: false, p: 0, planned: true };
    return null;
  }
  // first matching tech among alternatives (newest first)
  function sys() {
    for (var i = 0; i < arguments.length; i++) { var st = state(arguments[i]); if (st) { st.id = arguments[i]; return st; } }
    return null;
  }

  /* ───────── collider geometry (metres) ───────── */
  var RMAX = 7.6;
  // piecewise-linear radial scale (metres → fraction of the drawing radius), as event displays do
  var RK = [[0, 0], [1.2, 0.36], [1.8, 0.5], [3.2, 0.67], [7.6, 1]];
  var Rd = 1;
  function M(r) {
    for (var i = 1; i < RK.length; i++) if (r <= RK[i][0]) {
      var a = RK[i - 1], b = RK[i];
      return Rd * (a[1] + (b[1] - a[1]) * (r - a[0]) / (b[0] - a[0]));
    }
    return Rd;
  }
  function XY(cx, cy, x, y) { var r = Math.sqrt(x * x + y * y), k = r > 0 ? M(r) / r : 0; return [cx + x * k, cy + y * k]; }
  function colliderLayout() {
    var L = [];
    var pix = sys('pixels'); if (pix) L.push({ k: 'pixel', r0: 0.04, r1: 0.16, st: pix, name: 'pixels' });
    var str = sys('siStrips'), cen = sys('imageCh');
    if (str) L.push({ k: 'strips', r0: 0.2, r1: 1.1, st: str, name: 'silicon strips' });
    else if (cen) L.push({ k: 'drift', r0: 0.2, r1: 1.1, st: cen, name: 'central drift chamber' });
    var ecal = sys('pbwo4', 'hermetic', 'leadGlass');
    if (ecal) L.push({ k: 'ecal', r0: 1.29, r1: 1.75, st: ecal, crystal: ecal.id === 'pbwo4', name: ecal.id === 'pbwo4' ? 'PbWO₄ crystal ECAL' : 'EM calorimeter' });
    var hcal = sys('brassHcal', 'hermetic');
    if (hcal) L.push({ k: 'hcal', r0: 1.8, r1: 2.9, st: hcal, name: 'hadron calorimeter' });
    var sol = sys('solenoid'), dip = sys('ua1dipole');
    if (sol) L.push({ k: 'coil', r0: 2.95, r1: 3.15, st: sol, name: '3.8 T solenoid' });
    else if (dip) L.push({ k: 'frame', r0: 3.0, r1: 3.4, st: dip, name: '0.7 T dipole' });
    var mu = sys('cmsMuon', 'muonDrift', 'ironWall');
    if (mu) L.push({ k: 'muon', st: mu, stations: mu.id === 'cmsMuon' ? 4 : mu.id === 'muonDrift' ? 2 : 0,
      name: mu.id === 'cmsMuon' ? 'return yoke + 4 muon stations' : mu.id === 'muonDrift' ? 'iron + muon chambers' : 'iron absorber' });
    return L;
  }
  function find(L, k) { for (var i = 0; i < L.length; i++) if (L[i].k === k && L[i].st.on) return L[i]; return null; }

  /* ───────── drawing helpers ───────── */
  function ringPath(cx, cy, r0, r1, a0, a1) {
    ctx.beginPath(); ctx.arc(cx, cy, r1, a0, a1); ctx.arc(cx, cy, r0, a1, a0, true); ctx.closePath();
  }
  function label(txt, x, y, col, align) {
    ctx.fillStyle = col || colors.dim; ctx.font = '10px ' + colors.mono; ctx.textAlign = align || 'left';
    ctx.fillText(txt, x, y); ctx.textAlign = 'left';
  }
  // subsystem list shown beside the lens: on / installing / planned
  function legend(g, name, st) {
    if (!st) return;
    g.legend.push({ name: name, s: st.on ? 'on' : st.work ? 'work' : 'planned', p: st.p });
  }
  function buildGeometry() {
    var off = document.createElement('canvas');
    off.width = cv.width; off.height = cv.height;
    var keep = ctx; ctx = off.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var g = { mode: view.mode, legend: [], note: '', work: [], floor: [] };   // work: the installation front; floor: where engineers stand
    if (view.mode === 'collider') geomCollider(g);
    else if (view.mode === 'fixed') geomFixed(g);
    else geomStand(g);
    ctx = keep;
    g.img = off;
    return g;
  }

  /* ───────── installation, piece by piece ───────── */
  // fraction in place: 1 installed, the shutdown progress while installing, 0 when only ordered
  function frac(st) { return st.on ? 1 : st.work ? st.p : 0; }
  // a subsystem is installed in n pieces (supermodules, wedges, yoke sectors), clockwise from 12 o'clock;
  // draw() is clipped to the pieces in place, outline() is dashed amber for the rest
  function sweep(st, n, cx, cy, draw, outline) {
    var f = st.planned ? 0 : n ? Math.floor(frac(st) * n + 1e-9) / n : frac(st);
    if (f > 0) {
      ctx.save();
      if (f < 1) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, Rd * 2, -1.5708, -1.5708 + 6.2832 * f); ctx.closePath(); ctx.clip(); }
      draw(); ctx.restore();
    }
    if (f < 1) {
      ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = colors.warn; ctx.globalAlpha = 0.6; ctx.lineWidth = 1;
      if (f > 0) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, Rd * 2, -1.5708 + 6.2832 * f, 4.7124); ctx.closePath(); ctx.clip(); }
      outline(); ctx.restore();
    }
  }
  function ringOutline(cx, cy, r0, r1) { return function () { ringPath(cx, cy, r0, r1, 0, 6.2832); ctx.stroke(); }; }

  /* ───────── tracker layers (CMS-like radii, metres) ───────── */
  var PIX = [[0.029, 12], [0.068, 28], [0.109, 44], [0.16, 64]];
  var STRIP = [0.255, 0.339, 0.419, 0.498, 0.608, 0.692, 0.78, 0.868, 0.965, 1.08];
  function layersOf(l) {
    if (l.k === 'pixel') return PIX.map(function (p, i) { return { r: p[0], n: p[1], off: 0, tilt: 0.35 }; });
    if (l.k === 'strips') return STRIP.map(function (r, i) {
      var n = 2 * Math.round(Math.PI * r / 0.07);
      return { r: r, n: n, off: (i % 2) * Math.PI / n, tilt: 0.18, stereo: i === 0 || i === 1 || i === 4 || i === 5 };
    });
    var out = [];                                        // drift chamber: sense-wire radii, no modules
    for (var d = 0.3; d <= 1.05; d += 0.1) out.push({ r: d, n: 0 });
    return out;
  }
  // radii of the sensitive layers a track leaves a hit on
  function trackerLayers(L) {
    var r = [];
    ['pixel', 'strips', 'drift'].forEach(function (k) { var l = find(L, k); if (l) r = r.concat(layersOf(l)); });
    return r.sort(function (a, b) { return a.r - b.r; });
  }
  function modulePhi(ly, k) { return -1.5708 + ly.off + 6.2832 * k / ly.n; }
  function moduleSeg(cx, cy, R, phi, half, tilt) {
    var x = cx + Math.cos(phi) * R, y = cy + Math.sin(phi) * R, t = phi + 1.5708 + tilt;
    ctx.moveTo(x - Math.cos(t) * half, y - Math.sin(t) * half); ctx.lineTo(x + Math.cos(t) * half, y + Math.sin(t) * half);
  }

  function drawTracker(cx, cy, l) {
    var r0 = M(l.r0), r1 = M(l.r1);
    if (l.k === 'drift') {
      sweep(l.st, 24, cx, cy, function () {
        ctx.globalAlpha = 0.12; ctx.fillStyle = colors.rule; ringPath(cx, cy, r0, r1, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1; ctx.strokeStyle = colors.rule; ctx.lineWidth = 1; ringPath(cx, cy, r0, r1, 0, 6.2832); ctx.stroke();
        ctx.strokeStyle = colors.faint; ctx.lineWidth = 0.6;
        for (var k = 0; k < 24; k++) {                    // drift cells: field-shaping walls, sense wires down the middle
          var a = -1.5708 + k * Math.PI / 12, m = a + Math.PI / 24;
          ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke();
          ctx.fillStyle = colors.dim;
          for (var q = 0.25; q <= 1.08; q += 0.05) ctx.fillRect(cx + Math.cos(m) * M(q) - 0.5, cy + Math.sin(m) * M(q) - 0.5, 1, 1);
        }
      }, ringOutline(cx, cy, r0, r1));
      return;
    }
    var lay = layersOf(l);
    sweep(l.st, 0, cx, cy, function () {
      lay.forEach(function (ly) {
        var R = M(ly.r), pitch = 6.2832 * R / ly.n;
        if (pitch < 2.5) { ctx.strokeStyle = colors.dim; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.2832); ctx.stroke(); return; }
        ctx.strokeStyle = colors.dim; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.1;
        ctx.beginPath();
        for (var k = 0; k < ly.n; k++) {
          moduleSeg(cx, cy, R, modulePhi(ly, k), pitch * 0.5, ly.tilt);
          if (ly.stereo) moduleSeg(cx, cy, R + 2, modulePhi(ly, k), pitch * 0.5, ly.tilt - 0.1);   // double-sided stereo module
        }
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }, ringOutline(cx, cy, r0, r1));
  }

  function drawEcal(cx, cy, l) {
    var r0 = M(l.r0), r1 = M(l.r1), n = l.crystal ? 360 : 48, groups = l.crystal ? 18 : 24;
    sweep(l.st, groups, cx, cy, function () {
      ctx.globalAlpha = 0.13; ctx.fillStyle = colors.b2; ringPath(cx, cy, r0, r1, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = l.crystal ? 0.16 : 0.35; ctx.strokeStyle = colors.b2; ctx.lineWidth = 0.5;   // crystals / lead–scintillator modules
      ctx.beginPath();
      for (var k = 0; k < n; k++) { var a = -1.5708 + 6.2832 * k / n; ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); }
      ctx.stroke();
      ctx.globalAlpha = 0.8; ctx.strokeStyle = colors.rule; ctx.lineWidth = 1;          // supermodule boundaries
      ctx.beginPath();
      for (var g = 0; g < groups; g++) { var b = -1.5708 + 6.2832 * g / groups; ctx.moveTo(cx + Math.cos(b) * r0, cy + Math.sin(b) * r0); ctx.lineTo(cx + Math.cos(b) * r1, cy + Math.sin(b) * r1); }
      ctx.stroke();
      ringPath(cx, cy, r0, r1, 0, 6.2832); ctx.stroke();
    }, ringOutline(cx, cy, r0, r1));
  }

  var HBANDS = 8;
  function drawHcal(cx, cy, l) {
    var r0 = M(l.r0), r1 = M(l.r1), wedges = 18, towers = 72;
    sweep(l.st, wedges, cx, cy, function () {
      ctx.globalAlpha = 0.1; ctx.fillStyle = colors.b1; ringPath(cx, cy, r0, r1, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 0.3; ctx.strokeStyle = colors.b1; ctx.lineWidth = 0.6;      // brass absorber / scintillator sampling layers
      for (var b = 1; b < HBANDS; b++) { ctx.beginPath(); ctx.arc(cx, cy, r0 + (r1 - r0) * b / HBANDS, 0, 6.2832); ctx.stroke(); }
      ctx.beginPath();
      for (var k = 0; k < towers; k++) {                  // readout towers, 4 per wedge
        var a = -1.5708 + 6.2832 * k / towers;
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      }
      ctx.globalAlpha = 0.18; ctx.stroke();
      ctx.globalAlpha = 0.8; ctx.strokeStyle = colors.rule; ctx.lineWidth = 1;
      ctx.beginPath();
      for (var w = 0; w < wedges; w++) { var c = -1.5708 + 6.2832 * w / wedges; ctx.moveTo(cx + Math.cos(c) * r0, cy + Math.sin(c) * r0); ctx.lineTo(cx + Math.cos(c) * r1, cy + Math.sin(c) * r1); }
      ctx.stroke(); ringPath(cx, cy, r0, r1, 0, 6.2832); ctx.stroke();
    }, ringOutline(cx, cy, r0, r1));
  }

  function drawCoil(cx, cy, l) {
    var v0 = M(2.94), v1 = M(3.16), c0 = M(3.0), c1 = M(3.1);
    sweep(l.st, 5, cx, cy, function () {                  // five coil modules
      ctx.globalAlpha = 0.12; ctx.fillStyle = colors.dim; ringPath(cx, cy, v0, v1, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = colors.dim; ctx.lineWidth = 1;   // vacuum tank
      ctx.beginPath(); ctx.arc(cx, cy, v0, 0, 6.2832); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, v1, 0, 6.2832); ctx.stroke();
      ctx.globalAlpha = 0.6; ctx.fillStyle = colors.fg; ringPath(cx, cy, c0, c1, 0, 6.2832); ctx.fill();   // the 4-layer winding
      ctx.globalAlpha = 0.5; ctx.strokeStyle = colors.screen; ctx.lineWidth = 0.5;
      for (var i = 1; i < 4; i++) { ctx.beginPath(); ctx.arc(cx, cy, c0 + (c1 - c0) * i / 4, 0, 6.2832); ctx.stroke(); }
    }, ringOutline(cx, cy, v0, v1));
  }

  // UA1-style dipole: two coil halves left and right inside a box-shaped iron yoke
  function drawFrame(cx, cy, l) {
    var h0 = M(3.2), h1 = M(3.5), cy0 = M(2.5), k0 = M(3.02), k1 = M(3.17);
    sweep(l.st, 8, cx, cy, function () {
      ctx.globalAlpha = 0.28; ctx.fillStyle = colors.dim;
      ctx.beginPath(); ctx.rect(cx - h1, cy - h1, 2 * h1, 2 * h1); ctx.rect(cx - h0, cy - h0, 2 * h0, 2 * h0); ctx.fill('evenodd');
      ctx.globalAlpha = 0.6; ctx.strokeStyle = colors.dim; ctx.lineWidth = 1;
      ctx.strokeRect(cx - h1 + 0.5, cy - h1 + 0.5, 2 * h1 - 1, 2 * h1 - 1); ctx.strokeRect(cx - h0 + 0.5, cy - h0 + 0.5, 2 * h0 - 1, 2 * h0 - 1);
      ctx.globalAlpha = 0.45; ctx.fillStyle = colors.b1;
      [-1, 1].forEach(function (sg) { var x0 = sg < 0 ? cx - k1 : cx + k0; ctx.fillRect(x0, cy - cy0, k1 - k0, 2 * cy0); });
    }, function () { ctx.strokeRect(cx - h1, cy - h1, 2 * h1, 2 * h1); });
  }

  // muon system. CMS-like: dodecagonal yoke layers with drift-tube chambers in the gaps.
  // Earlier (UA1-like): a box of iron around the magnet, chambers on its four faces.
  function drawMuon(cx, cy, l) {
    var cms = l.stations === 4;
    var iron = cms ? [[4.05, 4.55], [5.05, 5.65], [6.2, 6.9]] : [[3.7, 4.5]];
    var st = cms ? [3.9, 4.8, 5.9, 7.1] : l.stations === 2 ? [4.75, 5.05] : [];
    var shape = cms ? polyPath : boxPath;
    var outline = function () { iron.forEach(function (b) { shape(cx, cy, M(b[0]), M(b[1])); ctx.stroke(); }); };
    sweep(l.st, cms ? 12 : 8, cx, cy, function () {
      iron.forEach(function (ir) {
        shape(cx, cy, M(ir[0]), M(ir[1])); ctx.globalAlpha = 0.22; ctx.fillStyle = colors.dim; ctx.fill('evenodd');
        ctx.globalAlpha = 0.5; ctx.strokeStyle = colors.dim; ctx.lineWidth = 0.8; ctx.stroke();
        if (!cms) return;
        ctx.beginPath();                                   // sector joints
        for (var k = 0; k < 12; k++) { var a = k * Math.PI / 6 - Math.PI / 12; ctx.moveTo(cx + Math.cos(a) * M(ir[0]), cy + Math.sin(a) * M(ir[0])); ctx.lineTo(cx + Math.cos(a) * M(ir[1]), cy + Math.sin(a) * M(ir[1])); }
        ctx.stroke();
      });
      st.forEach(function (r) { chambers(cx, cy, r, cms ? 12 : 4); });
    }, outline);
  }
  function boxPath(cx, cy, r0, r1) { ctx.beginPath(); ctx.rect(cx - r1, cy - r1, 2 * r1, 2 * r1); ctx.rect(cx - r0, cy - r0, 2 * r0, 2 * r0); }
  function polyPath(cx, cy, r0, r1) {
    ctx.beginPath();
    [r1, r0].forEach(function (r) {
      for (var k = 0; k <= 12; k++) { var a = k * Math.PI / 6 - Math.PI / 12, R = r / Math.cos(Math.PI / 12); ctx[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * R, cy + Math.sin(a) * R); }
      ctx.closePath();
    });
  }
  function chambers(cx, cy, r, n) {
    var t = Math.max(4, M(r + 0.12) - M(r - 0.12)), half = Math.tan(Math.PI / n) * M(r) * 0.92;
    for (var k = 0; k < n; k++) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(k * 6.2832 / n);
      var x = M(r) - t / 2;
      ctx.globalAlpha = 0.12; ctx.fillStyle = colors.warn; ctx.fillRect(x, -half, t, 2 * half);
      ctx.globalAlpha = 0.6; ctx.strokeStyle = colors.warn; ctx.lineWidth = 0.8; ctx.strokeRect(x, -half, t, 2 * half);
      ctx.globalAlpha = 0.35; ctx.beginPath();          // three superlayers of drift tubes
      for (var s = 1; s < 3; s++) { ctx.moveTo(x + t * s / 3, -half); ctx.lineTo(x + t * s / 3, half); }
      ctx.stroke(); ctx.restore();
    }
  }

  function geomCollider(g) {
    var cx = W / 2, cy = H / 2, s = Math.min(W, H) / 2 / RMAX;
    Rd = Math.min(W, H) / 2 - 4;
    var L = colliderLayout();
    g.cx = cx; g.cy = cy; g.s = s; g.L = L;
    ctx.lineWidth = 1; ctx.strokeStyle = colors.dim;
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.5, M(0.03)), 0, 6.2832); ctx.stroke();   // beam pipe
    L.forEach(function (l) {
      ctx.save();
      if (l.k === 'pixel' || l.k === 'strips' || l.k === 'drift') drawTracker(cx, cy, l);
      else if (l.k === 'ecal') drawEcal(cx, cy, l);
      else if (l.k === 'hcal') drawHcal(cx, cy, l);
      else if (l.k === 'coil') drawCoil(cx, cy, l);
      else if (l.k === 'frame') drawFrame(cx, cy, l);
      else if (l.k === 'muon') drawMuon(cx, cy, l);
      ctx.restore();
    });
    L.forEach(function (l) {
      legend(g, l.name, l.st);
      if (!l.st.work) return;
      var a = -1.5708 + 6.2832 * l.st.p, rm = M(l.k === 'muon' ? 5.3 : (l.r0 + l.r1) / 2);
      [0, -0.18].forEach(function (da) { g.work.push([cx + Math.cos(a + da) * rm, cy + Math.sin(a + da) * rm]); });
    });
    for (var fa = 1.15; fa < 2.0; fa += 0.2) g.floor.push([cx + Math.cos(fa) * Rd * 0.9, cy + Math.sin(fa) * Rd * 0.9]);
    g.note = 'end view · ' + (view.B ? 'B = ' + view.B + ' T' : 'no field') + ' · radius compressed outside the tracker';
  }

  /* fixed-target spectrometer, side view: z from 0 to 30 m, y exaggerated ×4 */
  var LG_ROWS = 14;
  function geomFixed(g) {
    var sx = W / 30, sy = sx * 4, cy = H / 2;
    g.sx = sx; g.sy = sy; g.cy = cy;
    // a box that fills from the bottom while it is installed; dashed amber while only ordered
    function part(st, x, y, w, h, draw) {
      if (!st) return;
      ctx.save();
      var f = st.planned ? 0 : frac(st);
      if (f > 0) { ctx.save(); if (f < 1) { ctx.beginPath(); ctx.rect(x - 20, y + h * (1 - f), w + 40, h * f + 1); ctx.clip(); } draw(); ctx.restore(); }
      if (f < 1) { ctx.setLineDash([3, 4]); ctx.strokeStyle = colors.warn; ctx.globalAlpha = 0.7; ctx.strokeRect(x, y, w, h * (1 - f)); }
      ctx.restore();
      if (st.work) g.work.push([x + w / 2, y + h * (1 - f)]);
      g.floor.push([Math.max(0.15 * W, Math.min(0.85 * W, x + w / 2)), cy + 2.3 * sy]);
    }
    function name(txt, st, x, y) { label(txt + (st.planned ? ' · awaiting shutdown' : st.work ? ' · ' + Math.round(st.p * 100) + '%' : ''), x, y, st.on ? colors.dim : colors.warn); }
    ctx.strokeStyle = colors.b1; ctx.globalAlpha = 0.6; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(1 * sx, cy); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.fillStyle = colors.fg; ctx.fillRect(1 * sx - 2, cy - 6, 4, 12);
    label('beam → target', 4, cy - 12, colors.dim);

    // tracking planes: wire chambers with their wires, or spark-chamber plate pairs
    var trk = sys('drift', 'mwpc', 'spark'), planes = [3, 4.5, 6, 7.5, 13.5, 15];
    g.planes = planes;
    if (trk) {
      planes.forEach(function (z, i) {
        var x = z * sx, y0 = cy - 1.6 * sy, y1 = cy + 1.6 * sy;
        part(trk.planned ? trk : { on: trk.on || i / 6 < trk.p, work: false, p: 1, planned: false }, x - 3, y0, 6, y1 - y0, function () {
          ctx.strokeStyle = colors.dim; ctx.lineWidth = 1;
          if (trk.id === 'spark') { [-2, 2].forEach(function (d) { ctx.beginPath(); ctx.moveTo(x + d, y0); ctx.lineTo(x + d, y1); ctx.stroke(); }); return; }
          ctx.strokeRect(x - 2.5, y0, 5, y1 - y0);         // frame
          ctx.globalAlpha = 0.6; ctx.beginPath();
          var pitch = trk.id === 'mwpc' ? 3 : 7;           // sense wires seen end-on
          for (var y = y0 + 2; y < y1; y += pitch) { ctx.moveTo(x - 1, y); ctx.lineTo(x + 1, y); }
          ctx.stroke();
        });
      });
      label({ drift: 'drift chambers', mwpc: 'MWPCs', spark: 'spark chambers' }[trk.id], 3 * sx, cy - 1.6 * sy - 6, trk.on ? colors.dim : colors.warn);
      if (trk.work) g.work.push([planes[Math.min(5, Math.floor(trk.p * 6))] * sx, cy + 1.6 * sy]);
    }

    // C-shaped dipole: iron yoke, two coils, the field region in the gap
    var d = sys('dipole');
    if (d) {
      var gx0 = 9 * sx, gx1 = 12 * sx, gh = 1.3 * sy, ih = 1.95 * sy;
      part(d, gx0 - 0.5 * sx, cy - ih, (gx1 - gx0) + sx, 2 * ih, function () {
        ctx.globalAlpha = 0.25; ctx.fillStyle = colors.dim;
        ctx.fillRect(gx0 - 0.5 * sx, cy - ih, gx1 - gx0 + sx, ih - gh); ctx.fillRect(gx0 - 0.5 * sx, cy + gh, gx1 - gx0 + sx, ih - gh);
        ctx.fillRect(gx1, cy - gh, 0.5 * sx, 2 * gh);                         // back of the C
        ctx.globalAlpha = 0.1; ctx.fillStyle = colors.b1; ctx.fillRect(gx0, cy - gh, gx1 - gx0, 2 * gh);
        ctx.globalAlpha = 0.55; ctx.fillStyle = colors.b1;
        [-1, 1].forEach(function (sg) { ctx.fillRect(gx0 - 0.8 * sx, sg < 0 ? cy - gh - 0.12 * sy : cy + gh, gx1 - gx0 + 1.1 * sx, 0.12 * sy); });
        ctx.globalAlpha = 0.6; ctx.strokeStyle = colors.dim; ctx.strokeRect(gx0 - 0.5 * sx, cy - ih, gx1 - gx0 + sx, 2 * ih);
      });
      name('dipole', d, gx0, cy + ih + 13);
    }

    // lead-glass wall: a column of blocks, each read out by its own photomultiplier
    var lg = sys('leadGlass');
    g.lg = { x: 17 * sx, w: 2 * sx, y0: cy - 1.8 * sy, h: 3.6 * sy / LG_ROWS };
    if (lg) {
      part(lg, g.lg.x, g.lg.y0, g.lg.w, 3.6 * sy, function () {
        for (var r = 0; r < LG_ROWS; r++) {
          var y = g.lg.y0 + r * g.lg.h;
          ctx.globalAlpha = 0.12; ctx.fillStyle = colors.b2; ctx.fillRect(g.lg.x, y, g.lg.w, g.lg.h);
          ctx.globalAlpha = 0.5; ctx.strokeStyle = colors.b2; ctx.lineWidth = 0.6; ctx.strokeRect(g.lg.x + 0.5, y + 0.5, g.lg.w - 1, g.lg.h - 1);
          ctx.globalAlpha = 0.5; ctx.fillStyle = colors.dim; ctx.fillRect(g.lg.x + g.lg.w, y + g.lg.h * 0.3, 0.35 * sx, g.lg.h * 0.4);   // PMT
        }
      });
      name('lead glass', lg, g.lg.x, cy + 1.8 * sy + 13);
    }

    // iron absorber, then a hodoscope of muon counters
    var mu = sys('ironWall');
    g.hodo = { x: 26 * sx, y0: cy - 2 * sy, h: 4 * sy / 8 };
    if (mu) {
      part(mu, 21 * sx, cy - 2 * sy, 4 * sx, 4 * sy, function () {
        ctx.globalAlpha = 0.22; ctx.fillStyle = colors.dim; ctx.fillRect(21 * sx, cy - 2 * sy, 4 * sx, 4 * sy);
        ctx.globalAlpha = 0.35; ctx.strokeStyle = colors.dim; ctx.lineWidth = 0.6; ctx.beginPath();
        for (var q = -4 * sy; q < 4 * sx; q += 7) { ctx.moveTo(21 * sx + q, cy + 2 * sy); ctx.lineTo(21 * sx + q + 4 * sy, cy - 2 * sy); }
        ctx.save(); ctx.beginPath(); ctx.rect(21 * sx, cy - 2 * sy, 4 * sx, 4 * sy); ctx.clip();
        ctx.beginPath(); for (var q2 = -4 * sy; q2 < 4 * sx; q2 += 7) { ctx.moveTo(21 * sx + q2, cy + 2 * sy); ctx.lineTo(21 * sx + q2 + 4 * sy, cy - 2 * sy); }
        ctx.stroke(); ctx.restore();
        ctx.globalAlpha = 0.6; ctx.strokeStyle = colors.warn; ctx.lineWidth = 1;
        for (var k = 0; k < 8; k++) ctx.strokeRect(g.hodo.x - 2, g.hodo.y0 + k * g.hodo.h + 1, 4, g.hodo.h - 2);
      });
      name('iron + μ counters', mu, 21 * sx, cy + 2 * sy + 13);
    }
    g.trk = !!(trk && trk.on); g.mag = !!(d && d.on); g.calo = !!(lg && lg.on); g.iron = !!(mu && mu.on);
    legend(g, trk ? { drift: 'drift chambers', mwpc: 'multiwire proportional chambers', spark: 'spark chambers' }[trk.id] : '', trk);
    legend(g, 'dipole magnet 1.5 T', d); legend(g, 'lead-glass calorimeter', lg); legend(g, 'iron absorber + muon counters', mu);
    g.note = 'side view · beam from the left · vertical scale ×4';
  }

  /* cosmic test stand, vertical, 2.4 m tall */
  function geomStand(g) {
    var cx = W / 2, sy = H / 3.3, top = (H - 2.4 * sy) / 2;
    g.sy = sy; g.top = top; g.cx = cx;
    var x = cx - 0.8 * sy, w = 1.6 * sy;
    // scintillator paddle with a fish-tail light guide and a photomultiplier on the right
    function paddle(y0) {
      var y = top + y0 * sy, h = 0.06 * sy;
      ctx.globalAlpha = 0.35; ctx.fillStyle = colors.ok; ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 0.8; ctx.strokeStyle = colors.ok; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
      ctx.globalAlpha = 0.3; ctx.fillStyle = colors.dim; ctx.beginPath();
      ctx.moveTo(x + w, y); ctx.lineTo(x + w + 0.22 * sy, y + h * 0.25); ctx.lineTo(x + w + 0.22 * sy, y + h * 0.75); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.6; ctx.fillRect(x + w + 0.22 * sy, y + h * 0.1, 0.2 * sy, h * 0.8);
      ctx.globalAlpha = 1;
    }
    function slab(y0, y1, st, draw, name) {
      if (!st) return;
      var y = top + y0 * sy, h = (y1 - y0) * sy, f = st.planned ? 0 : frac(st);
      ctx.save();
      if (f > 0) { ctx.save(); if (f < 1) { ctx.beginPath(); ctx.rect(x - 5, y, (w + 10) * f, h); ctx.clip(); } draw(y, h); ctx.restore(); }
      if (f < 1) { ctx.setLineDash([3, 4]); ctx.strokeStyle = colors.warn; ctx.globalAlpha = 0.7; ctx.strokeRect(x, y, w, h); }
      ctx.restore();
      if (st.work) g.work.push([x - 5 + (w + 10) * f, y + h]);
      if (name) label(name, x - 6, y + h / 2 + 3, st.on ? colors.dim : colors.warn, 'right');
    }
    paddle(0.1); paddle(2.24);
    var trk = sys('spark');
    var plates = function (y, h) {                        // thin aluminium plates with gas gaps between
      ctx.strokeStyle = colors.dim; ctx.lineWidth = 1; ctx.globalAlpha = 0.7;
      for (var i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(x, y + h * i / 4); ctx.lineTo(x + w, y + h * i / 4); ctx.stroke(); }
      ctx.globalAlpha = 0.5; ctx.fillStyle = colors.dim; ctx.fillRect(x - 4, y, 3, h);   // HV bus
    };
    if (trk) { slab(0.4, 0.75, trk, plates, 'spark chambers'); slab(1.65, 2.0, trk, plates, ''); }
    var d = sys('dipole');
    slab(0.95, 1.45, d, function (y, h) {
      ctx.globalAlpha = 0.14; ctx.fillStyle = colors.b1; ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 0.5; ctx.fillStyle = colors.b1; ctx.fillRect(x - 0.08 * sy, y, 0.08 * sy, h); ctx.fillRect(x + w, y, 0.08 * sy, h);   // coils
      ctx.globalAlpha = 0.8; ctx.strokeStyle = colors.rule; ctx.strokeRect(x, y, w, h);
    }, 'magnet 1.5 T');
    g.mag = !!(d && d.on); g.trk = !!(trk && trk.on);
    var fy = top + 2.38 * sy;
    g.floor.push([x - 0.2 * sy, fy], [cx - 0.3 * sy, fy], [cx + 0.3 * sy, fy], [x + w + 0.25 * sy, fy]);
    legend(g, 'scintillator paddles ×2', { on: true }); legend(g, 'spark chambers', trk); legend(g, 'magnet 1.5 T', d);
    g.note = 'side view · 2.4 m tall · cosmic rays from above';
  }

  /* ───────── propagation ───────── */
  function propCollider(e) {
    var g = geom, L = g.L, cx = g.cx, cy = g.cy, B = view.B;
    var trkOut = find(L, 'strips') || find(L, 'drift') ? 1.1 : find(L, 'pixel') ? 0.16 : 0;
    var ecal = find(L, 'ecal'), hcal = find(L, 'hcal'), mu = find(L, 'muon'), sol = find(L, 'coil');
    var layers = trackerLayers(L);
    e.tracks = []; e.ecal = []; e.hcal = []; e.segs = []; e.mods = []; e.jets = [];
    e.parts.forEach(function (p) {
      if (p.cosmic) { cosmicCollider(e, p); return; }
      var charged = p.q !== 0 && p.type !== 'g' && p.type !== 'n';
      if (!charged) {
        if (p.type === 'g' && ecal) e.ecal.push({ phi: p.phi, E: p.pt });
        else if (p.type === 'n' && hcal) e.hcal.push({ phi: p.phi, E: p.pt });
        return;
      }
      var stopR = p.type === 'mu' ? (mu ? (mu.stations ? 7.3 : 4.6) : 3.2) : (ecal ? 1.29 : hcal ? 1.8 : 3);
      if (p.type === 'mu' && p.pt < 3 && mu) stopR = 4.3;          // soft muons range out in the iron
      var x = 0, y = 0, th = p.phi, pts = [], out = [], dots = [], li = 0, path = 0, ds = 0.015;
      while (path < 10) {
        var r = Math.sqrt(x * x + y * y);
        var b = r < 2.95 ? B : (sol && r > 3.9 && r < 7.2 ? -B * 0.5 : 0);
        th += p.q * 0.3 * b / p.pt * ds;
        x += Math.cos(th) * ds; y += Math.sin(th) * ds; path += ds;
        r = Math.sqrt(x * x + y * y);
        if (li < layers.length && r >= layers[li].r) {      // a hit on each layer crossed; the module it sits on fires
          var ly = layers[li], q0 = XY(cx, cy, x, y);
          dots.push(q0);
          if (ly.n && p.pt > 2) {
            var k = Math.round((Math.atan2(y, x) + 1.5708 - ly.off) / (6.2832 / ly.n));
            k = ((k % ly.n) + ly.n) % ly.n;
            e.mods.push({ R: M(ly.r), phi: modulePhi(ly, k), half: 6.2832 * M(ly.r) / ly.n * 0.58, tilt: ly.tilt });
          }
          li++;
        }
        if (r <= trkOut) pts.push(XY(cx, cy, x, y));
        else if (p.type === 'mu' && r > 3.0) { var q = XY(cx, cy, x, y); q.r = r; out.push(q); }
        if (r >= stopR || (r < 1.25 && path > 2.6)) break;   // stop very soft loopers
      }
      var muon = p.type === 'mu';
      if (pts.length > 1) e.tracks.push({ pts: pts, dots: p.pt > 1 ? dots : null, muon: muon, hard: p.pt > 10 || muon || p.type === 'e' });
      if (muon && mu && mu.stations && out.length > 1) e.tracks.push({ pts: out, muon: true, hard: true });
      if (muon && mu && mu.stations) {                       // a track segment in each chamber the muon crosses
        (mu.stations === 4 ? [3.9, 4.8, 5.9, 7.1] : [4.75, 5.05]).forEach(function (R) {
          for (var i = 2; i < out.length - 2; i++) if (Math.abs(out[i].r - R) < 0.03) {
            var dx = out[i + 2][0] - out[i - 2][0], dy = out[i + 2][1] - out[i - 2][1], dl = Math.hypot(dx, dy) || 1;
            e.segs.push({ x: out[i][0], y: out[i][1], dx: dx / dl, dy: dy / dl }); break;
          }
        });
      }
      var rEnd = Math.hypot(x, y), phiEnd = Math.atan2(y, x);
      if (rEnd >= 1.28) {
        if (p.type === 'e' && ecal) e.ecal.push({ phi: phiEnd, E: p.pt });
        if (p.type === 'h') { if (ecal) e.ecal.push({ phi: phiEnd, E: p.pt * 0.25 }); if (hcal) e.hcal.push({ phi: phiEnd, E: p.pt * 0.75 }); }
      }
    });
    e.showMet = !!(e.met && (hcal || ecal));
    // jets: the particles that share an axis
    var jets = {};
    e.parts.forEach(function (p) { if (p.jet) { var j = jets[p.axis] || (jets[p.axis] = { phi: p.axis, pt: 0 }); j.pt += p.pt; } });
    if (ecal || hcal) Object.keys(jets).forEach(function (a) { if (jets[a].pt > 15) e.jets.push(jets[a]); });
    // calorimeter cells: an EM shower spreads over a few crystals, a hadron shower over neighbouring towers
    e.ecell = cells(e.ecal, ecal ? (ecal.crystal ? 360 : 48) : 0, ecal && ecal.crystal ? [0.05, 0.15, 0.6, 0.15, 0.05] : [0.15, 0.7, 0.15], 0.25);
    e.hcell = cells(e.hcal, hcal ? 72 : 0, [0.2, 0.6, 0.2], 0.8);
  }
  function cells(list, n, shape, thr) {
    if (!n) return [];
    var map = {}, h = (shape.length - 1) / 2;
    list.forEach(function (d) {
      var c = Math.round((d.phi + 1.5708) / (6.2832 / n) - 0.5);
      shape.forEach(function (f, i) { var k = (((c + i - h) % n) + n) % n; map[k] = (map[k] || 0) + d.E * f; });
    });
    return Object.keys(map).filter(function (k) { return map[k] >= thr; }).map(function (k) { return { k: +k, n: n, E: map[k] }; });   // zero suppression
  }
  function cosmicCollider(e, p) {
    var g = geom, cx = g.cx, cy = g.cy, off = rnd(-1.5, 1.5), tilt = rnd(-0.25, 0.25), pts = [];
    for (var yy = -RMAX; yy <= RMAX; yy += 0.05) { var x = off + yy * tilt; if (Math.hypot(x, yy) < RMAX) pts.push(XY(cx, cy, x, yy)); }
    e.tracks.push({ pts: pts, muon: true, hard: true });
  }

  function propFixed(e) {
    var g = geom, sx = g.sx, sy = g.sy, cy = g.cy;
    e.tracks = []; e.ecal = []; e.hcal = []; e.hits = []; e.wires = []; e.blocks = {}; e.hodo = {};
    e.parts.forEach(function (p, i) {
      if (p.cosmic) { var x0 = rnd(0.3, 0.7) * W; e.tracks.push({ pts: [[x0, 0], [x0 + rnd(-40, 40), H]], muon: true, hard: true }); return; }
      if (i > 16) return;
      var resonance = p.type === 'mu' && e.mass;
      var mom = resonance ? Math.max(3, view.sqrtS * rnd(0.8, 2)) : Math.max(0.5, p.pt * rnd(4, 14));
      var ang = resonance ? (p.q > 0 ? 1 : -1) * e.mass / mom * rnd(0.3, 0.6) : rnd(-1, 1) * p.pt / mom;
      var stop = p.type === 'mu' ? 26 : (p.type === 'h' || p.type === 'n') ? (g.calo ? 18.5 : g.iron ? 22 : 30) : (g.calo ? 17.2 : 30);
      var z = 1, y = 0, pts = [[z * sx, cy]], pl = 0, wires = [];
      while (z < stop) {
        var dz = 0.1;
        if (g.mag && z > 9 && z < 12 && p.q) ang += p.q * 0.3 * 1.5 * dz / mom;
        y += ang * dz; z += dz;
        if (Math.abs(y * sy) > H / 2) break;
        pts.push([z * sx, cy - y * sy]);
        if (pl < g.planes.length && z >= g.planes[pl]) { if (Math.abs(y) < 1.6) wires.push([g.planes[pl] * sx, cy - y * sy]); pl++; }
      }
      var charged = p.q && p.type !== 'g' && p.type !== 'n';
      var seen = charged && (g.trk || p.type === 'mu');
      if (seen) e.tracks.push({ pts: pts, muon: p.type === 'mu', hard: p.type === 'mu' || p.type === 'e' });
      if (seen && g.trk) e.wires = e.wires.concat(wires);    // only charged tracks fire the wires
      var end = pts[pts.length - 1];
      if (g.calo && z >= 17 && p.type !== 'mu') {             // the block the shower lands in
        var row = Math.floor((end[1] - g.lg.y0) / g.lg.h);
        if (row >= 0 && row < LG_ROWS) e.blocks[row] = (e.blocks[row] || 0) + p.pt;
      }
      if (p.type === 'mu' && g.iron && z >= 25.9) { var hk = Math.floor((end[1] - g.hodo.y0) / g.hodo.h); if (hk >= 0 && hk < 8) e.hodo[hk] = true; }
    });
  }

  function propStand(e) {
    var g = geom, sy = g.sy, top = g.top, cx = g.cx;
    e.tracks = []; e.hits = []; e.ecal = []; e.hcal = [];
    var p = e.parts[0] || { pt: 5, q: 1 };
    var x = rnd(-0.7, 0.7), th = rnd(-0.25, 0.25), y = -0.05, pts = [], ds = 0.01;
    while (y < 2.45) {
      if (g.mag && y > 0.95 && y < 1.45) th += p.q * 0.3 * 1.5 * ds / p.pt;
      x += Math.sin(th) * ds; y += Math.cos(th) * ds;
      pts.push([cx + x * sy, top + y * sy]);
    }
    e.tracks.push({ pts: pts, muon: true, hard: true, sparks: g.trk });
    e.flash = true;
  }

  /* ───────── per-frame drawing ───────── */
  function strokePts(pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); }
  function cellPath(cx, cy, r0, r1, c) { var a0 = -1.5708 + 6.2832 * c.k / c.n; ringPath(cx, cy, r0, r1, a0, a0 + 6.2832 / c.n); }

  function drawEvent(e) {
    var a = Math.max(0, 1 - e.age / e.life), grow = Math.min(1, e.age / 0.18);
    ctx.save(); ctx.globalAlpha = a;
    if (geom.mode === 'collider') {
      var L = geom.L, cx = geom.cx, cy = geom.cy, ecal = find(L, 'ecal'), hcal = find(L, 'hcal');
      // jet cones under everything else
      e.jets.forEach(function (j) {
        var R = M(hcal ? 2.9 : 1.75) * grow;
        ctx.globalAlpha = a * 0.1; ctx.fillStyle = colors.warn;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, j.phi - 0.3, j.phi + 0.3); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = a * 0.4; ctx.strokeStyle = colors.warn; ctx.lineWidth = 0.8; ctx.stroke();
      });
      // tracker modules that fired
      ctx.globalAlpha = a * 0.8; ctx.strokeStyle = colors.b1; ctx.lineWidth = 1.8;
      ctx.beginPath(); e.mods.forEach(function (m) { moduleSeg(cx, cy, m.R, m.phi, m.half, m.tilt); }); ctx.stroke();
      // calorimeter cells fill outward with their energy; HCAL showers go deeper, layer by layer
      if (ecal) e.ecell.forEach(function (c) {
        var r0 = M(ecal.r0), r1 = M(ecal.r1), f = Math.min(1, 0.15 + Math.log10(1 + c.E) / 2) * grow;
        ctx.globalAlpha = a; ctx.fillStyle = colors.b2; cellPath(cx, cy, r0, r0 + (r1 - r0) * f, c); ctx.fill();
      });
      if (hcal) e.hcell.forEach(function (c) {
        var r0 = M(hcal.r0), r1 = M(hcal.r1), depth = Math.max(1, Math.ceil(Math.min(1, Math.log10(1 + c.E) / 2.2) * HBANDS * grow));
        for (var b = 0; b < depth; b++) {
          ctx.globalAlpha = a * (1 - 0.6 * b / HBANDS); ctx.fillStyle = colors.b1;
          cellPath(cx, cy, r0 + (r1 - r0) * b / HBANDS + 0.5, r0 + (r1 - r0) * (b + 1) / HBANDS - 0.5, c); ctx.fill();
        }
      });
    }
    e.tracks.forEach(function (t) {
      var n = Math.max(2, Math.floor(t.pts.length * grow));
      ctx.strokeStyle = t.muon ? colors.warn : colors.track;
      var dd = t.dots && t.dots.length;
      ctx.lineWidth = dd ? (t.hard ? 1.1 : 0.7) : t.hard ? 1.6 : 0.8;
      ctx.globalAlpha = a * (t.hard ? 1 : 0.45);
      strokePts(t.pts.slice(0, n));
      if (dd) {                                       // the hits the fit goes through
        var lim = t.pts[n - 1], r2 = Math.pow(lim[0] - geom.cx, 2) + Math.pow(lim[1] - geom.cy, 2), w = t.hard ? 3 : 2;
        ctx.fillStyle = t.muon ? colors.warn : colors.track; ctx.globalAlpha = a * (t.hard ? 1 : 0.7);
        t.dots.forEach(function (q) { if (Math.pow(q[0] - geom.cx, 2) + Math.pow(q[1] - geom.cy, 2) <= r2 + 1) ctx.fillRect(q[0] - w / 2, q[1] - w / 2, w, w); });
      }
      if (t.sparks) {                                  // sparks jump across each gap the muon crosses
        ctx.fillStyle = colors.warn; ctx.globalAlpha = a;
        [[0.4, 0.75], [1.65, 2.0]].forEach(function (ch) {
          for (var gp = 0; gp < 4; gp++) {
            var yy = ch[0] + (ch[1] - ch[0]) * (gp + 0.5) / 4, q = t.pts[Math.min(t.pts.length - 1, Math.round((yy + 0.05) / 0.01))];
            if (q) ctx.fillRect(q[0] - 1.5, geom.top + (yy - 0.035) * geom.sy, 3, 0.07 * geom.sy);
          }
        });
      }
    });
    ctx.globalAlpha = a;
    if (geom.mode === 'collider') {
      // muon chamber segments
      ctx.strokeStyle = colors.warn; ctx.lineWidth = 2.5;
      e.segs.forEach(function (s) { ctx.beginPath(); ctx.moveTo(s.x - s.dx * 7, s.y - s.dy * 7); ctx.lineTo(s.x + s.dx * 7, s.y + s.dy * 7); ctx.stroke(); });
      if (e.showMet) {
        var len = (M(1.4) + Math.min(1, Math.log10(1 + e.met.pt) / 2) * (M(2.9) - M(1.4))) * grow;
        ctx.strokeStyle = colors.fg; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(geom.cx, geom.cy); ctx.lineTo(geom.cx + Math.cos(e.met.phi) * len, geom.cy + Math.sin(e.met.phi) * len); ctx.stroke(); ctx.setLineDash([]);
        label('missing E_T', geom.cx + Math.cos(e.met.phi) * len + 4, geom.cy + Math.sin(e.met.phi) * len, colors.fg);
      }
    } else if (geom.mode === 'fixed') {
      ctx.fillStyle = colors.b1;                       // wires that fired
      e.wires.forEach(function (h) { ctx.fillRect(h[0] - 3, h[1] - 1, 6, 2); });
      Object.keys(e.blocks).forEach(function (r) {    // lead-glass blocks, brighter for more energy
        ctx.globalAlpha = a * Math.min(1, 0.3 + Math.log10(1 + e.blocks[r]) / 1.5) * grow; ctx.fillStyle = colors.b2;
        ctx.fillRect(geom.lg.x + 1, geom.lg.y0 + r * geom.lg.h + 1, geom.lg.w - 2, geom.lg.h - 2);
      });
      ctx.globalAlpha = a; ctx.fillStyle = colors.warn;
      Object.keys(e.hodo).forEach(function (k) { ctx.fillRect(geom.hodo.x - 3, geom.hodo.y0 + k * geom.hodo.h + 1, 6, geom.hodo.h - 2); });
    } else if (e.flash) {
      ctx.fillStyle = colors.ok; ctx.globalAlpha = a * 0.6;
      var t0 = e.tracks[0].pts;
      [0.13, 2.27].forEach(function (yy) {
        var q = t0.reduce(function (best, p) { return Math.abs((p[1] - geom.top) / geom.sy - yy) < Math.abs((best[1] - geom.top) / geom.sy - yy) ? p : best; }, t0[0]);
        ctx.fillRect(geom.cx - 0.8 * geom.sy, geom.top + (yy - 0.03) * geom.sy, 1.6 * geom.sy, 0.06 * geom.sy);   // the whole paddle lights
        ctx.fillRect(q[0] - 8, geom.top + (yy - 0.03) * geom.sy, 16, 0.06 * geom.sy);
      });
    }
    ctx.restore();
  }

  function frame(ts) {
    var dt = Math.min(0.1, (ts - last) / 1000 || 0); last = ts;
    if (view.mode && W > 0) {
      var key = view.mode + '|' + view.key + '|' + W + 'x' + H + '|' + view.B;
      if (key !== geomKey) {
        if (geom && geom.mode !== view.mode) events = [];   // a new detector: the old one's events don't fit it
        geomKey = key; geom = buildGeometry();
      }
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(geom.img, 0, 0, W, H);
      events.forEach(function (e) { e.age += dt; drawEvent(e); });
      events = events.filter(function (e) { return e.age < e.life; });
      // the experiment's machine has no beam: say why (cosmics still come through)
      if (view.off) {
        var oy = H * 0.2,                                // under the detector's name at the top of the lens
            blink = view.off.fault ? 0.6 + 0.4 * Math.sin(last / 180) : 1;
        ctx.save(); ctx.globalAlpha = blink;
        ctx.font = '600 11px ' + colors.mono; ctx.textAlign = 'center';
        var msg = view.off.fault ? 'BEAM LOST · ' + view.off.text : 'NO BEAM · ' + view.off.text;
        var tw = ctx.measureText(msg).width + 16;
        ctx.fillStyle = colors.screen; ctx.globalAlpha = 0.85 * blink; ctx.fillRect(W / 2 - tw / 2, oy - 13, tw, 19); ctx.globalAlpha = blink;
        ctx.fillStyle = view.off.fault ? colors.b2 : colors.b1; ctx.fillText(msg, W / 2, oy);
        ctx.restore();
      }
      // staff: technicians at the installation front during a shutdown, detector engineers on the floor
      var st = view.staff || {}, ps = Math.max(1, Math.min(W, H) / 330), ls = view.ls;
      var techSpots = geom.work.length ? geom.work : ls ? geom.floor : null;
      techs.step(ctx, dt, last / 1000, techSpots, PC.People.shown(st.technician, 6), { scale: ps, color: colors.warn, speed: 16 * ps, spark: colors.warn, pause: [2, 5] });
      // with beam on the cavern is closed: the engineers are up in the control room (on the map)
      var engSpots = ls ? geom.floor.concat(geom.work) : view.beam || view.off ? null : geom.floor;   // a short stop is no access
      engs.step(ctx, dt, last / 1000, engSpots, PC.People.shown(st.deteng, 4), { scale: ps, color: colors.fg, speed: 12 * ps, pause: [3, 8] });
    }
  }

  function spawn() {
    if (!geom || !view.mode) return;
    var ev = PC.Physics.generate({ beam: view.beam, collider: view.mode === 'collider', sqrtS: view.sqrtS, active: view.active,
      res: view.res, pileup: view.pileup, beamLabel: view.beamLabel });
    if (geom.mode !== view.mode) return;
    if (geom.mode === 'collider') propCollider(ev);
    else if (geom.mode === 'fixed') propFixed(ev);
    else propStand(ev);
    ev.age = 0; ev.life = 2.6;
    events.forEach(function (o) { o.life = Math.min(o.life, Math.max(o.age, 0.2) + 0.4); });   // one event at a time; the last one fades out
    events.push(ev);
  }

  return {
    init: function (canvas) {
      cv = canvas; ctx = cv.getContext('2d');
      readColors(); resize();
      window.addEventListener('resize', resize);
      PC.loop('display', frame);
    },
    readColors: readColors,
    resize: resize,
    spawn: spawn,
    // v: { mode, key, installed{}, pending{}, installing{id:progress}, B, res, sqrtS, beam, active[], pileup, beamLabel, ls, staff{id: count},
    //      off: {fault: bool, text} | null — the experiment's own machine has no beam }
    set: function (v) { view = v; },
    // no beam at the experiment: the display only sees the odd cosmic
    idle: function () { return !!view.off; },
    // the event on screen, its subsystem legend and a note on the projection
    current: function () { var e = events[events.length - 1]; return e && e.age < e.life ? e : null; },
    legend: function () { return geom ? geom.legend : []; },
    note: function () { return geom ? geom.note : ''; },
    name: function () {
      if (view.mode === 'collider') return view.installed.solenoid ? 'CMS-like detector' : 'UA1-like detector';
      if (view.mode === 'fixed') return 'Fixed-target spectrometer';
      return 'Cosmic-ray test stand';
    }
  };
})();
