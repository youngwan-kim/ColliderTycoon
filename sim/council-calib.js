/* The council's reference budget: what the member states of a typical game pay, year by year, with the lab at a
 * typical standing (its reputation on PC.WORLD.repRef). Prints PC.WORLD.wRef for worldcontent.js, and the spread of
 * members, founders, joins and departures. Usage: node sim/load.js sim/council-calib.js */
(function () {
  var Ec = PC.Economy, Co = PC.Council, runs = 200, years = 88, byYear = {}, founders = [], members = {}, joins = 0, leaves = 0, assoc = 0;
  PC.Engine._log = function () {};
  function at(t, y) { if (y <= t[0][0]) return t[0][1]; for (var i = 1; i < t.length; i++) if (y <= t[i][0]) { var a = t[i - 1], b = t[i]; return a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]); } return t[t.length - 1][1]; }
  for (var k = 0; k < runs; k++) {
    var s = { date: 1950, seed: k * 2654435761 >>> 0, rep: 0 }, ev = [];
    s.econ = Ec.fresh(k * 7919 + 13, 1950);
    for (var m = 0; m < years * 12; m++) {
      s.date += 1 / 12; s.rep = at(PC.WORLD.repRef, s.date);
      Ec.tick(s, ev); Co.tick(s, ev);
      if (m % 12 === 11) {
        var y = Math.round(s.date);
        (byYear[y] = byYear[y] || []).push(s.council.W);
        if (y % 10 === 0) (members[y] = members[y] || []).push(Co.count(s, 'member') + Co.count(s, 'associate'));
      }
    }
    founders.push(PC.COUNTRIES.filter(function (c) { return s.council.st[c.id].founder; }).length);
    s.council.log.forEach(function (l) { if (l.what === 'join') joins++; if (l.what === 'leave') leaves++; if (l.what === 'assoc') assoc++; });
  }
  function med(a) { a = a.slice().sort(function (x, y) { return x - y; }); return a[Math.floor(a.length / 2)]; }
  var tab = Object.keys(byYear).map(Number).sort().filter(function (y) { return y % 4 === 2 || y === 1951; }).map(function (y) { return '[' + y + ', ' + +med(byYear[y]).toPrecision(3) + ']'; });
  print('wRef: [' + tab.join(', ') + ']');
  print('founders ' + Math.min.apply(null, founders) + '–' + Math.max.apply(null, founders) + ' (median ' + med(founders) + ') · per game: joins ' + (joins / runs).toFixed(1) + ', associates ' + (assoc / runs).toFixed(1) + ', departures ' + (leaves / runs).toFixed(1));
  print('members + associates by decade (median, p10–p90): ' + Object.keys(members).map(function (y) { var a = members[y].slice().sort(function (p, q) { return p - q; }); return y + ' ' + med(a) + ' (' + a[Math.floor(a.length * 0.1)] + '–' + a[Math.floor(a.length * 0.9)] + ')'; }).join(' · '));
})();
