// `distinct` (D-147): a `findMany` keeps, of the rows the caller reads with
// the same keys, the first in its order; the keys are those `groupBy` takes.
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

describe('distinct', () => {
	let app: ReturnType<typeof defineApp>
	beforeEach(async () => {
		app = defineApp({ database: memory(), models: [Order, Line] })
		await app.start()
		await Order.createMany(
			{
				data: [
					{ total: 10, status: 'paid' },
					{ total: 20, status: 'open' },
					{ total: -5, status: 'open' },
					{ total: 30, status: 'paid', hidden: true },
				],
			},
			M,
		)
	})
	afterEach(async () => app.stop())

	it('keeps the rows the read rule and beforeFind leave, typed as findMany', async () => {
		const rows = await Order.findMany(
			{
				distinct: ['status'],
				orderBy: { total: 'desc' },
				select: { total: true },
			},
			user,
		)
		expect(rows).toStrictEqual([{ total: 20 }, { total: 10 }])
		expectTypeOf<(typeof rows)[number]['total']>().toEqualTypeOf<number>()
		expectTypeOf(rows[0]).not.toHaveProperty('status')
		const all = await Order.findMany(
			{ distinct: ['status'], orderBy: { total: 'desc' } },
			M,
		)
		expect(all.map((row) => row.total)).toStrictEqual([30, 20])
	})

	it('refuses a field with a read rule to a caller other than Master', async () => {
		await expect(
			Order.findMany({ distinct: ['secret'] }, user),
		).rejects.toThrow(
			'distinct.0: Order.secret has a read rule; only Master compares on it.',
		)
		expect(await Order.findMany({ distinct: ['secret'] }, M)).toHaveLength(1)
	})

	it('refuses keys it cannot compare, and a cursor', async () => {
		const loose: {
			findMany(args: object, options: typeof M): Promise<unknown>
			findFirst(args: object, options: typeof M): Promise<unknown>
		} = Order
		const empty = 'distinct must be a non-empty list of fields.'
		const refused: [object, string][] = [
			[{ distinct: [] }, empty],
			[{ distinct: 'status' }, empty],
			[{ distinct: ['status', 'status'] }, 'distinct.1 repeats status.'],
			[
				{ distinct: ['tags'] },
				'distinct.0 is a list, which cannot be compared.',
			],
			[{ distinct: ['meta'] }, 'distinct.0 is json, which cannot be compared.'],
			[
				{ distinct: ['lines'] },
				'distinct.0 is a relation, which cannot be compared.',
			],
			[{ distinct: ['size'] }, 'distinct.0'],
			[
				{ distinct: ['status'], cursor: { id: 'x' } },
				'distinct cannot be used with cursor.',
			],
			[
				{ include: { lines: { distinct: ['order'] } } },
				'include.lines.distinct',
			],
		]
		for (const [args, message] of refused) {
			const failed = loose.findMany(args, M)
			await expect(failed).rejects.toMatchObject({ code: 'INVALID_QUERY' })
			await expect(failed).rejects.toThrow(message)
		}
		const first = loose.findFirst({ distinct: ['status'] }, M)
		await expect(first).rejects.toThrow('distinct')
	})

	it('types the keys as groupBy does, on findMany alone', () => {
		type Keys = NonNullable<Parameters<typeof Line.findMany>[0]>['distinct']
		expectTypeOf<NonNullable<Keys>[number]>().toEqualTypeOf<
			'order' | 'id' | 'createdAt' | 'updatedAt'
		>()
		void Order.findFirst(
			// @ts-expect-error: findFirst takes no `distinct`.
			{ distinct: ['status'] },
			M,
		).catch(() => undefined)
	})
})
