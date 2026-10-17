import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

import {
	getCurrentRequest,
	getRequestPrincipal,
	UltimaBase,
} from '@ultimabase/core'
import { openApplicationHarness, runAfterCommit } from '@ultimabase/core/plugin'
import { testApplication } from '@ultimabase/testing'
import { waitForAfterCommit } from '@ultimabase/testing/plugins'
import { ultimabaseTesting } from '@ultimabase/testing/vitest'
import { Pool } from 'pg'
import {
	afterAll,
	beforeAll,
	describe,
	expect,
	inject,
	it,
	onTestFinished,
} from 'vitest'

import { postgresConnectionUriContextKey } from '../../../../tests/fixtures/postgres-context.js'
import {
	urlDatabasePlugin,
	type UrlDatabasePluginOptions,
} from './fixtures/url-database.js'

// ADR-0327: testApplication starts the application on this worker's schema of
// TEST_DATABASE_URL. Its own database keeps the worker-slot fallbacks below
// from touching another file's schemas.
const containerUrl = inject(postgresConnectionUriContextKey)
const poolId = String(process.env.VITEST_POOL_ID)
const workerSchema = `ultimabase_test_${poolId}`
const databaseName = `testing_application_${poolId}`
const databaseUrl = (() => {
	const url = new URL(containerUrl)
	url.pathname = `/${databaseName}`
	return url.href
})()
const admin = new Pool({ connectionString: containerUrl, max: 1 })
let inspect: Pool | undefined
const applications: { running: () => boolean }[] = []

const listTestSchemas = async (): Promise<readonly string[]> => {
	const result = await inspect?.query<{ readonly name: string }>(
		"SELECT nspname AS name FROM pg_namespace WHERE nspname LIKE 'ultimabase_test_%' ORDER BY nspname",
	)
	return result?.rows.map(({ name }) => name) ?? []
}

/** Restores one environment variable once the current test finishes. */
const setEnvironment = (name: string, value: string | undefined): void => {
	const previous = process.env[name]
	if (value === undefined) Reflect.deleteProperty(process.env, name)
	else process.env[name] = value
	onTestFinished(() => {
		if (previous === undefined) Reflect.deleteProperty(process.env, name)
		else process.env[name] = previous
	})
}

// Registered before the Vitest setup file: after-all hooks run in reverse
// order, so this checks the cleanup the setup file performs after the file.
afterAll(async () => {
	try {
		expect(await listTestSchemas()).toStrictEqual([])
		expect(applications.some(({ running }) => running())).toBe(false)
	} finally {
		await inspect?.end()
		delete process.env.TEST_DATABASE_URL
		await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
		await admin.end()
	}
})

beforeAll(async () => {
	await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
	await admin.query(`CREATE DATABASE "${databaseName}"`)
	inspect = new Pool({ connectionString: databaseUrl, max: 1 })
	process.env.TEST_DATABASE_URL = databaseUrl
})

// What `ultimabaseTesting()` hands Vitest: per-test waits and file cleanup.
const [setupFile] = ultimabaseTesting().setupFiles
if (setupFile === undefined) throw new Error('No Vitest setup file')
await import(/* @vite-ignore */ setupFile)

const createApplication = (options: UrlDatabasePluginOptions = {}) => {
	const database = urlDatabasePlugin(options)
	const App = UltimaBase.use(database.plugin)
	const Note = App.Schema.define({
		className: 'TestingNote',
		fields: (field) => ({ body: field.string({ required: true }) }),
	})
	const ultimabase = new App({ logger: false, schemas: [Note] })
	applications.push({ running: () => ultimabase.state === 'started' })
	// Post-commit work the response does not wait for.
	const commitLater = (entry: string) =>
		ultimabase.transaction(() => {
			runAfterCommit(async () => {
				await delay(30)
				database.trace.push(entry)
			})
		})
	return { ...database, Note, commitLater, ultimabase }
}

