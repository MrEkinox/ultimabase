// The numbers of the contract (D-132): integer fields in 32 bits, and number
// updates computed by the write on the row as it finds it, `null` as 0.
import type { Adapter, UpdateDataOf } from 'ultimabase'
import { defineModel, master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { started } from './suite.ts'

const M = { as: master }

const Tally = defineModel({
	name: 'Tally',
	fields: (f) => ({
		count: f.number({ integer: true, optional: true }),
		ratio: f.number({ optional: true }),
		points: f.number({ integer: true, list: true }),
	}),
})

/** An update hook: `updateMany` locks the rows and groups their writes. */
const Stock = defineModel({
	name: 'Stock',
	fields: (f) => ({ level: f.number({ integer: true }) }),
}).with({ hooks: { beforeUpdate: () => {} } })

const whole = 'Expected a whole number from -2,147,483,648 to 2,147,483,647.'

const update = async (
	data: UpdateDataOf<typeof Tally>,
	from: { count?: number | null; ratio?: number | null },
) => {
	const { id } = await Tally.create({ data: from }, M)
	return Tally.update({ where: { id }, data }, M)
}

export function numbers(create: () => Adapter): void {
	describe('numbers', () => {
		started(create, [Tally, Stock])

		it('stores and filters whole numbers in 32 bits', async () => {
			const points = [-2_147_483_648, 0, 2_147_483_647]
			await Tally.create({ data: { count: 2_147_483_647, points } }, M)
			await Tally.create({ data: { count: -3, points: [1] } }, M)
			const found = await Tally.findMany(
				{ where: { count: { gt: 0 }, points: { has: 0 } } },
				M,
			)
			expect(found).toMatchObject([{ count: 2_147_483_647, points }])
			expect(
				await Tally.count({ where: { points: { hasSome: [1, 5] } } }, M),
			).toBe(1)
		})

		it('computes each operation on the stored number', async () => {
			expect(
				await update({ count: { increment: 3 } }, { count: 4 }),
			).toMatchObject({ count: 7 })
			expect(
				await update({ count: { decrement: 2 } }, { count: null }),
			).toMatchObject({ count: -2 })
			expect(
				await update({ count: { divide: 2 } }, { count: -7 }),
			).toMatchObject({ count: -3 })
			expect(
				await update({ ratio: { multiply: 1.5 } }, { ratio: 3 }),
			).toMatchObject({ ratio: 4.5 })
			expect(
				await update({ ratio: { divide: 4 } }, { ratio: 3 }),
			).toMatchObject({ ratio: 0.75 })
		})

		it('computes updateMany on each row, with or without its hooks', async () => {
			for (const count of [1, null, 5]) {
				await Tally.create({ data: { count } }, M)
			}
			const data = { count: { increment: 2 } }
			expect(await Tally.updateMany({ data }, M)).toEqual({ count: 3 })
			const counts = async () =>
				(await Tally.findMany({}, M)).map((row) => row.count)
			expect(await counts()).toEqual([3, 2, 7])
			await Tally.create({ data: { count: 2_147_483_647 } }, M)
			await expect(Tally.updateMany({ data }, M)).rejects.toMatchObject({
				code: 'VALIDATION_FAILED',
				details: { issues: [{ path: ['count'], message: whole }] },
			})
			expect(await counts()).toEqual([3, 2, 7, 2_147_483_647])
			for (const level of [1, 2]) await Stock.create({ data: { level } }, M)
			const doubled = { level: { multiply: 2 } }
			expect(await Stock.updateMany({ data: doubled }, M)).toEqual({
				count: 2,
			})
			const levels = await Stock.findMany({}, M)
			expect(levels.map((row) => row.level)).toEqual([2, 4])
		})

		it('refuses a result out of bounds, and keeps the row', async () => {
			for (const [data, from, path, message] of [
				[{ count: { increment: 1 } }, { count: 2_147_483_647 }, 'count', whole],
				[
					{ count: { multiply: -2 } },
					{ count: -1_073_741_825 },
					'count',
					whole,
				],
				[
					{ ratio: { multiply: 10 } },
					{ ratio: 1e308 },
					'ratio',
					'Expected a finite number.',
				],
			] as const) {
				await expect(update(data, from)).rejects.toMatchObject({
					code: 'VALIDATION_FAILED',
					details: { issues: [{ path: [path], message }] },
				})
			}
			expect(
				(await Tally.findMany({}, M)).map(({ count, ratio }) => [count, ratio]),
			).toEqual([
				[2_147_483_647, null],
				[-1_073_741_825, null],
				[null, 1e308],
			])
		})
	})
}
