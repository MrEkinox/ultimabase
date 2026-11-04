// What a live list follows (D-154): a nested `many` counts its take, or its
// `size.max` when that is smaller (D-242).
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PluginTypes } from 'ultimabase'
import { allow, defineApp, defineModel, definePlugin, memory } from 'ultimabase'
import type { Realtime, RealtimeApi } from './index.ts'
import { realtime, realtimePlugin } from './index.ts'

const Gallery = defineModel({
	name: 'Gallery',
	use: [realtime()],
	fields: (f) => ({
		title: f.string(),
		images: f.many(() => Image, { inverse: 'gallery', size: { max: 10 } }),
		notes: f.many(() => Note, { inverse: 'gallery' }),
	}),
}).with({ access: allow.public })

const Image = defineModel({
	name: 'Image',
	use: [realtime()],
	fields: (f) => ({ url: f.string(), gallery: f.one(() => Gallery) }),
}).with({ access: allow.public })

const Note = defineModel({
	name: 'Note',
	use: [realtime()],
	fields: (f) => ({ text: f.string(), gallery: f.one(() => Gallery) }),
}).with({ access: allow.public })

interface Watching extends PluginTypes {
	readonly name: 'watching'
	readonly requires: Realtime
}
let api: RealtimeApi | undefined
const watching = definePlugin<Watching>({
	name: 'watching',
	manifest: {
		name: 'watching',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	requires: { realtime: realtimePlugin },
	api: ({ plugins }) => {
		api = plugins.realtime
	},
})

const app = defineApp({
	database: memory(),
	models: [Gallery, Image, Note],
	plugins: [realtimePlugin(), watching.plugin()],
})
beforeAll(async () => app.start())
afterAll(async () => app.stop())

/** The rows a live list of galleries refuses to follow, from its details. */
async function refused(include: object): Promise<unknown> {
	if (api === undefined) throw new Error('No realtime API.')
	const viewer = await api.connect(new Request('http://localhost/'))
	try {
		await viewer.list('Gallery', { first: 100, include }, () => undefined)
		return undefined
	} catch (error) {
		return error
	} finally {
		viewer.close()
	}
}

// Regression (#212): a take past `size.max` counted rows that cannot exist.
it('counts a bounded many at its size.max', async () => {
	// 100 × (1 + 10) rows, not 100 × (1 + 100).
	expect(await refused({ images: { take: 100 } })).toMatchObject({
		details: { limit: 1000, rows: 1100 },
	})
	expect(await refused({ images: { take: 9 } })).toBeUndefined()
	// An unbounded many counts its take.
	expect(await refused({ notes: { take: 100 } })).toMatchObject({
		details: { rows: 10_100 },
	})
})
