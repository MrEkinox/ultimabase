// Run as a host runs it, in a schema of its own on TEST_DATABASE_URL:
// `migrate deploy`, then `node src/server.ts` in production (D-105).
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'
import { Client } from 'pg'
import { afterEach, beforeEach, expect, it } from 'vitest'

const [server = ''] = (
	process.env['TEST_DATABASE_URL'] ??
	'postgres://postgres:postgres@localhost:54315/postgres'
)
	.split(' ')
	.filter((url) => url !== '')

async function run(statement: string): Promise<void> {
	const client = new Client({ connectionString: server })
	await client.connect()
	try {
		await client.query(statement)
	} finally {
		await client.end()
	}
}

let schema = ''
beforeEach(async () => {
	schema = `t_${randomUUID().replaceAll('-', '')}`
	await run(`create schema "${schema}"`)
})
afterEach(async () => {
	await run(`drop schema "${schema}" cascade`)
})

type Ran = {
	readonly code: number | null
	readonly signal: NodeJS.Signals | null
	readonly output: string
}

/**
 * Runs `command` in the example in production on the test schema; once it
 * prints `Listening on`, hands its address to `use`, then stops it.
 */
async function ran(
	command: readonly string[],
	use?: (url: string) => Promise<void>,
): Promise<Ran> {
	const options = encodeURIComponent(`-c search_path=${schema}`)
	const [file = '', ...args] = command
	const child = spawn(file, args, {
		cwd: dirname(import.meta.dirname),
		env: {
			...process.env,
			DATABASE_URL: `${server}?options=${options}`,
			NODE_ENV: 'production',
			NO_COLOR: '1',
			PORT: '0',
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

const deploy = ['yarn', 'ultimabase', 'migrate', 'deploy']
const start = [process.execPath, 'src/server.ts']

it('refuses a production start before the migrations are deployed', async () => {
	const { code, output } = await ran(start)
	expect(code).toBe(1)
	expect(output).toContain('migrate deploy')
})

it('deploys the migrations, then serves the application on them', async () => {
	const deployed = await ran(deploy)
	expect(deployed.output).toContain('_init.sql')
	expect(deployed.code).toBe(0)
	let body: unknown
	const started = await ran(start, async (url) => {
		const response = await fetch(`${url}/graphql`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				query: `mutation { createProject(data: { name: "Launch",
					tasks: { create: [{ title: "Write the README" }] } }) {
					name tasks { edges { node { title done } } } } }`,
			}),
		})
		body = await response.json()
	})
	expect(body).toEqual({
		data: {
			createProject: {
				name: 'Launch',
				tasks: {
					edges: [{ node: { title: 'Write the README', done: false } }],
				},
			},
		},
	})
	// It stops on the signal, then ends on it.
	expect(started).toMatchObject({ code: null, signal: 'SIGTERM' })
	expect(started.output).toContain('Application stopped.')
})
