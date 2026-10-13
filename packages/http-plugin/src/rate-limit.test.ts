import { describe, expect, it } from 'vitest'

import {
	isHttpsRequest,
	resolveHttpClientAddress,
	type HttpTrustProxy,
} from './rate-limit.js'
import { prepareHttpServerRequest } from './request-boundary.js'

// Builds one prepared request; `peer` is the socket peer, absent behind a
// fetch handler (edge or serverless runtimes, in-memory `fetch()`).
const prepared = (
	headers: readonly (readonly [string, string])[],
	peer?: string,
	url = 'http://localhost/ping',
) => {
	const fetchHeaders = new Headers()
	for (const [name, value] of headers) fetchHeaders.append(name, value)
	return prepareHttpServerRequest({
		originalHeaders: headers,
		remoteAddress: peer,
		request: new Request(url, { headers: fetchHeaders }),
	})
}

const clientOf = (
	trustProxy: HttpTrustProxy | undefined,
	forwardedFor: string | undefined,
	peer?: string,
): string =>
	resolveHttpClientAddress(
		prepared(
			forwardedFor === undefined ? [] : [['X-Forwarded-For', forwardedFor]],
			peer,
		),
		trustProxy,
	)

describe('client address behind a hop count', () => {
	it('takes the entry the outermost trusted proxy appended, with a socket peer', () => {
		expect(clientOf(1, '192.0.2.66, 198.51.100.50', '10.0.0.1')).toBe(
			'198.51.100.50',
		)
		expect(clientOf(2, '192.0.2.66, 198.51.100.50, 10.0.0.2', '10.0.0.1')).toBe(
			'198.51.100.50',
		)
	})

	it('takes the same entry without a socket peer, whatever a client prepends', () => {
		expect(clientOf(1, '198.51.100.50')).toBe('198.51.100.50')
		expect(clientOf(1, '192.0.2.66, 198.51.100.50')).toBe('198.51.100.50')
		expect(clientOf(1, '192.0.2.1, 192.0.2.2, 198.51.100.50')).toBe(
			'198.51.100.50',
		)
		expect(clientOf(2, '192.0.2.66, 198.51.100.50, 10.0.0.2')).toBe(
			'198.51.100.50',
		)
	})

	it('reads repeated X-Forwarded-For headers as one list', () => {
		const request = prepared([
			['X-Forwarded-For', '192.0.2.66'],
			['X-Forwarded-For', '198.51.100.50'],
		])
		expect(resolveHttpClientAddress(request, 1)).toBe('198.51.100.50')
	})

	it('falls back to the socket peer, then undefined, without forwarded entries', () => {
		expect(clientOf(1, undefined, '::ffff:10.0.0.1')).toBe('10.0.0.1')
		expect(clientOf(1, undefined)).toBeUndefined()
		expect(clientOf(1, ' , ')).toBeUndefined()
	})

	it('keeps the farthest entry when there are fewer entries than hops', () => {
		expect(clientOf(3, '198.51.100.50, 10.0.0.2', '10.0.0.1')).toBe(
			'198.51.100.50',
		)
		expect(clientOf(3, '198.51.100.50, 10.0.0.2')).toBe('198.51.100.50')
	})
})

describe('client address behind listed proxies', () => {
	const proxies = ['10.0.0.1', '10.0.0.2'] as const

	it('takes the nearest untrusted entry from a listed socket peer', () => {
		expect(clientOf(proxies, '192.0.2.66, 198.51.100.50', '10.0.0.1')).toBe(
			'198.51.100.50',
		)
		expect(
			clientOf(proxies, '192.0.2.66, 198.51.100.50, 10.0.0.2', '10.0.0.1'),
		).toBe('198.51.100.50')
		expect(clientOf(proxies, undefined, '10.0.0.1')).toBe('10.0.0.1')
	})

	it('ignores X-Forwarded-For from an unlisted or unknown peer', () => {
		expect(clientOf(proxies, '192.0.2.66', '203.0.113.50')).toBe('203.0.113.50')
		// Without a socket peer nothing proves a listed proxy sent the header.
		expect(clientOf(proxies, '192.0.2.66, 198.51.100.50')).toBeUndefined()
	})
})

describe('client address without trustProxy', () => {
	it('is the socket peer, never a forwarded entry', () => {
		expect(clientOf(undefined, '192.0.2.66', '203.0.113.50')).toBe(
			'203.0.113.50',
		)
		expect(clientOf(undefined, '192.0.2.66')).toBeUndefined()
	})
})

describe('HTTPS behind proxies', () => {
	const proto = (
		trustProxy: HttpTrustProxy | undefined,
		value: string,
		peer?: string,
	) =>
		isHttpsRequest(prepared([['X-Forwarded-Proto', value]], peer), trustProxy)

	it('believes the nearest X-Forwarded-Proto value from trusted proxies only', () => {
		expect(proto(1, 'http, https', '10.0.0.1')).toBe(true)
		expect(proto(1, 'https, http', '10.0.0.1')).toBe(false)
		expect(proto(1, 'https')).toBe(true)
		expect(proto(['10.0.0.1'], 'https', '10.0.0.1')).toBe(true)
		expect(proto(['10.0.0.1'], 'https', '203.0.113.50')).toBe(false)
		expect(proto(['10.0.0.1'], 'https')).toBe(false)
		expect(proto(undefined, 'https', '10.0.0.1')).toBe(false)
		expect(
			isHttpsRequest(prepared([], undefined, 'https://localhost/ping'), 1),
		).toBe(true)
	})
})
