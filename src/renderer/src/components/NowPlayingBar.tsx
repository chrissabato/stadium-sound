import React, { useEffect, useRef, useState } from 'react'
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

export function NowPlayingBar({ track, isPlaying, audioCtx, startTime, inPoint, outPoint, onStop }: Props) {
  const [elapsed, setElapsed] = useState(0)
  const rafRef = useRef<number | null>(null)
  const lastProbeRef = useRef(0)

  useEffect(() => {
    if (!isPlaying || !audioCtx || startTime === null) {
      setElapsed(0)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      return
    }

    function tick() {
      try {
        if (audioCtx && startTime !== null) {
          const e = audioCtx.currentTime - startTime
          setElapsed(Math.min(e, outPoint - inPoint))

          // #14 probe: report what this component actually computes.
          const now = Date.now()
          if (now - lastProbeRef.current >= 2000) {
            lastProbeRef.current = now
            console.warn(
              `[audio][npbar] e=${e.toFixed(2)} in=${inPoint} out=${outPoint} ctxState=${audioCtx.state}`
            )
          }
        }
      } catch (err) {
        console.error('[audio] NowPlayingBar tick failed, will retry next frame', err)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [isPlaying, audioCtx, startTime, inPoint, outPoint])

  const duration = outPoint - inPoint
  const progress = duration > 0 ? Math.min(elapsed / duration, 1) : 0

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
          <span style={{ fontSize: 12, color: '#64748b', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
            {formatTime(elapsed)}
          </span>
          <div style={{
            flex: 1,
            height: 12,
            background: '#334155',
            borderRadius: 6,
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${progress * 100}%`,
              background: '#22c55e',
              transition: 'width 0.1s linear'
            }} />
          </div>
          <span style={{
            fontSize: 28,
            fontWeight: 700,
            color: '#f1f5f9',
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
            textAlign: 'right'
          }}>
            -{formatTime(Math.max(0, duration - elapsed))}
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
