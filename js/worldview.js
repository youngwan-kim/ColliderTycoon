/* The council strip on the overview, under the accelerator control room: the world the lab answers to, at a
 * glance. A small hemicycle of the assembly (a dot a seat), the budget the member states and the economy leave
 * the lab, who pays (a thin bar of contributions), the bill on the floor with its countdown and expected vote,
 * and where the lab stands with the auditors. Click it for the World window.
 * Drawn by PC.loop; set() feeds it from ui.js.
 */
var PC = PC || {};

PC.WorldView = (function () {
  var cv, ctx, W = 0, H = 0, dpr = 1, colors = {}, view = null, onPick = null;

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    ['--fg', '--dim', '--faint', '--rule', '--b1', '--b2', '--ok', '--warn', '--screen', '--mono', '--display'].forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
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
  function fit(t, w, size, weight) {
    ctx.font = (weight || '') + ' ' + size + 'px ' + colors.mono;
    if (ctx.measureText(t).width <= w) return t;
    while (t.length > 1 && ctx.measureText(t + '…').width > w) t = t.slice(0, -1);
    return t.trim() + '…';
  }
  function dur(x) { var m = Math.floor(x / 60), s = Math.floor(x % 60); return m + ':' + (s < 10 ? '0' : '') + s; }

  // the hemicycle: rows of dots, the groups left to right
  function hemicycle(cx, cy, R, seats, n) {
    var G = PC.GROUPS, rows = 4, pos = [], radii = [], tot = 0;
    for (var r = 0; r < rows; r++) { radii.push(R * (0.45 + 0.55 * r / (rows - 1))); tot += radii[r]; }
    radii.forEach(function (rr, r) {
      var k = r === rows - 1 ? n - pos.length : Math.round(n * rr / tot);
      for (var i = 0; i < k; i++) { var a = Math.PI - Math.PI * (k === 1 ? 0.5 : i / (k - 1)); pos.push({ a: a, x: cx + Math.cos(a) * rr, y: cy - Math.sin(a) * rr }); }
    });
    pos.sort(function (p, q) { return q.a - p.a; });
    var dot = Math.max(1.4, R / 20);
    if (!seats) {                                         // no assembly yet: empty seats
      ctx.strokeStyle = colors.rule;
      pos.forEach(function (q) { ctx.beginPath(); ctx.arc(q.x, q.y, dot, 0, 6.2832); ctx.stroke(); });
      return;
    }
    var raw = G.map(function (g) { return seats[g.id] * n; }), cnt = raw.map(Math.floor), left = n - cnt.reduce(function (a, b) { return a + b; }, 0);
    raw.map(function (v, i) { return [v - cnt[i], i]; }).sort(function (a, b) { return b[0] - a[0]; }).slice(0, left).forEach(function (x) { cnt[x[1]]++; });
    var j = 0;
    G.forEach(function (g, gi) { for (var i = 0; i < cnt[gi]; i++, j++) { var q = pos[j]; if (!q) continue; ctx.fillStyle = g.col; ctx.beginPath(); ctx.arc(q.x, q.y, dot, 0, 6.2832); ctx.fill(); } });
  }

  function frame(ts) {
    if (!view || !cv || cv.offsetParent === null) return;
    resize();
    if (!W || !H) return;
    var t = ts / 1000, v = view, k = Math.min(1, H / 104), Y = function (y) { return Math.round(y * k); };   // a short strip packs its lines closer
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    var alarm = v.audit && (v.audit.stage === 'audit' || v.audit.stage === 'frozen' || v.audit.stage === 'vote');
    ctx.fillStyle = colors.screen; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = alarm && Math.sin(t * 4) > 0 ? colors.b2 : colors.dim; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    label('COUNCIL · PARLIAMENT', 6, 11, colors.faint, 'left', 8);
    label('World ›', W - 6, 11, colors.faint, 'right', 8);

    // the hemicycle, at the left
    var R = Math.min(H - 40, 64), hx = 10 + R, hy = 18 + R;
    hemicycle(hx, hy, R, v.seats, 60);
    label(v.chamber, hx, Math.min(H - 6, hy + 13), colors.dim, 'center', 7.5);

    // the budget and who pays
    var x0 = hx + R + 16, cw = Math.max(80, (W - x0) * 0.42);
    label('BUDGET', x0, Y(30), colors.dim, 'left', 7.5, '600', colors.display);
    label('×' + v.budget.toFixed(2), x0, Y(47), v.budget < 0.95 ? colors.b2 : v.budget > 1.05 ? colors.ok : colors.fg, 'left', 15, '500');
    label(fit(v.members, cw, 8), x0, Y(59), colors.dim, 'left', 8);
    var bx = x0, by = Y(64), bw = cw;
    ctx.fillStyle = colors.rule; ctx.fillRect(bx, by, bw, 4);
    (v.shares || []).forEach(function (f, i) {
      var w = f * bw;
      ctx.fillStyle = colors.b1; ctx.globalAlpha = Math.max(0.25, 1 - i * 0.07); ctx.fillRect(bx, by, Math.max(0.5, w - 1), 4); bx += w;
    });
    ctx.globalAlpha = 1;
    label(fit(v.mood, cw, 8), x0, by + Y(15), v.crisis ? colors.warn : colors.faint, 'left', 8);

    // the bill on the floor, and the auditors, at the right
    var x1 = x0 + cw + 12, rw = W - x1 - 8;
    if (rw > 60) {
      label('BILL', x1, Y(30), colors.dim, 'left', 7.5, '600', colors.display);
      if (v.bill) {
        var b = v.bill;
        label(fit(b.name, rw, 8.5), x1, Y(42), colors.fg, 'left', 8.5);
        label(fit((b.want > 0 ? 'lab: pass' : 'lab: reject') + ' · vote ' + dur(b.left), rw, 8), x1, Y(53), b.left < 60 && Math.sin(t * 5) > 0 ? colors.warn : colors.dim, 'left', 8);
        ctx.fillStyle = colors.b2; ctx.globalAlpha = 0.8; ctx.fillRect(x1, Y(57), rw, 4);
        ctx.fillStyle = colors.ok; ctx.fillRect(x1, Y(57), rw * b.f, 4); ctx.globalAlpha = 1;
        ctx.fillStyle = colors.fg; ctx.fillRect(x1 + rw / 2 - 0.5, Y(57) - 2, 1, 8);
      } else label(fit(v.seats ? 'none before the assembly' : 'the assembly sits from 1952', rw, 8), x1, Y(42), colors.faint, 'left', 8);
      var a = v.audit, ac = !a || a.stage === 'sound' ? colors.ok : a.stage === 'watch' ? colors.warn : colors.b2;
      label('AUDIT', x1, Y(76), colors.dim, 'left', 7.5, '600', colors.display);
      ctx.fillStyle = ac; ctx.beginPath(); ctx.arc(x1 + 3, Y(88) - 3, 3, 0, 6.2832); ctx.fill();
      label(fit(a ? a.text : 'audits from 1960', rw - 10, 8), x1 + 10, Y(88), a && a.stage !== 'sound' ? ac : colors.dim, 'left', 8);
    }
  }

  return {
    init: function (canvas, pick) {
      cv = canvas; ctx = cv.getContext('2d'); onPick = pick;
      readColors();
      cv.addEventListener('click', function () { if (onPick) onPick(); });
      PC.loop('worldview', frame);
    },
    readColors: readColors,
    // v: { budget, members (text), shares: [f], mood, crisis, seats | null, chamber, bill: {name, left (s), f, want} | null,
    //      audit: {stage, text} | null }
    set: function (v) { view = v; }
  };
})();
