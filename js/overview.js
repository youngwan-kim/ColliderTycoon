/* Overview links, drawn over the four panels:
 *   zoom lines from the experiment's spot on the complex map to the detector lens;
 *   the readout link from the detector, through the trigger, to the computing room's door (left wall),
 *   with packets at a rate that follows the recorded event rate;
 *   the data link from the storage (the computing room's right wall) to the analysis room, carrying reconstructed events.
 */
var PC = PC || {};

PC.Overview = (function () {
  var cv, ctx, root, map, det, comp, ana, W = 0, H = 0, dpr = 1, colors = {}, view = null, packets = [], acc = 0, last = 0;
  var dpk = [], dacc = 0;

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    ['--fg', '--dim', '--faint', '--rule', '--b1', '--b2', '--ok', '--warn', '--panel', '--mono'].forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }
  function resize() {
    var r = root.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1; W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function circleOf(el, o) {
    var r = el.getBoundingClientRect();
    return { x: r.left - o.left + r.width / 2, y: r.top - o.top + r.height / 2, r: r.width / 2 };
  }
  // the two outer tangents between circles a and b
  function tangents(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d <= Math.abs(b.r - a.r)) return [];
    var base = Math.atan2(dy, dx), off = Math.acos((a.r - b.r) / d);
    return [base + off, base - off].map(function (t) {
      return [[a.x + Math.cos(t) * a.r, a.y + Math.sin(t) * a.r], [b.x + Math.cos(t) * b.r, b.y + Math.sin(t) * b.r]];
    });
  }

  function frame(ts) {
    var dt = Math.min(0.1, (ts - last) / 1000 || 0); last = ts;
    requestAnimationFrame(frame);
    if (!view) return;
    var o = root.getBoundingClientRect();
    if (Math.abs(o.width - W) > 0.5 || Math.abs(o.height - H) > 0.5) resize();
    ctx.clearRect(0, 0, W, H);
    if (W < 700) return;                                   // stacked layout: the panels speak for themselves

    // zoom lines: map spot → detector lens
    var s = PC.Complex.site(), mr = map.getBoundingClientRect();
    var D = circleOf(det, o), cr = comp.getBoundingClientRect(), pt = PC.Computing.ports();
    var C = { l: cr.left - o.left, r: cr.right - o.left, y: cr.top - o.top + (pt.inY || cr.height / 2), yOut: cr.top - o.top + (pt.outY || cr.height / 2) };
    if (s) {
      var A = { x: mr.left - o.left + s.x, y: mr.top - o.top + s.y, r: s.r };
      ctx.save(); ctx.strokeStyle = colors.warn; ctx.globalAlpha = 0.45; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      tangents(A, D).forEach(function (l) { ctx.beginPath(); ctx.moveTo(l[0][0], l[0][1]); ctx.lineTo(l[1][0], l[1][1]); ctx.stroke(); });
      ctx.restore();
    }

    // readout link: detector → trigger → computing
    var p1 = [C.l, C.y], ang = Math.atan2(p1[1] - D.y, p1[0] - D.x);
    var p0 = [D.x + Math.cos(ang) * D.r, D.y + Math.sin(ang) * D.r];
    var len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    if (len < 8) return;
    ctx.strokeStyle = colors.dim; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    var m = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    if (!view.ls && view.rate > 0) {
      acc += dt * Math.min(12, 1 + 2 * Math.log10(1 + view.rate));
      while (acc >= 1) { acc -= 1; packets.push(0); }
    }
    packets = packets.map(function (p) { return p + dt * 1.2; }).filter(function (p) { return p < 1; });
    ctx.fillStyle = view.sat ? colors.b2 : colors.b1;
    packets.forEach(function (p) { ctx.fillRect(p0[0] + (p1[0] - p0[0]) * p - 1.5, p0[1] + (p1[1] - p0[1]) * p - 1.5, 3, 3); });
    // the trigger sits on the link
    ctx.fillStyle = colors.panel; ctx.strokeStyle = view.trigLimit ? colors.b2 : colors.dim;
    ctx.fillRect(m[0] - 7, m[1] - 7, 14, 14); ctx.strokeRect(m[0] - 6.5, m[1] - 6.5, 13, 13);
    ctx.fillStyle = view.trigLimit ? colors.b2 : colors.fg; ctx.font = '600 9px ' + colors.mono; ctx.textAlign = 'center';
    ctx.fillText('T', m[0], m[1] + 3);
    ctx.font = '10px ' + colors.mono; ctx.fillStyle = colors.dim;
    ctx.fillText('trigger', m[0], m[1] - 12);
    ctx.textAlign = 'left';
    // the trigger menu: how the bandwidth is shared between the streams
    if (view.streams) {
      var bw = 34, bx = m[0] - bw / 2, by = m[1] + 11, cols = [colors.b1, colors.ok, colors.warn, colors.dim];
      view.streams.forEach(function (x, i) {
        var w = bw * x.f;
        ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(bx, by, Math.max(0, w - 1), 3); bx += w;
      });
    }

    // data links: from the storage hall's right wall, one per workstation row of the analysis room; data run along
    // a link whenever a PC on its row is on (someone at it)
    var rr = ana.getBoundingClientRect(), ens = PC.Rooms.entries();
    if (!ens || !ens.length) return;
    var outs = (pt.outYs || [pt.outY]).map(function (y) { return cr.top - o.top + y; });
    var links = ens.map(function (en, i) {
      var a = [C.r, outs[Math.min(outs.length - 1, i)]], b = [rr.left - o.left + en.x, rr.top - o.top + en.y], dx = (b[0] - a[0]) * 0.6;
      return { on: en.on, c: [a, [a[0] + dx, a[1]], [b[0] - dx, b[1]], b] };   // leaves and arrives level, curving in between
    });
    links.forEach(function (l) {
      var c = l.c;
      ctx.strokeStyle = l.on ? colors.ok : colors.dim; ctx.globalAlpha = l.on ? 0.35 : 0.3; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); ctx.bezierCurveTo(c[1][0], c[1][1], c[2][0], c[2][1], c[3][0], c[3][1]); ctx.stroke();
    });
    ctx.globalAlpha = 1;
    var live = links.filter(function (l) { return l.on; });
    if (live.length) {
      dacc += dt * Math.min(12, 2 + 1.5 * live.length + 0.8 * Math.log10(1 + (view.data || 0)));
      while (dacc >= 1) { dacc -= 1; dpk.push({ p: 0, l: links.indexOf(live[Math.floor(Math.random() * live.length)]) }); }
    }
    dpk = dpk.filter(function (k) { k.p += dt * 1.1; return k.p < 1 && links[k.l]; });
    ctx.fillStyle = colors.ok;
    dpk.forEach(function (k) {                                              // bright dots on a faint line, so the movement reads
      var c = links[k.l].c, f = k.p, m = 1 - f;
      var x = m * m * m * c[0][0] + 3 * m * m * f * c[1][0] + 3 * m * f * f * c[2][0] + f * f * f * c[3][0];
      var y = m * m * m * c[0][1] + 3 * m * m * f * c[1][1] + 3 * m * f * f * c[2][1] + f * f * f * c[3][1];
      ctx.fillRect(x - 2, y - 2, 4, 4);
    });
  }

  return {
    init: function (canvas, rootEl, mapEl, detEl, compEl, roomsEl) {
      cv = canvas; ctx = cv.getContext('2d'); root = rootEl; map = mapEl; det = detEl; comp = compEl; ana = roomsEl;
      readColors(); resize();
      requestAnimationFrame(frame);
    },
    readColors: readColors,
    // v: { rate: recorded events/s, data: reconstructed events/s, sat: computing-limited, trigLimit: trigger-limited, ls,
    //      streams: [{sym, f}] | null (the trigger menu's shares) }
    set: function (v) { view = v; }
  };
})();
