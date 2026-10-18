/* The European assembly: who sits in it, the bills it debates, the laws in force, and what the lab can do about
 * them, by legal means. Month by month on the calendar (after the council), on its own random stream; the
 * debates themselves run on game time, so there is always a few minutes to act.
 *
 * Seats: seven political groups (PC.GROUPS). Their popularity drifts with the European economy: unemployment and
 * crises feed the Left and the Nationalists, inflation the Conservatives; the Greens grow from the mid-1970s.
 *   1952–1978  the Common Assembly: delegations appointed from national parliaments, re-appointed every year
 *              (seats move towards popularity); it is only consulted, so its laws do half as much
 *   from 1979  direct elections every five years: seats follow the vote
 * Bills (PC.BILLS) come up every one to two years; austerity bills are likelier when governments are cutting
 * back or in a crisis, energy taxes when the Greens are strong, enlargement when states are knocking. Each group
 * supports a bill as its stances say, plus a little noise; the lab's public image helps anything about research.
 * After a debate of five to seven minutes the house votes, seat-weighted. A law in force changes the budget,
 * costs, the power bill, reputation or the states' appetite to join, for its years.
 *
 * The lab can act (each costs something, scaled by what the lab earns):
 *   lobby a group      moves it towards the lab's side on this bill; less each time; past three lobbying
 *                      rounds on a bill, a scandal can break (reputation and image lost, the lobbying undone)
 *   testify            at the hearing, once a bill: costs data; sways the undecided, more with discoveries
 *   open days          outreach: reputation and public image (which fades back over the years)
 *   science diplomacy  speeds a candidate state's talks by a year, or invites the keenest state, which accepts
 *                      now and then (likelier when it is keen on science and the lab stands high)
 */
var PC = PC || {};

