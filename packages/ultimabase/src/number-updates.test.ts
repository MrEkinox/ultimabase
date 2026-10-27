// Integer fields and number updates (D-132): whole numbers in 32 bits, and
// `set`, `increment`, `decrement`, `multiply` or `divide` computed on the row
// the update finds, which every rule, schema and hook then sees.
import { asUser } from '@ultimabase/testing'
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
} from 'vitest'
import { z } from 'zod'
import type { UpdateDataOf } from './index.ts'
import { allow, defineApp, defineModel, master, memory } from './index.ts'

const M = { as: master }
const user = { as: asUser({ id: 'u1' }) }

// No hook: Master's update by id computes in the adapter's write.
const Counter = defineModel({
	name: 'Counter',
	fields: (f) => ({
		count: f.number({ integer: true, optional: true }),
		ratio: f.number({ optional: true }),
		points: f.number({ integer: true, list: true }),
		label: f.string({ optional: true }),
	}),
})

let seen: unknown[] = []
// A hook, a field rule and a schema: the update reads the row first.
const Stock = defineModel({
	name: 'Stock',
	fields: (f) => ({
		level: f.number({ integer: true }).with({
			access: {
				update: ({ value, record }) => {
					seen.push(['rule', value, record.level])
					return value - Number(record.level) <= 5
				},
			},
		}),
		capped: f.number({ optional: true, validate: z.number().max(100) }),
	}),
}).with({
	access: allow.public,
	hooks: {
		beforeUpdate: ({ data }) => {
			seen.push(['before', data.level])
		},
		afterUpdate: ({ record }) => {
			seen.push(['after', record.level])
		},
	},
})

const started = () =>
	defineApp({ database: memory(), models: [Counter, Stock] })
let app: ReturnType<typeof started>
beforeEach(async () => {
	seen = []
	app = started()
	await app.start()
})
afterEach(async () => app.stop())

const whole = 'Expected a whole number from -2,147,483,648 to 2,147,483,647.'
const refused = (path: string, message: string) => ({
	code: 'VALIDATION_FAILED',
	details: { issues: [{ path: [path], message }] },
})

describe('an integer field', () => {
	it('holds whole numbers in 32 bits', async () => {
		const counter = await Counter.create(
			{ data: { count: -2_147_483_648, points: [0, 2_147_483_647] } },
			M,
		)
		expect(counter).toMatchObject({
			count: -2_147_483_648,
			points: [0, 2_147_483_647],
		})
		for (const count of [1.5, 2_147_483_648, -2_147_483_649]) {
			await expect(
				Counter.create({ data: { count } }, M),
			).rejects.toMatchObject(refused('count', whole))
		}
		await expect(
			Counter.create({ data: { points: [1, 2.5] } }, M),
		).rejects.toMatchObject(
			refused(
				'points',
				'Expected a list of whole numbers from -2,147,483,648 to 2,147,483,647.',
			),
		)
	})

	it('is filtered by whole numbers, as GraphQL Int', async () => {
		await Counter.create({ data: { count: 2, points: [3] } }, M)
		expect(
			await Counter.findMany({ where: { count: { gt: 1 } } }, M),
		).toHaveLength(1)
		await expect(
			Counter.findMany({ where: { count: { gt: 1.5 } } }, M),
		).rejects.toMatchObject({
			code: 'INVALID_QUERY',
			message: 'where.count.gt does not fit Counter.count.',
		})
		await expect(
			Counter.findMany({ where: { points: { has: 2.5 } } }, M),
		).rejects.toMatchObject({
			code: 'INVALID_QUERY',
			message:
				'where.points.has must be a whole number from -2,147,483,648 to 2,147,483,647.',
		})
	})
})

const update = async (
	data: UpdateDataOf<typeof Counter>,
	from: { count?: number | null; ratio?: number | null } = {},
) => {
	const { id } = await Counter.create({ data: from }, M)
	return Counter.update({ where: { id }, data }, M)
}

