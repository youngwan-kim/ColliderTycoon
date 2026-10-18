/* The council: the member states that found, fund and sometimes leave the lab. Month by month on the calendar,
 * after the world economy (economy.js), on its own random stream.
 *
 * Founding (a new game, a new generation): the host state is always a founder; every other state free to take
 * part joins with a chance that rises with the size of its economy in 1950 and its taste for big science:
 *   p = clamp(0.2 + 0.7 √(GDP/GDP_max), 0.05, 0.95) × affinity     (about 10 founders, different every game)
 * The convention comes into force in 1954.
 *
 * Contributions follow each member's GDP (as CERN's follow national income), which grows with its bloc's
 * potential and its own catch-up trend and moves with the business cycle; austerity in its bloc cuts it.
 * Associates pay a fraction. No member pays more than 22% of the budget (shares only; the budget is everyone's).
 * The budget multiplier is the members' total against what a typical game has by then (PC.WORLD.wRef), to the
 * power 0.4 and clamped (0.8–1.25): a lucky or unlucky council is felt, but not ruinous.
 *
 * Joining: states free to take part apply now and then, likelier when the lab stands high (its reputation
 * against a typical lab's at the same date), their economy is growing and their bloc is not cutting back.
 * Negotiations take 2–5 years and can fail; states from the former East and outside Europe usually become
 * associates first (those outside Europe stay associates). Leaving: rare, likelier under austerity, in a debt
 * crisis, or when the lab stands low; a state that left can come back after five years.
 * Borders move: Germany reunites (1990), Czechoslovakia splits (1993: a member brings Slovakia in), Yugoslavia
 * breaks up (1992). The superpowers and Japan only ever observe.
 */
var PC = PC || {};

