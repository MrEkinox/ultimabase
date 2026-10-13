import { UltimaBase, type Logger } from '@ultimabase/core'
import {
	contributeApplication,
	plugin,
	requireCapability,
} from '@ultimabase/core/plugin'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

import {
	httpApplicationCapability,
	type HttpApplication,
} from './application.js'
import { httpContextResolver, provideHttpContextResolvers } from './context.js'
import type { HttpPluginOptions } from './options.js'
import { httpPlugin } from './plugin.js'
import { httpTestDatabasePlugin } from './test-database.test-support.js'

// ADR-0334: an unknown client address is `undefined`, never the string
// 'unknown'. The warning is once per process, so this file keeps its order:
// requests with an address come first.

const requirement = requireCapability(httpApplicationCapability, '^1.0.0', {
	phase: 'setup',
})

const missingAddressWarning =
	'[@ultimabase/http-plugin] An HTTP request has no client address: every such request shares one rate-limit bucket and authentication records no address. Pass the socket peer as remoteAddress from your server provider, or set trustProxy when a proxy names the client in X-Forwarded-For.'

// Starts one application, recording what resolvers see and what is logged.
const start = async (options: HttpPluginOptions) => {
	const seen: (string | undefined)[] = []
	const warn = vi.fn<Logger['warn']>()
	let http: HttpApplication | undefined
	const fixture = plugin({
		id: 'fixture.client-address',
		version: '1.0.0',
		core: '^0.0.0',
		contributions: [
			requirement,
			provideHttpContextResolvers({
				contributionId: 'client-address',
				create: () => [
					httpContextResolver({
						resolve: ({ clientAddress, context }) => {
							seen.push(clientAddress)
							return context
						},
					}),
				],
			}),
			contributeApplication(({ capabilities }) => {
				http = capabilities.get(requirement)
				return { exports: undefined }
			}),
		],
	})
	const application = new (UltimaBase.use(
		httpTestDatabasePlugin(),
		httpPlugin({
			...options,
			routes: { 'GET /ping': () => new Response('pong') },
		}),
		fixture,
	))({
		logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn },
		schemas: [],
	})
	onTestFinished(() => application.dispose())
	await application.start()
	if (http === undefined) throw new TypeError('Missing HTTP application')
	const current = http
	const send = (
		headers: readonly (readonly [string, string])[] = [],
		remoteAddress?: string,
	) => {
		const fetchHeaders = new Headers({ Host: 'localhost' })
		for (const [name, value] of headers) fetchHeaders.append(name, value)
		return current.fetch({
			originalHeaders: [['Host', 'localhost'], ...headers],
			remoteAddress,
			request: new Request('http://localhost/ping', { headers: fetchHeaders }),
		})
	}
	const warnings = () =>
		warn.mock.calls.filter(([message]) => message === missingAddressWarning)
	return { application, seen, send, warnings }
}

describe('a request with a client address', () => {
	it('keeps the peer or the trusted forwarded entry, without a warning', async () => {
		const direct = await start({ rateLimit: { default: { perMinute: 1 } } })
		expect((await direct.send([], '::ffff:203.0.113.1')).status).toBe(200)
		expect((await direct.send([], '203.0.113.1')).status).toBe(429)
		expect((await direct.send([], '203.0.113.2')).status).toBe(200)
		expect(direct.seen).toStrictEqual(['203.0.113.1', '203.0.113.2'])
		expect(direct.warnings()).toStrictEqual([])
		await direct.application.dispose()

		const proxied = await start({ trustProxy: 1 })
		await proxied.send([['X-Forwarded-For', '198.51.100.7']])
		expect(proxied.seen).toStrictEqual(['198.51.100.7'])
		expect(proxied.warnings()).toStrictEqual([])
	})
})

describe('a request without a client address', () => {
	it('warns once per process, not per request or per application', async () => {
		const first = await start({})
		await first.send()
		await first.send()
		expect(first.warnings()).toHaveLength(1)
		await first.application.dispose()
		const second = await start({ trustProxy: 1 })
		await second.send()
		expect(second.warnings()).toStrictEqual([])
	})

	it('gives resolvers undefined, never the string unknown', async () => {
		const bare = await start({})
		// Without trustProxy a forwarded entry never names the client.
		await bare.send([['X-Forwarded-For', '198.51.100.7']])
		await bare.application.dispose()
		// One hop is trusted, but there is no forwarded entry and no peer.
		const hops = await start({ trustProxy: 1 })
		await hops.send()
		await hops.send([['X-Forwarded-For', ' , ']])
		expect([...bare.seen, ...hops.seen]).toStrictEqual([
			undefined,
			undefined,
			undefined,
		])
		// The process already warned.
		expect([...bare.warnings(), ...hops.warnings()]).toStrictEqual([])
	})

	it('shares one rate-limit bucket per limit, apart from known clients', async () => {
		const { send } = await start({ rateLimit: { default: { perMinute: 2 } } })
		vi.useFakeTimers({ toFake: ['Date'] })
		onTestFinished(() => {
			vi.useRealTimers()
		})
		vi.setSystemTime(Math.ceil(Date.now() / 60_000) * 60_000)
		expect((await send()).status).toBe(200)
		expect((await send([['X-Forwarded-For', '192.0.2.1']])).status).toBe(200)
		expect((await send([['X-Forwarded-For', '192.0.2.2']])).status).toBe(429)
		// The shared bucket is not the bucket of a client named 'unknown'.
		expect((await send([], 'unknown')).status).toBe(200)
		expect((await send([], '203.0.113.1')).status).toBe(200)
	})
})
