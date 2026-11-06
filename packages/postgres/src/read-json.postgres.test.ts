// A read builds its rows as `json` (D-285): the aggregate takes them in the
// order its subquery sorted them, under parallel plans too, and a row wider than
// one call to `json_build_object` takes keeps every field.
import { testApplication } from '@ultimabase/testing'
import { defineApp, defineModel, master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { createAdapter } from './adapter.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const urls = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

const M = { as: master }

/** Every plan that may run in parallel does, on the smallest table. */
const parallel = [
	'max_parallel_workers_per_gather=4',
	'parallel_setup_cost=0',
	'parallel_tuple_cost=0',
	'min_parallel_table_scan_size=0',
	'min_parallel_index_scan_size=0',
]
	.map((setting) => `-c ${setting}`)
	.join(' ')

const Shelf = defineModel({
	name: 'Shelf',
	fields: (f) => ({
		name: f.string(),
		books: f.many(() => Book, { inverse: 'shelf' }),
	}),
})

const Book = defineModel({
	name: 'Book',
	fields: (f) => ({
		rank: f.number({ integer: true }),
		price: f.decimal({ precision: 6, scale: 2 }),
		shelf: f.one(() => Shelf),
	}),
})

const count = 6000
const ranks = Array.from({ length: count }, (_, at) => at)

describe.each(urls)('a read as json on %s', (server) => {
	const database = createAdapter({
		url: `${server}?options=${encodeURIComponent(parallel)}`,
	})
	testApplication(defineApp({ database, models: [Shelf, Book] }), {
		database: 'declared',
	})

	/** Each rank once, in no order an index or the heap would keep. */
	async function seeded(): Promise<string> {
		const { id } = await Shelf.create({ data: { name: 'S' } }, M)
		await database.sql`
			insert into book (id, created_at, updated_at, rank, price, shelf_id)
			select gen_random_uuid(), now(), now(), (at * 4001) % ${count}, 1.50, ${id}
			from generate_series(0, ${count - 1}) as at`
		await database.sql`analyze book`
		return id
	}

	it('keeps the order of a list under a parallel plan', async () => {
		const shelf = await seeded()
		const plan = await database.sql<{ 'QUERY PLAN': string }>`
			explain select coalesce(json_agg("q"."r"), cast('[]' as json))
			from (select json_build_object('rank', rank) as "r" from book
				order by rank limit 6000) as "q"`
		expect(plan.map((line) => line['QUERY PLAN']).join('\n')).toContain(
			'Gather Merge',
		)
		const forward = await Book.findMany(
			{ orderBy: { rank: 'asc' }, select: { rank: true } },
			M,
		)
		expect(forward.map(({ rank }) => rank)).toStrictEqual(ranks)
		const nested = await Shelf.findUnique(
			{
				where: { id: shelf },
				select: {
					books: { orderBy: { rank: 'desc' }, select: { rank: true } },
				},
			},
			M,
		)
		expect(nested?.books.map(({ rank }) => rank)).toStrictEqual(
			ranks.toReversed(),
		)
	})

	it('keeps the order of a list read backwards', async () => {
		await seeded()
		const last = await Book.findMany(
			{ orderBy: { rank: 'asc' }, take: -3, select: { rank: true } },
			M,
		)
		expect(last.map(({ rank }) => rank)).toStrictEqual([
			count - 3,
			count - 2,
			count - 1,
		])
	})

	it('reads a decimal as it was written', async () => {
		await seeded()
		const book = await Book.findFirst({ select: { price: true } }, M)
		expect(book?.price).toBe('1.50')
	})
})

const Wide = defineModel({
	name: 'Wide',
	fields: (f) => ({
		...Object.fromEntries(
			Array.from({ length: 60 }, (_, at) => [
				`field${String(at)}`,
				f.number({ integer: true, default: at }),
			]),
		),
		name: f.string(),
	}),
})

describe.each(urls)('a row wider than one call on %s', (server) => {
	testApplication(
		defineApp({ database: createAdapter({ url: server }), models: [Wide] }),
		{ database: 'declared' },
	)

	it('keeps every field', async () => {
		await Wide.create({ data: { name: 'W' } }, M)
		const [row] = await Wide.findMany({}, M)
		expect(row).toMatchObject({ name: 'W', field0: 0, field59: 59 })
		expect(Object.keys(row ?? {}).length).toBeGreaterThan(60)
	})
})
