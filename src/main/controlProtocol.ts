import { timingSafeEqual } from 'crypto'
import { encodeOsc, parseOsc } from '../shared/oscCodec.ts'

export { encodeOsc, parseOsc }

export type ControlCommand =
  | { type: 'play'; trackId: string }
  | { type: 'selectBank'; bank: string | number }
  | { type: 'stop' | 'fade' | 'random' }
  | { type: 'volume'; value: number }

export function isControlCommand(value: unknown): value is ControlCommand {
  if (!value || typeof value !== 'object') return false
  const command = value as Record<string, unknown>
  if (command.type === 'stop' || command.type === 'fade' || command.type === 'random') return true
  if (command.type === 'play') return typeof command.trackId === 'string' && command.trackId.length > 0 && command.trackId.length <= 256
  if (command.type === 'selectBank') {
    return (typeof command.bank === 'string' && command.bank.length > 0 && command.bank.length <= 256) ||
      (typeof command.bank === 'number' && Number.isInteger(command.bank) && command.bank >= 1)
  }
  return command.type === 'volume' && typeof command.value === 'number' && Number.isFinite(command.value) && command.value >= 0 && command.value <= 1
}

// Constant-time comparison: a plain !== leaks how many leading characters
// matched via response latency, letting an attacker on the LAN narrow down
// the pairing token faster than brute force.
function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function isAuthenticatedRequest(requestUrl: string, host: string, token: string, origin?: string): boolean {
  try {
    const url = new URL(requestUrl, `http://${host}`)
    if (!tokensMatch(url.searchParams.get('token') ?? '', token)) return false
    return origin === undefined || new URL(origin).host === host
  } catch { return false }
}

export function oscCommand(address: string, args: Array<string | number>): ControlCommand | null {
  const base = '/stadium-sound'
  let command: unknown = null
  if (address === `${base}/stop`) command = { type: 'stop' }
  else if (address === `${base}/fade`) command = { type: 'fade' }
  else if (address === `${base}/random`) command = { type: 'random' }
  else if (address === `${base}/track/play`) command = { type: 'play', trackId: args[0] }
  else if (address === `${base}/bank/select`) command = { type: 'selectBank', bank: args[0] }
  else if (address === `${base}/volume`) command = { type: 'volume', value: args[0] }
  return isControlCommand(command) ? command : null
}
