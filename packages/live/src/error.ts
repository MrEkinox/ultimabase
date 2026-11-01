// A live read's failure (D-154), with the server's code and details: its
// `error` event, its refusal, or a read the client cannot follow.
import { isRecord } from './guards.ts'

/** What the server tells of a failure, such as `{ limit, rows }` (D-186). */
export type LiveErrorDetails = { readonly [key: string]: unknown }

/** A live read that failed; it does not reconnect. */
export class LiveError extends Error {
	readonly code: string
	readonly details?: LiveErrorDetails

	constructor(code: string, message: string, details?: LiveErrorDetails) {
		super(message)
		this.name = 'LiveError'
		this.code = code
		if (details !== undefined) this.details = details
	}
}

/**
 * The server's `{ code, message, details }`, as a `LiveError`, or
 * `fallback` when it is not one.
 */
export function liveErrorOf(error: unknown, fallback: LiveError): LiveError {
	const { code, message, details } = isRecord(error) ? error : {}
	if (typeof code !== 'string' || typeof message !== 'string') return fallback
	return new LiveError(code, message, isRecord(details) ? details : undefined)
}
