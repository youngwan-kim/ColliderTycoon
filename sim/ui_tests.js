/* UI smoke tests, run in headless Chrome by sim/ui-test.sh against the real page in #debug mode
 * (its own save slot, in a throwaway browser profile). Each scenario starts from a fresh game and
 * fails on a wrong result or on any error the page reports: uncaught ones and those PC.guard caught.
 * Headless Chrome barely runs animation frames, so the canvas loops are stepped by hand (PC.loops).
 * The results are written into <pre id="UITEST"> for the shell script to read.
 */
(function () {
  var E, out = [], failed = 0;
  window.addEventListener('error', function (e) { PC.report('window', e.error || e.message); });
  window.addEventListener('unhandledrejection', function (e) { PC.report('promise', e.reason); });

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function st() { return PC.Game.state(); }
  function check(ok, msg) { if (!ok) throw new Error(msg); }
  var ft = 0;
  function frames(n) {                                   // step every canvas loop n frames
    for (var i = 0; i < (n || 3); i++) { ft += 16; Object.keys(PC.loops).forEach(function (k) { PC.loops[k](performance.now() + ft); }); }
  }
  function fresh() {
    PC.Game.reset();
    document.querySelectorAll('.win[data-win]').forEach(function (w) { if (!w.hidden) PC.Win.close(w.getAttribute('data-win')); });
    PC.UI.render(); frames(2);
  }
  function build(ids) { ids.forEach(function (id) { st().fac[id] = { built: true, remain: 0 }; }); PC.UI.render(); }
  function install(ids) { ids.forEach(function (id) { st().tech[id] = 'installed'; }); PC.UI.render(); }
  async function runConference() {
    var s = st(); s.conf.next = s.t; await wait(400);
    check(s.conf.open, 'the conference did not open');
    s.conf.open.remain = 0.05; await wait(600);
    check(!s.conf.open, 'the conference did not close');
  }
  function inked(cv) {                                   // a canvas with something drawn on it
    var d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, seen = {};
    for (var i = 0; i < d.length; i += 4 * 97) seen[d[i] + ',' + d[i + 1] + ',' + d[i + 2]] = 1;
    return Object.keys(seen).length > 3;
  }

  var TESTS = [
    ['boot', async function () {
      frames(5);
      check(document.querySelector('#rooms') && PC.Display.name(), 'the page did not start');
    }],

    ['the detector ⓘ opens the subsystems, not an event', async function () {
      var s = st(), b = document.querySelector('#detectorWrap .lens-tag .info-btn'), clicks = s.runTotals.clicks;
      check(b, 'no ⓘ inside the detector lens');
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click(); await wait(50);
      check(document.getElementById('detPop').classList.contains('open'), 'the subsystems panel did not open');
      check(s.runTotals.clicks === clicks, 'clicking the ⓘ recorded an event');
      document.body.click();
    }],

    ['the trigger under the lens: events, luminosity', async function () {
      build(['linac1', 'ps']); install(['spark']);
      await wait(1500); PC.UI.render();
      for (var i = 0; i < 6; i++) { PC.Display.spawn(); frames(3); }
      var cv = document.getElementById('trigView'), s = st();
      check(cv && cv.width > 0 && inked(cv), 'the trigger compartment is blank');
      check(s.lumi && s.lumi.run === s.run && s.lumi.del > 0 && s.lumi.rec > 0 && s.lumi.rec <= s.lumi.del, 'no luminosity for the run: ' + JSON.stringify(s.lumi && { del: s.lumi.del, rec: s.lumi.rec }));
      var opened = PC.Win.isOpen('analyses'); cv.click(); await wait(50);
      check(!opened && PC.Win.isOpen('analyses'), 'clicking the trigger did not open the trigger menu');
    }],

    ['every window opens and draws', async function () {
      var s = st(); s.funds = 1e12; install(['spark']); build(['linac1', 'ps']);
      var ids = Array.from(document.querySelectorAll('.win[data-win]')).map(function (w) { return w.getAttribute('data-win'); });
      for (var i = 0; i < ids.length; i++) {
        PC.Win.open(ids[i]); PC.UI.render(); frames(2); await wait(50);
        var w = document.querySelector('.win[data-win="' + ids[i] + '"]');
        check(!w.hidden && w.querySelector('.win-b, .win-tree'), 'window ' + ids[i] + ' did not open');
        PC.Win.close(ids[i]);
      }
    }],

    ['a conference closes into the archive', async function () {
      PC.Win.open('confs'); PC.UI.render();
      var n0 = st().confLog.length;
      await runConference();
      PC.UI.render();
      check(st().confLog.length === n0 + 1, 'the conference was not archived');
      var items = document.querySelectorAll('#confBody .cf-item');
      check(items.length === n0 + 1, 'the archive lists ' + items.length + ' entries, not ' + (n0 + 1));
      check(document.querySelector('#confBody .cf-item.sel'), 'nothing is selected in the archive');
      var big = document.querySelector('#confBody canvas[data-big]');
      check(big && inked(big), 'the group photo is blank');
    }],

    ['prestige: the archive splits by generation', async function () {
      PC.Win.open('confs');
      await runConference();
      var s = st(); s.disc.hgg = { S: 1, done: true, at: s.t };
      PC.Game.setState(E.prestige(s)); await wait(100);
      await runConference(); PC.UI.render();
      var tabs = document.querySelectorAll('#confBody .cf-tabs button');
      check(tabs.length === 2, 'no generation tabs after a prestige');
      check(tabs[0].getAttribute('aria-selected') === 'true', 'the archive is not on this generation');
      check(document.querySelectorAll('#confBody .cf-item').length === 1, 'this generation should list 1 conference');
      check(/2nd edition/.test(document.querySelector('#confBody .cf-det').textContent), 'the new conference is not the one shown');
      tabs[1].click(); await wait(50);
      check(document.querySelectorAll('#confBody .cf-gen').length === 1, 'earlier generations are not grouped');
    }],

    ['the event display follows the detector', async function () {
      function events() {
        var n = 0, tracks = 0;
        for (var i = 0; i < 8; i++) { frames(1); PC.Display.spawn(); var c = PC.Display.current(); if (c) { n++; tracks += (c.tracks || []).length; } }
        frames(3);
        return { n: n, tracks: tracks };
      }
      install(['spark']); frames(2);
      var a = events(); check(a.n && a.tracks, 'no events on the test stand');
      build(['linac1', 'ps']); frames(2);
      check(/Fixed-target/.test(PC.Display.name()), 'still ' + PC.Display.name() + ' with the PS built');
      var b = events(); check(b.n && b.tracks, 'no tracks in the fixed-target spectrometer');
      build(['psb', 'sps', 'aa', 'sppbar']); frames(2);
      check(/detector/.test(PC.Display.name()), 'still ' + PC.Display.name() + ' with the Sp̄pS built');
      var c = events(); check(c.n, 'no events in the collider detector');
    }],

    ['double-clicking a tech-tree node buys it', async function () {
      var s = st(); s.funds = 1e12;
      PC.Win.open('upgrades'); PC.UI.render(); await wait(50);
      var b = document.querySelector('.tnode.s-available'), id = b && b.getAttribute('data-node');
      check(b, 'no node to buy');
      b.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await wait(50);
      check(E.has(s, id) || s.tech[id] || s.fac[id], id + ' was not bought');
    }],

    ['a Long Shutdown installs what waits', async function () {
      var s = st(), id = PC.TECH.filter(function (t) { return t.install > 0 && !s.tech[t.id]; })[0].id;
      s.tech[id] = 'pending';
      check(E.startShutdown(s), 'the shutdown did not start');
      await wait(300); PC.UI.render(); frames(2);
      s.ls.remain = 0.05; await wait(400); PC.UI.render(); frames(2);
      check(!s.ls, 'the shutdown did not end');
      check(s.tech[id] === 'installed', id + ' was not installed');
    }],

    ['people: hiring, careers and the People pane', async function () {
      var s = st(); s.funds = 1e12; build(['linac1', 'ps']);
      for (var i = 0; i < 6; i++) E.hire(s, 'grad');
      for (var j = 0; j < 2; j++) E.hire(s, 'postdoc');
      await wait(300);
      check(s.people.count.grad === 6 && s.people.count.postdoc === 2, 'positions not filled: ' + JSON.stringify(s.people.count));
      // every PhD ends now: each stays for a postdoc or leaves, and the positions fill again
      s.people.list.forEach(function (x) { if (x.role === 'grad') x.end = s.date; });
      await wait(1500);
      check(s.people.count.grad === 6, 'the PhD positions did not refill');
      check(s.people.alumni.length + s.people.wait.length === 6, 'the graduates went nowhere: ' + s.people.alumni.length + ' alumni, ' + s.people.wait.length + ' waiting');
      PC.Win.open('staff');
      document.querySelector('#wStaff [data-act=staffpane][data-id=people]').click(); await wait(50);
      PC.UI.render(); frames(3);
      var cv = document.querySelector('#wStaff .ppl-canvas'), walkers = PC.PeopleView.agents();
      check(cv && cv.width > 0, 'no lab floor in the People pane');
      var here = s.people.list.length + s.people.wait.length;   // the lab, and whoever waits on the bench
      check(walkers.length === here, walkers.length + ' people walk the floor, not ' + here);
      check(inked(cv), 'the lab floor is blank');
      // click someone: they are selected and their story shows
      // someone in the lab with nobody else close by, so the click can only mean them
      var a = walkers.filter(function (w) {
        return s.people.list.some(function (x) { return x.id === w.id; }) &&
          walkers.every(function (o) { return o === w || Math.hypot(o.x - w.x, o.y - w.y) > 30; });
      })[0] || walkers[0], r = cv.getBoundingClientRect();
      cv.dispatchEvent(new MouseEvent('click', { clientX: r.left + a.x, clientY: r.top + a.y - 8, bubbles: true })); await wait(50);
      var who = s.people.list.filter(function (x) { return x.id === a.id; })[0];
      check(who && document.querySelector('#wStaff .group-h').textContent.indexOf(who.name) >= 0, 'clicking a figure did not select them');
      check(document.querySelectorAll('#wStaff .ppl-hist li').length, 'no history for the selected person');
      document.querySelector('#wStaff [data-act=pplalumni]').click(); await wait(50); PC.UI.render(); frames(3);
      check(PC.PeopleView.agents().length === s.people.alumni.length, 'the alumni are not on the floor');
      document.querySelector('#wStaff [data-act=staffpane][data-id=hire]').click();
      // a save from before careers: its staff become people
      var old = JSON.parse(JSON.stringify(s)); delete old.people; old.staff = { grad: 4, postdoc: 3, professor: 1 };
      E.migrate(old);
      check(old.people.count.grad === 4 && old.people.count.postdoc === 3 && old.people.count.professor === 1, 'an old save was not converted');
      // a new generation keeps the alumni and starts with no one
      var alumni = s.people.alumni.length; s.disc.hgg = { S: 1, done: true, at: s.t };
      PC.Game.setState(E.prestige(s));
      check(st().people.list.length === 0 && st().people.alumni.length === alumni, 'the alumni did not carry over');
    }],

    ['lives: births, retirement, deaths, and the earlier generation frozen', async function () {
      var s = st(), C = PC.Careers; s.funds = 1e20; build(['linac1', 'ps', 'psb', 'sps']);
      for (var i = 0; i < 4; i++) E.hire(s, 'grad');
      E.hire(s, 'postdoc'); E.hire(s, 'professor');
      await wait(300);
      var p = s.people, prof = p.list.filter(function (x) { return x.role === 'professor'; })[0], grad = p.list.filter(function (x) { return x.role === 'grad'; })[0];
      check(p.list.every(function (x) { return x.born < s.date && x.dies > s.date; }), 'someone has no birth or death on the calendar');
      check(C.ageOf(s, grad) >= 22 && C.ageOf(s, grad) <= 27 && C.ageOf(s, prof) >= 38, 'ages are off: PhD ' + C.ageOf(s, grad) + ', professor ' + C.ageOf(s, prof));
      // the professor reaches retirement age: they retire and someone takes the chair
      prof.born = s.date - prof.retire - 0.1; prof.dies = s.date + 20;
      // the PhD student dies; a former member dies years later
      grad.dies = s.date - 0.01;
      await wait(1500);
      check(p.alumni.some(function (x) { return x.id === prof.id && x.dest === 'retired'; }), 'the professor did not retire');
      check(p.count.professor === 1 && p.list.every(function (x) { return x.id !== prof.id; }), 'the chair was not filled again');
      var g = p.alumni.filter(function (x) { return x.id === grad.id; })[0];
      check(g && g.dest === 'service' && g.died !== null, 'the student who died is not in memoriam');
      check(s.log.some(function (l) { return l.text.indexOf('In memoriam') === 0 && l.text.indexOf(grad.name) > 0; }), 'no memorial in the logbook');
      var r = p.alumni.filter(function (x) { return x.id === prof.id; })[0]; r.dies = s.date - 0.01;
      await wait(1500);
      check(r.died !== null, 'the retired professor never died');
      // the alumni view: the dead rest in memoriam
      PC.Win.open('staff'); document.querySelector('#wStaff [data-act=staffpane][data-id=people]').click(); await wait(50);
      var toAlumni = document.querySelector('#wStaff [data-act=pplalumni]');
      if (toAlumni.textContent.indexOf('alumni') >= 0) toAlumni.click();
      await wait(50); PC.UI.render(); frames(3);
      check(PC.PeopleView.agents().filter(function (a) { return a.zone === 'memoriam'; }).length === 2, 'the dead are not in memoriam on the floor: ' + JSON.stringify(PC.PeopleView.agents().map(function (a) { return a.zone; })) + ' ' + p.alumni.length);
      document.querySelector('#wStaff [data-act=pplalumni]').click(); PC.Win.close('staff');
      // a new generation: the calendar starts again, and the earlier universe's alumni are frozen in it
      var alive = p.alumni.filter(function (x) { return x.died === null; })[0], end = s.date;
      s.disc.hgg = { S: 1, done: true, at: s.t }; PC.Game.setState(E.prestige(s));
      var n = st();
      check(n.date === 1950 && n.people.genEnd[0] === end, 'the new generation did not restart the calendar');
      if (alive) {
        var a = n.people.alumni.filter(function (x) { return x.id === alive.id; })[0];
        a.dies = n.date - 1; await wait(1500);
        check(a.died === null, 'an alumnus of the earlier generation died in the new one');
      }
    }],

    ['the world economy: it moves, prices follow, the World window shows it', async function () {
      var s = st(), Ec = PC.Economy;
      for (var i = 0; i < 40; i++) { s.date += 0.25; E.tick(s, 0.01); }                    // ten years of the calendar
      check(s.econ && s.econ.n >= 115 && s.econ.hist.length >= 38, 'the economy did not move: ' + (s.econ && s.econ.n) + ' months');
      var t = PC.TECH.filter(function (x) { return x.cost > 0; })[0], f = PC.FACILITIES.filter(function (x) { return x.cost > 0; })[0];
      s.econ.eu.pi = 12; s.econ.eu.y = 11;                                                    // inflation and dear money in Europe: everything costs more
      check(E.techCost(s, t) > t.cost * 1.1 && E.facCost(s, f) > f.cost * 1.15, 'costs did not follow the economy: ×' + (E.techCost(s, t) / t.cost).toFixed(2));
      s.econ.eu.pi = 3.3; s.econ.eu.y = 5.7; s.econ.oil = Math.log(4); s.econ.fx = 0; build(['linac1', 'ps', 'sps']);   // oil four times normal: the power bill
      check(E.derive(s).m.power < 0.9, 'the power bill did not bite: ×' + E.derive(s).m.power.toFixed(2));
      s.econ.oil = 0; PC.UI.render();
      document.querySelector('#stats [data-open=world]').click(); await wait(50); PC.UI.render();
      check(PC.Win.isOpen('world') && document.querySelectorAll('#wWorld .w-card svg').length === 8 && document.querySelectorAll('#wWorld .w-card svg rect.body').length >= 4 * 38, 'the World window did not show the economy as candles');
      document.querySelector('#wWorld [data-act=econbloc][data-id=us]').click(); await wait(50); PC.UI.render();
      check(document.querySelector('#wWorld .w-card:nth-child(3) .wk').textContent.indexOf('Dollar area') >= 0, 'the bloc switch did not switch');
      document.querySelector('#wWorld [data-act=econbloc][data-id=eu]').click();
      PC.Win.close('world');
    }],

    ['member states: founders, joining, leaving, who pays', async function () {
      var s = st(), Co = PC.Council;
      E.tick(s, 0.01);
      var c = s.council, founders = PC.COUNTRIES.filter(function (k) { return c.st[k.id].founder; });
      check(c.st.CH.founder && founders.length >= 2, 'the host is not a founder, or it founded alone: ' + founders.map(function (k) { return k.id; }));
      check(founders.every(function (k) { return k.from <= 1950 && !k.obs; }), 'a state founded the lab before it could take part');
      var sh = Co.shares(s), tot = Object.keys(sh).reduce(function (a, id) { return a + sh[id]; }, 0);
      check(Math.abs(tot - 1) < 1e-6 && Object.keys(sh).every(function (id) { return sh[id] <= PC.WORLD.shareCap + 1e-9; }), 'the shares do not add up, or one is above the cap: ' + tot.toFixed(3));
      // one state joins: a keen candidate whose talks end
      var cand = PC.COUNTRIES.filter(function (k) { return c.st[k.id].status === 'none' && k.from <= 1950 && !k.obs && !k.assoc; })[0];
      if (cand) {
        var b0 = Co.weight(s, c);
        c.st[cand.id].status = 'candidate'; c.st[cand.id].until = s.date; var C0 = Co.C.fail; Co.C.fail = 0;
        for (var i = 0; i < 3; i++) { s.date += 1 / 12; E.tick(s, 0.01); }
        Co.C.fail = C0;
        check(c.st[cand.id].status === 'member' || c.st[cand.id].status === 'associate', cand.id + ' did not join after its talks: ' + c.st[cand.id].status);
        check(Co.weight(s, c) > b0, 'a new member did not add to the budget');
      }
      // one state leaves: a member under heavy austerity, by force of the odds
      var mem = PC.COUNTRIES.filter(function (k) { return c.st[k.id].status === 'member' && k.id !== PC.WORLD.host; })[0];
      if (mem) {
        var L0 = Co.C.leave; Co.C.leave = 1000;
        s.date += 1 / 12; E.tick(s, 0.01); Co.C.leave = L0;
        check(c.st[mem.id].status === 'left' && c.log.some(function (l) { return l.what === 'leave' && l.id === mem.id; }), mem.id + ' did not leave');
        check(c.st.CH.status === 'member', 'the host state left');
      }
      // the World window: the map and who pays
      PC.Win.open('world'); PC.UI.render();
      document.querySelector('#wWorld [data-act=worldtab][data-id=members]').click(); await wait(50); PC.UI.render();
      check(document.querySelectorAll('#wWorld .w-map .tile').length === PC.COUNTRIES.length && document.querySelectorAll('#wWorld .w-pay i').length === Object.keys(Co.shares(s)).length, 'the member map or the payers are missing');
      document.querySelector('#wWorld .tile[data-id=FR]').dispatchEvent(new MouseEvent('click', { bubbles: true })); await wait(50); PC.UI.render();
      check(document.querySelector('#wWorld').textContent.indexOf('France') >= 0, 'clicking a tile did not show the state');
      document.querySelector('#wWorld [data-act=worldtab][data-id=econ]').click(); PC.Win.close('world');
    }],

    ['the parliament: elections, bills, lobbying, laws', async function () {
      var s = st(), Pa = PC.Parliament; s.funds = 1e15; s.data = 1e12; build(['linac1', 'ps']);
      for (var i = 0; i < 40; i++) { s.date = Math.max(s.date, 1950) + 1; E.tick(s, 0.01); }   // into the 1990s, month by month
      var p = s.parl;
      check(p.seats && p.elections.length >= 2, 'no direct elections by ' + Math.floor(s.date) + ': ' + p.elections.length);
      var before = JSON.stringify(p.seats); p.next = s.date; s.date += 1 / 12; E.tick(s, 0.01);
      check(JSON.stringify(p.seats) !== before && p.elections.length >= 3, 'an election did not re-seat the chamber');
      // a bill the lab wants passed: lobbying moves a group towards it
      p.bill = null; p.laws = []; p.lastT = -1e9; p.nextBill = 0; s.date += 1 / 12; E.tick(s, 0.01);
      check(p.bill, 'no bill was tabled');
      p.bill.id = 'fp'; p.bill.name = 'Framework Programme for Research 1';
      var g = PC.GROUPS[6].id, s0 = Pa.support(s, g), f0 = Pa.projection(s);
      check(Pa.lobby(s, g, []), 'lobbying failed');
      check(Pa.support(s, g) > s0 && Pa.projection(s) > f0, 'lobbying did not move the group towards the lab');
      check(Pa.testify(s) && !Pa.testify(s), 'testifying did not work once and only once');
      // the vote: forced through, the law takes effect on the budget
      PC.GROUPS.forEach(function (x) { p.bill.shift[x.id] = 5; });
      var b0 = Pa.budgetMult(s); p.bill.ends = s.t; E.tick(s, 0.01);
      check(!p.bill && p.votes.length && p.votes[p.votes.length - 1].pass && Pa.budgetMult(s) > b0, 'the bill did not pass into law, or the law did nothing');
      // outreach and diplomacy
      var r0 = s.rep, im = p.image;
      check(Pa.outreach(s) && s.rep > r0 && p.image > im && !Pa.outreach(s), 'open days did not work, or ignored the cooldown');
      check(Pa.diplomacy(s, []), 'science diplomacy did nothing');
      // the tab
      PC.Win.open('world'); PC.UI.render(); document.querySelector('#wWorld [data-act=worldtab][data-id=parl]').click(); await wait(50); PC.UI.render();
      check(document.querySelectorAll('#wWorld .w-hemi circle').length === Pa.P.seats, 'the hemicycle does not show every seat');
      document.querySelector('#wWorld [data-act=worldtab][data-id=econ]').click(); PC.Win.close('world');
    }],

    ['audits: watch, audit, freeze, a closure vote, closure', async function () {
      var s = st(), Au = PC.Audit; s.funds = 1e15;
      E.tick(s, 0.01); s.date = 1990;
      s.rep = 1; s.runTotals.funds = 1e22; s.audit.V = 0.5;                       // a lab that takes the money and shows nothing
      for (var i = 0; i < 70; i++) E.tick(s, 1);
      check(s.audit.stage === 'audit', 'no audit for a lab worth ' + s.audit.V.toFixed(2) + ': ' + s.audit.stage);
      function finish() { s.audit.until = s.t; s.audit.next = 0; E.tick(s, 0.5); }
      finish(); check(s.audit.stage === 'frozen' && s.audit.adverse === 1 && Au.budgetMult(s) < 1, 'the audit was not adverse, or nothing was frozen');
      finish(); check(s.audit.stage === 'watch', 'the freeze did not end in a watch: ' + s.audit.stage);
      s.audit.next = 0; E.tick(s, 0.5); check(s.audit.stage === 'audit', 'no new audit after the freeze'); finish(); check(s.audit.stage === 'frozen' && s.audit.adverse === 2, 'no second adverse audit: ' + s.audit.stage);
      finish(); check(s.audit.stage === 'vote', 'no closure vote after two adverse audits: ' + s.audit.stage);
      s.audit.V = 0.8; var c0 = Au.closeShare(s);                                // a borderline lab, where the case can matter
      check(Au.plead(s) && Au.closeShare(s) < c0 && !Au.plead(s), 'making the case did not help, or worked twice');
      PC.Win.open('world'); PC.UI.render(); document.querySelector('#wWorld [data-act=worldtab][data-id=audit]').click(); await wait(50); PC.UI.render();
      check(document.querySelector('#wWorld .w-ladder li.now') && document.querySelector('#wWorld .w-ladder li.now').textContent === 'Closure vote', 'the Audits tab does not show the vote');
      document.querySelector('#wWorld [data-act=worldtab][data-id=econ]').click(); PC.Win.close('world');
      s.audit.V = 0.5; finish(); check(s.audit.stage === 'closed', 'the council did not close a worthless lab: ' + s.audit.stage + ', ' + Au.closeShare(s).toFixed(2));
      // the next generation: no Legacy gained; the archive and the alumni kept; the calendar starts again
      s.legacy = 3; s.people.alumni.push({ id: 9999, name: 'Test Alumnus', role: 'grad', dest: 'industry', gen: s.gen, hist: [], born: 1960, dies: 2050, died: null });
      var confs = s.confLog.length, gen = s.gen, n = E.close(s);
      check(n.legacy === 3 && n.gen === gen + 1 && n.confLog.length === confs && n.people.alumni.some(function (x) { return x.id === 9999; }) && n.date === 1950,
        'closing lost Legacy, the archive or the alumni, or did not start a new generation');
    }],

    ['the council strip on the overview: drawn, and it opens the World window', async function () {
      var s = st(); for (var i = 0; i < 40; i++) { s.date += 1; E.tick(s, 0.01); }
      PC.UI.render(); frames(3);
      var cv = document.getElementById('councilStrip');
      check(cv && cv.width > 0 && inked(cv), 'the council strip is blank');
      cv.click(); await wait(50);
      check(PC.Win.isOpen('world'), 'clicking the council strip did not open the World window');
      PC.Win.close('world');
    }],

    ['the control rooms: a fault, an injection, a Long Shutdown', async function () {
      var s = st(); s.funds = 1e20;
      build(['linac1', 'linac2', 'linac4', 'psb', 'ps', 'sps', 'aa', 'sppbar', 'lhc']); install(['spark']); s.staff.accphys = 3; s.staff.deteng = 3;
      var T = performance.now();
      function rooms(n) { for (var i = 0; i < n; i++) { T += 100; PC.loops.ctrlrooms(T); } }   // 0.1 s a step
      function at(room, prefix) { return PC.CtrlRooms.crews()[room].filter(function (a) { return !a.walking && a.at.indexOf(prefix) === 0; }).length; }
      PC.UI.render(); rooms(200);
      ['ctrlCCC', 'ctrlDCR'].forEach(function (id) { check(inked(document.getElementById(id)), id + ' is blank'); });
      [['ctrlCCC', 'ccc'], ['ctrlDCR', 'dcr']].forEach(function (c) {
        document.getElementById(c[0]).click();
        check(PC.Win.isOpen(c[1]), 'clicking ' + c[0] + ' did not open its window'); PC.Win.close(c[1]);
      });
      check(at('ccc', 'seat:lhc') >= 1, 'nobody at the LHC island');
      check(PC.CtrlRooms.crews().dcr.some(function (a) { return a.key === 'sl'; }), 'no shift leader in the detector control room');
      s.beam.fault = { kind: 'rf', name: 'RF cavity trip', fac: 'lhc', remain: 1e4, total: 1e4 }; PC.UI.render(); rooms(250);
      check(at('ccc', 'rim:lhc') >= 2, 'nobody hurried to the faulty LHC island');
      s.beam.fault = null; s.beam.phase = 'turn'; s.beam.turn = 1e4; PC.UI.render(); rooms(250);
      var sent = PC.CtrlRooms.crews().ccc.filter(function (a) { return a.goal && a.goal.indexOf('rim:lhc') === 0; }).length;
      check(at('ccc', 'rim:lhc') >= 1 && sent >= 1 && sent <= 3, 'the injection crowd is wrong: ' + sent + ' sent, ' + at('ccc', 'rim:lhc') + ' there');
      s.dfaults.push({ lane: 'tracking', kind: 'dead', what: 'HV trip', remain: 1e4, age: 0 }); PC.UI.render(); rooms(250);
      check(at('dcr', 'by:tracking') >= 1, 'no expert came to fix the tracker: ' + JSON.stringify(PC.CtrlRooms.crews().dcr.map(function (a) { return a.key + '@' + a.at + (a.walking ? '~' : ''); })) + ' lanes ' + JSON.stringify(PC.Engine.detectorHealth(s).map(function (x) { return x.lane; })));
      s.dfaults.length = 0; s.ls = { remain: 1e4, total: 1e4, grant: 0, items: [], n: 1 }; PC.UI.render(); rooms(400);
      check(PC.CtrlRooms.crews().ccc.length === 0, 'the accelerator control room is not empty in the shutdown');
      check(PC.CtrlRooms.crews().dcr.length === 1, 'the detector control room has ' + PC.CtrlRooms.crews().dcr.length + ' people in the shutdown, not a skeleton crew');
      s.ls = null; PC.UI.render();
    }],

    ['the canvas loops keep running', async function () {
      frames(10);
      check(Object.keys(PC.loops).length >= 6, 'only ' + Object.keys(PC.loops).join(', ') + ' are running');
    }]
  ];

  (async function () {
    for (var t = 0; t < 50 && !(PC.Game && PC.Game.state && PC.UI && PC.loops.display); t++) await wait(100);
    E = PC.Engine;
    for (var i = 0; i < TESTS.length; i++) {
      var name = TESTS[i][0];
      try {
        fresh(); PC.errors.length = 0;
        await TESTS[i][1]();
        frames(2);
        if (PC.errors.length) throw new Error(PC.errors.map(function (x) { return '[' + x.where + '] ' + x.msg; }).join(' · '));
        out.push('PASS  ' + name);
      } catch (e) {
        failed++; out.push('FAIL  ' + name + ': ' + (e && e.message));
      }
    }
    out.push((failed ? 'FAILED ' + failed + ' of ' : 'ok · all ') + TESTS.length + (failed ? '' : ' passed'));
    var pre = document.createElement('pre'); pre.id = 'UITEST'; pre.textContent = out.join('\n'); document.body.appendChild(pre);
  })();
})();
