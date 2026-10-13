import { httpPlugin } from '@ultimabase/http-plugin'
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
	// Without a socket peer, as behind a fetch handler, and without the
	// proxy's `X-Forwarded-For`, nothing names the client: its address is
	// unknown. `t.fetch` sends from 127.0.0.1 unless asked for no peer.
	const unknown = postJson({ email: 'ada@example.com', message: 'Hello' })
	const noPeer = { remoteAddress: undefined }
	for (let message = 1; message <= 5; message += 1) {
		expect((await t.fetch('/contact', unknown, noPeer)).status).toBe(202)
	}
	// Every unknown client shares one budget: failing closed beats no limit.
	expect((await t.fetch('/contact', unknown, noPeer)).status).toBe(429)
	// A client the proxy names keeps its own budget.
	const named = postJson(
		{ email: 'grace@example.com', message: 'Hello' },
		{ 'x-forwarded-for': '198.51.100.20' },
	)
	expect((await t.fetch('/contact', named, noPeer)).status).toBe(202)

	// The first request without an address warns, once per process.
	expect(warn).toHaveBeenCalledExactlyOnceWith(
		'[@ultimabase/http-plugin] An HTTP request has no client address: every such request shares one rate-limit bucket and authentication records no address. Pass the socket peer as remoteAddress from your server provider or to fetch(request, { remoteAddress }), or set trustProxy when a proxy names the client in X-Forwarded-For.',
	)
})

it('counts the client a fetch handler names from its platform', async () => {
	await using t = await testApplication(ultimabase)
	startOfMinute()
	const fromPlatform = async () => {
		const request = new Request(
			'http://localhost/contact',
			postJson({ email: 'ada@example.com', message: 'Hello' }),
		)

		//#region remote-address
		// The platform in front of the fetch handler names the client.
		const response = await ultimabase
			.plugin(httpPlugin)
			.fetch(request, { remoteAddress: '203.0.113.7' })
		//#endregion remote-address

		return response.status
	}
	for (let message = 1; message <= 5; message += 1) {
		expect(await fromPlatform()).toBe(202)
	}
	expect(await fromPlatform()).toBe(429)
	// `t.fetch` sends from 127.0.0.1: another client, with its own budget.
	const local = await t.fetch(
		'/contact',
		postJson({ email: 'grace@example.com', message: 'Hello' }),
	)
	expect(local.status).toBe(202)
})
