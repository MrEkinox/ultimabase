// Each read of a shape sees only the rows that lead to its pins (D-258): what
// concerns which pin, read from the rows a flush's loader gives.
import { describe, expect, it, vi } from 'vitest'
import type { Row } from 'ultimabase'
import type { Batch, ModelChanges } from './changes.ts'
import { joined } from './changes.ts'
import { concernOf } from './concern.ts'
import { Held } from './needs.ts'
import type { Step } from './reach.ts'
import { Loader } from './reads.ts'
import type { Route, Shape } from './routes.ts'

const row = (id: string, more: object = {}): Row => ({
	id,
	createdAt: new Date(0),
	updatedAt: new Date(0),
	...more,
})
const set = (...ids: readonly string[]): ReadonlySet<string> => new Set(ids)
const batchOf = (model: string, changes: ModelChanges): Batch =>
	new Map([[model, changes]])

const shapeOf = (
	routes: readonly Route[],
	pin: Shape['pin'],
	links: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): Shape => ({
	key: 'shape',
	root: 'Chat',
	pin,
	routes,
	links,
	models: new Set(routes.map(({ model }) => model)),
})

const toChat: Step = {
	relation: 'notes',
	many: true,
	target: 'Note',
	inverse: 'chat',
	keyOnTarget: true,
}
const byId = { path: [], key: 'id' }
const own: Route = { steps: [], model: 'Chat', fields: 'all' }
const notes: Route = { steps: [toChat], model: 'Note', fields: 'all' }

/** A loader whose rows are `rows`, by model; nothing else may be read. */
function loaderOf(rows: { readonly [model: string]: readonly Row[] }): Loader {
	const loader = new Loader()
	vi.spyOn(loader, 'load').mockImplementation(async (model, ids) => {
		const found = (rows[model] ?? []).filter(({ id }) => ids.includes(id))
		return new Map(found.map((item) => [item.id, item]))
	})
	return loader
}

const pinned = async (
	shape: Shape,
	batch: Batch,
	loader = loaderOf({}),
): Promise<ReadonlyMap<string, Batch>> => {
	const found = await concernOf(shape, batch, loader)
	if (found === 'all') throw new Error('Expected pins.')
	return found
}

/** What `shape` answers of `batch`, on rows that nothing else may read. */
const answer = async (
	shape: Shape,
	batch: Batch,
	loader = loaderOf({}),
): Promise<ReadonlyMap<string, Batch> | 'all'> =>
	concernOf(shape, batch, loader)

