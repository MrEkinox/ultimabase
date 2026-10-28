// `groupBy` (D-146): the rows the caller reads in groups, on the fields it
// may filter on, sorted, paged and typed from its arguments.
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
		label: f.string({ optional: true }),
		status: f.enumOf(['open', 'paid']),
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
}).with({ access: { read: () => true } })

describe('groupBy', () => {
	let app: ReturnType<typeof defineApp>
	let shown = ''
	let unseen = ''
	beforeEach(async () => {
		app = defineApp({ database: memory(), models: [Order, Line] })
		await app.start()
		await Order.createMany(
			{
				data: [
					{ total: 10, label: 'b', status: 'paid' },
					{ total: 20, label: 'a', status: 'open' },
					{ total: 30, status: 'open' },
					{ total: -5, status: 'paid' },
				],
			},
			M,
		)
		shown = (await Order.create({ data: { total: 1, status: 'open' } }, M)).id
		const data = { total: 1000, status: 'paid', hidden: true } as const
		unseen = (await Order.create({ data }, M)).id
		for (const id of [shown, unseen]) {
			await Line.create({ data: { order: { connect: { id } } } }, M)
		}
	})
	afterEach(async () => app.stop())

	it('groups the rows the caller reads, typed from its arguments', async () => {
		const result = await Order.groupBy(
			{ by: ['status'], _count: true, _sum: { total: true } },
			user,
		)
		expect(result).toStrictEqual([
			{ status: 'open', _count: 3, _sum: { total: 51 } },
			{ status: 'paid', _count: 1, _sum: { total: 10 } },
		])
		const [group] = result
		expectTypeOf(group?.status).toEqualTypeOf<'open' | 'paid' | undefined>()
		expectTypeOf<(typeof result)[number]['_sum']['total']>().toEqualTypeOf<
			number | null
		>()
		expectTypeOf(group).not.toHaveProperty('label')
	})

	it('sorts by an aggregate it does not return, keys last', async () => {
		const result = await Order.groupBy(
			{ by: ['status', 'label'], orderBy: [{ _max: { total: 'desc' } }] },
			M,
		)
		expect(result).toStrictEqual([
			{ status: 'paid', label: null },
			{ status: 'open', label: null },
			{ status: 'open', label: 'a' },
			{ status: 'paid', label: 'b' },
		])
	})

	it('groups by a relation, null when the caller cannot read its target', async () => {
		const result = await Line.groupBy({ by: ['order'], _count: true }, user)
		expect(result).toStrictEqual([
			{ order: { id: shown }, _count: 1 },
			{ order: null, _count: 1 },
		])
		expectTypeOf(result[0]?.order).toEqualTypeOf<
			{ readonly id: string } | null | undefined
		>()
		const all = await Line.groupBy({ by: ['order'] }, M)
		expect(all).toHaveLength(2)
		expect(all).toContainEqual({ order: { id: unseen } })
	})

	it('refuses a field with a read rule to a caller other than Master', async () => {
		const message =
			'Order.secret has a read rule; only Master aggregates on it.'
		await expect(Order.groupBy({ by: ['secret'] }, user)).rejects.toThrow(
			`by.0: ${message}`,
		)
		await expect(
			Order.groupBy(
				{ by: ['status'], orderBy: { _sum: { secret: 'asc' } } },
				user,
			),
		).rejects.toThrow(`orderBy._sum.secret: ${message}`)
		expect(await Order.groupBy({ by: ['secret'] }, M)).toStrictEqual([
			{ secret: null },
		])
	})

	it('refuses arguments it cannot group by', async () => {
		const loose: {
			groupBy(args: object, options: typeof M): Promise<unknown>
		} = Order
		const empty = 'by must be a non-empty list of fields.'
		const refused: [object, string][] = [
			[{}, 'by'],
			[{ by: [] }, empty],
			[{ by: 'status' }, empty],
			[{ by: [1] }, empty],
			[{ by: ['status', 'status'] }, 'by.1 repeats status.'],
			[{ by: ['tags'] }, 'by.0 is a list, which cannot be grouped.'],
			[{ by: ['meta'] }, 'by.0 is json, which cannot be grouped.'],
			[{ by: ['lines'] }, 'by.0 is a relation, which cannot be grouped.'],
			[{ by: ['size'] }, 'by.0'],
			[
				{ by: ['status'], orderBy: { total: 'asc' } },
				'orderBy.total must be a field of by or an aggregate.',
			],
			[
				{ by: ['status'], orderBy: { _sum: { label: 'asc' } } },
				'orderBy._sum.label is a string field',
			],
			[{ by: ['status'], orderBy: { status: 'up' } }, 'orderBy.status'],
			[{ by: ['status'], take: -1 }, 'take'],
			[{ by: ['status'], skip: 1.5 }, 'skip'],
			[{ by: ['status'], cursor: {} }, 'cursor'],
			[{ by: ['status'], having: {} }, 'having'],
		]
		for (const [args, message] of refused) {
			const failed = loose.groupBy(args, M)
			await expect(failed).rejects.toMatchObject({ code: 'INVALID_QUERY' })
			await expect(failed).rejects.toThrow(message)
		}
	})

	it('types `orderBy` by the fields of `by`', () => {
		type Args = Parameters<typeof Order.groupBy>[0]
		expectTypeOf<Args['by'][number]>().toEqualTypeOf<
			| 'total'
			| 'label'
			| 'status'
			| 'secret'
			| 'hidden'
			| 'id'
			| 'createdAt'
			| 'updatedAt'
		>()
		void Order.groupBy(
			// @ts-expect-error: `total` is not grouped.
			{ by: ['status'], orderBy: { total: 'asc' } },
			M,
		).catch(() => undefined)
	})
})
