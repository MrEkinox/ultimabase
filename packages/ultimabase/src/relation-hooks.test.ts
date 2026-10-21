// Hooks across relations (D-71, D-88): `beforeFind` at every level, relation
// values a hook or a default writes, and the update hooks of a moved row.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Caller } from './index.ts'
import { defineApp, defineModel, master, memory } from './index.ts'
import { query } from './engine.ts'

const M = { as: master }
const finds: string[] = []

const Shelf = defineModel({
	name: 'Shelf',
	fields: (f) => ({
		label: f.string({ unique: true }),
		items: f.many(() => Item),
	}),
}).with({
	hooks: {
		// Runs, narrows nothing.
		beforeFind: async () => {
			await Promise.resolve()
			finds.push('Shelf')
		},
	},
})

const Item = defineModel({
	name: 'Item',
	fields: (f) => ({
		name: f.string(),
		gone: f.boolean({ default: false }),
		shelf: f.one(() => Shelf, { optional: true }),
	}),
}).with({
	hooks: {
		beforeFind: ({ where }) => {
			finds.push('Item')
			return where({ gone: { equals: false } })
		},
	},
})

let spare: { readonly id: string } | undefined
let entryPatch: object = {}

const Vault = defineModel({
	name: 'Vault',
	fields: (f) => ({
		open: f.boolean(),
		gone: f.boolean({ default: false }),
		entries: f.many(() => Entry, { inverse: 'vault' }),
		spares: f.many(() => Entry, { inverse: 'spare' }),
	}),
}).with({
	access: {
		read: ({ where }) => where({ open: { equals: true } }),
		write: () => true,
	},
	hooks: { beforeFind: ({ where }) => where({ gone: { equals: false } }) },
})

const Entry = defineModel({
	name: 'Entry',
	fields: (f) => ({
		vault: f.one(() => Vault, { optional: true, inverse: 'entries' }),
		spare: f.one(() => Vault, {
			optional: true,
			inverse: 'spares',
			default: () => spare,
		}),
	}),
}).with({
	access: { read: () => true, write: () => true },
	hooks: {
		beforeCreate: ({ data }) => {
			Object.assign(data, entryPatch)
		},
	},
})

const log: string[] = []
const facts = new Map<string, unknown>()
let penPatch: object = {}
let dropped: string | undefined

const Desk = defineModel({
	name: 'Desk',
	fields: (f) => ({ label: f.string(), pens: f.many(() => Pen) }),
}).with({
	hooks: {
		afterUpdate: async () => {
			if (dropped === undefined) return
			await query('Pen', 'delete', { where: { id: dropped } }, M)
		},
	},
})

const Pen = defineModel({
	name: 'Pen',
	fields: (f) => ({
		color: f.string(),
		note: f.string({ optional: true }),
		desk: f.one(() => Desk, { optional: true }),
	}),
}).with({
	hooks: {
		beforeUpdate: ({ record, data }) => {
			log.push('beforeUpdate')
			facts.set('beforeUpdate', { record, data: { ...data } })
			Object.assign(data, penPatch)
		},
		afterUpdate: ({ record, previous }) => {
			log.push('afterUpdate')
			facts.set('afterUpdate', { record, previous })
		},
		afterUpdateCommit: () => {
			log.push('afterUpdateCommit')
		},
	},
})

let app: ReturnType<typeof started>
const started = () =>
	defineApp({
		database: memory(),
		models: [Shelf, Item, Vault, Entry, Desk, Pen],
	})

// The kernel reads only the user's id.
const isCaller = (value: unknown): value is Caller =>
	typeof value === 'object' && value !== null
function user(id: string): { readonly as: Caller } {
	const as: unknown = { kind: 'user', user: { id } }
	if (!isCaller(as)) throw new Error('A caller is an object.')
	return { as }
}
const ada = user('ada')

beforeEach(async () => {
	app = started()
	await app.start()
	finds.length = 0
	log.length = 0
	facts.clear()
	spare = undefined
	entryPatch = {}
	penPatch = {}
	dropped = undefined
})
afterEach(async () => {
	await app.stop()
})

describe('beforeFind', () => {
	let shelf: string
	let kept: string
	let gone: string

	beforeEach(async () => {
		shelf = (await Shelf.create({ data: { label: 'A' } }, M)).id
		const item = async (name: string, hidden: boolean) =>
			(
				await Item.create(
					{
						data: { name, gone: hidden, shelf: { connect: { id: shelf } } },
					},
					M,
				)
			).id
		kept = await item('kept', false)
		gone = await item('gone', true)
		finds.length = 0
	})

	it('narrows every read, Master included', async () => {
		const items = await Item.findMany({}, M)
		expect(items.map((row) => row.name)).toEqual(['kept'])
		expect(await Item.count({}, M)).toBe(1)
		expect(await Item.findUnique({ where: { id: gone } }, M)).toBeNull()
	})

	it('narrows includes and relation filters', async () => {
		const shelves = await Shelf.findMany({ include: { items: true } }, M)
		expect(shelves[0]?.items.map((row) => row.name)).toEqual(['kept'])
		const where = { items: { some: { name: { equals: 'gone' } } } }
		expect(await Shelf.count({ where }, M)).toBe(0)
	})

	it('runs once per query, only for the models it reaches', async () => {
		await Item.findMany({}, M)
		expect(finds).toEqual(['Item'])
		finds.length = 0
		const where = { items: { some: { name: { equals: 'kept' } } } }
		await Shelf.findMany({ where, include: { items: true } }, M)
		expect(finds.toSorted()).toEqual(['Item', 'Shelf'])
	})

	it('hides its rows from writes', async () => {
		const missing = { code: 'NOT_FOUND' }
		const data = { name: 'x' }
		const where = { id: gone }
		await expect(Item.update({ where, data }, M)).rejects.toMatchObject(missing)
		await expect(Item.delete({ where }, M)).rejects.toMatchObject(missing)
		const connect = { items: { connect: [{ id: gone }] } }
		const at = { id: shelf }
		await expect(
			Shelf.update({ where: at, data: connect }, M),
		).rejects.toMatchObject(missing)
	})

	it('leaves the rows it hides out of a disconnect', async () => {
		const items = { disconnect: [{ id: kept }, { id: gone }] }
		await Shelf.update({ where: { id: shelf }, data: { items } }, M)
		const all = await Item.findMany({}, M)
		expect(all.map((row) => row.name)).toEqual(['kept'])
		const raw = await Item.count({ where: { shelf: { is: null } } }, M)
		expect(raw).toBe(1)
	})

	it('returns a written row it hides (D-88)', async () => {
		const made = await Item.create({ data: { name: 'x', gone: true } }, M)
		expect(made.name).toBe('x')
		const where = { id: kept }
		const changed = await Item.update({ where, data: { gone: true } }, M)
		expect(changed.gone).toBe(true)
	})
})

