// Missed changes (D-318): every viewer reads its live reads again, a few at a
// time between flushes, so a write is not held until every viewer read again.
import { asUser } from '@ultimabase/testing'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Feed, PluginTypes } from 'ultimabase'
import {
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from 'ultimabase'
import type { LiveMessage, Realtime, RealtimeApi } from './index.ts'
import { realtime, realtimePlugin } from './index.ts'

const M = { as: master }

const Note = defineModel({
	name: 'Note',
	use: [realtime()],
	fields: (f) => ({ text: f.string() }),
}).with({ access: { read: () => true } })

interface Following extends PluginTypes {
	readonly name: 'following'
	readonly requires: Realtime
}
let api: RealtimeApi | undefined
/** Once set, the first build writes a note and every build takes 10 ms. */
let slow = false
let written: Promise<unknown> | undefined
/** Keeps the realtime API; a request's `authorization` is its user's id. */
const following = definePlugin<Following>({
	name: 'following',
	manifest: {
		name: 'following',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	requires: { realtime: realtimePlugin },
	api: ({ plugins }) => {
		api = plugins.realtime
	},
	identify: async (request) => {
		if (slow) {
			written ??= Note.create({ data: { text: 'new' } }, M)
			await new Promise((done) => setTimeout(done, 10))
		}
		const id = request.headers.get('authorization')
		return id === null ? undefined : asUser({ id })
	},
})

let app: ReturnType<typeof defineApp>
let feed: Feed | undefined
beforeEach(async () => {
	slow = false
	written = undefined
	const database = memory()
	app = defineApp({
		database: {
			...database,
			start: async (schema, log, given) => {
				feed = given
				return database.start(schema, log, given)
			},
		},
		models: [Note],
		plugins: [realtimePlugin(), following.plugin()],
	})
	await app.start()
})
afterEach(async () => app.stop())

it('tells a write before it read every viewer again', async () => {
	// Three turns of reads: the write's flush comes before the last one.
	const viewers = 96
	const heard: LiveMessage[][] = []
	for (let n = 0; n < viewers; n += 1) {
		if (api === undefined) throw new Error('No realtime API.')
		const viewer = await api.connect(
			new Request('http://localhost/', { headers: { authorization: `u${n}` } }),
		)
		const told: LiveMessage[] = []
		heard.push(told)
		await viewer.list('Note', { first: 5 }, (message) => told.push(message))
	}
	slow = true
	feed?.missed()
	await vi.waitFor(
		() =>
			expect(
				heard.every((told) =>
					told.slice(1).some(({ kind }) => kind === 'reset'),
				),
			).toBe(true),
		{ timeout: 5000 },
	)
	await written
	// Every viewer read again before the write would tell it in each reset.
	expect(heard.some((told) => told[1]?.kind === 'changes')).toBe(true)
})
