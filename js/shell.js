/* App shell: on a large enough window the game is one screen. The overview (map,
 * detector lens, computing lens, the analysis and conference rooms) fills it; everything else opens in movable windows
 * from the launcher at the bottom. Smaller screens scroll, and windows open as sheets.
 */
var PC = PC || {};

PC.Shell = (function () {
  var on = false, busy = false, de = document.documentElement;

  function fire() { busy = true; window.dispatchEvent(new Event('resize')); busy = false; }

  function layout() {
    var W = window.innerWidth, H = window.innerHeight;
    on = W >= 900 && H >= 600;
    de.style.setProperty('--head', document.querySelector('.page1').offsetHeight + 'px');   // the notifications sit just under it
    de.classList.toggle('shell', on);
    if (!on) { ['--D', '--M', '--C', '--A', '--P'].forEach(function (k) { de.style.removeProperty(k); }); fire(); return; }
    var head = document.querySelector('.page1').offsetHeight;
    var bar = document.getElementById('launcher').offsetHeight || 48;
    var stage = H - head - bar;
    var cw = document.querySelector('.console').clientWidth;
    // detector lens D, map 0.82 D; the computing column 0.6 D wide (the detector control room, then the computing hall
    // over the storage hall down to the bottom); the rooms panel (analysis over conference) 0.6 D wide; both full height
    var D = Math.floor(Math.min(stage - 140, (cw - 3 * 44) / 3.02));
    D = Math.max(240, D);
    de.style.setProperty('--D', D + 'px');
    de.style.setProperty('--M', Math.round(D * 0.82) + 'px');
    de.style.setProperty('--C', Math.round(D * 0.6) + 'px');
    de.style.setProperty('--A', Math.round(D * 0.6) + 'px');
    de.style.setProperty('--P', Math.round(Math.max(D * 0.9, stage - 40)) + 'px');
    fire();
  }

  return {
    init: function () {
      layout();
      window.addEventListener('resize', function () { if (!busy) layout(); });
    },
    on: function () { return on; },
    layout: layout
  };
})();
