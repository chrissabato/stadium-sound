import React, { useState, useRef } from 'react'
import type { Bank } from '../types'

interface Props {
  banks: Bank[]
  selectedBankId: string
  isReordering: boolean
  missingFileIds: Set<string>
  onSelectBank: (id: string) => void
  onAddBank: (name: string) => void
  onRenameBank: (id: string, name: string) => void
  onDeleteBank: (id: string) => void
  onReorderBanks: (newBanks: Bank[]) => void
}

export function Sidebar({ banks, selectedBankId, isReordering, missingFileIds, onSelectBank, onAddBank, onRenameBank, onDeleteBank, onReorderBanks }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [newBankName, setNewBankName] = useState('')
  const [addingBank, setAddingBank] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const dragCounter = useRef(0)

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
      const next = [...banks]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(i, 0, moved)
      onReorderBanks(next)
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

  function startEdit(bank: Bank) {
    setEditingId(bank.id)
    setEditName(bank.name)
  }

  function commitEdit() {
    if (editingId && editName.trim()) {
      onRenameBank(editingId, editName.trim())
    }
    setEditingId(null)
  }

  function commitAdd() {
    if (newBankName.trim()) {
      onAddBank(newBankName.trim())
    }
    setNewBankName('')
    setAddingBank(false)
  }

  return (
    <div style={{
      width: 200,
      background: '#0f172a',
      borderRight: '1px solid #1e293b',
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
          Banks
        </span>
        <button
          onClick={() => setAddingBank(true)}
          title="Add bank"
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

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {banks.map((bank, i) => (
          <div
            key={bank.id}
            draggable={isReordering}
            onDragStart={() => handleDragStart(i)}
            onDragEnter={() => handleDragEnter(i)}
            onDragLeave={handleDragLeave}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(i)}
            onDragEnd={handleDragEnd}
            onClick={() => onSelectBank(bank.id)}
            onMouseEnter={() => setHoveredId(bank.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '10px 12px',
              margin: isReordering ? '2px 6px' : 0,
              cursor: isReordering ? 'grab' : 'pointer',
              background: dragIndex === i ? 'rgba(255,255,255,0.04)' : bank.id === selectedBankId ? '#ea580c' : isReordering ? '#1e3a5f' : 'transparent',
              color: bank.id === selectedBankId && dragIndex !== i ? '#fff' : '#cbd5e1',
              border: `1px solid ${isReordering ? '#3b82f6' : 'transparent'}`,
              borderRadius: isReordering ? 4 : 0,
              borderBottom: `1px solid ${dropIndex === i && dragIndex !== i ? '#3b82f6' : isReordering ? '#3b82f6' : '#1e293b'}`,
              gap: 6,
              opacity: dragIndex === i ? 0.35 : 1,
              transition: 'opacity 0.1s'
            }}
          >
            {editingId === bank.id ? (
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
                <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {bank.name}
                </span>
                {isReordering ? (
                  <span style={{ fontSize: 13, color: '#93c5fd', userSelect: 'none', flexShrink: 0 }}>⠿</span>
                ) : hoveredId === bank.id ? (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); startEdit(bank) }}
                      title="Rename"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: bank.id === selectedBankId ? 'rgba(255,255,255,0.7)' : '#64748b',
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
                      onClick={(e) => { e.stopPropagation(); onDeleteBank(bank.id) }}
                      title="Delete"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: bank.id === selectedBankId ? 'rgba(255,255,255,0.7)' : '#64748b',
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
                ) : (() => {
                  const missingCount = bank.tracks.filter((t) => missingFileIds.has(t.id)).length
                  return missingCount > 0 ? (
                    <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700, minWidth: 16, textAlign: 'right', flexShrink: 0 }}>
                      ⚠ {missingCount}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: '#475569', minWidth: 16, textAlign: 'right' }}>
                      {bank.tracks.length}
                    </span>
                  )
                })()}
              </>
            )}
          </div>
        ))}
      </div>

      {addingBank && (
        <div style={{ padding: 8, borderTop: '1px solid #1e293b' }}>
          <input
            autoFocus
            placeholder="Bank name"
            value={newBankName}
            onChange={(e) => setNewBankName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') setAddingBank(false) }}
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
    </div>
  )
}
