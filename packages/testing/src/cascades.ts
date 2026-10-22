// The cascades of the contract (D-54, D-102): what a delete does to the rows
// that reference it, when no hook runs, as Master and as a user.
import type { Adapter } from 'ultimabase'
import { defineApp, defineModel, master } from 'ultimabase'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { asUser } from './as-user.ts'
import { silent } from './silent.ts'

const M = { as: master }
const open = () => true

const Shop = defineModel({
	name: 'Shop',
	fields: (f) => ({
		name: f.string({ unique: true }),
		aisles: f.many(() => Aisle),
		items: f.many(() => Item),
		clerks: f.many(() => Clerk),
		orders: f.many(() => Order),
	}),
}).with({ access: { read: open, delete: open } })

const Aisle = defineModel({
	name: 'Aisle',
	fields: (f) => ({
		label: f.string(),
		shop: f.one(() => Shop, { onDelete: 'cascade' }),
		items: f.many(() => Item),
	}),
})

/** Reached twice from a shop: through its aisle, and directly. */
const Item = defineModel({
	name: 'Item',
	fields: (f) => ({
		label: f.string(),
		aisle: f.one(() => Aisle, { onDelete: 'cascade' }),
		shop: f.one(() => Shop, { onDelete: 'cascade' }),
		orders: f.many(() => Order),
	}),
})

/** An optional relation sets null by default. */
const Clerk = defineModel({
	name: 'Clerk',
	fields: (f) => ({
		name: f.string(),
		shop: f.one(() => Shop, { optional: true }),
	}),
})

/** A required relation restricts by default. */
const Order = defineModel({
	name: 'Order',
	fields: (f) => ({
		ref: f.string(),
		item: f.one(() => Item),
		shop: f.one(() => Shop, { onDelete: 'cascade' }),
	}),
})

/** A cascade that comes back to its own model. */
const Folder = defineModel({
	name: 'Folder',
	fields: (f) => ({
		name: f.string(),
		parent: f.one(() => Folder, {
			optional: true,
			onDelete: 'cascade',
			inverse: 'children',
		}),
		children: f.many(() => Folder),
	}),
})

const by = (id: string) => ({ connect: { id } })
const user = { as: asUser({ id: '00000000-0000-4000-8000-000000000000' }) }

/** A shop with an aisle, an item in it and a clerk. */
const stocked = async (name: string) => {
	const shop = await Shop.create({ data: { name } }, M)
	const aisle = await Aisle.create(
		{ data: { label: `${name} aisle`, shop: by(shop.id) } },
		M,
	)
	const item = await Item.create(
		{
			data: { label: `${name} item`, aisle: by(aisle.id), shop: by(shop.id) },
		},
		M,
	)
	const clerk = await Clerk.create(
		{ data: { name: `${name} clerk`, shop: by(shop.id) } },
		M,
	)
	return { shop, item, clerk }
}
const order = async (item: string, shop: string) =>
	Order.create({ data: { ref: 'o', item: by(item), shop: by(shop) } }, M)
const counts = async () => [
	await Shop.count({}, M),
	await Aisle.count({}, M),
	await Item.count({}, M),
	await Order.count({}, M),
]

export function cascades(create: () => Adapter): void {
	const started = () =>
		defineApp({
			database: create(),
			models: [Shop, Aisle, Item, Clerk, Order, Folder],
			logger: silent,
		})
	describe('cascades', () => {
		let app: ReturnType<typeof started>
		beforeEach(async () => {
			app = started()
			await app.start()
		})
		afterEach(async () => app.stop())

		it('deletes what a delete reaches, by every path, and returns the row as it was', async () => {
			const reds = await stocked('reds')
			const blues = await stocked('blues')
			const removed = await Shop.delete({ where: { name: 'reds' } }, M)
			expect(removed).toEqual(reds.shop)
			expect(await counts()).toEqual([1, 1, 1, 0])
			const clerk = await Clerk.findUnique(
				{ where: { id: reds.clerk.id }, include: { shop: true } },
				M,
			)
			expect(clerk?.shop).toBeNull()
			expect(clerk?.updatedAt.getTime()).toBeGreaterThanOrEqual(
				reds.clerk.updatedAt.getTime(),
			)
			const kept = await Clerk.findUnique({ where: { id: blues.clerk.id } }, M)
			expect(kept).toEqual(blues.clerk)
		})

		it('refuses a delete a restricting row stops, and writes nothing', async () => {
			const reds = await stocked('reds')
			const blues = await stocked('blues')
			await order(reds.item.id, blues.shop.id)
			for (const caller of [M, user]) {
				await expect(
					Shop.delete({ where: { id: reds.shop.id } }, caller),
				).rejects.toMatchObject({
					code: 'RELATION_RESTRICTED',
					details: { model: 'Order', field: 'item' },
				})
			}
			expect(await counts()).toEqual([2, 2, 2, 1])
			const clerk = await Clerk.findUnique({ where: { id: reds.clerk.id } }, M)
			expect(clerk).toEqual(reds.clerk)
		})

		it('lets go a restricting row the cascade removes', async () => {
			const reds = await stocked('reds')
			await order(reds.item.id, reds.shop.id)
			await Shop.delete({ where: { id: reds.shop.id } }, user)
			expect(await counts()).toEqual([0, 0, 0, 0])
		})

		it('refuses a missing row', async () => {
			await expect(
				Shop.delete({ where: { name: 'nowhere' } }, M),
			).rejects.toMatchObject({ code: 'NOT_FOUND' })
		})

		it('follows a cascade back to its own model', async () => {
			const root = await Folder.create({ data: { name: 'root' } }, M)
			const child = await Folder.create(
				{ data: { name: 'child', parent: by(root.id) } },
				M,
			)
			await Folder.create({ data: { name: 'leaf', parent: by(child.id) } }, M)
			await Folder.create({ data: { name: 'other' } }, M)
			await Folder.delete({ where: { id: root.id } }, M)
			const left = await Folder.findMany({}, M)
			expect(left.map((folder) => folder.name)).toEqual(['other'])
		})
	})
}
