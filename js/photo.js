/* Conference group photos, drawn from a record in the archive (state.confLog).
 *
 * A record keeps a recipe, not an image: the series, year and edition, who of the lab
 * attended (professors, postdocs, students), the results shown, and a seed. The same
 * record always gives the same photo. The backdrop follows the series' venue (the Alps for
 * Moriond, a city for ICHEP, a lecture hall, arched windows, a glass front); a banner
 * names the conference; the lab stands in tiered rows as shadow figures, professors in front,
 * students at the back, guests from other labs in grey at the edges. If a result first shown there became a
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

  /* ───── people: shadow figures ───── */
  // a person's look, drawn once from the photo's rng so the same record gives the same crowd
  function person(r, kind, back) {
    var p = r();
    return {
      tall: (kind === 'grad' ? 0.9 : 0.94) + r() * 0.12,
      build: 0.85 + r() * 0.35,
      hair: ['short', 'short', 'long', 'bun', 'curly', 'bald'][Math.floor(r() * 6)],
      skirt: r() < 0.28,
      jacket: kind === 'prof' || r() < 0.3,
      pose: back && p < 0.18 ? 'wave' : p < 0.3 ? 'hip' : p < 0.4 ? 'behind' : 'sides',   // only the back rows wave over the others
      lean: (r() - 0.5) * 0.05
    };
  }
  // a silhouette standing at (x, y) = its feet, h px tall. Drawn twice: first fattened in the
  // paper colour, which cuts it out of whoever stands behind, then filled in its own colour
  function silhouette(ctx, x, y, h, lk, col, edge, ow) {
    var b = lk.build, top = y - h, sw = 0.118 * h * b, ww = 0.086 * h * b, hw = 0.096 * h * b;
    var ys = y - 0.815 * h, yw = y - 0.56 * h, yh = y - 0.47 * h, aw = 0.046 * h * Math.sqrt(b);
    var hx = x + lk.lean * h, hy = top + 0.068 * h, hrx = (lk.hair === 'curly' ? 0.062 : 0.05) * h, hry = (lk.hair === 'curly' ? 0.074 : 0.066) * h;
    [[edge, ow], [col, 0]].forEach(function (pass) {
      var c = pass[0], o = pass[1];
      ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      function blob() { ctx.fill(); if (o) { ctx.lineWidth = o; ctx.stroke(); } }
      function limb(pts, w) {
        ctx.lineWidth = w + o; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
        for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
        ctx.stroke();
      }
      // legs and feet
      if (lk.skirt) {
        ctx.beginPath(); ctx.moveTo(x - ww, yw); ctx.lineTo(x - hw * 1.25, y - 0.27 * h); ctx.lineTo(x + hw * 1.25, y - 0.27 * h); ctx.lineTo(x + ww, yw); ctx.closePath(); blob();
        limb([x - 0.04 * h, y - 0.28 * h, x - 0.045 * h, y - 0.02 * h], 0.032 * h);
        limb([x + 0.04 * h, y - 0.28 * h, x + 0.045 * h, y - 0.02 * h], 0.032 * h);
      } else {
        ctx.beginPath();
        ctx.moveTo(x - ww, yw); ctx.lineTo(x - hw, yh);                     // from the waist, under the torso, so no seam shows at the hips
        ctx.lineTo(x - 0.08 * h * b, y - 0.02 * h); ctx.lineTo(x - 0.022 * h, y - 0.02 * h); ctx.lineTo(x, yh + 0.08 * h);
        ctx.lineTo(x + 0.022 * h, y - 0.02 * h); ctx.lineTo(x + 0.08 * h * b, y - 0.02 * h); ctx.lineTo(x + hw, yh); ctx.lineTo(x + ww, yw); ctx.closePath(); blob();
      }
      [-1, 1].forEach(function (sd) { ctx.beginPath(); ctx.ellipse(x + sd * 0.058 * h, y - 0.014 * h, 0.04 * h, 0.016 * h, 0, 0, 6.2832); blob(); });
      // arms, behind the body or out to the side
      var shL = [x - sw + aw * 0.5, ys + 0.035 * h], shR = [x + sw - aw * 0.5, ys + 0.035 * h];
      if (lk.pose === 'behind') { limb([shL[0], shL[1], x - hw * 0.9, yh - 0.04 * h], aw); limb([shR[0], shR[1], x + hw * 0.9, yh - 0.04 * h], aw); }
      else {
        limb([shL[0], shL[1], x - sw - 0.008 * h, y - 0.62 * h, x - hw - 0.03 * h, y - 0.44 * h], aw);
        if (lk.pose === 'hip') limb([shR[0], shR[1], x + sw + 0.07 * h, y - 0.62 * h, x + hw, yw + 0.02 * h], aw);
        else if (lk.pose === 'wave') limb([shR[0], shR[1], x + sw + 0.09 * h, ys - 0.06 * h, x + sw + 0.07 * h, top - 0.02 * h], aw);
        else limb([shR[0], shR[1], x + sw + 0.008 * h, y - 0.62 * h, x + hw + 0.03 * h, y - 0.44 * h], aw);
        var hands = lk.pose === 'wave' ? [[x - hw - 0.03 * h, y - 0.44 * h], [x + sw + 0.07 * h, top - 0.03 * h]]
          : lk.pose === 'hip' ? [[x - hw - 0.03 * h, y - 0.44 * h]] : [[x - hw - 0.03 * h, y - 0.44 * h], [x + hw + 0.03 * h, y - 0.44 * h]];
        hands.forEach(function (q) { ctx.beginPath(); ctx.arc(q[0], q[1], aw * 0.62, 0, 6.2832); blob(); });
      }
      // the torso, shoulders rounded; a jacket flares a little at the hem
      var hem = lk.jacket ? 1.12 : 1;
      ctx.beginPath();
      ctx.moveTo(x - 0.03 * h, ys - 0.012 * h);
      ctx.quadraticCurveTo(x - sw, ys - 0.006 * h, x - sw, ys + 0.05 * h);
      ctx.lineTo(x - ww, yw); ctx.lineTo(x - hw * hem, yh + (lk.jacket ? 0.02 * h : 0));
      ctx.lineTo(x + hw * hem, yh + (lk.jacket ? 0.02 * h : 0)); ctx.lineTo(x + ww, yw);
      ctx.lineTo(x + sw, ys + 0.05 * h); ctx.quadraticCurveTo(x + sw, ys - 0.006 * h, x + 0.03 * h, ys - 0.012 * h);
      ctx.closePath(); blob();
      // neck, head, hair
      ctx.beginPath(); ctx.rect(hx - 0.022 * h, hy + hry * 0.6, 0.044 * h, ys - hy - hry * 0.6 + 0.004 * h); blob();
      ctx.beginPath(); ctx.ellipse(hx, hy, hrx, hry, 0, 0, 6.2832); blob();
      if (lk.hair === 'long') { ctx.beginPath(); ctx.moveTo(hx - hrx * 1.08, hy); ctx.lineTo(hx - hrx * 1.15, ys + 0.03 * h); ctx.lineTo(hx + hrx * 1.15, ys + 0.03 * h); ctx.lineTo(hx + hrx * 1.08, hy); ctx.closePath(); blob(); }
      if (lk.hair === 'bun') { ctx.beginPath(); ctx.arc(hx + hrx * 0.2, hy - hry * 1.05, hrx * 0.5, 0, 6.2832); blob(); }
      if (lk.hair === 'short') { ctx.beginPath(); ctx.ellipse(hx, hy - hry * 0.18, hrx * 1.08, hry * 0.9, 0, 3.3, 6.12); blob(); }
    });
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

    // who came: the lab (about three quarters of it; the rest kept the lab running), guests from other labs
    var st = rec.staff || {};
    var nP = Math.min(4, st.professor || 0), nD = Math.min(9, Math.round((st.postdoc || 0) * 0.75)), nG = Math.min(16, Math.round((st.grad || 0) * 0.75));
    if (nP + nD + nG === 0) nG = 1;                                          // someone always went
    // front, middle, back: professors first, then postdocs, then students, filling each row in turn
    var lab = [], rows = [[], [], []], cap = [6, 9, 99];
    for (var i = 0; i < nP; i++) lab.push('prof');
    for (var j = 0; j < nD; j++) lab.push('postdoc');
    for (var k = 0; k < nG; k++) lab.push('grad');
    lab.forEach(function (kind) { for (var ri = 0; ri < 3; ri++) if (rows[ri].length < cap[ri] || ri === 2) { rows[ri].push(kind); return; } });
    rows = rows.filter(function (q) { return q.length; });
    // guests from other labs squeeze in at both ends of the rows, most of them at the back
    var guests = 6 + Math.floor(r() * 6);
    for (var gi = 0; gi < guests; gi++) {
      var gr = rows[Math.max(0, rows.length - 1 - (gi % 3 === 2 ? Math.min(1, rows.length - 1) : 0))];
      if (gi % 2) gr.push('guest'); else gr.unshift('guest');
    }
    // one spacing for every row, shoulder to shoulder; the people as tall as that allows
    var widest = Math.max.apply(null, rows.map(function (q) { return q.length; }));
    var sp = W * 0.94 / Math.max(1, widest), ht = Math.max(H * 0.2, Math.min(H * 0.4, sp / 0.24));
    sp = Math.min(sp, ht * 0.27);
    var yF = H * 0.985, ow = thumb ? 1 : 1.6;
    // a soft shadow on the floor under the front row
    ctx.fillStyle = colors.dim; ctx.globalAlpha = 0.18;
    ctx.beginPath(); ctx.ellipse(W / 2, yF - ht * 0.01, Math.min(W * 0.48, rows[0].length * sp * 0.6 + ht * 0.2), ht * 0.035, 0, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;
    // the back row first, standing on the step behind, so the rows in front stand over it
    rows.map(function (row, ri) { return { row: row, ri: ri }; }).reverse().forEach(function (o) {
      var row = o.row, ri = o.ri, n = row.length, hR = ht * (1 - ri * 0.04);
      var y = yF - ri * ht * 0.17, x0 = W / 2 - (n - 1) * sp / 2 + (ri % 2 ? sp * 0.5 : 0);
      for (var q = 0; q < n; q++) {
        var kind = row[q], lk = person(r, kind, ri > 0), x = x0 + q * sp + (r() - 0.5) * sp * 0.18;
        var col = kind === 'prof' ? colors.b1 : kind === 'guest' ? colors.dim : colors.fg;
        silhouette(ctx, x, y, hR * lk.tall * (kind === 'prof' ? 1.03 : 1), lk, col, colors.screen, ow);
      }
    });
    // the print: a white border
    ctx.strokeStyle = colors.screen; ctx.lineWidth = thumb ? 3 : 6; ctx.strokeRect(0, 0, W, H);
    ctx.strokeStyle = colors.rule; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }

  return { draw: draw };
})();
