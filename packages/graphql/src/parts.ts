// A socket's messages, sent in parts (D-254). A ping waits behind all a socket
// was given: a slow client reading a big window answers too late, is cut, and
// reads it whole again. Given a part at a time, the socket lets pings through.

/** What sending needs of a socket. */
type Socket = {
	readonly send: (
		data: Buffer,
		options: { readonly binary: false; readonly fin: boolean },
		written: (error?: Error | null) => void,
	) => void
}

/** The bytes of a message a socket is given at once. */
const part = 256 * 1024

/** Sends messages in order; `written` runs once each is, or cannot be, sent. */
export type Parts = {
	readonly send: (data: string, written: () => void) => void
	/** The bytes the socket was not given yet. */
	readonly unsent: () => number
}

/** Sends over `socket`, a part at a time. */
export function inParts(socket: Socket): Parts {
	const queue: { readonly bytes: Buffer; readonly written: () => void }[] = []
	let at = 0
	let unsent = 0
	const next = () => {
		const first = queue[0]
		if (first === undefined) return
		const piece = first.bytes.subarray(at, at + part)
		at += piece.length
		unsent -= piece.length
		const fin = at === first.bytes.length
		socket.send(piece, { binary: false, fin }, (error) => {
			if (error instanceof Error) {
				unsent = 0
				at = 0
				for (const { written } of queue.splice(0)) written()
				return
			}
			if (fin) {
				at = 0
				queue.shift()
				first.written()
			}
			next()
		})
	}
	return {
		send: (data, written) => {
			const bytes = Buffer.from(data)
			unsent += bytes.length
			queue.push({ bytes, written })
			if (queue.length === 1) next()
		},
		unsent: () => unsent,
	}
}
