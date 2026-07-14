import React, { useEffect, useRef } from 'react'
import type { BusAnalysers } from '../hooks/useAudioEngine'

interface Props {
  getAnalysers: () => BusAnalysers | null
}

// Meter ballistics: fast attack (jump straight to a louder reading) and a
// slow release (decay toward quiet) so the bars read like a real level meter
// instead of jittering with every sample.
const RELEASE = 0.85
const MIN_DB = -50
const MAX_DB = 0

function levelFromAnalyser(analyser: AnalyserNode, buffer: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buffer)
  let sumSquares = 0
  for (let i = 0; i < buffer.length; i++) {
    const v = (buffer[i] - 128) / 128
    sumSquares += v * v
  }
  const rms = Math.sqrt(sumSquares / buffer.length)
  if (rms <= 0) return 0
  const db = 20 * Math.log10(rms)
  return Math.max(0, Math.min(1, (db - MIN_DB) / (MAX_DB - MIN_DB)))
}

function barColor(level: number): string {
  if (level > 0.9) return '#ef4444'
  if (level > 0.75) return '#f59e0b'
  return '#22c55e'
}

// Momentary loudness per ITU-R BS.1770: mean square of the K-weighted signal
// over a 400ms window, summed across channels (G = 1 for L/R), in LUFS.
// Readings below the -70 LUFS absolute gate display as silence.
const MOMENTARY_WINDOW_MS = 400
const LUFS_GATE = -70
// Refreshing the text every frame would just flicker; ~6 updates/sec reads
// like a real loudness meter.
const LUFS_TEXT_INTERVAL_MS = 150

function meanSquare(analyser: AnalyserNode, buffer: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(buffer)
  let sum = 0
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i]
  return sum / buffer.length
}

// The fills are driven directly from the rAF loop (like TrackCell's progress
// overlay) rather than through React state + CSS transitions: the loop
// already runs every frame and applies its own attack/release smoothing, so
// a transition adds nothing — and per-frame-restarted transitions are
// exactly what froze on some machines (#14) while plain style writes kept
// working.
export function LevelMeters({ getAnalysers }: Props) {
  const rafRef = useRef<number | null>(null)
  const smoothedRef = useRef({ left: 0, right: 0 })
  const bufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
  const leftFillRef = useRef<HTMLDivElement>(null)
  const rightFillRef = useRef<HTMLDivElement>(null)
  const lufsBufferRef = useRef<Float32Array<ArrayBuffer> | null>(null)
  const lufsSamplesRef = useRef<{ t: number; z: number }[]>([])
  const lufsTextRef = useRef<HTMLDivElement>(null)
  const lufsLastUpdateRef = useRef(0)

  useEffect(() => {
    function paint(fill: HTMLDivElement | null, level: number) {
      if (!fill) return
      fill.style.height = `${level * 100}%`
      fill.style.background = barColor(level)
    }

    function tick() {
      // A thrown error here must never abort the loop permanently — this
      // effect's deps are stable for the app's lifetime, so there is no
      // remount to implicitly restart it (unlike the per-track rAF loops).
      try {
        const analysers = getAnalysers()
        const prev = smoothedRef.current
        let left = prev.left
        let right = prev.right

        if (analysers) {
          if (!bufferRef.current || bufferRef.current.length !== analysers.left.fftSize) {
            bufferRef.current = new Uint8Array(analysers.left.fftSize)
          }
          const buffer = bufferRef.current
          const rawLeft = levelFromAnalyser(analysers.left, buffer)
          const rawRight = levelFromAnalyser(analysers.right, buffer)
          left = rawLeft > prev.left ? rawLeft : prev.left * RELEASE
          right = rawRight > prev.right ? rawRight : prev.right * RELEASE
        } else {
          left = prev.left * RELEASE
          right = prev.right * RELEASE
        }

        // Snap the long decay tail to true silence instead of animating forever
        // on imperceptibly small values.
        if (left < 0.002) left = 0
        if (right < 0.002) right = 0

        if (left !== prev.left || right !== prev.right) {
          smoothedRef.current = { left, right }
          paint(leftFillRef.current, left)
          paint(rightFillRef.current, right)
        }

        // LUFS readout — same direct-DOM-write pattern as the bars above.
        const now = performance.now()
        const samples = lufsSamplesRef.current
        if (analysers) {
          const size = analysers.loudnessLeft.fftSize
          if (!lufsBufferRef.current || lufsBufferRef.current.length !== size) {
            lufsBufferRef.current = new Float32Array(size)
          }
          const zl = meanSquare(analysers.loudnessLeft, lufsBufferRef.current)
          const zr = meanSquare(analysers.loudnessRight, lufsBufferRef.current)
          samples.push({ t: now, z: zl + zr })
        }
        while (samples.length > 0 && samples[0].t < now - MOMENTARY_WINDOW_MS) samples.shift()

        if (now - lufsLastUpdateRef.current >= LUFS_TEXT_INTERVAL_MS && lufsTextRef.current) {
          lufsLastUpdateRef.current = now
          let text = '—'
          if (samples.length > 0) {
            const mean = samples.reduce((acc, s) => acc + s.z, 0) / samples.length
            if (mean > 0) {
              const lufs = -0.691 + 10 * Math.log10(mean)
              if (lufs > LUFS_GATE) text = lufs.toFixed(1)
            }
          }
          if (lufsTextRef.current.textContent !== text) lufsTextRef.current.textContent = text
        }
      } catch (err) {
        console.error('[audio] LevelMeters tick failed, will retry next frame', err)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [getAnalysers])

  const barStyle: React.CSSProperties = {
    flex: 1,
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: 2,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    overflow: 'hidden'
  }

  return (
    <div style={{
      width: 44,
      flexShrink: 0,
      background: '#0f172a',
      borderLeft: '1px solid #1e293b',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '12px 8px 8px',
      gap: 6
    }}>
      <div style={{ display: 'flex', gap: 4, flex: 1, width: '100%' }}>
        <div style={barStyle}>
          <div ref={leftFillRef} style={{ width: '100%', height: '0%', background: '#22c55e' }} />
        </div>
        <div style={barStyle}>
          <div ref={rightFillRef} style={{ width: '100%', height: '0%', background: '#22c55e' }} />
        </div>
      </div>
      <div style={{ fontSize: 9, color: '#475569', letterSpacing: '0.1em' }}>L&nbsp;&nbsp;R</div>
      <div style={{ textAlign: 'center', lineHeight: 1.25 }}>
        <div
          ref={lufsTextRef}
          title="Momentary loudness (400ms), ITU-R BS.1770"
          style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}
        >
          —
        </div>
        <div style={{ fontSize: 8, color: '#475569', letterSpacing: '0.08em' }}>LUFS</div>
      </div>
    </div>
  )
}
