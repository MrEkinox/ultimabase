// A window refills from the keys it holds (D-288), whatever the database
// already says of its rows: the database runs ahead of a flush, on another
// process's write or on a `grow` during a burst.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type {
	Adapter,
	Changed,
	Feed,
	Logger,
	PluginTypes,
	Row,
} from 'ultimabase'
import {
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from 'ultimabase'
import type { LiveHandle, LiveMessage, Realtime, RealtimeApi } from './index.ts'
import { realtime, realtimePlugin } from './index.ts'

const M = { as: master }
const Item = defineModel({
	name: 'Item',
	fields: (f) => ({
		rank: f.number({ integer: true }),
		at: f.dateTime({ optional: true }),
	}),
	use: [realtime()],
}).with({ access: { read: () => true } })

const errors: unknown[] = []
const logger: Logger = {
	info: () => undefined,
	warn: () => undefined,
	error: (first: string | object, message?: string) => {
		errors.push(message ?? first)
	},
	child: () => logger,
}
let api: RealtimeApi | undefined
interface Following extends PluginTypes {
	readonly name: 'following'
	readonly requires: Realtime
}
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
	identify: async () => undefined,
})

/** memory(), whose notifications wait while `held`, as a slow process's. */
function delayed(): {
	readonly database: Adapter
	readonly hold: () => void
	readonly release: () => void
} {
	const database = memory()
	let held: (readonly Changed[])[] | undefined
	let feed: Feed | undefined
	return {
		database: {
			...database,
			start: async (schema, log, given) => {
				feed = given
				const holding: Feed | undefined = given && {
					changed: (changes) => {
						if (held === undefined) given.changed(changes)
						else held.push(changes)
					},
					missed: () => given.missed(),
				}
				return database.start(schema, log, holding)
			},
		},
		hold: () => {
			held = []
		},
		release: () => {
			const waiting = held ?? []
			held = undefined
			for (const changes of waiting) feed?.changed(changes)
		},
	}
}

let running: ReturnType<typeof delayed>
let app: ReturnType<typeof defineApp>
beforeEach(async () => {
	errors.length = 0
	running = delayed()
	app = defineApp({
		database: running.database,
		models: [Item],
		plugins: [realtimePlugin(), following.plugin()],
		logger,
	})
	await app.start()
})
afterEach(async () => app.stop())

const quiet = async (): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, 120)
	})

/** A client's copy of a list in `orderBy`, its first `first` rows. */
async function followed(
	first: number,
	orderBy: readonly object[] = [{ rank: 'asc' }],
): Promise<{
	readonly handle: LiveHandle
	readonly copy: { rows: Row[]; hasMore: boolean }
}> {
	if (api === undefined) throw new Error('No realtime API.')
	const viewer = await api.connect(new Request('http://localhost/'))
	if (viewer === undefined) throw new Error('No viewer.')
	const copy: { rows: Row[]; hasMore: boolean } = { rows: [], hasMore: false }
	const take = (message: LiveMessage): void => {
		if (message.kind === 'reset') {
			copy.rows = [...message.rows]
			copy.hasMore = message.hasMore
		}
		if (message.kind !== 'changes') return
		for (const change of message.changes) {
			if ('remove' in change) {
				copy.rows = copy.rows.filter(({ id }) => id !== change.remove)
				continue
			}
			const rows = copy.rows.filter(({ id }) => id !== change.upsert.id)
			const after = rows.findIndex(({ id }) => id === change.after)
			rows.splice(after + 1, 0, change.upsert)
			copy.rows = rows
		}
		copy.hasMore = message.hasMore ?? copy.hasMore
	}
	const args = {
		select: { id: true, rank: true },
		orderBy,
		first,
	}
	const handle = await viewer.list('Item', args, take)
	return { handle, copy }
}

const ranks = (rows: readonly Row[]): readonly unknown[] =>
	rows.map(({ rank }) => rank)
const seed = async (...values: readonly number[]): Promise<Row[]> => {
	const rows: Row[] = []
	for (const rank of values) {
		rows.push(await Item.create({ data: { rank } }, M))
	}
	await quiet()
	return rows
}
const row = (rows: readonly Row[], at: number): { readonly id: string } => {
	const found = rows[at]
	if (found === undefined) throw new Error('No row.')
	return { id: found.id }
}

