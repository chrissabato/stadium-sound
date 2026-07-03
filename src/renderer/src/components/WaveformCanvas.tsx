import React, { useRef, useEffect, useCallback } from 'react'

interface Props {
  audioBuffer: AudioBuffer | null
  inPoint: number
  outPoint: number
  duration: number
  onInPointChange: (t: number) => void
  onOutPointChange: (t: number) => void
}

export function WaveformCanvas({ audioBuffer, inPoint, outPoint, duration, onInPointChange, onOutPointChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragging = useRef<'in' | 'out' | null>(null)

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !audioBuffer) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width
    const H = canvas.height

    ctx.clearRect(0, 0, W, H)

    // Background
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, W, H)

    // Shaded region outside in/out
    const inX = Math.round((inPoint / duration) * W)
    const outX = Math.round((outPoint / duration) * W)
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, 0, inX, H)
    ctx.fillRect(outX, 0, W - outX, H)

    // Waveform
    const data = audioBuffer.getChannelData(0)
    const step = Math.max(1, Math.floor(data.length / W))
    const mid = H / 2

    for (let x = 0; x < W; x++) {
      let max = 0
      const start = x * step
      for (let i = 0; i < step; i++) {
        const abs = Math.abs(data[start + i] || 0)
        if (abs > max) max = abs
      }
      const h = max * mid
      const isActive = x >= inX && x <= outX
      ctx.fillStyle = isActive ? '#22c55e' : '#334155'
      ctx.fillRect(x, mid - h, 1, h * 2 || 1)
    }

    // In handle
    ctx.fillStyle = '#38bdf8'
    ctx.fillRect(inX - 1, 0, 2, H)
    ctx.beginPath()
    ctx.moveTo(inX, 0)
    ctx.lineTo(inX + 10, 0)
    ctx.lineTo(inX, 14)
    ctx.closePath()
    ctx.fill()

    // Out handle
    ctx.fillStyle = '#ef4444'
    ctx.fillRect(outX - 1, 0, 2, H)
    ctx.beginPath()
    ctx.moveTo(outX, 0)
    ctx.lineTo(outX - 10, 0)
    ctx.lineTo(outX, 14)
    ctx.closePath()
    ctx.fill()
  }, [audioBuffer, inPoint, outPoint, duration])

  useEffect(() => { drawWaveform() }, [drawWaveform])

  function posToTime(clientX: number): number {
    const canvas = canvasRef.current
    if (!canvas) return 0
    const rect = canvas.getBoundingClientRect()
    const ratio = (clientX - rect.left) / rect.width
    return Math.max(0, Math.min(duration, ratio * duration))
  }

  function onMouseDown(e: React.MouseEvent) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const inX = (inPoint / duration) * rect.width
    const outX = (outPoint / duration) * rect.width
    const GRAB = 10
    if (Math.abs(x - inX) < GRAB) {
      dragging.current = 'in'
    } else if (Math.abs(x - outX) < GRAB) {
      dragging.current = 'out'
    }
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragging.current) return
    const t = posToTime(e.clientX)
    if (dragging.current === 'in') {
      onInPointChange(Math.min(t, outPoint - 0.01))
    } else {
      onOutPointChange(Math.max(t, inPoint + 0.01))
    }
  }

  function onMouseUp() {
    dragging.current = null
  }

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={100}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      style={{
        width: '100%',
        height: 100,
        borderRadius: 4,
        cursor: 'ew-resize',
        display: 'block'
      }}
    />
  )
}
