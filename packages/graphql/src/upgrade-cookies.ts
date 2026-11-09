import type { Client } from 'ultimabase'
import { PublicError } from 'ultimabase'

const unset = () => {
	throw new PublicError('BAD_REQUEST', 'A WebSocket cannot set a cookie.')
}
const unsettable = { settable: false, set: unset, clear: unset }

/** The upgrade request's cookies, which a WebSocket cannot set. */
export function cookiesOf(request: Request): Client['cookies'] {
	const cookies = new Map<string, string>()
	for (const part of (request.headers.get('cookie') ?? '').split(';')) {
		const at = part.indexOf('=')
		if (at <= 0) continue
		const name = part.slice(0, at).trim()
		if (cookies.has(name)) continue
		try {
			cookies.set(name, decodeURIComponent(part.slice(at + 1).trim()))
		} catch {
			// A value that is no URI component is no cookie this API wrote.
		}
	}
	return { ...unsettable, get: (name) => cookies.get(name) }
}
