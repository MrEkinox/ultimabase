// A live read follows a `oneOf` (D-247) as it follows each kind's hidden
// `one`: a write to a kind's row sends again the rows that show it, a filter
// through a kind keeps the rows that pass, and a row moved to another kind
// is sent again.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PluginTypes } from 'ultimabase'
import {
	allow,
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from 'ultimabase'
import type { LiveMessage, Realtime, RealtimeApi } from './index.ts'
import { realtime, realtimePlugin } from './index.ts'

const M = { as: master }
const anyId: unknown = expect.any(String)

const Post = defineModel({
	name: 'Post',
	use: [realtime()],
	fields: (f) => ({
		title: f.string(),
		comments: f.many(() => Comment, { inverse: 'target' }),
	}),
}).with({ access: allow.public })

const Photo = defineModel({
	name: 'Photo',
	use: [realtime()],
	fields: (f) => ({
		title: f.string(),
		comments: f.many(() => Comment, { inverse: 'target' }),
	}),
}).with({ access: allow.public })

const Comment = defineModel({
	name: 'Comment',
	use: [realtime()],
	fields: (f) => ({
		body: f.string(),
		target: f.oneOf({ post: () => Post, photo: () => Photo }),
	}),
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

let app: ReturnType<typeof defineApp> | undefined
let loom = ''
let sky = ''
let a = ''

/** Waits past the engine's gather. */
const quiet = async () => new Promise((done) => setTimeout(done, 100))

beforeEach(async () => {
	app = defineApp({
		database: memory(),
		models: [Post, Photo, Comment],
		plugins: [realtimePlugin(), watching.plugin()],
	})
	await app.start()
	loom = (await Post.create({ data: { title: 'Loom' } }, M)).id
	sky = (await Photo.create({ data: { title: 'Sky' } }, M)).id
	a = (
		await Comment.create(
			{ data: { body: 'a', target: { connect: { post: { id: loom } } } } },
			M,
		)
	).id
	await Comment.create(
		{ data: { body: 'b', target: { connect: { photo: { id: sky } } } } },
		M,
	)
	await quiet()
})

afterEach(async () => {
	await app?.stop()
})

/** The messages of a live list of comments, read with `args`. */
async function followed(args: object): Promise<LiveMessage[]> {
	if (api === undefined) throw new Error('No realtime API.')
	const viewer = await api.connect(new Request('http://localhost/'))
	const seen: LiveMessage[] = []
	await viewer.list(
		'Comment',
		{ first: 10, orderBy: { body: 'asc' }, ...args },
		(message) => seen.push(message),
	)
	await vi.waitFor(() => expect(seen).toHaveLength(1))
	return seen
}

describe('a live list of a oneOf', () => {
	it('sends a row again when the kind it shows changes', async () => {
		const seen = await followed({
			select: { body: true, target: { post: { select: { title: true } } } },
		})
		expect(seen[0]).toMatchObject({
			rows: [
				{ body: 'a', target: { kind: 'post', post: { title: 'Loom' } } },
				{ body: 'b', target: { kind: 'photo' } },
			],
		})
		await Post.update({ where: { id: loom }, data: { title: 'Loft' } }, M)
		await vi.waitFor(() => expect(seen).toHaveLength(2))
		expect(seen[1]).toMatchObject({
			changes: [
				{
					upsert: {
						body: 'a',
						target: { kind: 'post', post: { title: 'Loft' } },
					},
				},
			],
		})
		await Comment.update(
			{
				where: { id: a },
				data: { target: { connect: { photo: { id: sky } } } },
			},
			M,
		)
		await vi.waitFor(() => expect(seen).toHaveLength(3))
		expect(seen[2]).toMatchObject({
			changes: [{ upsert: { body: 'a', target: { kind: 'photo' } } }],
		})
	})

	it('keeps the rows a filter through a kind passes', async () => {
		const seen = await followed({
			where: { target: { photo: { is: { title: { equals: 'Sky' } } } } },
			select: { body: true },
		})
		expect(seen[0]).toMatchObject({ rows: [{ body: 'b' }] })
		await Photo.update({ where: { id: sky }, data: { title: 'Dusk' } }, M)
		await vi.waitFor(() => expect(seen).toHaveLength(2))
		expect(seen[1]).toMatchObject({ changes: [{ remove: anyId }] })
		await Photo.update({ where: { id: sky }, data: { title: 'Sky' } }, M)
		await vi.waitFor(() => expect(seen).toHaveLength(3))
		await Comment.update(
			{
				where: { id: a },
				data: { target: { connect: { photo: { id: sky } } } },
			},
			M,
		)
		await vi.waitFor(() => expect(seen).toHaveLength(4))
		expect(seen[3]).toMatchObject({ changes: [{ upsert: { body: 'a' } }] })
	})

	it('keeps the rows a filter by kind passes', async () => {
		const seen = await followed({
			where: { target: { kind: 'post' } },
			select: { body: true },
		})
		expect(seen[0]).toMatchObject({ rows: [{ body: 'a' }] })
		await Comment.update(
			{
				where: { id: a },
				data: { target: { connect: { photo: { id: sky } } } },
			},
			M,
		)
		await vi.waitFor(() => expect(seen).toHaveLength(2))
		expect(seen[1]).toMatchObject({ changes: [{ remove: anyId }] })
	})
})
