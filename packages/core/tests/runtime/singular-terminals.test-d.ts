import {
	QueryBuilder,
	type QueryResult,
	type OperationOptions,
	type RequestContext,
	UltimaBase,
} from '../../src/index.js'
import { expectTypeOf, test } from 'vitest'

const articleSchema = UltimaBase.Schema.define({
	className: 'TypedTerminalArticle',
	fields: (field) => ({
		title: field.string({ required: true }),
		views: field.int(),
	}),
})

const bootstrapAuthorSchema = UltimaBase.Schema.define({
	className: 'BootstrapTerminalAuthor',
	fields: (field) => ({ name: field.string() }),
})
const bootstrapPostSchema = UltimaBase.Schema.define({
	className: 'BootstrapTerminalPost',
	fields: (field) => ({
		author: field.pointer({ target: 'BootstrapTerminalAuthor' }),
		title: field.string(),
	}),
})

declare const ultimabase: UltimaBase<readonly [typeof articleSchema]>
declare const context: RequestContext

test('preserves schema selection across every root read terminal', () => {
	const input = { select: { id: true, title: true } } as const

	expectTypeOf(articleSchema.findMany(input)).toEqualTypeOf<
		Promise<readonly QueryResult<typeof articleSchema, 'id' | 'title'>[]>
	>()
	expectTypeOf(articleSchema.findOne(input)).toEqualTypeOf<
		Promise<QueryResult<typeof articleSchema, 'id' | 'title'> | null>
	>()
	expectTypeOf(
		articleSchema.findOneOrThrow({
			where: { id: 'article-1' },
			select: input.select,
		}),
	).toEqualTypeOf<Promise<QueryResult<typeof articleSchema, 'id' | 'title'>>>()
	expectTypeOf(articleSchema.count()).toEqualTypeOf<Promise<number>>()
	expectTypeOf(articleSchema.exists()).toEqualTypeOf<Promise<boolean>>()
	expectTypeOf(articleSchema.findMany(input)).toEqualTypeOf<
		Promise<readonly QueryResult<typeof articleSchema, 'id' | 'title'>[]>
	>()
	expectTypeOf(
		articleSchema.createOne({ data: { title: 'Created' } }),
	).toEqualTypeOf<Promise<QueryResult<typeof articleSchema>>>()
	expectTypeOf(
		articleSchema.createMany({ data: [{ title: 'Created' }] }),
	).toEqualTypeOf<Promise<readonly QueryResult<typeof articleSchema>[]>>()
	expectTypeOf(
		articleSchema.upsertMany({
			data: [
				{
					create: { title: 'Unique' },
					where: { title: { eq: 'Unique' } },
					update: { views: { increment: 1 } },
				},
			],
		}),
	).toEqualTypeOf<Promise<readonly QueryResult<typeof articleSchema>[]>>()
	expectTypeOf(
		articleSchema.updateMany({
			data: [
				{
					where: { title: { eq: 'Unique' } },
					data: { views: { increment: 1 } },
				},
			],
		}),
	).toEqualTypeOf<Promise<readonly QueryResult<typeof articleSchema, 'id'>[]>>()
	expectTypeOf(
		articleSchema.upsertOne({
			where: { title: { eq: 'Unique' } },
			create: { title: 'Unique' },
			update: { views: { increment: 1 } },
		}),
	).toEqualTypeOf<Promise<QueryResult<typeof articleSchema>>>()
	expectTypeOf(
		articleSchema.deleteMany({ where: [{ id: { eq: 'article-1' } }] }),
	).toEqualTypeOf<Promise<readonly QueryResult<typeof articleSchema, 'id'>[]>>()

	const masterOptions = { useMasterKey: true } as const
	const contextOptions = { context } as const
	const contextualMasterOptions = {
		context,
		useMasterKey: true,
	} as const satisfies OperationOptions

	// Every terminal shares the same final trusted-backend authority boundary.
	void articleSchema.findMany(input, masterOptions)
	void articleSchema.findOne(input, contextOptions)
	void articleSchema.findOneOrThrow(
		{ where: { id: 'article-1' }, select: input.select },
		contextualMasterOptions,
	)
	void articleSchema.count({}, masterOptions)
	void articleSchema.exists({}, contextOptions)
	void articleSchema.createOne(
		{ data: { title: 'Created' } },
		contextualMasterOptions,
	)
	void articleSchema.createMany(
		{ data: [{ title: 'Created' }] },
		contextualMasterOptions,
	)
	void articleSchema.updateOne(
		{
			where: { title: { eq: 'Unique' } },
			data: { views: { increment: 1 } },
		},
		masterOptions,
	)
	expectTypeOf(
		articleSchema.updateOne(
			{
				where: { id: 'article-1' },
				data: { views: { increment: 1 } },
				select: { id: true, title: true },
			},
			contextOptions,
		),
	).toEqualTypeOf<
		Promise<QueryResult<typeof articleSchema, 'id' | 'title'> | null>
	>()
	void articleSchema.updateMany(
		{
			data: [
				{
					where: { id: { eq: 'article-1' } },
					data: { views: { increment: 1 } },
				},
			],
		},
		contextOptions,
	)
	void articleSchema.upsertOne(
		{
			where: { title: { eq: 'Unique' } },
			create: { title: 'Unique' },
			update: { views: { increment: 1 } },
		},
		contextOptions,
	)
	void articleSchema.upsertMany(
		{
			data: [
				{
					create: { title: 'Unique' },
					where: { title: { eq: 'Unique' } },
					update: { views: { increment: 1 } },
				},
			],
		},
		contextualMasterOptions,
	)
	void articleSchema.deleteOne(
		{ where: { title: { eq: 'Unique' } } },
		masterOptions,
	)
	expectTypeOf(
		articleSchema.deleteOne(
			{ where: { id: 'article-1' }, select: { id: true, title: true } },
			contextOptions,
		),
	).toEqualTypeOf<
		Promise<QueryResult<typeof articleSchema, 'id' | 'title'> | null>
	>()
	void articleSchema.deleteMany(
		{ where: [{ id: { eq: 'article-1' } }] },
		contextualMasterOptions,
	)

	// @ts-expect-error -- Collection mutations are always atomic.
	void articleSchema.createMany({ data: [] }, { atomic: false })
	// @ts-expect-error -- Master selection is a positive trusted-code flag, not transport data.
	void articleSchema.findMany(undefined, { useMasterKey: false })
	// @ts-expect-error -- Read terminals remain credential-neutral.
	void articleSchema.findMany(undefined, { sessionToken: 'transport-secret' })
	// @ts-expect-error -- Mutation execution options follow the mutation input.
	void articleSchema.createOne({ data: { ultimabase } }, { title: 'Created' })
	// @ts-expect-error -- Singular update aliases never accept a collection input.
	void articleSchema.updateOne([{ views: { increment: 1 } }])
	// @ts-expect-error -- Singular delete commands require their target wrapper.
	void articleSchema.deleteOne([])
	// @ts-expect-error -- Singular updates accept exactly one target form.
	void articleSchema.updateOne({ data: { views: 1 } })
	void articleSchema.updateOne({
		// @ts-expect-error -- The top-level id alias was removed (ADR-0307).
		id: 'article-1',
		data: { views: 1 },
	})
	// @ts-expect-error -- Singular deletes accept exactly one target form.
	void articleSchema.deleteOne({})
	void articleSchema.deleteOne({
		// @ts-expect-error -- The top-level id alias was removed (ADR-0307).
		id: 'article-1',
	})
	// @ts-expect-error -- Terminal ownership never becomes a QueryBuilder constructor option.
	new QueryBuilder(articleSchema, { ultimabase })
})

test('keeps mutation includes executable before code generation', () => {
	const include = { author: { select: { name: true } } } as const
	void bootstrapAuthorSchema

	void bootstrapPostSchema.createOne({
		data: { title: 'Created' },
		include,
	})
	void bootstrapPostSchema.createMany({
		data: [{ title: 'Created' }],
		include,
	})
	void bootstrapPostSchema.updateOne({
		where: { id: { eq: 'post-1' } },
		data: { title: 'Updated' },
		include,
	})
	void bootstrapPostSchema.updateMany({
		data: [
			{
				where: { id: { eq: 'post-1' } },
				data: { title: 'Updated' },
			},
		],
		include,
	})
})
