/* Analysis plot: data points with √N error bars, background and signal+background curves,
 * drawn in the style of an experiment's public results. */
var PC = PC || {};

PC.Plot = (function () {
  var cv, ctx, W = 0, H = 0, dpr = 1, colors = {}, lastArgs = null;

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    ['--fg', '--dim', '--faint', '--rule', '--b1', '--b2', '--warn', '--mono'].forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }
  function resize() {
    var r = cv.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1; W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (lastArgs) draw(lastArgs[0], lastArgs[1]);   // resizing clears the canvas
  }
  function text(t, x, y, col, align, size) {
    ctx.fillStyle = col; ctx.font = (size || 10) + 'px ' + colors.mono; ctx.textAlign = align || 'left'; ctx.fillText(t, x, y); ctx.textAlign = 'left';
  }
  function niceTicks(lo, hi, n) {
    var span = hi - lo, step = Math.pow(10, Math.floor(Math.log10(span / n)));
    [1, 2, 5, 10].some(function (m) { if (span / (step * m) <= n) { step *= m; return true; } return false; });
    var out = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  }

  // h: histogram from PC.Physics.histogram; meta: { title, sub, sigma, done, logy }
  function draw(h, meta) {
    lastArgs = [h, meta];
    if (!cv || W === 0) return;
    ctx.clearRect(0, 0, W, H);
    var m = { l: 46, r: 12, t: 30, b: 34 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var logy = h.log, ymax = 0, ymin = Infinity;
    h.bins.forEach(function (b) { ymax = Math.max(ymax, b.n + Math.sqrt(b.n), b.mu); if (b.n > 0) ymin = Math.min(ymin, b.n); });
    if (ymax <= 0) ymax = 10;
    var y0 = logy ? Math.max(0.5, Math.min(ymin, 1) * 0.5) : 0, y1 = logy ? ymax * 3 : ymax * 1.25;
    function X(v) { return m.l + (h.log ? (Math.log(v) - Math.log(h.lo)) / (Math.log(h.hi) - Math.log(h.lo)) : (v - h.lo) / (h.hi - h.lo)) * pw; }
    function Y(v) { return m.t + ph - (logy ? (Math.log(Math.max(v, y0)) - Math.log(y0)) / (Math.log(y1) - Math.log(y0)) : (v - y0) / (y1 - y0)) * ph; }

    // frame and ticks
    ctx.strokeStyle = colors.dim; ctx.lineWidth = 1;
    ctx.strokeRect(m.l + 0.5, m.t + 0.5, pw, ph);
    var xt = h.log ? [0.3, 1, 3, 10, 30, 100, 300, 1000].filter(function (v) { return v >= h.lo && v <= h.hi; }) : niceTicks(h.lo, h.hi, 6);
    xt.forEach(function (v) {
      var x = X(v); ctx.beginPath(); ctx.moveTo(x, m.t + ph); ctx.lineTo(x, m.t + ph - 5); ctx.stroke();
      text(String(v), x, m.t + ph + 13, colors.dim, 'center');
    });
    var yt = logy ? [] : niceTicks(0, y1, 4);
    if (logy) for (var e = Math.ceil(Math.log10(y0)); e <= Math.log10(y1); e++) yt.push(Math.pow(10, e));
    yt.forEach(function (v) {
      var y = Y(v); ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + 5, y); ctx.stroke();
      text(logy ? (v >= 1000 ? '10' + sup(Math.round(Math.log10(v))) : String(v)) : PC.fmt(v), m.l - 5, y + 3, colors.dim, 'right');
    });
    text(h.xlabel, m.l + pw, H - 6, colors.dim, 'right');
    ctx.save(); ctx.translate(11, m.t); ctx.rotate(-Math.PI / 2); text(h.ylabel, 0, 0, colors.dim, 'right'); ctx.restore();

    ctx.save();
    ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph); ctx.clip();
    // background-only and total expectation
    if (h.fit && meta.sigma >= 2) {
      if (h.bins[0].bg !== undefined) {
        ctx.strokeStyle = colors.b1; ctx.setLineDash([5, 4]); ctx.beginPath();
        h.bins.forEach(function (b, i) { ctx[i ? 'lineTo' : 'moveTo'](X(b.x), Y(b.bg)); }); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.strokeStyle = colors.b2; ctx.lineWidth = 1.5; ctx.beginPath();
      h.bins.forEach(function (b, i) { ctx[i ? 'lineTo' : 'moveTo'](X(b.x), Y(b.mu)); }); ctx.stroke();
    }
    // data points
    ctx.strokeStyle = colors.fg; ctx.fillStyle = colors.fg; ctx.lineWidth = 1;
    h.bins.forEach(function (b) {
      if (b.n <= 0 && logy) return;
      var x = X(b.x), y = Y(b.n), e = Math.sqrt(Math.max(b.n, 1));
      ctx.beginPath(); ctx.moveTo(x, Y(b.n + e)); ctx.lineTo(x, Y(Math.max(logy ? y0 : 0, b.n - e))); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 6.2832); ctx.fill();
    });
    // dimuon resonance labels
    if (h.peaks) h.peaks.forEach(function (p) {
      if (p.n === 'ρ') return;
      var b = h.bins.reduce(function (best, q) { return Math.abs(q.x - p.m) < Math.abs(best.x - p.m) ? q : best; }, h.bins[0]);
      text(p.n === 'ω' ? 'ρ,ω' : p.n, X(p.m), Y(b.n) - 8, colors.dim, 'center');
    });
    ctx.restore();

    // header
    text(meta.title, m.l, 13, colors.fg, 'left', 11);
    text(meta.sub, m.l, 25, colors.dim);
    if (meta.sigma !== undefined) {
      var col = meta.done ? colors.fg : meta.sigma >= 3 ? colors.warn : colors.dim;
      text(meta.done ? 'observed · 5σ' : meta.sigma.toFixed(1) + 'σ', W - m.r, 13, col, 'right', 11);
      if (h.fit && meta.sigma >= 2) text('— data   — S+B   - - B', W - m.r, 25, colors.dim, 'right');
    }
  }
  function sup(n) { return String(n).split('').map(function (c) { return '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]; }).join(''); }

  return {
    init: function (canvas) { cv = canvas; ctx = cv.getContext('2d'); readColors(); resize(); window.addEventListener('resize', resize); },
    resize: resize, readColors: function () { readColors(); if (lastArgs) draw(lastArgs[0], lastArgs[1]); }, draw: draw
  };
})();
