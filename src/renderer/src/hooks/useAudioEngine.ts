import { useRef, useCallback, useEffect, useState } from 'react'

interface PlayOptions {
  inPoint: number
  outPoint: number
  filePath: string
  volume?: number
}

export interface FadeSettings {
  fadeIn: number
  fadeOut: number
  crossFade: number
}

// Two independent audio buses, each permanently pinned to its own physical
// output device: 'main' is the venue/PA output, 'monitor' is a private cue
// output (headphones/booth speaker) that can play a second track while the
// main bus keeps going. They never share a destination or an AudioContext.
export type AudioBus = 'main' | 'monitor'

// Decoded PCM is huge (~22 MB per stereo minute at 48kHz), so full songs are
// never pre-decoded — they stream from disk via the media:// protocol, which
// keeps memory constant regardless of bank size. Decoding is reserved for
// short clips (SFX, stingers, walk-up cuts) where retrigger feel and tight
// in/out points benefit from the sample-accurate buffer path.
export const CLIP_DECODE_MAX_SECONDS = 30

// The decoded-buffer cache is LRU-capped: past this many bytes the
// least-recently-played buffers are dropped. An evicted (or never-decoded)
// track still plays instantly via the streaming path — it just isn't
// sample-accurate until it's re-decoded.
const MAX_CACHE_BYTES = 512 * 1024 * 1024 // 512 MiB ≈ 23 min of stereo 48kHz PCM

// A playing "thing" — either an AudioBufferSourceNode or a streaming <audio>
// element. Everything downstream (fades, cross-fades, stop) only needs to be
// able to stop it; the gain envelope lives on a per-track GainNode either way.
interface PlaybackHandle {
  stop(): void
}

// Per-bus playback state. Each bus gets its own AudioContext/destination
// (so it can be pinned to its own physical device) and its own single active
// voice — this is a soundboard, not a mixer, so within a bus a new play
// always retires the previous one (fade/cross-fade aside). Buffers, the
// decode cache, and fade settings are shared across both buses.
interface BusState {
  ctx: AudioContext | null
  masterGain: GainNode | null
  analyserL: AnalyserNode | null
  analyserR: AnalyserNode | null
  activeHandle: PlaybackHandle | null
  activeTrackGain: GainNode | null
  fadingHandle: PlaybackHandle | null
  fadingTrackGain: GainNode | null
  fadeOutTimer: ReturnType<typeof setTimeout> | null
  playingId: string | null
  playingFilePath: string | null
}

function newBusState(): BusState {
  return {
    ctx: null,
    masterGain: null,
    analyserL: null,
    analyserR: null,
    activeHandle: null,
    activeTrackGain: null,
    fadingHandle: null,
    fadingTrackGain: null,
    fadeOutTimer: null,
    playingId: null,
    playingFilePath: null
  }
}

export interface BusAnalysers {
  left: AnalyserNode
  right: AnalyserNode
}

interface PlaybackSnapshot {
  id: string | null
  ctxTime: number | null
  wallTime: number | null
}

const EMPTY_PLAYBACK: PlaybackSnapshot = { id: null, ctxTime: null, wallTime: null }

interface AudioEngine {
  loadBuffer: (id: string, filePath: string) => Promise<AudioBuffer>
  decodeTransient: (filePath: string) => Promise<AudioBuffer>
  getBuffer: (filePath: string) => AudioBuffer | undefined
  loadingIds: Set<string>
  playTrack: (id: string, opts: PlayOptions, playOpts?: { force?: boolean; bus?: AudioBus }) => void
  stopAll: () => void
  stopImmediate: () => void
  stopMonitor: () => void
  stopMonitorImmediate: () => void
  setMasterVolume: (vol: number) => void
  setFadeSettings: (s: FadeSettings) => void
  setOutputDevices: (outputDeviceId: string, monitorDeviceId: string) => void
  setMonitorMode: (enabled: boolean) => void
  isMonitorMode: boolean
  getBusAnalysers: (bus: AudioBus) => BusAnalysers | null
  playingTrackId: string | null
  audioCtx: AudioContext | null
  playStartCtxTime: number | null
  playStartWallTime: number | null
  monitorPlayingTrackId: string | null
  monitorAudioCtx: AudioContext | null
  monitorPlayStartCtxTime: number | null
  monitorPlayStartWallTime: number | null
}

function toMediaUrl(filePath: string): string {
  return 'media:///' + filePath.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/')
}

function bufferBytes(buffer: AudioBuffer): number {
  return buffer.length * buffer.numberOfChannels * 4
}

