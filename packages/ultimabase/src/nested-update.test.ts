// Nested `set`, `update`, `delete` and `connectOrCreate` on `memory()`
// (D-138): each runs as the root call it stands for, reaches linked rows
// only, and the whole write stays one.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { asUser } from '@ultimabase/testing'
import type { Field, PluginTypes } from './index.ts'
import {
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from './index.ts'

const M = { as: master }
const U = { as: asUser({ id: '00000000-0000-4000-8000-000000000000' }) }
const log: string[] = []
let seen: unknown
let hooked: object | undefined

interface Trash extends PluginTypes {
	readonly name: 'trash'
	readonly addedFields: {
		readonly trashedAt: Field<Date, { readonly optional: true }>
	}
}
const trash = definePlugin<Trash>({
	name: 'trash',
	manifest: {
		name: 'trash',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	addedFields: (f) => ({ trashedAt: f.date({ optional: true }) }),
	redirect: {
		delete: async ({ where, queries }) => {
			log.push('redirect')
			return queries.update({ where, data: { trashedAt: new Date() } }, M)
		},
	},
	hooks: { beforeFind: ({ where }) => where({ trashedAt: null }) },
})

const User = defineModel({
	name: 'User',
	fields: (f) => ({
		name: f.string(),
		posts: f.many(() => Post),
		profile: f.one(() => Profile, { optional: true }),
		comments: f.many(() => Comment),
	}),
}).with({ access: { read: () => true, update: () => true } })

/** Holds the key of its one-to-one with a user (D-37). */
const Profile = defineModel({
	name: 'Profile',
	fields: (f) => ({ bio: f.string(), user: f.one(() => User) }),
}).with({
	access: { read: () => true, update: () => true, delete: () => true },
})

const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		title: f.string(),
		author: f.one(() => User, { optional: true, onDelete: 'cascade' }),
		comments: f
			.many(() => Comment)
			.with({
				access: {
					update: ({ value }) => {
						seen = value
						return true
					},
				},
			}),
		notes: f.many(() => Note),
		tags: f.many(() => Tag),
		cover: f.one(() => Cover, { optional: true, onDelete: 'cascade' }),
		drafts: f.many(() => Draft),
	}),
}).with({
	access: { read: () => true, create: () => true, update: () => true },
	hooks: {
		beforeUpdate: ({ data }) => {
			if (hooked !== undefined) Object.assign(data, hooked)
		},
	},
})

const Comment = defineModel({
	name: 'Comment',
	fields: (f) => ({
		body: f.string(),
		likes: f.number({ default: 0 }),
		post: f.one(() => Post, { onDelete: 'cascade' }),
		author: f.one(() => User, { optional: true }),
		replies: f.many(() => Reply),
	}),
}).with({
	access: {
		read: ({ where }) => where({ body: { not: 'hidden' } }),
		create: () => true,
		update: ({ record, value }) => {
			log.push(`Comment rule ${record.body} ${String(value.body)}`)
			return record.body !== 'locked'
		},
		delete: ({ record }) => record.body !== 'keep',
	},
	hooks: {
		beforeUpdate: ({ record, data }) => {
			log.push(`Comment beforeUpdate ${record.body}`)
			if (data.body === 'shout') Object.assign(data, { body: 'SHOUT' })
		},
		afterUpdate: ({ record }) => {
			log.push(`Comment afterUpdate ${record.body}`)
		},
		beforeDelete: ({ record }) => {
			log.push(`Comment beforeDelete ${record.body}`)
		},
		afterDelete: ({ record }) => {
			log.push(`Comment afterDelete ${record.body}`)
		},
	},
})

const Reply = defineModel({
	name: 'Reply',
	fields: (f) => ({
		text: f.string(),
		comment: f.one(() => Comment, { onDelete: 'cascade' }),
	}),
}).with({
	access: {
		read: () => true,
		update: () => true,
		delete: () => true,
	},
	hooks: {
		beforeDelete: ({ record }) => {
			log.push(`Reply beforeDelete ${record.text}`)
		},
	},
})

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		text: f.string(),
		post: f.one(() => Post, { optional: true }),
	}),
}).with({ access: { read: () => true, update: () => true } })

const Tag = defineModel({
	name: 'Tag',
	fields: (f) => ({
		name: f.string({ unique: true }),
		posts: f.many(() => Post),
	}),
}).with({ access: { read: () => true, create: () => true } })

