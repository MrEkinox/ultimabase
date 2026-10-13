import { testApplication } from '@ultimabase/testing'
import { afterEach, expect, it, vi } from 'vitest'

import { ultimabase } from '../src/ultimabase.ts'
import { masterKey, partnerToken, postJson } from './support.ts'

afterEach(() => {
	vi.restoreAllMocks()
})

it('routes requests with or without the application header', async () => {
	await using t = await testApplication(ultimabase)
	// Without the header, a request reaches the only application.
	expect((await t.fetch('/status')).status).toBe(200)
	const named = await t.fetch('/status', {
		headers: { 'X-UltimaBase-Application-Id': 'links' },
	})
	expect(named.status).toBe(200)

	//#region unknown-application
	const response = await t.fetch('/status', {
		headers: { 'X-UltimaBase-Application-Id': 'billing' },
	})
	//#endregion unknown-application

	expect(response.status).toBe(404)
	expect(await response.json()).toStrictEqual({
		error: {
			code: 'HTTP_APPLICATION_UNKNOWN',
			message: 'The HTTP application is unknown.',
			requestId: response.headers.get('x-ultimabase-request-id'),
			retryable: false,
		},
	})
})

it('resolves the partner from a Bearer token', async () => {
	await using t = await testApplication(ultimabase)

	//#region partner-request
	const response = await t.fetch('/status', {
		headers: { Authorization: `Bearer ${partnerToken}` },
	})
	//#endregion partner-request

	expect(await response.json()).toStrictEqual({
		mode: 'anonymous',
		partner: 'acme',
	})
	// An unknown token is refused before any route runs.
	const forged = await t.fetch('/status', {
		headers: { Authorization: 'Bearer forged' },
	})
	expect(forged.status).toBe(401)
	expect(await forged.json()).toMatchObject({
		error: {
			code: 'HTTP_APPLICATION_REJECTED',
			message: 'The application or credentials were rejected.',
		},
	})
})

it('elevates a request with the Master key header', async () => {
	await using t = await testApplication(ultimabase)
	const audit = vi.spyOn(console, 'info').mockImplementation(() => undefined)

	//#region master-request
	const response = await t.fetch(
		'/api/classes/Link',
		postJson(
			{ url: 'https://ultimabase.dev', title: 'UltimaBase' },
			{ 'X-UltimaBase-Master-Key': masterKey },
		),
	)
	//#endregion master-request

	expect(response.status).toBe(201)
	expect(audit).toHaveBeenCalledWith(
		'Master authority used',
		'HTTP Master key verification',
	)
	// The same write without Master is denied by Access; a wrong key is refused.
	const anonymous = await t.fetch(
		'/api/classes/Link',
		postJson({ url: 'https://example.com' }),
	)
	expect(anonymous.status).toBe(403)
	const wrong = await t.fetch('/status', {
		headers: { 'X-UltimaBase-Master-Key': 'wrong key' },
	})
	expect(wrong.status).toBe(401)
	expect(await wrong.json()).toMatchObject({
		error: { code: 'HTTP_APPLICATION_REJECTED' },
	})
	const operator = await t.fetch('/status', {
		headers: { 'X-UltimaBase-Master-Key': masterKey },
	})
	expect(await operator.json()).toStrictEqual({
		mode: 'master',
		partner: null,
	})
	const links = await t.fetch('/api/classes/Link')
	expect(await links.json()).toMatchObject({
		results: [{ title: 'UltimaBase', url: 'https://ultimabase.dev' }],
	})
})
