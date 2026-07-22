// Release notes shown in the What's New dialog (Settings → About → What's New,
// and automatically once after an update). Add a new entry at the TOP of this
// list as part of every "Bump version to X" commit — user-facing changes only,
// written for the person running sound at an event, not for developers.

export interface ChangelogRelease {
  version: string
  date: string // YYYY-MM-DD
  items: string[]
}

export const CHANGELOG: ChangelogRelease[] = [
  {
    version: '0.5.0',
    date: '2026-07-21',
    items: [
      'New Network Control: enable OSC and a web remote in Settings so phones, tablets, and Bitfocus Companion can trigger playback over the local network.',
      'The web remote works from any phone or tablet — open the pairing URL or scan its QR code from Settings.',
      'A Companion token is shown as its own copyable field in Settings for setting up the Companion module.',
      'The website changelog page now links each version to its GitHub release, where older installers can be downloaded.'
    ]
  },
  {
    version: '0.4.4',
    date: '2026-07-19',
    items: [
      'New What\'s New dialog (you\'re reading it) — see what changed in each release. It opens once after an update, and any time from Settings → About.',
      'The Monitor button is now disabled with a clear ✕ when the monitor output is the same device as the main output — pick a different Monitor device in Settings to use it.',
      'Adding tracks to an empty bank now uses the same + menu as the bank header: Select File or From Library.'
    ]
  },
  {
    version: '0.4.3',
    date: '2026-07-19',
    items: [
      'New Display Zoom setting scales the whole interface up or down — useful on high-resolution screens.',
      'Add from Library is now a search-first flow: type to filter, click a track to add it.',
      'The menu bar stays hidden while in fullscreen.'
    ]
  },
  {
    version: '0.4.2',
    date: '2026-07-19',
    items: [
      'The track editor waveform now shows a moving playhead while previewing.',
      'Track buttons can be reordered with touch on touchscreen devices.'
    ]
  },
  {
    version: '0.4.1',
    date: '2026-07-18',
    items: [
      'Playback actions moved from the menu bar into the toolbar "More" menu.',
      'Pressing a button whose audio file has been moved or deleted now marks the track missing instead of failing silently.',
      'Track button badges are larger and higher-contrast.'
    ]
  },
  {
    version: '0.4.0',
    date: '2026-07-15',
    items: [
      'The track editor now has level meters and a loudness (LUFS) readout.',
      'Buttons with a custom volume show a badge.',
      'Keyboard shortcuts keep working after using the volume slider or checkboxes.',
      'The saved master volume is applied on startup instead of resetting to full.'
    ]
  },
  {
    version: '0.3.0',
    date: '2026-07-14',
    items: [
      'The app is now called Stadium Sound.'
    ]
  },
  {
    version: '0.2.11',
    date: '2026-07-14',
    items: [
      'Deleting banks, tracks, or playlists now asks for confirmation first — deletions autosave and can\'t be undone.',
      'Add-to-playlist mode now has a clear Done button so it\'s obvious how to exit.'
    ]
  },
  {
    version: '0.2.10',
    date: '2026-07-14',
    items: [
      'The level meters are labeled with dB units.',
      'A clear error dialog appears when an event set fails to open.',
      'The update flow now shows download progress and an install button, and remembers its state.'
    ]
  },
  {
    version: '0.2.9',
    date: '2026-07-14',
    items: [
      'Each track can have its own audio level, set in the track editor.',
      'A short-term loudness (LUFS) readout appears beneath the level meters.',
      'Right-click menus: delete a track, rename or delete a bank.',
      'Fixed the playhead and level meters permanently freezing during long sessions.'
    ]
  },
  {
    version: '0.2.8',
    date: '2026-07-09',
    items: [
      'First fix for the playhead and level meters freezing mid-event.'
    ]
  },
  {
    version: '0.2.7',
    date: '2026-07-08',
    items: [
      'New media library: index folders of audio once, then add tracks to banks and playlists from there.',
      'The event set and window layout are saved when the app closes.'
    ]
  }
]
