// Puppeteer reads this at install time (from the cache's node/ directory) and
// at render time (from <work>/video). Both resolve node_modules to the cached
// packages, so the browser lives beside them in <cache>/node/chrome. The
// renderer only launches Chrome Headless Shell, so full Chrome is skipped.
const fs = require("node:fs");
const path = require("node:path");

const modules = path.join(__dirname, "node_modules");
const root = fs.existsSync(modules) ? path.dirname(fs.realpathSync(modules)) : __dirname;

module.exports = {
  cacheDirectory: path.join(root, "chrome"),
  chrome: { skipDownload: true },
};
