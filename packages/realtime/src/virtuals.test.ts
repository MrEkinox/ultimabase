// A live read follows its virtual fields' reads: a write to a row one read
// sends the rows it was computed for again, with their new value.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
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
import { Loader } from './loader.ts'
import { VirtualReads } from './virtuals.ts'

const M = { as: master }
let runs = 0
/** What a run waits for once it read, when a test holds it. */
let gate: Promise<void> | undefined

const Project = defineModel({
	name: 'Project',
	use: [realtime()],
	fields: (f) => ({
		name: f.string(),
		tasks: f.many(() => Task, { inverse: 'project' }),
		openTasks: f.virtual(z.int(), { needs: [] }),
	}),
}).with({
	// Its access reads its rows: a filter through it reads them too.
	access: { read: ({ where }) => where({ name: { not: 'Hidden' } }) },
	virtuals: {
		openTasks: {
			runMany: async ({ caller, records }) => {
				runs += 1
				const ids = records.map(({ id }) => id)
				const groups = await Task.groupBy(
					{
						by: ['project'],
						_count: true,
						where: { project: { is: { id: { in: ids } } }, done: false },
					},
					{ as: caller },
				)
				const counts = new Map(
					groups.map((group) => [group.project?.id, group._count]),
				)
				await gate
				return ids.map((id) => counts.get(id) ?? 0)
			},
		},
	},
})

const Task = defineModel({
	name: 'Task',
	fields: (f) => ({
		done: f.boolean({ default: false }),
		project: f.one(() => Project),
	}),
}).with({ access: allow.public })

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ body: f.string() }),
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
let a = ''
let b = ''

/** Waits past the engine's gather. */
const quiet = async () => new Promise((done) => setTimeout(done, 100))

beforeEach(async () => {
	app = defineApp({
		database: memory(),
		models: [Project, Task, Note],
		plugins: [realtimePlugin(), watching.plugin()],
	})
	await app.start()
	a = (await Project.create({ data: { name: 'A' } }, M)).id
	b = (await Project.create({ data: { name: 'B' } }, M)).id
	await quiet()
})

afterEach(async () => {
	await app?.stop()
})

async function followed(row: boolean): Promise<LiveMessage[]> {
	if (api === undefined) throw new Error('No realtime API.')
	const viewer = await api.connect(new Request('http://localhost/'))
	const seen: LiveMessage[] = []
	const send = (message: LiveMessage) => seen.push(message)
	const select = { select: { name: true, openTasks: true } }
	await (row
		? viewer.row('Project', { where: { id: a }, ...select }, send)
		: viewer.list(
				'Project',
				{ first: 10, orderBy: { name: 'asc' }, ...select },
				send,
			))
	await vi.waitFor(() => expect(seen).toHaveLength(1))
	return seen
}

const task = async (project: string) =>
	Task.create({ data: { project: { connect: { id: project } } } }, M)

describe('a virtual that reads another model', () => {
	it('sends a live row again when a row it read changes', async () => {
		const seen = await followed(true)
		expect(seen[0]).toMatchObject({ row: { name: 'A', openTasks: 0 } })
		const created = await task(a)
		await vi.waitFor(() => expect(seen).toHaveLength(2))
		expect(seen[1]).toMatchObject({ row: { name: 'A', openTasks: 1 } })
		await Task.update({ where: { id: created.id }, data: { done: true } }, M)
		await vi.waitFor(() => expect(seen).toHaveLength(3))
		expect(seen[2]).toMatchObject({ row: { name: 'A', openTasks: 0 } })
	})

	it('follows a write made during its first read, out of its reach', async () => {
		if (api === undefined) throw new Error('No realtime API.')
		const viewer = await api.connect(new Request('http://localhost/'))
		const seen: LiveMessage[] = []
		const { promise, resolve: release } = Promise.withResolvers<void>()
		gate = promise
		runs = 0
		const opening = viewer.row(
			'Project',
			{ where: { id: a }, select: { name: true, openTasks: true } },
			(message) => seen.push(message),
		)
		await vi.waitFor(() => expect(runs).toBe(1))
		await new Promise((done) => setTimeout(done, 20))
		await task(a)
		await quiet()
		gate = undefined
		release()
		await opening
		await vi.waitFor(() =>
			expect(seen.at(-1)).toMatchObject({ row: { openTasks: 1 } }),
		)
	})

	it('sends again only the rows of a live list whose value changed', async () => {
		const seen = await followed(false)
		await Note.create({ data: { body: 'n' } }, M)
		await quiet()
		expect(seen).toHaveLength(1)
		await task(b)
		await vi.waitFor(() => expect(seen).toHaveLength(2))
		// A's count did not change: only B is sent.
		expect(seen[1]).toMatchObject({
			kind: 'changes',
			changes: [{ upsert: { name: 'B', openTasks: 1 }, after: a }],
		})
	})

	it('reads a row again only for a write to a row its virtuals read', async () => {
		const seen = await followed(true)
		const before = runs
		await task(b)
		await quiet()
		expect(runs).toBe(before)
		await task(a)
		await vi.waitFor(() => expect(seen).toHaveLength(2))
		expect(seen[1]).toMatchObject({ row: { name: 'A', openTasks: 1 } })
	})
})

describe('the reads of many rows', () => {
	it('reads again more rows than a call takes arguments', async () => {
		// A spread of this many items into a call overflows the stack.
		const many = 200_000
		const reads = new VirtualReads()
		const nodes = Array.from({ length: many }, (_, at) => ({ id: `${at}` }))
		reads.keep(nodes, [{ model: 'Note' }])
		const batch = new Map([['Note', { inserts: 'all' as const }]])
		const changed = await reads.changed(batch, new Loader(), async (ids) => {
			const read = ids.map((id) => ({ id, body: 'new' }))
			reads.keep(read, [{ model: 'Note' }])
			return Promise.resolve(new Map(read.map((node) => [node.id, node])))
		})
		expect(changed.size).toBe(many)
	}, 30_000)
})
