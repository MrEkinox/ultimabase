import { UltimaBase } from '@ultimabase/core'
import {
	contributeApplication,
	plugin,
	requireCapability,
	type PluginDefinition,
} from '@ultimabase/core/plugin'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

import {
	httpApplicationCapability,
	type HttpApplication,
} from './application.js'
import { httpMount, provideHttpEndpoints } from './endpoints.js'
import type { HttpPluginOptions } from './options.js'
import { httpPlugin } from './plugin.js'
import type { HttpRateLimitStore } from './rate-limit.js'
import { httpTestDatabasePlugin } from './test-database.test-support.js'

const requirement = requireCapability(httpApplicationCapability, '^1.0.0', {
	phase: 'setup',
})

const silentLogger = () => ({
	debug: vi.fn(),
	error: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
})

// One application per realm: starting the next one disposes the previous.
let previous: Readonly<{ dispose: () => Promise<void> }> | undefined

// Starts one application and returns the provider-facing HTTP application.
const start = async (
	options: HttpPluginOptions,
	plugins: readonly PluginDefinition[] = [],
	logger: ReturnType<typeof silentLogger> = silentLogger(),
): Promise<HttpApplication> => {
	let http: HttpApplication | undefined
	const capture = plugin({
		id: 'fixture.limits-capture',
		version: '1.0.0',
		core: '^0.0.0',
		contributions: [
			requirement,
			contributeApplication(({ capabilities }) => {
				http = capabilities.get(requirement)
				return { exports: undefined }
			}),
		],
	})
	const application = new (UltimaBase.use(
		httpTestDatabasePlugin(),
		httpPlugin(options),
		capture,
		...plugins,
	))({ logger, schemas: [] })
	await previous?.dispose()
	previous = application
	onTestFinished(() => application.dispose())
	await application.start()
	if (http === undefined) throw new TypeError('Missing HTTP application')
	return http
}

// Builds network-shaped input: ordered headers and the socket peer address.
const send = (
	http: HttpApplication,
	path: string,
	options: Readonly<{
		body?: string
		headers?: readonly (readonly [string, string])[]
		method?: string
		remoteAddress?: string
		url?: string
	}> = {},
) => {
	const headers: (readonly [string, string])[] = [
		['Host', 'localhost'],
		...(options.headers ?? []),
	]
	const fetchHeaders = new Headers()
	for (const [name, value] of headers) fetchHeaders.append(name, value)
	return http.fetch({
		originalHeaders: headers,
		remoteAddress: options.remoteAddress,
		request: new Request(`${options.url ?? 'http://localhost'}${path}`, {
			headers: fetchHeaders,
			method: options.method ?? 'GET',
			...(options.body === undefined ? {} : { body: options.body }),
		}),
	})
}

const echo = {
	'POST /echo': async (request: Request) => new Response(await request.text()),
} as const

