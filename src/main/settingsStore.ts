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
      windowBounds
    }
  } catch {
    return { lastFile: null, recentFiles: [], windowBounds: null }
  }
}

export function saveWindowBounds(bounds: WindowBounds): void {
  const s = loadSettings()
  writeFileSync(settingsPath(), JSON.stringify({ ...s, windowBounds: bounds }, null, 2), 'utf-8')
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
