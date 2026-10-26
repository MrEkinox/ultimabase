// The cascades of the contract (D-54, D-102): what a delete does to the rows
// that reference it, when no hook runs, as Master and as a user.
import type { Adapter } from 'ultimabase'
import { defineApp, defineModel, master } from 'ultimabase'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { suiteUser } from './as-user.ts'
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

/** A model a delete both deletes and empties: its rows are loaded (D-102). */
const Room = defineModel({
	name: 'Room',
	fields: (f) => ({ seats: f.many(() => Seat), spares: f.many(() => Seat) }),
})
const Seat = defineModel({
	name: 'Seat',
	fields: (f) => ({
		name: f.string(),
		room: f.one(() => Room, { onDelete: 'cascade', inverse: 'seats' }),
		spare: f.one(() => Room, { optional: true, inverse: 'spares' }),
	}),
})

/** A model a delete empties twice: its rows are loaded (D-102). */
const Wall = defineModel({
	name: 'Wall',
	fields: (f) => ({
		fronts: f.many(() => Poster),
		backs: f.many(() => Poster),
	}),
})
const Poster = defineModel({
	name: 'Poster',
	fields: (f) => ({
		front: f.one(() => Wall, { optional: true, inverse: 'fronts' }),
		back: f.one(() => Wall, { optional: true, inverse: 'backs' }),
	}),
})

const by = (id: string) => ({ connect: { id } })
const user = { as: suiteUser('00000000-0000-4000-8000-000000000000') }

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
			models: [
				Shop,
				Aisle,
				Item,
				Clerk,
				Order,
				Folder,
				Room,
				Seat,
				Wall,
				Poster,
			],
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

		it('deletes many rows and what they reach, as Master and as a user', async () => {
			const reds = await stocked('reds')
			await stocked('blues')
			await stocked('greens')
			const names = { name: { in: ['reds', 'blues'] } }
			const removed = await Shop.deleteMany({ where: names }, M)
			expect(removed).toEqual({ count: 2 })
			expect(await counts()).toEqual([1, 1, 1, 0])
			const clerk = await Clerk.findUnique(
				{ where: { id: reds.clerk.id }, include: { shop: true } },
				M,
			)
			expect(clerk?.shop).toBeNull()
			expect(await Shop.deleteMany({ where: names }, M)).toEqual({ count: 0 })
			expect(await Shop.deleteMany({}, user)).toEqual({ count: 1 })
			expect(await counts()).toEqual([0, 0, 0, 0])
		})

		it('deletes many rows chosen by the rows their delete reaches', async () => {
			await stocked('reds')
			await stocked('blues')
			await stocked('greens')
			// Through a cascade, then through a `setNull`.
			const aisle = { aisles: { some: { label: 'reds aisle' } } }
			expect(await Shop.deleteMany({ where: aisle }, M)).toEqual({ count: 1 })
			const clerk = { clerks: { some: { name: 'blues clerk' } } }
			expect(await Shop.deleteMany({ where: clerk }, M)).toEqual({ count: 1 })
			const left = await Shop.findMany({}, M)
			expect(left.map((shop) => shop.name)).toEqual(['greens'])
			expect(await counts()).toEqual([1, 1, 1, 0])
		})

		it('deletes no row of many when a restricting row stops one', async () => {
			const reds = await stocked('reds')
			const blues = await stocked('blues')
			await order(reds.item.id, blues.shop.id)
			for (const caller of [M, user]) {
				await expect(
					Shop.deleteMany({ where: { name: 'reds' } }, caller),
				).rejects.toMatchObject({
					code: 'RELATION_RESTRICTED',
					details: { model: 'Order', field: 'item' },
				})
			}
			expect(await counts()).toEqual([2, 2, 2, 1])
		})

		it('deletes many trees of one model', async () => {
			const root = await Folder.create({ data: { name: 'root' } }, M)
			await Folder.create({ data: { name: 'child', parent: by(root.id) } }, M)
			await Folder.create({ data: { name: 'other' } }, M)
			await Folder.create({ data: { name: 'kept' } }, M)
			const roots = { name: { in: ['root', 'other'] } }
			expect(await Folder.deleteMany({ where: roots }, M)).toEqual({
				count: 2,
			})
			const left = await Folder.findMany({}, M)
			expect(left.map((folder) => folder.name)).toEqual(['kept'])
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

		it('empties the key of a row it leaves, of a model it deletes', async () => {
			const hall = await Room.create({ data: {} }, M)
			const lobby = await Room.create({ data: {} }, M)
			await Seat.create({ data: { name: 'in', room: by(hall.id) } }, M)
			await Seat.create(
				{ data: { name: 'out', room: by(lobby.id), spare: by(hall.id) } },
				M,
			)
			await Room.delete({ where: { id: hall.id } }, M)
			const left = await Seat.findMany({ include: { spare: true } }, M)
			expect(left).toMatchObject([{ name: 'out', spare: null }])
		})

		it('empties two keys of a row that names the deleted row twice', async () => {
			const wall = await Wall.create({ data: {} }, M)
			const poster = await Poster.create(
				{ data: { front: by(wall.id), back: by(wall.id) } },
				M,
			)
			await Wall.delete({ where: { id: wall.id } }, M)
			const left = await Poster.findUnique(
				{ where: { id: poster.id }, include: { front: true, back: true } },
				M,
			)
			expect(left).toMatchObject({ front: null, back: null })
		})
	})
}
