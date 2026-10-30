// Soft delete (D-17, D-89, D-96) on `memory()`: a deleted row leaves every
// read, the trash reads it, `restore` brings it back, each under its rule.
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
	vi,
} from 'vitest'
import { asUser } from '@ultimabase/testing'
import type { Caller } from 'ultimabase'
import { defineApp, defineModel, master, memory } from 'ultimabase'
import { softDelete, softDeletePlugin } from './index.ts'

const M = { as: master }

const user = (id: string) => ({ as: asUser({ id }) })
const isAda = (caller: Caller): boolean =>
	caller.kind === 'user' && caller.user.id === 'ada'

const deleted: string[] = []
const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		title: f.string({ unique: true }),
		comments: f.many(() => Comment),
	}),
	use: [softDelete()],
}).with({
	access: {
		read: () => true,
		create: () => true,
		update: ({ caller }) => isAda(caller),
		delete: ({ caller }) => isAda(caller),
	},
	hooks: {
		afterDeleteCommit: ({ record }) => {
			deleted.push(record.title)
		},
	},
})

const Comment = defineModel({
	name: 'Comment',
	fields: (f) => ({
		text: f.string(),
		post: f.one(() => Post, { onDelete: 'cascade' }),
	}),
})

const app = defineApp({
	database: memory(),
	models: [Post, Comment],
	plugins: [softDeletePlugin()],
})
const titles = async (): Promise<string[]> =>
	(await Post.findMany({}, M)).map((post) => post.title)
const trashed = async (): Promise<string[]> =>
	(await Post.trash.findMany({}, M)).map((post) => post.title)

let id: string
beforeEach(async () => {
	deleted.length = 0
	await app.start()
	id = (await Post.create({ data: { title: 'Draft' } }, M)).id
	await Post.create({ data: { title: 'Kept' } }, M)
})
afterEach(async () => {
	vi.restoreAllMocks()
	await app.stop()
})

describe('a deleted row', () => {
	it('leaves every read, Master included, and goes to the trash', async () => {
		const at = Date.now() + 60_000
		vi.spyOn(Date, 'now').mockReturnValue(at)
		const post = await Post.delete({ where: { id } }, user('ada'))
		expect(post).toMatchObject({ title: 'Draft', deletedAt: new Date(at) })
		expect(await titles()).toEqual(['Kept'])
		expect(await Post.findUnique({ where: { id } }, M)).toBeNull()
		expect(await Post.count({}, M)).toBe(1)
		expect(await trashed()).toEqual(['Draft'])
		expect(await Post.trash.findUnique({ where: { id } }, M)).toMatchObject({
			title: 'Draft',
		})
		expect(await Post.trash.findFirst({}, user('grace'))).toMatchObject({
			title: 'Draft',
		})
		expect(await Post.trash.count({}, M)).toBe(1)
		// The application's hooks still see a delete.
		expect(deleted).toEqual(['Draft'])
	})

	it('needs the delete rule', async () => {
		await expect(
			Post.delete({ where: { id } }, user('grace')),
		).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
		expect(await titles()).toEqual(['Draft', 'Kept'])
	})

	it('keeps its comments, since it stays', async () => {
		const post = { connect: { id } }
		await Comment.create({ data: { text: 'Nice', post } }, M)
		// The row as the redirect left it, its relations included (D-135).
		const removed = await Post.delete(
			{ where: { id }, include: { comments: true } },
			M,
		)
		expect(removed.deletedAt).not.toBeNull()
		expect(removed.comments).toMatchObject([{ text: 'Nice' }])
		expect(await Comment.count({}, M)).toBe(1)
	})

	it('reads null through a required relation, Master included (D-159)', async () => {
		const post = { connect: { id } }
		await Comment.create({ data: { text: 'Nice', post } }, M)
		await Post.delete({ where: { id } }, M)
		const comments = await Comment.findMany(
			{ select: { text: true, post: { select: { title: true } } } },
			M,
		)
		expectTypeOf(comments).toEqualTypeOf<
			{
				readonly text: string
				readonly post: { readonly title: string } | null
			}[]
		>()
		expect(comments).toEqual([{ text: 'Nice', post: null }])
	})

	it('keeps its unique values', async () => {
		await Post.delete({ where: { id } }, M)
		await expect(
			Post.create({ data: { title: 'Draft' } }, M),
		).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' })
	})
})

describe('restore', () => {
	it('brings a deleted row back under the update rule', async () => {
		await Post.delete({ where: { id } }, M)
		await expect(
			Post.restore({ where: { id } }, user('grace')),
		).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
		const post = await Post.restore({ where: { id } }, user('ada'))
		expect(post).toMatchObject({ title: 'Draft', deletedAt: null })
		expectTypeOf(post.deletedAt).toEqualTypeOf<Date | null>()
		expect(await titles()).toEqual(['Draft', 'Kept'])
		expect(await trashed()).toEqual([])
	})

	it('finds no row that is not deleted', async () => {
		await expect(Post.restore({ where: { id } }, M)).rejects.toMatchObject({
			code: 'NOT_FOUND',
		})
	})
})

describe('deletedAt', () => {
	it('is written by Master only, so a caller deletes through the rule', async () => {
		const at = new Date()
		await expect(
			Post.create({ data: { title: 'New', deletedAt: at } }, user('ada')),
		).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
		await expect(
			Post.update({ where: { id }, data: { deletedAt: at } }, user('ada')),
		).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
		expect(await titles()).toEqual(['Draft', 'Kept'])
	})
})
