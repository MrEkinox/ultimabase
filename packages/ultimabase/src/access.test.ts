// Access rules on `memory()` (D-10, D-44, D-78, D-81, D-86): closed models,
// read filters, hidden fields, rows absent everywhere, and write rules.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { asUser } from '@ultimabase/testing'
import type { Caller } from './index.ts'
import {
	allOf,
	allow,
	anyOf,
	defineApp,
	defineModel,
	master,
	memory,
} from './index.ts'
import { query } from './engine.ts'

const owns = (caller: Caller, id: string | undefined): boolean =>
	caller.kind === 'user' && caller.user.id === id

const User = defineModel({
	name: 'User',
	fields: (f) => ({
		name: f.string({ unique: true }),
		email: f.string({ unique: true }).with({
			access: { read: ({ caller, record }) => owns(caller, record.id) },
		}),
		posts: f.many(() => Post),
	}),
}).with({ access: allow.readOnly })

let seen: unknown
const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		title: f.string(),
		status: f.enumOf(['draft', 'published'], { default: 'published' }),
		author: f.one(() => User),
		comments: f
			.many(() => Comment)
			.with({
				access: {
					update: ({ value }) => {
						seen = value
						return value.disconnect.length === 0
					},
				},
			}),
		tags: f.many(() => Tag),
	}),
}).with({
	access: {
		read: anyOf(
			({ where }) => where({ status: { equals: 'published' } }),
			({ caller, where }) =>
				caller.kind === 'user'
					? where({ author: { is: { id: { equals: caller.user.id } } } })
					: false,
		),
		create: ({ caller }) => caller.kind === 'user',
		update: ({ caller, record }) => owns(caller, record.author.id),
		delete: ({ caller, record }) => owns(caller, record.author.id),
	},
})

const Comment = defineModel({
	name: 'Comment',
	fields: (f) => ({
		text: f.string(),
		locked: f.boolean({ default: false }),
		post: f
			.one(() => Post, { optional: true })
			.with({
				access: { update: ({ value }) => value !== null },
			}),
	}),
}).with({
	access: {
		read: () => true,
		create: () => true,
		update: ({ record }) => !record.locked,
	},
})

const Tag = defineModel({
	name: 'Tag',
	fields: (f) => ({
		label: f.string({ unique: true }),
		hidden: f.boolean({ default: false }),
		posts: f.many(() => Post),
	}),
}).with({
	access: {
		read: allOf(
			({ caller }) => caller.kind !== 'anonymous',
			({ where }) => where({ hidden: { equals: false } }),
		),
		write: () => true,
	},
})

let defaults = 0
const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		text: f.string(),
		stamp: f.string({
			default: () => {
				defaults += 1
				return 'now'
			},
		}),
	}),
})

const M = { as: master }
let app: {
	readonly start: () => Promise<void>
	readonly stop: () => Promise<void>
}
let ada: { readonly as: Caller }
let bob: { readonly as: Caller }
let ids: {
	ada: string
	bob: string
	published: string
	adaDraft: string
	bobDraft: string
	onDraft: string
	locked: string
	loose: string
	secret: string
}

/** The error a query fails with, or `undefined` when it succeeds. */
const failure = async (
	run: () => Promise<unknown>,
): Promise<{ code?: unknown; path?: unknown; details?: unknown }> => {
	try {
		await run()
		return {}
	} catch (error) {
		if (!(error instanceof Error)) throw error
		return {
			...('code' in error ? { code: error.code } : {}),
			...('path' in error ? { path: error.path } : {}),
			...('details' in error ? { details: error.details } : {}),
			...(error instanceof TypeError ? { code: error.message } : {}),
		}
	}
}

const path = async (run: () => Promise<unknown>) => (await failure(run)).path

const after = async (id: string) =>
	Post.findMany({ cursor: { id }, orderBy: { id: 'asc' } }, ada)

const comments = async (where: object) =>
	Comment.count({ where: { post: where } }, ada)

