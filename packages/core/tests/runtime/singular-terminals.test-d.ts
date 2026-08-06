import {
	increment,
	intField,
	stringField,
	Schema,
	type InferQueryResult,
	type NonAtomicBulkResult,
	type QueryTerminalOptions,
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

test('preserves Query schema selection across every read terminal', () => {
	const query = articleSchema.query().select({ id: true, title: true })

	expectTypeOf(query.find()).toEqualTypeOf<
		Promise<readonly InferQueryResult<typeof articleSchema, 'id' | 'title'>[]>
	>()
	expectTypeOf(query.first()).toEqualTypeOf<
		Promise<InferQueryResult<typeof articleSchema, 'id' | 'title'> | null>
	>()
	expectTypeOf(query.get('article-1')).toEqualTypeOf<
		Promise<InferQueryResult<typeof articleSchema, 'id' | 'title'> | null>
	>()
	expectTypeOf(query.count()).toEqualTypeOf<Promise<number>>()
	expectTypeOf(query.exists()).toEqualTypeOf<Promise<boolean>>()
	expectTypeOf(query.find({ ultimabase })).toEqualTypeOf<
		Promise<readonly InferQueryResult<typeof articleSchema, 'id' | 'title'>[]>
	>()
	expectTypeOf(
		articleSchema.create({ data: { title: 'Created' } }, { ultimabase }),
	).toEqualTypeOf<Promise<InferQueryResult<typeof articleSchema>>>()
	expectTypeOf(
		articleSchema.createMany([{ title: 'Created' }], {
			atomic: false,
			ultimabase,
		}),
	).toEqualTypeOf<
		Promise<NonAtomicBulkResult<InferQueryResult<typeof articleSchema>>>
	>()
	expectTypeOf(
		articleSchema.createMany([{ title: 'Created' }], {
			atomic: true,
			ultimabase,
		}),
	).toEqualTypeOf<Promise<readonly InferQueryResult<typeof articleSchema>[]>>()
	const dynamicAtomic: boolean = Math.random() > 0.5

	expectTypeOf(
		articleSchema.createMany([{ title: 'Created' }], {
			atomic: dynamicAtomic,
			ultimabase,
		}),
	).toEqualTypeOf<
		Promise<
			| readonly InferQueryResult<typeof articleSchema>[]
			| NonAtomicBulkResult<InferQueryResult<typeof articleSchema>>
		>
	>()
	const nonAtomicCreate = articleSchema.createMany([{ title: 'Created' }], {
		atomic: false,
		ultimabase,
	})

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
			[
				{
					create: { title: 'Unique' },
					where: (where) => where.eq('title', 'Unique'),
					update: { views: increment(1) },
				},
			],
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
		articleSchema.upsert(
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
	} as const satisfies QueryTerminalOptions

	// Every terminal shares the same final trusted-backend authority boundary.
	void query.find(masterOptions)
	void query.first(contextOptions)
	void query.get('article-1', contextualMasterOptions)
	void query.count(masterOptions)
	void query.exists(contextOptions)
	void articleSchema.create(
		{ data: { title: 'Created' } },
		contextualMasterOptions,
	)
	void articleSchema.createMany([{ title: 'Created' }], {
		atomic: false,
		...contextualMasterOptions,
	})
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
	void articleSchema.upsert(
		{
			where: (where) => where.eq('title', 'Unique'),
			create: { title: 'Unique' },
			update: { views: increment(1) },
		},
		contextOptions,
	)
	void articleSchema.upsertMany(
		[
			{
				create: { title: 'Unique' },
				where: (where) => where.eq('title', 'Unique'),
				update: { views: increment(1) },
			},
		],
		{ atomic: true, ...contextualMasterOptions },
	)
	void articleSchema.deleteOne(
		{ where: (where) => where.eq('title', 'Unique') },
		masterOptions,
	)
	void articleSchema.deleteMany({ where: 'all' }, contextualMasterOptions)

	// @ts-expect-error -- Read terminals accept only their final execution options.
	void query.find({ atomic: false })
	// @ts-expect-error -- Master selection is a positive trusted-code flag, not transport data.
	void query.find({ useMasterKey: false })
	// @ts-expect-error -- Query terminals remain credential-neutral.
	void query.find({ sessionToken: 'transport-secret' })
	// @ts-expect-error -- Mutation execution options follow the mutation input.
	void articleSchema.create({ data: { ultimabase } }, { title: 'Created' })
	// @ts-expect-error -- Singular update aliases never accept a collection input.
	void articleSchema.updateOne([{ views: increment(1) }])
	// @ts-expect-error -- Singular delete commands require their target wrapper.
	void articleSchema.deleteOne([])
	// @ts-expect-error -- Terminal ownership never becomes a Query builder option.
	articleSchema.query({ ultimabase })
})
