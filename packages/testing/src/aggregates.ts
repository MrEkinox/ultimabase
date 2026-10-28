// Aggregates in the contract (D-143): a `null` is skipped, no value gives
// `null`, strings compare by code point, dates come back as dates. The
// numbers add up exactly, so both adapters give the same sums.
import type { Adapter, Identity } from 'ultimabase'
import { defineModel, master } from 'ultimabase'
import { beforeEach, describe, expect, it } from 'vitest'
import { started } from './suite.ts'

const M: { readonly as: Identity } = { as: master }

const Sale = defineModel({
	name: 'Sale',
	fields: (f) => ({
		amount: f.number(),
		units: f.number({ integer: true, optional: true }),
		code: f.string({ optional: true }),
		stage: f.enumOf(['b', 'a', 'c']),
		on: f.date({ optional: true }),
		region: f.string(),
	}),
})

/** More aggregates than a database function takes arguments. */
const names = Array.from({ length: 21 }, (_, at) => `n${at}`)
const Wide = defineModel({
	name: 'Wide',
	fields: (f) => Object.fromEntries(names.map((name) => [name, f.number()])),
})

const day = (n: number): Date => new Date(Date.UTC(2026, 4, n, 12, 30))

export function aggregates(create: () => Adapter): void {
	describe('aggregates', () => {
		started(create, [Sale, Wide])

		beforeEach(async () => {
			await Sale.createMany(
				{
					data: [
						{
							amount: 1.5,
							units: 2,
							code: 'a',
							stage: 'b',
							on: day(3),
							region: 'n',
						},
						{
							amount: 0.25,
							units: 5,
							code: 'Z',
							stage: 'c',
							on: day(1),
							region: 'n',
						},
						{ amount: -4, code: 'é', stage: 'a', region: 'n' },
						{ amount: 100, units: 7, stage: 'c', on: day(9), region: 's' },
					],
				},
				M,
			)
		})

		it('aggregates the rows `where` selects, skipping nulls', async () => {
			expect(
				await Sale.aggregate(
					{
						where: { region: 'n' },
						_count: { _all: true, units: true, on: true },
						_sum: { amount: true, units: true },
						_avg: { amount: true, units: true },
						_min: { amount: true, code: true, on: true, stage: true },
						_max: { units: true, code: true, on: true, stage: true },
					},
					M,
				),
			).toStrictEqual({
				_count: { _all: 3, units: 2, on: 2 },
				_sum: { amount: -2.25, units: 7 },
				_avg: { amount: -0.75, units: 3.5 },
				_min: { amount: -4, code: 'Z', on: day(1), stage: 'a' },
				_max: { units: 5, code: 'é', on: day(3), stage: 'c' },
			})
		})

		it('counts rows and gives null without a value', async () => {
			expect(await Sale.aggregate({ _count: true }, M)).toStrictEqual({
				_count: 4,
			})
			expect(
				await Sale.aggregate(
					{
						where: { region: 'w' },
						_count: true,
						_sum: { amount: true },
						_avg: { units: true },
						_min: { on: true },
						_max: { code: true },
					},
					M,
				),
			).toStrictEqual({
				_count: 0,
				_sum: { amount: null },
				_avg: { units: null },
				_min: { on: null },
				_max: { code: null },
			})
		})

		it('takes more aggregates than a function takes arguments', async () => {
			const all = Object.fromEntries(names.map((name) => [name, true] as const))
			const row = Object.fromEntries(names.map((name, at) => [name, at]))
			await Wide.create({ data: row }, M)
			const result = await Wide.aggregate(
				{ _count: all, _sum: all, _avg: all, _min: all, _max: all },
				M,
			)
			expect(result).toStrictEqual({
				_count: Object.fromEntries(names.map((name) => [name, 1])),
				_sum: row,
				_avg: row,
				_min: row,
				_max: row,
			})
		})
	})
}
