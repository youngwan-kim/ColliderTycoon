/* A reasonably attentive greedy player, shared by calibration and balance runs.
 *  - publishes greedily (best reputation per data)
 *  - buys the cheapest available facility/technology
 *  - hires the cheapest staff when it costs < 12% of the next goal
 *  - starts a Long Shutdown when upgrades are pending and nothing is affordable
 *  - clicks 4×/s during the first 10 minutes only
 *  - plays politics a little: testifies and lobbies (at most three rounds) when a bill goes the wrong way, holds open
 *    days when its value for money dips, and sends science diplomacy when it is cheap
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
    c.forEach(function (x) { x.cost = x.k === 'f' ? E.facCost(s.st, x.it) : E.techCost(s.st, x.it); });   // the price now
    c.sort(function (a, b) { return a.cost - b.cost; });
    return c;
  }

  // politics, on a modest share of the money: a bill going the wrong way gets testimony and a few rounds of lobbying
  // (never past the point where the press notices); a dip in value for money gets open days; now and then, diplomacy
  function politics() {
    var st = s.st, Pa = PC.Parliament, p = st.parl;
    if (!p) return;
    var c = Pa.costs(st);
    if (p.bill) {
      var want = PC.BILLMAP[p.bill.id].want, f = Pa.projection(st), wrong = want > 0 ? f < 0.56 : f > 0.44;
      if (wrong && Math.abs(f - 0.5) < 0.25) {
        if (!p.bill.testified && c.testify < 0.1 * st.data) Pa.testify(st);
        else if (p.bill.rounds < PC.PARL.lobby.scandalAfter && c.lobby < 0.15 * st.funds) {
          var best = null, bestGain = 0;
          PC.GROUPS.forEach(function (g) {
            var x = Pa.support(st, g.id) * want, gain = (p.seats[g.id] || 0) * Math.exp(-x * x * 4) / (1 + (p.bill.lob[g.id] || 0));   // big groups on the fence
            if (gain > bestGain) { bestGain = gain; best = g.id; }
          });
          if (best) Pa.lobby(st, best, []);
        }
      }
    }
    var a = st.audit;
    if (a && (a.stage !== 'sound' || a.V < 0.95) && c.outreach < 0.1 * st.funds) Pa.outreach(st);
    if (c.diplomacy < 0.05 * st.funds) Pa.diplomacy(st, []);
  }

  function decide() {
    var st = s.st;
    politics();
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
      if (next && next.cost <= st.funds) {
        if (next.k === 'f') E.buyFacility(st, next.it.id); else E.buyTech(st, next.it.id);
        if (hooks.onBuy) hooks.onBuy(next.it, next.k);
        continue;
      }
      var staff = PC.STAFF.filter(function (x) { return E.staffStatus(st, x) === 'available'; })
        .map(function (x) { return { x: x, c: E.staffCost(st, x) }; })
        .sort(function (a, b) { return a.c - b.c; })[0];
      var goal = next ? next.cost : Infinity;
      if (staff && staff.c <= st.funds && staff.c < 0.12 * goal) { E.hire(st, staff.x.id); continue; }
      break;
    }
    if (!st.ls && E.pendingTech(st).length) {
      var c2 = candidates();
      if (!c2.length || c2[0].cost > st.funds) {
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