/** The TypeError message a broken rule fails with. */
const broken = async (access: unknown, operation: 'count' | 'create') => {
	await app.stop()
	app = odd(access)
	await app.start()
	const data = operation === 'create' ? { data: { n: 1 } } : {}
	return (await failure(async () => query('Odd', operation, data, ada))).code
}

/** An application of one model whose `access` its types would refuse. */
const odd = (access: unknown) => {
	const Odd = defineModel({ name: 'Odd', fields: (f) => ({ n: f.number() }) })
	Reflect.apply(Reflect.get(Odd, 'with'), Odd, [{ access }])
	return defineApp({ database: memory(), models: [Odd] })
}

beforeEach(async () => {
	const started = defineApp({
		database: memory(),
		models: [User, Post, Comment, Tag, Note],
	})
	await started.start()
	app = started
	const a = await User.create({ data: { name: 'Ada', email: 'a@x.io' } }, M)
	const b = await User.create({ data: { name: 'Bob', email: 'b@x.io' } }, M)
	const post = async (
		title: string,
		status: 'draft' | 'published',
		by: string,
	) =>
		(
			await Post.create(
				{ data: { title, status, author: { connect: { id: by } } } },
				M,
			)
		).id
	const published = await post('Hello', 'published', b.id)
	const adaDraft = await post('Mine', 'draft', a.id)
	const bobDraft = await post('Soon', 'draft', b.id)
	const comment = async (text: string, on: string | null, locked = false) =>
		(
			await Comment.create(
				{
					data: {
						text,
						locked,
						...(on === null ? {} : { post: { connect: { id: on } } }),
					},
				},
				M,
			)
		).id
	const secret = await Tag.create(
		{
			data: {
				label: 'secret',
				hidden: true,
				posts: { connect: [{ id: adaDraft }] },
			},
		},
		M,
	)
	ids = {
		ada: a.id,
		bob: b.id,
		published,
		adaDraft,
		bobDraft,
		onDraft: await comment('On a draft', bobDraft),
		locked: await comment('Locked', null, true),
		loose: await comment('Loose', null),
		secret: secret.id,
	}
	ada = user(a.id)
	bob = user(b.id)
})

afterEach(async () => {
	await app.stop()
})

describe('a model', () => {
	it('is closed without a rule, to all but Master (D-04)', async () => {
		expect(await Note.findMany({}, ada)).toEqual([])
		expect(await Note.count({}, ada)).toBe(0)
		expect(
			await failure(async () => Note.create({ data: { text: 'x' } }, ada)),
		).toEqual({
			code: 'ACCESS_DENIED',
			details: { model: 'Note', operation: 'create' },
		})
		// The refused write runs no default (D-67).
		expect(defaults).toBe(0)
		await Note.create({ data: { text: 'x' } }, M)
		expect(defaults).toBe(1)
	})

	it('takes one rule for every operation', async () => {
		expect(await User.count({})).toBe(2)
		expect(
			await failure(async () =>
				User.update({ where: { id: ids.ada }, data: { name: 'A' } }, ada),
			),
		).toMatchObject({ code: 'ACCESS_DENIED' })
	})
})

