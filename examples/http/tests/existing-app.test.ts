import { once } from 'node:events'

import { serve } from '@hono/node-server'
import { testApplication } from '@ultimabase/testing'
import { expect, it, onTestFinished } from 'vitest'

import { admin, app } from '../src/existing-app.ts'

// This file runs the second application: one application per process.

it('joins an existing Hono application and its listener', async () => {
	await using t = await testApplication(admin)
	expect(t).toBeDefined()
	// The listener belongs to the test, like `src/existing-main.ts`'s.
	const listener = serve({ fetch: app.fetch, port: 0 })
	onTestFinished(
		() =>
			new Promise<void>((resolve) => {
				listener.close(() => {
					resolve()
				})
			}),
	)
	await once(listener, 'listening')
	const address = listener.address()
	if (typeof address !== 'object' || address === null) {
		throw new TypeError('The listener has no TCP address')
	}
	const origin = `http://127.0.0.1:${String(address.port)}`

	expect(await (await fetch(`${origin}/ping`)).text()).toBe('pong')
	expect((await fetch(`${origin}/health`)).status).toBe(200)
	expect(
		await (await fetch(`${origin}/api/classes/Report`)).json(),
	).toMatchObject({
		results: [],
	})
	// The plugin owns no listener here.
	expect(admin.plugin('@ultimabase/hono-server-plugin').address()).toBe(
		undefined,
	)
	// No browser policy: a preflight is refused.
	const preflight = await fetch(`${origin}/api/classes/Report`, {
		method: 'OPTIONS',
		headers: {
			origin: 'https://admin.example.com',
			'access-control-request-method': 'POST',
		},
	})
	expect(preflight.status).toBe(403)
	expect(await preflight.json()).toMatchObject({
		error: {
			code: 'HTTP_CORS_DISABLED',
			message: 'CORS is not enabled: configure browser.origins',
		},
	})

	// Without Node's raw headers (here `app.request`), UltimaBase fails closed.
	const unproven = await app.request('/health', {
		headers: { accept: 'application/json' },
	})
	expect(unproven.status).toBe(400)
	expect(await unproven.json()).toMatchObject({
		error: {
			code: 'HTTP_BAD_REQUEST',
			message:
				'The HTTP request carries no network connection headers: serve it through a server plugin, or call ultimabase.plugin(httpPlugin).fetch(request) without a server.',
		},
	})

	// Once UltimaBase stops, its routes refuse requests; Hono's keep working.
	await admin.stop()
	expect(await (await fetch(`${origin}/ping`)).text()).toBe('pong')
	const stopped = await fetch(`${origin}/health`)
	expect(stopped.status).toBe(401)
	expect(await stopped.json()).toMatchObject({
		error: { code: 'HTTP_APPLICATION_REJECTED' },
	})
})
