// A transaction ends once its queries settle (D-208): a failed query rolls
// it back only after its siblings, so no ROLLBACK waits behind a query on
// the connection, which `pg` warns of and pg@9 refuses.
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import type { Logger } from 'ultimabase'
import { defineApp, defineModel, master, transaction } from 'ultimabase'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAdapter } from './adapter.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const urls = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

async function run(url: string, statement: string): Promise<void> {
	const client = new Client({ connectionString: url })
	await client.connect()
	try {
		await client.query(statement)
	} finally {
		await client.end()
	}
}

function inSchema(url: string, schema: string): string {
	const separator = url.includes('?') ? '&' : '?'
	const options = `-c search_path=${schema}`
	return `${url}${separator}options=${encodeURIComponent(options)}`
}

const quiet: Logger = {
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
	child: () => quiet,
}
const M = { as: master }

const User = defineModel({
	name: 'User',
	fields: (f) => ({ username: f.string({ unique: true }) }),
})

/** The statements sent while another waited on the same connection. */
const queued: string[] = []
const query: unknown = Reflect.get(Client.prototype, 'query')

/** Records each statement `pg` queues behind another, as it warns. */
function watch(): void {
	if (typeof query !== 'function') throw new Error('pg has no Client.query.')
	Reflect.set(
		Client.prototype,
		'query',
		function (this: Client, ...args: unknown[]): unknown {
			const waiting: unknown = Reflect.get(this, '_queryQueue')
			if (Array.isArray(waiting) && waiting.length > 0) {
				const [statement] = args
				queued.push(typeof statement === 'string' ? statement : 'a query')
			}
			const result: unknown = Reflect.apply(query, this, args)
			return result
		},
	)
}

for (const url of urls) {
	describe(`a transaction on ${url}`, () => {
		let schema = ''
		let app: ReturnType<typeof defineApp>
		beforeEach(async () => {
			schema = `t_${randomUUID().replaceAll('-', '')}`
			await run(url, `create schema "${schema}"`)
			app = defineApp({
				database: createAdapter({ url: inSchema(url, schema) }),
				models: [User],
				logger: quiet,
			})
			await app.start()
			queued.length = 0
			watch()
		})
		afterEach(async () => {
			Reflect.set(Client.prototype, 'query', query)
			await app.stop()
			await run(url, `drop schema "${schema}" cascade`)
		})

		it('rolls back once the reads beside a failed write settle', async () => {
			await User.create({ data: { username: 'ada' } }, M)
			for (let attempt = 0; attempt < 5; attempt += 1) {
				await expect(
					transaction(async () =>
						Promise.all([
							// A unique violation, while the reads below are pending.
							User.create({ data: { username: 'ada' } }, M),
							...[1, 2, 3].map(async () => {
								for (let read = 0; read < 20; read += 1) {
									await User.findMany({}, M)
								}
							}),
						]),
					),
				).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' })
			}
			expect(queued).toEqual([])
			expect(await User.count({}, M)).toBe(1)
		})
	})
}
