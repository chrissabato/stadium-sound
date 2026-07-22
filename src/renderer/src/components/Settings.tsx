import React, { useState, useEffect } from 'react'
import type { NetworkControlPrefs, NetworkControlStatus, UpdateStatus } from '../../../types/electron'
import { QrCode } from './QrCode'

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
  showMeters: boolean
  onShowMetersChange: (enabled: boolean) => void
  networkControl: NetworkControlPrefs
  networkStatus: NetworkControlStatus | null
  onNetworkControlChange: (prefs: NetworkControlPrefs) => Promise<void>
  uiZoom: number
  onUiZoomChange: (zoom: number) => void
  onShowChangelog: () => void
  onClose: () => void
}

const ZOOM_LEVELS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]

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

export function Settings({ open, config, onChange, showTrackTooltips, onShowTrackTooltipsChange, showPlayedIndicator, onShowPlayedIndicatorChange, showMeters, onShowMetersChange, networkControl, networkStatus, onNetworkControlChange, uiZoom, onUiZoomChange, onShowChangelog, onClose }: Props) {
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [version, setVersion] = useState('')
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [networkDraft, setNetworkDraft] = useState(networkControl)
  const [tokenCopied, setTokenCopied] = useState(false)

  function copyToken(token: string) {
    navigator.clipboard.writeText(token).then(() => {
      setTokenCopied(true)
      setTimeout(() => setTokenCopied(false), 1500)
    })
  }

  useEffect(() => {
    if (!open) return
    navigator.mediaDevices.enumerateDevices()
      // Chromium's synthetic 'default'/'communications' entries alias a real device but
      // AudioContext.setSinkId() rejects those ids outright ("device not found") — our own
      // "System Default" option (value "") is the one that actually works, so hide these.
      .then((devices) => setAudioDevices(devices.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications')))
      .catch(() => {})
    window.electronAPI.app.getVersion().then(setVersion).catch(() => {})
    // The updater keeps working while this dialog is closed (startup check,
    // background download) — pick up where it actually is, then follow along.
    window.electronAPI.app.getUpdateStatus().then(setUpdateStatus).catch(() => {})
    const unsub = window.electronAPI.app.onUpdateStatus(setUpdateStatus)
    return unsub
  }, [open])

  useEffect(() => { if (open) setNetworkDraft(networkControl) }, [open, networkControl])

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
              <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>Display Zoom</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                Scale the whole interface up or down — useful on high-resolution screens
              </div>
            </div>
            <select
              value={String(uiZoom)}
              onChange={(e) => onUiZoomChange(parseFloat(e.target.value))}
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 4,
                color: '#f1f5f9',
                padding: '6px 10px',
                fontSize: 13,
                minWidth: 90,
                flexShrink: 0
              }}
            >
              {!ZOOM_LEVELS.includes(uiZoom) && (
                <option value={String(uiZoom)}>{Math.round(uiZoom * 100)}%</option>
              )}
              {ZOOM_LEVELS.map((z) => (
                <option key={z} value={String(z)}>
                  {Math.round(z * 100)}%
                </option>
              ))}
            </select>
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

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>Level Meters</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                Show vertical L/R meters for the main output on the right side of the display
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', flexShrink: 0, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showMeters}
                onChange={(e) => onShowMetersChange(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: '#3b82f6', cursor: 'pointer' }}
              />
            </label>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: -8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Network Control
            </span>
            <div style={{ height: 1, background: '#334155' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>OSC &amp; Web Remote</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Allow control from devices on this network</div>
            </div>
            {/* Toggling enabled applies against the currently-active ports, not
                networkDraft — port edits only take effect via "Apply Ports" below. */}
            <input type="checkbox" checked={networkControl.enabled} onChange={(e) => onNetworkControlChange({ ...networkControl, enabled: e.target.checked })} style={{ width: 16, height: 16, accentColor: '#3b82f6' }} />
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            {([['oscPort', 'OSC UDP port'], ['remotePort', 'Remote web port']] as const).map(([key, label]) => (
              <label key={key} style={{ flex: 1, fontSize: 12, color: '#94a3b8' }}>{label}
                <input type="number" min={1024} max={65535} value={networkDraft[key]}
                  onChange={(e) => setNetworkDraft({ ...networkDraft, [key]: Math.max(1024, Math.min(65535, Number(e.target.value))) })}
                  style={{ display: 'block', width: '100%', marginTop: 5, background: '#0f172a', border: '1px solid #334155', borderRadius: 4, color: '#f1f5f9', padding: '6px 8px' }} />
              </label>
            ))}
          </div>

          {(networkDraft.oscPort !== networkControl.oscPort || networkDraft.remotePort !== networkControl.remotePort) && (
            <button onClick={() => onNetworkControlChange({ ...networkDraft, enabled: networkControl.enabled })}
              style={{ alignSelf: 'flex-end', padding: '6px 14px', background: '#1d4ed8', border: 0, borderRadius: 4, color: '#fff', cursor: 'pointer' }}>
              Apply Ports
            </button>
          )}

          {networkControl.enabled && (
            <div style={{ padding: '10px 12px', borderRadius: 4, background: '#0f172a', fontSize: 12, color: networkStatus?.error ? '#f87171' : '#94a3b8' }}>
              {networkStatus?.error
                ? `Could not start: ${networkStatus.error}`
                : networkStatus?.addresses.length
                  ? <>
                      Open on your phone or tablet:
                      {networkStatus.addresses.map((address) => (
                        <div key={address} style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                          <QrCode value={address} size={80} />
                          <a href={address} target="_blank" rel="noreferrer" style={{ color: '#60a5fa', wordBreak: 'break-all' }}>{address}</a>
                        </div>
                      ))}
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#64748b', flexShrink: 0 }}>Companion token</span>
                        <input
                          readOnly
                          value={networkStatus.token}
                          onFocus={(e) => e.currentTarget.select()}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            background: '#1e293b',
                            border: '1px solid #334155',
                            borderRadius: 4,
                            color: '#e2e8f0',
                            padding: '4px 6px',
                            fontFamily: 'monospace',
                            fontSize: 11
                          }}
                        />
                        <button
                          onClick={() => copyToken(networkStatus.token)}
                          style={{
                            flexShrink: 0,
                            padding: '4px 10px',
                            background: tokenCopied ? '#166534' : '#1e293b',
                            border: `1px solid ${tokenCopied ? '#4ade80' : '#334155'}`,
                            borderRadius: 4,
                            color: tokenCopied ? '#bbf7d0' : '#94a3b8',
                            fontSize: 11,
                            cursor: 'pointer'
                          }}
                        >
                          {tokenCopied ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </>
                  : 'Starting network control…'}
            </div>
          )}

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
              <button
                onClick={onShowChangelog}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  marginTop: 4,
                  color: '#93c5fd',
                  fontSize: 12,
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                What's New
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              {updateStatus.state === 'downloaded' ? (
                <button
                  onClick={() => window.electronAPI.app.installUpdate()}
                  style={{
                    padding: '6px 16px',
                    background: '#16a34a',
                    border: '1px solid #22c55e',
                    borderRadius: 4,
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                >
                  Restart &amp; Install{updateStatus.version ? ` v${updateStatus.version}` : ''}
                </button>
              ) : (
                <button
                  onClick={() => {
                    setUpdateStatus({ state: 'checking' })
                    window.electronAPI.app.checkForUpdate()
                  }}
                  disabled={updateStatus.state === 'checking' || updateStatus.state === 'downloading'}
                  style={{
                    padding: '6px 16px',
                    background: '#1e3a5f',
                    border: '1px solid #334155',
                    borderRadius: 4,
                    color: updateStatus.state === 'checking' || updateStatus.state === 'downloading' ? '#64748b' : '#93c5fd',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: updateStatus.state === 'checking' || updateStatus.state === 'downloading' ? 'default' : 'pointer',
                    flexShrink: 0
                  }}
                >
                  {updateStatus.state === 'checking' ? 'Checking…' : 'Check for Updates'}
                </button>
              )}
              {updateStatus.state === 'not-available' && (
                <span style={{ fontSize: 11, color: '#4ade80' }}>You're up to date</span>
              )}
              {updateStatus.state === 'available' && (
                <span style={{ fontSize: 11, color: '#fbbf24' }}>
                  {updateStatus.version ? `v${updateStatus.version} found` : 'Update found'} — downloading…
                </span>
              )}
              {updateStatus.state === 'downloading' && (
                <span style={{ fontSize: 11, color: '#fbbf24', fontVariantNumeric: 'tabular-nums' }}>
                  Downloading… {Math.round(updateStatus.percent ?? 0)}%
                </span>
              )}
              {updateStatus.state === 'downloaded' && (
                <span style={{ fontSize: 11, color: '#4ade80' }}>
                  {updateStatus.version ? `v${updateStatus.version} downloaded` : 'Update downloaded'} — ready to install
                </span>
              )}
              {updateStatus.state === 'error' && (
                <span style={{ fontSize: 11, color: '#f87171' }}>Couldn't check for updates</span>
              )}
              {updateStatus.state === 'dev' && (
                <span style={{ fontSize: 11, color: '#64748b' }}>Updates only work in the installed app</span>
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
