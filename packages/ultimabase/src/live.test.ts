// What the realtime plugin asks the kernel (D-154): the reads a caller's
// construction made, a live read's plan, and that plan tested on a row as
// `memory()` reads it.
import { asUser } from '@ultimabase/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Filter, Row } from './adapter.ts'
import { defineApp, defineModel, master, memory } from './index.ts'
import {
	compareKeys,
	inMemory,
	livePlan,
	matches,
	recording,
	sortKeys,
	storedRows,
} from './internal.ts'

const M = { as: master }
const ada = asUser({ id: 'ada' })

const Author = defineModel({
	name: 'Author',
	fields: (f) => ({ name: f.string(), posts: f.many(() => Post) }),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' || where({ name: { not: 'Hidden' } }),
	},
})
/** A user reads the open posts; `beforeFind` hides the drafts. */
const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		title: f.string(),
		rank: f.number({ integer: true, optional: true }),
		open: f.boolean({ default: true }),
		draft: f.boolean({ default: false }),
		author: f.one(() => Author, { optional: true }),
	}),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' || where({ open: { equals: true } }),
	},
	hooks: {
		beforeFind: ({ caller, where }) =>
			caller.kind === 'master' ? undefined : where({ draft: false }),
	},
})

type Where = NonNullable<Parameters<typeof Post.findMany>[0]>['where']

const first = (rows: readonly Row[]): Row => {
	const [row] = rows
	if (row === undefined) throw new Error('No row.')
	return row
}

let app: ReturnType<typeof defineApp>
beforeEach(async () => {
	app = defineApp({ database: memory(), models: [Author, Post] })
	await app.start()
})
afterEach(async () => app.stop())

const seeded = async () => {
	const author = await Author.create({ data: { name: 'Ada' } }, M)
	const titles = ['b', 'a', 'c', 'B', 'é']
	for (const [at, title] of titles.entries()) {
		await Post.create(
			{
				data: {
					title,
					...(at % 2 === 0 ? { rank: at } : {}),
					author: { connect: { id: author.id } },
				},
			},
			M,
		)
	}
	return author
}

describe('recording', () => {
	it('keeps what each read reached, its relations included', async () => {
		const author = await seeded()
		const { result, reads } = await recording(async () =>
			Post.findMany(
				{ where: { title: { equals: 'a' } }, include: { author: true } },
				M,
			),
		)
		expect(result).toHaveLength(1)
		expect(reads).toEqual([
			{
				model: 'Post',
				where: { title: { equals: 'a' } },
				ids: [result[0]?.id],
			},
			{ model: 'Author', ids: [author.id], relation: 'Post.author' },
		])
	})

	it('keeps a count, its sorts through relations and nested includes', async () => {
		await seeded()
		const { reads } = await recording(async () => {
			await Post.count({ where: { open: { equals: true } } }, M)
			await Author.findMany(
				{
					orderBy: { posts: { _count: 'desc' } },
					include: {
						_count: { select: { posts: true } },
						posts: {
							where: { rank: { gt: 0 } },
							orderBy: { author: { name: 'asc' } },
							include: { author: true },
						},
					},
				},
				M,
			)
		})
		expect(reads.map(({ model, relation }) => [model, relation])).toEqual([
			['Post', undefined],
			['Author', undefined],
			['Post', 'Author.posts'],
			['Post', 'Author.posts'],
			['Post', 'Author.posts'],
			['Author', 'Post.author'],
			['Author', 'Post.author'],
		])
		expect(reads[0]).toEqual({
			model: 'Post',
			where: { open: { equals: true } },
		})
		expect(reads[4]?.ids).toHaveLength(2)
	})

	it('keeps the read rule of a relation it sorts or groups by', async () => {
		await seeded()
		await Post.create({ data: { title: 'alone' } }, { as: master })
		const { reads } = await recording(async () => {
			await Post.findMany(
				{ orderBy: { author: { name: 'asc' } }, include: { author: true } },
				{ as: ada },
			)
			await Post.groupBy({ by: ['author'], _count: true }, { as: ada })
		})
		const followed = reads.filter(({ relation }) => relation !== undefined)
		expect(followed.map(({ where }) => where !== undefined)).toEqual([
			true,
			true,
			true,
		])
		expect(followed[1]?.ids).toHaveLength(1)
	})

	it('keeps a beforeFind read and nothing outside a recording', async () => {
		await seeded()
		await Post.findMany({}, M)
		const { reads } = await recording(async () =>
			Post.findMany({}, { as: ada }),
		)
		expect(reads).toHaveLength(1)
		expect(reads[0]?.where).toBeDefined()
		expect(reads[0]?.ids).toHaveLength(5)
	})
})

