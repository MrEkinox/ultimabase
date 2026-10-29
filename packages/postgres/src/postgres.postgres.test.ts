// The contract on PostgreSQL (D-98): each test in its own schema, on every
// server `TEST_DATABASE_URL` lists.
import { randomUUID } from 'node:crypto'
import type { Socket } from 'node:net'
import { createServer } from 'node:net'
import { asUser, testAdapter } from '@ultimabase/testing'
import { Client } from 'pg'
import type {
	Adapter,
	Logger,
	Schema,
	SchemaField,
	SchemaModel,
} from 'ultimabase'
import {
	CheckFailed,
	defineApp,
	defineModel,
	master,
	Refused,
	RelationViolation,
	transaction,
	UniqueViolation,
} from 'ultimabase'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAdapter, requireVersion } from './adapter.ts'
import { postgres } from './index.ts'
import { Catalog, constraint } from './names.ts'
import { snapshotOf } from './snapshot.ts'
import { translate } from './write.ts'

/** The adapter's warnings: none on a database that folds every letter. */
const warnings: unknown[] = []
const logger: Logger = {
	info: () => undefined,
	warn: (message: unknown) => {
		warnings.push(message)
	},
	error: () => undefined,
	child: () => logger,
}

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

/**
 * `url` on `schema`, in a session whose time zone gives old dates an offset
 * in seconds, which a date read in it loses.
 */
function inSchema(url: string, schema: string): string {
	const separator = url.includes('?') ? '&' : '?'
	const options = `-c search_path=${schema} -c TimeZone=Europe/Paris`
	return `${url}${separator}options=${encodeURIComponent(options)}`
}

for (const url of urls) {
	let trips = 0
	const create = (): Adapter => {
		const schema = `t_${randomUUID().replaceAll('-', '')}`
		const adapter = createAdapter({
			url: inSchema(url, schema),
			log: () => {
				trips += 1
			},
		})
		return {
			...adapter,
			start: async (given, _logger, feed) => {
				await run(url, `create schema "${schema}"`)
				await adapter.start(given, logger, feed)
			},
			stop: async () => {
				await adapter.stop()
				await run(url, `drop schema "${schema}" cascade`)
			},
		}
	}
	testAdapter(`postgres at ${new URL(url).host}`, create, {
		roundTrips: () => trips,
	})
}

const thing: Schema = {
	models: [
		{
			name: 'Thing',
			fields: [
				{
					kind: 'scalar',
					name: 'label',
					type: 'string',
					list: false,
					optional: false,
					unique: true,
					// The `_key` constraint's name runs past 63 bytes.
					dbName: `label_${'x'.repeat(60)}`,
				},
			],
			indexes: [],
		},
	],
}

/** Starts `adapter` and builds its tables, as a development start does. */
async function started(adapter: Adapter, schema: Schema): Promise<void> {
	await adapter.start(schema, logger)
	const { migrations } = adapter
	if (migrations === undefined) throw new Error('postgres() migrates.')
	const to = migrations.snapshot(schema)
	const statements = migrations.plan(undefined, schema)
	await migrations.apply({ kind: 'sync', from: undefined, statements, to })
}

const row = (label: unknown) => ({
	id: randomUUID(),
	createdAt: new Date(),
	updatedAt: new Date(),
	label,
})

const startAt = async (url: string) =>
	postgres({ url }).start({ models: [] }, logger)

