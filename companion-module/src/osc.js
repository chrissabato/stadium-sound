const pad = (value) => { const raw = Buffer.from(`${value}\0`); const out = Buffer.alloc((raw.length + 3) & ~3); raw.copy(out); return out }

function encode(address, args = []) {
	const tags = ',' + args.map((arg) => typeof arg === 'string' ? 's' : Number.isInteger(arg) ? 'i' : 'f').join('')
	const values = args.map((arg) => {
		if (typeof arg === 'string') return pad(arg)
		const value = Buffer.alloc(4)
		if (Number.isInteger(arg)) value.writeInt32BE(arg)
		else value.writeFloatBE(arg)
		return value
	})
	return Buffer.concat([pad(address), pad(tags), ...values])
}

function readString(buffer, offset) {
	const end = buffer.indexOf(0, offset)
	return end < 0 ? null : { value: buffer.toString('utf8', offset, end), next: (end + 4) & ~3 }
}

function decode(buffer) {
	const address = readString(buffer, 0); if (!address) return null
	const tags = readString(buffer, address.next); if (!tags) return null
	let offset = tags.next; const args = []
	for (const tag of tags.value.slice(1)) {
		if (tag === 's') { const value = readString(buffer, offset); if (!value) return null; args.push(value.value); offset = value.next }
		else if (tag === 'i') { args.push(buffer.readInt32BE(offset)); offset += 4 }
		else if (tag === 'f') { args.push(buffer.readFloatBE(offset)); offset += 4 }
	}
	return { address: address.value, args }
}

module.exports = { encode, decode }
