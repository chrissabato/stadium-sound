import React, { useMemo } from 'react'
import type { Bank, Playlist } from '../types'

interface Props {
  open: boolean
  banks: Bank[]
  playlists: Playlist[]
  onResetAll: () => void
  onClose: () => void
}

interface PlayCountEntry {
  trackId: string
  source: string
  title: string
  artist: string
  count: number
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

// RFC 4180-ish: wrap in quotes and double up any embedded quotes whenever a
// field might contain a comma, quote, or newline (track titles/artists can).
function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function PlayCountReportModal({ open, banks, playlists, onResetAll, onClose }: Props) {
  // A track added to a playlist from a bank button shares that bank track's
  // id, so its count is already covered by the bank entry below — only
  // playlist tracks with no bank counterpart (added straight from a library
  // search) get their own row, keyed off the same id so nothing double-counts.
  const entries = useMemo<PlayCountEntry[]>(() => {
    const seenIds = new Set<string>()
    const bankEntries: PlayCountEntry[] = banks.flatMap((bank) => bank.tracks.map((t) => {
      seenIds.add(t.id)
      return {
        trackId: t.id,
        source: bank.name,
        title: t.title || '(untitled)',
        artist: t.artist,
        count: t.playCount ?? 0
      }
    }))
    const playlistOnlyEntries: PlayCountEntry[] = []
    for (const playlist of playlists) {
      for (const t of playlist.tracks) {
        if (seenIds.has(t.id)) continue
        seenIds.add(t.id)
        playlistOnlyEntries.push({
          trackId: t.id,
          source: `Playlist: ${playlist.name}`,
          title: t.title || '(untitled)',
          artist: t.artist,
          count: t.playCount ?? 0
        })
      }
    }
    return [...bankEntries, ...playlistOnlyEntries].sort((a, b) => b.count - a.count)
  }, [banks, playlists])

  if (!open) return null

  // The report (table and CSV alike) is a log of what actually got played —
  // the long tail of never-played buttons would just be noise on an E+
  // audio-log submission. Entries stay sorted by count desc from the memo.
  const playedEntries = entries.filter((e) => e.count > 0)
  const totalPlays = entries.reduce((sum, e) => sum + e.count, 0)
  const mostPlayed = playedEntries[0] ?? null

  function exportCsv() {
    const header = ['Bank / Playlist', 'Title', 'Artist', 'Play Count'].join(',')
    const rows = playedEntries.map((e) => [e.source, e.title, e.artist, String(e.count)].map(csvField).join(','))
    const csv = [header, ...rows].join('\n')
    window.electronAPI.report.exportCsv(csv, 'Play Count Report.csv')
  }

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
          <span style={{ fontWeight: 700, fontSize: 16 }}>Play Count Report</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 22, lineHeight: 1, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        {entries.length === 0 ? (
          <div style={{ fontSize: 13, color: '#64748b' }}>No tracks to report on yet — add some buttons first.</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <StatTile label="Total Plays" value={String(totalPlays)} />
              <StatTile label="Tracks Played" value={`${playedEntries.length}/${entries.length}`} />
              <StatTile
                label="Most Played"
                value={mostPlayed ? String(mostPlayed.count) : '—'}
                sub={mostPlayed ? (mostPlayed.title || mostPlayed.artist) : undefined}
              />
            </div>

            {playedEntries.length === 0 ? (
              <div style={{ fontSize: 13, color: '#64748b' }}>No tracks played yet this event set.</div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #334155', borderRadius: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#0f172a' }}>
                    <tr>
                      <th style={thStyle}>Bank / Playlist</th>
                      <th style={thStyle}>Title</th>
                      <th style={thStyle}>Artist</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Play Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playedEntries.map((e) => (
                      <tr key={e.trackId} style={{ borderTop: '1px solid #1e293b' }}>
                        <td style={tdStyle}>{e.source}</td>
                        <td style={{ ...tdStyle, color: '#f1f5f9' }}>{e.title}</td>
                        <td style={tdStyle}>{e.artist}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {e.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <button
            onClick={exportCsv}
            disabled={playedEntries.length === 0}
            style={{
              padding: '7px 16px',
              background: 'none',
              border: '1px solid #334155',
              borderRadius: 4,
              color: playedEntries.length === 0 ? '#475569' : '#94a3b8',
              fontSize: 13,
              cursor: playedEntries.length === 0 ? 'default' : 'pointer'
            }}
          >
            ⤓ Export CSV
          </button>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={onResetAll}
              disabled={totalPlays === 0}
              title="Clears every track's play count — use this to start a fresh count for the next event"
              style={{
                padding: '7px 16px',
                background: totalPlays > 0 ? '#7f1d1d' : 'transparent',
                border: `1px solid ${totalPlays > 0 ? '#991b1b' : '#334155'}`,
                borderRadius: 4,
                color: totalPlays > 0 ? '#fecaca' : '#475569',
                fontWeight: 600,
                fontSize: 13,
                cursor: totalPlays > 0 ? 'pointer' : 'default'
              }}
            >
              ↺ Reset All Play Counts{totalPlays > 0 ? ` (${totalPlays})` : ''}
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
