// Filtered relations in the contract (D-151): a filter, one-to-many or
// many-to-many, narrows include, `_count`, a sort by it and some, every and
// none, in the adapter's one query.
import type { Adapter, Identity } from 'ultimabase'
import { allow, defineModel, master } from 'ultimabase'
import { beforeEach, describe, expect, it } from 'vitest'
import { started } from './suite.ts'

const M: { readonly as: Identity } = { as: master }

const Writer = defineModel({
	name: 'Writer',
	fields: (f) => ({
		name: f.string({ unique: true }),
		notes: f.many(() => Note),
		labels: f.many(() => Label),
	}),
}).with({
	access: allow.public,
	relations: {
		notes: { where: ({ where }) => where({ published: true }) },
		labels: { where: ({ where }) => where({ hidden: false }) },
	},
})

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		title: f.string(),
		published: f.boolean({ default: false }),
		writer: f.one(() => Writer, { optional: true }),
	}),
}).with({ access: allow.public })

const Label = defineModel({
	name: 'Label',
	fields: (f) => ({
		name: f.string(),
		hidden: f.boolean({ default: false }),
		writers: f.many(() => Writer),
	}),
}).with({ access: allow.public })

const names = async (where: object): Promise<unknown> =>
	Writer.findMany(
		{ where, orderBy: { name: 'asc' }, select: { name: true } },
		M,
	)
const named = (...list: readonly string[]) => list.map((name) => ({ name }))

export function relationFilters(create: () => Adapter): void {
	describe('filtered relations', () => {
		started(create, [Writer, Note, Label])

		beforeEach(async () => {
			await Writer.create(
				{
					data: {
						name: 'Ada',
						notes: {
							create: [
								{ title: 'One', published: true },
								{ title: 'Draft' },
								{ title: 'Two', published: true },
							],
						},
						labels: {
							create: [{ name: 'open' }, { name: 'secret', hidden: true }],
						},
					},
				},
				M,
			)
			await Writer.create(
				{ data: { name: 'Bob', notes: { create: [{ title: 'Bob draft' }] } } },
				M,
			)
		})

		it('includes and counts the rows the filter keeps', async () => {
			const rows = await Writer.findMany(
				{
					orderBy: [{ notes: { _count: 'desc' } }, { name: 'asc' }],
					select: {
						name: true,
						notes: { orderBy: { title: 'asc' }, select: { title: true } },
						labels: { select: { name: true } },
						_count: true,
					},
				},
				M,
			)
			expect(rows).toEqual([
				{
					name: 'Ada',
					notes: [{ title: 'One' }, { title: 'Two' }],
					labels: [{ name: 'open' }],
					_count: { notes: 2, labels: 1 },
				},
				{ name: 'Bob', notes: [], labels: [], _count: { notes: 0, labels: 0 } },
			])
		})

		it('filters some, every and none', async () => {
			expect(await names({ notes: { some: { title: 'Draft' } } })).toEqual([])
			expect(await names({ labels: { some: { hidden: true } } })).toEqual([])
			expect(await names({ notes: { every: { published: true } } })).toEqual(
				named('Ada', 'Bob'),
			)
			expect(await names({ notes: { none: {} } })).toEqual(named('Bob'))
		})
	})
}
