// Calendar days in the contract (D-150): the string '2026-07-31' as written,
// filtered, sorted, grouped and aggregated in the calendar's order.
import type { Adapter, Identity } from 'ultimabase'
import { defineModel, master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { started } from './suite.ts'

const M: { readonly as: Identity } = { as: master }

const Shift = defineModel({
	name: 'Shift',
	fields: (f) => ({
		on: f.date(),
		off: f.date({ optional: true, unique: true }),
		team: f.string(),
	}),
})

const days = (rows: readonly { readonly on: string }[]) =>
	rows.map((row) => row.on)

const rows = [
	{ on: '2026-07-31', team: 'a' },
	{ on: '0001-01-01', team: 'b', off: '2026-12-25' },
	{ on: '2024-02-29', team: 'a' },
	{ on: '9999-12-31', team: 'b' },
	{ on: '2026-07-31', team: 'b' },
]

export function calendarDays(create: () => Adapter): void {
	describe('calendar days', () => {
		started(create, [Shift])

		it('reads each day as written, and finds it unique', async () => {
			const created = await Shift.create(
				{ data: { on: '2026-07-31', team: 'a', off: '2026-08-01' } },
				M,
			)
			expect(created).toMatchObject({ on: '2026-07-31', off: '2026-08-01' })
			const updated = await Shift.update(
				{ where: { id: created.id }, data: { on: '0001-01-01', off: null } },
				M,
			)
			expect(updated).toMatchObject({ on: '0001-01-01', off: null })
			await Shift.update(
				{ where: { id: created.id }, data: { off: '2024-02-29' } },
				M,
			)
			const found = await Shift.findUnique({ where: { off: '2024-02-29' } }, M)
			expect(found).toMatchObject({ id: created.id, on: '0001-01-01' })
		})

		it('filters and sorts in the calendar order', async () => {
			await Shift.createMany({ data: rows }, M)
			const sorted = await Shift.findMany(
				{ orderBy: [{ on: 'desc' }, { team: 'asc' }] },
				M,
			)
			expect(days(sorted)).toEqual([
				'9999-12-31',
				'2026-07-31',
				'2026-07-31',
				'2024-02-29',
				'0001-01-01',
			])
			const where = { on: { gt: '0001-01-01', lte: '2026-07-31' } }
			expect(await Shift.count({ where }, M)).toBe(3)
			const listed = { on: { in: ['2024-02-29', '9999-12-31'] } }
			expect(await Shift.count({ where: listed }, M)).toBe(2)
			const others = { on: { notIn: ['2026-07-31'], not: '0001-01-01' } }
			expect(await Shift.count({ where: others }, M)).toBe(2)
			expect(await Shift.count({ where: { on: '2026-07-31' } }, M)).toBe(2)
		})

		it('groups, picks one row per day and takes the least and the most', async () => {
			await Shift.createMany({ data: rows }, M)
			const groups = await Shift.groupBy(
				{ by: ['on'], _count: true, orderBy: { on: 'asc' } },
				M,
			)
			expect(groups).toStrictEqual([
				{ on: '0001-01-01', _count: 1 },
				{ on: '2024-02-29', _count: 1 },
				{ on: '2026-07-31', _count: 2 },
				{ on: '9999-12-31', _count: 1 },
			])
			const distinct = await Shift.findMany(
				{ distinct: ['on'], orderBy: { on: 'asc' } },
				M,
			)
			expect(days(distinct)).toEqual([
				'0001-01-01',
				'2024-02-29',
				'2026-07-31',
				'9999-12-31',
			])
			const result = await Shift.aggregate(
				{ _min: { on: true, off: true }, _max: { on: true, off: true } },
				M,
			)
			expect(result).toEqual({
				_min: { on: '0001-01-01', off: '2026-12-25' },
				_max: { on: '9999-12-31', off: '2026-12-25' },
			})
		})
	})
}
