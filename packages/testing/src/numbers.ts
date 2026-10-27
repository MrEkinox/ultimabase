// The numbers of the contract (D-132): integer fields in 32 bits, and number
// updates computed by the write on the row as it finds it, `null` as 0.
import type { Adapter, UpdateDataOf } from 'ultimabase'
import { defineApp, defineModel, master } from 'ultimabase'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { silent } from './silent.ts'

const M = { as: master }

const Tally = defineModel({
	name: 'Tally',
	fields: (f) => ({
		count: f.number({ integer: true, optional: true }),
		ratio: f.number({ optional: true }),
		points: f.number({ integer: true, list: true }),
	}),
})

const whole = 'Expected a whole number from -2,147,483,648 to 2,147,483,647.'

const update = async (
	data: UpdateDataOf<typeof Tally>,
	from: { count?: number | null; ratio?: number | null },
) => {
	const { id } = await Tally.create({ data: from }, M)
	return Tally.update({ where: { id }, data }, M)
}

export function numbers(create: () => Adapter): void {
	const started = () =>
		defineApp({ database: create(), models: [Tally], logger: silent })
	describe('numbers', () => {
		let app: ReturnType<typeof started>
		beforeEach(async () => {
			app = started()
			await app.start()
		})
		afterEach(async () => app.stop())

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
