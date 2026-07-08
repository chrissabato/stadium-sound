import React, { useMemo, useState } from 'react'
import type { LibraryTrack, MediaLibrary } from '../types'

interface Props {
  open: boolean
  libraries: MediaLibrary[]
  targetLabel: string
  onAdd: (tracks: LibraryTrack[]) => void
  onClose: () => void
}

function trackKey(libraryId: string, track: LibraryTrack): string {
  return `${libraryId}::${track.filePath}`
}

export function AddFromLibraryModal({ open, libraries, targetLabel, onAdd, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return libraries
      .map((lib) => ({
        library: lib,
        tracks: !q
          ? lib.tracks
          : lib.tracks.filter(
              (t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
            )
      }))
      .filter((g) => g.tracks.length > 0)
  }, [libraries, query])

  if (!open) return null

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleClose() {
    setQuery('')
    setSelected(new Set())
    onClose()
  }

  function handleAdd() {
    const tracks: LibraryTrack[] = []
    for (const lib of libraries) {
      for (const t of lib.tracks) {
        if (selected.has(trackKey(lib.id, t))) tracks.push(t)
      }
    }
    if (tracks.length > 0) onAdd(tracks)
    handleClose()
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
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
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
        gap: 16
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Add from Library</span>
          <button
            onClick={handleClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 22, lineHeight: 1, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        <input
          autoFocus
          placeholder="Search libraries..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: '100%',
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: 4,
            color: '#f1f5f9',
            padding: '7px 10px',
            fontSize: 13,
            boxSizing: 'border-box'
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', minHeight: 100 }}>
          {libraries.length === 0 ? (
            <div style={{ fontSize: 12, color: '#475569' }}>No libraries added yet.</div>
          ) : groups.length === 0 ? (
            <div style={{ fontSize: 12, color: '#475569' }}>No matching tracks.</div>
          ) : (
            groups.map(({ library, tracks }) => (
              <div key={library.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {library.name}
                </div>
                {tracks.map((t) => {
                  const key = trackKey(library.id, t)
                  const isSelected = selected.has(key)
                  return (
                    <label
                      key={key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 8px',
                        borderRadius: 4,
                        background: isSelected ? '#1e3a5f' : 'transparent',
                        cursor: 'pointer'
                      }}
                    >
                      <input type="checkbox" checked={isSelected} onChange={() => toggle(key)} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.title}
                        </div>
                        {t.artist && (
                          <div style={{ fontSize: 10, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.artist}
                          </div>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={handleClose}
            style={{
              padding: '7px 16px',
              background: '#1e293b',
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
            onClick={handleAdd}
            disabled={selected.size === 0}
            style={{
              padding: '7px 20px',
              background: selected.size === 0 ? '#1e293b' : '#3b82f6',
              border: 'none',
              borderRadius: 4,
              color: selected.size === 0 ? '#475569' : '#fff',
              fontWeight: 600,
              fontSize: 13,
              cursor: selected.size === 0 ? 'default' : 'pointer'
            }}
          >
            Add {selected.size > 0 ? selected.size : ''} to {targetLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
