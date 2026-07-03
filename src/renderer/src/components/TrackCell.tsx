import React, { useEffect, useRef } from 'react'
import type { Track } from '../types'
import { formatTime } from '../types'

interface Props {
  track: Track
  isPlaying: boolean
  isPlayed: boolean
  playStartWallTime: number | null
  isReordering: boolean
  onClick: () => void
  onEdit: () => void
}

export function TrackCell({ track, isPlaying, isPlayed, playStartWallTime, isReordering, onClick, onEdit }: Props) {
  const trackDuration = track.outPoint - track.inPoint
  const hasCustomPoints = track.inPoint > 0 || track.outPoint < track.duration
  const hasPlayer = !!(track.playerNumber || track.playerFirstName || track.playerLastName)
  const overlayRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    if (!isPlaying || playStartWallTime == null || trackDuration <= 0) {
      if (overlayRef.current) overlayRef.current.style.background = 'none'
      return
    }

    const durationMs = trackDuration * 1000

    function tick() {
      const p = Math.min((Date.now() - playStartWallTime!) / durationMs, 1)
      if (overlayRef.current) {
        overlayRef.current.style.background =
          `linear-gradient(to right, rgba(0,0,0,0.22) ${p * 100}%, transparent ${p * 100}%)`
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [isPlaying, playStartWallTime, trackDuration])

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        padding: '10px 12px',
        background: isPlaying ? '#15803d' : isPlayed ? '#7f1d1d' : '#1e293b',
        border: `1px solid ${isPlaying ? '#16a34a' : isPlayed ? '#991b1b' : '#334155'}`,
        borderRadius: 4,
        cursor: 'pointer',
        minHeight: 72,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        transition: 'background 0.1s, border-color 0.1s',
        boxShadow: isPlaying ? '0 0 12px rgba(21,128,61,0.5)' : 'none',
        overflow: 'hidden'
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget
        if (!isPlaying) el.style.background = isPlayed ? '#991b1b' : '#263548'
        const btn = el.querySelector<HTMLElement>('.edit-btn')
        if (btn) btn.style.opacity = '1'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget
        if (!isPlaying) el.style.background = isPlayed ? '#7f1d1d' : '#1e293b'
        const btn = el.querySelector<HTMLElement>('.edit-btn')
        if (btn) btn.style.opacity = '0'
      }}
    >
      {/* Progress fill overlay — updated directly by RAF, no React re-renders */}
      <div
        ref={overlayRef}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          borderRadius: 4
        }}
      />

      {isReordering ? (
        <div style={{
          position: 'absolute',
          top: 4,
          right: 4,
          color: '#475569',
          fontSize: 13,
          lineHeight: 1,
          userSelect: 'none',
          zIndex: 1
        }}>
          ⠿
        </div>
      ) : (
        <button
          className="edit-btn"
          onClick={(e) => { e.stopPropagation(); onEdit() }}
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            background: 'rgba(15,23,42,0.8)',
            border: '1px solid #334155',
            borderRadius: 3,
            color: '#94a3b8',
            fontSize: 11,
            padding: '2px 5px',
            opacity: 0,
            transition: 'opacity 0.15s',
            lineHeight: 1.2,
            zIndex: 1
          }}
        >
          ✎
        </button>
      )}

      {hasPlayer ? (
        <>
          {track.playerNumber && (
            <div style={{
              fontSize: 28,
              fontWeight: 800,
              lineHeight: 1,
              color: isPlaying ? '#ffffff' : isPlayed ? '#fecaca' : '#f1f5f9',
              position: 'relative'
            }}>
              #{track.playerNumber}
            </div>
          )}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {track.playerLastName && (
              <div style={{
                fontSize: 13,
                fontWeight: 700,
                color: isPlaying ? '#ffffff' : isPlayed ? '#fecaca' : '#e2e8f0',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textTransform: 'uppercase',
                letterSpacing: '0.03em'
              }}>
                {track.playerLastName}
              </div>
            )}
            {track.playerFirstName && (
              <div style={{
                fontSize: 11,
                color: isPlaying ? '#86efac' : isPlayed ? '#fca5a5' : '#94a3b8',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {track.playerFirstName}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div style={{
            fontSize: 11,
            color: isPlaying ? '#86efac' : isPlayed ? '#fca5a5' : '#94a3b8',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            position: 'relative'
          }}>
            {track.artist || ' '}
          </div>
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: isPlaying ? '#ffffff' : isPlayed ? '#fecaca' : '#e2e8f0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            position: 'relative'
          }}>
            {track.title}
          </div>
        </>
      )}

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'relative'
      }}>
        <span style={{ fontSize: 11, color: isPlaying ? '#86efac' : isPlayed ? '#fca5a5' : '#64748b', fontVariantNumeric: 'tabular-nums' }}>
          {formatTime(trackDuration > 0 ? trackDuration : track.duration)}
        </span>
        {hasCustomPoints && (
          <span style={{ fontSize: 10, color: isPlaying ? '#86efac' : isPlayed ? '#fca5a5' : '#475569' }}>✂</span>
        )}
      </div>
    </div>
  )
}
