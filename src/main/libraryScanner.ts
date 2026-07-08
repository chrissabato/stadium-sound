import { readdir } from 'fs/promises'
import { join } from 'path'

export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac']

export interface LibraryTrack {
  filePath: string
  artist: string
  title: string
  duration: number
}

export async function getAudioMetadata(
  filePath: string
): Promise<{ artist: string; title: string; duration: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mm: any = await import('music-metadata')
  try {
    const meta = await mm.parseFile(filePath)
    const artist = meta.common.artist || ''
    const title =
      meta.common.title ||
      filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ||
      filePath
    const duration = meta.format.duration ?? 0
    return { artist, title, duration }
  } catch {
    const name =
      filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || filePath
    return { artist: '', title: name, duration: 0 }
  }
}

async function runWithConcurrency(tasks: Array<() => Promise<void>>, limit: number): Promise<void> {
  let index = 0
  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const task = tasks[index++]
      await task()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
}

async function walkAudioFiles(folderPath: string): Promise<string[]> {
  const entries = await readdir(folderPath, { recursive: true, withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const ext = entry.name.split('.').pop()?.toLowerCase()
    if (!ext || !AUDIO_EXTENSIONS.includes(ext)) continue
    // With { recursive: true }, entry.path/parentPath is the directory the entry was found in.
    const parentDir = (entry as { parentPath?: string; path?: string }).parentPath ?? entry.path
    files.push(join(parentDir, entry.name))
  }
  return files
}

export async function scanFolder(
  folderPath: string,
  onProgress?: (scanned: number, total: number) => void
): Promise<LibraryTrack[]> {
  const files = await walkAudioFiles(folderPath)
  const total = files.length
  let scanned = 0
  onProgress?.(scanned, total)
  const results: LibraryTrack[] = []
  const tasks = files.map((filePath) => async () => {
    const meta = await getAudioMetadata(filePath)
    results.push({ filePath, ...meta })
    scanned++
    onProgress?.(scanned, total)
  })
  await runWithConcurrency(tasks, 6)
  return results
}
