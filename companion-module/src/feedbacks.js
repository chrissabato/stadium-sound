module.exports = function (self) {
	self.setFeedbackDefinitions({
		playing: { name: 'Track is playing', type: 'boolean', defaultStyle: { bgcolor: 0x15803d, color: 0xffffff }, options: [{ id: 'trackId', type: 'textinput', label: 'Track ID', default: '' }], callback: (e) => self.state.playing === e.options.trackId },
		bank: { name: 'Bank is selected', type: 'boolean', defaultStyle: { bgcolor: 0x1d4ed8, color: 0xffffff }, options: [{ id: 'bankId', type: 'textinput', label: 'Bank ID', default: '' }], callback: (e) => self.state.bank === e.options.bankId }
	})
}
