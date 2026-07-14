---
name: verify
description: Build and drive the Stadium Sound Electron app with Playwright to verify renderer changes at runtime, using isolated userData so real event sets are never touched.
---

# Verify Stadium Sound at runtime

Use the `playwright-test` skill's harness
(`.claude/skills/playwright-test/harness/launch.js`) — it builds on
`playwright-core` + Electron, isolates userData in a temp dir, and loads a
disposable copy of a fixture event set. Its SKILL.md documents setup,
selector gotchas, and the autosave behavior used to assert persistence.

```
npm run build     # required first; tests drive out/, not the dev server
```

Then write a driver script that `require()`s the harness, drives the UI
(clicks, right-clicks, keyboard), takes screenshots as evidence, and reads
the run's private `.eset` copy to assert persistence.

**Never launch `out/main/index.js` directly** — Electron then uses
`%APPDATA%\Electron` as userData, whose settings.json may point at the
user's real event set, which the app autosaves back to (400ms debounce +
flush on close).
