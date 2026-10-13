import { testApplication } from '@ultimabase/testing'
import { httpPlugin } from '@ultimabase/http-plugin'
import { beforeEach, expect, it } from 'vitest'

import { inbox } from '../src/routes.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { masterKey, postJson } from './support.ts'

beforeEach(() => {
	inbox.length = 0
})

it('runs requests without a server or a port', async () => {
	await using t = await testApplication(ultimabase)

	//#region fetch
	const response = await ultimabase
		.plugin(httpPlugin)
		.fetch(new Request('http://localhost/health'))
	//#endregion fetch

	expect(response.status).toBe(200)
	expect(await response.json()).toStrictEqual({ status: 'OK' })
	// `t.fetch(path, init)` sends the same request from a test.
	const health = await t.fetch('/health')
	expect(await health.json()).toStrictEqual({ status: 'OK' })
})

it('serves application routes and plugin routes', async () => {
	await using t = await testApplication(ultimabase)

	//#region status
	const status = await t.fetch('/status')
	//#endregion status

	expect(status.status).toBe(200)
	expect(await status.json()).toStrictEqual({
		mode: 'anonymous',
		partner: null,
	})
	expect(await (await t.fetch('/version')).json()).toStrictEqual({ api: '2' })
	// The mount owns every path below `/v1`.
	const retired = await t.fetch('/v1/classes/Link?limit=10')
	expect(retired.status).toBe(410)
	expect(await retired.json()).toMatchObject({
		error: { code: 'API_RETIRED' },
	})
})

it('answers a PublicError with the error envelope', async () => {
	await using t = await testApplication(ultimabase)
	const accepted = await t.fetch(
		'/contact',
		postJson({ email: 'ada@example.com', message: 'Hello' }),
	)
	expect(accepted.status).toBe(202)
	expect(inbox).toStrictEqual([{ email: 'ada@example.com', message: 'Hello' }])

	//#region contact-invalid
	const rejected = await t.fetch(
		'/contact',
		postJson({ email: 'not an address', message: 'Hello' }),
	)
	//#endregion contact-invalid

	expect(rejected.status).toBe(400)
	const body: unknown = await rejected.json()
	expect(body).toStrictEqual({
		error: {
			code: 'CONTACT_INVALID',
			message: 'Give an email address to reply to.',
			details: { field: 'email' },
			requestId: rejected.headers.get('x-ultimabase-request-id'),
			retryable: false,
		},
	})
	expect(rejected.headers.get('cache-control')).toBe('private, no-store')
})

it('refuses bodies above the route or application limit', async () => {
	await using t = await testApplication(ultimabase)
	// The contact route accepts 8 KiB; REST inherits the 256 KiB default.
	const contact = await t.fetch(
		'/contact',
		postJson({ email: 'ada@example.com', message: 'x'.repeat(10_000) }),
	)
	expect(contact.status).toBe(413)
	expect(await contact.json()).toMatchObject({
		error: { code: 'HTTP_PAYLOAD_TOO_LARGE', retryable: false },
	})
	const operator = { 'x-ultimabase-master-key': masterKey }
	const link = await t.fetch(
		'/api/classes/Link',
		postJson(
			{ url: 'https://example.com', title: 'x'.repeat(300_000) },
			operator,
		),
	)
	expect(link.status).toBe(413)
	const created = await t.fetch(
		'/api/classes/Link',
		postJson({ url: 'https://example.com', title: 'Example' }, operator),
	)
	expect(created.status).toBe(201)
})

it('correlates every response with a request ID', async () => {
	await using t = await testApplication(ultimabase)
	// A valid ID sent by the client is kept; otherwise one is generated.
	const traced = await t.fetch('/status', {
		headers: { 'x-ultimabase-request-id': 'checkout-42' },
	})
	expect(traced.headers.get('x-ultimabase-request-id')).toBe('checkout-42')
	const generated = await t.fetch('/missing')
	expect(generated.status).toBe(404)
	expect(await generated.json()).toStrictEqual({
		error: {
			code: 'HTTP_NOT_FOUND',
			message: 'The requested HTTP route was not found.',
			requestId: generated.headers.get('x-ultimabase-request-id'),
			retryable: false,
		},
	})
	const malformed = await t.fetch('/status', {
		headers: { 'x-ultimabase-request-id': 'not a valid id' },
	})
	expect(malformed.status).toBe(400)
	expect(await malformed.json()).toMatchObject({
		error: { code: 'HTTP_BAD_REQUEST' },
	})
})
