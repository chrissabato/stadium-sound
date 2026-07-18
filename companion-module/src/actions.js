module.exports = function (self) {
	const send = (path, args) => self.sendOsc(`/stadium-sound${path}`, args)
	self.setActionDefinitions({
		play: { name: 'Play track', options: [{ id: 'trackId', type: 'textinput', label: 'Track ID', default: '' }], callback: (e) => send('/track/play', [String(e.options.trackId)]) },
		bank: { name: 'Select bank', options: [{ id: 'bank', type: 'textinput', label: 'Bank ID, name, or one-based number', default: '1' }], callback: (e) => { const value = String(e.options.bank); send('/bank/select', [/^\d+$/.test(value) ? Number(value) : value]) } },
		stop: { name: 'Stop immediately', options: [], callback: () => send('/stop') },
		fade: { name: 'Stop with fade', options: [], callback: () => send('/fade') },
		random: { name: 'Play random unplayed track', options: [], callback: () => send('/random') },
		volume: { name: 'Set master volume', options: [{ id: 'volume', type: 'number', label: 'Volume (%)', default: 100, min: 0, max: 100 }], callback: (e) => send('/volume', [Number(e.options.volume) / 100]) }
	})
}
