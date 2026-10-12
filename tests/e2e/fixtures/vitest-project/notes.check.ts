import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

// Run by test-application-vitest.postgres.e2e.test.ts in its own Vitest; the
// .check.ts suffix keeps it out of the repository's own projects.
const App = UltimaBase.use(postgresPlugin())
const Note = App.Schema.define({
	className: 'VitestProjectNote',
	fields: (field) => ({ body: field.string({ required: true }) }),
})
const ultimabase = new App({ logger: false, schemas: [Note] })

it('creates a note', async () => {
	await using t = await testApplication(ultimabase)
	await Note.createOne({ data: { body: 'first' } })
	expect(await Note.count()).toBe(1)
	await t.afterCommit()
})

it('starts the next test from empty tables', async () => {
	await using t = await testApplication(ultimabase)
	expect(await Note.count()).toBe(0)
	await t.afterCommit()
})

it('listens on a free port', () => {
	expect(process.env.PORT).toBe('0')
})
