import React from 'react'
import type { Track } from '../types'
import { TrackCell } from './TrackCell'

interface Props {
  tracks: Track[]
  playingTrackId: string | null
  playStartWallTime: number | null
  playedIds: Set<string>
  isMonitorMode: boolean
  onPlayTrack: (track: Track) => void
  onEditTrack: (track: Track) => void
  onAddTracks: () => void
}

export function TrackGrid({ tracks, playingTrackId, playStartWallTime, playedIds, isMonitorMode, onPlayTrack, onEditTrack, onAddTracks }: Props) {
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
        {tracks.map((track) => (
          <TrackCell
            key={track.id}
            track={track}
            isPlaying={playingTrackId === track.id}
            isPlayed={playedIds.has(track.id)}
            playStartWallTime={playingTrackId === track.id ? playStartWallTime : null}
            onClick={() => onPlayTrack(track)}
            onEdit={() => onEditTrack(track)}
          />
        ))}
      </div>
    </div>
  )
}