const Cover = defineModel({
	name: 'Cover',
	fields: (f) => ({ url: f.string(), posts: f.many(() => Post) }),
}).with({ access: { read: () => true, delete: () => true } })

/** Soft-deleted by the trash plugin's redirect (D-89). */
const Draft = defineModel({
	name: 'Draft',
	fields: (f) => ({
		text: f.string(),
		post: f.one(() => Post, { onDelete: 'cascade' }),
	}),
	use: [trash.use()],
}).with({
	access: { read: () => true, update: () => true, delete: () => true },
})

const started = () =>
	defineApp({
		database: memory(),
		models: [User, Profile, Post, Comment, Reply, Note, Tag, Cover, Draft],
		plugins: [trash.plugin()],
	})

const invalid = (message: string) => ({ code: 'INVALID_QUERY', message })
const notFound = (message: string) => ({ code: 'NOT_FOUND', message })

async function bodies(id: string): Promise<string[]> {
	const rows = await Comment.findMany(
		{ where: { post: { is: { id } } }, orderBy: { body: 'asc' } },
		M,
	)
	return rows.map((row) => row.body)
}

describe('a nested update', () => {
	let app: ReturnType<typeof started>
	let post: { readonly id: string }
	let other: { readonly id: string }
	let ids: Record<string, string>
	beforeEach(async () => {
		log.length = 0
		seen = undefined
		hooked = undefined
		app = started()
		await app.start()
		post = await Post.create({ data: { title: 'p' } }, M)
		other = await Post.create({ data: { title: 'q' } }, M)
		ids = {}
		for (const body of ['a', 'b', 'locked', 'keep', 'hidden']) {
			const made = await Comment.create(
				{ data: { body, post: { connect: { id: post.id } } } },
				M,
			)
			ids[body] = made.id
		}
		const foreign = await Comment.create(
			{ data: { body: 'foreign', post: { connect: { id: other.id } } } },
			M,
		)
		ids['foreign'] = foreign.id
		log.length = 0
	})
	afterEach(async () => app.stop())

	it("runs the target's update rule and hooks, not the field rule", async () => {
		const result = await Post.update(
			{
				where: { id: post.id },
				data: {
					comments: {
						update: [
							{ where: { id: ids['a'] ?? '' }, data: { body: 'shout' } },
						],
					},
				},
				include: { comments: { orderBy: { body: 'asc' } } },
			},
			U,
		)
		expect(result.comments.map((row) => row.body)).toEqual([
			'SHOUT',
			'b',
			'keep',
			'locked',
		])
		expect(log).toEqual([
			'Comment rule a shout',
			'Comment beforeUpdate a',
			'Comment afterUpdate SHOUT',
		])
		// No link changed: the relation's field rule is not called.
		expect(seen).toBeUndefined()
	})

	it('refuses a row the rule refuses, naming the relation', async () => {
		await expect(
			Post.update(
				{
					where: { id: post.id },
					data: {
						comments: {
							update: [
								{ where: { id: ids['locked'] ?? '' }, data: { body: 'x' } },
							],
						},
					},
				},
				U,
			),
		).rejects.toMatchObject({
			code: 'ACCESS_DENIED',
			details: { model: 'Comment', operation: 'update', via: 'Post.comments' },
		})
	})

	it('reaches linked rows the caller reads only', async () => {
		const cases: [string, string][] = [
			['foreign', 'No Comment matches data.comments.update.0.where.'],
			['hidden', 'No Comment matches data.comments.update.0.where.'],
		]
		for (const [body, message] of cases) {
			await expect(
				Post.update(
					{
						where: { id: post.id },
						data: {
							comments: {
								update: [
									{ where: { id: ids[body] ?? '' }, data: { body: 'x' } },
								],
							},
						},
					},
					U,
				),
			).rejects.toMatchObject(notFound(message))
		}
		await expect(
			Post.update(
				{
					where: { id: post.id },
					data: { comments: { delete: [{ id: ids['foreign'] ?? '' }] } },
				},
				U,
			),
		).rejects.toMatchObject(
			notFound('No Comment matches data.comments.delete.0.'),
		)
		expect(await bodies(other.id)).toEqual(['foreign'])
	})

	it('computes number updates in nested data (D-132)', async () => {
		await Post.update(
			{
				where: { id: post.id },
				data: {
					comments: {
						update: [
							{
								where: { id: ids['b'] ?? '' },
								data: { likes: { increment: 2 } },
							},
						],
					},
				},
			},
			M,
		)
		const row = await Comment.findUnique({ where: { id: ids['b'] ?? '' } }, M)
		expect(row?.likes).toBe(2)
	})

	it('updates at any depth, leaving out the relation back', async () => {
		const reply = await Reply.create(
			{ data: { text: 'r', comment: { connect: { id: ids['a'] ?? '' } } } },
			M,
		)
		const deep = (where: { readonly id: string } | { readonly text: string }) =>
			Post.update(
				{
					where: { id: post.id },
					data: {
						comments: {
							update: [
								{
									where: { id: ids['a'] ?? '' },
									data: {
										// @ts-expect-error: `text` is not unique.
										replies: { update: [{ where, data: { text: 'R' } }] },
									},
								},
							],
						},
					},
				},
				M,
			)
		await deep({ id: reply.id })
		const row = await Reply.findUnique({ where: { id: reply.id } }, M)
		expect(row?.text).toBe('R')
		// The caller's error at depth stays the caller's, not a hook's.
		await expect(deep({ text: 'R' })).rejects.toMatchObject(
			invalid(
				'data.comments.update.0.data.replies.update.0.where must name exactly id, a unique field or a unique index of Reply.',
			),
		)
		await expect(
			Post.update(
				{
					where: { id: post.id },
					data: {
						comments: {
							update: [
								{
									where: { id: ids['a'] ?? '' },
									// @ts-expect-error: the relation back to the post.
									data: { post: { connect: { id: other.id } } },
								},
							],
						},
					},
				},
				M,
			),
		).rejects.toMatchObject({ code: 'INVALID_QUERY' })
	})
})

