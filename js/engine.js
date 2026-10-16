/* Particle Clicker: Game engine (pure logic, no DOM).
 *
 * The data chain:
 *   raw collisions (Σ facility luminosity)
 *     → trigger (bandwidth-limited)  → computing (capacity-limited)
 *     → × event quality (detector)   = data/s
 * When a stage is saturated it does not hard-cap: a selective trigger keeps the
 * most interesting events, so output grows as √(input × capacity).
 *
 * Funding is a grant proportional to data/s, scaled by reputation.
 * Data is spent on papers, which go through internal review and then a journal's
 * referees (revise, reject → start over, or accept) before they earn reputation.
 * Discoveries accumulate signal from compatible machines; significance = 5·√(S/need).
 *
 * Beam operations: colliders run in fills (luminosity decays from a peak; a dump costs a
 * turnaround before the next fill) and machines fault now and then. The trigger shares
 * its bandwidth between streams (muons, e/γ, jets, missing energy); a stream's share
 * speeds up the analyses triggered on it when the trigger is saturated. Conferences open
 * every so often to present evidence-level results, including unexpected excesses,
 * some of which are flukes.
 */
var PC = PC || {};

(function () {
  var BAL = PC.BAL = {
    startFunds: 15,
    baseTrigger: 1.5,       // events/s you can record by eye
    baseCompute: 1.2,       // events/s you can analyse by hand
    grantRatio: 0.25,       // funds per unit of data/s
    repFunding: 0.01,       // +1% funding per reputation point
    clickBase: 1,
    clickRateFrac: 0.03,    // each click also yields 3% of a second of data
    measCostGrowth: 1.6,
    measRepStep: 0.25,      // reputation per publication grows linearly with level
    discoveryGrantSeconds: 300,
    shutdownGrant: 0.5,     // fraction of the funding rate kept while beams are off
    legacyEach: 0.1,
    offlineCap: 12 * 3600,
    timeScale: 1,           // sim knob
    // fills: L = peak · e^(−age/τ); the operators dump automatically at fillAutoAt of the peak.
    // The peak is set so that this automatic cycle averages the nominal luminosity;
    // dumping yourself near the optimum gains about a quarter.
    fillTau: 480, fillTurn: 45, fillAutoAt: 0.25,
    // faults: one per faultEvery seconds of beam on average; faultComp keeps the long-run
    // luminosity nominal for a player who never helps
    faultEvery: 720, faultComp: 1.1, faultHelp: 0.04, incidentDelay: 150,
    // conferences
    confFirst: 900, confEvery: 1500, confOpen: 240,
    showRep: 0.3,           // reputation for presenting an evidence-level result (× its discovery reputation)
    confirmRep: 0.2,        // bonus when a presented result reaches 5σ
    retractCost: 2,         // a presented fluke that fades costs this many times what it earned
    trigWeight: 2,          // default weight of every trigger stream (0–4)
    // paper review: stage durations (s) grow with the paper number; precision papers on a discovery take longer
    paperBase: 10, paperPerLevel: 1.5, paperJournal: 1.6, paperRevise: 0.6, paperDisc: 1.4,
    paperRedo: 0.15, paperRevision: 0.3, paperReject: 0.12,   // base odds, divided by (1 + review quality)
    paperSlots: 4,          // papers in review at once, plus one per analysis group
    confPaperRep: 0.25,     // papers accepted since the last conference are shown there for this bonus
    // detector ageing (rates in PC.AGEING): health never drops below ageFloor; fully worn costs ageLoss of event quality
    ageFloor: 0.3, ageLoss: 0.4,
    dfaultEvery: 300,       // spontaneous detector faults: one per this many seconds of beam on a brand-new detector
    dfaultMax: 12,
    fakeFrac: 0.12,         // fake triggers from one unmasked noisy channel, as a fraction of the trigger bandwidth
    maskCost: 0.01,         // event quality lost to a masked channel (instead of the noisy one's 0.005)
    autoMask: 90,           // the shift crew masks a noisy channel left alone this long (s)
    storeStart: 3000,       // storage capacity on day one (data units)
    storePrice: 0.03,       // funds per data unit of capacity, × the funding multiplier, before storage technology
    storeAutoAt: 0.85,      // automatic purchases (with tape) start at this fill
    storeChunk: 3600,       // a purchase adds this many seconds of the current data rate
    storeMin: 200,          // and never less than this
    maintLS: 240            // a maintenance shutdown with no upgrades to install (s, before technicians)
  };
  BAL.fillAutoAge = BAL.fillTau * Math.log(1 / BAL.fillAutoAt);
  BAL.fillPeak = (BAL.fillAutoAge + BAL.fillTurn) / (BAL.fillTau * (1 - BAL.fillAutoAt));

  function index(list) { var m = {}; list.forEach(function (x) { m[x.id] = x; }); return m; }
  var FAC = PC.FAC = index(PC.FACILITIES);
  var TECH = PC.TECHMAP = index(PC.TECH);
  var STAFF = PC.STAFFMAP = index(PC.STAFF);
  var DISC = PC.DISCMAP = index(PC.DISCOVERIES);
  var EXC = PC.EXCMAP = index(PC.EXCESSES);
  var STREAM = PC.STREAMMAP = index(PC.STREAMS);

  /* ───────────── state ───────────── */
  function newState(keep) {
    keep = keep || {};
    return {
      v: 1,
      t: 0,
      saved: Date.now(),
      funds: BAL.startFunds, data: 0, rep: 0,
      runTotals: { funds: 0, data: 0, rep: 0, clicks: 0 },
      life: keep.life || { funds: 0, data: 0, rep: 0, clicks: 0, t: 0 },
      fac: startFac(),
      tech: startTech(),   // id → 'pending' | 'installed'
      staff: {},           // id → count
      disc: {},            // id → { S, done, at, s3 }
      meas: {},            // id → level
      ls: null,            // { remain, total, items, n }
      run: 1, lsCount: 0,
      legacy: keep.legacy || 0,
      gen: keep.gen || 0,
      log: keep.log || [],
      flags: keep.flags || { autoPub: true, autoQueue: true },
      seed: keep.seed || Math.floor(Math.random() * 4294967296),
      beam: newBeam(),
      trig: {},            // stream id → weight 0–4 (missing = default)
      thr: {},             // stream id → threshold level (missing = the lowest)
      exc: {},             // excess id → { S, A, s3, done, faded, shown, gain }
      papers: [],          // in review: { id, name, level, stage 'internal'|'journal', t, dur, round, revisions, journal }
      accepted: [],        // accepted since the last conference: { id, name, result, journal, gain }
      health: {},          // detector lane → 0–1 (missing = new)
      store: { used: 0, cap: BAL.storeStart },   // data on disk and tape, and the room for it
      dfaults: [],         // detector faults: { lane, kind, what, u, v (0–1 position on the subsystem map), remain, total }
      conf: { n: 0, next: BAL.confFirst, open: null, held: {}, ed: keep.confEd || {} },   // held: series → year it last met; ed: editions
      confLog: keep.confLog || []   // every conference the lab attended, kept across generations (the archive)
    };
  }
  // fill: n, phase 'off' (no collider) | 'turn' (injecting, `turn` s left) | 'stable' (`age` s into the fill);
  // fault: { kind, name, fac (or null for all), remain, total } | null
  function newBeam() { return { fill: 0, phase: 'off', age: 0, turn: 0, fault: null, nextFault: BAL.faultEvery, lhcAt: null, inc08: false }; }
  // saves from before beam operations, conferences and the trigger menu
  function migrate(s) {
    if (!s.beam) s.beam = newBeam();
    if (!s.trig) s.trig = {};
    if (!s.thr) s.thr = {};
    if (!s.exc) s.exc = {};
    if (!s.papers) s.papers = [];
    if (!s.accepted) s.accepted = [];
    if (!s.health) s.health = {};
    if (!s.dfaults) s.dfaults = [];
    if (!s.store) s.store = { used: 0, cap: Math.max(BAL.storeStart, (s.data || 0) * 2) };   // older saves: room for what they hold
    if (!s.conf) s.conf = { n: 0, next: s.t + BAL.confFirst, open: null };
    if (!s.conf.held) s.conf.held = {};
    if (!s.conf.ed) s.conf.ed = {};
    if (!s.confLog) s.confLog = [];
    if (s.seed === undefined) s.seed = Math.floor(Math.random() * 4294967296);
    return s;
  }
  // deterministic per save (mulberry32), so a save replays the same faults and fluke sizes
  function rand(s) {
    var t = (s.seed = (s.seed + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function startFac() { var o = {}; PC.START.fac.forEach(function (id) { o[id] = { built: true, remain: 0 }; }); return o; }
  function startTech() { var o = {}; PC.START.tech.forEach(function (id) { o[id] = 'installed'; }); return o; }
  function n(s, id) { return s.staff[id] || 0; }
  function built(s, id) { return !!(s.fac[id] && s.fac[id].built); }
  function installed(s, id) { return s.tech[id] === 'installed'; }
  function has(s, id) {
    if (FAC[id]) return built(s, id);
    if (TECH[id]) return installed(s, id);
    if (DISC[id]) return !!(s.disc[id] && s.disc[id].done);
    return false;
  }

  function caps(s) {
    var c = {};
    PC.TECH.forEach(function (t) { if (installed(s, t.id)) (t.caps || []).forEach(function (k) { c[k] = true; }); });
    PC.FACILITIES.forEach(function (f) { if (built(s, f.id)) (f.caps || []).forEach(function (k) { c[k] = true; }); });
    return c;
  }

  /* ───────────── detector ageing ───────────── */
  // the subsystem now in each ageing lane (the newest installed), or null
  function laneTech(s, lane) {
    var best = null;
    PC.TECH.forEach(function (t) { if (t.lane === lane && installed(s, t.id) && (!best || t.year > best.year)) best = t; });
    return best;
  }
  function health(s, lane) { var h = s.health && s.health[lane]; return h === undefined ? 1 : h; }
  function ageingSlow(s) { return 1 + 0.25 * Math.log2(1 + n(s, 'deteng')); }       // detector engineers slow the wear
  function ageingFactor(s) {
    var sum = 0, k = 0;
    Object.keys(PC.AGEING).forEach(function (lane) { if (laneTech(s, lane)) { sum += health(s, lane); k++; } });
    return k ? 1 - BAL.ageLoss * (1 - sum / k) : 1;
  }
  // per lane: { lane, name, tech, health, rate (per second of beam, after engineers) }
  function detectorHealth(s) {
    return Object.keys(PC.AGEING).map(function (lane) {
      var t = laneTech(s, lane), a = PC.AGEING[lane];
      return { lane: lane, name: a.name, why: a.why, tech: t, health: health(s, lane), rate: t ? a.rate / ageingSlow(s) : 0 };
    }).filter(function (x) { return x.tech; });
  }
  function dfaultFactor(s) {
    var c = 0;
    (s.dfaults || []).forEach(function (f) { c += f.masked ? BAL.maskCost : PC.DET_FAULTS.filter(function (k) { return k.id === f.kind; })[0].cost; });
    return 1 - Math.min(0.25, c);
  }
  function dfaultRepairSpeed(s) { return 1 + 0.3 * Math.log2(1 + n(s, 'deteng')); }
  // faults appear while there is beam, more often in worn subsystems; engineers repair them
  function dfaultTick(s, dt, beamOn, ev) {
    var speed = dfaultRepairSpeed(s);
    s.dfaults = s.dfaults.filter(function (f) {
      f.remain -= dt * speed;
      f.age = (f.age || 0) + dt;
      if (!f.id) { s.dfaultN = (s.dfaultN || 0) + 1; f.id = s.dfaultN; }   // faults from older saves
      if (f.kind === 'noisy' && !f.masked && f.age >= BAL.autoMask) {      // left alone: the shift crew masks it
        f.masked = 'crew'; logEv(s, 'Shift crew masked a noisy channel in the ' + PC.AGEING[f.lane].name.toLowerCase(), 'detector');
      }
      if (f.remain > 0) return true;
      logEv(s, 'Repaired: ' + f.what + ' in the ' + PC.AGEING[f.lane].name.toLowerCase(), 'detector');
      return false;
    });
    if (!beamOn || s.ls || s.dfaults.length >= BAL.dfaultMax) return;
    Object.keys(PC.AGEING).forEach(function (lane) {
      if (!laneTech(s, lane)) return;
      var rate = dt / BAL.dfaultEvery / 3 * (1 + 4 * (1 - health(s, lane)));   // each lane: a third of the base rate, more when worn
      if (rand(s) >= rate) return;
      var tot = 0; PC.DET_FAULTS.forEach(function (k) { tot += k.w; });
      var r = rand(s) * tot, kind = PC.DET_FAULTS[0];
      for (var i = 0; i < PC.DET_FAULTS.length; i++) { r -= PC.DET_FAULTS[i].w; if (r <= 0) { kind = PC.DET_FAULTS[i]; break; } }
      var down = kind.down[0] + rand(s) * (kind.down[1] - kind.down[0]);
      s.dfaultN = (s.dfaultN || 0) + 1;
      var f = { id: s.dfaultN, lane: lane, kind: kind.id, what: kind.what[Math.floor(rand(s) * kind.what.length)], u: rand(s), v: rand(s), remain: down, total: down, age: 0 };
      s.dfaults.push(f);
      logEv(s, 'Detector: ' + f.what + ' in the ' + PC.AGEING[lane].name.toLowerCase(), 'detector');
      ev.push({ type: 'dfault', lane: lane, kind: kind.id, what: f.what });
    });
  }
  function ageTick(s, dt, beamOn) {
    if (!beamOn || s.ls) return;
    var slow = ageingSlow(s);
    Object.keys(PC.AGEING).forEach(function (lane) {
      if (!laneTech(s, lane)) return;
      s.health[lane] = Math.max(BAL.ageFloor, health(s, lane) - dt * PC.AGEING[lane].rate / slow);
    });
  }

  /* ───────────── multipliers ───────────── */
  function staffSum(s, key) {
    var t = 0;
    PC.STAFF.forEach(function (st) { if (st.each[key]) t += st.each[key] * n(s, st.id); });
    return t;
  }

  function mults(s) {
    var m = { quality: 1, trigger: BAL.baseTrigger, compute: BAL.baseCompute, analysis: 1,
      funding: 1, rep: 1, click: 1, pileup: 1, storage: 1, autoPublish: false };
    var cp = caps(s);
    PC.TECH.forEach(function (t) {
      if (!installed(s, t.id)) return;
      var fx = t.fx;
      if (fx.quality) m.quality *= fx.quality;
      if (fx.trigger) m.trigger *= fx.trigger;
      if (fx.compute) m.compute *= fx.compute;
      if (fx.analysis) m.analysis *= fx.analysis;
      if (fx.funding) m.funding *= fx.funding;
      if (fx.rep) m.rep *= fx.rep;
      if (fx.click) m.click *= fx.click;
      if (fx.pileup) m.pileup *= fx.pileup;
      if (fx.storage) m.storage *= fx.storage;
      if (fx.autoPublish) m.autoPublish = true;
    });
    if (cp.timing) m.pileup = 1;   // 4D tracking resolves pile-up
    m.ageing = ageingFactor(s);
    m.dfaults = dfaultFactor(s);
    m.quality *= m.ageing * m.dfaults;
    var legacy = 1 + BAL.legacyEach * s.legacy;
    m.legacy = legacy;
    m.quality *= (1 + staffSum(s, 'quality')) * m.pileup;
    m.trigger *= 1 + staffSum(s, 'trigger');
    m.compute *= 1 + staffSum(s, 'compute');
    m.analysis *= 1 + staffSum(s, 'analysis');
    m.funding *= (1 + staffSum(s, 'funding')) * (1 + BAL.repFunding * s.rep) * legacy;
    m.rep *= 1 + staffSum(s, 'rep');
    m.click *= 1 + staffSum(s, 'click');
    m.lumiStaff = (1 + staffSum(s, 'lumi')) * legacy;
    m.flat = staffSum(s, 'flat');
    m.installSpeed = 1 + staffSum(s, 'install');
    m.slots = 1 + staffSum(s, 'slots');
    // magnetic field and mass resolution of the newest installed magnet / tracker
    var bY = -1, rY = -1;
    m.B = 0; m.res = 0.1;
    PC.TECH.forEach(function (t) {
      if (!installed(s, t.id)) return;
      if (t.fx.B && t.year > bY) { bY = t.year; m.B = t.fx.B; }
      if (t.fx.res && t.year > rY) { rY = t.year; m.res = t.fx.res; }
    });
    return m;
  }

  function facEnergy(s, f, b) {
    var E = 0;
    f.beams.forEach(function (x) { if (x.b === b) E = x.E; });
    PC.TECH.forEach(function (t) {
      var e = t.fx.energy;
      if (e && e.fac === f.id && e.b === b && installed(s, t.id)) E = Math.max(E, e.E);
    });
    return E;
  }

  function facLumi(s, f, m) {
    var L = f.lumi * m.lumiStaff;
    PC.TECH.concat(PC.FACILITIES).forEach(function (t) {
      var l = t.fx && t.fx.lumi;
      if (!l || !(TECH[t.id] ? installed(s, t.id) : built(s, t.id))) return;
      if (l.fac && l.fac.indexOf(f.id) < 0) return;
      if (l.beams && !f.beams.some(function (x) { return l.beams.indexOf(x.b) >= 0; })) return;
      L *= l.mult;
    });
    return L;
  }

  // a saturated stage keeps the best events: output ~ √(in·cap)
  function soft(x, cap) { return x <= cap ? x : Math.sqrt(x * cap); }

  /* ───────────── derived rates ───────────── */
  function isCollider(f) { return f.beams.some(function (b) { return PC.COLLIDER_BEAMS.indexOf(b.b) >= 0; }); }
  // luminosity now, as a fraction of nominal: the fill for colliders, faults for everything
  function beamFactor(s, f) {
    if (f.id === 'cosmic') return 1;
    var b = s.beam, k = BAL.faultComp;
    if (b.fault && (!b.fault.fac || b.fault.fac === f.id)) return 0;
    if (isCollider(f)) k *= b.phase === 'stable' ? fillLumi(b.age) : b.phase === 'turn' ? 0 : 1;
    return k;
  }
  function fillLumi(age) { return BAL.fillPeak * Math.exp(-age / BAL.fillTau); }

  function derive(s) {
    if (!s.beam) migrate(s);
    var m = mults(s), cp = caps(s);
    var facs = [], totalRaw = m.flat;
    PC.FACILITIES.forEach(function (f) {
      if (!built(s, f.id)) return;
      var raw = s.ls ? 0 : facLumi(s, f, m) * beamFactor(s, f), E = {};
      f.beams.forEach(function (x) { E[x.b] = facEnergy(s, f, x.b); });
      facs.push({ f: f, raw: raw, E: E });
      totalRaw += raw;
    });
    // the trigger menu. Each stream sees an equal share of the collisions, cut by its threshold. The bandwidth
    // is shared by the weights; fake triggers from noisy channels look like good ones and take their stream's
    // share first; what a stream doesn't use flows to the others. A saturated stream keeps √(input × share).
    var avail = PC.STREAMS.filter(function (x) { return x.caps.every(function (c) { return cp[c]; }); });
    var N = avail.length, wsum = 0, fake = fakeInputs(s, avail, m);
    avail.forEach(function (x) { wsum += trigWeight(s, x.id); });
    var streams = avail.map(function (x) {
      var real = totalRaw / N * thrRate(s, x);
      var f = wsum > 0 ? trigWeight(s, x.id) / wsum : 1 / N, fk = Math.min(fake[x.id] || 0, f * m.trigger);
      return { id: x.id, name: x.name, sym: x.sym, v: x.v, w: trigWeight(s, x.id), f: f,
        thr: thrValue(s, x), level: thrLevel(s, x), levels: x.thr, real: real, fake: fk, cap: f * m.trigger - fk };
    });
    var open = streams.slice(), pool = 0;
    for (var guard = 0; guard < 8 && open.length; guard++) {                // water-filling: unused shares flow on
      var fits = open.filter(function (x) { return x.real <= x.cap; });
      if (!fits.length) break;
      fits.forEach(function (x) { x.rec = x.real; pool += x.cap - x.real; });
      open = open.filter(function (x) { return fits.indexOf(x) < 0; });
      var fs = 0; open.forEach(function (x) { fs += x.f; });
      open.forEach(function (x) { x.cap += pool * x.f / fs; });
      pool = 0;
    }
    open.forEach(function (x) { x.rec = soft(x.real, Math.max(0, x.cap)); });
    var recorded = 0, recReal = 0, input = 0, sg = {}, sk = {};
    var kfEven = totalRaw > 0 ? soft(totalRaw / N, m.trigger / N) / (totalRaw / N) : 1;   // the kept fraction with nothing touched
    streams.forEach(function (x) {
      x.kept = x.real > 0 ? x.rec / x.real : 1;                             // the real events this stream keeps
      x.g = kfEven > 0 ? x.kept / kfEven : 1;
      x.input = x.real + x.fake;
      recorded += x.rec + x.fake; recReal += x.rec; input += x.input;
      sg[x.id] = x.g; sk[x.id] = x.kept;
    });
    var processed = soft(recorded, m.compute);
    var eff = totalRaw > 0 ? processed / totalRaw : 0;
    var cKept = recorded > 0 ? processed / recorded : 0;                     // the computing's kept fraction
    var dataRate = processed * m.quality * (recorded > 0 ? recReal / recorded : 1);   // fakes cost bandwidth and computing, give nothing
    var bottleneck = 'accelerator';
    var trigSat = input / m.trigger, compSat = recorded / m.compute;
    if (trigSat > 1 || compSat > 1) bottleneck = trigSat >= compSat ? 'trigger' : 'computing';
    // during a shutdown the agencies keep paying part of the operations grant; it pays for the data taken,
    // stored or not, so a full disk never leaves the lab without the money for more
    var fundsRate = s.ls ? s.ls.grant || 0 : dataRate * BAL.grantRatio * m.funding;
    // storage: once it is full, nothing new is written; analyses and the data count stand still
    var st = s.store || { used: 0, cap: Infinity }, full = st.used >= st.cap, dataIn = dataRate;
    if (full) { dataRate = 0; bottleneck = 'storage'; }
    var collider = facs.some(function (x) { return x.f.beams.some(function (b) { return PC.COLLIDER_BEAMS.indexOf(b.b) >= 0; }); });
    var sqrtS = 0;
    facs.forEach(function (x) {
      x.f.beams.forEach(function (b) {
        if (b.b === 'cosmic') return;
        var E0 = x.E[b.b], v = PC.COLLIDER_BEAMS.indexOf(b.b) >= 0 ? E0 : Math.sqrt(2 * 0.938 * E0 + 2 * 0.88);
        if (v > sqrtS) sqrtS = v;
      });
    });
    return {
      collider: collider, sqrtS: sqrtS,
      m: m, caps: cp, facs: facs, totalRaw: totalRaw, recorded: recorded, processed: processed,
      eff: eff, dataRate: dataRate, dataIn: dataIn, storeFull: full, write: full ? 0 : 1, fundsRate: fundsRate, bottleneck: bottleneck,
      trigSat: trigSat, compSat: compSat, streams: streams, streamGain: sg, streamKept: sk, cKept: cKept,
      keptAvg: totalRaw > 0 ? recReal / totalRaw : 1, fakeRate: recorded - recReal,
      clickValue: (BAL.clickBase + dataRate * BAL.clickRateFrac) * m.click
    };
  }

  /* ───────────── requirements & visibility ───────────── */
  function missing(s, item) {
    return (item.requires || []).filter(function (r) { return !has(s, r); });
  }
  function legacyOk(s, item) { return !item.legacy || s.legacy >= item.legacy; }

  function name(id) { var x = FAC[id] || TECH[id] || DISC[id] || STAFF[id]; return x ? x.name : id; }

  // status: owned | pending | building | available | locked (one step away) | hidden
  function facStatus(s, f) {
    var st = s.fac[f.id];
    if (st && st.built) return 'owned';
    if (st) return 'building';
    if (!legacyOk(s, f)) return 'hidden';
    var miss = missing(s, f);
    if (!miss.length) return 'available';
    return oneStep(s, miss) ? 'locked' : 'hidden';
  }
  function techStatus(s, t) {
    if (s.tech[t.id] === 'installed') return 'owned';
    if (s.tech[t.id] === 'pending') return 'pending';
    if (!legacyOk(s, t)) return 'hidden';
    var miss = missing(s, t);
    if (!miss.length) return 'available';
    return oneStep(s, miss) ? 'locked' : 'hidden';
  }
  function oneStep(s, miss) {
    return miss.every(function (id) {
      if (s.fac[id] || s.tech[id]) return true;   // under construction / pending
      var it = FAC[id] || TECH[id];
      return it && legacyOk(s, it) && !missing(s, it).length;
    });
  }
  function staffStatus(s, st) {
    if (st.max && n(s, st.id) >= st.max) return 'maxed';
    if (!st.requires) return 'available';
    var miss = missing(s, st);
    if (!miss.length) return 'available';
    return oneStep(s, miss) ? 'locked' : 'hidden';
  }
  function staffCost(s, st) { return st.cost * Math.pow(st.growth, n(s, st.id)); }

  /* ───────────── actions ───────────── */
  function logEv(s, text, kind) {
    s.log.unshift({ t: s.t, y: year(s), text: text, kind: kind || 'info', gen: s.gen });
    if (s.log.length > 300) s.log.length = 300;
  }

  function buyFacility(s, id) {
    var f = FAC[id];
    if (!f || facStatus(s, f) !== 'available' || s.funds < f.cost) return false;
    s.funds -= f.cost;
    s.fac[id] = { built: f.build <= 0, remain: f.build * BAL.timeScale };
    logEv(s, (f.build > 0 ? 'Construction started: ' : 'Commissioned: ') + f.name, 'build');
    return true;
  }

  function buyTech(s, id) {
    var t = TECH[id];
    if (!t || techStatus(s, t) !== 'available' || s.funds < t.cost) return false;
    s.funds -= t.cost;
    if (t.install > 0) {
      s.tech[id] = 'pending';
      logEv(s, 'Ordered: ' + t.name + ' (awaiting Long Shutdown)', 'tech');
    } else {
      s.tech[id] = 'installed';
      logEv(s, 'Adopted: ' + t.name, 'tech');
    }
    return true;
  }

  function hire(s, id) {
    var st = STAFF[id];
    if (!st || staffStatus(s, st) !== 'available') return false;
    var c = staffCost(s, st);
    if (s.funds < c) return false;
    s.funds -= c;
    s.staff[id] = n(s, id) + 1;
    return true;
  }

  function pendingTech(s) {
    return PC.TECH.filter(function (t) { return s.tech[t.id] === 'pending'; });
  }
  function shutdownDuration(s, items) {
    var m = mults(s), sum = 0;
    (items || pendingTech(s)).forEach(function (t) { sum += t.install; });
    return sum * BAL.timeScale / m.installSpeed;
  }
  // a Long Shutdown installs the pending upgrades; with none pending it can still be called for maintenance
  function maintDuration(s) { return BAL.maintLS * BAL.timeScale / mults(s).installSpeed; }
  function startShutdown(s, maint) {
    if (s.ls) return false;
    var items = pendingTech(s);
    if (!items.length && !maint) return false;
    var dur = items.length ? shutdownDuration(s, items) : maintDuration(s), grant = derive(s).fundsRate * BAL.shutdownGrant;
    s.lsCount++;
    s.ls = { remain: dur, total: dur, grant: grant, items: items.map(function (t) { return t.id; }), n: s.lsCount };
    logEv(s, 'Long Shutdown ' + s.lsCount + ' begins — ' + (items.length ? 'installing ' + items.length + ' upgrade' + (items.length > 1 ? 's' : '') + ' and refurbishing the detector' : 'detector maintenance'), 'ls');
    return true;
  }

  function click(s) {
    var v = Math.min(derive(s).clickValue, Math.max(0, s.store.cap - s.store.used));   // a full disk takes nothing
    s.data += v; s.runTotals.data += v; s.life.data += v; s.store.used += v;
    s.runTotals.clicks++; s.life.clicks++;
    return v;
  }

  /* ───────────── publications ───────────── */
  function measurements(s) {
    var out = [];
    PC.FACILITIES.forEach(function (f, i) {
      if (!built(s, f.id) || f.role === 'injector') return;
      out.push({ id: 'f:' + f.id, name: programName(f), cost0: Math.max(8, f.lumi * 40), rep0: 1 + i * 0.6, src: f.name });
    });
    PC.DISCOVERIES.forEach(function (d) {
      if (!(s.disc[d.id] && s.disc[d.id].done)) return;
      out.push({ id: 'd:' + d.id, name: 'Precision ' + d.particle, cost0: d.need * 0.3, rep0: d.rep * 0.15, src: d.name });
    });
    var m = mults(s);
    out.forEach(function (x) {
      x.level = s.meas[x.id] || 0;
      x.cost = x.cost0 * Math.pow(BAL.measCostGrowth, x.level);
      x.repGain = x.rep0 * (1 + BAL.measRepStep * x.level) * m.rep;
    });
    return out;
  }
  function programName(f) {
    var b = f.beams[0].b;
    if (b === 'cosmic') return 'Cosmic-ray survey';
    if (PC.COLLIDER_BEAMS.indexOf(b) >= 0) return f.name.replace(/ \(.*\)/, '') + ' physics programme';
    return f.name.replace(/ \(.*\)/, '') + ' cross-sections';
  }
  /* ───────────── paper review ───────────── */
  function paperSlots(s) { return BAL.paperSlots + n(s, 'convener'); }
  // how good the collaboration is at papers: postdocs and professors, and the software
  function reviewQuality(s) {
    var q = 0.12 * Math.log2(1 + n(s, 'postdoc')) + 0.2 * Math.log2(1 + n(s, 'professor'));
    PC.TECH.forEach(function (t) { if (installed(s, t.id) && t.fx.reviewQ) q += t.fx.reviewQ; });
    return q;
  }
  function reviewSpeed(s) {
    var v = 1 + 0.1 * Math.log2(1 + n(s, 'grad'));
    PC.TECH.forEach(function (t) { if (installed(s, t.id) && t.fx.reviewSpeed) v *= t.fx.reviewSpeed; });
    return v;
  }
  function reviewOdds(s) {
    var k = 1 + reviewQuality(s);
    return { redo: BAL.paperRedo / k, revise: BAL.paperRevision / k, reject: BAL.paperReject / k };
  }
  function stageDur(p, stage) {
    var d = (BAL.paperBase + BAL.paperPerLevel * p.level) * (p.id.charAt(0) === 'd' ? BAL.paperDisc : 1);
    return (stage === 'journal' ? d * BAL.paperJournal : d) * BAL.timeScale;
  }
  // submit a paper: costs its data now; reputation comes when a journal accepts it
  function publish(s, id, list) {
    var x = (list || measurements(s)).filter(function (q) { return q.id === id; })[0];
    if (!x || s.data < x.cost || s.papers.length >= paperSlots(s) || inReview(s, id)) return false;
    s.data -= x.cost;
    var p = { id: id, name: x.name, level: x.level, stage: 'internal', t: 0, round: 1, revisions: 0, journal: null };
    p.dur = stageDur(p, 'internal');
    s.papers.push(p);
    logEv(s, 'Submitted for internal review: ' + x.name + ' #' + (x.level + 1), 'paper');
    return x;
  }
  function inReview(s, id) { return s.papers.some(function (p) { return p.id === id; }); }
  function autoPublish(s) {
    for (var k = 0; k < 10 && s.papers.length < paperSlots(s); k++) {
      var list = measurements(s), best = null;
      list.forEach(function (x) {
        if (x.cost <= s.data && !inReview(s, x.id) && (!best || x.repGain / x.cost > best.repGain / best.cost)) best = x;
      });
      if (!best) return;
      publish(s, best.id, list);
    }
  }
  // the number a paper reports, with an uncertainty that shrinks paper by paper
  function paperResult(id, level) {
    var r = PC.RESULTS[id];
    if (!r) return '';
    var err = r.v * r.rel / Math.sqrt(1 + level), h = Math.sin((id.length * 31 + level * 17.3) * 12.9898) * 43758.5453;
    var v = r.v + (h - Math.floor(h) - 0.5) * 1.2 * err;
    var dec = Math.max(0, 1 - Math.floor(Math.log10(err)));
    return r.q + ' = ' + v.toFixed(dec) + ' ± ' + err.toFixed(dec) + (r.u ? ' ' + r.u : '');
  }
  function reviewTick(s, dt, ev) {
    var speed = reviewSpeed(s), odds = reviewOdds(s);
    s.papers = s.papers.filter(function (p) {
      p.t += dt * speed;
      if (p.t < p.dur) return true;
      var r = rand(s);
      p.t = 0;
      if (p.stage === 'internal') {
        if (r < odds.redo) { p.dur = stageDur(p, 'internal') * 0.5; ev.push({ type: 'paperBack', id: p.id }); logEv(s, 'Sent back by the collaboration for more checks: ' + p.name, 'paper'); return true; }
        p.stage = 'journal'; p.dur = stageDur(p, 'journal');
        if (!p.journal) p.journal = PC.JOURNALS[Math.floor(rand(s) * PC.JOURNALS.length)];
        return true;
      }
      if (r < odds.reject) {
        p.stage = 'internal'; p.dur = stageDur(p, 'internal'); p.round++; var j = p.journal; p.journal = null;
        ev.push({ type: 'paperRejected', id: p.id, journal: j, name: p.name }); logEv(s, 'Rejected by ' + j + ': ' + p.name + ' — back to the start', 'fault');
        return true;
      }
      if (r < odds.reject + odds.revise) {
        p.revisions++; p.dur = stageDur(p, 'journal') * BAL.paperRevise;
        ev.push({ type: 'paperRevise', id: p.id, journal: p.journal, name: p.name }); logEv(s, 'Revisions requested by ' + p.journal + ': ' + p.name, 'paper');
        return true;
      }
      // accepted
      var x = measurements(s).filter(function (q) { return q.id === p.id; })[0];
      var g = x ? x.repGain : 0;
      s.meas[p.id] = p.level + 1;
      s.rep += g; s.runTotals.rep += g; s.life.rep += g;
      var res = paperResult(p.id, p.level);
      s.accepted.push({ id: p.id, name: p.name, result: res, journal: p.journal, gain: g });
      logEv(s, 'Published in ' + p.journal + ': ' + p.name + (res ? ' — ' + res : ''), 'paper');
      ev.push({ type: 'paperAccepted', id: p.id, journal: p.journal, rep: g, result: res, name: p.name });
      return false;
    });
  }

  /* ───────────── trigger menu ───────────── */
  function trigWeight(s, id) { var w = s.trig && s.trig[id]; return w === undefined ? BAL.trigWeight : w; }
  function setTrigger(s, id, w) {
    if (!STREAM[id]) return false;
    s.trig[id] = Math.max(0, Math.min(4, Math.round(w)));
    if (PC.STREAMS.every(function (x) { return trigWeight(s, x.id) === 0; })) s.trig[id] = 1;   // something must be triggered
    return true;
  }

  /* ───────────── trigger thresholds, fake triggers ───────────── */
  function thrLevel(s, x) { var k = s.thr && s.thr[x.id]; return k === undefined ? 0 : Math.max(0, Math.min(x.thr.length - 1, k)); }
  function thrValue(s, x) { return x.thr[thrLevel(s, x)]; }
  function thrRate(s, x) { return Math.pow(x.thr[0] / thrValue(s, x), 2); }   // steeply falling spectra
  function setThreshold(s, id, level) {
    var x = STREAM[id];
    if (!x) return false;
    s.thr[id] = Math.max(0, Math.min(x.thr.length - 1, level));
    return true;
  }
  // how much of an analysis's signal survives its stream's threshold
  function thrEff(s, d, dv) {
    if (!d.stream || !d.thrNeed || !dv.streamGain || dv.streamGain[d.stream] === undefined) return 1;
    var t = thrValue(s, STREAM[d.stream]);
    return t <= d.thrNeed ? 1 : Math.pow(d.thrNeed / t, 2);
  }
  // unmasked noisy channels fire fake triggers into their subdetector's streams
  var LANE_STREAMS = { tracking: null, calo: ['eg', 'jet'], muon: ['mu'] };
  function fakeInputs(s, streams, m) {
    var out = {}, ids = streams.map(function (x) { return x.id; });
    (s.dfaults || []).forEach(function (f) {
      if (f.kind !== 'noisy' || f.masked) return;
      var to = (LANE_STREAMS[f.lane] || ids).filter(function (id) { return ids.indexOf(id) >= 0; });
      if (!to.length) to = ids;
      to.forEach(function (id) { out[id] = (out[id] || 0) + BAL.fakeFrac * m.trigger / to.length; });
    });
    return out;
  }
  function maskChannel(s, id) {
    var f = (s.dfaults || []).filter(function (q) { return q.id === id; })[0];
    if (!f || f.kind !== 'noisy' || f.masked) return false;
    f.masked = 'you';
    logEv(s, 'Masked a noisy channel in the ' + PC.AGEING[f.lane].name.toLowerCase(), 'detector');
    return true;
  }

  /* ───────────── storage ───────────── */
  // capacity is priced against the lab's budget: a share of the grant every unit of data earns, cut by storage technology
  function storePrice(s) { var m = mults(s); return BAL.storePrice * m.funding / m.storage; }
  // capacity for `sec` seconds of the data now coming in
  function storeChunk(s, dv, sec) { dv = dv || derive(s); return Math.max(BAL.storeMin, dv.dataIn * sec); }
  function buyStorage(s, amount, extra) {
    var cost = amount * storePrice(s);
    if (!(amount > 0) || cost > s.funds + (extra || 0) + 1e-9) return false;
    s.funds -= cost; s.store.cap += amount; s.store.full = false;
    return cost;
  }

  /* ───────────── discoveries ───────────── */
  // what a search needs and how fast it collects signal now (discoveries and excesses alike)
  function search(s, d, dv) {
    var cp = dv.caps;
    var missCaps = d.needs.filter(function (c) { return !cp[c]; });
    var rate = 0, machines = [];
    dv.facs.forEach(function (x) {
      var ok = Object.keys(d.via).some(function (b) {
        return x.E[b] !== undefined && x.E[b] >= d.via[b];
      });
      if (ok) { machines.push(x.f); rate += x.raw; }
    });
    // its own stream's kept fraction (the average where the stream doesn't exist yet), then the computing's
    var kept = d.stream && dv.streamKept[d.stream] !== undefined ? dv.streamKept[d.stream] : dv.keptAvg;
    var te = thrEff(s, d, dv);
    rate *= kept * dv.cKept * dv.m.quality * dv.m.analysis * te * (dv.write === undefined ? 1 : dv.write);
    return { missCaps: missCaps, machines: machines, rate: missCaps.length ? 0 : rate, trigEff: te };
  }
  function discoveryInfo(s, d, dv) {
    dv = dv || derive(s);
    var q = search(s, d, dv);
    var st = s.disc[d.id] || { S: 0 };
    return {
      d: d, done: !!st.done, S: st.S, sigma: 5 * Math.sqrt(st.S / d.need),
      missCaps: q.missCaps, machines: q.machines,
      eligible: !st.done && !q.missCaps.length && q.machines.length > 0,
      rate: q.rate, shown: st.shown || null, trigEff: q.trigEff
    };
  }

  /* ───────────── unexpected excesses ───────────── */
  // a fluke's significance rises like a real signal, peaks at A·σ when S = need, then falls as 1/√S
  function excessSigma(e, st) {
    var x = st.S / e.need;
    if (e.real) return 5 * Math.sqrt(x);
    return st.A * Math.sqrt(x) * Math.exp((1 - x) / 2);
  }
  function excessInfo(s, e, dv) {
    dv = dv || derive(s);
    var q = search(s, e, dv), st = s.exc[e.id] || { S: 0, A: e.peak || 0 };
    var open = !st.done && !st.faded;
    return {
      e: e, S: st.S, sigma: st.done ? 5 : excessSigma(e, st), done: !!st.done, faded: !!st.faded, shown: st.shown || null,
      seen: !!st.s2, rate: q.rate, machines: q.machines, missCaps: q.missCaps, trigEff: q.trigEff,
      eligible: legacyOk(s, e) && open && !q.missCaps.length && q.machines.length > 0
    };
  }

  /* ───────────── conferences ───────────── */
  // what can be shown at the open conference: running analyses and excesses at ≥ 3σ, not shown before
  function presentable(s, dv) {
    if (!s.conf.open) return [];
    dv = dv || derive(s);
    var out = [];
    PC.DISCOVERIES.forEach(function (d) {
      var st = s.disc[d.id];
      if (!st || st.done || st.shown) return;
      var i = discoveryInfo(s, d, dv);
      if (i.sigma >= 3) out.push({ id: d.id, kind: 'disc', name: d.name, sigma: i.sigma });
    });
    PC.EXCESSES.forEach(function (e) {
      var st = s.exc[e.id];
      if (!st || st.done || st.faded || st.shown) return;
      var sg = excessSigma(e, st);
      if (sg >= 3) out.push({ id: e.id, kind: 'exc', name: e.name, sigma: sg });
    });
    return out;
  }
  function present(s, id) {
    var dv = derive(s), item = presentable(s, dv).filter(function (x) { return x.id === id; })[0];
    if (!item) return false;
    var it = item.kind === 'disc' ? DISC[id] : EXC[id], st = item.kind === 'disc' ? s.disc[id] : s.exc[id];
    var g = it.rep * BAL.showRep * dv.m.rep;
    st.shown = s.conf.open.name; st.gain = g;
    s.rep += g; s.runTotals.rep += g; s.life.rep += g;
    s.conf.open.shown.push(id); s.conf.open.sig[id] = item.sigma; s.conf.open.rep += g;
    logEv(s, 'Shown at ' + s.conf.open.name + ': ' + it.name + ' (' + item.sigma.toFixed(1) + 'σ)', 'conf');
    return { rep: g, name: it.name, conf: s.conf.open.name };
  }

  /* ───────────── conference series and the archive ───────────── */
  // the series that meets next: founded by this year, not met yet this year; the one that met longest ago first
  function nextSeries(s) {
    var y = year(s), held = (s.conf && s.conf.held) || {};
    var open = PC.CONF_SERIES.filter(function (c) { return c.since <= y && held[c.name] !== y; });
    open.sort(function (a, b) { return (held[a.name] || 0) - (held[b.name] || 0); });
    return open[0] || null;
  }
  function archiveConf(s, o) {
    s.confLog.push({ n: s.confLog.length + 1, name: o.name, year: o.year || year(s), edition: o.edition || 1, t: s.t, gen: s.gen,
      np: (o.papers || []).length,                                            // the papers shown, the first few kept in full
      papers: (o.papers || []).slice(0, 8).map(function (p) { return { result: p.result || p.name, journal: p.journal }; }),
      shown: o.shown.map(function (id) { return { id: id, kind: DISC[id] ? 'disc' : 'exc', sigma: (o.sig || {})[id] || 0 }; }),
      rep: o.rep || 0, staff: o.staff || {}, seed: o.seed || 1 });
    if (s.confLog.length > 300) s.confLog.shift();
  }
  // what became of a result shown at a conference: a discovery, withdrawn, or still open
  function confFate(s, x) {
    if (x.fate) return x.fate;                                                // settled in an earlier generation
    var st = x.kind === 'disc' ? s.disc[x.id] : s.exc[x.id];
    return st && st.done ? 'discovery' : st && st.faded ? 'withdrawn' : 'open';
  }

  /* ───────────── beam operations ───────────── */
  function dumpFill(s) {
    var b = s.beam;
    if (b.phase !== 'stable' || s.ls) return false;
    b.phase = 'turn'; b.turn = BAL.fillTurn;
    return true;
  }
  function helpFault(s) {
    var f = s.beam.fault;
    if (!f) return false;
    f.remain = Math.max(0, f.remain - f.total * BAL.faultHelp);
    return true;
  }
  // staff make repairs faster
  function repairSpeed(s) { return 1 + 0.25 * Math.log2(1 + n(s, 'accphys')) + 0.15 * Math.log2(1 + n(s, 'technician')); }
  function startFault(s, kind, fac, ev) {
    var down = kind.down;
    s.beam.fault = { kind: kind.id, name: kind.name, fac: kind.all ? null : fac.id, remain: down, total: down };
    logEv(s, 'Fault: ' + kind.name + (kind.all ? ' — all machines' : ' — ' + fac.name), 'fault');
    ev.push({ type: 'fault', kind: kind.id, fac: kind.all ? null : fac.id });
  }
  function beamTick(s, dt, ev) {
    var b = s.beam;
    var machines = PC.FACILITIES.filter(function (f) { return f.id !== 'cosmic' && f.role === 'physics' && built(s, f.id); });
    var colliders = machines.filter(isCollider);
    if (s.ls) {                                         // no beam: the next fill starts after the shutdown
      b.fault = null;
      if (colliders.length) { b.phase = 'turn'; b.turn = BAL.fillTurn; }
      return;
    }
    // repairs
    if (b.fault) {
      b.fault.remain -= dt * repairSpeed(s);
      if (b.fault.remain <= 0) {
        var hitCollider = !b.fault.fac || (FAC[b.fault.fac] && isCollider(FAC[b.fault.fac]));
        logEv(s, 'Recovered from: ' + b.fault.name, 'fault');
        ev.push({ type: 'faultEnd', name: b.fault.name });
        b.fault = null;
        if (hitCollider && colliders.length) { b.phase = 'turn'; b.turn = BAL.fillTurn; }
      }
    }
    // fills
    var colliderDown = b.fault && (!b.fault.fac || isCollider(FAC[b.fault.fac]));
    if (!colliders.length) b.phase = 'off';
    else if (b.phase === 'off') { b.phase = 'turn'; b.turn = BAL.fillTurn; }
    if (b.phase === 'turn' && !colliderDown) {
      b.turn -= dt;
      if (b.turn <= 0) { b.phase = 'stable'; b.age = 0; b.fill++; }
    } else if (b.phase === 'stable') {
      if (colliderDown) { b.phase = 'turn'; b.turn = BAL.fillTurn; }      // the fault dumped the beam
      else {
        b.age += dt;
        if (b.age >= BAL.fillAutoAge) { b.phase = 'turn'; b.turn = BAL.fillTurn; }   // the operators' automatic dump
      }
    }
    // new faults
    if (b.fault || !machines.length) return;
    if (b.lhcAt !== null && !b.inc08 && s.t - b.lhcAt >= BAL.incidentDelay) {    // history: nine days after first beam
      b.inc08 = true;
      startFault(s, PC.INCIDENT_2008, FAC.lhc, ev);
      return;
    }
    b.nextFault -= dt;
    if (b.nextFault > 0) return;
    b.nextFault = -Math.log(1 - rand(s)) * BAL.faultEvery;
    var fac = machines[machines.length - 1];             // mostly the newest machine
    if (machines.length > 1 && rand(s) < 0.35) fac = machines[Math.floor(rand(s) * (machines.length - 1))];
    var sc = fac.id === 'lhc', inj = fac.id !== 'linac1' && fac.id !== 'ps';
    var kinds = PC.FAULTS.filter(function (k) { return k.on === 'any' || (k.on === 'sc' && sc) || (k.on === 'inj' && inj); });
    var tot = 0; kinds.forEach(function (k) { tot += k.w; });
    var r = rand(s) * tot, kind = kinds[0];
    for (var i = 0; i < kinds.length; i++) { r -= kinds[i].w; if (r <= 0) { kind = kinds[i]; break; } }
    startFault(s, kind, fac, ev);
  }

  /* ───────────── analysis slots ───────────── */
  function activeCount(s) {
    var c = 0;
    PC.DISCOVERIES.forEach(function (d) { var st = s.disc[d.id]; if (st && st.active && !st.done) c++; });
    return c;
  }
  function startAnalysis(s, id) {
    var d = DISC[id];
    if (!d || activeCount(s) >= mults(s).slots) return false;
    var info = discoveryInfo(s, d);
    if (!info.eligible) return false;
    var st = s.disc[id] || (s.disc[id] = { S: 0, done: false });
    st.active = true;
    return true;
  }
  function stopAnalysis(s, id) {
    var st = s.disc[id];
    if (st) st.active = false;
    return true;
  }
  // fill free slots with eligible analyses, oldest physics first
  function autoQueue(s, dv) {
    var free = dv.m.slots - activeCount(s);
    if (free <= 0) return;
    PC.DISCOVERIES.forEach(function (d) {
      if (free <= 0 || !legacyOk(s, d)) return;
      var st = s.disc[d.id];
      if (st && (st.active || st.done || st.paused)) return;
      if (discoveryInfo(s, d, dv).eligible) {
        st = s.disc[d.id] || (s.disc[d.id] = { S: 0, done: false });
        st.active = true; free--;
      }
    });
  }

  /* ───────────── time ───────────── */
  function tick(s, dt) {
    var ev = [];
    if (!s.beam) migrate(s);
    s.t += dt; s.life.t += dt;

    PC.FACILITIES.forEach(function (f) {
      var st = s.fac[f.id];
      if (st && !st.built) {
        st.remain -= dt;
        if (st.remain <= 0) {
          st.built = true; st.remain = 0; logEv(s, 'Commissioned: ' + f.name, 'build'); ev.push({ type: 'built', id: f.id });
          if (f.id === 'lhc') s.beam.lhcAt = s.t;
        }
      }
    });

    if (s.ls) {
      s.ls.remain -= dt;
      if (s.ls.remain <= 0) {
        s.ls.items.forEach(function (id) { s.tech[id] = 'installed'; });
        s.health = {}; s.dfaults = [];                     // everything refurbished and repaired, new parts like new
        logEv(s, 'Long Shutdown ' + s.ls.n + ' complete. Run ' + (s.run + 1) + ' begins.', 'ls');
        ev.push({ type: 'lsdone', items: s.ls.items });
        s.ls = null; s.run++;
      }
    }

    beamTick(s, dt, ev);

    // conferences
    var cf = s.conf;
    if (cf.open) {
      cf.open.remain -= dt;
      if (cf.open.remain <= 0) {
        ev.push({ type: 'confEnd', name: cf.open.name, shown: cf.open.shown.length });
        archiveConf(s, cf.open);
        cf.open = null; cf.next = s.t + BAL.confEvery;
      }
    } else if (s.t >= cf.next && !nextSeries(s)) {
      cf.next = s.t + 60;                                                     // every series has met this year: wait for the next
    } else if (s.t >= cf.next) {
      var ser = nextSeries(s), y = year(s);
      cf.held[ser.name] = y; cf.ed[ser.name] = (cf.ed[ser.name] || 0) + 1;
      cf.open = { name: ser.name, year: y, edition: cf.ed[ser.name], remain: BAL.confOpen, shown: [], sig: {}, papers: s.accepted, rep: 0,
        staff: { professor: n(s, 'professor'), postdoc: n(s, 'postdoc'), grad: n(s, 'grad') }, seed: Math.floor(rand(s) * 1e9) };
      cf.n++;
      // the papers published since the last conference are shown there
      var bonus = 0;
      s.accepted.forEach(function (p) { bonus += p.gain * BAL.confPaperRep; });
      s.rep += bonus; s.runTotals.rep += bonus; s.life.rep += bonus; cf.open.rep += bonus;
      if (s.accepted.length) logEv(s, cf.open.name + ': ' + s.accepted.length + ' new paper' + (s.accepted.length > 1 ? 's' : '') + ' shown · +' + bonus.toFixed(1) + ' reputation', 'conf');
      s.accepted = [];
      ev.push({ type: 'conf', name: cf.open.name, papers: cf.open.papers.length, bonus: bonus });
    }

    var dv = derive(s);
    var beamOn = dv.facs.some(function (x) { return x.f.id !== 'cosmic' && x.raw > 0; });
    ageTick(s, dt, beamOn);
    dfaultTick(s, dt, beamOn, ev);
    var dd = Math.min(dv.dataRate * dt, Math.max(0, s.store.cap - s.store.used)), df = dv.fundsRate * dt;
    var wasFull = s.store.full;
    s.store.used += dd;
    s.store.full = s.store.used >= s.store.cap;
    if (s.store.full && !wasFull) {
      ev.push({ type: 'storeFull' });
      logEv(s, 'Storage full: no new data is written until more is bought', 'fault');
    }
    if (s.flags.autoStore !== false && dv.caps.autostore && s.store.used >= s.store.cap * BAL.storeAutoAt) {
      var amt = Math.min(storeChunk(s, dv, BAL.storeChunk), (s.funds + df) / storePrice(s));   // what the budget allows
      if (amt >= Math.min(storeChunk(s, dv, BAL.storeChunk) * 0.25, BAL.storeMin)) buyStorage(s, amt, df);
    }
    s.data += dd; s.funds += df;
    s.runTotals.data += dd; s.life.data += dd;
    s.runTotals.funds += df; s.life.funds += df;

    if (s.flags.autoQueue !== false) autoQueue(s, dv);
    PC.DISCOVERIES.forEach(function (d) {
      var st = s.disc[d.id];
      if (!legacyOk(s, d) || !st || st.done || !st.active) return;
      var info = discoveryInfo(s, d, dv);
      if (!info.eligible || info.rate <= 0) return;
      st.S += info.rate * dt;
      var sig = 5 * Math.sqrt(st.S / d.need);
      if (!st.s3 && sig >= 3) { st.s3 = true; ev.push({ type: 'evidence', id: d.id }); logEv(s, 'Evidence (3σ): ' + d.name, 'sig'); }
      if (sig >= 5) {
        st.done = true; st.active = false; st.at = s.t; st.S = d.need;
        var r = d.rep * dv.m.rep * (1 + (st.shown ? BAL.confirmRep : 0)), g = dv.fundsRate * BAL.discoveryGrantSeconds + 50;
        s.rep += r; s.runTotals.rep += r; s.life.rep += r;
        s.funds += g;
        logEv(s, 'DISCOVERY (5σ): ' + d.name + ' — ' + d.particle + (st.shown ? ' (as shown at ' + st.shown + ')' : ''), 'disc');
        ev.push({ type: 'discovery', id: d.id, rep: r, grant: g, shown: st.shown || null });
      }
    });

    // unexpected excesses build up from whatever data the beam and detector allow
    PC.EXCESSES.forEach(function (e) {
      if (!legacyOk(s, e)) return;
      var st = s.exc[e.id];
      if (st && (st.done || st.faded)) return;
      var q = search(s, e, dv);
      if (q.missCaps.length || !q.machines.length || q.rate <= 0) return;
      if (!st) st = s.exc[e.id] = { S: 0, A: e.real ? 0 : e.peak * (0.92 + 0.16 * rand(s)) };
      st.S += q.rate * dt;
      var sg = excessSigma(e, st), x = st.S / e.need;
      if (!st.s2 && sg >= 2) { st.s2 = true; logEv(s, 'An excess appears: ' + e.name, 'sig'); ev.push({ type: 'excess', id: e.id }); }
      if (!st.s3 && sg >= 3) { st.s3 = true; logEv(s, 'Excess at 3σ: ' + e.name, 'sig'); ev.push({ type: 'excess3', id: e.id }); }
      if (e.real && sg >= 5) {
        st.done = true;
        var r = e.rep * dv.m.rep * (1 + (st.shown ? BAL.confirmRep : 0));
        s.rep += r; s.runTotals.rep += r; s.life.rep += r;
        logEv(s, 'UNEXPECTED DISCOVERY (5σ): ' + e.name + ' — ' + e.particle + (st.shown ? ' (as shown at ' + st.shown + ')' : ''), 'disc');
        ev.push({ type: 'surprise', id: e.id, rep: r, shown: st.shown || null });
      } else if (!e.real && x > 1 && sg < 1) {
        st.faded = true;
        var loss = st.shown ? Math.min(s.rep, st.gain * BAL.retractCost) : 0;
        s.rep -= loss; s.runTotals.rep -= loss;
        logEv(s, 'Excess gone with more data: ' + e.name + (st.shown ? ' — the result shown at ' + st.shown + ' is withdrawn' : ''), st.shown ? 'fault' : 'info');
        ev.push({ type: 'faded', id: e.id, shown: st.shown || null, loss: loss });
      }
    });

    reviewTick(s, dt, ev);
    if (dv.m.autoPublish && s.flags.autoPub) autoPublish(s);
    return ev;
  }

  // Fast-forward (offline progress). Coarse steps are fine: rates are piecewise constant.
  function simulate(s, seconds, step) {
    seconds = Math.min(seconds, BAL.offlineCap);
    var ev = [], before = { data: s.runTotals.data, funds: s.runTotals.funds, rep: s.runTotals.rep };
    step = step || Math.max(1, Math.min(30, seconds / 3000));
    for (var t = 0; t < seconds; t += step) ev = ev.concat(tick(s, Math.min(step, seconds - t)));
    return {
      seconds: seconds, events: ev,
      data: s.runTotals.data - before.data, funds: s.runTotals.funds - before.funds, rep: s.runTotals.rep - before.rep
    };
  }

  function year(s) {
    var y = 1950;
    PC.FACILITIES.forEach(function (f) { if (built(s, f.id) && !f.speculative) y = Math.max(y, f.year); });
    PC.TECH.forEach(function (t) { if (installed(s, t.id) && !t.speculative) y = Math.max(y, t.year); });
    PC.DISCOVERIES.forEach(function (d) { if (s.disc[d.id] && s.disc[d.id].done && !d.speculative) y = Math.max(y, d.year); });
    return y;
  }

  /* ───────────── prestige ───────────── */
  function canPrestige(s) { return has(s, 'hgg') || has(s, 'h4l'); }
  function prestigeGain(s) { return Math.floor(Math.sqrt(s.runTotals.rep / 1e4)); }
  function prestige(s) {
    if (!canPrestige(s)) return null;
    var gain = prestigeGain(s);
    // the conference archive goes on to the next generation, the fates of this one's results settled
    s.confLog.forEach(function (e) { if (e.gen === s.gen) e.shown.forEach(function (x) { x.fate = confFate(s, x); }); });
    var keep = { legacy: s.legacy + gain, gen: s.gen + 1, life: s.life, log: s.log, flags: s.flags, confLog: s.confLog, confEd: s.conf.ed };
    logEv(s, 'New-generation proposal approved. +' + gain + ' Legacy.', 'prestige');
    var ns = newState(keep);
    return ns;
  }

  function nobels(s) {
    var c = 0;
    PC.DISCOVERIES.forEach(function (d) { if (d.nobel && s.disc[d.id] && s.disc[d.id].done) c++; });
    return c;
  }

  PC.Engine = {
    newState: newState, derive: derive, tick: tick, simulate: simulate, click: click,
    buyFacility: buyFacility, buyTech: buyTech, hire: hire, startShutdown: startShutdown,
    pendingTech: pendingTech, shutdownDuration: shutdownDuration,
    facStatus: facStatus, techStatus: techStatus, staffStatus: staffStatus, staffCost: staffCost,
    missing: missing, name: name, has: has, caps: caps, facEnergy: facEnergy, facLumi: facLumi,
    measurements: measurements, publish: publish, paperSlots: paperSlots, reviewOdds: reviewOdds, reviewSpeed: reviewSpeed,
    reviewQuality: reviewQuality, paperResult: paperResult, inReview: inReview,
    detectorHealth: detectorHealth, ageingSlow: ageingSlow, maintDuration: maintDuration, dfaultRepairSpeed: dfaultRepairSpeed,
    setThreshold: setThreshold, maskChannel: maskChannel, thrEff: thrEff,
    storePrice: storePrice, storeChunk: storeChunk, buyStorage: buyStorage, nextSeries: nextSeries, confFate: confFate,
    discoveryInfo: discoveryInfo, year: year, nobels: nobels, migrate: migrate,
    excessInfo: excessInfo, presentable: presentable, present: present, setTrigger: setTrigger,
    dumpFill: dumpFill, helpFault: helpFault, fillLumi: fillLumi, repairSpeed: repairSpeed,
    startAnalysis: startAnalysis, stopAnalysis: stopAnalysis, activeCount: activeCount,
    canPrestige: canPrestige, prestigeGain: prestigeGain, prestige: prestige
  };
})();
