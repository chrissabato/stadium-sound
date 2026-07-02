import { readFileSync, writeFileSync, existsSync } from 'fs'

export function loadEventSet(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf-8'))
}

export function saveEventSet(config: unknown, filePath: string): void {
  writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8')
}

export function eventSetExists(filePath: string): boolean {
  return existsSync(filePath)
}
