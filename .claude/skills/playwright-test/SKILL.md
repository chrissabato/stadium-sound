---
name: playwright-test
description: Drive the built Stadium Sound Electron app with Playwright against a disposable test event set. Use for runtime UI testing/verification of renderer or main-process changes — clicking cells, context menus, sidebar, playback UI — with userData isolation so the user's real event sets and settings are never read or written.
---

# Playwright testing for Stadium Sound

The harness in `harness/` launches the built app with an isolated userData
dir and a fresh copy of a fixture event set, so tests can freely add,
rename, and delete banks/tracks. **Never launch `out/main/index.js`
directly** — without the wrapper, Electron uses `%APPDATA%\Electron` as
userData, whose `settings.json` may point at the user's real `.eset`
file, which the app autosaves back to.

## Setup (once per session)

`playwright-core` is a devDependency — `npm install` covers it.

```
npm run build
```

Rebuild after any source change — tests run the built output, not the
dev server.

## Writing a test

```js
const { launch } = require('<repo>/.claude/skills/playwright-test/harness/launch')

async function main() {
  const { app, page, esetPath } = await launch()
  await page.getByText('Goal Horn', { exact: true }).waitFor()

  // ...drive the UI: page.click, click({ button: 'right' }), keyboard...
  await page.screenshot({ path: 'shot.png' })

  await app.close()
  // esetPath is this run's private .eset copy — read it after actions
  // to assert persistence (autosave: 400ms debounce + flush on close).
}
main().catch((e) => { console.error(e); process.exit(1) })
```

`launch({ fixture: 'path/to/other.eset' })` swaps in a different fixture.
The default fixture has bank "Test Bank A" with tracks "Goal Horn" and
"Charge" (nonexistent file paths — cells render with a "missing" badge,
fine for UI flows; real audio files are only needed for playback tests),
plus empty banks "Test Bank B" and "Test Bank C".

## Selector gotchas

- Track titles also appear in hover tooltips ("Artist — Title") and the
  selected bank's name appears in both the sidebar and the grid header:
  use `{ exact: true }`, `.first()`, or `.count()` to avoid strict-mode
  violations.
- The bank inline-rename input is easiest to grab as
  `page.locator('input:focus')` — a `div:has-text(...)` locator will
  match the toolbar search box instead.
- Context menus register their close listeners on a 0ms deferral; give
  the UI ~100ms after opening a menu before testing outside-click close.

## Cleanup

Each run's temp dir (`%TEMP%\stadiumsound-test-*`) is disposable; no
real user state is touched, so nothing needs restoring. Check for stray
`electron` processes if a driver crashed mid-run.
