// A `beforeFind`'s `operation` (D-124): the rows a write targets are its
// update or delete, every other row a read.
import { asUser } from '@ultimabase/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FindOperation } from './index.ts'
import { defineApp, defineModel, master, memory } from './index.ts'

const M = { as: master }
const ada = { as: asUser({ id: 'ada' }) }
const seen: FindOperation[] = []

const allowed = { read: () => true, create: () => true, update: () => true }
const Author = defineModel({
	name: 'Author',
	fields: (f) => ({ name: f.string(), posts: f.many(() => Post) }),
}).with({ access: allowed })
const Tag = defineModel({
	name: 'Tag',
	fields: (f) => ({ label: f.string(), posts: f.many(() => Post) }),
}).with({ access: allowed })
/** A locked post is read, never written. */
const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		title: f.string(),
		locked: f.boolean({ default: false }),
		author: f.one(() => Author, { optional: true }),
		tags: f.many(() => Tag),
	}),
}).with({
	access: { ...allowed, delete: () => true },
	hooks: {
		beforeFind: ({ operation, where }) => {
			seen.push(operation)
			return operation === 'read' ? undefined : where({ locked: false })
		},
	},
})

const posts = async () => {
	const open = await Post.create({ data: { title: 'open' } }, M)
	const locked = await Post.create(
		{ data: { title: 'locked', locked: true } },
		M,
	)
	seen.length = 0
	return { open, locked }
}

describe("a beforeFind's operation", () => {
	let app: ReturnType<typeof defineApp>
	beforeEach(async () => {
		app = defineApp({ database: memory(), models: [Author, Tag, Post] })
		await app.start()
	})
	afterEach(async () => app.stop())

	it('is read for every read', async () => {
		const { locked } = await posts()
		await Post.findMany({}, ada)
		await Post.count({}, ada)
		await Author.findMany({ include: { posts: true } }, ada)
		expect(await Post.findUnique({ where: { id: locked.id } }, ada)).toEqual(
			locked,
		)
		expect(new Set(seen)).toEqual(new Set(['read']))
	})

	it('is update or delete for the rows a write targets', async () => {
		const { open, locked } = await posts()
		for (const as of [ada, M]) {
			await expect(
				Post.update({ where: { id: locked.id }, data: { title: 'x' } }, as),
			).rejects.toMatchObject({ code: 'NOT_FOUND' })
			await expect(
				Post.delete({ where: { id: locked.id } }, as),
			).rejects.toMatchObject({ code: 'NOT_FOUND' })
		}
		expect(seen).toContain('update')
		expect(seen).toContain('delete')
		const updated = await Post.update(
			{ where: { id: open.id }, data: { title: 'y' } },
			ada,
		)
		expect(updated.title).toBe('y')
		expect(await Post.deleteMany({}, ada)).toEqual({ count: 1 })
		expect(await Post.count({}, M)).toBe(1)
	})

	it('is update for a key written from the other side, read for a link', async () => {
		const { open, locked } = await posts()
		const author = await Author.create({ data: { name: 'Ada' } }, M)
		const connect = (id: string) =>
			Author.update(
				{ where: { id: author.id }, data: { posts: { connect: [{ id }] } } },
				ada,
			)
		await expect(connect(locked.id)).rejects.toMatchObject({
			code: 'NOT_FOUND',
			message: 'A connected Post does not exist.',
		})
		await expect(
			Post.create(
				{ data: { title: 'new', author: { connect: { id: author.id } } } },
				ada,
			),
		).resolves.toMatchObject({ title: 'new' })
		await connect(open.id)
		expect(seen).toContain('update')
		const moved = await Author.findUnique(
			{ where: { id: author.id }, include: { posts: true } },
			M,
		)
		expect(moved?.posts.map(({ title }) => title).toSorted()).toEqual([
			'new',
			'open',
		])
		const tag = await Tag.create(
			{ data: { label: 'news', posts: { connect: [{ id: locked.id }] } } },
			ada,
		)
		const linked = await Tag.findUnique(
			{ where: { id: tag.id }, include: { posts: true } },
			M,
		)
		expect(linked?.posts.map(({ title }) => title)).toEqual(['locked'])
	})
})
