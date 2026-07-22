// Minimal OSC 1.0 binary framing shared by the Electron app (src/main/controlProtocol.ts)
// and the Bitfocus Companion module (companion-module/src/osc.js). Both ends must agree
// byte-for-byte on this framing, so it lives in exactly one place.

function paddedString(value: string): Buffer {
  const raw = Buffer.from(`${value}\0`, 'utf8')
  const padded = Buffer.alloc((raw.length + 3) & ~3)
  raw.copy(padded)
  return padded
}

function readOscString(buffer: Buffer, offset: number): { value: string; next: number } | null {
  if (offset < 0 || offset >= buffer.length) return null
  const end = buffer.indexOf(0, offset)
  if (end < 0) return null
  const next = (end + 4) & ~3
  return next <= buffer.length ? { value: buffer.toString('utf8', offset, end), next } : null
}

export function encodeOsc(address: string, args: Array<string | number> = []): Buffer {
  const tags = ',' + args.map((arg) => typeof arg === 'string' ? 's' : Number.isInteger(arg) ? 'i' : 'f').join('')
  const values = args.map((arg) => {
    if (typeof arg === 'string') return paddedString(arg)
    const value = Buffer.alloc(4)
    if (Number.isInteger(arg)) value.writeInt32BE(arg)
    else value.writeFloatBE(arg)
    return value
  })
  return Buffer.concat([paddedString(address), paddedString(tags), ...values])
}

export function parseOsc(buffer: Buffer): { address: string; args: Array<string | number> } | null {
  const address = readOscString(buffer, 0)
  if (!address?.value.startsWith('/')) return null
  const tags = readOscString(buffer, address.next)
  if (!tags?.value.startsWith(',')) return null
  let offset = tags.next
  const args: Array<string | number> = []
  for (const tag of tags.value.slice(1)) {
    if (tag === 'i' && offset + 4 <= buffer.length) { args.push(buffer.readInt32BE(offset)); offset += 4 }
    else if (tag === 'f' && offset + 4 <= buffer.length) { args.push(buffer.readFloatBE(offset)); offset += 4 }
    else if (tag === 's') { const value = readOscString(buffer, offset); if (!value) return null; args.push(value.value); offset = value.next }
    else return null
  }
  return { address: address.value, args }
}
