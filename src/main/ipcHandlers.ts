import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFile } from 'fs/promises'
import { readFileSync } from 'fs'
import { loadEventSet, saveEventSet, eventSetExists } from './eventSetStore'
import { loadSettings, addRecentFile, clearRecentFiles } from './settingsStore'
import { buildMenu } from './menu'
import { parseSspSet } from './sspImporter'

async function getMetadata(filePath: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mm: any = await import('music-metadata')
  try {
    const meta = await mm.parseFile(filePath)
    const artist = meta.common.artist || ''
    const title =
      meta.common.title ||
      filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ||
      filePath
    const duration = meta.format.duration ?? 0
    return { artist, title, duration }
  } catch {
    const name =
      filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || filePath
    return { artist: '', title: name, duration: 0 }
  }
}

function getWin(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

function refreshMenu(recentFiles: string[]): void {
  const win = getWin()
  if (win) buildMenu(win, recentFiles)
}

export function registerIpcHandlers(): void {
  ipcMain.handle('dialog:openAudioFiles', async (_event, defaultPath?: string) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select Audio Files',
      defaultPath,
      filters: [
        { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile', 'multiSelections']
    })
    return canceled ? [] : filePaths
  })

  ipcMain.handle('fs:readAudioFile', async (_event, filePath: string) => {
    const buffer = await readFile(filePath)
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  })

  ipcMain.handle('meta:getTrackMetadata', async (_event, filePath: string) => {
    return getMetadata(filePath)
  })

  // Returns the initial config + file path to the renderer on startup
  ipcMain.handle('eventSet:getInitialState', () => {
    const settings = loadSettings()
    if (settings.lastFile && eventSetExists(settings.lastFile)) {
      try {
        const config = loadEventSet(settings.lastFile)
        return { config, filePath: settings.lastFile, recentFiles: settings.recentFiles }
      } catch {
        // File exists but is unreadable — remove from recents and start blank
        const recentFiles = settings.recentFiles.filter((f) => f !== settings.lastFile)
        return { config: null, filePath: null, recentFiles }
      }
    }
    return { config: null, filePath: null, recentFiles: settings.recentFiles }
  })

  ipcMain.handle('eventSet:open', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Open Event Set',
      filters: [{ name: 'Event Sets', extensions: ['eset'] }],
      properties: ['openFile']
    })
    if (canceled || !filePaths[0]) return null
    const filePath = filePaths[0]
    const config = loadEventSet(filePath)
    const recentFiles = addRecentFile(filePath)
    refreshMenu(recentFiles)
    return { config, filePath, recentFiles }
  })

  // Auto-save: called when config changes and a file is open
  ipcMain.handle('eventSet:save', (_event, config: unknown, filePath: string) => {
    saveEventSet(config, filePath)
  })

  ipcMain.handle('eventSet:saveAs', async (_event, config: unknown) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save Event Set As',
      filters: [{ name: 'Event Sets', extensions: ['eset'] }],
      defaultPath: 'My Event Set.eset'
    })
    if (canceled || !filePath) return null
    saveEventSet(config, filePath)
    const recentFiles = addRecentFile(filePath)
    refreshMenu(recentFiles)
    return { filePath, recentFiles }
  })

  ipcMain.handle('eventSet:openFile', (_event, filePath: string) => {
    try {
      const config = loadEventSet(filePath)
      const recentFiles = addRecentFile(filePath)
      refreshMenu(recentFiles)
      return { config, filePath, recentFiles }
    } catch {
      return null
    }
  })

  ipcMain.handle('eventSet:clearRecent', () => {
    clearRecentFiles()
    refreshMenu([])
  })

  ipcMain.handle('eventSet:setTitle', (_event, title: string) => {
    const win = getWin()
    if (win) win.setTitle(title)
  })

  ipcMain.handle('ssp:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Import Sports Sounds Pro Set',
      filters: [{ name: 'Sports Sounds Pro Sets', extensions: ['set'] }],
      properties: ['openFile']
    })
    if (canceled || !filePaths[0]) return null
    // SSP files use Windows-1252 encoding; latin1 covers all byte values safely
    const content = readFileSync(filePaths[0], 'latin1')
    return parseSspSet(content)
  })
}