describe('postgres()', () => {
	const url = urls[0] ?? ''
	let schema = ''
	beforeEach(async () => {
		schema = `t_${randomUUID().replaceAll('-', '')}`
		await run(url, `create schema "${schema}"`)
	})
	afterEach(async () => run(url, `drop schema "${schema}" cascade`))

	it('refuses to run before it starts', async () => {
		await expect(
			postgres({ url: inSchema(url, schema) }).find({ model: 'Thing' }),
		).rejects.toThrow('postgres() is not started.')
	})

	it('takes an unset url, and refuses to start with it (D-119)', async () => {
		for (const given of [process.env['ULTIMABASE_UNSET_URL'], '']) {
			const adapter = postgres({ url: given })
			expect(adapter.migrations?.remote).toBeUndefined()
			const starting = adapter.start({ models: [] }, logger)
			await expect(starting).rejects.toThrow(Refused)
			await expect(starting).rejects.toThrow(
				'postgres() was given no url: is the variable it reads set?',
			)
		}
	})

	it('names a server it cannot reach without its password, and passes a refusal through (D-105)', async () => {
		// The whole message, so no password in it.
		await expect(
			startAt('postgres://postgres:secret@localhost:1/postgres'),
		).rejects.toMatchObject({
			code: 'ECONNREFUSED',
			message:
				'Cannot reach PostgreSQL at localhost:1 (ECONNREFUSED): is it running, and is its url right?',
		})
		await expect(
			startAt('postgres://postgres:secret@nosuchhost.invalid/x'),
		).rejects.toThrow(
			/^Cannot reach PostgreSQL at nosuchhost\.invalid:5432 \((ENOTFOUND|EAI_AGAIN)\): is it running, and is its url right\?$/,
		)
		const wrong = new URL(url)
		wrong.password = 'wrong'
		await expect(startAt(wrong.href)).rejects.toMatchObject({ code: '28P01' })
	})

	it('names a long constraint by its hash, and reports what it refuses', async () => {
		const adapter = postgres({ url: inSchema(url, schema) })
		await started(adapter, thing)
		try {
			const insert = (label: unknown) =>
				adapter.write({
					changes: [{ kind: 'insert', model: 'Thing', row: row(label) }],
				})
			await insert('a')
			await expect(insert('a')).rejects.toBeInstanceOf(UniqueViolation)
			// A refusal that is not a unique key's arrives as PostgreSQL's.
			await expect(insert(null)).rejects.toMatchObject({ code: '23502' })
		} finally {
			await adapter.stop()
		}
	})

	it('names a server that never answers once its wait is over (D-47)', async () => {
		const sockets: Socket[] = []
		const server = createServer((socket) => sockets.push(socket))
		await new Promise<void>((resolve) => server.listen(0, resolve))
		const address = server.address()
		const port = typeof address === 'object' && address ? address.port : 0
		try {
			const adapter = createAdapter({
				url: `postgres://postgres:secret@localhost:${port}/x`,
				wait: 200,
			})
			const starting = adapter.start({ models: [] }, logger)
			await expect(starting).rejects.toThrow(
				`Cannot reach PostgreSQL at localhost:${port} (no answer in 0.2s): is it running, and is its url right?`,
			)
			await expect(starting).rejects.not.toHaveProperty('code')
		} finally {
			for (const socket of sockets) socket.destroy()
			server.close()
		}
	})

	it('fails a query no connection frees for in time, and serves the next (D-47)', async () => {
		const adapter = createAdapter({
			url: inSchema(url, schema),
			connections: 2,
			wait: 200,
		})
		await started(adapter, thing)
		try {
			const open = [await adapter.begin(), await adapter.begin()]
			await expect(adapter.find({ model: 'Thing' })).rejects.toThrow(
				'Every one of the 2 PostgreSQL connections stayed busy for 0.2s: a transaction may wait on something slow or never end.',
			)
			for (const each of open) await each.rollback()
			expect(await adapter.find({ model: 'Thing' })).toEqual([])
		} finally {
			await adapter.stop()
		}
	})

	it('warns once when the database folds ASCII only (D-140)', async () => {
		warnings.length = 0
		const adapter = postgres({ url: inSchema(url, schema) })
		await adapter.start({ models: [] }, logger)
		await adapter.stop()
		expect(warnings).toEqual([])
		const name = `c_${randomUUID().replaceAll('-', '')}`
		await run(
			url,
			`create database "${name}" template template0 lc_collate 'C' lc_ctype 'C'`,
		)
		try {
			const ascii = postgres({ url: url.replace(/\/postgres$/, `/${name}`) })
			await ascii.start({ models: [] }, logger)
			await ascii.stop()
		} finally {
			await run(url, `drop database "${name}"`)
		}
		expect(warnings).toEqual([
			'PostgreSQL folds case under its C locale for ASCII only: a case-insensitive filter matches É and é in memory() but not here. Create the database with a UTF-8 locale, such as en_US.UTF-8.',
		])
	})

	it('takes connections as a whole number, 1 or more (D-47)', async () => {
		for (const connections of [0, 1.5, Number.NaN]) {
			await expect(
				postgres({ url, connections }).start({ models: [] }, logger),
			).rejects.toThrow(
				new Refused(
					`postgres() takes connections as a whole number, 1 or more, not ${connections}.`,
				),
			)
		}
	})

	it('reads a nested relation without compiling it (D-47)', async () => {
		const Folder = defineModel({
			name: 'Folder',
			fields: (f) => ({
				parent: f.one(() => Folder, { optional: true, inverse: 'children' }),
				children: f.many(() => Folder),
			}),
		})
		// With JIT on, these settings would compile every statement.
		const jit = encodeURIComponent(
			'-c jit_above_cost=0 -c jit_inline_above_cost=0 -c jit_optimize_above_cost=0',
		)
		const durations: number[] = []
		const database = createAdapter({
			url: `${inSchema(url, schema)}${encodeURIComponent(' ')}${jit}`,
			log: (event) => durations.push(event.queryDurationMillis),
		})
		const app = defineApp({ database, models: [Folder] })
		await app.start()
		try {
			let parent = await Folder.create({ data: {} }, { as: master })
			for (let level = 1; level < 6; level += 1) {
				parent = await Folder.create(
					{ data: { parent: { connect: { id: parent.id } } } },
					{ as: master },
				)
			}
			durations.length = 0
			const read = await Folder.findUnique(
				{
					where: { id: parent.id },
					include: {
						parent: {
							include: {
								parent: {
									include: {
										parent: {
											include: { parent: { include: { parent: true } } },
										},
									},
								},
							},
						},
					},
				},
				{ as: master },
			)
			expect(read).not.toBeNull()
			// About 2 ms; compiled, over 150.
			expect(Math.max(...durations)).toBeLessThan(50)
		} finally {
			await app.stop()
		}
	})

	it('outlives a server that ends its idle connection', async () => {
		const name = `application_name=${schema}`
		const adapter = postgres({ url: `${inSchema(url, schema)}&${name}` })
		await started(adapter, thing)
		try {
			await run(
				url,
				`select pg_terminate_backend(pid) from pg_stat_activity where application_name = '${schema}'`,
			)
			await new Promise((resolve) => setTimeout(resolve, 100))
			expect(await adapter.find({ model: 'Thing' })).toEqual([])
		} finally {
			await adapter.stop()
		}
	})
})

