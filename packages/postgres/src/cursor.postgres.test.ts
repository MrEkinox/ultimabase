// A read from a cursor on postgres() (D-289): a bound on its first sort keys
// lets an index start at the cursor's row, and the pages stay those of the whole
// list, with `null`s, ties, each kind of key, backwards, nested, and when the
// cursor's row is gone or outside the filter.
import { testApplication } from '@ultimabase/testing'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import type { Filter, Order } from 'ultimabase'
import { defineApp, defineModel, master } from 'ultimabase'
import { storedRows } from 'ultimabase/internal'
import { beforeEach, describe, expect, it } from 'vitest'
import { createAdapter } from './adapter.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const urls = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

const M = { as: master }

const Shelf = defineModel({
	name: 'Shelf',
	fields: (f) => ({
		name: f.string(),
		items: f.many(() => Item, { inverse: 'shelf' }),
	}),
})

const Item = defineModel({
	name: 'Item',
	fields: (f) => ({
		rank: f.number({ integer: true }),
		state: f.string(),
		price: f.decimal({ precision: 10, scale: 2 }),
		at: f.dateTime(),
		on: f.boolean(),
		kind: f.enumOf(['open', 'Closed', 'done']),
		note: f.string({ optional: true }),
		shelf: f.one(() => Shelf),
	}),
	indexes: [{ fields: ['rank'] }, { fields: ['state', 'rank', 'id'] }],
})

const asc = (field: string): Order => ({ field, direction: 'asc' })
const desc = (field: string): Order => ({ field, direction: 'desc' })
const id = asc('id')
const count = 400

const ids = (rows: readonly Record<string, unknown>[]) =>
	rows.map((row) => row['id'])
const identified = (values: readonly unknown[]) =>
	values.map((each) => ({ id: each }))

/** Every way the bound is built, or left out, with the rest of the keys. */
const orders: Record<string, readonly Order[]> = {
	'the id alone': [id],
	'the id, descending': [desc('id')],
	'an integer': [asc('rank'), id],
	'an integer, descending': [desc('rank'), desc('id')],
	'an integer against the id': [desc('rank'), id],
	'three keys one way': [asc('state'), asc('rank'), id],
	'keys that turn': [asc('state'), desc('rank'), id],
	'a decimal': [asc('price'), id],
	'a date': [desc('at'), id],
	'a boolean': [asc('on'), id],
	'an enum': [asc('kind'), id],
	'the kernel date': [desc('createdAt'), id],
	'an optional key': [asc('note'), id],
	'an optional key, descending': [desc('note'), id],
	'an optional key, nulls first': [
		{ field: 'note', direction: 'asc', nulls: 'first' },
		id,
	],
	'an optional key after a filled one': [asc('rank'), asc('note'), id],
}

const filters: Record<string, { where?: Filter }> = {
	'every row': {},
	'a filter': { where: { state: { equals: 's1' } } },
}

