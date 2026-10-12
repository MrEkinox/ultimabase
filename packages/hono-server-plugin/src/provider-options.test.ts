import {
	httpApplicationProtocolVersion,
	httpOriginalHeaderMode,
	type HttpApplication,
	type HttpBrowserPolicy,
	type HttpServerRequest,
} from '@ultimabase/http-plugin'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { HonoServerProvider } from './provider.js'

const application = (
	respond: (input: HttpServerRequest) => Promise<Response>,
): HttpApplication => ({
	appId: 'main',
	authority: { master: { enabled: false } },
	protocolVersion: httpApplicationProtocolVersion,
	originalHeaderMode: httpOriginalHeaderMode,
	requestTimeoutMs: 30_000,
	routeGraph: { browserBootstraps: [], endpoints: [], mounts: [], routes: [] },
	fetch: respond,
})

const enabledPolicy: HttpBrowserPolicy = {
	allowedHeaders: ['Content-Type'],
	allowedMethods: ['GET'],
	credentials: false,
	enabled: true,
	maxAgeSeconds: 60,
	origins: ['https://app.example'],
}

const managed = (
	options: Readonly<{ compression?: boolean; shutdownTimeoutMs?: number }>,
) =>
	new HonoServerProvider({
		app: undefined,
		host: '127.0.0.1',
		port: 0,
		...options,
	})

const url = (provider: HonoServerProvider, path: string): string => {
	const address = provider.address
	if (address === undefined) throw new TypeError('Missing listener address')
	return `http://127.0.0.1:${String(address.port)}${path}`
}

describe('Hono server options (ADR-0323)', () => {
	it('bounds shutdown, then closes connections still in flight', async () => {
		const provider = managed({ shutdownTimeoutMs: 50 })
		const http = application(() => new Promise<Response>(() => undefined))
		await provider.start(http)
		const pending = fetch(url(provider, '/stuck')).catch(
			(error: unknown) => error,
		)
		await vi.waitFor(() => {
			expect(provider.address).toBeDefined()
		})
		await new Promise((resolve) => setTimeout(resolve, 20))
		const startedAt = performance.now()
		await provider.stop(http)
		expect(performance.now() - startedAt).toBeLessThan(5_000)
		expect(await pending).toBeInstanceOf(Error)
		expect(provider.address).toBeUndefined()
	})

	it('compresses UltimaBase responses only when enabled', async () => {
		const body = 'compressible '.repeat(200)
		const http = application(() =>
			Promise.resolve(
				new Response(body, { headers: { 'Content-Type': 'text/plain' } }),
			),
		)
		for (const [compression, encoding] of [
			[true, 'gzip'],
			[false, null],
		] as const) {
			const provider = managed({ compression })
			await provider.start(http)
			try {
				const response = await fetch(url(provider, '/text'), {
					headers: { 'Accept-Encoding': 'gzip' },
				})
				expect(response.headers.get('Content-Encoding')).toBe(encoding)
				expect(await response.text()).toBe(body)
			} finally {
				await provider.stop(http)
			}
		}
	})

	it('passes the socket peer address to the HTTP application', async () => {
		const seen = vi.fn<(input: HttpServerRequest) => void>()
		const http = application((input) => {
			seen(input)
			return Promise.resolve(new Response('ok'))
		})
		const provider = managed({})
		await provider.start(http)
		try {
			await fetch(url(provider, '/peer'))
			expect(seen.mock.calls[0]?.[0].remoteAddress).toMatch(/127\.0\.0\.1$/u)
		} finally {
			await provider.stop(http)
		}
	})

	it('requires a CORS owner on an existing app only when CORS is enabled', async () => {
		const http = application(() => Promise.resolve(new Response('ok')))
		const strict = new HonoServerProvider({
			app: new Hono(),
			host: undefined,
			port: 1337,
		})
		await expect(strict.start(http, enabledPolicy)).rejects.toThrow(
			'Hono server plugin browserPolicyOwner is required with an existing app when httpPlugin({ browser }) enables CORS',
		)

		const app = new Hono()
		const relaxed = new HonoServerProvider({
			app,
			host: undefined,
			port: 1337,
		})
		await relaxed.start(http)
		try {
			const ordinary = await app.fetch(new Request('http://localhost/x'), {
				incoming: { rawHeaders: ['Host', 'localhost'] },
			})
			expect(await ordinary.text()).toBe('ok')
			const preflight = await app.fetch(
				new Request('http://localhost/x', {
					headers: {
						'Access-Control-Request-Method': 'GET',
						Origin: 'https://app.example',
					},
					method: 'OPTIONS',
				}),
				{
					incoming: {
						rawHeaders: [
							'Origin',
							'https://app.example',
							'Access-Control-Request-Method',
							'GET',
						],
					},
				},
			)
			expect(preflight.status).toBe(403)
		} finally {
			await relaxed.stop(http)
		}
	})
})
