/* Formatting helpers. */
var PC = PC || {};

PC.fmt = function (x) {
  if (!isFinite(x)) return '∞';
  var a = Math.abs(x);
  if (a < 10) return (Math.round(x * 100) / 100).toString();
  if (a < 1000) return (Math.round(x * 10) / 10).toFixed(a < 100 ? 1 : 0);
  var units = ['k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y'];
  var e = Math.floor(Math.log10(a) / 3);
  if (e > units.length) return x.toExponential(2).replace('e+', 'e');
  var v = x / Math.pow(1000, e);
  return v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0) + ' ' + units[e - 1];
};
PC.money = function (x) { return 'CHF ' + PC.fmt(x); };
PC.dur = function (s) {
  s = Math.max(0, Math.ceil(s));
  if (s < 60) return s + 's';
  var m = Math.floor(s / 60), h = Math.floor(m / 60);
  if (h < 1) return m + 'm ' + (s % 60 ? (s % 60) + 's' : '');
  return h + 'h ' + (m % 60) + 'm';
};
PC.energy = function (gev) {
  if (gev >= 1000) return (gev / 1000).toFixed(gev % 1000 ? 1 : 0) + ' TeV';
  if (gev >= 1) return (Math.round(gev * 10) / 10) + ' GeV';
  if (gev >= 0.001) return Math.round(gev * 1000) + ' MeV';
  return Math.round(gev * 1e6) + ' keV';
};
PC.esc = function (s) {
  return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
};

/* Errors in the drawing code: reported, never fatal. One view throwing must not freeze the others,
 * nor stop its own animation. Each place reports a repeating error about once every 10 s. */
PC.errors = [];                                        // { where, msg, t, n } — read by the debug panel and the UI tests
PC.report = function (where, e) {
  var msg = (e && e.message) || String(e), now = Date.now();
  var rec = PC.errors.filter(function (x) { return x.where === where && x.msg === msg; })[0];
  if (!rec) { rec = { where: where, msg: msg, t: 0, n: 0 }; PC.errors.push(rec); if (PC.errors.length > 50) PC.errors.shift(); }
  rec.n++;
  if (now - rec.t > 10000) { rec.t = now; if (window.console) console.error('[' + where + ']', e); }
};
// run fn, reporting what it throws
PC.guard = function (where, fn) {
  try { return fn(); } catch (e) { PC.report(where, e); }
};
// an animation loop that survives errors: the next frame is asked for before this one is drawn.
// PC.loops lets the debug tools step every loop by hand (headless browsers barely run frames).
PC.loops = {};
PC.loop = function (where, fn) {
  function frame(ts) { requestAnimationFrame(frame); PC.guard(where, function () { fn(ts); }); }
  PC.loops[where] = function (ts) { PC.guard(where, function () { fn(ts); }); };
  requestAnimationFrame(frame);
};
