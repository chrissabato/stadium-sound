import React, { useState, useEffect, useCallback } from 'react'
import type { Track } from '../types'
import { formatTime, parseTime, normalizeHotkeyEvent, TRACK_COLORS } from '../types'
import { WaveformCanvas } from './WaveformCanvas'
import { createAnalyserChain, type BusAnalysers } from '../hooks/useAudioEngine'
import { LevelMeters } from './LevelMeters'

interface Props {
  track: Track | null
  onSave: (updated: Track) => void
  onRemove: (id: string) => void
  onClose: () => void
  // duration steers cache policy upstream: short clips land in the playback
  // cache, long/unknown files get a transient decode
  loadBuffer: (
    id: string,
    filePath: string,
    range: { duration: number | Promise<number>; inPoint?: number; outPoint?: number }
  ) => Promise<AudioBuffer>
  getBuffer: (filePath: string) => AudioBuffer | undefined
  // title of the other track in this bank currently holding the picked hotkey, if any —
  // used only to warn the user it'll be reassigned on save, doesn't block anything
  hotkeyOwner: (hotkey: string) => string | null
}

export function TrackEditor({ track, onSave, onRemove, onClose, loadBuffer, getBuffer, hotkeyOwner }: Props) {
  const [filePath, setFilePath] = useState('')
  const [artist, setArtist] = useState('')
  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState(0)
  const [inPoint, setInPoint] = useState(0)
  const [outPoint, setOutPoint] = useState(0)
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [playerNumber, setPlayerNumber] = useState('')
  const [playerFirstName, setPlayerFirstName] = useState('')
  const [playerLastName, setPlayerLastName] = useState('')
  const [hotkey, setHotkey] = useState<string | undefined>(undefined)
  const [capturingHotkey, setCapturingHotkey] = useState(false)
  const [colorLabel, setColorLabel] = useState<string | undefined>(undefined)
  const [volume, setVolume] = useState(1)
  const [previewing, setPreviewing] = useState(false)
  const previewNodeRef = React.useRef<AudioBufferSourceNode | null>(null)
  const previewGainRef = React.useRef<GainNode | null>(null)
  const previewCtxRef = React.useRef<AudioContext | null>(null)
  const previewStartCtxTimeRef = React.useRef<number>(0)
  const previewStartInPointRef = React.useRef<number>(0)
  const previewAnalysersRef = React.useRef<BusAnalysers | null>(null)
  // Stable identity — LevelMeters' rAF effect depends on this callback.
  const getPreviewAnalysers = useCallback(() => previewAnalysersRef.current, [])
  // Same pattern for the waveform playhead: previewCtxRef is nulled on
  // stop/end, which hides the playhead. Clamping to the visible range is
  // WaveformCanvas's job.
  const getPlayheadTime = useCallback(() => {
    const ctx = previewCtxRef.current
    if (!ctx) return null
    return previewStartInPointRef.current + (ctx.currentTime - previewStartCtxTimeRef.current)
  }, [])

  useEffect(() => {
    // Release the decoded buffer on close — a full song's PCM held in state
    // would otherwise outlive the editor.
    if (!track) { setAudioBuffer(null); return }
    setFilePath(track.filePath)
    setArtist(track.artist)
    setTitle(track.title)
    setDuration(track.duration)
    setInPoint(track.inPoint)
    setOutPoint(track.outPoint || track.duration)
    setPlayerNumber(track.playerNumber ?? '')
    setPlayerFirstName(track.playerFirstName ?? '')
    setPlayerLastName(track.playerLastName ?? '')
    setHotkey(track.hotkey)
    setCapturingHotkey(false)
    setColorLabel(track.colorLabel)
    setVolume(track.volume ?? 1)

    const existing = getBuffer(track.filePath)
    if (existing) {
      setAudioBuffer(existing)
    } else if (track.filePath) {
      setLoading(true)
      loadBuffer(track.id, track.filePath, {
        duration: track.duration,
        inPoint: track.inPoint,
        outPoint: track.outPoint
      })
        .then((buf) => { setAudioBuffer(buf); setLoading(false) })
        .catch(() => setLoading(false))
    }
  }, [track])

  async function refreshMetadata() {
    if (!filePath) return
    setRefreshing(true)
    try {
      const meta = await window.electronAPI.getTrackMetadata(filePath)
      setArtist(meta.artist)
      setTitle(meta.title)
    } finally {
      setRefreshing(false)
    }
  }

  async function browseFile() {
    const paths = await window.electronAPI.openAudioFiles(filePath || undefined)
    if (!paths.length || !track) return
    const path = paths[0]
    setLoading(true)
    try {
      const metaPromise = window.electronAPI.getTrackMetadata(path)
      const bufPromise = loadBuffer(track.id, path, {
        duration: metaPromise.then((meta) => meta.duration),
        inPoint: 0
      })
      const [meta, buf] = await Promise.all([metaPromise, bufPromise])
      setFilePath(path)
      setArtist(meta.artist)
      setTitle(meta.title)
      setDuration(meta.duration)
      setInPoint(0)
      setOutPoint(meta.duration)
      setAudioBuffer(buf)
    } finally {
      setLoading(false)
    }
  }

  function preview() {
    if (!audioBuffer) return
    stopPreview()
    // 48kHz keeps the K-weighting coefficients in createAnalyserChain valid.
    const ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 })
    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    // Preview through the track's level so the slider can be auditioned;
    // the level slider live-updates this node while previewing.
    const gainNode = ctx.createGain()
    gainNode.gain.value = volume
    source.connect(gainNode)
    gainNode.connect(ctx.destination)
    previewGainRef.current = gainNode
    // Meter the post-track-gain signal so the meters/LUFS follow the slider.
    previewAnalysersRef.current = createAnalyserChain(ctx, gainNode)
    const dur = outPoint - inPoint
    previewStartCtxTimeRef.current = ctx.currentTime
    previewStartInPointRef.current = inPoint
    source.start(0, inPoint, dur > 0 ? dur : undefined)
    previewCtxRef.current = ctx
    previewNodeRef.current = source
    setPreviewing(true)
    source.onended = () => {
      setPreviewing(false)
      ctx.close()
      previewCtxRef.current = null
      previewAnalysersRef.current = null
    }
  }

  function stopPreview() {
    try { previewNodeRef.current?.stop() } catch { /* */ }
    previewNodeRef.current = null
    previewCtxRef.current = null
    previewGainRef.current = null
    previewAnalysersRef.current = null
    setPreviewing(false)
  }

  function getPlayheadPosition(): number {
    if (!previewCtxRef.current) return inPoint
    const elapsed = previewCtxRef.current.currentTime - previewStartCtxTimeRef.current
    return Math.min(previewStartInPointRef.current + elapsed, outPoint)
  }

  function setInAtPlayhead() {
    const pos = getPlayheadPosition()
    setInPoint(Math.max(0, Math.min(pos, outPoint - 0.01)))
  }

  function adjustIn(delta: number) {
    setInPoint((prev) => Math.max(0, Math.min(prev + delta, outPoint - 0.01)))
  }

  function handleSave() {
    if (!track) return
    onSave({
      ...track,
      filePath,
      artist,
      title,
      duration,
      inPoint,
      outPoint: outPoint || duration,
      playerNumber: playerNumber || undefined,
      playerFirstName: playerFirstName || undefined,
      playerLastName: playerLastName || undefined,
      hotkey,
      colorLabel,
      volume: volume < 1 ? volume : undefined
    })
    stopPreview()
    onClose()
  }

  function handleHotkeyCapture(e: React.KeyboardEvent) {
    e.preventDefault()
    if (e.key === 'Escape') {
      setCapturingHotkey(false)
      return
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      setHotkey(undefined)
      setCapturingHotkey(false)
      return
    }
    const key = normalizeHotkeyEvent(e.nativeEvent)
    if (!key) return
    setHotkey(key)
    setCapturingHotkey(false)
  }

  if (!track) return null

  const fieldStyle: React.CSSProperties = {
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: 4,
    color: '#f1f5f9',
    padding: '6px 10px',
    fontSize: 13,
    width: '100%'
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100
    }}>
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 8,
        padding: 24,
        width: 860,
        maxWidth: '95vw',
        display: 'flex',
        flexDirection: 'column',
        gap: 16
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Edit Track</span>
          <button onClick={() => { stopPreview(); onClose() }} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {/* File */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1, fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {filePath || 'No file selected'}
          </div>
          <button
            onClick={browseFile}
            disabled={loading}
            style={{ padding: '6px 14px', background: '#3b82f6', border: 'none', borderRadius: 4, color: '#fff', fontSize: 13, flexShrink: 0 }}
          >
            {loading ? 'Loading…' : 'Browse…'}
          </button>
        </div>

        {/* Metadata */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: '#64748b' }}>Artist</label>
              <input style={fieldStyle} value={artist} onChange={(e) => setArtist(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: '#64748b' }}>Title</label>
              <input style={fieldStyle} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={refreshMetadata}
              disabled={!filePath || refreshing}
              title="Re-read artist and title from the file's ID3 tags"
              style={{
                padding: '4px 10px',
                background: 'none',
                border: '1px solid #334155',
                borderRadius: 4,
                color: refreshing ? '#475569' : '#64748b',
                fontSize: 11,
                cursor: filePath ? 'pointer' : 'default'
              }}
            >
              {refreshing ? 'Reading…' : '↻ Refresh from metadata'}
            </button>
          </div>
        </div>

        {/* Player info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: '#64748b' }}>Player (optional — overrides button display when set)</label>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1.5fr', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: '#475569' }}>Number</label>
              <input
                style={fieldStyle}
                value={playerNumber}
                onChange={(e) => setPlayerNumber(e.target.value)}
                placeholder="42"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: '#475569' }}>First Name</label>
              <input
                style={fieldStyle}
                value={playerFirstName}
                onChange={(e) => setPlayerFirstName(e.target.value)}
                placeholder="Michael"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: '#475569' }}>Last Name</label>
              <input
                style={fieldStyle}
                value={playerLastName}
                onChange={(e) => setPlayerLastName(e.target.value)}
                placeholder="Jordan"
              />
            </div>
          </div>
        </div>

        {/* Hotkey */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: '#64748b' }}>Keyboard Shortcut (plays this button from any bank)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {capturingHotkey ? (
              <input
                autoFocus
                readOnly
                value=""
                placeholder="Press a key… (Esc to cancel, Backspace to clear)"
                onKeyDown={handleHotkeyCapture}
                onBlur={() => setCapturingHotkey(false)}
                style={{ ...fieldStyle, width: 260, color: '#94a3b8' }}
              />
            ) : (
              <>
                <div style={{
                  minWidth: 36,
                  padding: '4px 10px',
                  textAlign: 'center',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 4,
                  color: hotkey ? '#f1f5f9' : '#475569',
                  fontSize: 13,
                  fontWeight: 700
                }}>
                  {hotkey ?? 'Not set'}
                </div>
                <button
                  onClick={() => setCapturingHotkey(true)}
                  style={{ padding: '5px 12px', background: '#334155', border: 'none', borderRadius: 4, color: '#f1f5f9', fontSize: 12, cursor: 'pointer' }}
                >
                  {hotkey ? 'Change…' : 'Set…'}
                </button>
                {hotkey && (
                  <button
                    onClick={() => setHotkey(undefined)}
                    style={{ padding: '5px 12px', background: 'none', border: '1px solid #334155', borderRadius: 4, color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}
                  >
                    Clear
                  </button>
                )}
                {hotkey && hotkeyOwner(hotkey) && (
                  <span style={{ fontSize: 11, color: '#fbbf24' }}>
                    Currently used by "{hotkeyOwner(hotkey)}" — will be reassigned to this button on save
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Color label */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: '#64748b' }}>Color Label</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => setColorLabel(undefined)}
              title="No color"
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: '#0f172a',
                border: `2px solid ${!colorLabel ? '#f1f5f9' : '#334155'}`,
                color: '#64748b',
                fontSize: 12,
                lineHeight: 1,
                padding: 0,
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
            {TRACK_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setColorLabel(color)}
                title={color}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: color,
                  border: `2px solid ${colorLabel === color ? '#f1f5f9' : 'transparent'}`,
                  boxShadow: colorLabel === color ? '0 0 0 1px rgba(0,0,0,0.4)' : 'none',
                  padding: 0,
                  cursor: 'pointer'
                }}
              />
            ))}
          </div>
        </div>

        {/* Audio level */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: '#64748b' }}>Audio Level (this track only, on top of the master volume)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                setVolume(v)
                if (previewGainRef.current) previewGainRef.current.gain.value = v
              }}
              style={{ width: 220, accentColor: '#f97316' }}
            />
            <span style={{ color: '#94a3b8', fontSize: 12, minWidth: 36 }}>
              {Math.round(volume * 100)}%
            </span>
            {volume < 1 && (
              <button
                onClick={() => {
                  setVolume(1)
                  if (previewGainRef.current) previewGainRef.current.gain.value = 1
                }}
                style={{ padding: '4px 10px', background: 'none', border: '1px solid #334155', borderRadius: 4, color: '#94a3b8', fontSize: 11, cursor: 'pointer' }}
              >
                Reset to 100%
              </button>
            )}
          </div>
        </div>

        {/* Waveform + preview meters */}
        {audioBuffer ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <WaveformCanvas
              audioBuffer={audioBuffer}
              inPoint={inPoint}
              outPoint={outPoint}
              duration={duration}
              onInPointChange={setInPoint}
              onOutPointChange={setOutPoint}
              getPlayheadTime={getPlayheadTime}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#38bdf8' }}>In</span>
                <input
                  style={{ ...fieldStyle, width: 80, fontVariantNumeric: 'tabular-nums' }}
                  value={formatTime(inPoint)}
                  onChange={(e) => setInPoint(Math.min(parseTime(e.target.value), outPoint - 0.01))}
                />
                <button
                  onClick={() => adjustIn(-1)}
                  title="Move in point back 1 second"
                  style={{ padding: '4px 7px', background: '#334155', border: 'none', borderRadius: 3, color: '#94a3b8', fontSize: 11, cursor: 'pointer' }}
                >
                  −1s
                </button>
                <button
                  onClick={() => adjustIn(1)}
                  title="Move in point forward 1 second"
                  style={{ padding: '4px 7px', background: '#334155', border: 'none', borderRadius: 3, color: '#94a3b8', fontSize: 11, cursor: 'pointer' }}
                >
                  +1s
                </button>
                <button
                  onClick={setInAtPlayhead}
                  disabled={!previewing}
                  title="Set in point at current playhead position"
                  style={{
                    padding: '4px 7px',
                    background: previewing ? '#166534' : '#1e293b',
                    border: `1px solid ${previewing ? '#22c55e' : '#334155'}`,
                    borderRadius: 3,
                    color: previewing ? '#86efac' : '#475569',
                    fontSize: 11,
                    cursor: previewing ? 'pointer' : 'default'
                  }}
                >
                  ⊙ Set
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: '#ef4444' }}>Out</span>
                <input
                  style={{ ...fieldStyle, width: 80, fontVariantNumeric: 'tabular-nums' }}
                  value={formatTime(outPoint)}
                  onChange={(e) => setOutPoint(Math.max(parseTime(e.target.value), inPoint + 0.01))}
                />
              </div>
              <span style={{ fontSize: 12, color: '#64748b', marginLeft: 'auto' }}>
                Duration: {formatTime(outPoint - inPoint)}
              </span>
              <button
                onClick={previewing ? stopPreview : preview}
                disabled={!audioBuffer}
                style={{
                  padding: '5px 14px',
                  background: previewing ? '#dc2626' : '#22c55e',
                  border: 'none',
                  borderRadius: 4,
                  color: '#fff',
                  fontSize: 13
                }}
              >
                {previewing ? '■ Stop' : '▶ Preview'}
              </button>
              <button
                onClick={() => { setInPoint(0); setOutPoint(duration) }}
                style={{ padding: '5px 10px', background: '#334155', border: 'none', borderRadius: 4, color: '#94a3b8', fontSize: 12 }}
              >
                Reset
              </button>
            </div>
          </div>
          <LevelMeters getAnalysers={getPreviewAnalysers} />
          </div>
        ) : (
          <div style={{ height: 100, background: '#0f172a', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 13 }}>
            {loading ? 'Loading audio…' : 'No audio file loaded'}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
          <button
            onClick={() => { stopPreview(); onRemove(track.id); onClose() }}
            style={{ padding: '7px 18px', background: '#7f1d1d', border: '1px solid #991b1b', borderRadius: 4, color: '#fca5a5', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Remove Button
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { stopPreview(); onClose() }}
              style={{ padding: '7px 18px', background: '#334155', border: 'none', borderRadius: 4, color: '#f1f5f9', fontSize: 13 }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!filePath}
              style={{ padding: '7px 18px', background: '#3b82f6', border: 'none', borderRadius: 4, color: '#fff', fontWeight: 600, fontSize: 13 }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