describe('read rules', () => {
	it('combine their filters with anyOf and allOf (D-81)', async () => {
		const titles = async (as?: { readonly as: Caller }) =>
			(await Post.findMany({ orderBy: { title: 'asc' } }, as)).map(
				(post) => post.title,
			)
		expect(await titles()).toEqual(['Hello'])
		expect(await titles(ada)).toEqual(['Hello', 'Mine'])
		expect(await titles(bob)).toEqual(['Hello', 'Soon'])
		expect(await Post.count({}, ada)).toBe(2)
		expect(
			await Post.findUnique({ where: { id: ids.bobDraft } }, ada),
		).toBeNull()
		expect(await Post.findFirst({ where: { title: 'Soon' } }, ada)).toBeNull()
		await expect(
			Post.findUniqueOrThrow({ where: { id: ids.bobDraft } }, ada),
		).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'No Post matches.' })
		expect(await Tag.count({})).toBe(0)
		expect(await Tag.count({}, ada)).toBe(0)
		expect(await Tag.count({}, M)).toBe(1)
	})

	it('hide a field from the callers its rule refuses (D-44)', async () => {
		const users = await User.findMany({ orderBy: { name: 'asc' } }, ada)
		expect(
			users.map((each) => ['email' in each ? each.email : 'hidden', each.name]),
		).toEqual([
			['a@x.io', 'Ada'],
			['hidden', 'Bob'],
		])
		const found = await Post.findUnique(
			{ where: { id: ids.published }, include: { author: true } },
			ada,
		)
		expect(found?.author).not.toHaveProperty('email')
	})

	it('refuse a filter, a sort or a target on a hidden field (D-86)', async () => {
		expect(
			await path(async () =>
				User.count({ where: { email: { startsWith: 'a' } } }, ada),
			),
		).toBe('where.email')
		expect(
			await path(async () =>
				Post.findMany(
					{ where: { author: { is: { email: { equals: 'a@x.io' } } } } },
					ada,
				),
			),
		).toBe('where.author.is.email')
		expect(
			await path(async () => User.findMany({ orderBy: { email: 'asc' } }, ada)),
		).toBe('orderBy.email')
		// Through a relation too (D-134).
		expect(
			await path(async () =>
				Post.findMany({ orderBy: { author: { email: 'asc' } } }, ada),
			),
		).toBe('orderBy.author.email')
		expect(
			await path(async () =>
				User.findMany({ cursor: { email: 'a@x.io' } }, ada),
			),
		).toBe('cursor.email')
		expect(
			await path(async () =>
				User.findUnique({ where: { email: 'a@x.io' } }, ada),
			),
		).toBe('where.email')
		expect(
			await path(async () =>
				Post.findMany(
					{
						include: {
							author: { include: { posts: { orderBy: { title: 'asc' } } } },
						},
					},
					ada,
				),
			),
		).toBeUndefined()
		expect(await User.count({ where: { email: { startsWith: 'a' } } }, M)).toBe(
			1,
		)
	})
})

describe('an unreadable row is absent (D-86)', () => {
	it('from includes', async () => {
		const comment = await Comment.findUnique(
			{ where: { id: ids.onDraft }, include: { post: true } },
			ada,
		)
		expect(comment?.post).toBeNull()
		const bobs = await User.findUnique(
			{ where: { id: ids.bob }, include: { posts: true } },
			ada,
		)
		expect(bobs?.posts.map((post) => post.id)).toEqual([ids.published])
	})

	it('from relation filters', async () => {
		expect(await comments({ is: null })).toBe(3)
		expect(await comments({ isNot: null })).toBe(0)
		expect(await comments({ is: { title: { equals: 'Soon' } } })).toBe(0)
		expect(
			await Comment.count(
				{
					where: {
						post: { isNot: null, is: { status: { equals: 'draft' } } },
						AND: [{ text: { equals: 'On a draft' } }],
					},
				},
				M,
			),
		).toBe(1)
		const users = async (posts: object) =>
			(
				await User.findMany({ where: { posts }, orderBy: { name: 'asc' } }, ada)
			).map((each) => each.name)
		expect(await users({ some: { status: { equals: 'draft' } } })).toEqual([
			'Ada',
		])
		expect(await users({ none: { status: { equals: 'draft' } } })).toEqual([
			'Bob',
		])
		expect(await users({ every: { status: { equals: 'published' } } })).toEqual(
			['Bob'],
		)
		expect(
			await User.count(
				{ where: { posts: { every: { status: { equals: 'published' } } } } },
				M,
			),
		).toBe(0)
	})

	it('from a cursor', async () => {
		expect(await after(ids.bobDraft)).toEqual(await after(ids.loose))
		expect(await after(ids.published)).not.toEqual([])
	})

	it('from connect, disconnect, update and delete', async () => {
		expect(
			await failure(async () =>
				Comment.create(
					{ data: { text: 'Hi', post: { connect: { id: ids.bobDraft } } } },
					ada,
				),
			),
		).toEqual({ code: 'NOT_FOUND' })
		await Post.update(
			{
				where: { id: ids.adaDraft },
				data: { tags: { disconnect: [{ id: ids.secret }] } },
			},
			ada,
		)
		expect(await Tag.count({ where: { posts: { some: {} } } }, M)).toBe(1)
		await Tag.update({ where: { id: ids.secret }, data: { hidden: false } }, M)
		await Post.update(
			{
				where: { id: ids.adaDraft },
				data: { tags: { disconnect: [{ id: ids.secret }] } },
			},
			ada,
		)
		expect(await Tag.count({ where: { posts: { some: {} } } }, M)).toBe(0)
		for (const run of [
			async () =>
				Post.update({ where: { id: ids.bobDraft }, data: { title: 'X' } }, ada),
			async () => Post.delete({ where: { id: ids.bobDraft } }, ada),
		]) {
			expect(await failure(run)).toEqual({ code: 'NOT_FOUND' })
		}
	})
})