describe('defaults (ADR-0323 decision 6)', () => {
	it('applies a 30 second deadline unless configured', async () => {
		expect((await start({ health: false })).requestTimeoutMs).toBe(30_000)
		expect(
			(await start({ health: false, requestTimeoutMs: 5 })).requestTimeoutMs,
		).toBe(5)
	})

	it('limits bodies to 1 MiB, the configured size, or the endpoint size', async () => {
		const http = await start({ routes: echo })
		const fits = await send(http, '/echo', {
			body: 'x'.repeat(1_048_576),
			method: 'POST',
		})
		expect(fits.status).toBe(200)
		const tooLarge = await send(http, '/echo', {
			body: 'x'.repeat(1_048_577),
			method: 'POST',
		})
		expect(tooLarge.status).toBe(413)
		expect(await tooLarge.json()).toMatchObject({
			error: {
				code: 'HTTP_PAYLOAD_TOO_LARGE',
				message: 'The HTTP request body is too large.',
			},
		})

		const transport = plugin({
			id: 'fixture.transport-limit',
			version: '1.0.0',
			core: '^0.0.0',
			permissions: { 'transport:expose': 'Mounts a body-limited fixture.' },
			contributions: [
				provideHttpEndpoints({
					contributionId: 'mount',
					create: () =>
						httpMount({
							bodyLimit: 16,
							// A transport that answers 413 itself keeps its own format.
							handle: async (request) => {
								try {
									return new Response(await request.text())
								} catch {
									return new Response('own format', { status: 413 })
								}
							},
							path: '/transport',
							protocol: { name: 'fixture.transport', version: '1' },
						}),
				}),
			],
		})
		const configured = await start({ bodyLimit: 8, routes: echo }, [transport])
		expect(
			(await send(configured, '/echo', { body: '123456789', method: 'POST' }))
				.status,
		).toBe(413)
		const mounted = await send(configured, '/transport', {
			body: '0123456789abcdef',
			method: 'POST',
		})
		expect(await mounted.text()).toBe('0123456789abcdef')
		const ownFormat = await send(configured, '/transport', {
			body: '0123456789abcdefg',
			method: 'POST',
		})
		expect(ownFormat.status).toBe(413)
		expect(await ownFormat.text()).toBe('own format')
		expect(() => httpPlugin({ bodyLimit: 0 })).toThrow(
			'HTTP plugin bodyLimit must be a positive safe integer',
		)
	})

	it('adds security headers, HSTS only on HTTPS, and keeps handler values', async () => {
		const http = await start({
			routes: {
				'GET /framed': () =>
					new Response('framed', {
						headers: { 'X-Frame-Options': 'SAMEORIGIN' },
					}),
			},
		})
		const plain = await send(http, '/health')
		expect(plain.headers.get('X-Content-Type-Options')).toBe('nosniff')
		expect(plain.headers.get('X-Frame-Options')).toBe('DENY')
		expect(plain.headers.has('Strict-Transport-Security')).toBe(false)
		const secure = await send(http, '/health', { url: 'https://localhost' })
		expect(secure.headers.get('Strict-Transport-Security')).toBe(
			'max-age=31536000; includeSubDomains',
		)
		expect((await send(http, '/framed')).headers.get('X-Frame-Options')).toBe(
			'SAMEORIGIN',
		)
		const rejected = await send(http, '/missing')
		expect(rejected.status).toBe(404)
		expect(rejected.headers.get('X-Content-Type-Options')).toBe('nosniff')
	})

	it('trusts X-Forwarded-Proto only from trusted proxies and honors options', async () => {
		const forwarded = [['X-Forwarded-Proto', 'https']] as const
		const direct = await start({})
		expect(
			(await send(direct, '/health', { headers: forwarded })).headers.has(
				'Strict-Transport-Security',
			),
		).toBe(false)
		const proxied = await start({
			securityHeaders: {
				frameOptions: 'SAMEORIGIN',
				hsts: { includeSubDomains: false, maxAgeSeconds: 60 },
			},
			trustProxy: ['10.0.0.1'],
		})
		const behindProxy = await send(proxied, '/health', {
			headers: forwarded,
			remoteAddress: '::ffff:10.0.0.1',
		})
		expect(behindProxy.headers.get('Strict-Transport-Security')).toBe(
			'max-age=60',
		)
		expect(behindProxy.headers.get('X-Frame-Options')).toBe('SAMEORIGIN')
		const none = await start({ securityHeaders: false })
		const bare = await send(none, '/health', { url: 'https://localhost' })
		expect(bare.headers.has('X-Content-Type-Options')).toBe(false)
		expect(bare.headers.has('Strict-Transport-Security')).toBe(false)
		expect(() =>
			httpPlugin({ securityHeaders: { frameOptions: 'ALLOW' } as never }),
		).toThrow("frameOptions must be 'DENY', 'SAMEORIGIN' or false")
	})
})

