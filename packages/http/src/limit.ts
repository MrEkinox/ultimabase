// The limit on each client address's requests (D-218): counted in the
// instance's memory, before the gates, the caller and the routes.
import ipaddr from 'ipaddr.js'
import type { Caller, Logger } from 'ultimabase'
import { Refused } from 'ultimabase'
import { masterKeyHeader } from 'ultimabase/internal'
import { isNearby } from './address.ts'

/** How many requests an address sends in a window, in milliseconds. */
export interface RateLimit {
	readonly requests: number
	readonly window: number
}

/**
 * Counts a request: the seconds until its address may send again when it is
 * over the limit, `undefined` when it is within it.
 */
export type Limiter = (
	request: Request,
	address: string,
) => Promise<number | undefined>

/** The 429 of a request over the limit, `seconds` before the window ends. */
export const tooMany = (seconds: number): Response =>
	Response.json(
		{
			code: 'TOO_MANY_ATTEMPTS',
			message: 'Too many requests: try again later.',
			details: { retryAfter: seconds },
		},
		{ status: 429, headers: { 'retry-after': String(seconds) } },
	)

/**
 * An IPv6 client holds a whole /64: it counts as one, as the `password`
 * plugin counts it (D-114).
 */
function networkOf(address: string): string {
	if (!ipaddr.IPv6.isValid(address)) return address
	const ip = ipaddr.IPv6.parse(address)
	if (ip.isIPv4MappedAddress()) return ip.toIPv4Address().toString()
	const prefix = ip.parts.slice(0, 4).map((group) => group.toString(16))
	return `${prefix.join(':')}::/64`
}

/** The `rateLimit` option; 600 requests a minute by default. */
function limitOf(option: RateLimit | false | undefined): RateLimit | false {
	const limit = option ?? { requests: 600, window: 60_000 }
	if (limit === false) return false
	for (const [name, value] of Object.entries(limit)) {
		if (!Number.isInteger(value) || value < 1) {
			throw new Refused(
				`rateLimit.${name} is ${String(value)}, not a whole number above 0.`,
			)
		}
	}
	return limit
}

/**
 * Counts each address's requests in a window that every address shares, and
 * refuses those over the limit, but Master's until a wrong key. A private or
 * local address is never counted: a proxy or load balancer connects from one.
 */
export function limiter(
	option: RateLimit | false | undefined,
	identify: (request: Request) => Promise<Caller>,
	logger: Logger,
): Limiter {
	const limit = limitOf(option)
	const counts = new Map<string, number>()
	const guessed = new Set<string>()
	let ends = 0
	return async (request, address) => {
		if (limit === false || address === '' || isNearby(address)) {
			return undefined
		}
		const now = Date.now()
		if (now >= ends) {
			counts.clear()
			guessed.clear()
			ends = now + limit.window
		}
		const network = networkOf(address)
		const count = (counts.get(network) ?? 0) + 1
		counts.set(network, count)
		if (count <= limit.requests) return undefined
		// The master key costs no database read, unlike a session (D-348).
		if (request.headers.has(masterKeyHeader) && !guessed.has(network)) {
			const caller = await identify(request).catch(() => undefined)
			if (caller?.kind === 'master') return undefined
			guessed.add(network)
		}
		if (count === limit.requests + 1) {
			logger.warn(
				`${network} sent over ${limit.requests} requests in ${limit.window} ms: refused until the window ends.`,
			)
		}
		return Math.ceil((ends - now) / 1000)
	}
}
