// The indexes that serve insensitive filters on postgres(), in a test file's
// own schema, with the results unchanged: a `contains` index's trigrams
// (D-141), and a case-insensitive unique key's lowered column (D-170).
import { testApplication } from '@ultimabase/testing'
import { Client } from 'pg'
import { defineApp, defineModel, master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { createAdapter } from './adapter.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const [server = ''] = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

const M = { as: master }
/** The statements the adapter sent, with their parameters. */
const sent: { sql: string; parameters: readonly unknown[] }[] = []
const database = createAdapter({
	url: server,
	log: (event) => sent.push(event.query),
})

const Book = defineModel({
	name: 'Book',
	fields: (f) => ({ title: f.string() }),
	indexes: [{ fields: ['title'], contains: true }],
})

const Account = defineModel({
	name: 'Account',
	fields: (f) => ({ username: f.string({ unique: 'insensitive' }) }),
})

/** The plan of the read `run` sends, sequential scans off. */
async function plan(run: () => Promise<unknown>): Promise<string> {
	sent.length = 0
	await run()
	const read = sent.at(-1)
	if (read === undefined) throw new Error('No statement was sent.')
	const [{ path } = { path: '' }] = await database.sql<{
		path: string
	}>`select current_setting('search_path') as path`
	const options = encodeURIComponent(`-c search_path=${path}`)
	const client = new Client({
		connectionString: `${server}${server.includes('?') ? '&' : '?'}options=${options}`,
	})
	await client.connect()
	try {
		await client.query('set enable_seqscan = off')
		const { rows } = await client.query<{ 'QUERY PLAN': string }>(
			`explain ${read.sql}`,
			[...read.parameters],
		)
		return rows.map((row) => row['QUERY PLAN']).join('\n')
	} finally {
		await client.end()
	}
}

describe('the indexes in a test schema', () => {
	testApplication(defineApp({ database, models: [Book, Account] }), {
		database: 'declared',
	})

	it("puts pg_trgm's schema after the test schema", async () => {
		const [row] = await database.sql<{
			path: string
			schema: string
		}>`select current_setting('search_path') as path, n.nspname as schema
			from pg_extension e join pg_namespace n on n.oid = e.extnamespace
			where e.extname = 'pg_trgm'`
		expect(row?.path).toMatch(/^ultimabase_test_[0-9a-f]{8}, ?\S+$/u)
		expect(row?.path.split(/, ?/u)[1]).toBe(row?.schema)
	})

	it('serves contains and endsWith in both modes, and every insensitive operator', async () => {
		const titles = ['Dune', 'Dune Messiah', 'Children of DUNE', 'Emma']
		await Book.createMany({ data: titles.map((title) => ({ title })) }, M)
		const found = async (where: object) =>
			(
				await Book.findMany(
					{
						where: { title: where },
						select: { title: true },
						orderBy: { title: 'asc' },
					},
					M,
				)
			).map(({ title }) => title)
		const cases: [object, string[]][] = [
			[{ contains: 'une' }, ['Dune', 'Dune Messiah']],
			[
				{ contains: 'une', mode: 'insensitive' },
				['Children of DUNE', 'Dune', 'Dune Messiah'],
			],
			[{ endsWith: 'DUNE' }, ['Children of DUNE']],
			[{ endsWith: 'dune', mode: 'insensitive' }, ['Children of DUNE', 'Dune']],
			[{ equals: 'dune', mode: 'insensitive' }, ['Dune']],
			[{ startsWith: 'dune', mode: 'insensitive' }, ['Dune', 'Dune Messiah']],
		]
		for (const [where, expected] of cases) {
			expect(await found(where)).toStrictEqual(expected)
			expect(await plan(async () => found(where))).toContain('book_title_trgm')
		}
	})

	it('serves an insensitive equality with a case-insensitive key', async () => {
		await Account.createMany(
			{ data: [{ username: 'Alice' }, { username: 'Bob' }] },
			M,
		)
		const find = async () =>
			Account.findMany(
				{
					where: { username: { equals: 'ALICE', mode: 'insensitive' } },
					select: { username: true },
				},
				M,
			)
		expect(await find()).toStrictEqual([{ username: 'Alice' }])
		expect(await plan(find)).toContain('account_username_lower_key')
	})
})
