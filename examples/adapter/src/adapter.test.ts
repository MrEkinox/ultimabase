// What an adapter receives from the kernel, and what it answers: memory()
// called as the kernel calls it, and adapters that refuse as a database does.
import type {
	Adapter,
	Changed,
	Feed,
	Logger,
	Read,
	Schema,
	SchemaModel,
	Write,
} from 'ultimabase'
import {
	CheckFailed,
	Conflict,
	defineApp,
	feedFields,
	feedIds,
	master,
	memory,
	MigrationFailed,
	OutOfRange,
	RelationViolation,
	transaction,
	UniqueViolation,
} from 'ultimabase'
import { expect, it } from 'vitest'
import { Author, Post } from './models.ts'
import { timed } from './timed.ts'

const M = { as: master }
const anId: unknown = expect.any(String)
const aDate: unknown = expect.any(Date)

const logged: unknown[] = []
const log = (message: unknown) => {
	logged.push(message)
}
const logger: Logger = { info: log, warn: log, error: log, child: () => logger }

//#region schema
/** What `start` receives for `Author` and `Post`. */
const schema: Schema = {
	models: [
		{
			name: 'Author',
			fields: [
				{
					kind: 'scalar',
					name: 'name',
					type: 'string',
					list: false,
					optional: false,
					unique: false,
				},
				{
					kind: 'many',
					name: 'posts',
					target: 'Post',
					inverse: 'author',
					join: false,
				},
			],
			indexes: [],
		},
		{
			name: 'Post',
			fields: [
				{
					kind: 'scalar',
					name: 'slug',
					type: 'string',
					list: false,
					optional: false,
					unique: true,
				},
				{
					kind: 'scalar',
					name: 'views',
					type: 'number',
					list: false,
					integer: true,
					optional: false,
					unique: false,
					default: 0,
				},
				{
					kind: 'one',
					name: 'author',
					target: 'Author',
					inverse: 'posts',
					// Post holds the key.
					stored: true,
					unique: false,
					optional: false,
					onDelete: 'restrict',
				},
			],
			indexes: [],
		},
	],
}
//#endregion

/** memory(), recording the schema, reads and writes the kernel sends. */
function recorded() {
	const inner = memory()
	const sent: { schema?: Schema; reads: Read[]; writes: Write[] } = {
		reads: [],
		writes: [],
	}
	const adapter: Adapter = {
		...inner,
		start: async (given, kernelLogger, feed) => {
			sent.schema = given
			await inner.start(given, kernelLogger, feed)
		},
		find: async (read) => {
			sent.reads.push(read)
			return inner.find(read)
		},
		write: async (write) => {
			sent.writes.push(write)
			return inner.write(write)
		},
	}
	return { adapter, sent }
}

it('receives the models, the reads and the writes, prepared', async () => {
	const { adapter, sent } = recorded()
	const app = defineApp({ database: adapter, logger, models: [Author, Post] })
	await app.start()
	expect(sent.schema).toEqual(schema)
	//#region write
	const ada = await Author.create({ data: { name: 'Ada' } }, M)
	await Post.create(
		{ data: { slug: 'hello', author: { connect: { id: ada.id } } } },
		M,
	)
	expect(sent.writes[1]).toEqual({
		// Written only when the author exists: one row, counted first.
		checks: [{ model: 'Author', where: { id: { in: [ada.id] } }, count: 1 }],
		// The id, the dates and the defaults are set; the key is the author's id.
		changes: [
			{
				kind: 'insert',
				model: 'Post',
				row: {
					id: anId,
					createdAt: aDate,
					updatedAt: aDate,
					slug: 'hello',
					views: 0,
					author: ada.id,
				},
			},
		],
		// The rows the write returns, read in the same write.
		read: {
			model: 'Post',
			where: { id: { equals: anId } },
			fields: ['id', 'createdAt', 'updatedAt', 'slug', 'views'],
		},
	})
	//#endregion
	//#region read
	await Post.findMany(
		{ where: { slug: 'hello' }, include: { author: true } },
		M,
	)
	expect(sent.reads.at(-1)).toEqual({
		model: 'Post',
		// `{ slug: 'hello' }`, normalized.
		where: { slug: { equals: 'hello' } },
		// Always ending with `id`, so the order is total.
		orderBy: [{ field: 'id', direction: 'asc' }],
		fields: ['id', 'createdAt', 'updatedAt', 'slug', 'views'],
		include: {
			author: { fields: ['id', 'createdAt', 'updatedAt', 'name'] },
		},
	})
	//#endregion
	await app.stop()
})

