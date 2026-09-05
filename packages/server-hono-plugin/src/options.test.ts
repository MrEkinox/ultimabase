import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

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
