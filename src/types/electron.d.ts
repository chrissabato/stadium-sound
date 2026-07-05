import type { AppConfig, AudioDevicePrefs, TrackMetadata } from '../renderer/src/types'

export interface EventSetState {
  config: AppConfig | null
  filePath: string | null
  recentFiles: string[]
  audioDevices: AudioDevicePrefs
  showTrackTooltips: boolean
}

export interface EventSetOpenResult {
  config: AppConfig
  filePath: string
  recentFiles: string[]
}

export interface EventSetSaveAsResult {
  filePath: string
  recentFiles: string[]
}

export interface ElectronAPI {
  openAudioFiles: (defaultPath?: string) => Promise<string[]>
  readAudioFile: (filePath: string) => Promise<ArrayBuffer>
  getTrackMetadata: (filePath: string) => Promise<TrackMetadata>
  checkFiles: (paths: string[]) => Promise<boolean[]>
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
  settings: {
    setAudioDevices: (outputDeviceId: string, monitorDeviceId: string) => Promise<void>
    setShowTrackTooltips: (enabled: boolean) => Promise<void>
  }
  app: {
    getVersion: () => Promise<string>
    checkForUpdate: () => Promise<void>
    onUpdateStatus: (callback: (status: 'checking' | 'available' | 'not-available' | 'error') => void) => () => void
  }
  onMenuAction: (callback: (action: string, data?: string) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
