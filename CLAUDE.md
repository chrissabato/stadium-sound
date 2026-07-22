# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Stadium Sound is an Electron + React + TypeScript soundboard app for sporting events: named banks of audio tracks, one-click playback, playlists, hotkeys, OSC/web-remote network control, and file-based `.eset` event sets. Windows and macOS, x64 and arm64.

## Commands

```bash
npm install
npm run dev         # electron-vite dev — hot-reloading dev app
npm run build        # electron-vite build — required before Playwright/runtime testing, drives out/
npm run typecheck    # tsc --noEmit against both tsconfig.node.json (main/preload) and tsconfig.web.json (renderer)
npm test             # node --experimental-strip-types --test tests/**/*.test.ts — no build step needed
npm run check         # typecheck + test + build — what CI (checks.yml) runs
npm run package       # build + electron-builder, local unpacked/installer output
```

Run a single test file directly, e.g.:
```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test tests/controlProtocol.test.ts
```
Tests use Node's built-in `node:test` + `node:assert/strict`, importing source `.ts` files directly (no ts-node/build needed).

Never run `electron-builder --publish` locally — releases are cut by tagging (see the `release` skill), which triggers `.github/workflows/release.yml` to build and publish both platforms.

Two other npm projects live in this repo, each with their own `package.json`/CI job and are not part of the root `npm install`:
- `companion-module/` — the Bitfocus Companion integration (`npm install && npm run check` inside that dir).
- `worker/` — a Cloudflare Worker (`wrangler`) that relays the in-app feedback form to a GitHub issue.

## Architecture

### Process split (Electron)

- **`src/main/`** — main process (Node). Owns all persistence, file I/O, and network servers. Key files:
  - `index.ts` — app lifecycle, `BrowserWindow` creation, the `media://` streaming protocol (range-request audio streaming so tracks start playing before fully read), close-time flush handshake with the renderer, legacy `audio-player` → `Stadium Sound` userData migration, Windows-ARM software-rendering fallback.
  - `ipcHandlers.ts` — all `ipcMain.handle` registrations (file dialogs, event-set open/save, library scans, settings, app/window controls).
  - `eventSetStore.ts` — load/save/validate `.eset` JSON files (this is the "document" — banks, playlists, fades, master volume).
  - `settingsStore.ts` — machine-level `settings.json` in userData (window bounds, audio device prefs, network control config, UI toggles) — distinct from the event set, which is the show file.
  - `libraryStore.ts` / `libraryScanner.ts` — indexed folders of media independent of any event set, so recurring audio can be browsed/reused across shows.
  - `sspImporter.ts` — importer for legacy Sports Sounds Pro `.set` files.
  - `networkControl.ts` / `controlProtocol.ts` — OSC (UDP) + WebSocket/HTTP web-remote server, gated behind a pairing token; see below.
  - `menu.ts` — native app menu, including recent files.
- **`src/preload/index.ts`** — the only bridge between main and renderer; exposes a single `window.electronAPI` object (typed in `src/types/electron.d.ts`) via `contextBridge`. `contextIsolation: true`, so renderer code never touches Node/Electron APIs directly — every new capability has to be added here and in the type file, not called ad hoc.
- **`src/renderer/`** — the React UI (Vite build). `App.tsx` is the top-level component; `hooks/` hold the non-trivial stateful logic (see below); `components/` are mostly presentational, driven by props from the hooks.

### Audio engine (`hooks/useAudioEngine.ts`)

Two independent Web Audio buses, `main` and `monitor`, each pinned to its own physical output device and each with exactly one active voice at a time (this is a soundboard, not a multitrack mixer) — `monitor` lets you audition a track privately while `main` keeps playing. Full tracks stream from disk via the `media://` protocol rather than being decoded into memory (constant memory regardless of bank size); only short clips (≤`CLIP_DECODE_MAX_SECONDS`, 30s) get decoded into an LRU-capped PCM buffer cache, trading memory for retrigger tightness and sample-accurate in/out points. Level meters and the LUFS readout come from a parallel analyser tap (K-weighted per ITU-R BS.1770) that never touches the audible signal path — that filter chain's IIR coefficients are only valid at 48kHz, so every `AudioContext` in this file must be created with `sampleRate: 48000`.

### Data model (`renderer/src/types.ts`)

`AppConfig` (banks → tracks, playlists, master volume, fade settings) is the shape persisted to `.eset` files — this is the "document." `AudioDevicePrefs` and other machine-level preferences live in `settingsStore.ts`'s `settings.json` instead, because they shouldn't travel with the show file. `MediaLibrary`/`LibraryTrack` are indexed separately from any event set.

### Network control (OSC + web remote)

`networkControl.ts` runs a UDP OSC listener and an HTTP+WebSocket server (serving `src/main/remote/index.html`, a self-contained page with no build step of its own) behind a shared pairing token checked on every HTTP/WS request (`controlProtocol.ts`'s `isAuthenticatedRequest`). State changes are pushed to the renderer as `network:command` events and out to remote/OSC peers via `updateRemoteState`/`broadcastState`; OSC peers are tracked with a TTL so a long show doesn't leak an ever-growing broadcast list. OSC itself is unauthenticated by design (UDP has no handshake) — the README calls out that this depends on a trusted local network. The `companion-module/` package is a separate Bitfocus Companion module driving the same OSC protocol; `shared/oscCodec.ts` is shared low-level OSC encode/decode used by both `controlProtocol.ts` and the companion module's protocol tests.

### Runtime/UI verification

There's no automated Playwright suite wired into CI — runtime verification of renderer/main changes is done ad hoc via the `verify` and `playwright-test` skills, which drive the *built* app (`npm run build` first, never the dev server) through an isolated userData dir and a disposable fixture `.eset`, so real user event sets and settings are never read or written. Use those skills (not a hand-rolled Electron launch) whenever a change needs to be seen running rather than just type-checked.
