import { describe, expect, it } from 'vitest'

import {
	httpBrowserBootstrapRoute,
	httpMount,
	httpRoute,
	provideHttpEndpoints,
} from './endpoints.js'
import { normalizeHttpBrowserBootstrapPath } from './browser-bootstrap-path.js'

const protocol = { name: 'fixture.http', version: '1' } as const

describe('HTTP endpoint declarations', () => {
	it('normalizes reusable browser bootstrap plugin option paths', () => {
		expect(
			normalizeHttpBrowserBootstrapPath('/console', 'Console plugin path'),
		).toBe('/console')
		for (const path of [
			'/',
			'/console/',
			'/console//schema',
			'/console/%2f',
			'/console/..',
			'/__ultimabase/apps/example',
		]) {
			expect(() =>
				normalizeHttpBrowserBootstrapPath(path, 'Console plugin path'),
			).toThrow('Console plugin path must be a normalized route suffix')
		}
	})

	it('creates immutable Fetch routes and mounts', () => {
		const route = httpRoute({
			method: 'GET',
			path: '/status',
			protocol,
			handle: () => new Response('ready'),
		})
		const mount = httpMount({
			path: '/graphql',
			protocol,
			handle: () => new Response('graphql'),
		})

		expect(route).toMatchObject({
			kind: 'route',
			method: 'GET',
			path: '/status',
		})
		expect(mount).toMatchObject({ kind: 'mount', path: '/graphql' })
		expect(Object.isFrozen(route)).toBe(true)
		expect(Object.isFrozen(route.protocol)).toBe(true)
		expect(Object.isFrozen(mount)).toBe(true)
	})

	it('creates an immutable GET-only browser bootstrap route', () => {
		const route = httpBrowserBootstrapRoute({
			path: '/graphiql',
			protocol,
			handle: () => new Response('explorer'),
		})

		expect(route).toMatchObject({
			kind: 'browser-bootstrap',
			method: 'GET',
			path: '/graphiql',
		})
		expect(Object.isFrozen(route)).toBe(true)
	})

	it('reserves the browser bootstrap namespace from ordinary endpoints', () => {
		expect(() =>
			httpRoute({
				method: 'GET',
				path: '/__ultimabase/apps/example',
				protocol,
				handle: () => new Response(),
			}),
		).toThrow('reserved browser bootstrap namespace')
		expect(() =>
			httpMount({
				path: '/__ultimabase/apps/example',
				protocol,
				handle: () => new Response(),
			}),
		).toThrow('reserved browser bootstrap namespace')
	})

	it('rejects root and reserved browser bootstrap suffixes', () => {
		for (const path of ['/', '/__ultimabase/apps/example']) {
			expect(() =>
				httpBrowserBootstrapRoute({
					path,
					protocol,
					handle: () => new Response(),
				}),
			).toThrow()
		}
	})

	it.each([
		[
			{
				method: 'get',
				path: '/status',
				protocol,
				handle: () => new Response(),
			},
			'uppercase method',
		],
		[
			{ method: 'GET', path: 'status', protocol, handle: () => new Response() },
			'absolute path',
		],
		[
			{
				method: 'GET',
				path: '/status/',
				protocol,
				handle: () => new Response(),
			},
			'absolute path',
		],
		[
			{
				method: 'GET',
				path: '/status?x=1',
				protocol,
				handle: () => new Response(),
			},
			'absolute path',
		],
		[
			{
				method: 'GET',
				path: '/status',
				protocol: { name: '', version: '1' },
				handle: () => new Response(),
			},
			'protocol name',
		],
	])('rejects malformed route options %#', (options, message) => {
		expect(() => httpRoute(options as never)).toThrow(message)
	})

	it('rejects unknown provider options before registration', () => {
		expect(() =>
			provideHttpEndpoints({
				contributionId: 'unknown',
				create: () => [],
				unknown: true,
			} as never),
		).toThrow('unknown option')
	})
})
