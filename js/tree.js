/* Tech tree: lanes are subsystems, columns follow the dependency order
 * (a node sits one column right of its latest prerequisite), edges show requirements. */
var PC = PC || {};

PC.Text = (function () {
  var CAP = {
    scint: 'scintillation counters', coinc: 'coincidence trigger', bfield: 'magnetic spectrometer', tracking: 'tracking chambers',
    mwpc: 'MWPC tracking', drift: 'drift-chamber tracking', central: 'central tracker around the beam', silicon: 'silicon vertexing',
    pixel: 'pixel vertexing', timing: '4D timing', calo: 'calorimetry', hermetic: 'hermetic calorimetry', crystal: 'crystal ECAL',
    hcal: 'hadron calorimeter', hgcal: 'high-granularity calorimetry', colliderMagnet: 'magnet around the collision point',
    solenoid: 'superconducting solenoid', muonID: 'muon identification', muonCh: 'muon chambers', cmsMuon: 'full muon system',
    gem: 'GEM chambers', nim: 'fast electronics', multilevel: 'multi-level trigger', hlt: 'software trigger', l1track: 'L1 track trigger',
    grid: 'computing grid', ml: 'machine learning'
  };
  function capName(c) { return CAP[c] || c; }
  function fxText(t) {
    var fx = t.fx || {}, out = [];
    if (fx.quality) out.push('event quality ×' + fx.quality);
    if (fx.trigger) out.push('trigger ×' + fx.trigger);
    if (fx.compute) out.push('computing ×' + fx.compute);
    if (fx.analysis) out.push('analysis ×' + fx.analysis);
    if (fx.funding) out.push('funding ×' + fx.funding);
    if (fx.rep) out.push('reputation ×' + fx.rep);
    if (fx.lumi) out.push('luminosity ×' + PC.fmt(fx.lumi.mult) + (fx.lumi.fac ? ' (' + fx.lumi.fac.map(function (f) { return PC.FAC[f].name.replace(/ \(.*\)/, ''); }).join(', ') + ')' : fx.lumi.beams ? (fx.lumi.beams[0] === 'p-fixed' ? ' (fixed target)' : ' (colliders)') : ''));
    if (fx.energy) out.push('√s → ' + PC.energy(fx.energy.E));
    if (fx.B) out.push('B = ' + fx.B + ' T');
    if (fx.res) out.push('mass resolution ' + (fx.res * 100).toFixed(1) + '%');
    if (fx.pileup) out.push('pile-up: quality ×' + fx.pileup + ' until 4D timing');
    if (fx.autoPublish) out.push('auto-publish');
    if (fx.reviewQ) out.push('fewer paper revisions and rejections');
    if (fx.reviewSpeed) out.push('paper reviews ×' + fx.reviewSpeed + ' faster');
    (t.caps || []).forEach(function (c) { out.push('enables ' + capName(c)); });
    return out;
  }
  return { capName: capName, fxText: fxText };
})();