describe('the rows a pin sees', () => {
	it('of its own model, each row for the id it is', async () => {
		const batch = batchOf('Chat', {
			inserts: set('a'),
			updates: set('b'),
			fields: set('name'),
		})
		const found = await pinned(shapeOf([own], byId), batch)
		expect([...found.keys()]).toEqual(['a', 'b'])
		expect(found.get('a')?.get('Chat')?.inserts).toEqual(set('a'))
		expect(found.get('b')?.get('Chat')).toEqual({
			updates: set('b'),
			fields: set('name'),
		})
	})

	it('nothing of an update that sets no field it reads', async () => {
		const route = { ...own, fields: set('name') }
		const batch = batchOf('Chat', { updates: set('a'), fields: set('other') })
		expect(await pinned(shapeOf([route], byId), batch)).toEqual(new Map())
	})

	it('through the key a row holds', async () => {
		const batch = batchOf('Chat', {
			updates: set('a', 'b', 'c'),
			fields: 'all',
		})
		const loader = loaderOf({
			Chat: [
				row('a', { room: 'r' }),
				row('b', { room: { id: 'r' } }),
				row('c', { room: null }),
			],
		})
		const shape = shapeOf([own], { path: [], key: 'room' })
		const found = await pinned(shape, batch, loader)
		expect([...found.keys()]).toEqual(['r'])
		expect(found.get('r')?.get('Chat')?.updates).toEqual(set('a', 'b'))
	})

	it('back along a route, whose walk answers `reaching` without a query', async () => {
		const batch = batchOf('Note', { inserts: set('n1', 'n2') })
		const loader = loaderOf({
			Note: [row('n1', { chat: 'a' }), row('n2', { chat: 'b' })],
		})
		const found = await pinned(shapeOf([notes], byId), batch, loader)
		expect(found.get('a')?.get('Note')?.inserts).toEqual(set('n1'))
		expect(found.get('b')?.get('Note')?.inserts).toEqual(set('n2'))
		await expect(loader.reaching('Chat', [toChat], ['n1'])).resolves.toEqual([
			'a',
		])
		await expect(
			loader.reaching('Chat', [toChat], ['n1', 'n2']),
		).resolves.toEqual(['a', 'b'])
	})

	it('back along a key its row stores, one read for what holds them', async () => {
		const toUser: Step = {
			relation: 'owner',
			many: false,
			target: 'User',
			keyOnTarget: false,
		}
		const route = { steps: [toUser], model: 'User', fields: 'all' as const }
		const loader = new Loader()
		const holding = vi
			.spyOn(loader, 'holding')
			.mockResolvedValue(new Map([['u', new Held([row('a'), row('b')])]]))
		const batch = batchOf('User', { updates: set('u'), fields: 'all' })
		const found = await pinned(shapeOf([route], byId), batch, loader)
		expect(holding).toHaveBeenCalledWith('Chat', 'owner', ['u'])
		expect([...found.keys()]).toEqual(['a', 'b'])
	})

	it('expects the rows it walked and the roots it reached (D-261)', async () => {
		const batch = batchOf('Note', { inserts: set('n1', 'n2') })
		const loader = loaderOf({
			Note: [row('n1', { chat: 'a' }), row('n2', { chat: 'b' })],
		})
		const expected = vi.spyOn(loader, 'expect')
		await pinned(shapeOf([notes], byId), batch, loader)
		expect(expected.mock.calls).toEqual([
			['Note', ['n1', 'n2']],
			['Chat', set('a', 'b')],
		])
	})

	it('of a many-to-many link, every row for each root it finds', async () => {
		const toTag: Step = {
			relation: 'tags',
			many: true,
			target: 'Tag',
			keyOnTarget: false,
		}
		const route = { steps: [toTag], model: 'Tag', fields: 'all' as const }
		const loader = new Loader()
		const reaching = vi.spyOn(loader, 'reaching').mockResolvedValue(['a', 'b'])
		const batch = batchOf('Tag', { updates: set('t', 'u'), fields: 'all' })
		const found = await pinned(shapeOf([route], byId), batch, loader)
		expect(reaching).toHaveBeenCalledWith('Chat', [toTag], ['t', 'u'])
		expect(found.get('a')?.get('Tag')?.updates).toEqual(set('t', 'u'))
		expect(found.get('b')?.get('Tag')?.updates).toEqual(set('t', 'u'))
	})

	it('forward along the pin, by the key of what its root holds', async () => {
		const toRoom: Step = {
			relation: 'room',
			many: false,
			target: 'Room',
			keyOnTarget: false,
		}
		const shape = shapeOf([own], { path: [toRoom], key: 'owner' })
		const loader = loaderOf({
			Chat: [row('a', { room: 'r' })],
			Room: [row('r', { owner: 'u' })],
		})
		const found = await pinned(
			shape,
			batchOf('Chat', { inserts: set('a') }),
			loader,
		)
		expect([...found.keys()]).toEqual(['u'])
	})

	it('forward along the pin, by what holds its root', async () => {
		const shape = shapeOf([own], { path: [toChat], key: 'id' })
		const loader = new Loader()
		vi.spyOn(loader, 'holding').mockResolvedValue(
			new Map([['a', new Held([row('n1'), row('n2')])]]),
		)
		const found = await pinned(
			shape,
			batchOf('Chat', { inserts: set('a') }),
			loader,
		)
		expect([...found.keys()]).toEqual(['n1', 'n2'])
	})

	it('of a deleted row, the pin it held', async () => {
		const keys = new Map([
			['a', { room: 'r' }],
			['b', { room: null }],
		])
		const found = await pinned(
			shapeOf([own], { path: [], key: 'room' }),
			batchOf('Chat', { deletes: set('a', 'b'), keys }),
		)
		expect([...found.keys()]).toEqual(['r'])
		expect(found.get('r')?.get('Chat')).toEqual({ deletes: set('a'), keys })
		const byOwn = await pinned(
			shapeOf([own], byId),
			batchOf('Chat', { deletes: set('a') }),
		)
		expect([...byOwn.keys()]).toEqual(['a'])
	})

	it('nothing of a model the shape does not read', async () => {
		const found = await pinned(
			shapeOf([own], byId),
			batchOf('Other', { inserts: set('a') }),
		)
		expect(found).toEqual(new Map())
	})
})

