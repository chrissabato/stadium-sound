import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { Bank, Track } from '../types'

interface Props {
  banks: Bank[]
  onSelectResult: (bankId: string, track: Track) => void
}

export interface TrackSearchHandle {
  focus: () => void
}

interface Match {
  track: Track
  bankId: string
  bankName: string
}

const MAX_RESULTS = 8

export const TrackSearch = forwardRef<TrackSearchHandle, Props>(function TrackSearch({ banks, onSelectResult }, ref) {
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

    const all: Match[] = banks.flatMap((b) =>
      b.tracks.map((track) => ({ track, bankId: b.id, bankName: b.name }))
    )

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
  }, [banks, query])

  function selectMatch(m: Match) {
    onSelectResult(m.bankId, m.track)
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
                  key={m.track.id}
                  onMouseDown={(e) => { e.preventDefault(); selectMatch(m) }}
                  onMouseEnter={() => setActiveIndex(i)}
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
                      {m.track.title || '(untitled)'}
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
                    color: '#64748b',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 3,
                    padding: '2px 6px',
                    flexShrink: 0,
                    maxWidth: 90,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {m.bankName}
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
