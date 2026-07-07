import React, { useState, useEffect } from 'react'

interface FadeConfig {
  fadeIn: number
  fadeOut: number
  crossFade: number
  outputDeviceId: string
  monitorDeviceId: string
}

interface Props {
  open: boolean
  config: FadeConfig
  onChange: (c: FadeConfig) => void
  showTrackTooltips: boolean
  onShowTrackTooltipsChange: (enabled: boolean) => void
  showPlayedIndicator: boolean
  onShowPlayedIndicatorChange: (enabled: boolean) => void
  onClose: () => void
}

function FadeRow({
  label,
  description,
  value,
  onChange
}: {
  label: string
  description: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{label}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{description}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="number"
            min={0}
            max={30}
            step={0.1}
            value={value}
            onChange={(e) => onChange(Math.max(0, parseFloat(e.target.value) || 0))}
            style={{
              width: 64,
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 4,
              color: '#f1f5f9',
              padding: '5px 8px',
              fontSize: 13,
              textAlign: 'right'
            }}
          />
          <span style={{ fontSize: 12, color: '#64748b', minWidth: 16 }}>s</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, color: '#475569', minWidth: 20 }}>0s</span>
        <input
          type="range"
          min={0}
          max={10}
          step={0.1}
          value={Math.min(value, 10)}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{ flex: 1, accentColor: '#3b82f6' }}
        />
        <span style={{ fontSize: 11, color: '#475569', minWidth: 24 }}>10s</span>
      </div>
    </div>
  )
}

export function Settings({ open, config, onChange, showTrackTooltips, onShowTrackTooltipsChange, showPlayedIndicator, onShowPlayedIndicatorChange, onClose }: Props) {
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [version, setVersion] = useState('')
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'not-available' | 'error'>('idle')

  useEffect(() => {
    if (!open) return
    navigator.mediaDevices.enumerateDevices()
      // Chromium's synthetic 'default'/'communications' entries alias a real device but
      // AudioContext.setSinkId() rejects those ids outright ("device not found") — our own
      // "System Default" option (value "") is the one that actually works, so hide these.
      .then((devices) => setAudioDevices(devices.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications')))
      .catch(() => {})
    window.electronAPI.app.getVersion().then(setVersion).catch(() => {})
    const unsub = window.electronAPI.app.onUpdateStatus((status) => setUpdateStatus(status))
    return unsub
  }, [open])

  if (!open) return null

  function update(key: keyof FadeConfig, value: number | string) {
    onChange({ ...config, [key]: value })
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
        width: 480,
        maxWidth: '90vw',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px 24px',
          borderBottom: '1px solid #334155',
          flexShrink: 0
        }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Settings</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 22, lineHeight: 1, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          padding: 24,
          overflowY: 'auto',
          minHeight: 0
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: -8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Playback Fades
            </span>
            <div style={{ height: 1, background: '#334155' }} />
          </div>

          <FadeRow
            label="Fade In"
            description="Ramp up volume when a track starts playing"
            value={config.fadeIn}
            onChange={(v) => update('fadeIn', v)}
          />

          <FadeRow
            label="Fade Out"
            description="Ramp down volume when a track is stopped manually"
            value={config.fadeOut}
            onChange={(v) => update('fadeOut', v)}
          />

          <FadeRow
            label="Cross Fade"
            description="Overlap old and new tracks when switching — old fades out while new fades in"
            value={config.crossFade}
            onChange={(v) => update('crossFade', v)}
          />

          {config.crossFade > 0 && (config.fadeIn > 0 || config.fadeOut > 0) && (
            <div style={{
              background: '#0f172a',
              border: '1px solid #475569',
              borderRadius: 4,
              padding: '8px 12px',
              fontSize: 12,
              color: '#94a3b8'
            }}>
              When Cross Fade is active it takes priority over Fade In / Fade Out when switching tracks.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: -8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Audio Devices
            </span>
            <div style={{ height: 1, background: '#334155' }} />
          </div>

          {(['outputDeviceId', 'monitorDeviceId'] as const).map((key) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>
                  {key === 'outputDeviceId' ? 'Output' : 'Monitor'}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {key === 'outputDeviceId'
                    ? 'Main venue audio output'
                    : 'Private preview output (headphones / cue mix)'}
                </div>
              </div>
              <select
                value={config[key]}
                onChange={(e) => update(key, e.target.value)}
                style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 4,
                  color: '#f1f5f9',
                  padding: '6px 10px',
                  fontSize: 13,
                  minWidth: 200,
                  maxWidth: 240,
                  flexShrink: 0
                }}
              >
                <option value="">System Default</option>
                {audioDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Device ${d.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: -8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Interface
            </span>
            <div style={{ height: 1, background: '#334155' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>Track Info Tooltips</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                Show a popup with the full title/artist on hover when a soundboard button's text is cut off
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', flexShrink: 0, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showTrackTooltips}
                onChange={(e) => onShowTrackTooltipsChange(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: '#3b82f6', cursor: 'pointer' }}
              />
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>Played Indicator</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                Tint a soundboard button red after its track has played
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', flexShrink: 0, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showPlayedIndicator}
                onChange={(e) => onShowPlayedIndicatorChange(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: '#3b82f6', cursor: 'pointer' }}
              />
            </label>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: -8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              About
            </span>
            <div style={{ height: 1, background: '#334155' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>Stadium Sound</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                {version ? `Version ${version}` : '—'}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <button
                onClick={() => {
                  setUpdateStatus('checking')
                  window.electronAPI.app.checkForUpdate()
                }}
                disabled={updateStatus === 'checking'}
                style={{
                  padding: '6px 16px',
                  background: '#1e3a5f',
                  border: '1px solid #334155',
                  borderRadius: 4,
                  color: updateStatus === 'checking' ? '#64748b' : '#93c5fd',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: updateStatus === 'checking' ? 'default' : 'pointer',
                  flexShrink: 0
                }}
              >
                {updateStatus === 'checking' ? 'Checking…' : 'Check for Updates'}
              </button>
              {updateStatus === 'not-available' && (
                <span style={{ fontSize: 11, color: '#4ade80' }}>You're up to date</span>
              )}
              {updateStatus === 'available' && (
                <span style={{ fontSize: 11, color: '#fbbf24' }}>Update available — restart to install</span>
              )}
              {updateStatus === 'error' && (
                <span style={{ fontSize: 11, color: '#f87171' }}>Couldn't check for updates</span>
              )}
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          padding: '16px 24px',
          borderTop: '1px solid #334155',
          flexShrink: 0
        }}>
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
