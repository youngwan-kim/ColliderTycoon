/* Detector health: heatmaps for the detector control room (and a thumbnail for its room
 * on the overview).
 *
 * Overview (r–z). Collider: a quarter view, beam along the bottom, the interaction point
 * in the corner, as in the CMS quadrant drawings, with the tracker, calorimeters and muon
 * system at CMS-like radii and lengths on compressed scales. Fixed target: a side view.
 *
 * Subdetector maps (η–φ). Each subdetector unrolled, the way detector monitoring shows its
 * module maps: pixel and strip barrels and endcaps, ECAL and HCAL barrels and endcaps, the
 * muon barrel wheels × sectors and endcap disks. Spontaneous faults sit on these maps:
 * a dead channel is a dark cell with a cross, a noisy one blinks amber.
 *
 * The physics. Damage follows the charged-particle fluence from the interaction point:
 * with dN/dη flat, the flux per area is ∝ 1/(r·√(r²+z²)) on a barrel cylinder and
 * ∝ z/(r²·√(r²+z²)) on an endcap disk. Damage saturates, so the weight grows slower than
 * the fluence (a power below 1). Calorimeters weigh high |η| more (forward particles carry
 * more energy; CMS's endcap crystals darken far faster than the barrel's); the muon system
 * sees a soft neutron background, nearly uniform. A fixed per-module spread makes no two
 * modules alike. Each subsystem's cells are scaled so their mean damage equals its health
 * in the game, in every view.
 *
 * Colour: one hue, the panel's surface (intact) to red (dead).
 */
var PC = PC || {};

