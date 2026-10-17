import { setTimeout as delay } from 'node:timers/promises'

import { UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { testApplication } from '@ultimabase/testing'
import { beforeAll, describe, expect, it, onTestFinished } from 'vitest'

// Run by test-application-vitest.postgres.e2e.test.ts in its own Vitest; the
// .check.ts suffix keeps it out of the repository's own projects.
const delivered: string[] = []
const App = UltimaBase.use(hooksPlugin(), postgresPlugin())
const Note = App.Schema.define({
	className: 'VitestProjectNote',
	fields: (field) => ({ body: field.string({ required: true }) }),
}).with({
	hooks: {
		afterCommit: {
			create: async ({ item }) => {
				// Post-commit work the response does not wait for.
				await delay(50)
				delivered.push(item.body)
			},
		},
	},
})
const ultimabase = new App({ logger: false, schemas: [Note] })

it('creates a note', async () => {
	await testApplication(ultimabase)
	await Note.createOne({ data: { body: 'first' } })
	expect(await Note.count()).toBe(1)
})

it('starts the next test from empty tables', async () => {
	await testApplication(ultimabase)
	expect(await Note.count()).toBe(0)
})

// ADR-0340 amendment: the test's own post-commit work is awaited when it
// finishes. onTestFinished callbacks run in reverse order, so this check
// runs after the wait testApplication registered.
it('waits for the post-commit work of the test when it finishes', async () => {
	delivered.length = 0
	onTestFinished(() => {
		expect(delivered).toStrictEqual(['late'])
	})
	await testApplication(ultimabase)
	await Note.createOne({ data: { body: 'late' } })
	expect(delivered).toStrictEqual([])
})

describe('outside a test', () => {
	beforeAll(async () => {
		await testApplication(ultimabase)
	})

	it('starts the application from beforeAll', async () => {
		expect(await Note.count()).toBe(0)
	})
})

it('listens on a free port', () => {
	expect(process.env.PORT).toBe('0')
})
