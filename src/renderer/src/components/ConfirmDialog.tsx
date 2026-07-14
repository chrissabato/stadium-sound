import React, { useEffect, useRef } from 'react'

interface Props {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: Props) {
  // Consumers pass inline handlers whose identity changes every render;
  // routing through a ref lets the listener below register once on mount.
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  useEffect(() => {
    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onCancelRef.current() }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 300
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 8,
        width: 400,
        maxWidth: '90vw',
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        <span style={{ fontWeight: 700, fontSize: 16, color: '#f1f5f9' }}>{title}</span>
        <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>{message}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          {/* Cancel gets focus so a stray Enter never confirms a deletion */}
          <button
            autoFocus
            onClick={onCancel}
            style={{
              padding: '7px 20px',
              background: 'none',
              border: '1px solid #334155',
              borderRadius: 4,
              color: '#94a3b8',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '7px 20px',
              background: '#7f1d1d',
              border: '1px solid #991b1b',
              borderRadius: 4,
              color: '#fca5a5',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