describe('a nested delete', () => {
	let app: ReturnType<typeof started>
	beforeEach(async () => {
		log.length = 0
		seen = undefined
		hooked = undefined
		app = started()
		await app.start()
	})
	afterEach(async () => app.stop())

	it('runs the delete rule, its hooks and the cascade', async () => {
		const post = await Post.create(
			{
				data: {
					title: 'p',
					comments: { create: [{ body: 'a' }, { body: 'keep' }] },
				},
				include: { comments: { orderBy: { body: 'asc' } } },
			},
			M,
		)
		const [a, keep] = post.comments
		await Reply.create(
			{ data: { text: 'r', comment: { connect: { id: a?.id ?? '' } } } },
			M,
		)
		await Post.update(
			{
				where: { id: post.id },
				data: { comments: { delete: [{ id: a?.id ?? '' }] } },
			},
			U,
		)
		// The cascade's order, as `Comment.delete` runs it (D-90).
		expect(log).toEqual([
			'Reply beforeDelete r',
			'Comment beforeDelete a',
			'Comment afterDelete a',
		])
		expect(seen).toEqual({
			connect: [],
			disconnect: [],
			delete: [{ id: a?.id }],
			create: [],
		})
		expect(await Reply.count({}, M)).toBe(0)
		await expect(
			Post.update(
				{
					where: { id: post.id },
					data: { comments: { delete: [{ id: keep?.id ?? '' }] } },
				},
				U,
			),
		).rejects.toMatchObject({
			code: 'ACCESS_DENIED',
			details: { model: 'Comment', operation: 'delete', via: 'Post.comments' },
		})
	})

	it("follows a plugin's redirect (D-89)", async () => {
		const post = await Post.create(
			{
				data: { title: 'p', drafts: { create: [{ text: 'd' }] } },
				include: { drafts: true },
			},
			M,
		)
		await Post.update(
			{
				where: { id: post.id },
				data: { drafts: { delete: [{ id: post.drafts[0]?.id ?? '' }] } },
			},
			M,
		)
		expect(log).toEqual(['redirect'])
		expect(await Draft.count({}, M)).toBe(0)
	})

	it('refuses a cascade that reaches a row the write updates', async () => {
		const user = await User.create({ data: { name: 'u' } }, M)
		const post = await Post.create(
			{
				data: {
					title: 'p',
					author: { connect: { id: user.id } },
					comments: {
						create: [{ body: 'a', author: { connect: { id: user.id } } }],
					},
				},
				include: { comments: true },
			},
			M,
		)
		const comment = post.comments[0]?.id ?? ''
		await expect(
			User.update(
				{
					where: { id: user.id },
					data: {
						posts: { delete: [{ id: post.id }] },
						comments: {
							update: [{ where: { id: comment }, data: { body: 'b' } }],
						},
					},
				},
				M,
			),
		).rejects.toMatchObject(
			invalid('data.posts.delete.0 deletes a row the write updates.'),
		)
		expect(await Comment.count({}, M)).toBe(1)
	})

	it('empties a stored key before it deletes the row', async () => {
		const post = await Post.create(
			{
				data: { title: 'p', cover: { create: { url: 'c' } } },
				include: { cover: true },
			},
			M,
		)
		const result = await Post.update(
			{
				where: { id: post.id },
				data: { cover: { delete: true } },
				include: { cover: true },
			},
			U,
		)
		expect(result.cover).toBeNull()
		expect(await Cover.count({}, M)).toBe(0)
		expect(await Post.count({}, M)).toBe(1)
		await expect(
			Post.update(
				{ where: { id: post.id }, data: { cover: { delete: true } } },
				U,
			),
		).rejects.toMatchObject(notFound('No Cover matches data.cover.delete.'))
	})

	it('deletes the row that holds the key of a one-to-one', async () => {
		const user = await User.create(
			{ data: { name: 'u', profile: { create: { bio: 'hi' } } } },
			M,
		)
		await User.update(
			{ where: { id: user.id }, data: { profile: { update: { bio: 'yo' } } } },
			U,
		)
		expect((await Profile.findFirst({}, M))?.bio).toBe('yo')
		await User.update(
			{ where: { id: user.id }, data: { profile: { delete: true } } },
			U,
		)
		expect(await Profile.count({}, M)).toBe(0)
		await expect(
			User.update(
				{ where: { id: user.id }, data: { profile: { update: { bio: 'x' } } } },
				U,
			),
		).rejects.toMatchObject(notFound('No Profile matches data.profile.update.'))
	})

	it('refuses deleting a required one', async () => {
		const user = await User.create({ data: { name: 'u' } }, M)
		const profile = await Profile.create(
			{ data: { bio: 'b', user: { connect: { id: user.id } } } },
			M,
		)
		await expect(
			Profile.update(
				// @ts-expect-error: a required relation is not deleted.
				{ where: { id: profile.id }, data: { user: { delete: true } } },
				M,
			),
		).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
			details: { issues: [{ path: ['user'], message: 'Required.' }] },
		})
	})
})

