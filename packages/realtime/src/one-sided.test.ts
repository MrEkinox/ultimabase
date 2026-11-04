// A live read follows a many-to-many declared on one side (D-248) through its
// target's hidden side: a write to a linked row sends again the rows that show
// it, and a filter through it keeps the rows that pass.
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

const Membership = defineModel({
	name: 'Membership',
	use: [realtime()],
	fields: (f) => ({ name: f.string() }),
}).with({ access: allow.public })

const Task = defineModel({
	name: 'Task',
	use: [realtime()],
	fields: (f) => ({
		name: f.string(),
		assignees: f.many(() => Membership, { inverse: false }),
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
let ann = ''
let task = ''

/** Waits past the engine's gather. */
const quiet = async () => new Promise((done) => setTimeout(done, 100))

beforeEach(async () => {
	app = defineApp({
		database: memory(),
		models: [Membership, Task],
		plugins: [realtimePlugin(), watching.plugin()],
	})
	await app.start()
	ann = (await Membership.create({ data: { name: 'Ann' } }, M)).id
	task = (
		await Task.create(
			{ data: { name: 'T', assignees: { connect: [{ id: ann }] } } },
			M,
		)
	).id
	await Task.create({ data: { name: 'U' } }, M)
	await quiet()
})

afterEach(async () => {
	await app?.stop()
})

/** The messages of a live list of tasks, read with `args`. */
async function followed(args: object): Promise<LiveMessage[]> {
	if (api === undefined) throw new Error('No realtime API.')
	const viewer = await api.connect(new Request('http://localhost/'))
	const seen: LiveMessage[] = []
	await viewer.list(
		'Task',
		{ first: 10, orderBy: { name: 'asc' }, ...args },
		(message) => seen.push(message),
	)
	await vi.waitFor(() => expect(seen).toHaveLength(1))
	return seen
}

describe('a live list of a one-sided many', () => {
	it('sends a row again when a row it shows changes', async () => {
		const seen = await followed({
			select: { name: true, assignees: { take: 5, select: { name: true } } },
		})
		expect(seen[0]).toMatchObject({
			rows: [
				{ name: 'T', assignees: [{ name: 'Ann' }] },
				{ name: 'U', assignees: [] },
			],
		})
		await Membership.update({ where: { id: ann }, data: { name: 'Ada' } }, M)
		await vi.waitFor(() => expect(seen).toHaveLength(2))
		expect(seen[1]).toMatchObject({
			changes: [{ upsert: { name: 'T', assignees: [{ name: 'Ada' }] } }],
		})
	})

	it('keeps the rows a filter through it passes', async () => {
		const seen = await followed({
			where: { assignees: { some: { name: 'Ann' } } },
			select: { name: true },
		})
		expect(seen[0]).toMatchObject({ rows: [{ name: 'T' }] })
		await Membership.update({ where: { id: ann }, data: { name: 'Ada' } }, M)
		await vi.waitFor(() => expect(seen).toHaveLength(2))
		expect(seen[1]).toMatchObject({ changes: [{ remove: anyId }] })
		await Membership.update({ where: { id: ann }, data: { name: 'Ann' } }, M)
		await vi.waitFor(() => expect(seen).toHaveLength(3))
		await Task.update(
			{ where: { id: task }, data: { assignees: { set: [] } } },
			M,
		)
		await vi.waitFor(() => expect(seen).toHaveLength(4))
		expect(seen[3]).toMatchObject({ changes: [{ remove: anyId }] })
	})
})
