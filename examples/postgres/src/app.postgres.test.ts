// Run as a developer and a host run it, in a schema of its own on
// TEST_DATABASE_URL: the `ultimabase` commands (D-105), then a production
// start.
import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { dirname } from 'node:path'
import { Client } from 'pg'
import { afterEach, beforeEach, expect, it } from 'vitest'

const [server = ''] = (
	process.env['TEST_DATABASE_URL'] ??
	'postgres://postgres:postgres@localhost:54315/postgres'
)
	.split(' ')
	.filter((url) => url !== '')

async function query(statement: string): Promise<unknown[]> {
	const client = new Client({ connectionString: server })
	await client.connect()
	try {
		return (await client.query<Record<string, unknown>>(statement)).rows
	} finally {
		await client.end()
	}
}

let schema = ''
beforeEach(async () => {
	schema = `t_${randomUUID().replaceAll('-', '')}`
	await query(`create schema "${schema}"`)
})
afterEach(async () => {
	await query(`drop schema "${schema}" cascade`)
})

type Ran = {
	readonly code: number | null
	readonly signal: NodeJS.Signals | null
	readonly output: string
}

/**
 * Runs `npx ultimabase <command>` in the example on the test schema, in
 * production unless `env` says otherwise; once it prints `Listening on`,
 * hands its address to `use`, then stops it.
 */
async function ultimabase(
	command: string,
	{
		env = {},
		use,
	}: {
		readonly env?: { readonly [name: string]: string }
		readonly use?: (url: string) => Promise<void>
	} = {},
): Promise<Ran> {
	const options = encodeURIComponent(`-c search_path=${schema}`)
	const child = spawn('yarn', ['ultimabase', ...command.split(' ')], {
		cwd: dirname(import.meta.dirname),
		env: {
			...process.env,
			DATABASE_URL: `${server}?options=${options}`,
			NODE_ENV: 'production',
			NO_COLOR: '1',
			PORT: '0',
			...env,
		},
	})
	let output = ''
	let used: Promise<void> | undefined
	const read = (chunk: unknown) => {
		output += String(chunk)
		const url = /Listening on (\S+)\./.exec(output)?.[1]
		if (url !== undefined && use !== undefined && used === undefined) {
			used = use(url).finally(() => child.kill('SIGTERM'))
		}
	}
	child.stdout.on('data', read)
	child.stderr.on('data', read)
	const [code, signal] = await new Promise<
		[number | null, NodeJS.Signals | null]
	>((resolve, reject) => {
		child.once('error', reject)
		child.once('close', (...ended) => {
			resolve(ended)
		})
	})
	await used
	return { code, signal, output }
}

const development = { NODE_ENV: 'development' }
// Up to five processes start in turn: alone about 2 s each, more while the
// whole suite measures coverage beside them.
const processes = 60_000

it(
	'refuses a production start before the migrations are deployed',
	async () => {
		//#region refused
		expect(await ultimabase('start')).toMatchObject({
			code: 1,
			output:
				'The database has no UltimaBase schema: run `npx ultimabase migrate deploy`, then start again.\n',
		})
		//#endregion
		//#region unreachable
		expect(
			await ultimabase('start', { env: { DATABASE_URL: '' } }),
		).toMatchObject({
			code: 1,
			output: 'postgres() was given no url: is the variable it reads set?\n',
		})
		expect(
			await ultimabase('start', {
				env: { DATABASE_URL: 'postgres://postgres@localhost:1/app' },
			}),
		).toMatchObject({
			code: 1,
			output:
				'Cannot reach PostgreSQL at localhost:1 (ECONNREFUSED): is it running, and is its url right?\n',
		})
		//#endregion
		//#region short-key
		expect(
			await ultimabase('start', { env: { MASTER_KEY: 'secret' } }),
		).toMatchObject({
			code: 1,
			output:
				'The master key is 6 characters long; production needs 32 at least: `openssl rand -base64 32` gives one.\n',
		})
		//#endregion
	},
	processes,
)

