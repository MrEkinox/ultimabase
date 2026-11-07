// A stored key's target with one id, tested on postgres() (D-320): outside a
// transaction, a committed key names a row and the key alone is tested; in a
// transaction, a deferred foreign key may still dangle, so the row is read.
import { testApplication } from '@ultimabase/testing'
import { defineApp, defineModel, master, transaction } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { createAdapter } from './adapter.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const [server = ''] = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

const M = { as: master }
/** The statements the adapter sent. */
const sent: string[] = []
const database = createAdapter({
	url: server,
	log: (event) => sent.push(event.query.sql),
})

const Author = defineModel({
	name: 'Author',
	fields: (f) => ({ name: f.string() }),
})

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		text: f.string(),
		author: f.one(() => Author),
		editor: f.one(() => Author, { optional: true }),
	}),
})

/** The texts of the notes `where` selects, and the statement that read them. */
async function texts(where: object): Promise<[string[], string]> {
	sent.length = 0
	const notes = await Note.findMany(
		{ where, select: { text: true }, orderBy: { text: 'asc' } },
		M,
	)
	return [notes.map(({ text }) => text), sent.at(-1) ?? '']
}

describe("a stored key's target with one id", () => {
	testApplication(defineApp({ database, models: [Author, Note] }), {
		database: 'declared',
	})

	it('tests the key alone outside a transaction, with the same rows', async () => {
		const ann = await Author.create({ data: { name: 'Ann' } }, M)
		const ben = await Author.create({ data: { name: 'Ben' } }, M)
		await Note.createMany(
			{
				data: [
					{ text: 'a', author: { connect: { id: ann.id } } },
					{
						text: 'b',
						author: { connect: { id: ben.id } },
						editor: { connect: { id: ann.id } },
					},
					{ text: 'c', author: { connect: { id: ben.id } } },
				],
			},
			M,
		)
		// Whether the target's row is read: only with more than its id to test.
		const cases: [object, string[], boolean][] = [
			[{ author: { is: { id: ann.id } } }, ['a'], false],
			[{ author: { isNot: { id: ann.id } } }, ['b', 'c'], false],
			[{ editor: { is: { id: ann.id } } }, ['b'], false],
			// A null key is no match, and its negation holds (two-valued).
			[{ editor: { isNot: { id: ann.id } } }, ['a', 'c'], false],
			[{ NOT: [{ editor: { is: { id: ann.id } } }] }, ['a', 'c'], false],
			[{ author: { is: { id: 'not an id' } } }, [], false],
			[{ editor: { is: { id: ann.id, name: 'Ann' } } }, ['b'], true],
			[{ author: { is: { id: { in: [ann.id] } } } }, ['a'], true],
			[
				{ author: { is: { id: { equals: ann.id, not: ben.id } } } },
				['a'],
				true,
			],
		]
		for (const [where, expected, read] of cases) {
			const [found, statement] = await texts(where)
			expect(found).toStrictEqual(expected)
			expect(statement.includes('exists')).toBe(read)
		}
	})

	it('reads the row in a transaction, where a key may dangle until COMMIT', async () => {
		const ann = await Author.create({ data: { name: 'Ann' } }, M)
		await Note.create(
			{ data: { text: 'a', author: { connect: { id: ann.id } } } },
			M,
		)
		const undone = new Error('undone')
		const read = transaction(async () => {
			// The foreign key is deferred (D-99): the note's key dangles.
			await database.sql`delete from "author" where "id" = ${ann.id}`
			const [found, statement] = await texts({ author: { is: { id: ann.id } } })
			expect(found).toStrictEqual([])
			expect(statement).toContain('exists')
			throw undone
		})
		await expect(read).rejects.toBe(undone)
		expect((await texts({ author: { is: { id: ann.id } } }))[0]).toStrictEqual([
			'a',
		])
	})
})
