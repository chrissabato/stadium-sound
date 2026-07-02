export interface SspTrack {
  label: string   // c field — button label
  filePath: string // s field — file path
  duration: string // t field — "MM:SS"
  name: string    // n field — track name / artist
}

export interface SspPage {
  name: string
  tracks: SspTrack[]
}

export function parseSspSet(content: string): SspPage[] {
  const lines = content.split(/\r?\n/)
  const pages: SspPage[] = []
  let currentPage: SspPage | null = null
  const pending = new Map<number, Partial<SspTrack>>()

  function flushPage() {
    if (!currentPage) return
    const indices = Array.from(pending.keys()).sort((a, b) => a - b)
    for (const i of indices) {
      const t = pending.get(i)!
      if (t.filePath) {
        currentPage.tracks.push({
          label: t.label ?? '',
          filePath: t.filePath,
          duration: t.duration ?? '0:00',
          name: t.name ?? ''
        })
      }
    }
    if (currentPage.tracks.length > 0) pages.push(currentPage)
    pending.clear()
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    const section = line.match(/^\[(.+)\]$/)
    if (section) {
      flushPage()
      const name = section[1]
      currentPage = name.match(/^Page\d+$/i) ? { name, tracks: [] } : null
      continue
    }

    if (!currentPage) continue

    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq)
    const val = line.slice(eq + 1)

    if (key === 'PageName') {
      currentPage.name = val.trim()
      continue
    }

    const m = key.match(/^([cstno])(\d+)$/)
    if (!m) continue
    const field = m[1]
    const idx = parseInt(m[2])
    const entry = pending.get(idx) ?? {}
    if (field === 'c') entry.label = val
    else if (field === 's') entry.filePath = val
    else if (field === 't') entry.duration = val
    else if (field === 'n') entry.name = val
    pending.set(idx, entry)
  }

  flushPage()
  return pages
}
