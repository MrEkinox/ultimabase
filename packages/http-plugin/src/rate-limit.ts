import type { Logger } from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'

import { assertExactOptions } from './definitions.js'
import {
	assertPositiveSafeInteger,
	normalizeHttpRateLimit,
	type HttpRateLimit,
} from './endpoint-limits.js'
import type { OwnedHttpEndpoint } from './route-graph.js'
import {
	readPreparedHeader,
	type PreparedHttpServerRequest,
} from './request-boundary.js'

/**
 * Counts requests for rate limiting. Replace the in-memory default to share
 * counts between processes, for example with Redis `INCR` and `PEXPIREAT`.
 */
export interface HttpRateLimitStore {
	/**
	 * Adds one request to `key` and returns the key's total, this request
	 * included. The key names one window, so it may be forgotten at `expiresAt`
	 * (epoch milliseconds).
	 */
	increment(key: string, expiresAt: number): MaybePromise<number>
}

/** Limits requests per client address (ADR-0323). */
export interface HttpRateLimitOptions {
	/** Applies to every route; routes may add stricter limits. @example { perMinute: 300 } */
	readonly default?: HttpRateLimit
	/** Where counts are kept. @default an in-memory store of this process */
	readonly store?: HttpRateLimitStore
}

/**
 * Proxies whose `X-Forwarded-For` and `X-Forwarded-Proto` headers are trusted:
 * the number of proxy hops in front of the server, or their exact addresses.
 * @example 1
 */
export type HttpTrustProxy = number | readonly string[]

/** @internal The validated rate limiting of one HTTP application. */
export interface NormalizedHttpRateLimit {
	readonly default: HttpRateLimit | undefined
	readonly store: HttpRateLimitStore | undefined
}

const windowMs = 60_000
// The in-memory store forgets expired windows at most once per window.
const createMemoryRateLimitStore = (): HttpRateLimitStore => {
	const counts = new Map<string, { count: number; expiresAt: number }>()
	let nextSweep = 0
	return {
		increment: (key, expiresAt) => {
			const now = Date.now()
			if (now >= nextSweep) {
				for (const [entryKey, entry] of counts) {
					if (entry.expiresAt <= now) counts.delete(entryKey)
				}
				nextSweep = now + windowMs
			}
			const entry = counts.get(key) ?? { count: 0, expiresAt }
			entry.count += 1
			counts.set(key, entry)
			return entry.count
		},
	}
}

// Only the one method HTTP calls is checked; its results are checked per call.
const isHttpRateLimitStore = (value: unknown): value is HttpRateLimitStore =>
	typeof value === 'object' &&
	value !== null &&
	typeof Reflect.get(value, 'increment') === 'function'

/** @internal Validates `rateLimit` before plugin effects. */
export const normalizeHttpRateLimitOptions = (
	value: unknown,
): NormalizedHttpRateLimit => {
	if (value === undefined) {
		return immutableRecord({ default: undefined, store: undefined })
	}
	assertExactOptions(value, ['default', 'store'], 'HTTP plugin rateLimit')
	const store = value.store
	if (store !== undefined && !isHttpRateLimitStore(store)) {
		throw new TypeError(
			'HTTP plugin rateLimit store must have an increment(key, expiresAt) method',
		)
	}
	return immutableRecord({
		default:
			value.default === undefined
				? undefined
				: normalizeHttpRateLimit(
						value.default,
						'HTTP plugin rateLimit default',
					),
		store,
	})
}

// Compares IPv4 clients of a dual-stack socket by their IPv4 form.
const normalizeAddress = (address: string): string => {
	const trimmed = address.trim()
	return trimmed.toLowerCase().startsWith('::ffff:') && trimmed.includes('.')
		? trimmed.slice('::ffff:'.length)
		: trimmed
}

/** @internal Validates `trustProxy` before plugin effects. */
export const normalizeHttpTrustProxy = (
	value: unknown,
): HttpTrustProxy | undefined => {
	if (value === undefined) return undefined
	if (typeof value === 'number') {
		assertPositiveSafeInteger(value, 'HTTP plugin trustProxy')
		return value
	}
	if (
		!isUnknownArray(value) ||
		value.length === 0 ||
		!value.every((item) => typeof item === 'string' && item.trim() !== '')
	) {
		throw new TypeError(
			'HTTP plugin trustProxy must be a hop count or a non-empty array of proxy addresses',
		)
	}
	return immutableArray(value.map((item) => normalizeAddress(String(item))))
}

const readForwardedList = (
	prepared: PreparedHttpServerRequest,
	name: string,
): readonly string[] =>
	prepared.originalHeaders
		.filter(([candidate]) => candidate.toLowerCase() === name)
		.flatMap(([, value]) => value.split(','))
		.map(normalizeAddress)
		.filter((value) => value.length > 0)

// The peer is trusted when it is one of the listed proxies or hops are counted.
const isTrustedPeer = (
	trustProxy: HttpTrustProxy | undefined,
	address: string | undefined,
): boolean =>
	trustProxy !== undefined &&
	(typeof trustProxy === 'number' ||
		(address !== undefined && trustProxy.includes(address)))

