import { BrowserWindow } from 'electron'
import { createServer, type Server } from 'http'
import { networkInterfaces } from 'os'
import { createSocket, type Socket, type RemoteInfo } from 'dgram'
import { WebSocketServer, type WebSocket } from 'ws'

export type ControlCommand =
  | { type: 'play'; trackId: string }
  | { type: 'selectBank'; bank: string | number }
  | { type: 'stop' }
  | { type: 'fade' }
  | { type: 'random' }
  | { type: 'volume'; value: number }

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
  error?: string
}

let udp: Socket | null = null
let http: Server | null = null
let wss: WebSocketServer | null = null
let currentState: RemoteState | null = null
let status: NetworkControlStatus = { running: false, oscPort: 9000, remotePort: 9001, addresses: [] }
const oscPeers = new Map<string, { address: string; port: number }>()

function window(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

function dispatch(command: ControlCommand): void {
  window()?.webContents.send('network:command', command)
}

function localAddresses(port: number): string[] {
  const result: string[] = []
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) result.push(`http://${entry.address}:${port}`)
    }
  }
  return result
}

function readOscString(buffer: Buffer, offset: number): { value: string; next: number } | null {
  const end = buffer.indexOf(0, offset)
  if (end < 0) return null
  return { value: buffer.toString('utf8', offset, end), next: (end + 4) & ~3 }
}

function parseOsc(buffer: Buffer): { address: string; args: Array<string | number> } | null {
  const address = readOscString(buffer, 0)
  if (!address?.value.startsWith('/')) return null
  const tags = readOscString(buffer, address.next)
  if (!tags?.value.startsWith(',')) return null
  let offset = tags.next
  const args: Array<string | number> = []
  for (const tag of tags.value.slice(1)) {
    if (tag === 'i' && offset + 4 <= buffer.length) { args.push(buffer.readInt32BE(offset)); offset += 4 }
    else if (tag === 'f' && offset + 4 <= buffer.length) { args.push(buffer.readFloatBE(offset)); offset += 4 }
    else if (tag === 's') { const s = readOscString(buffer, offset); if (!s) return null; args.push(s.value); offset = s.next }
    else return null
  }
  return { address: address.value, args }
}

function paddedString(value: string): Buffer {
  const raw = Buffer.from(`${value}\0`, 'utf8')
  const padded = Buffer.alloc((raw.length + 3) & ~3)
  raw.copy(padded)
  return padded
}

