// Load the browser scripts into this Node context (they share a global `PC`), then run a sim script.
// Usage: node sim/load.js sim/balance.js [key=value ...]
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
global.print = console.log;
global.debug = (m) => console.error(m);
process.argv.slice(3).forEach((kv) => { const [k, v] = kv.split('='); global[k] = Number(v); });
['js/content.js', 'js/engine.js', 'sim/bot.js', process.argv[2]].forEach((f) =>
  vm.runInThisContext(fs.readFileSync(path.resolve(root, f), 'utf8'), { filename: f }));
