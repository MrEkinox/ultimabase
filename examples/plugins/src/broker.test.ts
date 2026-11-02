// A plugin that is ready while its broker is connected, and leaves before
// the plugins stop.
import { httpPlugin } from '@ultimabase/http'
import { testApplication } from '@ultimabase/testing'
import { defineApp, memory } from 'ultimabase'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { app } from './app.ts'
import { broker, brokerPlugin } from './plugins/broker.ts'

afterEach(() => {
	broker.connected = true
})

describe('a readiness check', () => {
	const running = testApplication(app)

	it('answers 503 on /ready while the broker is not connected', async () => {
		//#region ready
		expect((await fetch(`${running.url}/ready`)).status).toBe(200)
		broker.connected = false
		const refused = await fetch(`${running.url}/ready`)
		expect(refused.status).toBe(503)
		expect(await refused.json()).toEqual({
			code: 'UNAVAILABLE',
			message: 'A readiness check failed.',
		})
		//#endregion
	})
})

it('takes messages once started, and no more once the stop begins', async () => {
	//#region stopping
	const served = defineApp({
		database: memory(),
		// The stop serves 100 ms more once /ready answers 503; 5000 by
		// default in production.
		plugins: [httpPlugin({ port: 0, drain: 100 }), brokerPlugin()],
		models: [],
	})
	await served.start()
	expect(broker.subscribed).toBe(true)
	const stopping = served.stop()
	// During the drain, before any plugin stops.
	await vi.waitFor(() => {
		expect(broker.subscribed).toBe(false)
	})
	await stopping
	//#endregion
})
