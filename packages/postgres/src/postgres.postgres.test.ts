// The contract on PostgreSQL (D-98): each test in its own schema, on every
// server `TEST_DATABASE_URL` lists.
import { randomUUID } from 'node:crypto'
import { testAdapter } from '@ultimabase/testing'
import { Client } from 'pg'
import type { Adapter, Schema } from 'ultimabase'
import { UniqueViolation } from 'ultimabase'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAdapter, requireVersion } from './adapter.ts'
import { postgres } from './index.ts'
import { Catalog, constraint } from './names.ts'
import { translate } from './write.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const urls = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

const transactional =
	/^\s*(begin|start transaction|commit|rollback|savepoint|release)\b/i

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
	return `${url}${separator}options=${encodeURIComponent(`-c search_path=${schema}`)}`
}

for (const url of urls) {
	let statements = 0
	const create = (): Adapter => {
		const schema = `t_${randomUUID().replaceAll('-', '')}`
		const adapter = createAdapter({
			url: inSchema(url, schema),
			log: (event) => {
				if (!transactional.test(event.query.sql)) statements += 1
			},
		})
		return {
			...adapter,
			start: async (given) => {
				await run(url, `create schema "${schema}"`)
				await adapter.start(given)
			},
			stop: async () => {
				await adapter.stop()
				await run(url, `drop schema "${schema}" cascade`)
			},
		}
	}
	testAdapter(`postgres at ${new URL(url).host}`, create, {
		statements: () => statements,
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

const row = (label: unknown) => ({
	id: randomUUID(),
	createdAt: new Date(),
	updatedAt: new Date(),
	label,
})

describe('postgres()', () => {
	const url = urls[0] ?? ''
	let schema = ''
	beforeEach(async () => {
		schema = `t_${randomUUID().replaceAll('-', '')}`
		await run(url, `create schema "${schema}"`)
	})
	afterEach(async () => run(url, `drop schema "${schema}" cascade`))

	it('refuses a database that already holds its tables', async () => {
		const first = postgres({ url: inSchema(url, schema) })
		await first.start(thing)
		await first.stop()
		await expect(
			postgres({ url: inSchema(url, schema) }).start(thing),
		).rejects.toThrow('The database already holds thing')
	})

	it('refuses to run before it starts', async () => {
		await expect(
			postgres({ url: inSchema(url, schema) }).find({ model: 'Thing' }),
		).rejects.toThrow('postgres() is not started.')
	})

	it('names a long constraint by its hash, and reports what it refuses', async () => {
		const adapter = postgres({ url: inSchema(url, schema) })
		await adapter.start(thing)
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

	it('passes on a unique refusal it does not know', () => {
		const error = { code: '23505', constraint: 'elsewhere_key' }
		expect(translate(catalog, error)).toBe(error)
	})

	it('refuses a server below PostgreSQL 15', () => {
		expect(() => requireVersion('140010')).toThrow('PostgreSQL 15 or later')
		expect(() => requireVersion('150000')).not.toThrow()
	})
})
