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

// Mutations project like reads: without `select`, the default projection keeps
// every field and `include` only adds the related values.
test('createOne projects like findOneOrThrow', () => {
	expectTypeOf(Post.createOne({ data, include })).toEqualTypeOf(
		Post.findOneOrThrow({ where, include }),
	)
	expectTypeOf(Post.createOne({ data, select })).toEqualTypeOf(
		Post.findOneOrThrow({ where, select }),
	)
	expectTypeOf(Post.createOne({ data, select, include })).toEqualTypeOf(
		Post.findOneOrThrow({ where, select, include }),
	)
	expectTypeOf(Post.createOne({ data })).toEqualTypeOf(
		Post.findOneOrThrow({ where }),
	)
})

test('createMany projects every row like findMany', () => {
	expectTypeOf(Post.createMany({ data: [data], include })).toEqualTypeOf(
		Post.findMany({ include }),
	)
	expectTypeOf(Post.createMany({ data: [data], select })).toEqualTypeOf(
		Post.findMany({ select }),
	)
	expectTypeOf(
		Post.createMany({ data: [data], select, include }),
	).toEqualTypeOf(Post.findMany({ select, include }))
	expectTypeOf(Post.createMany({ data: [data] })).toEqualTypeOf(Post.findMany())
})

test('updateOne projects like findOne', () => {
	const update = { where, data: { title: 'Updated' } } as const

	expectTypeOf(Post.updateOne({ ...update, include })).toEqualTypeOf(
		Post.findOne({ include }),
	)
	expectTypeOf(Post.updateOne({ ...update, select })).toEqualTypeOf(
		Post.findOne({ select }),
	)
	expectTypeOf(Post.updateOne({ ...update, select, include })).toEqualTypeOf(
		Post.findOne({ select, include }),
	)
	expectTypeOf(Post.updateOne(update)).toEqualTypeOf(Post.findOne())
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

test('commands without include keep their projections', () => {
	const upsert = {
		where: { slug: 'post' },
		create: data,
		update: { title: 'Updated' },
	} as const

	expectTypeOf(Post.upsertOne({ ...upsert, select })).toEqualTypeOf(
		Post.findOneOrThrow({ select }),
	)
	expectTypeOf(Post.upsertOne(upsert)).toEqualTypeOf(Post.findOneOrThrow())
	expectTypeOf(Post.upsertMany({ data: [upsert], select })).toEqualTypeOf(
		Post.findMany({ select }),
	)
	expectTypeOf(Post.upsertMany({ data: [upsert] })).toEqualTypeOf(
		Post.findMany(),
	)
	expectTypeOf(Post.deleteOne({ where, select })).toEqualTypeOf(
		Post.findOne({ select }),
	)
	expectTypeOf(Post.deleteOne({ where })).toEqualTypeOf(Post.findOne())
	expectTypeOf(Post.deleteMany({ where: [where], select })).toEqualTypeOf(
		Post.findMany({ select }),
	)
	expectTypeOf(Post.deleteMany({ where: [where] })).toEqualTypeOf<
		Promise<readonly QueryResult<typeof Post, 'id'>[]>
	>()
})

test('plugin schema mutations project like findOneOrThrow', async () => {
	type Include = typeof include
	type Select = typeof select

	expectTypeOf<
		PluginSchemaMutationResult<typeof Post, undefined, Include>
	>().toEqualTypeOf(await Post.findOneOrThrow({ include }))
	expectTypeOf<
		PluginSchemaMutationResult<typeof Post, Select, undefined>
	>().toEqualTypeOf(await Post.findOneOrThrow({ select }))
	expectTypeOf<
		PluginSchemaMutationResult<typeof Post, Select, Include>
	>().toEqualTypeOf(await Post.findOneOrThrow({ select, include }))
	expectTypeOf<
		PluginSchemaMutationResult<typeof Post, undefined, undefined>
	>().toEqualTypeOf(await Post.findOneOrThrow())
})

test('an included result keeps the default fields', async () => {
	const created = await Post.createOne({ data, include })

	expectTypeOf(created.title).toEqualTypeOf<string>()
	expectTypeOf(created.comments).toEqualTypeOf<
		readonly QueryResult<typeof Comment>[]
	>()
	expectTypeOf(created.author).toEqualTypeOf<QueryResult<
		typeof Author,
		'id' | 'name'
	> | null>()
})