/** memory(), started on `schema` as the kernel starts it. */
async function started(feed?: Pick<Feed, 'changed'>) {
	const adapter = memory()
	await adapter.start(schema, logger, feed && { ...feed, missed: () => {} })
	return adapter
}

const author = { id: 'a1', createdAt: new Date(), updatedAt: new Date() }
const post = (id: string, slug: string, views = 0) => ({
	id,
	createdAt: new Date(),
	updatedAt: new Date(),
	slug,
	views,
	author: 'a1',
})

it('throws the errors the kernel reports', async () => {
	const adapter = await started()
	await adapter.write({
		changes: [
			{ kind: 'insert', model: 'Author', row: { ...author, name: 'Ada' } },
		],
	})
	//#region unique-violation
	await adapter.write({
		changes: [{ kind: 'insert', model: 'Post', row: post('p1', 'hello') }],
	})
	const again = adapter.write({
		changes: [{ kind: 'insert', model: 'Post', row: post('p2', 'hello') }],
	})
	await expect(again).rejects.toBeInstanceOf(UniqueViolation)
	await expect(again).rejects.toMatchObject({
		model: 'Post',
		fields: ['slug'],
	})
	//#endregion
	//#region check-failed
	// A connected author that is gone: the first check counts 0, not 1.
	const connected = adapter.write({
		checks: [{ model: 'Author', where: { id: { in: ['gone'] } }, count: 1 }],
		changes: [{ kind: 'insert', model: 'Post', row: post('p3', 'other') }],
	})
	await expect(connected).rejects.toBeInstanceOf(CheckFailed)
	await expect(connected).rejects.toMatchObject({ index: 0 })
	// Nothing was written.
	expect(await adapter.count({ model: 'Post' })).toBe(1)
	//#endregion
	//#region out-of-range
	const increment = adapter.write({
		changes: [
			{
				kind: 'update',
				model: 'Post',
				where: { id: { equals: 'p1' } },
				set: {},
				compute: { views: { operation: 'increment', by: 2 ** 31 } },
			},
		],
	})
	await expect(increment).rejects.toBeInstanceOf(OutOfRange)
	await expect(increment).rejects.toMatchObject({
		model: 'Post',
		field: 'views',
	})
	//#endregion
})

it('reports a relation refused by a race', async () => {
	//#region relation-violation
	const inner = memory()
	// The author was deleted between the write's check and its insert.
	const racing: Adapter = {
		...inner,
		write: async () => {
			throw new RelationViolation('Post', 'author', 'Author', false)
		},
	}
	const app = defineApp({ database: racing, logger, models: [Author, Post] })
	await app.start()
	const connect = { id: 'a1' }
	await expect(
		Post.create({ data: { slug: 'hello', author: { connect } } }, M),
	).rejects.toMatchObject({
		code: 'NOT_FOUND',
		message: 'A connected Author does not exist.',
	})
	//#endregion
	await app.stop()
})

it('runs a serializable transaction again on a conflict', async () => {
	//#region conflict
	const inner = memory()
	// The database aborts the first commit for a conflict with another.
	let conflicts = 1
	const conflicting: Adapter = {
		...inner,
		begin: async (asked) => {
			const tx = await inner.begin(asked)
			return {
				...tx,
				commit: async () => {
					if (conflicts === 0) return tx.commit()
					conflicts -= 1
					await tx.rollback()
					throw new Conflict()
				},
			}
		},
	}
	const app = defineApp({
		database: conflicting,
		logger,
		models: [Author, Post],
	})
	await app.start()
	let attempts = 0
	await transaction(
		async () => {
			attempts += 1
			await Author.create({ data: { name: 'Ada' } }, M)
		},
		{ isolation: 'serializable' },
	)
	expect(attempts).toBe(2)
	expect(await Author.count({}, M)).toBe(1)
	//#endregion
	await app.stop()
})

