// The contract on PostgreSQL (D-98): each test in its own schema, on every
// server `TEST_DATABASE_URL` lists.
import { randomUUID } from 'node:crypto'
import { testAdapter } from '@ultimabase/testing'
import { Client } from 'pg'
import type { Adapter, Schema } from 'ultimabase'
import { CheckFailed, UniqueViolation } from 'ultimabase'
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
		await adapter.start(shelved)
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

	it('splits a write that changes a table twice, in one transaction', async () => {
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
					model: 'Book',
					field: 'tags',
					id: book.id,
					targets: [second.id],
				},
			],
			read: tags(book.id),
		})
		expect(found?.['tags']).toMatchObject([{ id: second.id }])
		expect(sent.map((statement) => statement.split(' ')[0])).toEqual([
			'begin',
			'with',
			'with',
			'commit',
		])
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

	it('locks the rows it reads', async () => {
		const tx = await adapter.begin()
		const [found] = await tx.find({ ...tags(book.id), lock: true })
		await tx.commit()
		expect(found?.['id']).toBe(book.id)
		expect(sent[1]).toContain('for update')
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
