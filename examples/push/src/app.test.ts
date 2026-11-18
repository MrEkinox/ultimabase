// Uses the application as a browser does, each test on a new in-memory
// database: sign up, subscribe, then receive what the server sends, from push
// services kept in memory. Its short regions are shown on the page (D-282).
import { publicKey } from './test-keys.ts'
import { push } from '@ultimabase/push'
import type { FakeWebPush } from '@ultimabase/push/testing'
import { fakeWebPush } from '@ultimabase/push/testing'
import { testApplication } from '@ultimabase/testing'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { z } from 'zod'
import { app } from './app.ts'

const server = testApplication(app)

//#region fake
// Push services that keep each push, decrypted as the browser reads it.
let fake: FakeWebPush
beforeEach(() => {
	fake = fakeWebPush()
})
afterEach(() => {
	fake.restore()
})
//#endregion

/** A function's answer over REST, as the browser calls it; a query by GET. */
async function call(name: string, body?: object, token = ''): Promise<unknown> {
	const response = await fetch(`${server.url}/api/functions/${name}`, {
		method: body === undefined ? 'GET' : 'POST',
		headers: {
			'content-type': 'application/json',
			...(token === '' ? {} : { authorization: `Bearer ${token}` }),
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	})
	return response.json()
}

const signedUp = z.object({
	token: z.string(),
	user: z.object({ id: z.string() }),
})

/** A new user's id and token, and their browser's subscription. */
async function subscribed(email: string) {
	const input = { email, password: 'correct horse' }
	const answer = await call('signUp', { input })
	const { token, user } = z.parse(signedUp, answer)
	const browser = fake.subscription()
	expect(await call('subscribePush', browser, token)).toBe(true)
	return { id: user.id, token, endpoint: browser.endpoint }
}

it('sends to each device of the users, encrypted for each', async () => {
	const ada = await subscribed('ada@example.com')
	await subscribed('grace@example.com')
	//#region send-test
	const message = { title: 'New message', body: 'Hello', tag: 'chat-1' }
	const sent = await push.send([ada.id], message)
	expect(sent).toEqual({ sent: 1, gone: 0, failed: 0 })
	// Only Ada's device received it, decrypted as her browser reads it.
	expect(fake.pushes).toMatchObject([{ endpoint: ada.endpoint, message }])
	//#endregion
})

it('sends a test to the caller, from the button', async () => {
	const ada = await subscribed('ada@example.com')
	expect(await call('testPush', {}, ada.token)).toEqual({
		sent: 1,
		gone: 0,
		failed: 0,
	})
	expect(fake.pushes).toMatchObject([
		{
			message: { title: 'Notifications are on', url: '/settings' },
			ttl: 60,
			urgency: 'high',
		},
	])
})

it('forgets a browser that unsubscribed, or a device turned off', async () => {
	const ada = await subscribed('ada@example.com')
	const grace = await subscribed('grace@example.com')
	await call('unsubscribePush', {}, grace.token)
	//#region gone-test
	// The browser unsubscribed: its push service answers 410.
	fake.gone(ada.endpoint)
	const message = { title: 'New message', body: 'Hello' }
	expect(await push.send([ada.id], message)).toEqual({
		sent: 0,
		gone: 1,
		failed: 0,
	})
	//#endregion
	expect(await push.send([ada.id, grace.id], message)).toEqual({
		sent: 0,
		gone: 0,
		failed: 0,
	})
})

it('gives the browser its key, and subscribes signed-in users only', async () => {
	expect(await call('pushKey')).toBe(publicKey)
	expect(await call('subscribePush', fake.subscription())).toMatchObject({
		code: 'ACCESS_DENIED',
	})
})
