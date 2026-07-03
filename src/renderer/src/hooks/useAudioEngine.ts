import { useRef, useCallback, useEffect, useState } from 'react'

interface PlayOptions {
  inPoint: number
  outPoint: number
}

export interface FadeSettings {
  fadeIn: number
  fadeOut: number
  crossFade: number
}

interface AudioEngine {
  loadBuffer: (id: string, filePath: string) => Promise<AudioBuffer>
  getBuffer: (id: string) => AudioBuffer | undefined
  playTrack: (id: string, opts: PlayOptions, playOpts?: { force?: boolean }) => void
  stopAll: () => void
  stopImmediate: () => void
  setMasterVolume: (vol: number) => void
  setFadeSettings: (s: FadeSettings) => void
  setOutputDevices: (outputDeviceId: string, monitorDeviceId: string) => void
  setMonitorMode: (enabled: boolean) => void
  isMonitorMode: boolean
  playingTrackId: string | null
  audioCtx: AudioContext | null
  playStartCtxTime: number | null
  playStartWallTime: number | null
}

export function useAudioEngine(): AudioEngine {
  const ctxRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const bufferCache = useRef<Map<string, AudioBuffer>>(new Map())

  // Active = currently playing. Fading = being faded out but not yet stopped.
  const activeNodeRef = useRef<AudioBufferSourceNode | null>(null)
  const activeTrackGainRef = useRef<GainNode | null>(null)
  const fadingNodeRef = useRef<AudioBufferSourceNode | null>(null)
  const fadeOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fadeSettingsRef = useRef<FadeSettings>({ fadeIn: 0, fadeOut: 0, crossFade: 0 })
  const outputDeviceIdRef = useRef<string>('')
  const monitorDeviceIdRef = useRef<string>('')
  const isMonitorModeRef = useRef<boolean>(false)
  const [isMonitorMode, setIsMonitorMode] = useState(false)

  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null)
  const [playStartCtxTime, setPlayStartCtxTime] = useState<number | null>(null)
  const [playStartWallTime, setPlayStartWallTime] = useState<number | null>(null)

  function applySinkId(ctx: AudioContext, deviceId: string) {
    // setSinkId is not yet in TypeScript's lib types
    ;(ctx as unknown as { setSinkId(id: string): Promise<void> })
      .setSinkId(deviceId)
      .catch(() => {})
  }

  function getCtx(): AudioContext {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 })
      masterGainRef.current = ctxRef.current.createGain()
      masterGainRef.current.connect(ctxRef.current.destination)
      const deviceId = isMonitorModeRef.current
        ? monitorDeviceIdRef.current
        : outputDeviceIdRef.current
      if (deviceId) applySinkId(ctxRef.current, deviceId)
    }
    return ctxRef.current
  }

  function cancelFadeTimer() {
    if (fadeOutTimerRef.current) {
      clearTimeout(fadeOutTimerRef.current)
      fadeOutTimerRef.current = null
    }
    try { fadingNodeRef.current?.stop() } catch { /* already stopped */ }
    fadingNodeRef.current = null
  }

  const loadBuffer = useCallback(async (id: string, filePath: string): Promise<AudioBuffer> => {
    const ctx = getCtx()
    const arrayBuffer = await window.electronAPI.readAudioFile(filePath)
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    bufferCache.current.set(id, audioBuffer)
    return audioBuffer
  }, [])

  const getBuffer = useCallback((id: string) => bufferCache.current.get(id), [])

  const stopAll = useCallback(() => {
    cancelFadeTimer()

    const { fadeOut } = fadeSettingsRef.current

    if (activeNodeRef.current && activeTrackGainRef.current && fadeOut > 0) {
      // Fade out: keep UI state until fade completes
      const ctx = getCtx()
      const node = activeNodeRef.current
      const gain = activeTrackGainRef.current
      gain.gain.cancelScheduledValues(ctx.currentTime)
      gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeOut)
      fadingNodeRef.current = node
      activeNodeRef.current = null
      activeTrackGainRef.current = null
      fadeOutTimerRef.current = setTimeout(() => {
        try { fadingNodeRef.current?.stop() } catch { /* already stopped */ }
        fadingNodeRef.current = null
        fadeOutTimerRef.current = null
        setPlayingTrackId(null)
        setPlayStartCtxTime(null)
        setPlayStartWallTime(null)
      }, fadeOut * 1000 + 50)
      // playingTrackId stays set — UI reflects "still stopping"
    } else {
      try { activeNodeRef.current?.stop() } catch { /* already stopped */ }
      activeNodeRef.current = null
      activeTrackGainRef.current = null
      setPlayingTrackId(null)
      setPlayStartCtxTime(null)
      setPlayStartWallTime(null)
    }
  }, [])

  const playTrack = useCallback((id: string, { inPoint, outPoint }: PlayOptions, opts?: { force?: boolean }) => {
    if (!opts?.force && playingTrackId === id) {
      // Toggle off: if already fading, cancel and stop immediately
      if (fadingNodeRef.current) {
        cancelFadeTimer()
        setPlayingTrackId(null)
        setPlayStartCtxTime(null)
        return
      }
      stopAll()
      return
    }

    const ctx = getCtx()
    const buffer = bufferCache.current.get(id)
    if (!buffer) return

    const { fadeIn, crossFade } = fadeSettingsRef.current

    // Any in-progress fade-out is superseded by the new track
    cancelFadeTimer()

    const trackGain = ctx.createGain()
    trackGain.connect(masterGainRef.current!)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(trackGain)

    const offset = Math.max(0, Math.min(inPoint, buffer.duration))
    const dur = Math.max(0, Math.min(outPoint, buffer.duration) - offset)

    if (crossFade > 0 && activeNodeRef.current && activeTrackGainRef.current) {
      // Cross fade: old track fades out, new track fades in simultaneously
      const oldNode = activeNodeRef.current
      const oldGain = activeTrackGainRef.current
      oldGain.gain.cancelScheduledValues(ctx.currentTime)
      oldGain.gain.setValueAtTime(oldGain.gain.value, ctx.currentTime)
      oldGain.gain.linearRampToValueAtTime(0, ctx.currentTime + crossFade)
      fadingNodeRef.current = oldNode
      fadeOutTimerRef.current = setTimeout(() => {
        try { fadingNodeRef.current?.stop() } catch { /* already stopped */ }
        fadingNodeRef.current = null
        fadeOutTimerRef.current = null
      }, crossFade * 1000 + 50)

      trackGain.gain.setValueAtTime(0, ctx.currentTime)
      trackGain.gain.linearRampToValueAtTime(1, ctx.currentTime + crossFade)
    } else {
      try { activeNodeRef.current?.stop() } catch { /* already stopped */ }

      if (fadeIn > 0) {
        trackGain.gain.setValueAtTime(0, ctx.currentTime)
        trackGain.gain.linearRampToValueAtTime(1, ctx.currentTime + fadeIn)
      } else {
        trackGain.gain.setValueAtTime(1, ctx.currentTime)
      }
    }

    // Resume context if suspended (created before first user gesture)
    if (ctx.state === 'suspended') ctx.resume()
    source.start(0, offset, dur > 0 ? dur : undefined)
    activeNodeRef.current = source
    activeTrackGainRef.current = trackGain
    setPlayingTrackId(id)
    setPlayStartCtxTime(ctx.currentTime)
    setPlayStartWallTime(Date.now())

    source.onended = () => {
      if (activeNodeRef.current === source) {
        activeNodeRef.current = null
        activeTrackGainRef.current = null
        setPlayingTrackId(null)
        setPlayStartCtxTime(null)
        setPlayStartWallTime(null)
      }
    }
  }, [playingTrackId, stopAll])

  const stopImmediate = useCallback(() => {
    cancelFadeTimer()
    try { activeNodeRef.current?.stop() } catch { /* already stopped */ }
    activeNodeRef.current = null
    activeTrackGainRef.current = null
    setPlayingTrackId(null)
    setPlayStartCtxTime(null)
    setPlayStartWallTime(null)
  }, [])

  const setMasterVolume = useCallback((vol: number) => {
    if (masterGainRef.current) masterGainRef.current.gain.value = vol
  }, [])

  const setFadeSettings = useCallback((s: FadeSettings) => {
    fadeSettingsRef.current = s
  }, [])

  const setOutputDevices = useCallback((outputDeviceId: string, monitorDeviceId: string) => {
    outputDeviceIdRef.current = outputDeviceId
    monitorDeviceIdRef.current = monitorDeviceId
    if (ctxRef.current) {
      const active = isMonitorModeRef.current ? monitorDeviceId : outputDeviceId
      applySinkId(ctxRef.current, active)
    }
  }, [])

  const setMonitorMode = useCallback((enabled: boolean) => {
    isMonitorModeRef.current = enabled
    setIsMonitorMode(enabled)
    if (ctxRef.current) {
      const deviceId = enabled ? monitorDeviceIdRef.current : outputDeviceIdRef.current
      applySinkId(ctxRef.current, deviceId)
    }
  }, [])

  useEffect(() => {
    return () => { ctxRef.current?.close() }
  }, [])

  return {
    loadBuffer, getBuffer, playTrack, stopAll, stopImmediate,
    setMasterVolume, setFadeSettings, setOutputDevices, setMonitorMode,
    isMonitorMode,
    playingTrackId,
    audioCtx: ctxRef.current,
    playStartCtxTime,
    playStartWallTime
  }
}
