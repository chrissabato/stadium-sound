import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { Bank, LibraryTrack, MediaLibrary, Track } from '../types'

interface Props {
  banks: Bank[]
  libraries: MediaLibrary[]
  onSelectResult: (bankId: string, track: Track) => void
  onAddLibraryTrack: (track: LibraryTrack) => void
}

export interface TrackSearchHandle {
  focus: () => void
}

type Match =
  | { kind: 'bank'; key: string; track: Track; bankId: string; bankName: string }
  | { kind: 'library'; key: string; track: LibraryTrack; libraryName: string }

const MAX_RESULTS = 8

export const TrackSearch = forwardRef<TrackSearchHandle, Props>(function TrackSearch({ banks, libraries, onSelectResult, onAddLibraryTrack }, ref) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus()
  }))

  const matches = useMemo<Match[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []

    const bankMatches: Match[] = banks.flatMap((b) =>
      b.tracks.map((track): Match => ({ kind: 'bank', key: `bank:${track.id}`, track, bankId: b.id, bankName: b.name }))
    )
    const libraryMatches: Match[] = libraries.flatMap((lib) =>
      lib.tracks.map((track): Match => ({ kind: 'library', key: `library:${lib.id}:${track.filePath}`, track, libraryName: lib.name }))
    )

    const all = [...bankMatches, ...libraryMatches]

    const scored = all
      .map((m) => {
        const artist = m.track.artist.toLowerCase()
        const title = m.track.title.toLowerCase()
        if (!artist.includes(q) && !title.includes(q)) return null
        const startsWith = title.startsWith(q) || artist.startsWith(q)
        return { match: m, rank: startsWith ? 0 : 1 }
      })
      .filter((x): x is { match: Match; rank: number } => x !== null)

    scored.sort((a, b) => a.rank - b.rank)
    return scored.slice(0, MAX_RESULTS).map((x) => x.match)
  }, [banks, libraries, query])

  function selectMatch(m: Match) {
    if (m.kind === 'bank') {
      onSelectResult(m.bankId, m.track)
    } else {
      onAddLibraryTrack(m.track)
    }
    setQuery('')
    setIsOpen(false)
    inputRef.current?.blur()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      setQuery('')
      setIsOpen(false)
      inputRef.current?.blur()
      return
    }
    if (!isOpen || matches.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % matches.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + matches.length) % matches.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      selectMatch(matches[activeIndex])
    }
  }

  const showDropdown = isOpen && query.trim().length > 0

  return (
    <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder="Search artist or title..."
        onChange={(e) => {
          setQuery(e.target.value)
          setActiveIndex(0)
          setIsOpen(true)
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={onKeyDown}
        style={{
          width: '100%',
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: 4,
          color: '#f1f5f9',
          padding: '6px 10px',
          fontSize: 13
        }}
      />

      {showDropdown && (
        <>
          <div
            onClick={() => setIsOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 10 }}
          />
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            width: 300,
            marginTop: 4,
            zIndex: 11,
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            overflow: 'hidden'
          }}>
            {matches.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 12, color: '#64748b' }}>
                No matches
              </div>
            ) : (
              matches.map((m, i) => (
                <div
                  key={m.key}
                  onMouseDown={(e) => { e.preventDefault(); selectMatch(m) }}
                  onMouseEnter={() => setActiveIndex(i)}
                  title={m.kind === 'library' ? 'Add to current bank' : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '7px 12px',
                    background: i === activeIndex ? '#1e3a5f' : 'transparent',
                    borderTop: i > 0 ? '1px solid #334155' : 'none',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ minWidth: 0, overflow: 'hidden' }}>
                    <div style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: i === activeIndex ? '#93c5fd' : '#e2e8f0',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {m.kind === 'library' ? '+ ' : ''}{m.track.title || '(untitled)'}
                    </div>
                    {m.track.artist && (
                      <div style={{
                        fontSize: 11,
                        color: '#94a3b8',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {m.track.artist}
                      </div>
                    )}
                  </div>
                  <div style={{
                    fontSize: 10,
                    color: m.kind === 'library' ? '#fdba74' : '#64748b',
                    background: '#0f172a',
                    border: `1px solid ${m.kind === 'library' ? '#c2410c' : '#334155'}`,
                    borderRadius: 3,
                    padding: '2px 6px',
                    flexShrink: 0,
                    maxWidth: 90,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {m.kind === 'library' ? m.libraryName : m.bankName}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
})
