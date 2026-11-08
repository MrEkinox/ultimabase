// The items of a nested list write are read together (D-338): each finds
// its row only through the unique it names, and a unique index types there
// as at the root (D-52).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { asUser } from '@ultimabase/testing'
import { defineApp, defineModel, master, memory } from './index.ts'

const M = { as: master }
const U = { as: asUser({ id: '00000000-0000-4000-8000-000000000000' }) }

const Person = defineModel({
	name: 'Person',
	fields: (f) => ({ visible: f.boolean() }),
}).with({ access: { read: ({ where }) => where({ visible: true }) } })

const Box = defineModel({
	name: 'Box',
	fields: (f) => ({
		label: f.string(),
		tags: f.many(() => Tag, { inverse: 'box' }),
	}),
}).with({ access: { read: () => true, update: () => true } })

const Tag = defineModel({
	name: 'Tag',
	fields: (f) => ({
		bin: f.string(),
		slot: f.number({ integer: true }),
		qty: f.number({ optional: true }),
		box: f.one(() => Box, { optional: true }),
		owner: f.one(() => Person, { optional: true }),
	}),
	indexes: [
		{ fields: ['bin', 'slot'], unique: true },
		// A where naming a person filters the people the caller may read.
		{ fields: ['owner', 'slot'], unique: true },
	],
}).with({ access: { read: () => true, update: () => true } })

describe('a nested list write', () => {
	const app = defineApp({ database: memory(), models: [Person, Box, Tag] })
	let box: { readonly id: string }
	let hidden: { readonly id: string }
	let closed: { readonly id: string }
	beforeEach(async () => {
		await app.start()
		box = await Box.create({ data: { label: 'b' } }, M)
		hidden = await Person.create({ data: { visible: false } }, M)
		const tag = { box: { connect: { id: box.id } } }
		const owner = { connect: { id: hidden.id } }
		closed = await Tag.create({ data: { ...tag, owner, bin: 'a', slot: 1 } }, M)
		await Tag.create({ data: { ...tag, bin: 'a', slot: 2 } }, M)
	})
	afterEach(async () => app.stop())

	it('finds a row only through the unique an item names', async () => {
		const update = [
			{ where: { id: closed.id }, data: { qty: 1 } },
			// The same row, through a person the caller may not read.
			{ where: { owner: hidden.id, slot: 1 }, data: { qty: 2 } },
		]
		await expect(
			Box.update({ where: { id: box.id }, data: { tags: { update } } }, U),
		).rejects.toMatchObject({
			code: 'NOT_FOUND',
			message: 'No Tag matches data.tags.update.1.where.',
		})
		await Box.update(
			{ where: { id: box.id }, data: { tags: { update: update.slice(0, 1) } } },
			U,
		)
		const row = await Tag.findUnique({ where: { id: closed.id } }, M)
		expect(row?.qty).toBe(1)
	})

	it('names a row by a unique index', async () => {
		await Box.update(
			{
				where: { id: box.id },
				data: {
					tags: {
						update: [{ where: { bin: 'a', slot: 2 }, data: { qty: 3 } }],
						delete: [{ bin: 'a', slot: 1 }],
					},
				},
			},
			M,
		)
		const rows = await Box.findUnique(
			{
				where: { id: box.id },
				include: {
					tags: { cursor: { bin: 'a', slot: 2 }, orderBy: { slot: 'asc' } },
				},
			},
			M,
		)
		expect(rows?.tags.map(({ qty }) => qty)).toStrictEqual([3])
		await Box.update(
			{
				where: { id: box.id },
				data: {
					tags: {
						// @ts-expect-error: a unique index is named whole.
						update: [{ where: { bin: 'a' }, data: { qty: 4 } }],
					},
				},
			},
			M,
		).catch(() => undefined)
	})
})
