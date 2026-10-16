/* A reasonably attentive greedy player, shared by calibration and balance runs.
 *  - publishes greedily (best reputation per data)
 *  - buys the cheapest available facility/technology
 *  - hires the cheapest staff when it costs < 12% of the next goal
 *  - starts a Long Shutdown when upgrades are pending and nothing is affordable
 *  - clicks 4×/s during the first 10 minutes only
 * hooks.onAvailable(item, kind) is called once per item when it first becomes available.
 */
PC.Bot = function (s, hooks) {
  var E = PC.Engine;
  hooks = hooks || {};
  var seen = {};

  function candidates() {
    var c = [];
    PC.FACILITIES.forEach(function (f) { if (E.facStatus(s.st, f) === 'available') c.push({ k: 'f', it: f }); });
    PC.TECH.forEach(function (t) { if (E.techStatus(s.st, t) === 'available') c.push({ k: 't', it: t }); });
    c.forEach(function (x) {
      if (!seen[x.it.id]) { seen[x.it.id] = true; if (hooks.onAvailable) hooks.onAvailable(x.it, x.k); }
    });
    c.sort(function (a, b) { return a.it.cost - b.it.cost; });
    return c;
  }

  function decide() {
    var st = s.st;
    // storage first: before tape it buys by hand when 80% full; with tape the engine does it
    if (!E.caps(st).autostore && st.store.used > 0.8 * st.store.cap) E.buyStorage(st, Math.min(E.storeChunk(st, null, PC.BAL.storeChunk), st.funds / E.storePrice(st)));
    for (var k = 0; k < 50; k++) {
      var list = E.measurements(st), best = null;
      list.forEach(function (x) { if (x.cost <= st.data && (!best || x.repGain / x.cost > best.repGain / best.cost)) best = x; });
      if (!best) break;
      E.publish(st, best.id, list);
    }
    for (var j = 0; j < 20; j++) {
      var next = candidates()[0];
      if (next && next.it.cost <= st.funds) {
        if (next.k === 'f') E.buyFacility(st, next.it.id); else E.buyTech(st, next.it.id);
        if (hooks.onBuy) hooks.onBuy(next.it, next.k);
        continue;
      }
      var staff = PC.STAFF.filter(function (x) { return E.staffStatus(st, x) === 'available'; })
        .map(function (x) { return { x: x, c: E.staffCost(st, x) }; })
        .sort(function (a, b) { return a.c - b.c; })[0];
      var goal = next ? next.it.cost : Infinity;
      if (staff && staff.c <= st.funds && staff.c < 0.12 * goal) { E.hire(st, staff.x.id); continue; }
      break;
    }
    if (!st.ls && E.pendingTech(st).length) {
      var c2 = candidates();
      if (!c2.length || c2[0].it.cost > st.funds) {
        E.startShutdown(st);
        if (hooks.onShutdown) hooks.onShutdown(st.ls);
      }
    }
  }

  return {
    decide: decide,
    step: function () {
      var st = s.st;
      if (hooks.beforeTick) hooks.beforeTick();
      if (st.t < 600) for (var c = 0; c < 4; c++) E.click(st);
      var ev = E.tick(st, 1);
      if (Math.floor(st.t) % 5 === 0) decide();
      return ev;
    }
  };
};
