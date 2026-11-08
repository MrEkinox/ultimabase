import type { Client } from 'ultimabase'

const unset = () => {
	throw new Error('A cookie is set over HTTP: a WebSocket cannot set one.')
}

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
	return { get: (name) => cookies.get(name), set: unset, clear: unset }
}
