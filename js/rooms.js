/* The analysis room and, through a door in the shared wall, the conference room: one panel.
 *
 * Analysis room (top). On the wall: the projection screen with the plot the Analyses
 * window shows, and a whiteboard that fills up with scribbles (diagrams, wavy photons,
 * equations) and gets wiped now and then. A row of review tables, four chairs each, where
 * papers are read. Three rows of workstations below, split into one group per analysis slot,
 * each with the particle it is after and a bar filling towards 5σ over its desks.
 * Reconstructed data come in through the left wall to the running groups. A coffee corner
 * on the left, the door to the conference room on the right, an aisle under the wall.
 *
 * Papers. A submitted paper comes out of the printer onto the review stand along the
 * bottom of the room. A crew (a postdoc first, students, maybe a professor) gathers at a
 * free review table; one of them fetches the paper from the stand and puts it down, and
 * they read it around the table, the sheet filling as the internal review goes on. When it
 * passes, one carries it to the journal outbox, where it waits for the referees with its
 * journal's initials over it. Revisions mark it amber; a rejection flies back to the stand
 * in red, to be picked up again; an acceptance flies up with a green tick.
 *
 * The people. Students and postdocs have a workstation in their analysis group and mostly
 * sit there, typing in bursts, until a paper calls them to a review table. Now and then
 * they get up: to scribble on the whiteboard, to point at the plot, to look in on a review
 * (whose heads turn), or for coffee. Professors make the rounds: presenting at the screen,
 * visiting reviews, writing on the board. When an analysis first crosses 3σ everyone
 * huddles at the screen; a discovery has them jumping. They walk along the aisle and
 * through the gaps between the tables, never across them.
 *
 * Conference room (below). Empty between conferences, its screen announcing the next one
 * and how many published papers are waiting. When one opens, everyone files out through
 * the door, down the aisle and into the front rows; a professor takes the lectern and
 * the slides cycle through the new results. Each new slide gets applause; now and then
 * someone stands up with a question. Other labs fill the rows behind. When it closes,
 * everyone files back to their table.
 *
 * Waypoints are symbolic (a seat, a gap, the aisle at some x, the door) and resolved
 * against the current layout every frame, so a resize never strands anyone.
 */
var PC = PC || {};

