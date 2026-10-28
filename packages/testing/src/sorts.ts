// The `null`s of a sort in the contract (D-149): first or last as `nulls`
// says, by default last ascending and first descending, in a read, through
// a `one` relation, with a cursor, with `distinct` and in `groupBy`.
import type { Adapter, ArgsOf } from 'ultimabase'
import { defineModel, master } from 'ultimabase'
import { beforeEach, describe, expect, it } from 'vitest'
import { started } from './suite.ts'

const M = { as: master }

const Writer = defineModel({
	name: 'Writer',
	fields: (f) => ({
		nick: f.string({ optional: true }),
		notes: f.many(() => Note),
	}),
})

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		title: f.string({ unique: true }),
		rank: f.number({ optional: true }),
		writer: f.one(() => Writer, { optional: true }),
	}),
})

type Args = Pick<
	ArgsOf<typeof Note, 'findMany'>,
	'orderBy' | 'cursor' | 'take' | 'distinct'
>
const titles = async (args: Args): Promise<string[]> =>
	(await Note.findMany({ ...args }, M)).map((note) => note.title)
const rank = async (orderBy: Args['orderBy']): Promise<string[]> =>
	titles({ orderBy })

export function sorts(create: () => Adapter): void {
	describe('sorts', () => {
		started(create, [Writer, Note])

		// a and d by x, b by a writer with no nick, c by none.
		beforeEach(async () => {
			const x = await Writer.create({ data: { nick: 'x' } }, M)
			const anon = await Writer.create({ data: {} }, M)
			const notes = [
				{ title: 'a', rank: 2, writer: x.id },
				{ title: 'b', rank: null, writer: anon.id },
				{ title: 'c', rank: 1 },
				{ title: 'd', rank: null, writer: x.id },
			]
			for (const { writer, ...data } of notes) {
				const connected =
					writer === undefined
						? data
						: { ...data, writer: { connect: { id: writer } } }
				await Note.create({ data: connected }, M)
			}
		})

		it('puts the nulls first or last', async () => {
			expect(await rank({ rank: { sort: 'asc', nulls: 'first' } })).toEqual([
				'b',
				'd',
				'c',
				'a',
			])
			expect(await rank({ rank: { sort: 'desc', nulls: 'last' } })).toEqual([
				'a',
				'c',
				'b',
				'd',
			])
			expect(await rank({ rank: { sort: 'asc' } })).toEqual([
				'c',
				'a',
				'b',
				'd',
			])
			expect(await rank({ rank: { sort: 'desc', nulls: 'first' } })).toEqual([
				'b',
				'd',
				'a',
				'c',
			])
			// A row the relation does not reach has a null too.
			expect(
				await rank({ writer: { nick: { sort: 'asc', nulls: 'first' } } }),
			).toEqual(['b', 'c', 'a', 'd'])
		})

		it('pages from a cursor where the nulls sort, forwards and backwards', async () => {
			const last = { rank: { sort: 'desc', nulls: 'last' } } as const
			const first = { rank: { sort: 'asc', nulls: 'first' } } as const
			const from = (title: string, orderBy: Args['orderBy'], take: number) =>
				titles({ orderBy, cursor: { title }, take })
			expect(await from('c', last, 2)).toEqual(['c', 'b'])
			expect(await from('c', last, -2)).toEqual(['a', 'c'])
			expect(await from('b', last, 2)).toEqual(['b', 'd'])
			expect(await from('b', last, -2)).toEqual(['c', 'b'])
			expect(await from('d', first, 2)).toEqual(['d', 'c'])
			expect(await from('d', first, -2)).toEqual(['b', 'd'])
			expect(await titles({ orderBy: first, take: -3 })).toEqual([
				'd',
				'c',
				'a',
			])
		})

		it('keeps the first row of each distinct key where the nulls sort', async () => {
			expect(
				await titles({
					distinct: ['writer'],
					orderBy: { rank: { sort: 'asc', nulls: 'first' } },
				}),
			).toEqual(['b', 'd', 'c'])
		})

		it('sorts the groups of an optional key with their null', async () => {
			const ranks = async (nulls: 'first' | 'last') =>
				(
					await Note.groupBy(
						{ by: ['rank'], orderBy: { rank: { sort: 'desc', nulls } } },
						M,
					)
				).map((group) => group.rank)
			expect(await ranks('last')).toEqual([2, 1, null])
			expect(await ranks('first')).toEqual([null, 2, 1])
			const writers = await Note.groupBy(
				{
					by: ['writer'],
					_count: true,
					orderBy: [
						{ _count: 'desc' },
						{ writer: { sort: 'asc', nulls: 'first' } },
					],
				},
				M,
			)
			expect(writers.map((group) => group._count)).toEqual([2, 1, 1])
			expect(writers[1]?.writer).toBeNull()
		})
	})
}
