import { MasterAuthority, PluginError, UltimaBase } from '@ultimabase/core'
import { plugin } from '@ultimabase/core/plugin'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

import {
	httpContextResolver,
	provideHttpContextResolvers,
	type HttpContextResolver,
} from './context.js'
import { httpRoute, provideHttpEndpoints } from './endpoints.js'
import { httpPlugin } from './plugin.js'
import { httpTestDatabasePlugin } from './test-database.test-support.js'

const rejected = 'FIXTURE_SESSION_REJECTED'
const refusal = (code: string): PluginError =>
	new PluginError(code, `internal reason for ${code}`, {
		publicMessage: 'Invalid session.',
	})

// One resolver declares the error it throws; every other failure stays
// the HTTP plugin's sanitized `HTTP_APPLICATION_REJECTED` (ADR-0341).
const sessionPlugin = plugin({
	id: 'fixture.http-context-errors',
	version: '1.0.0',
	core: '^0.0.0',
	contributions: [
		provideHttpContextResolvers({
			contributionId: 'session',
			create: () =>
				httpContextResolver({
					errors: { [rejected]: 401 },
					resolve: ({ context, request }) => {
						const authorization = request.headers.get('Authorization')
						if (authorization === 'Bearer expired') throw refusal(rejected)
						if (authorization === 'Bearer undeclared') {
							throw refusal('FIXTURE_UNDECLARED')
						}
						if (authorization === 'Bearer crash') throw new TypeError('boom')
						return context
					},
				}),
		}),
	],
})

const start = async () => {
	const handler = vi.fn(() => Response.json({ handled: true }))
	const routes = plugin({
		id: 'fixture.http-context-errors-route',
		version: '1.0.0',
		core: '^0.0.0',
		permissions: { 'transport:expose': 'Exposes the fixture route.' },
		contributions: [
			provideHttpEndpoints({
				contributionId: 'route',
				create: () =>
					httpRoute({
						handle: handler,
						method: 'POST',
						path: '/context',
						protocol: { name: 'fixture.http-context-errors', version: '1' },
					}),
			}),
		],
	})
	const Application = UltimaBase.use(
		httpTestDatabasePlugin(),
		sessionPlugin,
		routes,
		httpPlugin({ master: true }),
	)
	const ultimabase = new Application({
		logger: false,
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'primary', value: 'master-secret' }],
			onUse: () => undefined,
		}),
		schemas: [],
	})
	onTestFinished(() => ultimabase.dispose())
	await ultimabase.start()
	const send = async (headers: Readonly<Record<string, string>>) => {
		const response = await ultimabase.plugin(httpPlugin).fetch(
			new Request('https://api.example.test/context', {
				body: '{}',
				headers,
				method: 'POST',
			}),
		)
		return { body: (await response.json()) as unknown, response }
	}
	return { handler, send }
}

describe('HTTP context resolver errors (ADR-0341)', () => {
	it('answers an error the resolver declares with its status', async () => {
		const { handler, send } = await start()
		const { body, response } = await send({ Authorization: 'Bearer expired' })
		expect(response.status).toBe(401)
		expect(body).toStrictEqual({
			error: {
				code: rejected,
				message: 'Invalid session.',
				requestId: response.headers.get('X-UltimaBase-Request-Id'),
				retryable: false,
			},
		})
		expect(response.headers.get('Cache-Control')).toBe('private, no-store')
		expect(handler).not.toHaveBeenCalled()
	})

	it.each([
		['an undeclared plugin error', { Authorization: 'Bearer undeclared' }],
		['any other failure', { Authorization: 'Bearer crash' }],
		[
			'a wrong Master key',
			{ 'X-UltimaBase-Master-Key': 'not-the-master-secret' },
		],
	])('keeps HTTP_APPLICATION_REJECTED for %s', async (_label, headers) => {
		const { handler, send } = await start()
		const { body, response } = await send(headers)
		expect(response.status).toBe(401)
		expect(body).toMatchObject({
			error: {
				code: 'HTTP_APPLICATION_REJECTED',
				message: 'The application or credentials were rejected.',
			},
		})
		expect(JSON.stringify(body)).not.toContain('internal reason')
		expect(handler).not.toHaveBeenCalled()
	})

	it('validates the declared errors', () => {
		const resolve: HttpContextResolver = ({ context }) => context
		expect(() => httpContextResolver({ errors: [] as never, resolve })).toThrow(
			'HTTP context resolver errors must map error codes to statuses',
		)
		expect(() => httpContextResolver({ errors: { '': 401 }, resolve })).toThrow(
			'HTTP context resolver error code must not be empty',
		)
		for (const status of [200, 399, 600, 401.5]) {
			expect(() =>
				httpContextResolver({ errors: { [rejected]: status }, resolve }),
			).toThrow(
				`HTTP context resolver error ${rejected} needs a status from 400 to 599`,
			)
		}
	})
})
