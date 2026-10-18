/* Debug mode: open index.html#debug.
 * Speeds up time, skips ahead, grants resources and can let the balance bot play.
 * Uses its own save slot, so a normal game is never touched.
 */
var PC = PC || {};
PC.DEBUG = /(^|[#&])debug\b/.test(location.hash);

if (PC.DEBUG) PC.Debug = (function () {
  var E = PC.Engine;
  var SPEEDS = [[1, '1×'], [10, '10×'], [60, '1 min/s'], [600, '10 min/s'], [3600, '1 h/s']];
  var self = { speed: 1, autoplay: false }, bot = null, panel;

  function st() { return PC.Game.state(); }
  function done(msg) { PC.Game.refresh(); PC.Game.save(); if (msg) PC.UI.toast('Debug', msg); render(); }

  function skip(seconds) {
    var r = E.simulate(st(), seconds, Math.max(1, seconds / 2000));
    PC.Game.handleEvents(r.events, true);
    PC.Game.awaySummary(r);
    done();
  }
  function grantAvailable() {
    var s = st(), n = 0;
    PC.FACILITIES.forEach(function (f) {
      if (E.facStatus(s, f) === 'available') { s.fac[f.id] = { built: true, remain: 0 }; n++; }
    });
    PC.TECH.forEach(function (t) {
      if (E.techStatus(s, t) === 'available') { s.tech[t.id] = 'installed'; n++; }
    });
    done(n ? 'Granted ' + n + ' item' + (n > 1 ? 's' : '') + ' for free.' : 'Nothing is available right now.');
  }
  function finishWork() {
    var s = st();
    PC.FACILITIES.forEach(function (f) { if (s.fac[f.id] && !s.fac[f.id].built) s.fac[f.id].remain = 0; });
    if (s.ls) s.ls.remain = 0;
    PC.Game.handleEvents(E.tick(s, 0.001));
    done();
  }
  function completeAnalyses() {
    var s = st(), dv = E.derive(s);
    PC.DISCOVERIES.forEach(function (d) {
      var i = E.discoveryInfo(s, d, dv);
      if (i.eligible) { s.disc[d.id] = s.disc[d.id] || { S: 0 }; s.disc[d.id].S = d.need; s.disc[d.id].active = true; }
    });
    PC.Game.handleEvents(E.tick(s, 0.001));
    done();
  }
  function mult(key) {
    var s = st();
    s[key] = Math.max(s[key] * 10, key === 'funds' ? 1e3 : 1e3);
    done();
  }

  function loadBot(cb) {
    if (bot) return cb();
    var sc = document.createElement('script');
    sc.src = 'sim/bot.js';
    sc.onload = function () { bot = PC.Bot({ get st() { return st(); } }); cb(); };
    sc.onerror = function () { PC.UI.toast('Debug', 'Could not load sim/bot.js.'); };
    document.head.appendChild(sc);
  }

  var acc = 0, lastT = 0;
  self.beforeTick = function () {
    if (!self.autoplay || !bot) return;
    var t = st().t;
    acc += t - lastT; lastT = t;
    if (acc >= 2 || self.speed > 1) { acc = 0; bot.decide(); }
  };

  function btn(label, act, on) {
    return '<button type="button" class="dbg-b' + (on ? ' on' : '') + '" data-dbg="' + act + '">' + label + '</button>';
  }
  function render() {
    if (!panel) return;
    var s = st();
    panel.querySelector('.dbg-body').innerHTML =
      '<div class="dbg-l">Speed</div><div class="dbg-r">' +
        SPEEDS.map(function (x) { return btn(x[1], 'speed:' + x[0], self.speed === x[0]); }).join('') + '</div>' +
      '<div class="dbg-l">Skip</div><div class="dbg-r">' +
        btn('+10 min', 'skip:600') + btn('+1 h', 'skip:3600') + btn('+6 h', 'skip:21600') + '</div>' +
      '<div class="dbg-l">Give</div><div class="dbg-r">' +
        btn('Funds ×10', 'mult:funds') + btn('Data ×10', 'mult:data') + btn('Unlock available', 'grant') + '</div>' +
      '<div class="dbg-l">Finish</div><div class="dbg-r">' +
        btn('Builds & shutdown', 'finish') + btn('Analyses to 5σ', 'analyses') + '</div>' +
      '<div class="dbg-l">Bot</div><div class="dbg-r">' +
        btn(self.autoplay ? 'Autoplay on' : 'Autoplay off', 'auto', self.autoplay) + btn('Reset debug save', 'reset') + '</div>' +
      (PC.errors.length ? '<div class="dbg-l dbg-err">Errors</div><div class="dbg-r dbg-err">' + PC.errors.slice(-4).map(function (x) {
        return '<div>' + PC.esc(x.where) + ': ' + PC.esc(x.msg) + (x.n > 1 ? ' ×' + x.n : '') + '</div>';
      }).join('') + '</div>' : '') +
      '<p class="dbg-note">Separate save slot. Game time ' + PC.dur(s.t) + '. Remove #debug from the address to play normally.</p>';
  }

  function onClick(e) {
    var b = e.target.closest('[data-dbg]');
    if (!b) return;
    var p = b.getAttribute('data-dbg').split(':');
    if (p[0] === 'speed') { self.speed = +p[1]; render(); }
    else if (p[0] === 'skip') skip(+p[1]);
    else if (p[0] === 'mult') mult(p[1]);
    else if (p[0] === 'grant') grantAvailable();
    else if (p[0] === 'finish') finishWork();
    else if (p[0] === 'analyses') completeAnalyses();
    else if (p[0] === 'auto') loadBot(function () { self.autoplay = !self.autoplay; lastT = st().t; render(); });
    else if (p[0] === 'reset') { PC.Game.reset(); self.speed = 1; self.autoplay = false; render(); }
  }

  self.init = function () {
    panel = document.createElement('aside');
    panel.className = 'debug';
    panel.innerHTML = '<details' + (window.innerWidth > 700 ? ' open' : '') + '><summary>Debug</summary><div class="dbg-body"></div></details>';
    panel.addEventListener('click', onClick);
    document.body.appendChild(panel);
    render();
    setInterval(function () { var n = panel.querySelector('.dbg-note'); if (n) render(); }, 1000);
  };
  return self;
})();
