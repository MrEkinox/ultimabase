// The reset (D-188) racing a transaction that writes one table, then
// another: the truncate once locked the first and waited on the second,
// and PostgreSQL answered `deadlock detected`.
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import type { Logger } from 'ultimabase'
import { defineApp, defineModel, master, transaction } from 'ultimabase'
import { emptyRunning } from 'ultimabase/internal'
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

const Alpha = defineModel({
	name: 'Alpha',
	fields: (f) => ({ label: f.string() }),
})
const Beta = defineModel({
	name: 'Beta',
	fields: (f) => ({ label: f.string() }),
})

for (const url of urls) {
	describe(`a reset that races a write on ${url}`, () => {
		let schema = ''
		let app: ReturnType<typeof defineApp>
		beforeEach(async () => {
			schema = `t_${randomUUID().replaceAll('-', '')}`
			await run(url, `create schema "${schema}"`)
			const database = createAdapter({ url: inSchema(url, schema) })
			app = defineApp({ database, models: [Alpha, Beta], logger: quiet })
			await app.start()
		})
		afterEach(async () => {
			await app.stop()
			await run(url, `drop schema "${schema}" cascade`)
		})

		it('waits for the write, then empties both tables', async () => {
			const { promise: saved, resolve: save } = Promise.withResolvers<void>()
			const { promise: wrote, resolve: write } = Promise.withResolvers<void>()
			const writing = transaction(async () => {
				await Beta.create({ data: { label: 'b' } }, M)
				write()
				await saved
				await Alpha.create({ data: { label: 'a' } }, M)
			})
			await wrote
			const emptied = emptyRunning()
			// Long enough for a truncate to lock `alpha` and wait on `beta`.
			await new Promise((done) => setTimeout(done, 200))
			save()
			await expect(Promise.all([writing, emptied])).resolves.toBeDefined()
			expect([await Alpha.count({}, M), await Beta.count({}, M)]).toEqual([
				0, 0,
			])
		})
	})
}
