// A long turn of the event loop is not the database's silence (D-287): the
// answer waits in the socket, and only the process was late to read it.
import { testApplication } from '@ultimabase/testing'
import type { Logger } from 'ultimabase'
import { defineApp, defineModel, definePlugin } from 'ultimabase'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAdapter } from './adapter.ts'
import { pulse } from './listen.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const [server = ''] = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

const warned: string[] = []
const logger: Logger = {
	info: () => undefined,
	warn: (message) => warned.push(JSON.stringify(message)),
	error: () => undefined,
	child: () => logger,
}
let missed = 0
const watcher = definePlugin({
	name: 'watcher',
	manifest: {
		name: 'watcher',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	changed: () => undefined,
	missed: () => {
		missed += 1
	},
})
const Card = defineModel({
	name: 'Card',
	fields: (f) => ({ title: f.string() }),
})

const quick = { ...pulse }
beforeAll(() => {
	pulse.every = 1
	pulse.silence = 500
})
afterAll(() => {
	Object.assign(pulse, quick)
})

describe('a long turn of the event loop', () => {
	testApplication(
		defineApp({
			database: createAdapter({ url: server }),
			models: [Card],
			logger,
			plugins: [watcher.plugin()],
		}),
		{ database: 'declared' },
	)

	it('does not pass for the silence of the database', async () => {
		// Questions leave about every millisecond: several turns catch one in
		// flight. A turn after the sockets were read: timers come next, not them.
		for (let round = 0; round < 8; round += 1) {
			await new Promise((resolve) => setTimeout(resolve, 7))
			await new Promise((resolve) => setImmediate(resolve))
			const end = Date.now() + pulse.silence + 100
			while (Date.now() < end);
		}
		await new Promise((resolve) => setTimeout(resolve, 50))
		expect(warned).toEqual([])
		expect(missed).toBe(0)
	}, 15_000)
})
