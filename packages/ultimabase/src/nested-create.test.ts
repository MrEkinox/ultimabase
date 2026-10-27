// Nested creation on `memory()` (D-128): a created row gets its target's
// rules, defaults, validation and hooks, never writes the relation it is
// created through, and reports its issues at its own path.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { asUser } from '@ultimabase/testing'
import type { CreateDataOf } from './index.ts'
import { defineApp, defineModel, master, memory } from './index.ts'

const M = { as: master }
const U = { as: asUser({ id: '00000000-0000-4000-8000-000000000000' }) }
const log: string[] = []
let seen: unknown
let auto = false

const Shop = defineModel({
	name: 'Shop',
	fields: (f) => ({
		name: f.string(),
		items: f
			.many(() => Item)
			.with({
				access: {
					create: ({ value }) => {
						seen = value
						return true
					},
				},
			}),
		sign: f.one(() => Sign, { optional: true }),
	}),
}).with({
	access: {
		read: () => true,
		create: () => {
			log.push('Shop rule')
			return true
		},
		update: () => true,
	},
	hooks: {
		beforeCreate: ({ data }) => {
			log.push('Shop beforeCreate')
			if (auto) Object.assign(data, { items: { create: [{ label: 'auto' }] } })
		},
		afterCreate: () => {
			log.push('Shop afterCreate')
		},
		afterCreateCommit: () => {
			log.push('Shop afterCreateCommit')
		},
	},
})

const Item = defineModel({
	name: 'Item',
	fields: (f) => ({
		label: f.string(),
		size: f.number({ default: 1 }),
		shop: f.one(() => Shop, { onDelete: 'cascade' }),
		parts: f.many(() => Part),
	}),
}).with({
	access: {
		read: () => true,
		create: ({ caller, value }) => {
			log.push(`Item rule ${value.label}`)
			return caller.kind === 'user' && value.label !== 'no'
		},
	},
	hooks: {
		beforeCreate: ({ data }) => {
			log.push(`Item beforeCreate ${data.label}`)
		},
		afterCreate: ({ record }) => {
			log.push(`Item afterCreate ${record.label}`)
		},
		afterCreateCommit: ({ record }) => {
			log.push(`Item afterCreateCommit ${record.label}`)
		},
	},
})

const Part = defineModel({
	name: 'Part',
	fields: (f) => ({ code: f.string(), item: f.one(() => Item) }),
}).with({ access: { read: () => true, create: () => true } })

/** Holds the key of its one-to-one with a shop (D-37). */
const Sign = defineModel({
	name: 'Sign',
	fields: (f) => ({ text: f.string(), shop: f.one(() => Shop) }),
}).with({ access: { read: () => true, create: () => true } })

const started = () =>
	defineApp({ database: memory(), models: [Shop, Item, Part, Sign] })

const invalid = (message: string) => ({ code: 'INVALID_QUERY', message })

