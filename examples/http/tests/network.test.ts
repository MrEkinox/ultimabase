import { request as sendRequest } from 'node:http'

import { testApplication } from '@ultimabase/testing'
import { afterEach, expect, it, vi } from 'vitest'

import { redis } from '../src/counters.ts'
import { inbox } from '../src/routes.ts'
import { Link } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { postJson, startOfMinute } from './support.ts'

// The Vitest preset sets `PORT=0`: the managed listener takes a free port.
// These requests cross a real socket, like a proxy's.
const listenerOrigin = (): string => {
	const address = ultimabase.plugin('@ultimabase/hono-server-plugin').address()
	if (address === undefined) throw new TypeError('The listener is not open')
	return `http://127.0.0.1:${String(address.port)}`
}

afterEach(() => {
	vi.useRealTimers()
	vi.restoreAllMocks()
})

it('listens on the managed Hono server', async () => {
	await using t = await testApplication(ultimabase)
	expect(t).toBeDefined()
	const health = await fetch(`${listenerOrigin()}/health`)
	expect(health.status).toBe(200)
	expect(await health.json()).toStrictEqual({ status: 'OK' })
	expect(health.headers.get('x-ultimabase-request-id')).toMatch(/^[\w-]+$/u)
})

it('takes the client address from the trusted proxy only', async () => {
	await using t = await testApplication(ultimabase)
	expect(t).toBeDefined()
	startOfMinute()
	// The proxy appends the address it saw; whatever the client wrote before
	// it cannot change the address that is counted.
	const contact = (forwardedFor: string) =>
		fetch(
			`${listenerOrigin()}/contact`,
			postJson(
				{ email: 'ada@example.com', message: 'Hello' },
				{ 'x-forwarded-for': forwardedFor },
			),
		)
	for (let message = 1; message <= 5; message += 1) {
		const response = await contact(`203.0.113.${String(message)}, 198.51.100.7`)
		expect(response.status).toBe(202)
	}
	expect((await contact('203.0.113.99, 198.51.100.7')).status).toBe(429)
	expect((await contact('198.51.100.8')).status).toBe(202)
})

it('refuses a duplicated sensitive header', async () => {
	await using t = await testApplication(ultimabase)
	expect(t).toBeDefined()
	// Fetch merges repeated headers; Node's client sends both lines, as an
	// attacker could.
	const response = await new Promise<{ status: number; body: string }>(
		(resolve, reject) => {
			const request = sendRequest(
				`${listenerOrigin()}/status`,
				{
					headers: {
						'x-ultimabase-application-id': ['links', 'billing'],
					},
				},
				(incoming) => {
					let body = ''
					incoming.setEncoding('utf8')
					incoming.on('data', (chunk: string) => {
						body += chunk
					})
					incoming.on('end', () => {
						resolve({ status: incoming.statusCode ?? 0, body })
					})
				},
			)
			request.on('error', reject)
			request.end()
		},
	)
	expect(response.status).toBe(400)
	expect(JSON.parse(response.body)).toMatchObject({
		error: { code: 'HTTP_BAD_REQUEST' },
	})
})

it('compresses large responses', async () => {
	await using t = await testApplication(ultimabase)
	await t.asMaster(() =>
		Link.createMany({
			data: Array.from({ length: 40 }, (_, index) => ({
				url: `https://example.com/articles/${String(index)}`,
				title: `Article number ${String(index)}`,
			})),
		}),
	)
	const response = await fetch(`${listenerOrigin()}/api/classes/Link`, {
		headers: { 'accept-encoding': 'gzip' },
	})
	expect(response.headers.get('content-encoding')).toBe('gzip')
	// Fetch decompresses the body.
	expect(await response.json()).toHaveProperty('results.length', 40)
})

it('lets in-flight requests finish when it stops', async () => {
	await using t = await testApplication(ultimabase)
	expect(t).toBeDefined()
	const origin = listenerOrigin()
	const counted = vi.spyOn(redis, 'incr')
	const body = JSON.stringify({ email: 'ada@example.com', message: 'Bye' })
	const request = sendRequest(`${origin}/contact`, {
		headers: {
			'content-length': String(Buffer.byteLength(body)),
			'content-type': 'application/json',
		},
		method: 'POST',
		// One connection for this request only.
		agent: false,
	})
	const answer = new Promise<number>((resolve, reject) => {
		request.on('response', (incoming) => {
			incoming.resume()
			resolve(incoming.statusCode ?? 0)
		})
		request.on('error', reject)
	})
	// The client is still sending its message when the application stops.
	request.write(body.slice(0, 10))
	await vi.waitFor(() => {
		expect(counted).toHaveBeenCalled()
	})
	const stopping = ultimabase.stop()
	request.end(body.slice(10))
	expect(await answer).toBe(202)
	await stopping
	expect(inbox).toContainEqual({ email: 'ada@example.com', message: 'Bye' })
	// The listener is closed: a new connection fails.
	await expect(fetch(`${origin}/health`)).rejects.toThrow()
})
