/* Movable windows over the stage: Upgrades, Analyses (with the papers), Staff, Logbook, Lab, and the two control rooms.
 * Several can be open at once. Drag by the title bar, resize from the corner, click to
 * bring to front, ✕ or Esc to close. Positions, sizes and which are open are remembered.
 * On small screens a window opens as a sheet above the launcher, one at a time.
 */
var PC = PC || {};

PC.Win = (function () {
  var KEY = 'particle-clicker.windows', wins = {}, geo = {}, z = 30, onChange = function () {};
  var DEF = {     // x, y as fractions of the window; w, h in px (clamped to the screen)
    upgrades: { x: 0.03, y: 0.1, w: 1120, h: 560 },
    analyses: { x: 0.42, y: 0.12, w: 760, h: 520 },
    staff: { x: 0.06, y: 0.16, w: 640, h: 520 },
    log: { x: 0.62, y: 0.18, w: 460, h: 480 },
    lab: { x: 0.30, y: 0.22, w: 560, h: 520 },
    ccc: { x: 0.04, y: 0.12, w: 620, h: 600 },      // the control rooms open from their buildings on the map
    dcr: { x: 0.30, y: 0.12, w: 600, h: 600 },
    storage: { x: 0.40, y: 0.16, w: 480, h: 470 },  // opens from the storage hall under the computing centre
    confs: { x: 0.22, y: 0.08, w: 820, h: 600 }      // opens from the conference room
  };

  function small() { return !(PC.Shell && PC.Shell.on()); }
  function store() { try { localStorage.setItem(KEY, JSON.stringify(geo)); } catch (e) { /* private mode */ } }
  function load() { try { geo = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { geo = {}; } }

  // keep at least the title bar on screen
  function place(id) {
    var el = wins[id], g = geo[id], d = DEF[id];
    if (small()) { el.style.cssText = ''; return; }
    var vw = window.innerWidth, vh = window.innerHeight, top = 8;
    var w = Math.min(g.w || d.w, vw - 16), h = Math.min(g.h || d.h, vh - top - 64);
    var x = g.x !== undefined ? g.x : Math.round(d.x * vw), y = g.y !== undefined ? g.y : Math.round(d.y * vh);
    x = Math.max(8 - w + 120, Math.min(vw - 120, x)); y = Math.max(top, Math.min(vh - 100, y));
    el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = w + 'px'; el.style.height = h + 'px';
  }
  function front(id) { wins[id].style.zIndex = ++z; }

  function open(id) {
    if (small()) Object.keys(wins).forEach(function (k) { if (k !== id) wins[k].hidden = true; });
    geo[id] = geo[id] || {}; geo[id].open = true;
    wins[id].hidden = false; place(id); front(id); store(); onChange(id, true);
  }
  function close(id) {
    wins[id].hidden = true; if (geo[id]) geo[id].open = false; store(); onChange(id, false);
  }
  function toggle(id) {
    if (!wins[id].hidden && +wins[id].style.zIndex === z) close(id);
    else if (!wins[id].hidden) front(id);
    else open(id);
  }
  function topOpen() {
    var best = null;
    Object.keys(wins).forEach(function (k) { if (!wins[k].hidden && (!best || +wins[k].style.zIndex > +wins[best].style.zIndex)) best = k; });
    return best;
  }

  function wire(id) {
    var el = wins[id], bar = el.querySelector('.win-h');
    el.addEventListener('pointerdown', function () { if (!small()) front(id); });
    el.querySelector('.win-x').addEventListener('click', function () { close(id); });
    var sx = 0, sy = 0, ox = 0, oy = 0, drag = false;
    bar.addEventListener('pointerdown', function (e) {
      if (small() || e.target.closest('button')) return;
      drag = true; sx = e.clientX; sy = e.clientY; ox = el.offsetLeft; oy = el.offsetTop;
      bar.setPointerCapture(e.pointerId); e.preventDefault();
    });
    bar.addEventListener('pointermove', function (e) {
      if (!drag) return;
      geo[id].x = ox + e.clientX - sx; geo[id].y = oy + e.clientY - sy; place(id);
    });
    bar.addEventListener('pointerup', function () { if (drag) { drag = false; store(); } });
    bar.addEventListener('dblclick', function () { if (small()) return; geo[id] = { open: true }; place(id); store(); });   // back to the default spot
    // remember the size after the corner handle is dragged
    if (window.ResizeObserver) new ResizeObserver(function () {
      if (el.hidden || small()) return;
      var w = el.offsetWidth, h = el.offsetHeight;
      if (Math.abs(w - (geo[id].w || 0)) > 2 || Math.abs(h - (geo[id].h || 0)) > 2) { geo[id].w = w; geo[id].h = h; store(); onChange(id, true, 'resize'); }
    }).observe(el);
  }

  return {
    init: function (cb) {
      onChange = cb || onChange; load();
      document.querySelectorAll('.win[data-win]').forEach(function (el) { wins[el.getAttribute('data-win')] = el; });
      Object.keys(wins).forEach(function (id) { geo[id] = geo[id] || {}; wire(id); });
      var opened = Object.keys(wins).filter(function (id) { return geo[id].open; });
      if (small()) opened = opened.slice(-1);
      opened.forEach(function (id) { wins[id].hidden = false; place(id); front(id); });
      window.addEventListener('resize', function () { Object.keys(wins).forEach(function (id) { if (!wins[id].hidden) place(id); }); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { var t = topOpen(); if (t) close(t); }
      });
    },
    open: open, close: close, toggle: toggle,
    isOpen: function (id) { return wins[id] && !wins[id].hidden; }
  };
})();
