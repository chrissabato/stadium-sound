# Stadium Sound

A soundboard app for sporting events. Manage named banks of audio tracks and play them instantly with a single click.

## Download

### Windows
[Download for Windows (x64)](https://github.com/chrissabato/stadium-sound/releases/latest/download/Stadium-Sound-Setup-x64.exe)  
[Download for Windows (ARM64)](https://github.com/chrissabato/stadium-sound/releases/latest/download/Stadium-Sound-Setup-arm64.exe)

### macOS
[Download for macOS (Intel)](https://github.com/chrissabato/stadium-sound/releases/latest/download/Stadium-Sound-x64.dmg)  
[Download for macOS (Apple Silicon)](https://github.com/chrissabato/stadium-sound/releases/latest/download/Stadium-Sound-arm64.dmg)

> **macOS note:** The app is not yet code-signed. To open it, right-click the app and choose **Open**, then click Open in the dialog.

All releases: [github.com/chrissabato/stadium-sound/releases](https://github.com/chrissabato/stadium-sound/releases)

## Features

- Named banks for organizing tracks by category
- Search by artist or title with autocomplete — jumps to the matching bank and highlights the track
- One-click playback — click again to stop, click another to crossfade
- Playlists — queue tracks from any bank into an ordered run of show, with shuffle
- Keyboard shortcuts — assign a hotkey to any track for no-mouse triggering
- Configurable fade in, fade out, and crossfade
- Track editor with waveform, in/out point trimming, and player name fields
- Hover tooltips reveal full track info when a soundboard button's text is cut off (toggle in Settings)
- Right-click a track to edit it; a "played" tint marking already-run tracks can be toggled in Settings
- Audio output device selection with a second monitor bus — audition a track privately on a separate output while the main track keeps playing
- Fullscreen mode (toolbar button or F11) for a clean, distraction-free booth view
- File-based event sets (.eset) with recent files and auto-save
- Sports Sounds Pro (.set) file importer
- Auto-update — new versions install in the background

## Network control

Open **Settings → Network Control** and enable **OSC & iPad Remote**. Stadium Sound shows a pairing URL to open in Safari. The URL contains a persistent token; devices without it cannot load state or open the control WebSocket. The remote mirrors the selected bank and provides track, stop, fade, random, bank, and master-volume controls. OSC itself is unauthenticated, so keep the computer and controllers on the same trusted production network.

OSC listens on UDP port `9000` by default. Messages use the following addresses:

| Address | Argument | Description |
| --- | --- | --- |
| `/stadium-sound/track/play` | string track ID | Play/restart a track |
| `/stadium-sound/bank/select` | string ID/name or int (1-based) | Select a bank |
| `/stadium-sound/stop` | none | Stop immediately |
| `/stadium-sound/fade` | none | Stop using the configured fade |
| `/stadium-sound/random` | none | Play a random unplayed track |
| `/stadium-sound/volume` | float `0…1` | Set master volume |

Stadium Sound sends `/stadium-sound/state/playing`, `/state/bank`, and `/state/volume` feedback immediately after an OSC client sends `/stadium-sound/state/subscribe`, then after each state change. The Bitfocus Companion module source is in [`companion-module`](companion-module); package it and install the resulting module archive as a developer module in Companion. Configure it with the IP, both ports, and the `token` value from the pairing URL; it discovers banks/tracks and monitors connection health automatically.

## Development

```bash
npm install
npm run dev
```

Built with Electron + React + TypeScript.

## License

[MIT](LICENSE)
