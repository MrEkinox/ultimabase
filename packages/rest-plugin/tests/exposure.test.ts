import { isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import {
	neighbourPlugin,
	secret,
	startExposure,
	whisper,
} from './exposure.test-support.js'

describe('REST exposure (ADR-0324)', () => {
	it('mounts under /api without a version and names the protocol in a header', async () => {
		const { send } = await startExposure()
		const { body, response } = await send('/api/classes/RestExposureNote')
		expect(response.status).toBe(200)
		expect(response.headers.get('x-ultimabase-rest-version')).toBe('1')
		expect(body).toStrictEqual({ nextCursor: null, results: [] })

		// REST mounts only the roots it serves (6.4a amendment): any other path
		// under /api is the HTTP foundation's 404.
		const versioned = await send('/api/v1/classes/RestExposureNote')
		expect(versioned.response.status).toBe(404)
		expect(versioned.response.headers.get('x-ultimabase-rest-version')).toBe(
			null,
		)
		expect(versioned.body).toMatchObject({ error: { code: 'HTTP_NOT_FOUND' } })
	})

	it('mounts only the roots it serves, beside other plugins under /api', async () => {
		const { send } = await startExposure(
			{ openapi: true },
			neighbourPlugin(['/api/auth/login', '/api/auth/logout']),
		)
		const login = await send('/api/auth/login', { json: {} })
		expect(login.response.status).toBe(200)
		expect(login.body).toStrictEqual({ neighbour: '/api/auth/login' })
		const notes = await send('/api/classes/RestExposureNote')
		expect(notes.response.status).toBe(200)
		expect((await send('/api/openapi.json')).response.status).toBe(200)
	})

	it('still refuses another plugin on a root REST serves', async () => {
		await expect(
			startExposure(
				{},
				neighbourPlugin(['/api/classes/RestExposureNote/export']),
			),
		).rejects.toThrow(
			'HTTP endpoint collision between mount "/api/classes" and route "/api/classes/RestExposureNote/export"',
		)
	})

	it('lets an application version its own API with basePath', async () => {
		const { send } = await startExposure({ basePath: '/api/v1' })
		const { response } = await send('/api/v1/classes/RestExposureNote/count')
		expect(response.status).toBe(200)
	})

	it('exposes methods and plugin commands by their names only', async () => {
		const { ultimabase } = await startExposure()
		const routes = ultimabase
			.plugin('@ultimabase/rest-plugin')
			.routeGraph.routes.map((route) => `${route.method} ${route.path}`)

		expect(routes).toContain('GET /api/classes/RestExposureNote/count')
		expect(routes).toContain(
			'POST /api/classes/RestExposureNote/{id}/archive-one',
		)
		expect(routes).not.toContain('DELETE /api/classes/RestExposureNote/{id}')
		// The automatic binding of migration 6.0 is gone: a command not named
		// in the rule has no route.
		expect(routes).not.toContain(
			'POST /api/classes/RestExposureDraft/{id}/archive-one',
		)
		expect(routes.some((route) => route.includes('purge-one'))).toBe(false)
		expect(routes.some((route) => route.includes('RestExposureHidden'))).toBe(
			false,
		)
	})

	it('answers 405 with Allow for a disabled method, 404 for an unexposed schema', async () => {
		const { send } = await startExposure()
		const id = '0199b4f0-5a31-7000-8000-000000000001'
		const cases = [
			['DELETE', `/api/classes/RestExposureNote/${id}`, 405, 'GET, PATCH'],
			['GET', '/api/classes/RestExposureDraft/count', 405, ''],
			['POST', `/api/classes/RestExposureDraft/${id}/archive-one`, 405, ''],
			['PUT', '/api/classes/RestExposureNote', 405, 'GET, POST'],
			['GET', '/api/classes/RestExposureHidden', 404, null],
			['GET', '/api/classes/Missing', 404, null],
		] as const
		for (const [method, path, status, allow] of cases) {
			const { body, response } = await send(path, { method })
			expect([method, path, response.status]).toStrictEqual([
				method,
				path,
				status,
			])
			expect(response.headers.get('allow')).toBe(allow)
			expect(body).toMatchObject({
				error: {
					code: status === 405 ? 'REST_METHOD_NOT_ALLOWED' : 'REST_NOT_FOUND',
				},
			})
		}
	})

	it('locates client errors with parameter, path and reason', async () => {
		const { send } = await startExposure()
		const where = encodeURIComponent(JSON.stringify({ views: { gt: 'many' } }))
		const cases = [
			[
				`/api/classes/RestExposureNote?where=${where}`,
				{},
				{ parameter: 'where', path: ['views', 'gt'] },
			],
			[
				'/api/classes/RestExposureNote?take=-1',
				{},
				{
					parameter: 'take',
					path: [],
					reason: 'must be a non-negative integer',
				},
			],
			[
				'/api/classes/RestExposureNote?take=5000',
				{},
				{ parameter: 'take', path: [], reason: 'must not exceed 1000' },
			],
			[
				'/api/classes/RestExposureNote?limit=5',
				{},
				{ parameter: 'limit', path: [] },
			],
			[
				'/api/classes/RestExposureNote?where={',
				{},
				{ parameter: 'where', path: [], reason: 'must be valid JSON' },
			],
			[
				'/api/classes/RestExposureNote/not-a-uuid',
				{},
				{
					parameter: 'id',
					path: [],
					reason: 'must be a UUID v7 identifier',
				},
			],
			[
				'/api/classes/RestExposureNote?select=title,missing',
				{},
				{ parameter: 'select', path: [] },
			],
			[
				'/api/classes/RestExposureNote',
				{ json: { views: '12' } },
				{ parameter: 'body', path: ['views'] },
			],
			[
				'/api/classes/RestExposureNote/query',
				{
					body: 'not json',
					headers: { 'Content-Type': 'application/json' },
					method: 'POST',
				},
				{ parameter: 'body', path: [], reason: 'must be valid JSON' },
			],
		] as const
		for (const [path, init, details] of cases) {
			const { body, response } = await send(path, init)
			expect([path, response.status]).toStrictEqual([path, 400])
			expect(body).toMatchObject({ error: { details } })
			if (isPlainRecord(body) && isPlainRecord(body.error)) {
				const error = body.error
				expect(error.details).toHaveProperty('reason', expect.any(String))
			}
		}
	})

	it('exposes every public operation once and nothing else', async () => {
		const { send } = await startExposure({ hide: [whisper] })
		const echoed = await send('/api/operations/echo', {
			json: { input: { text: 'hi' } },
		})
		expect(echoed.response.status).toBe(200)
		expect(echoed.body).toStrictEqual({ result: { text: 'hi' } })

		const refused = await send('/api/operations/echo', {
			json: { input: { text: 'refuse' } },
		})
		expect(refused.response.status).toBe(400)
		expect(refused.body).toMatchObject({
			error: { code: 'fixture.rest-exposure.refused', message: 'Refused.' },
		})

		for (const name of ['whisper', 'secret', secret.name]) {
			const { response } = await send(`/api/operations/${name}`, {
				json: { input: { text: 'hi' } },
			})
			expect([name, response.status]).toStrictEqual([name, 404])
		}
	})

	it('rejects a hidden operation that is not public', async () => {
		await expect(startExposure({ hide: [secret] })).rejects.toThrow(
			`restPlugin({ hide }) lists ${secret.name}, which is not a public operation of this application`,
		)
	})

	it('runs an application operation and reports its validation issues', async () => {
		const { send } = await startExposure()
		const created = await send('/api/operations/createInvoice', {
			json: { input: { amount: 3, customer: 'ACME' } },
		})
		expect(created.response.status).toBe(200)
		expect(created.body).toStrictEqual({ result: { invoice: 'ACME-3' } })

		const invalid = await send('/api/operations/createInvoice', {
			json: { input: { amount: -1, customer: 'A' } },
		})
		expect(invalid.response.status).toBe(422)
		expect(invalid.body).toMatchObject({
			error: {
				code: 'VALIDATION_ERROR',
				details: {
					issues: [
						{ code: 'operation.input', path: ['input', 'customer'] },
						{ code: 'operation.input', path: ['input', 'amount'] },
					],
				},
			},
		})
	})
})
