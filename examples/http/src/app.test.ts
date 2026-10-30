// Calls the routes as a client does, each test on a new in-memory database.
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it } from 'vitest'
import { app } from './app.ts'
import { Order } from './models.ts'
import { shop } from './routes.ts'

const running = testApplication(app)
const M = { as: master }

//#region pay
/** What the payment provider sends. */
const pay = (secret: string, body: string) =>
	fetch(`${running.url}/webhooks/payment`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-secret': secret },
		body,
	})
//#endregion

it('tests a route without the server', async () => {
	//#region request
	// `routes().request` answers as an anonymous request, with no server.
	const response = await shop.request('/whoami')
	expect(await response.json()).toEqual({ caller: 'anonymous', address: '' })
	//#endregion
})

it('reads a receipt as the caller', async () => {
	//#region receipt
	const order = await Order.create({ data: { total: 30 } }, M)
	const response = await fetch(`${running.url}/orders/${order.id}/receipt`)
	expect(await response.text()).toBe(`Order ${order.id}: 30 EUR, due.`)
	//#endregion
})

it('takes a payment webhook', async () => {
	//#region webhook
	const order = await Order.create({ data: { total: 30 } }, M)
	const paid = await pay(
		'dev-secret',
		JSON.stringify({ order: order.id, amount: 30 }),
	)
	expect(await paid.json()).toEqual({ order: order.id, amount: 30, paid: true })
	const wrong = await pay(
		'guess',
		JSON.stringify({ order: order.id, amount: 30 }),
	)
	expect(wrong.status).toBe(401)
	expect(await wrong.json()).toEqual({
		code: 'UNAUTHORIZED',
		message: 'Wrong secret.',
	})
	//#endregion
	//#region invalid
	const invalid = await pay('dev-secret', JSON.stringify({ order: order.id }))
	expect(invalid.status).toBe(400)
	expect(await invalid.json()).toEqual({
		code: 'VALIDATION_FAILED',
		message: 'Invalid data.',
		details: {
			issues: [
				{
					path: ['amount'],
					message: 'Invalid input: expected number, received undefined',
				},
			],
		},
	})
	const malformed = await pay('dev-secret', '{')
	expect(await malformed.json()).toEqual({
		code: 'BAD_REQUEST',
		message: 'Malformed JSON in request body',
	})
	//#endregion
})

it('reads a validated query', async () => {
	//#region query
	await Order.createMany({ data: [{ total: 10 }, { total: 50 }] }, M)
	const all = await fetch(`${running.url}/orders`)
	expect(await all.json()).toBe(2)
	const large = await fetch(`${running.url}/orders?min=20`)
	expect(await large.json()).toBe(1)
	//#endregion
})

it("reads the client's address behind a proxy", async () => {
	//#region address
	const response = await fetch(`${running.url}/whoami`, {
		// What the proxy in front of the server adds.
		headers: { 'x-forwarded-for': '203.0.113.7' },
	})
	expect(await response.json()).toEqual({
		caller: 'anonymous',
		address: '203.0.113.7',
	})
	//#endregion
})

it('sends no-store unless a route sets its cache', async () => {
	//#region cache
	const prices = await fetch(`${running.url}/prices`)
	expect(prices.headers.get('cache-control')).toBe('public, max-age=60')
	const whoami = await fetch(`${running.url}/whoami`)
	expect(whoami.headers.get('cache-control')).toBe('no-store')
	//#endregion
})

it('lets the listed origins call from a browser', async () => {
	//#region cors
	const preflight = (origin: string) =>
		fetch(`${running.url}/webhooks/payment`, {
			method: 'OPTIONS',
			headers: { origin, 'access-control-request-method': 'POST' },
		})
	const listed = await preflight('https://shop.example.com')
	expect(listed.headers.get('access-control-allow-origin')).toBe(
		'https://shop.example.com',
	)
	expect(listed.headers.get('access-control-allow-credentials')).toBe('true')
	const other = await preflight('https://elsewhere.example')
	expect(other.headers.get('access-control-allow-origin')).toBeNull()
	//#endregion
	//#region form
	// A form another site posts, which CORS never stops.
	const form = await fetch(`${running.url}/webhooks/payment`, {
		method: 'POST',
		headers: {
			origin: 'https://elsewhere.example',
			'content-type': 'text/plain',
		},
		body: '{}',
	})
	expect(form.status).toBe(403)
	expect(await form.json()).toEqual({
		code: 'ACCESS_DENIED',
		message: 'A form from another origin is refused.',
	})
	//#endregion
})

it('refuses a large body, a body that is not JSON and an unknown route', async () => {
	//#region refused
	const post = (type: string, body: string) =>
		fetch(`${running.url}/webhooks/payment`, {
			method: 'POST',
			headers: { 'content-type': type, 'x-secret': 'dev-secret' },
			body,
		})
	const large = await post('application/json', 'x'.repeat(70_000))
	expect(large.status).toBe(413)
	expect(await large.json()).toEqual({
		code: 'PAYLOAD_TOO_LARGE',
		message: 'The body is over 65536 bytes.',
	})
	const text = await post('text/plain', '{}')
	expect(text.status).toBe(415)
	expect(await text.json()).toEqual({
		code: 'UNSUPPORTED_MEDIA_TYPE',
		message: 'The body is not JSON: send content-type: application/json.',
	})
	const unknown = await fetch(`${running.url}/nowhere`)
	expect(unknown.status).toBe(404)
	expect(await unknown.json()).toEqual({
		code: 'NOT_FOUND',
		message: 'No route matches GET /nowhere.',
	})
	//#endregion
})
