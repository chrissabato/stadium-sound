import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { Bank } from '../types'
import {
  measureLoudness,
  summarizeLoudness,
  suggestTarget,
  LOUDNESS_TOLERANCE_LU,
  type TrackLoudnessEntry
} from '../audio/loudnessReport'
import { normalizeTrackGain } from '../hooks/useAudioEngine'

export interface TrackGainUpdate {
  trackId: string
  volume: number
}

interface Props {
  open: boolean
  banks: Bank[]
  decode: (filePath: string) => Promise<AudioBuffer>
  targetLufs: number
  onTargetChange: (lufs: number) => void
  onNormalizeTracks: (updates: TrackGainUpdate[]) => void
  onClose: () => void
}

type Status = 'loud' | 'quiet' | 'ok' | 'silent' | 'error'

function statusFor(entry: TrackLoudnessEntry, tooLoudLufs: number, tooQuietLufs: number): Status {
  if (entry.error) return 'error'
  if (entry.lufs === null) return 'silent'
  if (entry.lufs > tooLoudLufs) return 'loud'
  if (entry.lufs < tooQuietLufs) return 'quiet'
  return 'ok'
}

const STATUS_STYLE: Record<Status, { label: string; color: string }> = {
  loud: { label: 'Too loud', color: '#ef4444' },
  quiet: { label: 'Too quiet', color: '#38bdf8' },
  ok: { label: 'OK', color: '#22c55e' },
  silent: { label: 'Silent', color: '#64748b' },
  error: { label: 'Missing/Error', color: '#64748b' }
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: '#0f172a',
      border: '1px solid #334155',
      borderRadius: 6,
      padding: '10px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      minWidth: 130
    }}>
      <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>}
    </div>
  )
}

