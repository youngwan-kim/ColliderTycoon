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
    if (!on) { ['--D', '--M', '--C', '--A', '--P', '--MT', '--CR', '--CS'].forEach(function (k) { de.style.removeProperty(k); }); fire(); return; }
    var head = document.querySelector('.page1').offsetHeight;
    var bar = document.getElementById('launcher').offsetHeight || 48;
    var stage = H - head - bar;
    var cw = document.querySelector('.console').clientWidth;
    // detector lens D, map 0.82 D; the computing column 0.6 D wide (the detector control room, then the computing hall
    // over the storage hall down to the bottom); the rooms panel (analysis over conference) 0.6 D wide; both full height
    var D = Math.floor(Math.min(stage - 190, (cw - 3 * 44) / 3.02));   // under the lens: the trigger compartment
    D = Math.max(240, D);
    var P = Math.round(Math.max(D * 0.9, stage - 40));
    de.style.setProperty('--D', D + 'px');
    de.style.setProperty('--C', Math.round(D * 0.6) + 'px');
    de.style.setProperty('--A', Math.round(D * 0.6) + 'px');
    de.style.setProperty('--P', P + 'px');
    // the map column: the map, then the beam status, the accelerator control room and the council strip, all above the
    // bottom bar. On a short screen the control room and the strip give up some height first, then the map
    de.style.setProperty('--CR', Math.round(Math.max(110, Math.min(150, P * 0.2))) + 'px');
    de.style.setProperty('--CS', Math.round(Math.max(84, Math.min(104, P * 0.14))) + 'px');
    var ops = document.getElementById('beamOps').offsetHeight + 12;                   // with the gap above it
    var M = Math.max(180, Math.min(Math.round(D * 0.82), P - ops));
    de.style.setProperty('--M', M + 'px');
    de.style.setProperty('--MT', Math.max(0, Math.min((D - M) / 2 - 36, P - M - ops)) + 'px');
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
