interface Props {
  scanned: number
  total: number
}

export function FolderImportProgress({ scanned, total }: Props) {
  const pct = total > 0 ? (scanned / total) * 100 : 0
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 300
      }}
    >
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 8,
        width: 360,
        maxWidth: '90vw',
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        <span style={{ fontWeight: 700, fontSize: 16, color: '#f1f5f9' }}>Importing Folder…</span>
        <div style={{ fontSize: 13, color: '#93c5fd' }}>
          {total > 0 ? `Scanning ${scanned}/${total} files` : 'Scanning folders…'}
        </div>
        <div style={{ width: '100%', height: 6, background: '#0f172a', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: '#3b82f6', transition: 'width 0.15s' }} />
        </div>
      </div>
    </div>
  )
}