export function LoudnessReportModal({ open, banks, decode, targetLufs, onTargetChange, onNormalizeTracks, onClose }: Props) {
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  // Raw measurements only — target-dependent classification is derived below
  // via summarizeLoudness(), so changing the target (settings, or the
  // "Use this target" button) never requires re-decoding anything.
  const [entries, setEntries] = useState<TrackLoudnessEntry[] | null>(null)
  // Which out-of-range tracks have had their Audio Level set in this session,
  // so the bulk button doesn't look like it did nothing on a second glance —
  // tooLoud/tooQuiet are computed from the file's raw loudness, which a gain
  // change never alters, so without this the count would never shrink.
  // Reset whenever the measurement or the target changes, since either
  // invalidates which tracks still need it.
  const [normalizedTrackIds, setNormalizedTrackIds] = useState<Set<string>>(new Set())
  const [applyResult, setApplyResult] = useState<string | null>(null)
  // Identifies the current run so a superseded one (Re-analyze clicked while
  // a previous run is still in flight) can't clobber newer state with stale
  // results after it eventually finishes.
  const runIdRef = useRef(0)

  function runAnalysis() {
    const runId = ++runIdRef.current
    setAnalyzing(true)
    setEntries(null)
    const total = banks.reduce((n, b) => n + b.tracks.length, 0)
    setProgress({ done: 0, total })
    measureLoudness(banks, decode, (done, t) => {
      if (runIdRef.current === runId) setProgress({ done, total: t })
    })
      .then((r) => { if (runIdRef.current === runId) setEntries(r) })
      .finally(() => { if (runIdRef.current === runId) setAnalyzing(false) })
  }

  // This component stays mounted for the app's lifetime (App.tsx renders it
  // unconditionally; `open` only toggles the early-return below), so its
  // state already survives close/reopen on its own — the only thing needed
  // is to not blow away a cached report by re-running on every open. A
  // background run also isn't aborted on close: closing mid-analysis just
  // means the next open finds it either still running (progress keeps
  // advancing) or already resolved into cached entries.
  useEffect(() => {
    if (open && !entries && !analyzing) runAnalysis()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const report = useMemo(
    () => entries ? summarizeLoudness(entries, targetLufs, LOUDNESS_TOLERANCE_LU) : null,
    [entries, targetLufs]
  )
  const suggestion = useMemo(
    () => entries ? suggestTarget(entries, LOUDNESS_TOLERANCE_LU) : null,
    [entries]
  )

  useEffect(() => {
    setNormalizedTrackIds(new Set())
    setApplyResult(null)
  }, [entries, targetLufs])

  function normalizeOutOfRange() {
    if (!report) return
    const targets = [...report.tooLoud, ...report.tooQuiet].filter((e) => !normalizedTrackIds.has(e.trackId))
    if (targets.length === 0) return
    const updates = targets.map((e) => ({
      trackId: e.trackId,
      volume: normalizeTrackGain(e.lufs as number, targetLufs)
    }))
    onNormalizeTracks(updates)
    setNormalizedTrackIds((prev) => {
      const next = new Set(prev)
      for (const u of updates) next.add(u.trackId)
      return next
    })
    setApplyResult(`Set Audio Level on ${updates.length} track${updates.length === 1 ? '' : 's'}.`)
  }

  if (!open) return null

  const totalTracks = banks.reduce((n, b) => n + b.tracks.length, 0)
  const tooLoudLufs = targetLufs + LOUDNESS_TOLERANCE_LU
  const tooQuietLufs = targetLufs - LOUDNESS_TOLERANCE_LU
  const sortedEntries = report
    ? [...report.entries].sort((a, b) => {
        if (a.lufs === null && b.lufs === null) return 0
        if (a.lufs === null) return 1
        if (b.lufs === null) return -1
        return b.lufs - a.lufs
      })
    : []
  const suggestionDiffersFromTarget = suggestion !== null && Math.abs(suggestion.targetLufs - targetLufs) >= 0.1
  const outOfRangeCount = report ? report.tooLoud.length + report.tooQuiet.length : 0
  const pendingCount = report
    ? [...report.tooLoud, ...report.tooQuiet].filter((e) => !normalizedTrackIds.has(e.trackId)).length
    : 0

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 8,
        padding: 24,
        width: 760,
        maxWidth: '95vw',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        gap: 16
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Loudness Report</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 22, lineHeight: 1, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        {totalTracks === 0 ? (
          <div style={{ fontSize: 13, color: '#64748b' }}>No tracks to analyze yet — add some buttons first.</div>
        ) : analyzing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>
              Analyzing… {progress.done}/{progress.total}
            </span>
            <div style={{ height: 6, background: '#0f172a', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
                background: '#3b82f6',
                transition: 'width 120ms linear'
              }} />
            </div>
          </div>
        ) : report && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <StatTile label="Analyzed" value={`${report.measuredCount}/${totalTracks}`} />
              <StatTile
                label="Average LUFS"
                value={report.averageLufs !== null ? `${report.averageLufs.toFixed(1)}` : '—'}
                sub={`target ${targetLufs}`}
              />
              <StatTile
                label="Loudest"
                value={report.loudest ? `${report.loudest.lufs!.toFixed(1)}` : '—'}
                sub={report.loudest ? (report.loudest.title || report.loudest.filePath) : undefined}
              />
              <StatTile
                label="Quietest"
                value={report.quietest ? `${report.quietest.lufs!.toFixed(1)}` : '—'}
                sub={report.quietest ? (report.quietest.title || report.quietest.filePath) : undefined}
              />
              <StatTile label="Too Loud" value={String(report.tooLoud.length)} sub={`> ${tooLoudLufs} LUFS`} />
              <StatTile label="Too Quiet" value={String(report.tooQuiet.length)} sub={`< ${tooQuietLufs} LUFS`} />
              <StatTile label="Skipped" value={String(report.errorCount + report.silentCount)} sub="missing, unreadable, or silent" />
            </div>

            {suggestion && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 6,
                padding: '10px 14px'
              }}>
                <span style={{ fontSize: 12, color: '#94a3b8', flex: 1 }}>
                  <strong style={{ color: '#f1f5f9' }}>Suggested target: {suggestion.targetLufs} LUFS</strong>
                  {' — '}where {suggestion.trackCount} of {report.measuredCount} tracks ({suggestion.trackPercent}%)
                  already cluster within ±{LOUDNESS_TOLERANCE_LU} LU, based on this library.
                </span>
                <button
                  onClick={() => onTargetChange(suggestion.targetLufs)}
                  disabled={!suggestionDiffersFromTarget}
                  style={{
                    flexShrink: 0,
                    padding: '6px 12px',
                    background: suggestionDiffersFromTarget ? '#1d4ed8' : 'transparent',
                    border: `1px solid ${suggestionDiffersFromTarget ? '#3b82f6' : '#334155'}`,
                    borderRadius: 4,
                    color: suggestionDiffersFromTarget ? '#fff' : '#475569',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: suggestionDiffersFromTarget ? 'pointer' : 'default'
                  }}
                >
                  {suggestionDiffersFromTarget ? 'Use as Target' : 'Already the target'}
                </button>
              </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #334155', borderRadius: 6 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, background: '#0f172a' }}>
                  <tr>
                    <th style={thStyle}>Bank</th>
                    <th style={thStyle}>Title</th>
                    <th style={thStyle}>Artist</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>LUFS</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEntries.map((e) => {
                    const status = statusFor(e, tooLoudLufs, tooQuietLufs)
                    const style = STATUS_STYLE[status]
                    return (
                      <tr key={e.trackId} style={{ borderTop: '1px solid #1e293b' }}>
                        <td style={tdStyle}>{e.bankName}</td>
                        <td style={{ ...tdStyle, color: '#f1f5f9' }}>{e.title || '(untitled)'}</td>
                        <td style={tdStyle}>{e.artist}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {e.lufs !== null ? e.lufs.toFixed(1) : '—'}
                        </td>
                        <td style={{ ...tdStyle, color: style.color, fontWeight: 600 }} title={e.error}>
                          {e.error ? `${style.label} — ${e.error}` : style.label}
                          {normalizedTrackIds.has(e.trackId) && (
                            <span style={{ color: '#22c55e', fontWeight: 400 }} title="Audio Level was adjusted to compensate">
                              {' '}✓ leveled
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {outOfRangeCount > 0 && (
              <button
                onClick={normalizeOutOfRange}
                disabled={analyzing || pendingCount === 0}
                title="Set Audio Level on every too-loud/too-quiet track so it lands at the target — same math as the per-track Normalize button"
                style={{
                  padding: '7px 16px',
                  background: pendingCount > 0 ? '#1d4ed8' : 'transparent',
                  border: `1px solid ${pendingCount > 0 ? '#3b82f6' : '#334155'}`,
                  borderRadius: 4,
                  color: pendingCount > 0 ? '#fff' : '#475569',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: pendingCount > 0 ? 'pointer' : 'default',
                  flexShrink: 0
                }}
              >
                {pendingCount > 0 ? `⚖ Normalize Out-of-Range (${pendingCount})` : '✓ Out-of-Range Tracks Leveled'}
              </button>
            )}
            {applyResult && (
              <span style={{ fontSize: 12, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {applyResult}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={runAnalysis}
              disabled={analyzing || totalTracks === 0}
              style={{
                padding: '7px 16px',
                background: 'none',
                border: '1px solid #334155',
                borderRadius: 4,
                color: analyzing ? '#475569' : '#94a3b8',
                fontSize: 13,
                cursor: analyzing ? 'default' : 'pointer'
              }}
            >
              ↻ Re-analyze
            </button>
            <button
              onClick={onClose}
              style={{ padding: '7px 20px', background: '#3b82f6', border: 'none', borderRadius: 4, color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 10px',
  fontSize: 10,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.05em'
}

const tdStyle: React.CSSProperties = {
  padding: '6px 10px',
  color: '#94a3b8',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 220
}
