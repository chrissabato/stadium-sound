import assert from 'node:assert/strict'
import test from 'node:test'
import { encodeOsc, isAuthenticatedRequest, isControlCommand, oscCommand, parseOsc } from '../src/main/controlProtocol.ts'

test('OSC packets round-trip supported values', () => {
  const packet = encodeOsc('/stadium-sound/test', ['track-1', 4, 0.75])
  const decoded = parseOsc(packet)
  assert.equal(decoded?.address, '/stadium-sound/test')
  assert.deepEqual(decoded?.args.slice(0, 2), ['track-1', 4])
  assert.ok(Math.abs(Number(decoded?.args[2]) - 0.75) < 0.0001)
})

test('OSC command parsing rejects invalid and out-of-range commands', () => {
  assert.deepEqual(oscCommand('/stadium-sound/volume', [0.5]), { type: 'volume', value: 0.5 })
  assert.equal(oscCommand('/stadium-sound/volume', [2]), null)
  assert.equal(oscCommand('/stadium-sound/track/play', ['']), null)
  assert.equal(parseOsc(Buffer.from('/not-padded')), null)
})

test('runtime command validation covers every supported shape', () => {
  assert.equal(isControlCommand({ type: 'stop' }), true)
  assert.equal(isControlCommand({ type: 'play', trackId: 'abc' }), true)
  assert.equal(isControlCommand({ type: 'selectBank', bank: 1 }), true)
  assert.equal(isControlCommand({ type: 'volume', value: Number.NaN }), false)
  assert.equal(isControlCommand(undefined), false)
})

test('remote authentication requires both token and same-host WebSocket origin', () => {
  assert.equal(isAuthenticatedRequest('/?token=secret', '10.0.0.2:9001', 'secret'), true)
  assert.equal(isAuthenticatedRequest('/?token=wrong', '10.0.0.2:9001', 'secret'), false)
  assert.equal(isAuthenticatedRequest('/?token=secret', '10.0.0.2:9001', 'secret', 'http://10.0.0.2:9001'), true)
  assert.equal(isAuthenticatedRequest('/?token=secret', '10.0.0.2:9001', 'secret', 'https://evil.example'), false)
})
