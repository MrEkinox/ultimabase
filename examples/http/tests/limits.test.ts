import { testApplication } from '@ultimabase/testing'
import { afterEach, expect, it, vi } from 'vitest'

import { redis } from '../src/counters.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { postJson, startOfMinute } from './support.ts'

// The proxy in front names the client in `X-Forwarded-For` (`trustProxy: 1`);
// each test uses its own client addresses.
const from = (address: string) => ({ 'x-forwarded-for': address })

afterEach(() => {
	vi.useRealTimers()
	vi.restoreAllMocks()
})

it('limits each client address, never the health route', async () => {
	await using t = await testApplication(ultimabase)
	startOfMinute()
	for (let request = 1; request <= 300; request += 1) {
		expect(
			(await t.fetch('/status', { headers: from('198.51.100.1') })).status,
		).toBe(200)
	}

	//#region rate-limited
	const limited = await t.fetch('/status', {
		headers: { 'X-Forwarded-For': '198.51.100.1' },
	})
	//#endregion rate-limited

	expect(limited.status).toBe(429)
	expect(limited.headers.get('retry-after')).toBe('60')
	expect(await limited.json()).toMatchObject({
		error: { code: 'HTTP_RATE_LIMITED', retryable: false },
	})
	// Probes share addresses: the health route is never limited.
	const health = await t.fetch('/health', { headers: from('198.51.100.1') })
	expect(health.status).toBe(200)
	// Other clients keep their own budget, and the next minute starts afresh.
	expect(
		(await t.fetch('/status', { headers: from('198.51.100.2') })).status,
	).toBe(200)
	vi.setSystemTime(Date.now() + 60_000)
	expect(
		(await t.fetch('/status', { headers: from('198.51.100.1') })).status,
	).toBe(200)
})

it('adds a route limit to the default one', async () => {
	await using t = await testApplication(ultimabase)
	startOfMinute()
	const contact = postJson(
		{ email: 'ada@example.com', message: 'Hello' },
		from('198.51.100.3'),
	)
	for (let message = 1; message <= 5; message += 1) {
		expect((await t.fetch('/contact', contact)).status).toBe(202)
	}
	const sixth = await t.fetch('/contact', contact)
	expect(sixth.status).toBe(429)
	// Other routes keep the default budget of 300 a minute.
	expect(
		(await t.fetch('/status', { headers: from('198.51.100.3') })).status,
	).toBe(200)
})

it('refuses requests when the counter store fails', async () => {
	await using t = await testApplication(ultimabase)
	vi.spyOn(redis, 'incr').mockRejectedValue(new Error('Redis is down'))
	const response = await t.fetch('/status', { headers: from('198.51.100.4') })
	expect(response.status).toBe(500)
	expect(await response.json()).toMatchObject({
		error: {
			code: 'HTTP_INTERNAL_ERROR',
			message: 'The HTTP request could not be completed.',
		},
	})
	// The health route consults no store.
	expect((await t.fetch('/health')).status).toBe(200)
})

it('adds security headers, with HSTS on HTTPS only', async () => {
	await using t = await testApplication(ultimabase)
	const plain = await t.fetch('/health')
	expect(plain.headers.get('x-content-type-options')).toBe('nosniff')
	expect(plain.headers.get('x-frame-options')).toBe('SAMEORIGIN')
	expect(plain.headers.has('strict-transport-security')).toBe(false)
	// The trusted proxy tells the client used HTTPS; errors get them too.
	const secure = await t.fetch('/missing', {
		headers: { 'x-forwarded-proto': 'https' },
	})
	expect(secure.status).toBe(404)
	expect(secure.headers.get('strict-transport-security')).toBe(
		'max-age=31536000; includeSubDomains',
	)
})

it('writes one access log line per request', async () => {
	await using t = await testApplication(ultimabase)
	const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)
	const response = await t.fetch('/status?token=secret', {
		headers: { authorization: 'Bearer forged' },
	})
	expect(response.status).toBe(401)
	// Method, path, status, duration and request ID; never the query string,
	// headers or bodies.
	expect(log).toHaveBeenCalledOnce()
	const call: readonly unknown[] = log.mock.calls[0] ?? []
	const [line, details] = call
	expect(line).toMatch(/^\[@ultimabase\/http-plugin\] GET \/status 401 \d+ms$/u)
	expect(details).toStrictEqual({
		durationMs: Number(/(\d+)ms$/u.exec(String(line))?.[1]),
		method: 'GET',
		path: '/status',
		requestId: response.headers.get('x-ultimabase-request-id'),
		status: 401,
	})
	expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret|forged/u)
})
