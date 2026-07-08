import { app } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { LibraryTrack } from './libraryScanner'

export interface MediaLibrary {
  id: string
  name: string
  folderPath: string
  tracks: LibraryTrack[]
  lastScannedAt: number | null
}

function makeId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function libraryPath(): string {
  return join(app.getPath('userData'), 'libraries.json')
}

function isValidLibrary(value: unknown): value is MediaLibrary {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.folderPath === 'string' &&
    Array.isArray(v.tracks) &&
    (v.lastScannedAt === null || typeof v.lastScannedAt === 'number')
  )
}

export function loadLibraries(): MediaLibrary[] {
  try {
    const parsed = JSON.parse(readFileSync(libraryPath(), 'utf-8'))
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidLibrary)
  } catch {
    return []
  }
}

function saveLibraries(libraries: MediaLibrary[]): void {
  writeFileSync(libraryPath(), JSON.stringify(libraries, null, 2), 'utf-8')
}

export function createLibrary(folderPath: string): { library: MediaLibrary; all: MediaLibrary[] } {
  const libraries = loadLibraries()
  const name = folderPath.split(/[\\/]/).pop() || folderPath
  const library: MediaLibrary = {
    id: makeId(),
    name,
    folderPath,
    tracks: [],
    lastScannedAt: null
  }
  const all = [...libraries, library]
  saveLibraries(all)
  return { library, all }
}

export function replaceLibraryTracks(id: string, tracks: LibraryTrack[]): MediaLibrary[] {
  const libraries = loadLibraries()
  const next = libraries.map((lib) =>
    lib.id === id ? { ...lib, tracks, lastScannedAt: Date.now() } : lib
  )
  saveLibraries(next)
  return next
}

export function renameLibrary(id: string, name: string): MediaLibrary[] {
  const libraries = loadLibraries()
  const next = libraries.map((lib) => (lib.id === id ? { ...lib, name } : lib))
  saveLibraries(next)
  return next
}

export function removeLibrary(id: string): MediaLibrary[] {
  const libraries = loadLibraries()
  const next = libraries.filter((lib) => lib.id !== id)
  saveLibraries(next)
  return next
}
