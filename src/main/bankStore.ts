import { readFileSync, writeFileSync } from 'fs'

export function loadBankFile(filePath: string): unknown {
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf-8')
  } catch (err) {
    throw new Error(`The file could not be read.\n\n${err instanceof Error ? err.message : String(err)}`)
  }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('The file is not a valid bank — it may be corrupted or saved by an incompatible program.')
  }
  if (!data || typeof data !== 'object' || typeof (data as { stadiumSoundBank?: unknown }).stadiumSoundBank !== 'number') {
    throw new Error('The file is not a valid Stadium Sound bank file.')
  }
  const bank = (data as { bank?: unknown }).bank
  if (!bank || typeof bank !== 'object' || typeof (bank as { name?: unknown }).name !== 'string' || !Array.isArray((bank as { tracks?: unknown }).tracks)) {
    throw new Error('The file is not a valid Stadium Sound bank file — it does not contain a bank.')
  }
  return data
}

export function saveBankFile(data: unknown, filePath: string): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}
