import { describe, expect, it, vi } from 'vitest'

import {
	httpApplicationProtocolVersion,
	httpOriginalHeaderMode,
} from './constants.js'
import {
	HttpApplicationMountTable,
	type HttpServerProviderCompatibility,
} from './mount-table.js'
import type {
	HttpApplication,
	HttpOriginalHeader,
	HttpRouteGraph,
	HttpServerRequest,
} from './application.js'

const compatibility = (
	ownership: 'external' | 'framework',
): HttpServerProviderCompatibility => ({
	applicationProtocolVersion: httpApplicationProtocolVersion,
	originalHeaderMode: httpOriginalHeaderMode,
	ownership,
})

const fakeApplication = (
	appId: string,
	handle: (input: HttpServerRequest) => Promise<Response> = () =>
		Promise.resolve(new Response(appId)),
	routeGraph: HttpRouteGraph = {
		browserBootstraps: [],
		endpoints: [],
		mounts: [],
		routes: [],
	},
): HttpApplication => ({
	appId,
	authority: { master: { enabled: false } },
	protocolVersion: httpApplicationProtocolVersion,
	originalHeaderMode: httpOriginalHeaderMode,
	requestTimeoutMs: undefined,
	routeGraph,
	fetch: handle,
})

const browserRouteGraph = (path: string): HttpRouteGraph => {
	const bootstrap = {
		handle: () => new Response(),
		kind: 'browser-bootstrap' as const,
		method: 'GET' as const,
		path,
		protocol: { name: 'fixture.explorer', version: '1' },
		provenance: {
			contributionId: 'fixture',
			owner: { pluginId: 'fixture.explorer' },
			pluginVersion: '1.0.0',
			registrationIndex: 0,
		},
	}
	return {
		browserBootstraps: [bootstrap],
		endpoints: [bootstrap],
		mounts: [],
		routes: [],
	}
}

const request = (
	originalHeaders: readonly HttpOriginalHeader[],
): HttpServerRequest => ({
	originalHeaders,
	request: new Request('http://localhost/status'),
})

