import { serve, type ServerType } from '@hono/node-server'
import {
	httpApplicationProtocolVersion,
	httpOriginalHeaderMode,
	type HttpApplication,
	type HttpBrowserPolicy,
	type HttpServerRequest,
} from '@ultimabase/http-plugin'
import { Hono } from 'hono'
import { createServer, request as nodeRequest } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it, vi } from 'vitest'

import { HonoServerProvider } from './provider.js'

const createHttpApplication = (
	appId: string,
	onFetch = vi.fn<(request: Request) => void>(),
	onInput = vi.fn<(input: HttpServerRequest) => void>(),
): HttpApplication => ({
	appId,
	authority: { master: { enabled: false } },
	protocolVersion: httpApplicationProtocolVersion,
	originalHeaderMode: httpOriginalHeaderMode,
	requestTimeoutMs: 30_000,
	routeGraph: { browserBootstraps: [], endpoints: [], mounts: [], routes: [] },
	fetch: (input) => {
		const { request } = input
		onInput(input)
		onFetch(request)
		return Promise.resolve(
			new Response(`${appId}:${new URL(request.url).pathname}`),
		)
	},
})

const listenerUrl = (address: AddressInfo, path: string): string =>
	`http://127.0.0.1:${String(address.port)}${path}`

const browserPolicy = (
	origins: readonly string[] = ['https://console.example'],
): HttpBrowserPolicy => ({
	allowedHeaders: [
		'X-UltimaBase-Application-Id',
		'Authorization',
		'Content-Type',
		'X-UltimaBase-Request-Id',
	],
	allowedMethods: ['GET', 'POST'],
	origins: origins,
	credentials: true,
	enabled: true,
	maxAgeSeconds: 300,
})

const closeServer = (server: ServerType): Promise<void> =>
	new Promise((resolve, reject) => {
		server.close((error?: Error) => {
			if (error === undefined) resolve()
			else reject(error)
		})
	})

const startExternalServer = (app: Hono): Promise<ServerType> =>
	new Promise((resolve, reject) => {
		const server = serve(
			{
				fetch: app.fetch,
				hostname: '127.0.0.1',
				overrideGlobalObjects: false,
				port: 0,
			},
			() => {
				server.removeListener('error', reject)
				resolve(server)
			},
		)
		server.once('error', reject)
	})

const requestWithRawHeaders = (
	address: AddressInfo,
	headers: readonly string[],
): Promise<Readonly<{ readonly body: string; readonly status: number }>> =>
	new Promise((resolve, reject) => {
		const request = nodeRequest(
			{
				headers,
				host: '127.0.0.1',
				method: 'GET',
				path: '/raw',
				port: address.port,
			},
			(response) => {
				const chunks: Buffer[] = []
				response.on('data', (chunk: Buffer) => {
					chunks.push(chunk)
				})
				response.on('end', () => {
					resolve({
						body: Buffer.concat(chunks).toString('utf8'),
						status: response.statusCode ?? 0,
					})
				})
			},
		)
		request.once('error', reject)
		request.end()
	})

