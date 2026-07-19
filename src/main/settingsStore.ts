import { app } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

interface AppSettings {
  lastFile: string | null
  recentFiles: string[]
  windowBounds: WindowBounds | null
  isMaximized: boolean
  outputDeviceId: string
  monitorDeviceId: string
  showTrackTooltips: boolean
  showPlayedIndicator: boolean
  showMeters: boolean
  uiZoom: number
  // Which release's What's New the user has already seen — '' until first
  // recorded, which doubles as "fresh install, don't pop the dialog".
  lastSeenChangelogVersion: string
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): AppSettings {
  try {
    const parsed = JSON.parse(readFileSync(settingsPath(), 'utf-8'))
    const wb = parsed.windowBounds
    const windowBounds =
      wb && typeof wb.x === 'number' && typeof wb.y === 'number' &&
      typeof wb.width === 'number' && typeof wb.height === 'number'
        ? wb as WindowBounds
        : null
    return {
      lastFile: typeof parsed.lastFile === 'string' ? parsed.lastFile : null,
      recentFiles: Array.isArray(parsed.recentFiles) ? parsed.recentFiles : [],
      windowBounds,
      isMaximized: typeof parsed.isMaximized === 'boolean' ? parsed.isMaximized : false,
      outputDeviceId: typeof parsed.outputDeviceId === 'string' ? parsed.outputDeviceId : '',
      monitorDeviceId: typeof parsed.monitorDeviceId === 'string' ? parsed.monitorDeviceId : '',
      showTrackTooltips: typeof parsed.showTrackTooltips === 'boolean' ? parsed.showTrackTooltips : true,
      showPlayedIndicator: typeof parsed.showPlayedIndicator === 'boolean' ? parsed.showPlayedIndicator : true,
      showMeters: typeof parsed.showMeters === 'boolean' ? parsed.showMeters : true,
      uiZoom:
        typeof parsed.uiZoom === 'number' && parsed.uiZoom >= 0.5 && parsed.uiZoom <= 3
          ? parsed.uiZoom
          : 1,
      lastSeenChangelogVersion:
        typeof parsed.lastSeenChangelogVersion === 'string' ? parsed.lastSeenChangelogVersion : ''
    }
  } catch {
    return {
      lastFile: null,
      recentFiles: [],
      windowBounds: null,
      isMaximized: false,
      outputDeviceId: '',
      monitorDeviceId: '',
      showTrackTooltips: true,
      showPlayedIndicator: true,
      showMeters: true,
      uiZoom: 1,
      lastSeenChangelogVersion: ''
    }
  }
}

export function saveWindowBounds(bounds: WindowBounds, isMaximized: boolean): void {
  const s = loadSettings()
  writeFileSync(
    settingsPath(),
    JSON.stringify({ ...s, windowBounds: bounds, isMaximized }, null, 2),
    'utf-8'
  )
}

export function saveAudioDevices(outputDeviceId: string, monitorDeviceId: string): void {
  const s = loadSettings()
  writeFileSync(
    settingsPath(),
    JSON.stringify({ ...s, outputDeviceId, monitorDeviceId }, null, 2),
    'utf-8'
  )
}

export function saveShowTrackTooltips(showTrackTooltips: boolean): void {
  const s = loadSettings()
  writeFileSync(settingsPath(), JSON.stringify({ ...s, showTrackTooltips }, null, 2), 'utf-8')
}

export function saveShowPlayedIndicator(showPlayedIndicator: boolean): void {
  const s = loadSettings()
  writeFileSync(settingsPath(), JSON.stringify({ ...s, showPlayedIndicator }, null, 2), 'utf-8')
}

export function saveShowMeters(showMeters: boolean): void {
  const s = loadSettings()
  writeFileSync(settingsPath(), JSON.stringify({ ...s, showMeters }, null, 2), 'utf-8')
}

export function saveUiZoom(uiZoom: number): void {
  const s = loadSettings()
  writeFileSync(settingsPath(), JSON.stringify({ ...s, uiZoom }, null, 2), 'utf-8')
}

export function saveLastSeenChangelogVersion(lastSeenChangelogVersion: string): void {
  const s = loadSettings()
  writeFileSync(settingsPath(), JSON.stringify({ ...s, lastSeenChangelogVersion }, null, 2), 'utf-8')
}

function saveSettings(s: AppSettings): void {
  writeFileSync(settingsPath(), JSON.stringify(s, null, 2), 'utf-8')
}

export function addRecentFile(filePath: string): string[] {
  const s = loadSettings()
  const recentFiles = [filePath, ...s.recentFiles.filter((f) => f !== filePath)].slice(0, 10)
  saveSettings({ ...s, lastFile: filePath, recentFiles })
  return recentFiles
}

export function clearRecentFiles(): void {
  const s = loadSettings()
  saveSettings({ ...s, lastFile: null, recentFiles: [] })
}
