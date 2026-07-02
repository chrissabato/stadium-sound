import { app } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

interface AppSettings {
  lastFile: string | null
  recentFiles: string[]
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): AppSettings {
  try {
    const parsed = JSON.parse(readFileSync(settingsPath(), 'utf-8'))
    return {
      lastFile: typeof parsed.lastFile === 'string' ? parsed.lastFile : null,
      recentFiles: Array.isArray(parsed.recentFiles) ? parsed.recentFiles : []
    }
  } catch {
    return { lastFile: null, recentFiles: [] }
  }
}

function saveSettings(s: AppSettings): void {
  writeFileSync(settingsPath(), JSON.stringify(s, null, 2), 'utf-8')
}

export function addRecentFile(filePath: string): string[] {
  const s = loadSettings()
  const recentFiles = [filePath, ...s.recentFiles.filter((f) => f !== filePath)].slice(0, 10)
  saveSettings({ lastFile: filePath, recentFiles })
  return recentFiles
}

export function clearRecentFiles(): void {
  saveSettings({ lastFile: null, recentFiles: [] })
}
