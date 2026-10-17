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
		const App = UltimaBase.use(postgresPlugin())
		// Creating the plugin and the application needs no environment.
		const ultimabase = new App({ schemas: [] })

		const failure = ultimabase.start()

		await expect(failure).rejects.toThrow(
			/set the DATABASE_URL environment variable, or pass postgresPlugin\(\{ url \}\)/u,
		)
		await ultimabase.dispose()
	} finally {
		vi.unstubAllEnvs()
	}
})

it('opens the pool at start and closes it on dispose', async () => {
	const url = schema.url
	//#region lifecycle
	const App = UltimaBase.use(postgresPlugin({ url }))
	const ultimabase = new App({ schemas: [] })

	await ultimabase.start()
	const { connection } = ultimabase.plugin(postgresPluginName)
	const whileStarted = connection.state

	await ultimabase.dispose()
	const afterDispose = connection.state
	//#endregion lifecycle

	expect(whileStarted).toBe('connected')
	expect(afterDispose).toBe('closed')
})

it('logs the connection source and schema policy at debug', async () => {
	const { logger, messages } = recordingLogger()
	const App = UltimaBase.use(postgresPlugin({ url: schema.url }))
	const ultimabase = new App({
		schemas: [],
		logger,
		logLevel: 'debug',
	})

	await ultimabase.start()
	await ultimabase.dispose()

	// Where the connection comes from, never the URL itself.
	expect(messages('debug')).toEqual(
		expect.arrayContaining([
			'[@ultimabase/postgres-plugin] connection from the url option',
			'[@ultimabase/postgres-plugin] schemaPolicy override (NODE_ENV is not production)',
		]),
	)
	expect(messages('debug').join('\n')).not.toContain(schema.url)
})

it('leaves an injected pool to its owner', async () => {
	const connectionString = schema.url
	//#region own-pool
	const pool = new Pool({ connectionString, max: 5 })
	const App = UltimaBase.use(postgresPlugin({ pool }))
	const ultimabase = new App({ schemas: [] })

	await ultimabase.start()
	await ultimabase.dispose()

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
	const App = UltimaBase.use(postgresPlugin({ url: missing.href }))
	const ultimabase = new App({ schemas: [], logger })

	const failure = ultimabase.start()

	await expect(failure).rejects.toMatchObject({
		code: 'INTERNAL_ERROR',
		message: 'PostgreSQL connection verification failed [SQLSTATE 3D000].',
		publicMessage: 'The database connection could not be established.',
	})
	await ultimabase.dispose()
})

it('logs statements without their values', async () => {
	const { logger, messages } = recordingLogger()
	const App = UltimaBase.use(
		postgresPlugin({ url: schema.url, debug: { logQueries: true } }),
	)
	const Tag = App.Schema.define({
		className: 'Tag',
		fields: (field) => ({ label: field.string({ required: true }) }),
	})
	const ultimabase = new App({ schemas: [Tag], logger })
	await ultimabase.start()
	try {
		await Tag.createOne({ data: { label: 'secret-label' } })
	} finally {
		await ultimabase.dispose()
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
