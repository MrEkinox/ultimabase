// A count alone reads no row (D-226): a connection selecting `totalCount`
// without `edges` nor `pageInfo`, or asking for 0 rows, reads its count and
// no row, at the root, in a relation and in a function's page.
import { afterEach, describe, expect, it } from 'vitest'
import type { Adapter, Read } from 'ultimabase'
import { allow, defineFunction, defineModel, memory } from 'ultimabase'
import { graphql } from './index.ts'
import { M, Post, post, Secret, seeded, started, User } from './test/app.ts'

/** A memory database that keeps each read it is asked. */
function recorded(): { readonly database: Adapter; readonly reads: Read[] } {
	const reads: Read[] = []
	const database = memory()
	const find = database.find.bind(database)
	database.find = async (read) => {
		reads.push(read)
		return find(read)
	}
	return { database, reads }
}

/** The relations each read reads rows of, at any depth. */
const included = (reads: readonly Read[]): readonly string[] =>
	reads.flatMap((read) => Object.keys(read.include ?? {}))

const paged = defineFunction({
	name: 'paged',
	query: true,
	output: Post.paginated(),
	run: () => Post.paginate({ orderBy: { title: 'asc' } }, M),
}).with({ access: allow.public })

/** A shelf whose books no one but Master reads. */
const Shelf = defineModel({
	name: 'Shelf',
	use: [graphql()],
	fields: (f) => ({
		name: f.string(),
		books: f
			.many(() => Book, { inverse: 'shelf' })
			.with({ access: { read: () => false } }),
	}),
}).with({ access: allow.readOnly })
const Book = defineModel({
	name: 'Book',
	use: [graphql()],
	fields: (f) => ({ title: f.string(), shelf: f.one(() => Shelf) }),
}).with({ access: allow.readOnly })

/** A page of no row, `first: 0`, over `totalCount` rows. */
const page = (totalCount: number) => ({
	totalCount,
	edges: [],
	pageInfo: {
		hasNextPage: true,
		hasPreviousPage: false,
		startCursor: null,
		endCursor: null,
	},
})

let stop: (() => Promise<void>) | undefined
afterEach(async () => stop?.())

async function serving(): Promise<{ url: string; reads: Read[] }> {
	const { database, reads } = recorded()
	const models = [User, Post, Secret, Shelf, Book]
	const running = await started({}, database, [], [paged], models)
	stop = async () => running.app.stop()
	await seeded()
	const shelf = await Shelf.create({ data: { name: 'top' } }, M)
	await Book.create(
		{ data: { title: 'b', shelf: { connect: { id: shelf.id } } } },
		M,
	)
	reads.length = 0
	return { url: `${running.url}/graphql`, reads }
}

describe('a count alone (D-226)', () => {
	it('reads no row of a relation', async () => {
		const { url, reads } = await serving()
		const read = await post(
			url,
			`{ users(orderBy: [{ name: asc }]) { edges { node { posts { totalCount } } } } }`,
		)
		expect(read).toStrictEqual({
			data: {
				users: {
					edges: [
						{ node: { posts: { totalCount: 3 } } },
						{ node: { posts: { totalCount: 1 } } },
					],
				},
			},
		})
		expect(included(reads)).toStrictEqual([])
	})

	it('reads no row for first: 0, and says whether rows follow', async () => {
		const { url, reads } = await serving()
		const read = await post(
			url,
			`{ users(orderBy: [{ name: asc }]) { edges { node { posts(first: 0) {
				totalCount edges { cursor } pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
			} } } } }`,
		)
		expect(read).toStrictEqual({
			data: {
				users: {
					edges: [{ node: { posts: page(3) } }, { node: { posts: page(1) } }],
				},
			},
		})
		expect(included(reads)).toStrictEqual([])
	})

	it('reads no row at the root', async () => {
		const { url, reads } = await serving()
		expect(await post(url, '{ posts { totalCount } }')).toStrictEqual({
			data: { posts: { totalCount: 4 } },
		})
		const last = await post(
			url,
			'{ posts(last: 0) { totalCount pageInfo { hasNextPage hasPreviousPage } } }',
		)
		expect(last).toStrictEqual({
			data: {
				posts: {
					totalCount: 4,
					pageInfo: { hasNextPage: false, hasPreviousPage: true },
				},
			},
		})
		expect(reads).toStrictEqual([])
	})

	it("reads no row of a function's page", async () => {
		const { url, reads } = await serving()
		expect(await post(url, '{ paged { totalCount } }')).toStrictEqual({
			data: { paged: { totalCount: 4 } },
		})
		expect(reads).toStrictEqual([])
	})

	it('reads a row after a cursor, and none past an empty count', async () => {
		const { url, reads } = await serving()
		const first = await post(url, '{ posts(first: 1) { edges { cursor } } }')
		const edges: unknown = Reflect.get(
			Object(Reflect.get(Object(first.data), 'posts')),
			'edges',
		)
		const edge: unknown = Array.isArray(edges) ? edges[0] : undefined
		const cursor: unknown = Reflect.get(Object(edge), 'cursor')
		reads.length = 0
		const after = await post(
			url,
			'query ($after: String) { posts(first: 0, after: $after) { totalCount pageInfo { hasNextPage } } }',
			{ after: cursor },
		)
		expect(after).toStrictEqual({
			data: { posts: { totalCount: 4, pageInfo: { hasNextPage: true } } },
		})
		expect(reads.map((each) => each.take)).toStrictEqual([1])
		const none = await post(
			url,
			'{ posts(first: 0, where: { title: { equals: "none" } }) { totalCount pageInfo { hasNextPage } } }',
		)
		expect(none).toStrictEqual({
			data: { posts: { totalCount: 0, pageInfo: { hasNextPage: false } } },
		})
	})

	it('answers null for a relation its rule hides', async () => {
		const { url } = await serving()
		expect(
			await post(url, '{ shelfs { edges { node { books { totalCount } } } } }'),
		).toMatchObject({
			data: { shelfs: { edges: [{ node: { books: null } }] } },
		})
	})
})
