// A `one` view that pins the viewer on postgres() (D-245): each caller reads
// its own row, which the unique index on the view's key and the pinned field
// keeps single.
import { asUser, testApplication } from '@ultimabase/testing'
import type { Identity } from 'ultimabase'
import { allow, defineApp, defineModel, definePlugin, master } from 'ultimabase'
import { describe, expect, it } from 'vitest'
import { createAdapter } from './adapter.ts'

const servers =
	'postgres://postgres:postgres@localhost:54315/postgres postgres://postgres:postgres@localhost:54318/postgres'
const [server = ''] = (process.env['TEST_DATABASE_URL'] ?? servers)
	.split(' ')
	.filter((url) => url !== '')

const M = { as: master }
const database = createAdapter({ url: server })
const users = definePlugin({ name: 'users', userModel: true })

// A variable, so no excess property check: without `Register`, no filter
// takes `viewer` (D-189 point 5).
const mine = { viewer: true, isNot: undefined }

const Account = defineModel({
	name: 'Account',
	use: [users.use()],
	fields: (f) => ({ likes: f.many(() => Like, { inverse: 'user' }) }),
})

const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		title: f.string(),
		likes: f.many(() => Like, { inverse: 'post' }),
		myLike: f.one(() => Like, { from: 'likes' }),
	}),
}).with({
	access: allow.public,
	relations: { myLike: { where: ({ where }) => where({ user: mine }) } },
})

const Like = defineModel({
	name: 'Like',
	fields: (f) => ({
		note: f.string(),
		post: f.one(() => Post),
		user: f.one(() => Account),
	}),
	indexes: [{ fields: ['post', 'user'], unique: true }],
}).with({ access: allow.public })

describe('a one view that pins the viewer on postgres()', () => {
	testApplication(
		defineApp({
			database,
			models: [Account, Post, Like],
			plugins: [users.plugin()],
		}),
		{ database: 'declared' },
	)

	it('reads the caller’s own row, and none for no user', async () => {
		const ada = (await Account.create({ data: {} }, M)).id
		const bob = (await Account.create({ data: {} }, M)).id
		const eve = (await Account.create({ data: {} }, M)).id
		const post = await Post.create({ data: { title: 'Loom' } }, M)
		for (const [user, note] of [
			[ada, 'Ada'],
			[bob, 'Bob'],
		] as const) {
			await Like.create(
				{
					data: {
						note,
						post: { connect: { id: post.id } },
						user: { connect: { id: user } },
					},
				},
				M,
			)
		}
		const read = async (as: Identity, where: object = {}) =>
			Post.findMany(
				{ where, select: { myLike: { select: { note: true } } } },
				{ as },
			)
		expect(await read(asUser({ id: ada }))).toStrictEqual([
			{ myLike: { note: 'Ada' } },
		])
		expect(await read(asUser({ id: bob }))).toStrictEqual([
			{ myLike: { note: 'Bob' } },
		])
		expect(await read(asUser({ id: eve }))).toStrictEqual([{ myLike: null }])
		expect(await read(master)).toStrictEqual([{ myLike: null }])
		const liked = { myLike: { isNot: null } }
		expect(await read(asUser({ id: ada }), liked)).toHaveLength(1)
		expect(await read(asUser({ id: eve }), liked)).toHaveLength(0)
		await expect(
			Like.create(
				{
					data: {
						note: 'again',
						post: { connect: { id: post.id } },
						user: { connect: { id: ada } },
					},
				},
				M,
			),
		).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' })
	})
})
