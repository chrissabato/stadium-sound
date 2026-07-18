module.exports = function (self) {
	const send = (path, args) => self.sendOsc(`/stadium-sound${path}`, args)
	const tracks = self.catalog?.banks?.flatMap((bank) => bank.tracks.map((track) => ({ id: track.id, label: `${bank.name}: ${track.title || 'Untitled'}${track.artist ? ` — ${track.artist}` : ''}` }))) || []
	const banks = self.catalog?.banks?.map((bank) => ({ id: bank.id, label: bank.name })) || []
	const trackOption = tracks.length ? { id: 'trackId', type: 'dropdown', label: 'Track', default: tracks[0].id, choices: tracks } : { id: 'trackId', type: 'textinput', label: 'Track ID', default: '' }
	const bankOption = banks.length ? { id: 'bank', type: 'dropdown', label: 'Bank', default: banks[0].id, choices: banks } : { id: 'bank', type: 'textinput', label: 'Bank ID, name, or one-based number', default: '1' }
	self.setActionDefinitions({
		play: { name: 'Play track', options: [trackOption], callback: (e) => send('/track/play', [String(e.options.trackId)]) },
		bank: { name: 'Select bank', options: [bankOption], callback: (e) => { const value = String(e.options.bank); send('/bank/select', [/^\d+$/.test(value) ? Number(value) : value]) } },
		stop: { name: 'Stop immediately', options: [], callback: () => send('/stop') },
		fade: { name: 'Stop with fade', options: [], callback: () => send('/fade') },
		random: { name: 'Play random unplayed track', options: [], callback: () => send('/random') },
		volume: { name: 'Set master volume', options: [{ id: 'volume', type: 'number', label: 'Volume (%)', default: 100, min: 0, max: 100 }], callback: (e) => send('/volume', [Number(e.options.volume) / 100]) }
	})
}