PC.HealthMap = (function () {
  var colors = {};

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    ['--fg', '--dim', '--faint', '--rule', '--b2', '--warn', '--screen', '--mono'].forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }
  function hex(c) {
    c = (c || '#ffffff').replace('#', '');
    if (c.length === 3) c = c.split('').map(function (x) { return x + x; }).join('');
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  }
  // efficiency 1 → surface, 0 → red; a slight curve so early damage shows
  function ramp(eff) {
    var a = hex(colors.screen), b = hex(colors.b2), k = Math.pow(Math.max(0, Math.min(1, 1 - eff)), 0.8);
    return 'rgb(' + a.map(function (x, i) { return Math.round(x + (b[i] - x) * k); }).join(',') + ')';
  }
  function label(ctx, t, x, y, col, align, size) {
    ctx.fillStyle = col; ctx.font = (size || 10) + 'px ' + colors.mono; ctx.textAlign = align || 'left'; ctx.fillText(t, x, y); ctx.textAlign = 'left';
  }
  function noise(i, j, k) { var x = Math.sin(i * 12.9898 + j * 78.233 + k * 37.719) * 43758.5453; return x - Math.floor(x); }
  function prep(cv) {
    var r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, W = r.width, H = r.height;
    if (!W || !H) return null;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    return { ctx: ctx, W: W, H: H };
  }

  /* ───────── physics ───────── */
  function fluxBarrel(r, z) { return 1 / (r * Math.sqrt(r * r + z * z)); }
  function fluxEndcap(r, z) { return z / (r * r * Math.sqrt(r * r + z * z)); }
  function etaOf(r, z) { return -Math.log(Math.tan(Math.atan2(r, Math.abs(z)) / 2)); }
  // damage weight at (r, z) for a lane, barrel or endcap surface
  function weight(lane, kind, r, z) {
    z = Math.abs(z);
    var f = kind === 'endcap' ? fluxEndcap(r, Math.max(z, 0.05)) : fluxBarrel(r, z);
    if (lane === 'tracking') return Math.pow(f, 0.35);
    if (lane === 'calo') { var e = etaOf(r, z); return Math.pow(f, 0.45) * (1 + 0.6 * e * e); }
    return Math.pow(f, 0.12);
  }
  // scale each lane's weights so the mean damage equals 1 − health
  function assign(list, health) {
    var mean = {}, n = {};
    list.forEach(function (c) { mean[c.lane] = (mean[c.lane] || 0) + c.w; n[c.lane] = (n[c.lane] || 0) + 1; });
    list.forEach(function (c) {
      var h = health[c.lane] === undefined ? 1 : health[c.lane];
      c.eff = Math.max(0, 1 - (1 - h) * c.w / (mean[c.lane] / n[c.lane]));
    });
  }

  /* ───────── the r–z overview ───────── */
  var RK = [[0, 0], [0.2, 0.1], [1.2, 0.33], [1.8, 0.44], [3.2, 0.6], [7.6, 1]];
  var ZK = [[0, 0], [2.8, 0.3], [5.5, 0.55], [11, 1]];
  function pw(k, v) {
    for (var i = 1; i < k.length; i++) if (v <= k[i][0]) { var a = k[i - 1], b = k[i]; return a[1] + (b[1] - a[1]) * (v - a[0]) / (b[0] - a[0]); }
    return 1;
  }
  function rzCells(lanes) {
    var out = [];
    function region(lane, part, kind, r0, r1, z0, z1, nr, nz) {
      for (var i = 0; i < nr; i++) for (var j = 0; j < nz; j++) {
        var a = r0 + (r1 - r0) * i / nr, b = r0 + (r1 - r0) * (i + 1) / nr, c = z0 + (z1 - z0) * j / nz, d = z0 + (z1 - z0) * (j + 1) / nz;
        var rm = (a + b) / 2, zm = (c + d) / 2;
        out.push({ lane: lane, part: part, kind: kind, r0: a, r1: b, z0: c, z1: d, rm: rm, zm: zm, eta: etaOf(rm, zm),
          w: weight(lane, kind, rm, zm) * (0.85 + 0.3 * noise(i, j, part.length)) });
      }
    }
    if (lanes.tracking) {
      region('tracking', 'pixel barrel', 'barrel', 0.03, 0.17, 0, 0.55, 4, 4);
      region('tracking', 'strip barrel', 'barrel', 0.2, 1.1, 0, 1.2, 6, 5);
      region('tracking', 'strip endcap', 'endcap', 0.2, 1.1, 1.25, 2.8, 6, 5);
    }
    if (lanes.calo) {
      region('calo', 'ECAL barrel', 'barrel', 1.29, 1.75, 0, 3.0, 2, 10);
      region('calo', 'ECAL endcap', 'endcap', 0.32, 1.7, 3.15, 3.5, 7, 1);
      region('calo', 'HCAL barrel', 'barrel', 1.8, 2.9, 0, 4.3, 3, 8);
      region('calo', 'HCAL endcap', 'endcap', 0.32, 2.9, 3.9, 5.5, 6, 3);
    }
    if (lanes.muon) {
      region('muon', 'barrel stations', 'barrel', 4.0, 7.4, 0, 6.6, 4, 5);
      region('muon', 'endcap disks', 'endcap', 0.6, 7.0, 6.8, 10.6, 5, 4);
    }
    return out;
  }
  // fixed-target spectrometer, side view: y (across the beam) by z (along it); damage near the axis and the target
  function sideCells(lanes) {
    var out = [];
    function region(lane, part, z0, z1, ny, nz, hy) {
      for (var i = 0; i < ny; i++) for (var j = 0; j < nz; j++) {
        var a = -hy + 2 * hy * i / ny, b = -hy + 2 * hy * (i + 1) / ny, c = z0 + (z1 - z0) * j / nz, d = z0 + (z1 - z0) * (j + 1) / nz;
        var ym = (a + b) / 2, zm = (c + d) / 2;
        out.push({ lane: lane, part: part, kind: 'side', y0: a, y1: b, z0: c, z1: d, rm: Math.abs(ym), zm: zm,
          w: Math.pow(1 / (0.08 + ym * ym) / Math.sqrt(zm), lane === 'muon' ? 0.2 : 0.5) * (0.85 + 0.3 * noise(i, j, part.length)) });
      }
    }
    if (lanes.tracking) [3, 4.5, 6, 7.5, 13.5, 15].forEach(function (z, k) { region('tracking', 'chamber plane ' + (k + 1), z - 0.25, z + 0.25, 10, 1, 1.6); });
    if (lanes.calo) region('calo', 'lead-glass wall', 18, 20.5, 10, 2, 1.8);
    if (lanes.muon) region('muon', 'iron + muon counters', 21, 25, 10, 2, 2);
    return out;
  }
  // paint the overview into a rectangle; with axes in the window, bare as a thumbnail
  function paintRZ(ctx, box, opts, axes) {
    var list = opts.mode === 'collider' ? rzCells(opts.lanes) : sideCells(opts.lanes);
    assign(list, opts.health);
    var X, Y;
    if (opts.mode === 'collider') {
      X = function (z) { return box.x + pw(ZK, z) * box.w; };
      Y = function (rr) { return box.y + box.h - pw(RK, rr) * box.h; };
    } else {
      X = function (z) { return box.x + (z - 2) / 24 * box.w; };
      Y = function (y) { return box.y + box.h / 2 - y / 2.1 * (box.h / 2); };
    }
    var parts = {};
    list.forEach(function (c) {
      var x0 = X(c.z0), x1 = X(c.z1), y0 = Y(c.kind === 'side' ? c.y1 : c.r1), y1 = Y(c.kind === 'side' ? c.y0 : c.r0);
      c.box = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
      ctx.fillStyle = ramp(c.eff);
      var gap = axes ? 0.5 : 0.25;
      ctx.fillRect(c.box.x + gap, c.box.y + gap, Math.max(1, c.box.w - 2 * gap), Math.max(1, c.box.h - 2 * gap));
      var p = parts[c.part] || (parts[c.part] = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
      p.x0 = Math.min(p.x0, c.box.x); p.y0 = Math.min(p.y0, c.box.y); p.x1 = Math.max(p.x1, c.box.x + c.box.w); p.y1 = Math.max(p.y1, c.box.y + c.box.h);
    });
    ctx.strokeStyle = colors.faint; ctx.lineWidth = 1;
    Object.keys(parts).forEach(function (k) { var p = parts[k]; ctx.strokeRect(Math.round(p.x0) + 0.5, Math.round(p.y0) + 0.5, Math.round(p.x1 - p.x0) - 1, Math.round(p.y1 - p.y0) - 1); });
    if (!axes) return list;
    ctx.strokeStyle = colors.dim;
    if (opts.mode === 'collider') {
      var m = box;
      ctx.beginPath(); ctx.moveTo(m.x, m.y + m.h + 0.5); ctx.lineTo(m.x + m.w, m.y + m.h + 0.5); ctx.stroke();
      label(ctx, 'beam →  z (m)', m.x + m.w, m.y + m.h + 13, colors.faint, 'right', 9);
      [2.8, 5.5].forEach(function (z) { label(ctx, String(z), X(z), m.y + m.h + 13, colors.faint, 'center', 9); });
      [0.2, 1.2, 3.2].forEach(function (rr) { label(ctx, rr + '', m.x - 4, Y(rr) + 3, colors.faint, 'right', 9); });
      label(ctx, 'r (m)', m.x - 4, m.y + 8, colors.faint, 'right', 9);
      ctx.fillStyle = colors.fg; ctx.beginPath(); ctx.arc(m.x, m.y + m.h, 3, 0, 6.2832); ctx.fill();
      label(ctx, 'IP', m.x, m.y + m.h + 13, colors.dim, 'center', 9);
      ctx.save(); ctx.setLineDash([2, 4]); ctx.strokeStyle = colors.faint;
      [1, 2, 3].forEach(function (e) {
        var th = 2 * Math.atan(Math.exp(-e)), zEnd = Math.min(11, 7.6 / Math.tan(th)), rEnd = zEnd * Math.tan(th);
        ctx.beginPath(); ctx.moveTo(m.x, m.y + m.h);
        for (var z = 0.05; z <= zEnd; z += zEnd / 40) ctx.lineTo(X(z), Y(z * Math.tan(th)));
        ctx.stroke(); label(ctx, 'η=' + e, X(zEnd) - 2, Y(rEnd) + 10, colors.faint, 'right', 9);
      });
      ctx.restore();
    } else {
      ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = colors.dim;
      ctx.beginPath(); ctx.moveTo(box.x, Y(0)); ctx.lineTo(box.x + box.w, Y(0)); ctx.stroke(); ctx.restore();
      ctx.fillStyle = colors.fg; ctx.fillRect(X(1) - 2, Y(0) - 5, 4, 10);
      label(ctx, 'target', X(1) + 4, Y(0) - 7, colors.dim, 'left', 9);
      label(ctx, 'beam →  z (m)', box.x + box.w, box.y + box.h + 13, colors.faint, 'right', 9);
    }
    return list;
  }
  function legend(ctx, x, y, w, text) {
    for (var i = 0; i < w; i++) { ctx.fillStyle = ramp(1 - i / w); ctx.fillRect(x + i, y, 1, 6); }
    ctx.strokeStyle = colors.faint; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 5);
    label(ctx, '100%', x, y - 3, colors.faint, 'left', 9);
    label(ctx, '0%', x + w, y - 3, colors.faint, 'right', 9);
    label(ctx, text, x + w + 10, y + 6, colors.dim, 'left', 9);
  }

  // opts: { mode: 'collider'|'fixed'|'stand', health: {lane: 0–1}, lanes: {lane: true}, faults: [...] }
  function draw(cv, opts) {
    readColors();
    var p = prep(cv);
    if (!p) return;
    cv._cells = [];
    if (opts.mode === 'stand') { label(p.ctx, 'Cosmic-ray test stand: no beam, no radiation damage.', p.W / 2, p.H / 2, colors.dim, 'center', 11); return; }
    var box = { x: 34, y: 10, w: p.W - 46, h: p.H - 54 };
    cv._cells = paintRZ(p.ctx, box, opts, true);
    legend(p.ctx, 34, p.H - 16, Math.min(160, box.w * 0.4), 'local efficiency · hover a cell');
  }

  /* ───────── the subdetector maps, η–φ ───────── */
  // each part: |η| range e0…e1 (both sides), cells in η and φ, and where it sits (r for a barrel, z for an endcap)
  var COLLIDER_PARTS = {
    tracking: [
      { name: 'Pixel barrel', kind: 'barrel', e0: 0, e1: 2.5, ne: 16, nf: 24, at: 0.1 },
      { name: 'Strip barrel', kind: 'barrel', e0: 0, e1: 1.4, ne: 14, nf: 24, at: 0.6 },
      { name: 'Strip endcaps', kind: 'endcap', e0: 1.4, e1: 2.5, ne: 12, nf: 24, at: 2.0 }
    ],
    calo: [
      { name: 'ECAL barrel', kind: 'barrel', e0: 0, e1: 1.48, ne: 18, nf: 36, at: 1.5 },
      { name: 'ECAL endcaps', kind: 'endcap', e0: 1.48, e1: 3.0, ne: 12, nf: 36, at: 3.2 },
      { name: 'HCAL barrel', kind: 'barrel', e0: 0, e1: 1.3, ne: 16, nf: 18, at: 2.3 },
      { name: 'HCAL endcaps', kind: 'endcap', e0: 1.3, e1: 3.0, ne: 12, nf: 18, at: 4.5 }
    ],
    muon: [
      { name: 'Muon barrel', kind: 'barrel', e0: 0, e1: 1.2, ne: 5, nf: 12, at: 5.5, xlab: 'wheel', ylab: 'sector' },
      { name: 'Muon endcaps', kind: 'endcap', e0: 0.9, e1: 2.4, ne: 8, nf: 18, at: 8.5, xlab: 'disk', ylab: 'φ' }
    ]
  };
  var FIXED_PARTS = {
    tracking: [{ name: 'Chamber planes', grid: true, ne: 6, nf: 16, xlab: 'plane', ylab: 'wire group' }],
    calo: [{ name: 'Lead-glass wall', grid: true, ne: 4, nf: 14, xlab: 'column', ylab: 'row' }],
    muon: [{ name: 'Muon counters', grid: true, ne: 4, nf: 8, xlab: 'layer', ylab: 'paddle' }]
  };
  // the η of cell column i of a part (both sides: −e1 … −e0, e0 … e1)
  function etaAt(p, i) {
    if (p.e0 === 0) return -p.e1 + 2 * p.e1 * (i + 0.5) / p.ne;
    var half = p.ne / 2, k = i < half ? half - 1 - i : i - half, e = p.e0 + (p.e1 - p.e0) * (k + 0.5) / half;
    return i < half ? -e : e;
  }
  function mapCells(mode, lanes) {
    var out = [], defs = mode === 'collider' ? COLLIDER_PARTS : FIXED_PARTS;
    Object.keys(defs).forEach(function (lane) {
      if (!lanes[lane]) return;
      defs[lane].forEach(function (p, pi) {
        for (var i = 0; i < p.ne; i++) for (var j = 0; j < p.nf; j++) {
          var w;
          if (p.grid) {                                                         // fixed target: rows nearest the beam take the most
            var y = (j + 0.5) / p.nf * 2 - 1;
            w = Math.pow(1 / (0.08 + y * y), lane === 'muon' ? 0.2 : 0.5) / Math.sqrt(1 + i * 0.4);
          } else {
            var e = etaAt(p, i), th = 2 * Math.atan(Math.exp(-Math.abs(e)));
            var r = p.kind === 'barrel' ? p.at : p.at * Math.tan(th), z = p.kind === 'barrel' ? p.at / Math.tan(th) : p.at;
            w = weight(lane, p.kind, Math.max(r, 0.03), z);
          }
          out.push({ lane: lane, part: p.name, pi: pi, i: i, j: j, eta: p.grid ? null : etaAt(p, i), phi: (j + 0.5) / p.nf * 360,
            w: w * (0.8 + 0.4 * noise(i, j, pi + lane.length * 7)) });
        }
      });
    });
    return out;
  }
  // a fault's place on its subsystem's maps: u picks the part and the η column, v the φ row
  function faultCell(f, defs) {
    var parts = defs[f.lane];
    if (!parts) return null;
    var k = Math.min(parts.length - 1, Math.floor(f.u * parts.length)), p = parts[k], u2 = f.u * parts.length - k;
    return { part: p.name, i: Math.min(p.ne - 1, Math.floor(u2 * p.ne)), j: Math.min(p.nf - 1, Math.floor(f.v * p.nf)) };
  }
  function maps(cv, opts, t) {
    readColors();
    var p = prep(cv);
    if (!p) return;
    var ctx = p.ctx;
    cv._cells = [];
    if (opts.mode === 'stand') { label(ctx, 'No beam, no maps: the test stand only sees cosmic rays.', p.W / 2, 20, colors.dim, 'center', 11); return; }
    var defs = opts.mode === 'collider' ? COLLIDER_PARTS : FIXED_PARTS, list = mapCells(opts.mode, opts.lanes);
    assign(list, opts.health);
    var faults = (opts.faults || []).map(function (f) { var c = faultCell(f, defs); if (c) c.f = f; return c; }).filter(Boolean);
    // one row per subsystem, its parts side by side
    var lanes = Object.keys(defs).filter(function (l) { return opts.lanes[l]; }), y = 4, gap = 12, mh = 58, padL = 12;
    lanes.forEach(function (lane) {
      var parts = defs[lane], n = parts.length, w = (p.W - padL - gap * (n - 1)) / n;
      parts.forEach(function (pt, k) {
        var x = padL + k * (w + gap), cells = list.filter(function (c) { return c.lane === lane && c.part === pt.name; });
        var mean = 0; cells.forEach(function (c) { mean += c.eff; }); mean /= cells.length;
        label(ctx, pt.name, x, y + 9, colors.fg, 'left', 10);
        label(ctx, Math.round(mean * 100) + '%', x + w, y + 9, mean < 0.6 ? colors.b2 : mean < 0.85 ? colors.warn : colors.dim, 'right', 10);
        var gx = x, gy = y + 14, cw = w / pt.ne, ch = mh / pt.nf;
        cells.forEach(function (c) {
          c.box = { x: gx + c.i * cw, y: gy + c.j * ch, w: cw, h: ch };
          ctx.fillStyle = ramp(c.eff);
          var gx2 = cw > 4 ? 0.5 : 0, gy2 = ch > 4 ? 0.5 : 0;
          ctx.fillRect(c.box.x + gx2, c.box.y + gy2, Math.max(0.8, cw - 2 * gx2), Math.max(0.8, ch - 2 * gy2));
          cv._cells.push(c);
        });
        if (!pt.grid && pt.e0 > 0) {                                           // the two endcaps, either side of the barrel
          ctx.strokeStyle = colors.dim; ctx.setLineDash([2, 2]);
          ctx.beginPath(); ctx.moveTo(gx + w / 2 + 0.5, gy); ctx.lineTo(gx + w / 2 + 0.5, gy + mh); ctx.stroke(); ctx.setLineDash([]);
        }
        ctx.strokeStyle = colors.faint; ctx.lineWidth = 1; ctx.strokeRect(Math.round(gx) + 0.5, Math.round(gy) + 0.5, Math.round(w) - 1, Math.round(mh));
        // faults: dead (dark, crossed) and noisy (blinking amber)
        faults.filter(function (fc) { return fc.part === pt.name; }).forEach(function (fc) {
          var sz = Math.max(6, Math.min(cw, ch) + 2), cx = gx + (fc.i + 0.5) * cw, cy = gy + (fc.j + 0.5) * ch;
          if (fc.f.kind === 'dead') {
            ctx.fillStyle = colors.fg; ctx.fillRect(cx - sz / 2, cy - sz / 2, sz, sz);
            ctx.strokeStyle = colors.screen; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(cx - sz / 2 + 1.5, cy - sz / 2 + 1.5); ctx.lineTo(cx + sz / 2 - 1.5, cy + sz / 2 - 1.5);
            ctx.moveTo(cx + sz / 2 - 1.5, cy - sz / 2 + 1.5); ctx.lineTo(cx - sz / 2 + 1.5, cy + sz / 2 - 1.5); ctx.stroke();
          } else if (fc.f.masked) {                                          // masked: switched off, grey with an M
            ctx.fillStyle = colors.dim; ctx.fillRect(cx - sz / 2, cy - sz / 2, sz, sz);
            if (sz >= 8) label(ctx, 'M', cx, cy + 3, colors.screen, 'center', Math.min(9, sz - 1));
          } else {
            ctx.strokeStyle = colors.warn; ctx.lineWidth = 2; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 6);
            ctx.strokeRect(cx - sz / 2 - 1, cy - sz / 2 - 1, sz + 2, sz + 2); ctx.globalAlpha = 1;
          }
          ctx.lineWidth = 1;
          cv._cells.unshift({ part: pt.name, fault: fc.f, box: { x: cx - sz / 2 - 2, y: cy - sz / 2 - 2, w: sz + 4, h: sz + 4 } });
        });
        // axes, kept small
        label(ctx, pt.xlab || ('−' + pt.e1 + '   η   +' + pt.e1), gx + w / 2, gy + mh + 11, colors.faint, 'center', 9);
        ctx.save(); ctx.translate(gx - 3, gy + mh / 2); ctx.rotate(-Math.PI / 2); label(ctx, pt.ylab || 'φ', 0, 0, colors.faint, 'center', 9); ctx.restore();
      });
      y += mh + 34;
    });
    legend(ctx, padL, y + 8, Math.min(160, p.W * 0.28), 'efficiency · ✕ dead · amber: noisy (click to mask) · M: masked');
  }
  // height the maps need for these lanes
  function mapsHeight(mode, lanes) {
    var defs = mode === 'collider' ? COLLIDER_PARTS : FIXED_PARTS;
    return Object.keys(defs).filter(function (l) { return lanes[l]; }).length * 92 + 36;
  }

  // a small r–z thumbnail for the detector control room on the overview
  function thumb(ctx, box, opts) {
    readColors();
    if (opts.mode === 'stand') return;
    paintRZ(ctx, box, opts, false);
  }

  // hover: the cell under the pointer, in words; cells live on their canvas
  function hover(e) {
    var cv = e.currentTarget, tip = cv._tip, cells = cv._cells || [];
    if (!tip) return;
    var b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top, hit = null;
    for (var i = 0; i < cells.length; i++) { var c = cells[i].box; if (c && x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) { hit = cells[i]; break; } }
    if (!hit) { tip.hidden = true; return; }
    var h;
    if (hit.fault) {
      var f = hit.fault;
      h = '<b>' + PC.esc(hit.part) + ': ' + PC.esc(f.what) + '</b><span>' + (f.kind === 'dead' ? 'dead channel' : f.masked ? 'noisy channel, masked' : 'noisy channel · firing fake triggers · click to mask') + ' · engineers on it</span>' +
        '<span class="tip-k">' + Math.round((1 - f.remain / f.total) * 100) + '% repaired</span>';
    } else {
      var where = hit.kind === 'side' ? 'z ≈ ' + hit.zm.toFixed(1) + ' m, ' + hit.rm.toFixed(1) + ' m off the beam'
        : hit.r0 !== undefined ? 'r ≈ ' + hit.rm.toFixed(2) + ' m, z ≈ ' + hit.zm.toFixed(1) + ' m, |η| ≈ ' + hit.eta.toFixed(1)
        : hit.eta !== null && hit.eta !== undefined ? 'η ≈ ' + hit.eta.toFixed(2) + ', φ ≈ ' + Math.round(hit.phi) + '°' : 'module ' + (hit.i + 1) + ', ' + (hit.j + 1);
      h = '<b>' + PC.esc(hit.part) + '</b><span>' + where + '</span><span class="tip-k">' + Math.round(hit.eff * 100) + '% efficient</span>';
    }
    tip.innerHTML = h; tip.hidden = false;
    var pb = tip.parentNode.getBoundingClientRect();
    tip.style.left = Math.min(e.clientX - pb.left + 12, pb.width - tip.offsetWidth - 4) + 'px';
    tip.style.top = (e.clientY - pb.top + 14) + 'px';
  }

  return {
    draw: draw, maps: maps, mapsHeight: mapsHeight, thumb: thumb,
    attach: function (cv, tip, onFault) {
      if (cv._tip) return;
      cv._tip = tip;
      if (onFault) cv.addEventListener('click', function (e) {
        var b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
        var hit = (cv._cells || []).filter(function (c) { return c.fault && c.box && x >= c.box.x && x <= c.box.x + c.box.w && y >= c.box.y && y <= c.box.y + c.box.h; })[0];
        if (hit && hit.fault.kind === 'noisy' && !hit.fault.masked) { onFault(hit.fault); tip.hidden = true; }
      });
      cv.addEventListener('mousemove', function (e) {
        var b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
        cv.style.cursor = (cv._cells || []).some(function (c) { return c.fault && c.fault.kind === 'noisy' && !c.fault.masked && c.box && x >= c.box.x && x <= c.box.x + c.box.w && y >= c.box.y && y <= c.box.y + c.box.h; }) ? 'pointer' : '';
      });
      cv.addEventListener('mousemove', hover);
      cv.addEventListener('mouseleave', function () { tip.hidden = true; });
    }
  };
})();