it('skips nothing when the row it reads after has moved', async () => {
	const rows = await seed(10, 20, 30, 40, 50, 60)
	// Two shown, the third held to know that more follow.
	const { handle, copy } = await followed(2)
	expect(ranks(copy.rows)).toEqual([10, 20])
	running.hold()
	await Item.update({ where: row(rows, 2), data: { rank: 55 } }, M)
	await handle.grow(2)
	running.release()
	await vi.waitFor(() => expect(ranks(copy.rows)).toEqual([10, 20, 40, 50]))
	await quiet()
	expect(ranks(copy.rows)).toEqual([10, 20, 40, 50])
	expect(copy.hasMore).toBe(true)
	expect(errors).toEqual([])
})

it('still knows what follows when the row it reads after is gone', async () => {
	const rows = await seed(10, 20, 30, 40, 50, 60)
	const { handle, copy } = await followed(2)
	running.hold()
	await Item.delete({ where: row(rows, 2) }, M)
	await handle.grow(2)
	running.release()
	await vi.waitFor(() => expect(ranks(copy.rows)).toEqual([10, 20, 40, 50]))
	await quiet()
	expect(ranks(copy.rows)).toEqual([10, 20, 40, 50])
	expect(copy.hasMore).toBe(true)
	expect(errors).toEqual([])
})

it('does not take twice a row it holds, found further on', async () => {
	const rows = await seed(10, 20, 30, 40, 50, 60)
	const { handle, copy } = await followed(2)
	running.hold()
	await Item.update({ where: row(rows, 0), data: { rank: 45 } }, M)
	await handle.grow(2)
	running.release()
	await vi.waitFor(() => expect(ranks(copy.rows)).toEqual([20, 30, 40, 45]))
	await quiet()
	const ids = copy.rows.map(({ id }) => id)
	expect(new Set(ids).size).toBe(ids.length)
	expect(ranks(copy.rows)).toEqual([20, 30, 40, 45])
	expect(copy.hasMore).toBe(true)
	expect(errors).toEqual([])
})

it('reads on past the rows it holds when a page brings only those', async () => {
	const rows = await seed(10, 20, 30, 40, 50)
	const { handle, copy } = await followed(3)
	expect(ranks(copy.rows)).toEqual([10, 20, 30])
	running.hold()
	// Past the row it reads after, in the order of the next page.
	await Item.update({ where: row(rows, 0), data: { rank: 41 } }, M)
	await Item.update({ where: row(rows, 1), data: { rank: 42 } }, M)
	await handle.grow(1)
	running.release()
	await vi.waitFor(() => expect(ranks(copy.rows)).toEqual([30, 40, 41, 42]))
	await quiet()
	expect(ranks(copy.rows)).toEqual([30, 40, 41, 42])
	expect(copy.hasMore).toBe(true)
	expect(errors).toEqual([])
})

it('refills each window from its own keys when lists share a plan', async () => {
	const rows: Row[] = []
	for (const rank of [10, 20, 30, 40, 50, 60]) {
		// Each list holds its own copy of a date: equal ones share a page.
		const at = new Date(Date.UTC(2026, 0, rank))
		rows.push(await Item.create({ data: { rank, at } }, M))
	}
	await quiet()
	const byDate = [{ at: 'asc' }]
	const lists = [
		await followed(2, byDate),
		await followed(2, byDate),
		await followed(3, byDate),
	]
	await Item.delete({ where: row(rows, 0) }, M)
	const shown = [
		[20, 30],
		[20, 30],
		[20, 30, 40],
	]
	await vi.waitFor(() =>
		expect(lists.map(({ copy }) => ranks(copy.rows))).toEqual(shown),
	)
	await Item.delete({ where: row(rows, 1) }, M)
	await vi.waitFor(() =>
		expect(lists.map(({ copy }) => ranks(copy.rows))).toEqual([
			[30, 40],
			[30, 40],
			[30, 40, 50],
		]),
	)
	expect(lists.map(({ copy }) => copy.hasMore)).toEqual([true, true, true])
	expect(errors).toEqual([])
})
