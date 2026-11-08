// An include of ids alone, on postgres() (D-336): outside a transaction the
// keys are read and the target is not; a target with a filter, more than
// ids, or a read in a transaction, where a key may dangle, still reads it.
import { softDelete, softDeletePlugin } from '@ultimabase/soft-delete'
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
const Tag = defineModel({
	name: 'Tag',
	fields: (f) => ({
		name: f.string(),
		notes: f.many(() => Note, { inverse: 'tags' }),
	}),
})
const Reviewer = defineModel({
	name: 'Reviewer',
	fields: (f) => ({ name: f.string() }),
	use: [softDelete()],
})
const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		text: f.string(),
		author: f.one(() => Author),
		editor: f.one(() => Author, { optional: true }),
		reviewer: f.one(() => Reviewer, { optional: true }),
		tags: f.many(() => Tag, { inverse: 'notes' }),
	}),
})

/** The note `include` reads, and whether its statement read `table`. */
async function read(
	include: object,
	table: string,
): Promise<[unknown, boolean]> {
	sent.length = 0
	const note = await Note.findFirst({ select: { text: true, ...include } }, M)
	return [note, (sent.at(-1) ?? '').includes(`from "${table}" as`)]
}

describe('an include of ids alone', () => {
	testApplication(
		defineApp({
			database,
			plugins: [softDeletePlugin()],
			models: [Author, Tag, Reviewer, Note],
		}),
		{ database: 'declared' },
	)

	it('reads the keys outside a transaction, with the same result', async () => {
		const ann = await Author.create({ data: { name: 'Ann' } }, M)
		const tags = await Promise.all(
			['a', 'b', 'c'].map(async (name) => Tag.create({ data: { name } }, M)),
		)
		const ids = tags.map(({ id }) => id).toSorted()
		await Note.create(
			{
				data: {
					text: 'n',
					author: { connect: { id: ann.id } },
					tags: { connect: ids.map((id) => ({ id })) },
				},
			},
			M,
		)
		const id = { select: { id: true } }
		const cases: [object, string, unknown, boolean][] = [
			[{ author: id }, 'author', { id: ann.id }, false],
			[{ editor: id }, 'author', null, false],
			[{ author: { select: { name: true } } }, 'author', { name: 'Ann' }, true],
			[{ tags: id }, 'tag', ids.map((each) => ({ id: each })), false],
			[
				{ tags: { ...id, orderBy: { id: 'desc' }, take: 2, skip: 1 } },
				'tag',
				ids
					.toReversed()
					.slice(1, 3)
					.map((each) => ({ id: each })),
				false,
			],
			[
				{ tags: { ...id, where: { name: 'b' } } },
				'tag',
				[{ id: tags[1]?.id }],
				true,
			],
			[
				{ tags: { ...id, orderBy: { name: 'asc' } } },
				'tag',
				ids.map((each) => ({ id: each })),
				true,
			],
			[
				{ tags: { ...id, cursor: { id: ids[1] } } },
				'tag',
				ids.slice(1).map((each) => ({ id: each })),
				true,
			],
		]
		for (const [include, table, expected, reads] of cases) {
			const [note, statement] = await read(include, table)
			const [field = ''] = Object.keys(include)
			expect(note).toStrictEqual({ text: 'n', [field]: expected })
			expect(statement).toBe(reads)
		}
	})

	it('reads a target with a filter: one in the trash reads null', async () => {
		const ann = await Author.create({ data: { name: 'Ann' } }, M)
		const rex = await Reviewer.create({ data: { name: 'Rex' } }, M)
		await Note.create(
			{
				data: {
					text: 'n',
					author: { connect: { id: ann.id } },
					reviewer: { connect: { id: rex.id } },
				},
			},
			M,
		)
		await Reviewer.delete({ where: { id: rex.id } }, M)
		const [note, reads] = await read(
			{ reviewer: { select: { id: true } } },
			'reviewer',
		)
		expect(note).toStrictEqual({ text: 'n', reviewer: null })
		expect(reads).toBe(true)
	})

	it('reads the target in a transaction, where a key may dangle until COMMIT', async () => {
		const ann = await Author.create({ data: { name: 'Ann' } }, M)
		await Note.create(
			{ data: { text: 'n', author: { connect: { id: ann.id } } } },
			M,
		)
		const undone = new Error('undone')
		const run = transaction(async () => {
			// The foreign key is deferred (D-99): the note's key dangles.
			await database.sql`delete from "author" where "id" = ${ann.id}`
			const [note, reads] = await read(
				{ author: { select: { id: true } } },
				'author',
			)
			expect(note).toStrictEqual({ text: 'n', author: null })
			expect(reads).toBe(true)
			throw undone
		})
		await expect(run).rejects.toBe(undone)
	})
})
