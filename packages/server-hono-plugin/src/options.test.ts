import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { normalizeHonoServerPluginOptions } from './options.js'

describe('Hono server plugin options', () => {
	it('uses the documented managed defaults', () => {
		expect(normalizeHonoServerPluginOptions({})).toStrictEqual({
			app: undefined,
			browserPolicyOwner: 'ultimabase',
			host: undefined,
			port: 1337,
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
