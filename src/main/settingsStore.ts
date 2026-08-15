import { app } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'

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
  networkControlEnabled: boolean
  oscPort: number
  remotePort: number
  remoteToken: string
  uiZoom: number
  // Target integrated loudness (LUFS) for the per-track Normalize button and
  // the Loudness Report's too-loud/too-quiet thresholds. Machine-level like
  // the rest of this file rather than part of the .eset — it's an operator
  // calibration ("how loud does this rig run"), not show content.
  normalizeTargetLufs: number
  // Which release's What's New the user has already seen — '' until first
  // recorded, which doubles as "fresh install, don't pop the dialog".
  lastSeenChangelogVersion: string
  // Random per-install identifier sent with anonymous telemetry pings — not
  // tied to any account/email, exists purely to dedupe installs server-side.
  installId: string
  telemetryOptOut: boolean
  lastTelemetryPingAt: number | null
  // Gates the "Track Colors" section in Settings and the color filter button
  // in the bank header — off by default since most shows don't use colors.
  enableColorLabels: boolean
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
    const settings: AppSettings = {
      lastFile: typeof parsed.lastFile === 'string' ? parsed.lastFile : null,
      recentFiles: Array.isArray(parsed.recentFiles) ? parsed.recentFiles : [],
      windowBounds,
      isMaximized: typeof parsed.isMaximized === 'boolean' ? parsed.isMaximized : false,
      outputDeviceId: typeof parsed.outputDeviceId === 'string' ? parsed.outputDeviceId : '',
      monitorDeviceId: typeof parsed.monitorDeviceId === 'string' ? parsed.monitorDeviceId : '',
      showTrackTooltips: typeof parsed.showTrackTooltips === 'boolean' ? parsed.showTrackTooltips : true,
      showPlayedIndicator: typeof parsed.showPlayedIndicator === 'boolean' ? parsed.showPlayedIndicator : true,
      showMeters: typeof parsed.showMeters === 'boolean' ? parsed.showMeters : true,
      networkControlEnabled: typeof parsed.networkControlEnabled === 'boolean' ? parsed.networkControlEnabled : false,
      oscPort: validPort(parsed.oscPort, 9000),
      remotePort: validPort(parsed.remotePort, 9001),
      remoteToken: validToken(parsed.remoteToken),
      uiZoom:
        typeof parsed.uiZoom === 'number' && parsed.uiZoom >= 0.5 && parsed.uiZoom <= 3
          ? parsed.uiZoom
          : 1,
      normalizeTargetLufs: validLufs(parsed.normalizeTargetLufs),
      lastSeenChangelogVersion:
        typeof parsed.lastSeenChangelogVersion === 'string' ? parsed.lastSeenChangelogVersion : '',
      installId: validInstallId(parsed.installId),
      telemetryOptOut: typeof parsed.telemetryOptOut === 'boolean' ? parsed.telemetryOptOut : false,
      lastTelemetryPingAt: typeof parsed.lastTelemetryPingAt === 'number' ? parsed.lastTelemetryPingAt : null,
      enableColorLabels: typeof parsed.enableColorLabels === 'boolean' ? parsed.enableColorLabels : false
    }
    if (parsed.remoteToken !== settings.remoteToken || parsed.installId !== settings.installId) {
      writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
    }
    return settings
  } catch {
    const settings: AppSettings = {
      lastFile: null,
      recentFiles: [],
      windowBounds: null,
      isMaximized: false,
      outputDeviceId: '',
      monitorDeviceId: '',
      showTrackTooltips: true,
      showPlayedIndicator: true,
      showMeters: true,
      networkControlEnabled: false,
      oscPort: 9000,
      remotePort: 9001,
      remoteToken: fallbackRemoteToken,
      uiZoom: 1,
      normalizeTargetLufs: DEFAULT_NORMALIZE_TARGET_LUFS,
      lastSeenChangelogVersion: '',
      installId: fallbackInstallId,
      telemetryOptOut: false,
      lastTelemetryPingAt: null,
      enableColorLabels: false
    }
    return settings
  }
}

const DEFAULT_NORMALIZE_TARGET_LUFS = -16

function validLufs(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value <= 0 && value >= -40
    ? value
    : DEFAULT_NORMALIZE_TARGET_LUFS
}

function makeToken(): string { return randomBytes(18).toString('base64url') }
const fallbackRemoteToken = makeToken()
function validToken(value: unknown): string { return typeof value === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(value) ? value : fallbackRemoteToken }

function makeInstallId(): string { return randomBytes(16).toString('hex') }
const fallbackInstallId = makeInstallId()
function validInstallId(value: unknown): string { return typeof value === 'string' && /^[a-f0-9]{32}$/.test(value) ? value : fallbackInstallId }

function validPort(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1024 && value <= 65535
    ? value
    : fallback
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

export function saveNetworkControl(networkControlEnabled: boolean, oscPort: number, remotePort: number): void {
  const s = loadSettings()
  writeFileSync(settingsPath(), JSON.stringify({
    ...s,
    networkControlEnabled,
    oscPort: validPort(oscPort, 9000),
    remotePort: validPort(remotePort, 9001)
  }, null, 2), 'utf-8')
}

export function saveUiZoom(uiZoom: number): void {
  const s = loadSettings()
  writeFileSync(settingsPath(), JSON.stringify({ ...s, uiZoom }, null, 2), 'utf-8')
}

export function saveNormalizeTargetLufs(normalizeTargetLufs: number): void {
  const s = loadSettings()
  writeFileSync(settingsPath(), JSON.stringify({ ...s, normalizeTargetLufs: validLufs(normalizeTargetLufs) }, null, 2), 'utf-8')
}

export function saveLastSeenChangelogVersion(lastSeenChangelogVersion: string): void {
  const s = loadSettings()
  writeFileSync(settingsPath(), JSON.stringify({ ...s, lastSeenChangelogVersion }, null, 2), 'utf-8')
}

export function saveTelemetryOptOut(telemetryOptOut: boolean): void {
  const s = loadSettings()
  writeFileSync(settingsPath(), JSON.stringify({ ...s, telemetryOptOut }, null, 2), 'utf-8')
}

export function saveEnableColorLabels(enableColorLabels: boolean): void {
  const s = loadSettings()
  writeFileSync(settingsPath(), JSON.stringify({ ...s, enableColorLabels }, null, 2), 'utf-8')
}

// Not IPC-exposed — only telemetry.ts calls this, to record when the last ping went out.
export function saveLastTelemetryPingAt(lastTelemetryPingAt: number): void {
  const s = loadSettings()
  writeFileSync(settingsPath(), JSON.stringify({ ...s, lastTelemetryPingAt }, null, 2), 'utf-8')
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
