import React from 'react'
import type { Bank } from '../types'

interface Props {
  open: boolean
  banks: Bank[]
  onClose: () => void
}

const GLOBAL_SHORTCUTS: { keys: string; description: string }[] = [
  { keys: 'Esc', description: 'Stop all audio immediately' },
  { keys: 'Space', description: 'Stop all audio with a fade out' },
  { keys: '→', description: 'Skip to the next track in the playing playlist' },
  { keys: 'Ctrl/Cmd + M', description: 'Toggle Monitor mode' },
  { keys: 'Ctrl/Cmd + F', description: 'Jump to the track search box' },
  { keys: 'Ctrl/Cmd + R', description: 'Play a random unplayed track from the current bank' },
  { keys: 'F11', description: 'Toggle fullscreen' },
  { keys: '?', description: 'Open this shortcuts reference' }
]

function KeyCap({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-block',
      minWidth: 24,
      padding: '3px 8px',
      textAlign: 'center',
      background: '#0f172a',
      border: '1px solid #334155',
      borderRadius: 4,
      color: '#f1f5f9',
      fontSize: 12,
      fontWeight: 700,
      whiteSpace: 'nowrap'
    }}>
      {children}
    </span>
  )
}

export function ShortcutsModal({ open, banks, onClose }: Props) {
  if (!open) return null

  const bankGroups = banks
    .map((b) => ({
      bank: b,
      tracks: b.tracks
        .filter((t) => t.hotkey)
        .sort((a, b2) => a.hotkey!.localeCompare(b2.hotkey!, undefined, { numeric: true }))
    }))
    .filter((g) => g.tracks.length > 0)

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
        width: 480,
        maxWidth: '90vw',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        gap: 20
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Keyboard Shortcuts</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 22, lineHeight: 1, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Global
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {GLOBAL_SHORTCUTS.map((s) => (
                <div key={s.keys} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 128, flexShrink: 0 }}><KeyCap>{s.keys}</KeyCap></div>
                  <span style={{ fontSize: 13, color: '#cbd5e1' }}>{s.description}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Buttons (fire from any bank)
            </div>
            {bankGroups.length === 0 ? (
              <div style={{ fontSize: 12, color: '#475569' }}>
                No buttons have a shortcut assigned yet. Set one from a button's editor.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {bankGroups.map(({ bank, tracks }) => (
                  <div key={bank.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>{bank.name}</span>
                    {tracks.map((t) => (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 128, flexShrink: 0 }}><KeyCap>{t.hotkey}</KeyCap></div>
                        <span style={{ fontSize: 13, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.title || t.filePath}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '7px 20px',
              background: '#3b82f6',
              border: 'none',
              borderRadius: 4,
              color: '#fff',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
