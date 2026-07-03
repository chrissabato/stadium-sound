export interface TrackMetadata {
  artist: string
  title: string
  duration: number
}

export interface Track {
  id: string
  filePath: string
  artist: string
  title: string
  duration: number
  inPoint: number
  outPoint: number
  playerNumber?: string
  playerFirstName?: string
  playerLastName?: string
  hotkey?: string
}

export interface Bank {
  id: string
  name: string
  tracks: Track[]
}

export interface PlaylistTrack extends Track {
  itemId: string
}

export interface Playlist {
  id: string
  name: string
  tracks: PlaylistTrack[]
}

export interface AppConfig {
  banks: Bank[]
  selectedBankId: string
  playlists: Playlist[]
  selectedPlaylistId: string
  masterVolume: number
  fadeIn: number      // seconds
  fadeOut: number     // seconds
  crossFade: number   // seconds
  outputDeviceId: string   // '' = system default
  monitorDeviceId: string  // '' = system default
}

export const DEFAULT_CONFIG: AppConfig = {
  banks: [],
  selectedBankId: '',
  playlists: [],
  selectedPlaylistId: '',
  masterVolume: 1.0,
  fadeIn: 0,
  fadeOut: 0,
  crossFade: 0,
  outputDeviceId: '',
  monitorDeviceId: ''
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 10)
  return `${m}:${String(s).padStart(2, '0')}.${ms}`
}

export function parseTime(str: string): number {
  const parts = str.split(':')
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1])
  }
  return parseFloat(str) || 0
}

// Track hotkeys are restricted to unmodified digits, letters, and function keys.
// This keeps them layout-independent (matched via e.code, not e.key) and guarantees
// they never collide with the reserved global shortcuts (Escape/Space/Arrows/Ctrl+M),
// none of which normalize to a value here.
// Structural param type (not DOM KeyboardEvent): this file is also compiled
// under tsconfig.node.json (via the preload's import), which has no DOM lib.
export function normalizeHotkeyEvent(
  e: { ctrlKey: boolean; metaKey: boolean; altKey: boolean; key: string; code: string }
): string | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  if (/^F([1-9]|1[0-2])$/.test(e.key)) return e.key
  const digit = /^Digit([0-9])$/.exec(e.code) ?? /^Numpad([0-9])$/.exec(e.code)
  if (digit) return digit[1]
  const letter = /^Key([A-Z])$/.exec(e.code)
  if (letter) return letter[1]
  return null
}
