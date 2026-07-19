import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAudioEngine, CLIP_DECODE_MAX_SECONDS, type AudioBus } from './hooks/useAudioEngine'
import { useConfig } from './hooks/useConfig'
import { useLibraries } from './hooks/useLibraries'
import { Toolbar } from './components/Toolbar'
import type { TrackSearchHandle } from './components/TrackSearch'
import { Sidebar } from './components/Sidebar'
import { TrackGrid } from './components/TrackGrid'
import { NowPlayingBar } from './components/NowPlayingBar'
import { LevelMeters } from './components/LevelMeters'
import { TrackEditor } from './components/TrackEditor'
import { Settings } from './components/Settings'
import { FeedbackModal } from './components/FeedbackModal'
import { PlaylistPanel } from './components/PlaylistPanel'
import { ShortcutsModal } from './components/ShortcutsModal'
import { LibraryManager } from './components/LibraryManager'
import { AddFromLibraryModal } from './components/AddFromLibraryModal'
import { ConfirmDialog } from './components/ConfirmDialog'
import type { Bank, Track, Playlist, PlaylistTrack, LibraryTrack } from './types'
import { normalizeHotkeyEvent } from './types'

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

const EMPTY_PLAYED_IDS = new Set<string>()

// The event set autosaves on every change, so a deletion is committed to disk
// the moment it happens — destructive actions go through a ConfirmDialog first.
type ConfirmRequest = {
  title: string
  message: string
  confirmLabel: string
  action: () => void
}

// Only short played ranges are worth decoding to PCM — full songs stream from
// disk. Unknown duration (failed metadata read) is treated as long, i.e.
// streamed, until a reprobe can self-heal it.
function shouldDecode(t: { duration: number; inPoint?: number; outPoint?: number }): boolean {
  const inPoint = t.inPoint ?? 0
  const outPoint = t.outPoint || t.duration
  const played = outPoint - inPoint
  return played > 0 && played <= CLIP_DECODE_MAX_SECONDS
}

type DecodeRange = {
  duration: number | Promise<number>
  inPoint?: number
  outPoint?: number
}

