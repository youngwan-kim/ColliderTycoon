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
