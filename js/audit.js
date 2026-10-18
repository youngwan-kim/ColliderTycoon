/* Audits: is the lab worth what it costs? Checked on game time, every second.
 *
 * Value for money compares the lab with a typical one of the same year (the bot's normal play, PC.WORLD.repRef
 * and fundsRef), in orders of magnitude: its reputation against a typical lab's, over the funding it has
 * received against a typical lab's.
 *   V = [log(rep + 100) / log(repRef + 100)] / [log(funds + 10⁴) / log(fundsRef + 10⁴)]          (≈ 1 for a typical lab)
 * smoothed over a minute. A lab that takes the money and shows little for it falls below 1.
 *
 * The stages, each announced, each with a way back:
 *   sound      V ≥ 0.90 (audits start in 1960, once the lab has a record)
 *   watch      V < 0.90 for a minute; back to sound above 0.93
 *   audit      V < 0.85, or ten minutes under watch: the Court of Auditors reviews for seven minutes, then
 *                clean (V ≥ 0.90: +2% reputation, sound), recommendations (V ≥ 0.82: the budget −10% for ten
 *                minutes; counts as half an adverse audit), or adverse (the budget frozen at −25% for ten
 *                minutes). Audits are at least ten minutes apart; a clean one wipes the slate.
 *   vote       two adverse audits' worth, still below 0.85 when the freeze ends: the council votes on closing the
 *                lab (seven minutes). Each state votes as its share of the budget weighs, likelier for closure the
 *                lower V, under austerity, and the less keen it is on science; the lab can make its case once.
 *   closed     more than half the budget votes to close: the generation ends, with no Legacy gained.
 *                Legacy, the conference archive and the alumni are kept.
 * Raising V is the way out: publish, present at conferences, discover, hold open days.
 */
var PC = PC || {};