describe('a nested set', () => {
	let app: ReturnType<typeof started>
	beforeEach(async () => {
		log.length = 0
		seen = undefined
		hooked = undefined
		app = started()
		await app.start()
	})
	afterEach(async () => app.stop())

	it('becomes the connects and disconnects it stands for', async () => {
		const post = await Post.create(
			{
				data: { title: 'p', notes: { create: [{ text: 'a' }, { text: 'b' }] } },
			},
			M,
		)
		const c = await Note.create({ data: { text: 'c' } }, M)
		const [a] = await Note.findMany({ where: { text: 'a' } }, M)
		const result = await Post.update(
			{
				where: { id: post.id },
				data: { notes: { set: [{ id: a?.id ?? '' }, { id: c.id }] } },
				include: { notes: { orderBy: { text: 'asc' } } },
			},
			M,
		)
		expect(result.notes.map((note) => note.text)).toEqual(['a', 'c'])
		expect(await Note.count({}, M)).toBe(3)
	})

	it('shows the rules plain links', async () => {
		const post = await Post.create(
			{ data: { title: 'p', comments: { create: [{ body: 'a' }] } } },
			M,
		)
		const tag = await Tag.create({ data: { name: 'news' } }, M)
		await Post.update(
			{ where: { id: post.id }, data: { tags: { set: [{ id: tag.id }] } } },
			M,
		)
		await Post.update(
			{ where: { id: post.id }, data: { tags: { set: [] } } },
			M,
		)
		const tags = await Post.findUnique(
			{ where: { id: post.id }, include: { tags: true } },
			M,
		)
		expect(tags?.tags).toEqual([])
	})

	it('is refused when the other side needs its key', async () => {
		const post = await Post.create({ data: { title: 'p' } }, M)
		await expect(
			Post.update(
				{ where: { id: post.id }, data: { comments: { set: [] } } },
				M,
			),
		).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
			details: {
				issues: [
					{
						path: ['comments', 'set'],
						message: 'A Comment cannot be left without its post.',
					},
				],
			},
		})
	})

	it('runs from a hook, which skips the rules (D-67)', async () => {
		const post = await Post.create(
			{ data: { title: 'p', notes: { create: [{ text: 'a' }] } } },
			M,
		)
		hooked = { notes: { set: [] } }
		await Post.update({ where: { id: post.id }, data: { title: 'q' } }, U)
		expect(
			await Note.count({ where: { post: { is: { id: post.id } } } }, M),
		).toBe(0)
	})
})

