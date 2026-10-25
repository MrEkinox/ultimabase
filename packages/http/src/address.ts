// A client's address (D-113, D-116): the connection's, or the one the
// proxies in front of the server forwarded.
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

const isNearby = (address: string): boolean =>
	nearby.check(address, isIP(address) === 4 ? 'ipv4' : 'ipv6')

/** The `proxies` option, a whole number; 0 by default. */
export function proxiesOf(option: number | undefined): number {
	const proxies = option ?? 0
	if (Number.isInteger(proxies) && proxies >= 0) return proxies
	throw new Refused(
		`proxies is ${proxies}, not a whole number of proxies in front of the server.`,
	)
}

/**
 * Reads the address of the Node connection a request's `env` holds, `''`
 * without one, or the one `proxies` proxies forwarded.
 */
export function addresses(
	proxies: number,
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
		const forwarded = incoming.headersDistinct['x-forwarded-for']
		if (forwarded === undefined) return connection
		if (proxies === 0) {
			if (!warned && isNearby(connection)) {
				warned = true
				logger.warn(
					`A request came through a proxy (X-Forwarded-For) but httpPlugin({ proxies }) is not set: every client counts as ${connection}. Set it to the number of proxies in front of the server.`,
				)
			}
			return connection
		}
		// Each proxy appended the address it saw: the client's is n from the
		// right. With fewer, the client went around a proxy and wrote them.
		const entries = forwarded
			.flatMap((header) => header.split(','))
			.map((entry) => entry.trim())
		const entry = entries.at(-proxies) ?? ''
		return entries.length < proxies || isIP(entry) === 0 ? connection : entry
	}
}
