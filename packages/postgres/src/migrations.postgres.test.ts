// How a PostgreSQL database follows the models (D-105): every kind of
// change on a real server, the bookkeeping, and the commands end to end.
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join as joinPath } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Client } from 'pg'
import type {
	Adapter,
	Logger,
	Migrations,
	Schema,
	SchemaField,
} from 'ultimabase'
import { MigrationFailed } from 'ultimabase'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { postgres } from './index.ts'
import { parseSnapshot } from './snapshot.ts'

const logger: Logger = {
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
	child: () => logger,
}

const url =
	(
		process.env['TEST_DATABASE_URL'] ??
		'postgres://postgres:postgres@localhost:54315/postgres'
	)
		.split(' ')
		.find((given) => given !== '') ?? ''

async function query(target: string, statement: string): Promise<unknown[]> {
	const client = new Client({ connectionString: target })
	await client.connect()
	try {
		const { rows }: { rows: unknown[] } = await client.query(statement)
		return rows
	} finally {
		await client.end()
	}
}

const inSchema = (schema: string): string =>
	`${url}${url.includes('?') ? '&' : '?'}options=${encodeURIComponent(`-c search_path=${schema}`)}`

type Scalar = Extract<SchemaField, { kind: 'scalar' }>

const scalar = (
	name: string,
	type: Scalar['type'],
	more: Partial<Scalar> = {},
): Scalar => ({
	kind: 'scalar',
	name,
	type,
	list: false,
	optional: false,
	unique: false,
	...more,
})

const one = (name: string, target: string, inverse: string): SchemaField => ({
	kind: 'one',
	name,
	target,
	inverse,
	stored: true,
	unique: false,
	optional: false,
	onDelete: 'restrict',
})

const many = (
	name: string,
	target: string,
	inverse: string,
	join = false,
): SchemaField => ({ kind: 'many', name, target, inverse, join })

/** Shelves holding boxes, and an `Old` model `after` replaces by `New`. */
const before: Schema = {
	models: [
		{
			name: 'Shelf',
			fields: [
				scalar('name', 'string', { unique: true }),
				scalar('size', 'number', { optional: true }),
				scalar('kind', 'enum', { values: ['wood', 'metal'] }),
				scalar('depth', 'number', { optional: true }),
				scalar('note', 'string', { optional: true }),
				many('boxes', 'Box', 'shelf'),
			],
			indexes: [{ fields: ['size'], unique: false, contains: false }],
		},
		{
			name: 'Box',
			fields: [scalar('label', 'string'), one('shelf', 'Shelf', 'boxes')],
			indexes: [],
		},
		{
			name: 'Old',
			fields: [scalar('title', 'string')],
			indexes: [],
		},
	],
}

const after: Schema = {
	models: [
		{
			name: 'Shelf',
			fields: [
				scalar('name', 'string'),
				scalar('size', 'string', { optional: true }),
				scalar('kind', 'enum', { values: ['wood', 'metal', 'glass'] }),
				scalar('depth', 'number'),
				scalar('remark', 'string', { optional: true }),
				many('boxes', 'Box', 'shelf'),
			],
			indexes: [
				{ fields: ['name'], unique: false, contains: false },
				{ fields: ['name', 'kind'], unique: true, contains: false },
			],
		},
		{
			name: 'Box',
			fields: [
				scalar('label', 'string'),
				one('shelf', 'Shelf', 'boxes'),
				many('tags', 'Tag', 'boxes', true),
			],
			indexes: [],
		},
		{
			name: 'Tag',
			fields: [scalar('label', 'string'), many('boxes', 'Box', 'tags', true)],
			indexes: [],
		},
		{ name: 'New', fields: [scalar('title', 'string')], indexes: [] },
	],
}

/** A shelf whose size is `type`. */
const sized = (type: Scalar['type'], optional: boolean): Schema => ({
	models: [
		{
			name: 'Shelf',
			fields: [scalar('size', type, { optional })],
			indexes: [],
		},
	],
})

/** A shelf whose size is `type`, of whole numbers with `integer` (D-132). */
const whole = (type: Scalar['type'], integer = false): Schema => ({
	models: [
		{
			name: 'Shelf',
			fields: [scalar('size', type, integer ? { integer } : {})],
			indexes: [],
		},
	],
})

/** A shelf whose size is a decimal (D-145). */
const money = (precision: number, scale: number): Schema => ({
	models: [
		{
			name: 'Shelf',
			fields: [scalar('size', 'decimal', { precision, scale })],
			indexes: [],
		},
	],
})

/** Boxes on a shelf or on a rack: the same column, another foreign key. */
const onto = (target: string): Schema => ({
	models: ['Shelf', 'Rack']
		.map((name) => ({
			name,
			fields: [
				scalar('name', 'string'),
				...(name === target ? [many('boxes', 'Box', 'shelf')] : []),
			],
			indexes: [],
		}))
		.concat({
			name: 'Box',
			fields: [scalar('label', 'string'), one('shelf', target, 'boxes')],
			indexes: [],
		}),
})

/** Posts and tags, the tag model named `tag` and stored as `tags`. */
const posts = (tag: string): Schema => ({
	models: [
		{
			name: 'Post',
			dbName: 'posts',
			fields: [scalar('title', 'string'), many('tags', tag, 'posts', true)],
			indexes: [],
		},
		{
			name: tag,
			dbName: 'tags',
			fields: [scalar('label', 'string'), many('posts', 'Post', 'tags', true)],
			indexes: [],
		},
	],
})

let schema = ''
let adapter: Adapter
let migrations: Migrations

beforeEach(async () => {
	schema = `t_${randomUUID().replaceAll('-', '')}`
	await query(url, `create schema "${schema}"`)
	adapter = postgres({ url: inSchema(schema) })
	await adapter.start({ models: [] }, logger)
	const given = adapter.migrations
	if (given === undefined) throw new Error('postgres() migrates.')
	migrations = given
})

afterEach(async () => {
	await adapter.stop()
	await query(url, `drop schema "${schema}" cascade`)
})

/** Syncs the database from `from` to `to`, and returns the plan. */
async function sync(from: Schema | undefined, to: Schema) {
	const was = from === undefined ? undefined : migrations.snapshot(from)
	const now = migrations.snapshot(to)
	const statements = migrations.plan(was, to)
	await migrations.apply({ kind: 'sync', from: was, statements, to: now })
	return statements
}

/** A book whose title has a contains index or none (D-141). */
const book = (contains: boolean): Schema => ({
	models: [
		{
			name: 'Book',
			fields: [scalar('title', 'string', { dbName: 'heading' })],
			indexes: contains
				? [{ fields: ['title'], unique: false, contains: true }]
				: [],
		},
	],
})

/** A post whose sizes are a list among `values` (D-127). */
const sizes = (values: readonly string[]): Schema => ({
	models: [
		{
			name: 'Post',
			fields: [scalar('sizes', 'enum', { list: true, values })],
			indexes: [],
		},
	],
})
const sizesCheck = (values: string) =>
	`alter table "post" add constraint "post_sizes_check" check ("sizes" <@ array[${values}]::text[])`
const insertSizes = (row: string) =>
	query(
		inSchema(schema),
		`insert into post values (gen_random_uuid(), now(), now(), '${row}')`,
	)

