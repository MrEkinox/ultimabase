// Full-text search in the contract (D-148): `_search` keeps the rows whose
// searched fields hold the words of a web-style query, `_relevance` sorts
// them by how often those words occur, or for an and how near.
import type { Adapter, Identity } from 'ultimabase'
import { defineModel, master } from 'ultimabase'
import { beforeEach, describe, expect, it } from 'vitest'
import { started } from './suite.ts'

const M: { readonly as: Identity } = { as: master }

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		title: f.string({ search: true }),
		body: f.string({ search: true, optional: true }),
		order: f.number({ integer: true }),
	}),
})

const notes = [
	{ title: 'Red apples', body: 'apple pie and apple jam', order: 1 },
	{ title: 'Green pears', body: 'no apple here', order: 2 },
	{ title: 'Blue sky', order: 3 },
	{ title: 'Apple trees', body: 'orchards', order: 4 },
]

const found = async (search: string): Promise<number[]> => {
	const rows = await Note.findMany(
		{ where: { _search: search }, orderBy: { order: 'asc' } },
		M,
	)
	return rows.map((row) => row.order)
}

export function searches(create: () => Adapter): void {
	describe('searches', () => {
		started(create, [Note])

		beforeEach(async () => {
			await Note.createMany({ data: notes }, M)
		})

		it('matches words across the searched fields, whatever their case', async () => {
			expect(await found('APPLE')).toStrictEqual([1, 2, 4])
			expect(await found('apple orchards')).toStrictEqual([4])
			expect(await found('sky or pears')).toStrictEqual([2, 3])
			expect(await found('apple -pears')).toStrictEqual([1, 4])
			expect(await found('"blue sky"')).toStrictEqual([3])
			expect(await found('"sky blue"')).toStrictEqual([])
			expect(await found(' - "" ')).toStrictEqual([])
		})

		it('ranks the rows by how often the words occur', async () => {
			const rows = await Note.findMany(
				{
					where: { _search: 'apple' },
					orderBy: [{ _relevance: 'desc' }, { order: 'desc' }],
				},
				M,
			)
			expect(rows.map((row) => row.order)).toStrictEqual([1, 4, 2])
		})

		it('ranks an and of words by how near they are, none past 100 words', async () => {
			const far = `${'filler '.repeat(100)}jam`
			await Note.createMany(
				{
					data: [
						{ title: 'Apple far', body: far, order: 6 },
						{ title: 'Jam', body: 'one apple', order: 5 },
					],
				},
				M,
			)
			const rows = await Note.findMany(
				{ where: { _search: 'apple jam' }, orderBy: { _relevance: 'desc' } },
				M,
			)
			expect(rows.map((row) => row.order)).toStrictEqual([1, 5, 6])
		})
	})
}