describe('write rules', () => {
	it('judge the stored record and return the written row (D-86)', async () => {
		const draft = await Post.create(
			{
				data: {
					title: 'Gift',
					status: 'draft',
					author: { connect: { id: ids.bob } },
				},
			},
			ada,
		)
		expect(draft.title).toBe('Gift')
		expect(
			await failure(async () =>
				Post.update(
					{ where: { id: ids.published }, data: { title: 'X' } },
					ada,
				),
			),
		).toEqual({
			code: 'ACCESS_DENIED',
			details: { model: 'Post', operation: 'update' },
		})
		expect(
			await failure(async () =>
				Post.delete({ where: { id: ids.published } }, ada),
			),
		).toEqual({
			code: 'ACCESS_DENIED',
			details: { model: 'Post', operation: 'delete' },
		})
		const removed = await Post.delete({ where: { id: ids.adaDraft } }, ada)
		expect(removed.title).toBe('Mine')
	})

	it('give a one field rule the id sent, or null', async () => {
		await Comment.update(
			{
				where: { id: ids.loose },
				data: { post: { connect: { id: ids.adaDraft } } },
			},
			ada,
		)
		expect(
			await failure(async () =>
				Comment.update(
					{ where: { id: ids.loose }, data: { post: { disconnect: true } } },
					ada,
				),
			),
		).toEqual({
			code: 'ACCESS_DENIED',
			details: { model: 'Comment', operation: 'update', field: 'post' },
		})
	})

	it('give a many field rule the ids sent (D-86)', async () => {
		await Post.update(
			{
				where: { id: ids.adaDraft },
				data: { comments: { connect: [{ id: ids.loose }] } },
			},
			ada,
		)
		expect(seen).toEqual({
			connect: [{ id: ids.loose }],
			disconnect: [],
			delete: [],
			create: [],
		})
		expect(
			await failure(async () =>
				Post.update(
					{
						where: { id: ids.adaDraft },
						data: { comments: { disconnect: [{ id: ids.loose }] } },
					},
					ada,
				),
			),
		).toEqual({
			code: 'ACCESS_DENIED',
			details: { model: 'Post', operation: 'update', field: 'comments' },
		})
	})

	it("run the target's rules on a relation written from the other side (D-78)", async () => {
		const moved = await Post.update(
			{
				where: { id: ids.adaDraft },
				data: { comments: { connect: [{ id: ids.loose }] } },
				include: { comments: true },
			},
			ada,
		)
		expect(moved.comments.map((comment) => comment.id)).toEqual([ids.loose])
		expect(
			await failure(async () =>
				Post.update(
					{
						where: { id: ids.adaDraft },
						data: { comments: { connect: [{ id: ids.locked }] } },
					},
					ada,
				),
			),
		).toEqual({
			code: 'ACCESS_DENIED',
			details: { model: 'Comment', operation: 'update', via: 'Post.comments' },
		})
		await Post.update(
			{
				where: { id: ids.published },
				data: { comments: { connect: [{ id: ids.locked }] } },
			},
			M,
		)
		expect(
			await Comment.count({ where: { post: { is: { id: ids.published } } } }),
		).toBe(1)
	})
})

