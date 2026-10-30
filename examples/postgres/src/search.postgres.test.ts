// postgres()'s options: its connections, and the language `_search` reads.
import { testApplication } from '@ultimabase/testing'
import { postgres } from '@ultimabase/postgres'
import { allow, defineApp, defineModel, master } from 'ultimabase'
import { expect, it, vi } from 'vitest'

// The repository's PostgreSQL tests run on TEST_DATABASE_URL.
vi.hoisted(() => {
	const [url] = (process.env['TEST_DATABASE_URL'] ?? '').split(' ')
	process.env['DATABASE_URL'] ??=
		url || 'postgres://postgres:postgres@localhost:54315/postgres'
})

const Article = defineModel({
	name: 'Article',
	fields: (f) => ({ body: f.string({ search: true }) }),
}).with({ access: allow.public })

//#region options
const app = defineApp({
	database: postgres({
		url: process.env['DATABASE_URL'],
		// At most 20 queries at once; the next waits up to 10 s for one.
		connections: 20,
		// Words stemmed as English: "running" finds "runs".
		searchLanguage: 'english',
	}),
	models: [Article],
})
//#endregion

testApplication(app, { database: 'declared' })

it('stems the words of a search in its language', async () => {
	//#region stems
	await Article.create(
		{ data: { body: 'She runs every morning' } },
		{ as: master },
	)
	const found = await Article.findMany(
		{ where: { _search: 'running' } },
		{ as: master },
	)
	expect(found.map((article) => article.body)).toEqual([
		'She runs every morning',
	])
	//#endregion
})
