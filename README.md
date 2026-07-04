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
- One-click playback — click again to stop, click another to crossfade
- Playlists — queue tracks from any bank into an ordered run of show
- Keyboard shortcuts — assign a hotkey to any track for no-mouse triggering
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
