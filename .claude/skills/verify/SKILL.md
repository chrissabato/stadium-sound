---
name: verify
description: Build and drive the Stadium Sound Electron app with Playwright to verify renderer changes at runtime, using isolated userData so real event sets are never touched.
---

# Verify Stadium Sound at runtime

## Build & launch

```
npm run build          # outputs to out/
```

Drive with `playwright-core` (`npm i playwright-core` in a scratch dir):

```js
const { _electron } = require('playwright-core')
const app = await _electron.launch({
  executablePath: '<repo>/node_modules/electron/dist/electron.exe',
  args: ['<scratch>/wrapper.js'],   // NOT out/main/index.js directly — see gotcha
  cwd: '<repo>'
})
const page = await app.firstWindow()
```

## CRITICAL gotcha: userData isolation

Launching `electron.exe out/main/index.js` directly makes Electron use
`%APPDATA%\Electron` as userData (it can't resolve the app name), NOT
`%APPDATA%\audio-player`. Either dir's `settings.json` has a `lastFile`
pointing at the user's REAL event set (.eset), which the app loads and
**autosaves back to** (400ms debounce after any config change, plus a
flush-on-close). Never launch against real settings.

Always launch via a wrapper that isolates userData:

```js
// wrapper.js
const { app } = require('electron')
const path = require('path')
app.setPath('userData', path.join(__dirname, 'userData'))
require('<repo>/out/main/index.js')
```

Put a `settings.json` in that userData dir with `lastFile` pointing at a
throwaway test .eset (AppConfig JSON: banks/tracks — see
`src/renderer/src/types.ts`). Tracks with nonexistent filePaths render
fine (marked "missing") and are enough for UI flows. **No BOM** in JSON
files you write — `loadSettings` does a bare `JSON.parse` and falls back
to defaults on a BOM (PowerShell 5.1 `Out-File -Encoding utf8` writes a
BOM; use the Write tool or `[IO.File]::WriteAllText` with
`UTF8Encoding($false)`).

## Driving notes

- Track titles also appear in hover tooltips ("Artist — Title") and the
  selected bank name appears in both sidebar and grid header — use
  `{ exact: true }` / `.count()` to avoid strict-mode violations.
- The bank rename inline input is easiest to grab as `input:focus`
  (a `div:has-text(...)` locator will match the toolbar search box).
- The test .eset mutates as the app autosaves — reset it between runs.
- Verify persistence by reading the test .eset after actions.
