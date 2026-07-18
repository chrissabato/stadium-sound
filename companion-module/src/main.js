const dgram = require('dgram')
const { InstanceBase, Regex, runEntrypoint, InstanceStatus } = require('@companion-module/base')
const { encode, decode } = require('./osc')
const updateActions = require('./actions')
const updateFeedbacks = require('./feedbacks')

class StadiumSoundInstance extends InstanceBase {
	async init(config) { this.config = config; this.state = { playing: '', bank: '', volume: 1 }; this.openSocket(); updateActions(this); updateFeedbacks(this) }
	async destroy() { this.socket?.close(); this.socket = null }
	async configUpdated(config) { this.config = config; this.socket?.close(); this.openSocket() }
	getConfigFields() { return [
		{ type: 'textinput', id: 'host', label: 'Stadium Sound computer IP', width: 8, default: '127.0.0.1', regex: Regex.IP },
		{ type: 'textinput', id: 'port', label: 'OSC UDP port', width: 4, default: '9000', regex: Regex.PORT }
	] }
	openSocket() {
		this.socket = dgram.createSocket('udp4')
		this.socket.on('error', (error) => { this.log('error', error.message); this.updateStatus(InstanceStatus.ConnectionFailure, error.message) })
		this.socket.on('message', (message) => {
			const packet = decode(message); if (!packet) return
			if (packet.address === '/stadium-sound/state/playing') this.state.playing = packet.args[0] || ''
			if (packet.address === '/stadium-sound/state/bank') this.state.bank = packet.args[0] || ''
			if (packet.address === '/stadium-sound/state/volume') this.state.volume = packet.args[0]
			this.checkFeedbacks('playing', 'bank')
		})
		this.socket.bind(0, () => { this.updateStatus(InstanceStatus.Ok); this.sendOsc('/stadium-sound/state/subscribe') })
	}
	sendOsc(address, args = []) { this.socket?.send(encode(address, args), Number(this.config.port || 9000), this.config.host || '127.0.0.1') }
}

runEntrypoint(StadiumSoundInstance, [])
