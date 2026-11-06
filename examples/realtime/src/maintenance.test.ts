// Maintenance closes the sockets open with 1012, and refuses new ones.
import { requestFiles } from '../../../scripts/requests.ts'
import { testApplication } from '@ultimabase/testing'
import { createClient } from 'graphql-ws'
import { afterEach, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { app } from './app.ts'
import { setMaintenance } from './maintenance.ts'

const running = testApplication(app)
const { document } = requestFiles(
	new URL('requests/', import.meta.url),
	running,
)

afterEach(() => setMaintenance(false))

it('closes the sockets open, then refuses new ones', async () => {
	const wsUrl = running.url.replace(/^http/, 'ws')
	const query = document('tasks')
	//#region closes
	const closes: unknown[] = []
	const client = createClient({
		url: `${wsUrl}/graphql`,
		retryAttempts: 0,
		on: { closed: (event) => closes.push(Reflect.get(Object(event), 'code')) },
	})
	const results = client.iterate({ query })
	await results.next()
	//#endregion
	//#region closes-feed
	const feed = new WebSocket(`${wsUrl}/tasks`)
	await new Promise((done) => feed.once('open', done))
	const feedClosed = new Promise((done) => feed.once('close', done))

	setMaintenance(true)
	expect(await feedClosed).toBe(1012)
	//#endregion

	//#region refused
	const refused = new WebSocket(`${wsUrl}/graphql`, 'graphql-transport-ws')
	const status = await new Promise((done) => {
		refused.once('unexpected-response', (_request, response) => {
			response.resume()
			done(response.statusCode)
		})
	})
	expect(status).toBe(503)
	//#endregion
	await client.dispose()
	expect(closes).toEqual([1012])
})
