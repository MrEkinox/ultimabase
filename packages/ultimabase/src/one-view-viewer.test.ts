// A `one` view that pins a field to the viewer on `memory()` (D-245): each
// caller reads its own row, held single by a unique index on the view's key
// and the pinned field; a caller that is no user reads none.
import { asUser } from '@ultimabase/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { query } from './engine.ts'
import {
	allow,
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
} from './index.ts'

const users = definePlugin({ name: 'users', userModel: true })

// A variable, so no excess property check: without `Register`, no filter
// takes `viewer` (D-189 point 5).
const mine = { viewer: true, isNot: undefined }

const Account = defineModel({
	name: 'Account',
	use: [users.use()],
	fields: (f) => ({
		name: f.string(),
		likes: f.many(() => Like, { inverse: 'user' }),
	}),
}).with({ access: allow.public })

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

let app: ReturnType<typeof defineApp>
let ada: string
let bob: string
let eve: string

const notes = async (as: unknown, where: object = {}): Promise<unknown> => {
	const rows: unknown = await query(
		'Post',
		'findMany',
		{
			where,
			orderBy: { title: 'asc' },
			select: { title: true, myLike: { select: { note: true } } },
		},
		{ as },
	)
	return rows
}

describe('a one view that pins the viewer', () => {
	beforeEach(async () => {
		app = defineApp({
			database: memory(),
			models: [Account, Post, Like],
			plugins: [users.plugin()],
		})
		await app.start()
		const M = { as: master }
		ada = (await Account.create({ data: { name: 'Ada' } }, M)).id
		bob = (await Account.create({ data: { name: 'Bob' } }, M)).id
		eve = (await Account.create({ data: { name: 'Eve' } }, M)).id
		for (const title of ['Loom', 'Mill']) {
			const post = await Post.create({ data: { title } }, M)
			for (const [user, name] of [
				[ada, 'Ada'],
				[bob, 'Bob'],
			] as const) {
				const note = `${name} likes ${title}`
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
		}
	})

	afterEach(async () => {
		await app.stop()
	})

	it('reads the caller’s own row', async () => {
		expect(await notes(asUser({ id: ada }))).toStrictEqual([
			{ title: 'Loom', myLike: { note: 'Ada likes Loom' } },
			{ title: 'Mill', myLike: { note: 'Ada likes Mill' } },
		])
		expect(await notes(asUser({ id: bob }))).toStrictEqual([
			{ title: 'Loom', myLike: { note: 'Bob likes Loom' } },
			{ title: 'Mill', myLike: { note: 'Bob likes Mill' } },
		])
		expect(await notes(asUser({ id: eve }))).toStrictEqual([
			{ title: 'Loom', myLike: null },
			{ title: 'Mill', myLike: null },
		])
	})

	it('reads none for a caller that is no user', async () => {
		for (const as of [{ kind: 'anonymous' }, master]) {
			expect(await notes(as)).toStrictEqual([
				{ title: 'Loom', myLike: null },
				{ title: 'Mill', myLike: null },
			])
		}
	})

	it('filters on the caller’s row', async () => {
		const liked = { myLike: { is: { note: { endsWith: 'Mill' } } } }
		expect(await notes(asUser({ id: ada }), liked)).toStrictEqual([
			{ title: 'Mill', myLike: { note: 'Ada likes Mill' } },
		])
		const unliked = { myLike: { is: null } }
		expect(await notes(asUser({ id: ada }), unliked)).toStrictEqual([])
		expect(await notes(asUser({ id: eve }), unliked)).toHaveLength(2)
	})
})

type Index = {
	readonly fields?: readonly ('post' | 'user' | 'removed')[]
	readonly unique: true
	readonly where?: { readonly removed: boolean }
}

/** Starts an app whose `Post.myLike` keeps `filter`, on `indexes` of Like. */
async function start(
	filter: object,
	indexes: readonly Index[] = [],
): Promise<void> {
	const Reader = defineModel({
		name: 'Reader',
		use: [users.use()],
		fields: (f) => ({ likes: f.many(() => Vote, { inverse: 'user' }) }),
	})
	const Story = defineModel({
		name: 'Story',
		fields: (f) => ({
			likes: f.many(() => Vote, { inverse: 'post' }),
			myLike: f.one(() => Vote, { from: 'likes' }),
		}),
	}).with({
		relations: { myLike: { where: ({ where }) => where(filter) } },
	})
	const Vote = defineModel({
		name: 'Vote',
		fields: (f) => ({
			post: f.one(() => Story),
			user: f.one(() => Reader),
			removed: f.boolean({ default: false }),
		}),
		indexes: indexes.map((index) => ({ fields: ['post'] as const, ...index })),
	})
	const started = defineApp({
		database: memory(),
		models: [Reader, Story, Vote],
		plugins: [users.plugin()],
	})
	await started.start()
	await started.stop()
}

const at = 'Story.myLike reads one Vote'

describe('the start of a one view that pins the viewer', () => {
	it('takes a unique index on its key and the pinned field', async () => {
		const pair: Index = { fields: ['post', 'user'], unique: true }
		await expect(start({ user: mine }, [pair])).resolves.toBeUndefined()
		// A key alone holds its row single too.
		const key: Index = { unique: true }
		await expect(start({ user: mine }, [key])).resolves.toBeUndefined()
		const where = { ...pair, where: { removed: false } }
		await expect(
			start({ AND: [{ user: mine }, { removed: false }] }, [where]),
		).resolves.toBeUndefined()
	})

	it('stops without one', async () => {
		await expect(start({ user: mine })).rejects.toThrow(
			`${at}: give Vote a unique index on post and user, as { fields: ['post', 'user'], unique: true }.`,
		)
		await expect(
			start({ user: mine }, [{ fields: ['post', 'removed'], unique: true }]),
		).rejects.toThrow(`${at}: give Vote a unique index on post and user,`)
		await expect(start({ user: mine, removed: false })).rejects.toThrow(
			`${at}: give Vote a unique index on post and user whose where the filter keeps, as { fields: ['post', 'user'], unique: true, where: { removed: false } }.`,
		)
	})

	it('refuses a viewer it does not pin', async () => {
		const stray = `${at}: viewer pins a field of the filter's top level, outside OR, NOT and nested relations.`
		await expect(
			start({ OR: [{ user: mine }, { removed: true }] }),
		).rejects.toThrow(stray)
		await expect(start({ NOT: [{ user: mine }] })).rejects.toThrow(stray)
		await expect(
			start({ user: { is: { likes: { some: { user: mine } } } } }),
		).rejects.toThrow(stray)
	})
})
