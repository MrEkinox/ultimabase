// Groups in the contract (D-146): rows with no value form one group, a
// relation is its target's id or `null` when the caller cannot read it, and
// the order is total, keys ascending after `orderBy`, nulls last; `having`
// keeps the groups by their values and aggregates (D-149).
import type { Adapter, Identity } from 'ultimabase'
import { defineModel, master } from 'ultimabase'
import { beforeEach, describe, expect, it } from 'vitest'
import { suiteUser } from './as-user.ts'
import { started } from './suite.ts'

const M: { readonly as: Identity } = { as: master }
const user = { as: suiteUser('00000000-0000-4000-8000-000000000000') }

/** A user reads the teams that are not hidden. */
const Team = defineModel({
	name: 'Team',
	fields: (f) => ({
		hidden: f.boolean({ default: false }),
		deals: f.many(() => Deal),
	}),
}).with({ access: { read: ({ where }) => where({ hidden: false }) } })

const Deal = defineModel({
	name: 'Deal',
	fields: (f) => ({
		stage: f.enumOf(['b', 'a', 'c']),
		amount: f.decimal({ precision: 8, scale: 2 }),
		units: f.number({ integer: true, optional: true }),
		on: f.dateTime({ optional: true }),
		region: f.string({ optional: true }),
		team: f.one(() => Team, { optional: true }),
	}),
}).with({ access: { read: () => true } })

const day = (n: number): Date => new Date(Date.UTC(2026, 4, n, 12, 30))
const stages = async (
	kept: Promise<readonly { readonly stage: string }[]>,
): Promise<string[]> => (await kept).map((group) => group.stage)

export function groups(create: () => Adapter): void {
	describe('groups', () => {
		started(create, [Team, Deal])

		let red = ''
		let blue = ''
		beforeEach(async () => {
			red = (await Team.create({ data: {} }, M)).id
			blue = (await Team.create({ data: { hidden: true } }, M)).id
			const rows = [
				{ stage: 'a', amount: '1.10', units: 2, on: day(1), region: 'n' },
				{ stage: 'a', amount: '2.20', units: 3, on: day(1), region: 'n' },
				{ stage: 'b', amount: '5', on: day(2), region: 's' },
				{ stage: 'c', amount: '10', units: 1 },
				{ stage: 'b', amount: '1', units: 4, on: day(2), region: 's' },
			] as const
			const teams = [red, blue, red, undefined, red]
			for (const [at, row] of rows.entries()) {
				const id = teams[at]
				const data =
					id === undefined ? row : { ...row, team: { connect: { id } } }
				await Deal.create({ data }, M)
			}
		})

		it('groups by scalars and dates, the rows with no value together', async () => {
			const result = await Deal.groupBy(
				{ by: ['region', 'on'], _count: true, _sum: { amount: true } },
				M,
			)
			expect(result).toStrictEqual([
				{ region: 'n', on: day(1), _count: 2, _sum: { amount: '3.30' } },
				{ region: 's', on: day(2), _count: 2, _sum: { amount: '6.00' } },
				{ region: null, on: null, _count: 1, _sum: { amount: '10.00' } },
			])
			const regions = await Deal.groupBy(
				{ by: ['region'], orderBy: { region: 'desc' } },
				M,
			)
			expect(regions).toStrictEqual([
				{ region: null },
				{ region: 's' },
				{ region: 'n' },
			])
		})

		it('sorts by an aggregate, then by the keys, and pages', async () => {
			const counted = await Deal.groupBy(
				{ by: ['stage'], orderBy: { _count: 'desc' }, _max: { units: true } },
				M,
			)
			expect(counted).toStrictEqual([
				{ stage: 'a', _max: { units: 3 } },
				{ stage: 'b', _max: { units: 4 } },
				{ stage: 'c', _max: { units: 1 } },
			])
			const summed = { _sum: { amount: 'desc' } } as const
			const sorted = await Deal.groupBy({ by: ['stage'], orderBy: summed }, M)
			expect(sorted).toStrictEqual([
				{ stage: 'c' },
				{ stage: 'b' },
				{ stage: 'a' },
			])
			const paged = await Deal.groupBy(
				{ by: ['stage'], orderBy: summed, skip: 1, take: 1 },
				M,
			)
			expect(paged).toStrictEqual([{ stage: 'b' }])
		})

		it('groups by a relation, null when unset or unread', async () => {
			const args = {
				by: ['team'],
				orderBy: { _count: 'desc' },
				_count: true,
			} as const
			expect(await Deal.groupBy(args, M)).toStrictEqual([
				{ team: { id: red }, _count: 3 },
				{ team: { id: blue }, _count: 1 },
				{ team: null, _count: 1 },
			])
			expect(await Deal.groupBy(args, user)).toStrictEqual([
				{ team: { id: red }, _count: 3 },
				{ team: null, _count: 2 },
			])
		})

		it('keeps the groups having passes, by their values and aggregates', async () => {
			const by = ['stage'] as const
			const sum = { amount: { _sum: { gt: '5' } } } as const
			expect(await stages(Deal.groupBy({ by, having: sum }, M))).toEqual([
				'b',
				'c',
			])
			const counts = {
				stage: { in: ['a', 'b'] },
				amount: { _count: 2 },
			} as const
			expect(await stages(Deal.groupBy({ by, having: counts }, M))).toEqual([
				'a',
				'b',
			])
			const average = { units: { _avg: { lt: 3 } } } as const
			expect(await stages(Deal.groupBy({ by, having: average }, M))).toEqual([
				'a',
				'c',
			])
			const least = { on: { _min: { gte: day(2) } } } as const
			expect(await stages(Deal.groupBy({ by, having: least }, M))).toEqual([
				'b',
			])
			const either = {
				OR: [{ stage: 'c' }, { units: { _max: { gte: 4 } } }],
			} as const
			expect(await stages(Deal.groupBy({ by, having: either }, M))).toEqual([
				'b',
				'c',
			])
			const dated = { NOT: { on: { _min: { equals: null } } } } as const
			expect(await stages(Deal.groupBy({ by, having: dated }, M))).toEqual([
				'a',
				'b',
			])
			const counted = await Deal.groupBy(
				{
					by: ['stage', 'region'],
					_count: true,
					having: { region: { not: null }, amount: { _count: { gt: 1 } } },
					orderBy: { _sum: { amount: 'desc' } },
				},
				M,
			)
			expect(counted).toStrictEqual([
				{ stage: 'b', region: 's', _count: 2 },
				{ stage: 'a', region: 'n', _count: 2 },
			])
		})

		it('gives no groups without rows', async () => {
			const where = { region: 'w' }
			expect(
				await Deal.groupBy({ by: ['stage'], where, _count: true }, M),
			).toStrictEqual([])
		})
	})
}
