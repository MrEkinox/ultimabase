// A count alone reads no row (D-226): `first: 0` or `last: 0` with
// `totalCount: true` and no cursor reads the count and no row, at the root,
// in an `include` and in a function's page.
import { afterEach, describe, expect, it } from 'vitest'
import type { Adapter, Read } from 'ultimabase'
import { allow, defineFunction, defineModel, memory } from 'ultimabase'
import { rest } from './index.ts'
import type { Sent } from './test/app.ts'
import {
	call,
	M,
	Post,
	qs,
	Secret,
	seeded,
	started,
	Tag,
	User,
} from './test/app.ts'

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

/** The relations each read reads rows of. */
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
	use: [rest()],
	fields: (f) => ({
		name: f.string(),
		books: f.many(() => Book).with({ access: { read: () => false } }),
	}),
}).with({ access: allow.readOnly })
const Book = defineModel({
	name: 'Book',
	use: [rest()],
	fields: (f) => ({ title: f.string(), shelf: f.one(() => Shelf) }),
}).with({ access: allow.readOnly })

let stop: (() => Promise<void>) | undefined
afterEach(async () => stop?.())

type Get = (path: string, params: object) => Promise<Sent>

async function serving(): Promise<{ get: Get; reads: Read[] }> {
	const { database, reads } = recorded()
	const models = [User, Post, Tag, Secret, Shelf, Book]
	const running = await started({}, database, [paged], models)
	stop = async () => running.app.stop()
	await seeded()
	const shelf = await Shelf.create({ data: { name: 'top' } }, M)
	const data = { title: 'b', shelf: { connect: { id: shelf.id } } }
	await Book.create({ data }, M)
	reads.length = 0
	const get: Get = async (path, params) =>
		call(running.url, 'GET', `/api/${path}${qs({ ...params })}`)
	return { get, reads }
}

const counted = (totalCount: number, backward = false) => ({
	edges: [],
	pageInfo: {
		hasNextPage: totalCount > 0 && !backward,
		hasPreviousPage: totalCount > 0 && backward,
		startCursor: null,
		endCursor: null,
	},
	totalCount,
})

describe('a count alone (D-226)', () => {
	it('reads no row of an include', async () => {
		const { get, reads } = await serving()
		const read = await get('users', {
			orderBy: [{ name: 'asc' }],
			include: { posts: { first: 0, totalCount: true } },
		})
		expect(read).toMatchObject({
			status: 200,
			body: {
				edges: [
					{ node: { name: 'ada', posts: counted(3) } },
					{ node: { name: 'bob', posts: counted(1) } },
				],
			},
		})
		expect(included(reads)).toStrictEqual([])
	})

	it('reads no row at the root', async () => {
		const { get, reads } = await serving()
		expect(await get('posts', { first: 0, totalCount: true })).toStrictEqual({
			status: 200,
			body: counted(4),
		})
		expect(await get('posts', { last: 0, totalCount: true })).toStrictEqual({
			status: 200,
			body: counted(4, true),
		})
		const none = { first: 0, totalCount: true, where: { title: 'none' } }
		expect(await get('posts', none)).toStrictEqual({
			status: 200,
			body: counted(0),
		})
		expect(reads).toStrictEqual([])
	})

	it("reads no row of a function's page", async () => {
		const { get, reads } = await serving()
		const read = await get('functions/paged', { first: 0, totalCount: true })
		expect(read).toStrictEqual({ status: 200, body: counted(4) })
		expect(reads).toStrictEqual([])
	})

	it('answers null for a relation its rule hides', async () => {
		const { get } = await serving()
		const include = { books: { first: 0, totalCount: true } }
		const read = await get('shelfs', { include })
		expect(read).toMatchObject({
			status: 200,
			body: { edges: [{ node: { name: 'top', books: null } }] },
		})
	})
})