describe('HttpApplicationMountTable', () => {
	it('lets external and framework-owned providers mount the same exact graph', async () => {
		const application = fakeApplication('shared')
		const external = new HttpApplicationMountTable(
			compatibility('external'),
		).mount(application)
		const framework = new HttpApplicationMountTable(
			compatibility('framework'),
		).mount(application)
		const input = request([['x-ultimabase-application-id', 'shared']])

		expect(external.values()[0]?.routeGraph).toBe(application.routeGraph)
		expect(framework.values()[0]?.routeGraph).toBe(application.routeGraph)
		expect(await (await external.fetch(input)).text()).toBe('shared')
		expect(await (await framework.fetch(input)).text()).toBe('shared')
	})

	it('commits immutable replacements and preserves prior tables on conflicts', () => {
		const first = fakeApplication('blog')
		const conflicting = fakeApplication('blog')
		const empty = new HttpApplicationMountTable(compatibility('external'))
		const mounted = empty.mount(first)

		expect(empty.size).toBe(0)
		expect(mounted.size).toBe(1)
		expect(mounted.mount(first)).toBe(mounted)
		expect(() => mounted.mount(conflicting)).toThrow(
			'HTTP application ID is already mounted',
		)
		expect(mounted.values()).toStrictEqual([first])
		expect(mounted.unmount(conflicting)).toBe(mounted)
		expect(mounted.unmount(first).size).toBe(0)
	})

	it.each([
		{ headers: [], label: 'missing' },
		{
			headers: [
				['X-UltimaBase-Application-Id', 'blog'],
				['x-ultimabase-application-id', 'blog'],
			],
			label: 'duplicate',
		},
		{
			headers: [['X-UltimaBase-Application-Id', 'unknown']],
			label: 'unknown',
		},
	] as const)(
		'rejects $label application selection uniformly',
		({ headers }) => {
			const table = new HttpApplicationMountTable(
				compatibility('external'),
			).mount(fakeApplication('blog'))

			expect(() => table.select(request(headers))).toThrow(
				new TypeError('HTTP application request was rejected'),
			)
		},
	)

	it('preserves comma-bearing values instead of splitting normalized headers', () => {
		const table = new HttpApplicationMountTable(
			compatibility('external'),
		).mount(fakeApplication('blog'))

		expect(() =>
			table.select(
				request([['X-UltimaBase-Application-Id', 'blog, secondary']]),
			),
		).toThrow('HTTP application request was rejected')
	})

	it('rejects unsupported provider and application protocols before mutation', () => {
		expect(
			() =>
				new HttpApplicationMountTable({
					...compatibility('external'),
					applicationProtocolVersion: '2.0.0',
				} as never),
		).toThrow('Unsupported HTTP application protocol version')
		expect(
			() =>
				new HttpApplicationMountTable({
					...compatibility('external'),
					originalHeaderMode: 'normalized',
				} as never),
		).toThrow('preserve ordered original header pairs')

		const table = new HttpApplicationMountTable(compatibility('external'))
		expect(() =>
			table.mount({
				...fakeApplication('future'),
				protocolVersion: '2.0.0',
			} as never),
		).toThrow('incompatible application')
		expect(table.size).toBe(0)
	})

	it('selects before invoking the fake server application', async () => {
		const handler = vi.fn(() => Promise.resolve(new Response('selected')))
		const table = new HttpApplicationMountTable(
			compatibility('framework'),
		).mount(fakeApplication('selected', handler))
		const input = request([['X-UltimaBase-Application-Id', 'selected']])

		expect(await (await table.fetch(input)).text()).toBe('selected')
		expect(handler).toHaveBeenCalledExactlyOnceWith(input)
	})

	it('selects only an owned browser bootstrap from its encoded application path', async () => {
		const handler = vi.fn((input: HttpServerRequest) =>
			Promise.resolve(new Response(new URL(input.request.url).pathname)),
		)
		const application = fakeApplication(
			'notes/team',
			handler,
			browserRouteGraph('/graphiql'),
		)
		const table = new HttpApplicationMountTable(
			compatibility('external'),
		).mount(application)
		const response = await table.fetch({
			originalHeaders: [],
			request: new Request(
				'http://localhost/__ultimabase/apps/notes%2Fteam/graphiql?theme=dark',
			),
		})

		expect(response.status).toBe(200)
		expect(await response.text()).toBe('/graphiql')
		expect(handler).toHaveBeenCalledOnce()
		const selected = handler.mock.calls[0]?.[0]
		expect(selected?.originalHeaders).toContainEqual([
			'X-UltimaBase-Application-Id',
			'notes/team',
		])
		expect(selected?.request.headers.get('X-UltimaBase-Application-Id')).toBe(
			'notes/team',
		)
	})

	it.each([
		['POST', '/__ultimabase/apps/selected/graphiql'],
		['GET', '/__ultimabase/apps/unknown/graphiql'],
		['GET', '/__ultimabase/apps/selected/ordinary'],
		['GET', '/__ultimabase/apps/selected'],
	])('rejects non-bootstrap selection for %s %s', async (method, pathname) => {
		const handler = vi.fn(() => Promise.resolve(new Response('unexpected')))
		const application = fakeApplication(
			'selected',
			handler,
			browserRouteGraph('/graphiql'),
		)
		const table = new HttpApplicationMountTable(
			compatibility('external'),
		).mount(application)

		const response = await table.fetch({
			originalHeaders: [],
			request: new Request(`http://localhost${pathname}`, { method }),
		})
		expect(response.status).toBe(401)
		expect(handler).not.toHaveBeenCalled()
	})

	it.each([
		'X-UltimaBase-Application-Id',
		'X-UltimaBase-Master-Key',
		'Authorization',
		'Cookie',
		'Content-Length',
		'X-UltimaBase-Request-Id',
	])(
		'rejects duplicate %s evidence before application behavior',
		async (name) => {
			const handler = vi.fn(() => Promise.resolve(new Response('unexpected')))
			const table = new HttpApplicationMountTable(
				compatibility('external'),
			).mount(fakeApplication('selected', handler))
			const headers: readonly HttpOriginalHeader[] =
				name === 'X-UltimaBase-Application-Id'
					? [
							[name, 'selected'],
							[name.toLowerCase(), 'selected'],
						]
					: [
							['X-UltimaBase-Application-Id', 'selected'],
							[name, 'one'],
							[name.toLowerCase(), 'two'],
						]

			const response = await table.fetch(request(headers))
			expect(response.status).toBe(400)
			expect(await response.json()).toMatchObject({
				error: { code: 'HTTP_BAD_REQUEST', retryable: false },
			})
			expect(response.headers.get('Cache-Control')).toBe('private, no-store')
			expect(response.headers.get('X-UltimaBase-Request-Id')).toBeTruthy()
			expect(handler).not.toHaveBeenCalled()
		},
	)

	it('sanitizes malformed and unknown application failures', async () => {
		const handler = vi.fn(() => Promise.resolve(new Response('unexpected')))
		const table = new HttpApplicationMountTable(
			compatibility('external'),
		).mount(fakeApplication('selected', handler))

		const malformed = await table.fetch({
			originalHeaders: [['invalid']] as never,
			request: new Request('http://localhost'),
		})
		const unknown = await table.fetch(
			request([['X-UltimaBase-Application-Id', 'unknown']]),
		)
		expect(malformed.status).toBe(400)
		expect(await malformed.json()).toMatchObject({
			error: { code: 'HTTP_BAD_REQUEST' },
		})
		expect(unknown.status).toBe(401)
		expect(await unknown.json()).toMatchObject({
			error: { code: 'HTTP_APPLICATION_REJECTED' },
		})
		expect(handler).not.toHaveBeenCalled()
	})
})
