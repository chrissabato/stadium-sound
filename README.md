# Stadium Sound

A soundboard app for sporting events. Manage named banks of audio tracks and play them instantly with a single click.

## Download

### Windows
[Stadium-Sound-Setup-0.1.0.exe](https://github.com/chrissabato/stadium-sound/releases/download/v0.1.0/Stadium-Sound-Setup-0.1.0.exe)

### macOS
[Stadium-Sound-0.1.0.dmg](https://github.com/chrissabato/stadium-sound/releases/download/v0.1.0/Stadium-Sound-0.1.0.dmg) — Intel  
[Stadium-Sound-0.1.0-arm64.dmg](https://github.com/chrissabato/stadium-sound/releases/download/v0.1.0/Stadium-Sound-0.1.0-arm64.dmg) — Apple Silicon

> **macOS note:** The app is not yet code-signed. To open it, right-click the app and choose **Open**, then click Open in the dialog.

All releases: [github.com/chrissabato/stadium-sound/releases](https://github.com/chrissabato/stadium-sound/releases)

## Features

- Named banks (playlists) for organizing tracks by category
- One-click playback — click again to stop, click another to crossfade
- Configurable fade in, fade out, and crossfade
- Track editor with waveform, in/out point trimming, and player name fields
- Audio output device selection with monitor mode for private previewing
- File-based event sets (.eset) with recent files and auto-save
- Sports Sounds Pro (.set) file importer
- Auto-update — new versions install in the background

## Development

```bash
npm install
npm run dev
```

Built with Electron + React + TypeScript.