// Each rule records the keys of the record it receives.
const keys: { [model: string]: string[] } = {}
const seenKeys = (model: string, record: object): boolean => {
	keys[model] = Object.keys(record).toSorted()
	return true
}

// The holder's passport stores the key; the issuer side names its inverse.
const Person = defineModel({
	name: 'Person',
	fields: (f) => ({
		name: f.string(),
		passport: f.one(() => Passport, { optional: true }),
		issued: f.many(() => Passport, { inverse: 'issuer' }),
	}),
}).with({
	access: {
		read: () => true,
		write: () => true,
		delete: ({ record }) => {
			// @ts-expect-error: the Passport row stores this key (D-37).
			void record.passport
			return seenKeys('Person', record)
		},
	},
})

const Passport = defineModel({
	name: 'Passport',
	fields: (f) => ({
		holder: f.one(() => Person),
		issuer: f.one(() => Person, { optional: true, inverse: 'issued' }),
	}),
}).with({
	access: {
		read: () => true,
		write: () => true,
		delete: ({ record }) =>
			seenKeys('Passport', record) &&
			record.holder.id !== '' &&
			record.issuer?.id !== '',
	},
})

// A one-to-one of a model with itself, without a named inverse.
const Node = defineModel({
	name: 'Node',
	fields: (f) => ({
		next: f.one(() => Node, { optional: true }),
		previous: f.one(() => Node),
	}),
}).with({
	access: {
		update: ({ record }) => {
			// @ts-expect-error: the next Node stores this key (D-37).
			void record.next
			return record.previous.id !== ''
		},
	},
})

// An optional one facing a many stores its key.
const Shelf = defineModel({
	name: 'Shelf',
	fields: (f) => ({ items: f.many(() => Item) }),
})
const Item = defineModel({
	name: 'Item',
	fields: (f) => ({ shelf: f.one(() => Shelf, { optional: true }) }),
}).with({ access: { delete: ({ record }) => record.shelf === null } })

describe('a write rule record (D-77, D-87)', () => {
	it('holds the keys its row stores, not the optional side of a one-to-one', async () => {
		await app.stop()
		app = defineApp({
			database: memory(),
			models: [Person, Passport, Node, Shelf, Item],
		})
		await app.start()
		const holder = await Person.create({ data: { name: 'Ada' } }, M)
		const passport = await Passport.create(
			{ data: { holder: { connect: { id: holder.id } } } },
			M,
		)
		await Passport.delete({ where: { id: passport.id } }, ada)
		await Person.delete({ where: { id: holder.id } }, ada)
		expect(keys).toEqual({
			Passport: ['createdAt', 'holder', 'id', 'issuer', 'updatedAt'],
			Person: ['createdAt', 'id', 'name', 'updatedAt'],
		})
	})
})

describe('a rule that breaks the contract', () => {
	it('fails with a TypeError', async () => {
		expect(await broken({ read: () => 3 }, 'count')).toBe(
			'A read rule returns a boolean or a read filter.',
		)
		expect(await broken({ read: () => false }, 'count')).toBeUndefined()
		expect(await broken({ create: () => 'yes' }, 'create')).toBe(
			'A write rule or a field rule returns a boolean.',
		)
		expect(await broken({ write: true }, 'create')).toBe(
			'An access rule is a function.',
		)
	})
})

const user = (id: string) => ({ as: asUser({ id }) })
