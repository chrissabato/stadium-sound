import { readFileSync, writeFileSync, existsSync } from 'fs'

export function loadEventSet(filePath: string): unknown {
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf-8')
  } catch (err) {
    throw new Error(`The file could not be read.\n\n${err instanceof Error ? err.message : String(err)}`)
  }
  let config: unknown
  try {
    config = JSON.parse(raw)
  } catch {
    throw new Error('The file is not a valid event set — it may be corrupted or saved by an incompatible program.')
  }
  if (!config || typeof config !== 'object' || !Array.isArray((config as { banks?: unknown }).banks)) {
    throw new Error('The file is not a valid event set — it does not contain any banks.')
  }
  return config
}

export function saveEventSet(config: unknown, filePath: string): void {
  writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8')
}

export function eventSetExists(filePath: string): boolean {
  return existsSync(filePath)
}
