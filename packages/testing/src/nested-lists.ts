// Nested list writes in the contract (D-338): the rows the items of an
// `update`, a `delete` or a `connectOrCreate` name are read together, and
// each item finds its own, whatever unique it names.
import type { Adapter } from 'ultimabase'
import { defineModel, master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { started } from './suite.ts'

const M = { as: master }

const Crate = defineModel({
	name: 'Crate',
	fields: (f) => ({
		label: f.string(),
		items: f.many(() => Item, { inverse: 'crate' }),
	}),
})

const Item = defineModel({
	name: 'Item',
	fields: (f) => ({
		code: f.string({ unique: true }),
		rank: f.number({ integer: true, unique: true }),
		price: f.decimal({ precision: 6, scale: 2, unique: true }),
		day: f.date({ unique: true }),
		at: f.dateTime({ unique: true }),
		kind: f.enumOf(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']),
		flag: f.boolean(),
		bin: f.string(),
		shelf: f.string({ optional: true }),
		slot: f.number({ integer: true }),
		qty: f.number({ optional: true }),
		crate: f.one(() => Crate, { optional: true }),
	}),
	indexes: [
		{ fields: ['kind', 'flag'], unique: true },
		{ fields: ['bin', 'shelf'], unique: true },
		{ fields: ['crate', 'slot'], unique: true },
	],
})

/** A unique `where` of an item, as `update` takes it. */
type ItemWhere = Parameters<typeof Item.update>[0]['where']

/** Plain rows, many of them. */
const Rack = defineModel({
	name: 'Rack',
	fields: (f) => ({ pegs: f.many(() => Peg, { inverse: 'rack' }) }),
})

const Peg = defineModel({
	name: 'Peg',
	fields: (f) => ({
		label: f.string(),
		rack: f.one(() => Rack, { optional: true }),
	}),
})

const kinds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] as const

/** The data of the item at `index`, each unique its own, without its crate. */
const values = (index: number) => ({
	code: `c${index}`,
	rank: index,
	price: `${index}.5`,
	day: new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10),
	at: new Date(Date.UTC(2026, 0, 1, index)),
	kind: kinds[index % 9] ?? 'a',
	flag: index < 9,
	bin: `b${index}`,
	shelf: `s${index}`,
	slot: index,
})

const itemData = (index: number, crate: string) => ({
	...values(index),
	crate: { connect: { id: crate } },
})

/** The unique `where` of the item at `index`: each kind twice. */
function named(index: number, id: string, crate: string): ItemWhere {
	const data = values(index)
	const wheres: ItemWhere[] = [
		{ id },
		{ code: data.code },
		{ rank: data.rank },
		// Given otherwise than as stored: `'012.5'` is `'12.50'`.
		{ price: `0${data.price}` },
		{ day: data.day },
		{ at: data.at },
		{ kind: data.kind, flag: data.flag },
		{ shelf: data.shelf, bin: data.bin },
		{ crate, slot: data.slot },
	]
	return wheres[index % wheres.length] ?? { id }
}

