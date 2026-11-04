// An `exists` on `memory()` (D-246): whether the view it reads keeps a row,
// read as a boolean, filtered with one, never sorted, counted nor written.
import { asUser } from '@ultimabase/testing'
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
		isLiked: f.exists(() => Like, { from: 'likes' }),
		hasHidden: f.exists(() => Like, { from: 'likes' }),
	}),
}).with({
	access: allow.public,
	relations: {
		isLiked: { where: ({ where }) => where({ user: mine }) },
		hasHidden: { where: ({ where }) => where({ hidden: true }) },
	},
})

const Like = defineModel({
	name: 'Like',
	fields: (f) => ({
		hidden: f.boolean({ default: false }),
		post: f.one(() => Post),
		user: f.one(() => Account),
	}),
}).with({
	access: {
		read: ({ where }) => where({ hidden: false }),
		create: allow.public,
		update: allow.public,
		delete: allow.public,
	},
})

const M = { as: master }

const typed = () => [
	Post.create(
		// @ts-expect-error -- an exists is read-only
		{ data: { title: 'Kiln', isLiked: true } },
		M,
	),
	// @ts-expect-error -- an exists sorts nothing
	Post.findMany({ orderBy: { isLiked: 'asc' } }, M),
	// @ts-expect-error -- an exists filters on a boolean
	Post.findMany({ where: { isLiked: { some: {} } } }, M),
	// @ts-expect-error -- an exists reads a boolean, shaped by nothing
	Post.findMany({ select: { isLiked: { select: { id: true } } } }, M),
	// @ts-expect-error -- an exists counts nothing
	Post.findMany({ select: { _count: { select: { isLiked: true } } } }, M),
]

const declared = () =>
	defineModel({
		name: 'Typed',
		fields: (f) => ({
			likes: f.many(() => Like, { inverse: 'post' }),
			// @ts-expect-error -- no such many
			typo: f.exists(() => Like, { from: 'like' }),
		}),
	})

let app: ReturnType<typeof defineApp>
let ada: string
let eve: string

const read = async (
	as: unknown,
	args: object = {},
	operation: 'findMany' | 'findFirst' = 'findMany',
): Promise<unknown> => {
	const rows: unknown = await query(
		'Post',
		operation,
		{
			orderBy: { title: 'asc' },
			select: { title: true, isLiked: true },
			...args,
		},
		{ as },
	)
	return rows
}