/** An article whose `searched` fields are in its search (D-148). */
const article = (searched: readonly string[]): Schema => ({
	models: [
		{
			name: 'Article',
			fields: ['title', 'body'].map((name) =>
				scalar(name, 'string', {
					optional: name === 'body',
					...(searched.includes(name) ? { search: true } : {}),
				}),
			),
			indexes: [],
		},
	],
})

/** The statements that add the article's search from `columns`. */
const addSearch = (columns: string) => [
	`alter table "article" add column "_search" tsvector generated always as (to_tsvector('simple'::regconfig, ${columns})) stored`,
	'create index "article__search_idx" on "article" using gin ("_search")',
]

const changes = (statements: readonly { model: string; does: string }[]) =>
	statements.map(({ model, does }) => `${model}: ${does}`)

describe('a sync on postgres()', () => {
	it('builds an empty database, then changes every kind of thing a model holds', async () => {
		await sync(undefined, before)
		await query(
			inSchema(schema),
			`insert into shelf values (gen_random_uuid(), now(), now(), 'top', 3, 'wood', 2, 'n')`,
		)
		const statements = await sync(before, after)
		expect(changes(statements)).toStrictEqual([
			'Shelf: dropped the unique key on name',
			'Shelf: dropped the values of kind',
			'Shelf: dropped the index on size',
			'Old: removed',
			'Shelf: removed note',
			'Shelf: changed size to text',
			'Shelf: made depth required',
			'Shelf: added remark',
			'Tag: created',
			'New: created',
			'Box.tags: created',
			'Shelf: added a unique key on name, kind',
			'Shelf: limited kind to wood, metal, glass',
			'Shelf: indexed name',
			'Box.tags: indexed tag_id',
			'Box.tags: added the foreign key on box_id',
			'Box.tags: added the foreign key on tag_id',
		])
		expect(
			statements.flatMap(({ loses, rename }) =>
				loses === undefined ? [] : [[loses, rename]],
			),
		).toStrictEqual([
			[
				'removing Old deletes its rows',
				{
					to: 'New',
					dbName: 'old',
					sql: 'alter table "old" rename to "new"',
				},
			],
			[
				'removing "Shelf.note" deletes data',
				{
					to: 'Shelf.remark',
					dbName: 'note',
					sql: 'alter table "shelf" rename column "note" to "remark"',
				},
			],
			[
				'changing "Shelf.size" from double precision to text rewrites its data',
				undefined,
			],
		])
		expect(
			statements.flatMap(({ tries }) => (tries === undefined ? [] : [tries])),
		).toStrictEqual([
			'making "Shelf.depth" required fails when a row holds no value',
			'a unique key on Shelf (name, kind) fails when two rows share a value',
			'limiting "Shelf.kind" to wood, metal, glass fails when a row holds another value',
		])
		expect(
			await query(inSchema(schema), 'select size, remark from shelf'),
		).toStrictEqual([{ size: '3', remark: null }])
		expect(migrations.plan(migrations.snapshot(after), after)).toStrictEqual([])

		const back = await sync(after, before)
		expect(changes(back).slice(0, 2)).toStrictEqual([
			'Box.tags: dropped the foreign key on box_id',
			'Box.tags: dropped the foreign key on tag_id',
		])
		expect(
			await query(inSchema(schema), 'select size, note from shelf'),
		).toStrictEqual([{ size: 3, note: null }])
	})

	it('names a statement the database refuses, and changes nothing', async () => {
		await sync(undefined, before)
		await query(
			inSchema(schema),
			`insert into shelf values (gen_random_uuid(), now(), now(), 'top', 3, 'metal', 2, 'n')`,
		)
		const [shelf, ...rest] = before.models
		if (shelf === undefined) throw new Error('before holds Shelf.')
		const wood: Schema = {
			models: [
				{
					...shelf,
					fields: shelf.fields.map((field) =>
						field.name === 'kind'
							? scalar('kind', 'enum', { values: ['wood'] })
							: field,
					),
				},
				...rest,
			],
		}
		await expect(sync(before, wood)).rejects.toMatchObject({
			name: 'MigrationFailed',
			at: `alter table "shelf" add constraint "shelf_kind_check" check ("kind" in ('wood'))`,
			reason:
				'check constraint "shelf_kind_check" of relation "shelf" is violated by some row',
		})
		expect((await migrations.stored())?.snapshot).toStrictEqual(
			migrations.snapshot(before),
		)
	})

	it('changes a type PostgreSQL cannot convert, without its values', async () => {
		type Type = 'number' | 'boolean' | 'dateTime' | 'json'
		const pairs: [Type, Type][] = [
			['number', 'boolean'],
			['number', 'dateTime'],
			['number', 'json'],
			['boolean', 'number'],
			['boolean', 'dateTime'],
			['boolean', 'json'],
			['dateTime', 'number'],
			['dateTime', 'boolean'],
			['dateTime', 'json'],
			['json', 'dateTime'],
		]
		const values = {
			number: '3',
			boolean: 'true',
			dateTime: 'now()',
			json: `'1'`,
		}
		const defaults = {
			number: 0,
			boolean: false,
			dateTime: new Date('2026-01-01T00:00:00.000Z'),
			json: { a: 2 },
		}
		const cellOf = (at: 0 | 1, more: Partial<Scalar> = {}): Schema => ({
			models: [
				{
					name: 'Cell',
					fields: pairs.flatMap((pair, index) => {
						const type = pair[at]
						return [
							scalar(`o${index}`, type, { optional: true, unique: true }),
							scalar(`r${index}`, type, {
								...(at === 1 ? { default: defaults[type] } : {}),
								...more,
							}),
						]
					}),
					indexes: [],
				},
			],
		})
		await sync(undefined, cellOf(0))
		const row = pairs.flatMap(([type]) => [values[type], values[type]])
		await query(
			inSchema(schema),
			`insert into cell values (gen_random_uuid(), now(), now(), ${row.join(', ')})`,
		)
		const statements = await sync(cellOf(0), cellOf(1))
		expect(statements[1]).toStrictEqual({
			sql: 'alter table "cell" alter column "r0" type boolean using false',
			model: 'Cell',
			does: 'changed r0 to boolean, false in the rows it held',
			loses:
				'changing "Cell.r0" from double precision to boolean deletes its data: PostgreSQL converts no double precision to boolean',
		})
		expect(statements[0]?.sql).toBe(
			'alter table "cell" alter column "o0" type boolean using null',
		)
		const [held] = await query(inSchema(schema), 'select * from cell')
		expect(held).toMatchObject(
			Object.fromEntries(
				pairs.flatMap(([, type], index) => [
					[`o${index}`, null],
					[`r${index}`, defaults[type]],
				]),
			),
		)
		expect(
			await query(
				inSchema(schema),
				`select count(*) from pg_indexes where tablename = 'cell' and indexdef like 'CREATE UNIQUE%'`,
			),
		).toStrictEqual([{ count: String(pairs.length + 1) }])

		const back = migrations.plan(migrations.snapshot(cellOf(1)), cellOf(0))
		expect(back[1]?.tries).toBe(
			'changing "Cell.r0" from boolean to double precision empties it, which fails when Cell holds rows: make it optional, or give it a value as its default, not a function',
		)
		await expect(sync(cellOf(1), cellOf(0))).rejects.toMatchObject({
			name: 'MigrationFailed',
			at: 'alter table "cell" alter column "r0" type double precision using null',
		})
	})

	it("writes a date as toISOString()'s text, whatever the session's time zone", async () => {
		const tokyo = `${inSchema(schema)}${encodeURIComponent(' -c TimeZone=Asia/Tokyo')}`
		const local = postgres({ url: tokyo })
		await local.start({ models: [] }, logger)
		const given = local.migrations
		if (given === undefined) throw new Error('postgres() migrates.')
		const synced = async (from: Schema | undefined, to: Schema) => {
			const was = from === undefined ? undefined : given.snapshot(from)
			const statements = given.plan(was, to)
			await given.apply({
				kind: 'sync',
				from: was,
				statements,
				to: given.snapshot(to),
			})
		}
		try {
			await synced(undefined, sized('dateTime', false))
			await query(
				tokyo,
				`insert into shelf values (gen_random_uuid(), now(), now(), '2026-10-25T10:00:00.123456Z')`,
			)
			await synced(sized('dateTime', false), sized('string', false))
			expect(await query(tokyo, 'select size from shelf')).toStrictEqual([
				{ size: '2026-10-25T10:00:00.123Z' },
			])
			await synced(sized('string', false), sized('dateTime', false))
			expect(await query(tokyo, 'select size from shelf')).toStrictEqual([
				{ size: new Date('2026-10-25T10:00:00.123Z') },
			])
		} finally {
			await local.stop()
		}
	})

	it('tries a type change that reads text or json, and makes a field optional first', () => {
		const statements = migrations.plan(
			migrations.snapshot(sized('string', false)),
			sized('boolean', true),
		)
		expect(statements.map(({ sql, tries }) => [sql, tries])).toStrictEqual([
			['alter table "shelf" alter column "size" drop not null', undefined],
			[
				'alter table "shelf" alter column "size" type boolean using "size"::boolean',
				'changing "Shelf.size" from text to boolean fails when a row holds a value it cannot convert',
			],
		])
		expect(
			migrations.plan(
				migrations.snapshot(sized('json', false)),
				sized('string', false),
			)[0]?.tries,
		).toBeUndefined()
	})

	it('converts to integer through text, which refuses what a cast rounds (D-132)', async () => {
		await sync(undefined, whole('number'))
		await query(
			inSchema(schema),
			`insert into shelf values (gen_random_uuid(), now(), now(), 1.5)`,
		)
		const statements = migrations.plan(
			migrations.snapshot(whole('number')),
			whole('number', true),
		)
		expect(statements.map(({ sql, tries }) => [sql, tries])).toStrictEqual([
			[
				'alter table "shelf" alter column "size" type integer using "size"::text::integer',
				'changing "Shelf.size" from double precision to integer fails when a row holds a value it cannot convert',
			],
		])
		await expect(
			sync(whole('number'), whole('number', true)),
		).rejects.toMatchObject({
			name: 'MigrationFailed',
			reason: 'invalid input syntax for type integer: "1.5"',
		})
		await query(inSchema(schema), 'update shelf set size = 3')
		await sync(whole('number'), whole('number', true))
		await sync(whole('number', true), whole('boolean'))
		await sync(whole('boolean'), whole('number', true))
		expect(
			await query(inSchema(schema), 'select size from shelf'),
		).toStrictEqual([{ size: 1 }])
		const [back] = migrations.plan(
			migrations.snapshot(whole('number', true)),
			whole('number'),
		)
		expect([back?.sql, back?.tries]).toStrictEqual([
			'alter table "shelf" alter column "size" type double precision using "size"::double precision',
			undefined,
		])
	})

	it('converts decimals: a lower scale rounds, a value too large fails (D-145)', async () => {
		await sync(undefined, money(6, 2))
		await query(
			inSchema(schema),
			`insert into shelf values (gen_random_uuid(), now(), now(), 1234.56), (gen_random_uuid(), now(), now(), 1.5)`,
		)
		const [rounded] = migrations.plan(
			migrations.snapshot(money(6, 2)),
			money(6, 1),
		)
		expect([rounded?.sql, rounded?.tries]).toStrictEqual([
			'alter table "shelf" alter column "size" type numeric(6,1) using "size"::numeric(6,1)',
			'changing "Shelf.size" from numeric(6,2) to numeric(6,1) fails when a row holds a value it cannot convert',
		])
		await sync(money(6, 2), money(6, 1))
		const stored = () =>
			query(
				inSchema(schema),
				'select cast(size as text) from shelf order by shelf.size',
			)
		expect(await stored()).toStrictEqual([{ size: '1.5' }, { size: '1234.6' }])
		await expect(sync(money(6, 1), money(4, 1))).rejects.toMatchObject({
			name: 'MigrationFailed',
			reason: 'numeric field overflow',
		})
		const [integer] = migrations.plan(
			migrations.snapshot(money(6, 1)),
			whole('number', true),
		)
		expect(integer?.sql).toBe(
			'alter table "shelf" alter column "size" type integer using "size"::float8::text::integer',
		)
		// One row a cast would round, so the failure names it.
		await query(inSchema(schema), 'update shelf set size = 2 where size > 2')
		await expect(
			sync(money(6, 1), whole('number', true)),
		).rejects.toMatchObject({
			name: 'MigrationFailed',
			reason: 'invalid input syntax for type integer: "1.5"',
		})
		await query(inSchema(schema), 'update shelf set size = 3')
		await sync(money(6, 1), whole('number', true))
		await sync(whole('number', true), money(6, 2))
		expect(await stored()).toStrictEqual([{ size: '3.00' }, { size: '3.00' }])
		const [lost] = migrations.plan(
			migrations.snapshot(whole('boolean')),
			money(6, 2),
		)
		expect(lost?.sql).toBe(
			'alter table "shelf" alter column "size" type numeric(6,2) using null',
		)
	})

	it('adds a list as [] or its default, indexes it by GIN, and converts it', async () => {
		const labels = scalar('labels', 'string', {
			list: true,
			default: ['a "b"', 'c\\d,{}'],
		})
		/** `tags` as a string, a number, a list of either, or left out. */
		type Tags = 'string' | 'number' | 'strings' | 'numbers' | undefined
		const tags = (type: Exclude<Tags, undefined>) =>
			type === 'strings' || type === 'numbers'
				? scalar('tags', type === 'strings' ? 'string' : 'number', {
						list: true,
					})
				: scalar('tags', type)
		const post = (type: Tags): Schema => ({
			models: [
				{
					name: 'Post',
					fields: [
						scalar('title', 'string'),
						...(type === undefined ? [] : [tags(type)]),
						...(type === 'strings' ? [labels] : []),
					],
					indexes:
						type === undefined
							? []
							: [{ fields: ['tags'], unique: false, contains: false }],
				},
			],
		})
		const rows = async () =>
			query(inSchema(schema), 'select tags, labels from post')
		const fill = `'{"a \\"b\\"","c\\\\d,{}"}'`
		const gin = 'create index "post_tags_idx" on "post" using gin ("tags")'
		await sync(undefined, post(undefined))
		await query(
			inSchema(schema),
			`insert into post values (gen_random_uuid(), now(), now(), 'Hi')`,
		)
		expect(
			(await sync(post(undefined), post('strings'))).map(({ sql }) => sql),
		).toStrictEqual([
			`alter table "post" add column "tags" text[] not null default '{}'::text[]`,
			'alter table "post" alter column "tags" drop default',
			`alter table "post" add column "labels" text[] not null default ${fill}::text[]`,
			'alter table "post" alter column "labels" drop default',
			gin,
		])
		expect(await rows()).toStrictEqual([
			{ tags: [], labels: ['a "b"', 'c\\d,{}'] },
		])
		expect(
			await query(
				inSchema(schema),
				`select count(*) from pg_indexes where indexname = 'post_tags_idx' and indexdef like '%USING gin (tags)'`,
			),
		).toStrictEqual([{ count: '1' }])

		// A string's index is a B-tree: a change of type rebuilds it.
		const text = await sync(post('strings'), post('string'))
		expect(text.map(({ sql }) => sql)).toStrictEqual([
			'drop index "post_tags_idx"',
			'alter table "post" drop column "labels"',
			'alter table "post" alter column "tags" type text collate "C" using "tags"::text collate "C"',
			'create index "post_tags_idx" on "post" ("tags")',
		])
		const back = await sync(post('string'), post('strings'))
		expect(back[1]?.tries).toBe(
			'changing "Post.tags" from text to text[] fails when a row holds a value it cannot convert',
		)
		expect(back.at(-1)?.sql).toBe(gin)
		expect(await rows()).toStrictEqual([
			{ tags: [], labels: ['a "b"', 'c\\d,{}'] },
		])

		// A list of numbers is a double precision[]; its GIN index stays (D-127).
		await query(inSchema(schema), `update post set tags = '{1,2.5}'`)
		const numbers = await sync(post('strings'), post('numbers'))
		expect(numbers.map(({ sql }) => sql)).toStrictEqual([
			'alter table "post" drop column "labels"',
			'alter table "post" alter column "tags" type double precision[] using "tags"::double precision[]',
		])
		expect(numbers[1]?.tries).toBe(
			'changing "Post.tags" from text[] to double precision[] fails when a row holds a value it cannot convert',
		)
		expect(
			await query(inSchema(schema), 'select tags from post'),
		).toStrictEqual([{ tags: [1, 2.5] }])

		// PostgreSQL converts no number to a list: the rows take [].
		const number = migrations.plan(
			migrations.snapshot(post('number')),
			post('strings'),
		)
		expect(number[1]).toMatchObject({
			sql: `alter table "post" alter column "tags" type text[] using '{}'::text[]`,
			loses:
				'changing "Post.tags" from double precision to text[] deletes its data: PostgreSQL converts no double precision to text[]',
		})
		expect(
			migrations.plan(migrations.snapshot(post('number')), post('numbers'))[1],
		).toMatchObject({
			sql: `alter table "post" alter column "tags" type double precision[] using '{}'::double precision[]`,
		})
	})

	it('installs pg_trgm and indexes a contains field by trigram (D-141)', async () => {
		// The extension's schema is on the search_path, as public is by default.
		await query(url, 'create extension if not exists pg_trgm')
		await adapter.stop()
		adapter = postgres({ url: inSchema(`${schema},public`) })
		await adapter.start({ models: [] }, logger)
		const given = adapter.migrations
		if (given === undefined) throw new Error('postgres() migrates.')
		migrations = given
		await sync(undefined, book(false))
		const added = await sync(book(false), book(true))
		expect(added.map(({ sql }) => sql)).toStrictEqual([
			'create extension if not exists pg_trgm',
			'create index "book_heading_trgm" on "book" using gin (("heading" collate "default") gin_trgm_ops)',
		])
		expect(changes(added)).toStrictEqual([
			'Book: installed pg_trgm',
			'Book: indexed title for contains',
		])
		const { tables } = parseSnapshot(migrations.snapshot(book(true)))
		expect(tables['book']?.trigrams).toStrictEqual({
			book_heading_trgm: 'heading',
		})
		expect(
			await query(
				inSchema(schema),
				`select count(*) from pg_indexes where indexname = 'book_heading_trgm' and schemaname = '${schema}'`,
			),
		).toStrictEqual([{ count: '1' }])
		expect(await sync(book(true), book(true))).toStrictEqual([])
		const dropped = await sync(book(true), book(false))
		expect(changes(dropped)).toStrictEqual([
			'Book: dropped the contains index on title',
		])
		expect(dropped.map(({ sql }) => sql)).toStrictEqual([
			'drop index "book_heading_trgm"',
		])
	})

	it('adds, remakes and drops the search column with its GIN index (D-148)', async () => {
		const created = await sync(undefined, article(['title']))
		expect(created.slice(1).map(({ sql }) => sql)).toStrictEqual(
			addSearch(`coalesce("title", '')`),
		)
		await query(
			inSchema(schema),
			`insert into article values (gen_random_uuid(), now(), now(), 'Red Apples', 'pie')`,
		)
		const read = `select "_search"::text as words from article`
		expect(await query(inSchema(schema), read)).toStrictEqual([
			{ words: `'apples':2 'red':1` },
		])
		const remade = await sync(article(['title']), article(['title', 'body']))
		expect(changes(remade)).toStrictEqual([
			'Article: dropped the search on title',
			'Article: added the search on title, body',
			'Article: indexed the search on title, body',
		])
		expect(remade.slice(1).map(({ sql }) => sql)).toStrictEqual(
			addSearch(`coalesce("title", '') || ' ' || coalesce("body", '')`),
		)
		expect(await query(inSchema(schema), read)).toStrictEqual([
			{ words: `'apples':2 'pie':3 'red':1` },
		])
		const { tables } = parseSnapshot(
			migrations.snapshot(article(['title', 'body'])),
		)
		expect(tables['article']?.search).toStrictEqual({
			index: 'article__search_idx',
			language: 'simple',
			columns: ['title', 'body'],
		})
		const { snapshot } = (await migrations.stored()) ?? {}
		expect(migrations.plan(snapshot, article(['title', 'body']))).toStrictEqual(
			[],
		)
		const dropped = await sync(article(['title', 'body']), article([]))
		expect(dropped.map(({ sql }) => sql)).toStrictEqual([
			'alter table "article" drop column "_search"',
		])
	})

	it('searches in the language it is given, which the server must have (D-148)', async () => {
		await sync(undefined, article(['title']))
		const { snapshot } = (await migrations.stored()) ?? {}
		await adapter.stop()
		adapter = postgres({ url: inSchema(schema), searchLanguage: 'english' })
		await adapter.start({ models: [] }, logger)
		const english = adapter.migrations?.plan(snapshot, article(['title']))
		expect(english?.map(({ sql }) => sql)).toStrictEqual([
			'alter table "article" drop column "_search"',
			`alter table "article" add column "_search" tsvector generated always as (to_tsvector('english'::regconfig, coalesce("title", ''))) stored`,
			'create index "article__search_idx" on "article" using gin ("_search")',
		])
		const unknown = postgres({ url: inSchema(schema), searchLanguage: 'nope' })
		await expect(unknown.start({ models: [] }, logger)).rejects.toThrow(
			"postgres() searches in 'nope', a text search configuration this server does not have.",
		)
		await unknown.stop()
	})

	it('limits each element of an enum list to its values (D-127)', async () => {
		const created = await sync(undefined, sizes(['S', 'M']))
		expect(created[0]?.sql).toContain(
			`"sizes" text[] not null,\n\tconstraint "post_pkey" primary key ("id"),\n\tconstraint "post_sizes_check" check ("sizes" <@ array['S', 'M']::text[])`,
		)
		await insertSizes('{S,M,S}')
		await expect(insertSizes('{S,XL}')).rejects.toThrow('post_sizes_check')
		const widened = await sync(sizes(['S', 'M']), sizes(['S', 'M', 'L']))
		expect(widened.map(({ sql }) => sql)).toStrictEqual([
			'alter table "post" drop constraint "post_sizes_check"',
			sizesCheck(`'S', 'M', 'L'`),
		])
		expect(widened[1]?.tries).toBe(
			'limiting "Post.sizes" to S, M, L fails when a row holds another value',
		)
		const { snapshot } = (await migrations.stored()) ?? {}
		expect(migrations.plan(snapshot, sizes(['S', 'M', 'L']))).toStrictEqual([])
	})

	it('tries a foreign key that moves on a column rows hold', () => {
		const statements = migrations.plan(
			migrations.snapshot(onto('Shelf')),
			onto('Rack'),
		)
		expect(statements.at(-1)?.tries).toBe(
			'linking "Box.shelf" fails when a row points to no row',
		)
	})

	it('fills the rows with a fixed default when it adds a required field', async () => {
		const note = (fields: readonly SchemaField[]): Schema => ({
			models: [
				{
					name: 'Note',
					fields: [scalar('text', 'string'), ...fields],
					indexes: [],
				},
			],
		})
		await sync(undefined, note([]))
		await query(
			inSchema(schema),
			`insert into note values (gen_random_uuid(), now(), now(), 'Hi')`,
		)
		const due = new Date('2026-10-25T09:00:00.000Z')
		const statements = await sync(
			note([]),
			note([
				scalar('title', 'string', { default: "it's" }),
				scalar('rank', 'number', { default: -1.5 }),
				scalar('done', 'boolean', { default: false }),
				scalar('due', 'dateTime', { default: due }),
				scalar('meta', 'json', { default: { tags: ['a'] } }),
				scalar('level', 'enum', { values: ['low', 'high'], default: 'low' }),
				scalar('later', 'number', { optional: true, default: 3 }),
				scalar('owner', 'string'),
			]),
		).catch((error: unknown) => error)
		expect(statements).toMatchObject({
			name: 'MigrationFailed',
			at: 'alter table "note" add column "owner" text collate "C" not null',
		})
		const filled = note([
			scalar('title', 'string', { default: "it's" }),
			scalar('rank', 'number', { default: -1.5 }),
			scalar('done', 'boolean', { default: false }),
			scalar('due', 'dateTime', { default: due }),
			scalar('meta', 'json', { default: { tags: ['a'] } }),
			// A json list is json, not a string list (D-120).
			scalar('items', 'json', { default: ['a'] }),
			scalar('level', 'enum', { values: ['low', 'high'], default: 'low' }),
			scalar('later', 'number', { optional: true, default: 3 }),
		])
		const made = await sync(note([]), filled)
		expect(made.map(({ sql }) => sql)).toStrictEqual([
			`alter table "note" add column "title" text collate "C" not null default 'it''s'`,
			'alter table "note" alter column "title" drop default',
			'alter table "note" add column "rank" double precision not null default -1.5',
			'alter table "note" alter column "rank" drop default',
			'alter table "note" add column "done" boolean not null default false',
			'alter table "note" alter column "done" drop default',
			`alter table "note" add column "due" timestamptz not null default '2026-10-25T09:00:00.000Z'::timestamptz`,
			'alter table "note" alter column "due" drop default',
			`alter table "note" add column "meta" jsonb not null default '{"tags":["a"]}'::jsonb`,
			'alter table "note" alter column "meta" drop default',
			`alter table "note" add column "items" jsonb not null default '["a"]'::jsonb`,
			'alter table "note" alter column "items" drop default',
			`alter table "note" add column "level" text collate "C" not null default 'low'`,
			'alter table "note" alter column "level" drop default',
			'alter table "note" add column "later" double precision',
			`alter table "note" add constraint "note_level_check" check ("level" in ('low', 'high'))`,
		])
		expect(made.map(({ does }) => does).slice(0, 4)).toStrictEqual([
			'added title',
			"'it''s' in the rows it held",
			'added rank',
			'-1.5 in the rows it held',
		])
		expect(made.filter(({ tries }) => tries !== undefined)).toHaveLength(1)
		expect(
			await query(
				inSchema(schema),
				'select title, rank, done, due, meta, level, later from note',
			),
		).toStrictEqual([
			{
				title: "it's",
				rank: -1.5,
				done: false,
				due,
				meta: { tags: ['a'] },
				level: 'low',
				later: null,
			},
		])
		expect(
			await query(
				inSchema(schema),
				`select column_name from information_schema.columns
				where table_schema = '${schema}' and column_default is not null`,
			),
		).toStrictEqual([])
	})

	it('tries a required field added without a fixed default', () => {
		const [statement] = migrations.plan(migrations.snapshot(onto('Shelf')), {
			models: [
				...onto('Shelf').models.slice(1),
				{
					name: 'Shelf',
					fields: [
						scalar('name', 'string'),
						scalar('size', 'number'),
						many('boxes', 'Box', 'shelf'),
					],
					indexes: [],
				},
			],
		})
		expect(statement?.tries).toBe(
			'adding the required "Shelf.size" fails when Shelf holds rows: make it optional, or give it a value as its default, not a function',
		)
	})

	it('stores what it synced, and reads nothing before', async () => {
		expect(await migrations.stored()).toBeUndefined()
		await sync(undefined, before)
		expect(await migrations.stored()).toStrictEqual({
			snapshot: migrations.snapshot(before),
			by: 'sync',
			applied: [],
		})
	})

	it('offers a rename from the snapshot it stored, whose columns jsonb sorts', async () => {
		await sync(undefined, before)
		const stored = await migrations.stored()
		const statements = migrations.plan(stored?.snapshot, after)
		expect(statements.find(({ model }) => model === 'Old')?.rename?.to).toBe(
			'New',
		)
	})

	it('keeps the join of a model renamed with its dbName', async () => {
		await sync(undefined, posts('Tag'))
		await query(
			inSchema(schema),
			`with p as (insert into posts values (gen_random_uuid(), now(), now(), 'Hi') returning id),
			t as (insert into tags values (gen_random_uuid(), now(), now(), 'art') returning id)
			insert into posts_tags select p.id, t.id from p, t`,
		)
		// `Label` sorts before `Post`, `tags` after `posts`.
		expect(await sync(posts('Tag'), posts('Label'))).toStrictEqual([])
		expect(
			await query(
				inSchema(schema),
				'select count(*)::int as n from posts_tags',
			),
		).toStrictEqual([{ n: 1 }])
	})

	it('refuses tables that no snapshot describes', async () => {
		await query(inSchema(schema), 'create table shelf (id uuid)')
		await expect(sync(undefined, before)).rejects.toThrow(
			'The database already holds shelf, and no UltimaBase snapshot says what they are: sync only builds an empty database.',
		)
	})

	it('refuses a database another process changed, and leaves one it synced', async () => {
		await sync(undefined, before)
		await expect(sync(undefined, after)).rejects.toThrow(
			'The database changed while UltimaBase synced it: start again.',
		)
		await expect(sync(after, before)).resolves.toBeDefined()
		await expect(sync(after, after)).rejects.toThrow(
			'The database changed while UltimaBase synced it',
		)
	})

	it('refuses a snapshot postgres() did not write', () => {
		expect(() => migrations.plan({ postgres: 2 }, before)).toThrow(
			'The schema snapshot is not one postgres() wrote.',
		)
		expect(() =>
			migrations.plan({ postgres: 1, tables: { t: {} } }, before),
		).toThrow('The schema snapshot is not one postgres() wrote.')
	})
})

