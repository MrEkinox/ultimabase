import process from 'node:process'

import { vi } from 'vitest'

// The fixed fake secrets of vitest.config.ts.
export const partnerToken = process.env.ACME_PARTNER_TOKEN ?? ''
export const masterKey = process.env.ULTIMABASE_MASTER_KEY ?? ''

/** A JSON `POST`, with extra headers. */
export const postJson = (
	body: unknown,
	headers: Readonly<Record<string, string>> = {},
) =>
	({
		body: JSON.stringify(body),
		headers: { 'content-type': 'application/json', ...headers },
		method: 'POST',
	}) satisfies RequestInit

/**
 * Rate limits count per minute: fake only `Date` and start at the beginning
 * of a minute, so a test never crosses into the next window.
 */
export const startOfMinute = (): void => {
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(Math.ceil(Date.now() / 60_000) * 60_000)
}
