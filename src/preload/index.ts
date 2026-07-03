import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from '../types/electron'
import type { AppConfig } from '../renderer/src/types'

const api: ElectronAPI = {
  openAudioFiles: (defaultPath?: string) => ipcRenderer.invoke('dialog:openAudioFiles', defaultPath),
  readAudioFile: (filePath: string) => ipcRenderer.invoke('fs:readAudioFile', filePath),
  getTrackMetadata: (filePath: string) => ipcRenderer.invoke('meta:getTrackMetadata', filePath),
  checkFiles: (paths: string[]) => ipcRenderer.invoke('fs:checkFiles', paths),
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
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    checkForUpdate: () => ipcRenderer.invoke('app:checkForUpdate'),
    onUpdateStatus: (callback) => {
      const handler = (_: Electron.IpcRendererEvent, status: string) => callback(status as never)
      ipcRenderer.on('app:updateStatus', handler)
      return () => ipcRenderer.removeListener('app:updateStatus', handler)
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
