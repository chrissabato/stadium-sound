import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ElectronAPI, UpdateStatus } from '../types/electron'
import type { AppConfig, MediaLibrary } from '../renderer/src/types'

const api: ElectronAPI = {
  openAudioFiles: (defaultPath?: string) => ipcRenderer.invoke('dialog:openAudioFiles', defaultPath),
  readAudioFile: (filePath: string) => ipcRenderer.invoke('fs:readAudioFile', filePath),
  getTrackMetadata: (filePath: string) => ipcRenderer.invoke('meta:getTrackMetadata', filePath),
  checkFiles: (paths: string[]) => ipcRenderer.invoke('fs:checkFiles', paths),
  // `file` is a real DOM File object handed in from the renderer (e.g. from
  // an OS drag-and-drop event) — typed `unknown` here because this file is
  // also compiled under tsconfig.node.json, which has no DOM lib and can't
  // resolve the `File` type. webUtils.getPathForFile still works at runtime
  // since Electron's contextBridge is able to marshal File objects across
  // the isolated-world boundary.
  getPathForFile: (file: unknown) => webUtils.getPathForFile(file as never),
  eventSet: {
    getInitialState: () => ipcRenderer.invoke('eventSet:getInitialState'),
    open: () => ipcRenderer.invoke('eventSet:open'),
    save: (config: AppConfig, filePath: string) =>
      ipcRenderer.invoke('eventSet:save', config, filePath),
    saveAs: (config: AppConfig) => ipcRenderer.invoke('eventSet:saveAs', config),
    openFile: (filePath: string) => ipcRenderer.invoke('eventSet:openFile', filePath),
    clearRecent: () => ipcRenderer.invoke('eventSet:clearRecent'),
    setTitle: (title: string) => ipcRenderer.invoke('eventSet:setTitle', title)
  },
  ssp: {
    import: () => ipcRenderer.invoke('ssp:import')
  },
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    addFolder: () => ipcRenderer.invoke('library:addFolder'),
    rescan: (id: string) => ipcRenderer.invoke('library:rescan', id),
    rename: (id: string, name: string) => ipcRenderer.invoke('library:rename', id, name),
    remove: (id: string) => ipcRenderer.invoke('library:remove', id),
    onScanProgress: (callback) => {
      const handler = (_: Electron.IpcRendererEvent, progress: { id: string; scanned: number; total: number }) =>
        callback(progress)
      ipcRenderer.on('library:scanProgress', handler)
      return () => ipcRenderer.removeListener('library:scanProgress', handler)
    },
    onScanComplete: (callback) => {
      const handler = (_: Electron.IpcRendererEvent, result: { id: string; libraries: MediaLibrary[] }) =>
        callback(result)
      ipcRenderer.on('library:scanComplete', handler)
      return () => ipcRenderer.removeListener('library:scanComplete', handler)
    }
  },
  settings: {
    setAudioDevices: (outputDeviceId: string, monitorDeviceId: string) =>
      ipcRenderer.invoke('settings:setAudioDevices', outputDeviceId, monitorDeviceId),
    setShowTrackTooltips: (enabled: boolean) =>
      ipcRenderer.invoke('settings:setShowTrackTooltips', enabled),
    setShowPlayedIndicator: (enabled: boolean) =>
      ipcRenderer.invoke('settings:setShowPlayedIndicator', enabled),
    setShowMeters: (enabled: boolean) =>
      ipcRenderer.invoke('settings:setShowMeters', enabled),
    setNetworkControl: (prefs) => ipcRenderer.invoke('settings:setNetworkControl', prefs),
    setUiZoom: (zoom: number) =>
      ipcRenderer.invoke('settings:setUiZoom', zoom),
    setLastSeenChangelogVersion: (version: string) =>
      ipcRenderer.invoke('settings:setLastSeenChangelogVersion', version)
  },
  network: {
    getStatus: () => ipcRenderer.invoke('network:getStatus'),
    publishState: (state) => ipcRenderer.send('network:state', state),
    onCommand: (callback) => {
      const handler = (_: Electron.IpcRendererEvent, command: Parameters<typeof callback>[0]) => callback(command)
      ipcRenderer.on('network:command', handler)
      return () => ipcRenderer.removeListener('network:command', handler)
    },
    onStatus: (callback) => {
      const handler = (_: Electron.IpcRendererEvent, status: Parameters<typeof callback>[0]) => callback(status)
      ipcRenderer.on('network:status', handler)
      return () => ipcRenderer.removeListener('network:status', handler)
    }
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
    checkForUpdate: () => ipcRenderer.invoke('app:checkForUpdate'),
    installUpdate: () => ipcRenderer.invoke('app:installUpdate'),
    getUpdateStatus: () => ipcRenderer.invoke('app:getUpdateStatus'),
    onUpdateStatus: (callback) => {
      const handler = (_: Electron.IpcRendererEvent, status: UpdateStatus) => callback(status)
      ipcRenderer.on('app:updateStatus', handler)
      return () => ipcRenderer.removeListener('app:updateStatus', handler)
    },
    onFlushBeforeQuit: (callback) => {
      const handler = (): void => callback()
      ipcRenderer.on('app:flushBeforeQuit', handler)
      return () => ipcRenderer.removeListener('app:flushBeforeQuit', handler)
    },
    flushBeforeQuitDone: () => ipcRenderer.send('app:flushBeforeQuitDone')
  },
  window: {
    toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),
    onFullscreenChange: (callback) => {
      const handler = (_: Electron.IpcRendererEvent, isFullscreen: boolean) => callback(isFullscreen)
      ipcRenderer.on('window:fullscreenChanged', handler)
      return () => ipcRenderer.removeListener('window:fullscreenChanged', handler)
    }
  },
  onMenuAction: (callback: (action: string, data?: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, action: string, data?: string) =>
      callback(action, data)
    ipcRenderer.on('menu:action', handler)
    return () => ipcRenderer.removeListener('menu:action', handler)
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)
