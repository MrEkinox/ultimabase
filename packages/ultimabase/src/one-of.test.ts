// A `oneOf` on `memory()` (D-247): a `one` to a row of one of its kinds'
// models, read `{ kind, [kind]: row }`, filtered, written and moved by kind.
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
} from 'vitest'
import { query } from './engine.ts'
import type { FieldShape } from './model.ts'
import { allow, defineApp, defineModel, master, memory } from './index.ts'

const facts: unknown[] = []

const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		title: f.string(),
		comments: f.many(() => Comment, { inverse: 'target' }),
	}),
}).with({ access: allow.public })

const Photo = defineModel({
	name: 'Photo',
	fields: (f) => ({
		title: f.string(),
		url: f.string(),
		hidden: f.boolean({ default: false }),
		comments: f.many(() => Comment, { inverse: 'target' }),
	}),
}).with({
	access: {
		read: ({ where }) => where({ hidden: false }),
		create: allow.public,
		update: allow.public,
		delete: allow.public,
	},
})

const Comment = defineModel({
	name: 'Comment',
	fields: (f) => ({
		body: f.string(),
		target: f.oneOf({ post: () => Post, photo: () => Photo }).with({
			access: {
				read: () => true,
				create: ({ value }) => {
					facts.push({ rule: value })
					return true
				},
			},
		}),
	}),
}).with({
	access: allow.public,
	hooks: {
		beforeCreate: ({ data }) => {
			facts.push({ hook: data.target })
		},
	},
})

const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		text: f.string(),
		about: f.oneOf(
			{ post: () => Post, photo: () => Photo },
			{ optional: true, onDelete: 'cascade' },
		),
	}),
}).with({ access: allow.public })

const M = { as: master }

const typed = async (post: string) => [
	// @ts-expect-error -- a required oneOf is written
	Comment.create({ data: { body: 'b' } }, M),
	Comment.create(
		{
			// @ts-expect-error -- no such kind
			data: { body: 'b', target: { connect: { video: { id: post } } } },
		},
		M,
	),
	Comment.update(
		{
			where: { id: post },
			// @ts-expect-error -- a required oneOf is never unset
			data: { target: { disconnect: true } },
		},
		M,
	),
	Note.update(
		{ where: { id: post }, data: { about: { disconnect: true } } },
		M,
	),
	// @ts-expect-error -- a oneOf sorts nothing
	Comment.findMany({ orderBy: { target: 'asc' } }, M),
	// @ts-expect-error -- no such kind
	Comment.findMany({ where: { target: { kind: 'video' } } }, M),
	// @ts-expect-error -- a required oneOf is never null
	Comment.findMany({ where: { target: { is: null } } }, M),
	Note.findMany({ where: { about: { is: null } } }, M),
	// @ts-expect-error -- url is no field every kind has
	Comment.findMany({ where: { target: { is: { url: 'u' } } } }, M),
	Comment.findMany({ where: { target: { photo: { is: { url: 'u' } } } } }, M),
	// @ts-expect-error -- the hidden keys are no field of the caller's
	Comment.findMany({ select: { targetPost: true } }, M),
]

const declared = () =>
	defineModel({
		name: 'Typed',
		fields: (f) => ({
			// @ts-expect-error -- kind is a filter's key
			on: f.oneOf({ kind: () => Post, photo: () => Photo }),
			// @ts-expect-error -- a oneOf takes no unique
			one: f.oneOf({ post: () => Post, photo: () => Photo }, { unique: true }),
			two: f.oneOf(
				{ post: () => Post, photo: () => Photo },
				// @ts-expect-error -- setNull needs an optional relation
				{ onDelete: 'setNull' },
			),
		}),
	})

let app: ReturnType<typeof defineApp>
let post: string
let photo: string

const comments = async (
	args: object = {},
	as: unknown = master,
): Promise<unknown> => {
	const rows: unknown = await query(
		'Comment',
		'findMany',
		{ orderBy: { body: 'asc' }, select: { body: true, target: true }, ...args },
		{ as },
	)
	return rows
}

