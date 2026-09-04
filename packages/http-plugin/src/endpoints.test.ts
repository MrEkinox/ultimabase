import { describe, expect, it } from 'vitest'

import { httpMount, httpRoute, provideHttpEndpoints } from './endpoints.js'

const protocol = { name: 'fixture.http', version: '1' } as const

describe('HTTP endpoint declarations', () => {
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
