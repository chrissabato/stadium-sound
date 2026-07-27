import React, { useEffect, useRef, useState } from 'react'
import type { Bank } from '../types'
import {
  analyzeLoudness,
  LOUDNESS_TOLERANCE_LU,
  type LoudnessReport,
  type TrackLoudnessEntry
} from '../audio/loudnessReport'
import { NORMALIZE_TARGET_LUFS } from '../hooks/useAudioEngine'

interface Props {
  open: boolean
  banks: Bank[]
  decode: (filePath: string) => Promise<AudioBuffer>
  onClose: () => void
}

const TOO_LOUD_LUFS = NORMALIZE_TARGET_LUFS + LOUDNESS_TOLERANCE_LU
const TOO_QUIET_LUFS = NORMALIZE_TARGET_LUFS - LOUDNESS_TOLERANCE_LU

type Status = 'loud' | 'quiet' | 'ok' | 'silent' | 'error'

function statusFor(entry: TrackLoudnessEntry): Status {
  if (entry.error) return 'error'
  if (entry.lufs === null) return 'silent'
  if (entry.lufs > TOO_LOUD_LUFS) return 'loud'
  if (entry.lufs < TOO_QUIET_LUFS) return 'quiet'
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

export function LoudnessReportModal({ open, banks, decode, onClose }: Props) {
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [report, setReport] = useState<LoudnessReport | null>(null)
  // Identifies the current run so a superseded one (Re-analyze clicked while
  // a previous run is still in flight) can't clobber newer state with stale
  // results after it eventually finishes.
  const runIdRef = useRef(0)

  function runAnalysis() {
    const runId = ++runIdRef.current
    setAnalyzing(true)
    setReport(null)
    const total = banks.reduce((n, b) => n + b.tracks.length, 0)
    setProgress({ done: 0, total })
    analyzeLoudness(banks, decode, (done, t) => {
      if (runIdRef.current === runId) setProgress({ done, total: t })
    })
      .then((r) => { if (runIdRef.current === runId) setReport(r) })
      .finally(() => { if (runIdRef.current === runId) setAnalyzing(false) })
  }

  // This component stays mounted for the app's lifetime (App.tsx renders it
  // unconditionally; `open` only toggles the early-return below), so its
  // state already survives close/reopen on its own — the only thing needed
  // is to not blow away a cached report by re-running on every open. A
  // background run also isn't aborted on close: closing mid-analysis just
  // means the next open finds it either still running (progress keeps
  // advancing) or already resolved into a cached report.
  useEffect(() => {
    if (open && !report && !analyzing) runAnalysis()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const totalTracks = banks.reduce((n, b) => n + b.tracks.length, 0)
  const sortedEntries = report
    ? [...report.entries].sort((a, b) => {
        if (a.lufs === null && b.lufs === null) return 0
        if (a.lufs === null) return 1
        if (b.lufs === null) return -1
        return b.lufs - a.lufs
      })
    : []

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
                sub={`target ${NORMALIZE_TARGET_LUFS}`}
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
              <StatTile label="Too Loud" value={String(report.tooLoud.length)} sub={`> ${TOO_LOUD_LUFS} LUFS`} />
              <StatTile label="Too Quiet" value={String(report.tooQuiet.length)} sub={`< ${TOO_QUIET_LUFS} LUFS`} />
              <StatTile label="Skipped" value={String(report.errorCount + report.silentCount)} sub="missing, unreadable, or silent" />
            </div>

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
                    const status = statusFor(e)
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
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
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
