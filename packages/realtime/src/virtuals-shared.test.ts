// The reads a live read's virtual fields make during a flush (D-295): the same
// read is one statement, and every subscriber still gets what it may see.
import { AsyncResource } from 'node:async_hooks'
import { asUser } from '@ultimabase/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { Adapter, Caller, PluginTypes } from 'ultimabase'
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
const nameOf = (caller: Caller): string =>
	caller.kind === 'user' ? caller.user.id : ''

/** The next run of `wrote` writes between two reads. */
let writing = false
/** What `wrote` read after writing. */
let afterItsWrite: number | undefined
/** A read made by `open`, for a test to run later. */
let kept: (() => Promise<number>) | undefined

const Project = defineModel({
	name: 'Project',
	use: [realtime()],
	fields: (f) => ({
		name: f.string(),
		open: f.virtual(z.int(), { needs: [] }),
		mine: f.virtual(z.int(), { needs: [] }),
		wrote: f.virtual(z.int(), { needs: [] }),
		touched: f.virtual(z.boolean(), { needs: [] }),
	}),
}).with({
	access: allow.public,
	virtuals: {
		open: {
			runMany: async ({ records }) => {
				const count = await Task.count({ where: { done: false } }, M)
				kept = AsyncResource.bind(async () =>
					Task.count({ where: { done: false } }, M),
				)
				return records.map(() => count)
			},
		},
		mine: {
			runMany: async ({ caller, records }) => {
				const count = await Secret.count({}, { as: caller })
				return records.map(() => count)
			},
		},
		wrote: {
			runMany: async ({ records }) => {
				const before = await Note.count({}, M)
				if (writing) {
					writing = false
					await Note.create({ data: { body: 'From a virtual.' } }, M)
					afterItsWrite = await Note.count({}, M)
				}
				return records.map(() => before)
			},
		},
		touched: {
			runMany: async ({ records }) => {
				const rows = await Task.findMany({ select: { data: true } }, M)
				const touched = rows.some(
					({ data }) => JSON.stringify(data) === '{"touched":true}',
				)
				for (const { data } of rows) {
					if (data instanceof Object) Reflect.set(data, 'touched', true)
				}
				return records.map(() => touched)
			},
		},
	},
})

const Task = defineModel({
	name: 'Task',
	fields: (f) => ({
		done: f.boolean({ default: false }),
		data: f.json({ optional: true }),
	}),
}).with({ access: allow.public })

/** Each user reads their own: the read names its caller. */
const Secret = defineModel({
	name: 'Secret',
	fields: (f) => ({ owner: f.string() }),
}).with({
	access: {
		read: ({ caller, where }) => where({ owner: { equals: nameOf(caller) } }),
	},
})

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ body: f.string() }),
}).with({ access: allow.public })

interface Watching extends PluginTypes {
	readonly name: 'watching'
	readonly requires: Realtime
}
let api: RealtimeApi | undefined
/** A request's `authorization` is its user's id. */
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
	identify: async (request) => {
		const id = request.headers.get('authorization')
		return id === null ? undefined : asUser({ id })
	},
})

/** How many counts the database ran. */
let counts = 0
let app: ReturnType<typeof defineApp> | undefined
let id = ''
const quiet = async () => new Promise((done) => setTimeout(done, 100))

beforeEach(async () => {
	writing = false
	afterItsWrite = undefined
	kept = undefined
	const database = memory()
	const counted: Adapter = {
		...database,
		count: async (read) => {
			counts += 1
			return database.count(read)
		},
	}
	app = defineApp({
		database: counted,
		models: [Project, Task, Secret, Note],
		plugins: [realtimePlugin(), watching.plugin()],
	})
	await app.start()
	id = (await Project.create({ data: { name: 'A' } }, M)).id
	await quiet()
})

afterEach(async () => {
	await app?.stop()
})

/** Follows the project as `user`, selecting one virtual. */
async function followed(
	field: 'open' | 'mine' | 'wrote' | 'touched',
	user: string,
): Promise<LiveMessage[]> {
	if (api === undefined) throw new Error('No realtime API.')
	const headers = { authorization: user }
	const viewer = await api.connect(
		new Request('http://localhost/', { headers }),
	)
	const seen: LiveMessage[] = []
	await viewer.row(
		'Project',
		{ where: { id }, select: { name: true, [field]: true } },
		(message: LiveMessage) => seen.push(message),
	)
	await vi.waitFor(() => expect(seen).toHaveLength(1))
	return seen
}

const each = async (field: 'open' | 'mine' | 'touched', users: string[]) =>
	Promise.all(users.map(async (user) => followed(field, user)))

describe('the reads virtual fields make during a flush', () => {
	it('sends one statement for the subscribers who read the same', async () => {
		const all = await each('open', ['a', 'b', 'c', 'd'])
		counts = 0
		await Task.create({ data: {} }, M)
		await vi.waitFor(() => {
			for (const seen of all) {
				expect(seen.at(-1)).toMatchObject({ row: { open: 1 } })
			}
		})
		expect(counts).toBe(1)
	})

	it('keeps its own read for a subscriber whose read names them', async () => {
		const [first, second] = await each('mine', ['a', 'b'])
		await Promise.all([
			Secret.create({ data: { owner: 'a' } }, M),
			Secret.create({ data: { owner: 'a' } }, M),
			Secret.create({ data: { owner: 'b' } }, M),
		])
		await vi.waitFor(() => {
			expect(first?.at(-1)).toMatchObject({ row: { mine: 2 } })
			expect(second?.at(-1)).toMatchObject({ row: { mine: 1 } })
		})
	})

	it('gives no subscriber a value another one changed', async () => {
		const all = await each('touched', ['a', 'b', 'c'])
		await Task.create({ data: { data: { touched: false } } }, M)
		await vi.waitFor(() => {
			for (const seen of all) expect(seen).toHaveLength(1)
		})
		await quiet()
		for (const seen of all) {
			expect(seen.at(-1)).toMatchObject({ row: { touched: false } })
		}
	})

	it('lets a virtual that writes read what it wrote', async () => {
		await followed('wrote', 'a')
		writing = true
		await Note.create({ data: { body: 'First.' } }, M)
		await vi.waitFor(() => expect(afterItsWrite).toBeDefined())
		expect(afterItsWrite).toBe(2)
	})

	it('reads what is stored once its flush ended', async () => {
		const seen = await followed('open', 'a')
		await Task.create({ data: {} }, M)
		await vi.waitFor(() =>
			expect(seen.at(-1)).toMatchObject({ row: { open: 1 } }),
		)
		const later = kept
		if (later === undefined) throw new Error('The virtual did not run.')
		await quiet()
		await Task.create({ data: {} }, M)
		await Task.create({ data: {} }, M)
		await expect(later()).resolves.toBe(3)
	})
})
