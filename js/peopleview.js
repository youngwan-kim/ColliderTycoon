/* The People tab drawn as a lab floor: everyone in the lab is a figure walking about their room.
 *
 * Rooms off a corridor: the PhD students' office and the postdocs' office above; the professors'
 * corridor, the research scientists' offices and the common room (coffee, a whiteboard) below.
 * Whoever waits for a position here sits on the bench by the door. New people walk in through the
 * door, someone promoted walks over to their new room, someone leaving walks out. The Alumni view
 * is two buildings instead: industry and the other labs.
 *
 * Hover a figure for a card with who they are; click to select them (onPick). The canvas is one
 * element kept across the window's re-renders: mount() moves it into the pane, set() hands it who
 * to show, and the walkers keep their places in between.
 */
var PC = PC || {};

PC.PeopleView = (function () {
  var cv = document.createElement('canvas'), ctx = cv.getContext('2d');
  cv.className = 'ppl-canvas';
  var W = 0, H = 0, dpr = 1, colors = {}, last = 0;
  var view = null, onPick = null, getInfo = null;
  var agents = {}, layoutKey = '', mouse = null, hover = null;
  var COL = { grad: 'fg', postdoc: 'warn', professor: 'b1', scientist: 'ok', wait: 'dim', industry: 'dim', academia: 'dim' };

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    ['--fg', '--dim', '--faint', '--rule', '--b1', '--b2', '--ok', '--warn', '--screen', '--panel', '--mono'].forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }
  function resize() {
    var r = cv.getBoundingClientRect();
    if (Math.abs(r.width - W) < 0.5 && Math.abs(r.height - H) < 0.5) return false;
    dpr = window.devicePixelRatio || 1; W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    readColors();
    return true;
  }

  /* ───── the floor plan, in fractions of the canvas ───── */
  var CORR = [0.46, 0.58];                               // the corridor's top and bottom
  function rooms(alumni) {
    if (alumni) return {
      industry: { x: 0.02, y: 0.1, w: 0.31, h: 0.86, label: 'Industry' },
      academia: { x: 0.35, y: 0.1, w: 0.31, h: 0.86, label: 'Other labs' },
      retired: { x: 0.68, y: 0.1, w: 0.3, h: 0.4, label: 'Retired' },
      memoriam: { x: 0.68, y: 0.54, w: 0.3, h: 0.42, label: 'In memoriam', still: true }
    };
    return {
      grad: { x: 0.02, y: 0.04, w: 0.5, h: CORR[0] - 0.04, label: 'PhD students', top: true },
      postdoc: { x: 0.54, y: 0.04, w: 0.44, h: CORR[0] - 0.04, label: 'Postdocs', top: true },
      professor: { x: 0.02, y: CORR[1], w: 0.33, h: 0.96 - CORR[1], label: 'Professors' },
      scientist: { x: 0.37, y: CORR[1], w: 0.25, h: 0.96 - CORR[1], label: 'Research scientists' },
      common: { x: 0.64, y: CORR[1], w: 0.34, h: 0.96 - CORR[1], label: 'Common room' },
      wait: { x: 0.74, y: CORR[0] + 0.015, w: 0.22, h: CORR[1] - CORR[0] - 0.03, label: 'Bench', bench: true }
    };
  }
  function px(r) { return { x: r.x * W, y: r.y * H, w: r.w * W, h: r.h * H }; }
  function spot(R, rnd) {                                // somewhere to stand in a room, clear of its walls and label
    var r = px(R), m = 10;
    if (R.bench) return [r.x + m + rnd() * (r.w - 2 * m), r.y + r.h * 0.8];
    return [r.x + m + rnd() * (r.w - 2 * m), r.y + 22 + rnd() * Math.max(4, r.h - 30)];
  }
  function doorOf(R) {                                   // where a room opens onto the corridor
    var r = px(R), cx = r.x + r.w / 2;
    return R.bench ? [cx, r.y + r.h * 0.8] : R.top ? [cx, r.y + r.h] : [cx, r.y];
  }
  var DOOR = function () { return [-12, (CORR[0] + CORR[1]) / 2 * H]; };   // the way in and out, at the corridor's end
  function route(a, from, to, target) {                 // from one room to another, by the corridor
    var cy = (CORR[0] + CORR[1]) / 2 * H, p = [];
    if (from) { var d = doorOf(from); p.push(d, [d[0], cy]); } else p.push([a.x, cy]);
    if (to) { var e = doorOf(to); p.push([e[0], cy], e); }
    p.push(target);
    return p;
  }

  /* ───── the walkers ───── */
  function rnd() { return Math.random(); }
  function place(a, R, instant) {
    var t = spot(R, rnd);
    if (instant) { a.x = t[0]; a.y = t[1]; a.path = []; }
    else a.path = [t];
    a.wait = 1 + rnd() * 4;
  }
  function sync(alumni) {
    var R = rooms(alumni), key = alumni ? 'alumni' : 'lab', relayout = key !== layoutKey, seen = {};
    layoutKey = key;
    var rip = view.list.filter(function (p) { return p.zone === 'memoriam'; }).reverse(), ripAt = {};
    if (R.memoriam && rip.length) {                        // headstones in rows, the earliest first
      var r = px(R.memoriam), cols = Math.max(1, Math.floor((r.w - 16) / 12)), rows = Math.ceil(rip.length / cols), dy = Math.min(16, (r.h - 26) / Math.max(1, rows));
      rip.forEach(function (p, i) { ripAt[p.id] = [r.x + 12 + (i % cols) * (r.w - 16) / cols, r.y + 30 + Math.floor(i / cols) * dy]; });
    }
    view.list.forEach(function (p) {
      seen[p.id] = true;
      var a = agents[p.id], room = R[p.zone];
      if (!room) return;
      if (!a || relayout) {
        a = agents[p.id] = a && !relayout ? a : { id: p.id, x: 0, y: 0, path: [], wait: 0, ph: rnd() * 6, zone: p.zone, role: p.role, leaving: false };
        a.zone = p.zone; a.role = p.role; a.leaving = false;
        if (ripAt[p.id]) { a.x = ripAt[p.id][0]; a.y = ripAt[p.id][1]; a.path = []; return; }
        if (relayout || !view.walkIn) place(a, room, true);
        else { var d = DOOR(); a.x = d[0]; a.y = d[1]; a.path = route(a, null, room, spot(room, rnd)); }   // a newcomer walks in
        return;
      }
      a.role = p.role; a.leaving = false;
      if (ripAt[p.id]) { if (a.zone !== p.zone) { a.zone = p.zone; a.path = []; } a.x = ripAt[p.id][0]; a.y = ripAt[p.id][1]; return; }
      if (a.zone !== p.zone) {                             // promoted, or off to wait on the bench: walk over
        a.path = route(a, R[a.zone], room, spot(room, rnd)); a.zone = p.zone; a.coffee = false;
      }
    });
    Object.keys(agents).forEach(function (id) {
      if (seen[id]) return;
      var a = agents[id];
      if (relayout || !view.walkOut) { delete agents[id]; return; }
      if (!a.leaving) { a.leaving = true; a.path = route(a, R[a.zone], null, DOOR()); }   // gone: out through the door
    });
  }
  function step(a, dt, R) {
    if (a.path.length) {
      var p = a.path[0], dx = p[0] - a.x, dy = p[1] - a.y, d = Math.hypot(dx, dy), v = (a.role === 'professor' ? 16 : 22) * dt;
      if (d <= v) { a.x = p[0]; a.y = p[1]; a.path.shift(); } else { a.x += dx / d * v; a.y += dy / d * v; }
      if (!a.path.length && a.leaving) delete agents[a.id];
      return true;
    }
    if ((a.wait -= dt) > 0) return false;
    var home = R[a.zone];
    if (!home || home.still) return false;              // in memoriam: they rest where they are
    if (home.bench) { a.wait = 3 + rnd() * 6; return false; }   // the bench: they sit and wait
    // now and then a coffee in the common room, then back
    if (R.common && !a.coffee && rnd() < 0.12) { a.coffee = true; a.path = route(a, home, R.common, spot(R.common, rnd)); a.wait = 3 + rnd() * 5; return true; }
    if (a.coffee) { a.coffee = false; a.path = route(a, R.common, home, spot(home, rnd)); a.wait = 2 + rnd() * 4; return true; }
    place(a, home, false);
    return true;
  }

  /* ───── drawing ───── */
  function label(t, x, y, col, align, size, weight) {
    ctx.fillStyle = col; ctx.font = (weight || '') + ' ' + (size || 9) + 'px ' + colors.mono; ctx.textAlign = align || 'left'; ctx.fillText(t, x, y); ctx.textAlign = 'left';
  }
  function drawRooms(R, counts) {
    ctx.lineWidth = 1;
    Object.keys(R).forEach(function (k) {
      var Rm = R[k], r = px(Rm);
      if (Rm.bench) {                                      // a bench along the corridor wall
        ctx.fillStyle = colors.rule; ctx.fillRect(r.x, r.y + r.h * 0.8 + 1, r.w, 3);
        label('BENCH · waiting for a position' + (counts.wait ? ' · ' + counts.wait : '') + ' →', r.x - 6, r.y + r.h * 0.8 + 3, colors.faint, 'right', 8);
        return;
      }
      ctx.strokeStyle = colors.rule; ctx.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w), Math.round(r.h));
      if (Rm.top !== undefined || k === 'professor' || k === 'scientist' || k === 'common') {   // the doorway onto the corridor
        var d = doorOf(Rm); ctx.fillStyle = colors.screen; ctx.fillRect(d[0] - 9, d[1] - 1, 18, 3);
      }
      label(Rm.label.toUpperCase() + (counts[k] !== undefined ? ' · ' + counts[k] : ''), r.x + 6, r.y + 12, colors.dim, 'left', 8.5);
      ctx.fillStyle = colors.rule;
      if (k === 'grad' || k === 'postdoc' || k === 'scientist') {   // desks
        var n = Math.max(2, Math.floor(r.w / 46));
        for (var i = 0; i < n; i++) ctx.fillRect(r.x + (i + 0.5) * r.w / n - 9, r.y + r.h - 12, 18, 4);
      } else if (k === 'professor') {
        for (var j = 0; j < 3; j++) ctx.fillRect(r.x + (j + 0.5) * r.w / 3 - 12, r.y + r.h - 13, 24, 5);
      } else if (k === 'common') {                         // a coffee machine and a whiteboard
        ctx.fillRect(r.x + r.w - 20, r.y + r.h - 22, 12, 16);
        ctx.strokeStyle = colors.dim; ctx.strokeRect(Math.round(r.x + 12) + 0.5, Math.round(r.y + 18) + 0.5, Math.round(r.w * 0.35), 14);
      } else if (k === 'retired') {                       // a park: a tree and a bench
        ctx.globalAlpha = 0.5;
        ctx.fillRect(r.x + r.w - 30, r.y + r.h - 26, 3, 18); ctx.beginPath(); ctx.arc(r.x + r.w - 28.5, r.y + r.h - 30, 10, 0, 6.2832); ctx.fill();
        ctx.fillRect(r.x + 14, r.y + r.h - 12, 26, 3);
        ctx.globalAlpha = 1;
      } else if (k === 'industry' || k === 'academia') {   // a skyline or a lab dome, faint behind
        ctx.globalAlpha = 0.5;
        if (k === 'industry') for (var b = 0; b < 5; b++) ctx.fillRect(r.x + 14 + b * r.w / 5.4, r.y + r.h * (0.25 + 0.1 * (b % 3)), r.w / 7, r.h * 0.7);
        else { ctx.beginPath(); ctx.arc(r.x + r.w / 2, r.y + r.h * 0.6, r.w * 0.28, Math.PI, 0); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
    });
    if (!R.industry) {                                     // the corridor and the door at its end
      label('← entrance', 4, (CORR[0] + CORR[1]) / 2 * H + 3, colors.faint, 'left', 8);
    }
  }
  function card(a, info) {
    var lines = info || [], pad = 6, lh = 13, w = 0;
    ctx.font = '600 11px ' + colors.mono; w = Math.max(w, ctx.measureText(lines[0] || '').width);
    ctx.font = '10px ' + colors.mono; lines.slice(1).forEach(function (l) { w = Math.max(w, ctx.measureText(l).width); });
    w += pad * 2; var h = lines.length * lh + pad * 2 - 3;
    var x = a.x + 12, y = a.y - h - 14;
    if (x + w > W - 4) x = a.x - 12 - w;
    if (y < 4) y = a.y + 8;
    ctx.fillStyle = colors.panel; ctx.strokeStyle = colors.dim; ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h); ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h));
    lines.forEach(function (l, i) { label(l, x + pad, y + pad + 9 + i * lh, i ? colors.dim : colors.fg, 'left', i ? 10 : 11, i ? '' : '600'); });
  }

  function frame(ts) {
    var dt = Math.max(0, Math.min(0.1, (ts - last) / 1000 || 0)); last = Math.max(last, ts);   // never backwards, even when stepped by hand
    if (!view || !cv.parentNode || cv.offsetParent === null) return;
    if (resize()) { layoutKey = ''; sync(view.alumni); }  // a new size: everyone placed again
    if (!W || !H) return;
    var R = rooms(view.alumni), n = view.list.length, s = Math.max(1.4, Math.min(2.4, H / 120)) * (n > 120 ? 0.8 : 1), t = ts / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawRooms(R, view.counts || {});
    var list = Object.keys(agents).map(function (k) { return agents[k]; });
    var moving = {};
    list.forEach(function (a) { moving[a.id] = step(a, dt, R); });
    // who is under the mouse: the nearest figure, if close enough
    hover = null;
    if (mouse) {
      var best = 14;
      list.forEach(function (a) { var d = Math.hypot(a.x - mouse.x, a.y - 3.5 * s - mouse.y); if (d < best) { best = d; hover = a; } });
    }
    cv.style.cursor = hover ? 'pointer' : '';
    list.sort(function (a, b) { return a.y - b.y; });       // the ones further down stand in front
    list.forEach(function (a) {
      if (!agents[a.id]) return;
      var col = colors[COL[a.zone === 'wait' ? 'wait' : a.role] || 'fg'] || colors.fg, sel = view.sel === a.id;
      if (sel || hover === a) {
        ctx.strokeStyle = sel ? colors.b1 : colors.dim; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(a.x, a.y + 1, 5 * s, 1.8 * s, 0, 0, 6.2832); ctx.stroke();
      }
      if (a.zone === 'memoriam' && R.memoriam) {          // a headstone
        var hw = 2.6 * s, hh = 5 * s;
        ctx.fillStyle = colors.faint; ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.moveTo(a.x - hw, a.y); ctx.lineTo(a.x - hw, a.y - hh + hw); ctx.arc(a.x, a.y - hh + hw, hw, Math.PI, 0); ctx.lineTo(a.x + hw, a.y); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
        return;
      }
      ctx.globalAlpha = a.leaving ? 0.5 : view.alumni ? 0.75 : 1;
      PC.People.figure(ctx, a.x, a.y, s * (a.role === 'professor' ? 1.08 : 1), col, moving[a.id] && a.path.length ? t * 9 + a.ph : 0, !moving[a.id] && Math.sin(t * 2 + a.ph) > 0.7);
      ctx.globalAlpha = 1;
      if (sel && getInfo) { var nm = (getInfo(a.id) || [])[0]; if (nm) label(nm, a.x, a.y - 10 * s, colors.b1, 'center', 10, '600'); }
    });
    if (hover && getInfo) card(hover, getInfo(hover.id));
    if (view.more) label('showing ' + n + ' of ' + (n + view.more) + ' · a sample of every room', W - 6, H - 5, colors.faint, 'right', 8);
  }

  cv.addEventListener('mousemove', function (e) { var r = cv.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; });
  cv.addEventListener('mouseleave', function () { mouse = null; });
  cv.addEventListener('click', function (e) {
    var r = cv.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    frame(last);                                           // find who is under the click now, not as of the last frame
    if (onPick) onPick(hover ? hover.id : null);
  });
  PC.loop('peopleview', frame);

  return {
    // into the pane's placeholder (the same canvas every time, so the walkers keep their places)
    mount: function (el) { if (el && cv.parentNode !== el) el.appendChild(cv); },
    // v: { list: [{ id, role, zone }], alumni, sel, counts: {zone: n}, more, walkIn, walkOut }
    set: function (v) { view = v; if (W) sync(v.alumni); },
    hooks: function (pick, info) { onPick = pick; getInfo = info; },
    readColors: readColors,
    // for the UI tests: where everyone stands, in canvas pixels
    agents: function () { return Object.keys(agents).map(function (k) { var a = agents[k]; return { id: a.id, x: a.x, y: a.y, zone: a.zone }; }); }
  };
})();
