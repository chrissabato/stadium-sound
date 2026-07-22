const dgram = require('dgram')
const { InstanceBase, Regex, InstanceStatus } = require('@companion-module/base')
const { encode, decode } = require('./osc')
const updateActions = require('./actions')
const updateFeedbacks = require('./feedbacks')

class StadiumSoundInstance extends InstanceBase {
	async init(config) { this.config = config; this.state = { playing: '', bank: '', volume: 1 }; this.catalog = { banks: [] }; this.openSocket(); updateActions(this); updateFeedbacks(this) }
	async destroy() { clearInterval(this.pollTimer); this.socket?.close(); this.socket = null }
	async configUpdated(config) { this.config = config; clearInterval(this.pollTimer); this.socket?.close(); this.openSocket() }
	getConfigFields() { return [
		{ type: 'textinput', id: 'host', label: 'Stadium Sound computer IP', width: 8, default: '127.0.0.1', regex: Regex.IP },
		{ type: 'textinput', id: 'port', label: 'OSC UDP port', width: 4, default: '9000', regex: Regex.PORT },
		{ type: 'textinput', id: 'remotePort', label: 'Remote web port', width: 4, default: '9001', regex: Regex.PORT },
		{ type: 'textinput', id: 'token', label: 'Pairing token (from the remote URL)', width: 12, default: '' }
	] }
	openSocket() {
		this.updateStatus(InstanceStatus.Connecting)
		this.socket = dgram.createSocket('udp4')
		this.socket.on('error', (error) => { this.log('error', error.message); this.updateStatus(InstanceStatus.ConnectionFailure, error.message) })
		this.socket.on('message', (message) => {
			const packet = decode(message); if (!packet) return
			if (packet.address === '/stadium-sound/state/playing') this.state.playing = packet.args[0] || ''
			if (packet.address === '/stadium-sound/state/bank') this.state.bank = packet.args[0] || ''
			if (packet.address === '/stadium-sound/state/volume') this.state.volume = packet.args[0]
			this.checkFeedbacks('playing', 'bank')
		})
		this.socket.bind(0, () => {
			this.refreshState()
			this.pollTimer = setInterval(() => this.refreshState(), 3000)
		})
	}
	sendOsc(address, args = []) { this.socket?.send(encode(address, args), Number(this.config.port || 9000), this.config.host || '127.0.0.1') }
	async refreshState() {
		this.sendOsc('/stadium-sound/state/subscribe')
		try {
			const url = `http://${this.config.host || '127.0.0.1'}:${Number(this.config.remotePort || 9001)}/api/state?token=${encodeURIComponent(this.config.token || '')}`
			const response = await fetch(url, { signal: AbortSignal.timeout(2000) })
			if (!response.ok) throw new Error(`HTTP ${response.status}`)
			const state = await response.json()
			this.state.playing = state.playingTrackId || ''
			this.state.bank = state.selectedBankId || ''
			this.state.volume = state.masterVolume
			const signature = JSON.stringify(state.banks || [])
			if (signature !== this.catalogSignature) { this.catalogSignature = signature; this.catalog = { banks: state.banks || [] }; updateActions(this) }
			this.checkFeedbacks('playing', 'bank')
			this.updateStatus(InstanceStatus.Ok)
		} catch (error) {
			this.updateStatus(InstanceStatus.ConnectionFailure, `No authenticated response: ${error.message}`)
		}
	}
}

// @companion-module/base v2 dropped runEntrypoint() — the host process now
// imports this file and instantiates the default export itself.
module.exports = StadiumSoundInstance
