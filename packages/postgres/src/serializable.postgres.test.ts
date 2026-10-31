// A serializable transaction (D-179) on PostgreSQL: two users liking each
// other at once each read the other's like, and a conflict runs one again.
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

/** Indexed on what `like` reads by: a table scan would conflict every call. */
const Like = defineModel({
	name: 'Like',
	fields: (f) => ({
		user: f.string(),
		target: f.string(),
		matchedAt: f.dateTime({ optional: true }),
	}),
	indexes: [{ fields: ['user', 'target'] }],
})

/** Saves the like, and matches both when the other's is there. */
async function like(user: string, target: string): Promise<void> {
	await transaction(
		async () => {
			const mine = await Like.create({ data: { user, target } }, M)
			const theirs = await Like.findFirst(
				{ where: { user: target, target: user } },
				M,
			)
			if (theirs === null) return
			await Like.updateMany(
				{
					where: { id: { in: [mine.id, theirs.id] } },
					data: { matchedAt: new Date() },
				},
				M,
			)
		},
		{ isolation: 'serializable' },
	)
}

/** The isolation level `database` runs a transaction at. */
async function isolation(
	database: ReturnType<typeof createAdapter>,
	options?: { isolation: 'serializable' },
): Promise<unknown> {
	return transaction(
		async () => database.sql<{ level: string }>`
			select current_setting('transaction_isolation') as level`,
		options,
	)
}

for (const url of urls) {
	describe(`a serializable transaction on ${url}`, () => {
		let schema = ''
		let database: ReturnType<typeof createAdapter>
		let app: ReturnType<typeof defineApp>
		beforeEach(async () => {
			schema = `t_${randomUUID().replaceAll('-', '')}`
			await run(url, `create schema "${schema}"`)
			database = createAdapter({ url: inSchema(url, schema) })
			app = defineApp({ database, models: [Like], logger: quiet })
			await app.start()
		})
		afterEach(async () => {
			await app.stop()
			await run(url, `drop schema "${schema}" cascade`)
		})

		it('runs serializable, read committed without the option', async () => {
			expect(await isolation(database, { isolation: 'serializable' })).toEqual([
				{ level: 'serializable' },
			])
			expect(await isolation(database)).toEqual([{ level: 'read committed' }])
		})

		it('matches 20 pairs liking each other at once', async () => {
			const pairs = Array.from({ length: 20 }, (_, at) => [`a${at}`, `b${at}`])
			await Promise.all(
				pairs.flatMap(([a = '', b = '']) => [like(a, b), like(b, a)]),
			)
			const matched = await Like.count(
				{ where: { matchedAt: { not: null } } },
				M,
			)
			expect(matched).toBe(40)
		})
	})
}
