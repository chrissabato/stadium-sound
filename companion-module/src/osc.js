const { encodeOsc, parseOsc } = require('../../src/shared/oscCodec.ts')

function encode(address, args = []) { return encodeOsc(address, args) }
function decode(buffer) { return parseOsc(buffer) }

module.exports = { encode, decode }
