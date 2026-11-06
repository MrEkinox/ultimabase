// Run as a developer and a host run it, in a schema of its own on
// TEST_DATABASE_URL: the `ultimabase` commands (D-105), then a production
// start.
import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Client } from 'pg'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { requestFiles } from '../../../scripts/requests.ts'

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

/**
 * Runs each `$` line of requests/<name>.console, the block a page shows, and
 * compares what it prints; `codes` holds the exit code of each.
 */
async function play(
	name: string,
	codes: readonly number[],
	env: { readonly [name: string]: string } = {},
): Promise<void> {
	const file = join(import.meta.dirname, 'requests', `${name}.console`)
	const steps = (await readFile(file, 'utf8')).split(/^\$ /mu).slice(1)
	expect(steps).toHaveLength(codes.length)
	for (const [index, step] of steps.entries()) {
		const [line = '', ...printed] = step.split('\n')
		const words = line.split(' ')
		const start = words.indexOf('npx')
		const set = words.slice(0, start).map((word): [string, string] => {
			const [variable = '', value = ''] = word.split('=')
			return [variable, value]
		})
		expect(words[start + 1]).toBe('ultimabase')
		expect(
			await ultimabase(words.slice(start + 2).join(' '), {
				env: { ...env, ...Object.fromEntries(set) },
			}),
		).toMatchObject({ code: codes[index], output: printed.join('\n') })
	}
}

const development = { NODE_ENV: 'development' }
// Up to five processes start in turn: alone about 2 s each, more while the
// whole suite measures coverage beside them.
const processes = 60_000

it(
	'refuses a production start before the migrations are deployed',
	async () => {
		await play('start-no-schema', [1])
		await play('start-unreachable', [1, 1])
		await play('start-weak-key', [1])
	},
	processes,
)

it(
	'deploys the migrations, then serves the application on them',
	async () => {
		// Exits 1 while a deploy has something to do.
		await play('migrate-status', [1])
		await play('migrate-deploy', [0, 0])
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

		const started = await ultimabase('start', {
			// `openssl rand -base64 32` gives such a key.
			env: { MASTER_KEY: randomBytes(32).toString('base64') },
			use: async (url) => {
				const { check } = requestFiles(new URL('requests/', import.meta.url), {
					url,
				})
				await check('create-project', {}, { status: 200 })
			},
		})
		// SIGTERM finishes the requests under way, then stops it: it ends
		// with 143, 128 plus SIGTERM's number.
		expect(started.code).toBe(143)
		expect(started.output).toContain('Application stopped.')
	},
	processes,
)

it(
	'syncs a development database, then rebuilds it from the migrations',
	async () => {
		// Logged, so one JSON line here and a readable one in a terminal.
		const synced = await ultimabase('sync', { env: development })
		expect(synced.code).toBe(0)
		expect(synced.output).toContain("Created the database's tables.")
		await play('sync', [0], development)
		// A deploy runs only on a database the migrations built.
		await play('deploy-after-sync', [1], development)
		await play('reset', [0], development)
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
	},
	processes,
)
