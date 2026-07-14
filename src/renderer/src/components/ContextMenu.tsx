import React, { useEffect, useRef } from 'react'

export interface ContextMenuItem {
  label: string
  danger?: boolean
  onClick: () => void
}

interface Props {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  // Consumers pass inline onClose handlers whose identity changes every render;
  // routing through a ref lets the listeners below register once on mount.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    function close() { onCloseRef.current() }
    function closeOnEscape(e: KeyboardEvent) { if (e.key === 'Escape') onCloseRef.current() }
    window.addEventListener('keydown', closeOnEscape)
    // Right-clicking fires a trailing 'click' event right after 'contextmenu' on
    // this interaction — registering the outside-click listener synchronously
    // would catch that trailing click and close the menu instantly. Deferring
    // to the next tick lets that click pass before we start listening.
    const timer = setTimeout(() => {
      window.addEventListener('click', close)
      window.addEventListener('contextmenu', close)
    }, 0)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        background: '#0f172a',
        border: '1px solid #334155',
        borderRadius: 4,
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        padding: 4,
        zIndex: 200,
        minWidth: 140
      }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => { onClose(); item.onClick() }}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            borderRadius: 3,
            color: item.danger ? '#fca5a5' : '#e2e8f0',
            fontSize: 13,
            padding: '6px 10px',
            cursor: 'pointer'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = item.danger ? '#450a0a' : '#1e293b' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
