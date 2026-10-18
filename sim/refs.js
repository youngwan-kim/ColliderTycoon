/* A typical lab's reputation and funding received by calendar year, every two years, from the bot's normal play:
 * run several seeds and take the medians for PC.WORLD.repRef and fundsRef. Usage: node sim/load.js sim/refs.js */
(function () {
  var E = PC.Engine, box = { st: E.newState() }, bot = PC.Bot(box, {}), out = [], next = 1950;
  for (var t = 0; t < 34 * 3600; t++) {
    bot.step();
    var s = box.st;
    if (s.date >= next) { out.push([next, Math.round(s.rep), Math.round(s.runTotals.funds)]); next += 2; }
  }
  print(JSON.stringify(out));
})();
