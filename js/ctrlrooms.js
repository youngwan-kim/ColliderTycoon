/* The two control rooms on the overview: the accelerator's under the map, the detector's
 * under the computing lens. Each has its own canvas, and a layout of its own. Click either
 * to open its window.
 *
 * Accelerator control room, after the CERN Control Centre at Prévessin, seen from above:
 * a curved video wall (the luminosity of the last 30 minutes, the injection chain, "page 1"
 * with the fill or the fault in big type, the alarm list) over round console islands, one
 * per machine family: the PS complex, the SPS, the collider and the technical
 * infrastructure. An island appears when its machines are built. A glass visitors' gallery
 * runs down the right side; now and then a tour stops behind it.
 *   On shift: two operators per island while there is beam, and your accelerator physicists.
 *   Injection: operators gather at the collider's island and page 1 counts down.
 *   A fault: a rotating beacon, the faulty machines' island flashes, people hurry over to
 *   it and physicists on call come in to help. A beam dump flashes the wall. A Long
 *   Shutdown empties the islands and dims the lights. Shifts change at the islands.
 *
 * Detector control room, after an experiment's (CMS at Point 5), seen from the back of the
 * room: a wall of screens (run status, trigger rates, the event display, detector health)
 * and two straight rows of desks facing it, each with its job on its screens: the shift
 * leader, run control (DAQ) and the trigger in front; a desk per installed subsystem and
 * data quality (DQM) behind. Experts stand at the back by the run plan's whiteboard.
 *   A subsystem fault turns its desk red and its on-call expert walks in to fix it. A
 *   saturated trigger or a full disk sets off the trigger or DAQ desk, and people crowd
 *   round it. A new run, or stable beams: the shift leader stands up and the wall says so.
 *   A signal candidate: someone points at the event display and the others turn to look.
 *   A Long Shutdown leaves a skeleton crew and the cosmics.
 *
 * People walk along aisles and walkways, never through the furniture.
 */
var PC = PC || {};

