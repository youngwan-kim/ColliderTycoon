/* UI: status strip and its hover cards, the overview's hover cards, the launcher and
 * its windows (upgrades, analyses + plot, staff, publications, logbook, lab), the
 * Long Shutdown chip and notifications. Feeds the detector display, complex map, plot
 * and tech tree. Lists are rebuilt only when their structure changes; numbers are
 * patched in place. */
var PC = PC || {};

PC.UI = (function () {
  var E = PC.Engine, fmt = PC.fmt, money = PC.money, esc = PC.esc;
  var $ = function (id) { return document.getElementById(id); };
  var state, hooks, selAnalysis = null, confirmKey = null, confirmTimer = 0;
  var keys = {}, plotT = 0;

  /* ───────── shared bits ───────── */
  function row(o) {
    return '<div class="row ' + (o.cls || '') + '"' + (o.attr || '') + '>' +
      '<span class="st"><i class="led"></i></span>' +
      '<span class="yr">' + (o.yr === undefined ? '' : o.yr) + '</span>' +
      '<div class="main"><div class="name">' + o.name + '</div>' +
      (o.desc ? '<div class="desc">' + o.desc + '</div>' : '') + (o.extra || '') + '</div>' +
      '<span class="cost">' + (o.cost || '') + '</span>' +
      '<span class="act">' + (o.act || '') + '</span></div>';
  }
  function statusTxt(t) { return '<span class="status">' + t + '</span>'; }
  function actBtn(act, id, cost, label, cur) {
    return '<button class="btn" type="button" data-act="' + act + '" data-id="' + id + '"' +
      (cost !== undefined ? ' data-cost="' + cost + '" data-cur="' + (cur || 'funds') + '"' : '') + '>' + label + '</button>';
  }
  function setHTML(el, k, html) { if (keys[el.id] !== k) { keys[el.id] = k; el.innerHTML = html; } }

  /* ───────── status strip ───────── */
  function renderStats(dv) {
    var s = state;
    $('sData').textContent = fmt(s.data);
    $('sDataR').textContent = fmt(dv.dataRate) + '/s';
    $('sFunds').textContent = money(s.funds);
    $('sFundsR').textContent = money(dv.fundsRate) + '/s';
    $('sRep').textContent = fmt(s.rep);
    $('sRepR').textContent = 'funding ×' + fmt(1 + s.rep * PC.BAL.repFunding);
    $('sEnergy').textContent = dv.sqrtS ? '√s ' + PC.energy(dv.sqrtS) : 'cosmics';
    $('sMachines').textContent = 'B = ' + (dv.m.B || 0) + ' T · σm/m ' + (dv.m.res * 100).toFixed(1) + '%';
    var nd = PC.DISCOVERIES.filter(function (d) { return s.disc[d.id] && s.disc[d.id].done; }).length;
    $('sDisc').textContent = nd + ' / ' + PC.DISCOVERIES.length;
    $('sNobel').textContent = E.activeCount(s) + ' of ' + dv.m.slots + ' analyses running';
    $('year').textContent = E.year(s);
    $('runstate').textContent = s.ls ? 'Long Shutdown ' + s.ls.n : 'Run ' + s.run;
    $('beamMode').className = 'mode' + (s.ls ? ' off' : '');
    $('beamModeText').textContent = s.ls ? 'No beam' : dv.sqrtS ? 'Stable beams' : 'Cosmics';

    // hover cards on the readouts
    var running = dv.facs.filter(function (x) { return x.raw > 0 && x.f.id !== 'cosmic'; });
    var tips = {
      tData: '<b>Reconstructed events</b>' + fmt(dv.dataRate) + ' per second now, ' + fmt(s.runTotals.data) + ' this generation. ' +
        'Spend data on publications for reputation.' + (dv.bottleneck ? '<span class="tip-k">Limited by the ' + (dv.bottleneck === 'accelerator' ? 'luminosity' : dv.bottleneck) + '.</span>' : '') +
        '<span class="tip-k">Storage ' + fmt(s.store.used) + ' of ' + fmt(s.store.cap) + (dv.storeFull ? ': full, nothing new is written.' : '.') + '</span>',
      tFunds: '<b>Research grant</b>' + money(dv.fundsRate) + ' per second, in proportion to the data rate and boosted ×' + fmt(1 + s.rep * PC.BAL.repFunding) + ' by reputation.' +
        '<span class="tip-k">' + (s.ls ? 'Halved during the Long Shutdown.' : 'Halves during a Long Shutdown.') + '</span>',
      tRep: '<b>Reputation</b>Earned from discoveries and publications. Every point raises funding.' +
        (s.legacy ? '<span class="tip-k">Legacy ' + s.legacy + ': +' + Math.round(s.legacy * PC.BAL.legacyEach * 100) + '% luminosity and funding.</span>' : ''),
      tEnergy: '<b>' + (dv.sqrtS ? 'Best collision energy √s = ' + PC.energy(dv.sqrtS) : 'Cosmic rays only') + '</b>' +
        (running.length ? running.map(function (x) { return esc(x.f.name); }).join(' · ') : 'No beam yet: build Linac 1.') +
        '<span class="tip-k">Field ' + (dv.m.B || 0) + ' T · mass resolution ' + (dv.m.res * 100).toFixed(1) + '%. Better tracking and a stronger field give sharper peaks.</span>',
      tDisc: '<b>' + E.activeCount(s) + ' of ' + dv.m.slots + ' analysis slots in use</b>' +
        (PC.DISCOVERIES.filter(function (d) { return s.disc[d.id] && s.disc[d.id].done; }).map(function (d) { return esc(d.particle); }).join(' · ') || 'Nothing observed yet.')
    };
    Object.keys(tips).forEach(function (id) { setHTML($(id), tips[id], tips[id]); });
  }

  /* ───────── the conference archive (opened from the conference room) ───────── */
  var selConf = null;
  function ordinal(n) { var v = n % 100; return n + (v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'); }
  function npOf(r) { return r.np !== undefined ? r.np : r.papers.length; }
  function confFates(rec) { return rec.shown.map(function (x) { return rec.gen === state.gen ? E.confFate(state, x) : x.fate || 'open'; }); }
  function renderConfs(dv) {
    var s = state, log = s.confLog || [], o = s.conf.open, ser = E.nextSeries(s);
    if (selConf === null || selConf >= log.length) selConf = log.length - 1;
    var now = o ? '<p class="cr-now inj"><i class="led"></i>' + esc(o.name + ' ' + o.year) + ' is open · ' + PC.dur(o.remain) + ' left · the group photo is taken when it closes</p>'
      : ser ? '<p class="cr-now off"><i class="led"></i>Next: ' + esc(ser.name + ' ' + E.year(s)) + ' in ' + PC.dur(Math.max(0, s.conf.next - s.t)) + '</p>'
      : '<p class="cr-now off"><i class="led"></i>Every series has met in ' + E.year(s) + '. The next conference waits for the lab’s next year.</p>';
    var papers = 0, results = 0, firsts = 0;
    log.forEach(function (r) { papers += r.np !== undefined ? r.np : r.papers.length; results += r.shown.length; firsts += confFates(r).filter(function (f) { return f === 'discovery'; }).length; });
    var sum = log.length ? '<p class="muted cf-sum">' + log.length + ' conference' + (log.length > 1 ? 's' : '') + ' · ' + papers + ' papers shown · ' + results + ' results presented' +
      (firsts ? ' · ' + firsts + ' later confirmed at 5σ' : '') + '</p>' : '';
    var h = now + sum;
    if (!log.length) h += '<p class="muted">No conferences yet. When one opens, your students, postdocs and professors go; the group photo is taken when it closes and kept here.</p>';
    else {
      var list = log.map(function (r, i) {
        var f = confFates(r), wd = f.filter(function (x) { return x === 'withdrawn'; }).length, ds = f.filter(function (x) { return x === 'discovery'; }).length;
        return '<button type="button" class="cf-item' + (i === selConf ? ' sel' : '') + '" data-act="confsel" data-id="' + i + '">' +
          '<canvas class="cf-thumb" data-ph="' + i + '"></canvas><span class="cf-t"><b>' + esc(r.name) + ' ' + r.year + '</b>' +
          '<span>' + npOf(r) + ' paper' + (npOf(r) === 1 ? '' : 's') + ' · ' + r.shown.length + ' result' + (r.shown.length === 1 ? '' : 's') +
          (ds ? ' · <i class="ok">' + ds + ' ✓</i>' : '') + (wd ? ' · <i class="lost">' + wd + ' withdrawn</i>' : '') + '</span></span></button>';
      }).reverse().join('');
      var r = log[selConf], f = confFates(r);
      var det = '<canvas class="cf-photo" data-ph="' + selConf + '" data-big="1"></canvas>' +
        '<h3 class="group-h"><span>' + esc(r.name) + ' ' + r.year + '</span><span class="val">' + ordinal(r.edition) + ' edition you attended' + (r.gen !== s.gen ? ' · generation ' + (r.gen + 1) : '') + '</span></h3>' +
        '<dl class="kv"><dt>From the lab</dt><dd>' + (r.staff.professor || 0) + ' professor' + (r.staff.professor === 1 ? '' : 's') + ', ' + (r.staff.postdoc || 0) + ' postdocs, ' + (r.staff.grad || 0) + ' students on the books</dd>' +
        '<dt>Reputation</dt><dd>+' + fmt(r.rep) + '</dd></dl>' +
        (r.shown.length ? '<h3 class="group-h"><span>Results presented</span></h3><ul class="cf-res">' + r.shown.map(function (x, i) {
          var it = x.kind === 'disc' ? PC.DISCMAP[x.id] : PC.EXCMAP[x.id];
          return '<li><span>' + esc(it.name) + ' <span class="sym">' + esc(it.particle) + '</span></span><span class="sg">' + Math.min(5, x.sigma).toFixed(1) + 'σ</span>' +
            '<span class="' + (f[i] === 'discovery' ? 'ok' : f[i] === 'withdrawn' ? 'lost' : 'muted') + '">' + (f[i] === 'discovery' ? 'confirmed at 5σ' : f[i] === 'withdrawn' ? 'withdrawn' : 'open') + '</span></li>';
        }).join('') + '</ul>' : '') +
        (r.papers.length ? '<h3 class="group-h"><span>Papers shown</span><span class="val">' + npOf(r) + ' published since the conference before</span></h3><ul class="cf-res">' + r.papers.map(function (p) {
          return '<li><span>' + esc(p.result || p.name) + '</span><span class="muted">' + esc(p.journal || '') + '</span></li>';
        }).join('') + (npOf(r) > r.papers.length ? '<li class="muted">and ' + (npOf(r) - r.papers.length) + ' more</li>' : '') + '</ul>' : '') +
        (!r.shown.length && !r.papers.length ? '<p class="muted">Nothing of yours on the programme: you went to listen.</p>' : '');
      h += '<div class="cf-arch"><div class="cf-list">' + list + '</div><div class="cf-det">' + det + '</div></div>';
    }
    var k = [log.length, selConf, o ? o.name + Math.round(o.remain / 5) : ser ? ser.name + Math.round((s.conf.next - s.t) / 5) : '-', firsts, $('themeBtn').textContent].join('|');
    if (keys.confBody !== k) {
      setHTML($('confBody'), k, h);
      $('confBody').querySelectorAll('canvas[data-ph]').forEach(function (cv) {
        var rec = log[+cv.getAttribute('data-ph')];
        if (rec) PC.Photo.draw(cv, rec, { thumb: !cv.getAttribute('data-big'), fates: confFates(rec) });
      });
    }
  }

  /* ───────── storage, under the computing centre ───────── */
  function storeLevel(inst) {
    return ['cta', 'eos', 'castor', 'raid', 'silo', 'diskpack', 'tape'].filter(function (id) { return inst[id]; })[0] || 'none';
  }
  function renderStore(dv) {
    var s = state, st = s.store, fr = st.used / st.cap, price = E.storePrice(s), auto = dv.caps.autostore;
    var left = !dv.storeFull && dv.dataIn > 0 ? (st.cap - st.used) / dv.dataIn : 0;
    var cls = dv.storeFull ? 'alarm' : fr > 0.85 ? 'warn' : '';
    var sizes = [[600, '+10 min'], [3600, '+1 h'], [6 * 3600, '+6 h']];
    var btns = sizes.map(function (z) {
      var amt = E.storeChunk(s, dv, z[0]), cost = amt * price;
      return '<button class="btn' + (dv.storeFull ? ' alarm' : '') + '" type="button" data-act="store" data-id="' + z[0] + '" title="' + fmt(amt) + ' more for ' + money(cost) + '"' + (cost > s.funds ? ' disabled' : '') + '>' + z[1] + ' <span>' + money(cost) + '</span></button>';
    }).join('');
    // what is written, by trigger stream (the pipe in the hall)
    var tot = 0; dv.streams.forEach(function (x) { tot += x.rec; });
    var cols = ['var(--b1)', 'var(--ok)', 'var(--warn)', 'var(--dim)'];
    var next = PC.TECH.filter(function (t) { return t.lane === 'storage' && !s.tech[t.id]; })[0];
    function tile(k2, v, sub) { return '<div class="tile"><span class="tk">' + k2 + '</span><span class="tv">' + v + '</span>' + (sub ? '<span class="ts">' + sub + '</span>' : '') + '</div>'; }
    var h = '<div class="store-box">' +
      '<p class="cr-now ' + (dv.storeFull ? 'alarm' : fr > 0.85 ? 'inj' : 'on') + '"><i class="led"></i>' + (dv.storeFull ? 'FULL · nothing new is written, the analyses stand still' : left ? 'Writing · full in ' + PC.dur(left) : s.ls ? 'Long Shutdown · nothing to write' : 'Idle') + '</p>' +
      '<div class="sb-row"><span class="sb-k">Used</span>' + bar(Math.min(1, fr), cls) + '<span class="sb-v ' + cls + '">' + Math.round(fr * 100) + '%</span></div>' +
      '<div class="tiles">' + tile('Stored', fmt(st.used)) + tile('Capacity', fmt(st.cap)) + tile('Writing', fmt(dv.dataRate), 'per second') +
        tile('Price', money(price * 1e3), 'per thousand') + '</div>' +
      '<h3 class="group-h"><span>Buy capacity</span><span class="val">in hours of the current data rate · shift-click ×10</span></h3>' +
      '<div class="sb-btns">' + btns + '</div>' +
      (auto ? '<label class="toggle sb-auto"><input type="checkbox" data-act="autostore"' + (s.flags.autoStore !== false ? ' checked' : '') + '> the operators buy 1 h more automatically at ' + Math.round(PC.BAL.storeAutoAt * 100) + '%</label>'
        : '<p class="sb-sub">Magnetic tape (Upgrades → Storage) lets the operators buy it for you.</p>') +
      (tot > 0 && dv.streams.length > 1 ? '<h3 class="group-h"><span>Written by stream</span><span class="val">the lanes of the pipe into the hall</span></h3><div class="shares">' + dv.streams.map(function (x, i) {
        return '<i style="flex:' + Math.max(0.001, x.rec / tot) + ';background:' + cols[i % 4] + '"></i>';
      }).join('') + '</div><div class="shares-l">' + dv.streams.map(function (x, i) {
        return '<span><i style="background:' + cols[i % 4] + '"></i>' + esc(x.name) + ' ' + Math.round(x.rec / tot * 100) + '%</span>';
      }).join('') + '</div>' : '') +
      '<h3 class="group-h"><span>Technology</span><span class="val">' + esc(PC.Computing.storeName()) + '</span></h3>' +
      '<p class="muted cr-note">' + (next ? 'Next: <b>' + esc(next.name) + '</b> (' + money(next.cost) + ', ×' + next.fx.storage + ' capacity per franc). ' : 'Every storage technology is installed. ') +
      'Data stay stored for good: publishing uses them but frees nothing. The grant keeps paying while the storage is full.</p></div>';
    var k = [Math.round(fr * 200), dv.storeFull, Math.round(left / 10), auto, s.flags.autoStore, fmt(dv.dataRate), next && next.id, tot > 0 ? dv.streams.map(function (x) { return Math.round(x.rec / tot * 100); }).join() : '',
      sizes.map(function (z) { var c = E.storeChunk(s, dv, z[0]) * price; return fmt(c) + (c > s.funds); }).join()].join('|');
    setHTML($('storeBody'), k, h);
  }

  /* ───────── data chain & shutdown ───────── */
  function renderChain(dv) {
    var s = state;
    function stage(name, val, frac, o) {
      o = o || {};
      return '<div class="stage' + (o.limit ? ' limit' : '') + (o.out ? ' out' : '') + '"><span class="name">' + name + '</span>' +
        '<div class="gauge' + (o.cap ? ' cap' : '') + '"><i style="width:' + Math.round(Math.min(1, frac) * 100) + '%"></i></div>' +
        '<span class="val">' + val + '</span></div>';
    }
    var bn = dv.bottleneck;
    var h = '<h3 class="block-h"><span>Data chain</span><span class="val">events per second</span></h3>' +
      stage('Collisions', fmt(dv.totalRaw), dv.totalRaw > 0 ? 1 : 0, { limit: bn === 'accelerator' && !s.ls && dv.totalRaw > 0 }) +
      stage('Trigger', fmt(dv.recorded) + ' of ' + fmt(dv.m.trigger), dv.trigSat, { cap: true, limit: dv.trigSat > 1 }) +
      stage('Computing', fmt(dv.processed) + ' of ' + fmt(dv.m.compute), dv.compSat, { cap: true, limit: dv.compSat > 1 }) +
      stage('Quality', '×' + fmt(dv.m.quality), 1) +
      stage('Data', fmt(dv.dataRate), 1, { out: true }) +
      stage('Storage', fmt(s.store.used) + ' of ' + fmt(s.store.cap), s.store.used / s.store.cap, { cap: true, limit: dv.storeFull });
    var note = s.ls ? '<b>No beam.</b> <span class="why">Upgrades are being installed.</span>'
      : bn === 'storage' ? '<b>Storage full.</b> <span class="why">Nothing new is written and the analyses stand still: click the storage hall to buy more.</span>'
      : bn === 'trigger' ? '<b>Trigger-limited.</b> <span class="why">Raise the bandwidth or hire detector engineers.</span>'
      : bn === 'computing' ? '<b>Computing-limited.</b> <span class="why">Reconstruction can’t keep up with the trigger.</span>'
      : '<b>Luminosity-limited.</b> <span class="why">Build or upgrade machines.</span>';
    if (dv.m.pileup < 1) note += ' <span class="why">Pile-up cuts quality to ×' + dv.m.pileup + ' until 4D timing is installed.</span>';
    h += '<p class="note">' + note + '</p>';
    setHTML($('chain'), h, h);
  }
  function renderLS(dv) {
    var s = state, h;
    var pend = E.pendingTech(s);
    if (s.ls) {
      var pct = 100 * (1 - s.ls.remain / s.ls.total);
      h = '<h3 class="block-h"><span>Long Shutdown ' + s.ls.n + '</span><span class="val">' + PC.dur(s.ls.remain) + ' left</span></h3>' +
        '<div class="stage limit" style="grid-template-columns:minmax(0,1fr) 52px"><div class="gauge"><i style="width:' + pct.toFixed(1) + '%"></i></div><span class="val">' + Math.floor(pct) + '%</span></div>' +
        '<ul class="ls-list">' + s.ls.items.map(function (id) { return '<li><span>' + esc(PC.TECHMAP[id].name) + '</span><span>installing</span></li>'; }).join('') + '</ul>' +
        (pend.length > s.ls.items.length ? '<p class="note">Upgrades ordered now go in at the next shutdown.</p>' : '');
    } else if (pend.length) {
      h = '<h3 class="block-h"><span>Run ' + s.run + '</span><span class="val">' + pend.length + ' upgrade' + (pend.length > 1 ? 's' : '') + ' waiting</span></h3><ul class="ls-list">' +
        pend.map(function (t) { return '<li><span>' + esc(t.name) + '</span><span>' + PC.dur(t.install / dv.m.installSpeed) + '</span></li>'; }).join('') + '</ul>' +
        '<button class="btn alarm wide" type="button" data-act="ls">Start Long Shutdown · ' + PC.dur(E.shutdownDuration(s)) + ' without beam</button>';
    } else {
      h = '<h3 class="block-h"><span>Run ' + s.run + '</span><span class="val">no upgrades waiting</span></h3>' +
        '<p class="note">Detector and accelerator upgrades go in during a Long Shutdown. The beams stop and funding halves until it ends.</p>';
    }
    setHTML($('lsPanel'), h, h);
    var c = '';
    if (s.ls) {
      var p = 100 * (1 - s.ls.remain / s.ls.total);
      c = '<span class="ls-run"><span>Long Shutdown ' + s.ls.n + ' · ' + PC.dur(s.ls.remain) + ' left</span><span class="gauge"><i style="width:' + p.toFixed(1) + '%"></i></span></span>';
    } else if (pend.length) {
      c = '<button class="btn alarm" type="button" data-act="ls" title="' + esc(pend.map(function (t) { return t.name; }).join(', ')) + '">Start Long Shutdown · ' +
        pend.length + ' upgrade' + (pend.length > 1 ? 's' : '') + ' · ' + PC.dur(E.shutdownDuration(s)) + '</button>';
    }
    setHTML($('lsChip'), c.replace(/width:[0-9.]+%/, ''), c);
    if (s.ls) { var g = $('lsChip').querySelector('.gauge > i'); if (g) g.style.width = (100 * (1 - s.ls.remain / s.ls.total)).toFixed(1) + '%'; }
  }

  // the machine that feeds this experiment (the same choice as the site on the map); is it delivering, and if not, why
  function expBeam(dv) {
    var s = state, fac = E.has(s, 'lhc') && dv.collider ? 'lhc' : E.has(s, 'sppbar') ? 'sppbar' : E.has(s, 'sps') ? 'sps' : E.has(s, 'ps') ? 'ps' : null;
    var on = !!fac && dv.facs.some(function (x) { return x.f.id === fac && x.raw > 0; }), off = null;
    if (fac && !on && !s.ls) {
      var bf = s.beam.fault;
      off = bf && (!bf.fac || bf.fac === fac) ? { fault: true, text: bf.name.replace(/ \(.*\)/, '').toLowerCase() + ' · ' + PC.dur(bf.remain / E.repairSpeed(s)) }
        : s.beam.phase === 'turn' ? { fault: false, text: 'injecting fill ' + (s.beam.fill + 1) + ' · ' + PC.dur(s.beam.turn) }
        : { fault: false, text: 'waiting for beam' };
    }
    return { fac: fac, on: on, off: off };
  }

  /* ───────── beam operations (under the map): status and controls ───────── */
  // sampled every 2 s of game time: delivered / nominal luminosity of the beam machines; kept for 30 minutes
  var lumiHist = [], LUMI_SPAN = 1800;
  function sampleLumi(dv) {
    var s = state, last = lumiHist[lumiHist.length - 1];
    if (last && s.t - last.t < 2 && s.t >= last.t) return;
    if (last && s.t < last.t) lumiHist = [];                        // a new game or an import
    var nom = 0, got = 0;
    dv.facs.forEach(function (x) {
      if (x.f.id === 'cosmic' || x.f.role !== 'physics') return;
      nom += E.facLumi(s, x.f, dv.m); got += x.raw;
    });
    if (nom <= 0) return;
    lumiHist.push({ t: s.t, v: got / nom, fault: !!s.beam.fault, ls: !!s.ls });
    while (lumiHist.length && lumiHist[0].t < s.t - LUMI_SPAN) lumiHist.shift();
  }
  // the fill's average so far, counting the turnaround before it: refilling pays once the luminosity drops below it
  function fillAverage() {
    var b = state.beam, t0 = state.t - b.age, sum = 0, prev = null;
    lumiHist.forEach(function (p) { if (p.t >= t0) { if (prev) sum += (p.t - prev.t) * (p.v + prev.v) / 2; prev = p; } });
    return sum / (b.age + PC.BAL.fillTurn);
  }
  function drawLumi(show) {
    var cv = $('lumiChart');
    cv.hidden = !show || lumiHist.length < 2;
    if (cv.hidden) return;
    var r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, W = r.width, H = r.height;
    if (!W) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    var ctx = cv.getContext('2d'), cs = getComputedStyle(document.documentElement);
    function col(k) { return cs.getPropertyValue(k).trim(); }
    var mono = col('--mono');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    var m = { l: 24, r: 6, t: 6, b: 14 }, pw = W - m.l - m.r, ph = H - m.t - m.b;
    var now = state.t, t0 = now - LUMI_SPAN, vmax = 2.2;
    lumiHist.forEach(function (p) { vmax = Math.max(vmax, p.v * 1.05); });
    function X(t) { return m.l + (t - t0) / LUMI_SPAN * pw; }
    function Y(v) { return m.t + ph - v / vmax * ph; }
    // faults (red) and shutdowns (grey) as bands
    lumiHist.forEach(function (p, i) {
      if (!p.fault && !p.ls) return;
      var x0 = Math.max(m.l, X(p.t)), nx = lumiHist[i + 1] ? X(lumiHist[i + 1].t) : X(now);
      ctx.fillStyle = col(p.fault ? '--b2' : '--rule'); ctx.globalAlpha = p.fault ? 0.22 : 0.6;
      ctx.fillRect(x0, m.t, Math.max(1, nx - x0), ph);
    });
    ctx.globalAlpha = 1;
    // axes: ×nominal on the left, minutes ago along the bottom
    ctx.font = '9px ' + mono; ctx.fillStyle = col('--faint'); ctx.strokeStyle = col('--rule'); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(m.l + 0.5, m.t); ctx.lineTo(m.l + 0.5, m.t + ph); ctx.lineTo(m.l + pw, m.t + ph + 0.5); ctx.stroke();
    ctx.textAlign = 'right';
    [0, 1, 2].forEach(function (v) { if (v <= vmax) ctx.fillText(v + '×', m.l - 4, Y(v) + 3); });
    ctx.textAlign = 'center';
    [[-30, 'left'], [-20], [-10], [0]].forEach(function (q) {
      var x = X(now + q[0] * 60);
      ctx.textAlign = q[0] === -30 ? 'left' : q[0] === 0 ? 'right' : 'center';
      ctx.fillText(q[0] === 0 ? 'now' : q[0] + ' min', q[0] === -30 ? m.l + 2 : x, H - 2);
    });
    // nominal
    ctx.strokeStyle = col('--faint'); ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(m.l, Math.round(Y(1)) + 0.5); ctx.lineTo(m.l + pw, Math.round(Y(1)) + 0.5); ctx.stroke(); ctx.setLineDash([]);
    // the current fill's running average: once the curve drops below it, refilling pays
    var b = state.beam;
    if (b.phase === 'stable' && !state.ls && !b.fault && b.age > 10) {
      var av = fillAverage();
      ctx.strokeStyle = col('--ok'); ctx.globalAlpha = 0.8; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(Math.max(m.l, X(now - b.age)), Y(av)); ctx.lineTo(X(now), Y(av)); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    // the curve: a sawtooth of fills, steps where a dump or a fault cut it
    ctx.strokeStyle = col('--b1'); ctx.lineWidth = 1.4; ctx.beginPath();
    lumiHist.forEach(function (p, i) {
      var prev = lumiHist[i - 1], jump = !prev || p.t - prev.t > 10;
      if (!jump && Math.abs(p.v - prev.v) > 0.3) ctx.lineTo(X(p.t), Y(prev.v));
      ctx[jump ? 'moveTo' : 'lineTo'](X(p.t), Y(p.v));
    });
    ctx.stroke();
    var lp = lumiHist[lumiHist.length - 1];
    ctx.fillStyle = col('--b1'); ctx.beginPath(); ctx.arc(X(lp.t), Y(lp.v), 2.5, 0, 6.2832); ctx.fill();
  }

  function renderBeamOps(dv) {
    var s = state, b = s.beam, f = b.fault, h = '', k;
    var col = dv.facs.filter(function (x) { return x.f.id === 'lhc' || x.f.id === 'sppbar'; }).map(function (x) { return x.f; }).pop();
    var cname = col ? (col.id === 'lhc' ? 'LHC' : 'Sp̄pS') : '';
    if (s.ls) { k = 'ls'; h = '<span class="op dim">Long Shutdown · no beam</span>'; }
    else if (f) {
      var fac = f.fac ? PC.FAC[f.fac].name.replace(/ \(.*\)/, '') : 'all machines';
      k = 'fault' + f.name + fac;
      h = '<span class="op alarm" title="' + esc(f.kind === 'inc2008' ? PC.INCIDENT_2008.desc : 'Beam is off on ' + fac + ' until it is repaired. Accelerator physicists and technicians make repairs faster.') + '">' +
        '<i class="led"></i>' + esc(f.name) + ' · ' + esc(fac) + ' · <span data-op="fault"></span></span>' +
        '<button class="btn alarm" type="button" data-act="help" title="Each click takes ' + Math.round(PC.BAL.faultHelp * 100) + '% off the repair">Help the crew</button>';
    } else if (b.phase === 'stable') {
      var a = b.age, T = PC.BAL.fillTurn, tau = PC.BAL.fillTau;
      var hot = Math.exp(-a / tau) <= tau * (1 - Math.exp(-a / tau)) / (a + T);   // below the fill's average: refill now
      k = 'fill' + b.fill + hot + cname;
      h = '<span class="op on" title="Luminosity falls during a fill. Refilling costs ' + T + ' s without collisions, so the best moment is when the curve drops below the fill’s average so far (green dashes). The operators refill on their own at ' + Math.round(PC.BAL.fillAutoAt * 100) + '% of the peak.">' +
        '<i class="led"></i>' + cname + ' · fill ' + b.fill + ' · <span data-op="lumi"></span>&nbsp;of peak</span>' +
        '<button class="btn' + (hot ? ' hot' : '') + '" type="button" data-act="dump">' + (hot ? 'Refill now' : 'Dump & refill') + '</button>';
    } else if (b.phase === 'turn') {
      k = 'turn' + b.fill + cname;
      h = '<span class="op inj"><i class="led"></i>' + cname + ' · injecting fill ' + (b.fill + 1) + ' · <span data-op="turn"></span></span>';
    } else {
      var on = dv.facs.filter(function (x) { return x.f.id !== 'cosmic' && x.raw > 0; }).pop();
      k = 'beam' + (on ? on.f.id : '');
      h = on ? '<span class="op on"><i class="led"></i>Beam · ' + esc(on.f.name.replace(/ \(.*\)/, '')) + '</span>'
        : '<span class="op dim">No accelerator yet · cosmic rays only</span>';
    }
    setHTML($('boHead'), k, h);                                  // the control room itself is the panel just below
    setHTML($('cccStatus'), k, h);
    sampleLumi(dv); drawLumi(!!lumiHist.length);
  }

  // the conference hall in the analysis lens: slides for the papers shown and the results presented
  function confView(dv) {
    var s = state, o = s.conf.open, slides = [];
    (o.papers || []).forEach(function (p) { slides.push({ title: p.result || p.name, sub: 'published in ' + p.journal }); });
    o.shown.forEach(function (id) {
      var d = PC.DISCMAP[id], e = PC.EXCMAP[id], it = d || e;
      var sg = d ? E.discoveryInfo(s, d, dv).sigma : E.excessInfo(s, e, dv).sigma;
      slides.push({ title: it.particle + ' · ' + Math.min(5, sg).toFixed(1) + 'σ', sub: e ? 'an unexpected excess' : 'evidence: ' + it.name, hot: true });
    });
    return { name: o.name, remain: o.remain, n: E.presentable(s, dv).length, slides: slides };
  }

  /* ───────── the control rooms (windows opened from their buildings on the map) ───────── */
  function ago(t) { var d = state.t - t; return d < 60 ? 'just now' : PC.dur(d) + ' ago'; }
  function bar(f, cls) { return '<span class="hbar"><i class="' + (cls || '') + '" style="width:' + Math.round(Math.max(0, Math.min(1, f)) * 100) + '%"></i></span>'; }
  function renderCCC(dv) {
    var s = state, b = s.beam, h = '';
    var col = dv.facs.filter(function (x) { return x.f.id === 'lhc' || x.f.id === 'sppbar'; }).pop();
    if (col) {
      var Lp = Math.exp(-b.age / PC.BAL.fillTau);
      h += '<h3 class="group-h"><span>Fills</span><span class="val">' + esc(col.f.name.replace(/ \(.*\)/, '')) + '</span></h3><dl class="kv">' +
        '<dt>Fill</dt><dd>' + (b.phase === 'stable' ? b.fill + ' · ' + PC.dur(b.age) + ' in' : b.phase === 'turn' ? (b.fill + 1) + ' · injecting, ' + PC.dur(b.turn) + ' to go' : '—') + '</dd>' +
        (b.phase === 'stable' ? '<dt>Luminosity</dt><dd>' + Math.round(Lp * 100) + '% of the peak · fill average so far ' + (fillAverage() / PC.BAL.fillPeak / PC.BAL.faultComp * 100).toFixed(0) + '%</dd>' : '') +
        '<dt>Refilling</dt><dd>' + PC.BAL.fillTurn + ' s without collisions · operators refill at ' + Math.round(PC.BAL.fillAutoAt * 100) + '% of the peak</dd></dl>' +
        '<p class="muted cr-note">Refill when the curve drops to the green dashes (the fill’s average so far, counting the refill): that maximises the luminosity you collect.</p>';
    }
    // the injection chain, as on CERN's own diagram: each machine a box, coloured by its state
    var tot = 0; dv.facs.forEach(function (x) { if (x.f.id !== 'cosmic') tot += x.raw; });
    function node(id) {
      var f = PC.FAC[id], x = dv.facs.filter(function (q) { return q.f.id === id; })[0], fault = b.fault && (!b.fault.fac || b.fault.fac === id);
      var coll = id === 'lhc' || id === 'sppbar';
      var st = s.ls ? ['off', 'shutdown'] : fault ? ['alarm', b.fault.name.replace(/ \(.*\)/, '').toLowerCase()] : coll && b.phase === 'turn' ? ['inj', 'injecting'] : f.role === 'injector' ? ['on', 'injecting'] : x && x.raw > 0 ? ['on', 'beam on'] : ['off', 'idle'];
      var E0 = f.beams.length ? PC.energy(x ? x.E[f.beams[0].b] : f.beams[0].E) : f.spec.split(' · ')[0];
      var share = f.role !== 'injector' && tot > 0 && x ? x.raw / tot : null;
      return '<div class="mnode ' + st[0] + '" title="' + esc(f.name + ' · ' + f.spec) + '"><b>' + esc(f.name.replace(/ \(.*\)/, '').replace('Super Proton Synchrotron', 'SPS').replace('Proton Synchrotron', 'PS').replace('Large Hadron Collider', 'LHC').replace('Antiproton Accumulator', 'AA')) + '</b>' +
        '<span class="me">' + esc(E0) + '</span><span class="ms"><i class="led"></i>' + esc(st[1]) + '</span>' +
        (share !== null ? '<span class="mshare" title="share of the collisions">' + bar(share) + '<em>' + Math.round(share * 100) + '%</em></span>' : '') + '</div>';
    }
    var linac = ['linac4', 'linac2', 'linac1'].filter(function (id) { return E.has(s, id); })[0];
    var chain = [linac, 'psb', 'ps', 'sps', 'lhc'].filter(function (id) { return id && E.has(s, id); });
    var side = ['aa', 'sppbar'].filter(function (id) { return E.has(s, id); });
    h += '<h3 class="group-h"><span>Injection chain</span><span class="val">beam flows left to right · bars: share of the collisions</span></h3>' +
      (chain.length ? '<div class="chain">' + chain.map(node).join('<span class="arr">→</span>') + '</div>' : '<p class="muted">No accelerator yet.</p>') +
      (side.length ? '<div class="chain side"><span class="arr">↳</span>' + side.map(node).join('<span class="arr">→</span>') + '</div>' : '');
    // faults and the people who fix them
    var faults = s.log.filter(function (l) { return l.kind === 'fault' && l.gen === s.gen && /^Fault|^Recovered/.test(l.text); }).slice(0, 4);
    h += '<h3 class="group-h"><span>Faults</span><span class="val">repairs ×' + E.repairSpeed(s).toFixed(2) + ' faster</span></h3>' +
      (faults.length ? '<ul class="cr-list">' + faults.map(function (l) { return '<li><span>' + esc(l.text) + '</span><span class="m">' + ago(l.t) + '</span></li>'; }).join('') + '</ul>' : '<p class="muted">No faults yet.</p>');
    var ap = s.staff.accphys || 0, te = s.staff.technician || 0;
    h += '<h3 class="group-h"><span>People</span><span class="val">in the control room while there is beam</span></h3><dl class="kv">' +
      '<dt>Accelerator physicists</dt><dd>' + ap + (ap ? ' · luminosity +' + Math.round(ap * 10) + '% · faster repairs' : ' · hire them for luminosity and faster repairs') + '</dd>' +
      '<dt>Technicians</dt><dd>' + te + ' · faster repairs and shutdowns</dd></dl>';
    setHTML($('cccBody'), h, h);
  }
  // the detector control room: health as a heatmap on the detector's own geometry, then data taking and the trigger
  function renderDCR(dv) {
    var s = state, m = dv.m, hs = E.detectorHealth(s), eb = expBeam(dv);
    var mode = dv.collider ? 'collider' : (E.has(s, 'ps') || E.has(s, 'sps')) ? 'fixed' : 'stand', health = {}, lanes = {};
    hs.forEach(function (x) { health[x.lane] = x.health; lanes[x.lane] = true; });
    // the three subsystems in words and numbers (the heatmap's table view)
    var lh = hs.map(function (x) {
      var cls = x.health < 0.6 ? 'alarm' : x.health < 0.85 ? 'warn' : '';
      return '<div class="lane" title="' + esc(x.tech.name + ' · ' + x.why) + '"><span class="ln">' + esc(x.name) + '</span>' + bar(x.health, cls) +
        '<span class="lv ' + cls + '">' + Math.round(x.health * 100) + '%</span><span class="lr">−' + (x.rate * 3600 * 100).toFixed(1) + '%/h of beam</span></div>';
    }).join('');
    var lk = hs.map(function (x) { return x.lane + Math.round(x.health * 100) + (x.rate * 3600 * 100).toFixed(1); }).join() + m.ageing.toFixed(2);
    setHTML($('dcrLanes'), lk, '<h3 class="group-h"><span>Detector health</span><span class="val">event quality ×' + m.ageing.toFixed(2) + ' from ageing · engineers slow it ÷' + E.ageingSlow(s).toFixed(2) + '</span></h3>' +
      (lh || '<p class="muted">Nothing that ages yet.</p>'));
    var hopts = { mode: mode, health: health, lanes: lanes, faults: s.dfaults };
    PC.HealthMap.draw($('dcrMap'), hopts);
    $('dcrMaps').style.height = PC.HealthMap.mapsHeight(mode, lanes) + 'px';
    PC.HealthMap.maps($('dcrMaps'), hopts, performance.now() / 1000);
    var nd = s.dfaults.filter(function (f) { return f.kind === 'dead'; }).length, nn = s.dfaults.length - nd;
    $('dcrFaultsH').textContent = (s.dfaults.length ? (nd ? nd + ' dead' : '') + (nd && nn ? ' · ' : '') + (nn ? nn + ' noisy' : '') + ' · quality ×' + m.dfaults.toFixed(3) : 'no faults') +
      ' · repairs ×' + E.dfaultRepairSpeed(s).toFixed(2);
    drawBeamStrip($('dcrBeam'));
    // data taking and the trigger: a few numbers, then the stream shares as one bar
    var live = lumiHist.length ? lumiHist.filter(function (p) { return p.v > 0.02; }).length / lumiHist.length : 0;
    var state0 = s.ls ? 'Long Shutdown' : eb.on ? 'stable beams · ' + PC.FAC[eb.fac].name.replace(/ \(.*\)/, '') : eb.off ? eb.off.text : 'cosmic rays only';
    function tile(k, v, sub) { return '<div class="tile"><span class="tk">' + k + '</span><span class="tv">' + v + '</span>' + (sub ? '<span class="ts">' + sub + '</span>' : '') + '</div>'; }
    var cols = ['var(--b1)', 'var(--ok)', 'var(--warn)', 'var(--dim)'];
    var h = '<p class="cr-now ' + (s.ls ? 'off' : eb.on ? 'on' : eb.off ? (eb.off.fault ? 'alarm' : 'inj') : 'off') + '"><i class="led"></i>' + esc(state0) + ' · beam ' + Math.round(live * 100) + '% of the last 30 min</p>' +
      '<div class="tiles">' + tile('Recorded', fmt(dv.recorded), 'events/s') + tile('Data', fmt(dv.dataRate), 'per second') +
      tile('Event quality', '×' + fmt(m.quality), m.pileup < 1 ? 'pile-up ×' + m.pileup : m.ageing < 0.995 ? 'ageing ×' + m.ageing.toFixed(2) : '') +
      tile('Magnet', m.B ? m.B + ' T' : '—', 'σm/m ' + (m.res * 100).toFixed(1) + '%') + '</div>';
    h += '<h3 class="group-h"><span>Trigger</span><span class="val">' + fmt(m.trigger) + ' events/s bandwidth · load ' + Math.round(dv.trigSat * 100) + '%' + (dv.trigSat > 1 ? ' · saturated' : '') + '</span></h3>' +
      '<div class="load">' + bar(Math.min(1, dv.trigSat), dv.trigSat > 1 ? 'alarm' : '') + '</div>';
    if (dv.streams.length > 1) h += '<div class="shares">' + dv.streams.map(function (x, i) {
      return '<i style="flex:' + Math.max(0.001, x.f) + ';background:' + cols[i % 4] + '" title="' + esc(x.name) + ' ' + Math.round(x.f * 100) + '%"></i>';
    }).join('') + '</div><div class="shares-l">' + dv.streams.map(function (x, i) {
      return '<span><i style="background:' + cols[i % 4] + '"></i>' + esc(x.name) + ' ' + Math.round(x.f * 100) + '%</span>';
    }).join('') + '<button class="cf-more" type="button" data-act="confopen">trigger menu ›</button></div>';
    if (dv.streams.length) h += '<div class="dcr-thr">' + dv.streams.map(function (x) {
      return '<span class="thr"><span class="tn">' + esc(x.sym) + '</span><button class="btn tw" type="button" data-act="thr" data-id="' + x.id + '" data-d="-1" aria-label="Lower the ' + esc(x.name) + ' threshold"' + (x.level <= 0 ? ' disabled' : '') + '>‹</button>' +
        '<span class="tv">' + thrLabel(x) + '</span><button class="btn tw" type="button" data-act="thr" data-id="' + x.id + '" data-d="1" aria-label="Raise the ' + esc(x.name) + ' threshold"' + (x.level >= x.levels.length - 1 ? ' disabled' : '') + '>›</button></span>';
    }).join('') + '</div>';
    var de = s.staff.deteng || 0;
    h += '<p class="muted cr-note">' + (de ? de + ' detector engineer' + (de > 1 ? 's' : '') + ': trigger +' + Math.round(de * 10) + '%, quality +' + Math.round(de * 5) + '%, ageing ÷' + E.ageingSlow(s).toFixed(2) + '.'
      : 'Detector engineers would raise the trigger bandwidth and quality and slow the ageing.') + ' Every Long Shutdown refurbishes the whole detector.</p>';
    setHTML($('dcrMain'), h, h);
    // noisy channels: each fires fake triggers until it is masked (by you, or by the shift crew after a while)
    var noisy = s.dfaults.filter(function (f) { return f.kind === 'noisy'; });
    var nh = noisy.length ? '<h3 class="group-h"><span>Noisy channels</span><span class="val">' + (dv.fakeRate > 0 ? '<b class="lost">' + Math.round(dv.fakeRate / Math.max(1, dv.recorded) * 100) + '% of the recorded events are fakes</b>' : 'all masked · no fake triggers') + '</span></h3><ul class="noisy">' +
      noisy.map(function (f) {
        var left = Math.max(0, PC.BAL.autoMask - f.age);
        return '<li><span class="nw">' + esc(PC.AGEING[f.lane].name) + ': ' + esc(f.what) + '</span>' +
          (f.masked ? '<span class="nm">masked' + (f.masked === 'crew' ? ' by the shift crew' : '') + ' · ' + Math.round((1 - f.remain / f.total) * 100) + '% repaired</span>'
            : '<span class="nm lost">firing fake triggers' + (left > 0 ? ' · crew masks it in ' + PC.dur(left) : '') + '</span><button class="btn" type="button" data-act="mask" data-id="' + f.id + '" title="Stops the fake triggers; costs a little more quality than the noise until it is repaired">Mask</button>');
      }).join('') + '</ul>' : '';
    setHTML($('dcrNoisy'), noisy.map(function (f) { return f.id + (f.masked || '') + Math.round((1 - f.remain / f.total) * 20) + Math.ceil(Math.max(0, PC.BAL.autoMask - f.age) / 5); }).join() + (dv.fakeRate > 0 ? Math.round(dv.fakeRate / Math.max(1, dv.recorded) * 100) : ''), nh);
    // the shutdown button sits apart, so the live numbers never rebuild it under the pointer
    var pend = E.pendingTech(s), a;
    if (s.ls) a = '<p class="muted">Long Shutdown ' + s.ls.n + ' · ' + PC.dur(s.ls.remain) + ' left. The detector is being refurbished.</p>';
    else if (pend.length) a = '<button class="btn alarm wide" type="button" data-act="ls" title="Installs the waiting upgrades and refurbishes the whole detector">Long Shutdown · ' + pend.length + ' upgrade' + (pend.length > 1 ? 's' : '') + ' · ' + PC.dur(E.shutdownDuration(s)) + '</button>';
    else a = '<button class="btn alarm wide" type="button" data-act="maint" title="Refurbishes the whole detector; no beam meanwhile"' + (hs.some(function (x) { return x.health < 0.999; }) ? '' : ' disabled') + '>Maintenance shutdown · ' + PC.dur(E.maintDuration(s)) + '</button>';
    setHTML($('dcrAct'), s.ls ? 'ls' + Math.round(s.ls.remain / 5) : a, a);
  }
  // the last 30 minutes at the detector: beam (green), faults (red), shutdown (grey), nothing (blank)
  function drawBeamStrip(cv) {
    var r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, W = r.width, H = r.height;
    if (!W) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    var ctx = cv.getContext('2d'), cs = getComputedStyle(document.documentElement), now = state.t;
    function col(k) { return cs.getPropertyValue(k).trim(); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = col('--rule'); ctx.globalAlpha = 0.35; ctx.fillRect(0, 0, W, H - 12); ctx.globalAlpha = 1;
    lumiHist.forEach(function (p, i) {
      var nx = lumiHist[i + 1] ? lumiHist[i + 1].t : now, x0 = (p.t - (now - 1800)) / 1800 * W, x1 = (nx - (now - 1800)) / 1800 * W;
      if (nx - p.t > 10) return;
      ctx.fillStyle = p.fault ? col('--b2') : p.ls ? col('--dim') : p.v > 0.02 ? col('--ok') : 'transparent';
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0 + 0.5), H - 12);
    });
    ctx.font = '9px ' + col('--mono'); ctx.fillStyle = col('--faint');
    ctx.fillText('−30 min', 0, H - 2); ctx.textAlign = 'right'; ctx.fillText('now', W, H - 2);
    ctx.textAlign = 'center'; ctx.fillText('green: beam · red: fault · grey: shutdown', W / 2, H - 2); ctx.textAlign = 'left';
  }
  function renderControlRooms(dv) {
    if (PC.Win.isOpen('ccc')) renderCCC(dv);
    if (PC.Win.isOpen('dcr')) {
      if (!$('dcrMain')) {
        $('dcrBody').innerHTML = '<div id="dcrAct" class="cr-act"></div><div id="dcrLanes"></div>' +
          '<div class="hm-wrap"><canvas id="dcrMap" aria-label="Detector health heatmap"></canvas><div class="hm-tip" id="dcrTip" hidden></div></div>' +
          '<h3 class="group-h"><span>Subdetector maps</span><span class="val" id="dcrFaultsH"></span></h3>' +
          '<div class="hm-wrap"><canvas id="dcrMaps" aria-label="Health and faults of each subdetector, unrolled. Click a noisy channel to mask it."></canvas><div class="hm-tip" id="dcrTip2" hidden></div></div>' +
          '<div id="dcrNoisy"></div>' +
          '<h3 class="group-h"><span>Data taking</span><span class="val">last 30 minutes</span></h3><canvas id="dcrBeam" class="beam-strip" aria-label="Beam at the detector over the last 30 minutes"></canvas>' +
          '<div id="dcrMain"></div>';
        PC.HealthMap.attach($('dcrMap'), $('dcrTip'));
        PC.HealthMap.attach($('dcrMaps'), $('dcrTip2'), function (f) { if (E.maskChannel(state, f.id)) { keys = {}; render(); } });
      }
      renderDCR(dv);
    }
  }

  /* ───────── conferences (under the analysis lens) ───────── */
  function renderConf(dv) {
    var s = state, c = s.conf, k, h;
    if (c.open) {
      // the name and time left are in the hall's title; here only what can be presented, as pills beside the screen
      var list = E.presentable(s, dv).sort(function (a, b) { return b.sigma - a.sigma; }), show = list.slice(0, 3);
      k = 'open' + c.open.name + list.map(function (x) { return x.id; }).join();
      h = show.map(function (x) {
        var it = x.kind === 'disc' ? PC.DISCMAP[x.id] : PC.EXCMAP[x.id];
        return '<button class="btn present cf-pill" type="button" data-act="present" data-id="' + x.id + '" title="Present ' + esc(it.name) + (x.kind === 'exc' ? ' (an unexpected excess)' : '') + ' at ' + esc(c.open.name) + '">' +
          '▸ ' + esc(it.particle.split(/ → | = |, /)[0]) + ' <span data-op="psig:' + x.kind + ':' + x.id + '"></span></button>';
      }).join('') + (list.length > 3 ? '<button class="cf-more" type="button" data-act="confopen">+' + (list.length - 3) + ' more</button>' : '');
    } else { k = 'none'; h = ''; }                     // between conferences the hall's own screen says what's next
    setHTML($('confBox'), k, h);
  }

  /* ───────── papers in review (under the analysis lens) ───────── */
  function paperShort(p) { var r = PC.RESULTS[p.id]; return r ? r.q : p.name; }

  // the two control rooms drawn under the map
  function feedCtrlRooms(dv) {
    var s = state, b = s.beam, eb = expBeam(dv), hs = E.detectorHealth(s), health = {}, lanes = {};
    hs.forEach(function (x) { health[x.lane] = x.health; lanes[x.lane] = true; });
    var worst = hs.reduce(function (a, x) { return Math.min(a, x.health); }, 1);
    var machines = PC.FACILITIES.filter(function (f) { return f.id !== 'cosmic' && E.has(s, f.id); }).map(function (f) {
      var x = dv.facs.filter(function (q) { return q.f.id === f.id; })[0], fault = b.fault && (!b.fault.fac || b.fault.fac === f.id);
      return { id: f.id, st: s.ls ? 'off' : fault ? 'alarm' : (f.id === 'lhc' || f.id === 'sppbar') && b.phase === 'turn' ? 'inj' : f.role === 'injector' || (x && x.raw > 0) ? 'on' : 'off' };
    });
    var status = s.ls ? 'shutdown' : b.fault ? 'repairing' : b.phase === 'stable' ? 'fill ' + b.fill + ' · ' + Math.round(Math.exp(-b.age / PC.BAL.fillTau) * 100) + '%' :
      b.phase === 'turn' ? 'injecting' : machines.length ? 'beam on' : '';
    PC.CtrlRooms.set({ now: s.t,
      acc: { on: machines.length > 0, ls: !!s.ls, fault: b.fault ? b.fault.name.replace(/ \(.*\)/, '') : null, people: 2 + PC.People.shown(s.staff.accphys, 5),
        hist: lumiHist, machines: machines, status: status,
        big: s.ls ? 'SHUTDOWN' : b.fault ? 'FAULT' : b.phase === 'stable' ? 'FILL ' + b.fill : b.phase === 'turn' ? 'INJECT' : 'BEAM' },
      det: { on: !!eb.fac, ls: !!s.ls, alarm: eb.off && eb.off.fault ? 'BEAM LOST' : null, beamNow: eb.on, people: 2 + PC.People.shown(s.staff.deteng, 6), hist: lumiHist,
        health: { mode: dv.collider ? 'collider' : (E.has(s, 'ps') || E.has(s, 'sps')) ? 'fixed' : 'stand', health: health, lanes: lanes },
        worst: Math.round(worst * 100), worstCol: worst < 0.6 ? 'b2' : worst < 0.85 ? 'warn' : 'dim', faults: s.dfaults.length,
        fakes: dv.fakeRate > 0 && dv.recorded > 0 ? Math.max(1, Math.round(dv.fakeRate / dv.recorded * 100)) : 0 } });
  }

  function renderOps(dv) {
    var s = state, b = s.beam, f = b.fault, c = s.conf;
    renderBeamOps(dv); renderConf(dv); feedCtrlRooms(dv);
    // live numbers without rebuilding the buttons
    document.querySelectorAll('[data-op]').forEach(function (el) {
      var w = el.getAttribute('data-op');
      if (w === 'fault' && f) el.textContent = PC.dur(f.remain / E.repairSpeed(s));
      else if (w === 'lumi') el.textContent = Math.round(Math.exp(-b.age / PC.BAL.fillTau) * 100) + '%';
      else if (w === 'turn') el.textContent = PC.dur(b.turn);
      else if (w === 'conf') el.textContent = PC.dur(c.open ? c.open.remain : c.next - s.t);
      else if (w.indexOf('pbar:') === 0) {
        var pp = s.papers.filter(function (q) { return q.id === w.slice(5); })[0];
        if (pp) el.style.width = Math.min(100, pp.t / pp.dur * 100).toFixed(1) + '%';
      }
      else if (w.indexOf('psig:') === 0) {
        var p = w.split(':'), sg = p[1] === 'disc' ? E.discoveryInfo(s, PC.DISCMAP[p[2]], dv).sigma : E.excessInfo(s, PC.EXCMAP[p[2]], dv).sigma;
        el.textContent = Math.min(5, sg).toFixed(1) + 'σ';
      }
    });
  }

  /* ───────── analyses ───────── */
  function analysisInfos(dv) {
    return PC.DISCOVERIES.map(function (d) { return E.discoveryInfo(state, d, dv); });
  }
  function renderAnalyses(dv) {
    var s = state, infos = analysisInfos(dv);
    var active = infos.filter(function (i) { return s.disc[i.d.id] && s.disc[i.d.id].active && !i.done; });
    var ready = infos.filter(function (i) { return i.eligible && !(s.disc[i.d.id] && s.disc[i.d.id].active); });
    var next = infos.filter(function (i) { return !i.done && !i.eligible; }).slice(0, 2);
    var done = infos.filter(function (i) { return i.done; });
    var free = dv.m.slots - active.length;
    var pres = {};
    E.presentable(s, dv).forEach(function (x) { pres[x.id] = true; });
    var conf = s.conf.open;
    var excs = PC.EXCESSES.map(function (e) { return E.excessInfo(s, e, dv); }).filter(function (i) { return i.seen || i.done || i.faded; });
    var k = [selAnalysis, free, s.flags.autoQueue, active.map(function (i) { return i.d.id + (i.shown ? '*' : ''); }), ready.map(function (i) { return i.d.id; }),
      next.map(function (i) { return i.d.id + i.missCaps.length + i.machines.length; }), done.length, conf ? conf.name : '', Object.keys(pres).join(),
      excs.map(function (i) { return i.e.id + i.done + i.faded + !!i.shown; }), trigKey(dv)].join('|');
    var h = renderTrigger(dv);
    if (conf) h += '<p class="conf-note"><b>' + esc(conf.name) + ' is open</b> · <span data-dyn="conft:x"></span> left. Present results at 3σ or more for reputation now. ' +
      'If an unexpected excess you show later fades, it is withdrawn and costs twice what it earned.</p>';
    h += '<h3 class="block-h"><span>Analyses</span><span class="val">' + active.length + ' of ' + dv.m.slots + ' slots · ' +
      '<label class="toggle"><input type="checkbox" id="autoq" data-act="autoq"' + (s.flags.autoQueue !== false ? ' checked' : '') + '> auto-start</label></span></h3>';
    function arow(i, mode) {
      var d = i.d, sel = selAnalysis === d.id;
      var extra = '', act = '';
      if (mode === 'active' || mode === 'ready') {
        extra = '<div class="sig"><div class="ladder" data-dyn="sigbar:' + d.id + '"><i></i></div><span class="n" data-dyn="sig:' + d.id + '"></span></div>' +
          '<div class="fx"><span data-dyn="eta:' + d.id + '"></span><span>' + i.machines.map(function (f) { return esc(f.name.replace(/ \(.*\)/, '')); }).join(' · ') + '</span></div>';
        if (i.shown) extra += '<div class="fx"><span class="shown">shown at ' + esc(i.shown) + '</span></div>';
        if (i.trigEff < 0.995) extra += '<div class="fx"><span class="lost">the ' + esc(PC.STREAMMAP[d.stream].name.toLowerCase()) + ' threshold keeps ' + Math.round(i.trigEff * 100) + '% of the signal (needs ' + d.thrNeed + ' GeV)</span></div>';
        act = mode === 'active' ? (pres[d.id] ? presentBtn(d.id, conf) : '') + actBtn('stopA', d.id, undefined, 'Pause') : '<button class="btn" type="button" data-act="startA" data-id="' + d.id + '"' + (free > 0 ? '' : ' disabled title="All analysis slots are busy"') + '>Start</button>';
      } else {
        var miss = [];
        if (!i.machines.length) miss.push(Object.keys(d.via).map(function (b) { return PC.BEAM_LABEL[b] + (d.via[b] > 0 ? ' ≥ ' + PC.energy(d.via[b]) : ''); }).join(' or '));
        i.missCaps.forEach(function (c) { miss.push(PC.Text.capName(c)); });
        extra = '<div class="needs">Needs <b>' + miss.map(esc).join('</b>, <b>') + '</b></div>';
        act = statusTxt('Not yet');
      }
      return row({ cls: (mode === 'active' ? 'available' : mode === 'ready' ? 'pending' : 'locked') + ' arow' + (sel ? ' sel' : ''),
        attr: ' data-sel="' + d.id + '"', yr: d.speculative ? 'future' : d.year,
        name: esc(d.name) + ' <span class="sym">' + esc(d.particle) + '</span>', extra: extra, act: act });
    }
    h += active.map(function (i) { return arow(i, 'active'); }).join('');
    h += ready.map(function (i) { return arow(i, 'ready'); }).join('');
    if (!active.length && !ready.length) h += '<p class="muted">' + (next.length ? 'The next analyses need more equipment. Each row lists what is missing; the tech tree shows how to get it.' : 'Every analysis on this path is done.') + '</p>';
    h += next.map(function (i) { return arow(i, 'next'); }).join('');
    if (excs.length) {
      h += '<h3 class="block-h exc-h"><span>Unexpected excesses</span><span class="val">nobody was looking for these · real, or flukes?</span></h3>';
      h += excs.map(function (i) {
        var e = i.e, st = i.done ? 'confirmed' : i.faded ? (i.shown ? 'gone · withdrawn' : 'gone with more data') : '';
        var extra = i.done || i.faded ? '<div class="fx"><span class="' + (i.faded && i.shown ? 'ls' : '') + '">' + st + '</span>' + (i.shown ? '<span class="shown">shown at ' + esc(i.shown) + '</span>' : '') + '</div>'
          : '<div class="sig"><div class="ladder" data-dyn="esigbar:' + e.id + '"><i></i></div><span class="n" data-dyn="esig:' + e.id + '"></span></div>' +
            '<div class="fx"><span>' + esc(PC.STREAMMAP[e.stream].name) + ' stream</span>' + (i.trigEff < 0.995 ? '<span class="lost">threshold keeps ' + Math.round(i.trigEff * 100) + '%</span>' : '') + (i.shown ? '<span class="shown">shown at ' + esc(i.shown) + '</span>' : '') + '</div>';
        return row({ cls: (i.done ? 'owned' : i.faded ? 'locked' : 'pending') + ' arow exc' + (selAnalysis === e.id ? ' sel' : ''), attr: ' data-sel="' + e.id + '"',
          yr: e.year, name: esc(e.name) + ' <span class="sym">' + esc(e.particle) + '</span>', extra: extra,
          act: pres[e.id] ? presentBtn(e.id, conf) : '' });
      }).join('');
    }
    if (done.length) {
      h += '<div class="observed"><span class="ob-h">Observed</span>' + done.map(function (i) {
        return '<button type="button" class="ob' + (selAnalysis === i.d.id ? ' sel' : '') + '" data-sel="' + i.d.id + '" title="' + esc(i.d.name) + (i.d.nobel ? ' · Nobel ' + esc(i.d.nobel) : '') + '">' + esc(i.d.particle) + '</button>';
      }).join('') + '</div>';
    }
    setHTML($('analyses'), k, h);
  }
  function presentBtn(id, conf) {
    return '<button class="btn present" type="button" data-act="present" data-id="' + id + '" title="Show this result at ' + esc(conf.name) + '">Present</button>';
  }
  // the trigger menu: weights per stream; shares matter once the trigger is saturated
  function trigKey(dv) {
    return dv.streams.map(function (x) { return x.id + x.w + 't' + x.level + (x.fake > 0 ? 'f' : ''); }).join() + (dv.trigSat > 1) +
      PC.DISCOVERIES.concat(PC.EXCESSES).map(function (d) { var st = d.thrNeed ? E.thrEff(state, d, dv) : 1; return st < 1 ? d.id + Math.round(st * 100) : ''; }).join('');
  }
  function thrLabel(x) { return x.v.replace('_T', '<sub>T</sub>') + ' > ' + x.thr + ' GeV'; }
  function renderTrigger(dv) {
    if (!dv.streams.length) return '';
    var s = state, uses = {}, one = dv.streams.length < 2;
    // the running searches on each stream, and how much of their signal the threshold lets through
    function use(d, run) {
      if (!run || !d.stream) return;
      var te = E.thrEff(s, d, dv), nm = esc(d.particle.split(/ → | = |, /)[0]);
      (uses[d.stream] = uses[d.stream] || []).push(te < 0.995 ? '<b class="lost" title="' + esc(d.name) + ' needs ' + d.thrNeed + ' GeV">' + nm + ' ' + Math.round(te * 100) + '%</b>' : nm);
    }
    PC.DISCOVERIES.forEach(function (d) { var st = s.disc[d.id]; use(d, st && st.active && !st.done); });
    PC.EXCESSES.forEach(function (e) { var st = s.exc[e.id]; use(e, st && st.s2 && !st.done && !st.faded); });
    var fk = dv.fakeRate > 0 ? ' · <b class="lost">' + Math.round(dv.fakeRate / Math.max(1, dv.recorded) * 100) + '% fake triggers</b>' : '';
    var h = '<h3 class="block-h"><span>Trigger menu</span><span class="val">' + (dv.trigSat > 1 ? 'saturated: ' + (one ? 'only part of the events is kept' : 'the shares decide what is kept')
      : 'not saturated: every stream is kept in full') + fk + '</span></h3>' +
      '<p class="trig-help muted">' + (one ? 'More streams come with the calorimeters and a hermetic detector. ' : 'Share: the bandwidth each stream gets when the trigger is full. ') +
      'Threshold: a higher cut keeps fewer, harder events; searches below it lose signal (red).</p><div class="trig' + (one ? ' one' : '') + '">';
    dv.streams.forEach(function (x) {
      var dots = '';
      for (var i = 0; i < 4; i++) dots += '<i class="' + (i < x.w ? 'on' : '') + '"></i>';
      h += '<div class="tstream"><span class="tname">' + esc(x.name) + '</span>' +
        '<button class="btn tw" type="button" data-act="trig" data-id="' + x.id + '" data-d="-1" aria-label="Less ' + esc(x.name) + '"' + (x.w <= 0 ? ' disabled' : '') + '>−</button>' +
        '<span class="dots">' + dots + '</span>' +
        '<button class="btn tw" type="button" data-act="trig" data-id="' + x.id + '" data-d="1" aria-label="More ' + esc(x.name) + '"' + (x.w >= 4 ? ' disabled' : '') + '>+</button>' +
        '<span class="tpct" data-dyn="tpct:' + x.id + '"></span>' +
        '<span class="thr"><button class="btn tw" type="button" data-act="thr" data-id="' + x.id + '" data-d="-1" aria-label="Lower the ' + esc(x.name) + ' threshold"' + (x.level <= 0 ? ' disabled' : '') + '>‹</button>' +
        '<span class="tv" title="input rate ×' + Math.pow(x.levels[0] / x.thr, 2).toFixed(2) + '">' + thrLabel(x) + '</span>' +
        '<button class="btn tw" type="button" data-act="thr" data-id="' + x.id + '" data-d="1" aria-label="Raise the ' + esc(x.name) + ' threshold"' + (x.level >= x.levels.length - 1 ? ' disabled' : '') + '>›</button></span>' +
        '<span class="tg" data-dyn="tg:' + x.id + '"></span>' +
        '<span class="tuse">' + (x.fake > 0 ? '<b class="lost">a noisy channel fires fake triggers here</b>' + (uses[x.id] ? ' · ' : '') : '') + (uses[x.id] ? 'running: ' + uses[x.id].join(' · ') : '') + '</span></div>';
    });
    return h + '</div>';
  }
  function patchAnalyses(dv) {
    var s = state, cache = {}, sm = {};
    dv.streams.forEach(function (x) { sm[x.id] = x; });
    $('analyses').querySelectorAll('[data-dyn]').forEach(function (el) {
      var p = el.getAttribute('data-dyn').split(':'), id = p[1];
      if (p[0] === 'tpct') { if (sm[id]) el.textContent = Math.round(sm[id].f * 100) + '%'; return; }
      if (p[0] === 'tg') {
        if (!sm[id]) return;
        var g = sm[id].g;
        el.textContent = Math.abs(g - 1) < 0.02 ? '' : '×' + g.toFixed(2);
        el.className = 'tg' + (g > 1.02 ? ' up' : g < 0.98 ? ' down' : '');
        return;
      }
      if (p[0] === 'conft') { el.textContent = s.conf.open ? PC.dur(s.conf.open.remain) : ''; return; }
      if (p[0] === 'esig' || p[0] === 'esigbar') {
        var ei = cache['e' + id] || (cache['e' + id] = E.excessInfo(s, PC.EXCMAP[id], dv)), es = Math.min(5, ei.sigma);
        if (p[0] === 'esig') el.textContent = es.toFixed(1) + 'σ';
        else { el.firstChild.style.width = (es / 5 * 100) + '%'; el.classList.toggle('ev', es >= 3); }
        return;
      }
      var info = cache[id] || (cache[id] = E.discoveryInfo(s, PC.DISCMAP[id], dv));
      var sig = Math.min(5, info.sigma);
      if (p[0] === 'sig') el.textContent = sig.toFixed(1) + 'σ';
      else if (p[0] === 'sigbar') { el.firstChild.style.width = (sig / 5 * 100) + '%'; el.classList.toggle('ev', sig >= 3); }
      else if (p[0] === 'eta') {
        var st = s.disc[id];
        var rem = info.rate > 0 ? (info.d.need - info.S) / info.rate : Infinity;
        el.textContent = !(st && st.active) ? 'paused' : s.ls ? 'paused · no beam' : isFinite(rem) ? '5σ in ~' + PC.dur(rem) : '';
      }
    });
  }

  /* ───────── plot ───────── */
  function drawPlot(dv) {
    var s = state, d = selAnalysis ? PC.DISCMAP[selAnalysis] : null;
    if (selAnalysis && PC.EXCMAP[selAnalysis]) {
      var e = PC.EXCMAP[selAnalysis], ei = E.excessInfo(s, e, dv), sg = ei.done ? 5 : ei.sigma;
      var he = PC.Physics.histogram(e, { sqrtS: Math.max(dv.sqrtS, 2.2), res: dv.m.res, frac: Math.pow(sg / 5, 2), sigma: sg });
      var me = { title: e.name, sub: ei.done ? 'confirmed' : ei.faded ? 'gone with more data' : 'unexpected excess · ' + PC.STREAMMAP[e.stream].name.toLowerCase() + ' stream', sigma: sg, done: ei.done };
      PC.Plot.draw(he, me); PC.Rooms.plot(he, me);
      return;
    }
    if (!d) {
      var act = PC.DISCOVERIES.filter(function (x) { return s.disc[x.id] && s.disc[x.id].active && !s.disc[x.id].done; })[0];
      d = act || (dv.sqrtS > 2 ? null : PC.DISCMAP.cosmicMu);    // before any beam: the cosmic muon spectrum
    }
    var exposure = Math.log10(1 + s.runTotals.data) / 1.6;
    if (!d) {
      var hd = PC.Physics.histogram(null, { sqrtS: Math.max(dv.sqrtS, 2.2), res: dv.m.res, exposure: exposure });
      var md = { title: 'Dimuon spectrum', sub: dv.sqrtS ? '√s = ' + PC.energy(dv.sqrtS) + ' · ' + fmt(s.runTotals.data) + ' events' : 'needs a beam: cosmics have no peaks' };
      PC.Plot.draw(hd, md); PC.Rooms.plot(hd, md);
      return;
    }
    var info = E.discoveryInfo(s, d, dv), st = s.disc[d.id];
    var frac = st ? (st.done ? 1.2 : st.S / d.need) : 0;
    var h = PC.Physics.histogram(d, { sqrtS: Math.max(dv.sqrtS, 2.2), res: dv.m.res, exposure: exposure, frac: frac, sigma: info.done ? 5 : info.sigma });
    var meta = { title: d.name, sub: (dv.sqrtS ? '√s = ' + PC.energy(dv.sqrtS) + ' · ' : '') + (info.done ? 'published' : st && st.active ? 'analysis running' : 'not running'),
      sigma: info.done ? 5 : info.sigma, done: info.done };
    PC.Plot.draw(h, meta); PC.Rooms.plot(h, meta);
  }

  /* ───────── the Analyses window: analyses and papers, one section at a time ───────── */
  var anaPane = 'analyses';
  try { anaPane = localStorage.getItem('particle-clicker.anaPane') === 'papers' ? 'papers' : 'analyses'; } catch (e) { /* private mode */ }
  function setPane(p) {
    anaPane = p === 'papers' ? 'papers' : 'analyses';
    try { localStorage.setItem('particle-clicker.anaPane', anaPane); } catch (e) { /* private mode */ }
    applyPane();
  }
  function applyPane() {
    var paper = anaPane === 'papers';
    $('paneAna').hidden = paper; $('wPubs').hidden = !paper;
    $('anaWinSub').textContent = paper ? 'submit · internal review · journals' : 'click a row to see its plot';
    document.querySelectorAll('[data-act="anapane"]').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-id') === anaPane)); });
    keys = {}; plotT = 0;
    if (!paper) PC.Plot.resize();                       // the plot's canvas was hidden: size it again
  }

  /* ───────── launcher & windows ───────── */
  var TABS = [{ id: 'upgrades', name: 'Upgrades' }, { id: 'analyses', name: 'Analyses' }, { id: 'staff', name: 'Staff' },
    { id: 'log', name: 'Logbook' }, { id: 'lab', name: 'Lab' }];
  // badges say where something needs you: a count of things to do, or a dot
  function badges(dv) {
    var s = state, b = {};
    var buy = 0;
    PC.FACILITIES.forEach(function (f) { if (E.facStatus(s, f) === 'available' && s.funds >= f.cost) buy++; });
    PC.TECH.forEach(function (t) { if (E.techStatus(s, t) === 'available' && s.funds >= t.cost) buy++; });
    if (buy) b.upgrades = buy;
    var ready = PC.DISCOVERIES.filter(function (d) { var st = s.disc[d.id]; return !(st && (st.active || st.done)) && E.discoveryInfo(s, d, dv).eligible; }).length;
    if (ready && E.activeCount(s) < dv.m.slots) b.analyses = ready;
    else if (E.presentable(s, dv).length) b.analyses = '•';
    if (PC.STAFF.some(function (st) { return E.staffStatus(s, st) === 'available' && s.funds >= E.staffCost(s, st); })) b.staff = '•';
    if (!b.analyses && !dv.m.autoPublish && s.papers.length < E.paperSlots(s) && E.measurements(s).some(function (m) { return m.cost <= s.data && !E.inReview(s, m.id); })) b.analyses = '•';   // a paper could be submitted
    if (E.canPrestige(s)) b.lab = '•';
    return b;
  }
  function renderTabs(dv) {
    var bd = badges(dv), open = TABS.map(function (t) { return PC.Win.isOpen(t.id) ? 1 : 0; }).join(''), k = open + JSON.stringify(bd);
    setHTML($('tabs'), k, TABS.map(function (t, i) {
      var v = bd[t.id];
      return '<button class="tab" type="button" data-win="' + t.id + '" aria-pressed="' + PC.Win.isOpen(t.id) + '" title="' + t.name + ' (key ' + (i + 1) + ')">' + t.name +
        (v === undefined ? '' : v === '•' ? '<i class="led"></i>' : '<span class="badge">' + v + '</span>') + '</button>';
    }).join(''));
  }
  function renderStaff() {
    var h = '';
    PC.STAFF.forEach(function (st) {
      var s = E.staffStatus(state, st);
      if (s === 'hidden') return;
      var c = E.staffCost(state, st);
      h += row({ cls: 'staff ' + (s === 'locked' ? 'locked' : 'available'), yr: state.staff[st.id] || 0, name: esc(st.name), desc: esc(st.desc),
        extra: s === 'locked' ? '<div class="needs">Requires <b>' + E.missing(state, st).map(function (id) { return esc(E.name(id)); }).join('</b>, <b>') + '</b></div>' : '',
        cost: s === 'available' ? money(c) : '', act: s === 'available' ? actBtn('hire', st.id, c, 'Hire') : statusTxt(s === 'maxed' ? 'Full' : 'Locked') });
    });
    return h;
  }
  // a paper's way through review: two stages, a bar for the current one
  function paperStage(p) {
    return p.stage === 'internal' ? (p.round > 1 ? 'internal review · round ' + p.round : 'internal review')
      : (p.revisions ? 'revision ' + p.revisions + ' · ' : 'referees · ') + p.journal;
  }
  function renderPubs(dv) {
    var s = state, ms = E.measurements(s), odds = E.reviewOdds(s), slots = E.paperSlots(s);
    var h = '<h3 class="group-h"><span>In review</span><span class="val">' + s.papers.length + ' of ' + slots + ' · ' +
      (dv.m.autoPublish ? '<label class="toggle"><input type="checkbox" id="autopub" data-act="autopub"' + (s.flags.autoPub ? ' checked' : '') + '> auto-submit</label>' : 'ROOT unlocks automatic submission') + '</span></h3>';
    h += '<p class="muted win-note review-odds">Each paper passes the collaboration’s internal review, then a journal’s referees. ' +
      'Odds now: sent back internally <b>' + Math.round(odds.redo * 100) + '%</b> · revisions <b>' + Math.round(odds.revise * 100) + '%</b> · rejected (start over) <b>' + Math.round(odds.reject * 100) + '%</b>. ' +
      'Postdocs, professors and better software lower them; graduate students and the Web speed reviews up; analysis groups let more papers be in review at once.</p>';
    if (!s.papers.length) h += '<p class="muted">Nothing in review. Submit a paper below.</p>';
    s.papers.forEach(function (p) {
      h += '<div class="paper"><span class="pn">' + esc(p.name) + ' <span class="sym">#' + (p.level + 1) + '</span></span>' +
        '<span class="ps" data-dyn="pstage:' + p.id + '"></span>' +
        '<div class="pbar"><i class="' + p.stage + '" data-dyn="pbar:' + p.id + '"></i></div></div>';
    });
    h += '<h3 class="group-h"><span>Submit</span><span class="val">costs data · reputation when accepted · shown at the next conference</span></h3>';
    ms.slice().reverse().forEach(function (x) {
      var busy = E.inReview(s, x.id);
      h += row({ cls: busy ? 'pending' : 'available', yr: '<span data-dyn="mlvl:' + x.id + '"></span>', name: esc(x.name),
        extra: '<div class="fx"><span data-dyn="mrep:' + x.id + '"></span><span>' + esc(x.src) + '</span></div>',
        cost: '<span data-dyn="mcost:' + x.id + '"></span>',
        act: busy ? statusTxt('In review') : '<button class="btn" type="button" data-act="pub" data-id="' + x.id + '" data-dyn="mbtn:' + x.id + '">Submit</button>' });
    });
    return h;
  }
  function renderLog() {
    return '<ol class="logbook">' +
      state.log.slice(0, 100).map(function (l) { return '<li class="' + l.kind + '"><span class="y">' + l.y + '</span><span>' + esc(l.text) + '</span></li>'; }).join('') + '</ol>';
  }
  function renderLab() {
    var s = state, gain = E.prestigeGain(s), h = '';
    h += '<h3 class="group-h"><span>Next generation</span><span class="val">Legacy ' + s.legacy + ' · +' + Math.round(s.legacy * PC.BAL.legacyEach * 100) + '% luminosity and funding</span></h3>';
    h += row({ cls: E.canPrestige(s) ? 'available' : 'locked', name: 'Propose the Future Circular Collider',
      desc: 'Hand the lab to the next generation. Everything resets except Legacy, earned as √(reputation ÷ 10⁴); each point adds 10% luminosity and funding. The FCC itself arrives in a later update.',
      cost: E.canPrestige(s) ? '+' + gain + ' Legacy' : '',
      act: E.canPrestige(s) ? '<button class="btn alarm" type="button" data-act="prestige">' + (confirmKey === 'prestige' ? 'Confirm' : 'Propose') + '</button>' : statusTxt('After the Higgs') });
    h += '<h3 class="group-h"><span>This laboratory</span><span class="val">generation ' + (s.gen + 1) + '</span></h3><dl class="kv">' +
      '<dt>Time in this generation</dt><dd>' + PC.dur(s.t) + '</dd>' +
      '<dt>Runs · Long Shutdowns</dt><dd>' + s.run + ' · ' + s.lsCount + '</dd>' +
      '<dt>Data recorded</dt><dd>' + fmt(s.runTotals.data) + '</dd>' +
      '<dt>Clicks</dt><dd>' + fmt(s.runTotals.clicks) + '</dd>' +
      '<dt>Total play time</dt><dd>' + PC.dur(s.life.t) + '</dd></dl>';
    h += '<h3 class="group-h"><span>Save</span><span class="val">autosaves in this browser</span></h3><div class="tools">' +
      '<button class="btn" type="button" data-act="export">Export</button><button class="btn" type="button" data-act="import">Import</button>' +
      '<button class="btn alarm" type="button" data-act="reset">' + (confirmKey === 'reset' ? 'Confirm wipe' : 'Hard reset') + '</button></div>' +
      '<textarea class="io" id="ioBox" placeholder="Export puts your save here. Paste a save and press Import to restore it."></textarea>' +
      '<p class="muted">Progress continues while you are away, for up to 12 hours.</p>';
    return h;
  }
  var LOWER = { staff: 'wStaff', pubs: 'wPubs', log: 'wLog', lab: 'wLab' };
  function lowerKey(w, dv) {
    var s = state, k = w + '|' + confirmKey + '|';
    if (w === 'staff') PC.STAFF.forEach(function (st) { k += E.staffStatus(s, st)[0] + (s.staff[st.id] || 0) + ','; });
    else if (w === 'pubs') k += E.measurements(s).length + (dv.m.autoPublish ? 'A' : '') + s.flags.autoPub + '|' +
      s.papers.map(function (p) { return p.id + p.stage + p.round + p.revisions; }).join() + '|' + E.paperSlots(s) + JSON.stringify(E.reviewOdds(s));
    else if (w === 'log') k += s.log.length + ':' + (s.log[0] && s.log[0].t);
    else k += E.canPrestige(s) + Math.floor(s.t / 60) + s.legacy;
    return k;
  }
  function renderLower(dv) {
    Object.keys(LOWER).forEach(function (w) {
      if (w === 'pubs' ? !(PC.Win.isOpen('analyses') && anaPane === 'papers') : !PC.Win.isOpen(w)) return;   // the papers are a section of the Analyses window
      var body = $(LOWER[w]), k = lowerKey(w, dv);
      if (keys[LOWER[w]] === k) return;
      keys[LOWER[w]] = k;
      var io = $('ioBox') ? $('ioBox').value : '';
      body.innerHTML = w === 'staff' ? renderStaff() : w === 'pubs' ? renderPubs(dv) : w === 'log' ? renderLog() : renderLab();
      if ($('ioBox')) $('ioBox').value = io;
    });
    var ms = null;
    $('wPubs').querySelectorAll('[data-dyn]').forEach(function (el) {
      var p = el.getAttribute('data-dyn').split(':'), id = p.slice(1).join(':');
      if (p[0] === 'pstage' || p[0] === 'pbar') {
        var pp = state.papers.filter(function (q) { return q.id === id; })[0];
        if (!pp) return;
        if (p[0] === 'pbar') el.style.width = Math.min(100, pp.t / pp.dur * 100).toFixed(1) + '%';
        else el.textContent = paperStage(pp) + ' · ' + PC.dur((pp.dur - pp.t) / E.reviewSpeed(state));
        return;
      }
      ms = ms || E.measurements(state);
      var m = ms.filter(function (q) { return q.id === id; })[0];
      if (!m) return;
      if (p[0] === 'mlvl') el.textContent = '#' + (m.level + 1);
      if (p[0] === 'mrep') el.textContent = '+' + fmt(m.repGain) + ' reputation';
      if (p[0] === 'mcost') el.textContent = fmt(m.cost) + ' data';
      if (p[0] === 'mbtn') el.disabled = state.data < m.cost || state.papers.length >= E.paperSlots(state);
    });
  }
  function patchButtons() {
    document.querySelectorAll('#wStaff [data-cost], #lsPanel [data-cost], #lsChip [data-cost]').forEach(function (b) {
      var cur = b.getAttribute('data-cur') === 'data' ? state.data : state.funds;
      b.disabled = cur < +b.getAttribute('data-cost');
    });
  }

  /* ───────── views ───────── */
  function feedViews(dv) {
    var s = state, inst = {}, pend = {}, work = {};
    PC.TECH.forEach(function (t) { if (s.tech[t.id] === 'installed') inst[t.id] = true; else if (s.tech[t.id] === 'pending') pend[t.id] = true; });
    if (s.ls) s.ls.items.forEach(function (id) { work[id] = 1 - s.ls.remain / s.ls.total; delete pend[id]; });
    var mode = dv.collider ? 'collider' : (E.has(s, 'ps') || E.has(s, 'sps')) ? 'fixed' : 'stand';
    var key = mode + Object.keys(inst).join() + '/' + Object.keys(pend).join() + '/' + Object.keys(work).map(function (id) { return id + Math.round(work[id] * 20); }).join();
    var active = PC.DISCOVERIES.filter(function (d) { var st = s.disc[d.id]; return st && st.active && !st.done; }).map(function (d) { return d.id; });
    var beam = dv.facs.some(function (x) { return x.f.id !== 'cosmic' && x.f.beams.length && x.raw > 0; });
    var off = expBeam(dv).off;
    PC.Display.set({ mode: mode, key: key, installed: inst, pending: pend, installing: work, B: dv.m.B, res: dv.m.res, sqrtS: dv.sqrtS,
      beam: beam && dv.sqrtS > 2 && !off, active: active, pileup: dv.m.pileup < 1 ? 2.5 : 1, beamLabel: E.has(s, 'lhc') ? 'pp' : 'pp̄', ls: !!s.ls, staff: s.staff, off: off });
    $('detLabel').textContent = PC.Display.name();
    var lg = PC.Display.legend();
    setHTML($('detLegend'), JSON.stringify(lg) + PC.Display.note(), lg.map(function (l) {
      return '<li class="' + l.s + '">' + esc(l.name) + (l.s === 'planned' ? ' <span>awaiting shutdown</span>' : l.s === 'work' ? ' <span>installing ' + Math.round(l.p * 100) + '%</span>' : '') + '</li>';
    }).join('') + '<li class="note">' + esc(PC.Display.note()) + '</li>');
    var ev = PC.Display.current();
    $('evInfo').innerHTML = ev ? esc(ev.label) + (ev.signal ? ' · <b>signal candidate: ' + esc(PC.DISCMAP[ev.signal].name) + '</b>' : '') : '&nbsp;';

    var ctech = {};
    PC.TECH.forEach(function (t) { if (t.lane === 'computing' && inst[t.id]) ctech[t.id] = true; });
    PC.Computing.set({ tech: ctech, rate: dv.recorded, util: dv.compSat, ls: !!s.ls, staff: s.staff,
      store: { used: s.store.used, cap: s.store.cap, full: dv.storeFull, level: storeLevel(inst), start: PC.BAL.storeStart, write: dv.dataRate },
      streams: (function () { var tot = 0; dv.streams.forEach(function (x) { tot += x.rec; }); return tot > 0 ? dv.streams.map(function (x) { return { sym: x.sym, share: x.rec / tot }; }) : null; })() });
    PC.Overview.set({ rate: dv.recorded, data: dv.dataRate, people: PC.People.shown(s.staff.grad, 6) + PC.People.shown(s.staff.postdoc, 4) + PC.People.shown(s.staff.professor, 2), profs: PC.People.shown(s.staff.professor, 2), sat: dv.compSat > 1 && !s.ls, trigLimit: dv.trigSat > 1 && !s.ls, ls: !!s.ls,
      streams: dv.streams.length > 1 ? dv.streams.map(function (x) { return { sym: x.sym, f: x.f }; }) : null });
    $('compSite').textContent = PC.Computing.name();
    if (PC.Win.isOpen('storage')) renderStore(dv);
    if (PC.Win.isOpen('confs')) renderConfs(dv);
    var trig = PC.TECH.filter(function (t) { return t.lane === 'trigger' && inst[t.id]; }).pop();
    var sw = ['cernlib', 'www', 'root', 'geant4', 'ml'].filter(function (id) { return ctech[id]; }).map(function (id) { return PC.TECHMAP[id].name; });
    var ch = '<li class="on">' + esc(PC.Computing.name()) + '</li>' +
      (trig ? '<li class="on">Trigger: ' + esc(trig.name) + '</li>' : '') +
      '<li class="on">Storage: ' + esc(PC.Computing.storeName()) + '</li>' +
      (sw.length ? '<li class="note">Software: ' + esc(sw.join(' · ')) + '</li>' : '');
    setHTML($('compLegend'), ch, ch);

    var fac = {}, prog = {}, running = {};
    PC.FACILITIES.forEach(function (f) {
      var st = E.facStatus(s, f);
      fac[f.id] = st === 'owned' ? 'built' : st === 'building' ? 'building' : st === 'available' ? 'available' : 'locked';   // locked rings show as a blueprint
      if (st === 'building') prog[f.id] = 1 - s.fac[f.id].remain / f.build;
    });
    dv.facs.forEach(function (x) { if (x.raw > 0) running[x.f.id] = true; });
    if (E.has(s, 'lhc')) running.sps = running.ps = running.psb = true;
    if (E.has(s, 'sppbar')) running.aa = true;
    var site = E.has(s, 'lhc') && dv.collider ? 'p5' : E.has(s, 'sppbar') ? 'ua' : E.has(s, 'sps') ? 'north' : E.has(s, 'ps') ? 'east' : 'stand';
    var hl = E.detectorHealth(s), worst = hl.reduce(function (a, x) { return Math.min(a, x.health); }, 1);
    $('detSite').textContent = { stand: 'surface hall · cosmic rays', east: 'PS East Hall · PS beam', north: 'North Area · SPS beam',
      ua: 'SPS underground area', p5: 'LHC Point 5 · 100 m down' }[site] + (hl.length && worst < 0.995 ? ' · health ' + Math.round(worst * 100) + '%' : '');
    var bf = s.beam.fault;
    PC.Complex.set({ fac: fac, progress: prog, running: running, site: site, colliding: dv.collider, ls: !!s.ls, staff: s.staff,
      fault: bf ? { fac: bf.fac, all: !bf.fac, name: bf.kind === 'inc2008' ? 'Incident' : bf.name.replace(/ \(.*\)/, '') } : null,
      fill: s.beam.phase === 'off' ? null : { phase: s.beam.phase, l: Math.exp(-s.beam.age / PC.BAL.fillTau) } });

    // the analysis room: one desk per slot, the running analyses at them
    var desks = active.map(function (id) {
      var i = E.discoveryInfo(s, PC.DISCMAP[id], dv);
      return { id: id, sym: i.d.particle, sigma: Math.min(5, i.sigma), rate: i.rate };
    });
    var doneIds = PC.DISCOVERIES.filter(function (d) { return s.disc[d.id] && s.disc[d.id].done; }).map(function (d) { return d.id; });
    PC.Rooms.setAnalysis({ slots: dv.m.slots, paperSlots: E.paperSlots(s), desks: desks, done: doneIds, rate: s.ls ? 0 : dv.dataRate, ls: !!s.ls, staff: s.staff,
      papers: s.papers.map(function (p) { return { id: p.id, name: paperShort(p), stage: p.stage, p: Math.min(1, p.t / p.dur), round: p.round, rev: p.revisions, journal: p.journal }; }) });
    PC.Rooms.setConference({ conf: s.conf.open ? confView(dv) : null, waiting: s.accepted.length,
      next: (function () { var ser = E.nextSeries(s); return ser ? { name: ser.name + ' ' + E.year(s), in: Math.max(0, s.conf.next - s.t) } : { name: 'every series has met', in: null }; })() });
  }

  // hovering a ring on the map: what the machine is and what it takes
  var BUILDINGS = {
    '@ccc': ['Accelerator control room', 'Fills and live luminosity, every machine’s state, faults and repairs.'],
    '@dcr': ['Detector control room', 'Detector health and ageing, data taking, the trigger, and maintenance shutdowns.']
  };
  function ringCard(r) {
    var el = $('ringCard');
    if (r && BUILDINGS[r.id]) {
      el.innerHTML = '<b>' + BUILDINGS[r.id][0] + '</b><span>' + BUILDINGS[r.id][1] + '</span><span class="tip-k">Click to open</span>';
      el.hidden = false;
      var bx = el.parentNode.getBoundingClientRect(), cvb = $('complexMap').getBoundingClientRect();
      el.style.left = Math.min(cvb.left - bx.left + r.x + 14, bx.width - el.offsetWidth) + 'px';
      el.style.top = Math.max(0, cvb.top - bx.top + r.y - el.offsetHeight - 10) + 'px';
      return;
    }
    if (!r || !PC.FAC[r.id]) { el.hidden = true; return; }
    var f = PC.FAC[r.id], st = E.facStatus(state, f);
    var stt = { owned: 'Running', building: 'Under construction', available: 'Can be built · ' + money(f.cost), locked: 'Not yet available', hidden: 'Not yet available' }[st] || st;
    el.innerHTML = '<b>' + esc(f.name) + '</b><span class="tip-y">' + f.year + ' · ' + esc(f.spec) + '</span>' +
      '<span>' + esc(f.desc) + '</span><span class="tip-k">' + esc(stt) + ' · click to open in Upgrades</span>';
    el.hidden = false;
    var box = el.parentNode.getBoundingClientRect(), cv = $('complexMap').getBoundingClientRect();
    var x = cv.left - box.left + r.x + 14, y = cv.top - box.top + r.y + 14;
    el.style.left = Math.min(x, box.width - el.offsetWidth) + 'px';
    el.style.top = Math.min(y, cv.bottom - box.top - el.offsetHeight + 40) + 'px';
  }

  /* ───────── public ───────── */
  function render() {
    var dv = E.derive(state);
    renderStats(dv);
    renderChain(dv);
    renderLS(dv);
    renderOps(dv);
    renderControlRooms(dv);
    renderAnalyses(dv);
    patchAnalyses(dv);
    renderTabs(dv);
    renderLower(dv);
    patchButtons();
    feedViews(dv);
    PC.Tree.update(state);
    var now = performance.now();
    if (now - plotT > 500) { plotT = now; drawPlot(dv); }
  }

  function toast(title, sub, kind) {
    var t = document.createElement('li');
    t.className = kind || '';
    t.innerHTML = '<span class="y">' + E.year(state) + '</span><b>' + esc(title) + '</b>' + (sub ? '<span class="sub">' + esc(sub) + '</span>' : '') +
      '<button class="tx" type="button" aria-label="Dismiss">✕</button>';
    $('toasts').insertBefore(t, $('toasts').firstChild);          // newest on top
    setTimeout(function () { t.style.transition = 'opacity .4s, transform .4s'; t.style.opacity = 0; t.style.transform = 'translateX(-12px)'; setTimeout(function () { t.remove(); }, 400); }, kind === 'disc' ? 12000 : 7000);
    while ($('toasts').children.length > 3) $('toasts').lastChild.remove();
  }
  function armConfirm(k) { confirmKey = k; clearTimeout(confirmTimer); confirmTimer = setTimeout(function () { confirmKey = null; }, 4000); }

  function onAction(e) {
    var wb = e.target.closest('#tabs [data-win]');
    if (wb) { PC.Win.toggle(wb.getAttribute('data-win')); return; }
    var b = e.target.closest('[data-act]');
    var sel = e.target.closest('[data-sel]');
    if (!b && sel) { selAnalysis = sel.getAttribute('data-sel'); plotT = 0; keys.analyses = null; render(); return; }
    if (!b || b.disabled) return;
    var act = b.getAttribute('data-act'), id = b.getAttribute('data-id'), s = state;
    if (act === 'hire') { var k = e.shiftKey ? 10 : 1; while (k-- && E.hire(s, id)) { /* hire */ } }
    else if (act === 'pub') E.publish(s, id);
    else if (act === 'ls') E.startShutdown(s);
    else if (act === 'autopub') s.flags.autoPub = b.checked;
    else if (act === 'autoq') s.flags.autoQueue = b.checked;
    else if (act === 'autostore') s.flags.autoStore = b.checked;
    else if (act === 'store') { var sec = +id * (e.shiftKey ? 10 : 1); E.buyStorage(s, Math.min(E.storeChunk(s, null, sec), s.funds / E.storePrice(s))); }
    else if (act === 'startA') { if (s.disc[id]) s.disc[id].paused = false; E.startAnalysis(s, id); selAnalysis = id; }
    else if (act === 'stopA') { E.stopAnalysis(s, id); s.disc[id].paused = true; }
    else if (act === 'present') { var pr = E.present(s, id); if (pr) toast('Shown at ' + pr.conf, pr.name + ' · +' + fmt(pr.rep) + ' reputation'); }
    else if (act === 'thr') E.setThreshold(s, id, (s.thr[id] || 0) + +b.getAttribute('data-d'));
    else if (act === 'mask') E.maskChannel(s, +id);
    else if (act === 'trig') E.setTrigger(s, id, (s.trig[id] === undefined ? PC.BAL.trigWeight : s.trig[id]) + +b.getAttribute('data-d'));
    else if (act === 'dump') E.dumpFill(s);
    else if (act === 'help') E.helpFault(s);
    else if (act === 'confopen') PC.Win.open('analyses');
    else if (act === 'pubsopen') { setPane('papers'); PC.Win.open('analyses'); }
    else if (act === 'anapane') setPane(id);
    else if (act === 'confsel') selConf = +id;
    else if (act === 'cccopen') PC.Win.open('ccc');
    else if (act === 'maint') E.startShutdown(s, true);
    else if (act === 'prestige') { if (confirmKey !== 'prestige') armConfirm('prestige'); else { confirmKey = null; hooks.prestige(); } }
    else if (act === 'reset') { if (confirmKey !== 'reset') armConfirm('reset'); else { confirmKey = null; hooks.reset(); } }
    else if (act === 'export') $('ioBox').value = hooks.exportSave();
    else if (act === 'import') { if (!hooks.importSave($('ioBox').value)) toast('Import failed', 'That does not look like a save string.'); }
    keys = {}; plotT = 0;
    render();
  }

  return {
    init: function (s, h) {
      state = s; hooks = h;
      ['tabs', 'windows', 'lsChip', 'beamOps', 'confBox'].forEach(function (id) { $(id).addEventListener('click', onAction); });
      $('toasts').addEventListener('click', function (e) {
        var x = e.target.closest('.tx');
        if (x) { x.parentNode.remove(); return; }                       // ✕ dismisses; anywhere else opens the logbook
        PC.Win.open('log');
      });
      $('windows').addEventListener('change', function (e) { if (e.target.matches('[data-act]')) onAction(e); });
      PC.Tree.init($('treeWrap'), $('treeLanes'), $('treeDetail'), {
        changed: function () { render(); },
        buy: function (kind, id) { if (kind === 'fac') E.buyFacility(state, id); else E.buyTech(state, id); keys = {}; render(); }
      });
      var hd = $('hideDone');
      try { hd.checked = localStorage.getItem('particle-clicker.hideDone') === '1'; } catch (e) { /* private mode */ }
      PC.Tree.hideDone(hd.checked);
      hd.addEventListener('change', function () {
        PC.Tree.hideDone(hd.checked);
        try { localStorage.setItem('particle-clicker.hideDone', hd.checked ? '1' : '0'); } catch (e) { /* private mode */ }
        render();
      });
      PC.Win.init(function (id, open) {
        if (id === 'analyses' && open) PC.Plot.resize();
        if (id === 'upgrades' && open && arguments[2] !== 'resize') PC.Tree.reset();   // scroll to the frontier
        keys = {}; plotT = 0; render();
      });
      applyPane();
      // the detector's subsystems and the data chain: panels opened by their buttons, closed by ✕, Esc or a click elsewhere
      function pops(except) {
        document.querySelectorAll('.ov-cell > .pop.open').forEach(function (p) { if (p.id !== except) p.classList.remove('open'); });
        document.querySelectorAll('.info-btn').forEach(function (b) { b.setAttribute('aria-expanded', String($(b.getAttribute('data-pop')).classList.contains('open'))); });
      }
      document.addEventListener('click', function (e) {
        var b = e.target.closest('[data-pop]');
        if (b) { var p = $(b.getAttribute('data-pop')); p.classList.toggle('open', !p.classList.contains('open') && !b.classList.contains('pop-x')); pops(p.id); return; }
        if (!e.target.closest('.ov-cell > .pop')) pops();
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') pops(); });
      // number keys open and close the windows, in the order of the tabs
      document.addEventListener('keydown', function (e) {
        if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
        var i = +e.key - 1;
        if (i >= 0 && i < TABS.length) PC.Win.toggle(TABS[i].id);
      });
      render();
    },
    setState: function (s) { state = s; keys = {}; selAnalysis = null; PC.Tree.reset(); render(); },
    // from the analysis lens: show that analysis (or just the window) in Analyses
    showPapers: function () { setPane('papers'); PC.Win.open('analyses'); render(); },
    showAnalysis: function (id) { if (id) selAnalysis = id; setPane('analyses'); plotT = 0; keys.analyses = null; PC.Win.open('analyses'); render(); },
    render: render,
    toast: toast,
    ringCard: ringCard
  };
})();
