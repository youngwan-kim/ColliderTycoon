/* People and their careers: the PhD students, postdocs and professors as individuals.
 * Their lives run on the lab's calendar (s.date, continuous years; engine.js calTick).
 *
 * Hiring buys a position (s.staff[role], unchanged, so costs and every head count still read it);
 * people rotate through the positions. Each has a name, a talent, the analysis they work on, and a
 * record: papers (credited when one is accepted), talks (the conference speaker, results presented)
 * and discoveries (their analysis reaching 5σ). Experience and the record make them better at the
 * job: the staff bonuses sum each person's performance instead of counting heads.
 *
 * Careers move on their own, by chance weighted by each person's record and talent:
 *   PhD (≈5 years) → a postdoc here (if the lab has postdocs; they wait up to a year for a free
 *     position), or leaves for industry or another lab;
 *   postdoc (contracts of ≈2.5 years, renewed at most twice) → waits for a professorship here,
 *     becomes a permanent research scientist (a few per professor), or leaves;
 *   professors and scientists stay until they retire, at 65–68.
 * Everyone is born (their age when they join: 22–27 for a PhD, older for those hired from outside)
 * and dies: the age is drawn once, from a Gompertz–Makeham life table (most live to 70–95; an
 * accident can come at any age), and happens when the calendar gets there: in the lab, on the bench,
 * or years after they left. Alumni of earlier generations stay in their own universe: they are not
 * aged any further once the generation ends (genEnd: the date it ended).
 * A vacancy goes to whoever waits for it here, else to someone from outside. Who left becomes an
 * alumnus: those in industry bring in a little funding, those at other labs a little reputation;
 * both counts and the alumni list outlive a new generation.
 */
var PC = PC || {};