/** The bodies of the comments `where` keeps. */
const bodies = async (where: object): Promise<unknown> =>
	comments({ where, select: { body: true } })

describe('a oneOf', () => {
	beforeEach(async () => {
		facts.length = 0
		app = defineApp({
			database: memory(),
			models: [Post, Photo, Comment, Note],
		})
		await app.start()
		post = (await Post.create({ data: { title: 'Loom' } }, M)).id
		const shot = { title: 'Mill', url: 'mill.png' }
		photo = (await Photo.create({ data: shot }, M)).id
		const a = { body: 'a', target: { connect: { post: { id: post } } } }
		await Comment.create({ data: a }, M)
		const b = { body: 'b', target: { connect: { photo: { id: photo } } } }
		await Comment.create({ data: b }, M)
		facts.length = 0
	})

	afterEach(async () => {
		await app.stop()
	})

	it('reads its kind and the row, each kind shaped as a one', async () => {
		const aString: unknown = expect.any(String)
		const aDate: unknown = expect.any(Date)
		const row = { id: aString, createdAt: aDate, updatedAt: aDate }
		expect(await comments()).toStrictEqual([
			{ body: 'a', target: { kind: 'post', post: { title: 'Loom', ...row } } },
			{
				body: 'b',
				target: {
					kind: 'photo',
					photo: { title: 'Mill', url: 'mill.png', hidden: false, ...row },
				},
			},
		])
		const shaped = {
			select: { body: true, target: { photo: { select: { url: true } } } },
		}
		expect(await comments(shaped)).toStrictEqual([
			{ body: 'a', target: { kind: 'post' } },
			{ body: 'b', target: { kind: 'photo', photo: { url: 'mill.png' } } },
		])
		const rows = await Comment.findMany(
			{ orderBy: { body: 'asc' }, include: { target: { post: true } } },
			M,
		)
		const titles = rows.map(({ target }) =>
			target?.kind === 'post' ? target.post.title : target?.kind,
		)
		expect(titles).toStrictEqual(['Loom', 'photo'])
		expectTypeOf(rows.map(({ target }) => target?.kind)).toEqualTypeOf<
			('post' | 'photo' | undefined)[]
		>()
		const [first] = await Comment.findMany({ select: { target: true } }, M)
		if (first?.target?.kind === 'photo') {
			expectTypeOf(first.target.photo.url).toEqualTypeOf<string>()
		}
		// Without select nor include, a row reads no relation (D-20).
		const plain = await comments({ select: undefined })
		const anything: unknown = expect.anything()
		const unread: unknown = expect.not.objectContaining({ target: anything })
		expect(plain).toStrictEqual([unread, unread])
	})

	it('reads null for a target the caller cannot read', async () => {
		await Photo.update({ where: { id: photo }, data: { hidden: true } }, M)
		const as = { kind: 'anonymous' }
		const aPost: unknown = expect.objectContaining({ kind: 'post' })
		expect(await comments({}, as)).toStrictEqual([
			{ body: 'a', target: aPost },
			{ body: 'b', target: null },
		])
	})

	it('filters on its kind, a kind, and the fields every kind has', async () => {
		expect(await bodies({ target: { kind: 'photo' } })).toStrictEqual([
			{ body: 'b' },
		])
		expect(
			await bodies({ target: { photo: { is: { url: 'mill.png' } } } }),
		).toStrictEqual([{ body: 'b' }])
		expect(
			await bodies({ target: { post: { isNot: { title: 'Loom' } } } }),
		).toStrictEqual([{ body: 'b' }])
		expect(await bodies({ target: { is: { title: 'Mill' } } })).toStrictEqual([
			{ body: 'b' },
		])
		expect(
			await bodies({ target: { isNot: { title: 'Mill' } } }),
		).toStrictEqual([{ body: 'a' }])
		const loom = await Post.findMany(
			{ where: { comments: { some: { body: 'a' } } }, select: { title: true } },
			M,
		)
		expect(loom).toStrictEqual([{ title: 'Loom' }])
		await expect(bodies({ target: { kind: 'video' } })).rejects.toThrow(
			'where.target.kind',
		)
		await expect(bodies({ targetPost: { is: {} } })).rejects.toThrow(
			"Unknown key 'where.targetPost' on Comment.",
		)
	})

	it('creates, connects or creates, and moves by kind', async () => {
		const created = await Comment.create(
			{
				data: {
					body: 'c',
					target: { create: { photo: { title: 'Kiln', url: 'k.png' } } },
				},
				select: { id: true, target: true },
			},
			M,
		)
		expect(created.target?.kind).toBe('photo')
		const made = { create: { title: 'Weir' }, where: { id: post } }
		const reused = await Comment.create(
			{
				data: { body: 'd', target: { connectOrCreate: { post: made } } },
				select: { target: { post: { select: { title: true } } } },
			},
			M,
		)
		expect(reused.target).toStrictEqual({
			kind: 'post',
			post: { title: 'Loom' },
		})
		const moved = await Comment.update(
			{
				where: { id: created.id },
				data: { target: { connect: { post: { id: post } } } },
				select: { target: true },
			},
			M,
		)
		expect(moved.target?.kind).toBe('post')
		const kept = await Photo.findMany(
			{ select: { title: true, _count: true } },
			M,
		)
		expect(kept).toContainEqual({ title: 'Kiln', _count: { comments: 0 } })
	})

	it('moves a row from the other side, emptying its other kind', async () => {
		const [b] = await Comment.findMany({ where: { body: 'b' } }, M)
		await Post.update(
			{
				where: { id: post },
				data: { comments: { connect: [{ id: b?.id ?? '' }] } },
			},
			M,
		)
		expect(await comments()).toMatchObject([
			{ body: 'a', target: { kind: 'post' } },
			{ body: 'b', target: { kind: 'post' } },
		])
		const counts = await Photo.findMany({ select: { _count: true } }, M)
		expect(counts).toStrictEqual([{ _count: { comments: 0 } }])
		// A required oneOf is never left without its kind (D-37).
		const left = {
			path: ['comments', 'set'],
			message: 'A Comment cannot be left without its target.',
		}
		await expect(
			query(
				'Post',
				'update',
				{ where: { id: post }, data: { comments: { set: [] } } },
				M,
			),
		).rejects.toMatchObject({ details: { issues: [left] } })
		const disconnect = [{ id: b?.id ?? '' }]
		await expect(
			query(
				'Post',
				'update',
				{ where: { id: post }, data: { comments: { disconnect } } },
				M,
			),
		).rejects.toMatchObject({
			details: { issues: [{ ...left, path: ['comments', 'disconnect'] }] },
		})
	})

	it('is created from the other side and in many rows', async () => {
		const shot = await Photo.create(
			{
				data: {
					title: 'Kiln',
					url: 'k.png',
					comments: { create: [{ body: 'c' }] },
				},
				select: {
					comments: {
						select: { target: { photo: { select: { title: true } } } },
					},
				},
			},
			M,
		)
		expect(shot.comments).toStrictEqual([
			{ target: { kind: 'photo', photo: { title: 'Kiln' } } },
		])
		const data = [{ body: 'd', target: { connect: { photo: { id: photo } } } }]
		expect(await Comment.createMany({ data }, M)).toStrictEqual({ count: 1 })
		await expect(
			query('Comment', 'createMany', { data: [{ body: 'e' }] }, M),
		).rejects.toMatchObject({
			details: { issues: [{ path: ['target'], message: 'Required.' }] },
		})
		// A many-row update writes no relation (D-133).
		const connect = { post: { id: post } }
		await expect(
			query('Comment', 'updateMany', { data: { target: { connect } } }, M),
		).rejects.toThrow(
			'data.target is a relation, which updateMany does not write.',
		)
		const upserted = await Comment.upsert(
			{
				where: { id: post },
				create: { body: 'u', target: { connect: { photo: { id: photo } } } },
				update: {},
				select: { target: { photo: { select: { url: true } } } },
			},
			M,
		)
		expect(upserted.target).toStrictEqual({
			kind: 'photo',
			photo: { url: 'mill.png' },
		})
	})

	it('shows rules and hooks its kind, never its hidden keys', async () => {
		const as = { as: { kind: 'anonymous' } } as const
		await Comment.create(
			{ data: { body: 'c', target: { connect: { post: { id: post } } } } },
			as,
		)
		await Comment.create(
			{
				data: {
					body: 'd',
					target: { create: { photo: { title: 'K', url: 'k' } } },
				},
			},
			as,
		)
		const anId: unknown = expect.any(String)
		expect(facts).toStrictEqual([
			{ rule: { kind: 'post', post: { id: post } } },
			{ hook: { connect: { post: { id: post } } } },
			{ rule: { kind: 'photo', photo: { id: anId } } },
			{ hook: { create: { photo: { title: 'K', url: 'k' } } } },
		])
	})

	it('refuses a write of no kind, two kinds, or none when required', async () => {
		const write = (data: object): Promise<unknown> =>
			query('Comment', 'create', { data: { body: 'c', ...data } }, M)
		await expect(write({})).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
			details: { issues: [{ path: ['target'], message: 'Required.' }] },
		})
		await expect(
			write({
				target: { connect: { post: { id: post }, photo: { id: photo } } },
			}),
		).rejects.toThrow('data.target.connect')
		await expect(
			write({ target: { connect: { video: { id: post } } } }),
		).rejects.toThrow('data.target.connect names one of post, photo.')
		await expect(
			write({ targetPost: { connect: { id: post } } }),
		).rejects.toThrow("Unknown key 'data.targetPost' on Comment.")
		const [a] = await Comment.findMany({ where: { body: 'a' } }, M)
		await expect(
			query(
				'Comment',
				'update',
				{ where: { id: a?.id }, data: { target: { disconnect: true } } },
				M,
			),
		).rejects.toThrow('data.target')
		await expect(comments({ orderBy: { target: 'asc' } })).rejects.toThrow(
			'orderBy.target is a oneOf, which cannot be sorted.',
		)
		await expect(comments({ orderBy: { targetPost: 'asc' } })).rejects.toThrow(
			"Unknown key 'orderBy.targetPost' on Comment.",
		)
	})

	it('restricts the delete of a target by default', async () => {
		await expect(Post.delete({ where: { id: post } }, M)).rejects.toMatchObject(
			{
				code: 'RELATION_RESTRICTED',
				message: 'Comment.target references a Post the delete removes.',
				details: { model: 'Comment', field: 'target' },
			},
		)
		await expect(Photo.deleteMany({ where: {} }, M)).rejects.toMatchObject({
			message: 'Comment.target references a Photo the delete removes.',
			details: { model: 'Comment', field: 'target' },
		})
		expect(await Post.count({}, M)).toBe(1)
	})

	it('neither groups, compares nor aggregates', async () => {
		await expect(
			query('Comment', 'groupBy', { by: ['target'], _count: true }, M),
		).rejects.toThrow('by.0 is a oneOf, which cannot be grouped.')
		await expect(comments({ distinct: ['target'] })).rejects.toThrow(
			'distinct.0 is a oneOf, which cannot be compared.',
		)
		await expect(
			query('Comment', 'aggregate', { _count: { target: true } }, M),
		).rejects.toThrow('_count.target is a oneOf, which cannot be aggregated.')
		for (const [operation, args, path] of [
			['groupBy', { by: ['targetPost'], _count: true }, 'by.0'],
			['aggregate', { _count: { targetPost: true } }, '_count.targetPost'],
		] as const) {
			await expect(query('Comment', operation, args, M)).rejects.toThrow(
				`Unknown key '${path}' on Comment.`,
			)
		}
	})

	it('is unset, filtered on null and cascaded when optional', async () => {
		const note = await Note.create({ data: { text: 'n' } }, M)
		const linked = await Note.create(
			{
				data: { text: 'm', about: { connect: { photo: { id: photo } } } },
				select: { id: true, about: true },
			},
			M,
		)
		expect(linked.about?.kind).toBe('photo')
		const unset = await Note.findMany(
			{ where: { about: { is: null } }, select: { text: true } },
			M,
		)
		expect(unset).toStrictEqual([{ text: 'n' }])
		const cleared = await Note.update(
			{
				where: { id: linked.id },
				data: { about: { disconnect: true } },
				select: { about: true },
			},
			M,
		)
		expect(cleared.about).toBeNull()
		await Note.update(
			{
				where: { id: note.id },
				data: { about: { connect: { post: { id: post } } } },
			},
			M,
		)
		await Comment.deleteMany({ where: {} }, M)
		await Post.delete({ where: { id: post } }, M)
		expect(await Note.findMany({ select: { text: true } }, M)).toStrictEqual([
			{ text: 'm' },
		])
	})

	it('types its writes and filters', () => {
		expect([typed, declared]).toHaveLength(2)
	})
})

