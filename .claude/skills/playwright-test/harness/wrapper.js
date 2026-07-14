// Electron entry wrapper for tests. Redirects userData BEFORE app ready so the
// app never reads/writes the real %APPDATA%\Stadium Sound (or %APPDATA%\Electron,
// which is what Electron falls back to when out/main/index.js is launched
// directly — its settings.json can point at a real event set that the app
// would autosave back to).
const { app } = require('electron')
const path = require('path')

const userData = process.env.STADIUMSOUND_TEST_USERDATA
if (!userData) {
  console.error('STADIUMSOUND_TEST_USERDATA not set; refusing to run against real userData')
  app.exit(1)
} else {
  app.setPath('userData', userData)
  require(path.join(__dirname, '..', '..', '..', '..', 'out', 'main', 'index.js'))
}
