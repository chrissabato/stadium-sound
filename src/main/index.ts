import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import { registerIpcHandlers } from './ipcHandlers'
import { buildMenu } from './menu'
import { loadSettings, saveWindowBounds } from './settingsStore'

function createWindow(): void {
  const { windowBounds } = loadSettings()

  const win = new BrowserWindow({
    width: windowBounds?.width ?? 1280,
    height: windowBounds?.height ?? 800,
    x: windowBounds?.x,
    y: windowBounds?.y,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f172a',
    title: 'Stadium Sound',
    icon: join(__dirname, '../../resources/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false
    }
  })

  win.on('close', () => {
    if (!win.isMinimized() && !win.isMaximized()) {
      saveWindowBounds(win.getBounds())
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const { recentFiles } = loadSettings()
  buildMenu(win, recentFiles)

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

registerIpcHandlers()

app.whenReady().then(() => {
  createWindow()
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify()
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