function encodeOsc(address: string, args: Array<string | number>): Buffer {
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

function oscCommand(address: string, args: Array<string | number>): ControlCommand | null {
  const base = '/stadium-sound'
  if (address === `${base}/stop`) return { type: 'stop' }
  if (address === `${base}/fade`) return { type: 'fade' }
  if (address === `${base}/random`) return { type: 'random' }
  if (address === `${base}/track/play` && typeof args[0] === 'string') return { type: 'play', trackId: args[0] }
  if (address === `${base}/bank/select` && (typeof args[0] === 'string' || typeof args[0] === 'number')) return { type: 'selectBank', bank: args[0] }
  if (address === `${base}/volume` && typeof args[0] === 'number') return { type: 'volume', value: args[0] }
  return null
}

function broadcastState(): void {
  if (!currentState) return
  const payload = JSON.stringify({ type: 'state', state: currentState })
  for (const client of wss?.clients ?? []) if (client.readyState === 1) client.send(payload)
  const packets = [
    encodeOsc('/stadium-sound/state/playing', [currentState.playingTrackId ?? '']),
    encodeOsc('/stadium-sound/state/bank', [currentState.selectedBankId]),
    encodeOsc('/stadium-sound/state/volume', [currentState.masterVolume])
  ]
  for (const peer of oscPeers.values()) for (const packet of packets) udp?.send(packet, peer.port, peer.address)
}

function remoteHtml(): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="apple-mobile-web-app-capable" content="yes"><title>Stadium Sound Remote</title><style>
  :root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f8fafc;background:#08111f}*{box-sizing:border-box}body{margin:0;padding:env(safe-area-inset-top) 16px env(safe-area-inset-bottom);min-height:100vh}.top{position:sticky;top:0;background:#08111fee;backdrop-filter:blur(12px);padding:12px 0;z-index:2}.title{display:flex;justify-content:space-between;align-items:center}h1{font-size:20px;margin:0}.status{font-size:12px;color:#94a3b8}.controls{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:12px 0}button,select{touch-action:manipulation;border:1px solid #334155;border-radius:12px;background:#172033;color:#fff;min-height:52px;font-size:16px;font-weight:650}.stop{background:#991b1b}.fade{background:#9a3412}.random{background:#1d4ed8}select{width:100%;padding:0 12px}.volume{display:flex;gap:10px;align-items:center;color:#cbd5e1;font-size:13px}.volume input{flex:1;height:36px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:10px;padding:10px 0}.track{position:relative;min-height:92px;padding:12px;overflow:hidden}.track.playing{background:#166534;border-color:#4ade80}.bar{position:absolute;top:0;left:0;right:0;height:5px}.artist{display:block;color:#94a3b8;font-size:12px;margin-top:5px}.empty{text-align:center;color:#64748b;padding:60px 0}@media(min-width:800px){.grid{grid-template-columns:repeat(5,1fr)}}
  </style></head><body><div class="top"><div class="title"><h1>Stadium Sound</h1><span class="status" id="status">Connecting…</span></div><div class="controls"><button class="stop" data-cmd="stop">STOP</button><button class="fade" data-cmd="fade">Fade</button><button class="random" data-cmd="random">Random</button></div><select id="banks"></select><label class="volume">Volume <input id="volume" type="range" min="0" max="1" step="0.01"></label></div><main class="grid" id="tracks"></main><script>
  let ws,state;const send=(command)=>ws?.readyState===1&&ws.send(JSON.stringify({type:'command',command}));
  const banks=document.getElementById('banks'),volume=document.getElementById('volume'),tracks=document.getElementById('tracks'),status=document.getElementById('status');
  function render(){if(!state)return;const bank=state.banks.find(b=>b.id===state.selectedBankId);banks.innerHTML=state.banks.map(b=>'<option value="'+attr(b.id)+'">'+esc(b.name)+'</option>').join('');banks.value=state.selectedBankId;volume.value=state.masterVolume;tracks.innerHTML=bank?.tracks.map(t=>'<button class="track '+(t.id===state.playingTrackId?'playing':'')+'" data-track="'+attr(t.id)+'">'+(t.colorLabel?'<i class="bar" style="background:'+attr(t.colorLabel)+'"></i>':'')+esc(t.title||'Untitled')+'<span class="artist">'+esc(t.artist||'')+'</span></button>').join('')||'<div class="empty">No tracks in this bank</div>'}
  function esc(s){const d=document.createElement('div');d.textContent=String(s);return d.innerHTML}function attr(s){return esc(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;')}function connect(){ws=new WebSocket('ws://'+location.host);ws.onopen=()=>status.textContent='Connected';ws.onclose=()=>{status.textContent='Reconnecting…';setTimeout(connect,1500)};ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='state'){state=m.state;render()}}}connect();
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(b?.dataset.track)send({type:'play',trackId:b.dataset.track});else if(b?.dataset.cmd)send({type:b.dataset.cmd})});banks.onchange=()=>send({type:'selectBank',bank:banks.value});volume.oninput=()=>send({type:'volume',value:Number(volume.value)});
  </script></body></html>`
}

export function getNetworkControlStatus(): NetworkControlStatus { return status }

export function updateRemoteState(next: RemoteState): void {
  currentState = next
  broadcastState()
}

export async function stopNetworkControl(): Promise<void> {
  const tasks: Promise<void>[] = []
  if (wss) { for (const client of wss.clients) client.close(); wss.close(); wss = null }
  if (http?.listening) tasks.push(new Promise((resolve) => http!.close(() => resolve())))
  if (udp) tasks.push(new Promise((resolve) => udp!.close(() => resolve())))
  http = null; udp = null; oscPeers.clear()
  await Promise.all(tasks)
  status = { ...status, running: false, addresses: [] }
}

export async function startNetworkControl(oscPort: number, remotePort: number): Promise<NetworkControlStatus> {
  await stopNetworkControl()
  status = { running: false, oscPort, remotePort, addresses: [] }
  try {
    udp = createSocket('udp4')
    udp.on('message', (message: Buffer, peer: RemoteInfo) => {
      const parsed = parseOsc(message); if (!parsed) return
      oscPeers.set(`${peer.address}:${peer.port}`, { address: peer.address, port: peer.port })
      const command = oscCommand(parsed.address, parsed.args); if (command) dispatch(command)
    })
    await new Promise<void>((resolve, reject) => { udp!.once('error', reject); udp!.bind(oscPort, '0.0.0.0', resolve) })

    http = createServer((req, res) => {
      if (req.url === '/' || req.url === '/index.html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(remoteHtml()) }
      else { res.writeHead(404); res.end('Not found') }
    })
    wss = new WebSocketServer({ server: http })
    wss.on('connection', (client: WebSocket) => {
      if (currentState) client.send(JSON.stringify({ type: 'state', state: currentState }))
      client.on('message', (raw) => { try { const msg = JSON.parse(raw.toString()); if (msg.type === 'command') dispatch(msg.command) } catch { /* ignore malformed clients */ } })
    })
    await new Promise<void>((resolve, reject) => { http!.once('error', reject); http!.listen(remotePort, '0.0.0.0', resolve) })
    status = { running: true, oscPort, remotePort, addresses: localAddresses(remotePort) }
  } catch (error) {
    await stopNetworkControl()
    status = { running: false, oscPort, remotePort, addresses: [], error: error instanceof Error ? error.message : String(error) }
  }
  return status
}
