import assert from 'node:assert/strict'
import { createSocket } from 'node:dgram'
import test from 'node:test'
import { createRequire } from 'node:module'
import { parseOsc } from '../src/main/controlProtocol.ts'

const require = createRequire(import.meta.url)
const companionOsc = require('../companion-module/src/osc.js') as { encode: (address: string, args?: Array<string | number>) => Buffer; decode: (packet: Buffer) => { address: string; args: Array<string | number> } | null }

test('Companion and Stadium Sound exchange compatible UDP OSC packets', async (context) => {
  const server = createSocket('udp4')
  const client = createSocket('udp4')
  context.after(() => { server.close(); client.close() })
  await new Promise<void>((resolve) => server.bind(0, '127.0.0.1', resolve))
  await new Promise<void>((resolve) => client.bind(0, '127.0.0.1', resolve))

  const received = new Promise<{ address: string; args: Array<string | number> }>((resolve) => {
    server.once('message', (packet, peer) => {
      const command = parseOsc(packet)
      assert.ok(command)
      server.send(companionOsc.encode('/stadium-sound/state/playing', ['track-7']), peer.port, peer.address)
      resolve(command)
    })
  })
  const feedback = new Promise<{ address: string; args: Array<string | number> }>((resolve) => {
    client.once('message', (packet) => { const decoded = companionOsc.decode(packet); assert.ok(decoded); resolve(decoded) })
  })

  const address = server.address()
  client.send(companionOsc.encode('/stadium-sound/track/play', ['track-7']), address.port, address.address)
  assert.deepEqual(await received, { address: '/stadium-sound/track/play', args: ['track-7'] })
  assert.deepEqual(await feedback, { address: '/stadium-sound/state/playing', args: ['track-7'] })
})
