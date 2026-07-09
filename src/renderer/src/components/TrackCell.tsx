import React, { useEffect, useRef, useState } from 'react'
import type { Track } from '../types'
import { formatTime } from '../types'

interface Props {
  track: Track
  isPlaying: boolean
  isMonitorPlaying: boolean
  isPlayed: boolean
  isMissing: boolean
  isLoading: boolean
  playStartWallTime: number | null
  isReordering: boolean
  isAddToPlaylistMode: boolean
  showTooltip: boolean
  isHighlighted: boolean
  onClick: () => void
  onEdit: () => void
}

export function TrackCell({ track, isPlaying, isMonitorPlaying, isPlayed, isMissing, isLoading, playStartWallTime, isReordering, isAddToPlaylistMode, showTooltip, isHighlighted, onClick, onEdit }: Props) {
  const trackDuration = track.outPoint - track.inPoint
  const hasCustomPoints = track.inPoint > 0 || track.outPoint < track.duration
  const hasPlayer = !!(track.playerNumber || track.playerFirstName || track.playerLastName)
  const overlayRef = useRef<HTMLDivElement>(null)
  const cellRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const colorBarOffset = track.colorLabel ? 5 : 0
  const [tooltip, setTooltip] = useState<{ x: number; y: number; above: boolean } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!contextMenu) return
    function close() { setContextMenu(null) }
    function closeOnEscape(e: KeyboardEvent) { if (e.key === 'Escape') setContextMenu(null) }
    window.addEventListener('keydown', closeOnEscape)
    // Right-clicking fires a trailing 'click' event right after 'contextmenu' on
    // this interaction — registering the outside-click listener synchronously
    // would catch that trailing click and close the menu instantly. Deferring
    // to the next tick lets that click pass before we start listening.
    const timer = setTimeout(() => {
      window.addEventListener('click', close)
      window.addEventListener('contextmenu', close)
    }, 0)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [contextMenu])

  useEffect(() => {
    if (isHighlighted) cellRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [isHighlighted])

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    if (!isPlaying || playStartWallTime == null || trackDuration <= 0) {
      if (overlayRef.current) overlayRef.current.style.background = 'none'
      return
    }

    const durationMs = trackDuration * 1000

    function tick() {
      try {
        const p = Math.min((Date.now() - playStartWallTime!) / durationMs, 1)
        if (overlayRef.current) {
          overlayRef.current.style.background =
            `linear-gradient(to right, rgba(0,0,0,0.22) ${p * 100}%, transparent ${p * 100}%)`
        }
      } catch (err) {
        console.error('TrackCell progress tick failed, will retry next frame', err)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [isPlaying, playStartWallTime, trackDuration])

  return (
    <div
      ref={cellRef}
      onClick={onClick}
      onContextMenu={(e) => {
        if (isReordering || isAddToPlaylistMode) return
        e.preventDefault()
        setContextMenu({ x: e.clientX, y: e.clientY })
      }}
      style={{
        position: 'relative',
        padding: '10px 12px',
        background: isReordering ? '#1e3a5f' : isPlaying ? '#15803d' : isMonitorPlaying ? '#052e12' : isPlayed ? '#7f1d1d' : isMissing ? '#1c1408' : '#1e293b',
        border: `1px solid ${isHighlighted ? '#3b82f6' : isReordering ? '#3b82f6' : isPlaying ? '#16a34a' : isMonitorPlaying ? '#39ff14' : isPlayed ? '#991b1b' : isMissing ? '#78350f' : '#334155'}`,
        borderRadius: 4,
        cursor: isReordering ? 'grab' : 'pointer',
        minHeight: 72,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        transition: 'background 0.1s, border-color 0.1s, box-shadow 0.2s',
        boxShadow: [
          isHighlighted ? '0 0 0 3px #3b82f6, 0 0 16px rgba(59,130,246,0.6)' : null,
          isPlaying ? '0 0 12px rgba(21,128,61,0.5)' : null,
          isMonitorPlaying ? '0 0 8px rgba(57,255,20,0.7)' : null
        ].filter(Boolean).join(', ') || 'none',
        overflow: 'hidden'
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget
        if (!isPlaying) el.style.background = isReordering ? '#254a7a' : isMonitorPlaying ? '#0a3d18' : isPlayed ? '#991b1b' : '#263548'
        if (showTooltip) {
          const rect = el.getBoundingClientRect()
          const above = rect.top > 70
          setTooltip({ x: rect.left + rect.width / 2, y: above ? rect.top : rect.bottom, above })
        }
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget
        if (!isPlaying) el.style.background = isReordering ? '#1e3a5f' : isMonitorPlaying ? '#052e12' : isPlayed ? '#7f1d1d' : '#1e293b'
        setTooltip(null)
      }}
    >
      {track.colorLabel && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: track.colorLabel,
          borderTopLeftRadius: 4,
          borderTopRightRadius: 4,
          pointerEvents: 'none'
        }} />
      )}

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

      {track.hotkey && !isReordering && !isAddToPlaylistMode && (
        <div style={{
          position: 'absolute',
          top: (isMissing ? 22 : 4) + colorBarOffset,
          left: 4,
          background: 'rgba(15,23,42,0.85)',
          border: '1px solid #334155',
          borderRadius: 3,
          color: '#94a3b8',
          fontSize: 10,
          fontWeight: 700,
          padding: '1px 4px',
          lineHeight: 1.4,
          zIndex: 1
        }}>
          {track.hotkey}
        </div>
      )}

      {isMissing && (
        <div style={{
          position: 'absolute',
          top: 4 + colorBarOffset,
          left: 4,
          background: '#92400e',
          border: '1px solid #b45309',
          borderRadius: 3,
          color: '#fde68a',
          fontSize: 10,
          fontWeight: 700,
          padding: '1px 4px',
          lineHeight: 1.4,
          zIndex: 1,
          letterSpacing: '0.02em'
        }}>
          ⚠ missing
        </div>
      )}

      {isReordering ? (
        <div style={{
          position: 'absolute',
          top: 4 + colorBarOffset,
          right: 4,
          color: '#93c5fd',
          fontSize: 13,
          lineHeight: 1,
          userSelect: 'none',
          zIndex: 1
        }}>
          ⠿
        </div>
      ) : isAddToPlaylistMode ? (
        <div
          title="Click to add to playlist"
          style={{
            position: 'absolute',
            top: 4 + colorBarOffset,
            right: 4,
            background: '#1e3a5f',
            border: '1px solid #3b82f6',
            borderRadius: 3,
            color: '#93c5fd',
            fontSize: 12,
            fontWeight: 700,
            padding: '1px 5px',
            lineHeight: 1.4,
            zIndex: 1
          }}
        >
          +
        </div>
      ) : null}

      {hasPlayer ? (
        <>
          {track.playerNumber && (
            <div style={{
              fontSize: 28,
              fontWeight: 800,
              lineHeight: 1,
              color: isPlaying || isMonitorPlaying ? '#ffffff' : isPlayed ? '#fecaca' : '#f1f5f9',
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
                color: isPlaying || isMonitorPlaying ? '#ffffff' : isPlayed ? '#fecaca' : '#e2e8f0',
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
                color: isPlaying ? '#86efac' : isMonitorPlaying ? '#d9f99d' : isPlayed ? '#fca5a5' : '#94a3b8',
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
        <span style={{ fontSize: 11, color: isPlaying ? '#86efac' : isMonitorPlaying ? '#d9f99d' : isPlayed ? '#fca5a5' : '#64748b', fontVariantNumeric: 'tabular-nums' }}>
          {formatTime(trackDuration > 0 ? trackDuration : track.duration)}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {isLoading && !isPlaying && (
            <div
              title="Loading audio…"
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                border: '1.5px solid rgba(148,163,184,0.35)',
                borderTopColor: '#94a3b8',
                animation: 'track-loading-spin 0.7s linear infinite'
              }}
            />
          )}
          {hasCustomPoints && (
            <span style={{ fontSize: 10, color: isPlaying ? '#86efac' : isMonitorPlaying ? '#d9f99d' : isPlayed ? '#fca5a5' : '#475569' }}>✂</span>
          )}
        </div>
      </div>

      {showTooltip && tooltip && (
        <div style={{
          position: 'fixed',
          left: tooltip.x,
          top: tooltip.y,
          transform: `translate(-50%, ${tooltip.above ? 'calc(-100% - 8px)' : '8px'})`,
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: 4,
          padding: '6px 10px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
          zIndex: 100,
          maxWidth: 260,
          whiteSpace: 'normal'
        }}>
          {hasPlayer && (
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>
              {[track.playerNumber && `#${track.playerNumber}`, track.playerFirstName, track.playerLastName].filter(Boolean).join(' ')}
            </div>
          )}
          <div style={{ fontSize: 12, fontWeight: hasPlayer ? 400 : 700, color: hasPlayer ? '#94a3b8' : '#f1f5f9' }}>
            {track.artist ? `${track.artist} — ${track.title}` : track.title}
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: 4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            padding: 4,
            zIndex: 200,
            minWidth: 140
          }}
        >
          <button
            onClick={() => { setContextMenu(null); onEdit() }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              background: 'none',
              border: 'none',
              borderRadius: 3,
              color: '#e2e8f0',
              fontSize: 13,
              padding: '6px 10px',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#1e293b' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
          >
            ✎ Edit Track
          </button>
        </div>
      )}
    </div>
  )
}
