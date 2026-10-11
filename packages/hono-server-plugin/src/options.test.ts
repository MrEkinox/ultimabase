import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { normalizeHonoServerPluginOptions } from './options.js'

describe('Hono server plugin options', () => {
	it('uses the documented managed defaults', () => {
		vi.stubEnv('NODE_ENV', 'development')
		vi.stubEnv('HOST', undefined)
		vi.stubEnv('PORT', undefined)
		expect(normalizeHonoServerPluginOptions({})).toStrictEqual({
			app: undefined,
			browserPolicyOwner: 'ultimabase',
			host: '127.0.0.1',
			port: 1337,
			sources: { host: 'NODE_ENV is not production', port: 'default' },
		})
		vi.unstubAllEnvs()
	})

	// ADR-0312: `host`, else `HOST`, else 127.0.0.1 in development and every
	// interface in production, read when the plugin is created.
	describe('listen host', () => {
		afterEach(() => {
			vi.unstubAllEnvs()
		})

		it.each([
			['production', undefined, 'NODE_ENV is production'],
			['development', '127.0.0.1', 'NODE_ENV is not production'],
			['test', '127.0.0.1', 'NODE_ENV is not production'],
			[undefined, '127.0.0.1', 'NODE_ENV is not production'],
		])('defaults from NODE_ENV %j', (environment, host, source) => {
			vi.stubEnv('HOST', undefined)
			vi.stubEnv('NODE_ENV', environment)
			expect(normalizeHonoServerPluginOptions({})).toMatchObject({
				host,
				sources: { host: source },
			})
		})

		it('uses HOST, then lets an explicit host win over both', () => {
			vi.stubEnv('NODE_ENV', 'production')
			vi.stubEnv('HOST', '10.0.0.5')
			expect(normalizeHonoServerPluginOptions({})).toMatchObject({
				host: '10.0.0.5',
				sources: { host: 'HOST' },
			})
			expect(normalizeHonoServerPluginOptions({ host: '::1' })).toMatchObject({
				host: '::1',
				sources: { host: 'explicit option' },
			})
		})

		it('ignores an empty HOST', () => {
			vi.stubEnv('NODE_ENV', 'production')
			vi.stubEnv('HOST', '')
			expect(normalizeHonoServerPluginOptions({})).toMatchObject({
				host: undefined,
			})
		})
	})

	describe('PORT environment variable', () => {
		afterEach(() => {
			vi.unstubAllEnvs()
		})

		it('uses PORT when no port is configured', () => {
			vi.stubEnv('PORT', '8080')
			expect(normalizeHonoServerPluginOptions({})).toMatchObject({
				port: 8080,
			})
		})

		it('keeps an explicit port over PORT', () => {
			vi.stubEnv('PORT', '8080')
			expect(normalizeHonoServerPluginOptions({ port: 3000 })).toMatchObject({
				port: 3000,
			})
		})

		it.each(['abc', '-1', '70000', '80.5'])(
			'rejects an invalid PORT %s',
			(value) => {
				vi.stubEnv('PORT', value)
				expect(() => normalizeHonoServerPluginOptions({})).toThrow(
					'PORT environment variable must be an integer from 0 through 65535',
				)
			},
		)

		// Regression: the message did not show the rejected value.
		it('echoes the received PORT value', () => {
			vi.stubEnv('PORT', '80.5')
			expect(() => normalizeHonoServerPluginOptions({})).toThrow(
				new TypeError(
					'PORT environment variable must be an integer from 0 through 65535 (received "80.5")',
				),
			)
		})
	})

	it('retains an existing Hono app with external ownership', () => {
		const app = new Hono()
		expect(
			normalizeHonoServerPluginOptions({
				app,
				browserPolicyOwner: 'ultimabase',
			}),
		).toMatchObject({
			app,
			browserPolicyOwner: 'ultimabase',
		})
		expect(
			normalizeHonoServerPluginOptions({
				app,
				browserPolicyOwner: 'external',
			}),
		).toMatchObject({ app, browserPolicyOwner: 'external' })
	})

	it.each([
		[{ app: {} } as never, 'Hono application'],
		[{ app: new Hono() } as never, 'external or ultimabase'],
		[{ app: new Hono(), port: 1337 } as never, 'external app'],
		[{ browserPolicyOwner: 'external' } as never, 'requires an external app'],
		[
			{ app: new Hono(), browserPolicyOwner: 'other' } as never,
			'external or ultimabase',
		],
		[{ host: '' }, 'non-empty'],
		[{ port: -1 }, '0 through 65535'],
		[{ port: 1.5 }, '0 through 65535'],
		[{ port: 65_536 }, '0 through 65535'],
		[{ extra: true } as never, 'Unknown'],
	])('rejects invalid options %#', (options, message) => {
		expect(() => normalizeHonoServerPluginOptions(options)).toThrow(message)
	})
})
