// The deepest filter (D-228): 32 levels, each `AND`, `OR`, `NOT` and
// relation filter one deeper; past it, a filter is refused before the stack
// runs out, for every caller.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { defineApp, defineModel, master, memory } from './index.ts'
import { maxFilterDepth } from './internal.ts'

const M = { as: master }

const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		title: f.string(),
		score: f.number(),
		author: f.one(() => Author, { optional: true }),
	}),
})
const Author = defineModel({
	name: 'Author',
	fields: (f) => ({
		name: f.string(),
		posts: f.many(() => Post, { inverse: 'author' }),
	}),
})

type Where = NonNullable<
	NonNullable<Parameters<typeof Post.findMany>[0]>['where']
>

/** A filter `levels` deep, its `NOT`s around one title. */
function nots(levels: number): Where {
	let where: Where = { title: 'a' }
	for (let level = 1; level < levels; level += 1) where = { NOT: where }
	return where
}

/** `title` under `pairs` author-and-posts filters, two levels each. */
function related(pairs: number): Where {
	let where: Where = { title: 'b' }
	for (let pair = 0; pair < pairs; pair += 1) {
		where = { author: { is: { posts: { some: where } } } }
	}
	return where
}

const deeper = (levels: number) =>
	`${['where', ...Array.from({ length: levels - 1 }, () => 'NOT')].join('.')}: the filter is nested more than 32 levels deep.`

let app: ReturnType<typeof defineApp> | undefined
beforeAll(async () => {
	app = defineApp({ database: memory(), models: [Post, Author] })
	await app.start()
	await Post.create({ data: { title: 'b', score: 1 } }, M)
})
afterAll(async () => app?.stop())

describe('a filter', () => {
	it('nests 32 levels', async () => {
		expect(maxFilterDepth).toBe(32)
		const rows = await Post.findMany({ where: nots(32) }, M)
		expect(rows.map(({ title }) => title)).toStrictEqual(['b'])
	})

	it('is refused one level deeper, at that level', async () => {
		await expect(Post.findMany({ where: nots(33) }, M)).rejects.toMatchObject({
			message: deeper(33),
			path: deeper(33).split(':')[0],
		})
	})

	it('is refused, not overflowing the stack, thousands of levels deep', async () => {
		await expect(
			Post.findMany({ where: nots(20_000) }, M),
		).rejects.toMatchObject({ message: deeper(33) })
	})

	it('counts AND items and relation filters as levels', async () => {
		const deepest: Where = { AND: [related(15)] }
		await expect(Post.findMany({ where: deepest }, M)).resolves.toStrictEqual(
			[],
		)
		await expect(Post.findMany({ where: related(16) }, M)).rejects.toThrow(
			'the filter is nested more than 32 levels deep.',
		)
	})
})

describe('a having', () => {
	it('is refused past 32 levels', async () => {
		let having: { [key: string]: unknown } = { score: { _sum: { gt: 0 } } }
		for (let level = 1; level < 33; level += 1) having = { NOT: having }
		await expect(
			Post.groupBy({ by: ['title'], having }, M),
		).rejects.toMatchObject({
			path: ['having', ...Array.from({ length: 32 }, () => 'NOT')].join('.'),
		})
	})
})
