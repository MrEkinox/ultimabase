// Calls the routes as a client does, each test on a new in-memory database.
import { createHmac } from 'node:crypto'
import { runJobs, testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { beforeEach, expect, it } from 'vitest'
import { requestFiles } from '../../../scripts/requests.ts'
import { app } from './app.ts'
import { outbox } from './mail.ts'
import { Order } from './models.ts'
import { shop } from './routes.ts'
import { payments } from './webhook.ts'

//#region running
const running = testApplication(app)
//#endregion
const { check } = requestFiles(new URL('requests/', import.meta.url), running)
const M = { as: master }

beforeEach(() => {
	outbox.length = 0
})

/** A browser's preflight request from `origin`. */
const preflight = (origin: string) =>
	fetch(`${running.url}/webhooks/payment`, {
		method: 'OPTIONS',
		headers: { origin, 'access-control-request-method': 'POST' },
	})

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
	const response = await shop.request(`/orders/${order.id}/receipt`)
	expect(await response.text()).toBe(`Order ${order.id}: 30 EUR, due.`)
	//#endregion
})

/** The provider's signature of `body`: an HMAC-SHA256 with its secret, in hex. */
const signature = (body: string) =>
	createHmac('sha256', 'dev-secret').update(body).digest('hex')

it('takes a signed payment webhook, each event once', async () => {
	//#region webhook
	const order = await Order.create({ data: { total: 30 } }, M)
	const body = JSON.stringify({ event: 'evt_1', order: order.id, amount: 30 })
	const deliver = () =>
		payments.request('/webhooks/payment', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-signature': signature(body),
			},
			body,
		})
	const paid = await deliver()
	expect(await paid.json()).toEqual({ order: order.id, amount: 30, paid: true })
	// The provider sends the event again: it is taken once.
	expect((await deliver()).status).toBe(200)
	await runJobs()
	expect(outbox).toEqual([`Order ${order.id} is paid: 30 EUR.`])
	//#endregion
	await check('wrong-signature', {}, { status: 401 })
})

it('refuses a webhook whose body is not valid', async () => {
	await check('invalid', {}, { status: 400 })
	await check('malformed', {}, { status: 400 })
})

it('reads a validated query', async () => {
	await Order.createMany({ data: [{ total: 10 }, { total: 50 }] }, M)
	const all = await fetch(`${running.url}/orders`)
	expect(await all.json()).toBe(2)
	await check('orders', {}, { status: 200 })
})

it("reads the client's address behind a proxy", async () => {
	await check('whoami', {}, { status: 200 })
})

it('refuses an address over the rate limit', async () => {
	const address = '198.51.100.4'
	const whoami = () =>
		fetch(`${running.url}/whoami`, { headers: { 'x-forwarded-for': address } })
	for (let sent = 0; sent < 100; sent += 1) await whoami()
	// The 101st request of the address within the minute.
	const refused = await whoami()
	//#region limit
	expect(refused.status).toBe(429)
	// The seconds until the minute ends, also in details.retryAfter.
	expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0)
	expect(await refused.json()).toMatchObject({ code: 'TOO_MANY_ATTEMPTS' })
	//#endregion
})

it('sends no-store unless a route sets its cache', async () => {
	const prices = await fetch(`${running.url}/prices`)
	const whoami = await fetch(`${running.url}/whoami`)
	//#region cache
	expect(prices.headers.get('cache-control')).toBe('public, max-age=60')
	expect(whoami.headers.get('cache-control')).toBe('no-store')
	//#endregion
})

it('lets the listed origins call from a browser', async () => {
	await check('preflight', {}, { status: 204 })
	const listed = await preflight('https://shop.example.com')
	const other = await preflight('https://elsewhere.example')
	//#region cors
	expect(listed.headers.get('access-control-allow-origin')).toBe(
		'https://shop.example.com',
	)
	expect(listed.headers.get('access-control-allow-credentials')).toBe('true')
	expect(listed.headers.get('access-control-max-age')).toBe('600')
	expect(other.headers.get('access-control-allow-origin')).toBeNull()
	//#endregion
})

it('refuses a form from another origin', async () => {
	await check('form', {}, { status: 403 })
})

it('refuses a large body, a body that is not JSON and an unknown route', async () => {
	const post = (type: string, body: string) =>
		fetch(`${running.url}/webhooks/payment`, {
			method: 'POST',
			headers: { 'content-type': type, 'x-signature': signature(body) },
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
})

it("answers the platform's health and readiness checks", async () => {
	await check('health', {}, { status: 200 })
	// 503 while the application starts, stops, or a plugin's check fails.
	await check('ready', {}, { status: 200 })
})
