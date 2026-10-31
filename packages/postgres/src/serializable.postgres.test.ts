// A serializable transaction (D-179) on PostgreSQL: two users liking each
// other at once each read the other's like, and a conflict runs one again,
// after a random wait that spreads the calls apart (D-183).
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

const User = defineModel({
	name: 'User',
	fields: (f) => ({
		name: f.string(),
		hearts: f.many(() => Heart, { inverse: 'from' }),
		hearted: f.many(() => Heart, { inverse: 'to' }),
		matches: f.many(() => Match, { inverse: 'user' }),
		matched: f.many(() => Match, { inverse: 'other' }),
	}),
})

/** On a fresh table, every call reads and writes the same index page. */
const Heart = defineModel({
	name: 'Heart',
	fields: (f) => ({
		from: f.one(() => User),
		to: f.one(() => User),
		matchedAt: f.dateTime({ optional: true }),
	}),
	indexes: [{ fields: ['from', 'to'], unique: true }],
})

const Match = defineModel({
	name: 'Match',
	fields: (f) => ({ user: f.one(() => User), other: f.one(() => User) }),
})

/** The heart `a` sent to `b`. */
const pair = (a: string, b: string) => ({
	from: { is: { id: a } },
	to: { is: { id: b } },
})

/** Hearts `to`, and matches both, a row each, when `to` hearted back. */
async function heart(from: string, to: string): Promise<void> {
	await transaction(
		async () => {
			// Read first, as an upsert does: a heart sent twice is kept once.
			const mine =
				(await Heart.findFirst({ where: pair(from, to) }, M)) ??
				(await Heart.create(
					{
						data: {
							from: { connect: { id: from } },
							to: { connect: { id: to } },
						},
					},
					M,
				))
			const back = await Heart.findFirst({ where: pair(to, from) }, M)
			if (back === null) return
			for (const [user, other] of [
				[from, to],
				[to, from],
			] as const) {
				await Match.create(
					{
						data: {
							user: { connect: { id: user } },
							other: { connect: { id: other } },
						},
					},
					M,
				)
			}
			await Heart.updateMany(
				{
					where: { id: { in: [mine.id, back.id] } },
					data: { matchedAt: new Date() },
				},
				M,
			)
		},
		{ isolation: 'serializable' },
	)
}

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
			app = defineApp({
				database,
				models: [Like, User, Heart, Match],
				logger: quiet,
			})
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

		// 3 attempts with no wait left 5 to 8 of these 20 calls in CONFLICT.
		it('matches 10 pairs at once on fresh tables, relations checked', async () => {
			const users = await User.createManyAndReturn(
				{ data: Array.from({ length: 20 }, (_, at) => ({ name: `u${at}` })) },
				M,
			)
			const ids = users.map(({ id }) => id)
			await Promise.all(
				Array.from({ length: 10 }, (_, at) => {
					const [a = '', b = ''] = ids.slice(2 * at, 2 * at + 2)
					return [heart(a, b), heart(b, a)]
				}).flat(),
			)
			expect(await Match.count({}, M)).toBe(20)
			const matched = await Heart.count(
				{ where: { matchedAt: { not: null } } },
				M,
			)
			expect(matched).toBe(20)
		})
	})
}
