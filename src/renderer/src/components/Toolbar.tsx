import React from 'react'
import logoUrl from '../assets/logo.svg'

interface Props {
  currentFilePath: string | null
  masterVolume: number
  isMonitorMode: boolean
  onVolumeChange: (v: number) => void
  onStopAll: () => void
  onToggleMonitor: () => void
  onOpenSettings: () => void
}

export function Toolbar({ currentFilePath, masterVolume, isMonitorMode, onVolumeChange, onStopAll, onToggleMonitor, onOpenSettings }: Props) {
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
        title={isMonitorMode ? 'Monitor mode on — audio to monitor output. Click to switch to main output.' : 'Click to enable monitor mode (audio to monitor output)'}
        style={{
          padding: '6px 14px',
          background: isMonitorMode ? '#78350f' : '#1e293b',
          color: isMonitorMode ? '#fde68a' : '#64748b',
          border: `1px solid ${isMonitorMode ? '#d97706' : '#334155'}`,
          borderRadius: 4,
          fontWeight: isMonitorMode ? 700 : 400,
          fontSize: 13,
          letterSpacing: isMonitorMode ? '0.02em' : undefined
        }}
      >
        {isMonitorMode ? '● Monitor' : '○ Monitor'}
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