PC.Rooms = (function () {
  var cv, ctx, W = 0, H = 0, dpr = 1, colors = {}, last = 0, onPick = null;
  var ana = null, conf = null, plot = null;            // views
  var packets = [], acc = 0, seenDone = null, cheer = null;
  var agents = [], wasOpen = null, door = 0, guests = 0, seatKey = '';
  var board = [], huddle = 0, prevSig = {}, lastSlide = -1, clapUntil = 0, question = null;
  var prevPapers = {}, flights = [], printing = -10;
  var PS = {};                                          // paper id → { where: 'stand'|'carry'|'table'|'tray', t: table, by: agent }
  var SIG = {};                                         // analysis id → its 5σ-check table
  var photo = null;                                     // the group photo at the end of a conference: { t0, n }
  var JOURNAL = { 'Phys. Lett. B': 'PLB', 'Nuovo Cimento': 'NC', 'Phys. Rev. Lett.': 'PRL', 'Nucl. Phys. B': 'NPB', 'Z. Phys. C': 'ZPC', 'Eur. Phys. J. C': 'EPJC', 'JHEP': 'JHEP' };

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    ['--fg', '--dim', '--faint', '--rule', '--b1', '--b2', '--ok', '--warn', '--screen', '--mono'].forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }
  function resize() {
    var r = cv.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1; W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (last) draw(last);                                // resizing clears the canvas: redraw now, not next frame
  }
  function label(t, x, y, col, align, size) {
    ctx.fillStyle = col; ctx.font = (size || 10) + 'px ' + colors.mono; ctx.textAlign = align || 'left'; ctx.fillText(t, x, y); ctx.textAlign = 'left';
  }
  function fit(t, w, size) {
    ctx.font = size + 'px ' + colors.mono;
    if (ctx.measureText(t).width <= w) return t;
    while (t.length > 1 && ctx.measureText(t + '…').width > w) t = t.slice(0, -1);
    return t.trim() + '…';
  }

  /* ───────── layout ───────── */
  function geom() {
    var u = Math.min(W / 150, H / 300), split = Math.round(H * 0.68);
    var A = { x: 0, y: 0, w: W, h: split }, C = { x: 0, y: split, w: W, h: H - split };
    var g = { u: u, A: A, C: C, wall: split, ps: Math.max(1, Math.min(W, H * 0.5) / 170) };
    // the top wall: the projection screen and the whiteboard
    g.scr = { x: A.x + A.w * 0.05, y: A.y + 20 * u, w: A.w * 0.56, h: A.h * 0.2 };
    g.board = { x: A.x + A.w * 0.67, y: A.y + 20 * u, w: A.w * 0.28, h: A.h * 0.2 };
    g.walkY = g.scr.y + g.scr.h + 12 * u;
    // everything below the wall must fit above the paper station: two table rows, the walkway, three workstation
    // rows. Short of room, the gaps and the tables shrink together (k)
    var NEED = 22 + 24 + 30 + 24 + 24 + 20 + 3 * 24 + 30, bandY = A.y + A.h - 9 * u;
    var k = g.k = Math.max(0.35, Math.min(1, (bandY - g.walkY) / (NEED * u)));
    g.coffee = [A.x + 9 * u, g.walkY];
    g.dx = A.x + A.w * 0.93; g.dw = 11 * u;                                 // the door in the wall, over the corridor on the right
    g.doorA = [g.dx, g.wall - 9 * u]; g.doorB = [g.dx, g.wall + 9 * u];
    // two rows of tables in four columns, the gaps lined up so people pass through both: six review tables,
    // and two where an analysis past 3σ runs its checks before claiming 5σ
    var n = 4, x0 = A.x + A.w * 0.05, x1 = A.x + A.w * 0.86, sp = (x1 - x0) / n;
    g.x0 = x0; g.tw = Math.min(sp * 0.86, 80 * u); g.th = Math.max(16, 24 * u * k); g.sp = sp; g.cols = n;
    g.rowY = [g.walkY + 22 * u * k, g.walkY + 22 * u * k + g.th + 30 * u * k]; g.ty = g.rowY[0];
    g.tables = [];
    for (var i = 0; i < 2 * n; i++) {
      var r = Math.floor(i / n), c = i % n, kind = r === 1 && c >= n - 2 ? 'sigma' : 'review';
      g.tables.push({ x: x0 + sp * (c + 0.5), y: g.rowY[r], row: r, col: c, kind: kind, p: tableKey(i) });
    }
    g.midY = g.rowY[1] + g.th + 24 * u * k;                                 // a walkway under the second row's front chairs
    g.entry = [A.x, g.midY];                                                 // where the data come in: the walkway to the workstations
    // the paper station along the bottom: the internal review desk, the printer, the journal outbox
    g.bandY = bandY;
    g.review = { x: A.x + A.w * 0.05, y: g.bandY, w: A.w * 0.34, h: 4 * u };
    g.printer = { x: A.x + A.w * 0.42, y: g.bandY - 6 * u, w: A.w * 0.07, h: 10 * u };
    g.tray = { x: A.x + A.w * 0.52, y: g.bandY, w: A.w * 0.4, h: 4 * u };
    // a row of workstations for everyone without a group table, between the walkway and the station
    g.wsN = 6; g.wsRows = 3; g.wsW = A.w * 0.09;                           // three rows of six
    g.wsY0 = g.midY + 20 * u * k; g.wsDY = Math.max(24 * u * k, (g.bandY - 30 * u * k - g.wsY0) / g.wsRows);
    g.shelf = { x: A.x + 1, y: g.midY - 4 * u, w: 4.5 * u, h: Math.max(30 * u, g.bandY - 16 * u - g.midY) };
    // the analysis groups: the workstation columns split between the slots, both rows
    var nb = Math.max(1, Math.min(g.wsN, ana ? ana.slots : 1));
    g.groups = [];
    for (var b = 0; b < nb; b++) {
      var c0 = Math.floor(b * g.wsN / nb), c1 = Math.floor((b + 1) * g.wsN / nb) - 1;
      g.groups.push({ c0: c0, c1: c1, a: ana && ana.desks[b] || null, x0: wsX(g, c0) - g.wsW / 2, x1: wsX(g, c1) + g.wsW / 2 });
    }
    // the conference hall
    g.cscr = { x: C.x + C.w * 0.1, y: C.y + 16 * u, w: C.w * 0.62, h: C.h * 0.26 };
    g.lectern = [g.cscr.x + g.cscr.w + (g.dx - g.cscr.x - g.cscr.w) / 2, g.cscr.y + g.cscr.h + 2 * u];
    var top = g.cscr.y + g.cscr.h + 16 * u, rowsH = C.y + C.h - 14 * u - top;
    g.seats = [];
    [8, 9, 8, 9].forEach(function (k, r) {
      var y = top + rowsH * (r + 0.5) / 4.2, s2 = Math.min(13 * u, C.w * 0.84 / k);
      for (var j = 0; j < k; j++) g.seats.push([C.x + C.w * 0.46 + (j - (k - 1) / 2) * s2 - (r % 2 ? 0 : s2 * 0.25), y]);
    });
    return g;
  }
  function wsX(g, i) { return g.A.x + g.A.w * (0.16 + 0.68 * (i % g.wsN) / (g.wsN - 1)); }
  function wsY(g, i) { return g.wsY0 + Math.floor(i / g.wsN) * g.wsDY; }     // the desk's top edge
  // the nearest gap through the table row (the table edges and the two ends)
  function edgeX(g, x) {
    var best = g.x0;
    for (var k = 0; k <= g.tables.length; k++) { var e = g.x0 + g.sp * k; if (Math.abs(e - x) < Math.abs(best - x)) best = e; }
    return best;
  }
  // four chairs per table: two behind it (s 0, 1), two in front (s 2, 3)
  function seatPos(g, t, s) {
    var T = g.tables[t % g.tables.length], dx = (s % 2 ? 1 : -1) * g.tw * 0.25;
    return [T.x + dx, s < 2 ? T.y - 2 * g.u : T.y + g.th + 9 * g.u];
  }
  function gapX(g, t, side) { return g.tables[t % g.tables.length].x + (side > 0 ? 1 : -1) * g.sp / 2; }
  // a waypoint is symbolic; resolve it against the layout now
  function at(p, g) {
    switch (p.k) {
      case 'A': return g.doorA;
      case 'B': return g.doorB;
      case 'hall': return g.seats[p.i % g.seats.length];
      case 'caisle': return [g.dx, g.seats[p.i % g.seats.length][1]];          // down the hall's right-hand aisle to the row
      case 'lectern': return g.lectern;
      case 'photo': return photoSpot(g, p.i);                                  // a place in the group photo
      case 'pright': return [g.dx, photoSpot(g, p.i)[1]];                      // from there, out along the right
      case 'seat': return seatPos(g, p.t, p.s);
      case 'gap': return [gapX(g, p.t, p.side), g.tables[p.t % g.tables.length].y + g.th / 2];   // in the gap beside a table
      case 'pass': return [p.x, g.rowY[p.r] + g.th / 2];                      // through the gap in a row, on the way to another
      case 'lane': return [p.x !== undefined ? p.x : g.dx, g.walkY];          // the aisle under the wall
      case 'laneGap': return [gapX(g, p.t, p.side), g.walkY];
      case 'screen': return [g.scr.x + g.scr.w * (0.2 + 0.3 * (p.i % 3)), g.walkY];
      case 'board': return [g.board.x + g.board.w * (0.25 + 0.5 * (p.i % 2)), g.walkY];
      case 'coffee': return g.coffee;
      case 'low': return [p.x, g.bandY - 1];                                   // the walkway along the paper station
      case 'mid': return [p.x, g.midY];                                         // the walkway between the tables and the workstations
      case 'ws': return [wsX(g, p.i), wsY(g, p.i) + 13 * g.u];                  // a workstation chair
      case 'wsGap': return [wsX(g, p.i) + g.wsW * 0.8, wsY(g, p.i) + 13 * g.u];   // beside it, in the gap between desks
      case 'review': return [g.review.x + g.review.w * 0.5, g.bandY - 1];
      case 'tray': return [g.tray.x + g.tray.w * 0.5, g.bandY - 1];
    }
    return [g.dx, g.walkY];
  }
  // The room has three levels: the aisle under the wall (top), the review tables, and the low part (the
  // workstations and the paper station), joined by the walkway under the tables (mid). People cross the table
  // row through its gaps and the workstation rows through the gaps between the desks, never across furniture.
  function level(l) { return !l || !l.k ? 'top' : l.k === 'seat' || l.k === 'gap' ? 'table' : l.k === 'ws' || l.k === 'review' || l.k === 'tray' ? 'low' : 'top'; }
  function side(l) { return l.k === 'seat' ? (l.s % 2 ? 1 : -1) : l.side; }
  function wsGapX(g, i) { return wsX(g, i) + g.wsW * 0.8; }
  // the nearest way down through the workstation rows to x: a gap between desks, or the left end
  function colX(g, x) {
    var best = g.x0;
    for (var c = 0; c < g.wsN; c++) { var e = wsGapX(g, c); if (Math.abs(e - x) < Math.abs(best - x)) best = e; }
    return best;
  }
  function stationX(g, l) { var S = l.k === 'review' ? g.review : g.tray; return S.x + S.w * 0.5; }
  // from a place down to the mid walkway, and from the mid walkway to a place
  // the gaps of the rows between a table and the aisle (up) or the walkway (down), at its gap's x
  function passes(g, t, sd, down) {
    var T = g.tables[t], x = gapX(g, t, sd), out = [];
    if (down) for (var r = T.row + 1; r < g.rowY.length; r++) out.push({ k: 'pass', x: x, r: r });
    else for (var q = T.row - 1; q >= 0; q--) out.push({ k: 'pass', x: x, r: q });
    return out;
  }
  function toMid(g, l, x) {
    if (l.k === 'seat' || l.k === 'gap') return [{ k: 'gap', t: l.t, side: side(l) }].concat(passes(g, l.t, side(l), true), [{ k: 'mid', x: gapX(g, l.t, side(l)) }]);
    if (l.k === 'ws') return [{ k: 'wsGap', i: l.i }, { k: 'mid', x: wsGapX(g, l.i) }];
    if (l.k === 'review' || l.k === 'tray') { var c = colX(g, stationX(g, l)); return [{ k: 'low', x: c }, { k: 'mid', x: c }]; }
    var e = edgeX(g, x); return [{ k: 'lane', x: e }, { k: 'mid', x: e }];
  }
  function fromMid(g, to) {
    if (to.k === 'seat' || to.k === 'gap') return [{ k: 'mid', x: gapX(g, to.t, side(to)) }].concat(passes(g, to.t, side(to), true).reverse(), [{ k: 'gap', t: to.t, side: side(to) }], to.k === 'seat' ? [to] : []);
    if (to.k === 'ws') return [{ k: 'mid', x: wsGapX(g, to.i) }, { k: 'wsGap', i: to.i }, to];
    if (to.k === 'review' || to.k === 'tray') { var c = colX(g, stationX(g, to)); return [{ k: 'mid', x: c }, { k: 'low', x: c }, to]; }
    var e = edgeX(g, at(to, g)[0]); return [{ k: 'mid', x: e }, { k: 'lane', x: e }, to];
  }
  // from where an agent is, up to the aisle; and from the aisle to a place (the conference trips use these)
  function depart(a) {
    var l = a.loc || {}, g = g0(), L = level(l);
    if (L === 'table') return [{ k: 'gap', t: l.t, side: side(l) }].concat(passes(g, l.t, side(l), false), [{ k: 'laneGap', t: l.t, side: side(l) }]);
    if (L === 'low') { var m = toMid(g, l, a.x), x = m[m.length - 1].x, e = edgeX(g, x); return m.concat([{ k: 'mid', x: e }, { k: 'lane', x: e }]); }
    return [];
  }
  function approach(to) {
    var g = g0(), M = level(to);
    if (M === 'table') return [{ k: 'laneGap', t: to.t, side: side(to) }].concat(passes(g, to.t, side(to), false).reverse(), [{ k: 'gap', t: to.t, side: side(to) }], to.k === 'seat' ? [to] : []);
    if (M === 'low') { var f = fromMid(g, to), e = edgeX(g, f[0].x); return [{ k: 'lane', x: e }, { k: 'mid', x: e }].concat(f); }
    return [to];
  }
  function go(a, to) {
    var l = a.loc || {}, g = g0(), L = level(l), M = level(to);
    if ((l.k === 'review' || l.k === 'tray') && (to.k === 'review' || to.k === 'tray')) a.path = [to];   // along the station
    else if (L === 'low' || M === 'low' || (L === 'table' && M === 'table')) a.path = toMid(g, l, a.x).concat(fromMid(g, to));   // by the mid walkway
    else a.path = depart(a).concat(approach(to));
    a.loc = to;
  }

  /* ───────── people ───────── */
  // one agent per figure shown; students and postdocs get chairs at the running tables first
  function reconcile(g) {
    var st = ana.staff || {}, want = { prof: PC.People.shown(st.professor, 3), postdoc: PC.People.shown(st.postdoc, 6), grad: PC.People.shown(st.grad, 10) };
    ['prof', 'postdoc', 'grad'].forEach(function (kind) {
      var mine = agents.filter(function (a) { return a.kind === kind; });
      for (var i = mine.length; i < want[kind]; i++) {
        var p = at({ k: 'lane', x: g.dx }, g);
        agents.push({ kind: kind, x: p[0], y: p[1], path: [], mode: 'idle', timer: Math.random() * 2, delay: 0, ph: Math.random() * 6, loc: { k: 'lane' } });
      }
      for (var j = mine.length; j > want[kind]; j--) agents.splice(agents.indexOf(mine[j - 1]), 1);
    });
    agents.sort(function (a, b) { return ['prof', 'postdoc', 'grad'].indexOf(a.kind) - ['prof', 'postdoc', 'grad'].indexOf(b.kind); });
    // chairs: re-plan when the tables or the people change
    var key = g.groups.map(function (G) { return G.a ? G.a.id : '-'; }).join() + '|' + agents.length;
    if (key === seatKey) return;
    seatKey = key;
    // workstations: the running groups' desks first, round-robin so every group gets people, then the rest
    var chairs = [], run = g.groups.filter(function (G) { return G.a; }), idle = g.groups.filter(function (G) { return !G.a; });
    [run, idle].forEach(function (list) {
      var cols = list.map(function (G) { var c = []; for (var r = 0; r < g.wsRows; r++) for (var x = G.c0; x <= G.c1; x++) c.push(r * g.wsN + x); return c; });
      for (var j = 0; cols.some(function (c) { return j < c.length; }); j++) cols.forEach(function (c) { if (j < c.length) chairs.push({ k: 'ws', i: c[j] }); });
    });
    var k = 0;
    agents.forEach(function (a) {
      a.base = a.kind === 'prof' ? null : chairs[k++] || null;                // professors roam; more people than chairs: they roam too
      if (!a.duty) { a.home = a.base; if (a.mode === 'sit') { a.mode = 'idle'; a.timer = 0; } }   // walk over to the new chair
    });
  }
  // the conference opens: everyone files out through the door; the first goes to the lectern
  // a skeleton crew stays behind: about a third of the room, those reading at a table first, then students;
  // never the speaker (the first professor) or the professors
  function stayers() {
    var n = agents.length >= 3 ? Math.max(1, Math.round(agents.length * 0.35)) : 0;
    var c = agents.slice(1).filter(function (a) { return a.kind !== 'prof'; });
    c.sort(function (a, b) { return (b.duty ? 1 : 0) - (a.duty ? 1 : 0) || ({ grad: 0, postdoc: 1 })[a.kind] - ({ grad: 0, postdoc: 1 })[b.kind]; });
    return c.slice(0, n);
  }
  function goToConference(instant) {
    var seat = 0, stay = stayers();
    agents.forEach(function (a) { a.away = stay.indexOf(a) < 0; });
    agents.forEach(function (a) {                                            // whatever is being carried is put down where it was going
      if (!a.away) return;
      var cp = a.carry && PS[a.carry];
      if (cp) { cp.by = null; cp.where = a.loc && a.loc.k === 'tray' ? 'tray' : cp.t >= 0 ? 'table' : 'stand'; }
      a.carry = null; a.fetch = null; if (a.task === 'fetch' || a.task === 'carry') a.task = null;
    });
    var k = 0;
    agents.forEach(function (a, i) {
      if (!a.away) return;                                                   // keeps working
      a.target = i === 0 ? { k: 'lectern' } : { k: 'hall', i: seat++ };
      if (instant) { a.mode = 'seat'; a.path = []; a.place = true; return; }
      a.mode = 'go'; a.delay = k++ * 0.45; a.task = null;
      a.path = depart(a).concat([{ k: 'lane', x: g0().dx }, { k: 'A' }, { k: 'B' }], a.target.k === 'hall' ? [{ k: 'caisle', i: a.target.i }] : [], [a.target]);
    });
  }
  // the group photo: rows in front of the screen, the first (the professors, the speaker) at the front
  function photoSpot(g, i) {
    var n = photo ? photo.n : 1, per = Math.max(4, Math.min(9, Math.ceil(n / 3))), R = Math.ceil(n / per);
    var r = Math.floor(i / per), inRow = Math.min(per, n - r * per), c = i % per, sp = Math.min(Math.max(6 * g.ps, 8 * g.u), g.cscr.w * 0.95 / per);
    var cx = g.cscr.x + g.cscr.w / 2 + (r % 2 ? sp * 0.5 : 0);
    return [cx + (c - (inRow - 1) / 2) * sp, g.cscr.y + g.cscr.h + 10 * g.ps + (R - 1 - r) * 6 * g.ps];
  }
  // the conference has closed: those who went line up for the photo; the flashes go off; then back to work
  function startPhoto(t) {
    var who = agents.filter(function (a) { return a.away && (a.mode === 'seat' || a.mode === 'go'); });
    who.sort(function (a, b) { return ({ prof: 0, postdoc: 1, grad: 2 })[a.kind] - ({ prof: 0, postdoc: 1, grad: 2 })[b.kind]; });
    if (!who.length) { backToWork(); return; }
    photo = { t0: t, n: who.length };
    who.forEach(function (a, i) {
      a.target = { k: 'photo', i: i }; a.mode = 'go'; a.delay = Math.random() * 0.4; a.path = [a.target];
    });
  }
  function backToWork() {
    var k = 0;
    agents.forEach(function (a) {
      if (!a.away) return;
      a.away = false;
      a.mode = 'back'; a.delay = k++ * 0.45;
      a.path = (a.target && a.target.k === 'hall' ? [{ k: 'caisle', i: a.target.i }] : a.target && a.target.k === 'photo' ? [{ k: 'pright', i: a.target.i }] : [])
        .concat([{ k: 'B' }, { k: 'A' }, { k: 'lane', x: g0().dx }]);
      a.loc = { k: 'lane' };
      if (a.home) a.path = a.path.concat(approach(a.home)), a.loc = a.home;
    });
  }
  var gcache = null, reviewing = 0;
  function g0() { return gcache; }
  // pick something to do: the board, the screen, another group, coffee; professors make the rounds
  function nextTask(a, g) {
    var r = Math.random(), running = g.tables.map(function (T, i) { return T.p ? i : -1; }).filter(function (i) { return i >= 0; });
    var tables = running.length ? running : g.tables.map(function (T, i) { return i; });
    var other = tables.filter(function (t) { return !a.duty || t !== a.duty.t; });
    if (a.kind === 'prof') {
      if (r < 0.4) return { task: 'present', to: { k: 'screen', i: 1 }, stay: 6 + Math.random() * 5 };
      if (r < 0.8) { var t = tables[Math.floor(Math.random() * tables.length)]; return { task: 'visit', to: { k: 'gap', t: t, side: Math.random() < 0.5 ? -1 : 1 }, stay: 5 + Math.random() * 4, t: t }; }
      return { task: 'board', to: { k: 'board', i: Math.floor(Math.random() * 2) }, stay: 4 + Math.random() * 4 };
    }
    if (r < 0.3) return { task: 'board', to: { k: 'board', i: Math.floor(Math.random() * 2) }, stay: 3 + Math.random() * 4 };
    if (r < 0.55 && other.length) { var t2 = other[Math.floor(Math.random() * other.length)]; return { task: 'visit', to: { k: 'gap', t: t2, side: Math.random() < 0.5 ? -1 : 1 }, stay: 3 + Math.random() * 4, t: t2 }; }
    if (r < 0.75) return { task: 'screen', to: { k: 'screen', i: Math.floor(Math.random() * 3) }, stay: 2 + Math.random() * 3 };
    return { task: 'coffee', to: { k: 'coffee' }, stay: 3 + Math.random() * 3 };
  }
  function stepAgent(a, dt, g, t) {
    if (a.place) { var q = at(a.target, g); a.x = q[0]; a.y = q[1]; a.place = false; }
    if (a.delay > 0) { a.delay -= dt; return false; }
    if (a.path.length) {
      var p = at(a.path[0], g), dx = p[0] - a.x, dy = p[1] - a.y, d = Math.hypot(dx, dy);
      var v = (a.task === 'fetch' || a.task === 'carry' ? 100 : a.mode === 'go' || a.mode === 'back' || a.task === 'huddle' || (a.duty && a.mode === 'trip') ? 34 : 18) * g.u * dt;
      if (d <= v) { a.x = p[0]; a.y = p[1]; a.path.shift(); } else { a.x += dx / d * v; a.y += dy / d * v; }
      if (!a.path.length) arrive(a);
      return true;
    }
    if (a.mode === 'seat') { var s = at(a.target, g); a.x = s[0]; a.y = s[1]; return false; }   // in the hall; stay put on resize
    if (a.mode === 'sit') { var c = at(a.home, g); a.x = c[0]; a.y = c[1]; }
    // a review crew's fetcher: to the stand for the paper, then with it to the table
    if (a.fetch && a.task !== 'fetch' && a.task !== 'carry' && (a.mode === 'sit' || a.mode === 'idle' || a.mode === 'stay')) {
      a.task = 'fetch'; a.mode = 'trip'; a.after = 'stay'; a.stay = 0.7; go(a, { k: 'review' }); return true;
    }
    if (a.task === 'fetch' && a.mode === 'stay' && a.timer - dt <= 0) {
      var fp = PS[a.fetch];
      if (fp) { fp.where = 'carry'; fp.by = a; }
      a.carry = a.fetch; a.fetch = null; a.task = 'carry'; a.mode = 'trip'; a.after = 'sit'; go(a, a.home); return true;
    }
    // a huddle at the screen: a result just crossed 3σ (the review crews keep reading)
    if (huddle > 0 && !a.duty && a.task !== 'huddle' && (a.mode === 'sit' || a.mode === 'stay' || a.mode === 'idle')) {
      a.task = 'huddle'; a.mode = 'trip'; a.stay = huddle; go(a, { k: 'screen', i: agents.indexOf(a) % 3 }); return true;
    }
    a.timer -= dt;
    if (a.mode === 'sit') {
      a.typing = Math.sin(t * 0.9 + a.ph * 3) > -0.3;                  // bursts of typing, pauses to read
      if (a.timer > 0) return false;
    } else if (a.mode === 'stay' && a.timer > 0) return false;
    // on a review: stay at the table while the paper is there
    if (a.duty && a.mode === 'sit') { a.timer = 6; return false; }
    // done here: next thing, or back to the chair
    if ((a.mode === 'stay' || a.mode === 'idle') && a.home && (a.duty || a.mode === 'stay' || Math.random() < 0.85)) {
      a.task = null; a.mode = 'trip'; a.after = 'sit'; go(a, a.home); return true;
    }
    var n = nextTask(a, g);
    a.task = n.task; a.stay = n.stay; a.visit = n.t; a.mode = 'trip'; a.after = 'stay'; a.typing = false;
    go(a, n.to);
    return true;
  }
  function arrive(a) {
    if (a.carry) {                                                           // put the paper down: on the table, or in the outbox
      var cp = PS[a.carry];
      if (cp && cp.by === a) { cp.by = null; cp.where = a.task === 'carry' && a.loc && a.loc.k === 'tray' ? 'tray' : cp.t >= 0 ? 'table' : 'stand'; }
      a.carry = null; if (a.task === 'carry') a.task = null;
    }
    if (a.mode === 'go') { a.mode = 'seat'; return; }
    if (a.mode === 'back') { a.mode = a.home ? 'sit' : 'idle'; a.timer = 5 + Math.random() * 10; return; }
    if (a.mode === 'trip') {
      if (a.after === 'sit' && a.home) { a.mode = 'sit'; a.timer = 10 + Math.random() * 16; a.task = null; }
      else { a.mode = 'stay'; a.timer = a.stay || 4; }
    }
  }

  /* ───────── drawing ───────── */
  function seated(x, y, s, col, hx, bob, arms) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x - 2.2 * s, y); ctx.quadraticCurveTo(x - 2.2 * s, y - 3 * s, x, y - 3 * s);
    ctx.quadraticCurveTo(x + 2.2 * s, y - 3 * s, x + 2.2 * s, y); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(x + (hx || 0), y - 4.5 * s - (bob || 0), 1.35 * s, 0, 6.2832); ctx.fill();
    if (arms) {                                                              // clapping or cheering: hands up
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, 0.8 * s);
      ctx.beginPath(); ctx.moveTo(x - 1.8 * s, y - 2.6 * s); ctx.lineTo(x - 2.6 * s + arms, y - 6.4 * s);
      ctx.moveTo(x + 1.8 * s, y - 2.6 * s); ctx.lineTo(x + 2.6 * s - arms, y - 6.4 * s); ctx.stroke(); ctx.lineWidth = 1;
    }
  }
  // the analysis plot, in miniature: points with error bars, S+B and B once there is something to see
  function drawPlot(s, u) {
    ctx.fillStyle = colors.rule; ctx.globalAlpha = 0.3; ctx.fillRect(s.x, s.y, s.w, s.h); ctx.globalAlpha = 1;
    ctx.strokeStyle = cheer ? colors.ok : huddle > 0 ? colors.warn : colors.dim; ctx.lineWidth = 1; ctx.strokeRect(Math.round(s.x) + 0.5, Math.round(s.y) + 0.5, Math.round(s.w), Math.round(s.h));
    if (!plot) return;
    var h = plot.h, m = plot.meta, fs = Math.max(7, Math.round(6 * u));
    var sig = m.sigma === undefined ? '' : m.done ? '5σ ✓' : m.sigma.toFixed(1) + 'σ';
    ctx.font = fs + 'px ' + colors.mono;
    var sw = sig ? ctx.measureText(sig).width + 4 * u : 0;
    label(fit(m.title, s.w - 6 * u - sw, fs), s.x + 3 * u, s.y + 7 * u, colors.fg, 'left', fs);
    if (sig) label(sig, s.x + s.w - 3 * u, s.y + 7 * u, m.done ? colors.ok : m.sigma >= 3 ? colors.warn : colors.dim, 'right', fs);
    var px = s.x + 4 * u, pw = s.w - 8 * u, py = s.y + 10 * u, ph = s.h - 13 * u;
    var logy = h.log, ymax = 0, ymin = Infinity;
    h.bins.forEach(function (b) { ymax = Math.max(ymax, b.n + Math.sqrt(b.n), b.mu || 0); if (b.n > 0) ymin = Math.min(ymin, b.n); });
    if (ymax <= 0) ymax = 10;
    var y0 = logy ? Math.max(0.5, Math.min(ymin, 1) * 0.5) : 0, y1 = logy ? ymax * 3 : ymax * 1.2;
    function X(v) { return px + (h.log ? (Math.log(v) - Math.log(h.lo)) / (Math.log(h.hi) - Math.log(h.lo)) : (v - h.lo) / (h.hi - h.lo)) * pw; }
    function Y(v) { return py + ph - (logy ? (Math.log(Math.max(v, y0)) - Math.log(y0)) / (Math.log(y1) - Math.log(y0)) : (v - y0) / (y1 - y0)) * ph; }
    ctx.save(); ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
    if (h.fit && m.sigma >= 2) {
      if (h.bins[0].bg !== undefined) {
        ctx.strokeStyle = colors.b1; ctx.setLineDash([3, 3]); ctx.beginPath();
        h.bins.forEach(function (b, i) { ctx[i ? 'lineTo' : 'moveTo'](X(b.x), Y(b.bg)); }); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.strokeStyle = colors.b2; ctx.beginPath();
      h.bins.forEach(function (b, i) { ctx[i ? 'lineTo' : 'moveTo'](X(b.x), Y(b.mu)); }); ctx.stroke();
    }
    ctx.strokeStyle = colors.fg; ctx.fillStyle = colors.fg; ctx.globalAlpha = 0.85;
    h.bins.forEach(function (b) {
      if (b.n <= 0 && logy) return;
      var x = X(b.x), e = Math.sqrt(Math.max(b.n, 1));
      ctx.beginPath(); ctx.moveTo(x, Y(b.n + e)); ctx.lineTo(x, Y(Math.max(logy ? y0 : 0, b.n - e))); ctx.stroke();
      ctx.fillRect(x - 1, Y(b.n) - 1, 2, 2);
    });
    ctx.restore();
    ctx.strokeStyle = colors.faint; ctx.beginPath(); ctx.moveTo(px, py + ph + 0.5); ctx.lineTo(px + pw, py + ph + 0.5); ctx.stroke();
  }
  // the whiteboard: scribbles in board coordinates (0–1), added by whoever stands at it
  function scribble() {
    if (board.length > 26) { board.length = 0; return; }                     // full: wipe it
    var x = 0.06 + Math.random() * 0.8, y = 0.12 + Math.random() * 0.72, r = Math.random(), pts = [];
    if (r < 0.3) { for (var i = 0; i <= 8; i++) pts.push([x + i * 0.02, y + Math.sin(i * 1.6) * 0.04]); }          // a wavy photon
    else if (r < 0.55) { pts.push([x, y], [x + 0.08, y + 0.06], [x + 0.16, y]); pts.push(null, [x + 0.08, y + 0.06], [x + 0.08, y + 0.16]); }   // a vertex
    else if (r < 0.75) { for (var k = 0; k <= 10; k++) pts.push([x + 0.05 + Math.cos(k / 10 * 6.28) * 0.05, y + Math.sin(k / 10 * 6.28) * 0.06]); }   // a loop
    else { for (var j = 0; j < 6; j++) pts.push([x + j * 0.025, y + (j % 2 ? -0.02 : 0.02)]); }                  // an equation's worth of squiggle
    board.push({ pts: pts, col: Math.random() < 0.25 ? 'b1' : Math.random() < 0.15 ? 'b2' : 'dim' });
  }
  function drawBoard(B) {
    ctx.fillStyle = colors.screen; ctx.fillRect(B.x, B.y, B.w, B.h);
    ctx.strokeStyle = colors.dim; ctx.lineWidth = 1; ctx.strokeRect(Math.round(B.x) + 0.5, Math.round(B.y) + 0.5, Math.round(B.w), Math.round(B.h));
    ctx.fillStyle = colors.faint; ctx.fillRect(B.x + 2, B.y + B.h, B.w - 4, 2);                               // the marker tray
    board.forEach(function (s) {
      ctx.strokeStyle = colors[s.col]; ctx.beginPath();
      var pen = false;
      s.pts.forEach(function (p) { if (!p) { pen = false; return; } ctx[pen ? 'lineTo' : 'moveTo'](B.x + p[0] * B.w, B.y + p[1] * B.h); pen = true; });
      ctx.stroke();
    });
  }

  function drawAnalysis(g, dt, t) {
    var A = g.A, u = g.u;
    label('ANALYSIS · ' + (ana.ls ? 'no beam, working through the backlog' : PC.fmt(ana.rate) + ' events/s in'), A.x + 6, A.y + 12, colors.faint, 'left', 8);
    label('whiteboard', g.board.x + g.board.w, A.y + 12, colors.faint, 'right', 8);
    drawPlot(g.scr, u);
    drawBoard(g.board);
    // the bookshelf on the left wall: journals, volume after volume
    var sh = g.shelf, rows = Math.max(3, Math.floor(sh.h / (9 * u)));
    ctx.strokeStyle = colors.dim; ctx.strokeRect(Math.round(sh.x) + 0.5, Math.round(sh.y) + 0.5, Math.round(sh.w), Math.round(sh.h));
    for (var r = 0; r < rows; r++) {
      var ry = sh.y + (r + 1) * sh.h / rows;
      for (var b = 0; b < 3; b++) {
        ctx.fillStyle = [colors.b1, colors.dim, colors.warn, colors.faint][(r * 3 + b) % 4]; ctx.globalAlpha = 0.6;
        ctx.fillRect(sh.x + 0.6 * u, ry - 5.5 * u + b * 1.8 * u, sh.w - 1.2 * u, 1.3 * u); ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = colors.faint; ctx.beginPath(); ctx.moveTo(sh.x, ry); ctx.lineTo(sh.x + sh.w, ry); ctx.stroke();
    }
    // the coffee corner
    ctx.fillStyle = colors.dim; ctx.fillRect(A.x + 3 * u, g.walkY - 13 * u, 5 * u, 7 * u);
    ctx.fillStyle = colors.faint; ctx.fillRect(A.x + 3 * u, g.walkY - 6 * u, 9 * u, 1.5 * u);
    // reconstructed data: a cable along each workstation row from the left wall; packets run along it to the
    // desks that are switched on (someone at it, in a running analysis group)
    var on = wsOn(g), rowsOn = rowsWithOn(g, on);
    for (var r = 0; r < g.wsRows; r++) {
      var ry = rowY(g, r), xe = wsX(g, r * g.wsN + g.wsN - 1);
      ctx.strokeStyle = rowsOn[r] ? colors.ok : colors.rule; ctx.globalAlpha = rowsOn[r] ? 0.35 : 0.6; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(A.x, ry + 0.5); ctx.lineTo(xe, ry + 0.5); ctx.stroke(); ctx.globalAlpha = 1;
    }
    var desks = Object.keys(on).map(Number);
    if (desks.length) {                                                       // every PC in use reads data from the storage
      acc += dt * Math.min(10, 1.5 + 0.6 * desks.length + 0.8 * Math.log10(1 + (ana.rate || 0)));
      while (acc >= 1) { acc -= 1; var d = desks[Math.floor(Math.random() * desks.length)]; packets.push({ i: d, p: 0 }); }
    }
    packets.forEach(function (k) { k.p += dt * 0.9; });
    packets = packets.filter(function (k) { return k.p < 1; });
    ctx.fillStyle = colors.ok;
    packets.forEach(function (k) {                                          // along the row's cable, then up into the monitor
      var ry = rowY(g, Math.floor(k.i / g.wsN)), tx = wsX(g, k.i), a1 = Math.min(1, k.p / 0.85), b1 = Math.max(0, (k.p - 0.85) / 0.15);
      var x = A.x + (tx - A.x) * a1, y = ry - b1 * 4 * u;
      ctx.fillRect(x - 2, y - 2, 4, 4);
    });
  }
  // the cable along a workstation row: at desk height, under the monitors
  function rowY(g, r) { return wsY(g, r * g.wsN) + 2 * g.u; }
  // the workstations switched on (their monitors green): someone is sitting at them
  function wsOn(g) {
    var on = {};
    agents.forEach(function (a) { if (a.mode === 'sit' && !a.path.length && a.home && a.home.k === 'ws') on[a.home.i] = true; });
    return on;
  }
  function rowsWithOn(g, on) { var r = []; for (var i = 0; i < g.wsRows; i++) r.push(false); Object.keys(on).forEach(function (i) { r[Math.floor(i / g.wsN)] = true; }); return r; }
  // the workstations: a desk with a monitor and a chair, for everyone without a group table
  function drawWorkstations(g, t, typing) {
    var u = g.u, fs = Math.max(7, Math.round(5.2 * u)), running = wsOn(g);
    // each running analysis group: its particle and a bar towards 5σ over its desks
    g.groups.forEach(function (G) {
      var y = Math.max(g.midY + u, wsY(g, 0) - 15 * u), w = G.x1 - G.x0, a = G.a;
      if (!a) return;
      ctx.fillStyle = colors.screen; ctx.fillRect(G.x0, y, w, 7 * u);
      ctx.strokeStyle = a.sigma >= 3 ? colors.warn : colors.dim; ctx.strokeRect(Math.round(G.x0) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(7 * u));
      label(fit(a.sym.split(/ → | = |, /)[0] + '  ' + a.sigma.toFixed(1) + 'σ', w - 4, fs), G.x0 + w / 2, y + 5.3 * u, a.sigma >= 3 ? colors.warn : colors.fg, 'center', fs);
      ctx.fillStyle = a.sigma >= 3 ? colors.warn : colors.b1; ctx.globalAlpha = 0.8;
      ctx.fillRect(G.x0 + 1, y + 7 * u - 1.4 * u, (w - 2) * Math.min(1, a.sigma / 5), 1.4 * u); ctx.globalAlpha = 1;
    });
    for (var i = 0; i < g.wsN * g.wsRows; i++) {
      var x = wsX(g, i), y = wsY(g, i), on = typing['ws:' + i] || (running[i] ? 0.5 : false);   // green: in use (brighter while typed at)
      ctx.fillStyle = colors.rule; ctx.fillRect(x - g.wsW / 2, y, g.wsW, 4 * u);
      ctx.fillStyle = on ? colors.ok : colors.faint; ctx.globalAlpha = on === true ? 0.85 : on ? 0.55 : 0.45;
      ctx.fillRect(x - 3.5 * u, y - 5 * u, 7 * u, 4.5 * u); ctx.globalAlpha = 1;
      ctx.fillStyle = colors.dim; ctx.fillRect(x - 0.5, y - 0.5 * u, 1, 0.5 * u);
    }
  }
  function drawTables(g, t, typing) {
    var u = g.u, fs = Math.max(7, Math.round(5 * u)), byId = {};
    (ana.papers || []).forEach(function (p) { byId[p.id] = p; });
    var ls = Math.max(6, Math.round(4.2 * u)), desks = {};
    (ana.desks || []).forEach(function (d) { desks[d.id] = d; });
    g.tables.forEach(function (T, i) {
      var x = T.x - g.tw / 2, y = T.y;
      if (T.kind === 'sigma') {
        var d = T.p && desks[T.p.slice(2)];
        ctx.fillStyle = d ? colors.warn : colors.rule; ctx.globalAlpha = d ? 0.12 : 0.3; ctx.fillRect(x, y, g.tw, g.th); ctx.globalAlpha = 1;
        ctx.strokeStyle = d ? colors.warn : colors.faint; if (!d) ctx.setLineDash([2, 3]);
        ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(g.tw), Math.round(g.th)); ctx.setLineDash([]);
        if (!d) return;
        // the plot printed out, a bump on it; the particle and how far from 5σ
        var px = x + 2 * u, pw2 = 9 * u, ph2 = g.th - 4 * u;
        ctx.fillStyle = colors.screen; ctx.fillRect(px, y + 2 * u, pw2, ph2);
        ctx.strokeStyle = colors.dim; ctx.beginPath();
        for (var k = 0; k <= 8; k++) { var xx = px + 1 + k * (pw2 - 2) / 8, yy = y + 2 * u + ph2 * (0.3 + 0.5 * k / 8) - (k === 5 ? ph2 * 0.35 : 0); ctx[k ? 'lineTo' : 'moveTo'](xx, yy); }
        ctx.stroke();
        var lx2 = x + 13 * u, lw2 = g.tw - 15 * u;
        label(fit(d.sym.split(/ → | = |, /)[0], lw2, fs), lx2, y + g.th * 0.4, colors.warn, 'left', fs);
        label(fit(d.sigma.toFixed(1) + 'σ → 5σ', lw2, fs), lx2, y + g.th * 0.4 + fs + 2, colors.dim, 'left', fs);
        ctx.fillStyle = colors.warn; ctx.globalAlpha = 0.8; ctx.fillRect(x + 1, y + g.th + 1, (g.tw - 2) * Math.min(1, d.sigma / 5), 1.4 * u); ctx.globalAlpha = 1;
        return;
      }
      var ps = T.p && PS[T.p], p = T.p && byId[T.p];
      var busy = !!p, here = ps && ps.where === 'table';
      ctx.fillStyle = colors.rule; ctx.globalAlpha = busy ? 0.55 : 0.3; ctx.fillRect(x, y, g.tw, g.th); ctx.globalAlpha = 1;
      ctx.strokeStyle = busy ? colors.dim : colors.faint; ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(g.tw), Math.round(g.th));
      if (!busy) return;
      // the paper on the table, as tall as the table leaves room for, filling as the collaboration reads it; its title beside it
      var su = (g.th - 5) / 7, sx = x + 3 + 2.5 * su;
      if (here) {
        sheet(sx, y + 2.5, su, p.round > 1 ? colors.b2 : colors.dim, colors.b1, p.p);
        // red-pen marks now and then from whoever is reading
        if (Math.sin(t * 2.3 + i * 1.7) > 0.85) { ctx.strokeStyle = colors.b2; ctx.beginPath(); ctx.moveTo(sx - 2 * su, y + 2.5 + 4 * su); ctx.lineTo(sx + 2 * su, y + 2.5 + 4.6 * su); ctx.stroke(); }
      }
      var lx = x + 6 + 5 * su, lw = g.tw - 8 - 5 * su;
      label(fit(p.name, lw, fs), lx, y + g.th * 0.4, colors.fg, 'left', fs);
      label(fit(here ? Math.round(p.p * 100) + '%' : '…', lw, fs), lx, y + g.th * 0.4 + fs + 2, here ? colors.dim : colors.faint, 'left', fs);
      ctx.fillStyle = colors.b1; ctx.globalAlpha = 0.8; ctx.fillRect(x + 1, y + g.th + 1, (g.tw - 2) * (here ? p.p : 0), 1.4 * u); ctx.globalAlpha = 1;
    });
  }
  function drawPeople(g, t, front, which) {
    var cheering = !!cheer;
    agents.forEach(function (a, idx) {
      if (a.mode === 'go' || a.mode === 'back' || a.mode === 'seat') { if (which !== 'hall') return; }
      else if (which === 'hall') return;
      var col = a.kind === 'prof' ? colors.b1 : colors.fg, s = g.ps * (a.kind === 'prof' ? 1.1 : 1);
      var sitting = a.mode === 'sit' && !a.path.length;
      if (which === 'room') {
        var behind = sitting && a.home && a.home.s < 2;
        if (front === behind) return;                                        // chairs behind a table go under it, the rest over it
        if (!sitting && !front) return;
      }
      if (which === 'hall') {
        if (!(a.mode === 'seat' && a.target && a.target.k === 'hall')) return;   // walkers and the speaker are drawn with the hall
        var asking = question && question.agent === a;
        if (asking) { PC.People.figure(ctx, a.x, a.y, s, col, 0, true); return; }
        seated(a.x, a.y, g.ps, col, 0, 0, clapUntil > t ? Math.sin(t * 20 + idx) * 0.8 * s : 0);
        return;
      }
      if (sitting) {
        // turn towards whoever is visiting the table; type in bursts
        var vis = agents.filter(function (o) { return o.mode === 'stay' && o.task === 'visit' && a.duty && o.visit === a.duty.t; })[0];
        var hx = vis ? Math.max(-1.2, Math.min(1.2, (vis.x - a.x) / 8)) * s : Math.sin(t * 0.6 + a.ph) * 0.8 * s;
        var bob = a.typing ? Math.abs(Math.sin(t * 9 + a.ph)) * 0.45 * s : 0;
        seated(a.x, a.y, s, col, hx, bob, cheering ? Math.sin(t * 14 + idx) * 0.8 * s : 0);
        return;
      }
      var walking = a.path.length > 0 && a.delay <= 0;
      var gesture = cheering || (a.mode === 'stay' && a.task !== 'coffee') || a.task === 'huddle';
      if (a.mode === 'stay' && a.task === 'visit') gesture = Math.sin(t * 5 + a.ph) > 0;
      var jump = cheering && !walking ? Math.abs(Math.sin(t * 9 + idx)) * 3 * s : 0;
      if (a.task === 'fetch' && a.mode === 'stay') gesture = true;                                       // picking it up
      PC.People.figure(ctx, a.x, a.y - jump, s, col, walking ? t * 9 + a.ph : 0, gesture);
      if (a.carry) sheet(a.x + 2.5 * s, a.y - 7 * s, g.u * 0.8, colors.b1, colors.b1, 0);   // the paper, to the table or the outbox
      if (!walking && a.mode === 'stay' && a.task === 'coffee') {
        ctx.strokeStyle = colors.faint; ctx.beginPath();
        for (var q = 0; q < 6; q++) ctx.lineTo(a.x + 2.5 * s + Math.sin(t * 4 + q) * 0.8, a.y - 6 * s - q * 1.2);
        ctx.stroke();
      }
    });
  }

  function drawConference(g, t, speaking) {
    var C = g.C, u = g.u, sc = g.cscr, c = conf.conf, cx = sc.x + sc.w / 2;
    label(c ? fit(c.name.toUpperCase() + ' · OPEN · ' + PC.dur(c.remain) + ' LEFT', C.w * 0.7, 8) : 'CONFERENCE ROOM', C.x + 6, C.y + 12, c ? colors.warn : colors.faint, 'left', 8);
    ctx.fillStyle = colors.rule; ctx.globalAlpha = 0.3; ctx.fillRect(sc.x, sc.y, sc.w, sc.h); ctx.globalAlpha = 1;
    ctx.strokeStyle = c ? colors.warn : colors.dim; ctx.lineWidth = c ? 1.5 : 1;
    ctx.strokeRect(Math.round(sc.x) - 0.5, Math.round(sc.y) - 0.5, Math.round(sc.w) + 1, Math.round(sc.h) + 1);
    var fs = Math.max(8, Math.round(6 * u));
    if (c) {
      var slides = c.slides.length ? c.slides : [{ title: 'Plenary session', sub: 'nothing of yours on the programme' }];
      var k = speaking ? Math.floor(t / 4) % slides.length : 0, sl = speaking ? slides[k] : { title: c.name, sub: 'the session is about to start' };
      if (speaking && k !== lastSlide) { if (lastSlide >= 0) clapUntil = t + 1.4; lastSlide = k; }   // applause for each new slide
      if (speaking && slides.length > 1) label((k + 1) + '/' + slides.length, sc.x + sc.w - 3 * u, sc.y + 7 * u, colors.faint, 'right', 7);
      var parts = sl.title.split(' = ');
      ctx.font = fs + 'px ' + colors.mono;
      if (parts.length === 2 && ctx.measureText(sl.title).width > sc.w - 8 * u) {       // a long result wraps at its '='
        label(fit(parts[0], sc.w - 8 * u, fs), cx, sc.y + sc.h * 0.42, sl.hot ? colors.warn : colors.fg, 'center', fs);
        label(fit('= ' + parts[1], sc.w - 8 * u, fs), cx, sc.y + sc.h * 0.42 + fs + 2, sl.hot ? colors.warn : colors.fg, 'center', fs);
      } else label(fit(sl.title, sc.w - 8 * u, fs), cx, sc.y + sc.h * 0.55, sl.hot ? colors.warn : colors.fg, 'center', fs);
      label(fit(sl.sub, sc.w - 6 * u, 7), cx, sc.y + sc.h - 4 * u, colors.dim, 'center', 7);
    } else {
      lastSlide = -1;
      label(fit(conf.next.name, sc.w - 8 * u, fs), cx, sc.y + sc.h * 0.42, colors.dim, 'center', fs);
      label(fit(conf.next.in === null ? 'next year' : 'in ' + PC.dur(conf.next.in), sc.w - 8 * u, 7), cx, sc.y + sc.h * 0.42 + fs + 1, colors.faint, 'center', 7);
      label(fit(conf.waiting ? conf.waiting + ' new paper' + (conf.waiting > 1 ? 's' : '') + ' to show' : 'no new papers yet', sc.w - 6 * u, 7),
        cx, sc.y + sc.h - 4 * u, conf.waiting ? colors.ok : colors.faint, 'center', 7);
    }
    // the rows; other labs arrive with the conference and clap too; now and then a question
    var mine = agents.length;
    if (speaking && !question && Math.random() < 0.004) {
      var mineSeated = agents.filter(function (a) { return a.mode === 'seat' && a.target && a.target.k === 'hall'; });
      question = Math.random() < 0.5 && mineSeated.length ? { agent: mineSeated[Math.floor(Math.random() * mineSeated.length)], until: t + 3 }
        : { seat: mine + Math.floor(Math.random() * (g.seats.length - mine)), until: t + 3 };
    }
    if (question && (question.until < t || !speaking)) question = null;
    g.seats.forEach(function (p, i) {
      ctx.strokeStyle = colors.rule; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p[0] - 3.5 * u, p[1] + 0.5); ctx.lineTo(p[0] + 3.5 * u, p[1] + 0.5); ctx.stroke();
      if (guests > 0 && i >= mine && Math.sin(i * 7.3 + i * i * 0.37) > -0.5) {
        ctx.globalAlpha = guests;
        if (question && question.seat === i) PC.People.figure(ctx, p[0], p[1], g.ps, colors.faint, 0, true);
        else seated(p[0], p[1], g.ps, colors.faint, 0, 0, clapUntil > t ? Math.sin(t * 20 + i) * 0.8 * g.ps : 0);
        ctx.globalAlpha = 1;
      }
    });
    if (question) {                                                          // the question, in a bubble
      var qp = question.agent ? [question.agent.x, question.agent.y] : g.seats[question.seat];
      ctx.fillStyle = colors.screen; ctx.strokeStyle = colors.dim; ctx.beginPath(); ctx.arc(qp[0] + 6 * u, qp[1] - 12 * u, 4 * u, 0, 6.2832); ctx.fill(); ctx.stroke();
      label('?', qp[0] + 6 * u, qp[1] - 10 * u, colors.fg, 'center', Math.max(8, Math.round(6 * u)));
    }
    var foot = c ? (c.n ? c.n + ' result' + (c.n > 1 ? 's' : '') + ' you could present · ' : '') + PC.dur(c.remain) + ' left' : '';
    if (foot) label(fit(foot, C.w - 12, 8), C.x + C.w / 2, C.y + C.h - 6, colors.warn, 'center', 8);
  }

  // the wall between the rooms, with a door that swings open into the conference room
  function drawWall(g) {
    var y = g.wall, x0 = g.dx - g.dw / 2, x1 = g.dx + g.dw / 2;
    ctx.strokeStyle = colors.dim; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(g.A.x, y); ctx.lineTo(x0, y); ctx.moveTo(x1, y); ctx.lineTo(g.A.x + g.A.w, y); ctx.stroke();
    var ang = door * Math.PI / 2;
    ctx.lineWidth = 2; ctx.strokeStyle = door > 0.05 ? colors.warn : colors.dim;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + Math.cos(ang) * g.dw, y + Math.sin(ang) * g.dw); ctx.stroke();
    if (door > 0.05) { ctx.lineWidth = 1; ctx.setLineDash([1, 2]); ctx.beginPath(); ctx.arc(x0, y, g.dw, 0, ang); ctx.stroke(); ctx.setLineDash([]); }
    ctx.lineWidth = 1;
    ctx.fillStyle = colors.dim; ctx.fillRect(x0 - 1, y - 2, 2, 4);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    draw(now);
  }
  function draw(now) {
    var dt = Math.min(0.1, (now - last) / 1000 || 0); last = now;
    if (!ana || !conf || W === 0 || cv.offsetParent === null) return;
    var t = now / 1000, g = geom();
    gcache = g;
    reconcile(g);
    papersTick(g, t);
    // a result crossing 3σ: everyone to the screen for a few seconds
    (ana.desks || []).forEach(function (d) {
      if (prevSig[d.id] !== undefined && prevSig[d.id] < 3 && d.sigma >= 3) huddle = 7;
      prevSig[d.id] = d.sigma;
    });
    if (huddle > 0) {
      huddle -= dt;
      if (huddle <= 0) agents.forEach(function (a) { if (a.task === 'huddle') { a.task = null; if (a.mode === 'stay') a.timer = 0; } });
    }
    // the conference opening and closing
    var open = !!conf.conf;
    if (wasOpen === null) { if (open) goToConference(true); }
    else if (open && !wasOpen) goToConference(false);
    else if (!open && wasOpen) startPhoto(t);
    if (photo && t - photo.t0 > 4.2) { photo = null; backToWork(); }        // the photo's taken
    wasOpen = open;
    guests += ((open ? 1 : 0) - guests) * Math.min(1, dt * 1.5);

    // move everyone; the board gets a scribble now and then from whoever stands at it
    var typing = {};
    agents.forEach(function (a) {
      stepAgent(a, dt, g, t);
      if (a.mode === 'sit' && a.typing && a.home && a.home.k === 'ws') typing['ws:' + a.home.i] = true;
      if (a.mode === 'stay' && a.task === 'board' && Math.random() < dt * 0.8) scribble();
    });

    ctx.clearRect(0, 0, W, H);
    drawAnalysis(g, dt, t);
    drawPeople(g, t, false, 'room');                                         // behind the tables
    drawTables(g, t, typing);
    drawWorkstations(g, t, typing);
    drawPeople(g, t, true, 'room');                                          // in front of them, and everyone standing
    drawStation(g, t);
    if (cheer) {
      cheer.age += dt;
      var k = cheer.age / 4, sc = g.scr, cs = Math.max(9, Math.round(8 * g.u));
      if (k >= 1) cheer = null;
      else {
        ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = colors.ok; ctx.lineWidth = 3;
        ctx.strokeRect(g.A.x + 2, g.A.y + 2, g.A.w - 4, g.A.h - 4);
        ctx.globalAlpha = Math.min(1, 3 * (1 - k)); ctx.fillStyle = colors.screen;
        ctx.fillRect(sc.x + 1, sc.y + sc.h * 0.3, sc.w - 2, sc.h * 0.45);
        label('5σ · observed', sc.x + sc.w / 2, sc.y + sc.h * 0.47, colors.ok, 'center', cs);
        label(fit(cheer.sym, sc.w - 8 * g.u, cs), sc.x + sc.w / 2, sc.y + sc.h * 0.47 + cs + 2, colors.ok, 'center', cs);
        ctx.restore();
      }
    }
    var speaker = agents[0] && agents[0].mode === 'seat' && agents[0].target && agents[0].target.k === 'lectern';
    drawConference(g, t, open && speaker);
    // in the hall and on the way: walkers, the audience, the speaker; the door opens for whoever is near
    var near = false;
    agents.forEach(function (a) { if (Math.hypot(a.x - g.dx, a.y - g.wall) < 16 * g.u) near = true; });
    agents.forEach(function (a) {
      if (!(a.mode === 'go' || a.mode === 'back' || a.mode === 'seat')) return;
      var col = a.kind === 'prof' ? colors.b1 : colors.fg;
      if (a.mode === 'seat' && a.target && a.target.k === 'hall') return;
      if (photo && a.target && a.target.k === 'photo' && !a.path.length) {    // posing: a smile and a wave from the back rows
        PC.People.figure(ctx, a.x, a.y, g.ps * (a.kind === 'prof' ? 1.1 : 1), col, 0, a.target.i >= 4 && Math.sin(t * 3 + a.ph) > 0.4);
        return;
      }
      var moving = a.path.length > 0 && a.delay <= 0;
      PC.People.figure(ctx, a.x, a.y, g.ps * (a.kind === 'prof' ? 1.1 : 1), col, moving ? t * 9 + a.ph : 0, !moving);
    });
    drawPeople(g, t, true, 'hall');
    door += ((near ? 1 : 0) - door) * Math.min(1, dt * 7);
    // the lectern in front of the speaker
    var lx = g.lectern[0], ly = g.lectern[1], lw = 7 * g.u, lh = 3.4 * g.ps;
    ctx.fillStyle = colors.rule; ctx.fillRect(lx - lw / 2, ly - lh, lw, lh);
    ctx.strokeStyle = colors.dim; ctx.lineWidth = 1; ctx.strokeRect(Math.round(lx - lw / 2) + 0.5, Math.round(ly - lh) + 0.5, Math.round(lw), Math.round(lh));
    if (photo) drawPhotographer(g, t);
    drawWall(g);
  }

  // the photographer, in the aisle in front of the rows, and the flashes
  function drawPhotographer(g, t) {
    var k = t - photo.t0, u = g.u, px = g.cscr.x + g.cscr.w / 2, py = photoSpot(g, 0)[1] + 16 * g.ps;
    PC.People.figure(ctx, px, py, g.ps, colors.dim, 0, true);
    ctx.fillStyle = colors.fg; ctx.fillRect(px - 2.5 * g.ps, py - 8.5 * g.ps, 5 * g.ps, 3 * g.ps);   // the camera, held up
    [1.8, 2.6, 3.4].forEach(function (f) {
      var d = k - f;
      if (d < 0 || d > 0.35) return;
      var a = 1 - d / 0.35;
      ctx.save(); ctx.globalAlpha = a * 0.55; ctx.fillStyle = colors.screen; ctx.fillRect(g.C.x, g.C.y, g.C.w, g.C.h);
      ctx.globalAlpha = a; ctx.fillStyle = colors.warn; ctx.beginPath(); ctx.arc(px, py - 7 * g.ps, 4 * g.ps * (1 + d * 3), 0, 6.2832); ctx.fill(); ctx.restore();
    });
    if (k < 1.6) label('everyone in front of the screen!', px, py + 10, colors.faint, 'center', 8);
  }

  /* ───────── papers ───────── */
  function slot(g, st, i) {                                                  // where sheet i sits on the desk or in the tray
    var S = st === 'internal' ? g.review : g.tray;
    return [S.x + S.w - 5 * g.u - (3 - i) * 8 * g.u, S.y - 7.5 * g.u];         // the sheets fill the right end; the label sits at the left
  }
  function tablePaper(i) { for (var id in PS) if (PS[id].t === i) return id; return null; }
  function tableKey(i) { var p = tablePaper(i); if (p) return p; for (var id in SIG) if (SIG[id] === i) return 's:' + id; return null; }
  function inRoom(a) { return a.mode !== 'go' && a.mode !== 'seat' && a.mode !== 'back'; }
  // a review is over (passed, withdrawn): the crew goes back to their desks
  function release(id) {
    agents.forEach(function (a) {
      if (a.duty && a.duty.p === id) { a.duty = null; a.home = a.base; if (a.mode === 'sit') { a.mode = 'idle'; a.timer = 0; } }
      if (a.fetch === id) { a.fetch = null; if (a.task === 'fetch') { a.task = null; a.timer = 0; } }
    });
  }
  // an analysis past 3σ: its group takes a 5σ-check table (cross-checks, unblinding) until the discovery
  function sigmaTick(g, open) {
    var desks = {};
    (ana.desks || []).forEach(function (d) { desks[d.id] = d; });
    Object.keys(SIG).forEach(function (id) {
      if (!desks[id] || desks[id].sigma < 3) { release('s:' + id); delete SIG[id]; }
    });
    // during a conference only the skeleton crew is in the room (inRoom), and they carry on
    (ana.desks || []).forEach(function (d) {
      if (d.sigma < 3 || SIG[d.id] !== undefined) return;
      var free = g.tables.map(function (T, i) { return i; }).filter(function (i) { return g.tables[i].kind === 'sigma' && !tableKey(i); });
      if (!free.length) return;
      // the group: whoever has a workstation in its columns, then anyone free; a professor if there is one
      var G = g.groups.filter(function (q) { return q.a && q.a.id === d.id; })[0];
      var mine = agents.filter(function (a) { return !a.duty && !a.carry && inRoom(a) && a.base && a.base.k === 'ws' && G && (a.base.i % g.wsN) >= G.c0 && (a.base.i % g.wsN) <= G.c1; });
      var prof = agents.filter(function (a) { return a.kind === 'prof' && !a.duty && inRoom(a); })[0];
      var others = agents.filter(function (a) { return !a.duty && !a.carry && inRoom(a) && a.kind !== 'prof' && mine.indexOf(a) < 0; });
      var crew = mine.concat(others).slice(0, prof ? 2 : 3).concat(prof ? [prof] : []);
      if (!crew.length) return;
      SIG[d.id] = free[0];
      crew.forEach(function (a, k) {
        a.duty = { p: 's:' + d.id, t: free[0], s: [0, 1, 2, 3][k] }; a.home = { k: 'seat', t: free[0], s: a.duty.s };
        if (a.mode === 'sit') { a.mode = 'idle'; a.timer = 0; } else if (a.mode === 'stay') a.timer = Math.min(a.timer, 0.5);
      });
    });
  }
  function papersTick(g, t) {
    var list = ana.papers || [], now = {}, open = !!(conf && conf.conf);
    function standIdx(p) { return list.filter(function (q) { return q.stage === 'internal' && PS[q.id] && PS[q.id].where === 'stand'; }).indexOf(p); }
    function trayIdx(p) { return list.filter(function (q) { return q.stage === 'journal'; }).indexOf(p); }
    list.forEach(function (p) {
      now[p.id] = p;
      var was = prevPapers[p.id], st = PS[p.id];
      if (!was || !st) {                                                      // submitted: printed, then onto the review stand
        PS[p.id] = st = { where: p.stage === 'journal' ? 'tray' : 'stand', t: -1, by: null };
        if (!was && p.stage === 'internal') { printing = t; flights.push({ from: [g.printer.x + g.printer.w / 2, g.printer.y - 4 * g.u], to: slot(g, 'internal', Math.min(3, standIdx(p))), t0: t + 0.6, dur: 0.9, col: 'b1' }); }
      } else if (was.stage === 'internal' && p.stage === 'journal') {         // passed internal review: one of the crew takes it to the outbox
        var crew = agents.filter(function (a) { return a.duty && a.duty.p === p.id && inRoom(a); });
        var from = st.where === 'table' ? [g.tables[st.t].x, g.tables[st.t].y] : slot(g, 'internal', 0);
        release(p.id);
        var c = st.where === 'carry' && st.by ? st.by : st.where === 'table' ? crew[0] : null;   // whoever has it in hand, or one of the readers
        if (c) {
          st.where = 'carry'; st.by = c; st.t = -1;
          c.carry = p.id; c.fetch = null; c.task = 'carry'; c.mode = 'trip'; c.after = 'stay'; c.stay = 1; go(c, { k: 'tray' });
        } else { if (st.by) st.by.carry = null; st.where = 'tray'; st.t = -1; st.by = null; flights.push({ from: from, to: slot(g, 'journal', Math.min(3, trayIdx(p))), t0: t, dur: 1, col: 'b1' }); }
      } else if (was.stage === 'journal' && p.stage === 'internal') {         // rejected: back to the stand, to be picked up again
        st.where = 'stand'; st.t = -1; st.by = null;
        flights.push({ from: slot(g, 'journal', 0), to: slot(g, 'internal', Math.min(3, standIdx(p))), t0: t, dur: 1.2, col: 'b2', mark: '✕' });
      }
    });
    Object.keys(PS).forEach(function (id) {                                  // gone from review: accepted (or the game was reset)
      if (now[id]) return;
      if (prevPapers[id] && prevPapers[id].stage === 'journal') {
        var j = JOURNAL[prevPapers[id].journal] || 'journal';
        flights.push({ from: slot(g, 'journal', 0), to: [g.scr.x + g.scr.w * 0.5, g.scr.y + g.scr.h * 0.5], t0: t, dur: 1.6, col: 'ok', mark: '✓ ' + j });
      }
      if (PS[id].by) PS[id].by.carry = null;
      release(id); delete PS[id];
    });
    prevPapers = now;
    sigmaTick(g, open);                                                     // a 5σ check comes before a paper
    // papers waiting on the stand get a free table and a crew; not while everyone is at a conference
    list.forEach(function (p) {
      var st = PS[p.id];
      if (st.where === 'stand' && st.t >= 0 && !agents.some(function (a) { return a.fetch === p.id || a.carry === p.id; })) {   // the fetch was interrupted
        var lead = agents.filter(function (a) { return a.duty && a.duty.p === p.id && inRoom(a); })[0];
        if (lead) lead.fetch = p.id; else st.t = -1;
        return;
      }
      if (p.stage !== 'internal' || st.where !== 'stand' || st.t >= 0) return;
      var free = g.tables.map(function (T, i) { return i; }).filter(function (i) { return g.tables[i].kind === 'review' && !tablePaper(i); });
      if (!free.length) return;
      var avail = agents.filter(function (a) { return !a.duty && !a.carry && inRoom(a) && a.task !== 'huddle'; });
      // at least 40% of those in the room stay at the workstations
      var spare = avail.length - Math.ceil(agents.filter(inRoom).length * 0.4);
      if (spare < 1) return;
      // a postdoc leads (and fetches), then students, and a professor if one is free
      avail.sort(function (a, b) { return ({ postdoc: 0, grad: 1, prof: 2 })[a.kind] - ({ postdoc: 0, grad: 1, prof: 2 })[b.kind]; });
      var crew = avail.slice(0, Math.min(spare, 3, Math.max(2, Math.ceil(avail.length / 4))));
      // the fetcher: someone already at a desk (quickest to the stand), else the lead
      var fi = crew.findIndex ? crew.findIndex(function (a) { return a.mode === 'sit' && a.kind !== 'prof'; }) : -1;
      if (fi > 0) crew.unshift(crew.splice(fi, 1)[0]);
      st.t = free[0];
      crew.forEach(function (a, k) {
        a.duty = { p: p.id, t: st.t, s: [0, 1, 2, 3][k] }; a.home = { k: 'seat', t: st.t, s: a.duty.s };
        if (k === 0) a.fetch = p.id;
        if (a.mode === 'sit') { a.mode = 'idle'; a.timer = 0; }
        else if (a.mode === 'stay') a.timer = Math.min(a.timer, 0.5);
      });
    });
    reviewing = list.filter(function (p) { return p.stage === 'internal'; }).length;
    flights = flights.filter(function (f) { return t - f.t0 < f.dur; });
    if (printing > t) printing = -10;
  }
  function sheet(x, y, u, fill, col, frac) {
    var w = 5 * u, h = 7 * u;
    ctx.fillStyle = colors.screen; ctx.fillRect(x - w / 2, y, w, h);
    if (frac > 0) { ctx.fillStyle = col; ctx.globalAlpha = 0.35; ctx.fillRect(x - w / 2, y + h * (1 - frac), w, h * frac); ctx.globalAlpha = 1; }
    ctx.strokeStyle = fill || colors.dim; ctx.lineWidth = 1; ctx.strokeRect(Math.round(x - w / 2) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h));
    ctx.strokeStyle = colors.faint; ctx.beginPath();                           // lines of text
    for (var k = 1; k <= 3; k++) { ctx.moveTo(x - w / 2 + 1.2 * u, y + k * 1.6 * u); ctx.lineTo(x + w / 2 - 1.2 * u, y + k * 1.6 * u); }
    ctx.stroke();
  }
  function drawStation(g, t) {
    var u = g.u, list = ana.papers || [], fs = Math.max(7, Math.round(5 * u));
    [['internal', g.review, 'internal review'], ['journal', g.tray, 'to the journals']].forEach(function (d) {
      var S = d[1], ps = list.filter(function (p) { var st = PS[p.id]; return p.stage === d[0] && (!st || st.where === (d[0] === 'internal' ? 'stand' : 'tray')); });
      ctx.fillStyle = colors.rule; ctx.globalAlpha = 0.6; ctx.fillRect(S.x, S.y, S.w, S.h); ctx.globalAlpha = 1;
      ctx.strokeStyle = colors.dim; ctx.strokeRect(Math.round(S.x) + 0.5, Math.round(S.y) + 0.5, Math.round(S.w), Math.round(S.h));
      if (d[0] === 'journal') { ctx.fillStyle = colors.dim; ctx.fillRect(S.x + S.w - 6 * u, S.y - 2 * u, 5 * u, 2 * u); }   // the mail slot
      label(d[0] === 'internal' ? 'review stand' : 'journals', S.x + 1, S.y - 7 * u, colors.faint, 'left', fs);
      label(String(ps.length), S.x + 1, S.y - 1.5 * u, ps.length ? colors.dim : colors.faint, 'left', fs);
      ps.slice(0, 4).forEach(function (p, i) {
        var at0 = slot(g, d[0], i), col = d[0] === 'internal' ? colors.dim : colors.b1;
        if (p.round > 1 && d[0] === 'internal') col = colors.b2;                // resubmitted after a rejection
        if (p.rev && d[0] === 'journal') col = colors.warn;                     // in revision
        sheet(at0[0], at0[1], u, col, d[0] === 'internal' ? colors.dim : colors.b1, p.p);
        if (d[0] === 'journal' && p.journal) label(JOURNAL[p.journal] || '', at0[0], at0[1] - 2, colors.faint, 'center', Math.max(6, Math.round(4.2 * u)));
      });
    });
    // the printer: busy for a moment when a paper is submitted
    var P = g.printer, busy = t - printing < 0.8;
    ctx.fillStyle = colors.rule; ctx.fillRect(P.x, P.y, P.w, P.h);
    ctx.strokeStyle = colors.dim; ctx.strokeRect(Math.round(P.x) + 0.5, Math.round(P.y) + 0.5, Math.round(P.w), Math.round(P.h));
    ctx.fillStyle = busy ? colors.ok : colors.faint; ctx.fillRect(P.x + P.w - 2.5 * u, P.y + 1.5 * u, 1.5 * u, 1.5 * u);
    if (busy) { var out = (t - printing) / 0.8; ctx.fillStyle = colors.screen; ctx.fillRect(P.x + P.w * 0.2, P.y - out * 5 * u, P.w * 0.6, out * 5 * u); }
    // sheets in flight: submitted, carried, rejected, accepted
    flights.forEach(function (f) {
      if (t < f.t0) return;
      var k = Math.min(1, (t - f.t0) / f.dur), e = k * k * (3 - 2 * k), x = f.from[0] + (f.to[0] - f.from[0]) * e, y = f.from[1] + (f.to[1] - f.from[1]) * e - Math.sin(k * Math.PI) * 14 * u;
      ctx.globalAlpha = f.col === 'ok' ? 1 - k * 0.6 : 1;
      sheet(x, y, u, colors[f.col], colors[f.col], f.col === 'ok' ? 1 : 0);
      if (f.mark) label(f.mark, x + 4 * u, y - 2 * u, colors[f.col], 'left', Math.max(8, Math.round(6 * u)));
      ctx.globalAlpha = 1;
    });
  }

  function deskAt(e) {
    if (!ana) return null;
    var b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top, g = geom(), hit = null;
    g.tables.forEach(function (T) {
      if (Math.abs(x - T.x) < g.tw / 2 + 4 && y > T.y - 10 * g.u && y < T.y + g.th + 10 * g.u) hit = T.kind === 'sigma' ? (T.p ? T.p.slice(2) : null) : '@papers';
    });
    g.groups.forEach(function (G) { if (G.a && x > G.x0 - 2 && x < G.x1 + 2 && y > wsY(g, 0) - 18 * g.u && y < wsY(g, (g.wsRows - 1) * g.wsN) + 16 * g.u) hit = G.a.id; });
    return hit;
  }

  return {
    init: function (canvas, pickCb) {
      cv = canvas; ctx = cv.getContext('2d'); onPick = pickCb;
      readColors(); resize();
      window.addEventListener('resize', resize);
      cv.addEventListener('click', function (e) {
        var b = cv.getBoundingClientRect();
        var g = geom(), y = e.clientY - b.top;
        if (!onPick) return;
        if (y > g.wall) { onPick('@conf'); return; }                           // the conference room opens the archive
        if (y > g.bandY - 16 * g.u) onPick('@papers');                          // the paper station opens the Papers section
        else onPick(deskAt(e));                                                 // the rest of the analysis room, the Analyses
      });
      requestAnimationFrame(frame);
    },
    resize: resize,
    readColors: readColors,
    // analysis room: { slots, paperSlots, desks: [{id, sym, sigma, rate}], done: [id], rate: data/s, ls, staff: {id: count},
    //   papers: [{id, name, stage 'internal'|'journal', p (0–1 through this stage), round, rev, journal}] }
    setAnalysis: function (v) {
      if (seenDone) v.done.forEach(function (id) { if (!seenDone[id]) cheer = { sym: PC.DISCMAP[id].particle, age: 0 }; });
      seenDone = {}; v.done.forEach(function (id) { seenDone[id] = true; });
      ana = v;
    },
    // conference room: { conf: {name, remain, n, slides: [{title, sub, hot}]} | null, next: {name, in}, waiting }
    setConference: function (v) { conf = v; },
    // the plot the Analyses window shows: (histogram, meta) as for PC.Plot.draw
    plot: function (h, meta) { plot = { h: h, meta: meta }; },
    // where the data link from the computing arrives, in canvas pixels
    entry: function () { return W && ana ? { x: 0, y: geom().entry[1] } : null; },
    // the data cables into the room, one per workstation row, in canvas pixels, and whether any desk on it is in use
    entries: function () {
      if (!W || !ana || !gcache) return null;
      var g = gcache, rows = rowsWithOn(g, wsOn(g)), out = [];
      for (var r = 0; r < g.wsRows; r++) out.push({ x: 0, y: rowY(g, r), on: rows[r] });
      return out;
    },
    // the vertical layout of the analysis room (tests): does everything fit above the wall?
    layout: function () { var g = geom(); return { k: g.k, walkY: g.walkY, rows: g.rowY, midY: g.midY, wsLast: wsY(g, (g.wsRows - 1) * g.wsN) + 4 * g.u, bandY: g.bandY, wall: g.wall }; },
    flights: function () { return flights.length; },
    // where everyone is (for the debug panel and tests): [{kind, mode, task, x, y}], and how far the door is open (0–1)
    people: function () { return agents.map(function (a) { return { kind: a.kind, mode: a.mode, task: a.task || null, x: a.x, y: a.y, home: a.home }; }); },
    door: function () { return door; },
    // where each paper in review is (for the debug panel and tests): [{id, where, t}]
    reviews: function () { return Object.keys(PS).map(function (id) { return { id: id, where: PS[id].where, t: PS[id].t }; }); },
    board: function () { return board.length; }
  };
})();
