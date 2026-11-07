// What the migration tests share (D-105): an adapter on a schema of its own
// for each test, the models a sync moves between, and the SQL helpers.
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import type {
	Adapter,
	Logger,
	Migrations,
	Schema,
	SchemaField,
} from 'ultimabase'
import { afterEach, beforeEach } from 'vitest'
import { postgres } from '../index.ts'

export const logger: Logger = {
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
	child: () => logger,
}

export const url =
	(
		process.env['TEST_DATABASE_URL'] ??
		'postgres://postgres:postgres@localhost:54315/postgres'
	)
		.split(' ')
		.find((given) => given !== '') ?? ''

export async function query(
	target: string,
	statement: string,
): Promise<unknown[]> {
	const client = new Client({ connectionString: target })
	await client.connect()
	try {
		const { rows }: { rows: unknown[] } = await client.query(statement)
		return rows
	} finally {
		await client.end()
	}
}

export const inSchema = (schema: string): string =>
	`${url}${url.includes('?') ? '&' : '?'}options=${encodeURIComponent(`-c search_path=${schema}`)}`

export type Scalar = Extract<SchemaField, { kind: 'scalar' }>

export const scalar = (
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

export const one = (
	name: string,
	target: string,
	inverse: string,
): Extract<SchemaField, { kind: 'one' }> => ({
	kind: 'one',
	name,
	target,
	inverse,
	stored: true,
	unique: false,
	optional: false,
	onDelete: 'restrict',
})

export const many = (
	name: string,
	target: string,
	inverse: string,
	join = false,
): SchemaField => ({ kind: 'many', name, target, inverse, join })

/** Shelves holding boxes, and an `Old` model `after` replaces by `New`. */
export const before: Schema = {
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

export const after: Schema = {
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

export let schema = ''
export let adapter: Adapter
export let migrations: Migrations

async function begin(at: string): Promise<void> {
	adapter = postgres({ url: at })
	await adapter.start({ models: [] }, logger)
	const given = adapter.migrations
	if (given === undefined) throw new Error('postgres() migrates.')
	migrations = given
}

/** Restarts the test's adapter on the database at `at`. */
export async function restart(at: string): Promise<void> {
	await adapter.stop()
	await begin(at)
}

/** Gives each test of the file that calls it an adapter on a schema of its own. */
export function eachInSchema(): void {
	beforeEach(async () => {
		schema = `t_${randomUUID().replaceAll('-', '')}`
		await query(url, `create schema "${schema}"`)
		await begin(inSchema(schema))
	})

	afterEach(async () => {
		await adapter.stop()
		await query(url, `drop schema "${schema}" cascade`)
	})
}

/** Syncs the database from `from` to `to`, and returns the plan. */
export async function sync(from: Schema | undefined, to: Schema) {
	const was = from === undefined ? undefined : migrations.snapshot(from)
	const now = migrations.snapshot(to)
	const statements = migrations.plan(was, to)
	await migrations.apply({ kind: 'sync', from: was, statements, to: now })
	return statements
}

export const file = (name: string, sql: string, transaction = true) => ({
	name,
	sql,
	checksum: name,
	transaction,
})
