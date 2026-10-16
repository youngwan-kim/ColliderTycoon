/* Computing lens: where the triggered events go.
 *
 * The hall grows with the computing technology: a counting room of NIM crates
 * with ticking scalers and a scope, scanning tables with bubble-chamber film,
 * the plus-shaped CDC 6600 with its console and tape drives, VAX cabinets with
 * disk packs and terminals, rows of PC farm racks fed by a tape robot and, with
 * the Grid, the Tier-0 linked to the Tier-1 centres (GPU nodes with ML).
 * Packets arrive from the detector (left) and leave for storage (right); LEDs
 * show the load. When the computing cannot keep up with the trigger, the
 * equipment turns red and a backlog queues at the door.
 *
 * The room is tall: the machines on top, the storage hall below. What the farm writes
 * flows down a pipe between them, one lane per trigger stream, to the slot being
 * written. Storage units follow the storage technology (card cabinets, tape reels,
 * disk packs, a robotic silo, disk servers, disk pools and a tape library); more units
 * stand there as the capacity grows, and their slots fill with the data. Clicking the
 * storage hall opens the storage window.
 */
var PC = PC || {};

PC.Computing = (function () {
  var cv, ctx, W = 0, H = 0, dpr = 1, colors = {}, view = null, last = 0, onStore = null, geo = { split: 0, inY: 0, outY: 0 };
  var robo = { x: 0.5, tx: 0.5, v: 0, wait: 1, waitT: 1, grab: 0, mount: false, up: false };   // the library's picker: where it is, where it is going
  var packets = [], outgoing = [], spawnAcc = 0, leds = {}, ledT = 0, scaler = 0;
  var shifters = PC.People.crowd(), engineers = PC.People.crowd();
  var TIER1 = ['BNL', 'FNAL', 'TRIUMF', 'RAL', 'NL-T1', 'NDGF', 'KIT', 'IN2P3', 'PIC', 'CNAF', 'JINR', 'KISTI', 'ASGC'];

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
  function label(t, x, y, col, align, size) {
    ctx.fillStyle = col; ctx.font = (size || 10) + 'px ' + colors.mono; ctx.textAlign = align || 'left'; ctx.fillText(t, x, y); ctx.textAlign = 'left';
  }
  function box(x, y, w, h, fill, alpha, stroke) {
    if (fill) { ctx.fillStyle = fill; ctx.globalAlpha = alpha == null ? 0.35 : alpha; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1; }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1); }
  }
  function circle(x, y, r, stroke, fill) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  // an LED that re-rolls on every refresh: lit with probability p
  function led(key, p, refresh) {
    if (refresh || leds[key] === undefined) leds[key] = Math.random() < p;
    return leds[key];
  }
  function rnd(seed) { var x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  // the newest computing system decides what the hall looks like
  function level() {
    var t = view.tech;
    return t.grid ? 'grid' : t.farms ? 'farms' : t.vax ? 'vax' : t.mainframe ? 'mainframe' : t.scanning ? 'scanning' : 'counting';
  }

  // raised floor tiles of a machine room, over the whole room
  function floor(u) {
    ctx.save();
    ctx.strokeStyle = colors.rule; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
    var s = 12 * u;
    for (var x = s; x < W; x += s) { ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, H); ctx.stroke(); }
    for (var y = s; y < H; y += s) { ctx.beginPath(); ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(W, Math.round(y) + 0.5); ctx.stroke(); }
    ctx.restore();
  }

  /* ───── the storage hall ───── */
  // what each storage technology looks like: slots per unit (cols × rows) and how a slot is drawn
  var STORE = {
    none: { name: 'film & card cabinets', c: 1, r: 5, kind: 'drawer' },
    tape: { name: 'tape reels', c: 2, r: 4, kind: 'reel' },
    diskpack: { name: 'disk packs', c: 2, r: 3, kind: 'pack' },
    silo: { name: 'tape silo', c: 3, r: 5, kind: 'cart', silo: true },
    raid: { name: 'disk servers', c: 2, r: 7, kind: 'bay' },
    castor: { name: 'CASTOR: disk + tape', c: 2, r: 8, kind: 'bay', library: true },
    eos: { name: 'EOS disk pools', c: 3, r: 9, kind: 'bay', library: true },
    cta: { name: 'EOS + CERN Tape Archive', c: 3, r: 10, kind: 'bay', library: true }
  };
  function storeName() { return view && view.store ? STORE[view.store.level].name : ''; }
  // draws the hall in (x, y, w, h); returns where incoming data lands and where people stand
  function storage(g, x, y, w, h) {
    var st = view.store, sp = STORE[st.level], frac = Math.min(1, st.used / st.cap), full = st.full;
    var col = full ? colors.b2 : frac > 0.85 ? colors.warn : colors.b1;
    label('STORAGE · ' + sp.name, x + 4, y + 10, colors.dim, 'left', 8);
    var blink = full && Math.sin(g.t * 5) > -0.2;
    label(full ? (blink ? 'FULL' : '') : Math.round(frac * 100) + '%', x + w - 4, y + 10, full ? colors.b2 : frac > 0.85 ? colors.warn : colors.faint, 'right', 8);
    // the library (tape robot) along the bottom once there is one; the silo in its place before that
    var top = y + 16, bottom = y + h - 4, lib = null;
    if (sp.library || sp.silo) {
      var lh = Math.min(26, h * 0.2);
      lib = { x: x + 4, y: bottom - lh, w: w - 8, h: lh };
      bottom = lib.y - 5;
    }
    // units: as many columns and rows as fit; more of them stand as the capacity grows
    var cols = Math.max(2, Math.min(5, Math.floor((w - 8) / 56))), rows = Math.max(1, Math.min(5, Math.floor((bottom - top) / 64))), maxN = cols * rows;
    var n = Math.max(2, Math.min(maxN, 2 + Math.floor(Math.log(Math.max(1, st.cap / st.start)) / Math.log(30))));
    var gx = 6, gy = 8, uw = (w - 8 - gx * (cols - 1)) / cols, uh = (bottom - top - gy * (rows - 1)) / rows;
    var per = sp.c * sp.r, total = n * per, filled = frac * total, slots = [], aisle = [];
    for (var i = 0; i < maxN; i++) {
      var c = i % cols, r = Math.floor(i / cols), ux = x + 4 + c * (uw + gx), uy = top + r * (uh + gy);
      if (i >= n) {                                        // floor space for the next unit
        ctx.setLineDash([2, 3]); box(ux, uy, uw, uh, null, 0, colors.rule); ctx.setLineDash([]);
        continue;
      }
      box(ux, uy, uw, uh, colors.rule, 0.3, colors.dim);
      aisle.push([ux + uw / 2, uy + uh + 2]);
      var sw = (uw - 4) / sp.c, sh = (uh - 4) / sp.r;
      for (var k = 0; k < per; k++) {
        var idx = i * per + k, sc = Math.floor(k / sp.r), sr = k % sp.r;
        var sx = ux + 2 + sc * sw, sy = uy + 2 + sr * sh, f = Math.max(0, Math.min(1, filled - idx));
        var writing = !full && !g.view.ls && st.write > 0 && idx === Math.floor(filled);
        slot(sp.kind, sx, sy, sw, sh, f, writing && Math.sin(g.t * 12) > 0 ? colors.ok : col);
        slots.push([sx + sw / 2, sy + sh / 2]);
      }
    }
    // the robot: a picker running along the library to the cartridge being written
    if (lib) {
      box(lib.x, lib.y, lib.w, lib.h, colors.rule, 0.3, colors.dim);
      ctx.fillStyle = colors.faint;
      for (var q = 0; q < Math.floor(lib.w / 4); q++) { ctx.fillRect(lib.x + 2 + q * 4, lib.y + 2, 2, lib.h * 0.3); ctx.fillRect(lib.x + 2 + q * 4, lib.y + lib.h * 0.65, 2, lib.h * 0.3); }
      var busy = !g.view.ls && st.write > 0 && !full;
      roboStep(g.dt || 0, busy);
      // the drives at the left end, where cartridges are mounted
      ctx.fillStyle = colors.dim; ctx.fillRect(lib.x + 1, lib.y + 1, 4, lib.h - 2);
      ctx.fillStyle = busy && Math.sin(g.t * 7) > 0 ? colors.ok : colors.faint; ctx.fillRect(lib.x + 2, lib.y + 3, 2, 2);
      var px = lib.x + 6 + (lib.w - 13) * robo.x, rail = lib.y + lib.h * 0.5;
      ctx.strokeStyle = colors.faint; ctx.beginPath(); ctx.moveTo(lib.x + 6, rail + 0.5); ctx.lineTo(lib.x + lib.w - 2, rail + 0.5); ctx.stroke();
      // the picker; pausing, it reaches into a slot above or below and pulls a cartridge out
      var reach = robo.grab * lib.h * 0.32 * (robo.up ? -1 : 1);
      ctx.fillStyle = colors.warn; ctx.fillRect(px - 2, rail - 3, 5, 6);
      if (robo.grab > 0.05) { ctx.fillRect(px, rail, 1.5, reach); ctx.fillStyle = colors.b1; ctx.fillRect(px - 1, rail + reach - (robo.up ? 0 : 2), 3.5, 2); }
      label(sp.silo ? 'SILO' : 'TAPE', lib.x + lib.w / 2, lib.y + lib.h + 0.5 - 1, colors.faint, 'center', 7);
    }
    var at = slots[Math.min(slots.length - 1, Math.floor(filled))] || [x + w / 2, y + h / 2];
    return { at: at, aisle: aisle };
  }
  // the picker: eases to a slot, pauses to pick or put a cartridge, now and then takes one to the drives
  function roboStep(dt, busy) {
    if (robo.wait > 0) {
      robo.wait -= dt;
      robo.grab = Math.max(0, Math.sin(Math.min(1, 1 - robo.wait / robo.waitT) * Math.PI));
      if (robo.wait <= 0) {
        robo.grab = 0;
        var r = Math.random();
        robo.tx = robo.mount ? 0.15 + Math.random() * 0.85 : r < (busy ? 0.35 : 0.15) ? 0 : Math.random();
        robo.mount = robo.tx === 0; robo.up = Math.random() < 0.5;
      }
      return;
    }
    var d = robo.tx - robo.x, vmax = busy ? 0.9 : 0.35, acc = busy ? 2.4 : 1;
    var want = Math.sign(d) * Math.min(vmax, Math.sqrt(2 * acc * Math.abs(d)));   // speed up, then brake into the slot
    robo.v += Math.max(-acc * dt, Math.min(acc * dt, want - robo.v));
    robo.x += robo.v * dt;
    if (Math.abs(d) < 0.004 || (d > 0) !== (robo.tx - robo.x > 0)) {
      robo.x = robo.tx; robo.v = 0;
      robo.waitT = robo.wait = robo.mount ? 0.6 + Math.random() * 0.5 : (busy ? 0.35 : 1.2) + Math.random() * (busy ? 0.9 : 2.5);
    }
  }
  function slot(kind, x, y, w, h, f, col) {
    var cx = x + w / 2, cy = y + h / 2, r = Math.max(1.5, Math.min(w, h) / 2 - 1);
    ctx.lineWidth = 1;
    if (kind === 'reel' || kind === 'pack') {
      ctx.globalAlpha = 1; circle(cx, cy, r, colors.faint);
      if (f > 0) { ctx.globalAlpha = 0.35 + 0.65 * f; circle(cx, cy, r - 0.5, null, col); ctx.globalAlpha = 1; }
      if (kind === 'pack') circle(cx, cy, Math.max(1, r * 0.35), colors.dim); else circle(cx, cy, 1, null, colors.dim);
      return;
    }
    var pw = w - 2, ph = kind === 'bay' ? Math.max(1.5, h - 2) : Math.max(2, h - 2);
    ctx.strokeStyle = colors.faint; ctx.globalAlpha = 0.8; ctx.strokeRect(Math.round(x + 1) + 0.5, Math.round(y + 1) + 0.5, Math.max(1, Math.round(pw) - 1), Math.max(1, Math.round(ph) - 1)); ctx.globalAlpha = 1;
    if (f > 0) {
      ctx.fillStyle = col; ctx.globalAlpha = 0.85;
      if (kind === 'drawer') ctx.fillRect(x + 1, y + 1, pw * f, ph);               // a drawer filling with film boxes and cards
      else ctx.fillRect(x + 1, y + 1, pw * f, ph);                                 // cartridges and drive bays light up
      ctx.globalAlpha = 1;
    }
  }

  /* ───── each era draws its equipment and returns where packets go in (in) and come out (out) ───── */

  // 1950s: two NIM bins of counter modules, a scaler, a scope
  function counting(g) {
    var u = g.u, cx = g.cx, cy = g.cy, ins = [];
    [-1, 1].forEach(function (sg, b) {
      var w = 34 * u, h = 30 * u, x = cx + sg * 3 * u - (sg < 0 ? w : 0), y = cy - 22 * u;
      box(x, y, w, h, colors.rule, 0.3, g.edge);
      var n = 6, mw = (w - 4) / n;
      for (var m = 0; m < n; m++) {                    // modules: LED on top, two knobs, a cable socket
        var mx = x + 2 + m * mw;
        ctx.strokeStyle = colors.faint; ctx.strokeRect(Math.round(mx) + 0.5, y + 2.5, Math.round(mw) - 2, h - 5);
        ctx.fillStyle = led(b + ':' + m, g.util, g.refresh) ? g.on : colors.faint;
        ctx.fillRect(mx + mw / 2 - 2, y + 5, 3, 3);
        circle(mx + mw / 2 - 0.5, y + h * 0.45, 1.6, colors.dim);
        circle(mx + mw / 2 - 0.5, y + h * 0.65, 1.6, colors.dim);
        ctx.fillStyle = colors.dim; ctx.fillRect(mx + mw / 2 - 1.5, y + h - 7, 2, 3);
      }
      ins.push([x + w / 2, y + h / 2]);
    });
    // scaler: the recorded-event count ticking up
    var digits = ('000000' + Math.floor(scaler) % 1e6).slice(-6), sx = cx - 30 * u, sy = cy + 16 * u, dw = 10 * u;
    box(sx - 2, sy - 2, 6 * dw + 4, 14 * u + 4, colors.rule, 0.3, colors.dim);
    for (var i = 0; i < 6; i++) {
      box(sx + i * dw + 1, sy, dw - 2, 14 * u, null, 0, colors.faint);
      label(digits[i], sx + i * dw + dw / 2, sy + 11 * u, g.view.ls ? colors.faint : colors.warn, 'center', Math.max(8, Math.round(11 * u)));
    }
    label('SCALER', cx, sy + 24 * u, colors.faint, 'center', 8);
    // a scope with a pulse train
    var ox = cx + 34 * u, oy = cy + 14 * u, ow = 22 * u, oh = 16 * u;
    box(ox, oy, ow, oh, colors.rule, 0.3, colors.dim);
    ctx.strokeStyle = g.view.ls ? colors.faint : colors.ok; ctx.beginPath();
    for (var k = 0; k <= 20; k++) {
      var px = ox + 2 + k * (ow - 4) / 20, ph = (k / 20 + g.t * 1.5) % 1;
      var py = oy + oh * 0.7 - (!g.view.ls && ph % 0.33 < 0.05 ? oh * 0.45 : 0);
      ctx[k ? 'lineTo' : 'moveTo'](px, py);
    }
    ctx.stroke();
    return { ins: ins, out: [sx + 3 * dw, sy],
      desk: [[cx - 24 * u, cy + 44 * u], [cx + 2 * u, cy + 44 * u], [cx + 45 * u, cy + 40 * u]],
      aisle: [[cx - 20 * u, cy + 12 * u], [cx + 20 * u, cy + 12 * u]] };
  }

  // 1955: light tables, a frame of bubble-chamber film on each, reels either side
  function scanning(g) {
    var u = g.u, cx = g.cx, cy = g.cy, ins = [], desk = [];
    for (var r = 0; r < 3; r++) {
      var w = 64 * u, h = 20 * u, x = cx - w / 2, y = cy - 36 * u + r * 26 * u;
      box(x, y, w, h, colors.rule, 0.3, g.edge);
      // reels, turning while the film advances
      [x + 6 * u, x + w - 6 * u].forEach(function (rx) {
        var a = g.view.ls ? 0 : g.t * (1 + 2 * g.util);
        circle(rx, y + h / 2, 4.5 * u, colors.dim);
        ctx.beginPath(); ctx.moveTo(rx, y + h / 2); ctx.lineTo(rx + Math.cos(a) * 4.5 * u, y + h / 2 + Math.sin(a) * 4.5 * u); ctx.stroke();
      });
      // the frame: lit when a scanner is at it; a new picture every few seconds
      var fx = x + 13 * u, fw = w - 26 * u, fy = y + 3 * u, fh = h - 6 * u;
      var lit = led('s' + r, g.util + 0.15, g.refresh);
      ctx.fillStyle = colors.warn; ctx.globalAlpha = lit ? 0.25 : 0.08; ctx.fillRect(fx, fy, fw, fh); ctx.globalAlpha = 1;
      ctx.strokeStyle = colors.faint; ctx.strokeRect(Math.round(fx) + 0.5, Math.round(fy) + 0.5, Math.round(fw), Math.round(fh));
      var seed = Math.floor(g.t / 3 + r * 7.3);
      ctx.save(); ctx.beginPath(); ctx.rect(fx, fy, fw, fh); ctx.clip();
      ctx.strokeStyle = lit ? colors.fg : colors.dim; ctx.globalAlpha = lit ? 0.8 : 0.4;
      var vx = fx + fw * (0.3 + 0.4 * rnd(seed)), vy = fy + fh * (0.3 + 0.4 * rnd(seed + 1));
      for (var k = 0; k < 4; k++) {                     // tracks from a vertex: arcs, one spiralling electron
        var a0 = rnd(seed + k * 3) * 6.2832, cr = (6 + 30 * rnd(seed + k * 5)) * u, sg = rnd(seed + k * 9) < 0.5 ? -1 : 1;
        var ccx = vx + Math.cos(a0 + sg * 1.5708) * cr, ccy = vy + Math.sin(a0 + sg * 1.5708) * cr;
        var st = Math.atan2(vy - ccy, vx - ccx);
        ctx.beginPath(); ctx.arc(ccx, ccy, cr, st, st + sg * (k ? 1.2 : 5), sg < 0); ctx.stroke();
      }
      ctx.restore();
      ins.push([cx, y + h / 2]);
      desk.push([x - 4 * u, y + h], [x + w + 4 * u, y + h]);
    }
    return { ins: ins, out: [cx + 40 * u, cy + 40 * u], desk: desk, aisle: desk };
  }

  // 1965: the CDC 6600, a plus-shaped mainframe, its console and tape drives
  function mainframe(g) {
    var u = g.u, cx = g.cx, cy = g.cy - 14 * u, a = 26 * u, b = 10 * u;
    ctx.beginPath();                                   // the plus, seen from above
    ctx.moveTo(cx - b, cy - a); ctx.lineTo(cx + b, cy - a); ctx.lineTo(cx + b, cy - b); ctx.lineTo(cx + a, cy - b);
    ctx.lineTo(cx + a, cy + b); ctx.lineTo(cx + b, cy + b); ctx.lineTo(cx + b, cy + a); ctx.lineTo(cx - b, cy + a);
    ctx.lineTo(cx - b, cy + b); ctx.lineTo(cx - a, cy + b); ctx.lineTo(cx - a, cy - b); ctx.lineTo(cx - b, cy - b); ctx.closePath();
    ctx.fillStyle = colors.rule; ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = g.edge; ctx.stroke();
    // each bay: rows of logic-module LEDs
    [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(function (d, bay) {
      var bx = cx + d[0] * (a + b) / 2, by = cy + d[1] * (a + b) / 2;
      for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
        ctx.fillStyle = led('m' + bay + i + j, g.util, g.refresh) ? g.on : colors.faint;
        ctx.fillRect(bx + (i - 1) * 5 * u - 1, by + (j - 1) * 5 * u - 1, 2.5, 2.5);
      }
    });
    label('6600', cx, cy + 3, colors.dim, 'center', 8);
    // the console: two round CRTs
    var kx = cx - 46 * u, ky = cy + 30 * u;
    box(kx - 13 * u, ky - 7 * u, 26 * u, 14 * u, colors.rule, 0.3, colors.dim);
    [-1, 1].forEach(function (s) {
      var sx = kx + s * 6 * u;
      circle(sx, ky, 4.5 * u, colors.dim);
      if (!g.view.ls) {
        ctx.fillStyle = colors.ok; ctx.globalAlpha = 0.8;
        for (var l = 0; l < 3; l++) ctx.fillRect(sx - 3 * u, ky - 2.5 * u + l * 2.2 * u, (2 + 4 * rnd(Math.floor(g.t * 2) + l + s)) * u, 1);
        ctx.globalAlpha = 1;
      }
    });
    // tape drives, spinning while data arrive
    var tapes = [];
    for (var k = 0; k < 3; k++) {
      var x = cx - 6 * u + k * 22 * u, y = cy + 44 * u, rr = 4.5 * u, a0 = g.view.ls ? 0 : g.t * 3 * (1 + g.util) * (k % 2 ? -1 : 1);
      box(x - 10 * u, y - 7 * u, 20 * u, 14 * u, null, 0, colors.faint);
      [-1, 1].forEach(function (sgn) {
        var tx = x + sgn * 5 * u;
        circle(tx, y, rr, colors.dim);
        ctx.beginPath(); ctx.moveTo(tx, y); ctx.lineTo(tx + Math.cos(a0) * rr, y + Math.sin(a0) * rr); ctx.stroke();
      });
      tapes.push([x, y]);
    }
    return { ins: [[cx - a, cy], [cx, cy - a], [cx, cy]], out: tapes[Math.floor(g.t) % 3],
      desk: [[kx - 7 * u, ky + 14 * u], [kx + 7 * u, ky + 14 * u]],
      aisle: tapes.map(function (q) { return [q[0], q[1] + 13 * u]; }).concat([[cx - a - 6 * u, cy + b + 6 * u], [cx + a + 6 * u, cy + b + 6 * u]]) };
  }

  // 1980: VAX cabinets, RA disk drives, a row of VT100s
  function vax(g) {
    var u = g.u, cx = g.cx, cy = g.cy, ins = [];
    for (var r = 0; r < 2; r++) for (var c = 0; c < 4; c++) {
      var w = 15 * u, h = 26 * u, x = cx - 36 * u + c * 19 * u, y = cy - 40 * u + r * 30 * u;
      box(x, y, w, h, colors.rule, 0.35, g.edge);
      ctx.fillStyle = colors.dim; ctx.fillRect(x + 2, y + 3 * u, w - 4, 2.5 * u);   // name badge
      for (var j = 0; j < 4; j++) {                      // console switch-row LEDs
        ctx.fillStyle = led('v' + r + c + j, g.util, g.refresh) ? g.on : colors.faint;
        ctx.fillRect(x + 3 + j * (w - 6) / 4, y + 8 * u, 2, 2);
      }
      ctx.strokeStyle = colors.faint;                    // vent slots
      for (var v = 0; v < 3; v++) { ctx.beginPath(); ctx.moveTo(x + 3, y + h - (4 + v * 3) * u); ctx.lineTo(x + w - 3, y + h - (4 + v * 3) * u); ctx.stroke(); }
      ins.push([x + w / 2, y + h / 2]);
    }
    // disk drives: platters seen from above, with a seeking arm
    var disks = [];
    for (var d = 0; d < 3; d++) {
      var dx = cx + 50 * u, dy = cy - 30 * u + d * 18 * u, pr = 6 * u;
      box(dx - 8 * u, dy - 8 * u, 16 * u, 16 * u, colors.rule, 0.3, colors.dim);
      circle(dx, dy, pr, colors.faint); circle(dx, dy, 1.5, null, colors.dim);
      var seek = g.view.ls ? 0 : Math.sin(g.t * (4 + d) * (0.5 + g.util)) * 0.5;
      ctx.strokeStyle = colors.fg; ctx.beginPath(); ctx.moveTo(dx + 7 * u, dy + 7 * u);
      ctx.lineTo(dx + Math.cos(-0.8 + seek) * pr * 0.6, dy + Math.sin(-0.8 + seek) * pr * 0.6 + 2 * u); ctx.stroke();
      disks.push([dx, dy]);
    }
    // terminals, text scrolling
    for (var tm = 0; tm < 4; tm++) {
      var tx = cx - 36 * u + tm * 19 * u, ty = cy + 26 * u, tw = 14 * u, th = 11 * u;
      box(tx, ty, tw, th, null, 0, colors.dim);
      if (!g.view.ls) {
        ctx.fillStyle = colors.ok; ctx.globalAlpha = 0.75;
        for (var l = 0; l < 3; l++) ctx.fillRect(tx + 2, ty + 2 + l * 3 * u, (3 + 8 * rnd(Math.floor(g.t * 3) * 7 + tm * 3 + l)) * u, 1);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = colors.faint; ctx.fillRect(tx + 2, ty + th + 2, tw - 4, 2.5 * u);   // keyboard
    }
    var desk = [], aisle = [];
    for (var q = 0; q < 4; q++) { desk.push([cx - 29 * u + q * 19 * u, cy + 50 * u]); aisle.push([cx - 29 * u + q * 19 * u, cy + 20 * u]); }
    return { ins: ins, out: disks[Math.floor(g.t * 2) % 3], desk: desk, aisle: aisle.concat(disks.map(function (d) { return [d[0] - 12 * u, d[1] + 8 * u]; })) };
  }

  // a rack of 1U servers, one LED each, a top-of-rack switch; GPU nodes in amber
  function rack(g, key, x, y, w, h, n, gpu) {
    box(x, y, w, h, colors.rule, 0.35, g.edge);
    ctx.fillStyle = colors.b1; ctx.globalAlpha = 0.7; ctx.fillRect(x + 1, y + 1, w - 2, Math.max(1.5, h * 0.06)); ctx.globalAlpha = 1;   // switch
    var sh = (h - h * 0.1 - 2) / n;
    for (var j = 0; j < n; j++) {
      var sy = y + h * 0.1 + j * sh;
      ctx.fillStyle = colors.faint; ctx.globalAlpha = 0.6; ctx.fillRect(x + 2, sy + sh - 1, w - 4, 0.6); ctx.globalAlpha = 1;
      ctx.fillStyle = led(key + ':' + j, g.util, g.refresh) ? (g.sat ? colors.b2 : gpu ? colors.warn : colors.ok) : colors.faint;
      ctx.fillRect(x + w - 4, sy + sh / 2 - 1, 2, 1.5);
    }
  }
  // a tape library: cartridge slots and a picker that runs up and down
  function robot(g, x, y, w, h) {
    box(x, y, w, h, colors.rule, 0.3, colors.dim);
    ctx.fillStyle = colors.faint;
    var rows = Math.max(4, Math.floor(h / 4));
    for (var r = 0; r < rows; r++) { ctx.fillRect(x + 2, y + 2 + r * (h - 4) / rows, w * 0.3, 1.5); ctx.fillRect(x + w * 0.7 - 2, y + 2 + r * (h - 4) / rows, w * 0.3, 1.5); }
    var py = y + 3 + (h - 8) * (0.5 + 0.5 * Math.sin(g.view.ls ? 0 : g.t * 1.7));
    ctx.fillStyle = colors.warn; ctx.fillRect(x + w * 0.35, py, w * 0.3, 3);
    return [x + w / 2, py];
  }

  // a control-room desk with a row of screens; returns where the shift crew sits
  function controlDesk(g, x, y, n) {
    var u = g.u, w = n * 10 * u, out = [];
    box(x, y, w, 4 * u, colors.rule, 0.45, colors.dim);
    for (var i = 0; i < n; i++) {
      var sx = x + 2 * u + i * 10 * u;
      box(sx, y - 6 * u, 7 * u, 5 * u, null, 0, colors.dim);
      if (!g.view.ls) { ctx.fillStyle = colors.ok; ctx.globalAlpha = 0.7; ctx.fillRect(sx + 1.5, y - 4.5 * u, (2 + 3 * rnd(Math.floor(g.t * 2) + i)) * u, 1); ctx.globalAlpha = 1; }
      out.push([sx + 3.5 * u, y + 11 * u]);
    }
    return out;
  }

  // 1997: rows of PC farm racks and the tape robot
  function farms(g) {
    var u = g.u, cx = g.cx - 8 * u, cy = g.cy, ins = [];
    var aisle = [];
    for (var r = 0; r < 3; r++) for (var c = 0; c < 6; c++) {
      var w = 10 * u, h = 22 * u, x = cx - 40 * u + c * 12.5 * u, y = cy - 50 * u + r * 28 * u;
      rack(g, 'f' + r + c, x, y, w, h, 7, false);
      ins.push([x + w / 2, y + h / 2]);
      aisle.push([x + w / 2, y + h + 5 * u]);
    }
    var out = robot(g, g.cx + 42 * u, g.cy - 30 * u, 14 * u, 60 * u);
    label('TAPE', g.cx + 49 * u, g.cy + 38 * u, colors.faint, 'center', 8);
    return { ins: ins, out: out, desk: controlDesk(g, cx - 16 * u, cy + 38 * u, 3), aisle: aisle };
  }

  // 2002: the Tier-0 in the middle, exporting to the Tier-1s around the rim
  function grid(g) {
    var u = g.u, cx = g.cx, cy = g.cy, R = g.R, ins = [];
    TIER1.forEach(function (n, i) {
      var a = -Math.PI / 2 + (i + 0.5) * 2 * Math.PI / TIER1.length, x = cx + Math.cos(a) * R * 0.74, y = cy + Math.sin(a) * R * 0.74;
      ctx.strokeStyle = colors.rule; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.42, cy + Math.sin(a) * R * 0.42); ctx.lineTo(x, y); ctx.stroke();
      if (!g.view.ls) {                                    // export to the Tier-1s
        for (var q = 0; q < 2; q++) {
          var ph = (g.t * (0.3 + 0.3 * g.util) + i * 0.37 + q * 0.5) % 1, r = R * (0.42 + 0.32 * ph);
          ctx.fillStyle = colors.b1; ctx.globalAlpha = 0.9;
          ctx.fillRect(cx + Math.cos(a) * r - 1.5, cy + Math.sin(a) * r - 1.5, 3, 3); ctx.globalAlpha = 1;
        }
      }
      // each Tier-1: a tiny rack with a load LED
      box(x - 2.5, y - 3, 5, 6, colors.rule, 0.5, colors.dim);
      ctx.fillStyle = led('t1' + i, g.util, g.refresh) ? colors.ok : colors.faint; ctx.fillRect(x - 1, y - 1, 2, 2);
      var lx = cx + Math.cos(a) * R * 0.93, ly = cy + Math.sin(a) * R * 0.93 + 3;
      label(n, lx, ly, colors.faint, Math.abs(Math.cos(a)) < 0.3 ? 'center' : Math.cos(a) > 0 ? 'right' : 'left', 8);
    });
    ctx.strokeStyle = colors.dim; ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.42, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
    // the Tier-0 floor: CPU racks, GPU racks once ML arrives, and the tape library
    var ml = g.view.tech.ml, cols = 5;
    var aisle = [];
    for (var r = 0; r < 2; r++) for (var c = 0; c < cols; c++) {
      var w = 5 * u, h = 12 * u, x = cx - 20 * u + c * 6.5 * u, y = cy - 22 * u + r * 15 * u;
      rack(g, 'g' + r + c, x, y, w, h, 4, ml && r === 1 && c >= 3);
      ins.push([x + w / 2, y + h / 2]);
      if (r) aisle.push([x + w / 2, y + h + 5 * u]);
    }
    var out = robot(g, cx + 14 * u, cy - 22 * u, 6 * u, 27 * u);
    label(ml ? 'Tier-0 · GPU' : 'Tier-0', cx, cy - 25 * u, colors.dim, 'center', 8);
    return { ins: ins, out: out, desk: controlDesk(g, cx - 10 * u, cy + 13 * u, 2), aisle: aisle };
  }

  var DRAW = { counting: counting, scanning: scanning, mainframe: mainframe, vax: vax, farms: farms, grid: grid };

  // the pipe from the farm to the storage: one lane per trigger stream, as wide as its share of what is written
  var STREAM_COLS = ['b1', 'ok', 'warn', 'dim'];
  function pipe(x, y, w, h, t) {
    var list = (view.streams && view.streams.length ? view.streams : [{ sym: 'data', share: 1 }]), lanes = [], at = x + 2;
    var full = view.store && view.store.full;
    list.forEach(function (s, i) {
      var lw = Math.max(0, (w - 4) * s.share), col = list.length > 1 ? colors[STREAM_COLS[i % 4]] : colors.ok;
      if (lw > 0.5) {
        ctx.fillStyle = col; ctx.globalAlpha = full ? 0.15 : 0.3; ctx.fillRect(at, y + 2, Math.max(1, lw - 1), h - 3); ctx.globalAlpha = 1;
      }
      lanes.push({ x: at + lw / 2, col: col, share: s.share, sym: s.sym });
      at += lw;
    });
    // the legend beside the pipe: what flows into the storage, by stream
    var lx = x + w + 8;
    if (list.length > 1) list.forEach(function (s, i) {
      if (lx > W - 30) return;
      ctx.fillStyle = colors[STREAM_COLS[i % 4]]; ctx.fillRect(lx, y + h / 2 - 3, 5, 5);
      label(s.sym + ' ' + Math.round(s.share * 100) + '%', lx + 8, y + h / 2 + 2, colors.faint, 'left', 8);
      ctx.font = '8px ' + colors.mono; lx += 16 + ctx.measureText(s.sym + ' ' + Math.round(s.share * 100) + '%').width;
    });
    label(full ? 'blocked: storage full' : 'written', x - 6, y + h / 2 + 2, full ? colors.b2 : colors.faint, 'right', 8);
    return lanes;
  }
  // the cables: for every column of racks (their x), from the foot of its lowest rack to a spot on the pipe's mouth
  function cablesFor(ins, cx, CH, lanes) {
    var cols = {}, ys = [];
    ins.forEach(function (p) { var k = Math.round(p[0]); if (!cols[k] || p[1] > cols[k][1]) cols[k] = p; ys.push(p[1]); });
    ys = ys.filter(function (y, i) { return ys.indexOf(y) === i; }).sort(function (a, b) { return a - b; });
    var step = 1e9;
    for (var i = 1; i < ys.length; i++) step = Math.min(step, ys[i] - ys[i - 1]);
    var foot = ys.length > 1 ? step * 0.45 : 8;                                  // about half a rack below its centre
    var keys = Object.keys(cols).map(Number).sort(function (a, b) { return a - b; });
    var x0 = lanes.length ? lanes[0].x - 4 : cx - 10, x1 = lanes.length ? lanes[lanes.length - 1].x + 4 : cx + 10;
    var list = keys.map(function (k, j) {
      var p = cols[k], y0 = Math.min(CH - 8, p[1] + foot), xe = keys.length > 1 ? x0 + (x1 - x0) * j / (keys.length - 1) : cx;
      var drop = CH - y0;
      return { x: k, p0: [p[0], y0], p1: [p[0], y0 + drop * 0.55], p2: [xe, CH - drop * 0.55], p3: [xe, CH] };
    });
    var by = {};
    list.forEach(function (c) { by[c.x] = c; });
    return { list: list, of: function (x) { return by[Math.round(x)] || list[0]; } };
  }
  function bez(c, f) {
    var m = 1 - f;
    return [m * m * m * c.p0[0] + 3 * m * m * f * c.p1[0] + 3 * m * f * f * c.p2[0] + f * f * f * c.p3[0],
            m * m * m * c.p0[1] + 3 * m * m * f * c.p1[1] + 3 * m * f * f * c.p2[1] + f * f * f * c.p3[1]];
  }
  function pickLane(lanes) {
    var r = Math.random(), a = 0;
    for (var i = 0; i < lanes.length; i++) { a += lanes[i].share; if (r <= a) return i; }
    return lanes.length - 1;
  }

  function frame(ts) {
    var dt = Math.min(0.1, (ts - last) / 1000 || 0); last = ts;
    if (!view || W === 0 || cv.offsetParent === null) { requestAnimationFrame(frame); return; }
    // the machines on top (room for the name tag above them), the pipe, the storage hall below
    var CH = Math.round(Math.min(W + 22, H * 0.52)), PH = 30, SY = CH + PH;
    var cx = W / 2, cy = (CH + 22) / 2, R = Math.min(W, CH - 22) / 2 - 2, t = ts / 1000, u = R / 100;
    geo = { split: CH, inY: cy, outY: SY + (H - SY) / 2, outYs: [0.3, 0.5, 0.7].map(function (f) { return SY + (H - SY) * f; }) };
    var lv = level();
    var util = view.ls ? 0.08 : Math.min(1, view.util), sat = !view.ls && view.util > 1;
    var refresh = ts - ledT > 160; if (refresh) ledT = ts;
    if (!view.ls) scaler += dt * view.rate;
    ctx.clearRect(0, 0, W, H);
    if (lv === 'vax' || lv === 'farms' || lv === 'grid') floor(u);

    // the walls of the computing hall and the storage hall, the pipe between them
    var pw = Math.round(Math.min(90, W * 0.3)), px0 = cx - pw / 2;
    ctx.strokeStyle = colors.dim; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, CH + 0.5); ctx.lineTo(px0, CH + 0.5); ctx.moveTo(px0 + pw, CH + 0.5); ctx.lineTo(W, CH + 0.5);
    ctx.moveTo(0, SY + 0.5); ctx.lineTo(px0, SY + 0.5); ctx.moveTo(px0 + pw, SY + 0.5); ctx.lineTo(W, SY + 0.5); ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = colors.rule; ctx.globalAlpha = 0.25; ctx.fillRect(0, CH + 1.5, W, PH - 2); ctx.globalAlpha = 1;
    var lanes = pipe(px0, CH, pw, PH, t);
    var sto = view.store ? storage({ t: t, dt: dt, view: view }, 0, SY + 2, W, H - SY - 2) : null;

    // the trunk from the DAQ, entering on the left
    var door = [0, cy];
    ctx.strokeStyle = sat ? colors.b2 : colors.dim; ctx.lineWidth = 2; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(door[0], door[1]); ctx.lineTo(cx - R * 0.72, door[1]); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;

    var g = { cx: cx, cy: cy, R: R, u: R / 72, t: t, util: util, sat: sat, refresh: refresh, view: view,
      edge: sat ? colors.b2 : colors.dim, on: sat ? colors.b2 : colors.ok };
    var io = DRAW[lv](g);

    // the link from the clusters to the storage: one cable from the foot of each column of racks, curving down
    // and gathering into the pipe like a bundle of fibres; drawn under the floor (behind what is already drawn)
    var cables = cablesFor(io.ins, cx, CH, lanes);
    ctx.save(); ctx.globalCompositeOperation = 'destination-over';
    ctx.strokeStyle = view.store && view.store.full ? colors.b2 : colors.b1; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    cables.list.forEach(function (c) {
      ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.moveTo(c.p0[0], c.p0[1]);
      ctx.bezierCurveTo(c.p1[0], c.p1[1], c.p2[0], c.p2[1], c.p3[0], c.p3[1]); ctx.stroke();
    });
    ctx.restore();

    // staff: the shift crew at the consoles, computing engineers walking the racks (hurrying when it saturates)
    var st = view.staff || {}, ps = Math.max(1, R / 85);
    shifters.step(ctx, dt, t, io.desk, PC.People.shown(st.shifter, 4), { scale: ps, color: colors.fg, speed: 10 * ps, pause: [3, 8] });
    engineers.step(ctx, dt, t, sto ? io.aisle.concat(sto.aisle) : io.aisle, PC.People.shown(st.compeng, 5), { scale: ps, color: colors.fg, speed: (sat ? 28 : 14) * ps, spark: colors.ok });

    // incoming events from the detector
    if (!view.ls && view.rate > 0) {
      spawnAcc += dt * Math.min(14, 1.5 + 2.2 * Math.log10(1 + view.rate));
      while (spawnAcc >= 1) {
        spawnAcc -= 1;
        var tg = io.ins[Math.floor(Math.random() * io.ins.length)];
        packets.push({ x: door[0], y: door[1] + (Math.random() - 0.5) * R * 0.2, tx: tg[0], ty: tg[1], p: 0 });
      }
    }
    packets.forEach(function (k) {
      k.p += dt * 1.6;
      if (k.p >= 1 && !sat && Math.random() < 0.5 && !(view.store && view.store.full)) outgoing.push({ x: k.tx, y: k.ty, d: 0, lane: pickLane(lanes) });   // processed: on to storage
    });
    packets = packets.filter(function (k) { return k.p < 1; });
    outgoing.forEach(function (k) { k.d += dt * Math.max(140, H * 0.45); });
    ctx.fillStyle = sat ? colors.b2 : colors.b1;
    packets.forEach(function (k) {
      var x = k.x + (k.tx - k.x) * k.p, y = k.y + (k.ty - k.y) * k.p * k.p;
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    });
    ctx.fillStyle = colors.ok; ctx.globalAlpha = 0.8;
    var dest = sto ? sto.at : io.out;
    // along the cables: out of the rack, along its column's cable to the pipe, its stream's lane, the slot being written
    outgoing = outgoing.filter(function (k) {
      var ln = lanes[k.lane] || { x: cx, col: colors.ok }, c = cables.of(k.x);
      if (!c) return false;
      var pts = [[k.x, k.y], c.p0];
      for (var q = 1; q <= 10; q++) pts.push(bez(c, q / 10));
      pts.push([ln.x, CH + 3], [ln.x, SY], dest);
      var inPipe = pts.length - 2;
      for (var i = 1, d = k.d; i < pts.length; i++) {
        var a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (d <= L) {
          var f = L ? d / L : 1;
          ctx.fillStyle = i >= inPipe - 1 && i <= inPipe ? ln.col : colors.ok;
          ctx.fillRect(a[0] + (b[0] - a[0]) * f - 1.5, a[1] + (b[1] - a[1]) * f - 1.5, 3, 3);
          return true;
        }
        d -= L;
      }
      return false;
    }).slice(-60);
    ctx.globalAlpha = 1;

    // backlog: events piling up at the door when computing can't keep up
    if (sat) {
      var nq = Math.min(18, Math.round((view.util - 1) * 8) + 3);
      ctx.fillStyle = colors.b2;
      for (var q = 0; q < nq; q++) ctx.fillRect(door[0] + 4 + (q % 3) * 4, door[1] - 14 - Math.floor(q / 3) * 4 + (q % 2), 3, 3);
      if (lv !== 'grid') label('backlog', door[0] + 4, door[1] + 14, colors.b2, 'left', 8);   // on the Grid, CNAF sits there
    }

    // readout along the bottom of the lens
    if (view.ls) label('no beam · reprocessing', cx, cy + R * 0.8, colors.faint, 'center', 9);
    else if (lv !== 'grid') label(PC.fmt(view.rate) + ' ev/s · load ' + Math.round(Math.min(9.99, view.util) * 100) + '%',
      cx, cy + R * 0.86, sat ? colors.b2 : colors.faint, 'center', 8);
    requestAnimationFrame(frame);
  }

  return {
    init: function (canvas, storeCb) {
      cv = canvas; ctx = cv.getContext('2d'); onStore = storeCb;
      function inStore(e) { var r = cv.getBoundingClientRect(); return geo.split && e.clientY - r.top > geo.split; }
      cv.addEventListener('click', function (e) { if (onStore && inStore(e)) onStore(); });
      cv.addEventListener('mousemove', function (e) { cv.style.cursor = inStore(e) ? 'pointer' : ''; });
      readColors(); resize();
      window.addEventListener('resize', resize);
      requestAnimationFrame(frame);
    },
    resize: resize,
    readColors: readColors,
    // v: { tech: {id: true}, rate: recorded events/s, util: recorded / capacity, ls, staff: {id: count},
    //      store: { used, cap, full, level (newest storage tech or 'none'), start (day-one capacity), write (data/s written) },
    //      streams: [{ sym, share of what is written }] }
    set: function (v) { view = v; },
    storeName: storeName,
    ports: function () { return geo; },
    robot: function () { return { x: robo.x, wait: robo.wait > 0, grab: robo.grab }; },   // the library picker (debug, tests)     // where the readout comes in and the data leave for the analysis room (canvas px)
    name: function () {
      if (!view) return '';
      return { grid: 'WLCG Tier-0 + 13 Tier-1 centres', farms: 'Linux PC farm', vax: 'VAX cluster', mainframe: 'CDC 6600 mainframe',
        scanning: 'Scanning tables', counting: 'Counting room: scalers' }[level()];
    }
  };
})();