PC.Audit = (function () {
  var A = PC.AUDIT = {
    start: 1960, tau: 60,
    watch: 0.9, clear: 0.93, audit: 0.85, clean: 0.9, recs: 0.82,
    watchFor: 60, watchMax: 600, review: 420, cut: 0.9, cutFor: 600, freeze: 0.75, freezeFor: 600, vote: 420, plead: 0.15
  };
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function dur(x) { return PC.dur ? PC.dur(x) : Math.round(x / 60) + ' min'; }      // util.js is not loaded in the simulator
  function fmt(x) { return PC.fmt ? PC.fmt(x) : x.toPrecision(3); }
  function at(table, y) {
    if (y <= table[0][0]) return table[0][1];
    for (var i = 1; i < table.length; i++) if (y <= table[i][0]) { var a = table[i - 1], b = table[i]; return a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]); }
    return table[table.length - 1][1];
  }
  function fresh() { return { v: 1, V: 1, stage: 'sound', t0: 0, until: 0, below: 0, adverse: 0, next: 0, cut: null, vote: null, hist: [] }; }

  // the parts of value for money: reputation and funding, each against a typical lab of the year
  function parts(s) {
    var y = s.date || 1950, rr = at(PC.WORLD.repRef, y), fr = at(PC.WORLD.fundsRef, y), F = s.runTotals.funds;
    var rep = Math.log10((s.rep || 0) + 100) / Math.log10(rr + 100), fund = Math.log10(F + 1e4) / Math.log10(fr + 1e4);
    return { rep: rep, fund: fund, V: rep / fund };
  }
  function say(s, a, what, text, ev, kind) {
    a.hist.push({ y: Math.floor(s.date), what: what, text: text }); if (a.hist.length > 40) a.hist.shift();
    PC.Engine._log(s, text, 'audit');
    ev.push({ type: 'audit', what: what, text: text, kind: kind });
  }
  function go(s, a, stage) { a.stage = stage; a.t0 = s.t; }

  // the council's vote on closing: each state's share, weighted by how likely it is to vote for closure
  function closeShare(s) {
    var a = s.audit, c = s.council, sh = PC.Council.shares(s), e = s.econ, img = s.parl ? s.parl.image : 0.5, tot = 0;
    Object.keys(sh).forEach(function (id) {
      var k = PC.COUNTRYMAP[id], aus = e && e[k.bloc] ? e[k.bloc].aus : 0;
      var p = clamp(0.5 + (A.audit - a.V) * 4 - 0.4 * (k.aff - 1) + 0.3 * aus - (img - 0.5) - (a.vote && a.vote.pled ? A.plead : 0), 0.05, 0.95);
      tot += sh[id] * p;
    });
    return tot;
  }

  function tick(s, dt, ev) {
    var a = s.audit;
    if (!a) a = s.audit = fresh();
    var V = parts(s).V;
    a.V += (V - a.V) * Math.min(1, dt / A.tau);
    if (a.cut && s.t >= a.cut.until) a.cut = null;
    if ((s.date || 1950) < A.start) { a.stage = 'sound'; return; }
    var left = a.until - s.t;
    if (a.stage === 'sound') {
      a.below = a.V < A.watch ? a.below + dt : 0;
      if (a.below >= A.watchFor) { go(s, a, 'watch'); say(s, a, 'watch', 'The lab is under watch: its reputation lags what it is paid (value ' + a.V.toFixed(2) + ')', ev, 'warn'); }
    } else if (a.stage === 'watch') {
      a.below = a.V >= A.clear ? a.below + dt : 0;
      if (a.below >= A.watchFor) { go(s, a, 'sound'); a.below = 0; say(s, a, 'sound', 'The watch is lifted: the lab shows value for money again', ev); }
      else if ((a.V < A.audit && s.t >= (a.next || 0)) || s.t - a.t0 > A.watchMax) {
        go(s, a, 'audit'); a.until = s.t + A.review;
        say(s, a, 'audit', 'The Court of Auditors opens an audit of the lab (' + dur(A.review) + ')', ev, 'alarm');
      }
    } else if (a.stage === 'audit' && left <= 0) {
      if (a.V >= A.clean) {
        var g = s.rep * 0.02; s.rep += g; s.runTotals.rep += g; s.life.rep += g; a.adverse = 0;
        go(s, a, 'sound'); a.below = 0; say(s, a, 'clean', 'The audit is clean: the lab is good value (+' + fmt(g) + ' reputation)', ev);
      } else if (a.V >= A.recs && a.adverse < 1) {                          // a first or second warning; after that, no more patience
        a.adverse += 0.5; a.cut = { mult: A.cut, until: s.t + A.cutFor }; go(s, a, 'watch'); a.below = 0; a.next = s.t + A.cutFor;
        say(s, a, 'recs', 'The audit makes recommendations: the budget is cut ' + Math.round((1 - A.cut) * 100) + '% for ' + dur(A.cutFor) + (a.adverse >= 1 ? '. The auditors are losing patience' : ''), ev, 'warn');
      } else {
        a.adverse++; a.cut = { mult: A.freeze, until: s.t + A.freezeFor }; go(s, a, 'frozen'); a.until = s.t + A.freezeFor;
        say(s, a, 'adverse', 'An adverse audit: the budget is frozen at −' + Math.round((1 - A.freeze) * 100) + '% for ' + dur(A.freezeFor) + (a.adverse >= 2 ? '. Another failure means a vote on closing the lab' : ''), ev, 'alarm');
      }
    } else if (a.stage === 'frozen' && left <= 0) {
      if (a.adverse >= 2 && a.V < A.audit) {
        go(s, a, 'vote'); a.until = s.t + A.vote; a.vote = { pled: false };
        say(s, a, 'vote', 'The council will vote on closing the lab in ' + dur(A.vote) + '. Raise its value, or make its case', ev, 'alarm');
      } else { go(s, a, 'watch'); a.below = 0; a.next = s.t + A.cutFor; say(s, a, 'thaw', 'The freeze ends; the lab stays under watch', ev); }
    } else if (a.stage === 'vote' && left <= 0) {
      var share = closeShare(s);
      a.vote = null;
      if (share > 0.5) { a.stage = 'closed'; say(s, a, 'closed', 'The council votes to close the lab: ' + Math.round(share * 100) + '% of the budget in favour', ev, 'alarm'); }
      else { a.adverse = 1; go(s, a, 'watch'); a.below = 0; a.next = s.t + A.cutFor; say(s, a, 'reprieve', 'The council votes to keep the lab, ' + Math.round((1 - share) * 100) + '% to ' + Math.round(share * 100) + '%; it stays under watch', ev); }
    }
  }
  // make the lab's case to the council, once a vote
  function plead(s) {
    var a = s.audit, cost = PC.Parliament.costs(s).diplomacy;
    if (!a || a.stage !== 'vote' || a.vote.pled || s.funds < cost) return false;
    s.funds -= cost; a.vote.pled = true;
    PC.Engine._log(s, 'The director makes the lab’s case before the council', 'audit');
    return true;
  }
  function budgetMult(s) { var a = s.audit; return a && a.cut ? a.cut.mult : 1; }

  return { fresh: fresh, tick: tick, parts: parts, closeShare: closeShare, plead: plead, budgetMult: budgetMult, A: A };
})();
