import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAudioEngine, CLIP_DECODE_MAX_SECONDS } from './hooks/useAudioEngine'
import { useConfig } from './hooks/useConfig'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { TrackGrid } from './components/TrackGrid'
import { NowPlayingBar } from './components/NowPlayingBar'
import { TrackEditor } from './components/TrackEditor'
import { Settings } from './components/Settings'
import { PlaylistPanel } from './components/PlaylistPanel'
import { ShortcutsModal } from './components/ShortcutsModal'
import type { Bank, Track, Playlist, PlaylistTrack } from './types'
import { normalizeHotkeyEvent } from './types'

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// Only short clips are worth decoding to PCM — full songs stream from disk.
// Unknown duration (failed metadata read) is treated as long, i.e. streamed.
function shouldDecode(t: { duration: number }): boolean {
  return t.duration > 0 && t.duration <= CLIP_DECODE_MAX_SECONDS
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
  const { config, currentFilePath, updateConfig, loaded } = useConfig()
  const audio = useAudioEngine()
  const [editingTrack, setEditingTrack] = useState<Track | null>(null)
  const [nowPlayingTrack, setNowPlayingTrack] = useState<Track | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [playedIds, setPlayedIds] = useState<Set<string>>(new Set())
  const [isReordering, setIsReordering] = useState(false)
  const [missingFileIds, setMissingFileIds] = useState<Set<string>>(new Set())
  const [showPlaylistPanel, setShowPlaylistPanel] = useState(false)
  const [isAddToPlaylistMode, setIsAddToPlaylistMode] = useState(false)
  const [playingPlaylistId, setPlayingPlaylistId] = useState<string | null>(null)
  const [playlistIndex, setPlaylistIndex] = useState(-1)
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(-1)
  const suppressPlaylistAdvanceRef = useRef(false)

  useEffect(() => {
    return window.electronAPI.onMenuAction(async (action) => {
      if (action === 'resetPlayed') {
        setPlayedIds(new Set())
      } else if (action === 'verifyTracks') {
        const allTracks = config.banks.flatMap((b) => b.tracks)
        const paths = allTracks.map((t) => t.filePath)
        const results = await window.electronAPI.checkFiles(paths)
        const missing = new Set(allTracks.filter((_, i) => !results[i]).map((t) => t.id))
        setMissingFileIds(missing)
      }
    })
  }, [config.banks])

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
    audio.setOutputDevices(config.outputDeviceId ?? '', config.monitorDeviceId ?? '')
  }, [config.outputDeviceId, config.monitorDeviceId])

  const selectedBank = config.banks.find((b) => b.id === config.selectedBankId) ?? null
  const selectedPlaylist = (config.playlists ?? []).find((p) => p.id === config.selectedPlaylistId) ?? null

  function selectBank(id: string) {
    setIsReordering(false)
    updateConfig((c) => ({ ...c, selectedBankId: id }))
  }

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

  async function addTracks() {
    const paths = await window.electronAPI.openAudioFiles()
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
  }

  // Always (re)starts playback of this track, bypassing the toggle-off shortcut —
  // used by the playlist transport, which should never silently no-op even if
  // engine state looks like this track is already playing (e.g. it stalled).
  function playTrackForce(track: Track) {
    // Every track streams from disk instantly when it has no decoded buffer.
    // Only short clips get a background decode kicked off here, so their
    // *next* play uses the sample-accurate buffer path — decoding full songs
    // costs ~22 MB of PCM per minute for no audible benefit.
    if (shouldDecode(track) && !audio.getBuffer(track.filePath)) {
      audio.loadBuffer(track.id, track.filePath).catch(() => {})
    }
    audio.playTrack(
      track.id,
      { inPoint: track.inPoint, outPoint: track.outPoint || track.duration, filePath: track.filePath },
      { force: true }
    )
    setNowPlayingTrack(track)
    setPlayedIds((prev) => new Set([...prev, track.id]))
  }

  function playTrack(track: Track) {
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
    breakPlaylistChain()
    audio.stopImmediate()
  }

  function stopWithFade() {
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

  function playlistStop(playlist: Playlist) {
    if (playingPlaylistId !== playlist.id) return
    // Advance the selection past the track that was playing, so the next Play
    // resumes the playlist from where it left off instead of replaying it.
    if (playlist.id === config.selectedPlaylistId) {
      const next = playlistIndex + 1
      setSelectedTrackIndex(next < playlist.tracks.length ? next : 0)
    }
    breakPlaylistChain()
    audio.stopAll()
  }

  const handleVolumeChange = useCallback((v: number) => {
    audio.setMasterVolume(v)
    updateConfig((c) => ({ ...c, masterVolume: v }))
  }, [audio, updateConfig])

  // The editor needs a full decode for its waveform regardless of length, but
  // only short clips belong in the LRU playback cache — a full song's PCM
  // would evict the warmed clip buffers. Long (or unknown-length) files get a
  // transient decode instead.
  function loadEditorBuffer(id: string, filePath: string, duration: number) {
    return shouldDecode({ duration })
      ? audio.loadBuffer(id, filePath)
      : audio.decodeTransient(filePath)
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

  // Tracks persisted with duration 0 (SSP imports without timing info, failed
  // metadata reads) are re-probed first and the result persisted — without
  // this they'd be permanently misclassified as songs and never decode, even
  // when they're really 3-second stingers.
  function warmClips(tracks: Track[]) {
    const tasks = tracks
      .filter((t) => t.filePath && (shouldDecode(t) || t.duration === 0))
      .map((t) => async () => {
        let duration = t.duration
        if (duration === 0) {
          const meta = await window.electronAPI.getTrackMetadata(t.filePath)
          if (meta.duration > 0) {
            duration = meta.duration
            setTrackDuration(t.id, duration)
          }
        }
        if (shouldDecode({ duration }) && !audio.getBuffer(t.filePath)) {
          await audio.loadBuffer(t.id, t.filePath)
        }
      })
    runWithConcurrency(tasks, PRELOAD_CONCURRENCY)
  }

  useEffect(() => {
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
      return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
    }

    if (e.repeat || isTypingTarget(e.target) || editingTrack || settingsOpen) return

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
      audio.setMonitorMode(!audio.isMonitorMode)
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
        showPlaylistPanel={showPlaylistPanel}
        onVolumeChange={handleVolumeChange}
        onStopAll={stopAll}
        onToggleMonitor={() => audio.setMonitorMode(!audio.isMonitorMode)}
        onTogglePlaylistPanel={() => setShowPlaylistPanel((v) => {
          const next = !v
          if (!next) setIsAddToPlaylistMode(false)
          return next
        })}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar
          banks={config.banks}
          selectedBankId={config.selectedBankId}
          isReordering={isReordering}
          missingFileIds={missingFileIds}
          onSelectBank={selectBank}
          onAddBank={addBank}
          onRenameBank={renameBank}
          onDeleteBank={deleteBank}
          onReorderBanks={reorderBanks}
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
                <button
                  onClick={addTracks}
                  style={{
                    padding: '5px 12px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: 4,
                    color: '#94a3b8',
                    fontSize: 12
                  }}
                >
                  + Add Tracks
                </button>
              </div>
            </div>
          )}

          {selectedBank ? (
            <TrackGrid
              tracks={selectedBank.tracks}
              playingTrackId={audio.playingTrackId}
              playStartWallTime={audio.playStartWallTime}
              playedIds={playedIds}
              missingFileIds={missingFileIds}
              loadingIds={audio.loadingIds}
              isMonitorMode={audio.isMonitorMode}
              isReordering={isReordering}
              isAddToPlaylistMode={isAddToPlaylistMode}
              onPlayTrack={playTrack}
              onEditTrack={setEditingTrack}
              onAddTracks={addTracks}
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
            onDeletePlaylist={deletePlaylist}
            onReorderPlaylists={reorderPlaylists}
            onToggleAddMode={toggleAddToPlaylistMode}
            onAddTracksFromFile={addTracksToPlaylist}
            onRemoveTrack={removePlaylistTrack}
            onReorderTracks={reorderPlaylistTracks}
            selectedTrackIndex={selectedTrackIndex}
            onSelectRow={selectPlaylistTrack}
            onPlaylistPlay={() => selectedPlaylist && playlistPlay(selectedPlaylist)}
            onPlaylistPause={() => selectedPlaylist && playlistPause(selectedPlaylist)}
            onPlaylistSkip={() => selectedPlaylist && playlistSkip(selectedPlaylist)}
            onPlaylistStop={() => selectedPlaylist && playlistStop(selectedPlaylist)}
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
        onRemove={removeTrack}
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
          outputDeviceId: config.outputDeviceId ?? '',
          monitorDeviceId: config.monitorDeviceId ?? ''
        }}
        onChange={(s) => updateConfig((c) => ({ ...c, fadeIn: s.fadeIn, fadeOut: s.fadeOut, crossFade: s.crossFade, outputDeviceId: s.outputDeviceId, monitorDeviceId: s.monitorDeviceId }))}
        onClose={() => setSettingsOpen(false)}
      />

      <ShortcutsModal
        open={shortcutsOpen}
        banks={config.banks}
        onClose={() => setShortcutsOpen(false)}
      />
    </>
  )
}