describe.each(urls)('a cursor on %s', (server) => {
	/** The statements the adapter sent, with their parameters. */
	const sent: { sql: string; parameters: readonly unknown[] }[] = []
	const database = createAdapter({
		url: server,
		log: (event) => sent.push(event.query),
	})
	testApplication(defineApp({ database, models: [Shelf, Item] }), {
		database: 'declared',
	})

	let shelves: readonly [string, string]

	beforeEach(async () => {
		const { id: first } = await Shelf.create({ data: { name: 'A' } }, M)
		const { id: second } = await Shelf.create({ data: { name: 'B' } }, M)
		shelves = [first, second]
		const kinds = ['open', 'Closed', 'done'] as const
		await Item.createMany(
			{
				data: Array.from({ length: count }, (_, at) => ({
					rank: (at * 37) % 40,
					state: `s${at % 3}`,
					price: `${(at * 11) % 50}.25`,
					at: new Date(1_700_000_000_000 + ((at * 13) % 60) * 1000),
					on: at % 2 === 0,
					kind: kinds[at % 3] ?? 'open',
					...(at % 7 === 0 ? {} : { note: `n${at % 20}` }),
					shelf: { connect: { id: at % 2 === 0 ? first : second } },
				})),
			},
			M,
		)
	})

	describe.each(Object.entries(filters))('over %s', (_, filter) => {
		it.each(Object.entries(orders))(
			'pages through %s, forwards and backwards',
			async (_name, orderBy) => {
				const whole = ids(await storedRows('Item', { ...filter, orderBy }))
				expect(whole.length).toBeGreaterThan(100)
				const forwards = [whole[0]]
				while (forwards.length < whole.length + 1) {
					const page = await storedRows('Item', {
						...filter,
						orderBy,
						cursor: { id: { equals: forwards.at(-1) } },
						skip: 1,
						take: 37,
					})
					if (page.length === 0) break
					forwards.push(...ids(page))
				}
				expect(forwards).toEqual(whole)
				const backwards = [whole.at(-1)]
				while (backwards.length < whole.length + 1) {
					const page = await storedRows('Item', {
						...filter,
						orderBy,
						cursor: { id: { equals: backwards[0] } },
						skip: 1,
						take: -37,
					})
					if (page.length === 0) break
					backwards.unshift(...ids(page))
				}
				expect(backwards).toEqual(whole)
			},
		)
	})

	it.each(Object.entries(orders))(
		'reads nothing from a row that is gone, over %s',
		async (_name, orderBy) => {
			const rows = await storedRows('Item', {
				orderBy,
				cursor: { id: { equals: randomUUID() } },
				take: 5,
			})
			expect(rows).toEqual([])
		},
	)

	it('starts at a row outside the filter, in its place', async () => {
		const orderBy = [asc('rank'), id]
		const whole = await storedRows('Item', { orderBy })
		const outside = whole[200]
		expect(outside?.['state']).not.toBe('s1')
		const where: Filter = { state: { equals: 's1' } }
		const rows = await storedRows('Item', {
			where,
			orderBy,
			cursor: { id: { equals: outside?.['id'] } },
			take: 10,
		})
		const expected = whole.slice(200).filter((row) => row['state'] === 's1')
		expect(ids(rows)).toEqual(ids(expected).slice(0, 10))
	})

	it('pages within each row of a nested list', async () => {
		const orderBy = [asc('rank'), id]
		const [first, second] = shelves
		const list = async (shelf: string) =>
			ids(
				await storedRows('Item', {
					where: { shelf: { equals: shelf } },
					orderBy,
				}),
			)
		const [one, two] = [await list(first), await list(second)]
		const page = await storedRows('Shelf', {
			where: { id: { equals: first } },
			include: {
				items: {
					orderBy,
					cursor: { id: { equals: one[20] } },
					skip: 1,
					take: 5,
				},
			},
		})
		expect(page).toMatchObject([{ items: identified(one.slice(21, 26)) }])
		// A cursor from the other shelf gives its place, among this shelf's rows.
		const last = one.at(-1)
		const whole = ids(await storedRows('Item', { orderBy }))
		const after = whole.slice(whole.indexOf(last))
		const across = await storedRows('Shelf', {
			where: { id: { equals: second } },
			include: { items: { orderBy, cursor: { id: { equals: last } } } },
		})
		const kept = after.filter((each) => two.includes(each))
		expect(kept.length).toBeGreaterThan(0)
		expect(across).toMatchObject([{ items: identified(kept) }])
	})

	/** The plan of the read `run` sends, when only an index can sort it. */
	async function plan(run: () => Promise<unknown>): Promise<string> {
		sent.length = 0
		await run()
		const read = sent.at(-1)
		if (read === undefined) throw new Error('No statement was sent.')
		const [{ path } = { path: '' }] = await database.sql<{
			path: string
		}>`select current_setting('search_path') as path`
		const options = encodeURIComponent(`-c search_path=${path}`)
		const client = new Client({
			connectionString: `${server}${server.includes('?') ? '&' : '?'}options=${options}`,
		})
		await client.connect()
		try {
			for (const off of ['seqscan', 'bitmapscan', 'sort']) {
				await client.query(`set enable_${off} = off`)
			}
			await client.query('analyze')
			const { rows } = await client.query<{ 'QUERY PLAN': string }>(
				`explain ${read.sql}`,
				[...read.parameters],
			)
			return rows.map((row) => row['QUERY PLAN']).join('\n')
		} finally {
			await client.end()
		}
	}

	const middle = async (orderBy: readonly Order[]) => {
		const [row] = await storedRows('Item', { orderBy, skip: 200, take: 1 })
		return plan(() =>
			storedRows('Item', {
				orderBy,
				cursor: { id: { equals: row?.['id'] } },
				skip: 1,
				take: 10,
			}),
		)
	}

	it.each([
		['the id', [id], />=/u],
		['the id, descending', [desc('id')], /<=/u],
		['a key and the id', [asc('rank'), id], />=/u],
		['every key of an index', [asc('state'), asc('rank'), id], />=/u],
		['keys that turn', [desc('rank'), id], /<=/u],
	])('starts the index walk at the cursor, by %s', async (_name, by, sign) => {
		const walk = (await middle(by)).split('\n').find((line) => {
			return line.includes('Index Cond') && sign.test(line)
		})
		expect(walk).toBeDefined()
	})

	it('leaves an optional first key to the filter', async () => {
		const shown = await middle([asc('note'), id])
		expect(shown).not.toMatch(/Index Cond: .*[<>]=/u)
	})
})