it(
	'deploys the migrations, then serves the application on them',
	async () => {
		//#region status
		// Exits 1 while a deploy has something to do.
		expect(await ultimabase('migrate status')).toMatchObject({
			code: 1,
			output: [
				'20261026200257_init.sql is pending.',
				'20261029230454_add_priority.sql is pending.',
				'20261029230505_first_tasks_urgent.sql is pending.',
				'20261029230507_open_tasks_index.sql is pending.',
				'',
			].join('\n'),
		})
		//#endregion
		//#region deploy
		expect(await ultimabase('migrate deploy')).toMatchObject({
			code: 0,
			output: [
				'Applied 20261026200257_init.sql.',
				'Applied 20261029230454_add_priority.sql.',
				'Applied 20261029230505_first_tasks_urgent.sql.',
				'Applied 20261029230507_open_tasks_index.sql.',
				'',
			].join('\n'),
		})
		expect(await ultimabase('migrate status')).toMatchObject({
			code: 0,
			output: 'The database is up to date.\n',
		})
		//#endregion
		//#region index
		// The index the migration without a transaction built.
		expect(
			await query(
				`select indexname from pg_indexes where schemaname = '${schema}' and tablename = 'task' order by indexname`,
			),
		).toEqual([
			{ indexname: 'task_open_idx' },
			{ indexname: 'task_pkey' },
			{ indexname: 'task_project_id_idx' },
		])
		//#endregion

		//#region start
		let body: unknown
		const started = await ultimabase('start', {
			// `openssl rand -base64 32` gives such a key.
			env: { MASTER_KEY: randomBytes(32).toString('base64') },
			use: async (url) => {
				const response = await fetch(`${url}/graphql`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						query: `mutation { createProject(data: { name: "Launch",
						tasks: { create: [{ title: "Write the README" }] } }) {
						name tasks { edges { node { title done priority } } } } }`,
					}),
				})
				body = await response.json()
			},
		})
		expect(body).toEqual({
			data: {
				createProject: {
					name: 'Launch',
					tasks: {
						edges: [
							{ node: { title: 'Write the README', done: false, priority: 0 } },
						],
					},
				},
			},
		})
		// SIGTERM finishes the requests under way, then stops it: it ends
		// with 143, 128 plus SIGTERM's number.
		expect(started.code).toBe(143)
		expect(started.output).toContain('Application stopped.')
		//#endregion
	},
	processes,
)

it(
	'syncs a development database, then rebuilds it from the migrations',
	async () => {
		//#region sync
		const synced = await ultimabase('sync', { env: development })
		expect(synced.code).toBe(0)
		expect(synced.output).toContain("Created the database's tables.")
		expect(await ultimabase('sync', { env: development })).toMatchObject({
			code: 0,
			output: 'The database already matches the models.\n',
		})
		//#endregion
		//#region synced-deploy
		// A deploy runs only on a database the migrations built.
		expect(
			await ultimabase('migrate deploy', { env: development }),
		).toMatchObject({
			code: 1,
			output: [
				'Development sync changed this database since its last deploy: deploy applies migrations only to a database they built.',
				'Restore the dump you test on, or rebuild this database from the migrations with `npx ultimabase reset`.',
				'',
			].join('\n'),
		})
		//#endregion
		//#region reset
		expect(await ultimabase('reset', { env: development })).toMatchObject({
			code: 0,
			output: [
				'Dropped project, task.',
				'Applied 20261026200257_init.sql.',
				'Applied 20261029230454_add_priority.sql.',
				'Applied 20261029230505_first_tasks_urgent.sql.',
				'Applied 20261029230507_open_tasks_index.sql.',
				'',
			].join('\n'),
		})
		//#endregion
		//#region production
		// In production, only a deploy changes the tables.
		expect(await ultimabase('sync')).toMatchObject({
			code: 1,
			output:
				'sync changes only a development database: run `npx ultimabase migrate deploy` in production.\n',
		})
		expect(await ultimabase('reset')).toMatchObject({
			code: 1,
			output:
				'reset rebuilds only a development database: it is refused in production.\n',
		})
		//#endregion
	},
	processes,
)
