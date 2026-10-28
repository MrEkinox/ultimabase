// The setup the contract suites share: each test on a new database, its
// application started before and stopped after.
import type { Adapter } from 'ultimabase'
import { defineApp } from 'ultimabase'
import { afterEach, beforeEach } from 'vitest'
import { silent } from './silent.ts'

type Models = Parameters<typeof defineApp>[0]['models']

/** Starts `models` on a new database for each test; reads that database. */
export function started(create: () => Adapter, models: Models): () => Adapter {
	let database: Adapter
	let app: ReturnType<typeof defineApp>
	beforeEach(async () => {
		database = create()
		app = defineApp({ database, models, logger: silent })
		await app.start()
	})
	afterEach(async () => app.stop())
	return () => database
}
