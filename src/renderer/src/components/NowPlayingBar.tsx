import React, { useEffect, useRef } from 'react'
import type { Track } from '../types'
import { formatTime } from '../types'

interface Props {
  track: Track | null
  isPlaying: boolean
  audioCtx: AudioContext | null
  startTime: number | null
  inPoint: number
  outPoint: number
  onStop: () => void
}

// Progress and the time readouts are written directly to the DOM from the
// rAF loop (like TrackCell's progress overlay) instead of per-frame React
// state + a CSS width transition: the loop already updates every frame, and
// per-frame-restarted transitions are exactly what froze on some machines
// (#14) while plain style writes kept working.
export function NowPlayingBar({ track, isPlaying, audioCtx, startTime, inPoint, outPoint, onStop }: Props) {
  const rafRef = useRef<number | null>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const elapsedRef = useRef<HTMLSpanElement>(null)
  const remainingRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const duration = outPoint - inPoint

    function paint(elapsed: number) {
      const progress = duration > 0 ? Math.min(elapsed / duration, 1) : 0
      if (fillRef.current) fillRef.current.style.width = `${progress * 100}%`
      if (elapsedRef.current) elapsedRef.current.textContent = formatTime(elapsed)
      if (remainingRef.current) remainingRef.current.textContent = `-${formatTime(Math.max(0, duration - elapsed))}`
    }

    if (!isPlaying || !audioCtx || startTime === null) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      paint(0)
      return
    }

    function tick() {
      try {
        if (audioCtx && startTime !== null) {
          paint(Math.min(audioCtx.currentTime - startTime, duration))
        }
      } catch (err) {
        console.error('[audio] NowPlayingBar tick failed, will retry next frame', err)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [isPlaying, audioCtx, startTime, inPoint, outPoint])

  return (
    <div style={{
      background: '#1e293b',
      borderTop: '1px solid #334155',
      padding: '10px 20px',
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      gap: 20,
      minHeight: 68
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {track ? (
          <>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>Now Playing</div>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#f1f5f9',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {track.artist ? `${track.artist} — ${track.title}` : track.title}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: '#475569' }}>No track playing</div>
        )}
      </div>

      {track && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 2, minWidth: 0 }}>
          <span
            ref={elapsedRef}
            style={{ fontSize: 12, color: '#64748b', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}
          >
            {formatTime(0)}
          </span>
          <div style={{
            flex: 1,
            height: 12,
            background: '#334155',
            borderRadius: 6,
            overflow: 'hidden'
          }}>
            <div
              ref={fillRef}
              style={{
                height: '100%',
                width: '0%',
                background: '#22c55e'
              }}
            />
          </div>
          <span
            ref={remainingRef}
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: '#f1f5f9',
              fontVariantNumeric: 'tabular-nums',
              flexShrink: 0,
              textAlign: 'right'
            }}
          >
            -{formatTime(Math.max(0, outPoint - inPoint))}
          </span>
        </div>
      )}

      <button
        onClick={onStop}
        disabled={!isPlaying}
        style={{
          padding: '6px 16px',
          background: isPlaying ? '#dc2626' : '#1e293b',
          color: isPlaying ? '#fff' : '#475569',
          border: `1px solid ${isPlaying ? '#dc2626' : '#334155'}`,
          borderRadius: 4,
          fontWeight: 600,
          fontSize: 13,
          flexShrink: 0
        }}
      >
        ■ Stop
      </button>
    </div>
  )
}
