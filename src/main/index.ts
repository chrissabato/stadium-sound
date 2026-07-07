import { app, BrowserWindow, protocol, shell } from 'electron'
import { extname, join } from 'path'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { Readable } from 'stream'
import { autoUpdater } from 'electron-updater'
import { registerIpcHandlers } from './ipcHandlers'
import { buildMenu } from './menu'
import { loadSettings, saveWindowBounds } from './settingsStore'

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

  // Keeps the renderer's fullscreen button in sync when fullscreen is
  // entered/exited by some other means (OS shortcut, window controls).
  win.on('enter-full-screen', () => win.webContents.send('window:fullscreenChanged', true))
  win.on('leave-full-screen', () => win.webContents.send('window:fullscreenChanged', false))

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
  registerMediaProtocol()
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
