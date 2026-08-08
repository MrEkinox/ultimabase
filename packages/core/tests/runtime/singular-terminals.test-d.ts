import {
	increment,
	intField,
	QueryBuilder,
	stringField,
	Schema,
	type InferQueryResult,
	type NonAtomicBulkResult,
	type OperationOptions,
	type RequestContext,
	type UltimaBase,
} from '../../src/index.js'
import { expectTypeOf, test } from 'vitest'

const articleSchema = Schema.define({
	className: 'TypedTerminalArticle',
	fields: {
		title: stringField({ validation: { required: true } }),
		views: intField(),
	},
})

declare const ultimabase: UltimaBase<
	readonly [typeof articleSchema],
	readonly []
>
declare const context: RequestContext

test('preserves schema selection across every root read terminal', () => {
	const input = { select: { id: true, title: true } } as const

	expectTypeOf(articleSchema.findMany(input)).toEqualTypeOf<
		Promise<readonly InferQueryResult<typeof articleSchema, 'id' | 'title'>[]>
	>()
	expectTypeOf(articleSchema.findOne(input)).toEqualTypeOf<
		Promise<InferQueryResult<typeof articleSchema, 'id' | 'title'> | null>
	>()
	expectTypeOf(
		articleSchema.get({ id: 'article-1', select: input.select }),
	).toEqualTypeOf<
		Promise<InferQueryResult<typeof articleSchema, 'id' | 'title'>>
	>()
	expectTypeOf(articleSchema.count()).toEqualTypeOf<Promise<number>>()
	expectTypeOf(articleSchema.exists()).toEqualTypeOf<Promise<boolean>>()
	expectTypeOf(articleSchema.findMany(input, { ultimabase })).toEqualTypeOf<
		Promise<readonly InferQueryResult<typeof articleSchema, 'id' | 'title'>[]>
	>()
	expectTypeOf(
		articleSchema.createOne({ data: { title: 'Created' } }, { ultimabase }),
	).toEqualTypeOf<Promise<InferQueryResult<typeof articleSchema>>>()
	expectTypeOf(
		articleSchema.createMany(
			{ data: [{ title: 'Created' }] },
			{
				atomic: false,
				ultimabase,
			},
		),
	).toEqualTypeOf<
		Promise<NonAtomicBulkResult<InferQueryResult<typeof articleSchema>>>
	>()
	expectTypeOf(
		articleSchema.createMany(
			{ data: [{ title: 'Created' }] },
			{
				atomic: true,
				ultimabase,
			},
		),
	).toEqualTypeOf<Promise<readonly InferQueryResult<typeof articleSchema>[]>>()
	const dynamicAtomic: boolean = Math.random() > 0.5

	expectTypeOf(
		articleSchema.createMany(
			{ data: [{ title: 'Created' }] },
			{
				atomic: dynamicAtomic,
				ultimabase,
			},
		),
	).toEqualTypeOf<
		Promise<
			| readonly InferQueryResult<typeof articleSchema>[]
			| NonAtomicBulkResult<InferQueryResult<typeof articleSchema>>
		>
	>()
	const nonAtomicCreate = articleSchema.createMany(
		{ data: [{ title: 'Created' }] },
		{
			atomic: false,
			ultimabase,
		},
	)

	void nonAtomicCreate.then((result) => {
		if (result.status === 'stopped') {
			expectTypeOf(result.failedIndex).toEqualTypeOf<number>()
			expectTypeOf(result.error).toBeUnknown()
		} else {
			// @ts-expect-error -- Completed results never carry failure metadata.
			void result.failedIndex
		}
	})
	expectTypeOf(
		articleSchema.upsertMany(
			{
				data: [
					{
						create: { title: 'Unique' },
						where: (where) => where.eq('title', 'Unique'),
						update: { views: increment(1) },
					},
				],
			},
			{ atomic: false, ultimabase },
		),
	).toEqualTypeOf<
		Promise<NonAtomicBulkResult<InferQueryResult<typeof articleSchema>>>
	>()
	expectTypeOf(
		articleSchema.updateMany(
			{
				where: (where) => where.eq('title', 'Unique'),
				data: { views: increment(1) },
			},
			{ ultimabase },
		),
	).toEqualTypeOf<
		Promise<readonly InferQueryResult<typeof articleSchema, 'id'>[]>
	>()
	expectTypeOf(
		articleSchema.upsertOne(
			{
				where: (where) => where.eq('title', 'Unique'),
				create: { title: 'Unique' },
				update: { views: increment(1) },
			},
			{ ultimabase },
		),
	).toEqualTypeOf<Promise<InferQueryResult<typeof articleSchema>>>()
	expectTypeOf(
		articleSchema.deleteMany({ where: 'all' }, { ultimabase }),
	).toEqualTypeOf<
		Promise<readonly InferQueryResult<typeof articleSchema, 'id'>[]>
	>()

	const masterOptions = { useMasterKey: true } as const
	const contextOptions = { context, ultimabase } as const
	const contextualMasterOptions = {
		context,
		ultimabase,
		useMasterKey: true,
	} as const satisfies OperationOptions

	// Every terminal shares the same final trusted-backend authority boundary.
	void articleSchema.findMany(input, masterOptions)
	void articleSchema.findOne(input, contextOptions)
	void articleSchema.get(
		{ id: 'article-1', select: input.select },
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
		{
			atomic: false,
			...contextualMasterOptions,
		},
	)
	void articleSchema.updateOne(
		{
			where: (where) => where.eq('title', 'Unique'),
			data: { views: increment(1) },
		},
		masterOptions,
	)
	void articleSchema.updateMany(
		{
			where: (where) => where.eq('views', 0),
			data: { views: increment(1) },
		},
		contextOptions,
	)
	void articleSchema.upsertOne(
		{
			where: (where) => where.eq('title', 'Unique'),
			create: { title: 'Unique' },
			update: { views: increment(1) },
		},
		contextOptions,
	)
	void articleSchema.upsertMany(
		{
			data: [
				{
					create: { title: 'Unique' },
					where: (where) => where.eq('title', 'Unique'),
					update: { views: increment(1) },
				},
			],
		},
		{ atomic: true, ...contextualMasterOptions },
	)
	void articleSchema.deleteOne(
		{ where: (where) => where.eq('title', 'Unique') },
		masterOptions,
	)
	void articleSchema.deleteMany({ where: 'all' }, contextualMasterOptions)

	// @ts-expect-error -- Read terminals accept only their final execution options.
	void articleSchema.findMany(undefined, { atomic: false })
	// @ts-expect-error -- Master selection is a positive trusted-code flag, not transport data.
	void articleSchema.findMany(undefined, { useMasterKey: false })
	// @ts-expect-error -- Read terminals remain credential-neutral.
	void articleSchema.findMany(undefined, { sessionToken: 'transport-secret' })
	// @ts-expect-error -- Mutation execution options follow the mutation input.
	void articleSchema.createOne({ data: { ultimabase } }, { title: 'Created' })
	// @ts-expect-error -- Singular update aliases never accept a collection input.
	void articleSchema.updateOne([{ views: increment(1) }])
	// @ts-expect-error -- Singular delete commands require their target wrapper.
	void articleSchema.deleteOne([])
	// @ts-expect-error -- Terminal ownership never becomes a QueryBuilder constructor option.
	new QueryBuilder(articleSchema, { ultimabase })
})
