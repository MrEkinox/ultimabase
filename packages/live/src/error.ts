// A live read's failure (D-154), with the server's code: its `error` event,
// its refusal, or a read the client cannot follow.

/** A live read that failed; it does not reconnect. */
export class LiveError extends Error {
	readonly code: string

	constructor(code: string, message: string) {
		super(message)
		this.name = 'LiveError'
		this.code = code
	}
}
