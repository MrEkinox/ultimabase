// Runs the `ultimabase` commands as a developer and a host run them, in a
// schema of its own on TEST_DATABASE_URL (D-105).
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Client } from 'pg'
import { afterEach, beforeEach, expect } from 'vitest'

export const [server = ''] = (
	process.env['TEST_DATABASE_URL'] ??
	'postgres://postgres:postgres@localhost:54315/postgres'
)
	.split(' ')
	.filter((url) => url !== '')

export async function query(statement: string): Promise<unknown[]> {
	const client = new Client({ connectionString: server })
	await client.connect()
	try {
		return (await client.query<Record<string, unknown>>(statement)).rows
	} finally {
		await client.end()
	}
}

export let schema = ''

/** Gives each test of the file that calls it a schema of its own. */
export function eachInSchema(): void {
	beforeEach(async () => {
		schema = `t_${randomUUID().replaceAll('-', '')}`
		await query(`create schema "${schema}"`)
	})
	afterEach(async () => {
		await query(`drop schema "${schema}" cascade`)
	})
}

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
export async function ultimabase(
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
		cwd: join(import.meta.dirname, '../..'),
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
export async function play(
	name: string,
	codes: readonly number[],
	env: { readonly [name: string]: string } = {},
): Promise<void> {
	const file = join(import.meta.dirname, '../requests', `${name}.console`)
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

export const development = { NODE_ENV: 'development' }
// Up to five processes start in turn: alone about 2 s each, more while the
// whole suite measures coverage beside them.
export const processes = 60_000
