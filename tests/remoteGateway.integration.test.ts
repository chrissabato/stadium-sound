import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import WebSocket, { WebSocketServer } from 'ws'
import { isAuthenticatedRequest, isControlCommand, type ControlCommand } from '../src/main/controlProtocol.ts'

test('remote gateway authenticates clients and ignores malformed commands', async (context) => {
  const token = 'test-pairing-token'
  const commands: ControlCommand[] = []
  const server = createServer()
  const sockets = new WebSocketServer({
    server,
    verifyClient: ({ origin, req }) => isAuthenticatedRequest(req.url ?? '/', req.headers.host ?? '', token, origin)
  })
  sockets.on('connection', (socket) => {
    socket.send(JSON.stringify({ type: 'state', state: { selectedBankId: 'bank-1' } }))
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString())
      if (message.type === 'command' && isControlCommand(message.command)) commands.push(message.command)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  context.after(async () => {
    for (const socket of sockets.clients) socket.terminate()
    await new Promise<void>((resolve) => sockets.close(() => resolve()))
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const host = `127.0.0.1:${address.port}`
  const client = new WebSocket(`ws://${host}/?token=${token}`, { origin: `http://${host}` })
  const state = await new Promise<{ type: string; state: { selectedBankId: string } }>((resolve, reject) => {
    client.once('error', reject)
    client.once('message', (raw) => resolve(JSON.parse(raw.toString())))
  })
  assert.equal(state.state.selectedBankId, 'bank-1')
  client.send(JSON.stringify({ type: 'command' }))
  client.send(JSON.stringify({ type: 'command', command: { type: 'volume', value: 4 } }))
  client.send(JSON.stringify({ type: 'command', command: { type: 'stop' } }))
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(commands, [{ type: 'stop' }])
  client.close()

  const rejected = new WebSocket(`ws://${host}/?token=wrong`, { origin: `http://${host}` })
  const status = await new Promise<number>((resolve) => rejected.once('unexpected-response', (_request, response) => resolve(response.statusCode ?? 0)))
  assert.equal(status, 401)
})
