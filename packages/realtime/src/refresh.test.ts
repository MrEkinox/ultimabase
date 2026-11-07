// The refresh (D-154, D-315): each caller is built again on its own timer, a
// few at a time between flushes, so a write is not held until every caller
// was built again.
import { asUser } from '@ultimabase/testing'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PluginTypes } from 'ultimabase'
import {
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from 'ultimabase'
import type { Realtime, RealtimeApi } from './index.ts'
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
/** The builds that ended since `slow` was set. */
let built = 0
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
			built += 1
		}
		const id = request.headers.get('authorization')
		return id === null ? undefined : asUser({ id })
	},
})

let app: ReturnType<typeof defineApp>
beforeEach(async () => {
	slow = false
	built = 0
	written = undefined
	app = defineApp({
		database: memory(),
		models: [Note],
		plugins: [realtimePlugin({ refresh: 200 }), following.plugin()],
	})
	await app.start()
})
afterEach(async () => app.stop())

it('tells a write before it built every caller again', async () => {
	const viewers = 64
	/** For each viewer, the builds ended when each of its messages came. */
	const heard: number[][] = []
	for (let n = 0; n < viewers; n += 1) {
		if (api === undefined) throw new Error('No realtime API.')
		const viewer = await api.connect(
			new Request('http://localhost/', { headers: { authorization: `u${n}` } }),
		)
		const told: number[] = []
		heard.push(told)
		await viewer.list('Note', { first: 5 }, () => told.push(built))
	}
	slow = true
	await vi.waitFor(
		() => expect(heard.every((told) => told.length >= 2)).toBe(true),
		{ timeout: 5000 },
	)
	await written
	// Every caller built again before the write would be 64 for each.
	expect(Math.max(...heard.map((told) => told[1] ?? viewers))).toBeLessThan(
		viewers,
	)
})
