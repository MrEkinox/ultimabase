// Decimals in the contract (D-145): exact strings at their field's scale,
// filtered, sorted and aggregated by value, beyond a double's digits.
import type { Adapter, Identity } from 'ultimabase'
import { defineModel, master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { started } from './suite.ts'

const M: { readonly as: Identity } = { as: master }

const Price = defineModel({
	name: 'Price',
	fields: (f) => ({
		amount: f.decimal({ precision: 6, scale: 2 }),
		code: f.decimal({ precision: 4, scale: 1, optional: true, unique: true }),
		exact: f.decimal({ precision: 30, scale: 10, optional: true }),
	}),
})

const amounts = (rows: readonly { readonly amount: string }[]) =>
	rows.map((row) => row.amount)

export function decimals(create: () => Adapter): void {
	describe('decimals', () => {
		started(create, [Price])

		it('stores each value at its scale, beyond a double', async () => {
			const exact = '12345678901234567890.0123456789'
			const created = await Price.create(
				{ data: { amount: '012.5', code: '-0', exact } },
				M,
			)
			expect(created).toMatchObject({ amount: '12.50', code: '0.0', exact })
			const updated = await Price.update(
				{ where: { id: created.id }, data: { amount: '7.500', exact: null } },
				M,
			)
			expect(updated).toMatchObject({ amount: '7.50', exact: null })
			const found = await Price.findUnique({ where: { code: '0' } }, M)
			expect(found?.id).toBe(created.id)
		})

		it('filters and sorts by value, not by text', async () => {
			const nine = await Price.create({ data: { amount: '9.5' } }, M)
			await Price.createMany(
				{ data: ['10', '-2.25', '100'].map((amount) => ({ amount })) },
				M,
			)
			const sorted = await Price.findMany({ orderBy: { amount: 'asc' } }, M)
			expect(amounts(sorted)).toEqual(['-2.25', '9.50', '10.00', '100.00'])
			const where = { amount: { gt: '9.5', lte: '100.00' } }
			expect(amounts(await Price.findMany({ where }, M))).toEqual([
				'10.00',
				'100.00',
			])
			const listed = { amount: { in: ['10', '-2.250'] } }
			expect(await Price.count({ where: listed }, M)).toBe(2)
			const after = await Price.findMany(
				{
					orderBy: { amount: 'desc' },
					cursor: { id: nine.id },
					skip: 1,
				},
				M,
			)
			expect(amounts(after)).toEqual(['-2.25'])
			const before = await Price.findMany(
				{ orderBy: { amount: 'asc' }, cursor: { id: nine.id } },
				M,
			)
			expect(amounts(before)).toEqual(['9.50', '10.00', '100.00'])
		})

		it('sums exactly, at the scale, and compares by value', async () => {
			await Price.createMany(
				{
					data: [
						{ amount: '0.10', exact: '0.1' },
						{ amount: '0.20', exact: '99999999999999999999.9999999999' },
						{ amount: '-10' },
						{ amount: '9' },
					],
				},
				M,
			)
			const result = await Price.aggregate(
				{
					_sum: { amount: true, exact: true },
					_avg: { amount: true },
					_min: { amount: true },
					_max: { amount: true, code: true },
				},
				M,
			)
			expect(result).toEqual({
				_sum: { amount: '-0.70', exact: '100000000000000000000.0999999999' },
				_avg: { amount: -0.175 },
				_min: { amount: '-10.00' },
				_max: { amount: '9.00', code: null },
			})
		})
	})
}
