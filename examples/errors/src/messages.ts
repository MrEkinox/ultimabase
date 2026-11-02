// What a client shows for each code: every code the server may send, its
// plugins' included, and the application's own. A code a plugin adds or
// drops fails typing here.
//#region messages
import type { ErrorCodeOf } from 'ultimabase'
import type { app } from './app.ts'

type Code = ErrorCodeOf<typeof app> | 'OUT_OF_STOCK'

const messages = {
	OUT_OF_STOCK: 'This product is out of stock.',
	ACCESS_DENIED: 'You cannot do this.',
	NOT_FOUND: 'This page does not exist.',
	VALIDATION_FAILED: 'Check the values you entered.',
	UNIQUE_VIOLATION: 'This value is already taken.',
	RELATION_RESTRICTED: 'Other records still use this one.',
	UNAUTHENTICATED: 'Sign in to continue.',
	INVALID_CREDENTIALS: 'Wrong email or password.',
	TOO_MANY_ATTEMPTS: 'Too many attempts: try again later.',
	CONFLICT: 'Someone changed this at the same time: try again.',
	INTERNAL: 'Something went wrong.',
	// From @ultimabase/http.
	BAD_REQUEST: 'Something went wrong.',
	BAD_USER_INPUT: 'Something went wrong.',
	PAYLOAD_TOO_LARGE: 'This is too large.',
	UNAVAILABLE: 'The service is restarting: try again.',
	UNSUPPORTED_MEDIA_TYPE: 'Something went wrong.',
} satisfies Record<Code, string>

const known: ReadonlyMap<string, string> = new Map(Object.entries(messages))

/** The message for a code a response carries, or a generic one. */
export const messageOf = (code: string): string =>
	known.get(code) ?? messages.INTERNAL
//#endregion