PC.Tree = (function () {
  var E = PC.Engine, esc = PC.esc;
  var wrap, laneCol, detail, hooks, state, selected = null, key = '', nodes = [], byId = {}, laid = false;
  var COLW = 192, NW = 176, NH = 36, GAP = 6, PAD = 8, HEAD = 22, hide = false;

  function items() {
    if (nodes.length) return nodes;
    PC.FACILITIES.forEach(function (f) { if (f.id !== 'cosmic') nodes.push({ id: f.id, kind: 'fac', it: f, lane: 'machine' }); });
    PC.TECH.forEach(function (t) { nodes.push({ id: t.id, kind: 'tech', it: t, lane: t.lane }); });
    nodes.forEach(function (n) { byId[n.id] = n; });
    // column = longest prerequisite chain
    function depth(n) {
      if (n.col !== undefined) return n.col;
      n.col = 0;
      (n.it.requires || []).forEach(function (r) { if (byId[r]) n.col = Math.max(n.col, depth(byId[r]) + 1); });
      return n.col;
    }
    nodes.forEach(depth);
    return nodes;
  }
  function status(n) { return n.kind === 'fac' ? E.facStatus(state, n.it) : E.techStatus(state, n.it); }

  // columns where everything is owned can be folded away; the rest close up
  function layout(st) {
    var lanes = {}, y = HEAD, maxCol = 0, done = {}, pos = {}, k = 0, ncol = 0;
    nodes.forEach(function (n) { ncol = Math.max(ncol, n.col + 1); if (done[n.col] === undefined) done[n.col] = true; if (st[n.id] !== 'owned') done[n.col] = false; });
    for (var c0 = 0; c0 < ncol; c0++) pos[c0] = hide && done[c0] ? -1 : k++;
    nodes.forEach(function (n) { n.vis = pos[n.col] >= 0; n.vcol = pos[n.col]; });
    PC.LANES.forEach(function (l) { lanes[l.id] = { cells: {}, h: 0 }; });
    nodes.forEach(function (n) {
      if (!n.vis) return;
      var c = lanes[n.lane].cells[n.vcol] || (lanes[n.lane].cells[n.vcol] = []);
      c.push(n); maxCol = Math.max(maxCol, n.vcol);
    });
    PC.LANES.forEach(function (l) {
      var L = lanes[l.id], rows = 1;
      Object.keys(L.cells).forEach(function (c) {
        L.cells[c].sort(function (a, b) { return a.it.year - b.it.year; });
        rows = Math.max(rows, L.cells[c].length);
        L.cells[c].forEach(function (n, i) { n.x = PAD + n.vcol * COLW; n.row = i; });
      });
      L.y = y; L.h = rows * (NH + GAP) + PAD * 2 - GAP;
      Object.keys(L.cells).forEach(function (c) { L.cells[c].forEach(function (n) { n.y = L.y + PAD + n.row * (NH + GAP); }); });
      y += L.h;
    });
    return { lanes: lanes, w: PAD * 2 + (maxCol + 1) * COLW, h: y, cols: maxCol + 1, hidden: ncol - k };
  }

  function render() {
    items();
    var st = {};
    nodes.forEach(function (n) { st[n.id] = status(n); });
    var L = layout(st);
    // column headers: year span of each column
    var span = [];
    nodes.forEach(function (n) {
      if (!n.vis) return;
      var s = span[n.vcol] || (span[n.vcol] = [9999, 0]);
      s[0] = Math.min(s[0], n.it.year); s[1] = Math.max(s[1], n.it.year);
    });
    var h = '<div class="tree" style="width:' + L.w + 'px;height:' + L.h + 'px">';
    span.forEach(function (s, c) { h += '<span class="tcol" style="left:' + (PAD + c * COLW) + 'px">' + (s[0] === s[1] ? s[0] : s[0] + '–' + String(s[1]).slice(2)) + '</span>'; });
    var hc = document.getElementById('hideCount');
    if (hc) hc.textContent = L.hidden ? '(' + L.hidden + ' hidden)' : '';
    PC.LANES.forEach(function (l, i) { if (i) h += '<span class="tlane-rule" style="top:' + L.lanes[l.id].y + 'px"></span>'; });
    // edges
    h += '<svg class="tedges" width="' + L.w + '" height="' + L.h + '" aria-hidden="true">';
    nodes.forEach(function (n) {
      if (!n.vis) return;
      (n.it.requires || []).forEach(function (r) {
        var a = byId[r]; if (!a || !a.vis) return;
        var x1 = a.x + NW, y1 = a.y + NH / 2, x2 = n.x, y2 = n.y + NH / 2, mx = (x1 + x2) / 2;
        var cls = st[n.id] === 'owned' ? 'e-owned' : (st[n.id] === 'available' || st[n.id] === 'pending' || st[n.id] === 'building') ? 'e-next' : st[r] === 'owned' ? 'e-ready' : 'e-far';
        if (selected && (n.id === selected || r === selected)) cls += ' e-sel';
        h += '<path class="' + cls + '" d="M' + x1 + ' ' + y1 + ' C' + mx + ' ' + y1 + ' ' + mx + ' ' + y2 + ' ' + x2 + ' ' + y2 + '"/>';
      });
    });
    h += '</svg>';
    nodes.forEach(function (n) {
      if (!n.vis) return;
      var s = st[n.id], cost = costOf(n);
      var tag = s === 'owned' ? (n.kind === 'fac' ? 'running' : 'installed') : s === 'pending' ? 'awaiting LS' : s === 'building' ? 'building' : PC.money(cost);
      h += '<button type="button" class="tnode s-' + s + (selected === n.id ? ' sel' : '') + '" data-node="' + n.id + '" data-cost="' + cost + '" style="left:' + n.x + 'px;top:' + n.y + 'px">' +
        '<i class="led"></i><span class="tn">' + esc(n.it.name) + '</span><span class="tc">' + tag + '</span></button>';
    });
    h += '</div>';
    var sl = wrap.scrollLeft, sy = wrap.scrollTop;
    wrap.innerHTML = h;
    wrap.scrollLeft = sl; wrap.scrollTop = sy;
    laneCol.innerHTML = '<div style="height:' + HEAD + 'px"></div>' + PC.LANES.map(function (l) {
      return '<div class="tlane" style="height:' + L.lanes[l.id].h + 'px"><span>' + l.name + '</span></div>';
    }).join('');
    if (!laid) {
      laid = true;
      var first = nodes.filter(function (n) { return n.vis && st[n.id] === 'available'; }).sort(function (a, b) { return a.x - b.x; })[0];
      if (first) wrap.scrollLeft = Math.max(0, first.x - 80);
    }
    renderDetail(st);
  }

  function renderDetail(st) {
    var n = byId[selected];
    if (!n) {
      detail.innerHTML = '<p class="muted">Select a node to see what it does, what it needs and what it unlocks. ' +
        'Blue nodes can be bought now (double-click one to buy it); dashed ones are further away.</p>';
      return;
    }
    var it = n.it, s = st[n.id];
    var fx = n.kind === 'fac' ? [it.spec] : PC.Text.fxText(it);
    if (n.kind === 'fac' && it.fx && it.fx.lumi) fx.push('luminosity ×' + it.fx.lumi.mult + ' downstream');
    var req = (it.requires || []).map(function (r) { return '<li class="' + (E.has(state, r) ? 'ok' : '') + '">' + esc(E.name(r)) + '</li>'; }).join('');
    var unlocks = nodes.filter(function (m) { return (m.it.requires || []).indexOf(n.id) >= 0; }).map(function (m) { return esc(m.it.name); });
    var caps = it.caps || [];
    var analyses = PC.DISCOVERIES.filter(function (d) {
      return d.needs.some(function (c) { return caps.indexOf(c) >= 0; }) || (n.kind === 'fac' && Object.keys(d.via).some(function (b) { return it.beams.some(function (x) { return x.b === b && x.E >= d.via[b]; }); }));
    }).map(function (d) { return esc(d.name); });
    var act = '';
    if (s === 'available') act = '<button type="button" class="btn" data-buy="' + n.kind + ':' + n.id + '" data-cost="' + costOf(n) + '">' +
      (n.kind === 'fac' ? 'Build' : it.install ? 'Order' : 'Adopt') + ' · ' + PC.money(costOf(n)) + '</button><span class="dt-tip">or double-click the node</span>';
    else act = '<span class="status">' + ({ owned: n.kind === 'fac' ? 'Running' : 'Installed', pending: 'Awaiting Long Shutdown', building: 'Under construction', locked: 'Locked', hidden: 'Locked' }[s]) + '</span>';
    detail.innerHTML =
      '<div class="dt-h"><span class="yr">' + it.year + '</span><h3>' + esc(it.name) + '</h3></div>' +
      '<p class="dt-desc">' + esc(it.desc) + '</p>' +
      '<div class="fx">' + fx.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') +
      (it.install ? '<span class="ls">' + PC.dur(it.install) + ' install (Long Shutdown)</span>' : '') +
      (it.build ? '<span>' + PC.dur(it.build) + ' to build</span>' : '') + (it.nobel ? '<span class="nobel">Nobel ' + esc(it.nobel) + '</span>' : '') + '</div>' +
      (req ? '<h4>Requires</h4><ul class="dt-req">' + req + '</ul>' : '') +
      (unlocks.length ? '<h4>Leads to</h4><p class="dt-list">' + unlocks.join(' · ') + '</p>' : '') +
      (analyses.length ? '<h4>Needed for</h4><p class="dt-list">' + analyses.join(' · ') + '</p>' : '') +
      '<div class="dt-act">' + act + '</div>';
  }

  // the price now: the list price moved by the world economy
  function costOf(n) { return n.kind === 'fac' ? E.facCost(state, n.it) : E.techCost(state, n.it); }
  function structKey() {
    var k = selected + '|' + hide + '|' + PC.Economy.costIndex(state, 'fac').toFixed(2) + PC.Economy.costIndex(state, 'tech').toFixed(2) + '|';
    nodes.forEach(function (n) { k += status(n)[0]; });
    return k;
  }

  return {
    init: function (wrapEl, laneEl, detailEl, h) {
      wrap = wrapEl; laneCol = laneEl; detail = detailEl; hooks = h;
      wrap.addEventListener('click', function (e) {
        var b = e.target.closest('[data-node]'); if (!b) return;
        selected = b.getAttribute('data-node'); key = ''; hooks.changed();
      });
      // double-click a node to build, order or adopt it (the same as its button in the side panel)
      wrap.addEventListener('dblclick', function (e) {
        var b = e.target.closest('[data-node]'), n = b && byId[b.getAttribute('data-node')];
        if (!n || status(n) !== 'available' || state.funds < costOf(n)) return;
        hooks.buy(n.kind, n.id);
      });
      detail.addEventListener('click', function (e) {
        var b = e.target.closest('[data-buy]'); if (!b || b.disabled) return;
        var p = b.getAttribute('data-buy').split(':'); hooks.buy(p[0], p[1]);
      });
      // the lane names follow the tree when it scrolls vertically
      wrap.addEventListener('scroll', function () { laneCol.scrollTop = wrap.scrollTop; });
    },
    update: function (s) {
      state = s; items();
      var k = structKey();
      if (k !== key) { key = k; render(); }
      // affordability, every frame
      var funds = s.funds;
      wrap.querySelectorAll('.tnode.s-available').forEach(function (b) { b.classList.toggle('afford', funds >= +b.getAttribute('data-cost')); });
      detail.querySelectorAll('[data-buy]').forEach(function (b) { b.disabled = funds < +b.getAttribute('data-cost'); });
    },
    select: function (id) {
      if (!byId[id]) return;
      selected = id; key = ''; if (state) this.update(state);
      var n = byId[id];
      if (n.vis === false) { hide = false; var hd = document.getElementById('hideDone'); if (hd) hd.checked = false; key = ''; this.update(state); }
      wrap.scrollTo({ left: Math.max(0, n.x - 120), top: Math.max(0, n.y - 60), behavior: 'smooth' });
    },
    reset: function () { key = ''; laid = false; },
    hideDone: function (v) { hide = !!v; key = ''; laid = false; }
  };
})();
