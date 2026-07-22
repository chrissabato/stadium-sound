import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { readFile, access } from 'fs/promises'
import { readFileSync } from 'fs'
import { loadEventSet, saveEventSet, eventSetExists } from './eventSetStore'
import { loadSettings, addRecentFile, clearRecentFiles, saveAudioDevices, saveShowTrackTooltips, saveShowPlayedIndicator, saveShowMeters, saveNetworkControl, saveUiZoom, saveLastSeenChangelogVersion } from './settingsStore'
import { getNetworkControlStatus, startNetworkControl, stopNetworkControl, updateRemoteState } from './networkControl'
import { buildMenu } from './menu'
import { parseSspSet } from './sspImporter'
import { AUDIO_EXTENSIONS, getAudioMetadata, scanFolder } from './libraryScanner'
import { loadLibraries, createLibrary, replaceLibraryTracks, renameLibrary, removeLibrary } from './libraryStore'

function getWin(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

// Scans run in the background so the renderer gets an immediate response
// (the new/existing library entry) and then live progress — a full library
// can have hundreds of files, and blocking the IPC call until every one is
// tag-read would leave the UI with no way to show a progress bar.
function runLibraryScan(id: string, folderPath: string): void {
  const win = getWin()
  scanFolder(folderPath, (scanned, total) => {
    win?.webContents.send('library:scanProgress', { id, scanned, total })
  })
    .then((tracks) => {
      const all = replaceLibraryTracks(id, tracks)
      win?.webContents.send('library:scanComplete', { id, libraries: all })
    })
    .catch(() => {
      win?.webContents.send('library:scanComplete', { id, libraries: loadLibraries() })
    })
}

function refreshMenu(recentFiles: string[]): void {
  const win = getWin()
  if (win) buildMenu(win, recentFiles)
}

function showOpenError(filePath: string, err: unknown, intro?: string): void {
  const detail = err instanceof Error ? err.message : String(err)
  const lines = [intro, filePath, detail].filter(Boolean)
  dialog.showErrorBox('Could Not Open Event Set', lines.join('\n\n'))
}

export function registerIpcHandlers(): void {
  ipcMain.handle('dialog:openAudioFiles', async (_event, defaultPath?: string) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select Audio Files',
      defaultPath,
      filters: [
        { name: 'Audio Files', extensions: AUDIO_EXTENSIONS },
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
    return getAudioMetadata(filePath)
  })

  // Returns the initial config + file path to the renderer on startup
  ipcMain.handle('eventSet:getInitialState', () => {
    const settings = loadSettings()
    const audioDevices = {
      outputDeviceId: settings.outputDeviceId,
      monitorDeviceId: settings.monitorDeviceId
    }
    const showTrackTooltips = settings.showTrackTooltips
    const showPlayedIndicator = settings.showPlayedIndicator
    const showMeters = settings.showMeters
    const networkControl = { enabled: settings.networkControlEnabled, oscPort: settings.oscPort, remotePort: settings.remotePort }
    const uiZoom = settings.uiZoom
    const lastSeenChangelogVersion = settings.lastSeenChangelogVersion
    if (settings.lastFile && eventSetExists(settings.lastFile)) {
      try {
        const config = loadEventSet(settings.lastFile)
        return { config, filePath: settings.lastFile, recentFiles: settings.recentFiles, audioDevices, showTrackTooltips, showPlayedIndicator, showMeters, networkControl, uiZoom, lastSeenChangelogVersion }
      } catch (err) {
        // File exists but is unreadable — tell the user, remove from recents, start blank
        showOpenError(settings.lastFile, err, 'Your last event set could not be reopened.')
        const recentFiles = settings.recentFiles.filter((f) => f !== settings.lastFile)
        return { config: null, filePath: null, recentFiles, audioDevices, showTrackTooltips, showPlayedIndicator, showMeters, networkControl, uiZoom, lastSeenChangelogVersion }
      }
    }
    return { config: null, filePath: null, recentFiles: settings.recentFiles, audioDevices, showTrackTooltips, showPlayedIndicator, showMeters, networkControl, uiZoom, lastSeenChangelogVersion }
  })

  // Machine-level audio device preference — saved independently of the event
  // set file so it persists across restarts even for an unsaved show.
  ipcMain.handle('settings:setAudioDevices', (_event, outputDeviceId: string, monitorDeviceId: string) => {
    saveAudioDevices(outputDeviceId, monitorDeviceId)
  })

  // Machine-level UI preference — same rationale as audio devices above.
  ipcMain.handle('settings:setShowTrackTooltips', (_event, enabled: boolean) => {
    saveShowTrackTooltips(enabled)
  })

  // Machine-level UI preference — same rationale as audio devices above.
  ipcMain.handle('settings:setShowPlayedIndicator', (_event, enabled: boolean) => {
    saveShowPlayedIndicator(enabled)
  })

  // Machine-level UI preference — same rationale as audio devices above.
  ipcMain.handle('settings:setShowMeters', (_event, enabled: boolean) => {
    saveShowMeters(enabled)
  })

  ipcMain.handle('settings:setNetworkControl', async (_event, prefs: { enabled: boolean; oscPort: number; remotePort: number }) => {
    saveNetworkControl(prefs.enabled, prefs.oscPort, prefs.remotePort)
    // Re-read rather than trusting prefs directly: saveNetworkControl clamps/validates
    // ports (e.g. a stray fractional value from the number input), and the server must
    // be started with the same values that were actually persisted.
    const settings = loadSettings()
    return prefs.enabled ? startNetworkControl(settings.oscPort, settings.remotePort, settings.remoteToken) : stopNetworkControl()
  })
  ipcMain.handle('network:getStatus', () => getNetworkControlStatus())
  ipcMain.on('network:state', (_event, state) => updateRemoteState(state))

  // Records which release's What's New the user has seen, so the dialog only
  // auto-opens once per update.
  ipcMain.handle('settings:setLastSeenChangelogVersion', (_event, version: string) => {
    saveLastSeenChangelogVersion(version)
  })

  // Machine-level UI preference. Applied here (not just saved) so the change
  // is visible immediately while the Settings dialog is still open.
  ipcMain.handle('settings:setUiZoom', (_event, zoom: number) => {
    const clamped = Math.min(3, Math.max(0.5, zoom))
    saveUiZoom(clamped)
    getWin()?.webContents.setZoomFactor(clamped)
  })

  ipcMain.handle('eventSet:open', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Open Event Set',
      filters: [{ name: 'Event Sets', extensions: ['eset'] }],
      properties: ['openFile']
    })
    if (canceled || !filePaths[0]) return null
    const filePath = filePaths[0]
    let config: unknown
    try {
      config = loadEventSet(filePath)
    } catch (err) {
      showOpenError(filePath, err)
      return null
    }
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
    } catch (err) {
      showOpenError(filePath, err)
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

  ipcMain.handle('fs:checkFiles', async (_event, paths: string[]) => {
    return Promise.all(paths.map((p) => access(p).then(() => true).catch(() => false)))
  })

  ipcMain.handle('window:toggleFullscreen', () => {
    const win = getWin()
    if (!win) return false
    win.setFullScreen(!win.isFullScreen())
    return win.isFullScreen()
  })

  ipcMain.handle('app:getVersion', () => app.getVersion())

  ipcMain.handle('app:getPlatform', () => process.platform)

  // Remembered so Settings can show where the updater actually is when it
  // (re)opens — its status listener only exists while the dialog is open, so
  // without this a download finishing in the background was simply invisible.
  let lastUpdateStatus: { state: string; version?: string; percent?: number } = { state: 'idle' }
  function sendUpdateStatus(status: typeof lastUpdateStatus) {
    lastUpdateStatus = status
    getWin()?.webContents.send('app:updateStatus', status)
  }

  ipcMain.handle('app:getUpdateStatus', () => lastUpdateStatus)

  ipcMain.handle('app:checkForUpdate', () => {
    if (!app.isPackaged) {
      sendUpdateStatus({ state: 'dev' })
      return
    }
    sendUpdateStatus({ state: 'checking' })
    // Plain checkForUpdates(), not checkForUpdatesAndNotify(): Settings is
    // already displaying progress for this manual check, so the extra OS
    // notification was just a second, differently-worded voice.
    autoUpdater.checkForUpdates().catch(() => {
      sendUpdateStatus({ state: 'error' })
    })
  })

  ipcMain.handle('app:installUpdate', () => {
    // Goes through the window's close interception first, so the renderer
    // still flushes its debounced event-set autosave before the app swaps.
    autoUpdater.quitAndInstall()
  })

  autoUpdater.on('update-available', (info) => {
    sendUpdateStatus({ state: 'available', version: info.version })
  })
  autoUpdater.on('update-not-available', () => {
    sendUpdateStatus({ state: 'not-available' })
  })
  autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus({ state: 'downloading', percent: progress.percent })
  })
  autoUpdater.on('update-downloaded', (info) => {
    sendUpdateStatus({ state: 'downloaded', version: info.version })
  })
  autoUpdater.on('error', () => {
    sendUpdateStatus({ state: 'error' })
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

  ipcMain.handle('library:list', () => loadLibraries())

  ipcMain.handle('library:addFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Add Media Library Folder',
      properties: ['openDirectory']
    })
    if (canceled || !filePaths[0]) return null
    const folderPath = filePaths[0]
    const { library, all } = createLibrary(folderPath)
    runLibraryScan(library.id, folderPath)
    return all
  })

  ipcMain.handle('library:rescan', (_event, id: string) => {
    const libraries = loadLibraries()
    const library = libraries.find((l) => l.id === id)
    if (library) runLibraryScan(id, library.folderPath)
    return libraries
  })

  ipcMain.handle('library:rename', (_event, id: string, name: string) => renameLibrary(id, name))

  ipcMain.handle('library:remove', (_event, id: string) => removeLibrary(id))
}
