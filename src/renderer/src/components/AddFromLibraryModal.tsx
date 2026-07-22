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
  // Rows added this session — marked so the user can see what they've already
  // grabbed while the modal stays open for more searches.
  const [added, setAdded] = useState<Set<string>>(new Set())

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    // Libraries can hold hundreds of tracks — an unfiltered dump is just
    // noise, so show nothing until the user starts typing.
    if (!q) return []
    return libraries
      .map((lib) => ({
        library: lib,
        tracks: lib.tracks.filter(
          (t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
        )
      }))
      .filter((g) => g.tracks.length > 0)
  }, [libraries, query])

  if (!open) return null

  function handleClose() {
    setQuery('')
    setAdded(new Set())
    onClose()
  }

  function addTrack(key: string, track: LibraryTrack) {
    onAdd([track])
    setAdded((prev) => new Set(prev).add(key))
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
          ) : query.trim() === '' ? (
            <div style={{ fontSize: 12, color: '#475569' }}>Type to search your libraries.</div>
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
                  const isAdded = added.has(key)
                  return (
                    <div
                      key={key}
                      onClick={() => addTrack(key, t)}
                      title={`Add to ${targetLabel}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 8px',
                        borderRadius: 4,
                        background: isAdded ? '#14332a' : 'transparent',
                        cursor: 'pointer'
                      }}
                    >
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
                      {isAdded && (
                        <span style={{ fontSize: 11, color: '#4ade80', flexShrink: 0 }}>✓ Added</span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>
            Click a track to add it to {targetLabel}
          </span>
          <button
            onClick={handleClose}
            style={{
              padding: '7px 20px',
              background: '#3b82f6',
              border: 'none',
              borderRadius: 4,
              color: '#fff',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