// Runs `tasks` with at most `limit` in flight at once. Keeping background
// buffer pre-loads capped (rather than firing all of them at once) leaves
// decode capacity free so an on-demand click for a not-yet-started track
// can jump the queue instead of waiting behind a big burst of decodes.
async function runWithConcurrency(tasks: (() => Promise<unknown>)[], limit: number): Promise<void> {
  let next = 0
  async function worker() {
    while (next < tasks.length) {
      const task = tasks[next++]
      await task().catch(() => {})
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
}

export default function App() {
  const { config, currentFilePath, updateConfig, loaded, audioDevices, setAudioDevices, showTrackTooltips, setShowTrackTooltips, showPlayedIndicator, setShowPlayedIndicator, showMeters, setShowMeters, uiZoom, setUiZoom } = useConfig()
  const audio = useAudioEngine()
  const libraries = useLibraries()
  const [editingTrack, setEditingTrack] = useState<Track | null>(null)
  const [nowPlayingTrack, setNowPlayingTrack] = useState<Track | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [libraryManagerOpen, setLibraryManagerOpen] = useState(false)
  const [addFromLibraryTarget, setAddFromLibraryTarget] = useState<'bank' | 'playlist' | null>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [playedIds, setPlayedIds] = useState<Set<string>>(new Set())
  const [isReordering, setIsReordering] = useState(false)
  const [missingFileIds, setMissingFileIds] = useState<Set<string>>(new Set())
  const [showPlaylistPanel, setShowPlaylistPanel] = useState(false)
  const [isAddToPlaylistMode, setIsAddToPlaylistMode] = useState(false)
  const [playingPlaylistId, setPlayingPlaylistId] = useState<string | null>(null)
  const [playlistIndex, setPlaylistIndex] = useState(-1)
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(-1)
  const [highlightedTrackId, setHighlightedTrackId] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null)
  const suppressPlaylistAdvanceRef = useRef(false)
  const searchRef = useRef<TrackSearchHandle>(null)

  const resetPlayed = () => setPlayedIds(new Set())

  const verifyTracks = async () => {
    const allTracks = config.banks.flatMap((b) => b.tracks)
    const paths = allTracks.map((t) => t.filePath)
    const results = await window.electronAPI.checkFiles(paths)
    const missing = new Set(allTracks.filter((_, i) => !results[i]).map((t) => t.id))
    setMissingFileIds(missing)
  }

  useEffect(() => {
    return window.electronAPI.window.onFullscreenChange(setIsFullscreen)
  }, [])

  // Keep audio engine in sync with persisted fade settings
  useEffect(() => {
    audio.setFadeSettings({
      fadeIn: config.fadeIn ?? 0,
      fadeOut: config.fadeOut ?? 0,
      crossFade: config.crossFade ?? 0
    })
  }, [config.fadeIn, config.fadeOut, config.crossFade])

  // Keep audio engine in sync with output device selection
  useEffect(() => {
    audio.setOutputDevices(audioDevices.outputDeviceId, audioDevices.monitorDeviceId)
  }, [audioDevices.outputDeviceId, audioDevices.monitorDeviceId])

  // Settings stores '' for "System Default" (legacy configs may hold Chromium's
  // synthetic 'default'/'communications' ids). To tell whether the monitor and
  // main outputs are physically the same device, resolve those aliases to the
  // concrete device backing the system default — matched via the synthetic
  // 'default' entry's groupId, falling back to its "Default - <label>" label.
  const [systemDefaultDeviceId, setSystemDefaultDeviceId] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    async function refresh() {
      try {
        const outputs = (await navigator.mediaDevices.enumerateDevices())
          .filter((d) => d.kind === 'audiooutput')
        const def = outputs.find((d) => d.deviceId === 'default')
        const real = def && outputs.find((d) =>
          d.deviceId !== 'default' && d.deviceId !== 'communications' &&
          (d.groupId === def.groupId || (d.label !== '' && def.label.endsWith(d.label))))
        if (!cancelled) setSystemDefaultDeviceId(real?.deviceId ?? null)
      } catch {
        if (!cancelled) setSystemDefaultDeviceId(null)
      }
    }
    refresh()
    navigator.mediaDevices.addEventListener('devicechange', refresh)
    return () => {
      cancelled = true
      navigator.mediaDevices.removeEventListener('devicechange', refresh)
    }
  }, [])

  const resolveDeviceId = (id: string) =>
    id === '' || id === 'default' || id === 'communications' ? systemDefaultDeviceId : id
  // Both selections pointing at the default alias always count as the same
  // device, even when the default couldn't be resolved (null === null).
  const monitorMatchesOutput =
    resolveDeviceId(audioDevices.outputDeviceId) === resolveDeviceId(audioDevices.monitorDeviceId)

  // If a device change (or settings edit) collapses monitor and main onto the
  // same device while the monitor bus is armed, disarm it — the button is
  // disabled in that state, so it could never be un-armed by hand.
  useEffect(() => {
    if (monitorMatchesOutput && audio.isMonitorMode) audio.setMonitorMode(false)
  }, [monitorMatchesOutput, audio.isMonitorMode])

  // Keep audio engine in sync with the persisted master volume — without this
  // the engine plays at full volume after a restart until the slider is moved.
  useEffect(() => {
    audio.setMasterVolume(config.masterVolume ?? 1)
  }, [config.masterVolume])

  const selectedBank = config.banks.find((b) => b.id === config.selectedBankId) ?? null
  const selectedPlaylist = (config.playlists ?? []).find((p) => p.id === config.selectedPlaylistId) ?? null
  const hasUnplayedTracks = !!selectedBank?.tracks.some((t) => !playedIds.has(t.id) && !missingFileIds.has(t.id))

  // Lets the Sidebar flag which bank owns the track currently cued on the
  // monitor bus, so it stays visible even after switching to a different bank.
  const monitorPlayingBankId = audio.monitorPlayingTrackId
    ? config.banks.find((b) => b.tracks.some((t) => t.id === audio.monitorPlayingTrackId))?.id ?? null
    : null

  function selectBank(id: string) {
    setIsReordering(false)
    updateConfig((c) => ({ ...c, selectedBankId: id }))
  }

  function jumpToSearchResult(bankId: string, track: Track) {
    selectBank(bankId)
    setHighlightedTrackId(track.id)
  }

  // Auto-fade the search-result highlight after a few seconds.
  useEffect(() => {
    if (!highlightedTrackId) return
    const t = setTimeout(() => setHighlightedTrackId(null), 2500)
    return () => clearTimeout(t)
  }, [highlightedTrackId])

  function addBank(name: string) {
    const bank: Bank = { id: makeId(), name, tracks: [] }
    updateConfig((c) => ({
      ...c,
      banks: [...c.banks, bank],
      selectedBankId: bank.id
    }))
  }

  function renameBank(id: string, name: string) {
    updateConfig((c) => ({
      ...c,
      banks: c.banks.map((b) => b.id === id ? { ...b, name } : b)
    }))
  }

  function deleteBank(id: string) {
    updateConfig((c) => {
      const banks = c.banks.filter((b) => b.id !== id)
      const selectedBankId = c.selectedBankId === id ? (banks[0]?.id ?? '') : c.selectedBankId
      return { ...c, banks, selectedBankId }
    })
    if (audio.playingTrackId) {
      const track = selectedBank?.tracks.find((t) => t.id === audio.playingTrackId)
      if (track) { breakPlaylistChain(); audio.stopAll(); setNowPlayingTrack(null) }
    }
  }

  async function addTracksByPaths(paths: string[]) {
    if (!paths.length || !config.selectedBankId) return

    const newTracks: Track[] = await Promise.all(
      paths.map(async (filePath) => {
        const meta = await window.electronAPI.getTrackMetadata(filePath)
        const id = makeId()
        // Pre-decode short clips so their first click is sample-accurate;
        // songs stream on demand.
        if (shouldDecode(meta)) audio.loadBuffer(id, filePath).catch(() => {})
        return {
          id,
          filePath,
          artist: meta.artist,
          title: meta.title,
          duration: meta.duration,
          inPoint: 0,
          outPoint: meta.duration
        }
      })
    )

    updateConfig((c) => ({
      ...c,
      banks: c.banks.map((b) =>
        b.id === c.selectedBankId ? { ...b, tracks: [...b.tracks, ...newTracks] } : b
      )
    }))
    warmClips(newTracks)
  }

  async function addTracks() {
    const paths = await window.electronAPI.openAudioFiles()
    await addTracksByPaths(paths)
  }

  function addLibraryTracksToBank(libTracks: LibraryTrack[]) {
    if (!config.selectedBankId) return
    const newTracks: Track[] = libTracks.map((t) => {
      const id = makeId()
      if (shouldDecode(t)) audio.loadBuffer(id, t.filePath).catch(() => {})
      return {
        id,
        filePath: t.filePath,
        artist: t.artist,
        title: t.title,
        duration: t.duration,
        inPoint: 0,
        outPoint: t.duration
      }
    })
    updateConfig((c) => ({
      ...c,
      banks: c.banks.map((b) =>
        b.id === c.selectedBankId ? { ...b, tracks: [...b.tracks, ...newTracks] } : b
      )
    }))
    warmClips(newTracks)
  }

  function addLibraryTracksToPlaylist(libTracks: LibraryTrack[]) {
    if (!config.selectedPlaylistId) return
    const newTracks: PlaylistTrack[] = libTracks.map((t) => {
      const id = makeId()
      if (shouldDecode(t)) audio.loadBuffer(id, t.filePath).catch(() => {})
      return {
        id,
        itemId: id,
        filePath: t.filePath,
        artist: t.artist,
        title: t.title,
        duration: t.duration,
        inPoint: 0,
        outPoint: t.duration
      }
    })
    updateConfig((c) => ({
      ...c,
      playlists: (c.playlists ?? []).map((p) =>
        p.id === c.selectedPlaylistId ? { ...p, tracks: [...p.tracks, ...newTracks] } : p
      )
    }))
    warmClips(newTracks)
  }

  // Always (re)starts playback of this track, bypassing the toggle-off shortcut —
  // used by the playlist transport, which should never silently no-op even if
  // engine state looks like this track is already playing (e.g. it stalled).
  // bus defaults to 'main' so playlist call sites (which never pass it) are
  // always unaffected by whether Monitor mode is currently armed.
  function playTrackForce(track: Track, bus: AudioBus = 'main') {
    // Re-check this track's file on every press — the same check Verify Tracks
    // runs — without delaying the play attempt. A vanished file flips the cell
    // to the missing styling right away instead of failing silently; a
    // restored one sheds a stale missing mark.
    window.electronAPI.checkFiles([track.filePath]).then(([exists]) => {
      if (!exists) {
        setMissingFileIds((prev) => prev.has(track.id) ? prev : new Set(prev).add(track.id))
        // A track whose file is gone never actually played, and the played
        // tint wins over the missing styling in TrackCell — undo the
        // optimistic played mark below so the missing state is visible.
        setPlayedIds((prev) => {
          if (!prev.has(track.id)) return prev
          const next = new Set(prev)
          next.delete(track.id)
          return next
        })
      } else {
        setMissingFileIds((prev) => {
          if (!prev.has(track.id)) return prev
          const next = new Set(prev)
          next.delete(track.id)
          return next
        })
      }
    }).catch(() => {})
    // Every track streams from disk instantly when it has no decoded buffer.
    // Only short clips get a background decode kicked off here, so their
    // *next* play uses the sample-accurate buffer path — decoding full songs
    // costs ~22 MB of PCM per minute for no audible benefit.
    if (shouldDecode(track) && !audio.getBuffer(track.filePath)) {
      audio.loadBuffer(track.id, track.filePath).catch(() => {})
    } else if (track.duration === 0 && track.filePath) {
      reprobeTrackDuration(track).then((updated) => {
        if (updated && shouldDecode(updated) && !audio.getBuffer(updated.filePath)) {
          audio.loadBuffer(updated.id, updated.filePath).catch(() => {})
        }
      }).catch(() => {})
    }
    audio.playTrack(
      track.id,
      { inPoint: track.inPoint, outPoint: track.outPoint || track.duration, filePath: track.filePath, volume: track.volume },
      { force: true, bus }
    )
    // NowPlayingBar and the "played" tint both reflect main-bus/PA activity —
    // a monitor audition is a private cue and must never affect either.
    if (bus === 'main') {
      setNowPlayingTrack(track)
      setPlayedIds((prev) => new Set([...prev, track.id]))
    }
  }

  // Excludes tracks already played this event (see playedIds) and tracks whose
  // file is known missing, so Random never re-triggers something just heard
  // or silently no-ops on a broken file.
  function playRandomTrack() {
    if (!selectedBank) return
    const candidates = selectedBank.tracks.filter((t) => !playedIds.has(t.id) && !missingFileIds.has(t.id))
    if (candidates.length === 0) return
    const track = candidates[Math.floor(Math.random() * candidates.length)]
    playTrack(track)
  }

  function playTrack(track: Track) {
    // A track cued on the monitor bus always toggles off from there when
    // clicked again — even after Monitor mode has been disarmed — rather
    // than starting a redundant main-bus play.
    if (audio.monitorPlayingTrackId === track.id) {
      audio.stopMonitor()
      return
    }
    if (audio.isMonitorMode) {
      playTrackForce(track, 'monitor')
      return
    }
    if (audio.playingTrackId === track.id) {
      breakPlaylistChain()
      audio.stopAll()
      return
    }
    playTrackForce(track)
  }

  // Sync nowPlayingTrack when audio stops on its own (track ended)
  useEffect(() => {
    if (!audio.playingTrackId) {
      setNowPlayingTrack(null)
    }
  }, [audio.playingTrackId])

  function breakPlaylistChain() {
    setPlayingPlaylistId(null)
    setPlaylistIndex(-1)
  }

  // Move the visible selection past the track that was just stopped, so the
  // next Play continues the playlist instead of replaying the same track.
  function advancePastStoppedTrack() {
    if (playingPlaylistId === null) return
    const playlist = (config.playlists ?? []).find((p) => p.id === playingPlaylistId)
    if (!playlist || playlist.id !== config.selectedPlaylistId) return
    const next = playlistIndex + 1
    setSelectedTrackIndex(next < playlist.tracks.length ? next : 0)
  }

  function playPlaylistTrackAt(playlist: Playlist, index: number) {
    const t = playlist.tracks[index]
    if (!t) {
      // Ran past the end of the playlist — wrap the selection back to the top
      // so the next Play starts a fresh run-through.
      if (playlist.id === config.selectedPlaylistId) setSelectedTrackIndex(0)
      breakPlaylistChain()
      return
    }
    setPlayingPlaylistId(playlist.id)
    setPlaylistIndex(index)
    // Keep the visible selection in lockstep with playback as it advances.
    if (playlist.id === config.selectedPlaylistId) setSelectedTrackIndex(index)
    playTrackForce(t)
  }

  // Clicking a row only selects it (sets where the next Play press will start) —
  // it does not touch the audio engine.
  function selectPlaylistTrack(index: number) {
    setSelectedTrackIndex(index)
  }

  // Reset the selection when the visible playlist changes, so it doesn't silently
  // point at a row in a different playlist.
  useEffect(() => {
    setSelectedTrackIndex(-1)
  }, [config.selectedPlaylistId])

  // Auto-advance through a playing playlist when each track ends naturally;
  // break the chain if the single audio slot gets hijacked by something else.
  useEffect(() => {
    if (playingPlaylistId === null) return
    const playlist = (config.playlists ?? []).find((p) => p.id === playingPlaylistId)
    if (!playlist) { breakPlaylistChain(); return }
    const expected = playlist.tracks[playlistIndex]

    if (audio.playingTrackId === null) {
      if (suppressPlaylistAdvanceRef.current) {
        suppressPlaylistAdvanceRef.current = false
        return
      }
      playPlaylistTrackAt(playlist, playlistIndex + 1)
    } else if (!expected || audio.playingTrackId !== expected.id) {
      breakPlaylistChain()
    }
  }, [audio.playingTrackId])

  function stopAll() {
    advancePastStoppedTrack()
    breakPlaylistChain()
    audio.stopImmediate()
    audio.stopMonitorImmediate()
  }

  function stopWithFade() {
    advancePastStoppedTrack()
    breakPlaylistChain()
    audio.stopAll()
  }

  function saveEditedTrack(updated: Track) {
    updateConfig((c) => ({
      ...c,
      // Hotkeys are global (fire from any bank) — reassigning one here strips it
      // from whichever other track, in any bank, previously held it.
      banks: c.banks.map((b) => ({
        ...b,
        tracks: b.tracks.map((t) => {
          if (t.id === updated.id) return updated
          if (updated.hotkey && t.hotkey === updated.hotkey) return { ...t, hotkey: undefined }
          return t
        })
      }))
    }))
    if (updated.filePath && shouldDecode(updated) && !audio.getBuffer(updated.filePath)) {
      audio.loadBuffer(updated.id, updated.filePath).catch(() => {})
    }
    if (nowPlayingTrack?.id === updated.id) setNowPlayingTrack(updated)
  }

  // Which other track (in any bank) currently holds this hotkey — shown as a
  // warning in the editor, resolved by saveEditedTrack on save.
  function hotkeyOwner(hotkey: string): string | null {
    if (!editingTrack) return null
    const owner = config.banks
      .flatMap((b) => b.tracks)
      .find((t) => t.id !== editingTrack.id && t.hotkey === hotkey)
    return owner ? (owner.title || owner.filePath) : null
  }

  function reorderBanks(newBanks: Bank[]) {
    updateConfig((c) => ({ ...c, banks: newBanks }))
  }

  function reorderTracks(newTracks: Track[]) {
    if (!selectedBank) return
    const bankId = selectedBank.id
    updateConfig((c) => ({
      ...c,
      banks: c.banks.map((b) => b.id === bankId ? { ...b, tracks: newTracks } : b)
    }))
  }

  // Dragging a track cell (reorder mode) onto a different bank in the sidebar
  // relocates it there, appended to the end — a no-op if dropped on its own bank.
  function moveTrackToBank(trackId: string, targetBankId: string) {
    updateConfig((c) => {
      const sourceBank = c.banks.find((b) => b.tracks.some((t) => t.id === trackId))
      if (!sourceBank || sourceBank.id === targetBankId) return c
      const track = sourceBank.tracks.find((t) => t.id === trackId)!
      return {
        ...c,
        banks: c.banks.map((b) => {
          if (b.id === sourceBank.id) return { ...b, tracks: b.tracks.filter((t) => t.id !== trackId) }
          if (b.id === targetBankId) return { ...b, tracks: [...b.tracks, track] }
          return b
        })
      }
    })
  }

  function removeTrack(id: string) {
    if (nowPlayingTrack?.id === id) {
      breakPlaylistChain()
      audio.stopImmediate()
      setNowPlayingTrack(null)
    }
    updateConfig((c) => ({
      ...c,
      banks: c.banks.map((b) => ({
        ...b,
        tracks: b.tracks.filter((t) => t.id !== id)
      }))
    }))
  }

  function selectPlaylist(id: string) {
    updateConfig((c) => ({ ...c, selectedPlaylistId: id }))
  }

  function addPlaylist(name: string) {
    const playlist: Playlist = { id: makeId(), name, tracks: [] }
    updateConfig((c) => ({
      ...c,
      playlists: [...(c.playlists ?? []), playlist],
      selectedPlaylistId: playlist.id
    }))
  }

  function renamePlaylist(id: string, name: string) {
    updateConfig((c) => ({
      ...c,
      playlists: (c.playlists ?? []).map((p) => p.id === id ? { ...p, name } : p)
    }))
  }

  function deletePlaylist(id: string) {
    if (playingPlaylistId === id) {
      breakPlaylistChain()
      audio.stopImmediate()
    }
    updateConfig((c) => {
      const playlists = (c.playlists ?? []).filter((p) => p.id !== id)
      const selectedPlaylistId = c.selectedPlaylistId === id ? (playlists[0]?.id ?? '') : c.selectedPlaylistId
      return { ...c, playlists, selectedPlaylistId }
    })
  }

  function reorderPlaylists(newPlaylists: Playlist[]) {
    updateConfig((c) => ({ ...c, playlists: newPlaylists }))
  }

  async function addTracksToPlaylist() {
    const paths = await window.electronAPI.openAudioFiles()
    if (!paths.length || !config.selectedPlaylistId) return

    const newTracks: PlaylistTrack[] = await Promise.all(
      paths.map(async (filePath) => {
        const meta = await window.electronAPI.getTrackMetadata(filePath)
        const id = makeId()
        if (shouldDecode(meta)) audio.loadBuffer(id, filePath).catch(() => {})
        return {
          id,
          itemId: id,
          filePath,
          artist: meta.artist,
          title: meta.title,
          duration: meta.duration,
          inPoint: 0,
          outPoint: meta.duration
        }
      })
    )

    updateConfig((c) => ({
      ...c,
      playlists: (c.playlists ?? []).map((p) =>
        p.id === c.selectedPlaylistId ? { ...p, tracks: [...p.tracks, ...newTracks] } : p
      )
    }))
    warmClips(newTracks)
  }

  function addTrackToPlaylist(track: Track) {
    if (!config.selectedPlaylistId) return
    const playlistTrack: PlaylistTrack = { ...track, itemId: makeId() }
    updateConfig((c) => ({
      ...c,
      playlists: (c.playlists ?? []).map((p) =>
        p.id === c.selectedPlaylistId ? { ...p, tracks: [...p.tracks, playlistTrack] } : p
      )
    }))
  }

  function removePlaylistTrack(itemId: string) {
    if (!selectedPlaylist) return
    if (playingPlaylistId === selectedPlaylist.id) {
      breakPlaylistChain()
      audio.stopImmediate()
    }
    updateConfig((c) => ({
      ...c,
      playlists: (c.playlists ?? []).map((p) => ({
        ...p,
        tracks: p.tracks.filter((t) => t.itemId !== itemId)
      }))
    }))
  }

  function reorderPlaylistTracks(newTracks: PlaylistTrack[]) {
    if (!selectedPlaylist) return
    const playlistId = selectedPlaylist.id
    if (playingPlaylistId === playlistId) {
      breakPlaylistChain()
      audio.stopImmediate()
    }
    updateConfig((c) => ({
      ...c,
      playlists: (c.playlists ?? []).map((p) => p.id === playlistId ? { ...p, tracks: newTracks } : p)
    }))
  }

  function shufflePlaylistTracks(playlist: Playlist) {
    const shuffled = [...playlist.tracks]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    if (playingPlaylistId === playlist.id) {
      breakPlaylistChain()
      audio.stopImmediate()
    }
    if (playlist.id === config.selectedPlaylistId) setSelectedTrackIndex(-1)
    updateConfig((c) => ({
      ...c,
      playlists: (c.playlists ?? []).map((p) => p.id === playlist.id ? { ...p, tracks: shuffled } : p)
    }))
  }

  function trackLabel(t: { artist: string; title: string; filePath: string }): string {
    return t.title ? (t.artist ? `${t.artist} — ${t.title}` : t.title) : t.filePath
  }

  const AUTOSAVE_WARNING = 'The event set saves automatically, so this can\'t be undone.'

  function requestDeleteBank(id: string) {
    const bank = config.banks.find((b) => b.id === id)
    if (!bank) return
    // An empty bank loses nothing but its name — no confirmation needed.
    if (bank.tracks.length === 0) { deleteBank(id); return }
    setConfirmRequest({
      title: 'Delete Bank',
      message: `Delete "${bank.name}" and its ${bank.tracks.length} track${bank.tracks.length === 1 ? '' : 's'}? ${AUTOSAVE_WARNING}`,
      confirmLabel: 'Delete Bank',
      action: () => deleteBank(id)
    })
  }

  function requestRemoveTrack(id: string) {
    const track = config.banks.flatMap((b) => b.tracks).find((t) => t.id === id)
    if (!track) return
    setConfirmRequest({
      title: 'Delete Track',
      message: `Delete "${trackLabel(track)}" from this bank? ${AUTOSAVE_WARNING}`,
      confirmLabel: 'Delete Track',
      action: () => removeTrack(id)
    })
  }

  function requestDeletePlaylist(id: string) {
    const playlist = (config.playlists ?? []).find((p) => p.id === id)
    if (!playlist) return
    if (playlist.tracks.length === 0) { deletePlaylist(id); return }
    setConfirmRequest({
      title: 'Delete Playlist',
      message: `Delete "${playlist.name}" and its ${playlist.tracks.length} track${playlist.tracks.length === 1 ? '' : 's'}? ${AUTOSAVE_WARNING}`,
      confirmLabel: 'Delete Playlist',
      action: () => deletePlaylist(id)
    })
  }

  function requestRemovePlaylistTrack(itemId: string) {
    const track = selectedPlaylist?.tracks.find((t) => t.itemId === itemId)
    if (!track || !selectedPlaylist) return
    setConfirmRequest({
      title: 'Remove Track',
      message: `Remove "${trackLabel(track)}" from "${selectedPlaylist.name}"? ${AUTOSAVE_WARNING}`,
      confirmLabel: 'Remove',
      action: () => removePlaylistTrack(itemId)
    })
  }

  function requestRemoveLibrary(id: string) {
    const lib = libraries.libraries.find((l) => l.id === id)
    if (!lib) return
    setConfirmRequest({
      title: 'Remove Library',
      message: `Remove the library "${lib.name}"? Your audio files stay on disk, and tracks already added to banks or playlists are unaffected.`,
      confirmLabel: 'Remove Library',
      action: () => libraries.remove(id)
    })
  }

  function toggleAddToPlaylistMode() {
    setIsAddToPlaylistMode((v) => {
      const next = !v
      if (next) setIsReordering(false)
      return next
    })
  }

  function playlistPlay(playlist: Playlist) {
    if (playingPlaylistId === playlist.id && playlistIndex >= 0) {
      // (Re)start the current position. Using the force-play path means this also
      // self-heals a stalled/stuck track instead of silently no-op'ing.
      playPlaylistTrackAt(playlist, playlistIndex)
    } else {
      // Start from the selected row (if one was clicked), else from the top.
      const startIndex = selectedTrackIndex >= 0 && selectedTrackIndex < playlist.tracks.length
        ? selectedTrackIndex
        : 0
      playPlaylistTrackAt(playlist, startIndex)
    }
  }

  function playlistPause(playlist: Playlist) {
    if (playingPlaylistId !== playlist.id) return
    suppressPlaylistAdvanceRef.current = true
    audio.stopImmediate()
  }

  function playlistSkip(playlist: Playlist) {
    if (playingPlaylistId !== playlist.id) return
    playPlaylistTrackAt(playlist, playlistIndex + 1)
  }

  const getMainAnalysers = useCallback(() => audio.getBusAnalysers('main'), [audio.getBusAnalysers])

  const handleVolumeChange = useCallback((v: number) => {
    audio.setMasterVolume(v)
    updateConfig((c) => ({ ...c, masterVolume: v }))
  }, [audio, updateConfig])

  // The editor needs a full decode for its waveform regardless of length, but
  // only short clips belong in the LRU playback cache — a full song's PCM
  // would evict the warmed clip buffers. Long (or unknown-length) files get a
  // transient decode instead.
  function loadEditorBuffer(id: string, filePath: string, range: DecodeRange) {
    if (typeof range.duration === 'number') {
      return shouldDecode({ duration: range.duration, inPoint: range.inPoint, outPoint: range.outPoint })
        ? audio.loadBuffer(id, filePath)
        : audio.decodeTransient(filePath)
    }

    const decoded = audio.decodeTransient(filePath)
    decoded.catch(() => {})
    return (async () => {
      let resolvedDuration: number
      try {
        resolvedDuration = await range.duration
      } catch (error) {
        throw error
      }
      return shouldDecode({ duration: resolvedDuration, inPoint: range.inPoint, outPoint: range.outPoint })
        ? audio.loadBuffer(id, filePath)
        : decoded
    })()
  }

  // Warm the decoded cache for the selected bank's *short clips* in the
  // background. Full songs are never pre-decoded — they stream on demand —
  // so startup and bank switches are instant regardless of bank size, and
  // RAM stays bounded (a full event set decoded up front was measured to
  // swamp a 16GB machine).
  //
  // Capped concurrency: a track the user actually clicks is loaded on-demand
  // via audio.loadBuffer directly (see playTrackForce), which either reuses
  // an already-in-flight decode or — if this queue hasn't reached that track
  // yet — starts immediately outside the queue. Keeping the queue's own
  // concurrency low is what leaves room for that to jump ahead.
  const PRELOAD_CONCURRENCY = 3

  // Persist a re-probed duration everywhere the track appears (banks and
  // playlists share ids for copied tracks); outPoint 0 means "unset", so it
  // gets the real end too.
  function setTrackDuration(id: string, duration: number) {
    updateConfig((c) => ({
      ...c,
      banks: c.banks.map((b) => ({
        ...b,
        tracks: b.tracks.map((t) => t.id === id ? { ...t, duration, outPoint: t.outPoint || duration } : t)
      })),
      playlists: (c.playlists ?? []).map((p) => ({
        ...p,
        tracks: p.tracks.map((t) => t.id === id ? { ...t, duration, outPoint: t.outPoint || duration } : t)
      }))
    }))
  }

  async function reprobeTrackDuration<T extends Track>(track: T): Promise<T | null> {
    if (!track.filePath || track.duration !== 0) return track
    const meta = await window.electronAPI.getTrackMetadata(track.filePath)
    if (meta.duration <= 0) return null
    setTrackDuration(track.id, meta.duration)
    return { ...track, duration: meta.duration, outPoint: track.outPoint || meta.duration }
  }

  // Tracks persisted with duration 0 (SSP imports without timing info, failed
  // metadata reads) are re-probed first and the result persisted — without
  // this they'd be permanently misclassified as songs and never decode, even
  // when they're really 3-second stingers.
  function warmClips(tracks: Track[]) {
    const tasks = tracks
      .filter((t) => t.filePath && (shouldDecode(t) || t.duration === 0))
      .map((t) => async () => {
        const track = await reprobeTrackDuration(t)
        if (track && shouldDecode(track) && !audio.getBuffer(track.filePath)) {
          await audio.loadBuffer(track.id, track.filePath)
        }
      })
    runWithConcurrency(tasks, PRELOAD_CONCURRENCY)
  }

  useEffect(() => {
    // Config hasn't loaded yet, so selectedBank is still the DEFAULT_CONFIG
    // placeholder (null) — wait rather than treating that as "nothing to load".
    if (!loaded || !selectedBank) return
    warmClips(selectedBank.tracks)
  }, [loaded, config.selectedBankId])

  // Same short-clip warm-up when the selected playlist switches
  useEffect(() => {
    if (!selectedPlaylist) return
    warmClips(selectedPlaylist.tracks)
  }, [config.selectedPlaylistId])

  // Keyboard shortcuts: per-track hotkeys (scoped to the selected bank) plus a
  // fixed set of global transport keys. Disabled while a modal is open or while
  // typing in a text field so hotkeys never hijack normal text entry.
  //
  // The listener is attached once; latestKeyHandlerRef is reassigned every render
  // so it always closes over current state without re-subscribing on every keystroke
  // or playback change (which would otherwise mean a stale playingTrackId/playlistIndex).
  const latestKeyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {})

  latestKeyHandlerRef.current = function onKeyDown(e: KeyboardEvent) {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      if (target.tagName === 'TEXTAREA' || target.isContentEditable) return true
      if (target.tagName !== 'INPUT') return false
      // Click-style inputs (the volume slider, checkboxes…) keep focus after
      // use but never take typed text — shortcuts must keep working there.
      // Unknown types stay "typing" so a future text-like input fails safe.
      const NON_TYPING_TYPES = ['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file']
      return !NON_TYPING_TYPES.includes((target as HTMLInputElement).type)
    }

    if (e.repeat || isTypingTarget(e.target) || editingTrack || settingsOpen || confirmRequest) return

    if (shortcutsOpen) {
      if (e.key === 'Escape') { e.preventDefault(); setShortcutsOpen(false) }
      return
    }
    if (e.key === '?') {
      e.preventDefault()
      setShortcutsOpen(true)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      stopAll()
      return
    }
    if (e.code === 'Space') {
      e.preventDefault()
      stopWithFade()
      return
    }
    if (e.key === 'ArrowRight') {
      if (!selectedPlaylist || playingPlaylistId !== selectedPlaylist.id) return
      e.preventDefault()
      playlistSkip(selectedPlaylist)
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
      e.preventDefault()
      if (!monitorMatchesOutput) audio.setMonitorMode(!audio.isMonitorMode)
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault()
      searchRef.current?.focus()
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
      e.preventDefault()
      playRandomTrack()
      return
    }
    if (e.key === 'F11') {
      e.preventDefault()
      window.electronAPI.window.toggleFullscreen()
      return
    }

    const key = normalizeHotkeyEvent(e)
    if (!key) return
    // Hotkeys are global — search every bank, not just the one currently displayed.
    const track = config.banks.flatMap((b) => b.tracks).find((t) => t.hotkey === key)
    if (!track) return
    e.preventDefault()
    // Reorder/add-to-playlist modes only affect clicks on the visible grid, so they
    // only intercept a hotkey when it belongs to a track in that same visible bank.
    const inSelectedBank = !!selectedBank?.tracks.some((t) => t.id === track.id)
    if (inSelectedBank && isReordering) return
    if (inSelectedBank && isAddToPlaylistMode) addTrackToPlaylist(track)
    else playTrack(track)
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      latestKeyHandlerRef.current(e)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Only the (fast) config read gates first paint — audio is never a startup
  // blocker: songs stream on demand and short clips warm in the background.
  if (!loaded) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        color: '#94a3b8',
        fontSize: 14
      }}>
        Loading…
      </div>
    )
  }

  return (
    <>
      <Toolbar
        currentFilePath={currentFilePath}
        masterVolume={config.masterVolume}
        isMonitorMode={audio.isMonitorMode}
        monitorDisabled={monitorMatchesOutput}
        showPlaylistPanel={showPlaylistPanel}
        isFullscreen={isFullscreen}
        banks={config.banks}
        libraries={libraries.libraries}
        searchRef={searchRef}
        onVolumeChange={handleVolumeChange}
        onStopAll={stopAll}
        onToggleMonitor={() => audio.setMonitorMode(!audio.isMonitorMode)}
        onToggleFullscreen={() => window.electronAPI.window.toggleFullscreen()}
        onTogglePlaylistPanel={() => setShowPlaylistPanel((v) => {
          const next = !v
          if (!next) setIsAddToPlaylistMode(false)
          return next
        })}
        onOpenSettings={() => setSettingsOpen(true)}
        onResetPlayed={resetPlayed}
        onVerifyTracks={verifyTracks}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenFeedback={() => setFeedbackOpen(true)}
        onOpenLibraries={() => setLibraryManagerOpen(true)}
        onSelectSearchResult={jumpToSearchResult}
        onAddLibraryTrack={(t) => addLibraryTracksToBank([t])}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar
          banks={config.banks}
          selectedBankId={config.selectedBankId}
          monitorPlayingBankId={monitorPlayingBankId}
          isReordering={isReordering}
          missingFileIds={missingFileIds}
          onSelectBank={selectBank}
          onAddBank={addBank}
          onRenameBank={renameBank}
          onDeleteBank={requestDeleteBank}
          onReorderBanks={reorderBanks}
          onDropTrackOnBank={moveTrackToBank}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Bank header with Add Tracks button */}
          {selectedBank && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 16px',
              background: '#0f172a',
              borderBottom: '1px solid #1e293b',
              flexShrink: 0
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{selectedBank.name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>{selectedBank.tracks.length} tracks</span>
                <button
                  onClick={playRandomTrack}
                  disabled={!hasUnplayedTracks}
                  title={hasUnplayedTracks ? 'Play a random track that hasn\'t played yet (Ctrl/Cmd+R)' : 'All tracks in this bank have played'}
                  style={{
                    padding: '5px 12px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: 4,
                    color: hasUnplayedTracks ? '#94a3b8' : '#475569',
                    fontSize: 12,
                    cursor: hasUnplayedTracks ? 'pointer' : 'default'
                  }}
                >
                  ▶ Random
                </button>
                <button
                  onClick={() => setIsReordering((v) => {
                    const next = !v
                    if (next) setIsAddToPlaylistMode(false)
                    return next
                  })}
                  style={{
                    padding: '5px 12px',
                    background: isReordering ? '#1e3a5f' : '#1e293b',
                    border: `1px solid ${isReordering ? '#3b82f6' : '#334155'}`,
                    borderRadius: 4,
                    color: isReordering ? '#93c5fd' : '#94a3b8',
                    fontSize: 12,
                    fontWeight: isReordering ? 600 : 400
                  }}
                >
                  {isReordering ? '✓ Done Reordering' : '⇅ Reorder'}
                </button>
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setAddMenuOpen((v) => !v)}
                    title="Add tracks"
                    style={{
                      padding: '5px 12px',
                      background: addMenuOpen ? '#1e3a5f' : '#1e293b',
                      border: `1px solid ${addMenuOpen ? '#3b82f6' : '#334155'}`,
                      borderRadius: 4,
                      color: addMenuOpen ? '#93c5fd' : '#94a3b8',
                      fontSize: 12,
                      cursor: 'pointer'
                    }}
                  >
                    +
                  </button>
                  {addMenuOpen && (
                    <>
                      <div
                        onClick={() => setAddMenuOpen(false)}
                        style={{ position: 'fixed', inset: 0, zIndex: 10 }}
                      />
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: 4,
                        zIndex: 11,
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: 4,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                        display: 'flex',
                        flexDirection: 'column',
                        minWidth: 160,
                        overflow: 'hidden'
                      }}>
                        <button
                          onClick={() => { addTracks(); setAddMenuOpen(false) }}
                          style={{
                            padding: '8px 12px',
                            background: 'transparent',
                            border: 'none',
                            textAlign: 'left',
                            color: '#e2e8f0',
                            fontSize: 12,
                            cursor: 'pointer'
                          }}
                        >
                          🗋 Select File
                        </button>
                        <button
                          onClick={() => { setAddFromLibraryTarget('bank'); setAddMenuOpen(false) }}
                          style={{
                            padding: '8px 12px',
                            background: 'transparent',
                            border: 'none',
                            borderTop: '1px solid #334155',
                            textAlign: 'left',
                            color: '#e2e8f0',
                            fontSize: 12,
                            cursor: 'pointer'
                          }}
                        >
                          🗀 From Library
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {selectedBank && isAddToPlaylistMode && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '6px 16px',
              background: '#1e3a5f',
              borderBottom: '1px solid #3b82f6',
              flexShrink: 0
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#93c5fd' }}>
                Adding to “{selectedPlaylist?.name ?? 'playlist'}” — click a button to add it
              </span>
              <button
                onClick={() => setIsAddToPlaylistMode(false)}
                style={{
                  padding: '4px 12px',
                  background: '#3b82f6',
                  border: '1px solid #3b82f6',
                  borderRadius: 4,
                  color: '#f8fafc',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                ✓ Done
              </button>
            </div>
          )}

          {selectedBank ? (
            <TrackGrid
              tracks={selectedBank.tracks}
              playingTrackId={audio.playingTrackId}
              monitorPlayingTrackId={audio.monitorPlayingTrackId}
              playStartWallTime={audio.playStartWallTime}
              playedIds={showPlayedIndicator ? playedIds : EMPTY_PLAYED_IDS}
              missingFileIds={missingFileIds}
              loadingIds={audio.loadingIds}
              isMonitorMode={audio.isMonitorMode}
              isReordering={isReordering}
              isAddToPlaylistMode={isAddToPlaylistMode}
              showTrackTooltips={showTrackTooltips}
              highlightedTrackId={highlightedTrackId}
              onPlayTrack={playTrack}
              onEditTrack={setEditingTrack}
              onDeleteTrack={(track) => requestRemoveTrack(track.id)}
              onAddTracks={addTracks}
              onAddFromLibrary={() => setAddFromLibraryTarget('bank')}
              onDropFiles={addTracksByPaths}
              onReorder={reorderTracks}
              onAddToPlaylist={addTrackToPlaylist}
            />
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              color: '#475569'
            }}>
              <div style={{ fontSize: 14 }}>No bank selected</div>
              <div style={{ fontSize: 12, color: '#334155' }}>Add a bank using the sidebar to get started</div>
            </div>
          )}
        </div>

        {showMeters && <LevelMeters getAnalysers={getMainAnalysers} />}

        {showPlaylistPanel && (
          <PlaylistPanel
            playlists={config.playlists ?? []}
            selectedPlaylistId={config.selectedPlaylistId ?? ''}
            isAddToPlaylistMode={isAddToPlaylistMode}
            playingPlaylistId={playingPlaylistId}
            playlistIndex={playlistIndex}
            isTrackPlaying={!!audio.playingTrackId}
            onSelectPlaylist={selectPlaylist}
            onAddPlaylist={addPlaylist}
            onRenamePlaylist={renamePlaylist}
            onDeletePlaylist={requestDeletePlaylist}
            onReorderPlaylists={reorderPlaylists}
            onToggleAddMode={toggleAddToPlaylistMode}
            onAddTracksFromFile={addTracksToPlaylist}
            onAddFromLibrary={() => setAddFromLibraryTarget('playlist')}
            onRemoveTrack={requestRemovePlaylistTrack}
            onReorderTracks={reorderPlaylistTracks}
            selectedTrackIndex={selectedTrackIndex}
            onSelectRow={selectPlaylistTrack}
            onPlaylistPlay={() => selectedPlaylist && playlistPlay(selectedPlaylist)}
            onPlaylistPause={() => selectedPlaylist && playlistPause(selectedPlaylist)}
            onPlaylistSkip={() => selectedPlaylist && playlistSkip(selectedPlaylist)}
            onPlaylistShuffle={() => selectedPlaylist && shufflePlaylistTracks(selectedPlaylist)}
          />
        )}
      </div>

      <NowPlayingBar
        track={nowPlayingTrack}
        isPlaying={!!audio.playingTrackId}
        audioCtx={audio.audioCtx}
        startTime={audio.playStartCtxTime}
        inPoint={nowPlayingTrack?.inPoint ?? 0}
        outPoint={nowPlayingTrack?.outPoint ?? nowPlayingTrack?.duration ?? 0}
        onStop={stopWithFade}
      />

      <TrackEditor
        track={editingTrack}
        onSave={saveEditedTrack}
        onRemove={requestRemoveTrack}
        onClose={() => setEditingTrack(null)}
        loadBuffer={loadEditorBuffer}
        getBuffer={audio.getBuffer}
        hotkeyOwner={hotkeyOwner}
      />

      <Settings
        open={settingsOpen}
        config={{
          fadeIn: config.fadeIn ?? 0,
          fadeOut: config.fadeOut ?? 0,
          crossFade: config.crossFade ?? 0,
          outputDeviceId: audioDevices.outputDeviceId,
          monitorDeviceId: audioDevices.monitorDeviceId
        }}
        onChange={(s) => {
          updateConfig((c) => ({ ...c, fadeIn: s.fadeIn, fadeOut: s.fadeOut, crossFade: s.crossFade }))
          // Fade sliders fire this on every drag tick (dozens/sec) but never
          // touch device ids — only push a device change (which does a
          // synchronous settings write + IPC round-trip) when one actually
          // changed, instead of flooding the main process on every pixel.
          if (s.outputDeviceId !== audioDevices.outputDeviceId || s.monitorDeviceId !== audioDevices.monitorDeviceId) {
            setAudioDevices({ outputDeviceId: s.outputDeviceId, monitorDeviceId: s.monitorDeviceId })
          }
        }}
        showTrackTooltips={showTrackTooltips}
        onShowTrackTooltipsChange={setShowTrackTooltips}
        showPlayedIndicator={showPlayedIndicator}
        onShowPlayedIndicatorChange={setShowPlayedIndicator}
        showMeters={showMeters}
        onShowMetersChange={setShowMeters}
        uiZoom={uiZoom}
        onUiZoomChange={setUiZoom}
        onClose={() => setSettingsOpen(false)}
      />

      <FeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
      />

      <ShortcutsModal
        open={shortcutsOpen}
        banks={config.banks}
        onClose={() => setShortcutsOpen(false)}
      />

      <LibraryManager
        open={libraryManagerOpen}
        libraries={libraries.libraries}
        scanProgress={libraries.scanProgress}
        onAddFolder={libraries.addFolder}
        onRescan={libraries.rescan}
        onRename={libraries.rename}
        onRemove={requestRemoveLibrary}
        onClose={() => setLibraryManagerOpen(false)}
      />

      <AddFromLibraryModal
        open={addFromLibraryTarget !== null}
        libraries={libraries.libraries}
        targetLabel={addFromLibraryTarget === 'playlist' ? (selectedPlaylist?.name ?? 'Playlist') : (selectedBank?.name ?? 'Bank')}
        onAdd={(tracks) => {
          if (addFromLibraryTarget === 'playlist') addLibraryTracksToPlaylist(tracks)
          else addLibraryTracksToBank(tracks)
        }}
        onClose={() => setAddFromLibraryTarget(null)}
      />

      {confirmRequest && (
        <ConfirmDialog
          title={confirmRequest.title}
          message={confirmRequest.message}
          confirmLabel={confirmRequest.confirmLabel}
          onConfirm={() => { setConfirmRequest(null); confirmRequest.action() }}
          onCancel={() => setConfirmRequest(null)}
        />
      )}
    </>
  )
}