export function useAudioEngine(): AudioEngine {
  const mainRef = useRef<BusState>(newBusState())
  const monitorRef = useRef<BusState>(newBusState())
  function busState(bus: AudioBus): BusState {
    return bus === 'main' ? mainRef.current : monitorRef.current
  }

  // Decoded buffers are keyed by file path (not track id) so the same file
  // referenced from several banks/playlists — or from both buses — is
  // decoded and counted once. AudioBuffers aren't tied to a specific
  // AudioContext, so both buses' BufferSourceNodes can share one cache.
  const bufferCache = useRef<Map<string, AudioBuffer>>(new Map())
  const cacheBytesRef = useRef(0)
  const pendingLoads = useRef<Map<string, Promise<AudioBuffer>>>(new Map())
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())

  const fadeSettingsRef = useRef<FadeSettings>({ fadeIn: 0, fadeOut: 0, crossFade: 0 })
  const outputDeviceIdRef = useRef<string>('')
  const monitorDeviceIdRef = useRef<string>('')
  const isMonitorModeRef = useRef<boolean>(false)
  const [isMonitorMode, setIsMonitorMode] = useState(false)
  // Tracks the last value passed to setMasterVolume so a bus's GainNode,
  // if created lazily well after the user has already moved the volume
  // slider, starts at the current volume instead of defaulting to 1.
  const masterVolumeRef = useRef<number>(1)

  const [mainPlayback, setMainPlayback] = useState<PlaybackSnapshot>(EMPTY_PLAYBACK)
  const [monitorPlayback, setMonitorPlayback] = useState<PlaybackSnapshot>(EMPTY_PLAYBACK)

  function setPlayingState(bus: AudioBus, id: string | null, filePath: string | null = null, ctx?: AudioContext) {
    const state = busState(bus)
    state.playingId = id
    state.playingFilePath = filePath
    const setter = bus === 'main' ? setMainPlayback : setMonitorPlayback
    setter(id === null ? EMPTY_PLAYBACK : { id, ctxTime: ctx!.currentTime, wallTime: Date.now() })
  }

  function markLoading(id: string) {
    setLoadingIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
  }

  function unmarkLoading(id: string) {
    setLoadingIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
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

  // Lazily creates the given bus's AudioContext, pinned permanently to that
  // bus's configured device — main always targets outputDeviceId, monitor
  // always targets monitorDeviceId. Unlike the old single-context design,
  // a bus's sink is never swapped after creation; the two buses simply exist
  // side by side.
  function getCtx(bus: AudioBus): AudioContext {
    const state = busState(bus)
    if (!state.ctx) {
      state.ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 })
      state.masterGain = state.ctx.createGain()
      state.masterGain.gain.value = masterVolumeRef.current
      state.masterGain.connect(state.ctx.destination)

      // Level-meter tap: a parallel splitter+analyser pair off the master gain,
      // never inline with the destination path, so meters can be read (or the
      // splitter simply left unused) without any risk of altering the output.
      const splitter = state.ctx.createChannelSplitter(2)
      state.masterGain.connect(splitter)
      state.analyserL = state.ctx.createAnalyser()
      state.analyserL.fftSize = 256
      state.analyserL.smoothingTimeConstant = 0.4
      state.analyserR = state.ctx.createAnalyser()
      state.analyserR.fftSize = 256
      state.analyserR.smoothingTimeConstant = 0.4
      splitter.connect(state.analyserL, 0)
      splitter.connect(state.analyserR, 1)

      const deviceId = bus === 'main' ? outputDeviceIdRef.current : monitorDeviceIdRef.current
      if (deviceId) applySinkId(state.ctx, deviceId)

      // The only other resume() call site is a one-shot check in playTrack, at
      // the moment a new track starts — it can't recover a context that drops
      // to 'suspended'/'interrupted' mid-playback (e.g. a device hiccup) with
      // no further plays on this bus. Without this, currentTime freezes and
      // the analysers keep returning stale data — no exception, so the
      // status indicators just silently stop advancing forever.
      state.ctx.addEventListener('statechange', () => {
        if (state.ctx && state.ctx.state !== 'closed' && state.ctx.state !== 'running') {
          console.warn(`[audio] ${bus} ctx left running (${state.ctx.state}), auto-resuming`)
          state.ctx.resume().catch((err) => console.error(`[audio] ${bus} ctx resume() failed`, err))
        }
      })
    }
    return state.ctx
  }

  function cancelFadeTimer(bus: AudioBus) {
    const state = busState(bus)
    if (state.fadeOutTimer) {
      clearTimeout(state.fadeOutTimer)
      state.fadeOutTimer = null
    }
    state.fadingHandle?.stop()
    state.fadingHandle = null
    // Every fade/cross-fade retires its old track's GainNode here — without
    // this it stays connected to masterGain forever, so a long show with
    // many fades slowly accumulates dead nodes in the live graph.
    try { state.fadingTrackGain?.disconnect() } catch { /* already disconnected */ }
    state.fadingTrackGain = null
  }

  // Re-inserting on use keeps the Map in LRU order (oldest entry first).
  function touchBuffer(filePath: string, buffer: AudioBuffer) {
    bufferCache.current.delete(filePath)
    bufferCache.current.set(filePath, buffer)
  }

  function evictOverCap() {
    for (const [filePath, buffer] of bufferCache.current) {
      if (cacheBytesRef.current <= MAX_CACHE_BYTES) break
      if (filePath === mainRef.current.playingFilePath || filePath === monitorRef.current.playingFilePath) continue
      bufferCache.current.delete(filePath)
      cacheBytesRef.current -= bufferBytes(buffer)
    }
  }

  const loadBuffer = useCallback((id: string, filePath: string): Promise<AudioBuffer> => {
    const cached = bufferCache.current.get(filePath)
    if (cached) {
      touchBuffer(filePath, cached)
      return Promise.resolve(cached)
    }

    // A background pre-load may already be decoding this exact file — share
    // that in-flight promise instead of kicking off a second, redundant
    // read+decode of the same file (this used to double the wait whenever a
    // user clicked a track before its pre-load had finished). The pending
    // decode may have been started under a *different* track id (same file in
    // two banks/playlists), so this caller's spinner still needs registering.
    const pending = pendingLoads.current.get(filePath)
    if (pending) {
      markLoading(id)
      return pending.then((audioBuffer) => {
        if (!bufferCache.current.has(filePath)) {
          bufferCache.current.set(filePath, audioBuffer)
          cacheBytesRef.current += bufferBytes(audioBuffer)
          evictOverCap()
        }
        return audioBuffer
      }).finally(() => unmarkLoading(id))
    }

    // Decoding always happens via the main bus's context — AudioBuffers
    // aren't tied to a context, so it doesn't matter which bus eventually
    // plays the result; this just preserves the existing lazy-init timing.
    const ctx = getCtx('main')
    markLoading(id)

    // Cleanup lives inside this same promise chain (not a separate .finally()
    // hung off it) so its own rejection can't become an unhandled one — the
    // caller's handling of the returned promise covers this too.
    const promise = (async () => {
      try {
        const arrayBuffer = await window.electronAPI.readAudioFile(filePath)
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
        bufferCache.current.set(filePath, audioBuffer)
        cacheBytesRef.current += bufferBytes(audioBuffer)
        evictOverCap()
        return audioBuffer
      } finally {
        pendingLoads.current.delete(filePath)
        unmarkLoading(id)
      }
    })()

    pendingLoads.current.set(filePath, promise)
    return promise
  }, [])

  // Decode WITHOUT inserting into the LRU playback cache. For transient uses
  // (waveform editing) of files too long to be worth caching — a full song's
  // PCM parked in the cache would evict the warmed short-clip buffers the
  // cache exists to keep hot. Reuses a cached/in-flight decode when one
  // happens to exist.
  const decodeTransient = useCallback(async (filePath: string): Promise<AudioBuffer> => {
    const cached = bufferCache.current.get(filePath)
    if (cached) return cached
    const pending = pendingLoads.current.get(filePath)
    if (pending) return pending
    const promise = (async () => {
      try {
        const arrayBuffer = await window.electronAPI.readAudioFile(filePath)
        return await getCtx('main').decodeAudioData(arrayBuffer)
      } finally {
        pendingLoads.current.delete(filePath)
      }
    })()
    pendingLoads.current.set(filePath, promise)
    return promise
  }, [])

  const getBuffer = useCallback((filePath: string) => bufferCache.current.get(filePath), [])

  function stopBus(bus: AudioBus, immediate: boolean) {
    const state = busState(bus)
    cancelFadeTimer(bus)

    const { fadeOut } = fadeSettingsRef.current

    if (!immediate && state.activeHandle && state.activeTrackGain && fadeOut > 0) {
      // Fade out: keep UI state until fade completes
      const ctx = getCtx(bus)
      const handle = state.activeHandle
      const gain = state.activeTrackGain
      gain.gain.cancelScheduledValues(ctx.currentTime)
      gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeOut)
      state.fadingHandle = handle
      state.fadingTrackGain = gain
      state.activeHandle = null
      state.activeTrackGain = null
      state.fadeOutTimer = setTimeout(() => {
        state.fadingHandle?.stop()
        state.fadingHandle = null
        try { state.fadingTrackGain?.disconnect() } catch { /* already disconnected */ }
        state.fadingTrackGain = null
        state.fadeOutTimer = null
        setPlayingState(bus, null)
      }, fadeOut * 1000 + 50)
      // playingId stays set — UI reflects "still stopping"
    } else {
      state.activeHandle?.stop()
      try { state.activeTrackGain?.disconnect() } catch { /* already disconnected */ }
      state.activeHandle = null
      state.activeTrackGain = null
      setPlayingState(bus, null)
    }
  }

  const stopAll = useCallback(() => stopBus('main', false), [])
  const stopImmediate = useCallback(() => stopBus('main', true), [])
  const stopMonitor = useCallback(() => stopBus('monitor', false), [])
  const stopMonitorImmediate = useCallback(() => stopBus('monitor', true), [])

  const playTrack = useCallback((
    id: string,
    { inPoint, outPoint, filePath, volume }: PlayOptions,
    playOpts?: { force?: boolean; bus?: AudioBus }
  ) => {
    const bus: AudioBus = playOpts?.bus ?? (isMonitorModeRef.current ? 'monitor' : 'main')
    const state = busState(bus)

    if (!playOpts?.force && state.playingId === id) {
      // Toggle off: if already fading, cancel and stop immediately
      if (state.fadingHandle) {
        cancelFadeTimer(bus)
        setPlayingState(bus, null)
        return
      }
      stopBus(bus, false)
      return
    }

    const ctx = getCtx(bus)
    const buffer = bufferCache.current.get(filePath)
    // The type requires filePath, but runtime data can still carry an empty
    // one (old/hand-edited event sets load unvalidated) — bail before touching
    // current playback so a broken button can't silence live audio.
    if (!buffer && !filePath) return

    const { fadeIn, crossFade } = fadeSettingsRef.current

    // Any in-progress fade-out is superseded by the new track
    cancelFadeTimer(bus)

    const trackGain = ctx.createGain()
    trackGain.connect(state.masterGain!)

    // Per-track level is the fade envelope's ceiling: fades ramp to it
    // instead of to 1, so a track set to 60% fades in/cross-fades up to 60%.
    const level = volume ?? 1

    // Gain envelope + retiring the previous track works the same way for both
    // playback paths since fades live on the per-track gain nodes.
    if (crossFade > 0 && state.activeHandle && state.activeTrackGain) {
      // Cross fade: old track fades out, new track fades in simultaneously
      const oldHandle = state.activeHandle
      const oldGain = state.activeTrackGain
      oldGain.gain.cancelScheduledValues(ctx.currentTime)
      oldGain.gain.setValueAtTime(oldGain.gain.value, ctx.currentTime)
      oldGain.gain.linearRampToValueAtTime(0, ctx.currentTime + crossFade)
      state.fadingHandle = oldHandle
      state.fadingTrackGain = oldGain
      state.fadeOutTimer = setTimeout(() => {
        state.fadingHandle?.stop()
        state.fadingHandle = null
        try { state.fadingTrackGain?.disconnect() } catch { /* already disconnected */ }
        state.fadingTrackGain = null
        state.fadeOutTimer = null
      }, crossFade * 1000 + 50)

      trackGain.gain.setValueAtTime(0, ctx.currentTime)
      trackGain.gain.linearRampToValueAtTime(level, ctx.currentTime + crossFade)
    } else {
      state.activeHandle?.stop()
      try { state.activeTrackGain?.disconnect() } catch { /* already disconnected */ }

      if (fadeIn > 0) {
        trackGain.gain.setValueAtTime(0, ctx.currentTime)
        trackGain.gain.linearRampToValueAtTime(level, ctx.currentTime + fadeIn)
      } else {
        trackGain.gain.setValueAtTime(level, ctx.currentTime)
      }
    }

    // Resume context if suspended (created before first user gesture). The
    // streaming path needs this too — a media element routed through a
    // suspended context is silent.
    if (ctx.state === 'suspended') ctx.resume()

    let handle: PlaybackHandle
    const finish = () => {
      if (state.activeHandle === handle) {
        state.activeHandle = null
        state.activeTrackGain = null
        setPlayingState(bus, null)
      }
    }

    if (buffer) {
      touchBuffer(filePath, buffer)

      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(trackGain)

      const offset = Math.max(0, Math.min(inPoint, buffer.duration))
      const dur = Math.max(0, Math.min(outPoint, buffer.duration) - offset)
      source.start(0, offset, dur > 0 ? dur : undefined)

      handle = { stop: () => { try { source.stop() } catch { /* already stopped */ } } }
      source.onended = finish
    } else {
      // No decoded buffer — stream the file through a media element. This is
      // the normal path for full songs (which are never pre-decoded); for
      // short clips the caller kicks off a background decode so the *next*
      // play uses the sample-accurate buffer path.
      const el = new Audio()
      el.preload = 'auto'
      el.src = toMediaUrl(filePath)
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
      el.onerror = () => {
        // Previously swallowed silently — a mid-playback media error left
        // status displays with nothing to explain why. Now surfaced so a
        // freeze report can be matched to an actual decode/network failure.
        console.error('[audio] media element error', {
          filePath, bus, code: el.error?.code, message: el.error?.message,
          networkState: el.networkState, readyState: el.readyState
        })
        handle.stop()
        finish()
      }
      el.play().catch((err) => console.error('[audio] el.play() rejected', { filePath, bus, err }))
    }

    state.activeHandle = handle
    state.activeTrackGain = trackGain
    setPlayingState(bus, id, filePath, ctx)
  }, [])

  const setMasterVolume = useCallback((vol: number) => {
    masterVolumeRef.current = vol
    if (mainRef.current.masterGain) mainRef.current.masterGain.gain.value = vol
    if (monitorRef.current.masterGain) monitorRef.current.masterGain.gain.value = vol
  }, [])

  const setFadeSettings = useCallback((s: FadeSettings) => {
    fadeSettingsRef.current = s
  }, [])

  const setOutputDevices = useCallback((outputDeviceId: string, monitorDeviceId: string) => {
    outputDeviceIdRef.current = outputDeviceId
    monitorDeviceIdRef.current = monitorDeviceId
    if (mainRef.current.ctx) applySinkId(mainRef.current.ctx, outputDeviceId)
    if (monitorRef.current.ctx) applySinkId(monitorRef.current.ctx, monitorDeviceId)
  }, [])

  const setMonitorMode = useCallback((enabled: boolean) => {
    // Pure "arm" flag — routes the next manually-triggered playTrack() call
    // to the monitor bus. No sink-swap side effect: each bus is already
    // permanently pinned to its own device, so arming/disarming never
    // touches whatever is currently playing on either bus.
    isMonitorModeRef.current = enabled
    setIsMonitorMode(enabled)
  }, [])

  const getBusAnalysers = useCallback((bus: AudioBus): BusAnalysers | null => {
    const state = busState(bus)
    return state.analyserL && state.analyserR ? { left: state.analyserL, right: state.analyserR } : null
  }, [])

  useEffect(() => {
    return () => {
      cancelFadeTimer('main')
      cancelFadeTimer('monitor')
      mainRef.current.activeHandle?.stop()
      mainRef.current.activeHandle = null
      monitorRef.current.activeHandle?.stop()
      monitorRef.current.activeHandle = null
      mainRef.current.ctx?.close()
      monitorRef.current.ctx?.close()
      // Reset the whole bus, not just ctx — otherwise masterGain/analyserL/R
      // keep pointing at nodes belonging to the now-closed context, and
      // getBusAnalysers() would keep handing out "live-looking" analysers
      // that silently never produce new data again.
      mainRef.current = newBusState()
      monitorRef.current = newBusState()
    }
  }, [])

  return {
    loadBuffer, decodeTransient, getBuffer, loadingIds, playTrack,
    stopAll, stopImmediate, stopMonitor, stopMonitorImmediate,
    setMasterVolume, setFadeSettings, setOutputDevices, setMonitorMode,
    isMonitorMode,
    getBusAnalysers,
    playingTrackId: mainPlayback.id,
    audioCtx: mainRef.current.ctx,
    playStartCtxTime: mainPlayback.ctxTime,
    playStartWallTime: mainPlayback.wallTime,
    monitorPlayingTrackId: monitorPlayback.id,
    monitorAudioCtx: monitorRef.current.ctx,
    monitorPlayStartCtxTime: monitorPlayback.ctxTime,
    monitorPlayStartWallTime: monitorPlayback.wallTime
  }
}