const shelved: Schema = {
	models: [
		{
			name: 'Book',
			fields: [
				{
					kind: 'many',
					name: 'tags',
					target: 'Tag',
					inverse: 'books',
					join: true,
				},
			],
			indexes: [],
		},
		{
			name: 'Tag',
			fields: [
				{
					kind: 'many',
					name: 'books',
					target: 'Book',
					inverse: 'tags',
					join: true,
				},
			],
			indexes: [],
		},
	],
}

const stamp = () => ({
	id: randomUUID(),
	createdAt: new Date(),
	updatedAt: new Date(),
})
const book = stamp()
const [first, second] = [stamp(), stamp()]
const byId = (id: string) => ({ id: { equals: id } })
const tags = (id: string) => ({
	model: 'Book',
	where: { id: { equals: id } },
	include: { tags: {} },
})

describe('a write on postgres()', () => {
	const url = urls[0] ?? ''
	let schema = ''
	let adapter: Adapter
	let sent: string[] = []
	beforeEach(async () => {
		schema = `t_${randomUUID().replaceAll('-', '')}`
		await run(url, `create schema "${schema}"`)
		adapter = createAdapter({
			url: inSchema(url, schema),
			log: (event) => sent.push(event.query.sql),
		})
		await started(adapter, shelved)
		await adapter.write({
			changes: [
				{ kind: 'insert', model: 'Book', row: book },
				{ kind: 'insert', model: 'Tag', row: first },
				{ kind: 'insert', model: 'Tag', row: second },
				{
					kind: 'link',
					model: 'Book',
					field: 'tags',
					id: book.id,
					targets: [first.id],
				},
			],
		})
		sent = []
	})
	afterEach(async () => {
		await adapter.stop()
		await run(url, `drop schema "${schema}" cascade`)
	})

	it('sends nothing for a write of nothing', async () => {
		const none = {
			kind: 'unlink',
			model: 'Book',
			field: 'tags',
			id: book.id,
		} as const
		expect(await adapter.write({ changes: [] })).toEqual([])
		await adapter.write({ changes: [{ ...none, targets: ['nope'] }] })
		await adapter.write({ changes: [{ ...none, kind: 'link', targets: [] }] })
		expect(sent).toEqual([])
	})

	it("moves a join table's distinct pairs in one statement", async () => {
		const [found] = await adapter.write({
			changes: [
				{
					kind: 'unlink',
					model: 'Book',
					field: 'tags',
					id: book.id,
					targets: [first.id],
				},
				// The other side names its pairs the other way round.
				{
					kind: 'link',
					model: 'Tag',
					field: 'books',
					id: second.id,
					targets: [book.id],
				},
			],
			read: tags(book.id),
		})
		expect(found?.['tags']).toMatchObject([{ id: second.id }])
		expect(sent.map((statement) => statement.split(' ')[0])).toEqual(['with'])
	})

	it('splits a write that changes a pair twice, in one transaction', async () => {
		const [found] = await adapter.write({
			changes: [
				{
					kind: 'unlink',
					model: 'Book',
					field: 'tags',
					id: book.id,
					targets: [first.id],
				},
				{
					kind: 'link',
					model: 'Tag',
					field: 'books',
					id: first.id,
					targets: [book.id],
				},
			],
			read: tags(book.id),
		})
		expect(found?.['tags']).toMatchObject([{ id: first.id }])
		expect(sent.map((statement) => statement.split(' ')[0])).toEqual([
			'begin',
			'with',
			'with',
			'commit',
		])
	})

	it('inserts rows by the 65,535 parameters a statement binds, behind its checks', async () => {
		const rows = Array.from({ length: 22_000 }, stamp)
		await adapter.write({
			checks: [{ model: 'Book', where: byId(book.id), count: 1 }],
			changes: rows.map((each) => ({
				kind: 'insert',
				model: 'Tag',
				row: each,
			})),
		})
		expect(sent.map((statement) => statement.split(' ')[0])).toEqual([
			'begin',
			'with',
			'with',
			'commit',
		])
		expect(await adapter.count({ model: 'Tag' })).toBe(22_002)
	})

	it('reports a link its own COMMIT refuses', async () => {
		const failed = adapter.write({
			changes: [
				{
					kind: 'link',
					model: 'Book',
					field: 'tags',
					id: book.id,
					targets: [randomUUID()],
				},
				{
					kind: 'unlink',
					model: 'Book',
					field: 'tags',
					id: book.id,
					targets: [first.id],
				},
				{
					kind: 'link',
					model: 'Tag',
					field: 'books',
					id: first.id,
					targets: [book.id],
				},
			],
		})
		await expect(failed).rejects.toEqual(
			new RelationViolation('Book', 'tags', 'Tag', false),
		)
		expect(sent.slice(-2)).toEqual(['commit', 'rollback'])
	})

	it('refuses the rows of a change that is no delete before it', async () => {
		const where = { tags: { removedBy: 0 } }
		const failed = adapter.write({
			changes: [{ kind: 'delete', model: 'Book', where }],
		})
		await expect(failed).rejects.toThrow('No such delete.')
	})

	it('writes nothing when a check fails, and names it', async () => {
		const failed = adapter.write({
			checks: [
				{ model: 'Tag', where: { id: { equals: first.id } }, count: 1 },
				{ model: 'Tag', where: { id: { equals: randomUUID() } }, count: 1 },
			],
			changes: [
				{
					kind: 'unlink',
					model: 'Book',
					field: 'tags',
					id: book.id,
					targets: [first.id],
				},
			],
		})
		await expect(failed).rejects.toEqual(new CheckFailed(1))
		const [found] = await adapter.find(tags(book.id))
		expect(found?.['tags']).toMatchObject([{ id: first.id }])
	})

	it('reads the one row a write changes from its RETURNING (D-103)', async () => {
		const at = new Date('2030-01-01T00:00:00.000Z')
		const [updated] = await adapter.write({
			changes: [
				{
					kind: 'update',
					model: 'Book',
					where: byId(book.id),
					set: { updatedAt: at },
				},
			],
			read: tags(book.id),
		})
		expect(updated?.['updatedAt']).toEqual(at)
		expect(updated?.['tags']).toMatchObject([{ id: first.id }])
		const added = stamp()
		const [created] = await adapter.write({
			changes: [{ kind: 'insert', model: 'Tag', row: added }],
			read: { model: 'Tag', where: byId(added.id) },
		})
		expect(created?.['id']).toBe(added.id)
		expect(sent).toHaveLength(2)
		for (const statement of sent) {
			expect(statement).not.toContain('not materialized')
		}
	})

	it('keeps the view of a table the read comes back to', async () => {
		const at = new Date('2030-01-01T00:00:00.000Z')
		const [found] = await adapter.write({
			changes: [
				{
					kind: 'update',
					model: 'Book',
					where: byId(book.id),
					set: { updatedAt: at },
				},
			],
			read: { ...tags(book.id), include: { tags: { include: { books: {} } } } },
		})
		expect(found?.['tags']).toMatchObject([{ books: [{ updatedAt: at }] }])
		expect(sent[0]).toContain('"book" as not materialized')
	})

	it('reads through the views when the read is not the one row written', async () => {
		const added = stamp()
		const insert = (tag: typeof added) =>
			({ kind: 'insert', model: 'Tag', row: tag }) as const
		const reads = [
			{ where: undefined, count: 3 },
			{ where: { NOT: [byId(first.id)] }, count: 3 },
			{ where: { id: { in: [added.id] } }, count: 1 },
			{ where: { id: { equals: first.id, not: second.id } }, count: 1 },
			{ where: byId(first.id), count: 1 },
		]
		for (const [at, { where, count }] of reads.entries()) {
			sent = []
			const rows = await adapter.write({
				changes: [insert(at === 0 ? added : stamp())],
				read: { model: 'Tag', ...(where === undefined ? {} : { where }) },
			})
			expect(rows).toHaveLength(count)
			expect(sent[0]).toContain('"tag" as not materialized')
		}
		// Two rows of the table written: the view holds both.
		sent = []
		const twice = stamp()
		const [found] = await adapter.write({
			changes: [insert(twice), insert(stamp())],
			read: { model: 'Tag', where: byId(twice.id) },
		})
		expect(found?.['id']).toBe(twice.id)
		expect(sent[0]).toContain('"tag" as not materialized')
	})

	it('locks the rows it reads', async () => {
		const tx = await adapter.begin()
		const [found] = await tx.find({ ...tags(book.id), lock: true })
		await tx.commit()
		expect(found?.['id']).toBe(book.id)
		expect(sent[1]).toContain('for update')
	})

	it('gives back its connection when a commit fails', async () => {
		// More failed commits than the pool holds connections.
		for (let attempt = 0; attempt < 11; attempt += 1) {
			const tx = await adapter.begin()
			await tx.write({
				changes: [
					{
						kind: 'link',
						model: 'Book',
						field: 'tags',
						id: book.id,
						targets: [randomUUID()],
					},
				],
			})
			// The foreign key is checked at commit (D-98).
			await expect(tx.commit()).rejects.toEqual(
				new RelationViolation('Book', 'tags', 'Tag', false),
			)
		}
		const found = await adapter.find(tags(book.id))
		expect(found[0]?.['tags']).toHaveLength(1)
	}, 2000)
})

