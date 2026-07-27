import type { Bank, Track } from '../types'
import { measureIntegratedLufs } from '../hooks/useAudioEngine'

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
  targetLufs: number
  toleranceLu: number
  measuredCount: number
  silentCount: number
  errorCount: number
  averageLufs: number | null
  loudest: TrackLoudnessEntry | null
  quietest: TrackLoudnessEntry | null
  tooLoud: TrackLoudnessEntry[]
  tooQuiet: TrackLoudnessEntry[]
}

export interface SuggestedTarget {
  targetLufs: number
  trackCount: number
  trackPercent: number
}

// Walks every track in every bank, measuring integrated loudness one at a
// time. `decode` is injected (e.g. useAudioEngine's decodeTransient) rather
// than imported, so this stays independent of any live AudioContext — the
// same loop drives both this report and, in the future, a "normalize all
// tracks" action, just swapping what happens with each measurement.
// `onProgress` fires after each track so a caller can drive a progress bar.
// Deliberately target-agnostic — measuring is expensive (a full decode +
// offline render per track), classifying against a target is not, so target
// changes (a settings edit, or the report's own suggested-target button)
// are handled by re-running summarizeLoudness() over these same entries
// rather than re-measuring anything.
export async function measureLoudness(
  banks: Bank[],
  decode: (filePath: string) => Promise<AudioBuffer>,
  onProgress?: (done: number, total: number) => void
): Promise<TrackLoudnessEntry[]> {
  const jobs: { bank: Bank; track: Track }[] = []
  for (const bank of banks) {
    for (const track of bank.tracks) jobs.push({ bank, track })
  }

  // A decoded buffer is only kept around while a later job still needs the
  // same file — caching every decode for the whole run (as this used to do)
  // holds every track's full PCM in memory simultaneously, which for a few
  // hundred full-length songs is tens of GB and starts failing decodes
  // partway through with no relation to the actual files being fine.
  // Counting each path's remaining uses up front lets a duplicate's buffer
  // be dropped the moment its last reference has been measured.
  const remainingUses = new Map<string, number>()
  for (const { track } of jobs) {
    if (!track.filePath) continue
    remainingUses.set(track.filePath, (remainingUses.get(track.filePath) ?? 0) + 1)
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
          // Only worth caching if something later still needs this same file.
          if ((remainingUses.get(track.filePath) ?? 1) > 1) bufferCache.set(track.filePath, buffer)
        }
        const outPoint = track.outPoint || track.duration || buffer.duration
        const lufs = await measureIntegratedLufs(buffer, track.inPoint, outPoint)
        entries.push({ ...base, lufs: Number.isFinite(lufs) ? lufs : null })
      } catch (err) {
        entries.push({ ...base, lufs: null, error: describeError(err) })
      } finally {
        const remaining = (remainingUses.get(track.filePath) ?? 1) - 1
        remainingUses.set(track.filePath, remaining)
        if (remaining <= 0) bufferCache.delete(track.filePath)
      }
    }
    onProgress?.(i + 1, jobs.length)
  }

  return entries
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

// Cheap, synchronous, and safe to call on every render — classifies already-
// measured entries against a target without touching any audio.
export function summarizeLoudness(
  entries: TrackLoudnessEntry[],
  targetLufs: number,
  toleranceLu: number = LOUDNESS_TOLERANCE_LU
): LoudnessReport {
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
    targetLufs,
    toleranceLu,
    measuredCount: measured.length,
    silentCount: entries.filter((e) => e.lufs === null && !e.error).length,
    errorCount: entries.filter((e) => !!e.error).length,
    averageLufs,
    loudest,
    quietest,
    tooLoud: measured.filter((e) => (e.lufs as number) > targetLufs + toleranceLu),
    tooQuiet: measured.filter((e) => (e.lufs as number) < targetLufs - toleranceLu)
  }
}

// Suggests a normalize target based on where most of the library's tracks
// already sit, rather than a fixed broadcast-style number — so normalizing
// nudges the minority into line with the majority instead of moving
// everything. Finds the narrowest-effort window (width = 2×tolerance, same
// band summarizeLoudness uses for too-loud/too-quiet) that contains the most
// measured tracks — i.e. the target that would minimize outliers — via a
// sliding window over the sorted values.
export function suggestTarget(
  entries: TrackLoudnessEntry[],
  toleranceLu: number = LOUDNESS_TOLERANCE_LU
): SuggestedTarget | null {
  const values = entries
    .filter((e) => e.lufs !== null)
    .map((e) => e.lufs as number)
    .sort((a, b) => a - b)
  if (values.length === 0) return null

  const windowWidth = toleranceLu * 2
  let bestStart = 0
  let bestEnd = 1
  let left = 0
  for (let right = 0; right < values.length; right++) {
    while (values[right] - values[left] > windowWidth) left++
    if (right - left + 1 > bestEnd - bestStart) {
      bestStart = left
      bestEnd = right + 1
    }
  }

  const windowValues = values.slice(bestStart, bestEnd)
  const targetLufs = windowValues.reduce((a, b) => a + b, 0) / windowValues.length
  return {
    targetLufs: Math.round(targetLufs * 10) / 10,
    trackCount: windowValues.length,
    trackPercent: Math.round((windowValues.length / values.length) * 100)
  }
}
