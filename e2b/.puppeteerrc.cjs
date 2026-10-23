const { join } = require('path');

// Keep Chromium next to the project, not in the installing user's home: the
// template build runs `npm install` as root, but the sandbox runs as `user`.
module.exports = {
  cacheDir: join(__dirname, '.cache', 'puppeteer'),
};