describe('a nested create', () => {
	let app: ReturnType<typeof started>
	beforeEach(async () => {
		log.length = 0
		auto = false
		app = started()
		await app.start()
	})
	afterEach(async () => app.stop())

	it('runs rules and hooks depth first, parent first', async () => {
		const shop = await Shop.create(
			{
				data: {
					name: 'corner',
					items: {
						create: [
							{ label: 'a', parts: { create: [{ code: 'a1' }] } },
							{ label: 'b' },
						],
					},
				},
				include: { items: { include: { parts: true } } },
			},
			U,
		)
		expect(shop.items).toMatchObject([
			{ label: 'a', size: 1, parts: [{ code: 'a1' }] },
			{ label: 'b', size: 1, parts: [] },
		])
		expect(log).toEqual([
			'Shop rule',
			'Shop beforeCreate',
			'Item rule a',
			'Item beforeCreate a',
			'Item rule b',
			'Item beforeCreate b',
			'Shop afterCreate',
			'Item afterCreate a',
			'Item afterCreate b',
			'Shop afterCreateCommit',
			'Item afterCreateCommit a',
			'Item afterCreateCommit b',
		])
	})

	it("refuses a row its target's rule refuses", async () => {
		await expect(
			Shop.create(
				{ data: { name: 'x', items: { create: [{ label: 'no' }] } } },
				U,
			),
		).rejects.toMatchObject({
			code: 'ACCESS_DENIED',
			message: 'Item create refused.',
		})
		expect(await Shop.count({}, M)).toBe(0)
	})

	it('skips the rules of a row a hook creates', async () => {
		auto = true
		const shop = await Shop.create(
			{ data: { name: 'x' }, include: { items: true } },
			U,
		)
		expect(shop.items).toMatchObject([{ label: 'auto' }])
		expect(log).not.toContain('Item rule auto')
	})

	it('gives a field rule the ids of the rows it creates', async () => {
		const shop = await Shop.create(
			{
				data: { name: 'x', items: { create: [{ label: 'a' }] } },
				include: { items: true },
			},
			U,
		)
		expect(seen).toEqual({
			connect: [],
			disconnect: [],
			delete: [],
			create: [{ id: shop.items[0]?.id }],
		})
	})

	it('reports an issue at the path of the row', async () => {
		await expect(
			Shop.create(
				{
					data: {
						name: 'x',
						items: {
							create: [
								{ label: 'a' },
								// @ts-expect-error: a label is a string.
								{ label: 1, parts: { create: [{ code: 2 }] } },
							],
						},
					},
				},
				M,
			),
		).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
			details: {
				issues: [
					{
						path: ['items', 'create', 1, 'label'],
						message: 'Expected a string.',
					},
				],
			},
		})
		await expect(
			Shop.create(
				{
					data: {
						name: 'x',
						items: {
							// @ts-expect-error: a code is a string.
							create: [{ label: 'a', parts: { create: [{ code: 2 }] } }],
						},
					},
				},
				M,
			),
		).rejects.toMatchObject({
			details: {
				issues: [
					{ path: ['items', 'create', 0, 'parts', 'create', 0, 'code'] },
				],
			},
		})
		expect(await Item.count({}, M)).toBe(0)
	})

	it('refuses the relation it is created through', async () => {
		const other = await Shop.create({ data: { name: 'other' } }, M)
		type ItemData = NonNullable<
			NonNullable<CreateDataOf<typeof Shop>['items']>['create']
		>[number]
		// @ts-expect-error: the row is linked to the shop that creates it.
		const item: ItemData = { label: 'a', shop: { connect: { id: other.id } } }
		await expect(
			Shop.create({ data: { name: 'x', items: { create: [item] } } }, M),
		).rejects.toMatchObject(
			invalid(
				'data.items.create.0.shop cannot be written: it links to the row being written.',
			),
		)
	})

	it('refuses a misspelled key in a row it creates', async () => {
		await expect(
			Shop.create(
				{
					data: {
						name: 'x',
						items: {
							create: [
								{ label: 'a' },
								// @ts-expect-error: no such field.
								{ label: 'b', lable: 'c' },
							],
						},
					},
				},
				M,
			),
		).rejects.toMatchObject(
			invalid("Unknown key 'data.items.create.1.lable' on Item."),
		)
	})

	it('refuses a malformed create', async () => {
		const refusals: [object, string][] = [
			[
				{ items: { create: { label: 'a' } } },
				'data.items.create must be a list.',
			],
			[{ items: { create: ['a'] } }, 'data.items.create.0 must be an object.'],
			[{ sign: { create: 'a' } }, 'data.sign.create must be an object.'],
			[
				{ sign: { create: { text: 'a' }, connect: { id: 'a' } } },
				'data.sign takes one of connect, connectOrCreate, create.',
			],
		]
		for (const [data, message] of refusals) {
			const sent = { name: 'x', ...data }
			await expect(Shop.create({ data: sent }, M)).rejects.toMatchObject(
				invalid(message),
			)
		}
	})

	it('creates the row of a one-to-one, unless one is held', async () => {
		const shop = await Shop.create(
			{
				data: { name: 'x', sign: { create: { text: 'open' } } },
				include: { sign: true },
			},
			M,
		)
		expect(shop.sign).toMatchObject({ text: 'open' })
		await expect(
			Shop.update(
				{ where: { id: shop.id }, data: { sign: { create: { text: 'new' } } } },
				M,
			),
		).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
			details: {
				issues: [
					{
						path: ['sign'],
						message: 'The Sign it points to cannot be left without one.',
					},
				],
			},
		})
		expect(await Sign.count({}, M)).toBe(1)
	})

	it('creates the row a stored one links to, before its own', async () => {
		const item = await Item.create(
			{
				data: { label: 'a', shop: { create: { name: 'made' } } },
				include: { shop: true },
			},
			U,
		)
		expect(item.shop).toMatchObject({ name: 'made' })
		expect(log.slice(0, 4)).toEqual([
			'Item rule a',
			'Item beforeCreate a',
			'Shop rule',
			'Shop beforeCreate',
		])
	})
})
