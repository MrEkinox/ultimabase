// A plugin that is ready while its broker is connected, and leaves before
// the plugins stop.
import { httpPlugin } from '@ultimabase/http'
import { testApplication } from '@ultimabase/testing'
import { defineApp, memory } from 'ultimabase'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestFiles } from '../../../scripts/requests.ts'
import { app } from './app.ts'
import { broker, brokerPlugin } from './plugins/broker.ts'

afterEach(() => {
	broker.connected = true
})

describe('a readiness check', () => {
	const running = testApplication(app)
	const { check } = requestFiles(new URL('requests/', import.meta.url), running)

	it('answers 503 on /ready while the broker is not connected', async () => {
		await check('ready', {}, { status: 200 })
		broker.connected = false
		await check('ready-refused', {}, { status: 503 })
	})
})

it('takes messages once started, and no more once the stop begins', async () => {
	//#region stopping
	const served = defineApp({
		database: memory(),
		plugins: [httpPlugin({ port: 0, drain: 100 }), brokerPlugin()],
		models: [],
	})
	await served.start()
	expect(broker.subscribed).toBe(true)
	const stopping = served.stop()
	await vi.waitFor(() => {
		expect(broker.subscribed).toBe(false)
	})
	await stopping
	//#endregion
})
