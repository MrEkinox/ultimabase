// A `many`'s size (D-242) holds under concurrent writes: each write locks
// the parents it touches before it writes, so two writes to one parent run
// one after the other and the second counts the first's rows.
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import type { Logger } from 'ultimabase'
import { defineApp, defineModel, master, PublicError } from 'ultimabase'
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

const Album = defineModel({
	name: 'Album',
	fields: (f) => ({
		title: f.string(),
		photos: f.many(() => Photo, { inverse: 'album', size: { min: 1, max: 2 } }),
	}),
})

const Photo = defineModel({
	name: 'Photo',
	fields: (f) => ({ album: f.one(() => Album, { onDelete: 'cascade' }) }),
})

async function waitingOnLock(
	watcher: Client,
	table: string,
	count: number,
): Promise<void> {
	for (let tries = 0; tries < 300; tries += 1) {
		const { rows } = await watcher.query<{ n: number }>(
			`select count(*)::int as n from pg_stat_activity
			 where wait_event_type = 'Lock' and query ilike $1`,
			[`%"${table}"%`],
		)
		if ((rows[0]?.n ?? 0) >= count) return
		await new Promise((resolve) => setTimeout(resolve, 10))
	}
	throw new Error('The writes never waited on the row lock.')
}

const codes = (outcomes: readonly unknown[]): string[] =>
	outcomes
		.map((outcome) =>
			outcome instanceof PublicError ? outcome.code : 'written',
		)
		.toSorted()

/** An album holding one photo. */
const album = async () =>
	Album.create(
		{
			data: { title: 'a', photos: { create: [{}] } },
			include: { photos: true },
		},
		M,
	)

for (const url of urls) {
	describe(`writes racing on one bounded parent on ${url}`, () => {
		let schema = ''
		let app: ReturnType<typeof defineApp>
		let other: Client
		let watcher: Client
		beforeEach(async () => {
			schema = `t_${randomUUID().replaceAll('-', '')}`
			await run(url, `create schema "${schema}"`)
			const database = createAdapter({ url: inSchema(url, schema) })
			app = defineApp({ database, models: [Album, Photo], logger: quiet })
			await app.start()
			other = new Client({ connectionString: inSchema(url, schema) })
			await other.connect()
			watcher = new Client({ connectionString: url })
			await watcher.connect()
		})
		afterEach(async () => {
			await other.end()
			await watcher.end()
			await app.stop()
			await run(url, `drop schema "${schema}" cascade`)
		})

		/** Runs both writes while `other` holds the album, then lets them go. */
		async function raced(
			writes: readonly (() => Promise<unknown>)[],
		): Promise<unknown[]> {
			await other.query('begin')
			await other.query(`select "id" from "album" for update`)
			const pending = writes.map(async (write) =>
				write().catch((error: unknown) => error),
			)
			await waitingOnLock(watcher, 'album', writes.length)
			await other.query('commit')
			return Promise.all(pending)
		}

		it('lets one of two rows into the last place', async () => {
			const { id } = await album()
			const added = async () =>
				Photo.create({ data: { album: { connect: { id } } } }, M)
			expect(codes(await raced([added, added]))).toEqual([
				'RELATION_SIZE',
				'written',
			])
			const { rows } = await other.query(
				`select count(*)::int as n from "photo"`,
			)
			expect(rows).toEqual([{ n: 2 }])
		})

		it('keeps the last row when two deletes race', async () => {
			const { id } = await album()
			await Photo.create({ data: { album: { connect: { id } } } }, M)
			const photos = await Photo.findMany({}, M)
			const deletes = photos.map(
				(photo) => async () => Photo.delete({ where: { id: photo.id } }, M),
			)
			expect(codes(await raced(deletes))).toEqual(['RELATION_SIZE', 'written'])
			const { rows } = await other.query(
				`select count(*)::int as n from "photo"`,
			)
			expect(rows).toEqual([{ n: 1 }])
		})
	})
}
