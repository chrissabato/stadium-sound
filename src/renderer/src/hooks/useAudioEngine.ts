import { useRef, useCallback, useEffect, useState } from 'react'

interface PlayOptions {
  inPoint: number
  outPoint: number
  // When set, a track with no decoded buffer streams from disk instead of
  // silently doing nothing — this is what lets a cold click (right after a
  // bank switch) start playing near-instantly.
  filePath?: string
}

export interface FadeSettings {
  fadeIn: number
  fadeOut: number
  crossFade: number
}

// Decoded PCM is huge (~22 MB per stereo minute at 48kHz), so the buffer cache
// is LRU-capped: past this many bytes the least-recently-played buffers are
// dropped. An evicted (or never-decoded) track still plays instantly via the
// streaming path — it just isn't sample-accurate until it's re-decoded.
const MAX_CACHE_BYTES = 2 * 1024 * 1024 * 1024 // 2 GiB ≈ 90 min of stereo 48kHz

// A playing "thing" — either an AudioBufferSourceNode or a streaming <audio>
// element. Everything downstream (fades, cross-fades, stop) only needs to be
// able to stop it; the gain envelope lives on a per-track GainNode either way.
interface PlaybackHandle {
  stop(): void
}

interface AudioEngine {
  loadBuffer: (id: string, filePath: string) => Promise<AudioBuffer>
  getBuffer: (id: string) => AudioBuffer | undefined
  loadingIds: Set<string>
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

function toMediaUrl(filePath: string): string {
  return 'media:///' + filePath.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/')
}

function bufferBytes(buffer: AudioBuffer): number {
  return buffer.length * buffer.numberOfChannels * 4
}

export function useAudioEngine(): AudioEngine {
  const ctxRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const bufferCache = useRef<Map<string, AudioBuffer>>(new Map())
  const cacheBytesRef = useRef(0)
  const pendingLoads = useRef<Map<string, Promise<AudioBuffer>>>(new Map())
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())

