/* The trigger, under the detector lens: what the experiment keeps of what the machines deliver.
 *
 *   a status line: the run, events in and kept per second, the dead time;
 *   the event stream: every event the display shows passes as a block in the colour of the trigger stream
 *     that kept it (as in the trigger menu; the lens writes the event in the same colour), a candidate for a
 *     running analysis amber and outlined; the streams' shares of the bandwidth as a thin bar under it;
 *   the run's luminosity, as the experiments plot it: delivered and recorded, integrated since the run began
 *     (collisions ÷ the inelastic cross-section, ≈ 70 mb, in b⁻¹ with SI prefixes).
 *
 * The readout link from the lens drops into it, and leaves from its right side for the computing room.
 * Click it for the trigger menu. Like the other views, its canvas is drawn by PC.loop; set() feeds it.
 */
var PC = PC || {};

PC.TrigView = (function () {
  var cv, ctx, W = 0, H = 0, dpr = 1, colors = {}, view = null, last = 0, onPick = null;
  var tags = [], lastEv = null;
  var SIGMA = 7e-26;                                     // σ_inel ≈ 70 mb, in cm²

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    ['--fg', '--dim', '--faint', '--rule', '--b1', '--b2', '--ok', '--warn', '--screen', '--panel', '--mono', '--display'].forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }
  function resize() {
    var r = cv.getBoundingClientRect();
    if (Math.abs(r.width - W) < 0.5 && Math.abs(r.height - H) < 0.5) return;
    dpr = window.devicePixelRatio || 1; W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  function label(t, x, y, col, align, size, weight, font) {
    ctx.fillStyle = col; ctx.font = (weight || '') + ' ' + (size || 9) + 'px ' + (font || colors.mono); ctx.textAlign = align || 'left'; ctx.fillText(t, x, y); ctx.textAlign = 'left';
  }
  // integrated luminosity from a number of collisions: b⁻¹ with a prefix
  function lumiTxt(n) {
    var inv = n / SIGMA / 1e24;                          // in b⁻¹ (1 b = 10⁻²⁴ cm²)
    var u = [['ab⁻¹', 1e18], ['fb⁻¹', 1e15], ['pb⁻¹', 1e12], ['nb⁻¹', 1e9], ['μb⁻¹', 1e6], ['mb⁻¹', 1e3], ['b⁻¹', 1]];
    for (var i = 0; i < u.length; i++) if (inv >= u[i][1] || i === u.length - 1) {
      var v = inv / u[i][1];
      return (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + ' ' + u[i][0];
    }
  }
  // the stream an event was kept by, from what it contains
  function streamOf(ev) {
    var l = ev.label || '';
    if (/missing/.test(l)) return 'met';
    if (/μ/.test(l)) return 'mu';
    if (/γγ|electron|e⁺e⁻|→ e/.test(l)) return 'eg';
    if (/jet|hadron|t t̄|tt̄/.test(l)) return 'jet';
    return 'mu';
  }
  // the stream that kept it: only the streams the detector has can have
  function streamFor(ev) {
    var sid = streamOf(ev), ss = (view && view.streams) || [];
    if (ss.length && !ss.some(function (x) { return x.id === sid; })) sid = ss[0].id;
    return sid;
  }
  var COLS = ['b1', 'ok', 'warn', 'dim'];               // the trigger menu's colours, by the stream's place in it
  function streamKey(id) {
    var ss = (view && view.streams) || [];
    for (var i = 0; i < ss.length; i++) if (ss[i].id === id) return COLS[i % COLS.length];
    return 'dim';
  }
  function streamCol(id) { return colors[streamKey(id)]; }

  function frame(ts) {
    var dt = Math.max(0, Math.min(0.1, (ts - last) / 1000 || 0)); last = Math.max(last, ts);
    if (!view || !cv || cv.offsetParent === null) return;
    resize();
    if (!W || !H) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    var pad = 8, x0 = pad, x1 = W - pad;

    // 1. the status line
    var st = view.ls ? ['off', 'Long Shutdown · no beam'] : view.dead >= 1 ? ['alarm', 'storage full · nothing written'] : view.off ? [view.fault ? 'alarm' : 'off', view.off] : view.rate > 0 ? ['on', 'taking data'] : ['off', 'cosmics only'];
    var led = st[0] === 'alarm' ? colors.b2 : st[0] === 'on' ? colors.ok : colors.faint;
    label('TRIGGER', x0, 13, colors.dim, 'left', 9.5, '600', colors.display);
    ctx.fillStyle = led; ctx.beginPath(); ctx.arc(x0 + 58, 9.5, 3, 0, 6.2832); ctx.fill();
    label('Run ' + view.run + ' · ' + st[1], x0 + 66, 13, colors.faint, 'left', 9);
    var kept = PC.fmt(view.rate) + ' of ' + PC.fmt(view.input) + ' ev/s kept · dead time ' + Math.round(view.dead * 100) + '%';
    label(kept, x1, 13, view.trigLimit ? colors.b2 : colors.dim, 'right', 9);

    // 2. the event stream: tags flow right, towards the computing room
    var ly = 22, lh = 18;
    ctx.strokeStyle = colors.rule; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, ly + lh + 0.5); ctx.lineTo(x1, ly + lh + 0.5); ctx.stroke();
    var ev = PC.Display.current();
    if (ev && ev !== lastEv) {
      lastEv = ev;
      tags.push({ x: x0, s: streamFor(ev), sig: !!ev.signal, w: 14 });   // a block in its stream's colour; the words are in the lens
    }
    var speed = 26;
    tags.forEach(function (tg) { tg.x += speed * dt; });
    for (var i = tags.length - 1; i > 0; i--) {          // newest at the left: a new tag pushes the older ones on, to the right
      var tg = tags[i], older = tags[i - 1];
      if (older.x < tg.x + tg.w + 4) older.x = tg.x + tg.w + 4;
    }
    tags = tags.filter(function (t) { return t.x < x1 + 4; });
    if (tags.length > 30) tags.splice(0, tags.length - 30);
    ctx.save(); ctx.beginPath(); ctx.rect(x0, ly, x1 - x0, lh); ctx.clip();
    tags.forEach(function (t) {
      var c = t.sig ? colors.warn : streamCol(t.s), fade = Math.min(1, (x1 - t.x) / 40);
      ctx.globalAlpha = Math.max(0, fade);
      ctx.fillStyle = c; ctx.fillRect(t.x, ly + 3, t.w, lh - 6);
      if (t.sig) { ctx.strokeStyle = colors.fg; ctx.lineWidth = 1; ctx.strokeRect(Math.round(t.x) - 0.5, ly + 2.5, t.w + 1, lh - 5); }   // a candidate, outlined
    });
    ctx.restore(); ctx.globalAlpha = 1;
    if (!tags.length) label(view.ls ? 'no events during the shutdown' : 'waiting for events', (x0 + x1) / 2, ly + lh / 2 + 3, colors.faint, 'center', 9);
    // the bandwidth shares, with the streams' names
    var by = ly + lh + 4, bx = x0;
    if (view.streams && view.streams.length) {
      view.streams.forEach(function (x) {
        var w = (x1 - x0) * x.f;
        ctx.fillStyle = streamCol(x.id); ctx.fillRect(bx, by, Math.max(0, w - 2), 3);
        if (w > 30) label(x.sym + ' ' + Math.round(x.f * 100) + '%', bx, by + 12, colors.faint, 'left', 8);
        bx += w;
      });
    }

    // 3. the run's luminosity: delivered (line) and recorded (filled)
    var py0 = by + 20, py1 = H - 12, px0 = x0 + 2, px1 = x1;
    var L = view.lumi;
    if (py1 - py0 > 16 && L && L.pts.length) {
      var pts = L.pts.concat([[view.now - L.t0, L.del, L.rec]]), tmax = Math.max(60, pts[pts.length - 1][0]), vmax = Math.max(1e-9, L.del) * 1.08;
      function X(t) { return px0 + t / tmax * (px1 - px0); }
      function Y(v) { return py1 - v / vmax * (py1 - py0); }
      ctx.strokeStyle = colors.rule; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px0, py0); ctx.lineTo(px0, py1); ctx.lineTo(px1, py1); ctx.stroke();
      ctx.fillStyle = colors.ok; ctx.globalAlpha = 0.22;
      ctx.beginPath(); ctx.moveTo(X(0), py1); pts.forEach(function (p) { ctx.lineTo(X(p[0]), Y(p[2])); }); ctx.lineTo(X(pts[pts.length - 1][0]), py1); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = colors.ok; ctx.lineWidth = 1.4;
      ctx.beginPath(); pts.forEach(function (p, i) { if (i) ctx.lineTo(X(p[0]), Y(p[2])); else ctx.moveTo(X(p[0]), Y(p[2])); }); ctx.stroke();
      ctx.strokeStyle = colors.b1; ctx.lineWidth = 1.4;
      ctx.beginPath(); pts.forEach(function (p, i) { if (i) ctx.lineTo(X(p[0]), Y(p[1])); else ctx.moveTo(X(p[0]), Y(p[1])); }); ctx.stroke();
      var eff = L.del > 0 ? L.rec / L.del : 1;
      label('∫L dt · run ' + L.run, px0 + 4, py0 + 9, colors.dim, 'left', 8.5, '600');
      label('delivered ' + lumiTxt(L.del), px0 + 4, py0 + 20, colors.b1, 'left', 8.5);
      label('recorded ' + lumiTxt(L.rec) + ' · ' + Math.round(eff * 100) + '%', px0 + 4, py0 + 31, colors.ok, 'left', 8.5);
      label(PC.dur(tmax), px1, py1 + 9, colors.faint, 'right', 7.5);
      label('0', px0, py1 + 9, colors.faint, 'left', 7.5);
    }
  }

  return {
    init: function (canvas, pick) {
      cv = canvas; ctx = cv.getContext('2d'); onPick = pick;
      readColors();
      cv.addEventListener('click', function () { if (onPick) onPick(); });
      PC.loop('trigview', frame);
    },
    readColors: readColors,
    // v: { now, run, rate (kept ev/s), input (ev/s into the trigger), dead (0–1), trigLimit, ls, off (text) | null, fault,
    //      streams: [{id, sym, f}], lumi: {run, t0, del, rec, pts: [[t, del, rec]]} }
    set: function (v) { view = v; },
    // the colour of the stream that kept an event, as a CSS colour (the lens writes the event in it)
    streamColor: function (id) { return streamCol(id); },
    colorOf: function (ev) { return ev.signal ? 'var(--warn)' : 'var(--' + streamKey(streamFor(ev)) + ')'; },
    // where the readout link meets it, in page coordinates: in at the top, out at the right
    ports: function () { var r = cv ? cv.getBoundingClientRect() : null; return r && r.width ? r : null; }
  };
})();
