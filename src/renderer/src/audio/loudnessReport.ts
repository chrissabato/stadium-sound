import type { Bank, Track } from '../types'
import { measureIntegratedLufs, NORMALIZE_TARGET_LUFS } from '../hooks/useAudioEngine'

// How far (in LU) a track's integrated loudness may sit from the target
// before it's flagged as an outlier — wide enough that normal show-content
// variation (crowd noise vs. a clean stinger) doesn't spam the report,
// narrow enough to catch tracks that would visibly stick out against a
// normalized bank.
export const LOUDNESS_TOLERANCE_LU = 3

export interface TrackLoudnessEntry {
  trackId: string
  bankId: string
  bankName: string
  title: string
  artist: string
  filePath: string
  lufs: number | null // null = silent, missing file, or decode error
  error?: string
}

export interface LoudnessReport {
  entries: TrackLoudnessEntry[]
  measuredCount: number
  silentCount: number
  errorCount: number
  averageLufs: number | null
  loudest: TrackLoudnessEntry | null
  quietest: TrackLoudnessEntry | null
  tooLoud: TrackLoudnessEntry[]
  tooQuiet: TrackLoudnessEntry[]
}

// Walks every track in every bank, measuring integrated loudness one at a
// time. `decode` is injected (e.g. useAudioEngine's decodeTransient) rather
// than imported, so this stays independent of any live AudioContext — the
// same loop drives both this report and, in the future, a "normalize all
// tracks" action, just swapping what happens with each measurement.
// Decodes are cached per file path within a single run, since the same file
// often appears in several banks/playlists. `onProgress` fires after each
// track so a caller can drive a progress bar.
export async function analyzeLoudness(
  banks: Bank[],
  decode: (filePath: string) => Promise<AudioBuffer>,
  onProgress?: (done: number, total: number) => void
): Promise<LoudnessReport> {
  const jobs: { bank: Bank; track: Track }[] = []
  for (const bank of banks) {
    for (const track of bank.tracks) jobs.push({ bank, track })
  }

  const bufferCache = new Map<string, AudioBuffer>()
  const entries: TrackLoudnessEntry[] = []

  for (let i = 0; i < jobs.length; i++) {
    const { bank, track } = jobs[i]
    const base = {
      trackId: track.id,
      bankId: bank.id,
      bankName: bank.name,
      title: track.title,
      artist: track.artist,
      filePath: track.filePath
    }
    if (!track.filePath) {
      entries.push({ ...base, lufs: null, error: 'No file' })
    } else {
      try {
        let buffer = bufferCache.get(track.filePath)
        if (!buffer) {
          buffer = await decode(track.filePath)
          bufferCache.set(track.filePath, buffer)
        }
        const outPoint = track.outPoint || track.duration || buffer.duration
        const lufs = await measureIntegratedLufs(buffer, track.inPoint, outPoint)
        entries.push({ ...base, lufs: Number.isFinite(lufs) ? lufs : null })
      } catch (err) {
        entries.push({ ...base, lufs: null, error: describeError(err) })
      }
    }
    onProgress?.(i + 1, jobs.length)
  }

  return summarize(entries)
}

// readAudioFile/decodeAudioData failures arrive as raw IPC/DOMException text
// ("Error invoking remote method 'fs:readAudioFile': Error: ENOENT: no such
// file or directory, open 'C:\...'") — too noisy for a report table.
function describeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (/ENOENT/.test(message)) return 'File not found'
  if (/decodeAudioData|EncodingError|Unable to decode/i.test(message)) return 'Could not decode audio'
  return 'Could not read file'
}

function summarize(entries: TrackLoudnessEntry[]): LoudnessReport {
  const measured = entries.filter((e) => e.lufs !== null)
  const values = measured.map((e) => e.lufs as number)
  const averageLufs = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null

  let loudest: TrackLoudnessEntry | null = null
  let quietest: TrackLoudnessEntry | null = null
  for (const e of measured) {
    if (!loudest || (e.lufs as number) > (loudest.lufs as number)) loudest = e
    if (!quietest || (e.lufs as number) < (quietest.lufs as number)) quietest = e
  }

  return {
    entries,
    measuredCount: measured.length,
    silentCount: entries.filter((e) => e.lufs === null && !e.error).length,
    errorCount: entries.filter((e) => !!e.error).length,
    averageLufs,
    loudest,
    quietest,
    tooLoud: measured.filter((e) => (e.lufs as number) > NORMALIZE_TARGET_LUFS + LOUDNESS_TOLERANCE_LU),
    tooQuiet: measured.filter((e) => (e.lufs as number) < NORMALIZE_TARGET_LUFS - LOUDNESS_TOLERANCE_LU)
  }
}