const vault = async (open: boolean, gone = false) =>
	Vault.create({ data: { open, gone } }, M)
const linked = async (id: string) => {
	const include = { vault: true, spare: true } as const
	const entry = await Entry.findUnique({ where: { id }, include }, M)
	if (entry === null) throw new Error('The entry is missing.')
	return entry
}

describe('a relation value the caller did not send', () => {
	it('skips access rules when a hook writes it (D-88)', async () => {
		const closed = await vault(false)
		const refused = Entry.create(
			{ data: { vault: { connect: { id: closed.id } } } },
			ada,
		)
		await expect(refused).rejects.toMatchObject({ code: 'NOT_FOUND' })
		entryPatch = { vault: { connect: { id: closed.id } } }
		const entry = await Entry.create({ data: {} }, ada)
		expect((await linked(entry.id)).vault?.id).toBe(closed.id)
	})

	it('skips access rules when a default writes it, from a record', async () => {
		const target = await vault(false)
		spare = target
		const entry = await Entry.create({ data: {} }, ada)
		expect((await linked(entry.id)).spare?.id).toBe(target.id)
	})

	it('keeps beforeFind', async () => {
		const hidden = await vault(true, true)
		entryPatch = { vault: { connect: { id: hidden.id } } }
		await expect(Entry.create({ data: {} }, ada)).rejects.toMatchObject({
			code: 'NOT_FOUND',
		})
	})

	it("fails with a TypeError on a default that is not the target's { id }", async () => {
		spare = untyped('v1')
		await expect(Entry.create({ data: {} }, M)).rejects.toThrow(
			new TypeError(
				"Entry.spare: a relation's default is the target's { id } or a record of it (D-53).",
			),
		)
	})
})

// What untyped JavaScript may return from a relation's default.
const isRef = (value: unknown): value is { readonly id: string } =>
	value !== undefined
const untyped = (value: unknown): { readonly id: string } | undefined =>
	isRef(value) ? value : undefined

describe('a row a relation write moves (D-88)', () => {
	let desk: string
	let pen: string
	const pens = async (data: object) =>
		query('Desk', 'update', { where: { id: desk }, data: { pens: data } }, M)
	const stored = async () => Pen.findUnique({ where: { id: pen } }, M)

	beforeEach(async () => {
		desk = (await Desk.create({ data: { label: 'D' } }, M)).id
		pen = (await Pen.create({ data: { color: 'red' } }, M)).id
	})

	it('runs the update hooks of each row it connects', async () => {
		const before = await stored()
		// The next millisecond, so the moved row's updatedAt differs.
		await new Promise((done) => setTimeout(done, 2))
		await pens({ connect: [{ id: pen }] })
		const after = await stored()
		expect(log).toEqual(['beforeUpdate', 'afterUpdate', 'afterUpdateCommit'])
		expect(facts.get('beforeUpdate')).toEqual({
			record: { ...before, desk: null },
			data: { desk: { connect: { id: desk } } },
		})
		expect(facts.get('afterUpdate')).toEqual({
			record: { ...after, desk: { id: desk } },
			previous: { ...before, desk: null },
		})
		expect(after?.updatedAt.getTime()).toBeGreaterThan(
			before?.updatedAt.getTime() ?? Number.POSITIVE_INFINITY,
		)
	})

	it('gives a disconnect as { disconnect: true }', async () => {
		await pens({ connect: [{ id: pen }] })
		await pens({ disconnect: [{ id: pen }] })
		expect(facts.get('beforeUpdate')).toMatchObject({
			data: { desk: { disconnect: true } },
		})
	})

	it('writes the fields a hook adds, and the relation as asked', async () => {
		penPatch = { note: 'moved', desk: { disconnect: true } }
		await pens({ connect: [{ id: pen }] })
		const moved = await Pen.findUnique(
			{ where: { id: pen }, include: { desk: true } },
			M,
		)
		expect(moved).toMatchObject({ note: 'moved', desk: { id: desk } })
	})

	it('runs them on create too', async () => {
		const data = { label: 'E', pens: { connect: [{ id: pen }] } }
		await query('Desk', 'create', { data }, M)
		expect(log).toEqual(['beforeUpdate', 'afterUpdate', 'afterUpdateCommit'])
	})

	it('fails when a hook deletes a row before its after hooks', async () => {
		dropped = pen
		await expect(pens({ connect: [{ id: pen }] })).rejects.toThrow(
			`Pen ${pen} was deleted before its after hooks.`,
		)
		expect(await stored()).not.toBeNull()
	})
})
