/* Accelerator complex map (schematic, after CERN's own complex diagram).
 *
 * Rings appear when built; one under construction draws itself in amber as the
 * work progresses; affordable next machines are dashed outlines. Bunches
 * circulate in every running ring: protons (beam 1) blue, antiprotons or LHC
 * beam 2 red, counter-rotating. The marker shows where your experiment sits.
 */
var PC = PC || {};

PC.Complex = (function () {
  var cv, ctx, W = 0, H = 0, dpr = 1, colors = {}, view = null, t0 = 0, onPick = null, onHover = null;

  // positions in a unit square
  var RING = {
    lhc: { x: 0.60, y: 0.40, r: 0.31, name: 'LHC', len: '26.7 km' },
    sps: { x: 0.38, y: 0.67, r: 0.14, name: 'SPS', len: '6.9 km' },
    ps: { x: 0.16, y: 0.82, r: 0.055, name: 'PS', len: '628 m' },
    psb: { x: 0.07, y: 0.92, r: 0.022, name: 'Booster', len: '157 m' },
    aa: { x: 0.29, y: 0.91, r: 0.03, name: 'AA', len: '157 m' }
  };
  var SITES = {
    stand: { x: 0.08, y: 0.62, name: 'Surface test stand' },
    east: { x: 0.05, y: 0.72, name: 'PS East Hall' },
    north: { x: 0.12, y: 0.47, name: 'North Area' },
    ua: { x: 0.38, y: 0.81, name: 'SPS pit' },
    p5: { x: 0.60, y: 0.09, name: 'LHC Point 5' }
  };

  var techs = PC.People.crowd(), physicists = PC.People.crowd(), detEngs = PC.People.crowd(), lastT = 0;
  var CCC = { x: 0.80, y: 0.79 };   // the accelerator control room (after the CERN Control Centre, Prévessin)
  var LENS = 15;   // radius of the circle the detector lens zooms into
  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    ['--fg', '--dim', '--faint', '--rule', '--b1', '--b2', '--ok', '--warn', '--mono'].forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }
  function resize() {
    var r = cv.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1; W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function S() { return Math.min(W, H); }
  function P(x, y) { var s = S(), ox = (W - s) / 2, oy = (H - s) / 2; return [ox + x * s, oy + y * s]; }
  function label(t, x, y, col, align) {
    ctx.fillStyle = col; ctx.font = '10px ' + colors.mono; ctx.textAlign = align || 'left'; ctx.fillText(t, x, y); ctx.textAlign = 'left';
  }

  // status of a ring: the newest machine that uses it
  function ringStatus(key) {
    var ids = { lhc: ['lhc'], sps: ['sppbar', 'sps'], ps: ['ps'], psb: ['psb'], aa: ['aa'] }[key];
    var rank = { built: 0, building: 1, available: 2, locked: 3 }, best = null;
    ids.forEach(function (id) {
      var st = view.fac[id];
      if (!st || st === 'none') return;
      if (!best || rank[st] < rank[best.st] || (rank[st] === rank[best.st] && st === 'built' && id === ids[0])) best = { id: id, st: st, p: view.progress[id] };
    });
    return best;
  }

  // a small surface building centred on (x, y = its roof), screens lit while there is beam;
  // returns the spots in front of it where its staff stand
  // clickable buildings drawn this frame: [{id, x, y, w, h}]
  var hits = [];
  function building(p, s, lit, name, id) {
    var w = 22 * s, h = 9 * s, x = p[0] - w / 2, y = p[1];
    if (id) hits.push({ id: id, x: x - 4, y: y - 4, w: w + 8, h: h + 16 * s });
    ctx.save();
    ctx.fillStyle = colors.rule; ctx.globalAlpha = 0.5; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.dim; ctx.lineWidth = 1; ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h));
    for (var i = 0; i < 4; i++) {
      ctx.fillStyle = lit ? colors.ok : colors.faint; ctx.globalAlpha = lit ? 0.8 : 0.6;
      ctx.fillRect(x + 2.5 * s + i * 4.6 * s, y + 2.5 * s, 2.8 * s, 2 * s);
    }
    ctx.restore();
    if (name) label(name, p[0], y + h + 10 * s + 9, colors.faint, 'center');
    return [[x + 4 * s, y + h + 9 * s], [p[0], y + h + 9 * s], [x + w - 4 * s, y + h + 9 * s]];
  }

  function line(a, b, on, dash) {
    var p = P(a[0], a[1]), q = P(b[0], b[1]);
    ctx.save();
    ctx.strokeStyle = on ? colors.dim : colors.faint; ctx.lineWidth = 1;
    if (!on || dash) ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); ctx.restore();
  }

  function drawRing(key, ts, spots) {
    var R = RING[key], st = ringStatus(key);
    if (!st) return;
    var c = P(R.x, R.y), r = R.r * S();
    // where staff stand: the end of the arc under construction; around a built ring during a shutdown
    if (st.st === 'building') {
      var fa = -1.5708 + 6.2832 * st.p;
      [0, -0.25].forEach(function (d) { spots.build.push([c[0] + Math.cos(fa + d * 40 / Math.max(r, 40)) * r, c[1] + Math.sin(fa + d * 40 / Math.max(r, 40)) * r]); });
    } else if (st.st === 'built' && view.ls) {
      (r < 20 ? [1.5708] : [0.4, 2.0, 3.6, 5.2]).forEach(function (a) { spots.machine.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r + (r < 20 ? r + 2 : 0)]); });
    }
    ctx.save();
    if (st.st === 'built') {
      ctx.strokeStyle = view.ls ? colors.faint : colors.fg; ctx.lineWidth = key === 'lhc' ? 2 : 1.5;
      ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, 6.2832); ctx.stroke();
      if (key === 'lhc' || st.id === 'sppbar') {        // second beam pipe
        ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.arc(c[0], c[1], r - 3, 0, 6.2832); ctx.stroke(); ctx.globalAlpha = 1;
      }
    } else if (st.st === 'building') {
      ctx.strokeStyle = colors.faint; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = colors.warn; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(c[0], c[1], r, -1.5708, -1.5708 + 6.2832 * st.p); ctx.stroke();
    } else {
      ctx.strokeStyle = st.st === 'available' ? colors.dim : colors.faint; ctx.setLineDash(st.st === 'available' ? [4, 4] : [1, 5]);
      ctx.globalAlpha = st.st === 'available' ? 0.8 : 0.5;
      ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, 6.2832); ctx.stroke();
    }
    ctx.restore();
    // a fault on this ring: a red flashing spot where the crew works; colliders between fills have no beam
    var hit = st.st === 'built' && faultOn(key), collider = st.id === 'sppbar' || st.id === 'lhc';
    var injecting = st.st === 'built' && collider && view.fill && view.fill.phase === 'turn' && !hit;
    if (hit) {
      var fa = 0.9, fp = [c[0] + Math.cos(fa) * r, c[1] + Math.sin(fa) * r];
      ctx.save();
      ctx.strokeStyle = colors.b2; ctx.lineWidth = 2; ctx.globalAlpha = 0.55; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, 6.2832); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 0.5 + 0.5 * Math.sin(ts * 8);
      ctx.fillStyle = colors.b2; ctx.beginPath(); ctx.arc(fp[0], fp[1], 4, 0, 6.2832); ctx.fill();
      ctx.restore();
      if (!view.fault.all) spots.build.push(fp);
    }
    var nm = st.id === 'sppbar' && st.st === 'built' ? 'Sp̄pS' : R.name;
    var sub = st.st === 'building' ? 'building ' + Math.round(st.p * 100) + '%' : hit ? view.fault.name.toLowerCase() : injecting ? 'injecting' : st.st === 'built' ? R.len : st.st === 'available' ? 'can build' : 'planned';
    // LHC: inside the ring, under P5; SPS: above left of its ring, clear of the LHC; the rest to the right
    var al = 'left', lx = c[0] + r + 6, ly = c[1] - 2;
    if (key === 'lhc') { al = 'center'; lx = c[0]; ly = c[1] - r * 0.62; }
    else if (key === 'sps') { al = 'right'; lx = c[0] - r * 0.86; ly = c[1] - r * 0.95; }
    label(nm, lx, ly, st.st === 'built' ? colors.fg : st.st === 'building' ? colors.warn : colors.dim, al);
    label(sub, lx, ly + 12, st.st === 'building' ? colors.warn : hit ? colors.b2 : injecting ? colors.b1 : colors.faint, al);

    // bunches: none while faulted or injecting; a collider's fade as its fill's luminosity falls
    if (st.st === 'built' && !view.ls && view.running[st.id] && !hit && !injecting) {
      ctx.save();
      if (collider && view.fill && view.fill.phase === 'stable') ctx.globalAlpha = 0.3 + 0.7 * view.fill.l;
      var n = key === 'lhc' ? 10 : key === 'sps' ? 6 : 4, w = (key === 'lhc' ? 0.35 : key === 'sps' ? 0.7 : 1.4) * ts;
      var two = key === 'lhc' || st.id === 'sppbar';
      for (var i = 0; i < n; i++) {
        var a = w + i * 6.2832 / n;
        ctx.fillStyle = colors.b1;
        ctx.beginPath(); ctx.arc(c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, 2.2, 0, 6.2832); ctx.fill();
        if (two) {
          var b2 = -w + i * 6.2832 / n;
          ctx.fillStyle = colors.b2;
          ctx.beginPath(); ctx.arc(c[0] + Math.cos(b2) * (r - 3), c[1] + Math.sin(b2) * (r - 3), 2.2, 0, 6.2832); ctx.fill();
        }
      }
      ctx.restore();
    }
  }
  // is the ring (or line) drawn as `key` down with a fault?
  function faultOn(key) {
    var f = view.fault;
    return !!f && !view.ls && (f.all || (PC.FAC[f.fac] && PC.FAC[f.fac].map === key));
  }

  // the linac: a straight line into the first ring, drawn like the rings
  // (dashed when it can be built, amber as it is built, pulses while it runs)
  var LINACS = ['linac4', 'linac2', 'linac1'];
  function linacEnds() {
    return [[0.0, 0.99], view.fac.psb === 'built' ? [RING.psb.x - 0.015, RING.psb.y + 0.015] : [RING.ps.x - 0.04, RING.ps.y + 0.04]];
  }
  function linacStatus() {
    var built = null, building = null, next = null;
    LINACS.forEach(function (id) {
      var st = view.fac[id];
      if (st === 'built' && !built) built = id;
      if (st === 'building' && !building) building = id;
    });
    if (!built && !building) LINACS.slice().reverse().forEach(function (id) {
      if (!next && (view.fac[id] === 'available' || view.fac[id] === 'locked')) next = { id: id, st: view.fac[id] };
    });
    return { built: built, building: building, next: next };
  }
  function linacName(id) { return { linac1: 'Linac 1', linac2: 'Linac 2', linac4: 'Linac 4' }[id]; }

  function drawLinac(t, spots) {
    var ls = linacStatus(), e = linacEnds(), a = P(e[0][0], e[0][1]), b = P(e[1][0], e[1][1]);
    if (!ls.built && !ls.building && !ls.next) return;
    if (ls.building) { var lp0 = view.progress[ls.building] || 0; spots.build.push([a[0] + (b[0] - a[0]) * lp0, a[1] + (b[1] - a[1]) * lp0]); }
    var down = ls.built && faultOn('linac');
    if (down && !view.fault.all) spots.build.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    ctx.save();
    if (ls.built) {
      ctx.strokeStyle = view.ls ? colors.faint : down ? colors.b2 : colors.fg; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    } else if (ls.building) {
      ctx.strokeStyle = colors.faint; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
    } else {
      var av = ls.next.st === 'available';
      ctx.strokeStyle = av ? colors.dim : colors.faint; ctx.lineWidth = 1; ctx.globalAlpha = av ? 0.8 : 0.5;
      ctx.setLineDash(av ? [4, 4] : [1, 5]);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    if (ls.building) {                                  // the new linac grows from the source end
      var p = view.progress[ls.building] || 0;
      ctx.strokeStyle = colors.warn; ctx.lineWidth = 3; ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p); ctx.stroke();
    }
    // pulses heading into the ring whenever something downstream takes beam
    var r = view.running;
    if (ls.built && !view.ls && !down && (r[ls.built] || r.ps || r.psb)) {
      ctx.fillStyle = colors.b1; ctx.globalAlpha = 1;
      for (var i = 0; i < 3; i++) {
        var f = (t * 0.8 + i / 3) % 1;
        ctx.beginPath(); ctx.arc(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 2.2, 0, 6.2832); ctx.fill();
      }
    }
    ctx.restore();
    var lp = P(0.01, 0.975), x = lp[0] + 6, y = lp[1] + 2;
    if (ls.building) {
      var txt = (ls.built ? linacName(ls.built) + ' · ' : '') + linacName(ls.building) + ' building ' + Math.round((view.progress[ls.building] || 0) * 100) + '%';
      label(txt, x, y, colors.warn);
    } else if (ls.built) label(linacName(ls.built), x, y, colors.dim);
    else label(linacName(ls.next.id) + ' · ' + (ls.next.st === 'available' ? 'can build' : 'planned'), x, y, colors.faint);
  }

  function frame(ts) {
    if (!view || W === 0 || cv.offsetParent === null) { requestAnimationFrame(frame); return; }
    var t = ts / 1000, dt = Math.min(0.1, (ts - lastT) / 1000 || 0), spots = { build: [], machine: [] };
    lastT = ts;
    ctx.clearRect(0, 0, W, H);
    // transfer lines (drawn first)
    var f = view.fac;
    if (f.psb === 'built') line([RING.psb.x + 0.02, RING.psb.y - 0.01], [RING.ps.x - 0.045, RING.ps.y + 0.03], true);
    if (f.sps && f.sps !== 'none') line([RING.ps.x + 0.05, RING.ps.y - 0.02], [RING.sps.x - 0.13, RING.sps.y + 0.05], f.sps === 'built');
    if (f.aa && f.aa !== 'none') line([RING.ps.x + 0.05, RING.ps.y + 0.03], [RING.aa.x - 0.03, RING.aa.y], f.aa === 'built');
    if (f.lhc && f.lhc !== 'none') {
      line([RING.sps.x + 0.1, RING.sps.y - 0.1], [RING.lhc.x - 0.2, RING.lhc.y + 0.22], f.lhc === 'built');
      line([RING.sps.x + 0.135, RING.sps.y - 0.03], [RING.lhc.x + 0.219, RING.lhc.y + 0.219], f.lhc === 'built');   // TI 8 → P8
      label('TI 2 · TI 8', P(RING.sps.x + 0.15, RING.sps.y - 0.12)[0], P(0, RING.sps.y - 0.12)[1], colors.faint);
    }
    if (f.ps === 'built') line([RING.ps.x - 0.05, RING.ps.y - 0.02], [SITES.east.x, SITES.east.y], true, true);
    if (f.sps === 'built') line([RING.sps.x - 0.12, RING.sps.y - 0.06], [SITES.north.x, SITES.north.y], true, true);
    drawLinac(t, spots);

    ['lhc', 'sps', 'ps', 'psb', 'aa'].forEach(function (k) { drawRing(k, t, spots); });

    // staff. With beam on, the tunnels and the cavern are closed: accelerator physicists run the machines
    // from the control room and detector engineers sit in the experiment's control room on the surface.
    // In a shutdown they go down to the machines (the detector lens shows the engineers then).
    // Technicians are wherever something is being built.
    var st = view.staff || {}, ps = Math.max(1, S() / 420);
    var beamOn = !view.ls && Object.keys(view.running).some(function (k) { return view.running[k] && k !== 'cosmic'; });
    var anyMachine = Object.keys(view.fac).some(function (k) { return k !== 'cosmic' && view.fac[k] === 'built'; });
    hits = [];
    var ccc = anyMachine ? building(P(CCC.x, CCC.y), ps, beamOn, 'control room', '@ccc') : null;
    var site0 = SITES[view.site], spc = P(site0.x, site0.y);
    // under the site, except at Point 5, where the ring is below: up and to the right, clear of its label
    var expAt = site0.y < 0.15 ? [spc[0] + LENS + 34 * ps, spc[1] - LENS - 14 * ps] : [Math.max(12 * ps, spc[0]), spc[1] + LENS + 14 * ps];
    if (view.site === 'ua') expAt[0] += 30 * ps;                             // in the SPS pit: right of the AA's label
    var exp = building(expAt, ps, beamOn, '', '@dcr');                       // the detector control room, lit while there is beam
    techs.step(ctx, dt, t, spots.build, PC.People.shown(st.technician, 5), { scale: ps, color: colors.warn, speed: 10 * ps, spark: colors.warn, spread: 5 * ps });
    physicists.step(ctx, dt, t, beamOn ? ccc : spots.machine, PC.People.shown(st.accphys, 5), { scale: ps, color: colors.fg, speed: 14 * ps, pause: [4, 9] });
    detEngs.step(ctx, dt, t, beamOn && view.site !== 'stand' ? exp : null, PC.People.shown(st.deteng, 4), { scale: ps, color: colors.fg, speed: 8 * ps, pause: [4, 10], spread: 3 * ps });

    // experiment marker
    var site = SITES[view.site], sp = P(site.x, site.y);
    ctx.save();
    ctx.strokeStyle = colors.warn; ctx.fillStyle = colors.warn; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (var k = 0; k < 8; k++) { var a = k * Math.PI / 4 + Math.PI / 8; ctx[k ? 'lineTo' : 'moveTo'](sp[0] + Math.cos(a) * 7, sp[1] + Math.sin(a) * 7); }
    ctx.closePath(); ctx.stroke();
    if (view.colliding && !view.ls) {                 // collisions at the experiment
      var ph = (t * 1.3) % 1;
      ctx.globalAlpha = 1 - ph; ctx.beginPath(); ctx.arc(sp[0], sp[1], 7 + ph * 14, 0, 6.2832); ctx.stroke();
    }
    // the area the detector lens magnifies
    ctx.strokeStyle = colors.warn; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(sp[0], sp[1], LENS, 0, 6.2832); ctx.stroke();
    ctx.restore();
    if (site.y < 0.15) label(site.name, sp[0], sp[1] - LENS - 5, colors.warn, 'center');
    else label(site.name, sp[0] + LENS + 4, sp[1] + 4, colors.warn);
    if (view.ls) label('LONG SHUTDOWN · beams off', 10, 18, colors.b2);   // top left: Point 5's label is top centre
    else if (view.fault && view.fault.all) label('FAULT · ' + view.fault.name + ' · all beams lost', 10, 18, colors.b2);
    label('schematic · not to scale', W - 10, H - 10, colors.faint, 'right');
    requestAnimationFrame(frame);
  }

  function ringAt(e) {
    if (!view) return null;
    var b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
    for (var i = 0; i < hits.length; i++) {
      var hb = hits[i];
      if (x >= hb.x && x <= hb.x + hb.w && y >= hb.y && y <= hb.y + hb.h) return { id: hb.id, x: x, y: y };
    }
    var best = null, bd = 14;
    Object.keys(RING).forEach(function (k) {
      var c = P(RING[k].x, RING[k].y), r = RING[k].r * S();
      var d = Math.abs(Math.hypot(x - c[0], y - c[1]) - r);
      if (r < 20) d = Math.max(0, Math.hypot(x - c[0], y - c[1]) - r);
      if (d < bd) { bd = d; best = k; }
    });
    if (!best) {
      var ls = linacStatus(), id = ls.building || ls.built || (ls.next && ls.next.id);
      if (!id) return null;
      var e2 = linacEnds(), a = P(e2[0][0], e2[0][1]), q = P(e2[1][0], e2[1][1]);
      var dx = q[0] - a[0], dy = q[1] - a[1], u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
      if (Math.hypot(x - a[0] - u * dx, y - a[1] - u * dy) > 8) return null;
      return { id: id, x: x, y: y };
    }
    var st = ringStatus(best);
    return { id: st ? st.id : best, x: x, y: y };
  }
  function pick(e) { var r = ringAt(e); if (r && onPick) onPick(r.id); }
  function hover(e) {
    var r = ringAt(e);
    cv.style.cursor = r ? 'pointer' : 'default';
    if (onHover) onHover(r);
  }

  return {
    init: function (canvas, pickCb, hoverCb) {
      cv = canvas; ctx = cv.getContext('2d'); onPick = pickCb; onHover = hoverCb;
      cv.addEventListener('mousemove', hover);
      cv.addEventListener('mouseleave', function () { if (onHover) onHover(null); });
      readColors(); resize();
      window.addEventListener('resize', resize);
      cv.addEventListener('click', pick);
      requestAnimationFrame(frame);
    },
    resize: resize,
    readColors: readColors,
    // v: { fac: {id: 'built'|'building'|'available'|'locked'|'none'}, progress: {id: 0..1}, running: {id: bool},
    //      site, colliding, ls, staff: {id: count}, fault: {fac, all, name} | null, fill: {phase, l} | null }  (linac1/2/4 come through fac/progress/running like the rings)
    set: function (v) { view = v; },
    // where the experiment sits, in canvas pixels, for the zoom lines
    site: function () { if (!view || !W) return null; var s = SITES[view.site], p = P(s.x, s.y); return { x: p[0], y: p[1], r: LENS }; }
  };
})();
