import { useState, useEffect, useCallback, useRef } from 'react'
import type { AppConfig, AudioDevicePrefs, Bank, Track } from '../types'
import { DEFAULT_CONFIG, DEFAULT_AUDIO_DEVICE_PREFS } from '../types'

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function parseSspDuration(t: string): number {
  const [min, sec] = t.split(':').map(Number)
  return (min || 0) * 60 + (sec || 0)
}

export interface ConfigState {
  config: AppConfig
  currentFilePath: string | null
  loaded: boolean
  updateConfig: (next: AppConfig | ((prev: AppConfig) => AppConfig)) => void
  audioDevices: AudioDevicePrefs
  setAudioDevices: (prefs: AudioDevicePrefs) => void
  showTrackTooltips: boolean
  setShowTrackTooltips: (enabled: boolean) => void
  showPlayedIndicator: boolean
  setShowPlayedIndicator: (enabled: boolean) => void
  showMeters: boolean
  setShowMeters: (enabled: boolean) => void
  uiZoom: number
  setUiZoom: (zoom: number) => void
  lastSeenChangelogVersion: string
}

function fileLabel(filePath: string | null): string {
  if (!filePath) return 'Untitled Event Set'
  return filePath.split(/[\\/]/).pop() ?? 'Event Set'
}

function updateWindowTitle(filePath: string | null): void {
  const label = fileLabel(filePath)
  window.electronAPI.eventSet.setTitle(`${label} — Stadium Sound`)
}

export function useConfig(): ConfigState {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [audioDevices, setAudioDevicesState] = useState<AudioDevicePrefs>(DEFAULT_AUDIO_DEVICE_PREFS)
  const [showTrackTooltips, setShowTrackTooltipsState] = useState(true)
  const [showPlayedIndicator, setShowPlayedIndicatorState] = useState(true)
  const [showMeters, setShowMetersState] = useState(true)
  const [uiZoom, setUiZoomState] = useState(1)
  const [lastSeenChangelogVersion, setLastSeenChangelogVersion] = useState('')

  const configRef = useRef<AppConfig>(DEFAULT_CONFIG)
  const filePathRef = useRef<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { configRef.current = config }, [config])
  useEffect(() => { filePathRef.current = currentFilePath }, [currentFilePath])

  function applyState(cfg: AppConfig, fp: string | null): void {
    setConfig(cfg)
    setCurrentFilePath(fp)
    updateWindowTitle(fp)
  }

  // Load on mount
  useEffect(() => {
    window.electronAPI.eventSet.getInitialState().then((state) => {
      if (state.config) {
        applyState(state.config as AppConfig, state.filePath)
      } else {
        updateWindowTitle(null)
      }
      setAudioDevicesState(state.audioDevices)
      setShowTrackTooltipsState(state.showTrackTooltips)
      setShowPlayedIndicatorState(state.showPlayedIndicator)
      setShowMetersState(state.showMeters)
      setUiZoomState(state.uiZoom)
      setLastSeenChangelogVersion(state.lastSeenChangelogVersion)
      setLoaded(true)
    })
  }, [])

  const setAudioDevices = useCallback((prefs: AudioDevicePrefs) => {
    setAudioDevicesState(prefs)
    window.electronAPI.settings.setAudioDevices(prefs.outputDeviceId, prefs.monitorDeviceId)
  }, [])

  const setShowTrackTooltips = useCallback((enabled: boolean) => {
    setShowTrackTooltipsState(enabled)
    window.electronAPI.settings.setShowTrackTooltips(enabled)
  }, [])

  const setShowPlayedIndicator = useCallback((enabled: boolean) => {
    setShowPlayedIndicatorState(enabled)
    window.electronAPI.settings.setShowPlayedIndicator(enabled)
  }, [])

  const setShowMeters = useCallback((enabled: boolean) => {
    setShowMetersState(enabled)
    window.electronAPI.settings.setShowMeters(enabled)
  }, [])

  const setUiZoom = useCallback((zoom: number) => {
    setUiZoomState(zoom)
    window.electronAPI.settings.setUiZoom(zoom)
  }, [])

  const scheduleAutoSave = useCallback((updated: AppConfig) => {
    const fp = filePathRef.current
    if (!fp) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (filePathRef.current) {
        window.electronAPI.eventSet.save(updated, filePathRef.current)
      }
    }, 400)
  }, [])

  const updateConfig = useCallback(
    (next: AppConfig | ((prev: AppConfig) => AppConfig)) => {
      setConfig((prev) => {
        const updated = typeof next === 'function' ? next(prev) : next
        scheduleAutoSave(updated)
        return updated
      })
    },
    [scheduleAutoSave]
  )

  // Main process asks us to flush any pending debounced autosave before
  // the window actually closes (see main's `close` handler).
  useEffect(() => {
    const remove = window.electronAPI.app.onFlushBeforeQuit(async () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
      try {
        const fp = filePathRef.current
        if (fp) {
          await window.electronAPI.eventSet.save(configRef.current, fp)
        }
      } finally {
        window.electronAPI.app.flushBeforeQuitDone()
      }
    })
    return remove
  }, [])

  // Native menu actions from main process
  useEffect(() => {
    const remove = window.electronAPI.onMenuAction(async (action, data) => {
      if (action === 'new') {
        applyState(DEFAULT_CONFIG, null)
      } else if (action === 'open') {
        const result = await window.electronAPI.eventSet.open()
        if (result) applyState(result.config, result.filePath)
      } else if (action === 'save') {
        const fp = filePathRef.current
        if (fp) {
          window.electronAPI.eventSet.save(configRef.current, fp)
        } else {
          const result = await window.electronAPI.eventSet.saveAs(configRef.current)
          if (result) {
            setCurrentFilePath(result.filePath)
            updateWindowTitle(result.filePath)
          }
        }
      } else if (action === 'saveAs') {
        const result = await window.electronAPI.eventSet.saveAs(configRef.current)
        if (result) {
          setCurrentFilePath(result.filePath)
          updateWindowTitle(result.filePath)
        }
      } else if (action === 'openRecent' && data) {
        const result = await window.electronAPI.eventSet.openFile(data)
        if (result) applyState(result.config, result.filePath)
      } else if (action === 'clearRecent') {
        await window.electronAPI.eventSet.clearRecent()
      } else if (action === 'importSsp') {
        const pages = await window.electronAPI.ssp.import()
        if (!pages || pages.length === 0) return
        const newBanks: Bank[] = pages.map((page) => ({
          id: makeId(),
          name: page.name,
          tracks: page.tracks.map((t): Track => {
            const duration = parseSspDuration(t.duration)
            const title = t.label || t.name
            const artist = t.name && t.name !== t.label ? t.name : ''
            return {
              id: makeId(),
              filePath: t.filePath,
              title,
              artist,
              duration,
              inPoint: 0,
              outPoint: duration
            }
          })
        }))
        const updated: AppConfig = {
          ...DEFAULT_CONFIG,
          banks: newBanks,
          selectedBankId: newBanks[0]?.id ?? ''
        }
        applyState(updated, null)
        scheduleAutoSave(updated)
      }
    })
    return remove
  }, [])

  return { config, currentFilePath, loaded, updateConfig, audioDevices, setAudioDevices, showTrackTooltips, setShowTrackTooltips, showPlayedIndicator, setShowPlayedIndicator, showMeters, setShowMeters, uiZoom, setUiZoom, lastSeenChangelogVersion }
}