describe('a number update', () => {
	it('computes each operation on the stored number', async () => {
		expect(
			await update({ count: { increment: 3 } }, { count: 4 }),
		).toMatchObject({ count: 7 })
		expect(
			await update({ count: { decrement: 5 } }, { count: 4 }),
		).toMatchObject({ count: -1 })
		expect(
			await update({ ratio: { multiply: 1.5 } }, { ratio: 3 }),
		).toMatchObject({ ratio: 4.5 })
		expect(await update({ ratio: { divide: 4 } }, { ratio: 3 })).toMatchObject({
			ratio: 0.75,
		})
	})

	it('truncates an integer division toward zero', async () => {
		expect(await update({ count: { divide: 2 } }, { count: 7 })).toMatchObject({
			count: 3,
		})
		expect(await update({ count: { divide: 2 } }, { count: -7 })).toMatchObject(
			{ count: -3 },
		)
	})

	it('starts from 0 on null', async () => {
		expect(await update({ count: { increment: 2 } })).toMatchObject({
			count: 2,
		})
		expect(
			await update({ ratio: { decrement: 1 } }, { ratio: null }),
		).toMatchObject({ ratio: -1 })
	})

	it('sets a value with set, and clears it with set: null', async () => {
		expect(await update({ count: { set: 9 } }, { count: 4 })).toMatchObject({
			count: 9,
		})
		expect(await update({ count: { set: null } }, { count: 4 })).toMatchObject({
			count: null,
		})
	})

	it('changes nothing for an operation by undefined', async () => {
		expect(
			await update(
				{ count: { increment: undefined }, label: 'x' },
				{ count: 4 },
			),
		).toMatchObject({ count: 4, label: 'x' })
		expect(
			await update({ count: { set: undefined } }, { count: 4 }),
		).toMatchObject({ count: 4 })
	})

	it('refuses two operations, none or an unknown one', async () => {
		const bad: unknown[] = [
			{},
			{ increment: 1, decrement: 1 },
			{ add: 1 },
			{ increment: 1, add: undefined },
		]
		for (const count of bad) {
			await expect(
				// @ts-expect-error: the test sends what the types refuse.
				update({ count }),
			).rejects.toMatchObject({
				code: 'INVALID_QUERY',
				message:
					'data.count takes a number or one of set, increment, decrement, multiply, divide.',
			})
		}
	})

	it('refuses dividing by 0 and a bad operand', async () => {
		await expect(update({ ratio: { divide: 0 } })).rejects.toMatchObject(
			refused('ratio', 'Cannot divide by 0.'),
		)
		await expect(update({ count: { increment: 1.5 } })).rejects.toMatchObject(
			refused('count', whole),
		)
		await expect(
			update({ ratio: { multiply: Number.POSITIVE_INFINITY } }),
		).rejects.toMatchObject(refused('ratio', 'Expected a finite number.'))
	})

	it('refuses a result out of bounds, written without its row', async () => {
		await expect(
			update({ count: { increment: 1 } }, { count: 2_147_483_647 }),
		).rejects.toMatchObject(refused('count', whole))
		await expect(
			update({ ratio: { multiply: 10 } }, { ratio: 1e308 }),
		).rejects.toMatchObject(refused('ratio', 'Expected a finite number.'))
	})

	it('refuses a result out of bounds on the row it reads', async () => {
		const stock = await Stock.create({ data: { level: 2_147_483_647 } }, M)
		await expect(
			Stock.update(
				{ where: { id: stock.id }, data: { level: { increment: 1 } } },
				M,
			),
		).rejects.toMatchObject(refused('level', whole))
	})
})

describe('what a number update shows the rules and hooks', () => {
	it('is the number the row will hold', async () => {
		const stock = await Stock.create({ data: { level: 10 } }, M)
		seen = []
		const updated = await Stock.update(
			{ where: { id: stock.id }, data: { level: { decrement: 3 } } },
			user,
		)
		expect(updated).toMatchObject({ level: 7 })
		expect(seen).toEqual([
			['rule', 7, 10],
			['before', 7],
			['after', 7],
		])
		await expect(
			Stock.update(
				{ where: { id: stock.id }, data: { level: { increment: 6 } } },
				user,
			),
		).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
	})

	it('validates the result, on the row it reads', async () => {
		const stock = await Stock.create({ data: { level: 1, capped: 60 } }, M)
		await expect(
			Stock.update(
				{ where: { id: stock.id }, data: { capped: { multiply: 2 } } },
				M,
			),
		).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
			details: { issues: [{ path: ['capped'] }] },
		})
		expect(
			await Stock.update(
				{ where: { id: stock.id }, data: { capped: { divide: 2 } } },
				M,
			),
		).toMatchObject({ capped: 30 })
	})
})

describe('the types of a number update', () => {
	it('take one operation on a number field only', () => {
		type Data = UpdateDataOf<typeof Counter>
		expectTypeOf<{ count: { increment: 1 } }>().toExtend<Data>()
		expectTypeOf<{ count: { set: null } }>().toExtend<Data>()
		expectTypeOf<{
			count: { increment: 1; decrement: 1 }
		}>().not.toExtend<Data>()
		expectTypeOf<{ count: { set: 'a' } }>().not.toExtend<Data>()
		expectTypeOf<{ label: { set: 'a' } }>().not.toExtend<Data>()
		expectTypeOf<{ points: { increment: 1 } }>().not.toExtend<Data>()
	})
})