describe('an exists', () => {
	beforeEach(async () => {
		app = defineApp({
			database: memory(),
			models: [Account, Post, Like],
			plugins: [users.plugin()],
		})
		await app.start()
		ada = (await Account.create({ data: { name: 'Ada' } }, M)).id
		eve = (await Account.create({ data: { name: 'Eve' } }, M)).id
		const loom = await Post.create({ data: { title: 'Loom' } }, M)
		await Post.create({ data: { title: 'Mill' } }, M)
		for (const [user, hidden] of [
			[ada, false],
			[eve, true],
		] as const) {
			const data = {
				hidden,
				post: { connect: { id: loom.id } },
				user: { connect: { id: user } },
			}
			await Like.create({ data }, M)
		}
	})

	afterEach(async () => {
		await app.stop()
	})

	it('reads whether its view keeps a row, for each caller', async () => {
		expect(await read(asUser({ id: ada }))).toStrictEqual([
			{ title: 'Loom', isLiked: true },
			{ title: 'Mill', isLiked: false },
		])
		// Eve's like is one the read rule hides from her (D-86).
		for (const as of [asUser({ id: eve }), { kind: 'anonymous' }, master]) {
			expect(await read(as)).toStrictEqual([
				{ title: 'Loom', isLiked: false },
				{ title: 'Mill', isLiked: false },
			])
		}
		const hidden = { select: { title: true, hasHidden: true } }
		expect(await read(master, hidden)).toStrictEqual([
			{ title: 'Loom', hasHidden: true },
			{ title: 'Mill', hasHidden: false },
		])
		expect(await read(asUser({ id: ada }), hidden)).toStrictEqual([
			{ title: 'Loom', hasHidden: false },
			{ title: 'Mill', hasHidden: false },
		])
	})

	it('types a boolean', async () => {
		expect([typed, declared]).toHaveLength(2)
		const as = asUser({ id: ada })
		const rows = await Post.findMany({ select: { isLiked: true } }, { as })
		expectTypeOf(rows.map((row) => row.isLiked)).toEqualTypeOf<boolean[]>()
		const included = await Post.findMany({ include: { isLiked: true } }, { as })
		expectTypeOf(included.map((row) => row.isLiked)).toEqualTypeOf<boolean[]>()
		const liked = await Post.findMany({ where: { isLiked: true } }, { as })
		expect(liked.map((row) => row.title)).toStrictEqual(['Loom'])
	})

	it('reads through include, and from a single row', async () => {
		const aString: unknown = expect.any(String)
		const aDate: unknown = expect.any(Date)
		const anyRow = { id: aString, createdAt: aDate, updatedAt: aDate }
		expect(
			await read(asUser({ id: ada }), {
				select: undefined,
				include: { isLiked: true },
			}),
		).toStrictEqual([
			{ title: 'Loom', isLiked: true, ...anyRow },
			{ title: 'Mill', isLiked: false, ...anyRow },
		])
		expect(
			await read(
				asUser({ id: ada }),
				{ where: { title: 'Loom' } },
				'findFirst',
			),
		).toStrictEqual({ title: 'Loom', isLiked: true })
		// Without select nor include, a row reads no relation (D-20).
		const plain = await read(asUser({ id: ada }), { select: undefined })
		const anything: unknown = expect.anything()
		const unread: unknown = expect.not.objectContaining({ isLiked: anything })
		expect(plain).toStrictEqual([unread, unread])
	})

	it('filters on a boolean', async () => {
		const as = asUser({ id: ada })
		expect(await read(as, { where: { isLiked: true } })).toStrictEqual([
			{ title: 'Loom', isLiked: true },
		])
		expect(await read(as, { where: { isLiked: false } })).toStrictEqual([
			{ title: 'Mill', isLiked: false },
		])
		expect(
			await read(asUser({ id: eve }), { where: { isLiked: true } }),
		).toStrictEqual([])
		const posts = await Post.count({ where: { isLiked: true } }, { as })
		expect(posts).toBe(1)
	})

	it('refuses what is no boolean, a sort, a count and a write', async () => {
		const as = asUser({ id: ada })
		await expect(
			read(as, { select: { isLiked: { select: { id: true } } } }),
		).rejects.toThrow('select.isLiked must be a boolean.')
		await expect(
			read(as, { where: { isLiked: { some: {} } } }),
		).rejects.toThrow('where.isLiked must be a boolean.')
		await expect(read(as, { orderBy: { isLiked: 'asc' } })).rejects.toThrow(
			'orderBy.isLiked: Post.isLiked is an exists, which sorts nothing.',
		)
		await expect(
			read(as, { select: { _count: { select: { isLiked: true } } } }),
		).rejects.toThrow('select._count.select.isLiked')
		expect(
			await read(as, { select: { _count: true }, where: { title: 'Loom' } }),
		).toStrictEqual([{ _count: { likes: 1 } }])
		await expect(
			query(
				'Post',
				'create',
				{ data: { title: 'Kiln', isLiked: { connect: [] } } },
				{ as },
			),
		).rejects.toThrow("Unknown key 'data.isLiked' on Post.")
	})
})

/** Starts an application whose `Story.voted` takes `options`. */
const start = async (
	options: { readonly from?: string },
	filtered = true,
): Promise<void> => {
	const Story = defineModel({
		name: 'Story',
		fields: (f) => ({
			votes: f.many(() => Vote, { inverse: 'story' }),
			// Widened, as JavaScript would leave it: the types require `from`.
			// @ts-expect-error -- `from` may be missing
			voted: f.exists(() => Vote, options) as FieldShape,
		}),
	})
	Reflect.apply(Reflect.get(Story, 'with'), Story, [
		filtered ? { relations: { voted: { where: () => true } } } : {},
	])
	const Vote = defineModel({
		name: 'Vote',
		fields: (f) => ({ story: f.one(() => Story) }),
	})
	const started = defineApp({ database: memory(), models: [Story, Vote] })
	await started.start()
	await started.stop()
}

describe('the start of an exists', () => {
	it('takes a many it names and a filter', async () => {
		await expect(start({ from: 'votes' })).resolves.toBeUndefined()
		await expect(start({})).rejects.toThrow(
			'Story.voted: an exists names its many with from.',
		)
		await expect(start({ from: 'story' })).rejects.toThrow(
			"Story.voted: from 'story' is not a many relation.",
		)
		await expect(start({ from: 'votes' }, false)).rejects.toThrow(
			'Story.voted is a view; filter it in .with({ relations }).',
		)
	})
})
