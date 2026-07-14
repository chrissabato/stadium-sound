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
  colorLabel?: string
  volume?: number   // per-track level 0–1, multiplied with master volume; undefined = 1 (full)
}

export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac']

// dataTransfer type used to carry a track id when dragging a track cell out of
// the grid (reorder mode) so a drop target (e.g. a sidebar bank row) can tell
// a track drag apart from other native drag operations (like bank reordering).
export const TRACK_DRAG_MIME = 'application/x-stadiumsound-track-id'

// Predefined color labels for track buttons — shown as a thin bar across the
// top of the button so it stays visible without overriding the play/missing/
// played button background colors.
export const TRACK_COLORS: string[] = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#94a3b8'  // slate
]

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
}

export const DEFAULT_CONFIG: AppConfig = {
  banks: [],
  selectedBankId: '',
  playlists: [],
  selectedPlaylistId: '',
  masterVolume: 1.0,
  fadeIn: 0,
  fadeOut: 0,
  crossFade: 0
}

// Which physical audio device to play through. Machine-level preference,
// not part of the event set file — stored in app settings so it persists
// across restarts and isn't tied to whichever show happens to be open.
export interface AudioDevicePrefs {
  outputDeviceId: string   // '' = system default
  monitorDeviceId: string  // '' = system default
}

export const DEFAULT_AUDIO_DEVICE_PREFS: AudioDevicePrefs = {
  outputDeviceId: '',
  monitorDeviceId: ''
}

// A library is an indexed folder of media, independent of any event set —
// it persists across shows so recurring audio (stingers, walkups, etc.) can
// be browsed and copied into a bank/playlist without re-picking files from
// disk each time.
export interface LibraryTrack extends TrackMetadata {
  filePath: string
}

export interface MediaLibrary {
  id: string
  name: string
  folderPath: string
  tracks: LibraryTrack[]
  lastScannedAt: number | null
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 10)
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