describe('the bookkeeping on postgres()', () => {
	const create = [
		'create table ultimabase_schema (id integer primary key, snapshot jsonb not null, written_by text not null, written_at timestamptz not null)',
		'create table ultimabase_migrations (name text primary key, checksum text, schema_hash text, applied_at timestamptz not null)',
	]

	it('reads empty tables as nothing stored', async () => {
		for (const statement of create) await query(inSchema(schema), statement)
		expect(await migrations.stored()).toBeUndefined()
	})

	it('refuses tables it cannot read', async () => {
		for (const statement of create) await query(inSchema(schema), statement)
		await query(
			inSchema(schema),
			"insert into ultimabase_migrations values ('1_a.sql', null, null, now())",
		)
		await expect(migrations.stored()).rejects.toThrow(
			'ultimabase_migrations is broken.',
		)
		await query(inSchema(schema), 'drop table ultimabase_schema')
		await query(inSchema(schema), 'create table ultimabase_schema (id integer)')
		await expect(migrations.stored()).rejects.toMatchObject({ code: '42703' })
	})
})

const file = (name: string, sql: string, transaction = true) => ({
	name,
	sql,
	checksum: name,
	transaction,
})

describe('a deploy on postgres()', () => {
	it('applies each file once, statements together, then stores the snapshot', async () => {
		const to = migrations.snapshot(before)
		const sql = migrations
			.plan(undefined, before)
			.map((statement) => `${statement.sql};`)
			.join('\n')
		const files = [{ ...file('1_init.sql', sql), schema: 'abc' }]
		await migrations.apply({ kind: 'deploy', files, to })
		await migrations.apply({ kind: 'deploy', files, to })
		expect(await migrations.stored()).toStrictEqual({
			snapshot: to,
			by: 'deploy',
			applied: [{ name: '1_init.sql', checksum: '1_init.sql', schema: 'abc' }],
		})
		expect(await query(inSchema(schema), 'select * from box')).toStrictEqual([])
	})

	it('rolls a file back when it fails, and names it', async () => {
		const to = migrations.snapshot(before)
		const files = [
			file('1_a.sql', 'create table a (id integer);'),
			file('2_b.sql', 'create table b (id integer); select 1 / 0;'),
		]
		await expect(
			migrations.apply({ kind: 'deploy', files, to }),
		).rejects.toMatchObject({
			name: 'MigrationFailed',
			at: '2_b.sql',
			reason: 'division by zero',
		})
		const stored = await migrations.stored()
		expect(stored?.snapshot).toBeUndefined()
		expect(stored?.applied.map((given) => given.name)).toStrictEqual([
			'1_a.sql',
		])
		await expect(query(inSchema(schema), 'select * from b')).rejects.toThrow(
			'relation "b" does not exist',
		)
	})
})

