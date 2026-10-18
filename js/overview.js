/* Overview links, drawn over the four panels:
 *   zoom lines from the experiment's spot on the complex map to the detector lens;
 *   the readout link from the detector down into the trigger compartment under it, and from there one link per
 *   trigger stream, in its colour, curving to the computing room's left wall, with packets at the rate it records;
 *   the data link from the storage (the computing room's right wall) to the analysis room, carrying reconstructed events.
 */
var PC = PC || {};

PC.Overview = (function () {
  var cv, ctx, root, map, det, comp, ana, W = 0, H = 0, dpr = 1, colors = {}, view = null, packets = [], acc = 0, last = 0;
  var dpk = [], dacc = 0, tacc = {};                  // tacc: packet accumulators, one per trigger stream's link

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

    // readout links: the detector drops into the trigger compartment under it (trigview.js); from its right side one
    // link per trigger stream, in the stream's colour, curves to the computing room's left wall, leaving and arriving
    // level, with packets at the rate that stream records
    var tb = PC.TrigView.ports();
    if (tb) {
      var top = tb.top - o.top, a0 = [D.x, D.y + D.r], a1 = [D.x, top];
      ctx.strokeStyle = colors.dim; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.stroke();
      var ss = view.streams && view.streams.length ? view.streams : [{ id: 'mu', rec: view.rate }], n = ss.length;
      var span = Math.min(tb.height - 40, 16 * (n - 1)), inSpan = Math.min(pt.inSpan || 60, 22 * (n - 1));
      var tlinks = ss.map(function (x, i) {
        var f = n > 1 ? i / (n - 1) : 0.5;
        var b0 = [tb.right - o.left, top + 31 + span * (n > 1 ? f : 0)], b3 = [C.l, C.y - inSpan / 2 + inSpan * f], dx = (b3[0] - b0[0]) * 0.6;
        return { id: x.id, rec: x.rec || 0, col: PC.TrigView.streamColor(x.id) || colors.dim, c: [b0, [b0[0] + dx, b0[1]], [b3[0] - dx, b3[1]], b3] };
      });
      tlinks.forEach(function (l) {
        var c = l.c;
        ctx.strokeStyle = l.col; ctx.globalAlpha = l.rec > 0 ? 0.55 : 0.25; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); ctx.bezierCurveTo(c[1][0], c[1][1], c[2][0], c[2][1], c[3][0], c[3][1]); ctx.stroke();
      });
      ctx.globalAlpha = 1;
      // the drop into the trigger carries everything the detector reads out
      if (!view.ls && view.rate > 0) {
        acc += dt * Math.min(12, 1 + 2 * Math.log10(1 + view.rate));
        while (acc >= 1) { acc -= 1; packets.push({ p: 0, seg: -1 }); }
      }
      tlinks.forEach(function (l, i) {
        if (view.ls || l.rec <= 0) return;
        l.acc = (tacc[l.id] || 0) + dt * Math.min(8, 0.6 + 1.6 * Math.log10(1 + l.rec));
        while (l.acc >= 1) { l.acc -= 1; packets.push({ p: 0, seg: i, id: l.id }); }
        tacc[l.id] = l.acc;
      });
      packets = packets.filter(function (k) {
        k.p += dt * (k.seg < 0 ? 2.4 : 0.9);
        return k.p < 1 && (k.seg < 0 || (tlinks[k.seg] && tlinks[k.seg].id === k.id));
      });
      packets.forEach(function (k) {
        var x, y, f = k.p, m = 1 - f;
        if (k.seg < 0) { x = a0[0]; y = a0[1] + (a1[1] - a0[1]) * f; ctx.fillStyle = view.sat ? colors.b2 : colors.b1; }
        else {
          var bz = tlinks[k.seg].c;
          x = m * m * m * bz[0][0] + 3 * m * m * f * bz[1][0] + 3 * m * f * f * bz[2][0] + f * f * f * bz[3][0];
          y = m * m * m * bz[0][1] + 3 * m * m * f * bz[1][1] + 3 * m * f * f * bz[2][1] + f * f * f * bz[3][1];
          ctx.fillStyle = view.sat ? colors.b2 : tlinks[k.seg].col;
        }
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
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
      PC.loop('overview', frame);
    },
    readColors: readColors,
    // v: { rate: recorded events/s, data: reconstructed events/s, sat: computing-limited, trigLimit: trigger-limited, ls,
    //      streams: [{id, sym, f, rec (events/s it records)}] (the trigger menu) }
    set: function (v) { view = v; }
  };
})();
