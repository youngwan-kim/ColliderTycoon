/* Bootstrap: load/save, offline progress, game loop, clicking. */
(function () {
  var E = PC.Engine, UI = PC.UI, D = PC.Display;
  // debug mode (index.html#debug) keeps its own save so normal progress is untouched
  var KEY = PC.DEBUG ? 'particle-clicker.save.debug2' : 'particle-clicker.save.v2';
  var state, spawnAcc = 0, clicks = 0;

  function store(fn) { try { return fn(); } catch (e) { return null; } }

  function save() {
    state.saved = Date.now();
    store(function () { localStorage.setItem(KEY, JSON.stringify(state)); });
  }
  function load() {
    var raw = store(function () { return localStorage.getItem(KEY); });
    if (!raw) return null;
    try {
      var s = JSON.parse(raw);
      return s && s.v === 1 ? E.migrate(s) : null;
    } catch (e) { return null; }
  }
  function exportSave() { save(); return btoa(unescape(encodeURIComponent(JSON.stringify(state)))); }
  function importSave(str) {
    try {
      var s = JSON.parse(decodeURIComponent(escape(atob(str.trim()))));
      if (!s || s.v !== 1) return false;
      setState(E.migrate(s)); save(); return true;
    } catch (e) { return false; }
  }

  function setState(s) { state = s; UI.setState(s); }



  // away: events from a fast-forward; the passing ones (faults, conferences) are not news any more
  var PASSING = ['fault', 'faultEnd', 'conf', 'confEnd', 'excess', 'excess3', 'paperBack', 'paperRevise', 'paperRejected', 'paperAccepted'];
  function handleEvents(ev, away) {
    if (away) ev = ev.filter(function (e) { return PASSING.indexOf(e.type) < 0; });
    ev.forEach(function (e) {
      if (e.type === 'discovery') {
        var d = PC.DISCMAP[e.id];
        UI.toast('Discovery: ' + d.name + ' (' + d.particle + ')',
          '5σ observation · +' + PC.fmt(e.rep) + ' reputation · +' + PC.money(e.grant) + (e.shown ? ' · as shown at ' + e.shown : '') + (d.nobel ? ' · Nobel Prize ' + d.nobel : ''), 'disc');
      } else if (e.type === 'evidence') {
        UI.toast('Evidence at 3σ', PC.DISCMAP[e.id].name + ' — keep taking data.');
      } else if (e.type === 'built') {
        UI.toast('Commissioned', PC.FAC[e.id].name + ' delivers first beam.');
      } else if (e.type === 'fault') {
        if (e.kind === 'inc2008') UI.toast('Incident in sector 3–4', PC.INCIDENT_2008.desc + ' Help the crew from the bottom bar.', 'alarm');
        else UI.toast('Fault: ' + PC.FAULTS.filter(function (k) { return k.id === e.kind; })[0].name, (e.fac ? PC.FAC[e.fac].name : 'Every machine') + ' has lost its beam. Help the crew from the bottom bar.', 'alarm');
      } else if (e.type === 'conf') {
        UI.toast(e.name + ' is open', (e.papers ? e.papers + ' new paper' + (e.papers > 1 ? 's' : '') + ' shown · +' + PC.fmt(e.bonus) + ' reputation. ' : '') +
          'Present results at 3σ or more, under the analysis room. ' + PC.dur(PC.BAL.confOpen) + ' left.');
      } else if (e.type === 'paperAccepted') {
        UI.toast('Published in ' + e.journal, (e.result || e.name) + ' · +' + PC.fmt(e.rep) + ' reputation');
      } else if (e.type === 'paperRejected') {
        UI.toast('Rejected by ' + e.journal, e.name + ' — back to internal review.', 'alarm');
      } else if (e.type === 'paperRevise') {
        UI.toast('Referees want revisions', e.name + ' · ' + e.journal);
      } else if (e.type === 'excess') {
        UI.toast('An excess appears', PC.EXCMAP[e.id].name + '. Real, or a fluke? Watch it in Analyses.');
      } else if (e.type === 'surprise') {
        var x = PC.EXCMAP[e.id];
        UI.toast('Unexpected discovery: ' + x.name, x.particle + ' at 5σ · +' + PC.fmt(e.rep) + ' reputation' + (e.shown ? ' · as shown at ' + e.shown : ''), 'disc');
      } else if (e.type === 'faded') {
        if (e.shown) UI.toast('Result withdrawn', PC.EXCMAP[e.id].name + ' faded with more data · −' + PC.fmt(e.loss) + ' reputation', 'alarm');
        else UI.toast('Excess gone', PC.EXCMAP[e.id].name + ' faded with more data. Just a fluctuation.');
      } else if (e.type === 'storeFull') {
        UI.toast('Storage full', 'No new data is written and the analyses stand still. Click the storage hall under the computing centre to buy more' + (E.caps(state).autostore ? ', or turn on automatic purchases.' : '.'), 'alarm');
      } else if (e.type === 'lsdone') {
        UI.toast('Long Shutdown complete', e.items.map(function (id) { return PC.TECHMAP[id].name; }).join(', ') + ' — beams back on.');
      }
    });
  }

  function awaySummary(r) {
    if (r.seconds < 60) return;
    var found = r.events.filter(function (e) { return e.type === 'discovery'; }).map(function (e) { return PC.DISCMAP[e.id].name; });
    UI.toast('While you were away (' + PC.dur(r.seconds) + ')',
      '+' + PC.fmt(r.data) + ' data, +' + PC.money(r.funds) + (found.length ? ' · discovered: ' + found.join(', ') : ''), found.length ? 'disc' : '');
  }

  /* ───────── boot ───────── */
  state = load();
  var fresh = !state;
  if (!state) state = E.newState();
  PC.Shell.init();
  D.init(document.getElementById('display'));
  PC.Plot.init(document.getElementById('plot'));
  PC.Complex.init(document.getElementById('complexMap'), function (id) {
    if (id === '@ccc' || id === '@dcr') { PC.Win.open(id === '@ccc' ? 'ccc' : 'dcr'); return; }   // the control rooms
    PC.Win.open('upgrades');
    PC.Tree.select(id);
  }, function (r) { PC.UI.ringCard(r); });
  PC.Computing.init(document.getElementById('computing'), function () { PC.Win.open('storage'); UI.render(); });
  PC.Rooms.init(document.getElementById('rooms'), function (id) {
    if (id === '@papers') PC.UI.showPapers(); else if (id === '@conf') { PC.Win.open('confs'); UI.render(); } else PC.UI.showAnalysis(id);
  });
  PC.CtrlRooms.init({ ccc: document.getElementById('ctrlCCC'), dcr: document.getElementById('ctrlDCR') }, function (id) { PC.Win.open(id); });
  PC.Overview.init(document.getElementById('ovLinks'), document.getElementById('overview'),
    document.getElementById('complexMap'), document.getElementById('detectorWrap'), document.querySelector('.ov-comp .lens'), document.getElementById('rooms'));
  UI.init(state, {
    exportSave: exportSave,
    importSave: importSave,
    prestige: function () {
      var ns = E.prestige(state);
      if (ns) { setState(ns); save(); UI.toast('A new generation begins', 'Legacy ' + ns.legacy + ': +' + Math.round(ns.legacy * PC.BAL.legacyEach * 100) + '% luminosity and funding.', 'disc'); }
    },
    reset: function () { store(function () { localStorage.removeItem(KEY); }); setState(E.newState()); }
  });
  if (!fresh) {
    var away = (Date.now() - (state.saved || Date.now())) / 1000;
    if (away > 5) { var r = E.simulate(state, away); handleEvents(r.events, true); awaySummary(r); }
  } else {
    UI.toast('Welcome to the lab', 'Click the test stand to record cosmic muons. Build Linac 1 in Upgrades (bottom bar) to start the accelerator chain; the tree there shows the way to a CMS-like detector.');
  }

  /* ───────── clicking ───────── */
  var wrap = document.getElementById('detectorWrap');
  wrap.addEventListener('pointerdown', function (e) {
    var r = wrap.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    var v = E.click(state);
    D.spawn();
    var f = document.createElement('div');
    f.className = 'floater'; f.textContent = '+' + PC.fmt(v);
    f.style.left = (x + 8) + 'px'; f.style.top = (y - 8) + 'px';
    wrap.appendChild(f); setTimeout(function () { f.remove(); }, 1000);
    if (++clicks === 15) document.getElementById('detHint').style.opacity = 0;
  });

  /* ───────── loop ───────── */
  var last = performance.now(), renderAcc = 0;
  setInterval(function () {
    var now = performance.now(), dt = (now - last) / 1000;
    last = now;
    var speed = PC.Debug ? PC.Debug.speed : 1, gdt = dt * speed;
    if (PC.Debug) PC.Debug.beforeTick();
    if (dt > 5) {                      // tab was asleep: fast-forward
      var r = E.simulate(state, gdt);
      handleEvents(r.events, true); awaySummary(r);
    } else if (gdt > 2) {              // debug fast speeds: coarse steps
      handleEvents(E.simulate(state, gdt, Math.max(1, gdt / 10)).events, true);
    } else {
      handleEvents(E.tick(state, gdt));
    }
    // ambient events: more data → busier display (log scale)
    var dv = E.derive(state);
    spawnAcc += dt * (state.ls ? 0 : D.idle() ? 0.25 : Math.min(1.5, 0.2 + 0.12 * Math.log10(1 + dv.dataRate)));
    while (spawnAcc >= 1) { spawnAcc -= 1; D.spawn(); }
    renderAcc += dt;
    if (renderAcc > 0.2) { renderAcc = 0; UI.render(); }
  }, 100);
  setInterval(save, 10000);

  // used by the debug panel
  PC.Game = {
    state: function () { return state; },
    setState: setState, save: save, handleEvents: handleEvents, awaySummary: awaySummary,
    reset: function () { store(function () { localStorage.removeItem(KEY); }); setState(E.newState()); },
    refresh: function () { UI.setState(state); }
  };
  if (PC.Debug) PC.Debug.init();
  document.addEventListener('visibilitychange', function () { if (document.hidden) save(); });
  window.addEventListener('beforeunload', save);

  /* theme: the button names the console you switch to */
  var themeKey = 'particle-clicker.theme', themeBtn = document.getElementById('themeBtn');
  function curTheme() {
    return document.documentElement.getAttribute('data-theme') ||
      (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  }
  function labelTheme() { themeBtn.textContent = curTheme() === 'dark' ? 'Light' : 'Dark'; }
  var t = store(function () { return localStorage.getItem(themeKey); });
  if (t) document.documentElement.setAttribute('data-theme', t);
  labelTheme(); D.readColors(); PC.Complex.readColors(); PC.Plot.readColors(); PC.Computing.readColors(); PC.Rooms.readColors(); PC.CtrlRooms.readColors(); PC.Overview.readColors();
  themeBtn.addEventListener('click', function () {
    var nx = curTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nx);
    store(function () { localStorage.setItem(themeKey, nx); });
    labelTheme(); D.readColors(); PC.Complex.readColors(); PC.Plot.readColors(); PC.Computing.readColors(); PC.Rooms.readColors(); PC.CtrlRooms.readColors(); PC.Overview.readColors();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { labelTheme(); D.readColors(); PC.Complex.readColors(); PC.Plot.readColors(); PC.Computing.readColors(); PC.Rooms.readColors(); PC.CtrlRooms.readColors(); PC.Overview.readColors(); });
})();