export function nestedLists(
	create: () => Adapter,
	counted: () => number,
): void {
	describe('nested list writes', () => {
		started(create, [Crate, Item, Rack, Peg])

		async function filled(count: number): Promise<{
			readonly crate: string
			readonly ids: readonly string[]
		}> {
			const crate = (await Crate.create({ data: { label: 'one' } }, M)).id
			const ids: string[] = []
			for (let index = 0; index < count; index++) {
				const data = itemData(index, crate)
				ids.push((await Item.create({ data }, M)).id)
			}
			return { crate, ids }
		}

		it('updates the row each item names, whatever unique it names', async () => {
			const { crate, ids } = await filled(18)
			const update = ids.map((id, index) => ({
				where: named(index, id, crate),
				data: { qty: index * 10 },
			}))
			await Crate.update(
				{ where: { id: crate }, data: { items: { update } } },
				M,
			)
			const items = await Item.findMany({ orderBy: { rank: 'asc' } }, M)
			expect(items.map(({ qty }) => qty)).toStrictEqual(
				ids.map((_, index) => index * 10),
			)
		})

		it('deletes the row each item names, whatever unique it names', async () => {
			const { crate, ids } = await filled(18)
			const removed = ids.map((id, index) => named(index, id, crate))
			await Crate.update(
				{
					where: { id: crate },
					data: { items: { delete: removed.slice(0, 17) } },
				},
				M,
			)
			const left = await Item.findMany({}, M)
			expect(left.map(({ id }) => id)).toStrictEqual([ids[17]])
		})

		it('names the first item that names no linked row', async () => {
			const { crate, ids } = await filled(3)
			const other = (await Crate.create({ data: { label: 'two' } }, M)).id
			await Item.update(
				{
					where: { id: ids[2] ?? '' },
					data: { crate: { connect: { id: other } } },
				},
				M,
			)
			const update = [
				{ where: { code: 'c0' }, data: { qty: 1 } },
				{ where: { code: 'none' }, data: { qty: 2 } },
				// Linked to another crate.
				{ where: { code: 'c2' }, data: { qty: 3 } },
			]
			await expect(
				Crate.update({ where: { id: crate }, data: { items: { update } } }, M),
			).rejects.toMatchObject({
				code: 'NOT_FOUND',
				message: 'No Item matches data.items.update.1.where.',
			})
			const removed = [{ code: 'c0' }, { code: 'c2' }]
			await expect(
				Crate.update(
					{ where: { id: crate }, data: { items: { delete: removed } } },
					M,
				),
			).rejects.toMatchObject({
				code: 'NOT_FOUND',
				message: 'No Item matches data.items.delete.1.',
			})
			const items = await Item.findMany({ orderBy: { rank: 'asc' } }, M)
			expect(items.map(({ qty }) => qty)).toStrictEqual([null, null, null])
		})

		it('connects the rows items find and creates the others', async () => {
			const { ids } = await filled(18)
			const other = (await Crate.create({ data: { label: 'two' } }, M)).id
			const connectOrCreate = ids.map((id, index) => ({
				where: named(index, id, other),
				// The kinds and flags of the 18 items are all taken.
				create: { ...values(index + 18), kind: 'j' as const, flag: index < 9 },
			}))
			await Crate.update(
				{ where: { id: other }, data: { items: { connectOrCreate } } },
				M,
			)
			// Those naming the crate and a slot name rows of no crate yet.
			const linked = await Item.findMany(
				{ where: { crate: { is: { id: other } } }, orderBy: { rank: 'asc' } },
				M,
			)
			const created = ids.flatMap((_, index) =>
				index % 9 === 8 ? [index + 18] : [],
			)
			const kept = ids.filter((_, index) => index % 9 !== 8)
			expect(linked.map(({ id }) => id).slice(0, kept.length)).toStrictEqual(
				kept,
			)
			expect(linked.slice(kept.length).map(({ rank }) => rank)).toStrictEqual(
				created,
			)
		})

		// The round trips: an item costs at most its own write, and the rows
		// are read 1000 at most at once. Its 1001 items take seconds under
		// coverage beside the other suites, past the 5 s default.
		it('reads the rows a list names at once', async () => {
			const { id } = await Rack.create({ data: {} }, M)
			const data = Array.from({ length: 1003 }, (_, index) => ({
				label: `p${index}`,
				rack: { connect: { id } },
			}))
			await Peg.createMany({ data }, M)
			const ids = (await Peg.findMany({}, M)).map((peg) => peg.id)
			const cost = async (count: number, kind: 'update' | 'delete') => {
				const where = ids.slice(-count).map((peg) => ({ id: peg }))
				const update = where.map((on) => ({ where: on, data: { label: 'x' } }))
				const pegs = kind === 'update' ? { update } : { delete: where }
				const before = counted()
				await Rack.update({ where: { id }, data: { pegs } }, M)
				if (kind === 'delete') ids.splice(-count)
				return counted() - before
			}
			const one = await cost(1, 'update')
			expect(await cost(3, 'update')).toBeLessThanOrEqual(one + 2)
			expect(await cost(1001, 'update')).toBeLessThanOrEqual(one + 1000 + 1)
			const removed = await cost(1, 'delete')
			expect(await cost(3, 'delete')).toBeLessThanOrEqual(removed + 2)
		}, 30_000)
	})
}
