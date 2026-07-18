import React, { useState } from 'react'
import logoUrl from '../assets/logo.svg'
import { TrackSearch, type TrackSearchHandle } from './TrackSearch'
import type { Bank, LibraryTrack, MediaLibrary, Track } from '../types'

interface Props {
  currentFilePath: string | null
  masterVolume: number
  isMonitorMode: boolean
  showPlaylistPanel: boolean
  isFullscreen: boolean
  banks: Bank[]
  libraries: MediaLibrary[]
  searchRef?: React.Ref<TrackSearchHandle>
  onVolumeChange: (v: number) => void
  onStopAll: () => void
  onToggleMonitor: () => void
  onTogglePlaylistPanel: () => void
  onToggleFullscreen: () => void
  onOpenSettings: () => void
  onResetPlayed: () => void
  onVerifyTracks: () => void
  onOpenShortcuts: () => void
  onOpenFeedback: () => void
  onOpenLibraries: () => void
  onSelectSearchResult: (bankId: string, track: Track) => void
  onAddLibraryTrack: (track: LibraryTrack) => void
}

export function Toolbar({ currentFilePath, masterVolume, isMonitorMode, showPlaylistPanel, isFullscreen, banks, libraries, searchRef, onVolumeChange, onStopAll, onToggleMonitor, onTogglePlaylistPanel, onToggleFullscreen, onOpenSettings, onResetPlayed, onVerifyTracks, onOpenShortcuts, onOpenFeedback, onOpenLibraries, onSelectSearchResult, onAddLibraryTrack }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const fileName = currentFilePath
    ? currentFilePath.split(/[\\/]/).pop() ?? 'Event Set'
    : 'Untitled Event Set'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '8px 16px',
      background: '#1e293b',
      borderBottom: '1px solid #334155',
      flexShrink: 0
    }}>
      <img src={logoUrl} alt="Stadium Sound" style={{ height: 36, width: 36, flexShrink: 0 }} />
      <div>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#f1f5f9', lineHeight: 1.2 }}>
          Stadium Sound
        </div>
        <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.2 }}>
          {fileName}
        </div>
      </div>

      <TrackSearch ref={searchRef} banks={banks} libraries={libraries} onSelectResult={onSelectSearchResult} onAddLibraryTrack={onAddLibraryTrack} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>Volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={masterVolume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          style={{ width: 100, accentColor: '#f97316' }}
        />
        <span style={{ color: '#94a3b8', fontSize: 12, minWidth: 32 }}>
          {Math.round(masterVolume * 100)}%
        </span>
      </div>

      <button
        onClick={onToggleMonitor}
        title={isMonitorMode ? 'Monitor bus armed — clicking a track sends it to the monitor output. Click to disarm.' : 'Click to arm the monitor bus (send the next clicked track to monitor output)'}
        style={{
          padding: '6px 10px',
          background: isMonitorMode ? '#052e12' : '#1e293b',
          color: isMonitorMode ? '#39ff14' : '#64748b',
          border: `1px solid ${isMonitorMode ? '#39ff14' : '#334155'}`,
          borderRadius: 4,
          fontSize: 16,
          lineHeight: 1,
          boxShadow: isMonitorMode ? '0 0 8px rgba(57,255,20,0.7)' : 'none'
        }}
      >
        🎧
      </button>

      <button
        onClick={onTogglePlaylistPanel}
        title="Toggle playlist panel"
        style={{
          padding: '6px 14px',
          background: showPlaylistPanel ? '#1e3a5f' : '#1e293b',
          border: `1px solid ${showPlaylistPanel ? '#3b82f6' : '#334155'}`,
          borderRadius: 4,
          color: showPlaylistPanel ? '#93c5fd' : '#94a3b8',
          fontWeight: showPlaylistPanel ? 600 : 400,
          fontSize: 13
        }}
      >
        ☰ Playlist
      </button>

      <button
        onClick={onStopAll}
        style={{
          padding: '6px 16px',
          background: '#dc2626',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          fontWeight: 600,
          fontSize: 13
        }}
      >
        ■ Stop All
      </button>

      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          title="More"
          style={{
            padding: '6px 10px',
            background: menuOpen ? '#1e3a5f' : '#1e293b',
            color: menuOpen ? '#93c5fd' : '#94a3b8',
            border: `1px solid ${menuOpen ? '#3b82f6' : '#334155'}`,
            borderRadius: 4,
            fontSize: 16,
            lineHeight: 1
          }}
        >
          ⋯
        </button>
        {menuOpen && (
          <>
            <div
              onClick={() => setMenuOpen(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 10 }}
            />
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              zIndex: 11,
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 4,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              display: 'flex',
              flexDirection: 'column',
              minWidth: 180,
              overflow: 'hidden'
            }}>
              <button
                onClick={() => { onOpenLibraries(); setMenuOpen(false) }}
                style={{
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  textAlign: 'left',
                  color: '#e2e8f0',
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                🗀 Media Libraries
              </button>
              <button
                onClick={() => { onToggleFullscreen(); setMenuOpen(false) }}
                style={{
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  borderTop: '1px solid #334155',
                  textAlign: 'left',
                  color: '#e2e8f0',
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                ⛶ {isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              </button>
              <button
                onClick={() => { onResetPlayed(); setMenuOpen(false) }}
                style={{
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  borderTop: '1px solid #334155',
                  textAlign: 'left',
                  color: '#e2e8f0',
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                ↺ Reset Played Indicators
              </button>
              <button
                onClick={() => { onVerifyTracks(); setMenuOpen(false) }}
                style={{
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  borderTop: '1px solid #334155',
                  textAlign: 'left',
                  color: '#e2e8f0',
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                ✓ Verify Tracks
              </button>
              <button
                onClick={() => { onOpenShortcuts(); setMenuOpen(false) }}
                style={{
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  borderTop: '1px solid #334155',
                  textAlign: 'left',
                  color: '#e2e8f0',
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                ⌨ Keyboard Shortcuts
              </button>
              <button
                onClick={() => { onOpenFeedback(); setMenuOpen(false) }}
                style={{
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  borderTop: '1px solid #334155',
                  textAlign: 'left',
                  color: '#e2e8f0',
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                💬 Send Feedback
              </button>
              <button
                onClick={() => { onOpenSettings(); setMenuOpen(false) }}
                style={{
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  borderTop: '1px solid #334155',
                  textAlign: 'left',
                  color: '#e2e8f0',
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                ⚙ Settings
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
