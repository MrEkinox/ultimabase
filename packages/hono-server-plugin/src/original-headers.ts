import type { HttpOriginalHeader } from '@ultimabase/http-plugin'

const readProperty = (value: unknown, key: PropertyKey): unknown => {
	if (
		(typeof value !== 'object' || value === null) &&
		typeof value !== 'function'
	) {
		return undefined
	}
	try {
		return Reflect.get(value, key)
	} catch {
		return undefined
	}
}

/** @internal Captures Node's ordered raw header pairs without consulting Fetch Headers. */
export const readNodeOriginalHeaders = (
	environment: unknown,
): readonly HttpOriginalHeader[] => {
	const incoming = readProperty(environment, 'incoming')
	const rawHeaders = readProperty(incoming, 'rawHeaders')
	if (!Array.isArray(rawHeaders) || rawHeaders.length % 2 !== 0) {
		return []
	}

	const headers: HttpOriginalHeader[] = []
	for (let index = 0; index < rawHeaders.length; index += 2) {
		const name: unknown = rawHeaders[index]
		const value: unknown = rawHeaders[index + 1]
		if (typeof name !== 'string' || typeof value !== 'string') {
			return []
		}
		headers.push([name, value])
	}
	return headers
}

/** @internal Reads the socket peer address Node exposes for the request. */
export const readNodeRemoteAddress = (
	environment: unknown,
): string | undefined => {
	const incoming = readProperty(environment, 'incoming')
	const socket = readProperty(incoming, 'socket')
	const address = readProperty(socket, 'remoteAddress')
	return typeof address === 'string' && address.length > 0 ? address : undefined
}
