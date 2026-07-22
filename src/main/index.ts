import { app, BrowserWindow, ipcMain, protocol, shell } from 'electron'
import { extname, join } from 'path'
import { copyFileSync, createReadStream, existsSync, renameSync } from 'fs'
import { stat } from 'fs/promises'
import { Readable } from 'stream'
import { autoUpdater } from 'electron-updater'
import { registerIpcHandlers } from './ipcHandlers'
import { buildMenu } from './menu'
import { loadSettings, saveWindowBounds } from './settingsStore'
import { startNetworkControl, stopNetworkControl } from './networkControl'

// media:// streams audio files to <audio> elements so a track with no decoded
// buffer yet can start playing near-instantly instead of waiting for a full
// read+decode. Must be registered before app ready.
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } }
])

const MEDIA_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.webm': 'audio/webm'
}

function registerMediaProtocol(): void {
  protocol.handle('media', async (request) => {
    // URL shape: media:///C:/path/to/file.mp3 (segments URI-encoded by the renderer)
    let filePath = decodeURIComponent(new URL(request.url).pathname)
    if (/^\/[A-Za-z]:/.test(filePath)) filePath = filePath.slice(1)

    let size: number
    try {
      size = (await stat(filePath)).size
    } catch {
      return new Response('Not found', { status: 404 })
    }

    // <audio> seeks (and probes duration) via Range requests — serve them
    // properly or in-point seeking breaks.
    const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') ?? '')
    let start = 0
    let end = size - 1
    if (range) {
      if (range[1]) {
        start = parseInt(range[1], 10)
        if (range[2]) end = Math.min(parseInt(range[2], 10), end)
      } else if (range[2]) {
        // Suffix form "bytes=-N": the last N bytes
        start = Math.max(0, size - parseInt(range[2], 10))
      }
    }
    if (start >= size || start > end) {
      return new Response('Range not satisfiable', {
        status: 416,
        headers: { 'content-range': `bytes */${size}` }
      })
    }

    const stream = Readable.toWeb(createReadStream(filePath, { start, end }))
    return new Response(stream as unknown as ConstructorParameters<typeof Response>[0], {
      status: range ? 206 : 200,
      headers: {
        'content-type': MEDIA_MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
        'accept-ranges': 'bytes',
        'content-length': String(end - start + 1),
        ...(range ? { 'content-range': `bytes ${start}-${end}/${size}` } : {})
      }
    })
  })
}

function createWindow(): void {
  const { windowBounds, isMaximized, uiZoom } = loadSettings()

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
      sandbox: false,
      backgroundThrottling: false,
      zoomFactor: uiZoom
    }
  })

  if (isMaximized) win.maximize()

  // Intercept close (fires on every quit path — close button, Cmd+Q, File
  // > Quit — while webContents is still alive) so the renderer gets a
  // chance to flush its debounced autosave before the window disappears.
  let closing = false
  win.on('close', (e) => {
    if (closing) return
    e.preventDefault()

    const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds()
    saveWindowBounds(bounds, win.isMaximized())

    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      closing = true
      win.close()
    }
    ipcMain.once('app:flushBeforeQuitDone', finish)
    win.webContents.send('app:flushBeforeQuit')
    setTimeout(finish, 1000)
  })

  // Keeps the renderer's fullscreen button in sync when fullscreen is
  // entered/exited by some other means (OS shortcut, window controls).
  // Also hides the menu bar in fullscreen — it only holds the File menu,
  // which isn't needed during a show.
  win.on('enter-full-screen', () => {
    win.setMenuBarVisibility(false)
    win.webContents.send('window:fullscreenChanged', true)
  })
  win.on('leave-full-screen', () => {
    win.setMenuBarVisibility(true)
    win.webContents.send('window:fullscreenChanged', false)
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

// Releases through v0.2.11 ran under the package name "audio-player", so
// existing installs keep their settings in %APPDATA%/audio-player. The app
// identity is now "Stadium Sound"; adopt the old data the first time this
// version runs. Must happen before app ready, while Electron has not yet
// created anything under the new userData path.
// STADIUMSOUND_MIGRATE_TEST=1 lets the (unpackaged) test harness exercise this.
function migrateLegacyUserData(): void {
  if (!app.isPackaged && process.env.STADIUMSOUND_MIGRATE_TEST !== '1') return
  const oldDir = join(app.getPath('appData'), 'audio-player')
  const newDir = app.getPath('userData')
  const oldSettings = join(oldDir, 'settings.json')
  const newSettings = join(newDir, 'settings.json')
  if (existsSync(newSettings) || !existsSync(oldSettings)) return
  try {
    if (existsSync(newDir)) {
      // Something (e.g. a dev run) already created the new dir without ever
      // writing settings; salvage the settings file, leave the old caches.
      copyFileSync(oldSettings, newSettings)
    } else {
      renameSync(oldDir, newDir)
    }
  } catch {
    // Worst case the app starts with first-run defaults and the old
    // directory is left untouched.
  }
}
migrateLegacyUserData()

registerIpcHandlers()

app.whenReady().then(() => {
  // Matches the appId in electron-builder.yml so Windows attributes update
  // toasts to the installed "Stadium Sound" shortcut.
  app.setAppUserModelId('com.venue.audioplayer')
  registerMediaProtocol()
  createWindow()
  const network = loadSettings()
  if (network.networkControlEnabled) startNetworkControl(network.oscPort, network.remotePort, network.remoteToken)
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify({
      title: 'Stadium Sound update ready',
      body: 'Stadium Sound {version} has been downloaded and will be installed when you quit.'
    })
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopNetworkControl()
  if (process.platform !== 'darwin') app.quit()
})