/** A session that read Shelf, in a transaction it keeps open. */
async function holding(): Promise<Client> {
	const holder = new Client({ connectionString: inSchema(schema) })
	await holder.connect()
	await holder.query('begin')
	await holder.query('select count(*) from shelf')
	return holder
}

/** A raw statement of Shelf, for a sync to apply. */
const statement = (sql: string) => ({ sql, model: 'Shelf', does: sql })

describe('a sync or a reset waiting for a lock', () => {
	it('waits 5s at most for a table another session holds, and says so', async () => {
		await sync(undefined, before)
		const [was, now] = [migrations.snapshot(before), migrations.snapshot(after)]
		await migrations.apply({
			kind: 'sync',
			from: was,
			statements: [
				statement(
					"create table waits as select current_setting('lock_timeout') as waits",
				),
			],
			to: now,
		})
		expect(
			await query(inSchema(schema), 'select waits from waits'),
		).toStrictEqual([{ waits: '5s' }])
		const holder = await holding()
		try {
			const alter = 'alter table shelf add column late integer'
			await expect(
				migrations.apply({
					kind: 'sync',
					from: now,
					statements: [
						statement("set local lock_timeout = '50ms'"),
						statement(alter),
					],
					to: was,
				}),
			).rejects.toMatchObject({
				name: 'MigrationFailed',
				at: alter,
				reason:
					'canceling statement due to lock timeout: another query held a table it changes past lock_timeout',
				locked: true,
			})
			expect(
				await query(inSchema(schema), 'select count(*) from shelf'),
			).toStrictEqual([{ count: '0' }])
		} finally {
			await holder.end()
		}
	})

	it('resets nothing when another session holds a table past 5s', async () => {
		await sync(undefined, before)
		const holder = await holding()
		try {
			const started = Date.now()
			const failed: unknown = await migrations
				.reset()
				.catch((error: unknown) => error)
			expect(Date.now() - started).toBeGreaterThanOrEqual(5000)
			expect(failed).toBeInstanceOf(MigrationFailed)
			expect(failed).toMatchObject({ locked: true })
			expect(String(failed)).toMatch(
				/refused drop table .*"shelf".* cascade: canceling statement due to lock timeout/,
			)
		} finally {
			await holder.end()
		}
		expect(
			await query(inSchema(schema), 'select count(*) from shelf'),
		).toStrictEqual([{ count: '0' }])
	}, 15_000)
})