it('reports a statement the database refused', async () => {
	//#region migration-failed
	const sql = 'CREATE TABLE "Post" ()'
	const refusing: Adapter = {
		...memory(),
		migrations: {
			snapshot: () => ({}),
			plan: () => [{ sql, model: 'Post', does: 'created' }],
			stored: async () => undefined,
			apply: async () => {
				throw new MigrationFailed(sql, 'permission denied for schema public')
			},
			reset: async () => [],
		},
	}
	const app = defineApp({ database: refusing, logger, models: [Author, Post] })
	await expect(app.start()).rejects.toThrow(
		[
			'UltimaBase did not sync Post: the database refused it.',
			'  CREATE TABLE "Post" ();',
			'  -- permission denied for schema public',
		].join('\n'),
	)
	//#endregion
})

it('sends each commit to the feed', async () => {
	//#region feed
	const fed: (readonly Changed[])[] = []
	const adapter = await started({ changed: (changes) => fed.push(changes) })
	await adapter.write({
		changes: [
			{ kind: 'insert', model: 'Author', row: { ...author, name: 'Ada' } },
		],
	})
	// Once committed, a moment later, as a database's notification.
	await expect
		.poll(() => fed)
		.toEqual([[{ kind: 'insert', model: 'Author', ids: ['a1'] }]])
	//#endregion
})

it('leaves out the lists past their limits', async () => {
	//#region feed-limits
	const fed: (readonly Changed[])[] = []
	const adapter = await started({ changed: (changes) => fed.push(changes) })
	const rows = Array.from({ length: feedIds + 1 }, (_, index) => ({
		...author,
		id: `a${String(index)}`,
		name: 'Ada',
	}))
	await adapter.write({
		changes: rows.map((row) => ({ kind: 'insert', model: 'Author', row })),
	})
	// More than `feedIds` rows: the change names none.
	await expect.poll(() => fed).toEqual([[{ kind: 'insert', model: 'Author' }]])
	//#endregion
})

it('leaves out the fields past their limit', async () => {
	//#region feed-fields
	// An update's fields, as JSON, longer than `feedFields`: the change lists none.
	const long = 'x'.repeat(feedFields)
	const wide: SchemaModel = {
		name: 'Wide',
		fields: [
			{
				kind: 'scalar',
				name: long,
				type: 'string',
				list: false,
				optional: true,
				unique: false,
			},
		],
		indexes: [],
	}
	const feed: (readonly Changed[])[] = []
	const other = memory()
	await other.start({ models: [wide] }, logger, {
		changed: (changes) => feed.push(changes),
		missed: () => {},
	})
	await other.write({
		changes: [
			{ kind: 'insert', model: 'Wide', row: { ...author, [long]: null } },
		],
	})
	await other.write({
		changes: [
			{
				kind: 'update',
				model: 'Wide',
				where: { id: { equals: 'a1' } },
				set: { [long]: 'y' },
			},
		],
	})
	await expect
		.poll(() => feed[1])
		.toEqual([{ kind: 'update', model: 'Wide', ids: ['a1'] }])
	//#endregion
})

it('logs a slow call', async () => {
	//#region slow
	const warnings: unknown[] = []
	const warn = (message: unknown) => {
		warnings.push(message)
	}
	const capturing: Logger = { ...logger, warn, child: () => capturing }
	// From 0 ms, every call is slow.
	const app = defineApp({
		database: timed(memory(), { slow: 0 }),
		logger: capturing,
		models: [Author, Post],
	})
	await app.start()
	await Author.findMany({}, M)
	expect(warnings).toContainEqual(
		expect.stringMatching(/^find Author took \d+ ms\.$/),
	)
	//#endregion
	await app.stop()
})
