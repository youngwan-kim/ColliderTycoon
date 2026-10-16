/* Staff on the drawings: small figures that walk between work spots and stop to work.
 *
 * A crowd keeps its figures between frames; every frame the view hands it the spots
 * where that kind of staff works (racks, consoles, the installation front, a ring
 * under construction) and how many to show. Spots are recomputed each frame, so a
 * resize or a new layout just moves the destinations. Hiring more people adds
 * figures one by one at first, then ever more slowly, so a big team reads as a crowd
 * without filling the view.
 */
var PC = PC || {};

PC.People = (function () {
  // how many figures stand for n hires: 1:1 up to 3, then logarithmic, never more than cap
  function shown(n, cap) {
    if (!(n > 0)) return 0;
    return Math.min(cap, n <= 3 ? n : 3 + Math.floor(1.3 * Math.log2(n / 3)));
  }

  // a figure standing at (x, y) = its feet, s px per unit (about 8 units tall)
  function figure(ctx, x, y, s, col, step, work) {
    ctx.save();
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(1, 0.9 * s); ctx.lineCap = 'round';
    var hip = y - 3.2 * s, neck = y - 6 * s, sw = step ? Math.sin(step) * 1.3 * s : 0.8 * s;
    ctx.beginPath();
    ctx.moveTo(x - sw, y); ctx.lineTo(x, hip); ctx.lineTo(x + sw, y);          // legs
    ctx.moveTo(x, hip); ctx.lineTo(x, neck);                                  // body
    var arm = work ? -1.2 * s : 0.6 * s;                                      // arms forward and up while working
    ctx.moveTo(x - 1.5 * s, neck + 2.2 * s + (work ? arm : 0)); ctx.lineTo(x, neck + 0.4 * s); ctx.lineTo(x + 1.6 * s, neck + 2.2 * s + arm);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(x, neck - 1.3 * s, 1.25 * s, 0, 6.2832); ctx.fill();   // head
    ctx.restore();
  }

  function crowd() {
    var figs = [];
    function posOf(f) { return f.x === undefined ? [0, 0] : [f.x, f.y]; }
    return {
      // spots: [[x, y], …]; o: { scale, color, speed (px/s), spread (px), spark (colour of work sparks), pause: [min, max] s,
      //   spawn: [x, y] (new figures walk in from there, e.g. a door), leave: [x, y] (everyone heads there instead) }
      step: function (ctx, dt, t, spots, n, o) {
        if (!spots || !spots.length) { figs.length = 0; return; }
        while (figs.length < n) {
          var k = Math.floor(Math.random() * spots.length);
          figs.push({ a: k, b: k, p: o.spawn ? 0 : 1, wait: Math.random() * 2, jx: (Math.random() - 0.5) * 2, jy: (Math.random() - 0.5), ph: Math.random() * 6,
            from: o.spawn ? o.spawn.slice() : null });
        }
        figs.length = n;
        var s = o.scale || 1, sp = o.spread == null ? 4 * s : o.spread, pause = o.pause || [1.5, 4.5];
        figs.forEach(function (f) {
          f.a %= spots.length; f.b %= spots.length;
          if (o.leave && !f.out) { f.from = posOf(f); f.p = 0; f.out = true; }          // drop everything and head for the door
          if (!o.leave && f.out) { f.out = false; f.from = null; f.p = 1; }
          var A = f.from || spots[f.a], B = f.out ? o.leave : spots[f.b];
          var d = Math.hypot(B[0] - A[0], B[1] - A[1]);
          if (f.p < 1) f.p = d < 1 ? 1 : Math.min(1, f.p + dt * (o.speed || 18) / d);
          else if (f.out) { /* at the door: wait there */ }
          else if ((f.wait -= dt) <= 0) {
            f.from = null; f.a = f.b; f.b = spots.length > 1 ? (f.a + 1 + Math.floor(Math.random() * (spots.length - 1))) % spots.length : f.a;
            f.p = 0; f.wait = pause[0] + Math.random() * (pause[1] - pause[0]);
          }
          var e = f.p < 1 ? f.p * f.p * (3 - 2 * f.p) : 1, walking = f.p < 1 && d >= 1;
          var x = A[0] + (B[0] - A[0]) * e + f.jx * sp, y = A[1] + (B[1] - A[1]) * e + f.jy * sp * 0.5;
          f.x = x; f.y = y;
          figure(ctx, x, y, s, o.color, walking ? t * 9 + f.ph : 0, !walking);
          if (!walking && o.spark && Math.sin(t * 7 + f.ph * 5) > 0.75) {          // a welder's spark, a soldering iron
            ctx.fillStyle = o.spark; ctx.fillRect(x + 1.8 * s, y - 7 * s + Math.random() * 1.5 * s, 1.5, 1.5);
          }
        });
      },
      size: function () { return figs.length; }
    };
  }

  return { shown: shown, figure: figure, crowd: crowd };
})();