PC.Parliament = (function () {
  var M = 1 / 12, V = 1;
  var P = PC.PARL = {
    seats: 100, first: 1952, direct: 1979, term: 5,
    billEvery: [1, 2], billFrom: 1958, minGap: 360, debate: [300, 420],   // years between bills; game seconds
    consult: 0.5,                         // what a law of the appointed assembly does, against an elected one's
    lobby: { shift: 0.35, cost: 90, scandalAfter: 3, scandal: 0.12 },     // cost in seconds of the lab's income
    testify: { shift: 0.22, cost: 60 },                                    // cost in seconds of the data rate
    outreach: { cost: 60, cool: 180, image: 0.06 },
    diplomacy: { cost: 240, cool: 600 }
  };

  function rnd(p) {
    var t = (p.seed = (p.seed + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function gauss(p) { var u = Math.max(1e-9, rnd(p)), v = rnd(p); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); }
  function range(p, a) { return a[0] + (a[1] - a[0]) * rnd(p); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function dur(x) { return PC.dur ? PC.dur(x) : Math.round(x / 60) + ' min'; }      // util.js is not loaded in the simulator
  function fmt(x) { return PC.fmt ? PC.fmt(x) : x.toPrecision(3); }
  function norm(o) { var t = 0; Object.keys(o).forEach(function (k) { o[k] = Math.max(0.004, o[k]); t += o[k]; }); Object.keys(o).forEach(function (k) { o[k] /= t; }); return o; }
  function copy(o) { var c = {}; Object.keys(o).forEach(function (k) { c[k] = o[k]; }); return c; }

  function fresh(s, seed) {
    var p = { v: V, seed: seed >>> 0, at: s.date || 1950, pop: {}, seats: null, prev: null, next: P.direct, elections: [], bill: null,
      nextBill: P.billFrom + 1, lastT: -1e9, laws: [], votes: [], image: 0.5, cool: {}, count: {}, log: [] };
    PC.GROUPS.forEach(function (g) { p.pop[g.id] = g.rise ? 0.005 : g.base; });
    norm(p.pop);
    return p;
  }
  function note(s, p, text, what, ev, extra) {
    p.log.push({ y: Math.floor(s.date), text: text, what: what }); if (p.log.length > 80) p.log.shift();
    PC.Engine._log(s, text, 'parl');
    if (ev) { var e = { type: 'parl', what: what, text: text }; if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; }); ev.push(e); }
  }
  function elected(y) { return y >= P.direct; }

  /* ───── popularity: the economy, crises, the Greens' rise ───── */
  function drift(s, p) {
    var e = s.econ, b = e && e.eu, y = p.at, t = {};
    var du = b ? b.u - PC.ECON.bloc.eu.u0 : 0, pi = b ? b.pi : 2.5, aus = b ? b.aus : 0;
    var crisis = e && e.ep.some(function (q) { return q.to === null && (q.where === 'eu' || !q.where) && /crisis|crash/i.test(q.kind); });
    PC.GROUPS.forEach(function (g) { t[g.id] = g.base * (g.rise ? clamp((y - g.rise) / 12, 0.03, 1) : 1); });
    t.left += 0.01 * du + (crisis ? 0.02 : 0) + 0.02 * aus;
    t.nat += 0.012 * Math.max(0, du) + (crisis ? 0.03 : 0) + 0.02 * aus;
    t.soc -= 0.004 * du; t.cd -= 0.006 * du;
    t.con += 0.008 * Math.max(0, pi - 5);
    norm(t);
    PC.GROUPS.forEach(function (g) { p.pop[g.id] += 0.03 * (t[g.id] - p.pop[g.id]) + 0.004 * gauss(p); });
    norm(p.pop);
  }

  /* ───── support for a bill ───── */
  function support(s, p, bill, g) {
    var B = PC.BILLMAP[bill.id], v = 0;
    Object.keys(B.w).forEach(function (d) { v += B.w[d] * g.st[d]; });
    v += (p.image - 0.5) * 0.8 * (B.w.R || 0);                              // the public's view of science
    return v + bill.noise[g.id] + B.want * (bill.shift[g.id] || 0);
  }
  function pFor(x) { return 1 / (1 + Math.exp(-4 * x)); }
  // the share of seats expected to vote for it
  function projection(s) {
    var p = s.parl, bill = p && p.bill;
    if (!bill || !p.seats) return null;
    var f = 0;
    PC.GROUPS.forEach(function (g) { f += p.seats[g.id] * pFor(support(s, p, bill, g)); });
    return f;
  }

  /* ───── tabling a bill ───── */
  function table(s, p, ev) {
    var e = s.econ, b = e && e.eu, y = p.at, inForce = {};
    p.laws.forEach(function (l) { inForce[l.id] = true; });
    var crisis = e && e.ep.some(function (q) { return q.to === null && q.where === 'eu' && /crisis/i.test(q.kind); });
    var candidates = s.council ? PC.COUNTRIES.filter(function (k) { var x = s.council.st[k.id]; return y >= k.from && !k.obs && (x.status === 'none' || x.status === 'candidate'); }).length : 0;
    var list = PC.BILLS.filter(function (B) { return y >= B.from && !inForce[B.id]; }), tot = 0;
    var wts = list.map(function (B) {
      var w = 1;
      if (B.id === 'austerity') w *= 1 + 3 * (b ? b.aus : 0) + (crisis ? 2 : 0) + (b && b.gov > 80 ? 1 : 0);
      if (B.id === 'cuts') w *= 1 + 0.3 * Math.max(0, b ? b.u - PC.ECON.bloc.eu.u0 : 0) + (b ? b.aus : 0);
      if (B.id === 'energytax' || B.id === 'radiation' || B.id === 'dataprot') w *= 0.6 + 3 * (p.seats ? p.seats.green : 0);
      if (B.id === 'enlarge') w *= candidates > 2 ? 1.8 : 0.4;
      if (B.id === 'fp' || B.id === 'roadmap') w *= 1.2;
      tot += w; return w;
    });
    if (!list.length) return;
    var r = rnd(p) * tot, B = list[0];
    for (var i = 0; i < list.length; i++) { r -= wts[i]; if (r <= 0) { B = list[i]; break; } }
    p.count[B.id] = (p.count[B.id] || 0) + 1;
    var name = B.id === 'fp' ? B.name + ' ' + p.count.fp : B.name + (p.count[B.id] > 1 ? ' (' + ordinal(p.count[B.id]) + ' reading)' : '');
    var noise = {}; PC.GROUPS.forEach(function (g) { noise[g.id] = 0.2 * gauss(p); });
    p.bill = { id: B.id, name: name, t0: s.t, ends: s.t + range(p, P.debate), y: Math.floor(y), noise: noise, shift: {}, lob: {}, rounds: 0, testified: false };
    p.lastT = s.t;
    note(s, p, 'The assembly debates the ' + name + ': the lab wants it ' + (B.want > 0 ? 'passed' : 'rejected'), 'bill', ev, { want: B.want });
  }
  function ordinal(n) { return n === 2 ? 'second' : n === 3 ? 'third' : n + 'th'; }

  /* ───── the vote ───── */
  function vote(s, p, ev) {
    var bill = p.bill, B = PC.BILLMAP[bill.id], f = projection(s) + 0.03 * gauss(p), pass = f > 0.5, y = s.date;
    var groups = {}; PC.GROUPS.forEach(function (g) { groups[g.id] = Math.round(pFor(support(s, p, bill, g)) * 100) / 100; });
    p.votes.push({ y: Math.floor(y), id: bill.id, name: bill.name, pass: pass, share: Math.round(f * 1000) / 1000, want: B.want, groups: groups });
    if (p.votes.length > 40) p.votes.shift();
    if (pass) p.laws.push({ id: B.id, name: bill.name, from: y, until: y + B.yrs, k: elected(y) ? 1 : P.consult });
    var good = pass === (B.want > 0);
    note(s, p, (pass ? 'Passed' : 'Rejected') + ', ' + Math.round(f * 100) + '% for: the ' + bill.name + (good ? ' — as the lab hoped' : ' — against the lab'), 'vote', ev, { good: good, pass: pass });
    p.bill = null;
  }

  /* ───── a month ───── */
  function month(s, p, ev) {
    p.at += M;
    var y = p.at;
    drift(s, p);
    p.image += 0.01 * (0.5 - p.image);                                     // the public forgets, slowly
    if (y < P.first) return;
    if (!p.seats) {
      p.seats = copy(p.pop);
      note(s, p, 'The Common Assembly first sits: ' + P.seats + ' delegates appointed by national parliaments', 'first', ev);
    }
    if (!elected(y)) {
      if (Math.round(p.at * 12) % 12 === 0) { PC.GROUPS.forEach(function (g) { p.seats[g.id] += 0.3 * (p.pop[g.id] - p.seats[g.id]); }); norm(p.seats); }
    } else if (y >= p.next) {
      p.prev = copy(p.seats);
      p.seats = {}; PC.GROUPS.forEach(function (g) { p.seats[g.id] = p.pop[g.id] * (1 + 0.08 * gauss(p)); }); norm(p.seats);
      var turnout = clamp(63 - 0.35 * (y - P.direct) + 4 * gauss(p), 38, 75);
      var top = PC.GROUPS.slice().sort(function (a, b) { return p.seats[b.id] - p.seats[a.id]; })[0];
      p.elections.push({ y: Math.floor(y), seats: copy(p.seats), turnout: Math.round(turnout) });
      if (p.elections.length > 20) p.elections.shift();
      note(s, p, (p.elections.length === 1 ? 'The first direct elections to the European Parliament' : 'European elections') + ': turnout ' + Math.round(turnout) + '%; the ' + top.name + ' are the largest group', 'election', ev);
      p.next = Math.floor(y) + P.term;
    }
    p.laws = p.laws.filter(function (l) {
      if (y < l.until) return true;
      note(s, p, 'The ' + l.name + ' runs out', 'expire', null);
      return false;
    });
    if (!p.bill && y >= Math.max(P.billFrom, p.nextBill) && s.t - p.lastT >= P.minGap) { table(s, p, ev); p.nextBill = y + range(p, P.billEvery); }
  }

  function tick(s, ev) {
    var p = s.parl;
    if (!p || p.v !== V) p = s.parl = fresh(s, s.seed ^ 0x7f4a7c15);
    var d = s.date !== undefined ? s.date : p.at, k = 0;
    while (p.at + M <= d && k++ < 600) month(s, p, ev);
    if (k >= 600) p.at = d;
    if (p.bill && s.t >= p.bill.ends) vote(s, p, ev);
  }

  /* ───── the laws' effects ───── */
  function mult(s, key) {
    var p = s.parl, m = 1;
    if (!p || p.v !== V) return 1;
    p.laws.forEach(function (l) { var fx = PC.BILLMAP[l.id].fx[key]; if (fx) m *= Math.pow(fx, l.k); });
    return m;
  }

  /* ───── what the lab can do ───── */
  function income(s) { var dv = PC.Engine.derive(s); return { funds: Math.max(10, dv.fundsRate), data: Math.max(5, dv.dataRate) }; }
  function costs(s) {
    var i = income(s);
    return { lobby: i.funds * P.lobby.cost, testify: i.data * P.testify.cost, outreach: i.funds * P.outreach.cost, diplomacy: i.funds * P.diplomacy.cost };
  }
  function lobby(s, gid, ev) {
    var p = s.parl, bill = p && p.bill, c = costs(s).lobby;
    if (!bill || s.funds < c || !PC.GROUPS.some(function (g) { return g.id === gid; })) return false;
    s.funds -= c;
    bill.lob[gid] = (bill.lob[gid] || 0) + 1; bill.rounds++;
    bill.shift[gid] = (bill.shift[gid] || 0) + P.lobby.shift / bill.lob[gid];
    var g = PC.GROUPS.filter(function (x) { return x.id === gid; })[0];
    note(s, p, 'The lab lobbies the ' + g.name + ' on the ' + bill.name, 'lobby', null);
    if (bill.rounds > P.lobby.scandalAfter && rnd(p) < P.lobby.scandal * (bill.rounds - P.lobby.scandalAfter)) {
      Object.keys(bill.shift).forEach(function (k) { bill.shift[k] *= 0.3; });
      var loss = s.rep * 0.03;
      s.rep -= loss; p.image = Math.max(0, p.image - 0.1);
      note(s, p, 'Lobbying scandal: the press digs into the lab’s spending on the ' + bill.name + ' (−' + fmt(loss) + ' reputation)', 'scandal', ev || null);
      return 'scandal';
    }
    return true;
  }
  function testify(s) {
    var p = s.parl, bill = p && p.bill, c = costs(s).testify;
    if (!bill || bill.testified || s.data < c) return false;
    s.data -= c; bill.testified = true;
    var disc = PC.DISCOVERIES.filter(function (d) { return s.disc[d.id] && s.disc[d.id].done; }).length;
    PC.GROUPS.forEach(function (g) {
      var v = support(s, p, bill, g) * PC.BILLMAP[bill.id].want;
      if (Math.abs(v) < 0.4) bill.shift[g.id] = (bill.shift[g.id] || 0) + P.testify.shift * (1 + 0.05 * disc);
    });
    note(s, p, 'The lab testifies at the hearing on the ' + bill.name, 'testify', null);
    return true;
  }
  function outreach(s) {
    var p = s.parl, c = costs(s).outreach;
    if (!p || s.funds < c || (p.cool.outreach || 0) > s.t) return false;
    s.funds -= c; p.cool.outreach = s.t + P.outreach.cool;
    p.image = Math.min(1, p.image + P.outreach.image);
    var g = Math.max(1, s.rep * 0.01);
    s.rep += g; s.runTotals.rep += g; s.life.rep += g;
    note(s, p, 'Open days at the lab: the public comes to see (+' + fmt(g) + ' reputation)', 'outreach', null);
    return true;
  }
  function diplomacy(s, ev) {
    var p = s.parl, c = s.council, cost = costs(s).diplomacy, y = s.date;
    if (!p || !c || s.funds < cost || (p.cool.diplomacy || 0) > s.t) return false;
    var talks = PC.COUNTRIES.filter(function (k) { return c.st[k.id].status === 'candidate'; }).sort(function (a, b) { return c.st[a.id].until - c.st[b.id].until; })[0];
    var keen = PC.COUNTRIES.filter(function (k) { var x = c.st[k.id]; return y >= k.from && !k.obs && k.aff > 0 && (x.status === 'none' || x.status === 'left') && (!x.again || y >= x.again); })
      .sort(function (a, b) { return b.aff * Math.sqrt(b.gdp) - a.aff * Math.sqrt(a.gdp); })[0];
    if (!talks && !keen) return false;
    s.funds -= cost; p.cool.diplomacy = s.t + P.diplomacy.cool;
    var name = PC.Council.name;
    if (talks) { c.st[talks.id].until = Math.max(y, c.st[talks.id].until - 1); note(s, p, 'Science diplomacy: a delegation to ' + name(talks.id, y) + ' speeds its accession talks', 'diplomacy', null); }
    else if (rnd(p) < clamp(0.3 * keen.aff * PC.Council.standing(s), 0.1, 0.6)) {   // an invitation is not an application
      var x = c.st[keen.id]; x.status = 'candidate'; x.since = Math.floor(y); x.until = y + range(p, PC.COUNCIL.talks);
      note(s, p, 'Science diplomacy: ' + name(keen.id, y) + ' is invited, and applies to join', 'diplomacy', ev || null);
    } else note(s, p, 'Science diplomacy: ' + name(keen.id, y) + ' is invited, and declines for now', 'diplomacy', null);
    return true;
  }

  return { fresh: fresh, tick: tick, projection: projection, support: function (s, gid) { var p = s.parl, g = PC.GROUPS.filter(function (x) { return x.id === gid; })[0]; return p && p.bill ? support(s, p, p.bill, g) : 0; },
    pFor: pFor, budgetMult: function (s) { return mult(s, 'budget'); }, costMult: function (s, kind) { return mult(s, kind); },
    repMult: function (s) { return mult(s, 'rep'); }, powerTax: function (s) { return mult(s, 'power'); }, accessionMult: function (s) { return mult(s, 'accession'); },
    costs: costs, lobby: lobby, testify: testify, outreach: outreach, diplomacy: diplomacy, elected: elected, P: P, V: V };
})();
