import { testApplication } from '@ultimabase/testing'
import { afterEach, expect, it, vi } from 'vitest'

import { ultimabase } from '../src/ultimabase.ts'
import { postJson, startOfMinute } from './support.ts'

afterEach(() => {
	vi.useRealTimers()
	vi.restoreAllMocks()
})

it('counts clients without an address together, after one warning', async () => {
	await using t = await testApplication(ultimabase)
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
	startOfMinute()
	// In memory there is no socket peer, and without the proxy's
	// `X-Forwarded-For` nothing names the client: its address is unknown.
	const unknown = postJson({ email: 'ada@example.com', message: 'Hello' })
	for (let message = 1; message <= 5; message += 1) {
		expect((await t.fetch('/contact', unknown)).status).toBe(202)
	}
	// Every unknown client shares one budget: failing closed beats no limit.
	expect((await t.fetch('/contact', unknown)).status).toBe(429)
	// A client the proxy names keeps its own budget.
	const named = postJson(
		{ email: 'grace@example.com', message: 'Hello' },
		{ 'x-forwarded-for': '198.51.100.20' },
	)
	expect((await t.fetch('/contact', named)).status).toBe(202)

	// The first request without an address warns, once per process.
	expect(warn).toHaveBeenCalledExactlyOnceWith(
		'[@ultimabase/http-plugin] An HTTP request has no client address: every such request shares one rate-limit bucket and authentication records no address. Pass the socket peer as remoteAddress from your server provider, or set trustProxy when a proxy names the client in X-Forwarded-For.',
	)
})
