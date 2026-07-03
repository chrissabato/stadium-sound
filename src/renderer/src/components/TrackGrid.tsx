import React, { useState, useRef } from 'react'
import type { Track } from '../types'
import { TrackCell } from './TrackCell'

interface Props {
  tracks: Track[]
  playingTrackId: string | null
  playStartWallTime: number | null
  playedIds: Set<string>
  missingFileIds: Set<string>
  loadingIds: Set<string>
  isMonitorMode: boolean
  isReordering: boolean
  isAddToPlaylistMode: boolean
  onPlayTrack: (track: Track) => void
  onEditTrack: (track: Track) => void
  onAddTracks: () => void
  onReorder: (newTracks: Track[]) => void
  onAddToPlaylist: (track: Track) => void
}

export function TrackGrid({ tracks, playingTrackId, playStartWallTime, playedIds, missingFileIds, loadingIds, isMonitorMode, isReordering, isAddToPlaylistMode, onPlayTrack, onEditTrack, onAddTracks, onReorder, onAddToPlaylist }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const dragCounter = useRef(0)

  function handleDragStart(i: number) {
    setDragIndex(i)
    dragCounter.current = 0
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

  if (tracks.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        color: '#475569'
      }}>
        <div style={{ fontSize: 14 }}>No tracks in this bank</div>
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
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 12, background: isMonitorMode ? '#431407' : undefined, transition: 'background 0.2s' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: 6
      }}>
        {tracks.map((track, i) => (
          <div
            key={track.id}
            draggable={isReordering}
            onDragStart={() => handleDragStart(i)}
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
              isPlayed={playedIds.has(track.id)}
              isMissing={missingFileIds.has(track.id)}
              isLoading={loadingIds.has(track.id)}
              playStartWallTime={playingTrackId === track.id ? playStartWallTime : null}
              isReordering={isReordering}
              isAddToPlaylistMode={isAddToPlaylistMode}
              onClick={isReordering ? () => {} : isAddToPlaylistMode ? () => onAddToPlaylist(track) : () => onPlayTrack(track)}
              onEdit={(isReordering || isAddToPlaylistMode) ? () => {} : () => onEditTrack(track)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
