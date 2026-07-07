import React from 'react'
import logoUrl from '../assets/logo.svg'
import { TrackSearch, type TrackSearchHandle } from './TrackSearch'
import type { Bank, Track } from '../types'

interface Props {
  currentFilePath: string | null
  masterVolume: number
  isMonitorMode: boolean
  showPlaylistPanel: boolean
  isFullscreen: boolean
  banks: Bank[]
  searchRef?: React.Ref<TrackSearchHandle>
  onVolumeChange: (v: number) => void
  onStopAll: () => void
  onToggleMonitor: () => void
  onTogglePlaylistPanel: () => void
  onToggleFullscreen: () => void
  onOpenSettings: () => void
  onOpenShortcuts: () => void
  onSelectSearchResult: (bankId: string, track: Track) => void
}

export function Toolbar({ currentFilePath, masterVolume, isMonitorMode, showPlaylistPanel, isFullscreen, banks, searchRef, onVolumeChange, onStopAll, onToggleMonitor, onTogglePlaylistPanel, onToggleFullscreen, onOpenSettings, onOpenShortcuts, onSelectSearchResult }: Props) {
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

      <TrackSearch ref={searchRef} banks={banks} onSelectResult={onSelectSearchResult} />

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

      <button
        onClick={onOpenShortcuts}
        title="Keyboard shortcuts"
        style={{
          padding: '6px 10px',
          background: '#1e293b',
          color: '#94a3b8',
          border: '1px solid #334155',
          borderRadius: 4,
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 1
        }}
      >
        ⌨
      </button>

      <button
        onClick={onToggleFullscreen}
        title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        style={{
          padding: '6px 10px',
          background: isFullscreen ? '#1e3a5f' : '#1e293b',
          color: isFullscreen ? '#93c5fd' : '#94a3b8',
          border: `1px solid ${isFullscreen ? '#3b82f6' : '#334155'}`,
          borderRadius: 4,
          fontSize: 15,
          lineHeight: 1
        }}
      >
        ⛶
      </button>

      <button
        onClick={onOpenSettings}
        title="Settings"
        style={{
          padding: '6px 10px',
          background: '#1e293b',
          color: '#94a3b8',
          border: '1px solid #334155',
          borderRadius: 4,
          fontSize: 16,
          lineHeight: 1
        }}
      >
        ⚙
      </button>
    </div>
  )
}
