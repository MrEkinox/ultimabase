// Maintenance closes the sockets open with 1012, and refuses new ones.
import { testApplication } from '@ultimabase/testing'
import { createClient } from 'graphql-ws'
import { afterEach, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { app } from './app.ts'
import { setMaintenance } from './maintenance.ts'

const running = testApplication(app)
const ws = () => running.url.replace(/^http/, 'ws')

afterEach(() => setMaintenance(false))

it('closes the sockets open, then refuses new ones', async () => {
	//#region maintenance
	const closes: unknown[] = []
	const client = createClient({
		url: `${ws()}/graphql`,
		retryAttempts: 0,
		on: { closed: (event) => closes.push(Reflect.get(Object(event), 'code')) },
	})
	const results = client.iterate({
		query: `subscription { tasks(first: 10) { edges { node { title } } } }`,
	})
	await results.next()
	const feed = new WebSocket(`${ws()}/tasks`)
	await new Promise((done) => feed.once('open', done))
	const feedClosed = new Promise((done) => feed.once('close', done))

	setMaintenance(true)
	expect(await feedClosed).toBe(1012)

	const refused = new WebSocket(`${ws()}/graphql`, 'graphql-transport-ws')
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
