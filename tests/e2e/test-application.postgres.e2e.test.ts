import { execFile } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

import { accessPlugin } from '@ultimabase/access-plugin'
import { UltimaBase } from '@ultimabase/core'
import { openApplicationHarness } from '@ultimabase/core/plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'
import { testApplication } from '@ultimabase/testing'
import { Pool } from 'pg'
import { afterAll, describe, expect, inject, it } from 'vitest'

import { postgresConnectionUriContextKey } from '../fixtures/postgres-context.js'

// ADR-0327: testApplication starts the production application itself on the
// worker's schema, from TEST_DATABASE_URL here (the repository's container).
const databaseUrl = inject(postgresConnectionUriContextKey)
process.env.TEST_DATABASE_URL = databaseUrl
const execFileAsync = promisify(execFile)
const committed: string[] = []

const App = UltimaBase.use(
	accessPlugin(),
	hooksPlugin(),
	httpPlugin(),
	restPlugin(),
	postgresPlugin(),
)

const Member = App.Schema.define({
	className: 'TestApplicationMember',
	fields: (field) => ({ name: field.string({ required: true }) }),
}).with({ access: { read: true, create: false } })

const Note = App.Schema.define({
	className: 'TestApplicationNote',
	fields: (field) => ({
		body: field.string({ required: true }),
		owner: field.pointer({ target: () => Member }),
		sequence: field.int({ autoIncrement: true }),
	}),
}).with({
	// Only the owner reads a note; nobody else writes one.
	access: {
		read: ({ principal, where }) =>
			principal === undefined ? false : where.eq('owner', principal.id),
		create: false,
	},
	hooks: {
		afterCommit: {
			create: ({ item }) => {
				committed.push(item.body)
			},
		},
	},
	rest: true,
})

const ultimabase = new App({ logger: false, schemas: [Member, Note] })
const admin = new Pool({ connectionString: databaseUrl, max: 1 })
const workerSchema = `ultimabase_test_${String(process.env.VITEST_POOL_ID)}`

afterAll(async () => {
	await admin.end()
})

const countRows = async (schema: string): Promise<number> => {
	const result = await admin.query<{ readonly count: number }>(
		`SELECT count(*)::int AS count FROM "${schema}"."test_application_notes"`,
	)
	return result.rows[0]?.count ?? 0
}

type Handle = Awaited<ReturnType<typeof testApplication>>

// Writes are denied to ordinary callers: seeding uses Master.
const seed = (t: Handle, body: string) =>
	t.asMaster(async () => {
		const member = await Member.createOne({ data: { name: body } })
		const note = await Note.createOne({
			data: { body, owner: { connect: member.id } },
			select: { sequence: true },
		})
		return { member, note }
	})

describe('testApplication', () => {
	it('starts the application on the worker schema of TEST_DATABASE_URL', async () => {
		await using t = await testApplication(ultimabase)
		expect(ultimabase.state).toBe('started')
		await seed(t, 'first')
		expect(await countRows(workerSchema)).toBe(1)
		const tables = await admin.query<{ readonly schema: string }>(
			`SELECT schemaname AS schema FROM pg_tables WHERE tablename = 'test_application_notes'`,
		)
		expect(tables.rows.map(({ schema }) => schema)).toStrictEqual([
			workerSchema,
		])
	})

	it('reuses the started application from empty tables', async () => {
		await using t = await testApplication(ultimabase)
		expect(await countRows(workerSchema)).toBe(0)
		const { note } = await seed(t, 'second')
		// Identity sequences restart with the tables.
		expect(note.sequence).toBe(1)
		expect(await countRows(workerSchema)).toBe(1)
		await t.reset()
		expect(await countRows(workerSchema)).toBe(0)
		expect(await t.asMaster(() => Note.count())).toBe(0)
	})

	it('runs calls as a principal or with Master, only through the handle', async () => {
		await using t = await testApplication(ultimabase)
		const { member } = await seed(t, 'mine')
		await seed(t, 'theirs')
		const owner = Member.pointer(member.id)

		await expect(Note.findMany({})).rejects.toMatchObject({
			code: 'PERMISSION_DENIED',
		})
		const mine = await t.as(owner, () => Note.findMany({}))
		expect(mine.map(({ body }) => body)).toStrictEqual(['mine'])
		await expect(
			t.as(undefined, () => Note.findMany({})),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		expect(await t.asMaster(() => Note.count())).toBe(2)
		// Master needs a configured authority outside the harness.
		await expect(Note.count({}, { useMasterKey: true })).rejects.toMatchObject({
			code: 'PERMISSION_DENIED',
		})
		expect(() => openApplicationHarness(ultimabase)).toThrow(
			'An application harness must be opened before the application starts; received started',
		)
	})

	it('sends in-memory requests through the HTTP plugin', async () => {
		await using t = await testApplication(ultimabase)
		const health = await t.fetch('/health')
		expect(health.status).toBe(200)
		const denied = await t.fetch('/api/classes/TestApplicationNote')
		expect(denied.status).toBe(403)
		const members = await t.fetch('/api/classes/TestApplicationMember')
		expect(await members.json()).toMatchObject({ results: [] })
	})

	it('awaits after-commit work', async () => {
		await using t = await testApplication(ultimabase)
		committed.length = 0
		await seed(t, 'committed')
		await t.afterCommit()
		expect(committed).toStrictEqual(['committed'])
	})

	it('closes a handle when its scope ends', async () => {
		const t = await testApplication(ultimabase)
		await t[Symbol.asyncDispose]()
		await expect(t.reset()).rejects.toThrow(
			'This testApplication handle is closed',
		)
		await expect(t.asMaster(() => Note.count())).rejects.toThrow(
			'This testApplication handle is closed',
		)
	})

	it('refuses production', async () => {
		const previous = process.env.NODE_ENV
		process.env.NODE_ENV = 'production'
		try {
			await expect(testApplication(ultimabase)).rejects.toThrow(
				'testApplication refuses NODE_ENV=production: it empties tables and grants Master without a key',
			)
		} finally {
			process.env.NODE_ENV = previous
		}
	})

	it('isolates concurrent workers in their own schemas', async () => {
		const script = path.join(
			import.meta.dirname,
			'fixtures/test-application-worker.mjs',
		)
		const run = (workerId: number) =>
			execFileAsync(process.execPath, [script], {
				env: {
					...process.env,
					TEST_DATABASE_URL: databaseUrl,
					VITEST_POOL_ID: String(workerId),
				},
			})
		const [first, second] = await Promise.all([run(901), run(902)])
		expect(JSON.parse(first.stdout)).toStrictEqual([
			'worker-901-a',
			'worker-901-b',
		])
		expect(JSON.parse(second.stdout)).toStrictEqual([
			'worker-902-a',
			'worker-902-b',
		])
		for (const workerId of [901, 902]) {
			expect(await countRows(`ultimabase_test_${String(workerId)}`)).toBe(2)
			await admin.query(
				`DROP SCHEMA "ultimabase_test_${String(workerId)}" CASCADE`,
			)
		}
	}, 60_000)
})
