import {
	UltimaBase,
	plugin,
	contributeApplication,
	requireCapability,
} from '@ultimabase/core'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
	httpApplicationCapability,
	type HttpApplication,
	type HttpOriginalHeader,
} from './application.js'
import {
	httpBrowserBootstrapRoute,
	httpRoute,
	provideHttpEndpoints,
} from './endpoints.js'
import { httpPlugin } from './plugin.js'
import { httpTestDatabasePlugin } from './test-database.test-support.js'

// Exercise the real application boundary after removing the server mount table.
describe('application-owned HTTP identity and browser bootstrap', () => {
	let application: Pick<UltimaBase<readonly []>, 'start' | 'dispose'>
	let http: HttpApplication
	const handler = vi.fn((request: Request) => new Response(request.url))
	beforeEach(async () => {
		handler.mockClear()
		const requirement = requireCapability(httpApplicationCapability, '^1.0.0', {
			phase: 'setup',
		})
		application = new (UltimaBase.use(
			httpTestDatabasePlugin(),
			httpPlugin({ appId: 'notes/team' }),
			plugin({
				id: 'fixture.bootstrap',
				version: '1.0.0',
				core: '^0.0.0',
				permissions: {
					'transport:expose': 'Expose fixture bootstrap and ordinary routes.',
				},
				contributions: [
					provideHttpEndpoints({
						contributionId: 'routes',
						create: () => [
							httpBrowserBootstrapRoute({
								path: '/graphiql',
								protocol: { name: 'fixture.explorer', version: '1' },
								handle: handler,
							}),
							httpRoute({
								path: '/ordinary',
								method: 'GET',
								protocol: { name: 'fixture.ordinary', version: '1' },
								handle: handler,
							}),
						],
					}),
					requirement,
					contributeApplication(({ capabilities }) => {
						http = capabilities.get(requirement)
						const exports = undefined
						return { exports }
					}),
				],
			}),
		))({ schemas: [], pluginPrivileges: { logger: false } })
		await application.start()
	})
	afterEach(async () => {
		await application.dispose()
	})
	it('accepts only the exact owned bootstrap and preserves query, signal, and request ID', async () => {
		const controller = new AbortController()
		const response = await http.fetch({
			originalHeaders: [['X-UltimaBase-Request-Id', 'bootstrap.request']],
			request: new Request(
				'http://localhost/__ultimabase/apps/notes%2Fteam/graphiql?theme=dark',
				{ signal: controller.signal },
			),
		})
		expect(response.status).toBe(200)
		expect(await response.text()).toBe('http://localhost/graphiql?theme=dark')
		expect(response.headers.get('X-UltimaBase-Request-Id')).toBe(
			'bootstrap.request',
		)
		expect(response.headers.get('Cache-Control')).toBe('private, no-store')
		expect(handler).toHaveBeenCalledOnce()
		expect(
			handler.mock.calls[0]?.[0].headers.get('X-UltimaBase-Application-Id'),
		).toBe('notes/team')
		controller.abort()
		expect(handler.mock.calls[0]?.[0].signal.aborted).toBe(true)
	})
	it.each([
		['POST', '/__ultimabase/apps/notes%2Fteam/graphiql'],
		['GET', '/__ultimabase/apps/foreign/graphiql'],
		['GET', '/__ultimabase/apps/notes%2Fteam/ordinary'],
		['GET', '/__ultimabase/apps/notes%2Fteam'],
		['GET', '/__ultimabase/apps/%ZZ/graphiql'],
		['GET', '/ordinary'],
	])(
		'rejects missing or unowned bootstrap identity for %s %s',
		async (method, pathname) => {
			const response = await http.fetch({
				originalHeaders: [],
				request: new Request(`http://localhost${pathname}`, { method }),
			})
			expect(response.status).toBe(401)
			expect(await response.json()).toMatchObject({
				error: { code: 'HTTP_APPLICATION_REJECTED' },
			})
			expect(handler).not.toHaveBeenCalled()
		},
	)
	it.each(['foreign', 'notes/team, other', ''])(
		'rejects explicit %j identity without falling back to bootstrap',
		async (appId) => {
			const response = await http.fetch({
				originalHeaders: [['X-UltimaBase-Application-Id', appId]],
				request: new Request(
					'http://localhost/__ultimabase/apps/notes%2Fteam/graphiql',
				),
			})
			expect(response.status).toBe(401)
			expect(handler).not.toHaveBeenCalled()
		},
	)
	it.each([
		'X-UltimaBase-Application-Id',
		'X-UltimaBase-Master-Key',
		'Authorization',
		'Cookie',
		'Content-Length',
		'X-UltimaBase-Request-Id',
	])('rejects duplicate %s before bootstrap behavior', async (name) => {
		const response = await http.fetch({
			originalHeaders: [
				[name, 'one'],
				[name.toLowerCase(), 'two'],
			],
			request: new Request(
				'http://localhost/__ultimabase/apps/notes%2Fteam/graphiql',
			),
		})
		expect(response.status).toBe(400)
		expect(await response.json()).toMatchObject({
			error: { code: 'HTTP_BAD_REQUEST' },
		})
		expect(handler).not.toHaveBeenCalled()
	})
	it('sanitizes malformed header evidence before ordinary behavior', async () => {
		const response = await http.fetch({
			originalHeaders: [
				['invalid'],
			] as unknown as readonly HttpOriginalHeader[],
			request: new Request('http://localhost/ordinary'),
		})
		expect(response.status).toBe(400)
		expect(handler).not.toHaveBeenCalled()
	})
})
