/* Conference group photos, drawn from a record in the archive (state.confLog).
 *
 * A record keeps a recipe, not an image: the series, year and edition, who of the lab
 * attended (professors, postdocs, students), the results shown, and a seed. The same
 * record always gives the same photo. The backdrop follows the series' venue (the Alps for
 * Moriond, a city for ICHEP, a lecture hall, arched windows, a glass front); a banner
 * names the conference; the lab stands in rows, professors in front, students at the back,
 * guests from other labs faded at the edges. If a result first shown there became a
 * discovery, its slide hangs behind the group.
 */
var PC = PC || {};

PC.Photo = (function () {
  var colors = {};
  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    ['--fg', '--dim', '--faint', '--rule', '--b1', '--b2', '--ok', '--warn', '--screen', '--panel', '--mono'].forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }
  function rng(seed) {                                                       // mulberry32
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function label(ctx, t, x, y, col, align, size, weight) {
    ctx.fillStyle = col; ctx.font = (weight || '') + ' ' + size + 'px ' + colors.mono; ctx.textAlign = align || 'left'; ctx.fillText(t, x, y); ctx.textAlign = 'left';
  }

  /* ───── backdrops ───── */
  function backdrop(ctx, venue, W, H, r) {
    var hz = H * 0.62;                                                       // the horizon, or the floor line indoors
    ctx.fillStyle = colors.b1; ctx.globalAlpha = 0.07; ctx.fillRect(0, 0, W, hz); ctx.globalAlpha = 1;
    ctx.fillStyle = colors.rule; ctx.globalAlpha = 0.45; ctx.fillRect(0, hz, W, H - hz); ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.dim; ctx.fillStyle = colors.screen; ctx.lineWidth = 1;
    if (venue === 'mountains') {                                             // peaks with snow
      for (var i = 0; i < 4; i++) {
        var cx = W * (0.1 + 0.28 * i + 0.08 * r()), h = H * (0.32 + 0.2 * r()), w = W * (0.22 + 0.1 * r());
        ctx.fillStyle = colors.dim; ctx.globalAlpha = 0.28;
        ctx.beginPath(); ctx.moveTo(cx - w / 2, hz); ctx.lineTo(cx, hz - h); ctx.lineTo(cx + w / 2, hz); ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = colors.screen;
        ctx.beginPath(); ctx.moveTo(cx - w * 0.12, hz - h * 0.76); ctx.lineTo(cx, hz - h); ctx.lineTo(cx + w * 0.12, hz - h * 0.76); ctx.fill();
      }
    } else if (venue === 'city') {                                           // a skyline with lit windows
      for (var x = 0; x < W; ) {
        var bw = W * (0.06 + 0.07 * r()), bh = H * (0.15 + 0.35 * r());
        ctx.fillStyle = colors.dim; ctx.globalAlpha = 0.25; ctx.fillRect(x, hz - bh, bw - 2, bh); ctx.globalAlpha = 1;
        ctx.fillStyle = colors.warn; ctx.globalAlpha = 0.5;
        for (var wy = hz - bh + 4; wy < hz - 4; wy += 6) for (var wx = x + 3; wx < x + bw - 5; wx += 5) if (r() < 0.35) ctx.fillRect(wx, wy, 2, 2);
        ctx.globalAlpha = 1; x += bw;
      }
    } else if (venue === 'hall') {                                           // wood-panelled lecture hall
      ctx.fillStyle = colors.warn; ctx.globalAlpha = 0.1; ctx.fillRect(0, 0, W, hz); ctx.globalAlpha = 1;
      ctx.strokeStyle = colors.warn; ctx.globalAlpha = 0.25;
      for (var p = W * 0.05; p < W; p += W * 0.09) { ctx.beginPath(); ctx.moveTo(p, H * 0.05); ctx.lineTo(p, hz); ctx.stroke(); }
      ctx.globalAlpha = 1;
    } else if (venue === 'arches') {                                         // a row of tall arched windows
      for (var a = 0; a < 5; a++) {
        var ax = W * (0.08 + a * 0.19), aw = W * 0.1, at = H * 0.1, ab = hz - H * 0.06;
        ctx.fillStyle = colors.b1; ctx.globalAlpha = 0.12;
        ctx.beginPath(); ctx.moveTo(ax, ab); ctx.lineTo(ax, at + aw / 2); ctx.arc(ax + aw / 2, at + aw / 2, aw / 2, Math.PI, 0); ctx.lineTo(ax + aw, ab); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 0.5; ctx.strokeStyle = colors.dim; ctx.stroke(); ctx.globalAlpha = 1;
      }
    } else {                                                                 // glass: a modern facade
      ctx.strokeStyle = colors.b1; ctx.globalAlpha = 0.25;
      for (var gx = 0; gx <= W; gx += W / 12) { ctx.beginPath(); ctx.moveTo(gx, H * 0.04); ctx.lineTo(gx, hz); ctx.stroke(); }
      for (var gy = H * 0.04; gy <= hz; gy += H / 9) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    return hz;
  }

  // rec: an archive record; opts: { thumb, fates: [fate per rec.shown] }
  function draw(cv, rec, opts) {
    opts = opts || {};
    readColors();
    var b = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, W = b.width, H = b.height;
    if (!W || !H) return;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    var r = rng(rec.seed || 1), ser = PC.CONF_SERIES.filter(function (c) { return c.name === rec.name; })[0] || {}, thumb = !!opts.thumb;
    ctx.fillStyle = colors.screen; ctx.fillRect(0, 0, W, H);
    var hz = backdrop(ctx, ser.venue, W, H, r);

    // the banner
    var bh = thumb ? H * 0.16 : H * 0.11, bw = W * (thumb ? 0.86 : 0.62), bx = (W - bw) / 2, by = H * 0.06;
    ctx.fillStyle = colors.panel; ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = colors.b1; ctx.lineWidth = 1; ctx.strokeRect(Math.round(bx) + 0.5, Math.round(by) + 0.5, Math.round(bw), Math.round(bh));
    var fs = Math.max(7, Math.round(bh * 0.55));
    label(ctx, (rec.name + ' ' + rec.year).toUpperCase(), W / 2, by + bh * 0.7, colors.b1, 'center', fs, '600');

    // a discovery first shown here: its slide behind the group
    var hot = (rec.shown || []).filter(function (x, i) { return (opts.fates || [])[i] === 'discovery'; })[0];
    if (hot && !thumb) {
      var it = PC.DISCMAP[hot.id] || PC.EXCMAP[hot.id], sw = W * 0.3, sh = H * 0.2, sx = W * 0.66, sy = by + bh + H * 0.04;
      ctx.fillStyle = colors.panel; ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeStyle = colors.ok; ctx.strokeRect(Math.round(sx) + 0.5, Math.round(sy) + 0.5, Math.round(sw), Math.round(sh));
      label(ctx, it.particle.split(/ → | = |, /)[0], sx + sw / 2, sy + sh * 0.48, colors.ok, 'center', Math.round(sh * 0.3), '600');
      label(ctx, 'first shown here', sx + sw / 2, sy + sh * 0.82, colors.dim, 'center', Math.max(8, Math.round(sh * 0.14)));
    }

    // who came: the lab (about two thirds of it; the rest kept the lab running), guests from other labs
    var st = rec.staff || {};
    var nP = Math.min(3, st.professor || 0), nD = Math.min(6, Math.round((st.postdoc || 0) * 0.65)), nG = Math.min(10, Math.round((st.grad || 0) * 0.65));
    if (nP + nD + nG === 0) nG = 1;                                          // someone always went
    var rows = [[], [], []];                                                 // front, middle, back
    for (var i = 0; i < nP; i++) rows[0].push('prof');
    for (var j = 0; j < nD; j++) rows[nP < 3 && j < 2 ? 0 : 1].push('postdoc');
    for (var k = 0; k < nG; k++) rows[k < 4 && rows[1].length < 5 ? 1 : 2].push('grad');
    rows = rows.filter(function (q) { return q.length; });
    var fig = H / (thumb ? 11 : 13), guests = 2 + Math.floor(r() * 4);
    // the back row first, so the rows in front stand over it
    rows.map(function (row, ri) { return { row: row, ri: ri }; }).reverse().forEach(function (o) {
      var row = o.row, ri = o.ri;
      var y = H * 0.9 - ri * fig * 1.35, n = row.length + (ri === rows.length - 1 ? guests : 0);
      var sp = Math.min(fig * 2.4, W * 0.9 / Math.max(1, n)), x0 = W / 2 - (n - 1) * sp / 2 + (ri % 2 ? sp * 0.4 : 0);
      for (var q = 0; q < n; q++) {
        var x = x0 + q * sp + (r() - 0.5) * sp * 0.2, g = q >= row.length;   // the guests stand at the end of the back row
        var kind = g ? 'guest' : row[q];
        var col = kind === 'prof' ? colors.b1 : kind === 'guest' ? colors.dim : colors.fg;
        ctx.globalAlpha = g ? 0.4 : 1;
        PC.People.figure(ctx, x, y, fig / 7 * (kind === 'prof' ? 1.08 : 1), col, 0, r() < 0.22);   // a few wave
        ctx.globalAlpha = 1;
      }
    });
    // the print: a white border
    ctx.strokeStyle = colors.screen; ctx.lineWidth = thumb ? 3 : 6; ctx.strokeRect(0, 0, W, H);
    ctx.strokeStyle = colors.rule; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }

  return { draw: draw };
})();
