import React, { useState, useRef } from 'react'
import type { Playlist, PlaylistTrack } from '../types'
import { formatTime } from '../types'

interface Props {
  playlist: Playlist
  isAddToPlaylistMode: boolean
  hasAnyPlaylist: boolean
  isPlayingThis: boolean
  playlistIndex: number
  selectedTrackIndex: number
  isTrackPlaying: boolean
  onToggleAddMode: () => void
  onAddTracksFromFile: () => void
  onRemoveTrack: (itemId: string) => void
  onReorderTracks: (newTracks: PlaylistTrack[]) => void
  onSelectRow: (index: number) => void
  onPlay: () => void
  onPause: () => void
  onSkip: () => void
  onStop: () => void
}

export function PlaylistTrackList({
  playlist,
  isAddToPlaylistMode,
  hasAnyPlaylist,
  isPlayingThis,
  playlistIndex,
  selectedTrackIndex,
  isTrackPlaying,
  onToggleAddMode,
  onAddTracksFromFile,
  onRemoveTrack,
  onReorderTracks,
  onSelectRow,
  onPlay,
  onPause,
  onSkip,
  onStop
}: Props) {
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
      const next = [...playlist.tracks]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(i, 0, moved)
      onReorderTracks(next)
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

  const canPause = isPlayingThis && isTrackPlaying
  const canSkip = isPlayingThis && playlistIndex + 1 < playlist.tracks.length
  const canStop = isPlayingThis

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid #1e293b',
        flexShrink: 0,
        gap: 6
      }}>
        <span style={{ fontSize: 11, color: '#64748b' }}>{playlist.tracks.length} tracks</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={onToggleAddMode}
            disabled={!hasAnyPlaylist}
            title="Click soundboard buttons to add them to this playlist"
            style={{
              padding: '5px 10px',
              background: isAddToPlaylistMode ? '#1e3a5f' : '#1e293b',
              border: `1px solid ${isAddToPlaylistMode ? '#3b82f6' : '#334155'}`,
              borderRadius: 4,
              color: isAddToPlaylistMode ? '#93c5fd' : hasAnyPlaylist ? '#94a3b8' : '#475569',
              fontSize: 11,
              fontWeight: isAddToPlaylistMode ? 600 : 400
            }}
          >
            {isAddToPlaylistMode ? '✓ Adding' : '+ Add via Buttons'}
          </button>
          <button
            onClick={onAddTracksFromFile}
            style={{
              padding: '5px 10px',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 4,
              color: '#94a3b8',
              fontSize: 11
            }}
          >
            + Add from File
          </button>
        </div>
      </div>

      {playlist.tracks.length === 0 ? (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          color: '#475569',
          padding: 16,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 12 }}>No tracks in this playlist</div>
          <div style={{ fontSize: 11, color: '#334155' }}>Add from a file, or toggle add-via-buttons above</div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {playlist.tracks.map((track, i) => {
            const isCurrent = isPlayingThis && i === playlistIndex && isTrackPlaying
            const isSelected = !isCurrent && i === selectedTrackIndex
            return (
              <div
                key={track.itemId}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragEnter={() => handleDragEnter(i)}
                onDragLeave={handleDragLeave}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(i)}
                onDragEnd={handleDragEnd}
                onClick={() => onSelectRow(i)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  background: dragIndex === i ? 'rgba(255,255,255,0.04)' : isCurrent ? '#15803d' : isSelected ? '#1e3a5f' : 'transparent',
                  borderBottom: `1px solid ${dropIndex === i && dragIndex !== i ? '#3b82f6' : '#1e293b'}`,
                  opacity: dragIndex === i ? 0.35 : 1,
                  transition: 'opacity 0.1s'
                }}
              >
                <span style={{ fontSize: 11, color: isCurrent ? '#bbf7d0' : isSelected ? '#93c5fd' : '#475569', width: 16, flexShrink: 0, textAlign: 'right' }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: isCurrent ? '#fff' : isSelected ? '#93c5fd' : '#e2e8f0',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {track.title}
                  </div>
                  {track.artist && (
                    <div style={{
                      fontSize: 10,
                      color: isCurrent ? '#bbf7d0' : '#64748b',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {track.artist}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 10, color: isCurrent ? '#bbf7d0' : '#64748b', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {formatTime((track.outPoint || track.duration) - track.inPoint)}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveTrack(track.itemId) }}
                  title="Remove from playlist"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: isCurrent ? 'rgba(255,255,255,0.7)' : '#64748b',
                    fontSize: 14,
                    lineHeight: 1,
                    padding: '0 2px',
                    flexShrink: 0,
                    cursor: 'pointer'
                  }}
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '8px 12px',
        borderTop: '1px solid #1e293b',
        flexShrink: 0
      }}>
        <button
          onClick={onPlay}
          disabled={playlist.tracks.length === 0}
          title="Play"
          style={{
            padding: '6px 14px',
            background: playlist.tracks.length > 0 ? '#15803d' : '#1e293b',
            color: playlist.tracks.length > 0 ? '#fff' : '#475569',
            border: 'none',
            borderRadius: 4,
            fontWeight: 600,
            fontSize: 12
          }}
        >
          ▶ Play
        </button>
        <button
          onClick={onPause}
          disabled={!canPause}
          title="Pause"
          style={{
            padding: '6px 14px',
            background: canPause ? '#1e293b' : '#1e293b',
            color: canPause ? '#f1f5f9' : '#475569',
            border: `1px solid ${canPause ? '#334155' : '#1e293b'}`,
            borderRadius: 4,
            fontWeight: 600,
            fontSize: 12
          }}
        >
          ❚❚ Pause
        </button>
        <button
          onClick={onSkip}
          disabled={!canSkip}
          title="Skip to next"
          style={{
            padding: '6px 14px',
            background: '#1e293b',
            color: canSkip ? '#f1f5f9' : '#475569',
            border: `1px solid ${canSkip ? '#334155' : '#1e293b'}`,
            borderRadius: 4,
            fontWeight: 600,
            fontSize: 12
          }}
        >
          ⏭ Skip
        </button>
        <button
          onClick={onStop}
          disabled={!canStop}
          title="Stop"
          style={{
            padding: '6px 14px',
            background: canStop ? '#dc2626' : '#1e293b',
            color: canStop ? '#fff' : '#475569',
            border: `1px solid ${canStop ? '#dc2626' : '#1e293b'}`,
            borderRadius: 4,
            fontWeight: 600,
            fontSize: 12
          }}
        >
          ■ Stop
        </button>
      </div>
    </div>
  )
}