describe('a live plan', () => {
	it('adds the read rule and every beforeFind, and ends its order with id', async () => {
		await seeded()
		const live = await livePlan(
			'Post',
			{ where: { title: { equals: 'a' } }, orderBy: { rank: 'desc' } },
			ada,
		)
		expect(live.orderBy.map(({ field }) => field)).toEqual(['rank', 'id'])
		const rows = await storedRows(
			'Post',
			(await Post.findMany({}, M)).map(({ id }) => id),
		)
		const open = rows.filter((row) => matches('Post', row, live.where))
		expect(open.map(({ title }) => title)).toEqual(['a'])
		await Post.update(
			{ where: { id: String(open[0]?.['id']) }, data: { draft: true } },
			M,
		)
		const draft = first(await storedRows('Post', [String(open[0]?.['id'])]))
		expect(matches('Post', draft, live.where)).toBe(false)
	})

	it('orders by id alone when no order is given', async () => {
		const live = await livePlan('Post', {}, master)
		expect(live).toEqual({
			where: undefined,
			orderBy: [{ field: 'id', direction: 'asc' }],
		})
	})

	it('refuses what a live read does not take', async () => {
		await expect(livePlan('Post', { take: 2 }, ada)).rejects.toThrow('take')
	})

	it('needs a running application', async () => {
		await app.stop()
		await expect(livePlan('Post', {}, ada)).rejects.toThrow(
			'No application is running.',
		)
		expect(() => matches('Post', { id: 'x' }, undefined)).toThrow(
			'No application is running.',
		)
		await app.start()
	})
})

describe('a filter tested in memory', () => {
	it('takes the conditions on the row alone', () => {
		expect(inMemory('Post', undefined)).toBe(true)
		const own: Filter = { title: { equals: 'a' }, rank: undefined }
		expect(inMemory('Post', own)).toBe(true)
		expect(inMemory('Post', { OR: [own, { NOT: [own] }] })).toBe(true)
		expect(inMemory('Post', { id: { in: ['x'] } })).toBe(true)
		const related: Filter = { author: { is: { name: { equals: 'Ada' } } } }
		expect(inMemory('Post', related)).toBe(false)
		expect(inMemory('Post', { AND: [own, related] })).toBe(false)
		expect(inMemory('Post', { _search: { search: 'a' } })).toBe(false)
	})

	it('agrees with findMany, nulls included', async () => {
		await seeded()
		const filters: Where[] = [
			{ rank: { gt: 0 } },
			{ rank: { equals: null } },
			{ NOT: { rank: { gt: 1 } } },
			{ title: { contains: 'b', mode: 'insensitive' } },
			{ OR: [{ rank: { in: [0, 4] } }, { title: { startsWith: 'B' } }] },
		]
		const all = await Post.findMany({}, M)
		const rows = await storedRows(
			'Post',
			all.map(({ id }) => id),
		)
		for (const where of filters) {
			const found = await Post.findMany({ where }, M)
			const live = await livePlan('Post', { where }, master)
			const kept = rows.filter((row) => matches('Post', row, live.where))
			expect(kept.map(({ id }) => id)).toEqual(found.map(({ id }) => id))
		}
	})
})

type Ordered = NonNullable<
	NonNullable<Parameters<typeof Post.findMany>[0]>['orderBy']
>

/** The ids findMany finds by `orderBy`, then stored rows sorted by their keys. */
async function bothOrders(orderBy: Ordered): Promise<unknown[][]> {
	const live = await livePlan('Post', { orderBy }, master)
	const found = await Post.findMany({ orderBy }, M)
	const ids = found.map(({ id }) => id)
	const rows = (await storedRows('Post', ids)).toReversed()
	const keyed = rows.map((row) => ({
		id: row.id,
		keys: sortKeys('Post', row, live.orderBy),
	}))
	keyed.sort((a, b) => compareKeys(a.keys, b.keys, live.orderBy))
	return [ids, keyed.map(({ id }) => id)]
}

describe('sort keys', () => {
	it('order stored rows as findMany does', async () => {
		await seeded()
		const orders: Ordered[] = [
			{ title: 'asc' },
			{ rank: 'desc' },
			[{ rank: { sort: 'asc', nulls: 'first' } }, { title: 'desc' }],
		]
		for (const orderBy of orders) {
			const [found, sorted] = await bothOrders(orderBy)
			expect(sorted).toEqual(found)
		}
	})

	it('refuse an order that reads another row', async () => {
		await seeded()
		const live = await livePlan(
			'Post',
			{ orderBy: { author: { name: 'asc' } } },
			master,
		)
		const row = first(
			await storedRows(
				'Post',
				(await Post.findMany({ take: 1 }, M)).map(({ id }) => id),
			),
		)
		expect(() => sortKeys('Post', row, live.orderBy)).toThrow(
			'The order by name reads another row.',
		)
	})
})
