/* The injection chain in the accelerator control room, drawn as a synoptic: every machine in its own
 * shape, sized by its real circumference (radius ∝ C^0.3, one scale for every era), joined by its real transfer lines, with the
 * bunches moving through it, and below, the beam energy along the chain on a log scale.
 *
 *   Linac → (LBE) → PS Booster: four stacked rings → (BT/BTP) → PS → (TT2/TT10) → SPS → (TI2, TI8) → LHC
 *   before the Booster, the linac feeds the PS directly (LT); with the Antiproton Accumulator, the PS
 *   beam hits a target and the antiprotons are collected, cooled and sent back through the PS to
 *   the SPS, which then runs as the Sp̄pS collider with p and p̄ going round in opposite directions.
 *
 * The LHC shows its two beams (beam 1 blue, beam 2 red, as in the CCC), filling bunch by bunch while
 * the operators inject, and its four experiments. Like the other views, the canvas is kept across
 * the window's re-renders: mount() moves it into the window, set() hands it the machines' state.
 */
var PC = PC || {};

PC.ChainView = (function () {
  var cv = document.createElement('canvas'), ctx = cv.getContext('2d');
  cv.className = 'chain-canvas';
  var W = 0, H = 0, dpr = 1, colors = {}, view = null, last = 0, T = 0;
  var mini = false;                                     // drawing the small copy on the control room's video wall: no text
  // what the diagram knows about each machine: circumference (m), the energy it hands on (GeV, kinetic), a short name
  var M = {
    linac1: { C: 33, E: 0.05, name: 'LINAC 1', kind: 'linac' },
    linac2: { C: 36, E: 0.05, name: 'LINAC 2', kind: 'linac' },
    linac4: { C: 86, E: 0.16, name: 'LINAC 4', kind: 'linac' },
    psb: { C: 157, E: 0.8, name: 'PSB', kind: 'psb' },
    ps: { C: 628, E: 26, name: 'PS', kind: 'ring', magnets: 100 },
    sps: { C: 6912, E: 450, name: 'SPS', kind: 'ring', sextants: 6 },
    lhc: { C: 26659, E: 6800, name: 'LHC', kind: 'lhc' },
    aa: { C: 157, E: 3.5, name: 'AA', kind: 'aa' }
  };
  // ring radius ∝ C^0.3 (see layout); the linac drawn about as long as the Booster is wide
  var LINES = { 'linac-psb': 'LBE', 'linac-ps': 'LT', 'psb-ps': 'BT · BTP', 'ps-sps': 'TT2 · TT10', 'sps-lhc': 'TI2 · TI8' };
  var MP = 0.938;                                        // proton mass, GeV

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    ['--fg', '--dim', '--faint', '--rule', '--b1', '--b2', '--ok', '--warn', '--screen', '--panel', '--mono'].forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }
  function resize() {
    var r = cv.getBoundingClientRect();
    if (Math.abs(r.width - W) < 0.5 && Math.abs(r.height - H) < 0.5) return;
    dpr = window.devicePixelRatio || 1; W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    readColors();
  }
  function label(t, x, y, col, align, size, weight) {
    if (mini) return;
    ctx.fillStyle = col; ctx.font = (weight || '') + ' ' + (size || 9) + 'px ' + colors.mono; ctx.textAlign = align || 'left'; ctx.fillText(t, x, y); ctx.textAlign = 'left';
  }
  function stCol(st) { return st === 'alarm' ? colors.b2 : st === 'inj' ? colors.warn : st === 'on' ? colors.b1 : colors.faint; }
  function energyTxt(gev) { return PC.energy(gev); }

  /* ───── layout: the machines left to right, rings sized by log(circumference) ───── */
  function layout() {
    var ids = view.chain, topH = mini ? H : H * 0.62, cy = topH * (mini ? (view.aa ? 0.36 : 0.5) : 0.45), gap = mini ? 30 : 44;   // the small copy: room under the PS for the AA
    function sz(id) { var m = M[id]; return m.kind === 'linac' ? { w: 1, lin: true } : { r: Math.pow(m.C, 0.3) / 4 }; }   // C^0.3: the PSB to the LHC spans 4.6×, not 170×
    var size = ids.map(sz);
    // one scale for every era, fitted to the whole chain, so a machine keeps its size as the complex grows
    var full = ['linac4', 'psb', 'ps', 'sps', 'lhc'].map(sz), units = 0;
    full.forEach(function (z) { units += z.lin ? 2 : 2 * z.r; });
    var k = Math.min((W * 0.94 - gap * 4) / units, (topH * 0.72) / 2 / sz('lhc').r);
    units = 0; size.forEach(function (z) { units += z.lin ? 2 : 2 * z.r; });
    var x = (W - (units * k + gap * (ids.length - 1))) / 2, g = {};
    ids.forEach(function (id, i) {
      var z = size[i], w = z.lin ? 2 * k : 2 * z.r * k;
      g[id] = { x0: x, x1: x + w, cx: x + w / 2, cy: cy, r: z.lin ? 0 : z.r * k };
      x += w + gap;
    });
    if (view.aa && g.ps) { var ar = Math.max(9, g.ps.r * 0.5); g.aa = { cx: g.ps.cx - g.ps.r - ar * 0.4, cy: cy + g.ps.r + ar + 30, r: ar, x0: 0, x1: 0 }; }
    g.aa && (g.aa.x0 = g.aa.cx - g.aa.r, g.aa.x1 = g.aa.cx + g.aa.r);
    return { g: g, topH: topH, cy: cy };
  }

  /* ───── the machines ───── */
  function ring(cx, cy, r, col, dash) {
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash(dash ? [3, 3] : []);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
  }
  function bunches(cx, cy, r, n, phase, col, size, dir, fill) {
    ctx.fillStyle = col;
    for (var i = 0; i < n * (fill === undefined ? 1 : fill); i++) {
      var a = dir * phase + i / n * 6.2832;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, size, 0, 6.2832); ctx.fill();
    }
  }
  function drawMachine(id, p, n) {
    var m = M[id], col = stCol(n.st), on = n.st === 'on' || n.st === 'inj', dim = n.st === 'off';
    if (n.st === 'alarm') col = Math.sin(T * 6) > 0 ? colors.b2 : colors.dim;
    if (m.kind === 'linac') {                             // a beam pipe with drift tubes
      var y = p.cy, len = p.x1 - p.x0;
      ctx.fillStyle = colors.rule; ctx.fillRect(p.x0, y - 5, len, 10);
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.strokeRect(Math.round(p.x0) + 0.5, Math.round(y - 5) + 0.5, Math.round(len), 10);
      ctx.fillStyle = col;
      for (var t = 0; t < 7; t++) { var tx = p.x0 + 4 + t * (len - 8) / 6.4, tw = 2 + t * 0.6; ctx.fillRect(tx, y - 3, tw, 6); }
      if (on) {                                           // a pulse running down the linac
        var f = (T * 0.9) % 1; ctx.fillStyle = colors.warn; ctx.beginPath(); ctx.arc(p.x0 + f * len, y, 2.2, 0, 6.2832); ctx.fill();
      }
      return;
    }
    if (m.kind === 'psb') {                               // four rings stacked, seen at an angle
      for (var k = 3; k >= 0; k--) {
        ctx.strokeStyle = col; ctx.globalAlpha = 0.35 + 0.2 * k; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(p.cx, p.cy - 4.5 + k * 3, p.r, p.r * 0.92, 0, 0, 6.2832); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (on) for (var k2 = 0; k2 < 4; k2++) bunches(p.cx, p.cy - 4.5 + k2 * 3, p.r, 1, T * 3 + k2 * 1.3, colors.warn, 1.8, 1);
      return;
    }
    if (m.kind === 'aa') {                                // a squarish ring: the Accumulator
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash(dim ? [3, 3] : []);
      var r = p.r; ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(p.cx - r, p.cy - r * 0.8, 2 * r, 1.6 * r, r * 0.5); else ctx.rect(p.cx - r, p.cy - r * 0.8, 2 * r, 1.6 * r);
      ctx.stroke(); ctx.setLineDash([]);
      if (on) bunches(p.cx, p.cy, r * 0.8, 1, T * 0.8, colors.b2, 2.6, 1);   // the stack of antiprotons, cooling
      return;
    }
    ring(p.cx, p.cy, p.r, col, dim);
    if (m.magnets) {                                      // the PS: its 100 combined-function magnets
      ctx.strokeStyle = col; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.beginPath();
      for (var q = 0; q < 50; q++) { var a = q / 50 * 6.2832; ctx.moveTo(p.cx + Math.cos(a) * (p.r - 2.5), p.cy + Math.sin(a) * (p.r - 2.5)); ctx.lineTo(p.cx + Math.cos(a) * (p.r + 2.5), p.cy + Math.sin(a) * (p.r + 2.5)); }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (m.sextants) {                                     // the SPS: six long straight sections
      for (var s6 = 0; s6 < 6; s6++) {
        var a6 = -Math.PI / 2 + s6 / 6 * 6.2832;
        ctx.fillStyle = colors.screen; ctx.fillRect(p.cx + Math.cos(a6) * p.r - 2.5, p.cy + Math.sin(a6) * p.r - 2.5, 5, 5);
        ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.strokeRect(p.cx + Math.cos(a6) * p.r - 2.5, p.cy + Math.sin(a6) * p.r - 2.5, 5, 5);
      }
    }
    if (m.kind === 'lhc') {                               // two beam pipes, the four experiments
      ring(p.cx, p.cy, p.r - 3.5, col, dim);
      [['ATLAS', Math.PI / 2], ['ALICE', Math.PI * 0.75], ['CMS', -Math.PI / 2], ['LHCb', Math.PI * 1.25]].forEach(function (e) {
        var ex = p.cx + Math.cos(e[1]) * (p.r - 1.75), ey = p.cy + Math.sin(e[1]) * (p.r - 1.75), cms = e[0] === 'CMS';
        ctx.fillStyle = cms ? colors.warn : colors.screen; ctx.strokeStyle = cms ? colors.warn : col; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(ex, ey, cms ? 4.5 : 3.5, 0, 6.2832); ctx.fill(); ctx.stroke();
        var lx = p.cx + Math.cos(e[1]) * (p.r + 12), ly = p.cy + Math.sin(e[1]) * (p.r + 12) + 3;
        label(e[0], lx, ly, cms ? colors.warn : colors.faint, Math.cos(e[1]) > 0.3 ? 'left' : Math.cos(e[1]) < -0.3 ? 'right' : 'center', 8, cms ? '600' : '');
      });
      var fill = view.lhc ? view.lhc.fill : 0;
      if (fill > 0) {                                     // beam 1 clockwise, beam 2 the other way
        var a1 = view.lhc.stable ? 0.35 + 0.65 * view.lhc.L : 1;
        ctx.globalAlpha = a1; bunches(p.cx, p.cy, p.r, 24, T * 0.9, colors.b1, 1.5, 1, fill);
        bunches(p.cx, p.cy, p.r - 3.5, 24, T * 0.9 + 0.7, colors.b2, 1.5, -1, fill); ctx.globalAlpha = 1;
      }
      return;
    }
    if (on) {
      if (view.ppbar && id === 'sps') {                   // the Sp̄pS: protons one way, antiprotons the other; UA1 and UA2
        bunches(p.cx, p.cy, p.r, 6, T * 1.1, colors.b1, 2.2, 1);
        bunches(p.cx, p.cy, p.r, 6, T * 1.1 + 0.25, colors.b2, 2.2, -1);
        [['UA1', -Math.PI / 2], ['UA2', Math.PI / 2 - 0.9]].forEach(function (e) {
          var ex = p.cx + Math.cos(e[1]) * p.r, ey = p.cy + Math.sin(e[1]) * p.r;
          ctx.fillStyle = colors.warn; ctx.beginPath(); ctx.arc(ex, ey, 3.5, 0, 6.2832); ctx.fill();
          label(e[0], ex, ey + (Math.sin(e[1]) < 0 ? -7 : 13), colors.warn, 'center', 8, '600');
        });
      } else bunches(p.cx, p.cy, p.r, id === 'ps' ? 8 : 4, T * (id === 'ps' ? 2 : 1.2), colors.warn, 2, 1);
    }
  }

  // a transfer line: a pipe from one machine to the next, with its name; a pulse runs along it while it carries beam
  function line(x0, y0, x1, y1, name, active, col) {
    ctx.strokeStyle = active ? (col || colors.b1) : colors.rule; ctx.lineWidth = active ? 1.6 : 1.2;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    var ang = Math.atan2(y1 - y0, x1 - x0), ah = 5;                // the direction of the beam
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - ah * Math.cos(ang - 0.45), y1 - ah * Math.sin(ang - 0.45));
    ctx.moveTo(x1, y1); ctx.lineTo(x1 - ah * Math.cos(ang + 0.45), y1 - ah * Math.sin(ang + 0.45)); ctx.stroke();
    if (active) {
      var f = (T * 1.6) % 1; ctx.fillStyle = col || colors.warn;
      ctx.beginPath(); ctx.arc(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, 2, 0, 6.2832); ctx.fill();
    }
    if (name) label(name, (x0 + x1) / 2, (y0 + y1) / 2 - 6, colors.faint, 'center', 7.5);
  }

  /* ───── the energy along the chain, log scale ───── */
  function ladder(L) {
    var y0 = L.topH + 22, y1 = H - 16, x0 = 44, x1 = W - 10;
    var lo = -2, hi = 4;                                  // 10 MeV … 10 TeV, in log10(GeV)
    function Y(e) { return y1 - (Math.log10(Math.max(1e-2, e)) - lo) / (hi - lo) * (y1 - y0); }
    ctx.strokeStyle = colors.rule; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.lineTo(x1, y1); ctx.stroke();
    [[0.01, '10 MeV'], [0.1, '100 MeV'], [1, '1 GeV'], [10, '10 GeV'], [100, '100 GeV'], [1000, '1 TeV'], [10000, '10 TeV']].forEach(function (t) {
      var y = Y(t[0]);
      ctx.strokeStyle = colors.rule; ctx.globalAlpha = 0.5; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      label(t[1], x0 - 4, y + 3, colors.faint, 'right', 7.5);
    });
    label('BEAM ENERGY PER PROTON · LOG SCALE', x0 + 4, y0 - 6, colors.dim, 'left', 8);
    var prev = null;
    view.chain.forEach(function (id) {
      var p = L.g[id], n = view.nodes[id], e = n.E, y = Y(e), col = stCol(n.st === 'off' ? 'off' : 'on');
      var xa = Math.max(x0 + 2, p.x0), xb = Math.min(x1 - 2, p.x1);
      ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      if (prev) { ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(xa, prev.y); ctx.lineTo(xa, y); ctx.stroke(); ctx.lineWidth = 2.5; }
      ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(xb, y); ctx.stroke();
      var gamma = 1 + e / MP, et = energyTxt(e), gt = '  γ ' + (gamma < 10 ? gamma.toFixed(2) : PC.fmt(Math.round(gamma)));
      ctx.font = '600 9px ' + colors.mono; var w1 = ctx.measureText(et).width; ctx.font = '7.5px ' + colors.mono; var w2 = ctx.measureText(gt).width;
      var lx = Math.min(x1 - w1 - w2, Math.max(xa, (xa + xb) / 2 - (w1 + w2) / 2));
      label(et, lx, y - 5, n.st === 'off' ? colors.faint : colors.fg, 'left', 9, '600');
      label(gt, lx + w1, y - 5, colors.faint, 'left', 7.5);
      if (prev && prev.e > 0) label('×' + PC.fmt(e / prev.e), xa, prev.y + 11, colors.dim, 'center', 7.5);   // the gain, under the step
      prev = { x: xb, y: y, e: e };
    });
  }

  function frame(ts) {
    var dt = Math.max(0, Math.min(0.1, (ts - last) / 1000 || 0)); last = Math.max(last, ts); T += dt;
    if (!view || !cv.parentNode || cv.offsetParent === null) return;
    resize();
    if (!W || !H) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    if (!view.chain.length) { label('No accelerator yet: build Linac 1.', W / 2, H / 2, colors.faint, 'center', 11); return; }
    ladder(diagram());
  }
  // the machines and the lines between them; returns the layout for the energy ladder
  function diagram() {
    var L = layout(), g = L.g, ids = view.chain;
    // transfer lines first, under the machines
    for (var i = 1; i < ids.length; i++) {
      var a = g[ids[i - 1]], b = g[ids[i]], up = view.nodes[ids[i - 1]], dn = view.nodes[ids[i]];
      var key = (M[ids[i - 1]].kind === 'linac' ? 'linac' : ids[i - 1]) + '-' + ids[i];
      var active = (up.st === 'on' || up.st === 'inj') && (dn.st === 'on' || dn.st === 'inj') && (ids[i] !== 'lhc' || view.lhc.injecting);
      var xa = a.r ? a.cx + a.r : a.x1, xb = b.r ? b.cx - b.r : b.x0;
      if (ids[i] === 'lhc') {                             // two lines from the SPS: TI2 to beam 1, TI8 to beam 2
        var by = b.r * 0.38;
        line(xa, a.cy, b.cx - Math.sqrt(b.r * b.r - by * by), b.cy + by, 'TI2', active, colors.b1);
        line(xa, a.cy, b.cx - Math.sqrt(b.r * b.r - by * by), b.cy - by, 'TI8', active, colors.b2);
      } else line(xa + 2, a.cy, xb - 2, b.cy, LINES[key], active);
    }
    if (g.aa) {                                           // PS → target → AA, and the cooled antiprotons back to the PS
      var ps = g.ps, aa = g.aa, aOn = view.nodes.aa && view.nodes.aa.st !== 'off';
      var tx = ps.cx - ps.r * 0.71, ty = ps.cy + ps.r * 0.71;                    // the target, on the PS's extraction
      ctx.fillStyle = colors.warn; ctx.fillRect(tx - 2.5, ty - 2.5, 5, 5);
      line(tx, ty, aa.cx - aa.r * 0.3, aa.cy - aa.r * 0.8, '', aOn, colors.warn);
      line(aa.cx + aa.r, aa.cy - aa.r * 0.3, ps.cx - ps.r * 0.2, ps.cy + ps.r, '', aOn, colors.b2);   // the antiprotons, back to the PS
      label('target', tx - 5, ty + 2, colors.faint, 'right', 7.5);
    }
    // the machines, their names, energies, states
    var drawn = ids.concat(g.aa ? ['aa'] : []);
    drawn.forEach(function (id) {
      var p = g[id], n = view.nodes[id];
      if (!p || !n) return;
      drawMachine(id, p, n);
      var ny = p.r ? p.cy + p.r + (id === 'lhc' ? 30 : 13) : p.cy + 18, nm = id === 'sps' && view.ppbar ? 'SPS · Sp̄pS' : M[id].name;
      if (id === 'aa') ny = p.cy + p.r + 12;
      if (id === 'ps' && g.aa) ny = p.cy - p.r - 20;           // the antiproton lines run under the PS: its name goes above
      label(nm, p.cx, ny, n.st === 'off' ? colors.faint : colors.fg, 'center', 9.5, '600');
      label(n.status + (n.share !== null && n.share !== undefined ? ' · ' + Math.round(n.share * 100) + '% of collisions' : ''), p.cx, ny + 11, stCol(n.st), 'center', 7.5);
      if (n.building !== undefined) {                      // under construction: an arc for the progress
        ctx.strokeStyle = colors.warn; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.cx, p.cy, (p.r || 8) + 5, -Math.PI / 2, -Math.PI / 2 + 6.2832 * n.building); ctx.stroke();
      }
    });
    return L;
  }
  // the same diagram, small and without text, into a rectangle of another canvas (the control room's video wall):
  // drawn at twice the size and scaled down, so lines and bunches shrink with it
  function drawMini(c, P) {
    if (!view || !view.chain.length || !colors.fg) return false;
    var keep = [ctx, W, H], f = 0.5;
    ctx = c; W = P.w / f; H = P.h / f; mini = true;
    c.save(); c.beginPath(); c.rect(P.x, P.y, P.w, P.h); c.clip(); c.translate(P.x, P.y); c.scale(f, f);
    try { diagram(); } finally { c.restore(); ctx = keep[0]; W = keep[1]; H = keep[2]; mini = false; }
    return true;
  }

  readColors();
  PC.loop('chainview', frame);
  return {
    mount: function (el) { if (el && cv.parentNode !== el) el.appendChild(cv); },
    // v: { chain: [ids in order], aa, ppbar, nodes: {id: {st: on|inj|alarm|off, status, E (GeV per proton), share}},
    //      lhc: {fill 0–1, injecting, stable, L} }
    set: function (v) { view = v; },
    drawMini: drawMini,
    readColors: readColors
  };
})();
