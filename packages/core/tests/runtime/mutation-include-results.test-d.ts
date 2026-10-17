import {
	type PluginSchemaMutationResult,
	type QueryResult,
	UltimaBase,
} from '../../src/index.js'
import { expectTypeOf, test } from 'vitest'

const Author = UltimaBase.Schema.define({
	className: 'MutationIncludeAuthor',
	fields: (field) => ({ name: field.string({ required: true }) }),
})
const Comment = UltimaBase.Schema.define({
	className: 'MutationIncludeComment',
	fields: (field) => ({ body: field.string({ required: true }) }),
})
const Post = UltimaBase.Schema.define({
	className: 'MutationIncludePost',
	fields: (field) => ({
		slug: field.string({ indexed: 'unique', required: true }),
		title: field.string({ required: true }),
		author: field.pointer({ target: () => Author }),
		comments: field.relation({ target: () => Comment }),
	}),
})

const where = { id: 'post-1' } as const
const data = { slug: 'post', title: 'Post' } as const
const include = {
	author: { select: { name: true } },
	comments: {},
} as const
const select = { title: true } as const

const idOnly = { id: true } as const

// Mutations project like reads with one difference (ADR-0341): without
// `select`, a write returns `{ id }` and `include` only adds related values.
// An explicit `select` keeps the read projection, `{}` included.
test('createOne returns { id } unless it selects more', () => {
	expectTypeOf(Post.createOne({ data, include })).toEqualTypeOf(
		Post.findOneOrThrow({ where, select: idOnly, include }),
	)
	expectTypeOf(Post.createOne({ data, select })).toEqualTypeOf(
		Post.findOneOrThrow({ where, select }),
	)
	expectTypeOf(Post.createOne({ data, select, include })).toEqualTypeOf(
		Post.findOneOrThrow({ where, select, include }),
	)
	expectTypeOf(Post.createOne({ data })).toEqualTypeOf<
		Promise<QueryResult<typeof Post, 'id'>>
	>()
	expectTypeOf(Post.createOne({ data, select: {} })).toEqualTypeOf(
		Post.findOneOrThrow({ where, select: {} }),
	)
	expectTypeOf(
		Post.createOne({ data, select: { title: false } }),
	).toEqualTypeOf(Post.findOneOrThrow({ where, select: { title: false } }))
})

test('createMany returns [{ id }] unless it selects more', () => {
	expectTypeOf(Post.createMany({ data: [data], include })).toEqualTypeOf(
		Post.findMany({ select: idOnly, include }),
	)
	expectTypeOf(Post.createMany({ data: [data], select })).toEqualTypeOf(
		Post.findMany({ select }),
	)
	expectTypeOf(
		Post.createMany({ data: [data], select, include }),
	).toEqualTypeOf(Post.findMany({ select, include }))
	expectTypeOf(Post.createMany({ data: [data] })).toEqualTypeOf<
		Promise<readonly QueryResult<typeof Post, 'id'>[]>
	>()
})

test('updateOne returns { id } or null unless it selects more', () => {
	const update = { where, data: { title: 'Updated' } } as const

	expectTypeOf(Post.updateOne({ ...update, include })).toEqualTypeOf(
		Post.findOne({ select: idOnly, include }),
	)
	expectTypeOf(Post.updateOne({ ...update, select })).toEqualTypeOf(
		Post.findOne({ select }),
	)
	expectTypeOf(Post.updateOne({ ...update, select, include })).toEqualTypeOf(
		Post.findOne({ select, include }),
	)
	expectTypeOf(Post.updateOne(update)).toEqualTypeOf<
		Promise<QueryResult<typeof Post, 'id'> | null>
	>()
})

test('updateMany keeps its identity default and adds includes', () => {
	const items = [{ where, data: { title: 'Updated' } }] as const

	expectTypeOf(Post.updateMany({ data: items, include })).toEqualTypeOf(
		Post.findMany({ select: { id: true }, include }),
	)
	expectTypeOf(Post.updateMany({ data: items, select })).toEqualTypeOf(
		Post.findMany({ select }),
	)
	expectTypeOf(Post.updateMany({ data: items, select, include })).toEqualTypeOf(
		Post.findMany({ select, include }),
	)
	expectTypeOf(Post.updateMany({ data: items })).toEqualTypeOf<
		Promise<readonly QueryResult<typeof Post, 'id'>[]>
	>()
})

test('commands without include return { id } unless they select more', () => {
	const upsert = {
		where: { slug: 'post' },
		create: data,
		update: { title: 'Updated' },
	} as const

	expectTypeOf(Post.upsertOne({ ...upsert, select })).toEqualTypeOf(
		Post.findOneOrThrow({ select }),
	)
	expectTypeOf(Post.upsertOne(upsert)).toEqualTypeOf<
		Promise<QueryResult<typeof Post, 'id'>>
	>()
	expectTypeOf(Post.upsertMany({ data: [upsert], select })).toEqualTypeOf(
		Post.findMany({ select }),
	)
	expectTypeOf(Post.upsertMany({ data: [upsert] })).toEqualTypeOf<
		Promise<readonly QueryResult<typeof Post, 'id'>[]>
	>()
	expectTypeOf(Post.deleteOne({ where, select })).toEqualTypeOf(
		Post.findOne({ select }),
	)
	expectTypeOf(Post.deleteOne({ where })).toEqualTypeOf<
		Promise<QueryResult<typeof Post, 'id'> | null>
	>()
	expectTypeOf(Post.deleteMany({ where: [where], select })).toEqualTypeOf(
		Post.findMany({ select }),
	)
	expectTypeOf(Post.deleteMany({ where: [where] })).toEqualTypeOf<
		Promise<readonly QueryResult<typeof Post, 'id'>[]>
	>()
})

test('plugin schema mutations return { id } unless they select more', async () => {
	type Include = typeof include
	type Select = typeof select

	expectTypeOf<
		PluginSchemaMutationResult<typeof Post, undefined, Include>
	>().toEqualTypeOf(await Post.findOneOrThrow({ select: idOnly, include }))
	expectTypeOf<
		PluginSchemaMutationResult<typeof Post, Select, undefined>
	>().toEqualTypeOf(await Post.findOneOrThrow({ select }))
	expectTypeOf<
		PluginSchemaMutationResult<typeof Post, Select, Include>
	>().toEqualTypeOf(await Post.findOneOrThrow({ select, include }))
	expectTypeOf<
		PluginSchemaMutationResult<typeof Post, undefined, undefined>
	>().toEqualTypeOf<QueryResult<typeof Post, 'id'>>()
})

test('an included result adds related values to { id }', async () => {
	const created = await Post.createOne({ data, include })

	expectTypeOf(created.id).toEqualTypeOf<string>()
	// @ts-expect-error -- Without `select`, a write returns only `id` (ADR-0341).
	void created.title
	expectTypeOf(created.comments).toEqualTypeOf<
		readonly QueryResult<typeof Comment>[]
	>()
	expectTypeOf(created.author).toEqualTypeOf<QueryResult<
		typeof Author,
		'id' | 'name'
	> | null>()
})