describe('HonoServerProvider', () => {
	it('opens the configured managed listener and closes its exact resource', async () => {
		const provider = new HonoServerProvider({
			app: undefined,
			host: '127.0.0.1',
			port: 0,
		})
		const application = createHttpApplication('managed')

		await provider.start(application)
		const address = provider.address
		expect(address).toBeDefined()
		if (address === undefined) throw new TypeError('Missing listener address')
		const response = await fetch(listenerUrl(address, '/hello'), {
			headers: { 'X-UltimaBase-Application-Id': 'managed' },
		})
		expect(await response.text()).toBe('managed:/hello')

		await provider.stop(application)
		expect(provider.address).toBeUndefined()
		await expect(fetch(listenerUrl(address, '/hello'))).rejects.toThrow()
	})

	it('waits for an in-flight response during graceful shutdown', async () => {
		const provider = new HonoServerProvider({
			app: undefined,
			host: '127.0.0.1',
			port: 0,
		})
		const entered = Promise.withResolvers<undefined>()
		const pendingResponse = Promise.withResolvers<Response>()
		const baseApplication = createHttpApplication('graceful')
		const application: HttpApplication = {
			...baseApplication,
			fetch: () => {
				entered.resolve(undefined)
				return pendingResponse.promise
			},
		}
		await provider.start(application)
		const address = provider.address
		if (address === undefined) throw new TypeError('Missing listener address')
		const responsePromise = fetch(listenerUrl(address, '/slow'), {
			headers: { 'X-UltimaBase-Application-Id': 'graceful' },
		})
		await entered.promise
		let stopped = false
		const stopPromise = provider.stop(application).then(() => {
			stopped = true
		})
		await Promise.resolve()
		expect(stopped).toBe(false)

		pendingResponse.resolve(new Response('complete'))
		expect(await (await responsePromise).text()).toBe('complete')
		await stopPromise
		expect(stopped).toBe(true)
		expect(provider.address).toBeUndefined()
	})

	it('forwards original duplicate headers unchanged to the HTTP boundary', async () => {
		const onFetch = vi.fn<(request: Request) => void>()
		const onInput = vi.fn<(input: HttpServerRequest) => void>()
		const provider = new HonoServerProvider({
			app: undefined,
			host: '127.0.0.1',
			port: 0,
		})
		const application = createHttpApplication('raw', onFetch, onInput)
		await provider.start(application)
		const address = provider.address
		if (address === undefined) throw new TypeError('Missing listener address')

		try {
			const response = await requestWithRawHeaders(address, [
				'Host',
				`127.0.0.1:${String(address.port)}`,
				'X-UltimaBase-Application-Id',
				'raw',
				'x-ultimabase-application-id',
				'raw',
			])
			expect(response.status).toBe(200)
			expect(onInput.mock.calls[0]?.[0].originalHeaders).toEqual(
				expect.arrayContaining([
					['X-UltimaBase-Application-Id', 'raw'],
					['x-ultimabase-application-id', 'raw'],
				]),
			)
			expect(onFetch).toHaveBeenCalledOnce()
		} finally {
			await provider.stop(application)
		}
	})

	it('handles browser preflight before application identity validation on a real listener', async () => {
		const onFetch = vi.fn<(request: Request) => void>()
		const provider = new HonoServerProvider({
			app: undefined,
			host: '127.0.0.1',
			port: 0,
		})
		const application = createHttpApplication('browser', onFetch)
		await provider.start(application, browserPolicy())
		const address = provider.address
		if (address === undefined) throw new TypeError('Missing listener address')

		try {
			const response = await fetch(listenerUrl(address, '/classes/Post'), {
				headers: {
					'Access-Control-Request-Headers':
						'X-UltimaBase-Application-Id, Authorization, Content-Type, X-UltimaBase-Request-Id',
					'Access-Control-Request-Method': 'POST',
					Origin: 'https://console.example',
				},
				method: 'OPTIONS',
			})
			expect(response.status).toBe(204)
			expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
				'https://console.example',
			)
			expect(response.headers.get('Access-Control-Max-Age')).toBe('300')
			expect(onFetch).not.toHaveBeenCalled()

			const simple = await fetch(listenerUrl(address, '/classes/Post'), {
				headers: {
					Cookie: 'session=opaque',
					Origin: 'https://console.example',
					'X-UltimaBase-Application-Id': 'browser',
				},
			})
			expect(simple.status).toBe(200)
			expect(simple.headers.get('Access-Control-Allow-Origin')).toBe(
				'https://console.example',
			)
			expect(simple.headers.get('Access-Control-Allow-Credentials')).toBe(
				'true',
			)

			const rejected = await fetch(listenerUrl(address, '/classes/Post'), {
				headers: {
					Origin: 'https://rejected.example',
					'X-UltimaBase-Application-Id': 'browser',
				},
			})
			expect(rejected.status).toBe(200)
			expect(rejected.headers.has('Access-Control-Allow-Origin')).toBe(false)
			expect(onFetch).toHaveBeenCalledTimes(2)
		} finally {
			await provider.stop(application)
		}
	})

	it('rejects a second owner before changing the listener or browser policy', async () => {
		const provider = new HonoServerProvider({
			app: undefined,
			host: '127.0.0.1',
			port: 0,
		})
		const accepted = createHttpApplication('accepted')
		const rejected = createHttpApplication('rejected')
		await provider.start(accepted, browserPolicy())
		const address = provider.address
		if (address === undefined) throw new TypeError('Missing listener address')

		try {
			await expect(
				provider.start(rejected, browserPolicy(['https://other.example'])),
			).rejects.toThrow('already owns an application')
			const response = await fetch(listenerUrl(address, '/stable'), {
				headers: { 'X-UltimaBase-Application-Id': 'accepted' },
			})
			expect(await response.text()).toBe('accepted:/stable')
		} finally {
			await provider.stop(accepted)
		}
	})

	it('permits one explicitly external CORS owner without emitting headers', async () => {
		const app = new Hono()
		app.use('*', async (context, next) => {
			await next()
			context.header('Access-Control-Allow-Origin', 'https://owner.example')
		})
		const provider = new HonoServerProvider({
			app,
			browserPolicyOwner: 'external',
			host: undefined,
			port: 1337,
		})
		const application = createHttpApplication('external-cors')
		await expect(provider.start(application, browserPolicy())).rejects.toThrow(
			'requires HTTP browser policy to be disabled',
		)
		await provider.start(application)

		const response = await app.fetch(
			new Request('http://localhost/value', {
				headers: {
					Origin: 'https://owner.example',
					'X-UltimaBase-Application-Id': 'external-cors',
				},
			}),
			{
				incoming: {
					rawHeaders: [
						'Origin',
						'https://owner.example',
						'X-UltimaBase-Application-Id',
						'external-cors',
					],
				},
			},
		)
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
			'https://owner.example',
		)
		await provider.stop(application)
	})

	it('reuses the provider sequentially and ignores stale-owner disposal', async () => {
		const provider = new HonoServerProvider({
			app: undefined,
			host: '127.0.0.1',
			port: 0,
		})
		const first = createHttpApplication('first')
		const second = createHttpApplication('second')
		await provider.start(first)
		await provider.stop(first)
		expect(provider.address).toBeUndefined()
		await provider.start(second)
		const address = provider.address
		if (address === undefined) throw new TypeError('Missing listener address')
		try {
			await provider.stop(first)
			expect(provider.address).toStrictEqual(address)
			const response = await fetch(listenerUrl(address, '/new'), {
				headers: { 'X-UltimaBase-Application-Id': 'second' },
			})
			expect(await response.text()).toBe('second:/new')
		} finally {
			await provider.stop(second)
		}
	})

	it('rejects a distinct owner even when it reuses the same application ID', async () => {
		const provider = new HonoServerProvider({
			app: undefined,
			host: '127.0.0.1',
			port: 0,
		})
		const accepted = createHttpApplication('duplicate')
		const rejected = createHttpApplication('duplicate')
		await provider.start(accepted)
		const address = provider.address
		if (address === undefined) throw new TypeError('Missing listener address')

		try {
			await expect(provider.start(rejected)).rejects.toThrow(
				'Hono server already owns an application',
			)
			const response = await fetch(listenerUrl(address, '/stable'), {
				headers: { 'X-UltimaBase-Application-Id': 'duplicate' },
			})
			expect(await response.text()).toBe('duplicate:/stable')
		} finally {
			await provider.stop(accepted)
		}
	})

	it('mounts into an existing app without closing its listener', async () => {
		const app = new Hono()
		app.get('/health', (context) => context.text('healthy'))
		const provider = new HonoServerProvider({
			app,
			host: 'unused',
			port: 0,
		})
		const application = createHttpApplication('external')
		await provider.start(application)
		const server = await startExternalServer(app)
		const address = server.address()
		if (typeof address !== 'object' || address === null) {
			throw new TypeError('Missing external listener address')
		}

		try {
			expect(await (await fetch(listenerUrl(address, '/health'))).text()).toBe(
				'healthy',
			)
			const mounted = await fetch(listenerUrl(address, '/external'), {
				headers: { 'X-UltimaBase-Application-Id': 'external' },
			})
			expect(await mounted.text()).toBe('external:/external')

			await provider.stop(application)
			const stopped = await fetch(listenerUrl(address, '/external'), {
				headers: {
					'X-UltimaBase-Application-Id': 'external',
					'X-UltimaBase-Request-Id': 'after.stop',
				},
			})
			expect(stopped.status).toBe(401)
			expect(stopped.headers.get('X-UltimaBase-Request-Id')).toBe('after.stop')
			expect(stopped.headers.get('Cache-Control')).toBe('private, no-store')
			expect(await stopped.json()).toMatchObject({
				error: { code: 'HTTP_APPLICATION_REJECTED' },
			})
			expect(server.listening).toBe(true)
			expect(await (await fetch(listenerUrl(address, '/health'))).text()).toBe(
				'healthy',
			)
		} finally {
			await closeServer(server)
		}
	})

	it('rolls back address conflicts and permits a clean retry', async () => {
		const blocker = createServer()
		await new Promise<void>((resolve) =>
			blocker.listen(0, '127.0.0.1', resolve),
		)
		const blockerAddress = blocker.address()
		if (typeof blockerAddress !== 'object' || blockerAddress === null) {
			throw new TypeError('Missing blocker address')
		}
		const provider = new HonoServerProvider({
			app: undefined,
			host: '127.0.0.1',
			port: blockerAddress.port,
		})
		const application = createHttpApplication('retry')

		await expect(provider.start(application)).rejects.toMatchObject({
			code: 'EADDRINUSE',
		})
		expect(provider.address).toBeUndefined()
		await new Promise<void>((resolve, reject) => {
			blocker.close((error) => {
				if (error === undefined) resolve()
				else reject(error)
			})
		})

		await provider.start(application)
		expect(provider.address?.port).toBe(blockerAddress.port)
		await provider.stop(application)
	})

	it('serializes repeated and aborted lifecycle operations', async () => {
		const provider = new HonoServerProvider({
			app: undefined,
			host: '127.0.0.1',
			port: 0,
		})
		const application = createHttpApplication('lifecycle')
		await Promise.all([
			provider.start(application),
			provider.start(application),
			provider.stop(application),
		])
		expect(provider.address).toBeUndefined()
		await provider.stop(application)
		await provider.stop(application)
	})

	it('supports parallel independent providers on ephemeral ports', async () => {
		const providers = Array.from(
			{ length: 4 },
			() =>
				new HonoServerProvider({
					app: undefined,
					host: '127.0.0.1',
					port: 0,
				}),
		)
		const fixtures = providers.map((provider, index) => ({
			application: createHttpApplication(`parallel-${String(index)}`),
			provider,
		}))
		await Promise.all(
			fixtures.map(({ application, provider }) => provider.start(application)),
		)
		const ports = providers.map((provider) => provider.address?.port)
		expect(new Set(ports).size).toBe(providers.length)
		await Promise.all(
			fixtures.map(({ application, provider }) => provider.stop(application)),
		)
	})
})
