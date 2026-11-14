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
import { z } from 'zod'

const M = { as: master }

const user = (id: string) => ({ as: asUser({ id }) })
const isAda = (caller: Caller): boolean =>
	caller.kind === 'user' && caller.user.id === 'ada'

const deleted: string[] = []
const updated: string[] = []
const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		title: f.string({ unique: true }),
		comments: f.many(() => Comment, { inverse: 'post' }),
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
		beforeUpdate: ({ caller, data }) => {
			const at = data.deletedAt
			const change =
				at === undefined ? 'edit' : at === null ? 'restore' : 'delete'
			updated.push(`${caller.kind}:${change}`)
		},
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

// A virtual each read computes, which the delete's own write must not.
const computed: string[] = []
const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		text: f.string(),
		loud: f.virtual(z.string(), { needs: ['text'] }),
		live: f.virtual(z.number()),
		lives: f.virtual(z.number()),
	}),
	use: [softDelete()],
}).with({
	virtuals: {
		loud: {
			run: ({ record }) => {
				computed.push(record.text)
				return record.text.toUpperCase()
			},
		},
		// Its query is its own: it reads the rows not deleted, from the trash too.
		live: { run: async () => Note.count({}, M) },
		lives: {
			runMany: async ({ records }) => {
				const live = await Note.count({}, M)
				return records.map(() => live)
			},
		},
	},
})

// A folder in another: the trash reads a deleted one under its live parent.
const Folder = defineModel({
	name: 'Folder',
	fields: (f) => ({
		name: f.string(),
		parent: f.one(() => Folder, { optional: true }),
	}),
	use: [softDelete()],
})

const app = defineApp({
	database: memory(),
	models: [Post, Comment, Note, Folder],
	plugins: [softDeletePlugin()],
})
const titles = async (): Promise<string[]> =>
	(await Post.findMany({}, M)).map((post) => post.title)
const trashed = async (): Promise<string[]> =>
	(await Post.trash.findMany({}, M)).map((post) => post.title)

let id: string
beforeEach(async () => {
	deleted.length = 0
	updated.length = 0
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

	// The redirect's update runs its own pipeline (D-89): its hooks see it.
	it('runs the update hooks too, as Master, deletedAt in data', async () => {
		await Post.delete({ where: { id } }, user('ada'))
		await Post.restore({ where: { id } }, user('ada'))
		await Post.update({ where: { id }, data: { title: 'Back' } }, M)
		expect(updated).toEqual(['master:delete', 'user:restore', 'master:edit'])
	})

	// Its update computed the virtuals it threw away: a read per row deleted.
	it('computes the virtuals once, for the row it returns', async () => {
		const note = await Note.create({ data: { text: 'hi' } }, M)
		computed.length = 0
		const removed = await Note.delete({ where: { id: note.id } }, M)
		expect(removed.loud).toBe('HI')
		expect(computed).toEqual(['hi'])
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

describe('the trash', () => {
	it('runs no virtual as its command (D-89)', async () => {
		for (const text of ['a', 'b', 'c']) {
			await Note.create({ data: { text } }, M)
		}
		const a = await Note.findFirstOrThrow({ where: { text: 'a' } }, M)
		await Note.delete({ where: { id: a.id } }, M)
		const read = { select: { text: true, live: true, lives: true } }
		expect(await Note.trash.findMany(read, M)).toEqual([
			{ text: 'a', live: 2, lives: 2 },
		])
	})
})

describe('a trash read', () => {
	it('reads the rows under its own as any read does (D-89)', async () => {
		const root = await Folder.create({ data: { name: 'root' } }, M)
		const gone = await Folder.create({ data: { name: 'gone' } }, M)
		const child = { name: 'child', parent: { connect: { id: root.id } } }
		const under = { name: 'under', parent: { connect: { id: gone.id } } }
		for (const data of [child, under]) {
			const { id: made } = await Folder.create({ data }, M)
			await Folder.delete({ where: { id: made } }, M)
		}
		await Folder.delete({ where: { id: gone.id } }, M)
		const read = {
			select: { name: true, parent: { select: { name: true } } },
			orderBy: { name: 'asc' },
		} as const
		expect(await Folder.trash.findMany(read, M)).toEqual([
			{ name: 'child', parent: { name: 'root' } },
			{ name: 'gone', parent: null },
			{ name: 'under', parent: null },
		])
		const where = { parent: { is: { name: 'root' } } }
		expect(await Folder.trash.count({ where }, M)).toBe(1)
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

	it('takes null from a caller, which dates nothing', async () => {
		const data = { title: 'Copy', deletedAt: null }
		const post = await Post.create({ data }, user('grace'))
		expect(post.deletedAt).toBeNull()
		expect(await titles()).toEqual(['Draft', 'Kept', 'Copy'])
	})
})
