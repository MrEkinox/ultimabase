// `prepared: false` plans every statement each time (D-274).
import { testApplication } from '@ultimabase/testing'
import { defineApp, defineModel, master } from 'ultimabase'
import { expect, it } from 'vitest'
import { postgres } from './index.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const [server = ''] = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

const M = { as: master }
const database = postgres({ url: server, connections: 1, prepared: false })

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ text: f.string() }),
})

testApplication(defineApp({ database, models: [Note] }), {
	database: 'declared',
})

it('holds no statement prepared, and reads and writes as ever', async () => {
	await Note.create({ data: { text: 'one' } }, M)
	await Note.create({ data: { text: 'two' } }, M)
	const rows = await Note.findMany({ orderBy: { text: 'asc' } }, M)
	expect(rows.map(({ text }) => text)).toEqual(['one', 'two'])
	expect(await database.sql`select name from pg_prepared_statements`).toEqual(
		[],
	)
})
