// `distinct` in the contract (D-147): of the rows with the same keys, the
// first in `orderBy`'s order, then `skip` and `take`; rows with no value
// share a key, and a relation the caller cannot read is no relation.
import type { Adapter, Identity } from 'ultimabase'
import { defineModel, master } from 'ultimabase'
import { beforeEach, describe, expect, it } from 'vitest'
import { suiteUser } from './as-user.ts'
import { started } from './suite.ts'

const M: { readonly as: Identity } = { as: master }
const user = { as: suiteUser('00000000-0000-4000-8000-000000000000') }

/** A user reads the clubs that are not hidden. */
const Club = defineModel({
	name: 'Club',
	fields: (f) => ({
		hidden: f.boolean({ default: false }),
		visits: f.many(() => Visit),
	}),
}).with({ access: { read: ({ where }) => where({ hidden: false }) } })

const Visit = defineModel({
	name: 'Visit',
	fields: (f) => ({
		score: f.number({ integer: true }),
		region: f.string({ optional: true }),
		club: f.one(() => Club, { optional: true }),
	}),
}).with({ access: { read: () => true } })

const select = { score: true } as const
const scores = (rows: readonly { readonly score: number }[]): number[] =>
	rows.map((row) => row.score)

export function distincts(create: () => Adapter): void {
	describe('distincts', () => {
		started(create, [Club, Visit])

		beforeEach(async () => {
			const red = (await Club.create({ data: {} }, M)).id
			const blue = (await Club.create({ data: { hidden: true } }, M)).id
			const rows = [
				{ score: 1, region: 'n', club: red },
				{ score: 2, region: 'n', club: blue },
				{ score: 3, region: 's', club: red },
				{ score: 4 },
				{ score: 5, region: 's', club: blue },
				{ score: 6, club: red },
			]
			for (const { club, ...row } of rows) {
				const data =
					club === undefined ? row : { ...row, club: { connect: { id: club } } }
				await Visit.create({ data }, M)
			}
		})

		it('keeps the first row of each key in the order, the rows with no value together', async () => {
			const first = await Visit.findMany(
				{ distinct: ['region'], orderBy: { score: 'asc' }, select },
				M,
			)
			expect(scores(first)).toStrictEqual([1, 3, 4])
			const last = await Visit.findMany(
				{ distinct: ['region'], orderBy: { score: 'desc' }, select },
				M,
			)
			expect(scores(last)).toStrictEqual([6, 5, 2])
		})

		it('filters before it keeps, and pages after', async () => {
			const filtered = await Visit.findMany(
				{
					distinct: ['region'],
					where: { score: { gte: 3 } },
					orderBy: { score: 'asc' },
					select,
				},
				M,
			)
			expect(scores(filtered)).toStrictEqual([3, 4])
			const args = {
				distinct: ['region'],
				orderBy: { score: 'desc' },
				select,
			} as const
			const paged = await Visit.findMany({ ...args, skip: 1, take: 1 }, M)
			expect(scores(paged)).toStrictEqual([5])
			const back = await Visit.findMany({ ...args, take: -1 }, M)
			expect(scores(back)).toStrictEqual([2])
		})

		it('compares a relation by its target, none when unread', async () => {
			const args = {
				distinct: ['club'],
				orderBy: { score: 'asc' },
				select,
			} as const
			expect(scores(await Visit.findMany(args, M))).toStrictEqual([1, 2, 4])
			expect(scores(await Visit.findMany(args, user))).toStrictEqual([1, 2])
			const both = await Visit.findMany(
				{ ...args, distinct: ['region', 'club'] },
				M,
			)
			expect(scores(both)).toStrictEqual([1, 2, 3, 4, 5, 6])
		})
	})
}
