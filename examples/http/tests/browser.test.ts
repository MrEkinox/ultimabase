import { httpPlugin } from '@ultimabase/http-plugin'
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { ultimabase } from '../src/ultimabase.ts'

const site = 'https://links.example.com'

it('derives the browser policy from the installed routes and plugins', async () => {
	await using t = await testApplication(ultimabase)
	expect(t).toBeDefined()

	//#region effective-policy
	const policy = ultimabase.plugin(httpPlugin).browser
	//#endregion effective-policy

	// Authorization because a plugin resolves credentials; the Master header
	// because `master: true`.
	expect(policy).toStrictEqual({
		enabled: true,
		origins: [site],
		credentials: true,
		allowedMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
		allowedHeaders: [
			'Content-Type',
			'X-UltimaBase-Application-Id',
			'X-UltimaBase-Request-Id',
			'Authorization',
			'X-UltimaBase-Master-Key',
		],
		maxAgeSeconds: 600,
	})
})

it('answers preflights for the configured origin only', async () => {
	await using t = await testApplication(ultimabase)
	const preflight = (origin: string) =>
		t.fetch('/api/classes/Link', {
			method: 'OPTIONS',
			headers: {
				origin,
				'access-control-request-method': 'POST',
				'access-control-request-headers': 'content-type',
			},
		})

	const allowed = await preflight(site)
	expect(allowed.status).toBe(204)
	expect(Object.fromEntries(allowed.headers)).toMatchObject({
		'access-control-allow-origin': site,
		'access-control-allow-credentials': 'true',
		'access-control-allow-methods': 'GET, HEAD, POST, PUT, PATCH, DELETE',
		'access-control-max-age': '600',
		vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
	})
	// Another origin gets no permission, so its browser blocks the call.
	const other = await preflight('https://evil.example')
	expect(other.status).toBe(204)
	expect(other.headers.has('access-control-allow-origin')).toBe(false)
})

it('is a browser policy, not an access control', async () => {
	await using t = await testApplication(ultimabase)
	const page = await t.fetch('/status', { headers: { origin: site } })
	expect(page.headers.get('access-control-allow-origin')).toBe(site)
	expect(page.headers.get('vary')).toBe('Origin')
	// A non-browser client, or another origin, still gets an answer: only
	// browsers enforce CORS. Access rules and credentials protect the data.
	const other = await t.fetch('/status', {
		headers: { origin: 'https://evil.example' },
	})
	expect(other.status).toBe(200)
	expect(other.headers.has('access-control-allow-origin')).toBe(false)
})
