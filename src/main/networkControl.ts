import { BrowserWindow } from 'electron'
import { createServer, type IncomingMessage, type Server } from 'http'
import { networkInterfaces } from 'os'
import { createSocket, type Socket, type RemoteInfo } from 'dgram'
// `ws` and the remote page HTML are only ever needed once the feature is
// actually turned on — importing them at module scope would load the ws
// package (and its dependency tree) into every Stadium Sound process even
// when network control stays off, which is the common case. Both are typed
// here and loaded lazily in startInternal() instead.
import type { WebSocketServer, WebSocket } from 'ws'
import { encodeOsc, isAuthenticatedRequest, isControlCommand, oscCommand, parseOsc, type ControlCommand } from './controlProtocol'

export interface RemoteState {
  banks: Array<{ id: string; name: string; tracks: Array<{ id: string; title: string; artist: string; colorLabel?: string }> }>
  selectedBankId: string
  playingTrackId: string | null
  masterVolume: number
}

export interface NetworkControlStatus {
  running: boolean
  oscPort: number
  remotePort: number
  addresses: string[]
  token: string
  error?: string
}

let udp: Socket | null = null
let http: Server | null = null
let wss: WebSocketServer | null = null
let currentState: RemoteState | null = null
let status: NetworkControlStatus = { running: false, oscPort: 9000, remotePort: 9001, addresses: [], token: '' }
let pairingToken = ''
let transition: Promise<NetworkControlStatus> = Promise.resolve(status)
// Peers are added on every OSC packet received and otherwise never removed —
// prune anything quiet for this long so a long-running show doesn't
// accumulate an ever-growing broadcast list from stale/one-off senders.
const OSC_PEER_TTL_MS = 10 * 60 * 1000
const oscPeers = new Map<string, { address: string; port: number; lastSeen: number }>()

function pruneStalePeers(): void {
  const cutoff = Date.now() - OSC_PEER_TTL_MS
  for (const [key, peer] of oscPeers) if (peer.lastSeen < cutoff) oscPeers.delete(key)
}

function window(): BrowserWindow | null { return BrowserWindow.getAllWindows()[0] ?? null }
function dispatch(command: ControlCommand): void { window()?.webContents.send('network:command', command) }
function publishStatus(): void { window()?.webContents.send('network:status', status) }

function localAddresses(port: number): string[] {
  const result: string[] = []
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        result.push(`http://${entry.address}:${port}/?token=${encodeURIComponent(pairingToken)}`)
      }
    }
  }
  return result
}

function statePackets(): Buffer[] {
  if (!currentState) return []
  return [
    encodeOsc('/stadium-sound/state/playing', [currentState.playingTrackId ?? '']),
    encodeOsc('/stadium-sound/state/bank', [currentState.selectedBankId]),
    encodeOsc('/stadium-sound/state/volume', [currentState.masterVolume])
  ]
}

function sendStateToPeer(peer: { address: string; port: number }): void {
  for (const packet of statePackets()) udp?.send(packet, peer.port, peer.address)
}

function broadcastState(): void {
  if (!currentState) return
  pruneStalePeers()
  const payload = JSON.stringify({ type: 'state', state: currentState })
  for (const client of wss?.clients ?? []) if (client.readyState === 1) client.send(payload)
  for (const peer of oscPeers.values()) sendStateToPeer(peer)
}

function requestIsAuthenticated(req: { url?: string; headers: { host?: string } }): boolean {
  return isAuthenticatedRequest(req.url ?? '/', req.headers.host ?? 'localhost', pairingToken)
}

function websocketIsAuthenticated(origin: string, req: { url?: string; headers: { host?: string } }): boolean {
  return isAuthenticatedRequest(req.url ?? '/', req.headers.host ?? 'localhost', pairingToken, origin)
}

export function getNetworkControlStatus(): NetworkControlStatus { return status }

export function updateRemoteState(next: RemoteState): void {
  currentState = next
  broadcastState()
}

async function stopInternal(): Promise<NetworkControlStatus> {
  const tasks: Promise<void>[] = []
  if (wss) { for (const client of wss.clients) client.terminate(); wss.close(); wss = null }
  if (http?.listening) tasks.push(new Promise((resolve) => http!.close(() => resolve())))
  if (udp) tasks.push(new Promise((resolve) => udp!.close(() => resolve())))
  http = null; udp = null; oscPeers.clear()
  await Promise.all(tasks)
  status = { ...status, running: false, addresses: [] }
  publishStatus()
  return status
}

async function startInternal(oscPort: number, remotePort: number, token: string): Promise<NetworkControlStatus> {
  await stopInternal()
  pairingToken = token
  status = { running: false, oscPort, remotePort, addresses: [], token }
  publishStatus()
  try {
    const [{ WebSocketServer }, { default: remoteHtml }] = await Promise.all([
      import('ws'),
      import('./remote/index.html?raw')
    ])

    udp = createSocket('udp4')
    udp.on('message', (message: Buffer, remote: RemoteInfo) => {
      const parsed = parseOsc(message)
      if (!parsed) return
      const peer = { address: remote.address, port: remote.port, lastSeen: Date.now() }
      oscPeers.set(`${remote.address}:${remote.port}`, peer)
      if (parsed.address === '/stadium-sound/state/subscribe') sendStateToPeer(peer)
      const command = oscCommand(parsed.address, parsed.args)
      if (command) dispatch(command)
    })
    await new Promise<void>((resolve, reject) => { udp!.once('error', reject); udp!.bind(oscPort, '0.0.0.0', resolve) })

    http = createServer((req, res) => {
      const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
      if (!requestIsAuthenticated(req)) { res.writeHead(404); res.end('Not found'); return }
      if (requestUrl.pathname === '/' || requestUrl.pathname === '/index.html') {
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'content-security-policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'"
        })
        res.end(remoteHtml)
      } else if (requestUrl.pathname === '/api/state' && currentState) {
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        res.end(JSON.stringify(currentState))
      } else { res.writeHead(404); res.end('Not found') }
    })
    wss = new WebSocketServer({ server: http, verifyClient: ({ origin, req }: { origin: string; req: IncomingMessage }) => websocketIsAuthenticated(origin, req) })
    wss.on('connection', (client: WebSocket) => {
      if (currentState) client.send(JSON.stringify({ type: 'state', state: currentState }))
      client.on('message', (raw) => {
        try {
          const message = JSON.parse(raw.toString())
          if (message.type === 'command' && isControlCommand(message.command)) dispatch(message.command)
        } catch { /* ignore malformed clients */ }
      })
    })
    await new Promise<void>((resolve, reject) => { http!.once('error', reject); http!.listen(remotePort, '0.0.0.0', resolve) })
    status = { running: true, oscPort, remotePort, addresses: localAddresses(remotePort), token }
  } catch (error) {
    await stopInternal()
    status = { running: false, oscPort, remotePort, addresses: [], token, error: error instanceof Error ? error.message : String(error) }
  }
  publishStatus()
  return status
}

export function startNetworkControl(oscPort: number, remotePort: number, token: string): Promise<NetworkControlStatus> {
  transition = transition.then(() => startInternal(oscPort, remotePort, token), () => startInternal(oscPort, remotePort, token))
  return transition
}

export function stopNetworkControl(): Promise<NetworkControlStatus> {
  transition = transition.then(stopInternal, stopInternal)
  return transition
}