describe('a nested connectOrCreate', () => {
	let app: ReturnType<typeof started>
	beforeEach(async () => {
		app = started()
		await app.start()
	})
	afterEach(async () => app.stop())

	it('connects the row it finds, and creates the one it does not', async () => {
		const news = await Tag.create({ data: { name: 'news' } }, M)
		const post = await Post.create(
			{
				data: {
					title: 'p',
					tags: {
						connectOrCreate: [
							{ where: { name: 'news' }, create: { name: 'news' } },
							{ where: { name: 'tech' }, create: { name: 'tech' } },
						],
					},
				},
				include: { tags: { orderBy: { name: 'asc' } } },
			},
			U,
		)
		expect(post.tags.map((tag) => tag.id)[0]).toBe(news.id)
		expect(post.tags.map((tag) => tag.name)).toEqual(['news', 'tech'])
		const user = await User.create(
			{
				data: {
					name: 'u',
					profile: {
						connectOrCreate: { where: { id: news.id }, create: { bio: 'b' } },
					},
				},
				include: { profile: true },
			},
			M,
		)
		expect(user.profile?.bio).toBe('b')
	})

	it('reports a created row at its own path', async () => {
		await expect(
			Post.create(
				{
					data: {
						title: 'p',
						tags: {
							connectOrCreate: [
								// @ts-expect-error: a name is a string.
								{ where: { name: 'x' }, create: { name: 1 } },
							],
						},
					},
				},
				M,
			),
		).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
			details: {
				issues: [
					{
						path: ['tags', 'connectOrCreate', 0, 'create', 'name'],
						message: 'Expected a string.',
					},
				],
			},
		})
	})
})

describe('a relation write', () => {
	let app: ReturnType<typeof started>
	beforeEach(async () => {
		hooked = undefined
		app = started()
		await app.start()
	})
	afterEach(async () => app.stop())

	it('names each row once', async () => {
		const post = await Post.create(
			{
				data: { title: 'p', notes: { create: [{ text: 'a' }] } },
				include: { notes: true },
			},
			M,
		)
		const id = post.notes[0]?.id ?? ''
		const refusals = [
			{
				update: [
					{ where: { id }, data: { text: 'b' } },
					{ where: { id }, data: { text: 'c' } },
				],
			},
			{
				update: [{ where: { id }, data: { text: 'b' } }],
				disconnect: [{ id }],
			},
		]
		for (const notes of refusals) {
			await expect(
				Post.update({ where: { id: post.id }, data: { notes } }, M),
			).rejects.toMatchObject(invalid('data.notes names the same row twice.'))
		}
		// A row connected twice is one; disconnected and connected, it stays
		// linked (D-101).
		for (const notes of [
			{ connect: [{ id }, { id }] },
			{ connect: [{ id }], disconnect: [{ id }] },
		]) {
			const kept = await Post.update(
				{ where: { id: post.id }, data: { notes }, include: { notes: true } },
				M,
			)
			expect(kept.notes.map((note) => note.id)).toEqual([id])
		}
	})

	it('refuses set beside connect, and the operations of an update in a create', async () => {
		const post = await Post.create({ data: { title: 'p' } }, M)
		await expect(
			Post.update(
				{ where: { id: post.id }, data: { notes: { set: [], connect: [] } } },
				M,
			),
		).rejects.toMatchObject({ code: 'INVALID_QUERY' })
		await expect(
			Post.create(
				// @ts-expect-error: a create deletes nothing.
				{ data: { title: 'p', notes: { delete: [] } } },
				M,
			),
		).rejects.toMatchObject({ code: 'INVALID_QUERY' })
	})
})
