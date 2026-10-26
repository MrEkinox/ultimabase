// UUIDv7 ids (D-22, RFC 9562): a millisecond timestamp, then a 12-bit counter
// in `rand_a` so that ids made in the same millisecond still sort in order.

let lastTime = 0
let counter = 0

export function uuidv7(): string {
	let time = Date.now()
	if (time > lastTime) {
		lastTime = time
		counter = 0
	} else {
		counter += 1
		if (counter > 0xfff) {
			lastTime += 1
			counter = 0
		}
		time = lastTime
	}
	const bytes = new Uint8Array(16)
	crypto.getRandomValues(bytes)
	for (let index = 5; index >= 0; index -= 1) {
		bytes[index] = time % 256
		time = Math.floor(time / 256)
	}
	bytes[6] = 0x70 | (counter >> 8)
	bytes[7] = counter & 0xff
	bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f)
	const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
	return [
		hex.slice(0, 4),
		hex.slice(4, 6),
		hex.slice(6, 8),
		hex.slice(8, 10),
		hex.slice(10, 16),
	]
		.map((part) => part.join(''))
		.join('-')
}

const made = new WeakMap<object, string>()

/**
 * The id of the row a nested `create` makes from `data`: made once, so its
 * relation's field rule sees it before the row is planned (D-128).
 */
export function madeId(data: object): string {
	const id = made.get(data) ?? uuidv7()
	made.set(data, id)
	return id
}
