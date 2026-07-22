import React from 'react'
import { CHANGELOG } from '../changelog'

interface Props {
  open: boolean
  currentVersion: string
  onClose: () => void
}

export function ChangelogModal({ open, currentVersion, onClose }: Props) {
  if (!open) return null

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
        width: 480,
        maxWidth: '90vw',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px 24px',
          borderBottom: '1px solid #334155',
          flexShrink: 0
        }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>What's New</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 22, lineHeight: 1, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 24, overflowY: 'auto', minHeight: 0 }}>
          {CHANGELOG.map((release) => (
            <div key={release.version} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>
                  Version {release.version}
                </span>
                {release.version === currentVersion && (
                  <span style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#93c5fd',
                    background: '#1e3a5f',
                    border: '1px solid #3b82f6',
                    borderRadius: 999,
                    padding: '1px 8px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Current
                  </span>
                )}
                <span style={{ fontSize: 11, color: '#64748b', marginLeft: 'auto' }}>{release.date}</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {release.items.map((item, i) => (
                  <li key={i} style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          padding: '16px 24px',
          borderTop: '1px solid #334155',
          flexShrink: 0
        }}>
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