PC.Careers = (function () {
  var ROLES = ['grad', 'postdoc', 'professor', 'scientist'];
  var C = PC.CAREER = {
    phd: 5, term: 2.5, terms: 3,         // years on the calendar (±15%); a postdoc is renewed at most twice
    wait: 1,                             // years someone waits for a position here before leaving
    age: { grad: [22, 27], postdoc: [27, 33], professor: [38, 52], scientist: [30, 40] },   // age when hired from outside
    retire: [65, 68],                    // professors and research scientists
    gompM: 85, gompB: 0.09, accident: 6e-4,   // the life table: Gompertz mode and slope, and a constant hazard (per year)
    sciPerProf: 0.25, sciBase: 2,        // research scientists the lab keeps: sciBase + sciPerProf × professors
    alumniFunding: 0.005, alumniRep: 0.005, // per doubling of the alumni in industry / at other labs
    effEvery: 5                          // seconds between recomputing the staff bonuses
  };
  var FIRST = ['Ada', 'Alessandro', 'Amara', 'Andrei', 'Anna', 'Arjun', 'Aya', 'Bao', 'Beatriz', 'Carlos', 'Chen', 'Chiara', 'Daniel',
    'Dmitri', 'Elena', 'Emeka', 'Erik', 'Fatima', 'Felix', 'Francesca', 'Hana', 'Hassan', 'Ines', 'Ingrid', 'Jae-won', 'Jakob', 'Jin',
    'Joana', 'Kai', 'Kateryna', 'Kenji', 'Kofi', 'Laila', 'Leon', 'Lucía', 'Malik', 'Mariam', 'Marta', 'Mateo', 'Mei', 'Mikko', 'Nadia',
    'Nikhil', 'Noor', 'Olga', 'Omar', 'Paolo', 'Priya', 'Rafael', 'Rania', 'Ravi', 'Rosa', 'Sanne', 'Sergio', 'Shira', 'Sipho', 'Sofia',
    'Tamar', 'Tomás', 'Valentina', 'Wei', 'Yara', 'Yusuf', 'Zainab', 'Zoltán'];
  var LAST = ['Abebe', 'Andersson', 'Bianchi', 'Brown', 'Castro', 'Chen', 'Costa', 'da Silva', 'Dubois', 'Eriksen', 'Fischer', 'García',
    'Haddad', 'Hansen', 'Horvat', 'Ivanova', 'Jansen', 'Kato', 'Kaur', 'Kim', 'Kowalski', 'Kumar', 'Laurent', 'Li', 'Lindqvist', 'Martin',
    'Mensah', 'Moreau', 'Müller', 'Nakamura', 'Nguyen', 'Novák', 'Okafor', 'Olsen', 'Park', 'Patel', 'Petrov', 'Popescu', 'Quispe',
    'Rahman', 'Rossi', 'Sánchez', 'Schmidt', 'Sato', 'Silva', 'Singh', 'Svoboda', 'Tanaka', 'Toure', 'Van den Berg', 'Varga', 'Wang',
    'Weber', 'Wójcik', 'Yamamoto', 'Yilmaz', 'Zhang'];
  var TITLE = { grad: 'PhD student', postdoc: 'Postdoc', professor: 'Professor', scientist: 'Research scientist' };

  function E() { return PC.Engine; }
  function lc(role) { return role === 'grad' ? 'PhD student' : TITLE[role].toLowerCase(); }   // a title mid-sentence
  function rnd(s) { return E()._rand(s); }
  function pick(s, a) { return a[Math.floor(rnd(s) * a.length)]; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  function fresh(keep) {
    keep = keep || {};
    return { cal: 1, next: keep.next || 1, list: [], wait: [], alumni: keep.alumni || [], out: keep.out || { industry: 0, academia: 0 }, genEnd: keep.genEnd || {},
      moves: keep.moves || { postdoc: 0, professor: 0, scientist: 0 },   // internal moves: PhD → postdoc, postdoc → chair or staff
      count: { grad: 0, postdoc: 0, professor: 0, scientist: 0 }, eff: null, effT: -1, nextT: 0 };
  }
  // what a new generation inherits: the alumni (frozen in this generation's universe), the name counter, when this one ended
  function keep(s) {
    var p = s.people;
    if (!p) return {};
    var ge = {}; Object.keys(p.genEnd || {}).forEach(function (k) { ge[k] = p.genEnd[k]; }); ge[s.gen || 0] = s.date;
    return { next: p.next, alumni: p.alumni, out: p.out, moves: p.moves, genEnd: ge };
  }
  function now(s) { return s.date !== undefined ? s.date : E().year(s); }
  // when someone alive at this age dies: Gompertz (old age) or the constant hazard (an accident, an illness), whichever comes first
  function deathAge(s, age) {
    var B = C.gompB, A = B * Math.exp(-B * C.gompM);
    var g = Math.log(Math.exp(B * age) - B / A * Math.log(1 - rnd(s))) / B, m = age - Math.log(1 - rnd(s)) / C.accident;
    return Math.min(g, m);
  }
  function born(s, x, age) { x.born = now(s) - age; x.dies = x.born + deathAge(s, age); }
  function ageOf(s, x) { return Math.floor(((x.died !== undefined && x.died !== null ? x.died : now(s)) - x.born)); }
  // a span of calendar time, in words
  function yrs(v) { v = Math.max(0, v); return v < 1 ? Math.max(1, Math.round(v * 12)) + ' month' + (Math.round(v * 12) > 1 ? 's' : '') : v.toFixed(1) + ' years'; }

  function note(s, x, text) { x.hist.push([s.t, E().year(s), text]); if (x.hist.length > 14) x.hist.splice(1, 1); }
  function newPerson(s, role) {
    var p = s.people, x = { id: p.next++, name: pick(s, FIRST) + ' ' + pick(s, LAST), role: role, since: s.t, roleSince: s.t, joined: now(s), roleDate: now(s), end: null,
      terms: 0, talent: 0.8 + 0.4 * rnd(s), focus: null, papers: 0, talks: 0, disc: 0, hist: [], gen: s.gen || 0 };
    var a = C.age[role] || C.age.grad;
    born(s, x, a[0] + (a[1] - a[0]) * rnd(s));
    x.retire = C.retire[0] + (C.retire[1] - C.retire[0]) * rnd(s);
    note(s, x, 'Joined the lab as a ' + lc(role) + ', aged ' + ageOf(s, x));
    return x;
  }
  // the stage's end, on the calendar: a PhD, a postdoc contract; none for a permanent post
  function setRole(s, x, role) {
    x.role = role; x.roleSince = s.t; x.roleDate = now(s);
    x.end = role === 'grad' ? now(s) + C.phd * (0.85 + 0.3 * rnd(s)) : role === 'postdoc' ? now(s) + C.term * (0.85 + 0.3 * rnd(s)) : null;
    if (role === 'postdoc') x.terms = 1;
  }
  function add(s, x) { s.people.list.push(x); s.people.count[x.role]++; s.people.eff = null; }
  function remove(s, x) { var p = s.people, i = p.list.indexOf(x); if (i >= 0) { p.list.splice(i, 1); p.count[x.role]--; p.eff = null; } }

  // the lab can keep someone in this role: the role is unlocked (postdocs need the PS, professors the SPS)
  function open(s, role) { var st = PC.STAFFMAP[role]; return !!st && !E().missing(s, st).length; }
  function sciCap(s) { return C.sciBase + C.sciPerProf * (s.staff.professor || 0); }

  // out of the lab (or off the bench) into the alumni: dest 'industry' | 'academia' | 'retired' | 'service' (died here)
  function alum(s, x, dest, where) {
    var p = s.people, i = p.wait.indexOf(x);
    if (i >= 0) p.wait.splice(i, 1); else remove(s, x);
    function r2(v) { return v === null || v === undefined ? v : Math.round(v * 100) / 100; }
    // kept small, so a long game can remember hundreds: the story's first line and its last few, dates to the hundredth of a year
    var a = { id: x.id, name: x.name, role: x.role, dest: dest, where: where, t: Math.round(s.t), y: E().year(s), gen: s.gen || 0,
      papers: x.papers, talks: x.talks, disc: x.disc, years: r2(now(s) - (x.joined !== undefined ? x.joined : now(s))),
      hist: x.hist.length > 7 ? [x.hist[0]].concat(x.hist.slice(-6)) : x.hist,
      born: r2(x.born), dies: r2(x.dies), died: x.died !== undefined ? r2(x.died) : null };
    a.hist.forEach(function (h) { h[0] = Math.round(h[0]); });
    p.alumni.unshift(a);
    if (p.alumni.length > 800) p.alumni.length = 800;
    return a;
  }
  function leave(s, x, why) {
    var rec = x.papers + 1.5 * x.talks + 2 * x.disc;
    var dest = rnd(s) < clamp(0.6 - 0.04 * rec, 0.25, 0.75) ? 'industry' : 'academia';
    var where = dest === 'industry' ? pick(s, ['a detector company', 'a data-science start-up', 'a bank', 'a medical-imaging firm', 'a software company', 'a national lab spin-off'])
      : pick(s, ['DESY', 'Fermilab', 'SLAC', 'KEK', 'INFN', 'TRIUMF', 'IHEP Beijing', 'Nikhef', 'a university group', 'Brookhaven']);
    note(s, x, (why ? why + '; ' : '') + 'left for ' + where);
    s.people.out[dest]++;
    alum(s, x, dest, where);
    E()._log(s, x.name + ' (' + lc(x.role) + ') left for ' + where, 'people');
  }
  function retire(s, x) {
    note(s, x, 'Retired, aged ' + ageOf(s, x));
    alum(s, x, 'retired', 'retired');
    E()._log(s, TITLE[x.role] + ' ' + x.name + ' retired, aged ' + ageOf(s, x), 'people');
  }
  function lifespan(x) { return Math.floor(x.born) + '–' + Math.floor(x.died); }
  // a death: in the lab or on the bench (in service), or one of the alumni, years later
  function die(s, x, ev) {
    x.died = x.dies;
    if (x.dest) {                                        // an alumnus: no longer counted where they went
      if ((x.dest === 'industry' || x.dest === 'academia') && s.people.out[x.dest] > 0) s.people.out[x.dest]--;
      x.hist.push([s.t, Math.floor(x.died), 'Died, aged ' + ageOf(s, x)]);
      E()._log(s, 'Former ' + lc(x.role) + ' ' + x.name + ' (' + lifespan(x) + ') died, aged ' + ageOf(s, x), 'people');
      return;
    }
    note(s, x, 'Died, aged ' + ageOf(s, x));
    alum(s, x, 'service', 'died while at the lab');
    E()._log(s, 'In memoriam: ' + lc(x.role) + ' ' + x.name + ' (' + lifespan(x) + ') died, aged ' + ageOf(s, x), 'people');
    ev.push({ type: 'death', name: x.name, role: x.role, span: lifespan(x), age: ageOf(s, x) });
  }
  function queue(s, x, role, text) {
    remove(s, x); x.want = role; x.until = now(s) + C.wait;
    note(s, x, text); s.people.wait.push(x);
  }

  // a stage has ended: where this person goes, by chance weighted by their record
  function decide(s, x, ev) {
    var rec = x.papers + 1.5 * x.talks + 2 * x.disc, q = x.talent - 1;
    if (x.role === 'grad') {
      if (open(s, 'postdoc') && rnd(s) < clamp(0.12 + 0.05 * rec + 0.25 * q, 0.05, 0.6)) queue(s, x, 'postdoc', 'Defended the PhD; staying on for a postdoc');
      else leave(s, x, 'Defended the PhD');
      return;
    }
    if (x.role === 'postdoc') {
      if (x.terms < C.terms && rnd(s) < clamp(0.35 + 0.06 * rec + 0.2 * q, 0.1, 0.8)) {
        x.terms++; x.end = now(s) + C.term * (0.85 + 0.3 * rnd(s)); note(s, x, 'Postdoc contract renewed (term ' + x.terms + ')');
        return;
      }
      var r = rnd(s), pf = open(s, 'professor') ? clamp(0.04 + 0.04 * rec + 0.2 * q, 0.01, 0.4) : 0;
      var ps = s.people.count.scientist < sciCap(s) ? clamp(0.15 + 0.02 * rec, 0.1, 0.3) : 0;
      if (r < pf) queue(s, x, 'professor', 'Applied for a professorship here');
      else if (r < pf + ps) {
        remove(s, x); setRole(s, x, 'scientist'); add(s, x); s.people.moves.scientist++;
        note(s, x, 'Became a permanent research scientist');
        E()._log(s, x.name + ' became a research scientist', 'people');
      } else leave(s, x, 'End of the postdoc');
    }
  }

  // where someone is heading, in words: the odds decide() will use
  function outlook(s, x) {
    var rec = x.papers + 1.5 * x.talks + 2 * x.disc, q = x.talent - 1;
    if (x.want) return 'waiting for a ' + lc(x.want) + ' position · ' + yrs(x.until - now(s)) + ' left';
    if (x.role === 'professor' || x.role === 'scientist') return 'permanent · retires in ' + yrs(x.born + x.retire - now(s));
    var stay = x.role === 'grad' ? (open(s, 'postdoc') ? clamp(0.12 + 0.05 * rec + 0.25 * q, 0.05, 0.6) : 0)
      : x.terms < C.terms ? clamp(0.35 + 0.06 * rec + 0.2 * q, 0.1, 0.8) : open(s, 'professor') ? clamp(0.04 + 0.04 * rec + 0.2 * q, 0.01, 0.4) : 0;
    var what = x.role === 'grad' ? 'a postdoc here' : x.terms < C.terms ? 'a renewed contract' : 'a chair here';
    return (stay >= 0.45 ? 'likely ' : stay >= 0.2 ? 'in the running for ' : stay > 0 ? 'outside chance of ' : 'no opening for ') + what;
  }
  function record(x) { return x.papers + 1.5 * x.talks + 2 * x.disc; }

  // fill every open position: someone waiting here first, else someone from outside
  function fill(s, ev) {
    var p = s.people;
    ['grad', 'postdoc', 'professor'].forEach(function (role) {
      while (p.count[role] < (s.staff[role] || 0)) {
        var w = p.wait.filter(function (x) { return x.want === role; })[0], x;
        if (w) {
          p.wait.splice(p.wait.indexOf(w), 1); x = w; delete x.want; delete x.until;
          setRole(s, x, role); note(s, x, 'Became a ' + lc(role) + ' here'); p.moves[role]++;
          if (role === 'professor') { E()._log(s, x.name + ' became a professor', 'people'); ev.push({ type: 'professor', name: x.name }); }
        } else { x = newPerson(s, role); setRole(s, x, role); }
        add(s, x);
      }
    });
  }

  // someone is better the longer they have been here and the more they have published
  function perf(s, x) {
    return x.talent * (0.82 + 0.2 * (1 - Math.exp(-(s.t - x.since) / 3600))) * (1 + 0.01 * Math.min(10, x.papers));
  }
  // the staff bonuses: performance summed per role (null for roles that are not people)
  function eff(s, role) {
    var p = s.people;
    if (!p || ROLES.indexOf(role) < 0) return null;
    if (!p.eff || s.t - p.effT >= C.effEvery || s.t < p.effT) {
      var e = { grad: 0, postdoc: 0, professor: 0, scientist: 0 };
      p.list.forEach(function (x) { e[x.role] += perf(s, x); });
      p.eff = e; p.effT = s.t;
    }
    return p.eff[role];
  }
  function alumniMult(s) {
    var o = (s.people && s.people.out) || { industry: 0, academia: 0 };
    return { funding: 1 + C.alumniFunding * Math.log2(1 + o.industry) * PC.Economy.stockMult(s), rep: 1 + C.alumniRep * Math.log2(1 + o.academia) };   // industry gives more when markets are high
  }

  // the analyses people work on: the running ones; reassigned when theirs stops
  function refocus(s) {
    var act = PC.DISCOVERIES.filter(function (d) { var st = s.disc[d.id]; return st && st.active && !st.done; }).map(function (d) { return d.id; });
    s.people.list.forEach(function (x) {
      if (x.role === 'professor') return;
      if (x.focus && act.indexOf(x.focus) >= 0) return;
      x.focus = act.length ? pick(s, act) : null;
    });
  }

  function tick(s, dt, ev) {
    var p = s.people;
    if (!p) return;
    fill(s, ev);
    if (s.t < p.nextT) return;
    p.nextT = s.t + 1;                                   // careers move on the second, not every frame
    if (!p.cal) calendar(s);
    var d = now(s);
    p.list.slice().forEach(function (x) {
      if (d >= x.dies) die(s, x, ev);
      else if ((x.role === 'professor' || x.role === 'scientist') && d - x.born >= x.retire) retire(s, x);
      else if (x.end !== null && d >= x.end) decide(s, x, ev);
    });
    p.wait.slice().forEach(function (x) {
      if (d >= x.dies) { die(s, x, ev); return; }
      if (d < x.until) return;
      leave(s, x, 'No ' + lc(x.want) + ' position opened here');
    });
    p.alumni.forEach(function (x) { if (x.gen === (s.gen || 0) && x.died === null && x.dies !== undefined && d >= x.dies) die(s, x, ev); });
    fill(s, ev);
    if (Math.floor(s.t / 10) !== Math.floor((s.t - 1) / 10)) refocus(s);
  }

  // credit: an accepted paper, a discovery, a talk
  function authors(s, n) {
    var pool = s.people.list.filter(function (x) { return x.role !== 'professor'; }), out = [];
    for (var i = 0; i < n && pool.length; i++) out.push(pool.splice(Math.floor(rnd(s) * pool.length), 1)[0]);
    return out;
  }
  function paper(s, name, journal) {
    if (!s.people) return;
    var who = authors(s, 1 + Math.floor(rnd(s) * 3));
    var profs = s.people.list.filter(function (x) { return x.role === 'professor'; });
    if (profs.length) who.push(pick(s, profs));
    who.forEach(function (x) { x.papers++; note(s, x, 'Paper in ' + journal + ': ' + name); });
  }
  function discovery(s, d) {
    if (!s.people) return;
    var who = s.people.list.filter(function (x) { return x.focus === d.id; });
    if (!who.length) who = authors(s, 2);
    who.forEach(function (x) { x.disc++; note(s, x, 'Part of the discovery: ' + d.name); });
  }
  // the conference's speaker: a professor, postdoc or scientist, likelier the more they have published
  function speaker(s, conf) {
    if (!s.people) return null;
    var pool = s.people.list.filter(function (x) { return x.role !== 'grad'; });
    if (!pool.length) pool = s.people.list.slice();
    if (!pool.length) return null;
    var tot = 0; pool.forEach(function (x) { tot += 1 + x.papers; });
    var r = rnd(s) * tot, x = pool[0];
    for (var i = 0; i < pool.length; i++) { r -= 1 + pool[i].papers; if (r <= 0) { x = pool[i]; break; } }
    x.talks++; note(s, x, 'Talk at ' + conf.name + ' ' + conf.year);
    return { id: x.id, name: x.name, role: x.role };
  }
  // saves from before the calendar: everyone gets a birth and a death; stages measured in game time become years
  function calendar(s) {
    var p = s.people, d = now(s), Y = 2.5 / 3600;      // about how many years a second of game time was
    p.list.concat(p.wait).forEach(function (x) {
      var a = C.age[x.role] || C.age.grad;
      if (x.born === undefined) {
        born(s, x, a[0] + (a[1] - a[0]) * rnd(s) + (s.t - x.since) * Y);
        x.retire = C.retire[0] + (C.retire[1] - C.retire[0]) * rnd(s);
      }
      x.joined = d - (s.t - x.since) * Y; x.roleDate = d - (s.t - x.roleSince) * Y;
      if (x.end !== null && x.end !== undefined) x.end = d + Math.max(0.1, (x.end - s.t) * Y);
      if (x.until !== undefined) x.until = d + Math.max(0.05, (x.until - s.t) * Y);
    });
    p.alumni.forEach(function (x) {
      if (x.born !== undefined) return;
      var a = C.age[x.role] || C.age.grad, age = a[1] + 3 * rnd(s), left = x.y || d;
      x.born = left - age; x.dies = x.born + deathAge(s, age); x.died = null; x.years = (x.years || 0) * Y;
      if (x.gen === (s.gen || 0) && x.dies <= d) x.died = x.dies;   // died since: quietly
    });
    if (!p.genEnd) p.genEnd = {};
    p.cal = 1;
  }
  function presented(s, conf, what) {
    if (!s.people || !conf.speaker) return;
    var x = s.people.list.filter(function (q) { return q.id === conf.speaker.id; })[0];
    if (x) { x.talks++; note(s, x, 'Presented ' + what + ' at ' + conf.name); }
  }

  // saves from before careers: the staff on the books become people, part-way through their stages
  function adopt(s) {
    s.people = fresh();
    ['grad', 'postdoc', 'professor'].forEach(function (role) {
      for (var i = 0; i < (s.staff[role] || 0); i++) {
        var x = newPerson(s, role); setRole(s, x, role);
        var back = rnd(s) * (role === 'professor' ? 10 : x.end - now(s));   // years they have been in post already
        x.since = x.roleSince = s.t - back * 1440; x.joined = x.roleDate = now(s) - back;
        x.born -= back; x.dies -= back;
        if (x.end !== null) x.end = Math.max(now(s) + 0.05, x.end - back);
        add(s, x);
      }
    });
  }

  return { fresh: fresh, keep: keep, adopt: adopt, tick: tick, eff: eff, alumniMult: alumniMult, perf: perf, outlook: outlook, record: record, CONF: C,
    yrs: yrs, ageOf: ageOf, now: now,
    paper: paper, discovery: discovery, speaker: speaker, presented: presented, TITLE: TITLE, ROLES: ROLES };
})();
