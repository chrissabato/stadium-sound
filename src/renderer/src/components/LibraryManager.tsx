import React, { useState } from 'react'
import type { MediaLibrary } from '../types'
import type { ScanProgress } from '../hooks/useLibraries'

interface Props {
  open: boolean
  libraries: MediaLibrary[]
  scanProgress: Record<string, ScanProgress>
  onAddFolder: () => void
  onRescan: (id: string) => void
  onRename: (id: string, name: string) => void
  onRemove: (id: string) => void
  onClose: () => void
}

function formatScannedAt(ts: number | null): string {
  if (!ts) return 'never scanned'
  return `scanned ${new Date(ts).toLocaleString()}`
}

export function LibraryManager({ open, libraries, scanProgress, onAddFolder, onRescan, onRename, onRemove, onClose }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  if (!open) return null

  function startEdit(lib: MediaLibrary) {
    setEditingId(lib.id)
    setEditName(lib.name)
  }

  function commitEdit() {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim())
    }
    setEditingId(null)
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
        gap: 16
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Media Libraries</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 22, lineHeight: 1, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
          {libraries.length === 0 ? (
            <div style={{ fontSize: 12, color: '#475569' }}>
              No libraries yet. Add a folder of media below to index it.
            </div>
          ) : (
            libraries.map((lib) => {
              const progress = scanProgress[lib.id]
              const pct = progress && progress.total > 0 ? (progress.scanned / progress.total) * 100 : 0
              return (
              <div
                key={lib.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 4
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingId === lib.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null) }}
                      style={{
                        width: '100%',
                        background: '#1e293b',
                        border: '1px solid #3b82f6',
                        borderRadius: 3,
                        color: '#f1f5f9',
                        padding: '2px 4px',
                        fontSize: 13,
                        boxSizing: 'border-box'
                      }}
                    />
                  ) : (
                    <div
                      onClick={() => startEdit(lib)}
                      title="Click to rename"
                      style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {lib.name}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lib.folderPath}
                  </div>
                  {progress ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 3 }}>
                      <div style={{ fontSize: 11, color: '#93c5fd' }}>
                        Scanning… {progress.scanned}/{progress.total}
                      </div>
                      <div style={{ width: '100%', height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: '#3b82f6', transition: 'width 0.15s' }} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: '#475569' }}>
                      {lib.tracks.length} tracks · {formatScannedAt(lib.lastScannedAt)}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => onRescan(lib.id)}
                  disabled={!!progress}
                  title="Rescan folder"
                  style={{
                    padding: '5px 10px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: 4,
                    color: progress ? '#475569' : '#94a3b8',
                    fontSize: 12,
                    cursor: progress ? 'default' : 'pointer',
                    flexShrink: 0
                  }}
                >
                  ⟳ Rescan
                </button>
                <button
                  onClick={() => onRemove(lib.id)}
                  title="Remove library"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    fontSize: 16,
                    lineHeight: 1,
                    padding: '0 4px',
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                >
                  ×
                </button>
              </div>
              )
            })
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button
            onClick={onAddFolder}
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
            + Add Folder
          </button>
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
