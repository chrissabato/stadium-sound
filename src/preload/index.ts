import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from '../types/electron'
import type { AppConfig } from '../renderer/src/types'

const api: ElectronAPI = {
  openAudioFiles: (defaultPath?: string) => ipcRenderer.invoke('dialog:openAudioFiles', defaultPath),
  readAudioFile: (filePath: string) => ipcRenderer.invoke('fs:readAudioFile', filePath),
  getTrackMetadata: (filePath: string) => ipcRenderer.invoke('meta:getTrackMetadata', filePath),
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
  onMenuAction: (callback: (action: string, data?: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, action: string, data?: string) =>
      callback(action, data)
    ipcRenderer.on('menu:action', handler)
    return () => ipcRenderer.removeListener('menu:action', handler)
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)
