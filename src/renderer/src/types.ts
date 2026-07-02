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
}

export interface Bank {
  id: string
  name: string
  tracks: Track[]
}

export interface AppConfig {
  banks: Bank[]
  selectedBankId: string
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
