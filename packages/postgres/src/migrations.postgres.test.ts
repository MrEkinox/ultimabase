// How a PostgreSQL database follows the models (D-105): every kind of
// change on a real server, the bookkeeping, and the commands end to end.
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join as joinPath } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Client } from 'pg'
import type { Adapter, Migrations, Schema, SchemaField } from 'ultimabase'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { postgres } from './index.ts'

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
			indexes: [{ fields: ['size'], unique: false }],
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
				{ fields: ['name'], unique: false },
				{ fields: ['name', 'kind'], unique: true },
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
	await adapter.start({ models: [] })
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
	const statements = migrations.plan(was, now)
	await migrations.apply({ kind: 'sync', from: was, statements, to: now })
	return statements
}

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
		expect(
			migrations.plan(migrations.snapshot(after), migrations.snapshot(after)),
		).toStrictEqual([])

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

	it('tries a foreign key that moves on a column rows hold', () => {
		const statements = migrations.plan(
			migrations.snapshot(onto('Shelf')),
			migrations.snapshot(onto('Rack')),
		)
		expect(statements.at(-1)?.tries).toBe(
			'linking "Box.shelf" fails when a row points to no row',
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
		const statements = migrations.plan(
			stored?.snapshot,
			migrations.snapshot(after),
		)
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
		expect(() => migrations.plan(undefined, { postgres: 2 })).toThrow(
			'The schema snapshot is not one postgres() wrote.',
		)
		expect(() =>
			migrations.plan(undefined, { postgres: 1, tables: { t: {} } }),
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
			.plan(undefined, to)
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
				'UltimaBase did not sync Locker: adding the required "Locker.kind" fails when Locker holds rows.',
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
			'-- adding the required "Locker.kind" fails when Locker holds rows.',
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