  // Active = currently playing. Fading = being faded out but not yet stopped.
  const activeHandleRef = useRef<PlaybackHandle | null>(null)
  const activeTrackGainRef = useRef<GainNode | null>(null)
  const fadingHandleRef = useRef<PlaybackHandle | null>(null)
  const fadeOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fadeSettingsRef = useRef<FadeSettings>({ fadeIn: 0, fadeOut: 0, crossFade: 0 })
  const outputDeviceIdRef = useRef<string>('')
  const monitorDeviceIdRef = useRef<string>('')
  const isMonitorModeRef = useRef<boolean>(false)
  const [isMonitorMode, setIsMonitorMode] = useState(false)

  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null)
  const playingTrackIdRef = useRef<string | null>(null)
  const [playStartCtxTime, setPlayStartCtxTime] = useState<number | null>(null)
  const [playStartWallTime, setPlayStartWallTime] = useState<number | null>(null)

  function setPlaying(id: string | null) {
    playingTrackIdRef.current = id
    setPlayingTrackId(id)
  }

  function applySinkId(ctx: AudioContext, deviceId: string) {
    // Chromium enumerates synthetic 'default'/'communications' devices that alias a real
    // sink, but setSinkId() rejects those ids as "not found". Configs saved before the
    // picker filtered them out may still have one persisted — fall back to the empty
    // string (the id setSinkId actually accepts for the system default) in that case.
    const target = deviceId === 'default' || deviceId === 'communications' ? '' : deviceId
    // setSinkId is not yet in TypeScript's lib types
    ;(ctx as unknown as { setSinkId(id: string): Promise<void> })
      .setSinkId(target)
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
    fadingHandleRef.current?.stop()
    fadingHandleRef.current = null
  }

  // Re-inserting on use keeps the Map in LRU order (oldest entry first).
  function touchBuffer(id: string, buffer: AudioBuffer) {
    bufferCache.current.delete(id)
    bufferCache.current.set(id, buffer)
  }

  function evictOverCap() {
    for (const [id, buffer] of bufferCache.current) {
      if (cacheBytesRef.current <= MAX_CACHE_BYTES) break
      if (id === playingTrackIdRef.current) continue
      bufferCache.current.delete(id)
      cacheBytesRef.current -= bufferBytes(buffer)
    }
  }

  const loadBuffer = useCallback((id: string, filePath: string): Promise<AudioBuffer> => {
    const cached = bufferCache.current.get(id)
    if (cached) {
      touchBuffer(id, cached)
      return Promise.resolve(cached)
    }

    // A background pre-load may already be decoding this exact track — share
    // that in-flight promise instead of kicking off a second, redundant
    // read+decode of the same file (this used to double the wait whenever a
    // user clicked a track before its pre-load had finished).
    const pending = pendingLoads.current.get(id)
    if (pending) return pending

    const ctx = getCtx()
    setLoadingIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))

    // Cleanup lives inside this same promise chain (not a separate .finally()
    // hung off it) so its own rejection can't become an unhandled one — the
    // caller's handling of the returned promise covers this too.
    const promise = (async () => {
      try {
        const arrayBuffer = await window.electronAPI.readAudioFile(filePath)
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
        bufferCache.current.set(id, audioBuffer)
        cacheBytesRef.current += bufferBytes(audioBuffer)
        evictOverCap()
        return audioBuffer
      } finally {
        pendingLoads.current.delete(id)
        setLoadingIds((prev) => {
          if (!prev.has(id)) return prev
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    })()

    pendingLoads.current.set(id, promise)
    return promise
  }, [])

  const getBuffer = useCallback((id: string) => bufferCache.current.get(id), [])

  const stopAll = useCallback(() => {
    cancelFadeTimer()

    const { fadeOut } = fadeSettingsRef.current

    if (activeHandleRef.current && activeTrackGainRef.current && fadeOut > 0) {
      // Fade out: keep UI state until fade completes
      const ctx = getCtx()
      const handle = activeHandleRef.current
      const gain = activeTrackGainRef.current
      gain.gain.cancelScheduledValues(ctx.currentTime)
      gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeOut)
      fadingHandleRef.current = handle
      activeHandleRef.current = null
      activeTrackGainRef.current = null
      fadeOutTimerRef.current = setTimeout(() => {
        fadingHandleRef.current?.stop()
        fadingHandleRef.current = null
        fadeOutTimerRef.current = null
        setPlaying(null)
        setPlayStartCtxTime(null)
        setPlayStartWallTime(null)
      }, fadeOut * 1000 + 50)
      // playingTrackId stays set — UI reflects "still stopping"
    } else {
      activeHandleRef.current?.stop()
      activeHandleRef.current = null
      activeTrackGainRef.current = null
      setPlaying(null)
      setPlayStartCtxTime(null)
      setPlayStartWallTime(null)
    }
  }, [])

  const playTrack = useCallback((id: string, { inPoint, outPoint, filePath }: PlayOptions, opts?: { force?: boolean }) => {
    if (!opts?.force && playingTrackId === id) {
      // Toggle off: if already fading, cancel and stop immediately
      if (fadingHandleRef.current) {
        cancelFadeTimer()
        setPlaying(null)
        setPlayStartCtxTime(null)
        return
      }
      stopAll()
      return
    }

    const ctx = getCtx()
    const buffer = bufferCache.current.get(id)
    if (!buffer && !filePath) return

    const { fadeIn, crossFade } = fadeSettingsRef.current

    // Any in-progress fade-out is superseded by the new track
    cancelFadeTimer()

    const trackGain = ctx.createGain()
    trackGain.connect(masterGainRef.current!)

    // Gain envelope + retiring the previous track works the same way for both
    // playback paths since fades live on the per-track gain nodes.
    if (crossFade > 0 && activeHandleRef.current && activeTrackGainRef.current) {
      // Cross fade: old track fades out, new track fades in simultaneously
      const oldHandle = activeHandleRef.current
      const oldGain = activeTrackGainRef.current
      oldGain.gain.cancelScheduledValues(ctx.currentTime)
      oldGain.gain.setValueAtTime(oldGain.gain.value, ctx.currentTime)
      oldGain.gain.linearRampToValueAtTime(0, ctx.currentTime + crossFade)
      fadingHandleRef.current = oldHandle
      fadeOutTimerRef.current = setTimeout(() => {
        fadingHandleRef.current?.stop()
        fadingHandleRef.current = null
        fadeOutTimerRef.current = null
      }, crossFade * 1000 + 50)

      trackGain.gain.setValueAtTime(0, ctx.currentTime)
      trackGain.gain.linearRampToValueAtTime(1, ctx.currentTime + crossFade)
    } else {
      activeHandleRef.current?.stop()

      if (fadeIn > 0) {
        trackGain.gain.setValueAtTime(0, ctx.currentTime)
        trackGain.gain.linearRampToValueAtTime(1, ctx.currentTime + fadeIn)
      } else {
        trackGain.gain.setValueAtTime(1, ctx.currentTime)
      }
    }

    // Resume context if suspended (created before first user gesture). The
    // streaming path needs this too — a media element routed through a
    // suspended context is silent.
    if (ctx.state === 'suspended') ctx.resume()

    let handle: PlaybackHandle
    const finish = () => {
      if (activeHandleRef.current === handle) {
        activeHandleRef.current = null
        activeTrackGainRef.current = null
        setPlaying(null)
        setPlayStartCtxTime(null)
        setPlayStartWallTime(null)
      }
    }

    if (buffer) {
      touchBuffer(id, buffer)

      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(trackGain)

      const offset = Math.max(0, Math.min(inPoint, buffer.duration))
      const dur = Math.max(0, Math.min(outPoint, buffer.duration) - offset)
      source.start(0, offset, dur > 0 ? dur : undefined)

      handle = { stop: () => { try { source.stop() } catch { /* already stopped */ } } }
      source.onended = finish
    } else {
      // No decoded buffer yet — stream the file through a media element so
      // playback starts immediately. The caller kicks off a background decode,
      // so the *next* play of this track uses the sample-accurate buffer path.
      const el = new Audio()
      el.preload = 'auto'
      el.src = toMediaUrl(filePath!)
      const srcNode = ctx.createMediaElementSource(el)
      srcNode.connect(trackGain)
      if (inPoint > 0) el.currentTime = inPoint

      // Media elements have no built-in out-point; poll for it. ~50ms accuracy
      // is acceptable for the single cold play this path covers.
      const stopAt = outPoint > 0 ? outPoint : Infinity
      let watchdog: ReturnType<typeof setInterval> | null = Number.isFinite(stopAt)
        ? setInterval(() => {
            if (el.currentTime >= stopAt) { handle.stop(); finish() }
          }, 50)
        : null

      handle = {
        stop: () => {
          if (watchdog) { clearInterval(watchdog); watchdog = null }
          el.onended = null
          el.onerror = null
          el.pause()
          el.removeAttribute('src')
          el.load()
          try { srcNode.disconnect() } catch { /* already disconnected */ }
        }
      }
      el.onended = () => { handle.stop(); finish() }
      el.onerror = () => { handle.stop(); finish() }
      el.play().catch(() => { /* load failures land in onerror */ })
    }

    activeHandleRef.current = handle
    activeTrackGainRef.current = trackGain
    setPlaying(id)
    setPlayStartCtxTime(ctx.currentTime)
    setPlayStartWallTime(Date.now())
  }, [playingTrackId, stopAll])

  const stopImmediate = useCallback(() => {
    cancelFadeTimer()
    activeHandleRef.current?.stop()
    activeHandleRef.current = null
    activeTrackGainRef.current = null
    setPlaying(null)
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
    return () => {
      cancelFadeTimer()
      activeHandleRef.current?.stop()
      activeHandleRef.current = null
      ctxRef.current?.close()
      ctxRef.current = null
    }
  }, [])

  return {
    loadBuffer, getBuffer, loadingIds, playTrack, stopAll, stopImmediate,
    setMasterVolume, setFadeSettings, setOutputDevices, setMonitorMode,
    isMonitorMode,
    playingTrackId,
    audioCtx: ctxRef.current,
    playStartCtxTime,
    playStartWallTime
  }
}