PC.Council = (function () {
  var M = 1 / 12, V = 1;
  var C = PC.COUNCIL = {
    found: [0.2, 0.7],                   // the founding chance: base + slope × √(relative 1950 GDP), × affinity
    apply: 0.035,                        // applications a year for a keen state with the lab at a typical standing
    eastEager: 2,                        // after the Iron Curtain, the former East applies faster
    talks: [2, 5], assocStage: [2, 4],   // years of negotiation; years as an associate before full membership
    fail: 0.15,                          // negotiations that come to nothing
    leave: 0.0008,                       // withdrawals a year, in good times
    rejoin: 5,                           // years before a state that left may apply again
    assocShare: 0.15                     // what an associate pays, against a member of its size
  };

  function rnd(c) {
    var t = (c.seed = (c.seed + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function gauss(c) { var u = Math.max(1e-9, rnd(c)), v = rnd(c); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); }
  function range(c, a) { return a[0] + (a[1] - a[0]) * rnd(c); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function at(table, y) {                                  // a value from [[year, v], …], linear between the years
    if (y <= table[0][0]) return table[0][1];
    for (var i = 1; i < table.length; i++) if (y <= table[i][0]) { var a = table[i - 1], b = table[i]; return a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]); }
    return table[table.length - 1][1];
  }
  function staged(list, y, dflt) { var v = dflt; (list || []).forEach(function (x) { if (y >= x[0]) v = x[1]; }); return v; }
  function name(id, y) { var k = PC.COUNTRYMAP[id]; return staged(k.names, y, k.name); }
  function gdpx(id, y) { return staged(PC.COUNTRYMAP[id].gdpx, y, 1); }

  function fresh(s, seed) {
    var c = { v: V, seed: seed >>> 0, at: s.date || 1950, n: 0, st: {}, log: [], ratified: false, W: 0, gx: {} }, gmax = 0;
    PC.COUNTRIES.forEach(function (k) { if (k.from <= 1950 && !k.obs) gmax = Math.max(gmax, k.gdp); });
    PC.COUNTRIES.forEach(function (k) {
      var x = { status: 'none', since: null, L: 0, founder: false };
      if (k.from <= 1950 && !k.obs && (k.id === PC.WORLD.host || rnd(c) < clamp(C.found[0] + C.found[1] * Math.sqrt(k.gdp / gmax), 0.05, 0.95) * k.aff)) {
        x.status = 'member'; x.since = PC.WORLD.founded; x.founder = true;
      }
      c.st[k.id] = x;
    });
    c.W = weight(s, c);
    return c;
  }
  function note(s, c, id, what, text, ev) {
    c.log.push({ y: Math.floor(c.at), id: id, what: what, text: text });
    if (c.log.length > 120) c.log.shift();
    PC.Engine._log(s, text, 'council');
    if (ev) ev.push({ type: 'council', what: what, id: id, text: text });
  }

  /* ───── what each pays ───── */
  function gdp(c, id) { return PC.COUNTRYMAP[id].gdp * gdpx(id, c.at) * Math.exp(c.st[id].L); }
  function pays(c, id) {
    var x = c.st[id];
    return x.status === 'member' ? 1 : x.status === 'associate' ? C.assocShare : 0;
  }
  function weight(s, c) {
    var e = s.econ, w = 0;
    PC.COUNTRIES.forEach(function (k) {
      var p = pays(c, k.id);
      if (!p) return;
      var aus = e && e[k.bloc] ? e[k.bloc].aus : 0;
      w += gdp(c, k.id) * p * (1 - 0.15 * aus);
    });
    return w;
  }
  // each payer's share of the budget, none above the cap (the rest shared out among the others)
  function shares(s) {
    var c = s.council, e = s.econ, raw = {}, tot = 0;
    if (!c) return {};
    PC.COUNTRIES.forEach(function (k) {
      var p = pays(c, k.id);
      if (!p) return;
      var aus = e && e[k.bloc] ? e[k.bloc].aus : 0;
      raw[k.id] = gdp(c, k.id) * p * (1 - 0.15 * aus); tot += raw[k.id];
    });
    var out = {}, ids = Object.keys(raw), capped = {}, cap = PC.WORLD.shareCap;
    for (var it = 0; it < 6; it++) {
      var fixed = 0, free = 0;
      ids.forEach(function (id) { if (capped[id]) fixed += cap; else free += raw[id]; });
      var any = false;
      ids.forEach(function (id) {
        if (capped[id]) { out[id] = cap; return; }
        out[id] = free > 0 ? raw[id] / free * (1 - fixed) : 0;
        if (out[id] > cap && ids.length * cap >= 1) { capped[id] = true; any = true; }
      });
      if (!any) break;
    }
    return out;
  }

  /* ───── the lab's standing: its reputation against a typical lab's at the same date ───── */
  function standing(s) {
    var ref = at(PC.WORLD.repRef, s.date || 1950);
    return clamp(Math.log10((s.rep || 0) + 10) / Math.log10(ref + 10), 0.5, 1.5);
  }

  /* ───── a month ───── */
  function month(s, c, ev) {
    c.at += M; c.n++;
    var e = s.econ, y = c.at, stand = standing(s);
    // the economies: each country's GDP follows its bloc (potential, catch-up, the cycle)
    ['eu', 'us'].forEach(function (b) {
      var B = e && e[b];
      c.gx[b + 'd'] = B ? B.x - (c.gx[b] === undefined ? B.x : c.gx[b]) : 0;
      c.gx[b] = B ? B.x : 0;
    });
    PC.COUNTRIES.forEach(function (k) {
      var x = c.st[k.id], B = e && e[k.bloc];
      x.L += M * ((B ? B.gpot : 2.5) + k.tr) / 100 + c.gx[k.bloc + 'd'] / 100 + 0.003 * gauss(c);
    });
    // the convention comes into force
    if (!c.ratified && y >= PC.WORLD.founded) {
      c.ratified = true;
      var f = PC.COUNTRIES.filter(function (k) { return c.st[k.id].founder; }).map(function (k) { return name(k.id, y); });
      note(s, c, null, 'found', 'The convention comes into force: ' + f.length + ' founding member states (' + f.join(', ') + ')', ev);
    }
    // borders move
    PC.COUNTRIES.forEach(function (k) {
      (k.names || []).forEach(function (nm) {
        if (y >= nm[0] && y - M < nm[0]) {
          var was = name(k.id, nm[0] - 1), x = c.st[k.id];
          var why = k.id === 'DE' ? 'Germany is reunited' : k.id === 'CZ' ? 'Czechoslovakia splits in two' : k.id === 'RS' ? 'Yugoslavia breaks up' : k.id === 'RU' ? 'the Soviet Union is dissolved' : was + ' becomes ' + nm[1];
          if (x.status === 'member' || x.status === 'associate') note(s, c, k.id, 'border', why + (k.id === 'DE' ? ': a larger member' : k.id === 'CZ' ? ': Czechia stays a member' : ': ' + nm[1] + ' keeps the seat'), ev);
        }
      });
      if (k.splitFrom && y >= k.from && y - M < k.from) {
        var p = c.st[k.splitFrom];
        if (p.status === 'member' || p.status === 'associate') { c.st[k.id].status = p.status; c.st[k.id].since = Math.floor(y); note(s, c, k.id, 'join', k.name + ' stays in as a ' + (p.status === 'member' ? 'member state' : 'associate member'), ev); }
      }
    });
    // states move: talks end, associates become members, some apply, a few leave
    PC.COUNTRIES.forEach(function (k) {
      var x = c.st[k.id], B = e && e[k.bloc], nm = name(k.id, y);
      if (y < k.from) return;
      if (k.obs) {
        if (x.status === 'none' && rnd(c) < M * 0.1) { x.status = 'observer'; x.since = Math.floor(y); note(s, c, k.id, 'observer', nm + ' becomes an observer at the council', null); }
        return;
      }
      if (x.status === 'candidate' && y >= x.until) {
        if (rnd(c) < C.fail) { x.status = 'none'; x.since = Math.floor(y); x.again = y + 2; note(s, c, k.id, 'fail', 'Talks with ' + nm + ' come to nothing', ev); }
        else if (k.assoc || (k.from >= 1990 && rnd(c) < 0.7)) {
          x.status = 'associate'; x.since = Math.floor(y); x.until = k.assoc ? null : y + range(c, C.assocStage);
          note(s, c, k.id, 'assoc', nm + ' becomes an associate member state', ev);
        } else { x.status = 'member'; x.since = Math.floor(y); note(s, c, k.id, 'join', nm + ' joins as a member state', ev); }
        return;
      }
      if (x.status === 'associate' && x.until && y >= x.until) { x.status = 'member'; x.since = Math.floor(y); x.until = null; note(s, c, k.id, 'join', nm + ' becomes a full member state', ev); return; }
      var hard = B ? B.aus : 0, crisis = s.econ && s.econ.ep.some(function (q) { return q.to === null && q.where === k.bloc && (q.kind === 'Debt crisis' || q.kind === 'Banking crisis'); });
      if ((x.status === 'none' || x.status === 'left') && (!x.again || y >= x.again)) {
        var size = clamp(Math.sqrt(k.gdp / 50), 0.5, 1.5), econ = clamp(1 + 0.12 * (B ? B.x : 0) - 0.5 * hard - (crisis ? 0.4 : 0), 0.2, 1.6);
        var h = C.apply * k.aff * stand * stand * size * econ * (k.from >= 1990 ? C.eastEager : 1) * (x.status === 'left' ? 0.7 : 1) * (PC.Parliament ? PC.Parliament.accessionMult(s) : 1);
        if (rnd(c) < M * h) {
          x.status = 'candidate'; x.since = Math.floor(y); x.until = y + range(c, C.talks);
          note(s, c, k.id, 'apply', nm + ' applies to join', ev);
        }
        return;
      }
      if ((x.status === 'member' || x.status === 'associate') && k.id !== PC.WORLD.host) {
        var hl = C.leave * (1 + 6 * hard + (crisis ? 4 : 0)) * (stand < 0.85 ? 2.5 : 1) * (k.gdp < 20 ? 1.5 : 1);
        if (rnd(c) < M * hl) {
          x.status = 'left'; x.since = Math.floor(y); x.again = y + C.rejoin; x.founder = x.founder;
          note(s, c, k.id, 'leave', nm + ' withdraws from the council' + (crisis ? ', in a financial crisis' : hard > 0.5 ? ', cutting its budgets' : stand < 0.85 ? ', unconvinced the lab is worth it' : ''), ev);
        }
      }
    });
    // the budget's base: the members' contributions, smoothed over a few years (contributions follow past income)
    c.W += 0.03 * (weight(s, c) - c.W);
  }

  function tick(s, ev) {
    var c = s.council;
    if (!c || c.v !== V) c = s.council = fresh(s, s.seed ^ 0x2c1b3c6d);
    var d = s.date !== undefined ? s.date : c.at, k = 0;
    while (c.at + M <= d && k++ < 600) month(s, c, ev);
    if (k >= 600) c.at = d;
  }

  // the budget: the members' contributions against a typical game's at this date
  function budgetMult(s) {
    var c = s.council;
    if (!c || c.v !== V || !PC.WORLD.wRef) return 1;
    var b = PC.WORLD.budgetClamp;
    return clamp(Math.pow(c.W / at(PC.WORLD.wRef, c.at), PC.WORLD.budgetPow), b[0], b[1]);
  }
  function count(s, status) {
    var c = s.council;
    return c ? PC.COUNTRIES.filter(function (k) { return c.st[k.id].status === status; }).length : 0;
  }

  return { fresh: fresh, tick: tick, budgetMult: budgetMult, shares: shares, standing: standing, count: count, name: name, gdp: gdp,
    weight: weight, C: C, V: V };
})();
