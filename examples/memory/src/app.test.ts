// What memory() keeps, and what it shares with PostgreSQL.
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it } from 'vitest'
import { app } from './app.ts'
import { Contact } from './models.ts'

testApplication(app)

const as = { as: master }

it('changes nothing when a write fails', async () => {
	//#region whole
	const ada = { name: 'Ada', email: 'ada@example.com' }
	// The second has the first's email: the whole write is refused.
	const data = [ada, { ...ada, name: 'Ada L.' }]
	await expect(Contact.createMany({ data }, as)).rejects.toMatchObject({
		code: 'UNIQUE_VIOLATION',
	})
	expect(await Contact.count({}, as)).toBe(0)
	//#endregion
})

it('sorts strings by their bytes, as PostgreSQL\'s "C" collation does', async () => {
	//#region order
	const names = ['adam', 'Émile', 'Zoe', 'Ada']
	const data = names.map((name) => ({ name, email: `${name}@example.com` }))
	await Contact.createMany({ data }, as)
	const sorted = await Contact.findMany({ orderBy: { name: 'asc' } }, as)
	// Capitals first, then small letters, then letters with accents.
	expect(sorted.map((contact) => contact.name)).toEqual([
		'Ada',
		'Zoe',
		'adam',
		'Émile',
	])
	//#endregion
})

it("reads words as PostgreSQL's 'simple' search does", async () => {
	await Contact.createMany(
		{
			data: [
				{ name: 'Émile Zola', email: 'emile@example.com' },
				{ name: 'Jean-Paul Sartre', email: 'sartre@example.com' },
			],
		},
		as,
	)
	//#region words
	// With the contacts 'Émile Zola' and 'Jean-Paul Sartre'.
	const search = async (words: string) =>
		(await Contact.findMany({ where: { _search: words } }, as)).map(
			(contact) => contact.name,
		)
	// Words ignore case, a hyphen separates them, an accent counts.
	expect(await search('ZOLA')).toEqual(['Émile Zola'])
	expect(await search('paul')).toEqual(['Jean-Paul Sartre'])
	expect(await search('emile')).toEqual([])
	//#endregion
})
