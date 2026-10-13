import process from 'node:process'

import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin, postgresPluginName } from '@ultimabase/postgres-plugin'
import { Pool } from 'pg'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

import {
	openDedicatedSchema,
	recordingLogger,
	testDatabaseUrl,
} from './support.ts'

// These tests start small applications themselves, one at a time, on a
// PostgreSQL schema of their own: `testApplication` only accepts the
// `postgresPlugin()` that reads `DATABASE_URL`.
let schema: Awaited<ReturnType<typeof openDedicatedSchema>>

beforeAll(async () => {
	schema = await openDedicatedSchema(
		`postgres_example_connection_${String(process.env.VITEST_POOL_ID)}`,
	)
})

afterAll(async () => {
	await schema.drop()
})

it('reads DATABASE_URL when the application starts', async () => {
	vi.stubEnv('DATABASE_URL', '')
	try {
		const Application = UltimaBase.use(postgresPlugin())
		// Creating the plugin and the application needs no environment.
		const application = new Application({ schemas: [] })

		const failure = application.start()

		await expect(failure).rejects.toThrow(
			/set the DATABASE_URL environment variable, or pass postgresPlugin\(\{ url \}\)/u,
		)
		await application.dispose()
	} finally {
		vi.unstubAllEnvs()
	}
})

it('opens the pool at start and closes it on dispose', async () => {
	const url = schema.url
	//#region lifecycle
	const Application = UltimaBase.use(postgresPlugin({ url }))
	const application = new Application({ schemas: [] })

	await application.start()
	const { connection } = application.plugin(postgresPluginName)
	const whileStarted = connection.state

	await application.dispose()
	const afterDispose = connection.state
	//#endregion lifecycle

	expect(whileStarted).toBe('connected')
	expect(afterDispose).toBe('closed')
})

it('leaves an injected pool to its owner', async () => {
	const connectionString = schema.url
	//#region own-pool
	const pool = new Pool({ connectionString, max: 5 })
	const Application = UltimaBase.use(postgresPlugin({ pool }))
	const application = new Application({ schemas: [] })

	await application.start()
	await application.dispose()

	// The application did not close your pool: you still own it.
	const { rows } = await pool.query('SELECT 1 AS ready')
	await pool.end()
	//#endregion own-pool

	expect(rows).toStrictEqual([{ ready: 1 }])
})

it('names only the driver code when the connection fails', async () => {
	const missing = new URL(testDatabaseUrl())
	missing.pathname = '/no_such_database'
	const { logger } = recordingLogger()
	const Application = UltimaBase.use(postgresPlugin({ url: missing.href }))
	const application = new Application({ schemas: [], logger })

	const failure = application.start()

	await expect(failure).rejects.toMatchObject({
		code: 'INTERNAL_ERROR',
		message: 'PostgreSQL connection verification failed [SQLSTATE 3D000].',
		publicMessage: 'The database connection could not be established.',
	})
	await application.dispose()
})

it('logs statements without their values', async () => {
	const { logger, messages } = recordingLogger()
	const Application = UltimaBase.use(
		postgresPlugin({ url: schema.url, debug: { logQueries: true } }),
	)
	const Tag = Application.Schema.define({
		className: 'Tag',
		fields: (field) => ({ label: field.string({ required: true }) }),
	})
	const application = new Application({ schemas: [Tag], logger })
	await application.start()
	try {
		await Tag.createOne({ data: { label: 'secret-label' } })
	} finally {
		await application.dispose()
	}

	const inserts = messages('info').filter((line) =>
		line.includes('insert into "tags"'),
	)
	expect(inserts).toStrictEqual([
		expect.stringMatching(
			/^\[@ultimabase\/postgres-plugin\] query \d+\.\d ms: insert into "tags" .*\$1/u,
		),
	])
	expect(messages('info').join('\n')).not.toContain('secret-label')
})
