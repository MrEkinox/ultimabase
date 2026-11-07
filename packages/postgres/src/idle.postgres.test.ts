// A quiet server keeps its connections, and a script does not wait for them (D-298).
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { Socket } from 'node:net'
import { testApplication } from '@ultimabase/testing'
import { Client } from 'pg'
import { defineApp, defineModel, master } from 'ultimabase'
import { expect, it, vi } from 'vitest'
import { postgres } from './index.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const [server = ''] = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

const M = { as: master }
const named = `idle_${randomUUID().replaceAll('-', '')}`

// Before the application connects, so that its first connection is seen.
const watched = vi.spyOn(Socket.prototype, 'setKeepAlive')

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ text: f.string() }),
})

testApplication(
	defineApp({
		database: postgres({ url: `${server}?application_name=${named}` }),
		models: [Note],
	}),
	{ database: 'declared' },
)

/** Runs `statements` on a connection of their own, and the rows of the last. */
async function asked(...statements: readonly string[]): Promise<unknown[]> {
	const client = new Client({ connectionString: server })
	await client.connect()
	try {
		let rows: unknown[] = []
		for (const statement of statements) {
			;({ rows } = await client.query(statement))
		}
		return rows
	} finally {
		await client.end()
	}
}

const backends = async (): Promise<unknown[]> =>
	asked(
		`select pid from pg_stat_activity where application_name = '${named}' order by pid`,
	)

it(
	'keeps a connection through a pause longer than the driver allows',
	{ timeout: 20_000 },
	async () => {
		await Note.findMany({}, M)
		const before = await backends()
		expect(before).not.toEqual([])

		await new Promise((resolve) => setTimeout(resolve, 11_000))

		expect(await backends()).toEqual(before)
	},
)

it('asks the system to watch a quiet connection', async () => {
	await Note.findMany({}, M)
	expect(watched).toHaveBeenCalledWith(true, 1000)
})

const script = `
import { defineApp, defineModel, master } from 'ultimabase'
import { postgres } from ${JSON.stringify(new URL('./index.ts', import.meta.url).href)}

const logger = {
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
	child: () => logger,
}
const Note = defineModel({ name: 'Note', fields: (f) => ({ text: f.string() }) })
const app = defineApp({ database: postgres({ url: process.env.URL }), models: [Note], logger })
await app.start()
await Note.findMany({}, { as: master })
console.log('read')
`

/** How long a script that never stops its application lives past its last read. */
async function lingering(url: string): Promise<number> {
	return new Promise((done, fail) => {
		const child = spawn(
			process.execPath,
			['--input-type=module', '-e', script],
			{
				env: { ...process.env, NODE_ENV: 'development', URL: url },
			},
		)
		const limit = setTimeout(() => {
			child.kill('SIGKILL')
		}, 30_000)
		let read = 0
		let output = ''
		const heard = (chunk: Buffer) => {
			output += chunk.toString()
			if (read === 0 && output.includes('read')) read = performance.now()
		}
		child.stdout.on('data', heard)
		child.stderr.on('data', heard)
		child.on('error', fail)
		child.on('exit', () => {
			clearTimeout(limit)
			if (read === 0) fail(new Error(`The script never read: ${output}`))
			else done(performance.now() - read)
		})
	})
}

it(
	'lets a script that forgets to stop end at once',
	{ timeout: 40_000 },
	async () => {
		const schema = `idle_${randomUUID().replaceAll('-', '')}`
		await asked(`create schema "${schema}"`)
		try {
			const options = encodeURIComponent(`-c search_path=${schema}`)
			expect(await lingering(`${server}?options=${options}`)).toBeLessThan(5000)
		} finally {
			await asked(`drop schema "${schema}" cascade`)
		}
	},
)
