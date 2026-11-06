// What a live list follows (D-252): `maxLive` counts the rows of the list, and
// nested rows stay bounded by their `take`.
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
		notes: f.many(() => Note, { inverse: 'gallery' }),
	}),
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
	models: [Gallery, Note],
	plugins: [realtimePlugin(), watching.plugin()],
})
beforeAll(async () => app.start())
afterAll(async () => app.stop())

/** What a live list of galleries answers: `undefined`, or its refusal. */
async function refusal(args: object): Promise<unknown> {
	if (api === undefined) throw new Error('No realtime API.')
	const viewer = await api.connect(new Request('http://localhost/'))
	try {
		await viewer.list('Gallery', args, () => undefined)
		return undefined
	} catch (error) {
		return error
	} finally {
		viewer.close()
	}
}

it('counts the rows of the list, not the rows nested in them', async () => {
	const include = { notes: { take: 1000 } }
	expect(await refusal({ first: 50_000, include })).toBeUndefined()
})

it('refuses to open a list past the limit, with it', async () => {
	expect(await refusal({ first: 50_001 })).toMatchObject({
		code: 'VALIDATION_FAILED',
		message: 'first is over 50000, the most a live list follows.',
		details: { limit: 50_000, rows: 50_001 },
	})
})

it('still needs a take on a nested list', async () => {
	expect(await refusal({ first: 1, include: { notes: true } })).toMatchObject({
		message: 'A live notes list needs a take.',
	})
})