PC.CtrlRooms = (function () {
  var ctx, W = 0, H = 0, dpr = 1, colors = {}, view = null, onPick = null;
  var surf = {};                                        // room id → { cv, ctx, W, H }; ctx/W/H point at the one being drawn
  var rooms = { ccc: { agents: [], t: 0 }, dcr: { agents: [], t: 0 } }, event = { t: -1, tracks: [] };

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    ['--fg', '--dim', '--faint', '--rule', '--b1', '--b2', '--ok', '--warn', '--screen', '--panel', '--mono'].forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }
  function resize() {
    dpr = window.devicePixelRatio || 1;
    Object.keys(surf).forEach(function (id) {
      var S = surf[id], r = S.cv.getBoundingClientRect();
      S.W = r.width; S.H = r.height;
      S.cv.width = Math.round(S.W * dpr); S.cv.height = Math.round(S.H * dpr);
      S.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    if (view) draw(performance.now());
  }
  function label(t, x, y, col, align, size, bold) {
    ctx.fillStyle = col; ctx.font = (bold ? '600 ' : '') + (size || 10) + 'px ' + colors.mono; ctx.textAlign = align || 'left'; ctx.fillText(t, x, y); ctx.textAlign = 'left';
  }
  function fit(t, w, size, bold) {
    ctx.font = (bold ? '600 ' : '') + size + 'px ' + colors.mono;
    if (ctx.measureText(t).width <= w) return t;
    while (t.length > 1 && ctx.measureText(t + '…').width > w) t = t.slice(0, -1);
    return t.trim() + '…';
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  // switch drawing to a room's canvas; false if it has no size (hidden)
  function use(id) {
    var S = surf[id];
    if (!S || !S.W || S.cv.offsetParent === null) return false;
    ctx = S.ctx; W = S.W; H = S.H;
    ctx.clearRect(0, 0, W, H);
    return true;
  }

  /* ───────── the screens ───────── */
  function panel(P, alarm) {
    ctx.fillStyle = colors.rule; ctx.globalAlpha = 0.35; ctx.fillRect(P.x, P.y, P.w, P.h); ctx.globalAlpha = 1;
    ctx.strokeStyle = alarm ? colors.b2 : colors.faint; ctx.lineWidth = alarm ? 1.5 : 1;
    ctx.strokeRect(Math.round(P.x) + 0.5, Math.round(P.y) + 0.5, Math.round(P.w) - 1, Math.round(P.h) - 1); ctx.lineWidth = 1;
  }
  function inset(P, k) { return { x: P.x + k, y: P.y + k, w: P.w - 2 * k, h: P.h - 2 * k }; }
  // the last 30 minutes of luminosity, faults in red
  function lumiCurve(r, hist, now) {
    if (!hist || hist.length < 2) { label('no beam yet', r.x + r.w / 2, r.y + r.h / 2 + 3, colors.faint, 'center', 7.5); return; }
    var vmax = 2.2;
    hist.forEach(function (p) { vmax = Math.max(vmax, p.v * 1.05); });
    function X(t) { return r.x + (t - (now - 1800)) / 1800 * r.w; }
    function Y(v) { return r.y + r.h - 2 - v / vmax * (r.h - 4); }
    hist.forEach(function (p, i) {
      if (!p.fault) return;
      var nx = hist[i + 1] ? X(hist[i + 1].t) : X(now);
      ctx.fillStyle = colors.b2; ctx.globalAlpha = 0.25; ctx.fillRect(Math.max(r.x, X(p.t)), r.y, Math.max(1, nx - X(p.t)), r.h); ctx.globalAlpha = 1;
    });
    ctx.strokeStyle = colors.faint; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(r.x, Y(1)); ctx.lineTo(r.x + r.w, Y(1)); ctx.stroke(); ctx.setLineDash([]);
    ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    ctx.strokeStyle = colors.b1; ctx.lineWidth = 1.2; ctx.beginPath();
    hist.forEach(function (p, i) {
      var prev = hist[i - 1], jump = !prev || p.t - prev.t > 10;
      if (!jump && Math.abs(p.v - prev.v) > 0.3) ctx.lineTo(X(p.t), Y(prev.v));
      ctx[jump ? 'moveTo' : 'lineTo'](X(p.t), Y(p.v));
    });
    ctx.stroke(); ctx.restore(); ctx.lineWidth = 1;
  }
  // the beam at the detector over the last 30 minutes
  function beamStrip(r, hist, now) {
    ctx.fillStyle = colors.rule; ctx.globalAlpha = 0.4; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.globalAlpha = 1;
    (hist || []).forEach(function (p, i) {
      var nx = hist[i + 1] ? hist[i + 1].t : now;
      if (nx - p.t > 10) return;
      var x0 = r.x + (p.t - (now - 1800)) / 1800 * r.w, x1 = r.x + (nx - (now - 1800)) / 1800 * r.w;
      ctx.fillStyle = p.fault ? colors.b2 : p.ls ? colors.dim : p.v > 0.02 ? colors.ok : 'transparent';
      ctx.fillRect(Math.max(r.x, x0), r.y, Math.max(1, x1 - x0 + 0.5), r.h);
    });
  }
  function stColor(st) { return st === 'alarm' ? colors.b2 : st === 'inj' ? colors.b1 : st === 'on' ? colors.ok : colors.faint; }
  // the synoptic: the injection chain as drawn in the control room's window; before that is ready, rings lit by state
  function synoptic(P, machines, t) {
    if (PC.ChainView && PC.ChainView.drawMini(ctx, P)) return;   // the control room's own synoptic, small (chainview.js)
    var by = {}; machines.forEach(function (m) { by[m.id] = m.st; });
    var cx = P.x + P.w / 2, cy = P.y + P.h / 2 + 2, k = Math.min(P.w, P.h * 1.6) / 60;
    var rings = [['lhc', 0.45, -0.1, 14], ['sps', -0.15, 0.25, 7], ['sppbar', -0.15, 0.25, 7], ['ps', -0.55, 0.42, 3.4], ['psb', -0.8, 0.6, 1.6], ['aa', -0.25, 0.75, 1.8]];
    rings.forEach(function (rg) {
      var st = by[rg[0]];
      if (!st) return;
      var x = cx + rg[1] * P.w * 0.5, y = cy + rg[2] * P.h * 0.5, r = rg[3] * k, blink = st === 'alarm' && Math.sin(t * 6) < 0;
      ctx.strokeStyle = blink ? colors.faint : stColor(st); ctx.lineWidth = rg[0] === 'lhc' ? 1.6 : 1.2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.stroke();
    });
    ctx.lineWidth = 1;
  }
  // a mini event display: tracks out of the vertex, a new event every two seconds while there is beam; a candidate in amber
  function eventDisplay(P, on, t, hot) {
    var cx = P.x + P.w / 2, cy = P.y + P.h / 2, R = Math.min(P.w, P.h) / 2 - 3;
    ctx.strokeStyle = colors.faint; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.2832); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.45, 0, 6.2832); ctx.stroke();
    if (!on) return;
    var n = Math.floor(t / 2);
    if (event.t !== n) {
      event.t = n; event.tracks = [];
      var k = 4 + Math.floor(Math.random() * 7);
      for (var i = 0; i < k; i++) event.tracks.push({ a: Math.random() * 6.2832, c: (Math.random() - 0.5) * 0.08, l: 0.5 + Math.random() * 0.5, mu: Math.random() < 0.15 });
    }
    var age = (t / 2) % 1;
    ctx.globalAlpha = 1 - age * 0.7;
    event.tracks.forEach(function (tr, i) {
      ctx.strokeStyle = hot && i < 2 ? colors.warn : tr.mu ? colors.warn : colors.b1; ctx.lineWidth = hot && i < 2 ? 1.6 : 1; ctx.beginPath(); ctx.moveTo(cx, cy);
      for (var s = 0; s <= 1; s += 0.1) { var a = tr.a + tr.c * s * 10, rr = s * R * (tr.mu || (hot && i < 2) ? 1 : tr.l); ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      ctx.stroke();
    });
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
  }
  // a banner across a wall: the alarm, or the run starting
  function banner(x, y, w, text, col, t) {
    ctx.fillStyle = colors.screen; ctx.globalAlpha = 0.92; ctx.fillRect(x - w / 2, y - 8, w, 15); ctx.globalAlpha = 1;
    ctx.strokeStyle = col; ctx.strokeRect(Math.round(x - w / 2) + 0.5, Math.round(y - 8) + 0.5, Math.round(w) - 1, 14);
    label(fit(text, w - 8, 9, true), x, y + 3, col, 'center', 9, true);
  }

  /* ───────── walking: along a path of points; places and routes are each room's ───────── */
  // a: {x, y, path: [[x, y], …]}; wAt(y): px per unit of x (the detector room's floor narrows towards the wall)
  function walk(a, dt, v, wAt) {
    while (a.path.length) {
      var p = a.path[0], k = wAt ? wAt(a.y) : 1, dx = (p[0] - a.x) * k, dy = p[1] - a.y, d = Math.hypot(dx, dy);
      if (d > v * dt) { a.x += (p[0] - a.x) * v * dt / d; a.y += dy * v * dt / d; return true; }
      a.x = p[0]; a.y = p[1]; a.path.shift(); dt -= d / v;
      if (dt <= 0) break;
    }
    return a.path.length > 0;
  }
  // a route between two places: out along the first's chain to its walkway, across, in along the second's
  function route(M, from, to) {
    var A = M.places[from] || M.places.door, B = M.places[to] || M.places.door;
    if (from === to) return [];
    var out = A.chain.slice(), back = B.chain.slice().reverse();
    var a = out.length ? out[out.length - 1] : [A.x, A.y], b = back.length ? back[0] : [B.x, B.y];
    return out.concat(M.connect(A.c, a, B.c, b), back, [[B.x, B.y]]);
  }
  function send(a, M, to) { a.path = route(M, a.at, to); a.at = to; a.walking = a.path.length > 0; }
  // the staff wanted in a room: [{key, role, home}] → agents walk in through the door, or out of it
  function sync(room, M, roster) {
    var want = {};
    roster.forEach(function (r) { want[r.key] = r; });
    room.agents.forEach(function (a) {
      if (a.leaving) return;
      var r = want[a.key];
      if (!r || !M.places[r.home]) { a.leaving = true; a.goal = null; return; }
      a.home = r.home; delete want[a.key];
    });
    Object.keys(want).forEach(function (k) {
      var r = want[k];
      if (!M.places[r.home]) return;
      var a = { key: k, role: r.role, x: M.places.door.x, y: M.places.door.y, at: 'door', home: r.home, path: [], goal: null, timer: rnd(8, 25), ph: Math.random() * 6, typing: false };
      send(a, M, r.home); room.agents.push(a);
    });
  }
  // each agent where it should be: leaving → the door; a goal (an event) → there; else home, with errands now and then
  function steer(room, M, dt, t, errand) {
    room.agents.forEach(function (a) {
      if (a.walking) return;
      var to = a.leaving ? 'door' : a.goal && M.places[a.goal] ? a.goal : null;
      if (to) { if (a.at !== to) send(a, M, to); return; }
      if (a.at !== a.home && !a.errand) { send(a, M, a.home); return; }
      if (a.errand) {                                       // on an errand: stay a while, then back
        if ((a.errand -= dt) <= 0) { a.errand = 0; send(a, M, a.home); a.timer = rnd(25, 55); }
        return;
      }
      if (a.key.indexOf('oncall') === 0 || a.key === 'relief') return;     // on call or relieving someone: no errands
      if ((a.timer -= dt) > 0) return;
      var e = errand(a);
      if (e && M.places[e]) { send(a, M, e); a.errand = rnd(4, 8); } else a.timer = rnd(10, 25);
    });
    for (var i = room.agents.length - 1; i >= 0; i--) { var a = room.agents[i]; if (a.leaving && a.at === 'door' && !a.walking) room.agents.splice(i, 1); }
  }
  function move(room, dt, v, wAt) {
    room.agents.forEach(function (a) { if (a.walking) a.walking = walk(a, dt, v * (a.hurry ? 1.6 : 1), wAt); });
  }
  function sitting(a, M) { return !a.walking && !a.stand && M.places[a.at] && M.places[a.at].seat; }

  /* ═════════ the accelerator control room: islands, seen from above ═════════ */
  var ISLANDS = [{ id: 'ps', name: 'PS complex' }, { id: 'sps', name: 'SPS' }, { id: 'lhc', name: 'collider' }, { id: 'ti', name: 'TI' }];
  var cccFx = { dumpT: -99, phase: null, tour: null, nextTour: 12, nextShift: 30 };
  function islandOf(fac) {
    if (!fac) return 'ti';
    return fac === 'lhc' ? 'lhc' : fac === 'sps' || fac === 'sppbar' ? 'sps' : 'ps';
  }
  function colIsland(a) { return a.collider === 'lhc' ? 'lhc' : a.collider === 'sppbar' ? 'sps' : null; }
  function cccMap(a) {
    var u = H / 150, gw = Math.max(30, W * 0.11), fx0 = 6, fx1 = W - gw - 6;
    var wallTop = 17, wallH = Math.round(H * 0.22), yU = wallTop + wallH + 9 * u, yL = H - 6 * u;
    var span = (fx1 - fx0) / ISLANDS.length, r = Math.min(span * 0.34, (yL - yU) / 2 - 7 * u), cy = (yU + yL) / 2 + 2 * u;
    var M = { u: u, gw: gw, fx0: fx0, fx1: fx1, wallTop: wallTop, wallH: wallH, yU: yU, yL: yL, r: r, cy: cy, islands: [], places: {}, gaps: [] };
    var P = M.places;
    ISLANDS.forEach(function (I, i) {
      var cx = fx0 + span * (i + 0.5), built = a.islands[I.id];
      M.islands.push({ id: I.id, name: I.id === 'lhc' ? 'LHC' : I.id === 'sps' && a.collider === 'sppbar' ? 'Sp̄pS' : I.name, cx: cx, built: built });
      var exit = [cx, cy + 0.55 * r], foot = [cx, yL];
      [-122, -90, -58].forEach(function (deg, k) {                         // three chairs behind the console's curve
        var an = deg * Math.PI / 180;
        P['seat:' + I.id + ':' + k] = { x: cx + Math.cos(an) * 0.36 * r, y: cy + Math.sin(an) * 0.36 * r + 4 * u, seat: true, c: 'L', chain: [exit, foot] };
      });
      [180, 0, 140, 40, 90].forEach(function (deg, k) {                   // standing round the island's rim
        var an = deg * Math.PI / 180, x = cx + Math.cos(an) * 1.12 * r, y = cy + Math.sin(an) * 0.95 * r + 3 * u;
        P['rim:' + I.id + ':' + k] = { x: x, y: y, c: 'L', chain: [[x, yL]] };
      });
      if (i) M.gaps.push(fx0 + span * i);
    });
    M.gaps.unshift(fx0 + 4 * u); M.gaps.push(fx1 - 3 * u);
    for (var j = 0; j < 7; j++) P['wall:' + j] = { x: fx0 + (fx1 - fx0) * (0.12 + 0.76 * j / 6), y: yU, c: 'U', chain: [] };
    P.door = { x: 1, y: yU, c: 'U', chain: [] };
    P.coffee = { x: fx0 + 5 * u, y: yL, c: 'L', chain: [] };
    M.connect = function (ca, pa, cb, pb) {
      if (ca === cb) return [];
      var ya = ca === 'U' ? yU : yL, yb = cb === 'U' ? yU : yL, g = M.gaps[0];
      M.gaps.forEach(function (x) { if (Math.abs(pa[0] - x) + Math.abs(x - pb[0]) < Math.abs(pa[0] - g) + Math.abs(g - pb[0])) g = x; });
      return [[pa[0], ya], [g, ya], [g, yb]];
    };
    return M;
  }
  function cccStep(room, M, a, dt, t) {
    var here = a.on && !a.ls, fault = here && a.fault ? islandOf(a.fault.fac) : null;
    var col = colIsland(a), inj = here && !fault && col && a.phase === 'turn';
    if (fault && !a.islands[fault]) fault = 'ti';
    // the roster: two operators per island, the physicists at the third chairs, more on call during a fault
    var roster = [];
    if (here) {
      var built = M.islands.filter(function (I) { return I.built; });
      built.forEach(function (I) { roster.push({ key: 'op:' + I.id + ':0', role: 'op', home: 'seat:' + I.id + ':0' }, { key: 'op:' + I.id + ':1', role: 'op', home: 'seat:' + I.id + ':1' }); });
      var order = ['lhc', 'sps', 'ps', 'ti'].filter(function (id) { return a.islands[id]; });
      for (var e = 0; e < a.experts; e++) roster.push({ key: 'ap:' + e, role: 'phys', home: e < order.length ? 'seat:' + order[e] + ':2' : 'wall:' + (e * 2 % 7) });
      if (fault) for (var c = 0; c < Math.min(2, Math.max(1, a.experts)); c++) roster.push({ key: 'oncall:' + c, role: 'phys', home: 'rim:' + fault + ':' + (c + 2) });
    }
    // a shift change: the relief walks to the island, a word at the console, and the one going off shift leaves
    if (here && !fault && !inj && (cccFx.nextShift -= dt) <= 0) {
      cccFx.nextShift = rnd(50, 90);
      var ops = room.agents.filter(function (x) { return x.role === 'op' && !x.leaving && sitting(x, M); });
      if (ops.length) { var o = pick(ops); cccFx.shift = { key: o.key, island: o.home.split(':')[1], t: 0 }; }
    }
    var sh = cccFx.shift;
    if (sh) {
      var old = room.agents.filter(function (x) { return x.key === sh.key && !x.leaving; })[0], rel = room.agents.filter(function (x) { return x.key === 'relief'; })[0];
      if (!old || fault || !here) { if (rel) rel.leaving = true; if (old) old.talk = false; cccFx.shift = null; }
      else {
        roster.push({ key: 'relief', role: 'op', home: 'rim:' + sh.island + ':4' });
        if (rel && !rel.walking && rel.at === rel.home) {
          rel.stand = true; old.talk = true;
          if ((sh.t += dt) > 3.5) {                        // handed over: the relief takes the chair, the other goes home
            old.key = 'off:' + t; old.leaving = true; old.talk = false;
            rel.key = sh.key; rel.stand = false; rel.home = old.home; cccFx.shift = null;
          }
        }
      }
    }
    sync(room, M, roster);
    // events: a fault draws the physicists and the other islands' second operators; injection, two to the collider's island
    var k = 0;
    room.agents.forEach(function (x) {
      x.goal = null; x.hurry = !!fault;
      if (x.leaving || x.key === 'relief') return;
      var isl = x.home.split(':')[1];
      if (fault && (x.role === 'phys' && x.key.indexOf('oncall') < 0 || x.key === 'op:' + (isl !== fault ? isl : '') + ':1') && isl !== fault) {
        x.goal = 'rim:' + fault + ':' + (k++ % 5); x.errand = 0;
      } else if (inj && (x.key === 'op:ps:1' || x.key === 'ap:1' || x.key === 'op:ti:1')) {
        x.goal = 'rim:' + col + ':' + (k++ % 2 ? 0 : 1); x.errand = 0;
      }
    });
    steer(room, M, dt, t, function (x) {
      var r = Math.random();
      if (r < 0.4) return 'wall:' + Math.floor(Math.random() * 7);
      if (r < 0.7) return 'rim:' + pick(M.islands.filter(function (I) { return I.built; })).id + ':' + Math.floor(Math.random() * 4);
      return 'coffee';
    });
    move(room, dt, 30 * M.u);
  }

  function cccDraw(a, t, dt) {
    var room = rooms.ccc, M = cccMap(a), u = M.u, here = a.on && !a.ls, fault = here && a.fault ? islandOf(a.fault.fac) : null;
    if (fault && !a.islands[fault]) fault = 'ti';
    if (cccFx.phase === 'stable' && a.phase === 'turn' && !a.fault) cccFx.dumpT = t;         // a dump: the wall flashes
    cccFx.phase = a.phase;
    var dumping = t >= cccFx.dumpT && t - cccFx.dumpT < 2.5, alarmBlink = fault && Math.sin(t * 6) > 0;
    cccStep(room, M, a, dt, t);

    // floor, walls, title
    ctx.fillStyle = colors.screen; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = alarmBlink ? colors.b2 : colors.dim; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    label('ACCELERATOR CONTROL', 6, 11, fault ? colors.b2 : colors.faint, 'left', 8);
    label(a.ls ? 'Long Shutdown · all in the tunnels' : a.on ? (fault ? 'fault · ' + a.fault.name : a.status) : 'no accelerator yet', M.fx1, 11, fault ? colors.b2 : colors.faint, 'right', 8);

    // the curved video wall: the screens step down towards its ends
    var ws = [1, 1.4, 1, 0.9], tot = 0, gap = 4, ww = M.fx1 - M.fx0 - 8, x = M.fx0 + 4, P = [];
    ws.forEach(function (w) { tot += w; });
    ctx.strokeStyle = colors.dim; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(M.fx0, M.wallTop + M.wallH + 2); ctx.quadraticCurveTo((M.fx0 + M.fx1) / 2, M.wallTop + M.wallH - 10 * u, M.fx1, M.wallTop + M.wallH + 2); ctx.stroke();
    ctx.lineWidth = 1;
    ws.forEach(function (w, i) {
      var pw = (ww - gap * (ws.length - 1)) * w / tot, mid = (x + pw / 2 - (M.fx0 + M.fx1) / 2) / ((M.fx1 - M.fx0) / 2);
      P.push({ x: x, y: M.wallTop + mid * mid * 5 * u, w: pw, h: M.wallH - 6 * u }); x += pw + gap;
    });
    P.forEach(function (p) { panel(p, fault); });
    lumiCurve(inset(P[0], 3), a.hist, a.now);
    synoptic(P[1], a.machines, t);
    // page 1: what the machines are doing, in big type
    var p1 = P[2], big = Math.max(8.5, Math.round(p1.h * 0.24));
    var word = a.ls ? 'SHUTDOWN' : !a.on ? '—' : fault ? 'FAULT' : dumping ? 'BEAM DUMP' : a.phase === 'turn' ? 'INJECTION' : a.phase === 'stable' ? 'STABLE BEAMS' : 'BEAM ON';
    var sub = a.ls ? 'Long Shutdown' : fault ? a.fault.name : a.phase === 'turn' ? 'fill ' + (a.fill + 1) + ' · T−' + PC.dur(Math.max(0, a.turnLeft)) : a.phase === 'stable' ? 'fill ' + a.fill + ' · ' + a.status.split('·').pop().trim() : a.status;
    label('PAGE 1', p1.x + 3, p1.y + 8, colors.faint, 'left', 6.5);
    label(fit(word, p1.w - 6, big, true), p1.x + p1.w / 2, p1.y + p1.h * 0.5, fault ? colors.b2 : dumping ? colors.warn : a.phase === 'turn' && here ? colors.b1 : colors.fg, 'center', big, true);
    label(fit(sub || '', p1.w - 6, 7), p1.x + p1.w / 2, p1.y + p1.h * 0.5 + 8, colors.dim, 'center', 7);
    if (a.phase === 'turn' && here && !fault) {                             // the injection's progress
      var f = 1 - Math.max(0, a.turnLeft) / a.turnTotal;
      ctx.fillStyle = colors.rule; ctx.fillRect(p1.x + 4, p1.y + p1.h - 3, p1.w - 8, 1.5);
      ctx.fillStyle = colors.b1; ctx.fillRect(p1.x + 4, p1.y + p1.h - 3, (p1.w - 8) * f, 1.5);
    }
    // the alarm list
    var p3 = P[3];
    label('ALARMS', p3.x + 3, p3.y + 8, colors.faint, 'left', 6.5);
    var lines = Math.max(1, Math.floor((p3.h - 10) / 7.5));
    if (!a.alarms.length) label('none', p3.x + 3, p3.y + 17, colors.faint, 'left', 6.5);
    a.alarms.slice(0, lines).forEach(function (al, i) {
      var live = i === 0 && fault, c = live ? (Math.sin(t * 6) > 0 ? colors.b2 : colors.faint) : al.ok ? colors.dim : colors.faint;
      label(fit(al.text, p3.w - 6, 6.5), p3.x + 3, p3.y + 16.5 + i * 7.5, c, 'left', 6.5);
    });
    if (dumping) {                                                            // the dump: every screen flashes
      ctx.fillStyle = colors.warn; ctx.globalAlpha = 0.35 * (1 - (t - cccFx.dumpT) / 2.5) * (0.6 + 0.4 * Math.sin(t * 20));
      P.forEach(function (p) { ctx.fillRect(p.x, p.y, p.w, p.h); }); ctx.globalAlpha = 1;
    }

    // the coffee corner and the door
    ctx.fillStyle = colors.dim; ctx.fillRect(M.places.coffee.x - 3 * u, M.places.coffee.y - 9 * u, 4 * u, 5 * u);
    ctx.fillStyle = colors.faint; ctx.fillRect(0, M.yU - 9 * u, 2, 12 * u);

    // the islands: a round carpet, a curved console with its screens, the chairs; a name plate
    var busy = {};
    room.agents.forEach(function (x) { if (sitting(x, M)) busy[x.at] = x; });
    M.islands.forEach(function (I) {
      var cx = I.cx, cy = M.cy, r = M.r, st = !I.built ? 'none' : !here ? 'off' : fault === I.id ? 'alarm' : I.id === colIsland(a) && a.phase === 'turn' ? 'inj' : 'on';
      if (!I.built) {
        ctx.strokeStyle = colors.rule; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
        label(I.name, cx, cy + 3, colors.faint, 'center', 7);
        return;
      }
      ctx.fillStyle = st === 'alarm' ? colors.b2 : colors.rule;
      ctx.globalAlpha = st === 'alarm' ? 0.12 + 0.12 * Math.sin(t * 6) : 0.3; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
      if (st === 'alarm') { ctx.strokeStyle = colors.b2; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.stroke(); ctx.lineWidth = 1; }
      // the console: a thick arc facing the wall, screens along it
      ctx.strokeStyle = colors.dim; ctx.lineWidth = 4.5 * u; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, cy + 4 * u, 0.66 * r, -2.6, -0.54); ctx.stroke(); ctx.lineCap = 'butt'; ctx.lineWidth = 1;
      for (var s = 0; s < 6; s++) {
        var an = -2.5 + s * (1.86 / 5), sx = cx + Math.cos(an) * 0.66 * r, sy = cy + 4 * u + Math.sin(an) * 0.66 * r;
        ctx.fillStyle = st === 'off' ? colors.faint : stColor(st);
        ctx.globalAlpha = st === 'off' ? 0.5 : 0.65 + 0.35 * Math.sin(t * (st === 'alarm' ? 8 : 1.5) + s * 1.7 + cx);
        ctx.fillRect(sx - 1.6 * u, sy - 1.6 * u, 3.2 * u, 2.6 * u);
      }
      ctx.globalAlpha = 1;
      [0, 1, 2].forEach(function (k) {                                       // an empty chair
        var key = 'seat:' + I.id + ':' + k, p = M.places[key];
        if (busy[key]) return;
        ctx.strokeStyle = colors.faint; ctx.beginPath(); ctx.arc(p.x, p.y - 2 * u, 1.8 * u, 0, 6.2832); ctx.stroke();
      });
      label(I.name, cx, cy + r * 0.62 + 3, st === 'alarm' ? colors.b2 : st === 'inj' ? colors.b1 : colors.dim, 'center', 7, st === 'alarm');
    });

    // the people: seated ones at their consoles, standing ones over everything
    var ps = Math.max(1.3, u * 1.35);
    room.agents.slice().sort(function (p, q) { return p.y - q.y; }).forEach(function (x) { person(x, ps, t, M, sitting(x, M)); });

    // the visitors' gallery behind glass on the right; a tour now and then
    var gx = W - M.gw;
    ctx.fillStyle = colors.b1; ctx.globalAlpha = 0.06; ctx.fillRect(gx, 14, M.gw - 1, H - 15); ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.b1; ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.moveTo(gx + 0.5, 14); ctx.lineTo(gx + 0.5, H - 1); ctx.moveTo(gx + 2.5, 14); ctx.lineTo(gx + 2.5, H - 1); ctx.stroke(); ctx.globalAlpha = 1;
    label('visitors', gx + M.gw / 2 + 1, 11, colors.faint, 'center', 6.5);
    tour(M, gx, ps, dt, t);

    // a fault: the beacon on the wall turns, sweeping red light over the floor
    if (fault) {
      var bx = M.fx1 - 4, by = M.yU - 2, ang = t * 5;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, gx, H); ctx.clip();
      ctx.fillStyle = colors.b2; ctx.globalAlpha = 0.12;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.arc(bx, by, W * 0.7, ang, ang + 0.35); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.arc(bx, by, W * 0.7, ang + Math.PI, ang + Math.PI + 0.35); ctx.closePath(); ctx.fill();
      ctx.restore(); ctx.globalAlpha = 1;
      ctx.fillStyle = colors.b2; ctx.beginPath(); ctx.arc(bx, by, 2.6 * u, 0, 6.2832); ctx.fill();
    }
    if (a.ls) { ctx.fillStyle = '#000'; ctx.globalAlpha = 0.14; ctx.fillRect(1, 14, W - 2, H - 15); ctx.globalAlpha = 1; }   // the lights dimmed
  }
  // a tour group: in from the bottom of the gallery, a stop to look while the guide explains, and out again
  function tour(M, gx, ps, dt, t) {
    var T = cccFx.tour;
    if (!T) {
      if ((cccFx.nextTour -= dt) > 0) return;
      cccFx.nextTour = rnd(60, 110);
      T = cccFx.tour = { y: H + 12, stop: rnd(H * 0.35, H * 0.6), wait: rnd(7, 11), out: false, n: 4 + Math.floor(Math.random() * 3), ph: Math.random() * 6 };
    }
    var v = 14 * M.u * dt;
    if (!T.out) { if (T.y > T.stop) T.y = Math.max(T.stop, T.y - v); else if ((T.wait -= dt) <= 0) T.out = true; }
    else if ((T.y += v) > H + 20) { cccFx.tour = null; return; }
    var moving = T.out || T.y > T.stop;
    for (var i = 0; i < T.n; i++) {                                     // the guide first, the group behind, in two files
      var fx = gx + M.gw * (i === 0 ? 0.35 : i % 2 ? 0.55 : 0.78), fy = T.y + (i === 0 ? 0 : Math.ceil(i / 2) * 7 * M.u);
      if (fy > H + 2) continue;
      PC.People.figure(ctx, fx, fy, ps * 0.85, i === 0 ? colors.b1 : colors.faint, moving ? t * 8 + i + T.ph : 0, i === 0 && !moving && Math.sin(t * 4) > 0);
    }
  }

  /* ═════════ the detector control room: rows of desks, seen from the back ═════════ */
  var dcrFx = { run: null, beam: null, phase: null, startT: -99, startText: '', sigT: -99, lastEv: null, board: 0 };
  function dcrMap(d) {
    var u = H / 150, wallTop = 16, wallB = Math.round(H * 0.42), bx0 = W * 0.13, bx1 = W * 0.87;
    var y0 = wallB + 6 * u, r1 = wallB + 27 * u, y1 = r1 + 11 * u, r2 = y1 + 18 * u, y2 = r2 + 10 * u;
    var M = { u: u, wallTop: wallTop, wallB: wallB, bx0: bx0, bx1: bx1, y0: y0, y1: y1, y2: y2, rows: [], places: {} };
    M.wAt = function (y) { return (bx1 - bx0) + (W * 1.1 - (bx1 - bx0)) * Math.max(0, (y - wallB) / (H - wallB)); };
    M.X = function (fx, y) { return W / 2 + (fx - 0.5) * M.wAt(y); };
    M.k = function (y) { return u * (0.78 + 0.42 * Math.max(0, (y - wallB) / (H - wallB))); };   // nearer is bigger
    var P = M.places;
    // the front row: run control; the second: the subsystems and data quality
    var front = [{ id: 'sl', name: 'SHIFT LEADER' }, { id: 'daq', name: 'DAQ' }, { id: 'trg', name: 'TRIGGER' }];
    var back = d.lanes.map(function (l) { return { id: l.id, name: l.short, lane: l }; }).concat([{ id: 'dqm', name: 'DQM' }]);
    [[front, r1, y1, 0.17, 0.3, 0.7], [back, r2, y2, 0.15, 0.17, 0.83]].forEach(function (R, ri) {
      var list = R[0], n = list.length;
      list.forEach(function (D, i) {
        var fx = n === 1 ? 0.5 : R[4] + (R[5] - R[4]) * i / (n - 1);
        D.fx = fx; D.y = R[1]; D.w = Math.min(R[3], 0.7 / n); D.row = ri;
        P['seat:' + D.id] = { x: fx, y: R[1] + 5 * u, seat: true, c: String(ri + 1), chain: [[fx, R[2]]] };
        P['by:' + D.id + ':0'] = { x: fx - D.w * 0.45, y: R[2], c: String(ri + 1), chain: [] };
        P['by:' + D.id + ':1'] = { x: fx + D.w * 0.45, y: R[2], c: String(ri + 1), chain: [] };
        M.rows.push(D);
      });
    });
    for (var j = 0; j < 5; j++) P['wall:' + j] = { x: 0.2 + 0.15 * j, y: y0, c: '0', chain: [] };
    for (j = 0; j < 5; j++) P['back:' + j] = { x: 0.2 + 0.15 * j + (j % 2 ? 0.03 : -0.02), y: y2 + (j % 2 ? 9 : 5) * u, c: '2', chain: [[0.2 + 0.15 * j, y2]] };
    P.board = { x: 0.06, y: y1 + 6 * u, c: '1', chain: [[0.04, y1]] };
    P.coffee = { x: 0.1, y: H - 3 * u, c: '2', chain: [[0.1, y2]] };
    P.door = { x: 1.03, y: y2, c: '2', chain: [] };
    var wy = [y0, y1, y2];
    M.connect = function (ca, pa, cb, pb) {
      if (ca === cb) return [];
      var s = Math.abs(pa[0] - 0.04) + Math.abs(pb[0] - 0.04) < Math.abs(pa[0] - 0.96) + Math.abs(pb[0] - 0.96) ? 0.04 : 0.96;
      return [[s, wy[+ca]], [s, wy[+cb]]];
    };
    return M;
  }
  function dcrStep(room, M, d, dt, t) {
    var beamOn = d.beam && !d.ls;
    // the roster: a skeleton crew in a shutdown, two shifters on cosmics, four with beam; the engineers at their subsystems
    var roster = [{ key: 'sl', role: 'crew', home: 'seat:sl' }];
    if (!d.ls) {
      roster.push({ key: 'daq', role: 'crew', home: 'seat:daq' });
      if (beamOn) roster.push({ key: 'trg', role: 'crew', home: 'seat:trg' }, { key: 'dqm', role: 'crew', home: 'seat:dqm' });
      for (var e = 0; e < d.experts; e++) roster.push({ key: 'ex:' + e, role: 'expert', home: e < d.lanes.length ? 'seat:' + d.lanes[e].id : 'back:' + (e % 5) });
      d.lanes.forEach(function (l) { if (l.fault) roster.push({ key: 'oncall:' + l.id, role: 'expert', home: 'by:' + l.id + ':1' }); });
    }
    sync(room, M, roster);
    var hot = d.storeFull && !d.ls ? 'daq' : d.trigLimit && !d.ls && d.beam ? 'trg' : null, crowd = hot === 'daq' ? 2 : 1, k = 0;
    var pointing = t >= dcrFx.sigT && t - dcrFx.sigT < 5;
    room.agents.forEach(function (x) {
      x.goal = null; x.stand = false; x.hurry = false;
      if (x.leaving) return;
      if (x.key === 'sl' && t >= dcrFx.startT && t - dcrFx.startT < 4) x.stand = !x.walking && x.at === 'seat:sl';            // the shift leader stands up
      if (hot && (x.home.indexOf('back:') === 0 || x.key === 'dqm') && k < crowd) { x.goal = 'by:' + hot + ':' + (k++); x.errand = 0; x.hurry = true; }
      else if (pointing && x.key === (beamOn ? 'dqm' : 'daq')) { x.goal = 'wall:2'; x.errand = 0; }
    });
    steer(room, M, dt, t, function (x) {
      var r = Math.random();
      if (r < 0.3) { dcrFx.board++; return 'board'; }
      if (r < 0.55) return 'coffee';
      if (r < 0.8) return 'back:' + Math.floor(Math.random() * 5);
      return 'wall:' + Math.floor(Math.random() * 5);
    });
    move(room, dt, 26 * M.u, M.wAt);
  }

  function dcrDraw(d, t, dt) {
    var room = rooms.dcr;
    // the run starting, or stable beams: the wall says so and the shift leader stands up; a candidate: everyone looks
    if (dcrFx.run !== null && d.run !== dcrFx.run) { dcrFx.startT = t; dcrFx.startText = 'RUN ' + d.run + ' · START'; }
    else if (dcrFx.beam === false && d.beam && !d.ls) { dcrFx.startT = t; dcrFx.startText = d.stable ? 'STABLE BEAMS · RUN ' + d.run : 'BEAM ON · RUN ' + d.run; }
    else if (dcrFx.phase !== null && dcrFx.phase !== 'stable' && d.phase === 'stable' && d.collider) { dcrFx.startT = t; dcrFx.startText = 'STABLE BEAMS'; }
    dcrFx.run = d.run; dcrFx.beam = d.beam; dcrFx.phase = d.phase;
    var ev = PC.Display && PC.Display.current && PC.Display.current();
    if (ev && ev !== dcrFx.lastEv) { dcrFx.lastEv = ev; if (ev.signal && t - dcrFx.sigT > 12) dcrFx.sigT = t; }
    var M = dcrMap(d), u = M.u, alarm = !!d.lost, alarmBlink = alarm && Math.sin(t * 6) > 0, look = t >= dcrFx.sigT && t - dcrFx.sigT < 5;
    dcrStep(room, M, d, dt, t);

    // the room in perspective: ceiling, side walls, floor, the wall of screens at the far end
    ctx.fillStyle = colors.screen; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = colors.rule; ctx.globalAlpha = 0.18;
    ctx.beginPath(); ctx.moveTo(0, 13); ctx.lineTo(M.bx0, M.wallTop - 2); ctx.lineTo(M.bx0, M.wallB); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(W, 13); ctx.lineTo(M.bx1, M.wallTop - 2); ctx.lineTo(M.bx1, M.wallB); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.rule;
    ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(M.bx0, M.wallB); ctx.lineTo(M.bx1, M.wallB); ctx.lineTo(W, H); ctx.stroke();
    ctx.strokeStyle = alarmBlink ? colors.b2 : colors.dim; ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    label('DETECTOR CONTROL', 6, 10, alarm ? colors.b2 : colors.faint, 'left', 8);
    label(d.ls ? 'Long Shutdown · cosmics' : d.beam ? 'run ' + d.run + ' · taking data' : d.waiting || 'cosmics', W - 6, 10, alarm ? colors.b2 : colors.faint, 'right', 8);

    // the whiteboard with the run plan on the left wall, the door on the right
    var wbx0 = 5, wbx1 = M.bx0 - 9, wy = function (x, f) { return 13 + (M.wallTop - 15) * x / M.bx0 + f * ((H - 13) - (H - M.wallB) * x / M.bx0); };
    ctx.fillStyle = colors.panel; ctx.strokeStyle = colors.dim;
    ctx.beginPath(); ctx.moveTo(wbx0, wy(wbx0, 0.22)); ctx.lineTo(wbx1, wy(wbx1, 0.22)); ctx.lineTo(wbx1, wy(wbx1, 0.5)); ctx.lineTo(wbx0, wy(wbx0, 0.5)); ctx.closePath(); ctx.fill(); ctx.stroke();
    var nl = Math.min(5, 1 + dcrFx.board % 6);
    ctx.strokeStyle = colors.b1; ctx.globalAlpha = 0.7;
    for (var q = 0; q < nl; q++) {
      var f = 0.26 + q * 0.045, xa = wbx0 + 3, xb = wbx0 + 3 + (wbx1 - wbx0 - 6) * (0.5 + 0.4 * ((q * 37) % 10) / 10);
      ctx.beginPath(); ctx.moveTo(xa, wy(xa, f)); ctx.lineTo(xb, wy(xb, f)); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    var dx0 = W - 16, dx1 = W - 4;
    ctx.fillStyle = colors.faint; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(dx0, wy(W - dx0, 0.55)); ctx.lineTo(dx1, wy(W - dx1, 0.5)); ctx.lineTo(dx1, wy(W - dx1, 0.86)); ctx.lineTo(dx0, wy(W - dx0, 0.8)); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;

    // the wall of screens: run status and trigger rates, the event display, the detector's health
    var wx = M.bx0 + 3, wwid = M.bx1 - M.bx0 - 6, wt = M.wallTop, wh = M.wallB - M.wallTop - 4, g = 3;
    var cw = wwid * 0.3, ew = wwid - 2 * cw - 2 * g, hh = (wh - g) / 2;
    var S = { run: { x: wx, y: wt, w: cw, h: hh }, rates: { x: wx, y: wt + hh + g, w: cw, h: hh }, ev: { x: wx + cw + g, y: wt, w: ew, h: wh },
      health: { x: wx + cw + ew + 2 * g, y: wt, w: cw, h: hh }, beam: { x: wx + cw + ew + 2 * g, y: wt + hh + g, w: cw, h: hh } };
    Object.keys(S).forEach(function (k) { panel(S[k], alarm); });
    label('RUN ' + d.run, S.run.x + 3, S.run.y + 9, colors.fg, 'left', 8, true);
    label(fit(d.ls ? 'shutdown' : d.beam ? (d.stable ? 'stable beams' : 'taking data') : d.cosmics ? 'cosmics' : 'no beam', S.run.w - 6, 7), S.run.x + 3, S.run.y + 18, d.beam && !d.ls ? colors.ok : colors.dim, 'left', 7);
    // trigger rates: one bar per stream, wobbling with the rate
    var rr = inset(S.rates, 3), ns = d.streams.length || 1;
    d.streams.forEach(function (s, i) {
      var bw = (rr.w - (ns - 1) * 2) / ns, hgt = d.beam && !d.ls ? rr.h * Math.min(1, 0.25 + s.f * 1.2) * (0.85 + 0.15 * Math.sin(t * 3 + i * 2)) : 1;
      ctx.fillStyle = PC.TrigView ? PC.TrigView.streamColor(s.id) : colors.b1; ctx.fillRect(rr.x + i * (bw + 2), rr.y + rr.h - hgt, bw, hgt);
    });
    if (d.trigLimit && d.beam && !d.ls) { ctx.strokeStyle = colors.warn; ctx.strokeRect(S.rates.x + 1.5, S.rates.y + 1.5, S.rates.w - 3, S.rates.h - 3); }
    eventDisplay(S.ev, d.beam && !d.ls || d.cosmics, t, look);
    if (d.health.mode === 'stand') label('cosmics only', S.health.x + S.health.w / 2, S.health.y + S.health.h / 2 + 3, colors.faint, 'center', 7);
    else PC.HealthMap.thumb(ctx, inset(S.health, 2), d.health);
    label('health ' + d.worst + '%', S.beam.x + 3, S.beam.y + 9, colors[d.worstCol], 'left', 7);
    beamStrip({ x: S.beam.x + 3, y: S.beam.y + S.beam.h - 6, w: S.beam.w - 6, h: 3 }, d.hist, d.now);
    if (alarm && Math.sin(t * 4) > -0.3) banner(W / 2, (wt + M.wallB) / 2, Math.min(wwid - 10, 150), d.lost, colors.b2, t);
    else if (t >= dcrFx.startT && t - dcrFx.startT < 4) banner(W / 2, (wt + M.wallB) / 2, Math.min(wwid - 10, 150), dcrFx.startText, colors.ok, t);
    else if (look) banner(W / 2, M.wallB - 8, Math.min(ew + 20, 110), 'CANDIDATE', colors.warn, t);

    // the desks, far row first; the people at each row after it; standing people by depth
    var busy = {};
    room.agents.forEach(function (x) { if (sitting(x, M) || x.stand) busy[x.at] = x; });
    var items = M.rows.map(function (D) { return { y: D.y, D: D }; }).concat(room.agents.map(function (x) { return { y: x.y + 0.1, a: x }; }));
    items.sort(function (p, q) { return p.y - q.y; }).forEach(function (it) {
      if (it.D) deskDcr(it.D, M, d, t, busy['seat:' + it.D.id]); else personDcr(it.a, M, t, look);
    });
    if (d.ls) { ctx.fillStyle = '#000'; ctx.globalAlpha = 0.12; ctx.fillRect(1, 13, W - 2, H - 14); ctx.globalAlpha = 1; }
  }
  // a desk: its top in perspective, two screens showing its job, its name above them
  function deskDcr(D, M, d, t, who) {
    var u = M.u, y = D.y, k = M.k(y), w = D.w * M.wAt(y), x = M.X(D.fx, y), depth = 5 * k;
    var lane = D.lane, fault = lane && lane.fault, al = fault || (D.id === 'daq' && d.storeFull && !d.ls), busyTrg = D.id === 'trg' && d.trigLimit && d.beam && !d.ls;
    var on = !d.ls || D.id === 'sl', blink = al && Math.sin(t * 6) > 0;
    // the screens on the far edge
    var sw = w * 0.4, sh = 9 * k, sy = y - depth - sh + 1;
    [0, 1].forEach(function (i) {
      var R = { x: x - w * 0.43 + i * (sw + w * 0.06), y: sy, w: sw, h: sh };
      ctx.fillStyle = colors.dim; ctx.fillRect(R.x - 0.5, R.y - 0.5, R.w + 1, R.h + 1);
      ctx.fillStyle = colors.screen; ctx.fillRect(R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1);
      if (on) screenDcr(D, inset(R, 1.2), i, d, t, al);
      if (blink) { ctx.fillStyle = colors.b2; ctx.globalAlpha = 0.35; ctx.fillRect(R.x, R.y, R.w, R.h); ctx.globalAlpha = 1; }
    });
    ctx.fillStyle = blink ? colors.b2 : busyTrg ? colors.warn : colors.rule;
    ctx.beginPath(); ctx.moveTo(M.X(D.fx - D.w / 2, y - depth), y - depth); ctx.lineTo(M.X(D.fx + D.w / 2, y - depth), y - depth); ctx.lineTo(M.X(D.fx + D.w / 2, y), y); ctx.lineTo(M.X(D.fx - D.w / 2, y), y); ctx.closePath(); ctx.fill();
    label(fit(D.name, w + 6, 6), x, sy - 2, al ? colors.b2 : busyTrg ? colors.warn : colors.faint, 'center', 6, al || busyTrg);
    if (!who) { ctx.strokeStyle = colors.faint; ctx.strokeRect(Math.round(x - 2.5 * k) + 0.5, Math.round(y + 1) + 0.5, Math.round(5 * k), Math.round(4 * k)); }   // an empty chair
  }
  // what a desk's screens show: its job
  function screenDcr(D, R, i, d, t, al) {
    var beam = d.beam && !d.ls;
    if (D.id === 'trg' && i === 0 || D.id === 'dqm' && i === 1) {                 // rates, histograms
      var n = 6;
      for (var b = 0; b < n; b++) {
        var hgt = D.id === 'dqm' ? R.h * Math.exp(-Math.pow((b - 2.2) / 1.6, 2)) * (0.6 + 0.4 * ((t * 0.3 + b * 0.13) % 1)) : beam ? R.h * (0.3 + 0.6 * Math.abs(Math.sin(t * 2 + b))) : 1;
        ctx.fillStyle = al ? colors.b2 : D.id === 'dqm' ? colors.b1 : colors.ok; ctx.fillRect(R.x + b * R.w / n, R.y + R.h - hgt, R.w / n - 0.6, hgt);
      }
    } else if (D.lane && i === 0) {                                               // the subsystem's channels: LEDs
      var cols = 4, rows = 2;
      for (var c = 0; c < cols * rows; c++) {
        var bad = D.lane.fault && c === 5, warn = D.lane.health < 0.85 && c % 3 === 1;
        ctx.fillStyle = bad ? (Math.sin(t * 8) > 0 ? colors.b2 : colors.screen) : warn ? colors.warn : colors.ok;
        ctx.fillRect(R.x + (c % cols) * R.w / cols + 0.3, R.y + Math.floor(c / cols) * R.h / rows + 0.3, R.w / cols - 1, R.h / rows - 1);
      }
    } else {                                                                      // a log, scrolling
      var lines = 3, off = (t * (beam ? 2 : 0.5) + D.fx * 9) % 1;
      ctx.fillStyle = al ? colors.b2 : colors.faint;
      for (var l = 0; l < lines; l++) {
        var ly = R.y + (l + 1 - off) * R.h / lines;
        if (ly > R.y && ly < R.y + R.h) ctx.fillRect(R.x, ly - 0.5, R.w * (0.4 + 0.5 * (((l + Math.floor(t * (beam ? 2 : 0.5))) * 7 + D.fx * 13) % 10) / 10), 0.9);
      }
      if (D.id === 'sl' && i === 1) { ctx.fillStyle = d.beam && !d.ls ? colors.ok : colors.faint; ctx.beginPath(); ctx.arc(R.x + R.w - 2, R.y + 2, 1.3, 0, 6.2832); ctx.fill(); }
    }
  }
  // a person in the detector room: seated, from behind, turning to look at the event display; or standing
  function personDcr(x, M, t, look) {
    var k = M.k(x.y) * 1.5, sx = M.X(x.x, x.y), col = x.role === 'crew' ? colors.dim : colors.fg;
    if (sitting(x, M)) {
      var jit = x.typing ? (Math.floor(t * 8 + x.ph) % 2 ? 0.25 : -0.25) * k : 0, turn = look ? Math.max(-1, Math.min(1, (W / 2 - sx) / 40)) * 1.1 * k : Math.sin(t * 0.5 + x.ph) * 0.4 * k;
      x.typing = Math.sin(t * 0.9 + x.ph * 3) > -0.3;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(sx - 2.6 * k + jit, x.y); ctx.quadraticCurveTo(sx - 2.6 * k + jit, x.y - 3.6 * k, sx + jit, x.y - 3.8 * k);
      ctx.quadraticCurveTo(sx + 2.6 * k + jit, x.y - 3.6 * k, sx + 2.6 * k + jit, x.y); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(sx + turn * 0.6, x.y - 5.2 * k, 1.45 * k, 0, 6.2832); ctx.fill();
      return;
    }
    var work = x.stand || (!x.walking && (x.at.indexOf('by:') === 0 || x.at === 'board' || x.at.indexOf('wall:') === 0) && Math.sin(t * 3 + x.ph) > -0.4);
    PC.People.figure(ctx, sx, x.y, k * 0.95, col, x.walking ? t * 9 + x.ph : 0, work);
    if (!x.walking && x.at === 'coffee' && x.errand) {
      ctx.strokeStyle = colors.faint; ctx.beginPath();
      for (var q = 0; q < 5; q++) ctx.lineTo(sx + 2.4 * k + Math.sin(t * 4 + q) * 0.8, x.y - 6 * k - q * 1.2);
      ctx.stroke();
    }
  }

  // a person in the accelerator room: seated at a console (typing in bursts), or standing, walking, talking
  function person(x, s, t, M, seated) {
    var col = x.role === 'op' ? colors.dim : colors.fg;
    if (seated) {
      x.typing = Math.sin(t * 0.9 + x.ph * 3) > -0.3;
      var hx = Math.sin(t * 0.6 + x.ph) * 0.9 * s, bob = x.typing ? Math.abs(Math.sin(t * 9 + x.ph)) * 0.5 * s : 0;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(x.x - 2.2 * s, x.y - 1); ctx.quadraticCurveTo(x.x - 2.2 * s, x.y - 4 * s, x.x, x.y - 4 * s);
      ctx.quadraticCurveTo(x.x + 2.2 * s, x.y - 4 * s, x.x + 2.2 * s, x.y - 1); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(x.x + hx, x.y - 5.5 * s - bob, 1.35 * s, 0, 6.2832); ctx.fill();
      if (x.talk && Math.sin(t * 5 + x.ph) > 0) { ctx.fillRect(x.x + 2.2 * s, x.y - 7.5 * s, 1.2 * s, 1.2 * s); }   // a word with the relief
      return;
    }
    var gesture = !x.walking && (x.stand || x.at.indexOf('wall:') === 0 || x.at.indexOf('rim:') === 0 && Math.sin(t * 4 + x.ph) > 0);
    PC.People.figure(ctx, x.x, x.y, s, col, x.walking ? t * 9 + x.ph : 0, gesture);
    if (!x.walking && x.at === 'coffee' && x.errand) {
      ctx.strokeStyle = colors.faint; ctx.lineWidth = 1; ctx.beginPath();
      for (var q = 0; q < 5; q++) ctx.lineTo(x.x + 2.5 * s + Math.sin(t * 4 + q) * 0.8, x.y - 6 * s - q * 1.2);
      ctx.stroke();
    }
  }

  var lastT = 0;
  function draw(now) {
    if (!view) return;
    var t = now / 1000, dt = Math.min(0.1, Math.max(0, t - (lastT || t))); lastT = t;
    if (use('ccc')) cccDraw(view.acc, t, dt); else rooms.ccc.agents.length = 0;
    if (use('dcr')) dcrDraw(view.det, t, dt); else rooms.dcr.agents.length = 0;
  }

  return {
    // canvases: { ccc: <canvas>, dcr: <canvas> }
    init: function (canvases, pickCb) {
      onPick = pickCb;
      Object.keys(canvases).forEach(function (id) {
        var c = canvases[id];
        surf[id] = { cv: c, ctx: c.getContext('2d'), W: 0, H: 0 };
        c.addEventListener('click', function () { if (onPick) onPick(id); });
      });
      readColors(); resize();
      window.addEventListener('resize', resize);
      PC.loop('ctrlrooms', draw);
    },
    resize: resize,
    readColors: readColors,
    // v: { now (game s),
    //   acc: {now, on, ls, phase, fill, turnLeft, turnTotal, collider ('lhc'|'sppbar'|null), fault: {name, fac} | null,
    //         islands: {ps, sps, lhc, ti}, experts, hist, machines: [{id, st}], status, alarms: [{text, ok}]},
    //   det: {now, run, beam, stable, phase, collider, ls, lost (text) | null, waiting (text), cosmics, experts, streams: [{id, f}],
    //         trigLimit, storeFull, lanes: [{id, short, health, fault}], hist, health (HealthMap opts), worst, worstCol} }
    set: function (v) { view = v; },
    // for the debug panel and tests: who is in each room, and where
    crews: function () { return { ccc: rooms.ccc.agents, dcr: rooms.dcr.agents }; }
  };
})();