describe('rate limiting by client address (ADR-0323 decision 7)', () => {
	const limited = { default: { perMinute: 2 } } as const
	const ping = { 'GET /ping': () => new Response('pong') } as const

	it('counts each socket address separately and answers 429 with Retry-After', async () => {
		const http = await start({ rateLimit: limited, routes: ping })
		const from = (remoteAddress: string) =>
			send(http, '/ping', { remoteAddress })
		expect((await from('203.0.113.1')).status).toBe(200)
		expect((await from('203.0.113.1')).status).toBe(200)
		const third = await from('203.0.113.1')
		expect(third.status).toBe(429)
		expect(Number(third.headers.get('Retry-After'))).toBeGreaterThan(0)
		expect(await third.json()).toMatchObject({
			error: { code: 'HTTP_RATE_LIMITED' },
		})
		expect((await from('203.0.113.2')).status).toBe(200)
	})

	// ADR-0323 amendment: probes share one address, so health is never limited.
	it('never limits the built-in health route, wherever it lives', async () => {
		const http = await start({
			health: { path: '/healthz' },
			rateLimit: { default: { perMinute: 1 } },
			routes: ping,
		})
		const probe = () => send(http, '/healthz', { remoteAddress: '10.0.0.9' })
		for (let attempt = 0; attempt < 5; attempt += 1) {
			expect((await probe()).status).toBe(200)
		}
		expect(
			(await send(http, '/ping', { remoteAddress: '10.0.0.9' })).status,
		).toBe(200)
		expect(
			(await send(http, '/ping', { remoteAddress: '10.0.0.9' })).status,
		).toBe(429)
		expect((await probe()).status).toBe(200)
	})

	it('reads the client from X-Forwarded-For behind trusted proxies only', async () => {
		const hops = await start({
			rateLimit: limited,
			routes: ping,
			trustProxy: 1,
		})
		const forwardedFor = (client: string) =>
			send(hops, '/ping', {
				headers: [['X-Forwarded-For', `198.51.100.9, ${client}`]],
				remoteAddress: '10.0.0.1',
			})
		await forwardedFor('192.0.2.1')
		await forwardedFor('192.0.2.1')
		expect((await forwardedFor('192.0.2.1')).status).toBe(429)
		expect((await forwardedFor('192.0.2.2')).status).toBe(200)

		const untrusted = await start({
			rateLimit: limited,
			routes: ping,
			trustProxy: ['10.0.0.1'],
		})
		// A spoofed header from an untrusted peer does not change the client.
		const spoofed = (client: string) =>
			send(untrusted, '/ping', {
				headers: [['X-Forwarded-For', client]],
				remoteAddress: '203.0.113.50',
			})
		await spoofed('192.0.2.1')
		await spoofed('192.0.2.2')
		expect((await spoofed('192.0.2.3')).status).toBe(429)
	})

	// Fetch-handler deployments (edge, serverless, `fetch()`) have no socket peer.
	it('ignores spoofed X-Forwarded-For prefixes without a socket peer', async () => {
		const http = await start({
			rateLimit: limited,
			routes: ping,
			trustProxy: 1,
		})
		const spoofed = (prefix: string) =>
			send(http, '/ping', {
				headers: [['X-Forwarded-For', `${prefix}, 198.51.100.50`]],
			})
		expect((await spoofed('192.0.2.1')).status).toBe(200)
		expect((await spoofed('192.0.2.2')).status).toBe(200)
		expect((await spoofed('192.0.2.3')).status).toBe(429)
		const other = await send(http, '/ping', {
			headers: [['X-Forwarded-For', '198.51.100.51']],
		})
		expect(other.status).toBe(200)
	})

	it('uses a replaceable store and stricter route limits', async () => {
		const counts = new Map<string, number>()
		const increment = vi.fn((key: string) => {
			const count = (counts.get(key) ?? 0) + 1
			counts.set(key, count)
			return Promise.resolve(count)
		})
		const store: HttpRateLimitStore = { increment }
		const http = await start({
			rateLimit: { default: { perMinute: 100 }, store },
			routes: {
				'POST /login': {
					handle: () => new Response('ok'),
					rateLimit: { perMinute: 1 },
				},
			},
		})
		expect((await send(http, '/login', { method: 'POST' })).status).toBe(200)
		expect((await send(http, '/login', { method: 'POST' })).status).toBe(429)
		expect((await send(http, '/health')).status).toBe(200)
		expect(increment).toHaveBeenCalledWith(
			expect.stringContaining('POST /login'),
			expect.any(Number),
		)
	})

	it('fails closed when the store fails', async () => {
		const http = await start({
			rateLimit: {
				default: { perMinute: 1 },
				store: { increment: () => Promise.reject(new Error('store down')) },
			},
			routes: ping,
		})
		expect((await send(http, '/ping')).status).toBe(500)
		// The health route never consults the store.
		expect((await send(http, '/health')).status).toBe(200)
		expect(() => httpPlugin({ rateLimit: { store: {} } as never })).toThrow(
			'rateLimit store must have an increment(key, expiresAt) method',
		)
		expect(() => httpPlugin({ trustProxy: 0 })).toThrow(
			'HTTP plugin trustProxy must be a positive safe integer',
		)
	})
})

describe('access log (ADR-0323 decision 8)', () => {
	it('logs method, path, status, duration and request id, never bodies or queries', async () => {
		const logger = silentLogger()
		const http = await start({ accessLog: true, routes: echo }, [], logger)
		await send(http, '/echo?token=secret-query', {
			body: 'secret-body',
			headers: [
				['Authorization', 'Bearer secret-token'],
				['X-UltimaBase-Request-Id', 'logged.request'],
			],
			method: 'POST',
		})
		const lines = logger.info.mock.calls.filter(([message]) =>
			String(message).includes('POST /echo'),
		)
		expect(lines).toHaveLength(1)
		expect(lines[0]?.[0]).toMatch(
			/^\[@ultimabase\/http-plugin\] POST \/echo 200 \d+ms$/u,
		)
		const { durationMs, ...details } = (lines[0]?.[1] ?? {}) as Record<
			string,
			unknown
		>
		expect(typeof durationMs).toBe('number')
		expect(details).toStrictEqual({
			method: 'POST',
			path: '/echo',
			requestId: 'logged.request',
			status: 200,
		})
		expect(JSON.stringify(logger.info.mock.calls)).not.toMatch(/secret/u)

		const quiet = silentLogger()
		const silent = await start({ routes: echo }, [], quiet)
		await send(silent, '/health')
		expect(
			quiet.info.mock.calls.some(([message]) =>
				String(message).includes('GET /health'),
			),
		).toBe(false)
	})
})
