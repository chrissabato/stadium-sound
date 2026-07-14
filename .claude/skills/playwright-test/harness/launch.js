// Launches the built app (out/) with Playwright against a disposable copy of a
// fixture event set, in a fresh temp userData dir. Requires `npm run build`
// first and `playwright-core` resolvable from the repo (npm i --no-save).
const { _electron } = require('playwright-core')
const { mkdtempSync, mkdirSync, copyFileSync, writeFileSync } = require('fs')
const os = require('os')
const path = require('path')

const REPO = path.resolve(__dirname, '..', '..', '..', '..')

async function launch({ fixture } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'stadiumsound-test-'))
  const userDataDir = path.join(dir, 'userData')
  mkdirSync(userDataDir)

  // The app autosaves edits back to this file (400ms debounce + flush on
  // close), so each launch gets its own copy; assert persistence by reading it.
  const esetPath = path.join(dir, 'test-set.eset')
  copyFileSync(fixture ?? path.join(__dirname, 'fixture.eset'), esetPath)

  // Must be BOM-less: the app's loadSettings does a bare JSON.parse and
  // silently falls back to defaults (lastFile null -> blank app) on a BOM.
  writeFileSync(path.join(userDataDir, 'settings.json'), JSON.stringify({
    lastFile: esetPath,
    recentFiles: [],
    windowBounds: { x: 100, y: 100, width: 1280, height: 800 },
    isMaximized: false,
    outputDeviceId: '',
    monitorDeviceId: '',
    showTrackTooltips: true,
    showPlayedIndicator: true,
    showMeters: true
  }, null, 2))

  const app = await _electron.launch({
    executablePath: path.join(REPO, 'node_modules', 'electron', 'dist', 'electron.exe'),
    args: [path.join(__dirname, 'wrapper.js')],
    cwd: REPO,
    env: { ...process.env, STADIUMSOUND_TEST_USERDATA: userDataDir }
  })
  const page = await app.firstWindow()
  return { app, page, esetPath, userDataDir }
}

module.exports = { launch }
