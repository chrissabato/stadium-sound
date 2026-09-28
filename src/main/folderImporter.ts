import { readdir } from 'fs/promises'
import { join } from 'path'
import { getAudioMetadata, runWithConcurrency, walkAudioFiles } from './libraryScanner'

export interface ImportedTrack {
  filePath: string
  artist: string
  title: string
  duration: number
}

export interface ImportedBank {
  name: string
  tracks: ImportedTrack[]
}

// One bank per immediate subfolder of rootPath; audio files at any depth
// inside a subfolder (including further-nested folders) all belong to that
// subfolder's bank. Files sitting directly in rootPath, outside any
// subfolder, have no bank to belong to and are skipped.
export async function scanFolderAsBanks(
  rootPath: string,
  onProgress?: (scanned: number, total: number) => void
): Promise<ImportedBank[]> {
  const entries = await readdir(rootPath, { withFileTypes: true })
  const subfolders = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b))

  const filesByFolder = await Promise.all(
    subfolders.map((name) => walkAudioFiles(join(rootPath, name)))
  )
  filesByFolder.forEach((files) => files.sort((a, b) => a.localeCompare(b)))

  const total = filesByFolder.reduce((sum, files) => sum + files.length, 0)
  let scanned = 0
  onProgress?.(scanned, total)

  const trackLists: ImportedTrack[][] = filesByFolder.map((files) => new Array(files.length))
  const tasks: Array<() => Promise<void>> = []
  filesByFolder.forEach((files, folderIndex) => {
    files.forEach((filePath, fileIndex) => {
      tasks.push(async () => {
        const meta = await getAudioMetadata(filePath)
        trackLists[folderIndex][fileIndex] = { filePath, ...meta }
        scanned++
        onProgress?.(scanned, total)
      })
    })
  })
  await runWithConcurrency(tasks, 6)

  return subfolders
    .map((name, i) => ({ name, tracks: trackLists[i] }))
    .filter((bank) => bank.tracks.length > 0)
}