/**
 * @internal Resolves the client address: the socket peer, or behind trusted
 * proxies the nearest untrusted `X-Forwarded-For` entry; `undefined` when
 * nothing names the client (ADR-0334).
 */
export const resolveHttpClientAddress = (
	prepared: PreparedHttpServerRequest,
	trustProxy: HttpTrustProxy | undefined,
): string | undefined => {
	const peer =
		prepared.remoteAddress === undefined
			? undefined
			: normalizeAddress(prepared.remoteAddress)
	if (!isTrustedPeer(trustProxy, peer)) return peer
	const forwarded = readForwardedList(prepared, 'x-forwarded-for')
	if (typeof trustProxy === 'number') {
		// Each trusted proxy appends the address it received the request from,
		// so the client is the hop-count-th entry from the end. The socket peer,
		// absent behind a fetch handler, is the nearest proxy and never counts.
		return forwarded[Math.max(0, forwarded.length - trustProxy)] ?? peer
	}
	// Listed proxies are trusted only from a socket peer that is one of them.
	const chain = peer === undefined ? forwarded : [...forwarded, peer]
	const trusted = trustProxy ?? []
	for (let index = chain.length - 1; index >= 0; index -= 1) {
		const address = chain[index]
		if (address !== undefined && !trusted.includes(address)) return address
	}
	return chain[0]
}

const missingClientAddressWarning =
	'An HTTP request has no client address: every such request shares one rate-limit bucket and authentication records no address. Pass the socket peer as remoteAddress from your server provider, or set trustProxy when a proxy names the client in X-Forwarded-For.'
// ADR-0334: a deployment without addresses warns once per process, not per
// request or per application.
let warnedMissingClientAddress = false

/**
 * @internal Resolves the client address and warns the first time this
 * process sees a request without one.
 */
export const resolveHttpClientAddressOrWarn = (
	prepared: PreparedHttpServerRequest,
	trustProxy: HttpTrustProxy | undefined,
	logger: Pick<Logger, 'warn'>,
): string | undefined => {
	const address = resolveHttpClientAddress(prepared, trustProxy)
	if (address === undefined && !warnedMissingClientAddress) {
		warnedMissingClientAddress = true
		logger.warn(missingClientAddressWarning)
	}
	return address
}

/** @internal Tells whether the client reached the edge over HTTPS. */
export const isHttpsRequest = (
	prepared: PreparedHttpServerRequest,
	trustProxy: HttpTrustProxy | undefined,
): boolean => {
	if (new URL(prepared.input.request.url).protocol === 'https:') return true
	const peer =
		prepared.remoteAddress === undefined
			? undefined
			: normalizeAddress(prepared.remoteAddress)
	if (!isTrustedPeer(trustProxy, peer)) return false
	const proto = readPreparedHeader(
		prepared.originalHeaders,
		'X-Forwarded-Proto',
	)
	return proto?.split(',').at(-1)?.trim().toLowerCase() === 'https'
}

/** @internal Names the endpoint whose own limit counts a request. */
export const httpRateLimitKey = (endpoint: OwnedHttpEndpoint): string =>
	endpoint.kind === 'mount'
		? `mount ${endpoint.path}`
		: `${endpoint.method} ${endpoint.path}`

/** @internal Counts one request against each applicable limit. */
export class HttpRateLimiter {
	readonly #default: HttpRateLimit | undefined
	readonly #store: HttpRateLimitStore

	constructor(options: NormalizedHttpRateLimit) {
		this.#default = options.default
		this.#store = options.store ?? createMemoryRateLimitStore()
	}

	/** Tells whether any limit applies to an endpoint with this limit. */
	applies(endpointLimit: HttpRateLimit | undefined): boolean {
		return this.#default !== undefined || endpointLimit !== undefined
	}

	/**
	 * Returns the seconds to wait when a limit is exceeded, else `undefined`.
	 * Every applicable limit counts the request, so a retry cannot skip one.
	 * Clients without an address share one bucket per limit: failing closed
	 * is safer than skipping the limit (ADR-0334).
	 */
	async check(
		client: string | undefined,
		endpoint: Readonly<{
			readonly key: string
			readonly limit: HttpRateLimit | undefined
		}>,
	): Promise<number | undefined> {
		const limits: [string, HttpRateLimit][] = []
		if (this.#default !== undefined) limits.push(['*', this.#default])
		if (endpoint.limit !== undefined) {
			limits.push([endpoint.key, endpoint.limit])
		}
		if (limits.length === 0) return undefined
		const now = Date.now()
		const window = Math.floor(now / windowMs)
		const expiresAt = (window + 1) * windowMs
		let exceeded = false
		for (const [scope, limit] of limits) {
			// An unknown client is `null` in the key, apart from every address.
			const count = await this.#store.increment(
				JSON.stringify([scope, client ?? null, window]),
				expiresAt,
			)
			if (typeof count !== 'number' || !Number.isFinite(count)) {
				throw new TypeError('HTTP rate limit store must return a count')
			}
			if (count > limit.perMinute) exceeded = true
		}
		return exceeded
			? Math.max(1, Math.ceil((expiresAt - now) / 1000))
			: undefined
	}
}