describe('a deploy waiting for a lock', () => {
	it('waits 5s at most, unless a file sets its own', async () => {
		const to = migrations.snapshot(before)
		await migrations.apply({
			kind: 'deploy',
			files: [
				file(
					'1_a.sql',
					"create table a as select current_setting('lock_timeout') as waits;",
				),
			],
			to,
		})
		expect(await query(inSchema(schema), 'select waits from a')).toStrictEqual([
			{ waits: '5s' },
		])
		const holder = new Client({ connectionString: inSchema(schema) })
		await holder.connect()
		try {
			await holder.query('begin')
			await holder.query('lock table a in access share mode')
			await expect(
				migrations.apply({
					kind: 'deploy',
					files: [
						file(
							'2_b.sql',
							"set local lock_timeout = '50ms'; alter table a add column b integer;",
						),
					],
					to,
				}),
			).rejects.toMatchObject({
				name: 'MigrationFailed',
				at: '2_b.sql',
				reason:
					'canceling statement due to lock timeout: another query held a table it changes past lock_timeout',
			})
		} finally {
			await holder.end()
		}
	})
})

describe('a deploy of a file without a transaction', () => {
	it('creates an index concurrently, once', async () => {
		const to = migrations.snapshot(before)
		const files = [
			file('1_a.sql', 'create table a (b integer);'),
			file(
				'2_index.sql',
				'-- ultimabase schema abc\n-- ultimabase no transaction\ncreate index concurrently a_b on a (b);\n',
				false,
			),
		]
		await migrations.apply({ kind: 'deploy', files, to })
		await migrations.apply({ kind: 'deploy', files, to })
		expect(
			await query(
				inSchema(schema),
				"select indexname from pg_indexes where tablename = 'a'",
			),
		).toStrictEqual([{ indexname: 'a_b' }])
		expect(
			(await migrations.stored())?.applied.map(({ name }) => name),
		).toStrictEqual(['1_a.sql', '2_index.sql'])
	})

	it('refuses two statements, and concurrently in a transaction', async () => {
		const to = migrations.snapshot(before)
		await migrations.apply({
			kind: 'deploy',
			files: [file('1_a.sql', 'create table a (b integer);')],
			to,
		})
		await expect(
			migrations.apply({
				kind: 'deploy',
				files: [
					file(
						'2_index.sql',
						'create index concurrently a_b on a (b); create index concurrently a_bb on a (b);',
						false,
					),
				],
				to,
			}),
		).rejects.toMatchObject({
			at: '2_index.sql',
			reason:
				'CREATE INDEX CONCURRENTLY cannot run inside a transaction block: a file without a transaction holds one statement: put each in its own file',
		})
		await expect(
			migrations.apply({
				kind: 'deploy',
				files: [file('2_index.sql', 'create index concurrently a_b on a (b);')],
				to,
			}),
		).rejects.toMatchObject({
			at: '2_index.sql',
			reason:
				'CREATE INDEX CONCURRENTLY cannot run inside a transaction block: put it in its own file, whose second line is `-- ultimabase no transaction`',
		})
		await migrations.apply({
			kind: 'deploy',
			files: [
				file('2_index.sql', 'create index concurrently a_b on a (b);', false),
			],
			to,
		})
		expect(
			await query(
				inSchema(schema),
				"select indexname from pg_indexes where tablename = 'a'",
			),
		).toStrictEqual([{ indexname: 'a_b' }])
	})
})