describe('every row, when no answer is sure', () => {
	it('a link moved', async () => {
		const links = new Map([['Note', set('chat')]])
		const shape = shapeOf([notes], byId, links)
		expect(
			await answer(
				shape,
				batchOf('Note', { updates: set('n'), fields: set('chat') }),
			),
		).toBe('all')
		expect(await answer(shape, batchOf('Note', { inserts: 'all' }))).toBe('all')
	})

	it('rows not listed', async () => {
		expect(
			await answer(shapeOf([own], byId), batchOf('Chat', { updates: 'all' })),
		).toBe('all')
	})

	it('a shape that pins nothing, once a row it reads changes', async () => {
		const shape = shapeOf([own], undefined)
		expect(await answer(shape, batchOf('Chat', { inserts: set('a') }))).toBe(
			'all',
		)
		await expect(
			concernOf(shape, batchOf('Other', { inserts: set('a') }), loaderOf({})),
		).resolves.toEqual(new Map())
		await expect(
			concernOf(
				shapeOf([{ ...own, fields: set('name') }], undefined),
				batchOf('Chat', { updates: set('a'), fields: set('other') }),
				loaderOf({}),
			),
		).resolves.toEqual(new Map())
	})

	it('a row deleted past the root', async () => {
		expect(
			await answer(
				shapeOf([notes], byId),
				batchOf('Note', { deletes: set('n') }),
			),
		).toBe('all')
	})

	it('a deleted row that does not say what it held', async () => {
		expect(
			await answer(
				shapeOf([own], { path: [], key: 'room' }),
				batchOf('Chat', { deletes: set('a') }),
			),
		).toBe('all')
		expect(
			await answer(
				shapeOf([own], { path: [toChat], key: 'id' }),
				batchOf('Chat', { deletes: set('a') }),
			),
		).toBe('all')
	})

	it('past what one read holds, walking back or forward', async () => {
		const toUser: Step = {
			relation: 'owner',
			many: false,
			target: 'User',
			keyOnTarget: false,
		}
		const route = { steps: [toUser], model: 'User', fields: 'all' as const }
		const toRows = new Loader()
		vi.spyOn(toRows, 'holding').mockResolvedValue(new Map([['u', undefined]]))
		vi.spyOn(toRows, 'reaching').mockResolvedValue(undefined)
		expect(
			await answer(
				shapeOf([route], byId),
				batchOf('User', { updates: set('u'), fields: 'all' }),
				toRows,
			),
		).toBe('all')
		const forward = new Loader()
		vi.spyOn(forward, 'holding').mockResolvedValue(new Map([['a', undefined]]))
		expect(
			await answer(
				shapeOf([own], { path: [toChat], key: 'id' }),
				batchOf('Chat', { inserts: set('a') }),
				forward,
			),
		).toBe('all')
	})

	it('past what one read holds of a many-to-many link', async () => {
		const toTag: Step = {
			relation: 'tags',
			many: true,
			target: 'Tag',
			keyOnTarget: false,
		}
		const route = { steps: [toTag], model: 'Tag', fields: 'all' as const }
		const loader = new Loader()
		vi.spyOn(loader, 'reaching').mockResolvedValue(undefined)
		const batch = batchOf('Tag', { updates: set('t'), fields: 'all' })
		expect(await concernOf(shapeOf([route], byId), batch, loader)).toBe('all')
	})
})

describe('the rows of several pins', () => {
	it('join, keeping what a batch says of the fields and of every row', () => {
		const one = batchOf('Chat', { updates: set('a'), fields: set('name') })
		const two = new Map<string, ModelChanges>([
			['Chat', { updates: set('b'), inserts: set('c'), fields: set('name') }],
			['Note', { deletes: set('n') }],
		])
		const every = batchOf('Chat', { updates: 'all', fields: set('name') })
		expect(joined([one, two])).toEqual(
			new Map<string, ModelChanges>([
				[
					'Chat',
					{
						updates: set('a', 'b'),
						inserts: set('c'),
						fields: set('name'),
					},
				],
				['Note', { deletes: set('n') }],
			]),
		)
		expect(joined([one, every]).get('Chat')?.updates).toBe('all')
	})
})
