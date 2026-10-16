/* The two control rooms on the overview: the accelerator's under the map, the detector's
 * under the computing lens. Each has its own canvas. Click either to open its window.
 *
 * Accelerator control room, after CERN's Control Centre: a video wall of three screens
 * (the luminosity of the last 30 minutes, a synoptic of the complex with every machine lit
 * by its state, the fill or the fault in big type) and curved console islands in two
 * staggered rows. On shift: two operators while there is beam, and your accelerator
 * physicists.
 *
 * Detector control room, after an experiment's: a wall with a live mini event display,
 * the detector health thumbnail and the trigger/DAQ panel (beam at the detector over the
 * last 30 minutes, faulty channels), and two straight rows of shift desks. On shift: two
 * shift crew while there is beam, and your detector engineers.
 *
 * The people don't just sit: they type in bursts, look around, get up to point at the
 * wall, walk over to a colleague or to the coffee machine, and come back. With no beam they
 * walk out (to the machines, to the cavern); when it returns they walk back in. A fault
 * turns the walls red and everyone gathers in front of them until it is fixed. They walk
 * along the aisle under the wall and through the gaps between the desks, never through
 * the furniture.
 */
var PC = PC || {};

PC.CtrlRooms = (function () {
  var ctx, W = 0, H = 0, dpr = 1, colors = {}, view = null, onPick = null;
  var surf = {};                                        // room id → { cv, ctx, W, H }; ctx/W/H point at the one being drawn
  var crews = { ccc: [], dcr: [] }, event = { t: -1, tracks: [] };

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
  function fit(t, w, size) {
    ctx.font = size + 'px ' + colors.mono;
    if (ctx.measureText(t).width <= w) return t;
    while (t.length > 1 && ctx.measureText(t + '…').width > w) t = t.slice(0, -1);
    return t.trim() + '…';
  }
  // switch drawing to a room's canvas; false if it has no size (hidden)
  function use(id) {
    var S = surf[id];
    if (!S || !S.W || S.cv.offsetParent === null) return false;
    ctx = S.ctx; W = S.W; H = S.H;
    ctx.clearRect(0, 0, W, H);
    return { id: id, x: 0, y: 0, w: W, h: H };
  }

  /* ───────── the screens ───────── */
  function panel(P, alarm) {
    ctx.fillStyle = colors.rule; ctx.globalAlpha = 0.35; ctx.fillRect(P.x, P.y, P.w, P.h); ctx.globalAlpha = 1;
    ctx.strokeStyle = alarm ? colors.b2 : colors.faint; ctx.lineWidth = alarm ? 1.5 : 1;
    ctx.strokeRect(Math.round(P.x) + 0.5, Math.round(P.y) + 0.5, Math.round(P.w) - 1, Math.round(P.h) - 1); ctx.lineWidth = 1;
  }
  // the last 30 minutes of luminosity, faults in red
  function lumiCurve(r, hist, now) {
    if (!hist || hist.length < 2) { label('no beam yet', r.x + r.w / 2, r.y + r.h / 2 + 3, colors.faint, 'center', 8); return; }
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
  // the synoptic: the complex as rings, each lit by its machine's state
  function synoptic(P, machines, t) {
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
    var lin = by.linac4 || by.linac2 || by.linac1;
    if (lin) { ctx.strokeStyle = stColor(lin); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cx - P.w * 0.48, cy + P.h * 0.42); ctx.lineTo(cx - 0.8 * P.w * 0.5, cy + 0.6 * P.h * 0.5); ctx.stroke(); }
    ctx.lineWidth = 1;
  }
  // a mini event display: tracks out of the vertex, a new event every two seconds while there is beam
  function eventDisplay(P, on, t) {
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
    event.tracks.forEach(function (tr) {
      ctx.strokeStyle = tr.mu ? colors.warn : colors.b1; ctx.beginPath(); ctx.moveTo(cx, cy);
      for (var s = 0; s <= 1; s += 0.1) { var a = tr.a + tr.c * s * 10, rr = s * R * (tr.mu ? 1 : tr.l); ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  /* ───────── the rooms: walls, desks, seats ───────── */
  // seat: where a person sits (feet), the desk in front of them, and how to reach it from the aisle
  function layout(R, kind) {
    var u = R.h / 150, wallH = R.h * 0.3, walkY = R.y + 18 + wallH + 12 * u, seats = [];
    // the accelerator room's consoles are staggered islands; the detector room has two straight rows of desks
    var rows = kind === 'ccc' ? [[0.17, 0.39, 0.61, 0.83], [0.28, 0.5, 0.72]] : [[0.14, 0.38, 0.62, 0.86], [0.14, 0.38, 0.62, 0.86]];
    var rowY = [R.y + R.h * 0.68, R.y + R.h * 0.92];
    var gapX = function (x) {                                                // the nearest gap between back-row desks
      var back = rows[0].map(function (f) { return R.x + R.w * f; }), best = R.x + 6 * u;
      for (var i = 0; i <= back.length; i++) {
        var g = i === 0 ? (R.x + back[0]) / 2 : i === back.length ? (back[i - 1] + R.x + R.w) / 2 : (back[i - 1] + back[i]) / 2;
        if (Math.abs(g - x) < Math.abs(best - x)) best = g;
      }
      return best;
    };
    rows.forEach(function (row, r) {
      row.forEach(function (f) {
        var x = R.x + R.w * f;
        seats.push({ x: x, y: rowY[r], row: r, via: gapX(x) });
      });
    });
    return { u: u, wallH: wallH, walkY: walkY, seats: seats, deskW: Math.min(R.w * (kind === 'ccc' ? 0.17 : 0.18), 40 * u),
      coffee: [R.x + R.w - 7 * u, walkY], door: [R.x + 3 * u, walkY] };
  }
  function desk(s, L, kind, here, alarm, lit, t, i) {
    var u = L.u, w = L.deskW, y = s.y - 13 * u;
    ctx.fillStyle = colors.rule;
    if (kind === 'ccc') {                                                    // curved console islands
      ctx.beginPath(); ctx.moveTo(s.x - w / 2, y + 2 * u); ctx.quadraticCurveTo(s.x, y - 3 * u, s.x + w / 2, y + 2 * u);
      ctx.lineTo(s.x + w / 2, y + 6 * u); ctx.quadraticCurveTo(s.x, y + 1 * u, s.x - w / 2, y + 6 * u); ctx.closePath(); ctx.fill();
    } else ctx.fillRect(s.x - w / 2, y, w, 4.5 * u);                         // straight shift desks
    // the desk's screens: three on a console, two on a shift desk
    var ns = kind === 'ccc' ? 3 : 2, sw = 5 * u, gap = 1.5 * u, x0 = s.x - (ns * sw + (ns - 1) * gap) / 2;
    ctx.fillStyle = here ? (alarm ? colors.b2 : colors.ok) : colors.faint;
    for (var k = 0; k < ns; k++) {
      ctx.globalAlpha = here ? (lit ? 0.85 : 0.45) + 0.15 * Math.sin(t * 2 + i + k) : 0.35;
      var sy = kind === 'ccc' ? y - 5 * u + Math.abs(k - (ns - 1) / 2) * 1.2 * u : y - 5 * u;
      ctx.fillRect(x0 + k * (sw + gap), sy, sw, 4 * u);
    }
    ctx.globalAlpha = 1;
  }

  /* ───────── the crew ───────── */
  function spot(p, L) {
    if (p.k === 'seat') { var s = L.seats[p.i]; return [s.x, s.y]; }
    if (p.k === 'via') return [L.seats[p.i].via, L.seats[p.i].y];          // in the gap beside the desk, level with its chair
    if (p.k === 'beside') { var b = L.seats[p.i]; return [b.x + 7 * L.u, b.y]; }
    if (p.k === 'screen') return [p.x, L.walkY];
    if (p.k === 'aisle') return [p.x, L.walkY];
    return p.k === 'coffee' ? L.coffee : L.door;
  }
  // up to the aisle under the wall, along it, and down through a gap to the destination
  function route(a, to, L) {
    var path = [], dest = spot(to, L);
    if (a.seat !== undefined && Math.abs(a.y - L.walkY) > 1 && Math.abs(a.x - L.seats[a.seat].x) < 1) path.push({ k: 'via', i: a.seat });
    if (Math.abs(a.y - L.walkY) > 1) path.push({ k: 'aisle', x: path.length ? L.seats[a.seat].via : a.x });
    var downVia = to.k === 'seat' || to.k === 'beside' ? L.seats[to.i] : null;
    path.push({ k: 'aisle', x: downVia ? downVia.via : dest[0] });
    if (downVia) path.push({ k: 'via', i: to.i });
    path.push(to);
    return path;
  }
  function stepCrew(crew, L, want, base, alarm, t, wallX) {
    var dt = Math.min(0.1, Math.max(0, t - (crew.t || t))); crew.t = t;
    var free = [];
    for (var i = 0; i < L.seats.length; i++) if (!crew.some(function (a) { return a.seat === i; })) free.push(i);
    // shift changes: in through the door to a free chair (the back row first), out through the door
    while (crew.filter(function (a) { return !a.leaving; }).length < want && free.length) {
      var role = crew.filter(function (a) { return a.role === 'crew' && !a.leaving; }).length < base ? 'crew' : 'expert';
      var a = { seat: free.shift(), role: role, x: L.door[0], y: L.door[1], mode: 'go', path: [], timer: 0, ph: Math.random() * 6, typing: false };
      a.path = route(a, { k: 'seat', i: a.seat }, L); crew.push(a);
    }
    var keep = crew.filter(function (a) { return !a.leaving; });
    for (var j = keep.length - 1; j >= want; j--) { var b = keep[j]; b.leaving = true; b.mode = 'go'; b.path = route(b, { k: 'door' }, L); }
    crew.forEach(function (a, idx) {
      if (a.path.length) {
        var p = spot(a.path[0], L), dx = p[0] - a.x, dy = p[1] - a.y, d = Math.hypot(dx, dy), v = (alarm ? 55 : 32) * L.u * dt;
        if (d <= v) { a.x = p[0]; a.y = p[1]; a.path.shift(); } else { a.x += dx / d * v; a.y += dy / d * v; }
        a.walking = true;
        if (!a.path.length) {
          a.walking = false;
          if (a.leaving) { a.gone = true; return; }
          if (a.mode === 'go') { a.mode = 'sit'; a.timer = 12 + Math.random() * 20; }
          else if (a.mode === 'trip') { a.mode = 'stay'; a.timer = 3 + Math.random() * 4; }
        }
        return;
      }
      a.walking = false;
      if (a.leaving) return;
      if (alarm && a.task !== 'alarm') { a.task = 'alarm'; a.mode = 'trip'; a.path = route(a, { k: 'screen', x: wallX(idx) }, L); return; }
      if (!alarm && a.task === 'alarm') { a.task = null; a.mode = 'go'; a.path = route(a, { k: 'seat', i: a.seat }, L); return; }
      if (a.task === 'alarm') return;
      a.timer -= dt;
      if (a.mode === 'sit') {
        a.typing = Math.sin(t * 0.9 + a.ph * 3) > -0.3;                     // bursts of typing, pauses to read
        if (a.timer > 0) return;
        var others = crew.filter(function (o) { return o !== a && o.mode === 'sit' && !o.leaving; }), r = Math.random();
        a.task = r < 0.4 ? 'screen' : r < 0.75 && others.length ? 'talk' : 'coffee';
        var to = a.task === 'screen' ? { k: 'screen', x: wallX(Math.floor(Math.random() * 9)) } : a.task === 'talk' ? { k: 'beside', i: others[Math.floor(Math.random() * others.length)].seat } : { k: 'coffee' };
        a.mode = 'trip'; a.typing = false; a.path = route(a, to, L);
      } else if (a.mode === 'stay' && a.timer <= 0) {
        a.task = null; a.mode = 'go'; a.path = route(a, { k: 'seat', i: a.seat }, L);
      }
    });
    for (var k = crew.length - 1; k >= 0; k--) if (crew[k].gone) crew.splice(k, 1);
  }
  function drawCrew(crew, L, t, seatedOnly) {
    crew.forEach(function (a) {
      var col = a.role === 'crew' ? colors.dim : colors.fg, s = L.ps;
      var sitting = a.mode === 'sit' && !a.path.length;
      if (seatedOnly !== sitting) return;                                    // seated people under the desks' layer, standing over it
      if (sitting) {
        var hx = Math.sin(t * 0.6 + a.ph) * 0.9 * s, bob = a.typing ? Math.abs(Math.sin(t * 9 + a.ph)) * 0.5 * s : 0;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(a.x - 2.2 * s, a.y - 1); ctx.quadraticCurveTo(a.x - 2.2 * s, a.y - 4 * s, a.x, a.y - 4 * s);
        ctx.quadraticCurveTo(a.x + 2.2 * s, a.y - 4 * s, a.x + 2.2 * s, a.y - 1); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(a.x + hx, a.y - 5.5 * s - bob, 1.35 * s, 0, 6.2832); ctx.fill();
        if (a.typing) {
          var k = Math.floor(t * 8 + a.ph) % 2;
          ctx.fillRect(a.x - 2.4 * s + (k ? 0 : 0.6 * s), a.y - 7.4 * s, 1.1 * s, 1.1 * s);
          ctx.fillRect(a.x + 1.4 * s - (k ? 0.6 * s : 0), a.y - 7.4 * s, 1.1 * s, 1.1 * s);
        }
        return;
      }
      var gesture = a.mode === 'stay' || a.task === 'alarm' ? (a.task === 'talk' ? Math.sin(t * 5 + a.ph) > 0 : a.task !== 'coffee') : false;
      PC.People.figure(ctx, a.x, a.y, s, col, a.walking ? t * 9 + a.ph : 0, gesture);
      if (!a.walking && a.task === 'coffee' && a.mode === 'stay') {
        ctx.strokeStyle = colors.faint; ctx.lineWidth = 1; ctx.beginPath();
        for (var q = 0; q < 6; q++) ctx.lineTo(a.x + 2.5 * s + Math.sin(t * 4 + q) * 0.8, a.y - 6 * s - q * 1.2);
        ctx.stroke();
      }
    });
  }

  function room(R, d, t) {
    var alarm = !!d.alarm, here = d.on && !d.ls, L = layout(R, R.id);
    L.ps = Math.max(1.15, L.u * 1.2);
    // floor, walls, title
    ctx.fillStyle = colors.screen; ctx.fillRect(R.x, R.y, R.w, R.h);
    ctx.strokeStyle = alarm && Math.sin(t * 6) > 0 ? colors.b2 : colors.dim; ctx.lineWidth = 1;
    ctx.strokeRect(R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1);
    label(d.title, R.x + 6, R.y + 12, alarm ? colors.b2 : colors.faint, 'left', 8);
    label(here ? 'click to open' : d.away, R.x + R.w - 6, R.y + 12, colors.faint, 'right', 8);
    // the wall: three screens
    var wy = R.y + 18, ww = R.w - 16, gap = 5, pw = (ww - 2 * gap) / 3, P = [];
    for (var k = 0; k < 3; k++) { P.push({ x: R.x + 8 + k * (pw + gap), y: wy, w: pw, h: L.wallH }); panel(P[k], alarm); }
    d.wall(P, t);
    if (alarm && Math.sin(t * 4) > -0.3) {
      var aw = Math.min(R.w - 20, 170);
      ctx.fillStyle = colors.screen; ctx.globalAlpha = 0.9; ctx.fillRect(R.x + R.w / 2 - aw / 2, wy + L.wallH / 2 - 8, aw, 15); ctx.globalAlpha = 1;
      label(fit(d.alarm, aw - 8, 9), R.x + R.w / 2, wy + L.wallH / 2 + 3, colors.b2, 'center', 9, true);
    }
    // the coffee machine in the corner and the door
    ctx.fillStyle = colors.dim; ctx.fillRect(L.coffee[0] - 2 * L.u, L.coffee[1] - 9 * L.u, 4 * L.u, 6 * L.u);
    ctx.fillStyle = colors.faint; ctx.fillRect(R.x + 1, L.walkY - 12 * L.u, 2, 14 * L.u);
    // desks and the people: seated ones sit behind their desks, standing ones walk in front of everything
    var crew = crews[R.id], busy = {};
    stepCrew(crew, L, here ? d.people : 0, here ? d.base : 0, alarm, t, function (i) { return P[i % 3].x + P[i % 3].w * (0.25 + 0.25 * Math.floor(i / 3 % 3)); });
    crew.forEach(function (a) { if (a.mode === 'sit' && !a.path.length) busy[a.seat] = a; });
    L.seats.forEach(function (s, i) {
      if (!busy[i]) { ctx.strokeStyle = colors.faint; ctx.beginPath(); ctx.moveTo(s.x - 3 * L.u, s.y - 3 * L.u); ctx.lineTo(s.x + 3 * L.u, s.y - 3 * L.u); ctx.stroke(); }   // an empty chair
    });
    drawCrew(crew, L, t, true);
    L.seats.forEach(function (s, i) { desk(s, L, R.id, here, alarm, busy[i] && busy[i].typing, t, i); });
    drawCrew(crew, L, t, false);
  }

  function draw(now) {
    if (!view) return;
    var t = now / 1000, gameNow = view.now, a = view.acc, d = view.det, R0 = use('ccc');
    if (R0) room(R0, {
      title: 'ACCELERATOR CONTROL', on: a.on, ls: a.ls, alarm: a.fault ? 'FAULT · ' + a.fault : null, people: a.people, base: 2,
      away: a.ls ? 'shutdown: all in the tunnels' : a.on ? '' : 'no accelerator yet',
      wall: function (P) {
        lumiCurve({ x: P[0].x + 3, y: P[0].y + 3, w: P[0].w - 6, h: P[0].h - 6 }, a.hist, gameNow);
        synoptic(P[1], a.machines, t);
        var big = Math.max(9, Math.round(P[2].h * 0.26));
        label(fit(a.big, P[2].w - 6, big), P[2].x + P[2].w / 2, P[2].y + P[2].h * 0.52, a.fault ? colors.b2 : colors.fg, 'center', big, true);
        label(fit(a.status, P[2].w - 6, 8), P[2].x + P[2].w / 2, P[2].y + P[2].h * 0.52 + 11, colors.dim, 'center', 8);
      }
    }, t);
    var R1 = use('dcr');
    if (R1) room(R1, {
      title: 'DETECTOR CONTROL', on: d.on, ls: d.ls, alarm: d.alarm, people: d.people, base: 2,
      away: d.ls ? 'shutdown: all in the cavern' : 'no beam: at the detector',
      wall: function (P) {
        eventDisplay(P[0], d.beamNow, t);
        if (d.health.mode === 'stand') label('cosmics only', P[1].x + P[1].w / 2, P[1].y + P[1].h / 2 + 3, colors.faint, 'center', 8);
        else PC.HealthMap.thumb(ctx, { x: P[1].x + 3, y: P[1].y + 3, w: P[1].w - 6, h: P[1].h - 6 }, d.health);
        label('health ' + d.worst + '%', P[2].x + 4, P[2].y + 11, colors[d.worstCol], 'left', 9);
        if (d.fakes && Math.sin(t * 5) > -0.3) label(fit('FAKES ' + d.fakes + '%', P[2].w - 8, 8), P[2].x + 4, P[2].y + 23, colors.b2, 'left', 8);
        else if (!d.fakes) label(fit(d.faults ? d.faults + ' faulty' : 'channels OK', P[2].w - 8, 8), P[2].x + 4, P[2].y + 23, d.faults ? colors.warn : colors.faint, 'left', 8);
        beamStrip({ x: P[2].x + 4, y: P[2].y + P[2].h - 10, w: P[2].w - 8, h: 6 }, d.hist, gameNow);
      }
    }, t);
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (view) draw(now);
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
      requestAnimationFrame(frame);
    },
    resize: resize,
    readColors: readColors,
    // v: { now (game s), acc: {on, ls, fault, people, hist, machines: [{id, st}], big, status},
    //      det: {on, ls, alarm, beamNow, people, hist, health (HealthMap opts), worst, worstCol, faults, fakes} }
    set: function (v) { view = v; },
    // for the debug panel and tests: who is in each room
    crews: function () { return crews; }
  };
})();
