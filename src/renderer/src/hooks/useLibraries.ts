import { useState, useEffect, useCallback } from 'react'
import type { MediaLibrary } from '../types'

export interface ScanProgress {
  scanned: number
  total: number
}

export interface LibrariesState {
  libraries: MediaLibrary[]
  scanProgress: Record<string, ScanProgress>
  addFolder: () => Promise<void>
  rescan: (id: string) => Promise<void>
  rename: (id: string, name: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

export function useLibraries(): LibrariesState {
  const [libraries, setLibraries] = useState<MediaLibrary[]>([])
  const [scanProgress, setScanProgress] = useState<Record<string, ScanProgress>>({})

  useEffect(() => {
    window.electronAPI.library.list().then((libs) => {
      setLibraries(libs)
      // Refresh every library's index in the background on launch so stale
      // scans (files added/removed since last run) self-heal without the
      // user having to remember to hit Rescan — non-blocking, same
      // fire-and-forget path as a manual rescan.
      for (const lib of libs) {
        window.electronAPI.library.rescan(lib.id)
      }
    })

    const offProgress = window.electronAPI.library.onScanProgress(({ id, scanned, total }) => {
      setScanProgress((prev) => ({ ...prev, [id]: { scanned, total } }))
    })
    const offComplete = window.electronAPI.library.onScanComplete(({ id, libraries: next }) => {
      setLibraries(next)
      setScanProgress((prev) => {
        if (!(id in prev)) return prev
        const next2 = { ...prev }
        delete next2[id]
        return next2
      })
    })
    return () => { offProgress(); offComplete() }
  }, [])

  const addFolder = useCallback(async () => {
    const next = await window.electronAPI.library.addFolder()
    if (next) setLibraries(next)
  }, [])

  const rescan = useCallback(async (id: string) => {
    await window.electronAPI.library.rescan(id)
  }, [])

  const rename = useCallback(async (id: string, name: string) => {
    setLibraries(await window.electronAPI.library.rename(id, name))
  }, [])

  const remove = useCallback(async (id: string) => {
    setLibraries(await window.electronAPI.library.remove(id))
    setScanProgress((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  return { libraries, scanProgress, addFolder, rescan, rename, remove }
}