const M = { as: master }

const Locker = defineModel({
	name: 'Locker',
	fields: (f) => ({
		code: f.string({ unique: true }),
		label: f.string(),
		owner: f.string(),
	}),
}).with({
	access: {
		read: () => true,
		update: ({ caller, record }) =>
			caller.kind === 'user' && caller.user.id === record.owner,
		delete: ({ caller, record }) =>
			caller.kind === 'user' && caller.user.id === record.owner,
	},
})

/** Waits until a query on `locker` waits on a row lock. */
async function waitingOnLock(watcher: Client): Promise<void> {
	for (let tries = 0; tries < 200; tries += 1) {
		const { rows } = await watcher.query<{ n: number }>(
			`select count(*)::int as n from pg_stat_activity
			 where wait_event_type = 'Lock' and query ilike '%"locker"%'`,
		)
		if ((rows[0]?.n ?? 0) > 0) return
		await new Promise((resolve) => setTimeout(resolve, 10))
	}
	throw new Error('The write never waited on the row lock.')
}

const stored = async (id: string) => Locker.findUnique({ where: { id } }, M)

for (const url of urls) {
	describe(`a write that races another transaction on ${url}`, () => {
		let schema = ''
		let app: ReturnType<typeof defineApp>
		let other: Client
		let watcher: Client
		beforeEach(async () => {
			schema = `t_${randomUUID().replaceAll('-', '')}`
			await run(url, `create schema "${schema}"`)
			const database = createAdapter({ url: inSchema(url, schema) })
			app = defineApp({ database, models: [Locker], logger })
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

		/** Runs `statement` in another transaction, committed once `write` waits on it. */
		async function raced(
			statement: string,
			values: readonly string[],
			write: () => Promise<unknown>,
		): Promise<unknown> {
			await other.query('begin')
			await other.query(statement, [...values])
			const pending = write().catch((error: unknown) => error)
			await waitingOnLock(watcher)
			await other.query('commit')
			return pending
		}
		const handed = `update "locker" set "owner" = $1 where "id" = $2`
		const removed = `delete from "locker" where "id" = $1`
		const alice = randomUUID()
		const bob = randomUUID()
		const created = async () =>
			Locker.create({ data: { code: 'c', label: 'a', owner: alice } }, M)

		it('refuses a user who lost the row while their update waited (D-104)', async () => {
			const locker = await created()
			const outcome = await raced(handed, [bob, locker.id], async () =>
				Locker.update(
					{ where: { id: locker.id }, data: { label: 'b' } },
					{ as: asUser({ id: alice }) },
				),
			)
			expect(outcome).toMatchObject({ code: 'ACCESS_DENIED' })
			expect(await stored(locker.id)).toMatchObject({ owner: bob, label: 'a' })
		})

		it('refuses a user who lost the row while their delete waited (D-104)', async () => {
			const locker = await created()
			const outcome = await raced(handed, [bob, locker.id], async () =>
				Locker.delete(
					{ where: { id: locker.id } },
					{ as: asUser({ id: alice }) },
				),
			)
			expect(outcome).toMatchObject({ code: 'ACCESS_DENIED' })
			expect(await stored(locker.id)).toMatchObject({ owner: bob })
		})

		it('counts none for a row another transaction deleted (D-104)', async () => {
			const locker = await created()
			const outcome = await raced(removed, [locker.id], async () =>
				Locker.deleteMany({ where: { code: 'c' } }, M),
			)
			expect(outcome).toEqual({ count: 0 })
		})

		it('does not find a row another transaction deleted (D-104)', async () => {
			const locker = await created()
			const deleted = await raced(removed, [locker.id], async () =>
				Locker.delete({ where: { code: 'c' } }, M),
			)
			expect(deleted).toMatchObject({ code: 'NOT_FOUND' })
			const again = await created()
			const updated = await raced(removed, [again.id], async () =>
				Locker.update({ where: { id: again.id }, data: { label: 'b' } }, M),
			)
			expect(updated).toMatchObject({ code: 'NOT_FOUND' })
		})
	})
}

const Genre = defineModel({
	name: 'Genre',
	fields: (f) => ({ songs: f.many(() => Song) }),
})
const Song = defineModel({
	name: 'Song',
	fields: (f) => ({ genre: f.one(() => Genre, { inverse: 'songs' }) }),
})

describe('a transaction whose connection the server ends', () => {
	it('fails its commit, and leaves the process and stop() unharmed', async () => {
		const url = urls[0] ?? ''
		const name = `t_${randomUUID().replaceAll('-', '')}`
		const adapter = createAdapter({ url: `${url}?application_name=${name}` })
		await adapter.start({ models: [] }, logger)
		const escaped: unknown[] = []
		const listen = (error: unknown) => escaped.push(error)
		process.on('uncaughtException', listen)
		try {
			const open = await adapter.begin()
			// As a restart of the server: it waits for the backend to exit,
			// then for its last message to reach the client.
			await run(
				url,
				`select pg_terminate_backend(pid, 5000) from pg_stat_activity where application_name = '${name}'`,
			)
			await new Promise((resolve) => setTimeout(resolve, 100))
			await expect(open.commit()).rejects.toThrow('connection error')
			// Its connection went back to the pool, which no longer waits on it.
			await adapter.stop()
		} finally {
			process.off('uncaughtException', listen)
		}
		expect(escaped).toEqual([])
	})
})

describe('a write that races a delete on postgres()', () => {
	const url = urls[0] ?? ''
	let schema = ''
	let database: Adapter
	let app: ReturnType<typeof defineApp>
	beforeEach(async () => {
		schema = `t_${randomUUID().replaceAll('-', '')}`
		await run(url, `create schema "${schema}"`)
		database = createAdapter({ url: inSchema(url, schema) })
		app = defineApp({ database, models: [Genre, Song], logger })
		await app.start()
	})
	afterEach(async () => {
		await app.stop()
		await run(url, `drop schema "${schema}" cascade`)
	})

	it('reports a connected row deleted before its commit as missing', async () => {
		const genre = await Genre.create({ data: {} }, M)
		const linked = Promise.withResolvers<void>()
		const deleted = Promise.withResolvers<void>()
		const linking = transaction(async () => {
			await Song.create({ data: { genre: { connect: { id: genre.id } } } }, M)
			linked.resolve()
			await deleted.promise
		})
		await linked.promise
		// Outside the transaction: the delete sees no song and commits first.
		await Genre.delete({ where: { id: genre.id } }, M)
		deleted.resolve()
		await expect(linking).rejects.toMatchObject({
			code: 'NOT_FOUND',
			message: 'A connected Genre does not exist.',
		})
		expect(await Song.count({}, M)).toBe(0)
	})

	it('tells a delete its own COMMIT restricts', async () => {
		const genre = await Genre.create({ data: {} }, M)
		const tx = await database.begin()
		// The delete's check is due first at the commit.
		await tx.write({
			changes: [{ kind: 'delete', model: 'Genre', where: byId(genre.id) }],
		})
		await tx.write({
			changes: [
				{ kind: 'insert', model: 'Song', row: { ...stamp(), genre: genre.id } },
			],
		})
		await expect(tx.commit()).rejects.toEqual(
			new RelationViolation('Song', 'genre', 'Genre', true),
		)
	})
})

describe('the catalog', () => {
	const catalog = new Catalog(thing)

	it('keeps a short constraint name and hashes a long one', () => {
		expect(constraint('thing_pkey')).toBe('thing_pkey')
		const long = constraint(`thing_${'x'.repeat(70)}_key`)
		expect(Buffer.byteLength(long)).toBe(63)
		expect(catalog.uniques.get(long)).toBeUndefined()
	})

	it('knows no column for an unknown field', () => {
		expect(() => catalog.column(catalog.table('Thing'), 'nope')).toThrow(
			'Thing.nope has no column.',
		)
		expect(() => catalog.table('Nope')).toThrow('Unknown model Nope.')
		expect(() => catalog.join('Thing', 'label')).toThrow(
			'Thing.label has no join.',
		)
	})

	it('passes on a refusal it does not know', () => {
		for (const code of ['23505', '23503']) {
			const error = Object.assign(new Error('refused'), {
				code,
				constraint: 'elsewhere_key',
			})
			expect(translate(catalog, error)).toBe(error)
		}
	})

	it('refuses a server below PostgreSQL 15 (D-119)', () => {
		expect(() => requireVersion('140010')).toThrow(Refused)
		expect(() => requireVersion('140010')).toThrow('PostgreSQL 15 or later')
		expect(() => requireVersion('150000')).not.toThrow()
	})
})

const scalar = (name: string, more: object = {}): SchemaField => ({
	kind: 'scalar',
	name,
	type: 'string',
	list: false,
	optional: false,
	unique: false,
	...more,
})
const one = (name: string, target: string): SchemaField => ({
	kind: 'one',
	name,
	target,
	inverse: 'back',
	stored: true,
	unique: false,
	optional: false,
	onDelete: 'restrict',
})
const model = (
	name: string,
	fields: SchemaField[],
	more: Partial<SchemaModel> = {},
): SchemaModel => ({ name, fields, indexes: [], ...more })

const refused = (models: SchemaModel[]) => () =>
	snapshotOf(new Catalog({ models }))
const many = (name: string, target: string): SchemaField => ({
	kind: 'many',
	name,
	target,
	inverse: target === 'Tag' ? 'books' : 'tags',
	join: true,
})

describe('two things stored under one name', () => {
	it('refuses two tables', () => {
		const models = [model('Post', []), model('Article', [], { dbName: 'post' })]
		expect(refused(models)).toThrow(
			'the table of Post and the table of Article are both stored as "post".',
		)
		// It refuses before it connects.
		const adapter = postgres({ url: 'postgres://nowhere.invalid/none' })
		return expect(adapter.start({ models }, logger)).rejects.toThrow('"post"')
	})

	it('refuses a model named as a join table', () => {
		const models = [
			model('Book', [many('tags', 'Tag')]),
			model('Tag', [many('books', 'Book')]),
			model('BookTags', []),
		]
		expect(refused(models)).toThrow(
			'the table of BookTags and the join table of Book.tags are both stored as "book_tags".',
		)
	})

	it('refuses two constraints', () => {
		const models = [
			model(
				'Thing',
				[scalar('aB', { unique: true }), scalar('a'), scalar('b')],
				{
					indexes: [{ fields: ['a', 'b'], unique: true, contains: false }],
				},
			),
		]
		expect(refused(models)).toThrow(
			'the unique key on Thing(aB) and the unique key on Thing(a, b) are both stored as "thing_a_b_key".',
		)
	})

	it('refuses two foreign keys of two tables', () => {
		const models = [
			model('Team', []),
			model('Post', [one('authorTeam', 'Team')]),
			model('PostAuthor', [one('team', 'Team')]),
		]
		expect(refused(models)).toThrow(
			'the foreign key of Post.authorTeam and the foreign key of PostAuthor.team are both stored as "post_author_team_id_fkey".',
		)
	})

	it('refuses two columns of a table', () => {
		const models = [
			model('Team', []),
			model('Post', [one('team', 'Team'), scalar('teamId')]),
		]
		expect(refused(models)).toThrow(
			'Post.team and Post.teamId are both stored as "team_id".',
		)
	})
})
