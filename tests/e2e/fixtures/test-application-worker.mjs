// One test worker for test-application.postgres.e2e.test.ts: its
// VITEST_POOL_ID selects its schema; it prints what it reads.
import process from 'node:process'

import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { testApplication } from '@ultimabase/testing'

const App = UltimaBase.use(postgresPlugin())
const Note = App.Schema.define({
	className: 'TestApplicationNote',
	fields: (field) => ({ body: field.string({ required: true }) }),
})
const ultimabase = new App({ logger: false, schemas: [Note] })
const worker = process.env.VITEST_POOL_ID

{
	await using t = await testApplication(ultimabase)
	await Note.createOne({ data: { body: `worker-${worker}-a` } })
	await Note.createOne({ data: { body: `worker-${worker}-b` } })
	const notes = await Note.findMany({ orderBy: { body: 'asc' } })
	await t.afterCommit()
	process.stdout.write(JSON.stringify(notes.map(({ body }) => body)))
}
await ultimabase.dispose()