/** The host `reset` calls another machine's for a URL. */
const remote = (connection: string) =>
	postgres({ url: connection }).migrations?.remote

describe('a reset on postgres()', () => {
	it("leaves an extension's tables", async () => {
		await query(inSchema(schema), 'create table owned (id integer)')
		await query(inSchema(schema), 'alter extension plpgsql add table owned')
		try {
			expect(await migrations.reset()).toStrictEqual([])
			expect(
				await query(inSchema(schema), 'select * from owned'),
			).toStrictEqual([])
		} finally {
			await query(inSchema(schema), 'alter extension plpgsql drop table owned')
		}
	})

	it("drops every table, and names the models' ones", async () => {
		await sync(undefined, before)
		await query(inSchema(schema), 'create table extra (id integer)')
		expect(await migrations.reset()).toStrictEqual([
			'box',
			'extra',
			'old',
			'shelf',
		])
		expect(await migrations.stored()).toBeUndefined()
		expect(
			await query(
				url,
				`select table_name from information_schema.tables where table_schema = '${schema}'`,
			),
		).toStrictEqual([])
	})

	it('names the host of a database on another machine, read as pg reads it', () => {
		expect(remote('postgres://u:p@db.example.com:5432/app')).toBe(
			'db.example.com',
		)
		expect(remote('postgres://u@db.example.com/app?host=localhost')).toBe(
			undefined,
		)
		expect(remote('postgres://localhost/app')).toBe(undefined)
		expect(remote('postgres://[::1]:5432/app')).toBe(undefined)
		expect(remote('postgres://%2Fvar%2Frun%2Fpostgresql/app')).toBe(undefined)
		expect(remote('postgres://[2001:db8::1]/app')).toBe('2001:db8::1')
		expect(remote(url)).toBe(undefined)
		vi.stubEnv('PGHOST', '')
		expect(remote('postgres:///app')).toBe(undefined)
		vi.stubEnv('PGHOST', 'db.example.com')
		expect(remote('postgres:///app')).toBe('db.example.com')
		vi.unstubAllEnvs()
	})
})

