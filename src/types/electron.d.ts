import type { AppConfig, AudioDevicePrefs, TrackMetadata, MediaLibrary } from '../renderer/src/types'

export interface EventSetState {
  config: AppConfig | null
  filePath: string | null
  recentFiles: string[]
  audioDevices: AudioDevicePrefs
  showTrackTooltips: boolean
  showPlayedIndicator: boolean
  showMeters: boolean
  networkControl: NetworkControlPrefs
  uiZoom: number
  lastSeenChangelogVersion: string
}

export interface NetworkControlPrefs {
  enabled: boolean
  oscPort: number
  remotePort: number
}

export interface NetworkControlStatus {
  running: boolean
  oscPort: number
  remotePort: number
  addresses: string[]
  error?: string
}

export type NetworkCommand =
  | { type: 'play'; trackId: string }
  | { type: 'selectBank'; bank: string | number }
  | { type: 'stop' | 'fade' | 'random' }
  | { type: 'volume'; value: number }

export interface EventSetOpenResult {
  config: AppConfig
  filePath: string
  recentFiles: string[]
}

export interface EventSetSaveAsResult {
  filePath: string
  recentFiles: string[]
}

// Update lifecycle as shown in Settings. 'available' means found on the feed
// (download starts immediately); only 'downloaded' means a restart installs
// it. 'dev' = running unpackaged, where the updater can't operate.
export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'dev'
  version?: string
  percent?: number
}

export interface ElectronAPI {
  openAudioFiles: (defaultPath?: string) => Promise<string[]>
  readAudioFile: (filePath: string) => Promise<ArrayBuffer>
  getTrackMetadata: (filePath: string) => Promise<TrackMetadata>
  checkFiles: (paths: string[]) => Promise<boolean[]>
  getPathForFile: (file: unknown) => string
  eventSet: {
    getInitialState: () => Promise<EventSetState>
    open: () => Promise<EventSetOpenResult | null>
    save: (config: AppConfig, filePath: string) => Promise<void>
    saveAs: (config: AppConfig) => Promise<EventSetSaveAsResult | null>
    openFile: (filePath: string) => Promise<EventSetOpenResult | null>
    clearRecent: () => Promise<void>
    setTitle: (title: string) => Promise<void>
  }
  ssp: {
    import: () => Promise<Array<{ name: string; tracks: Array<{ label: string; filePath: string; duration: string; name: string }> }> | null>
  }
  library: {
    list: () => Promise<MediaLibrary[]>
    addFolder: () => Promise<MediaLibrary[] | null>
    rescan: (id: string) => Promise<MediaLibrary[]>
    rename: (id: string, name: string) => Promise<MediaLibrary[]>
    remove: (id: string) => Promise<MediaLibrary[]>
    onScanProgress: (callback: (progress: { id: string; scanned: number; total: number }) => void) => () => void
    onScanComplete: (callback: (result: { id: string; libraries: MediaLibrary[] }) => void) => () => void
  }
  settings: {
    setAudioDevices: (outputDeviceId: string, monitorDeviceId: string) => Promise<void>
    setShowTrackTooltips: (enabled: boolean) => Promise<void>
    setShowPlayedIndicator: (enabled: boolean) => Promise<void>
    setShowMeters: (enabled: boolean) => Promise<void>
    setNetworkControl: (prefs: NetworkControlPrefs) => Promise<NetworkControlStatus>
    setUiZoom: (zoom: number) => Promise<void>
    setLastSeenChangelogVersion: (version: string) => Promise<void>
  }
  network: {
    getStatus: () => Promise<NetworkControlStatus>
    publishState: (state: unknown) => void
    onCommand: (callback: (command: NetworkCommand) => void) => () => void
    onStatus: (callback: (status: NetworkControlStatus) => void) => () => void
  }
  app: {
    getVersion: () => Promise<string>
    getPlatform: () => Promise<NodeJS.Platform>
    checkForUpdate: () => Promise<void>
    installUpdate: () => Promise<void>
    getUpdateStatus: () => Promise<UpdateStatus>
    onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void
    onFlushBeforeQuit: (callback: () => void) => () => void
    flushBeforeQuitDone: () => void
  }
  window: {
    toggleFullscreen: () => Promise<boolean>
    onFullscreenChange: (callback: (isFullscreen: boolean) => void) => () => void
  }
  onMenuAction: (callback: (action: string, data?: string) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
