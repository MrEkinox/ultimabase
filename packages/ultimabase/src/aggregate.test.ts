// `aggregate` (D-143): the rows the caller reads, on the fields it may
// filter on, typed from its arguments.
import { asUser } from '@ultimabase/testing'
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
} from 'vitest'
import { defineApp, defineModel, master, memory } from './index.ts'

const M = { as: master }
const user = { as: asUser({ id: 'ada' }) }

const Order = defineModel({
	name: 'Order',
	fields: (f) => ({
		total: f.number(),
		items: f.number({ integer: true, optional: true }),
		label: f.string({ optional: true }),
		status: f.enumOf(['open', 'paid']),
		paid: f.boolean({ default: false }),
		at: f.date({ optional: true }),
		tags: f.string({ list: true }),
		meta: f.json({ optional: true }),
		secret: f.number({ optional: true }).with({
			access: { read: ({ caller }) => caller.kind === 'master' },
		}),
		hidden: f.boolean({ default: false }),
		lines: f.many(() => Line),
	}),
}).with({
	access: { read: ({ where }) => where({ hidden: false }) },
	hooks: { beforeFind: ({ where }) => where({ total: { gte: 0 } }) },
})

const Line = defineModel({
	name: 'Line',
	fields: (f) => ({ order: f.one(() => Order) }),
})

const day = (n: number): Date => new Date(Date.UTC(2026, 0, n))

describe('aggregate', () => {
	let app: ReturnType<typeof defineApp>
	beforeEach(async () => {
		app = defineApp({ database: memory(), models: [Order, Line] })
		await app.start()
		await Order.createMany(
			{
				data: [
					{ total: 10, items: 1, label: 'b', status: 'paid', at: day(2) },
					{ total: 20, items: 3, label: 'a', status: 'open', at: day(1) },
					{ total: 30, status: 'open' },
					{ total: 1000, status: 'paid', hidden: true },
					{ total: -5, status: 'paid' },
				],
			},
			M,
		)
	})
	afterEach(async () => app.stop())

	it('aggregates the rows the caller reads, typed from its arguments', async () => {
		const result = await Order.aggregate(
			{
				_count: { _all: true, items: true },
				_sum: { total: true, items: true },
				_avg: { total: true },
				_min: { label: true, at: true, status: true },
				_max: { total: true, createdAt: true },
			},
			user,
		)
		const { _sum: sum, _min: min, _max: max, ...rest } = result
		expect(max.createdAt).toBeInstanceOf(Date)
		expect({
			...rest,
			_sum: sum,
			_min: min,
			_max: { total: max.total },
		}).toStrictEqual({
			_count: { _all: 3, items: 2 },
			_sum: { total: 60, items: 4 },
			_avg: { total: 20 },
			_min: { label: 'a', at: day(1), status: 'open' },
			_max: { total: 30 },
		})
		expectTypeOf(result._count).toEqualTypeOf<{
			readonly _all: number
			readonly items: number
		}>()
		expectTypeOf(sum.items).toEqualTypeOf<number | null>()
		expectTypeOf(min.at).toEqualTypeOf<Date | null>()
		expectTypeOf(min.status).toEqualTypeOf<'open' | 'paid' | null>()
		expectTypeOf(max.createdAt).toEqualTypeOf<Date | null>()
	})

	it('counts rows with `_count: true`, and only what it asks for', async () => {
		const result = await Order.aggregate(
			{ where: { status: 'paid' }, _count: true },
			user,
		)
		expect(result).toStrictEqual({ _count: 1 })
		expectTypeOf(result).toEqualTypeOf<{ readonly _count: number }>()
		expect(await Order.aggregate({ _count: true }, M)).toStrictEqual({
			_count: 4,
		})
		expect(await Order.aggregate({ _sum: {} }, M)).toStrictEqual({ _sum: {} })
	})

	it('gives 0 and null without a value', async () => {
		expect(
			await Order.aggregate(
				{
					where: { total: { gt: 5000 } },
					_count: { items: true },
					_sum: { total: true },
					_avg: { items: true },
					_min: { at: true },
					_max: { label: true },
				},
				M,
			),
		).toStrictEqual({
			_count: { items: 0 },
			_sum: { total: null },
			_avg: { items: null },
			_min: { at: null },
			_max: { label: null },
		})
	})

	it('refuses a field with a read rule to a caller other than Master', async () => {
		await expect(
			Order.aggregate({ _count: { secret: true } }, user),
		).rejects.toThrow(
			'_count.secret: Order.secret has a read rule; only Master aggregates on it.',
		)
		expect(await Order.aggregate({ _sum: { secret: true } }, M)).toStrictEqual({
			_sum: { secret: null },
		})
	})

	it('refuses a field an aggregate cannot take', async () => {
		const refused: [object, string][] = [
			[{ _count: { lines: true } }, '_count.lines is a relation'],
			[{ _count: { tags: true } }, '_count.tags is a list'],
			[{ _max: { meta: true } }, '_max.meta is json'],
			[{ _sum: { label: true } }, '_sum.label is a string field'],
			[{ _min: { paid: true } }, '_min.paid is a boolean field'],
			[{ _avg: { id: true } }, '_avg.id is a string field'],
			[{ _count: { size: true } }, '_count.size'],
			[{ _sum: { total: false } }, '_sum.total must be true.'],
			[{ orderBy: { total: 'asc' } }, 'orderBy'],
		]
		for (const [args, message] of refused) {
			const failed = Order.aggregate(args, M)
			await expect(failed).rejects.toMatchObject({ code: 'INVALID_QUERY' })
			await expect(failed).rejects.toThrow(message)
		}
	})

	it('types only the fields each aggregate takes', () => {
		type Args = Parameters<typeof Order.aggregate>[0]
		expectTypeOf<NonNullable<Args['_sum']>>().toHaveProperty('total')
		expectTypeOf<NonNullable<Args['_sum']>>().not.toHaveProperty('label')
		expectTypeOf<NonNullable<Args['_min']>>().not.toHaveProperty('paid')
		expectTypeOf<NonNullable<Args['_min']>>().toHaveProperty('updatedAt')
		expectTypeOf<
			Exclude<Args['_count'], true | undefined>
		>().not.toHaveProperty('meta')
	})
})
