// What memory() keeps, and what it shares with PostgreSQL.
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it } from 'vitest'
import { app } from './app.ts'
import { Contact } from './models.ts'

testApplication(app)

const as = { as: master }
const names = (rows: readonly { readonly name: string }[]): string[] =>
	rows.map((row) => row.name)

it('changes nothing when a write fails', async () => {
	//#region whole
	// The second email is the first's: the whole write is refused.
	await expect(
		Contact.createMany(
			{
				data: [
					{ name: 'Ada', email: 'ada@example.com' },
					{ name: 'Ada L.', email: 'ada@example.com' },
				],
			},
			as,
		),
	).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' })
	expect(await Contact.count({}, as)).toBe(0)
	//#endregion
})

it('sorts strings by their bytes, as PostgreSQL\'s "C" collation does', async () => {
	//#region order
	await Contact.createMany(
		{
			data: [
				{ name: 'adam', email: 'adam@example.com' },
				{ name: 'Émile', email: 'emile@example.com' },
				{ name: 'Zoe', email: 'zoe@example.com' },
				{ name: 'Ada', email: 'ada@example.com' },
			],
		},
		as,
	)
	const sorted = await Contact.findMany({ orderBy: { name: 'asc' } }, as)
	// Capitals first, then small letters, then letters with accents.
	expect(names(sorted)).toEqual(['Ada', 'Zoe', 'adam', 'Émile'])
	//#endregion
})

it("reads words as PostgreSQL's 'simple' search does", async () => {
	//#region words
	await Contact.createMany(
		{
			data: [
				{ name: 'Émile Zola', email: 'emile@example.com' },
				{ name: 'Jean-Paul Sartre', email: 'sartre@example.com' },
			],
		},
		as,
	)
	const search = async (words: string) =>
		names(await Contact.findMany({ where: { _search: words } }, as))
	// Words ignore case, a hyphen separates them, an accent counts.
	expect(await search('ZOLA')).toEqual(['Émile Zola'])
	expect(await search('paul')).toEqual(['Jean-Paul Sartre'])
	expect(await search('emile')).toEqual([])
	//#endregion
})