/** Starts an application whose `Mark.on` takes `kinds` and `options`. */
const start = async (
	options: object,
	many: object = { inverse: 'on' },
): Promise<void> => {
	const Mark = defineModel({
		name: 'Mark',
		fields: (f) => ({
			// Widened, as JavaScript would leave it.
			on: f.oneOf(
				{ page: () => Page, book: () => Book },
				options,
			) as FieldShape,
		}),
	})
	const Page = defineModel({
		name: 'Page',
		fields: (f) => ({
			book: f.one(() => Book),
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the test sends what the types refuse.
			marks: f.many(() => Mark, many as { inverse: 'on' }),
		}),
	})
	const Book = defineModel({
		name: 'Book',
		fields: (f) => ({ pages: f.many(() => Page, { inverse: 'book' }) }),
	})
	const started = defineApp({ database: memory(), models: [Mark, Page, Book] })
	await started.start()
	await started.stop()
}

/** Declares a model whose oneOf takes `targets`. */
const one = (targets: object) => () =>
	defineModel({
		name: 'Bad',
		// Widened, as JavaScript would leave it.
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the test sends what the types refuse.
		fields: (f) => ({ on: f.oneOf(targets as { page: () => object }) }),
	})
const thunk = () => ({})

describe('the start of a oneOf', () => {
	it('refuses what a oneOf takes no part in', async () => {
		await expect(start({})).resolves.toBeUndefined()
		await expect(start({ unique: true })).rejects.toThrow(
			'Mark.on: a oneOf takes no unique.',
		)
		await expect(start({ onDelete: 'setNull' })).rejects.toThrow(
			'Mark.on: setNull needs an optional relation.',
		)
		await expect(start({}, { inverse: 'on', within: 'book' })).rejects.toThrow(
			'Page.marks: a many facing a oneOf takes no within.',
		)
		await expect(
			start({}, { inverse: 'on', size: { max: 2 } }),
		).rejects.toThrow('Page.marks: a many facing a oneOf takes no size.')
	})

	it('takes two distinct kinds, none named as a filter key', () => {
		expect(one({ page: thunk })).toThrow('f.oneOf() takes two kinds or more.')
		expect(one({ is: thunk, page: thunk })).toThrow(
			"f.oneOf(): is is a filter's key, not a kind.",
		)
		expect(one({ page: thunk, book: 'Book' })).toThrow(
			'f.oneOf(): book takes a thunk of its model.',
		)
	})
})