describe('testApplication lifecycle', () => {
	// First: no application runs yet in this realm, so this one can start alone.
	it('refuses an application that is already started', async () => {
		const { ultimabase } = createApplication({ connect: false })
		await ultimabase.start()
		try {
			await expect(testApplication(ultimabase)).rejects.toThrow(
				'testApplication starts the application itself on an isolated database; it is already started',
			)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('starts the application on the worker schema through DATABASE_URL, then restores it', async () => {
		setEnvironment('DATABASE_URL', undefined)
		const { connections, Note, trace, ultimabase } = createApplication()
		await testApplication(ultimabase)
		expect(ultimabase.state).toBe('started')
		expect(process.env.DATABASE_URL).toBeUndefined()
		expect(connections).toHaveLength(1)
		expect(connections[0]).toMatchObject({
			applicationName: workerSchema,
			schema: workerSchema,
		})
		const url = new URL(connections[0]?.url ?? '')
		expect(url.pathname).toBe(`/${databaseName}`)
		expect(url.searchParams.get('options')).toBe(
			`-c search_path=${workerSchema}`,
		)
		expect(await listTestSchemas()).toStrictEqual([workerSchema])
		expect(trace).toStrictEqual(['connect', 'ready'])
		await Note.createOne({ data: { body: 'first' } })
		expect(await Note.count()).toBe(1)
	})

	it('reuses a started application from empty tables and reruns its seeding', async () => {
		const { connections, Note, trace, ultimabase } = createApplication()
		await testApplication(ultimabase)
		await Note.createOne({ data: { body: 'first' } })
		await testApplication(ultimabase)
		expect(await Note.count()).toBe(0)
		// Reused, not restarted: one connection, reset then seeding again.
		expect(connections).toHaveLength(1)
		expect(trace).toStrictEqual(['connect', 'ready', 'reset', 'ready'])
	})

	it('waits for pending after-commit work before a reuse or a reset empties the tables', async () => {
		const { commitLater, trace, ultimabase } = createApplication()
		const t = await testApplication(ultimabase)
		await commitLater('before reuse')
		await testApplication(ultimabase)
		await commitLater('before reset')
		await t.reset()
		expect(trace.slice(2)).toStrictEqual([
			'before reuse',
			'reset',
			'ready',
			'before reset',
			'reset',
			'ready',
		])
	})

	it('stops the previous application when another one starts', async () => {
		const first = createApplication()
		const previous = await testApplication(first.ultimabase)
		const second = createApplication()
		await testApplication(second.ultimabase)
		expect(first.ultimabase.state).toBe('disposed')
		expect(first.trace.at(-1)).toBe('dispose')
		expect(second.trace).toStrictEqual(['connect', 'ready'])
		// The worker schema was recreated empty for the new application.
		expect(await listTestSchemas()).toStrictEqual([workerSchema])
		await expect(previous.reset()).rejects.toThrow(
			'This testApplication handle is closed',
		)
	})

	it('refuses a database plugin that does not connect through DATABASE_URL', async () => {
		setEnvironment('DATABASE_URL', 'postgres://kept.invalid/application')
		const { trace, ultimabase } = createApplication({ connect: false })
		await expect(testApplication(ultimabase)).rejects.toThrow(
			'testApplication could not isolate this application: its database plugin did not connect through DATABASE_URL. Use postgresPlugin() without url or pool.',
		)
		// Never left running on a database testApplication would reset.
		expect(ultimabase.state).toBe('disposed')
		expect(trace).toContain('dispose')
		expect(await listTestSchemas()).toStrictEqual([])
		expect(process.env.DATABASE_URL).toBe('postgres://kept.invalid/application')
	})

	it('disposes the application and drops the schema when the start fails', async () => {
		setEnvironment('DATABASE_URL', 'postgres://kept.invalid/application')
		const failure = new Error('seeding failed')
		const { trace, ultimabase } = createApplication({ failReady: failure })
		const error: unknown = await testApplication(ultimabase).catch(
			(caught: unknown) => caught,
		)
		expect(error).toBeInstanceOf(Error)
		expect(String(error)).toContain('seeding failed')
		expect(ultimabase.state).toBe('disposed')
		expect(trace).toStrictEqual(['connect', 'ready', 'dispose'])
		expect(await listTestSchemas()).toStrictEqual([])
		expect(process.env.DATABASE_URL).toBe('postgres://kept.invalid/application')
	})

	it('refuses NODE_ENV=production before touching the application', async () => {
		setEnvironment('NODE_ENV', 'production')
		const { trace, ultimabase } = createApplication()
		await expect(testApplication(ultimabase)).rejects.toThrow(
			'testApplication refuses NODE_ENV=production: it empties tables and grants Master without a key',
		)
		expect(ultimabase.state).toBe('idle')
		expect(trace).toStrictEqual([])
	})

	it('names the worker schema after JEST_WORKER_ID outside Vitest, otherwise worker 1', async () => {
		setEnvironment('VITEST_POOL_ID', undefined)
		setEnvironment('JEST_WORKER_ID', '7')
		const jest = createApplication()
		await testApplication(jest.ultimabase)
		expect(jest.connections[0]?.schema).toBe('ultimabase_test_7')

		setEnvironment('JEST_WORKER_ID', 'not-a-worker')
		const single = createApplication()
		await testApplication(single.ultimabase)
		expect(single.connections[0]?.schema).toBe('ultimabase_test_1')
		expect(await listTestSchemas()).toStrictEqual(['ultimabase_test_1'])
	})

	it('reports an invalid Vitest worker slot and starts once it is fixed', async () => {
		setEnvironment('VITEST_POOL_ID', 'worker')
		const { ultimabase } = createApplication()
		await expect(testApplication(ultimabase)).rejects.toThrow(
			'VITEST_POOL_ID must be a positive integer',
		)
		expect(ultimabase.state).toBe('idle')
		process.env.VITEST_POOL_ID = poolId
		await testApplication(ultimabase)
		expect(ultimabase.state).toBe('started')
	})

	it('refuses an application harnessed elsewhere and drops the schema it opened', async () => {
		const { trace, ultimabase } = createApplication()
		openApplicationHarness(ultimabase)
		await expect(testApplication(ultimabase)).rejects.toThrow(
			'This application already has a harness',
		)
		expect(ultimabase.state).toBe('idle')
		expect(trace).toStrictEqual([])
		expect(await listTestSchemas()).toStrictEqual([])
	})
})

describe('testApplication handle', () => {
	it('runs calls as a principal, anonymously or with Master', async () => {
		const { Note, ultimabase } = createApplication()
		const t = await testApplication(ultimabase)
		const readRequest = async () => {
			const request = getCurrentRequest()
			return {
				mode: request.access.mode,
				principal: await getRequestPrincipal(request),
				requestId: request.requestId,
				source: request.source,
			}
		}
		const owner = Note.pointer('owner-1')
		const asOwner = await t.as(owner, readRequest)
		expect(asOwner).toMatchObject({
			mode: 'anonymous',
			principal: owner,
			source: 'test',
		})
		const anonymous = await t.as(undefined, readRequest)
		expect(anonymous).toMatchObject({ mode: 'anonymous', source: 'test' })
		expect(anonymous.principal).toBeUndefined()
		const master = await t.asMaster(readRequest)
		expect(master).toMatchObject({ mode: 'master', source: 'test' })
		// Every call is its own request.
		expect(
			new Set([asOwner.requestId, anonymous.requestId, master.requestId]).size,
		).toBe(3)
		// Results are awaited and returned as they are.
		expect(
			await t.asMaster(async () => {
				await delay(1)
				return 'master result'
			}),
		).toBe('master result')
		expect(await t.as(undefined, () => 42)).toBe(42)
	})

	it('awaits after-commit work through the handle and waitForAfterCommit', async () => {
		const { commitLater, trace, ultimabase } = createApplication()
		const t = await testApplication(ultimabase)
		await commitLater('handle')
		expect(trace).not.toContain('handle')
		await t.afterCommit()
		expect(trace.at(-1)).toBe('handle')
		await commitLater('plugin entry')
		await waitForAfterCommit()
		expect(trace.at(-1)).toBe('plugin entry')
	})

	it('closes at the end of its scope after the pending after-commit work', async () => {
		const { commitLater, Note, trace, ultimabase } = createApplication()
		const t = await testApplication(ultimabase)
		{
			await using scoped = t
			await commitLater('scoped')
			expect(scoped).toBe(t)
		}
		expect(trace.at(-1)).toBe('scoped')
		const closed = 'This testApplication handle is closed'
		await expect(t.reset()).rejects.toThrow(closed)
		await expect(t.asMaster(() => Note.count())).rejects.toThrow(closed)
		await expect(t.as(undefined, () => Note.count())).rejects.toThrow(closed)
		await expect(t.fetch('/health')).rejects.toThrow(closed)
		// Disposing again does nothing; the application keeps running.
		await t[Symbol.asyncDispose]()
		expect(ultimabase.state).toBe('started')
		await expect(t.afterCommit()).resolves.toBeUndefined()
	})
})

describe('per-test after-commit wait (ADR-0340)', () => {
	it('waits for the post-commit work of the test when it finishes', async () => {
		const { commitLater, trace, ultimabase } = createApplication()
		// onTestFinished callbacks run in reverse order: this check runs after
		// the wait testApplication registered.
		onTestFinished(() => {
			expect(trace.at(-1)).toBe('late')
		})
		await testApplication(ultimabase)
		await commitLater('late')
		expect(trace).not.toContain('late')
	})

	describe('outside a test', () => {
		const application = createApplication()

		beforeAll(async () => {
			await testApplication(application.ultimabase)
		})

		it('starts the application from beforeAll', async () => {
			expect(application.ultimabase.state).toBe('started')
			expect(await application.Note.count()).toBe(0)
		})
	})
})