const bin = joinPath(import.meta.dirname, '../../ultimabase/src/cli.ts')
const kernel = pathToFileURL(
	joinPath(import.meta.dirname, '../../ultimabase/src/index.ts'),
).href
const adapterUrl = pathToFileURL(joinPath(import.meta.dirname, 'index.ts')).href

type Ran = { readonly code: number | null; readonly output: string }

/** Runs `ultimabase` in `cwd` until it prints `until` or exits. */
function ultimabase(
	cwd: string,
	args: readonly string[],
	env: Record<string, string>,
	until?: string,
): Promise<Ran> {
	return new Promise((done, fail) => {
		const child = spawn(process.execPath, [bin, ...args], {
			cwd,
			env: { ...process.env, NO_COLOR: '1', ...env },
		})
		let output = ''
		const read = (chunk: Buffer) => {
			output += chunk.toString()
			if (until !== undefined && output.includes(until)) child.kill('SIGTERM')
		}
		child.stdout.on('data', read)
		child.stderr.on('data', read)
		child.on('error', fail)
		child.on('exit', (code) => {
			done({ code, output })
		})
	})
}

const development = () => ({
	DATABASE_URL: inSchema(schema),
	NODE_ENV: 'development',
})

describe('the commands on postgres()', () => {
	let dir = ''
	let production = ''
	beforeEach(async () => {
		dir = await mkdtemp(joinPath(tmpdir(), 'ultimabase-pg-'))
		production = `t_${randomUUID().replaceAll('-', '')}`
		await query(url, `create schema "${production}"`)
	})
	afterEach(async () => {
		await rm(dir, { recursive: true })
		await query(url, `drop schema "${production}" cascade`)
	})

	/** Writes `ultimabase.config.ts` with a Locker of `fields`. */
	const config = async (fields: string) =>
		writeFile(
			joinPath(dir, 'ultimabase.config.ts'),
			[
				`import { defineApp, defineModel } from '${kernel}'`,
				`import { postgres } from '${adapterUrl}'`,
				`const Locker = defineModel({ name: 'Locker', fields: (f) => ({ ${fields} }) })`,
				`export default defineApp({ database: postgres({ url: process.env.DATABASE_URL ?? '' }), models: [Locker] })`,
			].join('\n'),
		)
	const deployed = () => ({
		DATABASE_URL: inSchema(production),
		NODE_ENV: 'production',
	})

	it('syncs development, refuses what loses data, and writes and deploys migrations', async () => {
		await config('label: f.string()')
		const synced = await ultimabase(dir, ['sync'], development())
		expect(synced).toMatchObject({ code: 0 })
		expect(synced.output).toContain("Created the database's tables.")

		const unready = await ultimabase(dir, ['start'], deployed())
		expect(unready.code).toBe(1)
		expect(unready.output).toBe(
			'The database has no UltimaBase schema: run `npx ultimabase migrate deploy`, then start again.\n',
		)

		expect(
			await ultimabase(dir, ['migrate', 'create', 'init'], {}),
		).toMatchObject({ code: 0 })
		const [init = ''] = (await readdir(joinPath(dir, 'migrations'))).toSorted()
		expect(
			(await readFile(joinPath(dir, 'migrations', init), 'utf8'))
				.split('\n')
				.slice(2),
		).toStrictEqual([
			'create table "locker" (',
			'\t"id" uuid not null,',
			'\t"created_at" timestamptz not null,',
			'\t"updated_at" timestamptz not null,',
			'\t"label" text collate "C" not null,',
			'\tconstraint "locker_pkey" primary key ("id")',
			');',
			'',
		])
		const deploy = await ultimabase(dir, ['migrate', 'deploy'], deployed())
		expect(deploy.code).toBe(0)
		expect(deploy.output).toMatch(/^Applied \d{14}_init\.sql\.\n$/)
		const started = await ultimabase(
			dir,
			['start'],
			deployed(),
			'Application stopped.',
		)
		expect(started.output).toContain('Application started.')

		await config('size: f.number({ optional: true })')
		const stale = await ultimabase(dir, ['migrate', 'deploy'], deployed())
		expect(stale.code).toBe(1)
		expect(stale.output).toContain('The models changed after')
		const behind = await ultimabase(dir, ['start'], deployed())
		expect(behind.output).toBe(
			"The database's tables are not the models': run `npx ultimabase migrate deploy`, then start again.\n",
		)
		const refused = await ultimabase(dir, ['sync'], development())
		expect(refused.code).toBe(1)
		expect(refused.output).toBe(
			[
				'UltimaBase did not sync Locker: removing "Locker.label" deletes data.',
				'  alter table "locker" drop column "label";',
				'Run `npx ultimabase sync --force` to apply it to this development database,',
				'or `npx ultimabase migrate create <name>` to write it as a migration.',
				'',
			].join('\n'),
		)

		expect(
			await ultimabase(dir, ['migrate', 'create', 'size'], {}),
		).toMatchObject({ code: 0 })
		const files = (await readdir(joinPath(dir, 'migrations'))).toSorted()
		const size = files.find((name) => name.endsWith('_size.sql')) ?? ''
		expect(
			(await readFile(joinPath(dir, 'migrations', size), 'utf8'))
				.split('\n')
				.slice(2),
		).toStrictEqual([
			'-- removing "Locker.label" deletes data.',
			'alter table "locker" drop column "label";',
			'',
			'alter table "locker" add column "size" double precision;',
			'',
		])
		const next = await ultimabase(dir, ['migrate', 'deploy'], deployed())
		expect(next.output).toBe(`Applied ${size}.\n`)
		const synced2 = await ultimabase(dir, ['migrate', 'deploy'], development())
		expect(synced2.output).toContain(
			'Development sync changed this database since its last deploy',
		)
	}, 60_000)

	it('fills the rows with a fixed default, in a sync and in a migration', async () => {
		await config('label: f.string()')
		await ultimabase(dir, ['sync'], development())
		await ultimabase(dir, ['migrate', 'create', 'init'], {})
		await query(
			inSchema(schema),
			`insert into locker values (gen_random_uuid(), now(), now(), 'a')`,
		)
		await config('label: f.string(), done: f.boolean({ default: false })')
		const synced = await ultimabase(dir, ['sync'], development())
		expect(synced.code).toBe(0)
		expect(synced.output).toContain(
			'Synced Locker: added done, false in the rows it held.',
		)
		expect(
			await query(inSchema(schema), 'select label, done from locker'),
		).toStrictEqual([{ label: 'a', done: false }])

		await ultimabase(dir, ['migrate', 'create', 'done'], {})
		const files = await readdir(joinPath(dir, 'migrations'))
		const done = files.find((name) => name.endsWith('_done.sql')) ?? ''
		expect(
			(await readFile(joinPath(dir, 'migrations', done), 'utf8'))
				.split('\n')
				.slice(2),
		).toStrictEqual([
			'alter table "locker" add column "done" boolean not null default false;',
			'',
			'alter table "locker" alter column "done" drop default;',
			'',
		])
	}, 30_000)

	it('refuses a reset of a database on another machine without --force', async () => {
		await config('label: f.string()')
		const refused = await ultimabase(dir, ['reset'], {
			...development(),
			DATABASE_URL: 'postgres://u@db.example.com/app',
		})
		expect(refused).toStrictEqual({
			code: 1,
			output:
				'reset drops every table, and db.example.com is not this machine: pass --force if it holds a development database.\n',
		})
	})

	it('tests a data migration on a copy of production, then deploys it', async () => {
		await config('label: f.string()')
		await ultimabase(dir, ['migrate', 'create', 'init'], {})
		const [init = ''] = (await readdir(joinPath(dir, 'migrations'))).toSorted()
		const row = `insert into locker (id, created_at, updated_at, label) values (gen_random_uuid(), now(), now(), 'prod row')`
		await ultimabase(dir, ['migrate', 'deploy'], deployed())
		await query(inSchema(production), row)
		// The development schema stands for a restored dump of production.
		await ultimabase(dir, ['migrate', 'deploy'], development())
		await query(inSchema(schema), row)

		await config("label: f.string(), kind: f.enumOf(['wood', 'glass'])")
		const tried = await ultimabase(dir, ['sync'], development())
		expect(tried).toStrictEqual({
			code: 1,
			output: [
				'UltimaBase did not sync Locker: adding the required "Locker.kind" fails when Locker holds rows: make it optional, or give it a value as its default, not a function.',
				'  alter table "locker" add column "kind" text collate "C" not null;',
				'  -- column "kind" of relation "locker" contains null values',
				'Fix those rows in this development database, or rebuild it from the migrations with `npx ultimabase reset`.',
				'In production, a migration fixes them: write it with `npx ultimabase migrate create <name>`.',
				'',
			].join('\n'),
		})

		await ultimabase(dir, ['migrate', 'create', 'add_kind'], {})
		const files = (await readdir(joinPath(dir, 'migrations'))).toSorted()
		const kind = files.find((name) => name.endsWith('_add_kind.sql')) ?? ''
		const path = joinPath(dir, 'migrations', kind)
		const [header = '', ...generated] = (await readFile(path, 'utf8')).split(
			'\n',
		)
		expect(generated.slice(1)).toStrictEqual([
			'-- adding the required "Locker.kind" fails when Locker holds rows: make it optional, or give it a value as its default, not a function.',
			'alter table "locker" add column "kind" text collate "C" not null;',
			'',
			'-- limiting "Locker.kind" to wood, glass fails when a row holds another value.',
			`alter table "locker" add constraint "locker_kind_check" check ("kind" in ('wood', 'glass'));`,
			'',
		])
		expect(
			await ultimabase(dir, ['migrate', 'status'], development()),
		).toStrictEqual({ code: 1, output: `${kind} is pending.\n` })
		expect(
			await ultimabase(dir, ['migrate', 'deploy'], development()),
		).toStrictEqual({
			code: 1,
			output: `${kind} was not applied: column "kind" of relation "locker" contains null values\nThe database rolled it back: fix it, then deploy again.\n`,
		})

		await writeFile(
			path,
			[
				header,
				'alter table "locker" add column "kind" text collate "C";',
				`update "locker" set "kind" = 'glass' where "label" like 'prod%';`,
				'alter table "locker" alter column "kind" set not null;',
				`alter table "locker" add constraint "locker_kind_check" check ("kind" in ('wood', 'glass'));`,
				'',
			].join('\n'),
		)
		expect(
			await ultimabase(dir, ['migrate', 'deploy'], development()),
		).toStrictEqual({ code: 0, output: `Applied ${kind}.\n` })
		expect(
			await ultimabase(dir, ['migrate', 'status'], development()),
		).toStrictEqual({ code: 0, output: 'The database is up to date.\n' })
		const migrated = [{ label: 'prod row', kind: 'glass' }]
		expect(
			await query(inSchema(schema), 'select label, kind from locker'),
		).toStrictEqual(migrated)

		expect(
			await ultimabase(dir, ['migrate', 'deploy'], deployed()),
		).toStrictEqual({ code: 0, output: `Applied ${kind}.\n` })
		expect(
			await query(inSchema(production), 'select label, kind from locker'),
		).toStrictEqual(migrated)

		expect(await ultimabase(dir, ['reset'], development())).toStrictEqual({
			code: 0,
			output: `Dropped locker.\nApplied ${init}.\nApplied ${kind}.\n`,
		})
		expect(
			await query(inSchema(schema), 'select label from locker'),
		).toStrictEqual([])
	}, 60_000)
})
