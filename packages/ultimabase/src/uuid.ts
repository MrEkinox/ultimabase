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
	const stamp = time.toString(16).padStart(12, '0')
	const count = counter.toString(16).padStart(3, '0')
	// A v4's last 62 bits are random as a v7's are, and Node draws them from a
	// block of entropy it keeps, where 16 bytes of our own each cost a native call.
	return `${stamp.slice(0, 8)}-${stamp.slice(8)}-7${count}${crypto.randomUUID().slice(18)}`
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
