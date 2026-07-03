import React, { useCallback, useEffect, useState } from 'react'
import { useAudioEngine } from './hooks/useAudioEngine'
import { useConfig } from './hooks/useConfig'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { TrackGrid } from './components/TrackGrid'
import { NowPlayingBar } from './components/NowPlayingBar'
import { TrackEditor } from './components/TrackEditor'
import { Settings } from './components/Settings'
import type { Bank, Track } from './types'

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export default function App() {
  const { config, currentFilePath, updateConfig, loaded } = useConfig()
  const audio = useAudioEngine()
  const [editingTrack, setEditingTrack] = useState<Track | null>(null)
  const [nowPlayingTrack, setNowPlayingTrack] = useState<Track | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [playedIds, setPlayedIds] = useState<Set<string>>(new Set())
  const [isReordering, setIsReordering] = useState(false)
  const [missingFileIds, setMissingFileIds] = useState<Set<string>>(new Set())

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
      if (track) { audio.stopAll(); setNowPlayingTrack(null) }
    }
  }

  async function addTracks() {
    const paths = await window.electronAPI.openAudioFiles()
    if (!paths.length || !config.selectedBankId) return

    const newTracks: Track[] = await Promise.all(
      paths.map(async (filePath) => {
        const meta = await window.electronAPI.getTrackMetadata(filePath)
        const id = makeId()
        // Pre-load buffer in background so first click is instant
        audio.loadBuffer(id, filePath).catch(() => {})
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

  function playTrack(track: Track) {
    if (audio.playingTrackId === track.id) {
      audio.stopAll()
      return
    }

    function markAndPlay() {
      audio.playTrack(track.id, { inPoint: track.inPoint, outPoint: track.outPoint || track.duration })
      setNowPlayingTrack(track)
      setPlayedIds((prev) => new Set([...prev, track.id]))
    }

    const buf = audio.getBuffer(track.id)
    if (!buf) {
      audio.loadBuffer(track.id, track.filePath).then(markAndPlay)
    } else {
      markAndPlay()
    }
  }

  // Sync nowPlayingTrack when audio stops on its own (track ended)
  useEffect(() => {
    if (!audio.playingTrackId) {
      setNowPlayingTrack(null)
    }
  }, [audio.playingTrackId])

  function stopAll() {
    audio.stopImmediate()
  }

  function stopWithFade() {
    audio.stopAll()
  }

  function saveEditedTrack(updated: Track) {
    updateConfig((c) => ({
      ...c,
      banks: c.banks.map((b) => ({
        ...b,
        tracks: b.tracks.map((t) => t.id === updated.id ? updated : t)
      }))
    }))
    if (nowPlayingTrack?.id === updated.id) setNowPlayingTrack(updated)
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

  const handleVolumeChange = useCallback((v: number) => {
    audio.setMasterVolume(v)
    updateConfig((c) => ({ ...c, masterVolume: v }))
  }, [audio, updateConfig])

  // Pre-load buffers for selected bank's tracks when bank switches
  useEffect(() => {
    if (!selectedBank) return
    selectedBank.tracks.forEach((t) => {
      if (!audio.getBuffer(t.id) && t.filePath) {
        audio.loadBuffer(t.id, t.filePath).catch(() => {})
      }
    })
  }, [config.selectedBankId])

  if (!loaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#475569' }}>
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
        onVolumeChange={handleVolumeChange}
        onStopAll={stopAll}
        onToggleMonitor={() => audio.setMonitorMode(!audio.isMonitorMode)}
        onOpenSettings={() => setSettingsOpen(true)}
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
                  onClick={() => setIsReordering((v) => !v)}
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
              isMonitorMode={audio.isMonitorMode}
              isReordering={isReordering}
              onPlayTrack={playTrack}
              onEditTrack={setEditingTrack}
              onAddTracks={addTracks}
              onReorder={reorderTracks}
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
        loadBuffer={audio.loadBuffer}
        getBuffer={audio.getBuffer}
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
    </>
  )
}
