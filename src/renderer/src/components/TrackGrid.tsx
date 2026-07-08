import React, { useState, useRef, useEffect } from 'react'
import { AUDIO_EXTENSIONS, TRACK_DRAG_MIME, type Track } from '../types'
import { TrackCell } from './TrackCell'

interface Props {
  tracks: Track[]
  playingTrackId: string | null
  monitorPlayingTrackId: string | null
  playStartWallTime: number | null
  playedIds: Set<string>
  missingFileIds: Set<string>
  loadingIds: Set<string>
  isMonitorMode: boolean
  isReordering: boolean
  isAddToPlaylistMode: boolean
  showTrackTooltips: boolean
  highlightedTrackId: string | null
  onPlayTrack: (track: Track) => void
  onEditTrack: (track: Track) => void
  onAddTracks: () => void
  onAddFromLibrary: () => void
  onDropFiles: (paths: string[]) => void
  onReorder: (newTracks: Track[]) => void
  onAddToPlaylist: (track: Track) => void
}

function isAudioFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase()
  return !!ext && AUDIO_EXTENSIONS.includes(ext)
}

export function TrackGrid({ tracks, playingTrackId, monitorPlayingTrackId, playStartWallTime, playedIds, missingFileIds, loadingIds, isMonitorMode, isReordering, isAddToPlaylistMode, showTrackTooltips, highlightedTrackId, onPlayTrack, onEditTrack, onAddTracks, onAddFromLibrary, onDropFiles, onReorder, onAddToPlaylist }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [isFileDragOver, setIsFileDragOver] = useState(false)
  const dragCounter = useRef(0)
  const fileDragCounter = useRef(0)

  // When a track is dropped on an external target (e.g. a sidebar bank row)
  // and relocates out of this bank, its cell is removed from the DOM before
  // the browser delivers "dragend" — so handleDragEnd never runs and a stale
  // dragIndex would otherwise grey out whichever track slides into that slot.
  useEffect(() => {
    setDragIndex(null)
    setDropIndex(null)
    dragCounter.current = 0
  }, [tracks])

  function handleDragStart(e: React.DragEvent, i: number) {
    setDragIndex(i)
    dragCounter.current = 0
    // Lets a drop target outside this grid (e.g. a sidebar bank row) identify
    // and relocate the dragged track — this component's own reorder-by-index
    // drop handling below doesn't need it.
    e.dataTransfer.setData(TRACK_DRAG_MIME, tracks[i].id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragEnter(i: number) {
    dragCounter.current++
    setDropIndex(i)
  }

  function handleDragLeave() {
    dragCounter.current--
    if (dragCounter.current === 0) setDropIndex(null)
  }

  function handleDrop(i: number) {
    if (dragIndex !== null && dragIndex !== i) {
      const next = [...tracks]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(i, 0, moved)
      onReorder(next)
    }
    setDragIndex(null)
    setDropIndex(null)
    dragCounter.current = 0
  }

  function handleDragEnd() {
    setDragIndex(null)
    setDropIndex(null)
    dragCounter.current = 0
  }

  function isFileDrag(e: React.DragEvent): boolean {
    return e.dataTransfer.types.includes('Files')
  }

  function handleFileDragEnter(e: React.DragEvent) {
    if (!isFileDrag(e)) return
    fileDragCounter.current++
    setIsFileDragOver(true)
  }

  function handleFileDragLeave(e: React.DragEvent) {
    if (!isFileDrag(e)) return
    fileDragCounter.current--
    if (fileDragCounter.current <= 0) {
      fileDragCounter.current = 0
      setIsFileDragOver(false)
    }
  }

  function handleFileDrop(e: React.DragEvent) {
    if (e.dataTransfer.files.length === 0) return
    e.preventDefault()
    fileDragCounter.current = 0
    setIsFileDragOver(false)
    const paths = Array.from(e.dataTransfer.files)
      .filter(isAudioFile)
      .map((file) => {
        try {
          return window.electronAPI.getPathForFile(file)
        } catch {
          return ''
        }
      })
      .filter((path) => path.length > 0)
    if (paths.length > 0) onDropFiles(paths)
  }

  if (tracks.length === 0) {
    return (
      <div
        onDragEnter={handleFileDragEnter}
        onDragLeave={handleFileDragLeave}
        onDragOver={(e) => { if (isFileDrag(e)) e.preventDefault() }}
        onDrop={handleFileDrop}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          color: '#475569',
          border: isFileDragOver ? '2px dashed #3b82f6' : '2px dashed transparent',
          borderRadius: 8,
          margin: 4,
          transition: 'border-color 0.1s'
        }}
      >
        <div style={{ fontSize: 14 }}>No tracks in this bank</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onAddTracks}
            style={{
              padding: '8px 20px',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 4,
              color: '#94a3b8',
              fontSize: 13
            }}
          >
            + Add Tracks
          </button>
          <button
            onClick={onAddFromLibrary}
            style={{
              padding: '8px 20px',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 4,
              color: '#94a3b8',
              fontSize: 13
            }}
          >
            🗀 From Library
          </button>
        </div>
        <div style={{ fontSize: 11, color: '#334155' }}>or drop audio files here</div>
      </div>
    )
  }

  return (
    <div
      onDragEnter={handleFileDragEnter}
      onDragLeave={handleFileDragLeave}
      onDragOver={(e) => { if (isFileDrag(e)) e.preventDefault() }}
      onDrop={handleFileDrop}
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: 12,
        background: isMonitorMode ? '#166534' : undefined,
        boxShadow: isFileDragOver ? 'inset 0 0 0 2px #3b82f6' : 'none',
        transition: 'background 0.2s, box-shadow 0.1s'
      }}
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: 6
      }}>
        {tracks.map((track, i) => (
          <div
            key={track.id}
            draggable={isReordering}
            onDragStart={(e) => handleDragStart(e, i)}
            onDragEnter={() => handleDragEnter(i)}
            onDragLeave={handleDragLeave}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(i)}
            onDragEnd={handleDragEnd}
            style={{
              minWidth: 0,
              opacity: dragIndex === i ? 0.35 : 1,
              boxShadow: dropIndex === i && dragIndex !== i ? '0 0 0 2px #3b82f6' : 'none',
              borderRadius: 4,
              cursor: isReordering ? 'grab' : undefined,
              transition: 'opacity 0.1s'
            }}
          >
            <TrackCell
              track={track}
              isPlaying={playingTrackId === track.id}
              isMonitorPlaying={monitorPlayingTrackId === track.id}
              isPlayed={playedIds.has(track.id)}
              isMissing={missingFileIds.has(track.id)}
              isLoading={loadingIds.has(track.id)}
              playStartWallTime={playingTrackId === track.id ? playStartWallTime : null}
              isReordering={isReordering}
              isAddToPlaylistMode={isAddToPlaylistMode}
              showTooltip={showTrackTooltips}
              isHighlighted={highlightedTrackId === track.id}
              onClick={isReordering ? () => {} : isAddToPlaylistMode ? () => onAddToPlaylist(track) : () => onPlayTrack(track)}
              onEdit={(isReordering || isAddToPlaylistMode) ? () => {} : () => onEditTrack(track)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
