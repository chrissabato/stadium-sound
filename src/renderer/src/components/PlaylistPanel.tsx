import React, { useState, useRef } from 'react'
import type { Playlist, PlaylistTrack } from '../types'
import { PlaylistTrackList } from './PlaylistTrackList'

interface Props {
  playlists: Playlist[]
  selectedPlaylistId: string
  isAddToPlaylistMode: boolean
  playingPlaylistId: string | null
  playlistIndex: number
  selectedTrackIndex: number
  isTrackPlaying: boolean
  onSelectPlaylist: (id: string) => void
  onAddPlaylist: (name: string) => void
  onRenamePlaylist: (id: string, name: string) => void
  onDeletePlaylist: (id: string) => void
  onReorderPlaylists: (newPlaylists: Playlist[]) => void
  onToggleAddMode: () => void
  onAddTracksFromFile: () => void
  onRemoveTrack: (itemId: string) => void
  onReorderTracks: (newTracks: PlaylistTrack[]) => void
  onSelectRow: (index: number) => void
  onPlaylistPlay: () => void
  onPlaylistPause: () => void
  onPlaylistSkip: () => void
  onPlaylistShuffle: () => void
}

export function PlaylistPanel({
  playlists,
  selectedPlaylistId,
  isAddToPlaylistMode,
  playingPlaylistId,
  playlistIndex,
  selectedTrackIndex,
  isTrackPlaying,
  onSelectPlaylist,
  onAddPlaylist,
  onRenamePlaylist,
  onDeletePlaylist,
  onReorderPlaylists,
  onToggleAddMode,
  onAddTracksFromFile,
  onRemoveTrack,
  onReorderTracks,
  onSelectRow,
  onPlaylistPlay,
  onPlaylistPause,
  onPlaylistSkip,
  onPlaylistShuffle
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [addingPlaylist, setAddingPlaylist] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const dragCounter = useRef(0)

  const selectedPlaylist = playlists.find((p) => p.id === selectedPlaylistId) ?? null

  function handleDragStart(i: number) {
    setDragIndex(i)
    dragCounter.current = 0
  }

  function handleDragEnter(i: number) {
    dragCounter.current++
    setDropIndex(i)
  }

  function handleDragLeave() {
    dragCounter.current--
    if (dragCounter.current === 0) setDropIndex(null)
  }

  function handleDrop(i: number) {
    if (dragIndex !== null && dragIndex !== i) {
      const next = [...playlists]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(i, 0, moved)
      onReorderPlaylists(next)
    }
    setDragIndex(null)
    setDropIndex(null)
    dragCounter.current = 0
  }

  function handleDragEnd() {
    setDragIndex(null)
    setDropIndex(null)
    dragCounter.current = 0
  }

  function startEdit(playlist: Playlist) {
    setEditingId(playlist.id)
    setEditName(playlist.name)
  }

  function commitEdit() {
    if (editingId && editName.trim()) {
      onRenamePlaylist(editingId, editName.trim())
    }
    setEditingId(null)
  }

  function commitAdd() {
    if (newPlaylistName.trim()) {
      onAddPlaylist(newPlaylistName.trim())
    }
    setNewPlaylistName('')
    setAddingPlaylist(false)
  }

  return (
    <div style={{
      width: 260,
      background: '#0f172a',
      borderLeft: '1px solid #1e293b',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid #1e293b'
      }}>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          Playlists
        </span>
        <button
          onClick={() => setAddingPlaylist(true)}
          title="Add playlist"
          style={{
            width: 18,
            height: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 4,
            color: '#94a3b8',
            fontSize: 12,
            lineHeight: 1,
            padding: 0,
            cursor: 'pointer'
          }}
        >
          +
        </button>
      </div>

      <div style={{ maxHeight: 160, overflowY: 'auto', flexShrink: 0, borderBottom: '1px solid #1e293b' }}>
        {playlists.map((playlist, i) => (
          <div
            key={playlist.id}
            draggable
            onDragStart={() => handleDragStart(i)}
            onDragEnter={() => handleDragEnter(i)}
            onDragLeave={handleDragLeave}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(i)}
            onDragEnd={handleDragEnd}
            onClick={() => onSelectPlaylist(playlist.id)}
            onMouseEnter={() => setHoveredId(playlist.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '10px 12px',
              cursor: 'grab',
              background: dragIndex === i ? 'rgba(255,255,255,0.04)' : playlist.id === selectedPlaylistId ? '#ea580c' : 'transparent',
              color: playlist.id === selectedPlaylistId && dragIndex !== i ? '#fff' : '#cbd5e1',
              borderBottom: `1px solid ${dropIndex === i && dragIndex !== i ? '#3b82f6' : '#1e293b'}`,
              gap: 6,
              opacity: dragIndex === i ? 0.35 : 1,
              transition: 'opacity 0.1s'
            }}
          >
            {editingId === playlist.id ? (
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null) }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  flex: 1,
                  background: '#0f172a',
                  border: '1px solid #3b82f6',
                  borderRadius: 3,
                  color: '#f1f5f9',
                  padding: '2px 4px',
                  fontSize: 13
                }}
              />
            ) : (
              <>
                {playingPlaylistId === playlist.id && (
                  <span style={{ fontSize: 11, color: '#86efac', flexShrink: 0 }}>▶</span>
                )}
                <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {playlist.name}
                </span>
                {hoveredId === playlist.id ? (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); startEdit(playlist) }}
                      title="Rename"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: playlist.id === selectedPlaylistId ? 'rgba(255,255,255,0.7)' : '#64748b',
                        fontSize: 12,
                        lineHeight: 1,
                        padding: '0 2px',
                        flexShrink: 0,
                        cursor: 'pointer'
                      }}
                    >
                      ✎
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeletePlaylist(playlist.id) }}
                      title="Delete"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: playlist.id === selectedPlaylistId ? 'rgba(255,255,255,0.7)' : '#64748b',
                        fontSize: 14,
                        lineHeight: 1,
                        padding: '0 2px',
                        flexShrink: 0,
                        cursor: 'pointer'
                      }}
                    >
                      ×
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: 11, color: '#475569', minWidth: 16, textAlign: 'right' }}>
                    {playlist.tracks.length}
                  </span>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {addingPlaylist && (
        <div style={{ padding: 8, borderBottom: '1px solid #1e293b' }}>
          <input
            autoFocus
            placeholder="Playlist name"
            value={newPlaylistName}
            onChange={(e) => setNewPlaylistName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') setAddingPlaylist(false) }}
            onBlur={commitAdd}
            style={{
              width: '100%',
              background: '#1e293b',
              border: '1px solid #3b82f6',
              borderRadius: 3,
              color: '#f1f5f9',
              padding: '5px 8px',
              fontSize: 12,
              boxSizing: 'border-box'
            }}
          />
        </div>
      )}

      {selectedPlaylist ? (
        <PlaylistTrackList
          playlist={selectedPlaylist}
          isAddToPlaylistMode={isAddToPlaylistMode}
          hasAnyPlaylist={playlists.length > 0}
          isPlayingThis={playingPlaylistId === selectedPlaylist.id}
          playlistIndex={playlistIndex}
          selectedTrackIndex={selectedTrackIndex}
          isTrackPlaying={isTrackPlaying}
          onToggleAddMode={onToggleAddMode}
          onAddTracksFromFile={onAddTracksFromFile}
          onRemoveTrack={onRemoveTrack}
          onReorderTracks={onReorderTracks}
          onSelectRow={onSelectRow}
          onPlay={onPlaylistPlay}
          onPause={onPlaylistPause}
          onSkip={onPlaylistSkip}
          onShuffle={onPlaylistShuffle}
        />
      ) : (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          color: '#475569',
          padding: 16,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 13 }}>No playlist selected</div>
          <div style={{ fontSize: 11, color: '#334155' }}>Create one above to get started</div>
        </div>
      )}
    </div>
  )
}
