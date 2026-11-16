// The application on a platform that sets the client's address in a header.
import { testApplication } from '@ultimabase/testing'
import { afterAll, expect, it, vi } from 'vitest'

// Read when the application is defined, so set before it is imported.
vi.hoisted(() => vi.stubEnv('HTTP_ADDRESS_HEADER', 'do-connecting-ip'))
afterAll(() => vi.unstubAllEnvs())

const { onPlatform } = await import('./platform.ts')
const running = testApplication(onPlatform)

it("reads the client's address in the platform's header, not the client's", async () => {
	const response = await fetch(`${running.url}/whoami`, {
		headers: {
			'do-connecting-ip': '203.0.113.7',
			'x-forwarded-for': '6.6.6.6',
		},
	})
	expect(await response.json()).toEqual({
		caller: 'anonymous',
		address: '203.0.113.7',
	})
})
