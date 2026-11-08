// Updates of one table sharing a statement, on postgres() (D-339): updates by
// id of distinct rows that set no key share one; those that set a key stay
// apart and in order.
import { testApplication } from '@ultimabase/testing'
import { defineApp, defineModel, master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { createAdapter } from './adapter.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const [server = ''] = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

const M = { as: master }
/** The statements the adapter sent. */
const sent: string[] = []
const database = createAdapter({
	url: server,
	log: (event) => sent.push(event.query.sql),
})

const Shelf = defineModel({
	name: 'Shelf',
	fields: (f) => ({
		name: f.string(),
		cells: f.many(() => Cell, { inverse: 'shelf' }),
	}),
})
const Cell = defineModel({
	name: 'Cell',
	fields: (f) => ({
		label: f.string(),
		code: f.string({ unique: true }),
		open: f.boolean(),
		pin: f.string(),
		shelf: f.one(() => Shelf, { optional: true }),
		mark: f.one(() => Mark, { optional: true }),
	}),
	indexes: [{ fields: ['pin'], unique: true, where: { open: true } }],
})

const Mark = defineModel({
	name: 'Mark',
	fields: (f) => ({ name: f.string() }),
})

type CellData = {
	readonly label?: string
	readonly code?: string
	readonly open?: boolean
	readonly mark?: { readonly connect: { readonly id: string } }
}

/** A shelf with a cell for each code, open, its pin its code. */
async function filled(codes: readonly string[]): Promise<{
	readonly shelf: string
	readonly ids: readonly string[]
}> {
	const shelf = (await Shelf.create({ data: { name: 's' } }, M)).id
	const ids: string[] = []
	for (const code of codes) {
		const data = {
			label: code,
			code,
			open: true,
			pin: code,
			shelf: { connect: { id: shelf } },
		}
		ids.push((await Cell.create({ data }, M)).id)
	}
	return { shelf, ids }
}

/** The statements that update cells when `shelf` updates them as given. */
async function updates(
	shelf: string,
	update: readonly { readonly id: string; readonly data: CellData }[],
): Promise<number> {
	sent.length = 0
	await Shelf.update(
		{
			where: { id: shelf },
			data: {
				cells: {
					update: update.map(({ id, data }) => ({ where: { id }, data })),
				},
			},
		},
		M,
	)
	return sent.filter((statement) => statement.includes('update "cell"')).length
}

describe('updates sharing a statement', () => {
	testApplication(defineApp({ database, models: [Shelf, Cell, Mark] }), {
		database: 'declared',
	})

	it('updates distinct rows of no key in one statement', async () => {
		const codes = Array.from({ length: 20 }, (_, index) => `c${index}`)
		const { shelf, ids } = await filled(codes)
		const update = ids.map((id, index) => ({
			id,
			data: { label: `l${index}` },
		}))
		expect(await updates(shelf, update)).toBe(1)
		const cells = await Cell.findMany({ orderBy: { code: 'asc' } }, M)
		expect(cells.map(({ label }) => label).toSorted()).toStrictEqual(
			codes.map((_, index) => `l${index}`).toSorted(),
		)
	})

	it('reads back every row the statement updated', async () => {
		const { shelf, ids } = await filled(['a', 'b', 'c'])
		sent.length = 0
		const read = await Shelf.update(
			{
				where: { id: shelf },
				data: {
					cells: {
						update: ids.map((id) => ({ where: { id }, data: { label: 'x' } })),
					},
				},
				select: {
					cells: { select: { label: true }, orderBy: { code: 'asc' } },
				},
			},
			M,
		)
		expect(read.cells).toStrictEqual([
			{ label: 'x' },
			{ label: 'x' },
			{ label: 'x' },
		])
		const written = sent.filter((statement) =>
			statement.includes('update "cell"'),
		)
		expect(written).toHaveLength(1)
		expect(written[0]).toContain('"rows"')
	})

	it('swaps unique values in order, apart', async () => {
		const { shelf, ids } = await filled(['a', 'b'])
		const [a = '', b = ''] = ids
		const update = [
			{ id: a, data: { code: 'x' } },
			{ id: b, data: { code: 'a' } },
		]
		expect(await updates(shelf, update)).toBe(2)
		const cells = await Cell.findMany({ orderBy: { pin: 'asc' } }, M)
		expect(cells.map(({ code }) => code)).toStrictEqual(['x', 'a'])
	})

	it('writes the field of a partial key apart, in order', async () => {
		const { shelf, ids } = await filled(['a', 'b'])
		const [a = '', b = ''] = ids
		// The pin of b is that of a: only one of them may be open.
		await Cell.update({ where: { id: b }, data: { open: false } }, M)
		await Cell.update({ where: { id: b }, data: { pin: 'a' } }, M)
		const update = [
			{ id: a, data: { open: false } },
			{ id: b, data: { open: true } },
		]
		expect(await updates(shelf, update)).toBe(2)
		const cells = await Cell.findMany({ orderBy: { code: 'asc' } }, M)
		expect(cells.map(({ open }) => open)).toStrictEqual([false, true])
	})

	it('writes a relation key apart', async () => {
		const { shelf, ids } = await filled(['a', 'b'])
		const mark = (await Mark.create({ data: { name: 'm' } }, M)).id
		const update = ids.map((id) => ({
			id,
			data: { mark: { connect: { id: mark } } },
		}))
		expect(await updates(shelf, update)).toBe(2)
		const marked = await Cell.findMany(
			{ where: { mark: { is: { id: mark } } } },
			M,
		)
		expect(marked).toHaveLength(2)
	})
})
