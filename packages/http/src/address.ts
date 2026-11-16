// A client's address (D-113, D-116, D-405): the connection's, the one the
// proxies in front of the server forwarded, or the one its platform sets.
import { IncomingMessage } from 'node:http'
import { BlockList, isIP } from 'node:net'
import type { Logger } from 'ultimabase'
import { Refused } from 'ultimabase'

// Where a proxy in front of the server connects from.
const nearby = new BlockList()
for (const [network, prefix] of [
	['127.0.0.0', 8],
	['10.0.0.0', 8],
	['172.16.0.0', 12],
	['192.168.0.0', 16],
	['100.64.0.0', 10],
] as const) {
	nearby.addSubnet(network, prefix, 'ipv4')
}
for (const [network, prefix] of [
	['::1', 128],
	['fc00::', 7],
	['fe80::', 10],
] as const) {
	nearby.addSubnet(network, prefix, 'ipv6')
}

/** Whether an address is local or private, as a proxy's often is. */
export const isNearby = (address: string): boolean =>
	nearby.check(address, isIP(address) === 4 ? 'ipv4' : 'ipv6')

/**
 * Whether `origin` is the server's own: the host the request was sent to,
 * over any scheme, as a proxy serving HTTPS forwards it over HTTP (D-223).
 */
export const isOwnOrigin = (origin: string, url: string): boolean =>
	URL.canParse(origin) && new URL(origin).host === new URL(url).host

/** Where a client's address is read: `proxies` or one header (D-405). */
export interface Source {
	readonly proxies: number
	/** Lower-cased, read alone when set. */
	readonly header: string | undefined
}

// A header name, a token of RFC 9110.
const token = /^[!#$%&'*+\-.^_`|~\w]+$/

/**
 * The `proxies` option, a whole number, 0 by default, or the
 * `addressHeader` option, a header name other than `X-Forwarded-For`; not
 * both.
 */
export function sourceOf(options: {
	readonly proxies?: number
	readonly addressHeader?: string | undefined
}): Source {
	const proxies = options.proxies ?? 0
	if (!Number.isInteger(proxies) || proxies < 0) {
		throw new Refused(
			`proxies is ${proxies}, not a whole number of proxies in front of the server.`,
		)
	}
	const named = options.addressHeader
	if (named === undefined) return { proxies, header: undefined }
	if (!token.test(named)) {
		throw new Refused(`addressHeader is "${named}", not a header name.`)
	}
	const header = named.toLowerCase()
	if (header === 'x-forwarded-for') {
		throw new Refused(
			'addressHeader is X-Forwarded-For, which a client writes into: set proxies instead.',
		)
	}
	if (proxies > 0) {
		throw new Refused(
			'proxies and addressHeader are both set: set the one the hosting needs.',
		)
	}
	return { proxies, header }
}

// An entry with the port a proxy may append: `1.2.3.4:5`, `[::1]:5` (D-348).
const withPort = /^\[(.+)\](?::\d+)?$|^([\d.]+):\d+$/

/**
 * Reads the address of the Node connection a request's `env` holds, `''`
 * without one, the one `proxies` proxies forwarded, or the one `header`
 * holds.
 */
export function addresses(
	{ proxies, header }: Source,
	logger: Logger,
): (env: unknown) => string {
	let warned = false
	return (env) => {
		const incoming: unknown =
			typeof env === 'object' && env !== null
				? Reflect.get(env, 'incoming')
				: undefined
		if (!(incoming instanceof IncomingMessage)) return ''
		const connection = incoming.socket.remoteAddress ?? ''
		if (header !== undefined) {
			// The platform writes it over the client's: one address, or none.
			const entry = (incoming.headersDistinct[header] ?? [])
				.join(',')
				.trim()
				.replace(withPort, '$1$2')
			if (isIP(entry) !== 0) return entry
			if (!warned) {
				warned = true
				logger.warn(
					`A request has no single address in ${header}: it counts as ${connection}. Check that the platform in front of the server sets this header.`,
				)
			}
			return connection
		}
		const forwarded = incoming.headersDistinct['x-forwarded-for']
		if (forwarded === undefined) return connection
		if (proxies === 0) {
			if (!warned && isNearby(connection)) {
				warned = true
				logger.warn(
					`A request came through a proxy (X-Forwarded-For) but neither httpPlugin({ proxies }) nor httpPlugin({ addressHeader }) is set: every client counts as ${connection}. Set proxies to the number of proxies in front of the server, or addressHeader to the header its platform sets with the client's address.`,
				)
			}
			return connection
		}
		// Each proxy appended the address it saw: the client's is n from the
		// right. With fewer, the client went around a proxy and wrote them.
		const entries = forwarded
			.flatMap((each) => each.split(','))
			.map((entry) => entry.trim().replace(withPort, '$1$2'))
		const entry = entries.at(-proxies) ?? ''
		return entries.length < proxies || isIP(entry) === 0 ? connection : entry
	}
}
