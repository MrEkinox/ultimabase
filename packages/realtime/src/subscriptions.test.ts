// A connection holds at most `maxSubscriptions` live reads, however many it
// opens at once while each plans (D-154).
import { asUser } from '@ultimabase/testing'
import { afterEach, expect, it } from 'vitest'
import type { PluginTypes } from 'ultimabase'
import { defineApp, defineModel, definePlugin, memory } from 'ultimabase'
import type { Realtime, RealtimeApi } from './index.ts'
import { realtime, realtimePlugin } from './index.ts'

/** Its reads plan slowly: those opened together all plan at once. */
const Slow = defineModel({
	name: 'Slow',
	use: [realtime()],
	fields: (f) => ({ title: f.string() }),
}).with({
	access: { read: () => true },
	hooks: {
		beforeFind: async () => {
			await new Promise((done) => setTimeout(done, 20))
		},
	},
})

interface Following extends PluginTypes {
	readonly name: 'following'
	readonly requires: Realtime
}
let api: RealtimeApi | undefined
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
	identify: async () => asUser({ id: 'ada' }),
})

const app = defineApp({
	database: memory(),
	models: [Slow],
	plugins: [realtimePlugin({ maxSubscriptions: 2 }), following.plugin()],
})

afterEach(async () => app.stop())

it('refuses the live reads opened at once past maxSubscriptions', async () => {
	await app.start()
	if (api === undefined) throw new Error('No realtime API.')
	const viewer = await api.connect(new Request('http://localhost/'))
	const args = { first: 1, orderBy: { title: 'asc' } }
	const opened = await Promise.allSettled(
		Array.from({ length: 5 }, async () =>
			viewer.list('Slow', args, () => undefined),
		),
	)
	const refused = 'A connection holds at most 2 live reads.'
	expect(
		opened.map((each) =>
			each.status === 'fulfilled' || !(each.reason instanceof Error)
				? each.status
				: each.reason.message,
		),
	).toEqual(['fulfilled', 'fulfilled', refused, refused, refused])
})
